import { app } from 'electron'
import { appendFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const LOG_DIR = join(app.getPath('userData'), 'logs')

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

class Logger {
  private logPath: string

  constructor() {
    if (!existsSync(LOG_DIR)) {
      mkdirSync(LOG_DIR, { recursive: true })
    }
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    this.logPath = join(LOG_DIR, `hardwatch-${ts}.log`)
    this.info('Logger', `日志文件: ${this.logPath}`)
  }

  private write(level: LogLevel, module: string, message: string): void {
    const ts = new Date().toISOString()
    const line = `[${ts}] [${level}] [${module}] ${message}\n`
    try {
      appendFileSync(this.logPath, line, 'utf-8')
    } catch {
      // 日志写入失败则静默
    }
  }

  debug(module: string, message: string): void {
    this.write(LogLevel.DEBUG, module, message)
  }

  info(module: string, message: string): void {
    this.write(LogLevel.INFO, module, message)
  }

  warn(module: string, message: string): void {
    this.write(LogLevel.WARN, module, message)
  }

  error(module: string, message: string): void {
    this.write(LogLevel.ERROR, module, message)
  }
}

export const logger = new Logger()
