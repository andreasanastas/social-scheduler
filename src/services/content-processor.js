const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../config/logger');

class ContentProcessor {
  constructor() {
    this.platformLimits = {
      facebook: {
        maxTextLength: 63206,
        maxHashtags: 30,
        imageMaxSize: 4096, // pixels
        supportedFormats: ['jpeg', 'png', 'gif', 'webp'],
        maxFileSize: 100 * 1024 * 1024 // 100MB
      },
      instagram: {
        maxTextLength: 2200,
        maxHashtags: 30,
        imageMaxSize: 1080, // pixels
        supportedFormats: ['jpeg', 'png'],
        maxFileSize: 30 * 1024 * 1024, // 30MB
        aspectRatios: {
          min: 0.8, // 4:5
          max: 1.91 // 16:9
        }
      }
    };

    this.outputDir = path.join(process.cwd(), 'content', 'images', 'processed');
  }

  async ensureOutputDir() {
    try {
      await fs.mkdir(this.outputDir, { recursive: true });
    } catch (error) {
      logger.error('Error creating output directory:', error);
      throw error;
    }
  }

  async processContent(content, imagePaths = [], platforms = ['facebook', 'instagram']) {
    try {
      logger.info('Processing content for platforms:', platforms);

      const processedContent = {};

      for (const platform of platforms) {
        const platformContent = await this.processPlatformContent(
          content,
          imagePaths,
          platform
        );
        processedContent[platform] = platformContent;
      }

      return processedContent;
    } catch (error) {
      logger.error('Content processing failed:', error);
      throw error;
    }
  }

