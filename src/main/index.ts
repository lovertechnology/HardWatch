import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { spawn } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { DiskMonitor, listPhysicalDisks } from './monitor'
import { TotalStatsAccumulator } from './statsAccumulator'
import { logger } from './logger'

let mainWindow: BrowserWindow | null = null
let monitor: DiskMonitor | null = null
let statsAccumulator: TotalStatsAccumulator | null = null

logger.info('Main', 'HardWatch 启动')

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 750,
    minHeight: 600,
    show: false,
    frame: true,
    titleBarStyle: 'default',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    mainWindow.loadURL(devUrl)
  } else if (is.dev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// IPC handlers
ipcMain.handle('get-disks', async () => {
  logger.info('IPC', 'get-disks 请求')
  return await listPhysicalDisks()
})

ipcMain.handle('start-monitor', async (_event, diskNumber: number) => {
  logger.info('IPC', `start-monitor 请求, 物理盘号: ${diskNumber}`)
  if (monitor) {
    monitor.stop()
  }
  monitor = new DiskMonitor(diskNumber)
  monitor.start((data) => {
    // 累加到总量统计
    if (statsAccumulator) {
      statsAccumulator.accumulate(data.processes, data.readSpeed, data.writeSpeed)
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('disk-data', data)
    }
  })
  return true
})

ipcMain.handle('stop-monitor', async () => {
  logger.info('IPC', 'stop-monitor 请求')
  if (monitor) {
    monitor.stop()
    monitor = null
  }
  return true
})

ipcMain.handle('update-interval', async (_event, sec: number) => {
  logger.info('IPC', `update-interval 请求, 间隔: ${sec}s`)
  if (monitor) {
    monitor.setInterval(sec)
    return true
  }
  return false
})

ipcMain.handle('get-interval', async () => {
  if (monitor) {
    return monitor.getInterval()
  }
  return 2
})

ipcMain.handle('query-stats', async (_event, range: string) => {
  if (statsAccumulator) {
    return statsAccumulator.queryStats(range)
  }
  return { totalReadBytes: 0, totalWriteBytes: 0, processes: [], chartBuckets: [], rangeLabel: '' }
})

ipcMain.handle('clear-stats', async () => {
  if (statsAccumulator) {
    return statsAccumulator.clearStats()
  }
  return false
})

ipcMain.handle('open-process-location', async (_event, pid: number) => {
  try {
    logger.info('IPC', `[open-location] 开始, pid=${pid}`)
    const exePath = await getProcessExePath(pid)
    logger.info('IPC', `[open-location] 查询结果: pid=${pid}, path=${exePath || '(空)'}`)
    if (exePath) {
      shell.showItemInFolder(exePath)
      logger.info('IPC', `[open-location] 已调用 shell.showItemInFolder: ${exePath}`)
      return true
    }
    logger.warn('IPC', `[open-location] 未找到 exe 路径: pid=${pid}`)
    return false
  } catch (e: any) {
    logger.error('IPC', `[open-location] 异常: ${e.message}`)
    return false
  }
})

ipcMain.handle('open-process-location-by-name', async (_event, name: string) => {
  try {
    logger.info('IPC', `[open-location-by-name] 开始, name=${name}`)
    const exePath = await getProcessExePathByName(name)
    logger.info('IPC', `[open-location-by-name] 查询结果: name=${name}, path=${exePath || '(空)'}`)
    if (exePath) {
      shell.showItemInFolder(exePath)
      logger.info('IPC', `[open-location-by-name] 已调用 shell.showItemInFolder: ${exePath}`)
      return true
    }
    logger.warn('IPC', `[open-location-by-name] 未找到 exe 路径: name=${name}`)
    return false
  } catch (e: any) {
    logger.error('IPC', `[open-location-by-name] 异常: ${e.message}`)
    return false
  }
})

// 查询进程的可执行文件路径（多种方式回退，兼容 SYSTEM 权限进程）
function getProcessExePath(pid: number): Promise<string | null> {
  return new Promise((resolve) => {
    // 注意: $pid 是 PowerShell 只读自动变量，必须用 $procId
    // 方式4: QueryFullProcessImageName Win32 API（管理员权限下可获取受保护进程路径）
    const script = `
      $procId = ${pid}
      $method1 = (Get-CimInstance Win32_Process -Filter "ProcessId=$procId").ExecutablePath
      $method2 = $null
      try { $method2 = (Get-Process -Id $procId -ErrorAction SilentlyContinue).Path } catch {}
      $method3 = $null
      try { $method3 = (Get-Process -Id $procId -ErrorAction SilentlyContinue).MainModule.FileName } catch {}
      $method4 = $null
      try {
        Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        using System.Text;
        public class ProcHelper {
          [DllImport("kernel32.dll", SetLastError=true)]
          public static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, uint dwProcessId);
          [DllImport("kernel32.dll", SetLastError=true)]
          [return: MarshalAs(UnmanagedType.Bool)]
          public static extern bool QueryFullProcessImageName(IntPtr hProcess, uint dwFlags, StringBuilder lpExeName, ref uint lpdwSize);
          [DllImport("kernel32.dll")]
          public static extern bool CloseHandle(IntPtr hObject);
        }
"@
        $h = [ProcHelper]::OpenProcess(0x1000, $false, [uint32]$procId)
        if ($h -ne [IntPtr]::Zero) {
          $sb = New-Object System.Text.StringBuilder 1024
          $size = [uint32]1024
          if ([ProcHelper]::QueryFullProcessImageName($h, 0, $sb, [ref]$size)) {
            $method4 = $sb.ToString()
          }
          [ProcHelper]::CloseHandle($h) | Out-Null
        }
      } catch {}
      Write-Output "M1=$method1"
      Write-Output "M2=$method2"
      Write-Output "M3=$method3"
      Write-Output "M4=$method4"
      $path = $method1
      if (-not $path) { $path = $method2 }
      if (-not $path) { $path = $method3 }
      if (-not $path) { $path = $method4 }
      if ($path) { Write-Output "PATH=$path" }
    `
    const proc = spawn('powershell', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d) => { stdout += d.toString() })
    proc.stderr.on('data', (d) => { stderr += d.toString() })
    proc.on('close', (code) => {
      logger.info('IPC', `[getExePath] pid=${pid}, exit=${code}, stdout=${JSON.stringify(stdout)}, stderr=${JSON.stringify(stderr)}`)
      const match = stdout.match(/PATH=(.+)/)
      resolve(match ? match[1].trim() : null)
    })
    proc.on('error', (e) => {
      logger.error('IPC', `[getExePath] spawn 错误: ${e.message}`)
      resolve(null)
    })
  })
}

