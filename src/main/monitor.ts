import { spawn } from 'child_process'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { logger } from './logger'

export interface DiskInfo {
  name: string
  letter: string
}

export interface ProcessIO {
  name: string
  pid: number
  readBytes: number   // 周期内读取量（累计值差值）
  writeBytes: number  // 周期内写入量（累计值差值）
}

export interface DiskData {
  readSpeed: number    // 周期内磁盘读取总量（梯形积分法）
  writeSpeed: number   // 周期内磁盘写入总量（梯形积分法）
  readChange: number
  writeChange: number
  processes: ProcessIO[]
  timestamp: number
  intervalSec: number
}

interface ProcessRawData {
  name: string
  pid: number
  readBytes: number   // 累计读取字节数
  writeBytes: number  // 累计写入字节数
}

// 运行时脚本目录：使用 userData 下的 scripts 目录（打包后 asar 内只读，必须用可写路径）
const SCRIPT_DIR = join(app.getPath('userData'), 'scripts')
const DEFAULT_INTERVAL = 2

function ensureScriptDir(): void {
  if (!existsSync(SCRIPT_DIR)) {
    mkdirSync(SCRIPT_DIR, { recursive: true })
  }
}

function getDiskListScript(): string {
  ensureScriptDir()
  const path = join(SCRIPT_DIR, 'get-disks.ps1')
  writeFileSync(
    path,
    `Get-CimInstance Win32_LogicalDisk | Where-Object {$_.DriveType -eq 3} | Select-Object DeviceID,VolumeName | ConvertTo-Json`
  )
  return path
}

// 采集脚本：用 Get-Counter 获取磁盘速率 + wmic 获取进程 I/O 累计值
// diskInstanceName: PhysicalDisk 的实例名，如 "2 C: D:"
// diskLetter: 盘符，如 "C"
function getCollectScript(diskInstanceName: string, diskLetter: string): string {
  const path = join(SCRIPT_DIR, 'collect-all.ps1')
  ensureScriptDir()
  // 注意：使用 .replace() 而非模板字符串来注入参数，避免 PS 的 $ 与 TS 的 ${} 冲突
  const script = COLLECT_SCRIPT_TEMPLATE
    .replaceAll('__DISK_INSTANCE__', diskInstanceName)
    .replaceAll('__DISK_LETTER__', diskLetter)
  writeFileSync(path, script)
  return path
}

