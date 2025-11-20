const { spawn } = require('child_process');
const fetch = require('node-fetch');
const path = require('path');

class AnalyticsEngineService {
  constructor() {
    this.analyticsPort = process.env.ANALYTICS_PORT || 8001;
    this.baseUrl = `http://0.0.0.0:${this.analyticsPort}`;
    this.serviceProcess = null;
    this.isStarted = false;
  }

  async startService() {
    if (this.isStarted) {
      console.log('[ANALYTICS] Service already running');
      return true;
    }

    try {
      console.log('[ANALYTICS] Starting Python Analytics Engine...');

      const analyticsPath = path.join(__dirname, '../../analytics-engine');

      this.serviceProcess = spawn('python3', ['service_manager.py'], {
        cwd: analyticsPath,
        env: {
          ...process.env,
          ANALYTICS_PORT: this.analyticsPort,
        },
        stdio: 'pipe',
      });

      this.serviceProcess.stdout.on('data', data => {
        console.log(`[ANALYTICS] ${data.toString().trim()}`);
      });

      this.serviceProcess.stderr.on('data', data => {
        console.error(`[ANALYTICS ERROR] ${data.toString().trim()}`);
      });

      this.serviceProcess.on('close', code => {
        console.log(`[ANALYTICS] Service exited with code ${code}`);
        this.isStarted = false;
      });

      // Wait for service to be ready
      await this.waitForService();
      this.isStarted = true;

      console.log(`[ANALYTICS] Python Analytics Engine ready on port ${this.analyticsPort}`);
      return true;
    } catch (error) {
      console.error('[ANALYTICS] Failed to start service:', error);
      return false;
    }
  }

  async waitForService(maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(`${this.baseUrl}/health`, {
          timeout: 1000,
        });
        if (response.ok) {
          return true;
        }
      } catch (error) {
        // Service not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('Analytics service failed to start within timeout');
  }

  async runAnalysis(analysisType, data, options = {}) {
    try {
      const response = await fetch(`${this.baseUrl}/run-analysis-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          analysis_type: analysisType,
          data: data,
          options: options,
        }),
        timeout: 120000, // 2 minute timeout
      });

      if (!response.ok) {
        throw new Error(`Analytics service responded with ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`[ANALYTICS] Analysis failed:`, error);
      throw error;
    }
  }

  async runBatchAnalysis(analyses) {
    try {
      const response = await fetch(`${this.baseUrl}/batch-analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          analyses: analyses,
        }),
        timeout: 300000, // 5 minute timeout for batch
      });

      if (!response.ok) {
        throw new Error(`Batch analysis service responded with ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`[ANALYTICS] Batch analysis failed:`, error);
      throw error;
    }
  }

  async getAnalysisStatus(analysisId) {
    try {
      const response = await fetch(`${this.baseUrl}/analysis-status/${analysisId}`);

      if (!response.ok) {
        throw new Error(`Status check failed with ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`[ANALYTICS] Status check failed:`, error);
      throw error;
    }
  }

  async checkHealth() {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        timeout: 5000,
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  stopService() {
    if (this.serviceProcess) {
      console.log('[ANALYTICS] Stopping Python Analytics Engine...');
      this.serviceProcess.kill('SIGTERM');
      this.isStarted = false;
    }
  }
}

// Create singleton instance
const analyticsEngine = new AnalyticsEngineService();

module.exports = analyticsEngine;
