const express = require('express');
const PerformanceMonitor = require('../services/performanceMonitor');

const router = express.Router();
const performanceMonitor = new PerformanceMonitor();

// Health check endpoint
router.get('/health', (req, res) => {
  const report = performanceMonitor.getPerformanceReport();
  const status = report.health === 'healthy' ? 200 : report.health === 'degraded' ? 200 : 503;

  res.status(status).json({
    status: report.health,
    timestamp: new Date().toISOString(),
    uptime: report.uptime,
    version: process.env.npm_package_version || '1.0.0',
  });
});

// Detailed metrics endpoint
router.get('/metrics', (req, res) => {
  const report = performanceMonitor.getPerformanceReport();
  res.json(report);
});

// Performance alerts endpoint
router.get('/alerts', (req, res) => {
  const { severity, limit = 50 } = req.query;
  let alerts = performanceMonitor.alerts;

  if (severity) {
    alerts = alerts.filter(alert => alert.severity === severity);
  }

  alerts = alerts.slice(-parseInt(limit));

  res.json({
    alerts,
    total: alerts.length,
  });
});

// Performance dashboard data
router.get('/dashboard', (req, res) => {
  const report = performanceMonitor.getPerformanceReport();

  // Calculate trends
  const trends = {
    requestTrend: calculateTrend('requests'),
    errorTrend: calculateTrend('errors'),
    memoryTrend: calculateTrend('memory'),
    responseTrend: calculateTrend('responseTime'),
  };

  res.json({
    ...report,
    trends,
  });
});

function calculateTrend(metric) {
  // Simplified trend calculation
  // In production, you'd want more sophisticated analysis
  return {
    direction: 'stable', // 'up', 'down', 'stable'
    percentage: 0,
    period: '1h',
  };
}

// Export both router and monitor instance
router.performanceMonitor = performanceMonitor;

module.exports = router;
