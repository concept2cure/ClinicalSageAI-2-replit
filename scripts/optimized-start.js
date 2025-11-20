
#!/usr/bin/env node

const { spawn } = require('child_process');
const optimizations = require('./optimize-performance.js');

async function startOptimized() {
  console.log('🚀 TrialSage Optimized Startup');
  console.log('==============================\n');
  
  // Run pre-flight optimizations
  await optimizations.runOptimizations();
  
  // Set optimized Node.js flags
  const nodeFlags = optimizations.getOptimizedFlags();
  
  console.log('\n🎯 Starting server with optimizations...');
  
  // Start the server with optimized settings
  const serverProcess = spawn('tsx', ['server/index.ts'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_OPTIONS: nodeFlags.join(' ')
    }
  });
  
  serverProcess.on('exit', (code) => {
    console.log(`\n📊 Server exited with code: ${code}`);
    process.exit(code);
  });
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    serverProcess.kill('SIGINT');
  });
}

if (require.main === module) {
  startOptimized().catch(console.error);
}
