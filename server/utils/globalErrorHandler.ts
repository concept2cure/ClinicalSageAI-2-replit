/**
 * Global Error Handler
 *
 * This module sets up process-level handlers for uncaught exceptions and unhandled promise rejections
 * to prevent the server from crashing in production.
 *
 * CRITICAL STABILITY COMPONENT - DO NOT MODIFY WITHOUT THOROUGH TESTING
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Writes an error to a log file
 */
function logErrorToFile(errorType: string, error: Error): void {
  try {
    // Ensure logs directory exists
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const logFilePath = path.join(logsDir, 'uncaught_errors.log');

    const logEntry =
      `[${new Date().toISOString()}] ${errorType}: ${error.message}\n` +
      `Stack: ${error.stack}\n` +
      '---------------------------------------\n';

    fs.appendFileSync(logFilePath, logEntry);
  } catch (e) {
    console.error('Failed to write to error log file:', e);
  }
}

/**
 * Registers handlers for uncaught exceptions
 */
export function registerGlobalErrorHandlers(): void {
  // Handler for uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    console.error('\n🔴 UNCAUGHT EXCEPTION 🔴');
    console.error(error);

    logErrorToFile('UNCAUGHT_EXCEPTION', error);

    // In development, it may be better to crash to show the exact error
    if (process.env.NODE_ENV === 'development') {
      process.exit(1);
    }

    // In production, we'll log and continue to avoid downtime
    console.warn('Application continuing despite uncaught exception...');
  });

  // Handler for unhandled promise rejections
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    console.error('\n🔴 UNHANDLED PROMISE REJECTION 🔴');
    console.error('Promise:', promise);
    console.error('Reason:', reason);

    const error = reason instanceof Error ? reason : new Error(String(reason));
    logErrorToFile('UNHANDLED_PROMISE_REJECTION', error);

    // In development, it may be better to crash to show the exact error
    if (process.env.NODE_ENV === 'development') {
      process.exit(1);
    }

    // In production, we'll log and continue to avoid downtime
    console.warn('Application continuing despite unhandled promise rejection...');
  });

  // Log that handlers are registered
  console.log('Global error handlers initialized');
}

/**
 * Initializes stability measures for the process
 */
export function initializeStabilityMeasures(): void {
  registerGlobalErrorHandlers();

  // Set a large heap size limit for the application
  if (process.env.NODE_ENV === 'production') {
    try {
      // Increase memory limit to avoid crashes on large operations
      const newMemoryLimit = 4096; // 4GB
      // @ts-ignore - Node.js specific flag that TypeScript doesn't know about
      if (global.gc && process.setHeapSizeLimit) {
        // @ts-ignore
        process.setHeapSizeLimit(newMemoryLimit * 1024 * 1024);
        console.log(`Heap size limit increased to ${newMemoryLimit}MB`);
      }
    } catch (err) {
      console.warn('Failed to set memory limit:', err);
    }
  }
}

export default {
  registerGlobalErrorHandlers,
  initializeStabilityMeasures,
};
