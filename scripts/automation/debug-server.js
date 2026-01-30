#!/usr/bin/env node

// Set debug environment variables
process.env.DEBUG = '*';
process.env.NODE_ENV = 'development';

logger.info('🔧 Debug mode enabled with enhanced logging');
logger.info('📊 Environment:', {
  DEBUG: process.env.DEBUG,
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT || 5000,
});
logger.info('🚀 Starting server in debug mode...\n');

// Import and start the server
import('./server/index.js');
