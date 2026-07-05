import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync, statSync } from 'fs'
import { logger } from './logger'

interface BucketProcessData {
  readBytes: number
  writeBytes: number
}

interface StatsBucket {
  hourStart: number
  processes: { [name: string]: BucketProcessData }
  diskReadBytes: number
  diskWriteBytes: number
}

interface ChartBucket {
  label: string
  readBytes: number
  writeBytes: number
}

export interface TotalStatsData {
  totalReadBytes: number
  totalWriteBytes: number
  processes: { name: string; readBytes: number; writeBytes: number }[]
  chartBuckets: ChartBucket[]
  rangeLabel: string
}

const RANGE_MAP: { [key: string]: { hours: number; label: string; granularity: 'hour' | 'day' } } = {
  '1d': { hours: 24, label: '1 天', granularity: 'hour' },
  '2d': { hours: 48, label: '2 天', granularity: 'hour' },
  '3d': { hours: 72, label: '3 天', granularity: 'hour' },
  '1w': { hours: 168, label: '1 周', granularity: 'day' },
  '1m': { hours: 720, label: '1 个月', granularity: 'day' }
}

const MAX_BUCKETS_AGE_MS = 31 * 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

export class TotalStatsAccumulator {
  private statsDir: string
  private currentBucket: StatsBucket
  private currentHour: number

  constructor() {
    this.statsDir = join(app.getPath('userData'), 'stats')
    if (!existsSync(this.statsDir)) {
      mkdirSync(this.statsDir, { recursive: true })
    }
    this.currentHour = new Date().getHours()
    this.currentBucket = this.createEmptyBucket(this.getCurrentHourStart())
    this.loadCurrentBucket()
    this.cleanupOldBuckets()
    logger.info('StatsAccumulator', `初始化, statsDir: ${this.statsDir}`)
  }

