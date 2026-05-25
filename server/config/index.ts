/**
 * Consolidated Configuration Index
 * 
 * This barrel file provides a unified entry point for all configuration.
 * 
 * USAGE:
 * ```typescript
 * import { config, docushareConfig, regulatoryConfig } from '@server/config';
 * ```
 */

// Core environment configuration
export { config, default } from './environment';

// Feature-specific configuration
export { default as docushareConfig } from './docushareConfig';
// @ts-ignore — plain JS config module without type declarations
export { default as vectorDbConfig } from './vector_database_config';
// regulatory_config.js exposes named exports only (no default); re-export the
// module namespace so consumers get the full surface under one name.
export * as regulatoryConfig from './regulatory_config';

// Type exports
export type { Environment } from './types';

/**
 * Quick reference for environment variables:
 * 
 * REQUIRED:
 * - DATABASE_URL or DATABASE_NEON_NEW_SECRET
 * - JWT_SECRET_DEV/STAGING/PROD (based on NODE_ENV)
 * 
 * OPTIONAL:
 * - OPENAI_API_KEY - OpenAI API access
 * - PUBMED_API_KEY - PubMed literature search
 * - S3_VAULT_BUCKET_KEY - S3 document storage
 * - DOCUSHARE_* (22 keys) - DocuShare integration
 * 
 * See .env.example for full list with defaults.
 */
