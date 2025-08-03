const dotenv = require('dotenv');
const express = require('express');
const path = require('path');
const cron = require('node-cron');

// Load environment variables first
dotenv.config();

// Import services and utilities
const logger = require('./utils/logger');
const fileReader = require('./services/file-reader');
const metaClient = require('./services/meta-client');
const contentProcessor = require('./services/content-processor');
const schedulerConfig = require('./config/scheduler');
const metaApiConfig = require('./config/meta-api');
const validators = require('./utils/validators');

class SocialSchedulerApp {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    this.isShuttingDown = false;
    this.activeJobs = new Map();
    this.cronJobs = new Map();
    this.healthStatus = {
      status: 'starting',
      services: {},
      uptime: 0,
      lastCheck: null
    };
    
    // Initialize Express middleware
    this.setupExpress();
    
    // Setup graceful shutdown handlers
    this.setupGracefulShutdown();
  }

  async initialize() {
    try {
      logger.info('Initializing Social Scheduler Application');
      
      // Validate environment variables
      await this.validateEnvironment();
      
      // Initialize services
      await this.initializeServices();
      
      // Load and validate schedule configuration
      await this.loadScheduleConfig();
      
      // Setup health monitoring
      this.setupHealthMonitoring();
      
      // Start HTTP server for health checks
      await this.startHttpServer();
      
      // Start the main scheduler loop
      await this.startScheduler();
      
      logger.info('Social Scheduler Application initialized successfully');
      this.healthStatus.status = 'running';
      
    } catch (error) {
      logger.error('Failed to initialize application:', error);
      this.healthStatus.status = 'error';
      throw error;
    }
  }

  setupExpress() {
    // Basic middleware
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json(this.getHealthStatus());
    });
    
    // Status endpoint with detailed information
    this.app.get('/status', (req, res) => {
      res.json({
        ...this.getHealthStatus(),
        activeJobs: this.activeJobs.size,
        scheduledJobs: this.cronJobs.size,
        config: {
          timezone: schedulerConfig.timezone.default,
          retryAttempts: schedulerConfig.retry.global.maxAttempts,
          queueSize: schedulerConfig.queue.settings.maxQueueSize
        }
      });
    });
    
    // Metrics endpoint
    this.app.get('/metrics', (req, res) => {
      res.json({
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        activeJobs: this.activeJobs.size,
        cronJobs: this.cronJobs.size,
        rateLimits: metaClient.getRateLimitStatus(),
        timestamp: new Date().toISOString()
      });
    });
    
    // Graceful shutdown endpoint (for testing)
    this.app.post('/shutdown', (req, res) => {
      if (process.env.NODE_ENV === 'development') {
        res.json({ message: 'Initiating graceful shutdown...' });
        setTimeout(() => this.shutdown(), 1000);
      } else {
        res.status(403).json({ error: 'Shutdown endpoint disabled in production' });
      }
    });
  }

  async validateEnvironment() {
    logger.info('Validating environment configuration');
    
    const requiredEnvVars = [
      'FACEBOOK_ACCESS_TOKEN',
      'FACEBOOK_PAGE_ID',
      'INSTAGRAM_ACCESS_TOKEN'
    ];
    
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      const warning = `Missing environment variables: ${missingVars.join(', ')}`;
      logger.warn(warning);
      logger.warn('Application will run with limited functionality');
    }
    
    // Validate timezone
    const timezone = process.env.TIMEZONE || schedulerConfig.timezone.default;
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      logger.info(`Using timezone: ${timezone}`);
    } catch (error) {
      logger.warn(`Invalid timezone ${timezone}, falling back to UTC`);
      process.env.TIMEZONE = 'UTC';
    }
  }

  async initializeServices() {
    logger.info('Initializing services');
    
    this.healthStatus.services = {
      metaClient: 'initializing',
      fileReader: 'initializing',
      contentProcessor: 'initializing'
    };
    
    try {
      // Test Meta client connections
      const facebookValid = await metaClient.validateConnection('facebook');
      const instagramValid = await metaClient.validateConnection('instagram');
      
      this.healthStatus.services.metaClient = (facebookValid || instagramValid) ? 'healthy' : 'error';
      
      if (facebookValid) {
        logger.info('Facebook API connection validated');
      }
      if (instagramValid) {
        logger.info('Instagram API connection validated');
      }
      
      if (!facebookValid && !instagramValid) {
        logger.warn('No valid Meta API connections found');
      }
      
    } catch (error) {
      logger.error('Meta client initialization failed:', error);
      this.healthStatus.services.metaClient = 'error';
    }
    
    // Test file reader
    try {
      await fileReader.listPostFiles();
      await fileReader.listImageFiles();
      this.healthStatus.services.fileReader = 'healthy';
      logger.info('File reader service initialized');
    } catch (error) {
      logger.error('File reader initialization failed:', error);
      this.healthStatus.services.fileReader = 'error';
    }
    
    // Content processor is always available
    this.healthStatus.services.contentProcessor = 'healthy';
    logger.info('Content processor service initialized');
  }

  async loadScheduleConfig() {
    try {
      logger.info('Loading schedule configuration');
      
      const configPath = path.join(process.cwd(), 'content', 'schedule.json');
      const scheduleData = await fileReader.readScheduleConfig(configPath);
      
      this.scheduleConfig = scheduleData.config;
      
      // Validate the schedule configuration
      const validation = validators.validateScheduleConfig(this.scheduleConfig);
      
      if (!validation.isValid) {
        throw new Error(`Invalid schedule configuration: ${validation.errors.join(', ')}`);
      }
      
      if (validation.warnings.length > 0) {
        validation.warnings.forEach(warning => logger.warn(`Schedule config: ${warning}`));
      }
      
      logger.info(`Loaded ${this.scheduleConfig.posts.length} scheduled posts`);
      
      if (this.scheduleConfig.recurring) {
        logger.info(`Loaded ${this.scheduleConfig.recurring.length} recurring posts`);
      }
      
    } catch (error) {
      logger.error('Failed to load schedule configuration:', error);
      throw error;
    }
  }

  async startScheduler() {
    logger.info('Starting scheduler');
    
    // Schedule individual posts
    if (this.scheduleConfig.posts) {
      for (const post of this.scheduleConfig.posts) {
        await this.schedulePost(post);
      }
    }
    
    // Schedule recurring posts
    if (this.scheduleConfig.recurring) {
      for (const recurringPost of this.scheduleConfig.recurring) {
        this.scheduleRecurringPost(recurringPost);
      }
    }
    
    // Start maintenance jobs
    this.startMaintenanceJobs();
    
    logger.info(`Scheduler started with ${this.cronJobs.size} cron jobs`);
  }

  async schedulePost(postConfig) {
    try {
      const jobId = `post_${postConfig.id || Date.now()}`;
      
      // Convert scheduled time to cron expression
      const scheduledTime = new Date(postConfig.scheduledTime);
      const cronExpression = this.dateToCron(scheduledTime, postConfig.timezone);
      
      logger.schedulerInfo('Scheduling post', {
        jobId,
        postId: postConfig.id,
        scheduledTime: postConfig.scheduledTime,
        cronExpression,
        platforms: postConfig.platforms
      });
      
      const cronJob = cron.schedule(cronExpression, async () => {
        await this.executePost(jobId, postConfig);
      }, {
        scheduled: false,
        timezone: postConfig.timezone || schedulerConfig.timezone.default
      });
      
      this.cronJobs.set(jobId, {
        job: cronJob,
        config: postConfig,
        type: 'scheduled_post'
      });
      
      cronJob.start();
      
    } catch (error) {
      logger.schedulerError('Failed to schedule post', {
        postId: postConfig.id,
        error: error.message
      });
    }
  }

  scheduleRecurringPost(recurringConfig) {
    try {
      const jobId = `recurring_${recurringConfig.id}`;
      
      logger.schedulerInfo('Scheduling recurring post', {
        jobId,
        cronPattern: recurringConfig.cronPattern,
        platforms: recurringConfig.platforms
      });
      
      const cronJob = cron.schedule(recurringConfig.cronPattern, async () => {
        await this.executeRecurringPost(jobId, recurringConfig);
      }, {
        scheduled: false,
        timezone: recurringConfig.timezone || schedulerConfig.timezone.default
      });
      
      this.cronJobs.set(jobId, {
        job: cronJob,
        config: recurringConfig,
        type: 'recurring_post'
      });
      
      cronJob.start();
      
    } catch (error) {
      logger.schedulerError('Failed to schedule recurring post', {
        postId: recurringConfig.id,
        error: error.message
      });
    }
  }

  async executePost(jobId, postConfig) {
    if (this.isShuttingDown) return;
    
    const timer = logger.createTimer();
    this.activeJobs.set(jobId, { startTime: Date.now(), config: postConfig });
    
    try {
      logger.schedulerInfo('Executing post', { jobId, postId: postConfig.id });
      
      // Load content
      let content = postConfig.content;
      if (postConfig.file && !content) {
        const fileData = await fileReader.readTextFile(path.basename(postConfig.file));
        content = fileData.content;
      }
      
      // Process content for each platform
      const processedContent = await contentProcessor.processContent(
        content,
        postConfig.images || [],
        postConfig.platforms
      );
      
      // Post to each platform
      const results = {};
      for (const platform of postConfig.platforms) {
        try {
          const platformContent = processedContent[platform];
          const postData = {
            content: platformContent.content,
            imagePath: platformContent.images[0]?.processedPath
          };
          
          const result = await metaClient.postToPlatform(platform, postData);
          results[platform] = { success: true, ...result };
          
          logger.platformPost(platform, result.id, true, { jobId, postId: postConfig.id });
          
        } catch (error) {
          results[platform] = { success: false, error: error.message };
          logger.platformError(platform, 'post_execution', error, { jobId, postId: postConfig.id });
        }
      }
      
      const duration = timer.end();
      const allSuccessful = Object.values(results).every(r => r.success);
      
      logger.jobExecuted(jobId, duration, allSuccessful, {
        postId: postConfig.id,
        platforms: postConfig.platforms,
        results
      });
      
      // Remove one-time jobs
      if (this.cronJobs.has(jobId) && this.cronJobs.get(jobId).type === 'scheduled_post') {
        this.cronJobs.get(jobId).job.stop();
        this.cronJobs.delete(jobId);
      }
      
    } catch (error) {
      const duration = timer.end();
      logger.jobExecuted(jobId, duration, false, {
        postId: postConfig.id,
        error: error.message
      });
    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  async executeRecurringPost(jobId, recurringConfig) {
    // Process template variables if present
    let content = recurringConfig.content;
    if (recurringConfig.variables) {
      content = this.processTemplate(content, recurringConfig.variables);
    }
    
    const postConfig = {
      ...recurringConfig,
      content,
      id: `${recurringConfig.id}_${Date.now()}`
    };
    
    await this.executePost(`${jobId}_${Date.now()}`, postConfig);
  }

  processTemplate(content, variables) {
    let processedContent = content;
    
    for (const [key, values] of Object.entries(variables)) {
      if (Array.isArray(values)) {
        const randomValue = values[Math.floor(Math.random() * values.length)];
        processedContent = processedContent.replace(`{${key}}`, randomValue);
      }
    }
    
    return processedContent;
  }

  startMaintenanceJobs() {
    // Health check job
    const healthCheckJob = cron.schedule('*/5 * * * *', () => {
      this.updateHealthStatus();
    });
    
    this.cronJobs.set('health_check', {
      job: healthCheckJob,
      type: 'maintenance'
    });
    
    // Log cleanup job (weekly)
    const logCleanupJob = cron.schedule('0 2 * * 0', () => {
      logger.info('Running weekly log cleanup');
      // Log cleanup logic would go here
    });
    
    this.cronJobs.set('log_cleanup', {
      job: logCleanupJob,
      type: 'maintenance'
    });
    
    healthCheckJob.start();
    logCleanupJob.start();
    
    logger.info('Maintenance jobs started');
  }

  setupHealthMonitoring() {
    this.updateHealthStatus();
    
    // Update health status every minute
    setInterval(() => {
      this.updateHealthStatus();
    }, 60000);
  }

  updateHealthStatus() {
    this.healthStatus.uptime = Math.floor(process.uptime());
    this.healthStatus.lastCheck = new Date().toISOString();
    
    // Check if any critical services are down
    const criticalServices = ['metaClient'];
    const hasHealthyService = criticalServices.some(service => 
      this.healthStatus.services[service] === 'healthy'
    );
    
    if (!hasHealthyService && this.healthStatus.status === 'running') {
      this.healthStatus.status = 'degraded';
      logger.warn('Application status degraded - no healthy critical services');
    }
  }

  async startHttpServer() {
    return new Promise((resolve, reject) => {
      const server = this.app.listen(this.port, (err) => {
        if (err) {
          reject(err);
        } else {
          logger.info(`Health check server listening on port ${this.port}`);
          this.server = server;
          resolve();
        }
      });
    });
  }

  getHealthStatus() {
    return {
      ...this.healthStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0'
    };
  }

  dateToCron(date, timezone = 'UTC') {
    // Convert date to cron expression
    const minute = date.getMinutes();
    const hour = date.getHours();
    const day = date.getDate();
    const month = date.getMonth() + 1;
    
    return `${minute} ${hour} ${day} ${month} *`;
  }

  setupGracefulShutdown() {
    const shutdownSignals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
    
    shutdownSignals.forEach(signal => {
      process.on(signal, () => {
        logger.info(`Received ${signal}, initiating graceful shutdown`);
        this.shutdown();
      });
    });
    
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      this.shutdown();
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection at:', promise, 'reason:', reason);
      this.shutdown();
    });
  }

  async shutdown() {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    this.healthStatus.status = 'shutting_down';
    
    logger.info('Starting graceful shutdown');
    
    try {
      // Stop accepting new requests
      if (this.server) {
        this.server.close();
        logger.info('HTTP server closed');
      }
      
      // Stop all cron jobs
      for (const [jobId, jobData] of this.cronJobs) {
        jobData.job.stop();
        logger.info(`Stopped cron job: ${jobId}`);
      }
      this.cronJobs.clear();
      
      // Wait for active jobs to complete (with timeout)
      const shutdownTimeout = 30000; // 30 seconds
      const startTime = Date.now();
      
      while (this.activeJobs.size > 0 && (Date.now() - startTime) < shutdownTimeout) {
        logger.info(`Waiting for ${this.activeJobs.size} active jobs to complete`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      if (this.activeJobs.size > 0) {
        logger.warn(`Force stopping ${this.activeJobs.size} active jobs`);
        this.activeJobs.clear();
      }
      
      logger.info('Graceful shutdown completed');
      process.exit(0);
      
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Create and export the application instance
const app = new SocialSchedulerApp();

// Start the application if this file is run directly
if (require.main === module) {
  app.initialize().catch(error => {
    logger.error('Failed to start application:', error);
    process.exit(1);
  });
}

module.exports = app;