// 采集脚本模板：__DISK_INSTANCE__ 和 __DISK_LETTER__ 为运行时替换的占位符
const COLLECT_SCRIPT_TEMPLATE = `$result = @{}

# Disk I/O rate via Get-Counter (more reliable than Win32_PerfFormattedData)
$readCounter = '\\PhysicalDisk(__DISK_INSTANCE__)\\Disk Read Bytes/sec'
$writeCounter = '\\PhysicalDisk(__DISK_INSTANCE__)\\Disk Write Bytes/sec'
try {
    $samples = Get-Counter -Counter $readCounter, $writeCounter -SampleInterval 1 -MaxSamples 1 -ErrorAction Stop
    foreach ($cs in $samples.CounterSamples) {
        if ($cs.Path -match 'Read') { $result.DiskReadBytesPersec = $cs.CookedValue }
        if ($cs.Path -match 'Write') { $result.DiskWriteBytesPersec = $cs.CookedValue }
    }
} catch {
    $result.DiskReadBytesPersec = 0
    $result.DiskWriteBytesPersec = 0
}

# Process drive mapping: determine which drives each process is likely using
# Signals: ExecutablePath, CommandLine references
# System processes (no exe path) mostly operate on C: (system dirs), show only on C:
# NOTE: Use string keys for PID to avoid uint32/int32 type mismatch with wmic
$procInfo = @{}
Get-CimInstance Win32_Process -Property ProcessId,ExecutablePath,CommandLine | Where-Object {$_.ProcessId -gt 4} | ForEach-Object {
    $drives = @{}
    if ($_.ExecutablePath -and $_.ExecutablePath -match '^([A-Z]):') {
        $drives[$Matches[1]] = $true
    }
    if ($_.CommandLine) {
        foreach ($m in [regex]::Matches($_.CommandLine, '([A-Z]):\\\\')) {
            $drives[$m.Groups[1].Value] = $true
        }
    }
    $key = "$($_.ProcessId)"
    $procInfo[$key] = @{Exe=$_.ExecutablePath; Drives=@($drives.Keys); NoPath=(-not $_.ExecutablePath)}
}

# Process I/O cumulative counters (CSV format)
$lines = wmic process where "ProcessId>4" get Name,ProcessId,ReadTransferCount,WriteTransferCount /format:csv 2>$null
$procs = @()
$headerSkipped = $false
foreach ($line in $lines) {
    $line = $line.Trim()
    if ($line -eq '') { continue }
    if (-not $headerSkipped) { $headerSkipped = $true; continue }
    $parts = $line -split ','
    if ($parts.Length -ge 5) {
        $name = $parts[1].Trim()
        $pidStr = $parts[2].Trim()
        $rb = if ($parts[3].Trim() -match '^\\d+$') { [int64]$parts[3].Trim() } else { 0 }
        $wb = if ($parts[4].Trim() -match '^\\d+$') { [int64]$parts[4].Trim() } else { 0 }
        if ($name -and $pidStr -match '^\\d+$' -and ($rb -gt 0 -or $wb -gt 0)) {
            $procId = [int]$pidStr
            $lookupKey = "$procId"
            $info = $procInfo[$lookupKey]
            $onDrive = $false
            if ($info) {
                # System processes without exe path: only show on C: (they operate on C:\\\\Windows)
                if ($info.NoPath -and '__DISK_LETTER__' -eq 'C') { $onDrive = $true }
                # Exe on the target drive
                if ($info.Exe -and $info.Exe.StartsWith('__DISK_LETTER__:')) { $onDrive = $true }
                # CommandLine references the target drive
                if ($info.Drives -contains '__DISK_LETTER__') { $onDrive = $true }
            }
            if ($onDrive) {
                $procs += @{N=$name; P=$procId; R=$rb; W=$wb}
            }
        }
    }
}
$result.Procs = $procs

$result | ConvertTo-Json -Depth 3 -Compress`

// 获取盘符到 PhysicalDisk 实例名的映射
function getDiskMappingScript(): string {
  ensureScriptDir()
  const path = join(SCRIPT_DIR, 'disk-mapping.ps1')
  writeFileSync(
    path,
    `$map = @{}
$physDisks = Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk
foreach ($pd in $physDisks) {
    $name = $pd.Name
    if ($name -eq '_Total') { continue }
    $parts = $name -split ' '
    foreach ($part in $parts) {
        if ($part -match '^([A-Z]):$') {
            $letter = $Matches[1]
            $map[$letter] = $name
        }
    }
}
$map | ConvertTo-Json`
  )
  return path
}

export class DiskMonitor {
  private diskLetter: string
  private intervalSec: number = DEFAULT_INTERVAL
  private timeoutId: ReturnType<typeof setTimeout> | null = null
  private collecting = false
  private stopped = false
  private prevProcessData: Map<number, ProcessRawData> = new Map()
  private prevTimestamp = 0
  private prevDiskReadRate = 0   // 上一次磁盘读取速率 (bytes/sec)
  private prevDiskWriteRate = 0  // 上一次磁盘写入速率 (bytes/sec)
  private diskInstanceName: string | null = null  // PhysicalDisk 实例名
  private cachedScriptPath: string | null = null
  private cachedScriptLetter = ''

  constructor(diskLetter: string, intervalSec?: number) {
    this.diskLetter = diskLetter
    if (intervalSec && intervalSec >= 1) {
      this.intervalSec = intervalSec
    }
    logger.info('Monitor', `创建监控器, 盘符: ${diskLetter}, 间隔: ${this.intervalSec}s`)
  }

