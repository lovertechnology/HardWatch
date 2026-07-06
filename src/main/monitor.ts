import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { logger } from './logger'

export interface DiskInfo {
  number: number      // 物理盘号
  name: string        // 物理盘型号
  sizeBytes: number
}

export interface ProcessIO {
  name: string
  pid: number
  readBytes: number   // 周期内读取量（ETW 聚合）
  writeBytes: number  // 周期内写入量（ETW 聚合）
}

export interface DiskData {
  readSpeed: number      // 周期内磁盘读取总量（字段名保持兼容前端）
  writeSpeed: number     // 周期内磁盘写入总量
  readChange: number
  writeChange: number
  processes: ProcessIO[]
  timestamp: number
  intervalSec: number
}

// Tracer 可执行文件路径解析
function getTracerPath(): string {
  // 开发模式：项目根目录下 tracer/publish/HardWatch.Tracer.exe
  const devPath = join(app.getAppPath(), 'tracer', 'publish', 'HardWatch.Tracer.exe')
  if (existsSync(devPath)) {
    return devPath
  }
  // 打包后：process.resourcesPath/HardWatch.Tracer.exe（extraResources 配置）
  const prodPath = join(process.resourcesPath, 'HardWatch.Tracer.exe')
  if (existsSync(prodPath)) {
    return prodPath
  }
  // 兜底：尝试项目根目录
  const fallback = join(app.getAppPath(), '..', 'tracer', 'publish', 'HardWatch.Tracer.exe')
  return fallback
}

const DEFAULT_INTERVAL = 2

// 查询物理盘列表（一次性调用 Tracer --list-disks）
export async function listPhysicalDisks(): Promise<DiskInfo[]> {
  try {
    const tracerPath = getTracerPath()
    if (!existsSync(tracerPath)) {
      logger.error('Monitor:listDisks', `Tracer 不存在: ${tracerPath}`)
      return []
    }

    return await new Promise((resolve) => {
      const proc = spawn(tracerPath, ['--list-disks'], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })

      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', (data) => { stdout += data.toString() })
      proc.stderr.on('data', (data) => { stderr += data.toString() })

      const timer = setTimeout(() => {
        proc.kill()
        resolve([])
      }, 10000)

      proc.on('close', () => {
        clearTimeout(timer)
        const raw = stdout.trim()
        if (!raw) {
          if (stderr) logger.warn('Monitor:listDisks', `stderr: ${stderr.slice(0, 200)}`)
          resolve([])
          return
        }
        try {
          const parsed = JSON.parse(raw)
          if (parsed.type === 'disks' && Array.isArray(parsed.disks)) {
            const disks: DiskInfo[] = parsed.disks.map((d: any) => ({
              number: Number(d.number),
              name: String(d.name || `Disk ${d.number}`),
              sizeBytes: Number(d.sizeBytes) || 0
            }))
            logger.info('Monitor:listDisks', `找到 ${disks.length} 个物理盘: ${disks.map(d => `${d.number}=${d.name}`).join(', ')}`)
            resolve(disks)
          } else {
            resolve([])
          }
        } catch (e: any) {
          logger.error('Monitor:listDisks', `JSON 解析失败: ${e.message}`)
          resolve([])
        }
      })

      proc.on('error', (err) => {
        clearTimeout(timer)
        logger.error('Monitor:listDisks', `启动失败: ${err.message}`)
        resolve([])
      })
    })
  } catch (e: any) {
    logger.error('Monitor:listDisks', `异常: ${e.message}`)
    return []
  }
}

export class DiskMonitor {
  private diskNumber: number
  private intervalSec: number = DEFAULT_INTERVAL
  private stopped = false
  private tracerProcess: ChildProcessWithoutNullStreams | null = null
  private stdoutBuffer = ''
  private onDataCallback: ((data: DiskData) => void) | null = null

  constructor(diskNumber: number, intervalSec?: number) {
    this.diskNumber = diskNumber
    if (intervalSec && intervalSec >= 1) {
      this.intervalSec = intervalSec
    }
    logger.info('Monitor', `创建监控器, 物理盘: ${diskNumber}, 间隔: ${this.intervalSec}s`)
  }

