const fs = require('fs').promises;
const path = require('path');
const moment = require('moment-timezone');

class Validators {
  constructor() {
    this.platformLimits = {
      facebook: {
        maxTextLength: 63206,
        maxHashtags: 30,
        imageMaxSize: 4096,
        supportedFormats: ['jpeg', 'jpg', 'png', 'gif', 'webp'],
        maxFileSize: 100 * 1024 * 1024, // 100MB
        minImageWidth: 200,
        minImageHeight: 200
      },
      instagram: {
        maxTextLength: 2200,
        maxHashtags: 30,
        imageMaxSize: 1080,
        supportedFormats: ['jpeg', 'jpg', 'png'],
        maxFileSize: 30 * 1024 * 1024, // 30MB
        minImageWidth: 320,
        minImageHeight: 320,
        aspectRatios: {
          min: 0.8, // 4:5
          max: 1.91 // 16:9
        }
      }
    };

    this.validTimezones = moment.tz.names();
    this.supportedDateFormats = [
      'YYYY-MM-DD HH:mm:ss',
      'YYYY-MM-DDTHH:mm:ss',
      'YYYY-MM-DDTHH:mm:ssZ',
      'YYYY-MM-DDTHH:mm:ss.SSSZ',
      moment.ISO_8601
    ];
  }