  setInterval(sec: number): void {
    if (sec >= 1 && sec <= 120) {
      this.intervalSec = sec
      logger.info('Monitor', `更新采集间隔: ${sec}s`)
    }
  }

  getInterval(): number {
    return this.intervalSec
  }

  // 解析盘符对应的 PhysicalDisk 实例名
  private async resolveDiskInstance(): Promise<string | null> {
    if (this.diskInstanceName) return this.diskInstanceName
    try {
      const script = getDiskMappingScript()
      const { stdout } = await runPowershell(script)
      const raw = stdout.trim()
      if (!raw) return null
      const parsed = JSON.parse(raw)
      const instanceName = parsed[this.diskLetter]
      if (instanceName) {
        this.diskInstanceName = instanceName
        logger.info('Monitor', `盘符 ${this.diskLetter}: 映射到 PhysicalDisk 实例 "${instanceName}"`)
        return instanceName
      }
      logger.warn('Monitor', `盘符 ${this.diskLetter}: 未找到 PhysicalDisk 实例映射`)
      return null
    } catch (e: any) {
      logger.error('Monitor', `解析磁盘映射失败: ${e.message}`)
      return null
    }
  }

  private getScriptPath(): string {
    if (this.cachedScriptLetter !== this.diskLetter || !this.cachedScriptPath || !this.diskInstanceName) {
      if (!this.diskInstanceName) return ''
      this.cachedScriptPath = getCollectScript(this.diskInstanceName, this.diskLetter)
      this.cachedScriptLetter = this.diskLetter
      this.prevProcessData.clear()
      this.prevTimestamp = 0
      this.prevDiskReadRate = 0
      this.prevDiskWriteRate = 0
    }
    return this.cachedScriptPath
  }

  async getDisks(): Promise<DiskInfo[]> {
    try {
      const script = getDiskListScript()
      const { stdout, stderr } = await runPowershell(script)
      if (stderr) logger.warn('Monitor:getDisks', `stderr: ${stderr.slice(0, 200)}`)
      const raw = stdout.trim()
      if (!raw) return []
      const parsed = JSON.parse(raw)
      const disks = Array.isArray(parsed) ? parsed : [parsed]
      return disks.map((d: any) => ({
        name: `${d.DeviceID} ${d.VolumeName || ''}`.trim(),
        letter: d.DeviceID.replace(':', '')
      }))
    } catch (e: any) {
      logger.error('Monitor:getDisks', `异常: ${e.message}`)
      return []
    }
  }

  start(onData: (data: DiskData) => void): void {
    logger.info('Monitor', '开始监控')
    this.stopped = false
    // 先解析磁盘实例名，再开始采集
    this.resolveDiskInstance().then(() => {
      this.scheduleCollect(onData)
    })
  }

