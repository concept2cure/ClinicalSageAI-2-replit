
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const optimizations = {
  // Clean up temporary files
  cleanupTemp: () => {
    const tempDirs = ['uploads/temp', 'cache', 'logs/temp'];
    tempDirs.forEach(dir => {
      const fullPath = path.join(process.cwd(), dir);
      if (fs.existsSync(fullPath)) {
        try {
          fs.rmSync(fullPath, { recursive: true, force: true });
          logger.info(`✅ Cleaned up ${dir}`);
        } catch (error) {
          logger.info(`⚠️  Could not clean ${dir}: ${error.message}`);
        }
      }
    });
  },

  // Optimize Node.js flags
  getOptimizedFlags: () => {
    return [
      '--max-old-space-size=512',
      '--optimize-for-size',
      '--gc-interval=100',
      '--trace-warnings'
    ];
  },

  // Check database connectivity
  testDbConnection: async () => {
    try {
      const { pool } = require('../server/db');
      await pool.query('SELECT 1');
      logger.info('✅ Database connection successful');
      return true;
    } catch (error) {
      logger.info(`❌ Database connection failed: ${error.message}`);
      return false;
    }
  },

  // Memory usage check
  checkMemoryUsage: () => {
    const usage = process.memoryUsage();
    const targetMB = 400;
    const currentMB = Math.round(usage.heapUsed / 1024 / 1024);
    
    logger.info(`📊 Current memory usage: ${currentMB}MB (Target: ${targetMB}MB)`);
    
    if (currentMB > targetMB) {
      logger.info('⚠️  Memory usage above target');
      return false;
    } else {
      logger.info('✅ Memory usage within target');
      return true;
    }
  }
};

// Main optimization routine
async function runOptimizations() {
  logger.info('🔧 Running performance optimizations...\n');
  
  // Cleanup
  optimizations.cleanupTemp();
  
  // Memory check
  optimizations.checkMemoryUsage();
  
  // Database test
  await optimizations.testDbConnection();
  
  logger.info('\n✨ Optimization complete!');
  logger.info('\nRecommended start command:');
  logger.info(`NODE_OPTIONS="${optimizations.getOptimizedFlags().join(' ')}" tsx server/index.ts`);
}

if (require.main === module) {
  runOptimizations().catch(console.error);
}

module.exports = optimizations;
