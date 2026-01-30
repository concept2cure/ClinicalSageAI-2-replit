/**
 * Metrics Configuration for TrialSage CER Generator
 *
 * This module provides Prometheus metrics endpoints and defines custom metrics
 * for monitoring CER job performance, error rates, and system health.
 */
import client from 'prom-client';
import express from 'express';

// Create a Registry to register metrics
const register = new client.Registry();

// Add default metrics (memory, CPU, etc.)
client.collectDefaultMetrics({ register });

// Custom CER job metrics
const cerJobsTotal = new client.Counter({
  name: 'trialsage_cer_jobs_total',
  help: 'Total number of CER jobs processed',
  labelNames: ['status'],
});

const cerJobDuration = new client.Histogram({
  name: 'trialsage_cer_job_duration_seconds',
  help: 'Duration of CER job processing in seconds',
  buckets: [30, 60, 120, 300, 600, 1200, 1800],
});

const cerJobsActive = new client.Gauge({
  name: 'trialsage_cer_jobs_active',
  help: 'Number of CER jobs currently being processed',
});

const cerJobsQueued = new client.Gauge({
  name: 'trialsage_cer_jobs_queued',
  help: 'Number of CER jobs currently in queue',
});

const cerJobErrors = new client.Counter({
  name: 'trialsage_cer_job_errors',
  help: 'Number of errors encountered during CER job processing',
  labelNames: ['error_type'],
});

// Concept2Cure error metrics
const concept2cureErrors = new client.Counter({
  name: 'concept2cure_errors_total',
  help: 'Number of errors encountered during Concept2Cure operations',
  labelNames: ['operation', 'error_type'],
});

// Register the metrics
register.registerMetric(cerJobsTotal);
register.registerMetric(cerJobDuration);
register.registerMetric(cerJobsActive);
register.registerMetric(cerJobsQueued);
register.registerMetric(cerJobErrors);
register.registerMetric(concept2cureErrors);

// Export metrics for Prometheus scraping
function setupMetricsEndpoint() {
  const metricsApp = express();

  metricsApp.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

  // Add health check endpoint
  metricsApp.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  return metricsApp;
}

export { setupMetricsEndpoint };
export const metrics = {
  cerJobsTotal,
  cerJobDuration,
  cerJobsActive,
  cerJobsQueued,
  cerJobErrors,
  concept2cureErrors,
};