  stop(): void {
    this.stopped = true
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }
    this.prevProcessData.clear()
    this.prevTimestamp = 0
    this.prevDiskReadRate = 0
    this.prevDiskWriteRate = 0
    logger.info('Monitor', '停止监控')
  }

  private scheduleCollect(onData: (data: DiskData) => void): void {
    if (this.stopped) return
    this.timeoutId = setTimeout(async () => {
      if (this.stopped) return
      if (!this.collecting) {
        this.collecting = true
        try {
          await this.collect(onData)
        } finally {
          this.collecting = false
        }
      }
      this.scheduleCollect(onData)
    }, this.intervalSec * 1000)
  }

  private async collect(onData: (data: DiskData) => void): Promise<void> {
    try {
      const startTime = Date.now()

      // 确保磁盘实例名已解析
      if (!this.diskInstanceName) {
        await this.resolveDiskInstance()
        if (!this.diskInstanceName) return
      }

      const script = this.getScriptPath()
      if (!script) return

      const { stdout, stderr } = await runPowershell(script, 20000)
      if (stderr) logger.warn('Monitor:collect', `stderr: ${stderr.slice(0, 200)}`)

      const raw = stdout.trim()
      if (!raw) return

      const parsed = JSON.parse(raw)
      const curDiskReadRate = Math.max(0, Number(parsed.DiskReadBytesPersec) || 0)
      const curDiskWriteRate = Math.max(0, Number(parsed.DiskWriteBytesPersec) || 0)

      // 进程 I/O 累计值
      const processData: ProcessRawData[] = (parsed.Procs || []).map((p: any) => ({
        name: String(p.N),
        pid: Number(p.P),
        readBytes: Number(p.R) || 0,
        writeBytes: Number(p.W) || 0
      }))

      const now = Date.now()
      const actualIntervalSec = this.prevTimestamp > 0 ? (now - this.prevTimestamp) / 1000 : this.intervalSec

      // 磁盘读写量：梯形积分法 (prevRate + curRate) / 2 * elapsed
      // 比单点速率×时间更精确，因为速率在两次采样间可能变化
      let readBytes = 0
      let writeBytes = 0
      if (this.prevTimestamp > 0) {
        readBytes = Math.round((this.prevDiskReadRate + curDiskReadRate) / 2 * actualIntervalSec)
        writeBytes = Math.round((this.prevDiskWriteRate + curDiskWriteRate) / 2 * actualIntervalSec)
      }

      // 进程 I/O：累计值差值法（精确的周期内读写量）
      const processes = this.calculateProcessIO(processData, now)

      // 保存当前速率供下次梯形积分使用
      this.prevDiskReadRate = curDiskReadRate
      this.prevDiskWriteRate = curDiskWriteRate

      const elapsed = Date.now() - startTime
      logger.debug('Monitor:collect', `耗时 ${elapsed}ms, 读: ${formatBytes(readBytes)}/${actualIntervalSec.toFixed(1)}s, 写: ${formatBytes(writeBytes)}/${actualIntervalSec.toFixed(1)}s, 磁盘速率: R=${formatBytes(curDiskReadRate)}/s W=${formatBytes(curDiskWriteRate)}/s, 进程: ${processes.length}`)

      onData({
        readSpeed: readBytes,
        writeSpeed: writeBytes,
        readChange: 0,
        writeChange: 0,
        processes,
        timestamp: now,
        intervalSec: this.intervalSec
      })
    } catch (e: any) {
      logger.error('Monitor:collect', `采集异常: ${e.message}`)
    }
  }

  // 进程 I/O：用累计值差值法计算周期内精确读写量
  private calculateProcessIO(current: ProcessRawData[], now: number): ProcessIO[] {
    const result: ProcessIO[] = []
    const currentMap = new Map<number, ProcessRawData>()

    for (const proc of current) {
      currentMap.set(proc.pid, proc)
      const prev = this.prevProcessData.get(proc.pid)
      if (prev) {
        // 累计值差值 = 周期内精确读写量
        const readDelta = Math.max(0, proc.readBytes - prev.readBytes)
        const writeDelta = Math.max(0, proc.writeBytes - prev.writeBytes)
        if (readDelta > 0 || writeDelta > 0) {
          result.push({
            name: proc.name,
            pid: proc.pid,
            readBytes: readDelta,
            writeBytes: writeDelta
          })
        }
      }
    }

    this.prevProcessData = currentMap
    this.prevTimestamp = now

    return result.sort((a, b) => (b.readBytes + b.writeBytes) - (a.readBytes + a.writeBytes))
  }
}

function runPowershell(scriptPath: string, timeout = 15000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => { stdout += data.toString() })
    proc.stderr.on('data', (data) => { stderr += data.toString() })

    const timer = setTimeout(() => {
      proc.kill()
      resolve({ stdout, stderr: stderr + '\n[timeout]' })
    }, timeout)

    proc.on('close', () => {
      clearTimeout(timer)
      resolve({ stdout, stderr })
    })

    proc.on('error', (err) => {
      clearTimeout(timer)
      resolve({ stdout: '', stderr: err.message })
    })
  })
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes.toFixed(0) + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}
