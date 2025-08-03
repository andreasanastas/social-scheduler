#!/usr/bin/env node

const path = require('path');
const moment = require('moment-timezone');
const scheduleGenerator = require('../services/schedule-generator');
const logger = require('./logger');

/**
 * CLI tool for generating posting schedules from image directories
 */
class ScheduleGeneratorCLI {
  constructor() {
    this.defaultImagesDir = path.join(process.cwd(), 'content', 'images');
    this.defaultOutputPath = path.join(process.cwd(), 'content', 'schedule.json');
  }

  async generateSchedule(options = {}) {
    try {
      const {
        imagesDir = this.defaultImagesDir,
        outputPath = this.defaultOutputPath,
        startDate = new Date(),
        frequency = 3,
        timezone = 'America/New_York',
        platforms = ['facebook', 'instagram'],
        merge = false,
        dryRun = false
      } = options;

      console.log('🤖 AI Schedule Generator');
      console.log('========================');
      console.log(`📂 Images directory: ${imagesDir}`);
      console.log(`📅 Start date: ${moment(startDate).format('YYYY-MM-DD')}`);
      console.log(`📊 Target frequency: ~${frequency} posts per week`);
      console.log(`🌍 Timezone: ${timezone}`);
      console.log(`📱 Platforms: ${platforms.join(', ')}`);
      console.log('');

      // Validate options
      const validation = scheduleGenerator.validateScheduleOptions(options);
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      // Estimate costs
      const imageFiles = await scheduleGenerator.scanImagesDirectory(imagesDir);
      const costEstimate = scheduleGenerator.estimateGenerationCost(imageFiles.length);
      
      console.log(`💰 Cost Estimate:`);
      console.log(`   Schedule generation: $${costEstimate.scheduleGenerationCost.toFixed(4)}`);
      console.log(`   Caption generation: $${costEstimate.estimatedCaptionCost.toFixed(4)}`);
      console.log(`   Total estimated: $${costEstimate.totalEstimatedCost.toFixed(4)}`);
      console.log('');

      if (dryRun) {
        console.log('🔍 Dry run mode - no files will be generated');
        console.log(`Would process ${imageFiles.length} images`);
        console.log(`Estimated timespan: ${Math.ceil(imageFiles.length / frequency)} weeks`);
        return;
      }

      // Confirm with user in interactive mode
      if (process.stdin.isTTY && !process.env.CI) {
        const readline = require('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });

        const answer = await new Promise(resolve => {
          rl.question(`Generate schedule for ${imageFiles.length} images? (y/N): `, resolve);
        });
        rl.close();

        if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
          console.log('❌ Schedule generation cancelled');
          return;
        }
      }

      console.log('🚀 Generating schedule...');
      
      // Generate the schedule
      const schedule = await scheduleGenerator.generateSchedule(imagesDir, {
        startDate,
        frequency,
        timezone,
        platforms
      });

      console.log('✅ Schedule generated successfully!');
      console.log(`📋 Created ${schedule.posts.length} posts`);
      console.log(`📅 Date range: ${schedule.posts[0]?.scheduledTime} to ${schedule.posts[schedule.posts.length - 1]?.scheduledTime}`);

      // Handle merging with existing schedule
      let finalSchedule = schedule;
      if (merge) {
        console.log('🔄 Merging with existing schedule...');
        finalSchedule = await scheduleGenerator.mergeWithExistingSchedule(schedule, outputPath);
        console.log(`📊 Total posts after merge: ${finalSchedule.posts.length}`);
      }

      // Save the schedule
      await scheduleGenerator.saveSchedule(finalSchedule, outputPath);
      console.log(`💾 Schedule saved to: ${outputPath}`);

      // Display summary
      this.displaySummary(finalSchedule);

      return finalSchedule;

    } catch (error) {
      logger.error('Schedule generation failed:', error);
      throw error;
    }
  }

  displaySummary(schedule) {
    console.log('\n📊 Schedule Summary:');
    console.log('==================');
    
    const postsByWeek = {};
    const postsByDayOfWeek = {};
    const postsByHour = {};

    schedule.posts.forEach(post => {
      const date = moment(post.scheduledTime);
      const week = date.format('YYYY-[W]WW');
      const dayOfWeek = date.format('dddd');
      const hour = date.hour();

      postsByWeek[week] = (postsByWeek[week] || 0) + 1;
      postsByDayOfWeek[dayOfWeek] = (postsByDayOfWeek[dayOfWeek] || 0) + 1;
      postsByHour[hour] = (postsByHour[hour] || 0) + 1;
    });

    console.log('\n📅 Posts per week:');
    Object.entries(postsByWeek)
      .sort()
      .forEach(([week, count]) => {
        console.log(`   ${week}: ${count} posts`);
      });

    console.log('\n📆 Posts by day of week:');
    Object.entries(postsByDayOfWeek)
      .sort((a, b) => moment().day(a[0]).valueOf() - moment().day(b[0]).valueOf())
      .forEach(([day, count]) => {
        console.log(`   ${day}: ${count} posts`);
      });

    console.log('\n🕐 Posts by hour:');
    Object.entries(postsByHour)
      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
      .forEach(([hour, count]) => {
        const time12 = moment().hour(hour).format('h A');
        console.log(`   ${time12}: ${count} posts`);
      });

    console.log('\n🎯 Next actions:');
    console.log('   1. Review the generated schedule in content/schedule.json');
    console.log('   2. Adjust any specific dates or times as needed');
    console.log('   3. Run the application to start scheduling posts');
    console.log('   4. Captions will be auto-generated when posts are published');
  }