  private getCurrentHourStart(): number {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()).getTime()
  }

  private createEmptyBucket(hourStart: number): StatsBucket {
    return { hourStart, processes: {}, diskReadBytes: 0, diskWriteBytes: 0 }
  }

  private loadCurrentBucket(): void {
    const path = join(this.statsDir, 'current-bucket.json')
    const currentHourStart = this.getCurrentHourStart()

    if (existsSync(path)) {
      try {
        const data: StatsBucket = JSON.parse(readFileSync(path, 'utf-8'))
        if (data.hourStart === currentHourStart) {
          this.currentBucket = data
          logger.info('StatsAccumulator', `恢复当前小时桶`)
          return
        } else {
          // Previous hour, archive it
          this.archiveBucket(data)
        }
      } catch (e: any) {
        logger.warn('StatsAccumulator', `读取 current-bucket.json 失败: ${e.message}`)
      }
    }
    this.currentBucket = this.createEmptyBucket(currentHourStart)
  }

  private archiveBucket(bucket: StatsBucket): void {
    const date = new Date(bucket.hourStart)
    const filename = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}.json`
    try {
      writeFileSync(join(this.statsDir, filename), JSON.stringify(bucket))
      logger.info('StatsAccumulator', `归档小时桶: ${filename}`)
    } catch (e: any) {
      logger.error('StatsAccumulator', `归档失败: ${e.message}`)
    }
  }

  private saveCurrentBucket(): void {
    try {
      writeFileSync(join(this.statsDir, 'current-bucket.json'), JSON.stringify(this.currentBucket))
    } catch (e: any) {
      logger.error('StatsAccumulator', `保存 current-bucket.json 失败: ${e.message}`)
    }
  }

  accumulate(processes: { name: string; readBytes: number; writeBytes: number }[], diskReadBytes: number, diskWriteBytes: number): void {
    const now = new Date()
    const hour = now.getHours()

    // Check if we crossed an hour boundary
    if (hour !== this.currentHour) {
      this.archiveBucket(this.currentBucket)
      this.currentBucket = this.createEmptyBucket(this.getCurrentHourStart())
      this.currentHour = hour
    }

    // Accumulate process I/O by name
    for (const proc of processes) {
      if (!this.currentBucket.processes[proc.name]) {
        this.currentBucket.processes[proc.name] = { readBytes: 0, writeBytes: 0 }
      }
      this.currentBucket.processes[proc.name].readBytes += proc.readBytes
      this.currentBucket.processes[proc.name].writeBytes += proc.writeBytes
    }

    this.currentBucket.diskReadBytes += diskReadBytes
    this.currentBucket.diskWriteBytes += diskWriteBytes
    this.saveCurrentBucket()
  }

  flushCurrent(): void {
    this.saveCurrentBucket()
    logger.info('StatsAccumulator', '退出前保存当前桶')
  }

  queryStats(range: string): TotalStatsData {
    const config = RANGE_MAP[range]
    if (!config) {
      return { totalReadBytes: 0, totalWriteBytes: 0, processes: [], chartBuckets: [], rangeLabel: '' }
    }

    const now = Date.now()
    const startTime = now - config.hours * HOUR_MS
    const buckets: StatsBucket[] = []

    // Include current bucket if in range
    if (this.currentBucket.hourStart >= startTime) {
      buckets.push(this.currentBucket)
    }

    // Read archived buckets
    try {
      const files = readdirSync(this.statsDir)
      for (const file of files) {
        if (!file.endsWith('.json') || file === 'current-bucket.json') continue
        try {
          const data: StatsBucket = JSON.parse(readFileSync(join(this.statsDir, file), 'utf-8'))
          if (data.hourStart >= startTime) {
            buckets.push(data)
          }
        } catch (e: any) {
          logger.warn('StatsAccumulator', `读取桶文件 ${file} 失败: ${e.message}`)
        }
      }
    } catch (e: any) {
      logger.warn('StatsAccumulator', `扫描 stats 目录失败: ${e.message}`)
    }

    // Aggregate
    let totalReadBytes = 0
    let totalWriteBytes = 0
    const processMap: { [name: string]: BucketProcessData } = {}

    for (const bucket of buckets) {
      totalReadBytes += bucket.diskReadBytes
      totalWriteBytes += bucket.diskWriteBytes
      for (const [name, data] of Object.entries(bucket.processes)) {
        if (!processMap[name]) {
          processMap[name] = { readBytes: 0, writeBytes: 0 }
        }
        processMap[name].readBytes += data.readBytes
        processMap[name].writeBytes += data.writeBytes
      }
    }

    const processes = Object.entries(processMap)
      .map(([name, data]) => ({ name, readBytes: data.readBytes, writeBytes: data.writeBytes }))
      .sort((a, b) => (b.readBytes + b.writeBytes) - (a.readBytes + a.writeBytes))

    const chartBuckets = this.buildChartBuckets(buckets, startTime, now, config.granularity)

    return { totalReadBytes, totalWriteBytes, processes, chartBuckets, rangeLabel: config.label }
  }

  private buildChartBuckets(buckets: StatsBucket[], startTime: number, endTime: number, granularity: 'hour' | 'day'): ChartBucket[] {
    const result: ChartBucket[] = []

    if (granularity === 'hour') {
      const alignedStart = Math.floor(startTime / HOUR_MS) * HOUR_MS
      for (let t = alignedStart; t <= endTime; t += HOUR_MS) {
        const date = new Date(t)
        const label = `${String(date.getHours()).padStart(2, '0')}:00`
        const hourBuckets = buckets.filter(b => b.hourStart >= t && b.hourStart < t + HOUR_MS)
        result.push({
          label,
          readBytes: hourBuckets.reduce((s, b) => s + b.diskReadBytes, 0),
          writeBytes: hourBuckets.reduce((s, b) => s + b.diskWriteBytes, 0)
        })
      }
    } else {
      const dayStart = new Date(startTime)
      dayStart.setHours(0, 0, 0, 0)
      for (let t = dayStart.getTime(); t <= endTime; t += DAY_MS) {
        const date = new Date(t)
        const label = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        const dayEnd = t + DAY_MS
        const dayBuckets = buckets.filter(b => b.hourStart >= t && b.hourStart < dayEnd)
        result.push({
          label,
          readBytes: dayBuckets.reduce((s, b) => s + b.diskReadBytes, 0),
          writeBytes: dayBuckets.reduce((s, b) => s + b.diskWriteBytes, 0)
        })
      }
    }

    return result
  }

  clearStats(): boolean {
    try {
      const files = readdirSync(this.statsDir)
      for (const file of files) {
        if (file.endsWith('.json')) {
          unlinkSync(join(this.statsDir, file))
        }
      }
      this.currentBucket = this.createEmptyBucket(this.getCurrentHourStart())
      this.currentHour = new Date().getHours()
      logger.info('StatsAccumulator', '清除所有统计数据')
      return true
    } catch (e: any) {
      logger.error('StatsAccumulator', `清除统计失败: ${e.message}`)
      return false
    }
  }

  private cleanupOldBuckets(): void {
    const cutoff = Date.now() - MAX_BUCKETS_AGE_MS
    try {
      const files = readdirSync(this.statsDir)
      for (const file of files) {
        if (!file.endsWith('.json') || file === 'current-bucket.json') continue
        const filepath = join(this.statsDir, file)
        try {
          const data: StatsBucket = JSON.parse(readFileSync(filepath, 'utf-8'))
          if (data.hourStart < cutoff) {
            unlinkSync(filepath)
            logger.info('StatsAccumulator', `清理过期桶: ${file}`)
          }
        } catch {
          try {
            if (statSync(filepath).mtimeMs < cutoff) {
              unlinkSync(filepath)
            }
          } catch {
            // skip
          }
        }
      }
    } catch (e: any) {
      logger.warn('StatsAccumulator', `清理过期桶失败: ${e.message}`)
    }
  }
}
