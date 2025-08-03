const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class CaptionGenerator {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    this.systemPrompt = `You are a social-media caption writer for a junior & senior school alumni association. When given an image and (optionally) some metadata about it, you will:

1. Briefly describe what's in the photo (e.g. class group, sports day).
2. Mention the era or year if provided.
3. Invite alumni to recognize themselves or share memories ("Does anyone recognize themselves?", "Tell us your memories!").
4. Keep it friendly and engaging—feel free to sprinkle in 1–2 emojis.
5. Do NOT invent any names, teachers, places or dates that you don't actually know. If no specifics are provided, keep it generic.

Example style:
"🎊 This wonderful early-1980s class photo shows Lower One in their crisp uniforms. Does anyone recognise these prim collars or any familiar faces? Let us know your memories below! 👩‍🎓"`;

    this.userTemplate = `[Image attachment]

Metadata (all fields optional; omit if unknown):
• year: {year}
• event: {event}
• teacher: {teacher}
• location: {location}

Please write a 2–3 sentence caption following the guidelines above.`;
  }

  validateConfig() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
  }

  async generateCaption(imagePath, metadata = {}) {
    try {
      this.validateConfig();

      logger.info('Generating caption for image', { imagePath, metadata });

      // Read and encode image
      const imageBuffer = await fs.readFile(imagePath);
      const base64Image = imageBuffer.toString('base64');
      
      // Get image type
      const extension = path.extname(imagePath).toLowerCase();
      const mimeType = this.getMimeType(extension);

      // Build user message with metadata
      const userMessage = this.buildUserMessage(metadata);

      // Call OpenAI API
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: this.systemPrompt
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: userMessage
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`
                }
              }
            ]
          }
        ],
        temperature: 0.7,
        max_tokens: 300
      });

      const caption = response.choices[0].message.content.trim();
      
      logger.info('Caption generated successfully', { 
        imagePath, 
        captionLength: caption.length,
        tokensUsed: response.usage?.total_tokens 
      });

      return {
        caption,
        metadata: {
          tokensUsed: response.usage?.total_tokens,
          model: 'gpt-4o-mini',
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      logger.error('Caption generation failed', { imagePath, error: error.message });
      throw error;
    }
  }

  buildUserMessage(metadata) {
    const {
      year = '',
      event = '',
      teacher = '',
      location = ''
    } = metadata;

    return this.userTemplate
      .replace('{year}', year)
      .replace('{event}', event)
      .replace('{teacher}', teacher)
      .replace('{location}', location);
  }

  getMimeType(extension) {
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };
    return mimeTypes[extension] || 'image/jpeg';
  }

  async batchGenerateCaptions(imagesDir, outputDir, metadataMap = {}) {
    try {
      logger.info('Starting batch caption generation', { imagesDir, outputDir });

      // Ensure output directory exists
      await fs.mkdir(outputDir, { recursive: true });

      // Get all image files
      const files = await fs.readdir(imagesDir);
      const imageFiles = files.filter(file => 
        /\.(jpg|jpeg|png|gif|webp)$/i.test(file)
      );

      if (imageFiles.length === 0) {
        logger.warn('No image files found', { imagesDir });
        return [];
      }

      const results = [];

      for (const filename of imageFiles) {
        try {
          const imagePath = path.join(imagesDir, filename);
          const metadata = metadataMap[filename] || {};

          // Generate caption
          const result = await this.generateCaption(imagePath, metadata);

          // Save caption to file
          const captionFilename = path.parse(filename).name + '.txt';
          const captionPath = path.join(outputDir, captionFilename);
          await fs.writeFile(captionPath, result.caption, 'utf8');

          results.push({
            image: filename,
            captionFile: captionFilename,
            caption: result.caption,
            metadata: result.metadata
          });

          logger.info('Caption saved', { 
            image: filename, 
            captionFile: captionFilename 
          });

          // Add delay to respect rate limits
          await this.delay(1000);

        } catch (error) {
          logger.error('Failed to process image', { 
            filename, 
            error: error.message 
          });
          
          results.push({
            image: filename,
            error: error.message
          });
        }
      }

      logger.info('Batch caption generation completed', { 
        total: imageFiles.length,
        successful: results.filter(r => !r.error).length,
        failed: results.filter(r => r.error).length
      });

      return results;

    } catch (error) {
      logger.error('Batch caption generation failed', { error: error.message });
      throw error;
    }
  }

  async generateCaptionForPost(postConfig) {
    try {
      if (!postConfig.images || postConfig.images.length === 0) {
        throw new Error('No images provided for caption generation');
      }

      // Use the first image for caption generation
      const imagePath = postConfig.images[0];
      
      // Extract metadata from post config
      const metadata = {
        year: postConfig.metadata?.year,
        event: postConfig.metadata?.event,
        teacher: postConfig.metadata?.teacher,
        location: postConfig.metadata?.location
      };

      const result = await this.generateCaption(imagePath, metadata);
      
      logger.info('Caption generated for post', { 
        postId: postConfig.id,
        imagePath 
      });

      return result.caption;

    } catch (error) {
      logger.error('Failed to generate caption for post', { 
        postId: postConfig.id,
        error: error.message 
      });
      throw error;
    }
  }

  async testConnection() {
    try {
      this.validateConfig();
      
      // Test with a simple text completion
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: 'Test connection - respond with "OK"'
          }
        ],
        max_tokens: 10
      });

      const isWorking = response.choices[0].message.content.trim().includes('OK');
      
      logger.info('OpenAI connection test', { success: isWorking });
      
      return isWorking;

    } catch (error) {
      logger.error('OpenAI connection test failed', { error: error.message });
      return false;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Utility method to estimate costs
  estimateCost(imageCount, avgTokensPerRequest = 250) {
    // GPT-4o-mini pricing (approximate)
    const inputCostPer1000 = 0.00015; // $0.00015 per 1K input tokens
    const outputCostPer1000 = 0.0006; // $0.0006 per 1K output tokens
    
    const totalInputTokens = imageCount * avgTokensPerRequest * 0.8; // 80% input
    const totalOutputTokens = imageCount * avgTokensPerRequest * 0.2; // 20% output
    
    const inputCost = (totalInputTokens / 1000) * inputCostPer1000;
    const outputCost = (totalOutputTokens / 1000) * outputCostPer1000;
    
    return {
      totalCost: inputCost + outputCost,
      inputCost,
      outputCost,
      estimatedTokens: avgTokensPerRequest * imageCount
    };
  }
}

module.exports = new CaptionGenerator();