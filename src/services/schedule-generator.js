const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');
const moment = require('moment-timezone');
const logger = require('../utils/logger');

class ScheduleGenerator {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    this.maxImages = 100;
    this.supportedFormats = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    this.postingHours = { start: 10, end: 20 }; // 10am to 8pm
    
    this.systemPrompt = `You are an intelligent social media scheduling assistant for a school alumni association. 

Your task is to create a natural, randomized posting schedule that:
1. Distributes posts across multiple weeks/months
2. Varies posting times within business hours (10am-8pm)
3. Creates realistic gaps between posts (not mechanical)
4. Considers optimal social media posting times
5. Adds some randomness to avoid predictable patterns

You should aim for approximately the requested frequency but add natural variation:
- If they want 3 posts per week, sometimes post 2, sometimes 4
- Vary the days of the week
- Mix morning, afternoon, and evening posts
- Leave some days without posts for natural flow
- Consider weekends vs weekdays for alumni engagement

Respond with a JSON array of scheduling suggestions.`;
  }

  validateConfig() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
  }

  async scanImagesDirectory(imagesDir) {
    try {
      const files = await fs.readdir(imagesDir);
      const imageFiles = files.filter(file => 
        this.supportedFormats.includes(path.extname(file).toLowerCase())
      );

      if (imageFiles.length === 0) {
        throw new Error(`No image files found in ${imagesDir}`);
      }

      if (imageFiles.length > this.maxImages) {
        throw new Error(`Too many images found (${imageFiles.length}). Maximum allowed: ${this.maxImages}`);
      }

      logger.info(`Found ${imageFiles.length} images for scheduling`);
      return imageFiles;

    } catch (error) {
      logger.error('Error scanning images directory:', error);
      throw error;
    }
  }

  async generateSchedulingPattern(imageCount, options = {}) {
    try {
      this.validateConfig();

      const {
        startDate = new Date(),
        frequency = 3, // posts per week
        timezone = 'America/New_York',
        platforms = ['facebook', 'instagram']
      } = options;

      const startMoment = moment.tz(startDate, timezone);
      const weeksNeeded = Math.ceil(imageCount / frequency);

      const prompt = `Generate a natural posting schedule for ${imageCount} alumni photos over approximately ${weeksNeeded} weeks.

Parameters:
- Start date: ${startMoment.format('YYYY-MM-DD')}
- Target frequency: ~${frequency} posts per week (but add natural variation)
- Posting hours: ${this.postingHours.start}:00 - ${this.postingHours.end}:00
- Timezone: ${timezone}
- Total images: ${imageCount}

Create a schedule that feels natural and engaging for alumni, with good variety in:
- Days of the week (mix weekdays and weekends)
- Times of day (morning, afternoon, evening)
- Gaps between posts (avoid mechanical patterns)

Return a JSON array with ${imageCount} entries, each containing:
{
  "dayOffset": <number of days from start date>,
  "hour": <hour in 24h format>,
  "minute": <minute>,
  "reason": "<brief explanation for this timing>"
}

Make it feel human-scheduled, not robotic.`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: this.systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.8,
        max_tokens: 2000
      });

      const schedulePattern = JSON.parse(response.choices[0].message.content);
      
      logger.info('Generated scheduling pattern', { 
        imageCount, 
        frequency, 
        weeksNeeded,
        tokensUsed: response.usage?.total_tokens 
      });

      return schedulePattern;

    } catch (error) {
      logger.error('Failed to generate scheduling pattern:', error);
      throw error;
    }
  }

  async generateImageMetadata(imageFiles, imagesDir) {
    try {
      const metadataMap = {};

      // Analyze image filenames and try to extract metadata
      for (const filename of imageFiles) {
        const metadata = this.extractMetadataFromFilename(filename);
        
        // For demonstration, you might want to add AI-based metadata extraction here
        // by analyzing the actual images, but for now we'll use filename patterns
        
        metadataMap[filename] = metadata;
      }

      logger.info('Generated metadata for images', { count: imageFiles.length });
      return metadataMap;

    } catch (error) {
      logger.error('Failed to generate image metadata:', error);
      throw error;
    }
  }

  extractMetadataFromFilename(filename) {
    const metadata = {};
    const nameLower = filename.toLowerCase();

    // Extract year patterns
    const yearMatch = nameLower.match(/(\d{4}s?|\d{2}s|nineteen[\w]*|twenty[\w]*|early[\s\-_]*\d{4}s?|late[\s\-_]*\d{4}s?)/);
    if (yearMatch) {
      metadata.year = yearMatch[1];
    }

    // Extract event types
    const eventPatterns = {
      'class': 'class photograph',
      'graduation': 'graduation ceremony',
      'sport': 'sports day',
      'play': 'school play',
      'assembly': 'school assembly',
      'team': 'team photo',
      'staff': 'staff photo',
      'prize': 'prize giving',
      'concert': 'school concert',
      'trip': 'school trip'
    };

    for (const [pattern, event] of Object.entries(eventPatterns)) {
      if (nameLower.includes(pattern)) {
        metadata.event = event;
        break;
      }
    }

    // Extract location hints
    const locationPatterns = {
      'hall': 'main hall',
      'playground': 'school playground',
      'field': 'school field',
      'classroom': 'classroom',
      'library': 'school library',
      'gym': 'gymnasium'
    };

    for (const [pattern, location] of Object.entries(locationPatterns)) {
      if (nameLower.includes(pattern)) {
        metadata.location = location;
        break;
      }
    }

    return metadata;
  }

  async generateSchedule(imagesDir, options = {}) {
    try {
      logger.info('Starting schedule generation', { imagesDir, options });

      // Scan for images
      const imageFiles = await this.scanImagesDirectory(imagesDir);

      // Generate scheduling pattern
      const schedulePattern = await this.generateSchedulingPattern(imageFiles.length, options);

      // Generate metadata for images
      const metadataMap = await this.generateImageMetadata(imageFiles, imagesDir);

      // Build the schedule structure
      const schedule = this.buildScheduleStructure(imageFiles, schedulePattern, metadataMap, options);

      logger.info('Schedule generation completed', { 
        totalPosts: schedule.posts.length,
        dateRange: `${schedule.posts[0]?.scheduledTime} to ${schedule.posts[schedule.posts.length - 1]?.scheduledTime}`
      });

      return schedule;

    } catch (error) {
      logger.error('Schedule generation failed:', error);
      throw error;
    }
  }

  buildScheduleStructure(imageFiles, schedulePattern, metadataMap, options) {
    const {
      startDate = new Date(),
      timezone = 'America/New_York',
      platforms = ['facebook', 'instagram']
    } = options;

    const startMoment = moment.tz(startDate, timezone);

    const schedule = {
      settings: {
        timezone,
        retryAttempts: 3,
        retryDelay: 30000,
        enableNotifications: true,
        logLevel: 'info',
        generatedBy: 'schedule-generator',
        generatedAt: new Date().toISOString(),
        totalImages: imageFiles.length
      },
      posts: [],
      metadata: {
        version: '1.0',
        created: new Date().toISOString(),
        author: 'AI Schedule Generator',
        description: `Auto-generated schedule for ${imageFiles.length} alumni images`,
        generationOptions: options
      }
    };

    // Create posts from images and schedule pattern
    imageFiles.forEach((filename, index) => {
      const pattern = schedulePattern[index] || schedulePattern[index % schedulePattern.length];
      const scheduledMoment = startMoment.clone().add(pattern.dayOffset, 'days')
        .hour(pattern.hour)
        .minute(pattern.minute || 0);

      const post = {
        id: `generated_${index + 1}_${filename.split('.')[0]}`,
        generateCaption: true,
        metadata: metadataMap[filename] || {},
        platforms,
        scheduledTime: scheduledMoment.format('YYYY-MM-DDTHH:mm:ss'),
        timezone,
        images: [`content/images/${filename}`],
        priority: 'normal',
        tags: ['alumni', 'memories', 'generated'],
        generationReason: pattern.reason || 'Optimal posting time'
      };

      // Add additional tags based on metadata
      if (post.metadata.event) {
        post.tags.push(post.metadata.event.replace(/\s+/g, '_'));
      }
      if (post.metadata.year) {
        post.tags.push('vintage');
      }

      schedule.posts.push(post);
    });

    // Sort posts by scheduled time
    schedule.posts.sort((a, b) => 
      moment(a.scheduledTime).valueOf() - moment(b.scheduledTime).valueOf()
    );

    return schedule;
  }

  async saveSchedule(schedule, outputPath) {
    try {
      const scheduleJson = JSON.stringify(schedule, null, 2);
      await fs.writeFile(outputPath, scheduleJson, 'utf8');
      
      logger.info('Schedule saved successfully', { 
        outputPath, 
        totalPosts: schedule.posts.length 
      });

      return outputPath;

    } catch (error) {
      logger.error('Failed to save schedule:', error);
      throw error;
    }
  }

  async mergeWithExistingSchedule(newSchedule, existingSchedulePath) {
    try {
      let existingSchedule = { posts: [], recurring: [], templates: {} };

      // Load existing schedule if it exists
      try {
        const existingData = await fs.readFile(existingSchedulePath, 'utf8');
        existingSchedule = JSON.parse(existingData);
      } catch (error) {
        logger.info('No existing schedule found, creating new one');
      }

      // Merge settings (prefer new settings but keep existing if not specified)
      const mergedSchedule = {
        settings: { ...existingSchedule.settings, ...newSchedule.settings },
        posts: [...(existingSchedule.posts || []), ...newSchedule.posts],
        recurring: existingSchedule.recurring || [],
        templates: existingSchedule.templates || {},
        metadata: {
          ...existingSchedule.metadata,
          lastUpdated: new Date().toISOString(),
          totalPosts: (existingSchedule.posts || []).length + newSchedule.posts.length
        }
      };

      // Sort all posts by scheduled time
      mergedSchedule.posts.sort((a, b) => 
        moment(a.scheduledTime).valueOf() - moment(b.scheduledTime).valueOf()
      );

      logger.info('Merged schedules', { 
        existingPosts: existingSchedule.posts?.length || 0,
        newPosts: newSchedule.posts.length,
        totalPosts: mergedSchedule.posts.length
      });

      return mergedSchedule;

    } catch (error) {
      logger.error('Failed to merge schedules:', error);
      throw error;
    }
  }

  estimateGenerationCost(imageCount) {
    // Estimate cost for schedule generation (much cheaper than caption generation)
    const avgTokensPerRequest = 100; // Much smaller than caption generation
    const inputCostPer1000 = 0.00015;
    const outputCostPer1000 = 0.0006;
    
    const totalInputTokens = avgTokensPerRequest * 0.7;
    const totalOutputTokens = avgTokensPerRequest * 0.3;
    
    const inputCost = (totalInputTokens / 1000) * inputCostPer1000;
    const outputCost = (totalOutputTokens / 1000) * outputCostPer1000;
    
    return {
      scheduleGenerationCost: inputCost + outputCost,
      estimatedCaptionCost: imageCount * 0.002, // Approximate per caption
      totalEstimatedCost: (inputCost + outputCost) + (imageCount * 0.002),
      imageCount
    };
  }

  validateScheduleOptions(options) {
    const errors = [];

    if (options.frequency && (options.frequency < 1 || options.frequency > 14)) {
      errors.push('Frequency must be between 1 and 14 posts per week');
    }

    if (options.startDate) {
      const startMoment = moment(options.startDate);
      if (!startMoment.isValid()) {
        errors.push('Invalid start date format');
      }
      if (startMoment.isBefore(moment().subtract(1, 'day'))) {
        errors.push('Start date cannot be in the past');
      }
    }

    if (options.timezone && !moment.tz.names().includes(options.timezone)) {
      errors.push(`Invalid timezone: ${options.timezone}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

module.exports = new ScheduleGenerator();