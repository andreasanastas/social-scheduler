const fs = require('fs').promises;
const path = require('path');
const logger = require('../config/logger');

class FileReaderService {
  constructor() {
    this.postsDir = path.join(process.cwd(), 'content', 'posts');
    this.imagesDir = path.join(process.cwd(), 'content', 'images');
    this.supportedTextFormats = ['.txt', '.md', '.json'];
    this.supportedImageFormats = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  }

  async readTextFile(filename) {
    try {
      const filePath = path.join(this.postsDir, filename);
      
      if (!await this.fileExists(filePath)) {
        throw new Error(`Text file not found: ${filename}`);
      }

      if (!this.isValidTextFormat(filename)) {
        throw new Error(`Unsupported text format: ${filename}`);
      }

      const content = await fs.readFile(filePath, 'utf8');
      const stats = await fs.stat(filePath);

      logger.info(`Read text file: ${filename}`);
      
      return {
        filename,
        path: filePath,
        content: content.trim(),
        size: stats.size,
        lastModified: stats.mtime,
        format: path.extname(filename).toLowerCase()
      };
    } catch (error) {
      logger.error(`Error reading text file ${filename}:`, error);
      throw error;
    }
  }

  async readImageFile(filename) {
    try {
      const filePath = path.join(this.imagesDir, filename);
      
      if (!await this.fileExists(filePath)) {
        throw new Error(`Image file not found: ${filename}`);
      }

      if (!this.isValidImageFormat(filename)) {
        throw new Error(`Unsupported image format: ${filename}`);
      }

      const stats = await fs.stat(filePath);

      logger.info(`Read image file: ${filename}`);
      
      return {
        filename,
        path: filePath,
        size: stats.size,
        lastModified: stats.mtime,
        format: path.extname(filename).toLowerCase(),
        mimeType: this.getMimeType(filename)
      };
    } catch (error) {
      logger.error(`Error reading image file ${filename}:`, error);
      throw error;
    }
  }

  async readScheduleConfig(configPath = 'schedule.json') {
    try {
      const filePath = path.resolve(configPath);
      
      if (!await this.fileExists(filePath)) {
        throw new Error(`Schedule config not found: ${configPath}`);
      }

      const content = await fs.readFile(filePath, 'utf8');
      const config = JSON.parse(content);

      this.validateScheduleConfig(config);

      logger.info(`Read schedule config: ${configPath}`);
      
      return {
        path: filePath,
        config,
        lastModified: (await fs.stat(filePath)).mtime
      };
    } catch (error) {
      if (error instanceof SyntaxError) {
        logger.error(`Invalid JSON in schedule config: ${configPath}`, error);
        throw new Error(`Invalid JSON format in schedule config: ${error.message}`);
      }
      logger.error(`Error reading schedule config ${configPath}:`, error);
      throw error;
    }
  }

  async listPostFiles() {
    try {
      const files = await fs.readdir(this.postsDir);
      const textFiles = files.filter(file => this.isValidTextFormat(file));
      
      logger.info(`Found ${textFiles.length} post files`);
      return textFiles;
    } catch (error) {
      logger.error('Error listing post files:', error);
      throw error;
    }
  }

  async listImageFiles() {
    try {
      const files = await fs.readdir(this.imagesDir);
      const imageFiles = files.filter(file => this.isValidImageFormat(file));
      
      logger.info(`Found ${imageFiles.length} image files`);
      return imageFiles;
    } catch (error) {
      logger.error('Error listing image files:', error);
      throw error;
    }
  }

  async readPostWithImages(postFilename, imageFilenames = []) {
    try {
      const post = await this.readTextFile(postFilename);
      const images = [];

      for (const imageFilename of imageFilenames) {
        try {
          const image = await this.readImageFile(imageFilename);
          images.push(image);
        } catch (error) {
          logger.warn(`Failed to read image ${imageFilename}:`, error.message);
        }
      }

      return {
        post,
        images,
        totalImages: images.length
      };
    } catch (error) {
      logger.error(`Error reading post with images:`, error);
      throw error;
    }
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  isValidTextFormat(filename) {
    const ext = path.extname(filename).toLowerCase();
    return this.supportedTextFormats.includes(ext);
  }

  isValidImageFormat(filename) {
    const ext = path.extname(filename).toLowerCase();
    return this.supportedImageFormats.includes(ext);
  }

  getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  validateScheduleConfig(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('Schedule config must be a valid object');
    }

    if (!Array.isArray(config.posts)) {
      throw new Error('Schedule config must contain a "posts" array');
    }

    for (let i = 0; i < config.posts.length; i++) {
      const post = config.posts[i];
      
      if (!post.content && !post.file) {
        throw new Error(`Post ${i}: Must have either "content" or "file" specified`);
      }

      if (!post.scheduledTime) {
        throw new Error(`Post ${i}: Missing "scheduledTime"`);
      }

      if (!Array.isArray(post.platforms) || post.platforms.length === 0) {
        throw new Error(`Post ${i}: Must specify at least one platform`);
      }

      const validPlatforms = ['facebook', 'instagram'];
      const invalidPlatforms = post.platforms.filter(p => !validPlatforms.includes(p));
      if (invalidPlatforms.length > 0) {
        throw new Error(`Post ${i}: Invalid platforms: ${invalidPlatforms.join(', ')}`);
      }
    }

    logger.info(`Schedule config validated: ${config.posts.length} posts`);
  }
}

module.exports = new FileReaderService();