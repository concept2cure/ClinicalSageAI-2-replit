
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
  
  console.log('\n📊 Memory Usage Report:');
  console.log(`🔹 RSS: ${formatBytes(usage.rss)} (Resident Set Size)`);
  console.log(`🔹 Heap Used: ${formatBytes(usage.heapUsed)}`);
  console.log(`🔹 Heap Total: ${formatBytes(usage.heapTotal)}`);
  console.log(`🔹 External: ${formatBytes(usage.external)}`);
  
  const targetMemory = 400 * 1024 * 1024; // 400MB target
  const currentMemory = usage.heapUsed;
  
  if (currentMemory > targetMemory) {
    console.log('⚠️  Memory usage above target (400MB)');
    if (global.gc) {
      console.log('🧹 Running garbage collection...');
      global.gc();
    }
  } else {
    console.log('✅ Memory usage within target range');
  }
  
  console.log('-----------------------------------');
};

// Monitor every 10 seconds if running as main script
if (require.main === module) {
  console.log('🔍 Starting memory monitor...');
  setInterval(monitorMemory, 10000);
  monitorMemory(); // Initial check
}

module.exports = { monitorMemory, formatBytes };