// 按进程名查询可执行文件路径（多种方式回退，取第一个匹配）
function getProcessExePathByName(name: string): Promise<string | null> {
  return new Promise((resolve) => {
    const safeName = name.replace(/'/g, "''")
    const script = `
      $procName = '${safeName}'
      $method1 = (Get-CimInstance Win32_Process -Filter "Name='$procName'" | Select-Object -First 1).ExecutablePath
      $method2 = $null
      try { $method2 = (Get-Process -Name $procName -ErrorAction SilentlyContinue | Select-Object -First 1).Path } catch {}
      $method3 = $null
      try { $method3 = (Get-Process -Name $procName -ErrorAction SilentlyContinue | Select-Object -First 1).MainModule.FileName } catch {}
      $method4 = $null
      try {
        Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        using System.Text;
        public class ProcHelper {
          [DllImport("kernel32.dll", SetLastError=true)]
          public static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, uint dwProcessId);
          [DllImport("kernel32.dll", SetLastError=true)]
          [return: MarshalAs(UnmanagedType.Bool)]
          public static extern bool QueryFullProcessImageName(IntPtr hProcess, uint dwFlags, StringBuilder lpExeName, ref uint lpdwSize);
          [DllImport("kernel32.dll")]
          public static extern bool CloseHandle(IntPtr hObject);
        }
"@
        $p = Get-CimInstance Win32_Process -Filter "Name='$procName'" | Select-Object -First 1
        if ($p) {
          $h = [ProcHelper]::OpenProcess(0x1000, $false, [uint32]$p.ProcessId)
          if ($h -ne [IntPtr]::Zero) {
            $sb = New-Object System.Text.StringBuilder 1024
            $size = [uint32]1024
            if ([ProcHelper]::QueryFullProcessImageName($h, 0, $sb, [ref]$size)) {
              $method4 = $sb.ToString()
            }
            [ProcHelper]::CloseHandle($h) | Out-Null
          }
        }
      } catch {}
      Write-Output "M1=$method1"
      Write-Output "M2=$method2"
      Write-Output "M3=$method3"
      Write-Output "M4=$method4"
      $path = $method1
      if (-not $path) { $path = $method2 }
      if (-not $path) { $path = $method3 }
      if (-not $path) { $path = $method4 }
      if ($path) { Write-Output "PATH=$path" }
    `
    const proc = spawn('powershell', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d) => { stdout += d.toString() })
    proc.stderr.on('data', (d) => { stderr += d.toString() })
    proc.on('close', (code) => {
      logger.info('IPC', `[getExePathByName] name=${name}, exit=${code}, stdout=${JSON.stringify(stdout)}, stderr=${JSON.stringify(stderr)}`)
      const match = stdout.match(/PATH=(.+)/)
      resolve(match ? match[1].trim() : null)
    })
    proc.on('error', (e) => {
      logger.error('IPC', `[getExePathByName] spawn 错误: ${e.message}`)
      resolve(null)
    })
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.hardwatch.app')

  // 初始化总量统计累加器
  statsAccumulator = new TotalStatsAccumulator()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  if (statsAccumulator) {
    statsAccumulator.flushCurrent()
  }
})

app.on('window-all-closed', () => {
  if (monitor) {
    monitor.stop()
    monitor = null
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
