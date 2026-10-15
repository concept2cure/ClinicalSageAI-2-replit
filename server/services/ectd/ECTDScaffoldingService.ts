/**
 * eCTD Scaffolding Service
 * 
 * Service for managing eCTD module structure scaffolding and project folder hierarchy.
 * Refactored from route handlers into proper service class with caching and batch operations.
 * 
 * Phase 6 Component - eCTD Co-Author + Document Drafting
 */

import { logger } from '../../utils/logger';
import { AuditLogger } from '../audit/auditLogger';
import { getPool } from '../../db';

export type Agency = 'FDA' | 'EMA' | 'PMDA';

export interface ECTDModule {
  id: string;
  module_code: string;
  module_name: string;
  parent_module_code?: string;
  module_level: number;
  content_type?: string;
  is_required: boolean;
  is_regional: boolean;
  fda_specific: boolean;
  ema_specific: boolean;
  pmda_specific: boolean;
  allowed_file_types?: string[];
  description?: string;
  guidance_reference?: string;
}

export interface ECTDModuleTree extends ECTDModule {
  children: ECTDModuleTree[];
  path: string[];
  depth: number;
}

export interface ECTDFolder {
  id: string;
  project_id: string;
  folder_name: string;
  module_code: string;
  parent_folder_id?: string;
  folder_path: string;
  status: 'pending' | 'in_progress' | 'complete' | 'locked';
  created_at: Date;
  updated_at: Date;
}

export interface ScaffoldResult {
  success: boolean;
  folders_created: number;
  execution_ms: number;
  project_id: string;
  agency: Agency;
}

/**
 * eCTD Scaffolding Service
 * Manages eCTD module structure and project folder hierarchies
 */
export class ECTDScaffoldingService {
  private auditLogger: AuditLogger;
  private pool: any;
  private moduleCache: Map<string, ECTDModule[]>;
  private cacheExpiry: Map<string, number>;
  private readonly CACHE_TTL = 3600000; // 1 hour in milliseconds

  constructor() {
    this.auditLogger = new AuditLogger();
    this.pool = getPool();
    this.moduleCache = new Map();
    this.cacheExpiry = new Map();
  }

