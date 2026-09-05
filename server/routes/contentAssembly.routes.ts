import express from 'express';
import { verifyJwtWithRotation } from '../utils/jwtVerify.js';
import {
  dynamicContentAssembly,
  ProjectAccessError,
  type AssemblyIdentity,
} from '../services/DynamicContentAssembly.js';
import { authedOrgId, requireAuthedOrgId } from '../utils/authedOrgId.js';
import { createScopedLogger } from '../utils/logger.js';

const log = createScopedLogger('content-assembly');

const router = express.Router();
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ||
  'http://localhost:3000,http://localhost:5000,http://127.0.0.1:3000,http://127.0.0.1:5000,https://trialsage.com,https://app.trialsage.com')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

function authenticateSse(req: express.Request, res: express.Response): boolean {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Bearer token required' });
    return false;
  }
  try {
    verifyJwtWithRotation(auth.slice(7));
    return true;
  } catch {
    res.status(401).json({ success: false, error: 'Invalid authentication token' });
    return false;
  }
}

/**
 * Resolve the authenticated user/org identity from the request (populated by
 * the global /api auth gate). Returns undefined when either is missing —
 * the assembly service then skips DB persistence rather than fabricating ids.
 */
function resolveAssemblyIdentity(req: express.Request): AssemblyIdentity | undefined {
  const organizationId = authedOrgId(req);
  const userId = Number((req as any).user?.id ?? (req as any).userId);
  if (organizationId == null || !Number.isFinite(userId)) return undefined;
  return { userId, organizationId };
}

function resolveSseOrigin(req: express.Request): string | null {
  const origin = (req.headers.origin as string) || '';
  if (!origin) return null;
  return allowedOrigins.includes(origin) ? origin : null;
}

/**
 * Assemble a document with conditional logic and completeness tracking
 */
router.post('/assemble/:projectId', async (req, res) => {
  try {
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return; // 403 already sent — no tenant context.
    const { projectId } = req.params;
    const { documentType, options } = req.body;

    if (!documentType) {
      return res.status(400).json({
        success: false,
        error: 'Document type is required'
      });
    }

    const assembly = await dynamicContentAssembly.assembleDocument(
      parseInt(projectId),
      documentType,
      guard.orgId,
      { ...options, identity: resolveAssemblyIdentity(req) }
    );

    res.json({
      success: true,
      assembly
    });
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    log.error('Error assembling document:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to assemble document'
    });
  }
});

/**
 * Get completeness report for a project
 */
router.get('/completeness/:projectId', async (req, res) => {
  try {
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return; // 403 already sent — no tenant context.
    const { projectId } = req.params;

    const report = await dynamicContentAssembly.getCompletenessReport(
      parseInt(projectId),
      guard.orgId
    );

    res.json({
      success: true,
      projectId,
      report
    });
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    log.error('Error generating completeness report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate completeness report'
    });
  }
});

/**
 * Generate document preview with live data
 */
router.get('/preview/:projectId/:documentType', async (req, res) => {
  try {
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return; // 403 already sent — no tenant context.
    const { projectId, documentType } = req.params;
    const format = (req.query.format as 'html' | 'markdown' | 'json') || 'html';

    const preview = await dynamicContentAssembly.generatePreview(
      parseInt(projectId),
      documentType,
      guard.orgId,
      format,
      resolveAssemblyIdentity(req)
    );

    // Set appropriate content type
    let contentType = 'text/html';
    if (format === 'markdown') contentType = 'text/markdown';
    if (format === 'json') contentType = 'application/json';

    res.setHeader('Content-Type', contentType);
    res.send(preview);
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    log.error('Error generating preview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate preview'
    });
  }
});

/**
 * Validate document assembly
 */
router.post('/validate/:projectId', async (req, res) => {
  try {
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return; // 403 already sent — no tenant context.
    const { projectId } = req.params;
    const { documentType } = req.body;

    if (!documentType) {
      return res.status(400).json({
        success: false,
        error: 'Document type is required'
      });
    }

    const assembly = await dynamicContentAssembly.assembleDocument(
      parseInt(projectId),
      documentType,
      guard.orgId,
      { validateOnly: true }
    );
    
    res.json({
      success: true,
      projectId,
      documentType,
      validation: {
        status: assembly.metadata.validationStatus,
        messages: assembly.metadata.validationMessages,
        completeness: assembly.overallCompleteness,
        sections: assembly.sections.map(s => ({
          id: s.id,
          title: s.title,
          completeness: s.completeness,
          missingFields: s.missingFields,
          required: s.required
        }))
      }
    });
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    log.error('Error validating document:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate document'
    });
  }
});

/**
 * Get live updates via Server-Sent Events (SSE)
 */
router.get('/live-preview/:projectId/:documentType', async (req, res) => {
  if (!authenticateSse(req, res)) return;
  const guard = requireAuthedOrgId(req, res);
  if (!guard.ok) return; // 403 already sent — no tenant context.
  const orgId = guard.orgId;
  const allowedOrigin = resolveSseOrigin(req);
  if ((req.headers.origin as string) && !allowedOrigin) {
    return res.status(403).json({ success: false, error: 'Origin not allowed' });
  }
  const { projectId, documentType } = req.params;

  // Verify tenant ownership BEFORE opening the SSE stream. generatePreview fails
  // closed with ProjectAccessError for a foreign-org projectId, so the stream is
  // never opened and no cross-tenant content is written.
  let initialPreview: string;
  try {
    initialPreview = await dynamicContentAssembly.generatePreview(
      parseInt(projectId),
      documentType,
      orgId,
      'html',
      resolveAssemblyIdentity(req)
    );
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    log.error('Error generating initial preview:', error);
    return res.status(500).json({ success: false, error: 'Failed to generate preview' });
  }

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    ...(allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin } : {}),
    'Vary': 'Origin'
  });

  // Send initial preview
  res.write(`data: ${JSON.stringify({
    type: 'preview',
    content: initialPreview,
    timestamp: new Date()
  })}\n\n`);

  // Set up interval for periodic updates
  const updateInterval = setInterval(async () => {
    try {
      const preview = await dynamicContentAssembly.generatePreview(
        parseInt(projectId),
        documentType,
        orgId,
        'html',
        resolveAssemblyIdentity(req)
      );

      const report = await dynamicContentAssembly.getCompletenessReport(
        parseInt(projectId),
        orgId
      );

      res.write(`data: ${JSON.stringify({
        type: 'update',
        content: preview,
        completeness: report,
        timestamp: new Date()
      })}\n\n`);
    } catch (error) {
      log.error('Error generating update:', error);
    }
  }, 5000); // Update every 5 seconds

  // Clean up on disconnect
  req.on('close', () => {
    clearInterval(updateInterval);
  });
});

export default router;
