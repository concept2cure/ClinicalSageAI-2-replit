/**
 * Database Index Optimizer
 *
 * This module creates and manages database indexes to optimize tenant query performance.
 * It ensures that all tenant-specific tables have appropriate indexes for organization_id
 * and other frequently queried columns.
 */
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('index-optimizer');

/**
 * Tables that need organization_id indexes for tenant isolation
 */
const TENANT_TABLES = [
  'organizations',
  'users',
  'organization_users',
  'ctq_factors',
  'quality_management_plans',
  'qmp_section_gating',
  'qmp_traceability',
  'cer_projects',
  'cer_documents',
  'cer_approvals',
];

/**
 * Additional column indexes for frequently queried fields
 */
const COLUMN_INDEXES = [
  { table: 'ctq_factors', column: 'applicable_section' },
  { table: 'ctq_factors', column: 'risk_level' },
  { table: 'ctq_factors', column: 'category' },
  { table: 'qmp_section_gating', column: 'qmp_id' },
  { table: 'qmp_section_gating', column: 'section_key' },
  { table: 'qmp_traceability', column: 'qmp_id' },
  { table: 'cer_projects', column: 'status' },
  { table: 'cer_documents', column: 'cer_project_id' },
];

/**
 * Composite indexes for frequent query patterns
 */
const COMPOSITE_INDEXES = [
  { table: 'qmp_section_gating', columns: ['organization_id', 'qmp_id', 'section_key'] },
  { table: 'ctq_factors', columns: ['organization_id', 'applicable_section', 'risk_level'] },
  { table: 'qmp_traceability', columns: ['organization_id', 'qmp_id', 'source_type'] },
];

/**
 * Check if the database connection is available
 */
async function isDatabaseAvailable(): Promise<boolean> {
  try {
    if (!db) {
      logger.error('Database connection is not initialized');
      return false;
    }

    // Test the connection with a simple query
    await db.execute(sql`SELECT 1`);
    return true;
  } catch (error) {
    logger.error('Database connection test failed', error);
    return false;
  }
}

/**
 * Check if an index exists
 */
async function indexExists(tableName: string, indexName: string): Promise<boolean> {
  if (!db) {
    logger.error('Database connection is not initialized when checking if index exists');
    return false;
  }

  try {
    const result = await db.execute(sql`
      SELECT 1 FROM pg_indexes 
      WHERE tablename = ${tableName} 
      AND indexname = ${indexName}
    `);

    return result.rows.length > 0;
  } catch (error) {
    logger.error(`Error checking if index exists: ${indexName}`, error);
    return false;
  }
}

/**
 * Lightweight health check: are user-defined (non primary-key) indexes present
 * in the public schema? Used by the performance diagnostics instead of assuming
 * indexes exist. Returns false when the DB is unavailable, on error, or when no
 * secondary indexes are found — never a fabricated "true".
 */
export async function secondaryIndexesPresent(): Promise<boolean> {
  if (!db) {
    logger.error('Database connection is not initialized when checking index presence');
    return false;
  }

  try {
    const result = await db.execute(sql`
      SELECT COUNT(*)::int AS n FROM pg_indexes
      WHERE schemaname = 'public' AND indexname NOT LIKE '%_pkey'
    `);
    return Number((result.rows[0] as { n?: number } | undefined)?.n ?? 0) > 0;
  } catch (error) {
    logger.error('Error checking secondary index presence', error);
    return false;
  }
}

/**
 * Create organization_id indexes for all tenant tables
 */
export async function createTenantIndexes(): Promise<void> {
  logger.info('Creating tenant isolation indexes');

  if (!(await isDatabaseAvailable())) {
    logger.error('Skipping tenant index creation due to database connection issues');
    return;
  }

  for (const tableName of TENANT_TABLES) {
    const indexName = `idx_${tableName}_org_id`;

    try {
      if (!(await indexExists(tableName, indexName))) {
        await db!.execute(sql`
          CREATE INDEX IF NOT EXISTS ${sql.raw(indexName)} 
          ON ${sql.raw(tableName)} (organization_id)
        `);
        logger.info(`Created index ${indexName} on ${tableName}`);
      } else {
        logger.info(`Index ${indexName} already exists on ${tableName}`);
      }
    } catch (error) {
      logger.error(`Error creating tenant index on ${tableName}`, error);
    }
  }
}

/**
 * Create column-specific indexes
 */
export async function createColumnIndexes(): Promise<void> {
  logger.info('Creating column-specific indexes');

  if (!(await isDatabaseAvailable())) {
    logger.error('Skipping column index creation due to database connection issues');
    return;
  }

  for (const { table, column } of COLUMN_INDEXES) {
    const indexName = `idx_${table}_${column}`;

    try {
      if (!(await indexExists(table, indexName))) {
        await db!.execute(sql`
          CREATE INDEX IF NOT EXISTS ${sql.raw(indexName)} 
          ON ${sql.raw(table)} (${sql.raw(column)})
        `);
        logger.info(`Created index ${indexName} on ${table}.${column}`);
      } else {
        logger.info(`Index ${indexName} already exists on ${table}.${column}`);
      }
    } catch (error) {
      logger.error(`Error creating column index on ${table}.${column}`, error);
    }
  }
}

/**
 * Create composite indexes for frequent query patterns
 */
export async function createCompositeIndexes(): Promise<void> {
  logger.info('Creating composite indexes');

  if (!(await isDatabaseAvailable())) {
    logger.error('Skipping composite index creation due to database connection issues');
    return;
  }

  for (const { table, columns } of COMPOSITE_INDEXES) {
    const columnStr = columns.join('_');
    const indexName = `idx_${table}_${columnStr}`;

    try {
      if (!(await indexExists(table, indexName))) {
        const columnList = columns.join(', ');
        await db!.execute(sql`
          CREATE INDEX IF NOT EXISTS ${sql.raw(indexName)} 
          ON ${sql.raw(table)} (${sql.raw(columnList)})
        `);
        logger.info(`Created composite index ${indexName} on ${table}`);
      } else {
        logger.info(`Composite index ${indexName} already exists on ${table}`);
      }
    } catch (error) {
      logger.error(`Error creating composite index on ${table}`, error);
    }
  }
}

/**
 * Safely execute index creation with retry logic
 */
async function safelyExecuteWithRetry(operation: () => Promise<void>, retries = 3): Promise<void> {
  let attempts = 0;
  let lastError: any = null;

  while (attempts < retries) {
    try {
      await operation();
      return; // Success, exit the retry loop
    } catch (error) {
      lastError = error;
      attempts++;
      logger.warn(`Operation failed, attempt ${attempts}/${retries}`, { error });

      // Wait before retrying (exponential backoff)
      const delay = Math.pow(2, attempts) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // All retries failed
  logger.error(`Operation failed after ${retries} attempts`, { lastError });
  throw lastError;
}

/**
 * Initialize all database indexes
 */
export async function initializeIndexes(): Promise<void> {
  try {
    // Check database availability before proceeding
    if (!(await isDatabaseAvailable())) {
      logger.error('Cannot initialize indexes, database is not available');
      return;
    }

    // Use retry logic for each operation
    await safelyExecuteWithRetry(createTenantIndexes);
    await safelyExecuteWithRetry(createColumnIndexes);
    await safelyExecuteWithRetry(createCompositeIndexes);

    logger.info('Database indexes initialized successfully');
  } catch (error) {
    logger.error('Error initializing database indexes', error);
  }
}
