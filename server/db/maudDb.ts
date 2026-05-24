/**
 * Database Service for MAUD Validation
 *
 * This module provides database access for MAUD validation results
 * for GA-ready persistence.
 */

// Minimal shape of the database pool that this module relies on. Both the
// real pg pool and the in-memory fallback below satisfy this interface.
interface MaudPool {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
  connect?(): Promise<{
    query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
    release(): void;
  }>;
}

// Import the database pool - with fallback if not available
let pool: MaudPool;
try {
  const db = require('./index');
  pool = db.pool || db.default;
} catch (error) {
  console.warn('Database pool not available, using fallback implementation');
  // Create a mock pool for environments without database support
  pool = {
    query: async () => ({ rows: [] }),
    connect: async () => ({
      query: async () => ({ rows: [] }),
      release: () => {},
    }),
  };
}

// Types for our database objects
export interface MAUDAlgorithm {
  id?: number;
  algorithm_id: string;
  name: string;
  version: string;
  description?: string;
  validation_level?: string;
  regulatory_frameworks?: any[];
  created_at?: Date;
  updated_at?: Date;
}

export interface MAUDValidation {
  id?: number;
  validation_id: string;
  document_id: string;
  organization_id?: string;
  status: string;
  timestamp?: Date;
  score?: number;
  validator_name?: string;
  validator_version?: string;
  regulatory_frameworks?: any[];
  algorithms_used?: any[];
  validation_details?: any;
  created_at?: Date;
  updated_at?: Date;
}

export interface MAUDValidationRequest {
  id?: number;
  request_id: string;
  document_id: string;
  organization_id?: string;
  status: string;
  algorithms?: any[];
  metadata?: any;
  created_at?: Date;
  updated_at?: Date;
  estimated_completion_time?: Date;
}

/**
 * Get validation status for a document
 *
 * @param documentId The document ID to get validation status for
 * @param organizationId Optional organization ID for multi-tenant support
 * @returns The most recent validation record for the document
 */
export async function getValidationStatus(
  documentId: string,
  organizationId?: string
): Promise<MAUDValidation | null> {
  const query = `
    SELECT * FROM maud_validations
    WHERE document_id = $1
    ${organizationId ? 'AND organization_id = $2' : ''}
    ORDER BY timestamp DESC
    LIMIT 1
  `;

  const params = organizationId ? [documentId, organizationId] : [documentId];

  try {
    const result = await pool.query(query, params);
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error('Database error getting validation status:', error);
    return null;
  }
}

/**
 * Save a validation result to the database
 *
 * @param validation The validation result to save
 * @returns The saved validation record with ID
 */
export async function saveValidation(validation: MAUDValidation): Promise<MAUDValidation> {
  const query = `
    INSERT INTO maud_validations (
      validation_id, document_id, organization_id, status, timestamp,
      score, validator_name, validator_version, regulatory_frameworks, 
      algorithms_used, validation_details
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
    )
    ON CONFLICT (validation_id) DO UPDATE SET
      status = EXCLUDED.status,
      timestamp = EXCLUDED.timestamp,
      score = EXCLUDED.score,
      validator_name = EXCLUDED.validator_name,
      validator_version = EXCLUDED.validator_version,
      regulatory_frameworks = EXCLUDED.regulatory_frameworks,
      algorithms_used = EXCLUDED.algorithms_used,
      validation_details = EXCLUDED.validation_details
    RETURNING *
  `;

  const params = [
    validation.validation_id,
    validation.document_id,
    validation.organization_id || null,
    validation.status,
    validation.timestamp || new Date(),
    validation.score || null,
    validation.validator_name || null,
    validation.validator_version || null,
    JSON.stringify(validation.regulatory_frameworks || []),
    JSON.stringify(validation.algorithms_used || []),
    JSON.stringify(validation.validation_details || {}),
  ];

  try {
    const result = await pool.query(query, params);
    return result.rows[0];
  } catch (error) {
    console.error('Database error saving validation:', error);
    throw error;
  }
}

/**
 * Get validation history for a document
 *
 * @param documentId The document ID to get validation history for
 * @param organizationId Optional organization ID for multi-tenant support
 * @param limit Maximum number of records to return (default 20)
 * @returns Array of validation records
 */
export async function getValidationHistory(
  documentId: string,
  organizationId?: string,
  limit: number = 20
): Promise<MAUDValidation[]> {
  const query = `
    SELECT * FROM maud_validations
    WHERE document_id = $1
    ${organizationId ? 'AND organization_id = $2' : ''}
    ORDER BY timestamp DESC
    LIMIT $${organizationId ? 3 : 2}
  `;

  const params = organizationId ? [documentId, organizationId, limit] : [documentId, limit];

  try {
    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Database error getting validation history:', error);
    return [];
  }
}