  async interactive() {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const ask = (question) => new Promise(resolve => {
      rl.question(question, resolve);
    });

    try {
      console.log('🤖 Interactive Schedule Generator');
      console.log('================================\n');

      const imagesDir = await ask(`Images directory [${this.defaultImagesDir}]: `) || this.defaultImagesDir;
      
      const startDateInput = await ask('Start date (YYYY-MM-DD) [today]: ');
      const startDate = startDateInput ? new Date(startDateInput) : new Date();
      
      const frequencyInput = await ask('Posts per week [3]: ');
      const frequency = parseInt(frequencyInput) || 3;
      
      const timezoneInput = await ask('Timezone [America/New_York]: ');
      const timezone = timezoneInput || 'America/New_York';
      
      const platformsInput = await ask('Platforms (comma-separated) [facebook,instagram]: ');
      const platforms = platformsInput ? platformsInput.split(',').map(p => p.trim()) : ['facebook', 'instagram'];
      
      const outputInput = await ask(`Output file [${this.defaultOutputPath}]: `) || this.defaultOutputPath;
      
      const mergeInput = await ask('Merge with existing schedule? (y/N): ');
      const merge = mergeInput.toLowerCase() === 'y' || mergeInput.toLowerCase() === 'yes';

      rl.close();

      console.log('\n');

      await this.generateSchedule({
        imagesDir,
        outputPath: outputInput,
        startDate,
        frequency,
        timezone,
        platforms,
        merge
      });

    } catch (error) {
      rl.close();
      throw error;
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const cli = new ScheduleGeneratorCLI();

  try {
    if (args.length === 0 || args.includes('--interactive')) {
      // Interactive mode
      await cli.interactive();
      
    } else if (args.includes('--help')) {
      console.log(`
AI Schedule Generator
====================

Generate intelligent posting schedules from image directories using OpenAI.

Usage:
  node generate-schedule.js [options]

Options:
  --interactive              Run in interactive mode
  --images-dir <path>        Images directory [content/images]
  --output <path>            Output schedule file [content/schedule.json]
  --start-date <YYYY-MM-DD>  Start date [today]
  --frequency <number>       Posts per week [3]
  --timezone <tz>            Timezone [America/New_York]
  --platforms <list>         Platforms (facebook,instagram) [facebook,instagram]
  --merge                    Merge with existing schedule
  --dry-run                  Show what would be generated without creating files
  --help                     Show this help

Examples:
  node generate-schedule.js --interactive
  node generate-schedule.js --images-dir ./alumni-photos --frequency 4
  node generate-schedule.js --start-date 2024-01-15 --timezone Europe/London
  node generate-schedule.js --dry-run --frequency 2

Features:
  🤖 AI-powered natural scheduling patterns
  📅 Randomized posting times (10am-8pm)
  🎯 Smart frequency distribution
  🏷️ Automatic metadata extraction from filenames
  💰 Cost estimation before generation
  🔄 Merge with existing schedules
  ✅ Built-in validation and guardrails

The generator uses OpenAI to create natural, varied posting schedules that
feel human-made rather than mechanical. Each image will be scheduled with
auto-caption generation enabled.
      `);
      
    } else {
      // Parse command line arguments
      const options = {};
      
      for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
          case '--images-dir':
            options.imagesDir = args[++i];
            break;
          case '--output':
            options.outputPath = args[++i];
            break;
          case '--start-date':
            options.startDate = new Date(args[++i]);
            break;
          case '--frequency':
            options.frequency = parseInt(args[++i]);
            break;
          case '--timezone':
            options.timezone = args[++i];
            break;
          case '--platforms':
            options.platforms = args[++i].split(',').map(p => p.trim());
            break;
          case '--merge':
            options.merge = true;
            break;
          case '--dry-run':
            options.dryRun = true;
            break;
        }
      }

      await cli.generateSchedule(options);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.message.includes('OPENAI_API_KEY')) {
      console.error('\n💡 Make sure to set your OpenAI API key in the .env file:');
      console.error('   OPENAI_API_KEY=your_api_key_here');
    }
    
    process.exit(1);
  }
}

// Run CLI if this file is executed directly
if (require.main === module) {
  main();
}

module.exports = ScheduleGeneratorCLI;