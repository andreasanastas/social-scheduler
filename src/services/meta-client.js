const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const logger = require('../config/logger');

class MetaClient {
  constructor() {
    this.facebookAccessToken = process.env.FACEBOOK_ACCESS_TOKEN;
    this.facebookPageId = process.env.FACEBOOK_PAGE_ID;
    this.instagramAccessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    this.baseUrl = 'https://graph.facebook.com/v18.0';
    
    // Rate limiting
    this.rateLimits = {
      facebook: { requests: 0, resetTime: Date.now() + 3600000 }, // 1 hour
      instagram: { requests: 0, resetTime: Date.now() + 3600000 }
    };
    this.maxRequestsPerHour = 200;

    this.validateConfig();
  }

  validateConfig() {
    if (!this.facebookAccessToken) {
      logger.warn('Facebook access token not configured');
    }
    if (!this.facebookPageId) {
      logger.warn('Facebook page ID not configured');
    }
    if (!this.instagramAccessToken) {
      logger.warn('Instagram access token not configured');
    }
  }

  async checkRateLimit(platform) {
    const limit = this.rateLimits[platform];
    
    if (Date.now() > limit.resetTime) {
      limit.requests = 0;
      limit.resetTime = Date.now() + 3600000;
    }

    if (limit.requests >= this.maxRequestsPerHour) {
      const waitTime = Math.ceil((limit.resetTime - Date.now()) / 1000 / 60);
      throw new Error(`Rate limit exceeded for ${platform}. Try again in ${waitTime} minutes.`);
    }

    limit.requests++;
  }

