import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  getDisks: () => ipcRenderer.invoke('get-disks'),
  startMonitor: (diskName: string) => ipcRenderer.invoke('start-monitor', diskName),
  stopMonitor: () => ipcRenderer.invoke('stop-monitor'),
  updateInterval: (sec: number) => ipcRenderer.invoke('update-interval', sec),
  getInterval: () => ipcRenderer.invoke('get-interval'),
  queryStats: (range: string) => ipcRenderer.invoke('query-stats', range),
  clearStats: () => ipcRenderer.invoke('clear-stats'),
  openProcessLocation: (pid: number) => ipcRenderer.invoke('open-process-location', pid),
  openProcessLocationByName: (name: string) => ipcRenderer.invoke('open-process-location-by-name', name),
  onDiskData: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('disk-data', handler)
    return () => ipcRenderer.removeListener('disk-data', handler)
  }
})
