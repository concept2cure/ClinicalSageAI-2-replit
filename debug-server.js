#!/usr/bin/env node

// Set debug environment variables
process.env.DEBUG = '*';
process.env.NODE_ENV = 'development';

console.log('🔧 Debug mode enabled with enhanced logging');
console.log('📊 Environment:', {
  DEBUG: process.env.DEBUG,
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT || 5000,
});
console.log('🚀 Starting server in debug mode...\n');

// Import and start the server
import('./server/index.js');
