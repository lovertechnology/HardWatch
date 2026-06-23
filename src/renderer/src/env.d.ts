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
  readSpeed: number
  writeSpeed: number
  readChange: number
  writeChange: number
  processes: ProcessIO[]
  timestamp: number
  intervalSec: number
}

export interface ElectronAPI {
  getDisks: () => Promise<DiskInfo[]>
  startMonitor: (diskName: string) => Promise<boolean>
  stopMonitor: () => Promise<boolean>
  updateInterval: (sec: number) => Promise<boolean>
  getInterval: () => Promise<number>
  onDiskData: (callback: (data: DiskData) => void) => () => void
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
