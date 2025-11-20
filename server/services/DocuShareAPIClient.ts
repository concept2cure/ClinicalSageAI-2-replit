/**
 * DocuShare API Client Service
 * Handles secure communication with Xerox DocuShare Flex REST API
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('docushare-api');

export interface DocuShareConfig {
  apiUrl: string;
  username?: string;
  password?: string;
  apiKey?: string;
  oemId?: string;
  licenseKey?: string;
}

export interface DocuShareDocument {
  id: string;
  name: string;
  type: string;
  size: number;
  lastModified: Date;
  path: string;
  metadata?: Record<string, any>;
}

export interface DocuShareFolder {
  id: string;
  name: string;
  path: string;
  children?: (DocuShareDocument | DocuShareFolder)[];
}

export class DocuShareAPIClient {
  private client: AxiosInstance;
  private config: DocuShareConfig;
  private sessionToken?: string;

  constructor(config: DocuShareConfig) {
    this.config = config;

    // Initialize axios client with base configuration
    this.client = axios.create({
      baseURL: config.apiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'TrialSage-VaultDMS/1.0',
      },
    });

    // Setup request interceptor for authentication
    this.client.interceptors.request.use(
      config => this.addAuthenticationHeaders(config),
      error => Promise.reject(error)
    );

    // Setup response interceptor for error handling
    this.client.interceptors.response.use(
      response => response,
      error => this.handleResponseError(error)
    );

    logger.info('DocuShare API Client initialized');
  }

  /**
   * Factory method to create client from environment variables
   */
  static fromEnvironment(): DocuShareAPIClient {
    const config: DocuShareConfig = {
      apiUrl: process.env.DOCUSHARE_API_URL || '',
      username: process.env.DOCUSHARE_USERNAME,
      password: process.env.DOCUSHARE_PASSWORD,
      apiKey: process.env.DOCUSHARE_API_KEY,
      oemId: process.env.DOCUSHARE_OEM_ID,
      licenseKey: process.env.DOCUSHARE_LICENSE_KEY,
    };

    if (!config.apiUrl) {
      throw new Error('DOCUSHARE_API_URL environment variable is required');
    }

    return new DocuShareAPIClient(config);
  }

  /**
   * Add authentication headers to requests
   */
  private addAuthenticationHeaders(config: AxiosRequestConfig): AxiosRequestConfig {
    if (!config.headers) {
      config.headers = {};
    }

    // Prefer API key authentication if available
    if (this.config.apiKey) {
      config.headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    // Fallback to session token if available
    else if (this.sessionToken) {
      config.headers['Authorization'] = `Bearer ${this.sessionToken}`;
    }
    // Use basic authentication as last resort
    else if (this.config.username && this.config.password) {
      const credentials = Buffer.from(`${this.config.username}:${this.config.password}`).toString(
        'base64'
      );
      config.headers['Authorization'] = `Basic ${credentials}`;
    }

    // Add OEM ID if configured
    if (this.config.oemId) {
      config.headers['X-DocuShare-OEM-ID'] = this.config.oemId;
    }

    return config;
  }

  /**
   * Handle API response errors
   */
  private handleResponseError(error: any): Promise<never> {
    if (error.response) {
      logger.error('DocuShare API Error:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
      });
    } else if (error.request) {
      logger.error('DocuShare Network Error:', error.message);
    } else {
      logger.error('DocuShare Request Error:', error.message);
    }

    return Promise.reject(error);
  }

  /**
   * Authenticate and obtain session token (if not using API key)
   */
  async authenticate(): Promise<boolean> {
    try {
      if (this.config.apiKey) {
        // API key authentication - verify with a simple API call
        await this.testConnection();
        return true;
      }

      if (!this.config.username || !this.config.password) {
        throw new Error('Username and password required for authentication');
      }

      // Attempt to authenticate and get session token
      const response = await this.client.post('/api/v1/auth/login', {
        username: this.config.username,
        password: this.config.password,
      });

      if (response.data.token) {
        this.sessionToken = response.data.token;
        logger.info('DocuShare authentication successful');
        return true;
      }

      throw new Error('No token received from authentication');
    } catch (error) {
      logger.error('DocuShare authentication failed:', error);
      return false;
    }
  }

  /**
   * Test API connectivity
   */
  async testConnection(): Promise<boolean> {
    try {
      // Attempt a simple API call to verify connectivity
      const response = await this.makeAuthenticatedRequest('GET', '/api/v1/info');
      logger.info('DocuShare connection test successful');
      return true;
    } catch (error) {
      logger.error('DocuShare connection test failed:', error);
      return false;
    }
  }

  /**
   * Make an authenticated request to the DocuShare API
   */
  async makeAuthenticatedRequest(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<any> {
    try {
      const response = await this.client.request({
        method,
        url: endpoint,
        data,
        ...config,
      });

      return response.data;
    } catch (error) {
      logger.error(`DocuShare ${method} ${endpoint} failed:`, error);
      throw error;
    }
  }

  /**
   * Get server information
   */
  async getServerInfo(): Promise<any> {
    return this.makeAuthenticatedRequest('GET', '/api/v1/info');
  }

  /**
   * List root folders (placeholder implementation)
   */
  async listRootFolders(): Promise<DocuShareFolder[]> {
    const response = await this.makeAuthenticatedRequest('GET', '/api/v1/folders');
    return response.folders || [];
  }

  /**
   * Upload document (placeholder implementation)
   */
  async uploadDocument(
    folderId: string,
    filename: string,
    content: Buffer,
    metadata?: Record<string, any>
  ): Promise<DocuShareDocument> {
    const formData = new FormData();
    formData.append('file', new Blob([content]), filename);
    formData.append('folderId', folderId);

    if (metadata) {
      formData.append('metadata', JSON.stringify(metadata));
    }

    return this.makeAuthenticatedRequest('POST', '/api/v1/documents', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  }

  /**
   * Download document (placeholder implementation)
   */
  async downloadDocument(documentId: string): Promise<Buffer> {
    const response = await this.makeAuthenticatedRequest(
      'GET',
      `/api/v1/documents/${documentId}/content`,
      undefined,
      { responseType: 'arraybuffer' }
    );

    return Buffer.from(response);
  }

  /**
   * Search documents (placeholder implementation)
   */
  async searchDocuments(query: string, folderId?: string): Promise<DocuShareDocument[]> {
    const params = new URLSearchParams({ q: query });
    if (folderId) {
      params.append('folderId', folderId);
    }

    const response = await this.makeAuthenticatedRequest(
      'GET',
      `/api/v1/search?${params.toString()}`
    );

    return response.documents || [];
  }

  /**
   * Close session and cleanup
   */
  async disconnect(): Promise<void> {
    if (this.sessionToken) {
      try {
        await this.makeAuthenticatedRequest('POST', '/api/v1/auth/logout');
      } catch (error) {
        logger.warn('Failed to logout from DocuShare:', error);
      }
      this.sessionToken = undefined;
    }
    logger.info('DocuShare API Client disconnected');
  }
}
