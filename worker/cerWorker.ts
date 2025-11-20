import { setupWorkers } from '../server/services/cerGenerator';
import { Pool } from 'pg';
import { Server } from 'socket.io';
import { createServer } from 'http';

// Create a standalone HTTP server for the worker's socket.io instance
const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Start socket.io server
httpServer.listen(3001, () => {
  console.log('Worker socket.io server listening on port 3001');
});

// Initialize database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Configure Redis for Bull queue
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

// Setup CER generation workers with socket.io for real-time progress updates
const cerQueue = setupWorkers(pool, redisConfig, io);

// Log worker initialization
console.log('CER Worker initialized and processing jobs...');

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Worker shutting down...');
  await cerQueue.close();
  process.exit(0);
});