  setInterval(sec: number): void {
    if (sec >= 1 && sec <= 120) {
      this.intervalSec = sec
      logger.info('Monitor', `更新采集间隔: ${sec}s（下次重启 Tracer 生效）`)
    }
  }

  getInterval(): number {
    return this.intervalSec
  }

  start(onData: (data: DiskData) => void): void {
    logger.info('Monitor', '开始监控')
    this.stopped = false
    this.onDataCallback = onData
    this.startTracer()
  }

  stop(): void {
    this.stopped = true
    if (this.tracerProcess) {
      try {
        this.tracerProcess.kill()
      } catch
      {
        // 忽略
      }
      this.tracerProcess = null
    }
    this.onDataCallback = null
    logger.info('Monitor', '停止监控')
  }

  private startTracer(): void {
    const tracerPath = getTracerPath()
    if (!existsSync(tracerPath)) {
      logger.error('Monitor:startTracer', `Tracer 不存在: ${tracerPath}`)
      return
    }

    const args = [
      '--disk', String(this.diskNumber),
      '--interval', String(this.intervalSec)
    ]
    logger.info('Monitor:startTracer', `启动: ${tracerPath} ${args.join(' ')}`)

    try {
      this.tracerProcess = spawn(tracerPath, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
    } catch (e: any) {
      logger.error('Monitor:startTracer', `spawn 失败: ${e.message}`)
      return
    }

    this.tracerProcess.stdout.on('data', (data) => {
      this.stdoutBuffer += data.toString()
      // 按行解析（Tracer 每次输出一行 JSON 后跟换行）
      let newlineIdx: number
      while ((newlineIdx = this.stdoutBuffer.indexOf('\n')) >= 0) {
        const line = this.stdoutBuffer.slice(0, newlineIdx).trim()
        this.stdoutBuffer = this.stdoutBuffer.slice(newlineIdx + 1)
        if (line) this.handleTracerLine(line)
      }
    })

    this.tracerProcess.stderr.on('data', (data) => {
      const msg = data.toString().trim()
      if (msg) logger.warn('Monitor:tracer.stderr', msg.slice(0, 300))
    })

    this.tracerProcess.on('close', (code) => {
      logger.info('Monitor:tracer', `进程退出, code=${code}`)
      this.tracerProcess = null
      // 非主动停止时自动重启
      if (!this.stopped) {
        logger.info('Monitor:tracer', '3秒后自动重启...')
        setTimeout(() => {
          if (!this.stopped) this.startTracer()
        }, 3000)
      }
    })

    this.tracerProcess.on('error', (err) => {
      logger.error('Monitor:tracer', `进程错误: ${err.message}`)
    })
  }

  private handleTracerLine(line: string): void {
    try {
      const parsed = JSON.parse(line)
      if (parsed.type === 'disks') {
        // 首次启动时 Tracer 输出的盘列表，忽略
        return
      }
      if (parsed.type === 'error') {
        logger.error('Monitor:tracer', `Tracer 错误: ${parsed.message}`)
        return
      }
      if (parsed.type === 'stats') {
        if (!this.onDataCallback) return

        const processes: ProcessIO[] = (parsed.processes || []).map((p: any) => ({
          name: String(p.name),
          pid: Number(p.pid),
          readBytes: Number(p.read) || 0,
          writeBytes: Number(p.write) || 0
        }))

        const data: DiskData = {
          readSpeed: Number(parsed.diskRead) || 0,
          writeSpeed: Number(parsed.diskWrite) || 0,
          readChange: 0,
          writeChange: 0,
          processes,
          timestamp: Number(parsed.timestamp) * 1000,
          intervalSec: Number(parsed.intervalSec) || this.intervalSec
        }

        logger.debug('Monitor:stats',
          `盘${parsed.diskNumber} 读: ${formatBytes(data.readSpeed)}/${data.intervalSec}s, ` +
          `写: ${formatBytes(data.writeSpeed)}/${data.intervalSec}s, ` +
          `进程: ${processes.length}`)

        this.onDataCallback(data)
      }
    } catch (e: any) {
      logger.warn('Monitor:tracer', `JSON 解析失败: ${e.message}, line: ${line.slice(0, 100)}`)
    }
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes.toFixed(0) + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}
