/**
 * eCTD Scaffolding Service
 * 
 * Service for managing eCTD module structure scaffolding and project folder hierarchy.
 * Refactored from route handlers into proper service class with caching and batch operations.
 * 
 * Phase 6 Component - eCTD Co-Author + Document Drafting
 */

import { logger } from '../../../lib/logger';
import { AuditLogger } from '../../audit/AuditLogger';
import { getPool } from '../../../db';

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
   */
  async seedProjectHierarchy(
    projectId: string,
    projectName: string,
    agency: Agency = 'FDA',
    userId?: string,
    organizationId?: string
  ): Promise<ScaffoldResult> {
    try {
      logger.info(`Seeding eCTD hierarchy for project ${projectId} (${agency})`);

      const result = await this.pool.query(
        `
        SELECT * FROM ectd.seed_project_hierarchy($1::uuid, $2, $3::uuid)
      `,
        [projectId, projectName, userId || null]
      );

      const { folders_created, execution_ms } = result.rows[0];

      const scaffoldResult: ScaffoldResult = {
        success: true,
        folders_created,
        execution_ms,
        project_id: projectId,
        agency,
      };

      // Audit log
      if (organizationId && userId) {
        await this.auditLogger.log({
          action: 'ectd_hierarchy_seeded',
          userId,
          organizationId,
          resourceType: 'ectd_project',
          resourceId: projectId,
          details: {
            projectName,
            agency,
            foldersCreated: folders_created,
            executionMs: execution_ms,
          },
          timestamp: new Date(),
        });
      }

      logger.info(`Seeded ${folders_created} folders in ${execution_ms}ms for project ${projectId}`);
      return scaffoldResult;

    } catch (error: any) {
      logger.error('Error seeding project hierarchy:', error);
      throw new Error(`Failed to seed project hierarchy: ${error.message}`);
    }
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
   * Update folder status
   */
  async updateFolderStatus(
    folderId: string,
    status: ECTDFolder['status'],
    userId?: string,
    organizationId?: string
  ): Promise<void> {
    try {
      await this.pool.query(
        `
        UPDATE ectd.project_folders
        SET status = $1, updated_at = NOW()
        WHERE id = $2
      `,
        [status, folderId]
      );

      // Audit log
      if (organizationId && userId) {
        await this.auditLogger.log({
          action: 'ectd_folder_status_updated',
          userId,
          organizationId,
          resourceType: 'ectd_folder',
          resourceId: folderId,
          details: { status },
          timestamp: new Date(),
        });
      }

      logger.debug(`Updated folder ${folderId} status to ${status}`);
    } catch (error: any) {
      logger.error('Error updating folder status:', error);
      throw new Error(`Failed to update folder status: ${error.message}`);
    }
  }

  /**
   * Batch update multiple folder statuses
   */
  async batchUpdateFolderStatus(
    updates: Array<{ folderId: string; status: ECTDFolder['status'] }>,
    userId?: string,
    organizationId?: string
  ): Promise<{ updated: number }> {
    try {
      let updated = 0;

      for (const update of updates) {
        await this.updateFolderStatus(
          update.folderId,
          update.status,
          userId,
          organizationId
        );
        updated++;
      }

      logger.info(`Batch updated ${updated} folder statuses`);
      return { updated };
    } catch (error: any) {
      logger.error('Error batch updating folder statuses:', error);
      throw new Error(`Failed to batch update folder statuses: ${error.message}`);
    }
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
   * Validate eCTD module code
   */
  async validateModuleCode(moduleCode: string, agency: Agency = 'FDA'): Promise<boolean> {
    try {
      const module = await this.getModuleByCode(moduleCode, agency);
      return module !== null;
    } catch (error: any) {
      logger.error('Error validating module code:', error);
      return false;
    }
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
