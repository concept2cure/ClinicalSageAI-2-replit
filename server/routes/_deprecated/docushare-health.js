import express from 'express';

const router = express.Router();

// DocuShare Health Status Endpoint
router.get('/health', async (req, res) => {
  try {
    const healthCheck = req.app.locals.docuShareHealthCheck;
    const config = req.app.locals.docuShareConfig;

    if (!healthCheck || !config) {
      return res.status(503).json({
        status: 'unavailable',
        message: 'DocuShare integration not initialized',
      });
    }

    const healthStatus = await healthCheck.performHealthCheck();
    const overallStatus = healthCheck.getStatus();

    res.json({
      docuShare: healthStatus,
      system: overallStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Health check endpoint error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
});

// Configuration Validation Endpoint
router.get('/config/validate', async (req, res) => {
  try {
    const config = req.app.locals.docuShareConfig;

    if (!config) {
      return res.status(503).json({
        valid: false,
        message: 'DocuShare configuration not available',
      });
    }

    // Test connection
    const isConnected = await config.validateConnection();

    res.json({
      valid: isConnected,
      config: config.getSanitizedConfig(),
      connectionTest: isConnected ? 'passed' : 'failed',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Configuration validation error:', error);
    res.status(500).json({
      valid: false,
      error: error.message,
    });
  }
});

export default router;
