module.exports = {
  // API Configuration
  api: {
    baseUrl: 'https://graph.facebook.com',
    version: 'v18.0',
    defaultTimeout: 30000, // 30 seconds
    uploadTimeout: 120000, // 2 minutes for image uploads
    
    // API Versions
    versions: {
      current: 'v18.0',
      supported: ['v18.0', 'v17.0', 'v16.0'],
      deprecated: ['v15.0', 'v14.0']
    }
  },

  // OpenAI Configuration
  openai: {
    model: 'gpt-4o-mini',
    maxTokens: 300,
    temperature: 0.7,
    timeout: 60000, // 1 minute
    rateLimitDelay: 1000, // 1 second between requests
    
    // Cost estimation (approximate)
    pricing: {
      inputCostPer1000: 0.00015, // $0.00015 per 1K input tokens
      outputCostPer1000: 0.0006, // $0.0006 per 1K output tokens
      avgTokensPerRequest: 250
    },
    
    // Retry configuration for OpenAI
    retry: {
      maxAttempts: 3,
      baseDelay: 2000, // 2 seconds
      maxDelay: 30000, // 30 seconds
      backoffMultiplier: 2
    }
  },

  // Endpoints
  endpoints: {
    facebook: {
      // Authentication & User Info
      me: '/{version}/me',
      pageInfo: '/{version}/{page-id}',
      pageAccessToken: '/{version}/{page-id}?fields=access_token',
      
      // Publishing
      pageFeed: '/{version}/{page-id}/feed',
      pagePhotos: '/{version}/{page-id}/photos',
      
      // Media Management
      uploadPhoto: '/{version}/{page-id}/photos',
      publishPost: '/{version}/{page-id}/feed',
      
      // Debugging
      debugToken: '/{version}/debug_token',
      appAccessToken: '/{version}/oauth/access_token'
    },
    
    instagram: {
      // Authentication & User Info
      me: '/{version}/me',
      userInfo: '/{version}/{user-id}',
      
      // Content Creation
      mediaContainer: '/{version}/{user-id}/media',
      publishMedia: '/{version}/{user-id}/media_publish',
      
      // Media Management
      mediaObject: '/{version}/{media-id}',
      
      // Business Discovery
      businessDiscovery: '/{version}/{user-id}?fields=business_discovery.username({username})'
    }
  },

  // Platform Limits
  limits: {
    facebook: {
      // Text Content
      maxTextLength: 63206,
      maxHashtags: 30,
      maxMentions: 50,
      
      // Images
      maxImages: 10, // per post
      imageFormats: ['jpeg', 'jpg', 'png', 'gif', 'webp'],
      maxImageSize: 100 * 1024 * 1024, // 100MB
      minImageWidth: 200,
      minImageHeight: 200,
      maxImageWidth: 4096,
      maxImageHeight: 4096,
      recommendedImageWidth: 1200,
      recommendedImageHeight: 630,
      
      // Video (for future use)
      maxVideoSize: 4 * 1024 * 1024 * 1024, // 4GB
      videoFormats: ['mp4', 'mov', 'avi'],
      maxVideoDuration: 240, // 4 minutes in seconds
      
      // API Limits
      rateLimitPerHour: 200,
      rateLimitPerDay: 25000,
      burstLimit: 50 // requests per minute
    },
    
    instagram: {
      // Text Content
      maxTextLength: 2200,
      maxHashtags: 30,
      maxMentions: 20,
      
      // Images (Instagram requires images)
      maxImages: 10, // carousel posts
      imageFormats: ['jpeg', 'jpg', 'png'],
      maxImageSize: 30 * 1024 * 1024, // 30MB
      minImageWidth: 320,
      minImageHeight: 320,
      maxImageWidth: 1080,
      maxImageHeight: 1080,
      recommendedImageWidth: 1080,
      recommendedImageHeight: 1080,
      
      // Aspect Ratios
      aspectRatios: {
        square: 1.0,
        landscape: { min: 1.91, max: 1.91 }, // 16:9
        portrait: { min: 0.8, max: 0.8 }     // 4:5
      },
      
      // Video (for future use)
      maxVideoSize: 100 * 1024 * 1024, // 100MB
      videoFormats: ['mp4', 'mov'],
      maxVideoDuration: 60, // 1 minute in seconds
      minVideoDuration: 3,  // 3 seconds
      
      // API Limits
      rateLimitPerHour: 200,
      rateLimitPerDay: 4800,
      burstLimit: 25 // requests per minute
    }
  },

  // Retry Policies
  retry: {
    // Default retry configuration
    default: {
      maxAttempts: 3,
      baseDelay: 1000, // 1 second
      maxDelay: 30000, // 30 seconds
      backoffMultiplier: 2,
      jitter: true
    },
    
    // Upload-specific retry (more lenient)
    upload: {
      maxAttempts: 5,
      baseDelay: 2000, // 2 seconds
      maxDelay: 60000, // 1 minute
      backoffMultiplier: 2,
      jitter: true
    },
    
    // Rate limit retry (longer delays)
    rateLimit: {
      maxAttempts: 3,
      baseDelay: 60000, // 1 minute
      maxDelay: 300000, // 5 minutes
      backoffMultiplier: 2,
      jitter: false
    },
    
    // Network error retry
    network: {
      maxAttempts: 4,
      baseDelay: 500, // 0.5 seconds
      maxDelay: 10000, // 10 seconds
      backoffMultiplier: 2,
      jitter: true
    }
  },

  // Timeout Settings
  timeouts: {
    // Connection timeout
    connect: 10000, // 10 seconds
    
    // Read timeout
    read: 30000, // 30 seconds
    
    // Upload timeout (images/videos)
    upload: 120000, // 2 minutes
    
    // Authentication timeout
    auth: 15000, // 15 seconds
    
    // Batch operations
    batch: 60000 // 1 minute
  },

  // Error Code Mappings
  errorCodes: {
    // Authentication Errors
    1: {
      type: 'authentication',
      message: 'API Unknown',
      retryable: false,
      action: 'check_api_key'
    },
    2: {
      type: 'authentication', 
      message: 'API Service',
      retryable: true,
      action: 'retry_later'
    },
    4: {
      type: 'rate_limit',
      message: 'Application request limit reached',
      retryable: true,
      action: 'wait_and_retry'
    },
    10: {
      type: 'permission',
      message: 'Permission denied',
      retryable: false,
      action: 'check_permissions'
    },
    17: {
      type: 'rate_limit',
      message: 'User request limit reached',
      retryable: true,
      action: 'wait_and_retry'
    },
    100: {
      type: 'parameter',
      message: 'Invalid parameter',
      retryable: false,
      action: 'fix_parameters'
    },
    190: {
      type: 'authentication',
      message: 'Invalid OAuth access token',
      retryable: false,
      action: 'refresh_token'
    },
    200: {
      type: 'permission',
      message: 'Permissions error',
      retryable: false,
      action: 'check_permissions'
    },
    368: {
      type: 'authentication',
      message: 'The action attempted has been deemed abusive or is otherwise disallowed',
      retryable: false,
      action: 'review_content'
    },
    506: {
      type: 'content',
      message: 'Duplicate status message',
      retryable: false,
      action: 'modify_content'
    },
    613: {
      type: 'rate_limit',
      message: 'Rate limit exceeded',
      retryable: true,
      action: 'wait_and_retry'
    },
    
    // Instagram-specific errors
    24: {
      type: 'content',
      message: 'Too many calls to the same media',
      retryable: true,
      action: 'wait_and_retry'
    },
    36: {
      type: 'content',
      message: 'Invalid image',
      retryable: false,
      action: 'check_image_format'
    },
    9007: {
      type: 'content',
      message: 'Media posted too frequently',
      retryable: true,
      action: 'schedule_later'
    },
    
    // HTTP Status Code Mappings
    400: {
      type: 'client_error',
      message: 'Bad Request',
      retryable: false,
      action: 'check_request_format'
    },
    401: {
      type: 'authentication',
      message: 'Unauthorized',
      retryable: false,
      action: 'check_credentials'
    },
    403: {
      type: 'permission',
      message: 'Forbidden',
      retryable: false,
      action: 'check_permissions'
    },
    404: {
      type: 'not_found',
      message: 'Not Found',
      retryable: false,
      action: 'check_resource_exists'
    },
    429: {
      type: 'rate_limit',
      message: 'Too Many Requests',
      retryable: true,
      action: 'wait_and_retry'
    },
    500: {
      type: 'server_error',
      message: 'Internal Server Error',
      retryable: true,
      action: 'retry_later'
    },
    502: {
      type: 'server_error',
      message: 'Bad Gateway',
      retryable: true,
      action: 'retry_later'
    },
    503: {
      type: 'server_error',
      message: 'Service Unavailable',
      retryable: true,
      action: 'retry_later'
    },
    504: {
      type: 'server_error',
      message: 'Gateway Timeout',
      retryable: true,
      action: 'retry_with_longer_timeout'
    }
  },

  // Content Guidelines
  contentGuidelines: {
    facebook: {
      // Prohibited content types
      prohibited: [
        'spam',
        'misleading_information',
        'hate_speech',
        'violence',
        'adult_content',
        'copyright_violation'
      ],
      
      // Best practices
      recommendations: {
        textLength: 'Under 250 characters for better engagement',
        imageSize: '1200x630 pixels for optimal display',
        hashtagLimit: 'Use 2-5 relevant hashtags maximum',
        postFrequency: 'No more than 5 posts per day'
      }
    },
    
    instagram: {
      // Prohibited content types
      prohibited: [
        'spam',
        'misleading_information',
        'hate_speech',
        'violence',
        'adult_content',
        'copyright_violation',
        'low_quality_images'
      ],
      
      // Best practices
      recommendations: {
        textLength: 'Under 150 characters in first line for preview',
        imageSize: '1080x1080 pixels for square posts',
        hashtagLimit: 'Use 5-15 relevant hashtags',
        postFrequency: 'No more than 3 posts per day',
        aspectRatio: 'Between 0.8 and 1.91 to avoid cropping'
      }
    }
  },

  // Feature Flags
  features: {
    enableRetries: true,
    enableRateLimiting: true,
    enableImageOptimization: true,
    enableContentValidation: true,
    enableDetailedLogging: true,
    enableMetrics: true,
    enableCaching: false // Future feature
  },

  // Development/Testing Configuration
  development: {
    useTestEndpoints: false,
    mockApiResponses: false,
    logAllRequests: true,
    rateLimitBypass: false,
    enableDebugMode: true
  }
};