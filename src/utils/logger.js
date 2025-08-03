const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

class Logger {
  constructor() {
    this.logsDir = path.join(process.cwd(), 'logs');
    this.ensureLogsDirectory();
    this.setupLoggers();
  }

  ensureLogsDirectory() {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  createCustomFormat() {
    return winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
      }),
      winston.format.errors({ stack: true }),
      winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
        let logMessage = `[${timestamp}] ${level.toUpperCase()}`;
        
        if (service) {
          logMessage += ` [${service}]`;
        }
        
        logMessage += `: ${message}`;
        
        // Add metadata if present
        if (Object.keys(meta).length > 0) {
          logMessage += ` ${JSON.stringify(meta)}`;
        }
        
        return logMessage;
      })
    );
  }

  createDailyRotateTransport(filename, level = 'info') {
    return new DailyRotateFile({
      filename: path.join(this.logsDir, `${filename}-%DATE%.log`),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d', // Keep logs for 14 days
      level: level,
      format: this.createCustomFormat()
    });
  }

  setupLoggers() {
    // Main application logger
    this.mainLogger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      defaultMeta: { service: 'social-scheduler' },
      transports: [
        // Console transport for development
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            this.createCustomFormat()
          ),
          silent: process.env.NODE_ENV === 'test'
        }),
        
        // Combined log file (all levels)
        this.createDailyRotateTransport('combined'),
        
        // Error-only log file
        this.createDailyRotateTransport('error', 'error'),
        
        // Info and above log file
        this.createDailyRotateTransport('app', 'info')
      ]
    });

    // API calls logger
    this.apiLogger = winston.createLogger({
      level: 'info',
      defaultMeta: { service: 'api' },
      transports: [
        // API-specific log file
        this.createDailyRotateTransport('api'),
        
        // Console for development
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            this.createCustomFormat()
          ),
          silent: process.env.NODE_ENV === 'test'
        })
      ]
    });

    // Scheduler logger
    this.schedulerLogger = winston.createLogger({
      level: 'info',
      defaultMeta: { service: 'scheduler' },
      transports: [
        // Scheduler-specific log file
        this.createDailyRotateTransport('scheduler'),
        
        // Console for development
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            this.createCustomFormat()
          ),
          silent: process.env.NODE_ENV === 'test'
        })
      ]
    });

    // Performance logger
    this.performanceLogger = winston.createLogger({
      level: 'info',
      defaultMeta: { service: 'performance' },
      transports: [
        this.createDailyRotateTransport('performance')
      ]
    });
  }

  // Main application logging methods
  info(message, meta = {}) {
    this.mainLogger.info(message, meta);
  }

  warn(message, meta = {}) {
    this.mainLogger.warn(message, meta);
  }

  error(message, meta = {}) {
    this.mainLogger.error(message, meta);
  }

  debug(message, meta = {}) {
    this.mainLogger.debug(message, meta);
  }

  verbose(message, meta = {}) {
    this.mainLogger.verbose(message, meta);
  }

  // API-specific logging
  apiRequest(method, url, status, duration, meta = {}) {
    this.apiLogger.info('API Request', {
      method,
      url,
      status,
      duration: `${duration}ms`,
      ...meta
    });
  }

  apiError(method, url, error, meta = {}) {
    this.apiLogger.error('API Error', {
      method,
      url,
      error: error.message,
      stack: error.stack,
      ...meta
    });
  }

  // Scheduler-specific logging
  schedulerInfo(message, meta = {}) {
    this.schedulerLogger.info(message, meta);
  }

  schedulerError(message, meta = {}) {
    this.schedulerLogger.error(message, meta);
  }

  jobScheduled(jobId, cronExpression, scheduledTime, meta = {}) {
    this.schedulerLogger.info('Job Scheduled', {
      jobId,
      cronExpression,
      scheduledTime,
      ...meta
    });
  }

  jobExecuted(jobId, duration, success, meta = {}) {
    const level = success ? 'info' : 'error';
    this.schedulerLogger[level]('Job Executed', {
      jobId,
      duration: `${duration}ms`,
      success,
      ...meta
    });
  }

  // Performance logging
  performance(operation, duration, meta = {}) {
    this.performanceLogger.info('Performance', {
      operation,
      duration: `${duration}ms`,
      ...meta
    });
  }

  // Social media platform logging
  platformPost(platform, postId, success, meta = {}) {
    const level = success ? 'info' : 'error';
    this.apiLogger[level]('Platform Post', {
      platform,
      postId,
      success,
      ...meta
    });
  }

  platformError(platform, operation, error, meta = {}) {
    this.apiLogger.error('Platform Error', {
      platform,
      operation,
      error: error.message,
      ...meta
    });
  }

  // File operations logging
  fileOperation(operation, filePath, success, meta = {}) {
    const level = success ? 'info' : 'error';
    this.mainLogger[level]('File Operation', {
      operation,
      filePath,
      success,
      ...meta
    });
  }

  // Content processing logging
  contentProcessed(contentType, platform, success, meta = {}) {
    const level = success ? 'info' : 'error';
    this.mainLogger[level]('Content Processed', {
      contentType,
      platform,
      success,
      ...meta
    });
  }

  // Rate limiting logging
  rateLimitHit(platform, resetTime, meta = {}) {
    this.apiLogger.warn('Rate Limit Hit', {
      platform,
      resetTime,
      ...meta
    });
  }

  // Security logging
  authAttempt(platform, success, meta = {}) {
    const level = success ? 'info' : 'warn';
    this.apiLogger[level]('Auth Attempt', {
      platform,
      success,
      ...meta
    });
  }

  // Utility methods
  createTimer() {
    const start = Date.now();
    return {
      end: () => Date.now() - start
    };
  }

  logWithTimer(operation, callback) {
    const timer = this.createTimer();
    try {
      const result = callback();
      const duration = timer.end();
      this.performance(operation, duration, { success: true });
      return result;
    } catch (error) {
      const duration = timer.end();
      this.performance(operation, duration, { success: false, error: error.message });
      throw error;
    }
  }

  async logWithTimerAsync(operation, asyncCallback) {
    const timer = this.createTimer();
    try {
      const result = await asyncCallback();
      const duration = timer.end();
      this.performance(operation, duration, { success: true });
      return result;
    } catch (error) {
      const duration = timer.end();
      this.performance(operation, duration, { success: false, error: error.message });
      throw error;
    }
  }

  // Get logger instances for direct use
  getMainLogger() {
    return this.mainLogger;
  }

  getApiLogger() {
    return this.apiLogger;
  }

  getSchedulerLogger() {
    return this.schedulerLogger;
  }

  getPerformanceLogger() {
    return this.performanceLogger;
  }

  // Set log level dynamically
  setLogLevel(level) {
    this.mainLogger.level = level;
    this.apiLogger.level = level;
    this.schedulerLogger.level = level;
    this.info('Log level changed', { newLevel: level });
  }
}

// Create singleton instance
const logger = new Logger();

module.exports = logger;