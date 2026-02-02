import { setupWorkers } from '../server/services/cerGenerator';
import { Pool } from 'pg';
import { Server } from 'socket.io';
import { createServer } from 'http';
import logger from '../server/utils/logger';

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
  logger.info('Worker socket.io server listening on port 3001');
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
logger.info('CER Worker initialized and processing jobs...');

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Worker shutting down...');
  await cerQueue.close();
  process.exit(0);
});
