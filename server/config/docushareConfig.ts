/**
 * DocuShare Configuration Management
 * Handles environment-based configuration for DocuShare integration
 */

import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('docushare-config');

export interface DocuShareEnvironmentConfig {
  apiUrl: string;
  username?: string;
  password?: string;
  apiKey?: string;
  oemId?: string;
  licenseKey?: string;
  serverId?: string;
  sslEnabled: boolean;
  timeout: number;
}

export class DocuShareConfigManager {
  private static instance: DocuShareConfigManager;
  private config: DocuShareEnvironmentConfig;

  private constructor() {
    this.config = this.loadConfiguration();
    this.validateConfiguration();
  }

  public static getInstance(): DocuShareConfigManager {
    if (!DocuShareConfigManager.instance) {
      DocuShareConfigManager.instance = new DocuShareConfigManager();
    }
    return DocuShareConfigManager.instance;
  }

  private loadConfiguration(): DocuShareEnvironmentConfig {
    return {
      apiUrl: process.env.DOCUSHARE_API_URL || '',
      username: process.env.DOCUSHARE_USERNAME,
      password: process.env.DOCUSHARE_PASSWORD,
      apiKey: process.env.DOCUSHARE_API_KEY,
      oemId: process.env.DOCUSHARE_OEM_ID,
      licenseKey: process.env.DOCUSHARE_LICENSE_KEY,
      serverId: process.env.DOCUSHARE_SERVER_ID || 'TrialSAGE-DS7',
      sslEnabled: process.env.DOCUSHARE_SSL_ENABLED !== 'false',
      timeout: parseInt(process.env.DOCUSHARE_TIMEOUT || '30000', 10),
    };
  }

  private validateConfiguration(): void {
    const errors: string[] = [];

    if (!this.config.apiUrl) {
      errors.push('DOCUSHARE_API_URL is required');
    }

    // Validate authentication method
    const hasApiKey = !!this.config.apiKey;
    const hasBasicAuth = !!(this.config.username && this.config.password);

    if (!hasApiKey && !hasBasicAuth) {
      errors.push(
        'Either DOCUSHARE_API_KEY or both DOCUSHARE_USERNAME and DOCUSHARE_PASSWORD must be provided'
      );
    }

    if (errors.length > 0) {
      logger.error('DocuShare configuration validation failed:', errors);
      throw new Error(`DocuShare configuration errors: ${errors.join(', ')}`);
    }

    logger.info('DocuShare configuration validated successfully');
  }

  public getConfiguration(): DocuShareEnvironmentConfig {
    return { ...this.config }; // Return a copy to prevent modification
  }

  public getSanitizedConfig(): Partial<DocuShareEnvironmentConfig> {
    return {
      apiUrl: this.config.apiUrl,
      oemId: this.config.oemId,
      serverId: this.config.serverId,
      sslEnabled: this.config.sslEnabled,
      timeout: this.config.timeout,
      // Exclude sensitive information
      username: this.config.username ? '***' : undefined,
      password: this.config.password ? '***' : undefined,
      apiKey: this.config.apiKey ? '***' : undefined,
      licenseKey: this.config.licenseKey ? '***' : undefined,
    };
  }

  public isConfigured(): boolean {
    try {
      this.validateConfiguration();
      return true;
    } catch {
      return false;
    }
  }

  public getRequiredSecrets(): string[] {
    return [
      'DOCUSHARE_API_URL',
      'DOCUSHARE_USERNAME (or DOCUSHARE_API_KEY)',
      'DOCUSHARE_PASSWORD (or DOCUSHARE_API_KEY)',
      'DOCUSHARE_OEM_ID (optional)',
      'DOCUSHARE_LICENSE_KEY (optional)',
      'DOCUSHARE_SERVER_ID (optional, defaults to TrialSAGE-DS7)',
    ];
  }
}

// Export default instance
export default DocuShareConfigManager.getInstance();
