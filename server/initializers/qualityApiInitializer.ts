/**
 * Quality Management API Initializer
 *
 * This module centralizes the initialization of Quality Management
 * API components, ensuring proper error handling and graceful fallbacks.
 */
import { Express } from 'express';
import { createScopedLogger } from '../utils/logger';
import { getDb } from '../db/tenantDbHelper';
import { sql } from 'drizzle-orm';

const logger = createScopedLogger('quality-api-initializer');

/**
 * Initialize the Quality Management API
 *
 * @param app Express application instance
 */
export async function initializeQualityManagementApi(app: Express): Promise<void> {
  try {
    logger.info('Initializing Quality Management API');

    // Register quality management routes
    // We use the JavaScript version to avoid TS compilation issues
    // Eventually this will be replaced with proper TypeScript implementation
    const { registerQualityManagementRoutes } = await import(
      '../routes/quality-management-routes.js'
    );
    registerQualityManagementRoutes(app);

    logger.info('Quality Management API initialized successfully');
    return Promise.resolve();
  } catch (error) {
    logger.error('Failed to initialize Quality Management API', { error });
    return Promise.resolve(); // Still resolve to prevent server startup failure
  }
}

/**
 * Safely check if required tables exist
 *
 * @param connection Database connection
 * @param tables Array of table names to check
 * @returns Object with table existence status
 */
export async function checkRequiredTablesExist(
  connection: any,
  tables: string[]
): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {};

  try {
    for (const table of tables) {
      try {
        const queryResult = await connection.execute(sql`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = ${table}
          );
        `);

        result[table] = queryResult.rows[0]?.exists === true;
      } catch (err) {
        logger.warn(`Error checking if table ${table} exists`, { err });
        result[table] = false;
      }
    }
  } catch (error) {
    logger.error('Error checking for required tables', { error });
    // Default all tables to false if there was an error
    tables.forEach(table => {
      result[table] = false;
    });
  }

  return result;
}
