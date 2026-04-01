import { Router } from 'express';
import { exportService } from '../services/export-service';
import { registerExportGovernanceQuick } from '../services/compute/exportGovernance';
import { authMiddleware } from '../auth';
import fs from 'fs';
import path from 'path';

const router = Router();
router.use(authMiddleware);

/**
 * Generate and return a study bundle as a ZIP archive
 * GET /api/export/study-bundle?study_id=xxx&persona=yyy
 */
router.get('/study-bundle', async (req, res) => {
  try {
    const { study_id, persona } = req.query;

    if (!study_id || typeof study_id !== 'string') {
      return res.status(400).json({ error: 'Study ID is required' });
    }

    // Create archive file
    const zipPath = await exportService.createSessionArchive(
      study_id,
      typeof persona === 'string' ? persona : undefined
    );

    // Return the path for later download
    res.json({
      success: true,
      zipPath: zipPath,
      downloadUrl: `/api/download/study-bundle?study_id=${study_id}`,
      message: 'Export bundle created successfully',
    });
  } catch (error: any) {
    console.error('Export error:', error);
    res.status(500).json({
      error: 'Failed to create export bundle',
      message: error.message || 'Unknown error',
    });
  }
});

/**
 * Download a previously generated study bundle
 * GET /api/download/study-bundle?study_id=xxx
 */
router.get('/download/study-bundle', async (req, res) => {
  try {
    const { study_id } = req.query;

    if (!study_id || typeof study_id !== 'string') {
      return res.status(400).json({ error: 'Study ID is required' });
    }

    // Look up the most recent bundle for this study ID
    const exportDir = process.env.DATA_PATH
      ? path.join(process.env.DATA_PATH, 'exports')
      : '/mnt/data/lumen_reports_backend/exports';

    try {
      const files = fs.readdirSync(exportDir);
      // Find the most recent ZIP file for this study ID
      const zipFiles = files
        .filter(file => file.startsWith(`${study_id}_bundle_`) && file.endsWith('.zip'))
        .sort()
        .reverse();

      if (zipFiles.length === 0) {
        return res.status(404).json({ error: 'No export bundle found for this study ID' });
      }

      const zipPath = path.join(exportDir, zipFiles[0]);
      const fileStat = fs.statSync(zipPath);

      // Register governed export (fail-closed for governed flows)
      const user = (req as any).user;
      if (!user?.organizationId || !user?.id) {
        return res.status(401).json({ error: 'Authenticated organization and user context required' });
      }

      try {
        await registerExportGovernanceQuick({
          organizationId: Number(user.organizationId),
          projectId: Number(user?.projectId || 0),
          userId: Number(user.id),
          userName: user?.name || user?.email || 'unknown',
          title: `Study Bundle: ${study_id}`,
          exportFormat: 'zip',
          exportFilename: zipFiles[0],
          exportFileSize: fileStat.size,
          docType: 'study_bundle',
          backendRoute: '/api/download/study-bundle',
          ipAddress: req.ip,
        });
      } catch (governanceError: any) {
        return res.status(503).json({
          error: 'Governed export registration failed',
          code: 'GOVERNANCE_REGISTRATION_FAILED',
          message: governanceError?.message || 'Governance service unavailable',
        });
      }

      // Set headers for file download
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename=${zipFiles[0]}`);

      // Stream the file to the response
      const fileStream = fs.createReadStream(zipPath);
      fileStream.pipe(res);
    } catch (err) {
      console.error('Error reading export directory:', err);
      return res.status(500).json({ error: 'Failed to access export files' });
    }
  } catch (error: any) {
    console.error('Download error:', error);
    res.status(500).json({
      error: 'Failed to download export bundle',
      message: error.message || 'Unknown error',
    });
  }
});

export default router;
