/**
 * Configuration Type Definitions
 */

export type Environment = 'development' | 'staging' | 'production';

export interface DatabaseConfig {
  url: string;
}

export interface JwtConfig {
  secret: string;
  expiresIn: string;
}

export interface ApiConfig {
  openai: { key: string };
  pubmed: { key: string };
}

export interface StorageConfig {
  s3VaultBucketKey: string;
}

export interface SafetyConfig {
  maxRequestSizeBytes: number;
  rateLimit: {
    windowMs: number;
    max: number;
  };
}

export interface DocuShareConfig {
  enabled: boolean;
  apiUrl?: string;
  apiVersion?: string;
  apiKey?: string;
  oemId?: string;
  tenantIsolation?: boolean;
  maxFileSize?: number;
  connectionTimeout?: number;
}

export interface AppConfig {
  env: Environment;
  isProduction: boolean;
  isStaging: boolean;
  isDevelopment: boolean;
  database: DatabaseConfig;
  jwt: JwtConfig;
  api: ApiConfig;
  storage: StorageConfig;
  safety: SafetyConfig;
  docushare: DocuShareConfig;
}
