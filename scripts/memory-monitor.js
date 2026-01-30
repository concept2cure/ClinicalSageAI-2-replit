
#!/usr/bin/env node

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const monitorMemory = () => {
  const usage = process.memoryUsage();
  
  logger.info('\n📊 Memory Usage Report:');
  logger.info(`🔹 RSS: ${formatBytes(usage.rss)} (Resident Set Size)`);
  logger.info(`🔹 Heap Used: ${formatBytes(usage.heapUsed)}`);
  logger.info(`🔹 Heap Total: ${formatBytes(usage.heapTotal)}`);
  logger.info(`🔹 External: ${formatBytes(usage.external)}`);
  
  const targetMemory = 400 * 1024 * 1024; // 400MB target
  const currentMemory = usage.heapUsed;
  
  if (currentMemory > targetMemory) {
    logger.info('⚠️  Memory usage above target (400MB)');
    if (global.gc) {
      logger.info('🧹 Running garbage collection...');
      global.gc();
    }
  } else {
    logger.info('✅ Memory usage within target range');
  }
  
  logger.info('-----------------------------------');
};

// Monitor every 10 seconds if running as main script
if (require.main === module) {
  logger.info('🔍 Starting memory monitor...');
  setInterval(monitorMemory, 10000);
  monitorMemory(); // Initial check
}

module.exports = { monitorMemory, formatBytes };