/**
 * Save a validation request to the database
 *
 * @param request The validation request to save
 * @returns The saved request record with ID
 */
export async function saveValidationRequest(
  request: MAUDValidationRequest
): Promise<MAUDValidationRequest> {
  const query = `
    INSERT INTO maud_validation_requests (
      request_id, document_id, organization_id, status,
      algorithms, metadata, estimated_completion_time
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7
    )
    ON CONFLICT (request_id) DO UPDATE SET
      status = EXCLUDED.status,
      algorithms = EXCLUDED.algorithms,
      metadata = EXCLUDED.metadata,
      estimated_completion_time = EXCLUDED.estimated_completion_time
    RETURNING *
  `;

  const params = [
    request.request_id,
    request.document_id,
    request.organization_id || null,
    request.status,
    JSON.stringify(request.algorithms || []),
    JSON.stringify(request.metadata || {}),
    request.estimated_completion_time || null,
  ];

  try {
    const result = await pool.query(query, params);
    return result.rows[0];
  } catch (error) {
    console.error('Database error saving validation request:', error);
    throw error;
  }
}

/**
 * Get pending validation requests for a document
 *
 * @param documentId The document ID to get pending requests for
 * @param organizationId Optional organization ID for multi-tenant support
 * @returns Array of pending validation requests
 */
export async function getPendingRequests(
  documentId: string,
  organizationId?: string
): Promise<MAUDValidationRequest[]> {
  const query = `
    SELECT * FROM maud_validation_requests
    WHERE document_id = $1
    ${organizationId ? 'AND organization_id = $2' : ''}
    AND status IN ('pending', 'submitted', 'in_progress')
    ORDER BY created_at DESC
  `;

  const params = organizationId ? [documentId, organizationId] : [documentId];

  try {
    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Database error getting pending requests:', error);
    return [];
  }
}

/**
 * Save algorithm information to the database
 *
 * @param algorithm The algorithm to save
 * @returns The saved algorithm record with ID
 */
export async function saveAlgorithm(algorithm: MAUDAlgorithm): Promise<MAUDAlgorithm> {
  const query = `
    INSERT INTO maud_algorithms (
      algorithm_id, name, version, description,
      validation_level, regulatory_frameworks
    ) VALUES (
      $1, $2, $3, $4, $5, $6
    )
    ON CONFLICT (algorithm_id) DO UPDATE SET
      name = EXCLUDED.name,
      version = EXCLUDED.version,
      description = EXCLUDED.description,
      validation_level = EXCLUDED.validation_level,
      regulatory_frameworks = EXCLUDED.regulatory_frameworks
    RETURNING *
  `;

  const params = [
    algorithm.algorithm_id,
    algorithm.name,
    algorithm.version,
    algorithm.description || null,
    algorithm.validation_level || null,
    JSON.stringify(algorithm.regulatory_frameworks || []),
  ];

  try {
    const result = await pool.query(query, params);
    return result.rows[0];
  } catch (error) {
    console.error('Database error saving algorithm:', error);
    throw error;
  }
}

/**
 * Get all available algorithms
 *
 * @returns Array of all available algorithms
 */
export async function getAvailableAlgorithms(): Promise<MAUDAlgorithm[]> {
  const query = `
    SELECT * FROM maud_algorithms
    ORDER BY name ASC
  `;

  try {
    const result = await pool.query(query);
    return result.rows;
  } catch (error) {
    console.error('Database error getting available algorithms:', error);
    return [];
  }
}

/**
 * Run the database migration for MAUD tables
 *
 * @returns true if successful, false if failed
 */
export async function runMaudMigration(): Promise<boolean> {
  try {
    // Read the migration file
    const fs = require('fs');
    const path = require('path');
    const migrationPath = path.join(
      __dirname,
      '../migrations/20250512-create-maud-validations-table.sql'
    );

    if (!fs.existsSync(migrationPath)) {
      console.error('Migration file not found:', migrationPath);
      return false;
    }

    const migrationSql = fs.readFileSync(migrationPath, 'utf8');

    // Execute the migration
    await pool.query(migrationSql);
    console.log('MAUD database migration completed successfully');
    return true;
  } catch (error) {
    console.error('Error running MAUD database migration:', error);
    return false;
  }
}
