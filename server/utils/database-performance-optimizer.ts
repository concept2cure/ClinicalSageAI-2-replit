/**
 * Database Performance Optimizer for Concept2Cure
 *
 * Provides utilities for monitoring and optimizing database performance
 * including index management and query analysis
 */

import { Pool } from 'pg';
import { createScopedLogger } from './logger';
import { pool } from '../db';

const logger = createScopedLogger('db-performance');

interface IndexStats {
  schemaname: string;
  tablename: string;
  indexname: string;
  num_rows: number;
  table_size: string;
  index_size: string;
  unique: boolean;
  number_of_scans: number;
  tuples_read: number;
  tuples_fetched: number;
}

interface QueryStats {
  query: string;
  calls: number;
  total_time: number;
  mean_time: number;
  max_time: number;
  rows: number;
}

export class DatabasePerformanceOptimizer {
  private pool: Pool;

  constructor(connectionPool: Pool) {
    this.pool = connectionPool;
  }

  /**
   * Apply performance indexes to the database
   */
  async applyPerformanceIndexes(): Promise<void> {
    logger.info('Applying performance indexes...');

    const indexQueries = [
      // Core document indexing
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_tenant_uploaded_at 
       ON documents(tenant_id, uploaded_at DESC)`,

      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_tenant_type_status 
       ON documents(tenant_id, document_type, status)`,

      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_tenant_filename 
       ON documents(tenant_id, filename) WHERE filename IS NOT NULL`,

      // Document chunks for search
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_document_chunks_tenant_doc 
       ON document_chunks(tenant_id, document_id)`,

      // Full-text search
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_content_search 
       ON documents USING gin(to_tsvector('english', content)) 
       WHERE content IS NOT NULL`,

      // Partial index for active documents
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_active_tenant 
       ON documents(tenant_id, updated_at DESC) 
       WHERE status = 'active'`,
    ];

    for (const query of indexQueries) {
      try {
        await this.pool.query(query);
        logger.info(`Applied index: ${query.split('IF NOT EXISTS')[1]?.split('ON')[0]?.trim()}`);
      } catch (error: any) {
        logger.error(`Failed to apply index: ${error.message}`);
      }
    }
  }

  /**
   * Analyze index usage and performance
   */
  async analyzeIndexUsage(): Promise<IndexStats[]> {
    const query = `
      SELECT 
        schemaname,
        tablename,
        indexname,
        num_rows,
        pg_size_pretty(table_size) as table_size,
        pg_size_pretty(index_size) as index_size,
        unique,
        number_of_scans,
        tuples_read,
        tuples_fetched
      FROM (
        SELECT 
          schemaname,
          tablename,
          indexname,
          reltuples::bigint AS num_rows,
          pg_relation_size(indexrelid) AS index_size,
          pg_relation_size(schemaname||'.'||tablename) AS table_size,
          indisunique AS unique,
          idx_scan AS number_of_scans,
          idx_tup_read AS tuples_read,
          idx_tup_fetch AS tuples_fetched
        FROM pg_tables t
        LEFT OUTER JOIN pg_class c ON c.relname = t.tablename
        LEFT OUTER JOIN pg_index i ON i.indrelid = c.oid
        LEFT OUTER JOIN pg_class ci ON ci.oid = i.indexrelid
        LEFT OUTER JOIN pg_stat_user_indexes psi ON psi.indexrelid = i.indexrelid
        WHERE t.schemaname = 'public'
          AND ci.relname IS NOT NULL
      ) AS stats
      ORDER BY index_size DESC;
    `;

    try {
      const result = await this.pool.query(query);
      return result.rows;
    } catch (error: any) {
      logger.error(`Failed to analyze index usage: ${error.message}`);
      return [];
    }
  }