  // Schedule.json validation
  validateScheduleConfig(config) {
    const errors = [];
    const warnings = [];

    try {
      // Basic structure validation
      if (!config || typeof config !== 'object') {
        errors.push('Schedule config must be a valid object');
        return { isValid: false, errors, warnings };
      }

      if (!Array.isArray(config.posts)) {
        errors.push('Schedule config must contain a "posts" array');
        return { isValid: false, errors, warnings };
      }

      if (config.posts.length === 0) {
        warnings.push('No posts found in schedule config');
      }

      // Validate each post
      config.posts.forEach((post, index) => {
        const postErrors = this.validateSchedulePost(post, index);
        errors.push(...postErrors.errors);
        warnings.push(...postErrors.warnings);
      });

      // Global settings validation
      if (config.settings) {
        const settingsValidation = this.validateScheduleSettings(config.settings);
        errors.push(...settingsValidation.errors);
        warnings.push(...settingsValidation.warnings);
      }

    } catch (error) {
      errors.push(`Schedule config validation error: ${error.message}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  validateSchedulePost(post, index) {
    const errors = [];
    const warnings = [];

    // Content validation
    if (!post.content && !post.file) {
      errors.push(`Post ${index}: Must have either "content" or "file" specified`);
    }

    if (post.content && post.file) {
      warnings.push(`Post ${index}: Both "content" and "file" specified, "content" will take precedence`);
    }

    // Scheduled time validation
    if (!post.scheduledTime) {
      errors.push(`Post ${index}: Missing "scheduledTime"`);
    } else {
      const timeValidation = this.validateDateTime(post.scheduledTime, post.timezone);
      if (!timeValidation.isValid) {
        errors.push(`Post ${index}: ${timeValidation.error}`);
      }
      if (timeValidation.warning) {
        warnings.push(`Post ${index}: ${timeValidation.warning}`);
      }
    }

    // Platforms validation
    if (!Array.isArray(post.platforms) || post.platforms.length === 0) {
      errors.push(`Post ${index}: Must specify at least one platform`);
    } else {
      const platformValidation = this.validatePlatforms(post.platforms);
      if (!platformValidation.isValid) {
        errors.push(`Post ${index}: ${platformValidation.error}`);
      }
    }

    // Images validation
    if (post.images && Array.isArray(post.images)) {
      post.images.forEach((image, imageIndex) => {
        if (typeof image !== 'string') {
          errors.push(`Post ${index}, Image ${imageIndex}: Must be a string path`);
        }
      });
    }

    // Content length validation if content is provided
    if (post.content && post.platforms) {
      post.platforms.forEach(platform => {
        const contentValidation = this.validateTextContent(post.content, platform);
        if (!contentValidation.isValid) {
          errors.push(`Post ${index}, Platform ${platform}: ${contentValidation.error}`);
        }
        warnings.push(...contentValidation.warnings);
      });
    }

    return { errors, warnings };
  }

  validateScheduleSettings(settings) {
    const errors = [];
    const warnings = [];

    if (settings.timezone && !this.validTimezones.includes(settings.timezone)) {
      errors.push(`Invalid timezone: ${settings.timezone}`);
    }

    if (settings.retryAttempts && (typeof settings.retryAttempts !== 'number' || settings.retryAttempts < 0)) {
      errors.push('retryAttempts must be a non-negative number');
    }

    if (settings.retryDelay && (typeof settings.retryDelay !== 'number' || settings.retryDelay < 0)) {
      errors.push('retryDelay must be a non-negative number');
    }

    return { errors, warnings };
  }

  // Image validation
  async validateImageFile(filePath, platforms = ['facebook', 'instagram']) {
    const errors = [];
    const warnings = [];

    try {
      // Check if file exists
      const stats = await fs.stat(filePath);
      const extension = path.extname(filePath).toLowerCase().replace('.', '');

      // Validate for each platform
      for (const platform of platforms) {
        const limits = this.platformLimits[platform];
        if (!limits) {
          errors.push(`Unsupported platform: ${platform}`);
          continue;
        }

        // Format validation
        if (!limits.supportedFormats.includes(extension)) {
          errors.push(`${platform}: Unsupported format "${extension}". Supported: ${limits.supportedFormats.join(', ')}`);
        }

        // File size validation
        if (stats.size > limits.maxFileSize) {
          errors.push(`${platform}: File too large (${this.formatFileSize(stats.size)} > ${this.formatFileSize(limits.maxFileSize)})`);
        }

        // Size warning
        if (stats.size > limits.maxFileSize * 0.8) {
          warnings.push(`${platform}: File size approaching limit (${this.formatFileSize(stats.size)})`);
        }
      }

      // Additional validation with Sharp if available
      try {
        const sharp = require('sharp');
        const metadata = await sharp(filePath).metadata();

        for (const platform of platforms) {
          const limits = this.platformLimits[platform];
          
          // Dimension validation
          if (metadata.width < limits.minImageWidth || metadata.height < limits.minImageHeight) {
            errors.push(`${platform}: Image too small (${metadata.width}x${metadata.height}). Minimum: ${limits.minImageWidth}x${limits.minImageHeight}`);
          }

          if (metadata.width > limits.imageMaxSize || metadata.height > limits.imageMaxSize) {
            warnings.push(`${platform}: Image larger than recommended (${metadata.width}x${metadata.height}). Recommended max: ${limits.imageMaxSize}x${limits.imageMaxSize}`);
          }

          // Instagram aspect ratio validation
          if (platform === 'instagram' && limits.aspectRatios) {
            const aspectRatio = metadata.width / metadata.height;
            if (aspectRatio < limits.aspectRatios.min || aspectRatio > limits.aspectRatios.max) {
              warnings.push(`${platform}: Aspect ratio ${aspectRatio.toFixed(2)} may be cropped. Recommended: ${limits.aspectRatios.min}-${limits.aspectRatios.max}`);
            }
          }
        }
      } catch (sharpError) {
        warnings.push('Could not analyze image dimensions (Sharp not available)');
      }

    } catch (error) {
      errors.push(`Cannot access image file: ${error.message}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  // Text content validation
  validateTextContent(content, platform) {
    const errors = [];
    const warnings = [];

    if (!content || typeof content !== 'string') {
      return {
        isValid: false,
        error: 'Content must be a non-empty string',
        warnings: []
      };
    }

    const limits = this.platformLimits[platform];
    if (!limits) {
      return {
        isValid: false,
        error: `Unsupported platform: ${platform}`,
        warnings: []
      };
    }

    // Length validation
    if (content.length > limits.maxTextLength) {
      errors.push(`Content too long (${content.length}/${limits.maxTextLength} characters)`);
    }

    // Length warning
    if (content.length > limits.maxTextLength * 0.9) {
      warnings.push(`Content approaching character limit (${content.length}/${limits.maxTextLength})`);
    }

    // Hashtag validation
    const hashtags = this.extractHashtags(content);
    if (hashtags.length > limits.maxHashtags) {
      warnings.push(`Too many hashtags (${hashtags.length}/${limits.maxHashtags}). Excess hashtags may not work.`);
    }

    // Platform-specific validations
    if (platform === 'instagram') {
      // Instagram requires at least some content or an image
      if (content.trim().length === 0) {
        warnings.push('Instagram posts with empty captions may have lower engagement');
      }
    }

    return {
      isValid: errors.length === 0,
      error: errors.join('; '),
      warnings
    };
  }

  // DateTime validation
  validateDateTime(dateTime, timezone = 'UTC') {
    const errors = [];
    const warnings = [];

    if (!dateTime) {
      return {
        isValid: false,
        error: 'DateTime is required'
      };
    }

    // Timezone validation
    if (timezone && !this.validTimezones.includes(timezone)) {
      errors.push(`Invalid timezone: ${timezone}`);
    }

    // Parse datetime
    let momentDate;
    let validFormat = false;

    for (const format of this.supportedDateFormats) {
      momentDate = moment.tz(dateTime, format, timezone || 'UTC');
      if (momentDate.isValid()) {
        validFormat = true;
        break;
      }
    }

    if (!validFormat) {
      return {
        isValid: false,
        error: `Invalid datetime format. Supported formats: ${this.supportedDateFormats.slice(0, 3).join(', ')}`
      };
    }

    // Future date validation
    const now = moment().tz(timezone || 'UTC');
    if (momentDate.isBefore(now)) {
      errors.push('Scheduled time must be in the future');
    }

    // Near future warning
    if (momentDate.isBefore(now.clone().add(5, 'minutes'))) {
      warnings.push('Scheduled time is very soon (less than 5 minutes)');
    }

    // Far future warning
    if (momentDate.isAfter(now.clone().add(1, 'year'))) {
      warnings.push('Scheduled time is more than 1 year in the future');
    }

    return {
      isValid: errors.length === 0,
      error: errors.join('; '),
      warning: warnings.join('; '),
      parsedDate: momentDate
    };
  }

  // Platform validation
  validatePlatforms(platforms) {
    const validPlatforms = ['facebook', 'instagram'];
    
    if (!Array.isArray(platforms)) {
      return {
        isValid: false,
        error: 'Platforms must be an array'
      };
    }

    if (platforms.length === 0) {
      return {
        isValid: false,
        error: 'At least one platform must be specified'
      };
    }

    const invalidPlatforms = platforms.filter(p => !validPlatforms.includes(p));
    if (invalidPlatforms.length > 0) {
      return {
        isValid: false,
        error: `Invalid platforms: ${invalidPlatforms.join(', ')}. Valid platforms: ${validPlatforms.join(', ')}`
      };
    }

    return { isValid: true };
  }

  // Meta API response validation
  validateMetaApiResponse(response, operation) {
    const errors = [];
    const warnings = [];

    if (!response) {
      return {
        isValid: false,
        error: 'No response received from Meta API',
        warnings: []
      };
    }

    // Check for API errors
    if (response.error) {
      errors.push(`Meta API Error: ${response.error.message || 'Unknown error'}`);
      if (response.error.code) {
        errors.push(`Error Code: ${response.error.code}`);
      }
    }

    // Operation-specific validation
    switch (operation) {
      case 'post':
        if (!response.id && !response.error) {
          errors.push('Post response missing ID');
        }
        break;
      
      case 'upload':
        if (!response.id && !response.uri && !response.error) {
          errors.push('Upload response missing ID or URI');
        }
        break;
      
      case 'auth':
        if (!response.access_token && !response.id && !response.error) {
          errors.push('Auth response missing access token or user ID');
        }
        break;
    }

    // Rate limiting warnings
    if (response.headers && response.headers['x-app-usage']) {
      try {
        const usage = JSON.parse(response.headers['x-app-usage']);
        if (usage.call_count > 80) {
          warnings.push('API usage high (>80%)');
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  // Utility methods
  extractHashtags(content) {
    const hashtagRegex = /#[a-zA-Z0-9_]+/g;
    return content.match(hashtagRegex) || [];
  }

  extractMentions(content) {
    const mentionRegex = /@[a-zA-Z0-9_.]+/g;
    return content.match(mentionRegex) || [];
  }

  formatFileSize(bytes) {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round(bytes / Math.pow(1024, i) * 100) / 100} ${sizes[i]}`;
  }

  // Comprehensive validation for posting
  async validatePostData(postData) {
    const errors = [];
    const warnings = [];

    // Basic structure
    if (!postData || typeof postData !== 'object') {
      return {
        isValid: false,
        errors: ['Post data must be a valid object'],
        warnings: []
      };
    }

    // Content validation
    if (!postData.content && (!postData.images || postData.images.length === 0)) {
      errors.push('Post must have either content or images');
    }

    // Platform validation
    if (postData.platforms) {
      const platformValidation = this.validatePlatforms(postData.platforms);
      if (!platformValidation.isValid) {
        errors.push(platformValidation.error);
      }

      // Platform-specific requirements
      if (postData.platforms.includes('instagram') && (!postData.images || postData.images.length === 0)) {
        errors.push('Instagram posts require at least one image');
      }
    }

    // Text content validation
    if (postData.content && postData.platforms) {
      for (const platform of postData.platforms) {
        const contentValidation = this.validateTextContent(postData.content, platform);
        if (!contentValidation.isValid) {
          errors.push(`${platform}: ${contentValidation.error}`);
        }
        warnings.push(...contentValidation.warnings);
      }
    }

    // Image validation
    if (postData.images && Array.isArray(postData.images)) {
      for (const imagePath of postData.images) {
        const imageValidation = await this.validateImageFile(imagePath, postData.platforms);
        if (!imageValidation.isValid) {
          errors.push(...imageValidation.errors);
        }
        warnings.push(...imageValidation.warnings);
      }
    }

    // DateTime validation
    if (postData.scheduledTime) {
      const dateValidation = this.validateDateTime(postData.scheduledTime, postData.timezone);
      if (!dateValidation.isValid) {
        errors.push(dateValidation.error);
      }
      if (dateValidation.warning) {
        warnings.push(dateValidation.warning);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  // Get platform limits
  getPlatformLimits(platform) {
    return this.platformLimits[platform] || null;
  }

  getAllPlatformLimits() {
    return this.platformLimits;
  }

  // Schedule generation validation
  validateScheduleGeneration(options) {
    const errors = [];
    const warnings = [];

    // Image count validation
    if (options.imageCount > 100) {
      errors.push(`Too many images (${options.imageCount}). Maximum allowed: 100`);
    }

    if (options.imageCount < 1) {
      errors.push('At least one image is required');
    }

    // Frequency validation
    if (options.frequency && (options.frequency < 1 || options.frequency > 14)) {
      errors.push('Frequency must be between 1 and 14 posts per week');
    }

    if (options.frequency > 7) {
      warnings.push('High frequency (>7 posts/week) may overwhelm your audience');
    }

    // Start date validation
    if (options.startDate) {
      const startMoment = moment(options.startDate);
      if (!startMoment.isValid()) {
        errors.push('Invalid start date format. Use YYYY-MM-DD');
      } else {
        if (startMoment.isBefore(moment().subtract(1, 'day'))) {
          errors.push('Start date cannot be in the past');
        }
        if (startMoment.isAfter(moment().add(2, 'years'))) {
          warnings.push('Start date is more than 2 years in the future');
        }
      }
    }

    // Timezone validation
    if (options.timezone && !moment.tz.names().includes(options.timezone)) {
      errors.push(`Invalid timezone: ${options.timezone}`);
    }

    // Platform validation
    if (options.platforms && Array.isArray(options.platforms)) {
      const validPlatforms = ['facebook', 'instagram'];
      const invalidPlatforms = options.platforms.filter(p => !validPlatforms.includes(p));
      if (invalidPlatforms.length > 0) {
        errors.push(`Invalid platforms: ${invalidPlatforms.join(', ')}`);
      }
    }

    // Duration estimation and warnings
    if (options.imageCount && options.frequency) {
      const estimatedWeeks = Math.ceil(options.imageCount / options.frequency);
      if (estimatedWeeks > 52) {
        warnings.push(`Schedule spans ${estimatedWeeks} weeks (>1 year). Consider increasing frequency`);
      }
      if (estimatedWeeks < 2) {
        warnings.push('Very short schedule duration. Consider decreasing frequency for better engagement');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  // Validate posting time constraints
  validatePostingTime(dateTime, timezone = 'UTC') {
    const errors = [];
    const warnings = [];

    const postMoment = moment.tz(dateTime, timezone);
    if (!postMoment.isValid()) {
      return {
        isValid: false,
        errors: ['Invalid datetime'],
        warnings: []
      };
    }

    const hour = postMoment.hour();
    const dayOfWeek = postMoment.day(); // 0 = Sunday, 6 = Saturday

    // Enforce 10am-8pm constraint
    if (hour < 10 || hour >= 20) {
      errors.push(`Posting time ${postMoment.format('h:mm A')} is outside allowed hours (10am-8pm)`);
    }

    // Social media best practices warnings
    if (hour >= 12 && hour <= 14) {
      // Lunch time - good for engagement
    } else if (hour >= 18 && hour <= 20) {
      // Evening - good for engagement
    } else if (hour >= 10 && hour <= 12) {
      // Morning - decent engagement
    } else if (hour >= 14 && hour <= 18) {
      warnings.push('Afternoon posting may have lower engagement');
    }

    // Weekend vs weekday considerations
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      warnings.push('Weekend posts may have different engagement patterns');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  // Validate image directory for schedule generation
  async validateImageDirectory(imagesDir) {
    const errors = [];
    const warnings = [];

    try {
      const fs = require('fs').promises;
      const path = require('path');

      // Check if directory exists
      const stats = await fs.stat(imagesDir);
      if (!stats.isDirectory()) {
        errors.push('Images path is not a directory');
        return { isValid: false, errors, warnings };
      }

      // Check for images
      const files = await fs.readdir(imagesDir);
      const supportedFormats = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      const imageFiles = files.filter(file => 
        supportedFormats.includes(path.extname(file).toLowerCase())
      );

      if (imageFiles.length === 0) {
        errors.push('No supported image files found in directory');
      } else if (imageFiles.length > 100) {
        errors.push(`Too many images (${imageFiles.length}). Maximum: 100`);
      } else if (imageFiles.length > 50) {
        warnings.push(`Large number of images (${imageFiles.length}). Consider processing in batches`);
      }

      // Check for common issues
      const potentialIssues = files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.tiff', '.bmp', '.svg', '.raw'].includes(ext);
      });

      if (potentialIssues.length > 0) {
        warnings.push(`Found ${potentialIssues.length} files with unsupported formats`);
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        imageCount: imageFiles.length,
        supportedImages: imageFiles,
        unsupportedFiles: potentialIssues
      };

    } catch (error) {
      errors.push(`Cannot access directory: ${error.message}`);
      return { isValid: false, errors, warnings };
    }
  }

  // Validate complete schedule generation request
  async validateScheduleGenerationRequest(options) {
    const allErrors = [];
    const allWarnings = [];

    // Validate basic options
    const basicValidation = this.validateScheduleGeneration(options);
    allErrors.push(...basicValidation.errors);
    allWarnings.push(...basicValidation.warnings);

    // Validate image directory if provided
    if (options.imagesDir) {
      const dirValidation = await this.validateImageDirectory(options.imagesDir);
      allErrors.push(...dirValidation.errors);
      allWarnings.push(...dirValidation.warnings);
      
      if (dirValidation.isValid) {
        // Update options with actual image count
        options.imageCount = dirValidation.imageCount;
        
        // Re-validate with actual image count
        const countValidation = this.validateScheduleGeneration(options);
        allErrors.push(...countValidation.errors);
        allWarnings.push(...countValidation.warnings);
      }
    }

    return {
      isValid: allErrors.length === 0,
      errors: [...new Set(allErrors)], // Remove duplicates
      warnings: [...new Set(allWarnings)],
      imageCount: options.imageCount
    };
  }
}

module.exports = new Validators();