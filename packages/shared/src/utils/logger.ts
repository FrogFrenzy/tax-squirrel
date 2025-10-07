export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug'
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  service: string;
  userId?: string;
  requestId?: string;
  metadata?: Record<string, any>;
}

export class Logger {
  private serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  private log(level: LogLevel, message: string, metadata?: Record<string, any>, userId?: string, requestId?: string): void {
    const logEntry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      service: this.serviceName,
      userId,
      requestId,
      metadata
    };

    // In production, this would integrate with a proper logging service
    console.log(JSON.stringify(logEntry, null, 2));
  }

  public error(message: string, metadata?: Record<string, any>, userId?: string, requestId?: string): void {
    this.log(LogLevel.ERROR, message, metadata, userId, requestId);
  }

  public warn(message: string, metadata?: Record<string, any>, userId?: string, requestId?: string): void {
    this.log(LogLevel.WARN, message, metadata, userId, requestId);
  }

  public info(message: string, metadata?: Record<string, any>, userId?: string, requestId?: string): void {
    this.log(LogLevel.INFO, message, metadata, userId, requestId);
  }

  public debug(message: string, metadata?: Record<string, any>, userId?: string, requestId?: string): void {
    if (process.env.NODE_ENV === 'development') {
      this.log(LogLevel.DEBUG, message, metadata, userId, requestId);
    }
  }
}