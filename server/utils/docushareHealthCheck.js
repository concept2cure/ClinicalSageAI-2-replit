/**
 * DocuShare Health Check Utility
 * Monitors DocuShare connection and provides status information
 */

import docuShareConfig from '../config/docushareConfig.js';

class DocuShareHealthCheck {
  constructor() {
    this.config = docuShareConfig.getConfig();
    this.lastCheckTime = null;
    this.isHealthy = false;
    this.errorCount = 0;
    this.maxErrors = 5;

    // Start periodic health checks
    if (this.config.healthCheckInterval > 0) {
      this.startPeriodicCheck();
    }
  }

  async performHealthCheck() {
    try {
      const startTime = Date.now();

      // Test basic connectivity
      const response = await fetch(`${this.config.apiUrl}/health`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'X-OEM-ID': this.config.oemId,
          Accept: 'application/json',
        },
        timeout: this.config.connectionTimeout,
      });

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        this.isHealthy = true;
        this.errorCount = 0;
        this.lastCheckTime = Date.now();

        console.log(`✅ DocuShare health check passed (${responseTime}ms)`);

        return {
          status: 'healthy',
          responseTime,
          timestamp: new Date().toISOString(),
          apiUrl: this.config.apiUrl,
          version: this.config.apiVersion,
        };
      } else {
        throw new Error(`Health check failed: ${response.status}`);
      }
    } catch (error) {
      this.errorCount++;

      if (this.errorCount >= this.maxErrors) {
        this.isHealthy = false;
      }

      console.error(
        `❌ DocuShare health check failed (error ${this.errorCount}/${this.maxErrors}):`,
        error.message
      );

      return {
        status: 'unhealthy',
        error: error.message,
        errorCount: this.errorCount,
        timestamp: new Date().toISOString(),
        apiUrl: this.config.apiUrl,
      };
    }
  }

  startPeriodicCheck() {
    setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheckInterval);

    console.log(
      `🔄 DocuShare health check started (interval: ${this.config.healthCheckInterval}ms)`
    );
  }

  getStatus() {
    return {
      isHealthy: this.isHealthy,
      errorCount: this.errorCount,
      lastCheckTime: this.lastCheckTime,
      config: docuShareConfig.getSanitizedConfig(),
    };
  }
}

// Export singleton instance
const docuShareHealthCheck = new DocuShareHealthCheck();
export default docuShareHealthCheck;
