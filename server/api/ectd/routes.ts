/**
 * eCTD API Routes
 *
 * Endpoints for eCTD module structure and project folder management.
 * Includes the seeder service for auto-instantiating M1-M5 hierarchy.
 */
import { Router, Request, Response } from 'express';
import { getPool } from '../../db';
import { serverError } from '../../lib/api-response';
import { createScopedLogger } from '../../utils/logger';

const router = Router();

const logger = createScopedLogger('ectd-routes');
const pool = getPool();

/**
 * GET /api/ectd/module-structure
 * Returns the complete eCTD module structure hierarchy
 */
router.get('/module-structure', async (req: Request, res: Response) => {
  try {
    const { agency = 'FDA' } = req.query;

    const result = await pool.query(
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

    res.json({
      success: true,
      count: result.rowCount,
      agency,
      modules: result.rows,
    });
  } catch (error: any) {
    console.error('Error fetching module structure:', error);
    return serverError(res, logger, 'loading module structure', error);
  }
});

/**
 * GET /api/ectd/module-structure/tree
 * Returns module structure as a nested tree
 */
router.get('/module-structure/tree', async (req: Request, res: Response) => {
  try {
    const { agency = 'FDA' } = req.query;

    const result = await pool.query(
      `
      WITH RECURSIVE module_tree AS (
        SELECT
          id, module_code, module_name, parent_module_code,
          module_level, content_type, is_required,
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
          ms.module_level, ms.content_type, ms.is_required,
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
    const buildTree = (items: any[], parentCode: string | null = null): any[] => {
      return items
        .filter(item => item.parent_module_code === parentCode)
        .map(item => ({
          ...item,
          children: buildTree(items, item.module_code),
        }));
    };

    const tree = buildTree(result.rows);

    res.json({
      success: true,
      count: result.rowCount,
      agency,
      tree,
    });
  } catch (error: any) {
    console.error('Error building module tree:', error);
    return serverError(res, logger, 'loading tree', error);
  }
});

/**
 * POST /api/ectd/projects/:projectId/seed
 * Seeds the eCTD folder hierarchy for a project
 */
router.post('/projects/:projectId/seed', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { projectName, agency = 'FDA', userId } = req.body;

    if (!projectName) {
      return res.status(400).json({
        success: false,
        error: 'projectName is required',
      });
    }

    const result = await pool.query(
      `
      SELECT * FROM ectd.seed_project_hierarchy($1::uuid, $2, $3::uuid)
    `,
      [projectId, projectName, userId || null]
    );

    const { folders_created, execution_ms } = result.rows[0];

    res.json({
      success: true,
      projectId,
      projectName,
      agency,
      foldersCreated: folders_created,
      executionMs: parseFloat(execution_ms),
      performance: execution_ms < 2000 ? 'PASS' : 'FAIL',
      message: `Successfully seeded ${folders_created} folders in ${execution_ms}ms`,
    });
  } catch (error: any) {
    console.error('Error seeding project:', error);
    return serverError(res, logger, 'seeding projects', error);
  }
});

/**
 * GET /api/ectd/projects/:projectId/folders
 * Returns all folders for a project
 */
router.get('/projects/:projectId/folders', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { includeStats = 'true' } = req.query;

    const result = await pool.query(
      `
      SELECT
        pf.id,
        pf.module_code,
        pf.folder_path,
        pf.folder_name,
        pf.is_placeholder,
        pf.document_count,
        pf.status,
        pf.created_at,
        pf.updated_at,
        ms.module_level,
        ms.content_type,
        ms.is_required,
        ms.parent_module_code
      FROM ectd.project_folders pf
      JOIN ectd.module_structure ms ON ms.module_code = pf.module_code
      WHERE pf.project_id = $1
      ORDER BY pf.module_code
    `,
      [projectId]
    );

    let stats = null;
    if (includeStats === 'true') {
      const statsResult = await pool.query(
        `
        SELECT * FROM ectd.get_project_folder_stats($1::uuid)
      `,
        [projectId]
      );
      stats = statsResult.rows[0];
    }

    res.json({
      success: true,
      projectId,
      folderCount: result.rowCount,
      stats,
      folders: result.rows,
    });
  } catch (error: any) {
    console.error('Error fetching project folders:', error);
    return serverError(res, logger, 'loading folders', error);
  }
});

/**
 * PATCH /api/ectd/projects/:projectId/folders/:folderId
 * Update folder status or metadata
 */
router.patch('/projects/:projectId/folders/:folderId', async (req: Request, res: Response) => {
  try {
    const { projectId, folderId } = req.params;
    const { status, documentCount } = req.body;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (status) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }
    if (documentCount !== undefined) {
      updates.push(`document_count = $${paramIndex++}`);
      values.push(documentCount);
      updates.push(`is_placeholder = $${paramIndex++}`);
      values.push(documentCount === 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid updates provided',
      });
    }

    updates.push(`updated_at = NOW()`);
    values.push(folderId, projectId);

    const result = await pool.query(
      `
      UPDATE ectd.project_folders
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex++} AND project_id = $${paramIndex}
      RETURNING *
    `,
      values
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Folder not found',
      });
    }

    res.json({
      success: true,
      folder: result.rows[0],
    });
  } catch (error: any) {
    console.error('Error updating folder:', error);
    return serverError(res, logger, 'updating folders', error);
  }
});

/**
 * GET /api/ectd/stats
 * Returns overall eCTD statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM ectd.module_structure) as total_modules,
        (SELECT COUNT(*) FROM ectd.module_structure WHERE fda_specific = true) as fda_specific,
        (SELECT COUNT(*) FROM ectd.module_structure WHERE ema_specific = true) as ema_specific,
        (SELECT COUNT(*) FROM ectd.module_structure WHERE pmda_specific = true) as pmda_specific,
        (SELECT COUNT(DISTINCT project_id) FROM ectd.project_folders) as active_projects,
        (SELECT COUNT(*) FROM ectd.project_folders) as total_folders,
        (SELECT COUNT(*) FROM ectd.project_folders WHERE is_placeholder = false) as populated_folders
    `);

    res.json({
      success: true,
      stats: result.rows[0],
    });
  } catch (error: any) {
    console.error('Error fetching eCTD stats:', error);
    return serverError(res, logger, 'loading stats', error);
  }
});

export default router;