  async makeRequest(method, url, data = null, headers = {}) {
    try {
      const config = {
        method,
        url,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      };

      if (data) {
        if (data instanceof FormData) {
          config.data = data;
          config.headers = { ...config.headers, ...data.getHeaders() };
        } else {
          config.data = data;
        }
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      this.handleApiError(error);
    }
  }

  handleApiError(error) {
    if (error.response) {
      const { status, data } = error.response;
      const errorMessage = data.error?.message || data.message || 'Unknown API error';
      
      logger.error(`Meta API Error ${status}:`, {
        message: errorMessage,
        code: data.error?.code,
        type: data.error?.type
      });

      if (status === 401) {
        throw new Error('Authentication failed. Check your access tokens.');
      } else if (status === 403) {
        throw new Error('Permission denied. Check your token permissions.');
      } else if (status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      } else {
        throw new Error(`API Error: ${errorMessage}`);
      }
    } else {
      logger.error('Network error:', error.message);
      throw new Error(`Network error: ${error.message}`);
    }
  }

  async validateFacebookToken() {
    try {
      const url = `${this.baseUrl}/me?access_token=${this.facebookAccessToken}`;
      const response = await this.makeRequest('GET', url);
      logger.info('Facebook token validated:', { userId: response.id, name: response.name });
      return response;
    } catch (error) {
      logger.error('Facebook token validation failed:', error);
      throw new Error('Invalid Facebook access token');
    }
  }

  async validateInstagramToken() {
    try {
      const url = `${this.baseUrl}/me?fields=id,username&access_token=${this.instagramAccessToken}`;
      const response = await this.makeRequest('GET', url);
      logger.info('Instagram token validated:', { userId: response.id, username: response.username });
      return response;
    } catch (error) {
      logger.error('Instagram token validation failed:', error);
      throw new Error('Invalid Instagram access token');
    }
  }

  async getFacebookPageInfo() {
    try {
      const url = `${this.baseUrl}/${this.facebookPageId}?fields=id,name,access_token&access_token=${this.facebookAccessToken}`;
      const response = await this.makeRequest('GET', url);
      
      if (response.access_token) {
        this.pageAccessToken = response.access_token;
        logger.info('Facebook page info retrieved:', { pageId: response.id, name: response.name });
      }
      
      return response;
    } catch (error) {
      logger.error('Failed to get Facebook page info:', error);
      throw error;
    }
  }

  async uploadFacebookImage(imagePath) {
    try {
      await this.checkRateLimit('facebook');
      
      if (!this.pageAccessToken) {
        await this.getFacebookPageInfo();
      }

      const formData = new FormData();
      formData.append('source', fs.createReadStream(imagePath));
      formData.append('published', 'false');
      formData.append('access_token', this.pageAccessToken);

      const url = `${this.baseUrl}/${this.facebookPageId}/photos`;
      const response = await this.makeRequest('POST', url, formData);
      
      logger.info('Facebook image uploaded:', { photoId: response.id });
      return response.id;
    } catch (error) {
      logger.error('Facebook image upload failed:', error);
      throw error;
    }
  }

  async postToFacebook(postData) {
    try {
      await this.checkRateLimit('facebook');
      
      if (!this.pageAccessToken) {
        await this.getFacebookPageInfo();
      }

      let payload = {
        access_token: this.pageAccessToken
      };

      if (postData.imagePath) {
        // Image post
        const photoId = await this.uploadFacebookImage(postData.imagePath);
        payload.attached_media = JSON.stringify([{ media_fbid: photoId }]);
        if (postData.content) {
          payload.message = postData.content;
        }
      } else {
        // Text-only post
        payload.message = postData.content;
      }

      const url = `${this.baseUrl}/${this.facebookPageId}/feed`;
      const response = await this.makeRequest('POST', url, payload);
      
      logger.info('Facebook post published:', { postId: response.id });
      return {
        platform: 'facebook',
        id: response.id,
        success: true
      };
    } catch (error) {
      logger.error('Facebook posting failed:', error);
      throw error;
    }
  }

  async uploadInstagramImage(imagePath, caption = '') {
    try {
      await this.checkRateLimit('instagram');

      // Step 1: Create media container
      const formData = new FormData();
      formData.append('image_url', fs.createReadStream(imagePath));
      if (caption) {
        formData.append('caption', caption);
      }
      formData.append('access_token', this.instagramAccessToken);

      const containerUrl = `${this.baseUrl}/me/media`;
      const containerResponse = await this.makeRequest('POST', containerUrl, formData);
      
      const creationId = containerResponse.id;
      logger.info('Instagram media container created:', { creationId });

      // Step 2: Publish the media
      const publishPayload = {
        creation_id: creationId,
        access_token: this.instagramAccessToken
      };

      const publishUrl = `${this.baseUrl}/me/media_publish`;
      const publishResponse = await this.makeRequest('POST', publishUrl, publishPayload);
      
      logger.info('Instagram media published:', { mediaId: publishResponse.id });
      return publishResponse.id;
    } catch (error) {
      logger.error('Instagram image upload failed:', error);
      throw error;
    }
  }

  async postToInstagram(postData) {
    try {
      await this.checkRateLimit('instagram');

      if (!postData.imagePath) {
        throw new Error('Instagram requires an image for posting');
      }

      const mediaId = await this.uploadInstagramImage(postData.imagePath, postData.content);
      
      return {
        platform: 'instagram',
        id: mediaId,
        success: true
      };
    } catch (error) {
      logger.error('Instagram posting failed:', error);
      throw error;
    }
  }

  async postToPlatform(platform, postData) {
    try {
      logger.info(`Starting ${platform} post`, { 
        hasImage: !!postData.imagePath,
        contentLength: postData.content?.length || 0
      });

      let result;
      switch (platform) {
        case 'facebook':
          result = await this.postToFacebook(postData);
          break;
        case 'instagram':
          result = await this.postToInstagram(postData);
          break;
        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }

      logger.info(`${platform} post successful`, result);
      return result;
    } catch (error) {
      logger.error(`${platform} post failed:`, error);
      throw error;
    }
  }

  async validateConnection(platform) {
    try {
      switch (platform) {
        case 'facebook':
          await this.validateFacebookToken();
          await this.getFacebookPageInfo();
          break;
        case 'instagram':
          await this.validateInstagramToken();
          break;
        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }
      
      logger.info(`${platform} connection validated`);
      return true;
    } catch (error) {
      logger.error(`${platform} connection validation failed:`, error);
      return false;
    }
  }

  getRateLimitStatus() {
    const status = {};
    for (const [platform, limit] of Object.entries(this.rateLimits)) {
      const remaining = this.maxRequestsPerHour - limit.requests;
      const resetIn = Math.max(0, Math.ceil((limit.resetTime - Date.now()) / 1000 / 60));
      
      status[platform] = {
        requestsUsed: limit.requests,
        requestsRemaining: remaining,
        resetInMinutes: resetIn
      };
    }
    return status;
  }
}

module.exports = new MetaClient();