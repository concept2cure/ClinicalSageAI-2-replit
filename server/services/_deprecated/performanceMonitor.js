const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

class PerformanceMonitor extends EventEmitter {
  constructor() {
    super();
    this.metrics = new Map();
    this.thresholds = {
      responseTime: 5000, // 5 seconds
      memoryUsage: 512 * 1024 * 1024, // 512MB
      cpuUsage: 80, // 80%
      errorRate: 0.05, // 5%
    };
    this.alerts = [];
    this.startTime = Date.now();
    this.requestCount = 0;
    this.errorCount = 0;

    this.startMonitoring();
  }

  startMonitoring() {
    // Monitor every 30 seconds
    setInterval(() => {
      this.collectMetrics();
      this.checkThresholds();
      this.logMetrics();
    }, 30000);

    // Clean up old metrics every hour
    setInterval(() => {
      this.cleanupOldMetrics();
    }, 3600000);
  }

  trackRequest(req, res, next) {
    const startTime = Date.now();
    this.requestCount++;

    res.on('finish', () => {
      const responseTime = Date.now() - startTime;
      const endpoint = `${req.method} ${req.route?.path || req.path}`;

      this.recordMetric('responseTime', endpoint, responseTime);

      if (res.statusCode >= 400) {
        this.errorCount++;
        this.recordMetric('errors', endpoint, 1);
      }

      if (responseTime > this.thresholds.responseTime) {
        this.emit('slowResponse', {
          endpoint,
          responseTime,
          threshold: this.thresholds.responseTime,
        });
      }
    });

    next();
  }

  recordMetric(type, key, value) {
    const timestamp = Date.now();
    const metricKey = `${type}:${key}`;

    if (!this.metrics.has(metricKey)) {
      this.metrics.set(metricKey, []);
    }

    this.metrics.get(metricKey).push({
      value,
      timestamp,
    });
  }

  collectMetrics() {
    // Memory usage
    const memoryUsage = process.memoryUsage();
    this.recordMetric('memory', 'heapUsed', memoryUsage.heapUsed);
    this.recordMetric('memory', 'heapTotal', memoryUsage.heapTotal);
    this.recordMetric('memory', 'rss', memoryUsage.rss);

    // CPU usage
    const cpuUsage = process.cpuUsage();
    this.recordMetric('cpu', 'user', cpuUsage.user);
    this.recordMetric('cpu', 'system', cpuUsage.system);

    // Event loop lag
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to ms
      this.recordMetric('eventLoop', 'lag', lag);
    });

    // Error rate
    const errorRate = this.requestCount > 0 ? this.errorCount / this.requestCount : 0;
    this.recordMetric('errors', 'rate', errorRate);
  }

  checkThresholds() {
    const currentMetrics = this.getCurrentMetrics();

    // Check memory threshold
    if (currentMetrics.memory?.heapUsed > this.thresholds.memoryUsage) {
      this.createAlert('HIGH_MEMORY_USAGE', {
        current: currentMetrics.memory.heapUsed,
        threshold: this.thresholds.memoryUsage,
      });
    }

    // Check error rate
    if (currentMetrics.errors?.rate > this.thresholds.errorRate) {
      this.createAlert('HIGH_ERROR_RATE', {
        current: currentMetrics.errors.rate,
        threshold: this.thresholds.errorRate,
      });
    }
  }

  getCurrentMetrics() {
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    const current = {};

    for (const [key, values] of this.metrics.entries()) {
      const recentValues = values.filter(v => v.timestamp > fiveMinutesAgo);
      if (recentValues.length > 0) {
        const [type, metric] = key.split(':');
        if (!current[type]) current[type] = {};

        const sum = recentValues.reduce((acc, v) => acc + v.value, 0);
        current[type][metric] = sum / recentValues.length;
      }
    }

    return current;
  }

  createAlert(type, data) {
    const alert = {
      id: `${type}_${Date.now()}`,
      type,
      timestamp: new Date().toISOString(),
      data,
      severity: this.getAlertSeverity(type),
    };

    this.alerts.push(alert);
    this.emit('alert', alert);

    // Log critical alerts
    if (alert.severity === 'critical') {
      console.error(`🚨 CRITICAL ALERT: ${type}`, data);
    }
  }

  getAlertSeverity(type) {
    const severityMap = {
      HIGH_MEMORY_USAGE: 'warning',
      HIGH_ERROR_RATE: 'critical',
      SLOW_RESPONSE: 'warning',
      HIGH_CPU_USAGE: 'warning',
    };
    return severityMap[type] || 'info';
  }

  logMetrics() {
    const metrics = this.getCurrentMetrics();
    const logEntry = {
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      requests: {
        total: this.requestCount,
        errors: this.errorCount,
        errorRate: this.requestCount > 0 ? this.errorCount / this.requestCount : 0,
      },
      memory: metrics.memory || {},
      performance: {
        eventLoopLag: metrics.eventLoop?.lag || 0,
      },
    };

    // Write to performance log file
    const logFile = path.join(process.cwd(), 'logs', 'performance.log');
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
  }

  getPerformanceReport() {
    const currentMetrics = this.getCurrentMetrics();
    const uptime = Date.now() - this.startTime;

    return {
      timestamp: new Date().toISOString(),
      uptime,
      requests: {
        total: this.requestCount,
        errors: this.errorCount,
        errorRate: this.requestCount > 0 ? this.errorCount / this.requestCount : 0,
        rps: this.requestCount / (uptime / 1000), // requests per second
      },
      memory: {
        heapUsed: currentMetrics.memory?.heapUsed || 0,
        heapTotal: currentMetrics.memory?.heapTotal || 0,
        rss: currentMetrics.memory?.rss || 0,
      },
      performance: {
        eventLoopLag: currentMetrics.eventLoop?.lag || 0,
      },
      alerts: this.alerts.slice(-10), // Last 10 alerts
      health: this.getHealthStatus(),
    };
  }

  getHealthStatus() {
    const currentMetrics = this.getCurrentMetrics();
    const errorRate = this.requestCount > 0 ? this.errorCount / this.requestCount : 0;

    if (
      errorRate > this.thresholds.errorRate ||
      (currentMetrics.memory?.heapUsed || 0) > this.thresholds.memoryUsage
    ) {
      return 'unhealthy';
    }

    if (
      errorRate > this.thresholds.errorRate * 0.5 ||
      (currentMetrics.memory?.heapUsed || 0) > this.thresholds.memoryUsage * 0.8
    ) {
      return 'degraded';
    }

    return 'healthy';
  }

  cleanupOldMetrics() {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    for (const [key, values] of this.metrics.entries()) {
      const recentValues = values.filter(v => v.timestamp > oneHourAgo);
      this.metrics.set(key, recentValues);
    }

    // Clean up old alerts
    this.alerts = this.alerts.slice(-100); // Keep last 100 alerts
  }
}

module.exports = PerformanceMonitor;
