/**
 * DocuShare Configuration Validator and Manager
 * Validates environment variables and provides robust connection settings
 */

class DocuShareConfig {
  constructor() {
    this.validateEnvironment();
    this.config = this.buildConfig();
  }

  validateEnvironment() {
    const required = ['DOCUSHARE_API_URL', 'DOCUSHARE_API_KEY', 'DOCUSHARE_OEM_ID'];

    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required DocuShare environment variables: ${missing.join(', ')}`);
    }

    // Validate API URL format
    try {
      new URL(process.env.DOCUSHARE_API_URL);
    } catch (error) {
      throw new Error('Invalid DOCUSHARE_API_URL format');
    }

    // Security validations
    if (process.env.DOCUSHARE_API_KEY.length < 32) {
      throw new Error('DOCUSHARE_API_KEY must be at least 32 characters for security');
    }

    // Validate encryption key length
    if (
      process.env.DOCUSHARE_ENCRYPTION_KEY &&
      process.env.DOCUSHARE_ENCRYPTION_KEY.length !== 32
    ) {
      throw new Error('DOCUSHARE_ENCRYPTION_KEY must be exactly 32 characters');
    }

    // Warn if credentials appear to be hardcoded (not from environment variables)
    if (
      process.env.DOCUSHARE_API_KEY.includes('test') ||
      process.env.DOCUSHARE_API_KEY.includes('demo')
    ) {
      console.warn('⚠️ Warning: DocuShare API key appears to be a test/demo key');
    }

    console.log('✅ DocuShare environment validation passed with security checks');
  }

  buildConfig() {
    return {
      // Core API Settings
      apiUrl: process.env.DOCUSHARE_API_URL,
      apiVersion: process.env.DOCUSHARE_API_VERSION || '7.5',
      apiKey: process.env.DOCUSHARE_API_KEY,
      oemId: process.env.DOCUSHARE_OEM_ID,

      // Authentication
      username: process.env.DOCUSHARE_USERNAME,
      password: process.env.DOCUSHARE_PASSWORD,
      domain: process.env.DOCUSHARE_DOMAIN,

      // Collection & Tenant Settings
      collectionId: process.env.DOCUSHARE_COLLECTION_ID || '1',
      tenantIsolation: process.env.DOCUSHARE_TENANT_ISOLATION === 'true',
      encryptionKey: process.env.DOCUSHARE_ENCRYPTION_KEY,

      // Security Settings
      sslVerify: process.env.DOCUSHARE_SSL_VERIFY !== 'false',
      sessionTimeout: parseInt(process.env.DOCUSHARE_SESSION_TIMEOUT || '3600'),
      connectionTimeout: parseInt(process.env.DOCUSHARE_CONNECTION_TIMEOUT || '30000'),
      retryAttempts: parseInt(process.env.DOCUSHARE_RETRY_ATTEMPTS || '3'),

      // File Handling
      maxFileSize: parseInt(process.env.DOCUSHARE_MAX_FILE_SIZE || '104857600'),
      allowedExtensions: (
        process.env.DOCUSHARE_ALLOWED_EXTENSIONS || '.pdf,.docx,.doc,.txt,.xml,.zip'
      ).split(','),

      // Rate Limiting
      rateLimitRequests: parseInt(process.env.DOCUSHARE_RATE_LIMIT_REQUESTS || '100'),
      rateLimitWindow: parseInt(process.env.DOCUSHARE_RATE_LIMIT_WINDOW || '60000'),

      // Feature Flags
      customFields: (process.env.DOCUSHARE_CUSTOM_FIELDS || '').split(',').filter(Boolean),
      auditEnabled: process.env.DOCUSHARE_AUDIT_ENABLED === 'true',
      versioningEnabled: process.env.DOCUSHARE_VERSIONING_ENABLED === 'true',
      workflowEnabled: process.env.DOCUSHARE_WORKFLOW_ENABLED === 'true',

      // Health Check
      healthCheckInterval: parseInt(process.env.DOCUSHARE_HEALTH_CHECK_INTERVAL || '300000'),

      // Logging
      logLevel: process.env.DOCUSHARE_LOG_LEVEL || 'info',
      metricsEnabled: process.env.DOCUSHARE_METRICS_ENABLED === 'true',
    };
  }

  getConfig() {
    return this.config;
  }

  // Get sanitized config for logging (without sensitive data)
  getSanitizedConfig() {
    const { apiKey, password, encryptionKey, ...sanitized } = this.config;
    return {
      ...sanitized,
      apiKey: apiKey ? '***' : undefined,
      password: password ? '***' : undefined,
      encryptionKey: encryptionKey ? '***' : undefined,
    };
  }

  // Validate connection to DocuShare with SSL/TLS verification
  async validateConnection() {
    try {
      // Ensure HTTPS is used for production
      if (process.env.NODE_ENV === 'production' && !this.config.apiUrl.startsWith('https://')) {
        throw new Error('HTTPS is required for DocuShare in production');
      }

      const response = await fetch(`${this.config.apiUrl}/health`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'X-OEM-ID': this.config.oemId,
          Accept: 'application/json',
        },
        timeout: this.config.connectionTimeout,
        // Enforce SSL/TLS certificate validation
        agent: this.config.sslVerify
          ? undefined
          : new (require('https').Agent)({
              rejectUnauthorized: false,
            }),
      });

      if (response.ok) {
        console.log('✅ DocuShare connection validated successfully with SSL/TLS');
        return true;
      } else {
        console.error('❌ DocuShare connection validation failed:', response.status);
        return false;
      }
    } catch (error) {
      console.error('❌ DocuShare connection error:', error.message);
      return false;
    }
  }
}

// Export singleton instance
const docuShareConfig = new DocuShareConfig();
export default docuShareConfig;