  /**
   * Get slow query statistics
   */
  async getSlowQueries(limit: number = 10): Promise<QueryStats[]> {
    // Enable pg_stat_statements if available
    try {
      await this.pool.query('CREATE EXTENSION IF NOT EXISTS pg_stat_statements');
    } catch (error) {
      logger.warn('pg_stat_statements extension not available');
      return [];
    }

    const query = `
      SELECT 
        query,
        calls,
        total_time,
        mean_time,
        max_time,
        rows
      FROM pg_stat_statements 
      WHERE query NOT LIKE '%pg_stat_statements%'
        AND query NOT LIKE '%SHOW%'
        AND query NOT LIKE '%SET%'
      ORDER BY mean_time DESC 
      LIMIT $1;
    `;

    try {
      const result = await this.pool.query(query, [limit]);
      return result.rows;
    } catch (error: any) {
      logger.error(`Failed to get slow queries: ${error.message}`);
      return [];
    }
  }

  /**
   * Optimize table statistics
   */
  async updateTableStatistics(): Promise<void> {
    logger.info('Updating table statistics...');

    const tables = [
      'documents',
      'document_chunks',
      'trials',
      'cer_reports',
      'literature_entries',
      'vault_documents',
    ];

    for (const table of tables) {
      try {
        await this.pool.query(`ANALYZE ${table}`);
        logger.info(`Updated statistics for table: ${table}`);
      } catch (error: any) {
        logger.error(`Failed to analyze table ${table}: ${error.message}`);
      }
    }
  }

  /**
   * Generate performance report
   */
  async generatePerformanceReport(): Promise<object> {
    logger.info('Generating database performance report...');

    const [indexStats, slowQueries] = await Promise.all([
      this.analyzeIndexUsage(),
      this.getSlowQueries(),
    ]);

    const report = {
      timestamp: new Date().toISOString(),
      database: {
        indexes: {
          total: indexStats.length,
          details: indexStats.slice(0, 10), // Top 10 largest indexes
        },
        slow_queries: {
          total: slowQueries.length,
          details: slowQueries,
        },
      },
      recommendations: this.generateRecommendations(indexStats, slowQueries),
    };

    logger.info('Performance report generated successfully');
    return report;
  }

  /**
   * Generate optimization recommendations
   */
  private generateRecommendations(indexStats: IndexStats[], slowQueries: QueryStats[]): string[] {
    const recommendations: string[] = [];

    // Check for unused indexes
    const unusedIndexes = indexStats.filter(idx => idx.number_of_scans === 0);
    if (unusedIndexes.length > 0) {
      recommendations.push(
        `Consider dropping ${unusedIndexes.length} unused indexes to save space`
      );
    }

    // Check for slow queries
    const verySlowQueries = slowQueries.filter(q => q.mean_time > 1000); // > 1 second
    if (verySlowQueries.length > 0) {
      recommendations.push(`Optimize ${verySlowQueries.length} queries with mean time > 1 second`);
    }

    // Check for missing indexes on frequently accessed tables
    const documentScans = indexStats.filter(
      idx => idx.tablename === 'documents' && idx.number_of_scans > 1000
    );
    if (documentScans.length === 0) {
      recommendations.push(
        'Consider adding more indexes on documents table for better performance'
      );
    }

    return recommendations;
  }
}

// Export singleton instance
export const dbPerformanceOptimizer = pool ? new DatabasePerformanceOptimizer(pool) : null;

/**
 * Initialize database performance optimizations
 */
export async function initializePerformanceOptimizations(): Promise<void> {
  if (!dbPerformanceOptimizer) {
    logger.warn('Database performance optimizer not available - no database connection');
    return;
  }

  try {
    logger.info('Initializing database performance optimizations...');

    // Apply performance indexes
    await dbPerformanceOptimizer.applyPerformanceIndexes();

    // Update table statistics
    await dbPerformanceOptimizer.updateTableStatistics();

    logger.info('Database performance optimizations completed');
  } catch (error: any) {
    logger.error('Failed to initialize performance optimizations:', error);
  }
}
