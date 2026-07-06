export interface DiskInfo {
  number: number      // 物理盘号（-1 表示全部）
  name: string        // 物理盘型号
  sizeBytes: number
  letters: string[]   // 该物理盘对应的所有盘符（如 ['C:', 'D:']）
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

export interface StatsProcess {
  name: string
  readBytes: number
  writeBytes: number
}

export interface StatsChartBucket {
  label: string
  readBytes: number
  writeBytes: number
}

export interface TotalStatsData {
  totalReadBytes: number
  totalWriteBytes: number
  processes: StatsProcess[]
  chartBuckets: StatsChartBucket[]
  rangeLabel: string
}

export interface ElectronAPI {
  getDisks: () => Promise<DiskInfo[]>
  startMonitor: (diskNumber: number) => Promise<boolean>
  stopMonitor: () => Promise<boolean>
  updateInterval: (sec: number) => Promise<boolean>
  getInterval: () => Promise<number>
  queryStats: (range: string) => Promise<TotalStatsData>
  clearStats: () => Promise<boolean>
  openProcessLocation: (pid: number) => Promise<boolean>
  openProcessLocationByName: (name: string) => Promise<boolean>
  onDiskData: (callback: (data: DiskData) => void) => () => void
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
