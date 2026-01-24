#!/usr/bin/env node

// Emergency startup fix to bypass WebSocket conflicts
const { exec } = require('child_process');
const net = require('net');

// Kill any process using port 5000
async function killPortProcess(port) {
  return new Promise(resolve => {
    exec(`fuser -k ${port}/tcp 2>/dev/null || true`, () => {
      resolve();
    });
  });
}

// Check if port is free
function checkPort(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

async function startApp() {
  console.log('🔧 Emergency startup fix running...');

  // Kill any process on port 5000
  await killPortProcess(5000);
  await killPortProcess(8080);
  await killPortProcess(3000);

  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Check if port is free
  const portFree = await checkPort(5000);
  console.log(`✅ Port 5000 is ${portFree ? 'free' : 'occupied'}`);

  // Start the app
  console.log('🚀 Starting app...');
  require('./index.ts');
}

startApp().catch(console.error);
