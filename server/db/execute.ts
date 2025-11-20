/**
 * Database SQL Execution Utility
 *
 * Provides a utility function for executing raw SQL queries,
 * which is needed for specialized operations like RLS setup.
 */
import { createScopedLogger } from '../utils/logger';
import { db } from './index';

const logger = createScopedLogger('sql-executor');

/**
 * Execute a raw SQL query
 *
 * @param sql - The SQL query to execute
 * @returns The query result
 */
export async function executeRawQuery(sql: string) {
  try {
    logger.debug(`Executing raw SQL: ${sql.substring(0, 100)}...`);

    // Execute the query
    return await db.execute(sql);
  } catch (error) {
    logger.error('Error executing raw SQL', { error, sql: sql.substring(0, 200) });
    throw error;
  }
}

// Export alias for backward compatibility
export const executeQuery = executeRawQuery;