  async processPlatformContent(content, imagePaths, platform) {
    try {
      // Validate platform
      if (!this.platformLimits[platform]) {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      const limits = this.platformLimits[platform];

      // Process text content
      const processedText = this.processTextContent(content, platform);
      
      // Validate text length
      this.validateTextLength(processedText, platform);

      // Process images
      const processedImages = [];
      for (const imagePath of imagePaths) {
        const processedImage = await this.processImage(imagePath, platform);
        processedImages.push(processedImage);
      }

      // Validate hashtags
      const hashtagCount = this.countHashtags(processedText);
      if (hashtagCount > limits.maxHashtags) {
        logger.warn(`${platform}: Too many hashtags (${hashtagCount}/${limits.maxHashtags})`);
      }

      return {
        platform,
        content: processedText,
        images: processedImages,
        metadata: {
          textLength: processedText.length,
          hashtagCount,
          mentionCount: this.countMentions(processedText),
          imageCount: processedImages.length
        }
      };
    } catch (error) {
      logger.error(`Platform content processing failed for ${platform}:`, error);
      throw error;
    }
  }

  processTextContent(content, platform) {
    if (!content) return '';

    let processedContent = content.trim();

    // Process hashtags
    processedContent = this.processHashtags(processedContent, platform);

    // Process mentions
    processedContent = this.processMentions(processedContent, platform);

    // Platform-specific text processing
    if (platform === 'instagram') {
      // Instagram-specific processing
      processedContent = this.optimizeForInstagram(processedContent);
    } else if (platform === 'facebook') {
      // Facebook-specific processing
      processedContent = this.optimizeForFacebook(processedContent);
    }

    return processedContent;
  }

  processHashtags(content, platform) {
    // Extract and validate hashtags
    const hashtagRegex = /#[a-zA-Z0-9_]+/g;
    const hashtags = content.match(hashtagRegex) || [];

    // Platform-specific hashtag processing
    if (platform === 'instagram') {
      // Instagram prefers hashtags at the end
      const contentWithoutHashtags = content.replace(hashtagRegex, '').trim();
      const cleanHashtags = hashtags.map(tag => tag.toLowerCase()).slice(0, 30);
      
      if (cleanHashtags.length > 0) {
        return `${contentWithoutHashtags}\n\n${cleanHashtags.join(' ')}`;
      }
      return contentWithoutHashtags;
    }

    return content; // Facebook handles hashtags inline
  }

  processMentions(content, platform) {
    // Extract mentions
    const mentionRegex = /@[a-zA-Z0-9_.]+/g;
    const mentions = content.match(mentionRegex) || [];

    if (platform === 'facebook') {
      // Facebook mentions need to be converted to page IDs
      // This is a placeholder - actual implementation would require page ID lookup
      logger.info(`Found ${mentions.length} mentions for Facebook`);
    } else if (platform === 'instagram') {
      // Instagram mentions work with usernames
      logger.info(`Found ${mentions.length} mentions for Instagram`);
    }

    return content;
  }

  optimizeForInstagram(content) {
    // Instagram-specific optimizations
    
    // Break up long paragraphs for better readability
    const paragraphs = content.split('\n\n');
    const optimizedParagraphs = paragraphs.map(paragraph => {
      if (paragraph.length > 150) {
        // Add line breaks for readability
        return paragraph.replace(/\. /g, '.\n');
      }
      return paragraph;
    });

    return optimizedParagraphs.join('\n\n');
  }

  optimizeForFacebook(content) {
    // Facebook-specific optimizations
    
    // Facebook handles longer content better, minimal processing needed
    return content;
  }

  async processImage(imagePath, platform) {
    try {
      await this.ensureOutputDir();
      
      const limits = this.platformLimits[platform];
      const filename = path.basename(imagePath, path.extname(imagePath));
      const outputPath = path.join(this.outputDir, `${filename}_${platform}.jpg`);

      // Get image metadata
      const metadata = await sharp(imagePath).metadata();
      
      // Validate file size
      const stats = await fs.stat(imagePath);
      if (stats.size > limits.maxFileSize) {
        throw new Error(`Image too large: ${stats.size} bytes > ${limits.maxFileSize} bytes`);
      }

      // Validate format
      if (!limits.supportedFormats.includes(metadata.format)) {
        throw new Error(`Unsupported format for ${platform}: ${metadata.format}`);
      }

      let sharpInstance = sharp(imagePath);

      // Platform-specific processing
      if (platform === 'instagram') {
        sharpInstance = await this.processInstagramImage(sharpInstance, metadata);
      } else if (platform === 'facebook') {
        sharpInstance = await this.processFacebookImage(sharpInstance, metadata);
      }

      // Apply final optimizations
      await sharpInstance
        .jpeg({ quality: 85, progressive: true })
        .toFile(outputPath);

      logger.info(`Image processed for ${platform}: ${outputPath}`);

      return {
        originalPath: imagePath,
        processedPath: outputPath,
        platform,
        metadata: {
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
          size: stats.size
        }
      };
    } catch (error) {
      logger.error(`Image processing failed for ${platform}:`, error);
      throw error;
    }
  }

  async processInstagramImage(sharpInstance, metadata) {
    const limits = this.platformLimits.instagram;
    const aspectRatio = metadata.width / metadata.height;

    // Check aspect ratio
    if (aspectRatio < limits.aspectRatios.min || aspectRatio > limits.aspectRatios.max) {
      logger.warn(`Instagram: Aspect ratio ${aspectRatio.toFixed(2)} may not be optimal`);
    }

    // Resize if too large
    if (metadata.width > limits.imageMaxSize || metadata.height > limits.imageMaxSize) {
      sharpInstance = sharpInstance.resize(limits.imageMaxSize, limits.imageMaxSize, {
        fit: 'inside',
        withoutEnlargement: true
      });
    }

    return sharpInstance;
  }

  async processFacebookImage(sharpInstance, metadata) {
    const limits = this.platformLimits.facebook;

    // Resize if too large
    if (metadata.width > limits.imageMaxSize || metadata.height > limits.imageMaxSize) {
      sharpInstance = sharpInstance.resize(limits.imageMaxSize, limits.imageMaxSize, {
        fit: 'inside',
        withoutEnlargement: true
      });
    }

    return sharpInstance;
  }

  validateTextLength(content, platform) {
    const limits = this.platformLimits[platform];
    
    if (content.length > limits.maxTextLength) {
      throw new Error(
        `Content too long for ${platform}: ${content.length}/${limits.maxTextLength} characters`
      );
    }

    if (content.length > limits.maxTextLength * 0.9) {
      logger.warn(
        `Content approaching limit for ${platform}: ${content.length}/${limits.maxTextLength} characters`
      );
    }
  }

  countHashtags(content) {
    const hashtags = content.match(/#[a-zA-Z0-9_]+/g) || [];
    return hashtags.length;
  }

  countMentions(content) {
    const mentions = content.match(/@[a-zA-Z0-9_.]+/g) || [];
    return mentions.length;
  }

  async validateContent(content, imagePaths = [], platforms = ['facebook', 'instagram']) {
    const validation = {
      isValid: true,
      errors: [],
      warnings: []
    };

    try {
      for (const platform of platforms) {
        const limits = this.platformLimits[platform];

        // Validate text
        if (content && content.length > limits.maxTextLength) {
          validation.errors.push(
            `${platform}: Text too long (${content.length}/${limits.maxTextLength})`
          );
          validation.isValid = false;
        }

        // Validate hashtags
        const hashtagCount = this.countHashtags(content || '');
        if (hashtagCount > limits.maxHashtags) {
          validation.warnings.push(
            `${platform}: Too many hashtags (${hashtagCount}/${limits.maxHashtags})`
          );
        }

        // Validate images
        for (const imagePath of imagePaths) {
          try {
            const stats = await fs.stat(imagePath);
            if (stats.size > limits.maxFileSize) {
              validation.errors.push(
                `${platform}: Image too large (${stats.size}/${limits.maxFileSize} bytes)`
              );
              validation.isValid = false;
            }

            const metadata = await sharp(imagePath).metadata();
            if (!limits.supportedFormats.includes(metadata.format)) {
              validation.errors.push(
                `${platform}: Unsupported image format (${metadata.format})`
              );
              validation.isValid = false;
            }
          } catch (error) {
            validation.errors.push(`${platform}: Cannot read image ${imagePath}`);
            validation.isValid = false;
          }
        }

        // Instagram-specific validations
        if (platform === 'instagram' && imagePaths.length === 0) {
          validation.errors.push('Instagram: At least one image is required');
          validation.isValid = false;
        }
      }
    } catch (error) {
      validation.errors.push(`Validation error: ${error.message}`);
      validation.isValid = false;
    }

    return validation;
  }

  getPlatformLimits(platform) {
    return this.platformLimits[platform] || null;
  }

  getAllPlatformLimits() {
    return this.platformLimits;
  }
}

module.exports = new ContentProcessor();