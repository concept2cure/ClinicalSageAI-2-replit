
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
          console.log(`✅ Cleaned up ${dir}`);
        } catch (error) {
          console.log(`⚠️  Could not clean ${dir}: ${error.message}`);
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
      console.log('✅ Database connection successful');
      return true;
    } catch (error) {
      console.log(`❌ Database connection failed: ${error.message}`);
      return false;
    }
  },

  // Memory usage check
  checkMemoryUsage: () => {
    const usage = process.memoryUsage();
    const targetMB = 400;
    const currentMB = Math.round(usage.heapUsed / 1024 / 1024);
    
    console.log(`📊 Current memory usage: ${currentMB}MB (Target: ${targetMB}MB)`);
    
    if (currentMB > targetMB) {
      console.log('⚠️  Memory usage above target');
      return false;
    } else {
      console.log('✅ Memory usage within target');
      return true;
    }
  }
};

// Main optimization routine
async function runOptimizations() {
  console.log('🔧 Running performance optimizations...\n');
  
  // Cleanup
  optimizations.cleanupTemp();
  
  // Memory check
  optimizations.checkMemoryUsage();
  
  // Database test
  await optimizations.testDbConnection();
  
  console.log('\n✨ Optimization complete!');
  console.log('\nRecommended start command:');
  console.log(`NODE_OPTIONS="${optimizations.getOptimizedFlags().join(' ')}" tsx server/index.ts`);
}

if (require.main === module) {
  runOptimizations().catch(console.error);
}

module.exports = optimizations;
