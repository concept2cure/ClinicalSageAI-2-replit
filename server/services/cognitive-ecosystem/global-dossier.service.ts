/**
 * =============================================================================
 * Global Dossier Service
 * =============================================================================
 * Enterprise service for ICH M4/eCTD global dossier management with
 * regional branching and FHIR data graph integration.
 * 
 * Features:
 * - Global common dossier management
 * - Regional branch creation and management
 * - Sync event tracking
 * - Regulatory comment workflow
 * - Content versioning with audit trail
 * - FHIR Document Reference integration
 * =============================================================================
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import {
  DossierInstance,
  DossierType,
  LifecycleStage,
  DossierBranch,
  BranchType,
  RegionalAdaptation,
  DossierSyncEvent,
  SyncEventType,
  ChangeSummary,
  ConflictDetection,
  RegulatoryComment,
  CommentType,
  CommentResolution,
  ContentVersion,
  ServiceResult,
  PaginatedResult,
  SearchCriteria
} from './types';

export interface GlobalDossierServiceConfig {
  pool: Pool;
  enableFHIRIntegration?: boolean;
  autoVersioning?: boolean;
}

export class GlobalDossierService {
  private pool: Pool;
  private readonly schema = 'global_dossier';
  private readonly enableFHIRIntegration: boolean;
  private readonly autoVersioning: boolean;

  constructor(config: GlobalDossierServiceConfig) {
    this.pool = config.pool;
    this.enableFHIRIntegration = config.enableFHIRIntegration ?? true;
    this.autoVersioning = config.autoVersioning ?? true;
  }

  // ===========================================================================
  // DOSSIER INSTANCES
  // ===========================================================================

  /**
   * Create a new dossier instance
   */
  async createDossier(
    dossier: Omit<DossierInstance, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ServiceResult<DossierInstance>> {
    const startTime = Date.now();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const id = uuidv4();
      const now = new Date();

      const result = await client.query(
        `INSERT INTO ${this.schema}.dossier_instances (
          id, product_id, tenant_id, dossier_type, dossier_name,
          global_version, lifecycle_stage, fhir_document_reference,
          content_graph, harmonized_sections, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          id,
          dossier.productId,
          dossier.tenantId,
          dossier.dossierType,
          dossier.dossierName,
          dossier.globalVersion || '1.0.0',
          dossier.lifecycleStage || LifecycleStage.PLANNING,
          dossier.fhirDocumentReference,
          JSON.stringify(dossier.contentGraph || []),
          JSON.stringify(dossier.harmonizedSections || []),
          now,
          now
        ]
      );

      await client.query('COMMIT');

      return {
        success: true,
        data: this.mapDossierInstance(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: {
          code: 'DOSSIER_CREATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get dossier by ID
   */
  async getDossier(
    dossierId: string,
    options?: { includeBranches?: boolean; includeComments?: boolean }
  ): Promise<ServiceResult<DossierInstance & {
    branches?: DossierBranch[];
    comments?: RegulatoryComment[];
  }>> {
    const startTime = Date.now();

    try {
      const result = await this.pool.query(
        `SELECT * FROM ${this.schema}.dossier_instances WHERE id = $1`,
        [dossierId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: `Dossier ${dossierId} not found` },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      const dossier = this.mapDossierInstance(result.rows[0]);
      let branches: DossierBranch[] | undefined;
      let comments: RegulatoryComment[] | undefined;

      if (options?.includeBranches) {
        const branchResult = await this.pool.query(
          `SELECT * FROM ${this.schema}.dossier_branches 
           WHERE dossier_instance_id = $1 
           ORDER BY created_at DESC`,
          [dossierId]
        );
        branches = branchResult.rows.map(this.mapDossierBranch);
      }

      if (options?.includeComments) {
        const commentResult = await this.pool.query(
          `SELECT * FROM ${this.schema}.regulatory_comments 
           WHERE dossier_id = $1 
           ORDER BY created_at DESC`,
          [dossierId]
        );
        comments = commentResult.rows.map(this.mapRegulatoryComment);
      }

      return {
        success: true,
        data: { ...dossier, branches, comments },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'DOSSIER_GET_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Update dossier lifecycle stage
   */
  async updateLifecycleStage(
    dossierId: string,
    stage: LifecycleStage
  ): Promise<ServiceResult<DossierInstance>> {
    const startTime = Date.now();

    try {
      const result = await this.pool.query(
        `UPDATE ${this.schema}.dossier_instances 
         SET lifecycle_stage = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [stage, dossierId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Dossier not found' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      return {
        success: true,
        data: this.mapDossierInstance(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'DOSSIER_UPDATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * List dossiers with filtering
   */
  async listDossiers(
    tenantId: string,
    criteria?: SearchCriteria & {
      productId?: string;
      dossierType?: DossierType;
      lifecycleStage?: LifecycleStage;
    }
  ): Promise<ServiceResult<PaginatedResult<DossierInstance>>> {
    const startTime = Date.now();
    const page = criteria?.page || 1;
    const pageSize = criteria?.pageSize || 20;
    const offset = (page - 1) * pageSize;

    try {
      let whereClause = 'WHERE tenant_id = $1';
      const params: unknown[] = [tenantId];
      let paramIndex = 2;

      if (criteria?.productId) {
        whereClause += ` AND product_id = $${paramIndex++}`;
        params.push(criteria.productId);
      }

      if (criteria?.dossierType) {
        whereClause += ` AND dossier_type = $${paramIndex++}`;
        params.push(criteria.dossierType);
      }

      if (criteria?.lifecycleStage) {
        whereClause += ` AND lifecycle_stage = $${paramIndex++}`;
        params.push(criteria.lifecycleStage);
      }

      const countResult = await this.pool.query(
        `SELECT COUNT(*) FROM ${this.schema}.dossier_instances ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].count, 10);

      params.push(pageSize, offset);
      const result = await this.pool.query(
        `SELECT * FROM ${this.schema}.dossier_instances 
         ${whereClause}
         ORDER BY updated_at DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
        params
      );

      return {
        success: true,
        data: {
          items: result.rows.map(this.mapDossierInstance),
          total,
          page,
          pageSize,
          hasNext: offset + result.rows.length < total,
          hasPrevious: page > 1
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'DOSSIER_LIST_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  // ===========================================================================
  // REGIONAL BRANCHES
  // ===========================================================================

  /**
   * Create a regional branch from a global dossier
   */
  async createRegionalBranch(
    dossierId: string,
    branchType: BranchType,
    options?: {
      branchVersion?: string;
      regionalAdaptations?: RegionalAdaptation[];
      submissionDeadline?: Date;
    }
  ): Promise<ServiceResult<DossierBranch>> {
    const startTime = Date.now();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get the parent dossier
      const dossierResult = await client.query(
        `SELECT * FROM ${this.schema}.dossier_instances WHERE id = $1`,
        [dossierId]
      );

      if (dossierResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Parent dossier not found' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      const dossier = dossierResult.rows[0];

      // Check for existing branch of same type
      const existingResult = await client.query(
        `SELECT id FROM ${this.schema}.dossier_branches 
         WHERE dossier_instance_id = $1 AND branch_type = $2`,
        [dossierId, branchType]
      );

      if (existingResult.rows.length > 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: { code: 'BRANCH_EXISTS', message: `Branch for ${branchType} already exists` },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      const id = uuidv4();
      const now = new Date();

      const result = await client.query(
        `INSERT INTO ${this.schema}.dossier_branches (
          id, dossier_instance_id, branch_type, branch_version,
          base_global_version, regional_adaptations, submission_deadline,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          id,
          dossierId,
          branchType,
          options?.branchVersion || '1.0.0',
          dossier.global_version,
          JSON.stringify(options?.regionalAdaptations || []),
          options?.submissionDeadline,
          now,
          now
        ]
      );

      // Record sync event
      await client.query(
        `INSERT INTO ${this.schema}.dossier_sync_events (
          id, dossier_id, target_branch_id, event_type, changeset_hash,
          changes_summary, conflicts_detected, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          uuidv4(),
          dossierId,
          id,
          SyncEventType.PUSH,
          crypto.createHash('sha256').update(JSON.stringify({ dossierId, branchType })).digest('hex'),
          JSON.stringify([{ sectionCode: '*', changeType: 'added', description: 'Initial branch creation' }]),
          JSON.stringify([])
        ]
      );

      await client.query('COMMIT');

      return {
        success: true,
        data: this.mapDossierBranch(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: {
          code: 'BRANCH_CREATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } finally {
      client.release();
    }
  }

  /**
   * Update branch with regional adaptations
   */
  async updateBranchAdaptations(
    branchId: string,
    adaptations: RegionalAdaptation[]
  ): Promise<ServiceResult<DossierBranch>> {
    const startTime = Date.now();

    try {
      const result = await this.pool.query(
        `UPDATE ${this.schema}.dossier_branches 
         SET regional_adaptations = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [JSON.stringify(adaptations), branchId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Branch not found' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      return {
        success: true,
        data: this.mapDossierBranch(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'BRANCH_UPDATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Mark branch as submitted
   */
  async markBranchSubmitted(
    branchId: string
  ): Promise<ServiceResult<DossierBranch>> {
    const startTime = Date.now();

    try {
      const result = await this.pool.query(
        `UPDATE ${this.schema}.dossier_branches 
         SET submitted_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND submitted_at IS NULL
         RETURNING *`,
        [branchId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Branch not found or already submitted' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      return {
        success: true,
        data: this.mapDossierBranch(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'BRANCH_SUBMIT_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Record branch approval
   */
  async recordBranchApproval(
    branchId: string,
    approvalStatus: string
  ): Promise<ServiceResult<DossierBranch>> {
    const startTime = Date.now();

    try {
      const result = await this.pool.query(
        `UPDATE ${this.schema}.dossier_branches 
         SET approval_status = $1, approved_at = NOW(), updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [approvalStatus, branchId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Branch not found' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      return {
        success: true,
        data: this.mapDossierBranch(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'BRANCH_APPROVAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  // ===========================================================================
  // SYNC OPERATIONS
  // ===========================================================================

  /**
   * Sync changes from global to regional branch
   */
  async syncGlobalToRegional(
    dossierId: string,
    branchId: string
  ): Promise<ServiceResult<DossierSyncEvent>> {
    const startTime = Date.now();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get dossier and branch
      const dossierResult = await client.query(
        `SELECT d.*, b.base_global_version, b.regional_adaptations
         FROM ${this.schema}.dossier_instances d
         JOIN ${this.schema}.dossier_branches b ON b.dossier_instance_id = d.id
         WHERE d.id = $1 AND b.id = $2`,
        [dossierId, branchId]
      );

      if (dossierResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Dossier or branch not found' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      const row = dossierResult.rows[0];
      const currentGlobalVersion = row.global_version;
      const baseGlobalVersion = row.base_global_version;
      const regionalAdaptations = row.regional_adaptations as RegionalAdaptation[];

      // Detect changes and conflicts
      const changes: ChangeSummary[] = [];
      const conflicts: ConflictDetection[] = [];

      // In production, this would compare actual content
      // For now, we'll create a placeholder
      if (currentGlobalVersion !== baseGlobalVersion) {
        changes.push({
          sectionCode: '*',
          changeType: 'modified',
          description: `Global version changed from ${baseGlobalVersion} to ${currentGlobalVersion}`
        });

        // Check for conflicts with regional adaptations
        for (const adaptation of regionalAdaptations) {
          // If adaptation exists and global content changed, flag potential conflict
          if (adaptation.adaptationType === 'modification') {
            conflicts.push({
              sectionCode: adaptation.sectionCode,
              conflictType: 'concurrent_modification',
              sourceContent: adaptation.originalContent || '',
              targetContent: adaptation.adaptedContent || ''
            });
          }
        }
      }

      // Create sync event
      const syncEventId = uuidv4();
      const changesetHash = crypto.createHash('sha256')
        .update(JSON.stringify({ dossierId, branchId, changes, timestamp: new Date() }))
        .digest('hex');

      const result = await client.query(
        `INSERT INTO ${this.schema}.dossier_sync_events (
          id, dossier_id, target_branch_id, event_type, changeset_hash,
          changes_summary, conflicts_detected, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING *`,
        [
          syncEventId,
          dossierId,
          branchId,
          conflicts.length > 0 ? SyncEventType.CONFLICT_RESOLUTION : SyncEventType.PUSH,
          changesetHash,
          JSON.stringify(changes),
          JSON.stringify(conflicts)
        ]
      );

      // Update branch base version if no conflicts
      if (conflicts.length === 0) {
        await client.query(
          `UPDATE ${this.schema}.dossier_branches 
           SET base_global_version = $1, updated_at = NOW()
           WHERE id = $2`,
          [currentGlobalVersion, branchId]
        );
      }

      await client.query('COMMIT');

      return {
        success: true,
        data: this.mapSyncEvent(result.rows[0]),
        metadata: {
          executionTimeMs: Date.now() - startTime,
          warnings: conflicts.length > 0 ? [`${conflicts.length} conflicts detected`] : undefined
        }
      };
    } catch (error) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: {
          code: 'SYNC_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } finally {
      client.release();
    }
  }

  /**
   * Resolve sync conflict
   */
  async resolveConflict(
    syncEventId: string,
    resolvedBy: string,
    resolutions: Array<{ sectionCode: string; resolution: string }>
  ): Promise<ServiceResult<DossierSyncEvent>> {
    const startTime = Date.now();

    try {
      // Get sync event
      const eventResult = await this.pool.query(
        `SELECT * FROM ${this.schema}.dossier_sync_events WHERE id = $1`,
        [syncEventId]
      );

      if (eventResult.rows.length === 0) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Sync event not found' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      // Update conflicts with resolutions
      const conflicts = eventResult.rows[0].conflicts_detected as ConflictDetection[];
      for (const conflict of conflicts) {
        const resolution = resolutions.find(r => r.sectionCode === conflict.sectionCode);
        if (resolution) {
          conflict.resolution = resolution.resolution;
        }
      }

      const result = await this.pool.query(
        `UPDATE ${this.schema}.dossier_sync_events 
         SET conflicts_detected = $1, resolved_by = $2, resolved_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [JSON.stringify(conflicts), resolvedBy, syncEventId]
      );

      return {
        success: true,
        data: this.mapSyncEvent(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'CONFLICT_RESOLVE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  // ===========================================================================
  // REGULATORY COMMENTS
  // ===========================================================================

  /**
   * Add a regulatory comment
   */
  async addRegulatoryComment(
    comment: Omit<RegulatoryComment, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ServiceResult<RegulatoryComment>> {
    const startTime = Date.now();

    try {
      const id = uuidv4();
      const now = new Date();

      const result = await this.pool.query(
        `INSERT INTO ${this.schema}.regulatory_comments (
          id, dossier_id, branch_id, agency_source, comment_reference,
          comment_type, section_reference, comment_text, response_text,
          resolution, due_date, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`,
        [
          id,
          comment.dossierId,
          comment.branchId,
          comment.agencySource,
          comment.commentReference,
          comment.commentType,
          comment.sectionReference,
          comment.commentText,
          comment.responseText,
          comment.resolution || CommentResolution.PENDING,
          comment.dueDate,
          now,
          now
        ]
      );

      return {
        success: true,
        data: this.mapRegulatoryComment(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'COMMENT_CREATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Update comment response and resolution
   */
  async updateCommentResponse(
    commentId: string,
    responseText: string,
    resolution: CommentResolution
  ): Promise<ServiceResult<RegulatoryComment>> {
    const startTime = Date.now();

    try {
      const result = await this.pool.query(
        `UPDATE ${this.schema}.regulatory_comments 
         SET response_text = $1, resolution = $2, 
             resolved_at = CASE WHEN $2 != 'pending' THEN NOW() ELSE NULL END,
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [responseText, resolution, commentId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Comment not found' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      return {
        success: true,
        data: this.mapRegulatoryComment(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'COMMENT_UPDATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Get comments by agency
   */
  async getCommentsByAgency(
    dossierId: string,
    agencySource: BranchType,
    options?: { resolution?: CommentResolution }
  ): Promise<ServiceResult<RegulatoryComment[]>> {
    const startTime = Date.now();

    try {
      let whereClause = 'WHERE dossier_id = $1 AND agency_source = $2';
      const params: unknown[] = [dossierId, agencySource];

      if (options?.resolution) {
        whereClause += ' AND resolution = $3';
        params.push(options.resolution);
      }

      const result = await this.pool.query(
        `SELECT * FROM ${this.schema}.regulatory_comments 
         ${whereClause}
         ORDER BY due_date ASC NULLS LAST, created_at DESC`,
        params
      );

      return {
        success: true,
        data: result.rows.map(this.mapRegulatoryComment),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'COMMENT_GET_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  // ===========================================================================
  // CONTENT VERSIONING
  // ===========================================================================

  /**
   * Create a new content version
   */
  async createContentVersion(
    sectionId: string,
    content: Buffer,
    changeDescription: string,
    authorId: string
  ): Promise<ServiceResult<ContentVersion>> {
    const startTime = Date.now();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get current version number
      const versionResult = await client.query(
        `SELECT version_number FROM ${this.schema}.content_versions 
         WHERE dossier_section_id = $1 
         ORDER BY created_at DESC 
         LIMIT 1`,
        [sectionId]
      );

      const currentVersion = versionResult.rows[0]?.version_number || '0.0.0';
      const [major, minor, patch] = currentVersion.split('.').map(Number);
      const newVersion = `${major}.${minor}.${patch + 1}`;

      const id = uuidv4();
      const contentHash = crypto.createHash('sha256').update(content).digest('hex');

      const result = await client.query(
        `INSERT INTO ${this.schema}.content_versions (
          id, dossier_section_id, version_number, content_hash,
          content_data, change_description, author_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING *`,
        [id, sectionId, newVersion, contentHash, content, changeDescription, authorId]
      );

      await client.query('COMMIT');

      return {
        success: true,
        data: this.mapContentVersion(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: {
          code: 'VERSION_CREATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get version history for a section
   */
  async getVersionHistory(
    sectionId: string,
    options?: { limit?: number }
  ): Promise<ServiceResult<ContentVersion[]>> {
    const startTime = Date.now();

    try {
      const result = await this.pool.query(
        `SELECT * FROM ${this.schema}.content_versions 
         WHERE dossier_section_id = $1 
         ORDER BY created_at DESC
         LIMIT $2`,
        [sectionId, options?.limit || 50]
      );

      return {
        success: true,
        data: result.rows.map(this.mapContentVersion),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'VERSION_HISTORY_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Approve a content version
   */
  async approveContentVersion(
    versionId: string,
    approvedBy: string
  ): Promise<ServiceResult<ContentVersion>> {
    const startTime = Date.now();

    try {
      const result = await this.pool.query(
        `UPDATE ${this.schema}.content_versions 
         SET approved_by = $1, approved_at = NOW()
         WHERE id = $2 AND approved_at IS NULL
         RETURNING *`,
        [approvedBy, versionId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Version not found or already approved' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      return {
        success: true,
        data: this.mapContentVersion(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'VERSION_APPROVE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  // ===========================================================================
  // MAPPER FUNCTIONS
  // ===========================================================================

  private mapDossierInstance = (row: Record<string, unknown>): DossierInstance => ({
    id: row.id as string,
    productId: row.product_id as string,
    tenantId: row.tenant_id as string,
    dossierType: row.dossier_type as DossierType,
    dossierName: row.dossier_name as string,
    globalVersion: row.global_version as string,
    lifecycleStage: row.lifecycle_stage as LifecycleStage,
    fhirDocumentReference: row.fhir_document_reference as string | undefined,
    contentGraph: row.content_graph as DossierInstance['contentGraph'],
    harmonizedSections: row.harmonized_sections as DossierInstance['harmonizedSections'],
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string)
  });

  private mapDossierBranch = (row: Record<string, unknown>): DossierBranch => ({
    id: row.id as string,
    dossierInstanceId: row.dossier_instance_id as string,
    branchType: row.branch_type as BranchType,
    branchVersion: row.branch_version as string,
    baseGlobalVersion: row.base_global_version as string,
    regionalAdaptations: row.regional_adaptations as RegionalAdaptation[],
    submissionDeadline: row.submission_deadline ? new Date(row.submission_deadline as string) : undefined,
    submittedAt: row.submitted_at ? new Date(row.submitted_at as string) : undefined,
    approvalStatus: row.approval_status as string | undefined,
    approvedAt: row.approved_at ? new Date(row.approved_at as string) : undefined,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string)
  });

  private mapSyncEvent = (row: Record<string, unknown>): DossierSyncEvent => ({
    id: row.id as string,
    dossierId: row.dossier_id as string,
    sourceBranchId: row.source_branch_id as string | undefined,
    targetBranchId: row.target_branch_id as string | undefined,
    eventType: row.event_type as SyncEventType,
    changesetHash: row.changeset_hash as string,
    changesSummary: row.changes_summary as ChangeSummary[],
    conflictsDetected: row.conflicts_detected as ConflictDetection[],
    resolvedBy: row.resolved_by as string | undefined,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at as string) : undefined,
    createdAt: new Date(row.created_at as string)
  });

  private mapRegulatoryComment = (row: Record<string, unknown>): RegulatoryComment => ({
    id: row.id as string,
    dossierId: row.dossier_id as string,
    branchId: row.branch_id as string,
    agencySource: row.agency_source as BranchType,
    commentReference: row.comment_reference as string,
    commentType: row.comment_type as CommentType,
    sectionReference: row.section_reference as string,
    commentText: row.comment_text as string,
    responseText: row.response_text as string | undefined,
    resolution: row.resolution as CommentResolution,
    dueDate: row.due_date ? new Date(row.due_date as string) : undefined,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at as string) : undefined,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string)
  });

  private mapContentVersion = (row: Record<string, unknown>): ContentVersion => ({
    id: row.id as string,
    dossierSectionId: row.dossier_section_id as string,
    versionNumber: row.version_number as string,
    contentHash: row.content_hash as string,
    contentData: row.content_data as Buffer,
    changeDescription: row.change_description as string,
    authorId: row.author_id as string,
    approvedBy: row.approved_by as string | undefined,
    approvedAt: row.approved_at ? new Date(row.approved_at as string) : undefined,
    createdAt: new Date(row.created_at as string)
  });
}