  /**
   * Get complete eCTD module structure
   */
  async getModuleStructure(agency: Agency = 'FDA', useCache: boolean = true): Promise<ECTDModule[]> {
    try {
      const cacheKey = `modules_${agency}`;

      // Check cache
      if (useCache && this.isCacheValid(cacheKey)) {
        logger.debug(`Returning cached module structure for ${agency}`);
        return this.moduleCache.get(cacheKey)!;
      }

      logger.info(`Fetching module structure for ${agency} from database`);

      const result = await this.pool.query(
        `
        SELECT
          id,
          module_code,
          module_name,
          parent_module_code,
          module_level,
          content_type,
          is_required,
          is_regional,
          fda_specific,
          ema_specific,
          pmda_specific,
          allowed_file_types,
          description,
          guidance_reference
        FROM ectd.module_structure
        WHERE
          (fda_specific = FALSE OR fda_specific = ($1 = 'FDA'))
          AND (ema_specific = FALSE OR ema_specific = ($1 = 'EMA'))
          AND (pmda_specific = FALSE OR pmda_specific = ($1 = 'PMDA'))
        ORDER BY module_code
      `,
        [agency]
      );

      const modules = result.rows as ECTDModule[];

      // Update cache
      this.moduleCache.set(cacheKey, modules);
      this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_TTL);

      return modules;
    } catch (error: any) {
      logger.error('Error fetching module structure:', error);
      throw new Error(`Failed to fetch module structure: ${error.message}`);
    }
  }

  /**
   * Get eCTD module structure as nested tree
   */
  async getModuleTree(agency: Agency = 'FDA', useCache: boolean = true): Promise<ECTDModuleTree[]> {
    try {
      const cacheKey = `tree_${agency}`;

      // Check cache
      if (useCache && this.isCacheValid(cacheKey)) {
        logger.debug(`Returning cached module tree for ${agency}`);
        return this.moduleCache.get(cacheKey) as ECTDModuleTree[];
      }

      logger.info(`Building module tree for ${agency}`);

      const result = await this.pool.query(
        `
        WITH RECURSIVE module_tree AS (
          SELECT
            id, module_code, module_name, parent_module_code,
            module_level, content_type, is_required, is_regional,
            fda_specific, ema_specific, pmda_specific,
            ARRAY[module_code] as path,
            1 as depth
          FROM ectd.module_structure
          WHERE parent_module_code IS NULL
            AND (fda_specific = FALSE OR fda_specific = ($1 = 'FDA'))
            AND (ema_specific = FALSE OR ema_specific = ($1 = 'EMA'))
            AND (pmda_specific = FALSE OR pmda_specific = ($1 = 'PMDA'))

          UNION ALL

          SELECT
            ms.id, ms.module_code, ms.module_name, ms.parent_module_code,
            ms.module_level, ms.content_type, ms.is_required, ms.is_regional,
            ms.fda_specific, ms.ema_specific, ms.pmda_specific,
            mt.path || ms.module_code,
            mt.depth + 1
          FROM ectd.module_structure ms
          JOIN module_tree mt ON ms.parent_module_code = mt.module_code
          WHERE (ms.fda_specific = FALSE OR ms.fda_specific = ($1 = 'FDA'))
            AND (ms.ema_specific = FALSE OR ms.ema_specific = ($1 = 'EMA'))
            AND (ms.pmda_specific = FALSE OR ms.pmda_specific = ($1 = 'PMDA'))
        )
        SELECT * FROM module_tree ORDER BY path
      `,
        [agency]
      );

      // Build nested tree structure
      const tree = this.buildNestedTree(result.rows);

      // Update cache
      this.moduleCache.set(cacheKey, tree as any);
      this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_TTL);

      return tree;
    } catch (error: any) {
      logger.error('Error building module tree:', error);
      throw new Error(`Failed to build module tree: ${error.message}`);
    }
  }

  /**
   * Seed eCTD folder hierarchy for a project
   *
   * 2026-10-15: the project name went to ectd.seed_project_hierarchy as its
   * agency code ($2), so `agency` was never applied though the result reported
   * it; agency defaulted to FDA; and the audit row was written only when both
   * optional ids were passed. All three are required now, and an audit row that
   * was not persisted is not reported as success.
   */
  async seedProjectHierarchy(
    projectId: string,
    projectName: string,
    agency: Agency,
    userId: string,
    organizationId: string
  ): Promise<ScaffoldResult> {
    if (!userId || !organizationId) {
      throw new Error('Seeding an eCTD folder hierarchy is audited, so it needs the acting user and organization; nothing was seeded.');
    }
    let scaffoldResult: ScaffoldResult;
    try {
      logger.info(`Seeding eCTD hierarchy for project ${projectId} (${agency})`);

      const result = await this.pool.query(
        `
        SELECT * FROM ectd.seed_project_hierarchy($1::uuid, $2, $3::uuid)
      `,
        [projectId, agency, userId]
      );

      const { folders_created, execution_ms } = result.rows[0];

      scaffoldResult = {
        success: true,
        folders_created,
        execution_ms,
        project_id: projectId,
        agency,
      };
    } catch (error: any) {
      logger.error('Error seeding project hierarchy:', error);
      throw new Error(`Failed to seed project hierarchy: ${error.message}`);
    }

    const audit = await this.auditLogger.log({
      action: 'ectd_hierarchy_seeded',
      userId,
      organizationId,
      resourceType: 'ectd_project',
      resourceId: projectId,
      details: {
        projectName,
        agency,
        foldersCreated: scaffoldResult.folders_created,
        executionMs: scaffoldResult.execution_ms,
      },
      timestamp: new Date(),
    });
    if (!audit.persisted) {
      logger.error('ectd_hierarchy_seeded audit row NOT persisted', { projectId, reason: audit.error });
      throw new Error(`The eCTD hierarchy for project ${projectId} was seeded, but its audit row was not persisted.`);
    }

    logger.info(`Seeded ${scaffoldResult.folders_created} folders in ${scaffoldResult.execution_ms}ms for project ${projectId}`);
    return scaffoldResult;
  }

  /**
   * Get folders for a specific project
   */
  async getProjectFolders(projectId: string): Promise<ECTDFolder[]> {
    try {
      const result = await this.pool.query(
        `
        SELECT
          id,
          project_id,
          folder_name,
          module_code,
          parent_folder_id,
          folder_path,
          status,
          created_at,
          updated_at
        FROM ectd.project_folders
        WHERE project_id = $1
        ORDER BY folder_path
      `,
        [projectId]
      );

      return result.rows as ECTDFolder[];
    } catch (error: any) {
      logger.error('Error fetching project folders:', error);
      throw new Error(`Failed to fetch project folders: ${error.message}`);
    }
  }

  /**
   * Update folder status: refused.
   *
   * 2026-10-15: this ran `UPDATE ectd.project_folders SET status = …` by folder
   * id alone (no organization predicate) and audited only when the optional user
   * and organization were passed. ectd.project_folders has no status column (its
   * only creator, db/migrations/038_gcc_ectd_seeder_service.sql, defines none),
   * so no folder status can be recorded, and the call changes nothing.
   */
  async updateFolderStatus(folderId: string, status: ECTDFolder['status']): Promise<never> {
    throw new Error(
      `Folder ${folderId} was not set to '${status}': ectd.project_folders has no status column ` +
        '(db/migrations/038_gcc_ectd_seeder_service.sql), so nothing was changed.',
    );
  }

  /** Batch update multiple folder statuses: refused, as updateFolderStatus is. */
  async batchUpdateFolderStatus(
    updates: Array<{ folderId: string; status: ECTDFolder['status'] }>
  ): Promise<never> {
    throw new Error(
      `None of ${updates.length} folder status update(s) was applied: ectd.project_folders has no status column ` +
        '(db/migrations/038_gcc_ectd_seeder_service.sql), so nothing was changed.',
    );
  }

  /**
   * Get module metadata by code
   */
  async getModuleByCode(moduleCode: string, agency: Agency = 'FDA'): Promise<ECTDModule | null> {
    try {
      const modules = await this.getModuleStructure(agency);
      return modules.find(m => m.module_code === moduleCode) || null;
    } catch (error: any) {
      logger.error('Error getting module by code:', error);
      throw new Error(`Failed to get module by code: ${error.message}`);
    }
  }

  /**
   * Validate eCTD module code. A failed read of the module structure is an
   * error, never "not a valid code" (2026-10-15: it answered false).
   */
  async validateModuleCode(moduleCode: string, agency: Agency = 'FDA'): Promise<boolean> {
    const module = await this.getModuleByCode(moduleCode, agency);
    return module !== null;
  }

  /**
   * Get required modules for agency
   */
  async getRequiredModules(agency: Agency = 'FDA'): Promise<ECTDModule[]> {
    try {
      const modules = await this.getModuleStructure(agency);
      return modules.filter(m => m.is_required);
    } catch (error: any) {
      logger.error('Error getting required modules:', error);
      throw new Error(`Failed to get required modules: ${error.message}`);
    }
  }

  /**
   * Clear module cache
   */
  clearCache(agency?: Agency): void {
    if (agency) {
      this.moduleCache.delete(`modules_${agency}`);
      this.moduleCache.delete(`tree_${agency}`);
      this.cacheExpiry.delete(`modules_${agency}`);
      this.cacheExpiry.delete(`tree_${agency}`);
      logger.debug(`Cleared cache for ${agency}`);
    } else {
      this.moduleCache.clear();
      this.cacheExpiry.clear();
      logger.debug('Cleared all module cache');
    }
  }

  /**
   * Helper: Check if cache is valid
   */
  private isCacheValid(cacheKey: string): boolean {
    if (!this.moduleCache.has(cacheKey)) {
      return false;
    }

    const expiry = this.cacheExpiry.get(cacheKey);
    if (!expiry || Date.now() > expiry) {
      // Cache expired
      this.moduleCache.delete(cacheKey);
      this.cacheExpiry.delete(cacheKey);
      return false;
    }

    return true;
  }

  /**
   * Helper: Build nested tree structure
   */
  private buildNestedTree(items: any[], parentCode: string | null = null): ECTDModuleTree[] {
    return items
      .filter(item => item.parent_module_code === parentCode)
      .map(item => ({
        ...item,
        children: this.buildNestedTree(items, item.module_code),
      }));
  }

  /**
   * Get folder hierarchy tree for a project
   */
  async getProjectFolderTree(projectId: string): Promise<any[]> {
    try {
      const folders = await this.getProjectFolders(projectId);
      return this.buildFolderTree(folders);
    } catch (error: any) {
      logger.error('Error getting project folder tree:', error);
      throw new Error(`Failed to get project folder tree: ${error.message}`);
    }
  }

  /**
   * Helper: Build folder tree
   */
  private buildFolderTree(folders: ECTDFolder[], parentId: string | null = null): any[] {
    return folders
      .filter(f => f.parent_folder_id === parentId)
      .map(folder => ({
        ...folder,
        children: this.buildFolderTree(folders, folder.id),
      }));
  }
}

// Export singleton instance
export const ectdScaffoldingService = new ECTDScaffoldingService();
