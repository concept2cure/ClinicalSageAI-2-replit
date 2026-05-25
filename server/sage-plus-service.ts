/**
 * SagePlus Service
 *
 * Provides advanced regulatory writing and analytics capabilities for Concept2Cure.
 */
import { createContextLogger } from './utils/logger';
import { pool, query } from './db';

const logger = createContextLogger('sage-plus-service');

// SagePlus service configuration
const DEFAULT_CONFIG = {
  modelVersion: 'latest',
  enhancedValidation: true,
  autoSuggestions: true,
  maxCompletionTokens: 1000,
};

/**
 * Get documents from the knowledge base
 */
export async function getKnowledgeDocuments(options: {
  query?: string;
  category?: string;
  limit?: number;
  offset?: number;
}): Promise<any[]> {
  try {
    const { query: searchQuery = '', category = '', limit = 10, offset = 0 } = options;

    // If database is available, use it
    if (pool) {
      const searchPattern = searchQuery === '' ? '' : `%${searchQuery}%`;
      const result = await query(
        `SELECT * FROM knowledge_documents 
         WHERE ($1 = '' OR title ILIKE $1 OR content ILIKE $1)
         AND ($2 = '' OR category = $2)
         ORDER BY updated_at DESC
         LIMIT $3 OFFSET $4`,
        [searchPattern, category, limit, offset]
      );

      return result.rows;
    }

    // Fall back to default response if no database
    logger.warn('Database not available, using fallback documents');
    return [
      {
        id: 'fallback-1',
        title: 'Database connection required',
        category: 'system',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
  } catch (error: any) {
    logger.error('Error fetching knowledge documents', { error: error.message });
    throw error;
  }
}

/**
 * Get regulatory compliance status
 */
export async function getComplianceStatus(productId: string): Promise<any> {
  try {
    // Check if product exists in database
    if (pool) {
      const result = await query('SELECT * FROM regulatory_status WHERE product_id = $1', [
        productId,
      ]);

      if (result.rows.length > 0) {
        return result.rows[0];
      }
    }

    // Return pending status if not found
    logger.info('No compliance status found for product', { productId });
    return {
      productId,
      status: 'pending',
      lastChecked: new Date().toISOString(),
      issues: [],
    };
  } catch (error: any) {
    logger.error('Error getting compliance status', {
      error: error.message,
      productId,
    });
    throw error;
  }
}

/**
 * Get service configuration
 */
export function getConfiguration(): typeof DEFAULT_CONFIG {
  return { ...DEFAULT_CONFIG };
}

/**
 * Check service health
 */
export async function healthCheck(): Promise<{
  status: string;
  databaseConnected: boolean;
  timestamp: string;
}> {
  let databaseConnected = false;

  if (pool) {
    try {
      const result = await query('SELECT 1');
      databaseConnected = result.rows.length > 0;
    } catch (error) {
      logger.error('Database health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    status: 'operational',
    databaseConnected,
    timestamp: new Date().toISOString(),
  };
}

/**
 * CSR Reports schema export for compatibility
 */
export const csrReports = {
  name: 'csr_reports',
  columns: {
    id: 'id',
    title: 'title',
    content: 'content',
    metadata: 'metadata',
    created_at: 'created_at',
    updated_at: 'updated_at',
  },
};

/**
 * CSR Details schema export for compatibility
 */
export const csrDetails = {
  name: 'csr_details',
  columns: {
    id: 'id',
    report_id: 'report_id',
    detail_type: 'detail_type',
    data: 'data',
    created_at: 'created_at',
  },
};
