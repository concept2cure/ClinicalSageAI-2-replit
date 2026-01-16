/**
 * Application Monitoring and Logging Utilities
 *
 * This module provides structured logging, performance tracking, and monitoring
 * capabilities for the application. In production, it can be connected to
 * external monitoring systems like Sentry, Datadog, or similar services.
 */

import { createRequire } from 'module';

// ESM wrapper around the CommonJS implementation.
const require = createRequire(import.meta.url);
const cjs = require('./monitoring.cjs');

export const createLogger = cjs.createLogger;
export const createPerformanceMonitor = cjs.createPerformanceMonitor;
export const createRequestTracker = cjs.createRequestTracker;
export const errorTrackerMiddleware = cjs.errorTrackerMiddleware;

export default cjs;

