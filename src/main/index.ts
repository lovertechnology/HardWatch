import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { DiskMonitor } from './monitor'
import { logger } from './logger'

let mainWindow: BrowserWindow | null = null
let monitor: DiskMonitor | null = null

logger.info('Main', 'HardWatch 启动')

// 设置 userData 路径到项目目录下，避免沙箱限制
app.setPath('userData', join(__dirname, '../../userData'))

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
  const disks = await new DiskMonitor('').getDisks()
  return disks
})

ipcMain.handle('start-monitor', async (_event, diskName: string) => {
  logger.info('IPC', `start-monitor 请求, 盘符: ${diskName}`)
  if (monitor) {
    monitor.stop()
  }
  monitor = new DiskMonitor(diskName)
  monitor.start((data) => {
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

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.hardwatch.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
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
