module.exports = {
  // Timezone Configuration
  timezone: {
    // Default timezone for scheduling
    default: process.env.TIMEZONE || 'UTC',
    
    // Fallback timezone if parsing fails
    fallback: 'UTC',
    
    // Common business timezones
    business: {
      'US_EASTERN': 'America/New_York',
      'US_CENTRAL': 'America/Chicago', 
      'US_MOUNTAIN': 'America/Denver',
      'US_PACIFIC': 'America/Los_Angeles',
      'UK': 'Europe/London',
      'EU_CENTRAL': 'Europe/Berlin',
      'AUSTRALIA': 'Australia/Sydney',
      'JAPAN': 'Asia/Tokyo',
      'INDIA': 'Asia/Kolkata'
    },
    
    // Auto-detect optimal posting times by timezone
    optimalTimes: {
      'America/New_York': ['09:00', '13:00', '17:00', '20:00'],
      'America/Los_Angeles': ['10:00', '14:00', '18:00', '21:00'],
      'Europe/London': ['08:00', '12:00', '16:00', '19:00'],
      'Europe/Berlin': ['09:00', '13:00', '17:00', '20:00'],
      'Asia/Tokyo': ['07:00', '12:00', '18:00', '21:00'],
      'default': ['09:00', '13:00', '17:00', '20:00']
    }
  },

  // Retry Configuration
  retry: {
    // Global retry settings
    global: {
      maxAttempts: 3,
      baseDelay: 30000, // 30 seconds
      maxDelay: 300000, // 5 minutes
      backoffMultiplier: 2,
      exponentialBackoff: true
    },
    
    // Platform-specific retry settings
    platforms: {
      facebook: {
        maxAttempts: 5,
        baseDelay: 60000, // 1 minute
        maxDelay: 600000, // 10 minutes
        backoffMultiplier: 2
      },
      instagram: {
        maxAttempts: 3,
        baseDelay: 45000, // 45 seconds
        maxDelay: 300000, // 5 minutes
        backoffMultiplier: 2
      }
    },
    
    // Error-specific retry policies
    errorTypes: {
      rate_limit: {
        maxAttempts: 5,
        baseDelay: 300000, // 5 minutes
        maxDelay: 1800000, // 30 minutes
        backoffMultiplier: 2
      },
      network_error: {
        maxAttempts: 4,
        baseDelay: 10000, // 10 seconds
        maxDelay: 60000, // 1 minute
        backoffMultiplier: 2
      },
      authentication_error: {
        maxAttempts: 2,
        baseDelay: 120000, // 2 minutes
        maxDelay: 300000, // 5 minutes
        backoffMultiplier: 1.5
      },
      content_error: {
        maxAttempts: 1, // Don't retry content errors
        baseDelay: 0,
        maxDelay: 0,
        backoffMultiplier: 1
      }
    },
    
    // Retry intervals by attempt number
    intervals: [
      30000,   // 30 seconds (1st retry)
      120000,  // 2 minutes (2nd retry)
      300000,  // 5 minutes (3rd retry)
      600000,  // 10 minutes (4th retry)
      1800000  // 30 minutes (5th retry)
    ]
  },

  // Cron Job Patterns
  cronPatterns: {
    // Predefined common patterns
    presets: {
      'IMMEDIATELY': '* * * * *',
      'EVERY_MINUTE': '* * * * *',
      'EVERY_5_MINUTES': '*/5 * * * *',
      'EVERY_15_MINUTES': '*/15 * * * *',
      'EVERY_30_MINUTES': '*/30 * * * *',
      'HOURLY': '0 * * * *',
      'EVERY_2_HOURS': '0 */2 * * *',
      'EVERY_6_HOURS': '0 */6 * * *',
      'DAILY_9AM': '0 9 * * *',
      'DAILY_NOON': '0 12 * * *',
      'DAILY_6PM': '0 18 * * *',
      'WEEKDAYS_9AM': '0 9 * * 1-5',
      'WEEKENDS_10AM': '0 10 * * 6,0',
      'WEEKLY_MONDAY_9AM': '0 9 * * 1',
      'MONTHLY_1ST_9AM': '0 9 1 * *'
    },
    
    // Business hours patterns by timezone
    businessHours: {
      'America/New_York': {
        start: '0 9 * * 1-5',    // 9 AM weekdays
        lunch: '0 12 * * 1-5',   // Noon weekdays
        end: '0 17 * * 1-5'      // 5 PM weekdays
      },
      'Europe/London': {
        start: '0 9 * * 1-5',    // 9 AM weekdays
        lunch: '0 13 * * 1-5',   // 1 PM weekdays
        end: '0 17 * * 1-5'      // 5 PM weekdays
      },
      'Asia/Tokyo': {
        start: '0 9 * * 1-5',    // 9 AM weekdays
        lunch: '0 12 * * 1-5',   // Noon weekdays
        end: '0 18 * * 1-5'      // 6 PM weekdays
      }
    },
    
    // Social media optimal posting times
    socialOptimal: {
      facebook: {
        weekday_morning: '0 9 * * 1-5',    // 9 AM weekdays
        weekday_lunch: '0 13 * * 1-5',     // 1 PM weekdays
        weekday_evening: '0 20 * * 1-5',   // 8 PM weekdays
        weekend_morning: '0 10 * * 6,0',   // 10 AM weekends
        weekend_evening: '0 19 * * 6,0'    // 7 PM weekends
      },
      instagram: {
        weekday_morning: '0 8 * * 1-5',    // 8 AM weekdays
        weekday_lunch: '0 12 * * 1-5',     // Noon weekdays
        weekday_evening: '0 19 * * 1-5',   // 7 PM weekdays
        weekend_morning: '0 11 * * 6,0',   // 11 AM weekends
        weekend_evening: '0 20 * * 6,0'    // 8 PM weekends
      }
    },
    
    // Maintenance and cleanup patterns
    maintenance: {
      log_cleanup: '0 2 * * 0',           // 2 AM every Sunday
      failed_job_retry: '*/10 * * * *',   // Every 10 minutes
      queue_cleanup: '0 */6 * * *',       // Every 6 hours
      health_check: '*/5 * * * *',        // Every 5 minutes
      backup_jobs: '0 3 * * *'            // 3 AM daily
    }
  },

  // Queue Management
  queue: {
    // Queue configuration
    settings: {
      maxConcurrentJobs: 5,
      maxQueueSize: 1000,
      priorityLevels: ['high', 'normal', 'low'],
      defaultPriority: 'normal',
      processingTimeout: 300000, // 5 minutes
      cleanupInterval: 3600000   // 1 hour
    },
    
    // Queue priorities
    priorities: {
      immediate: 1,
      high: 2,
      normal: 3,
      low: 4,
      background: 5
    },
    
    // Processing strategies
    strategies: {
      // First In, First Out
      fifo: {
        name: 'fifo',
        description: 'Process jobs in order of arrival'
      },
      // Priority-based processing
      priority: {
        name: 'priority',
        description: 'Process high priority jobs first'
      },
      // Shortest job first
      sjf: {
        name: 'shortest_job_first',
        description: 'Process estimated shortest jobs first'
      },
      // Platform-based batching
      platform_batch: {
        name: 'platform_batch',
        description: 'Group jobs by platform for efficiency'
      }
    },
    
    // Job states
    states: {
      PENDING: 'pending',
      SCHEDULED: 'scheduled',
      RUNNING: 'running',
      COMPLETED: 'completed',
      FAILED: 'failed',
      CANCELLED: 'cancelled',
      RETRYING: 'retrying'
    },
    
    // Queue limits by priority
    limits: {
      high: {
        maxJobs: 100,
        maxRetries: 5,
        timeout: 600000 // 10 minutes
      },
      normal: {
        maxJobs: 500,
        maxRetries: 3,
        timeout: 300000 // 5 minutes
      },
      low: {
        maxJobs: 1000,
        maxRetries: 2,
        timeout: 180000 // 3 minutes
      }
    },
    
    // Auto-scaling settings
    scaling: {
      enabled: true,
      minWorkers: 1,
      maxWorkers: 10,
      scaleUpThreshold: 0.8,   // Scale up when 80% of workers busy
      scaleDownThreshold: 0.2, // Scale down when 20% of workers busy
      scaleUpCooldown: 60000,  // 1 minute cooldown
      scaleDownCooldown: 300000 // 5 minute cooldown
    }
  },

  // Job Configuration
  jobs: {
    // Default job settings
    defaults: {
      timeout: 300000, // 5 minutes
      retries: 3,
      priority: 'normal',
      removeOnComplete: 100,  // Keep last 100 completed jobs
      removeOnFail: 50        // Keep last 50 failed jobs
    },
    
    // Job type configurations
    types: {
      post_publish: {
        timeout: 120000, // 2 minutes
        retries: 5,
        priority: 'high',
        concurrency: 3
      },
      image_upload: {
        timeout: 300000, // 5 minutes
        retries: 3,
        priority: 'normal',
        concurrency: 2
      },
      content_validation: {
        timeout: 30000, // 30 seconds
        retries: 2,
        priority: 'high',
        concurrency: 5
      },
      cleanup: {
        timeout: 600000, // 10 minutes
        retries: 1,
        priority: 'low',
        concurrency: 1
      }
    },
    
    // Monitoring and health checks
    monitoring: {
      healthCheckInterval: 300000, // 5 minutes
      metricsCollectionInterval: 60000, // 1 minute
      alertThresholds: {
        failureRate: 0.1,        // Alert if >10% jobs fail
        avgProcessingTime: 180000, // Alert if avg >3 minutes
        queueSize: 800           // Alert if queue >800 jobs
      }
    }
  },

  // Performance Settings
  performance: {
    // Batch processing
    batching: {
      enabled: true,
      maxBatchSize: 10,
      batchTimeout: 30000, // 30 seconds
      platformGrouping: true
    },
    
    // Caching
    caching: {
      enabled: true,
      jobCacheTTL: 3600000,    // 1 hour
      resultCacheTTL: 1800000, // 30 minutes
      maxCacheSize: 1000
    },
    
    // Rate limiting
    rateLimiting: {
      enabled: true,
      facebook: {
        requestsPerMinute: 50,
        requestsPerHour: 200
      },
      instagram: {
        requestsPerMinute: 25,
        requestsPerHour: 200
      }
    }
  },

  // Development Settings
  development: {
    // Debug options
    debug: {
      enabled: process.env.NODE_ENV === 'development',
      logAllJobs: true,
      logCronExpressions: true,
      simulateFailures: false
    },
    
    // Testing options
    testing: {
      mockScheduler: false,
      fastRetries: true,        // Use shorter retry delays
      skipRateLimiting: false,
      maxTestJobs: 100
    }
  }
};