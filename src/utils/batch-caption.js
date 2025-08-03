#!/usr/bin/env node

const path = require('path');
const captionGenerator = require('../services/caption-generator');
const logger = require('./logger');

/**
 * Standalone batch caption generation utility
 * Can be run independently or integrated into the main application
 */
class BatchCaptionProcessor {
  constructor() {
    this.defaultImagesDir = path.join(process.cwd(), 'content', 'images');
    this.defaultOutputDir = path.join(process.cwd(), 'content', 'captions');
  }

  async processDirectory(imagesDir = this.defaultImagesDir, outputDir = this.defaultOutputDir, metadataMap = {}) {
    try {
      logger.info('Starting batch caption processing', { imagesDir, outputDir });

      // Test OpenAI connection first
      const connectionTest = await captionGenerator.testConnection();
      if (!connectionTest) {
        throw new Error('OpenAI connection test failed. Check your API key.');
      }

      // Run batch processing
      const results = await captionGenerator.batchGenerateCaptions(imagesDir, outputDir, metadataMap);

      // Generate summary
      const summary = this.generateSummary(results);
      
      logger.info('Batch caption processing completed', summary);
      
      return {
        results,
        summary
      };

    } catch (error) {
      logger.error('Batch caption processing failed:', error);
      throw error;
    }
  }

  generateSummary(results) {
    const total = results.length;
    const successful = results.filter(r => !r.error).length;
    const failed = results.filter(r => r.error).length;
    
    const totalTokens = results
      .filter(r => r.metadata?.tokensUsed)
      .reduce((sum, r) => sum + r.metadata.tokensUsed, 0);

    const estimatedCost = captionGenerator.estimateCost(successful);

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? (successful / total * 100).toFixed(1) + '%' : '0%',
      totalTokens,
      estimatedCost: estimatedCost.totalCost.toFixed(4),
      processedFiles: results.filter(r => !r.error).map(r => r.image)
    };
  }

  async processWithConfig(configPath) {
    try {
      const config = require(path.resolve(configPath));
      
      const {
        imagesDir = this.defaultImagesDir,
        outputDir = this.defaultOutputDir,
        metadataMap = {}
      } = config;

      return await this.processDirectory(imagesDir, outputDir, metadataMap);

    } catch (error) {
      logger.error('Failed to process with config:', error);
      throw error;
    }
  }

  async processFromSchedule(schedulePath) {
    try {
      const schedule = require(path.resolve(schedulePath));
      
      if (!schedule.posts || !Array.isArray(schedule.posts)) {
        throw new Error('Invalid schedule format');
      }

      const results = [];
      
      for (const post of schedule.posts) {
        if (!post.images || post.images.length === 0) {
          continue;
        }

        if (post.content && post.content.trim() !== '') {
          // Skip posts that already have content
          continue;
        }

        try {
          const imagePath = post.images[0];
          const metadata = post.metadata || {};
          
          const captionResult = await captionGenerator.generateCaption(imagePath, metadata);
          
          results.push({
            postId: post.id,
            imagePath,
            caption: captionResult.caption || captionResult,
            metadata: captionResult.metadata
          });

          logger.info('Generated caption for scheduled post', { 
            postId: post.id, 
            imagePath 
          });

        } catch (error) {
          logger.error('Failed to generate caption for post', { 
            postId: post.id, 
            error: error.message 
          });
          
          results.push({
            postId: post.id,
            error: error.message
          });
        }
      }

      return results;

    } catch (error) {
      logger.error('Failed to process from schedule:', error);
      throw error;
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const processor = new BatchCaptionProcessor();

  try {
    if (args.length === 0) {
      // Default behavior - process images directory
      console.log('Processing images in default directory...');
      const result = await processor.processDirectory();
      console.log('✅ Batch processing completed!');
      console.log('Summary:', result.summary);
      
    } else if (args[0] === '--config' && args[1]) {
      // Process with config file
      console.log(`Processing with config: ${args[1]}`);
      const result = await processor.processWithConfig(args[1]);
      console.log('✅ Batch processing completed!');
      console.log('Summary:', result.summary);
      
    } else if (args[0] === '--schedule' && args[1]) {
      // Process from schedule file
      console.log(`Processing from schedule: ${args[1]}`);
      const results = await processor.processFromSchedule(args[1]);
      console.log('✅ Schedule processing completed!');
      console.log(`Generated captions for ${results.filter(r => !r.error).length} posts`);
      
    } else if (args[0] === '--help') {
      console.log(`
Usage: node batch-caption.js [options]

Options:
  (no args)                   Process all images in content/images/
  --config <path>            Process with configuration file
  --schedule <path>          Generate captions for scheduled posts
  --help                     Show this help message

Examples:
  node batch-caption.js
  node batch-caption.js --config ./caption-config.json
  node batch-caption.js --schedule ./content/schedule.json

Configuration file format:
{
  "imagesDir": "./content/images",
  "outputDir": "./content/captions", 
  "metadataMap": {
    "image1.jpg": {"year": "1980s", "event": "class photo"},
    "image2.jpg": {"year": "1950s", "event": "sports day"}
  }
}
      `);
      
    } else {
      console.error('Invalid arguments. Use --help for usage information.');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run CLI if this file is executed directly
if (require.main === module) {
  main();
}

module.exports = BatchCaptionProcessor;