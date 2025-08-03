# Social Scheduler

A Node.js application for scheduling and automating social media posts to Facebook and Instagram using Meta's Graph API.

## Features

- 📅 **Smart Scheduling**: Schedule posts using cron expressions or specific dates with timezone support
- 🖼️ **Content Processing**: Automatic content optimization for Facebook and Instagram
- 📱 **Meta Integration**: Direct posting to Facebook Pages and Instagram via Graph API
- 📝 **Comprehensive Logging**: Detailed logging with daily rotation and multiple log streams
- ✅ **Validation**: Content, image, and schedule validation before posting
- 🕒 **Timezone Aware**: Global timezone support with optimal posting time suggestions
- 🔄 **Retry Logic**: Intelligent retry mechanisms for failed posts
- 📊 **Health Monitoring**: Built-in health checks and metrics endpoints
- 📋 **Schedule Management**: JSON-based schedule configuration with templates

## Project Structure

```
social-scheduler/
├── package.json              # Dependencies and npm scripts
├── .env                      # Environment variables (template)
├── .gitignore               # Git ignore rules
├── README.md                # Project documentation
├── src/
│   ├── app.js               # Main application entry point
│   ├── config/
│   │   ├── meta-api.js      # Meta API endpoints, limits, and error codes
│   │   └── scheduler.js     # Scheduler settings and cron patterns
│   ├── services/
│   │   ├── content-processor.js  # Content optimization and validation
│   │   ├── file-reader.js        # File and schedule configuration reading
│   │   └── meta-client.js        # Facebook & Instagram API client
│   └── utils/
│       ├── logger.js        # Winston logging with daily rotation
│       └── validators.js    # Comprehensive validation utilities
├── content/
│   ├── posts/               # Text content files (.txt, .md, .json)
│   ├── images/              # Image files for posting
│   └── schedule.json        # Main schedule configuration
└── logs/                    # Application logs (auto-created)
```

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd social-scheduler
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env .env.local
   # Edit .env.local with your Meta API credentials
   ```

4. **Set up Meta API credentials**
   - Create a Facebook App at [developers.facebook.com](https://developers.facebook.com)
   - Get Page access token for Facebook posting
   - Get Instagram Business account access token
   - Add credentials to your `.env` file

## Configuration

### Environment Variables

```env
# Meta API Credentials
FACEBOOK_ACCESS_TOKEN=your_page_access_token
FACEBOOK_PAGE_ID=your_facebook_page_id
INSTAGRAM_ACCESS_TOKEN=your_instagram_access_token

# Application Settings
NODE_ENV=development
PORT=3000
LOG_LEVEL=info
TIMEZONE=America/New_York
```

### Schedule Configuration

Create or modify `content/schedule.json`:

```json
{
  "settings": {
    "timezone": "America/New_York",
    "retryAttempts": 3,
    "enableNotifications": true
  },
  "posts": [
    {
      "id": "morning_post",
      "content": "Good morning! 🌅",
      "platforms": ["facebook", "instagram"],
      "scheduledTime": "2024-12-15T09:00:00",
      "images": ["content/images/morning.jpg"],
      "priority": "high"
    }
  ]
}
```

## Usage

### Running the Application

```bash
# Production mode
npm start

# Development mode (with debug logging)
npm run dev

# Direct execution
node src/app.js
```

### Health Monitoring

The application provides several HTTP endpoints:

- **`http://localhost:3000/health`** - Basic health status
- **`http://localhost:3000/status`** - Detailed application state
- **`http://localhost:3000/metrics`** - Performance metrics

### Content Management

1. **Text Content**: Place `.txt` or `.md` files in `content/posts/`
2. **Images**: Place image files in `content/images/`
3. **Scheduling**: Configure posts in `content/schedule.json`

### Example Content Files

**content/posts/sample_post.txt**
```
🚀 Exciting news! We're launching our new feature today.

✨ What's new:
• Advanced scheduling
• Better analytics
• Improved UI

#ProductLaunch #Innovation
```

## Core Components

### Meta Client (`src/services/meta-client.js`)
- Facebook Graph API v18.0 integration
- Instagram Basic Display API support
- Rate limiting and error handling
- Image upload and post publishing

### Content Processor (`src/services/content-processor.js`)
- Platform-specific content optimization
- Image processing and validation
- Hashtag and mention handling
- Text length and format validation

### File Reader (`src/services/file-reader.js`)
- Reads text content from files
- Validates image files
- Parses schedule.json configuration
- Provides structured data for processing

### Logger (`src/utils/logger.js`)
- Multiple log streams (API, scheduler, performance)
- Daily log rotation with 14-day retention
- Structured logging with metadata
- Console and file output

### Validators (`src/utils/validators.js`)
- Schedule configuration validation
- Content and image validation
- DateTime and timezone validation
- Meta API response validation

## Platform Specifications

### Facebook
- **Text**: Up to 63,206 characters
- **Images**: JPEG, PNG, GIF, WebP (max 100MB)
- **Hashtags**: Up to 30 recommended
- **Rate Limits**: 200 requests/hour

### Instagram
- **Text**: Up to 2,200 characters
- **Images**: JPEG, PNG (max 30MB, requires at least one image)
- **Hashtags**: Up to 30 recommended
- **Aspect Ratios**: 0.8 - 1.91 (4:5 to 16:9)
- **Rate Limits**: 200 requests/hour

## Logging

The application uses Winston with daily rotation:

- **`logs/combined-YYYY-MM-DD.log`** - All log levels
- **`logs/error-YYYY-MM-DD.log`** - Error-only logs
- **`logs/api-YYYY-MM-DD.log`** - API operation logs
- **`logs/scheduler-YYYY-MM-DD.log`** - Job execution logs
- **`logs/performance-YYYY-MM-DD.log`** - Performance metrics

Log files are compressed after rotation and kept for 14 days.

## Development

### Adding New Features

1. **New Platforms**: Extend `meta-client.js` with new API integrations
2. **Content Types**: Add processors to `content-processor.js`
3. **Validators**: Add validation rules to `validators.js`
4. **Scheduling**: Modify cron patterns in `config/scheduler.js`

### Configuration Files

- **`src/config/meta-api.js`**: API endpoints, limits, error codes
- **`src/config/scheduler.js`**: Cron patterns, retry policies, queue settings

### Testing

```bash
# Check application health
curl http://localhost:3000/health

# View detailed status
curl http://localhost:3000/status

# Monitor metrics
curl http://localhost:3000/metrics
```

## Deployment

### Production Setup

1. Set `NODE_ENV=production`
2. Configure proper timezone
3. Set up log rotation monitoring
4. Configure process manager (PM2, systemd, etc.)
5. Set up health check monitoring

### Docker Support

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## Troubleshooting

### Common Issues

1. **API Authentication**: Ensure tokens have proper permissions
2. **Rate Limits**: Monitor `/metrics` endpoint for usage
3. **Image Formats**: Check platform-specific requirements
4. **Timezone Issues**: Validate timezone strings in configuration
5. **Schedule Validation**: Check `schedule.json` format

### Error Codes

The application maps Meta API error codes to actionable messages:
- **190**: Invalid access token - refresh credentials
- **613**: Rate limit exceeded - wait and retry
- **368**: Content rejected - review content guidelines

## Security

- API credentials stored in environment variables
- No sensitive data in logs
- Rate limiting to prevent API abuse
- Input validation and sanitization
- Error handling without data exposure

## License

ISC

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes following the coding standards
4. Add tests if applicable
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review application logs in `logs/` directory
3. Check health endpoints for system status
4. Open an issue with detailed error information