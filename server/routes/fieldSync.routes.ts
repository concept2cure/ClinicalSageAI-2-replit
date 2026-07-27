import express from 'express';
import { verifyJwtWithRotation } from '../utils/jwtVerify.js';
import { nonAccessTokenReason } from '../middleware/tokenType';
import { authenticateToken } from '../middleware/auth';
import { requireAuthedOrgId } from '../utils/authedOrgId';
import { smartFieldLinking } from '../services/SmartFieldLinking.js';
import { db } from '../db';
import { fda510kProjects } from '@shared/schema';
import { and, eq } from 'drizzle-orm';

const router = express.Router();

// SECURITY (C2C-DEVICE-002): this router is mounted bare —
// server/bootstrap/register-inline-routes.ts does `app.use('/api/field-sync',
// fieldSyncRoutes)` with no auth middleware — and /api/field-sync is NOT on the
// authBoundary allowlist. The global boundary defaults to enforce ONLY in
// production and `warn` everywhere else (server/middleware/authBoundary.ts), so
// outside production every handler below was reachable with no credential at
// all, including a POST that writes 510(k) document content. Authenticate at the
// router so the guarantee does not depend on NODE_ENV.
//
// The SSE route authenticates itself (it cannot use the JSON 401 body once the
// event stream is open) and is registered before this guard applies to it — see
// authenticateSseOrg below, which now also enforces tenant ownership.
router.use((req, res, next) => {
  if (req.method === 'GET' && req.path.startsWith('/subscribe/')) return next();
  return authenticateToken(req, res, next);
});

/**
 * Resolve the caller's organization and prove it owns `projectId`.
 *
 * Returns null (and sends the response) when the caller has no tenant context or
 * the project is not theirs. 404 rather than 403 on a foreign project so the
 * endpoint does not confirm that someone else's project id exists.
 */
async function requireOwnedProject(
  req: express.Request,
  res: express.Response,
  projectId: number,
): Promise<number | null> {
  const guard = requireAuthedOrgId(req, res);
  if (!guard.ok) return null;
  if (!Number.isInteger(projectId) || projectId <= 0) {
    res.status(400).json({ success: false, error: 'Invalid projectId' });
    return null;
  }
  // Fail CLOSED when the database is unavailable: without it we cannot prove
  // ownership, and an unprovable claim must not be treated as authorized.
  if (!db) {
    res.status(503).json({ success: false, error: 'Database unavailable' });
    return null;
  }
  const rows = await db
    .select({ id: fda510kProjects.id })
    .from(fda510kProjects)
    .where(
      and(
        eq(fda510kProjects.id, projectId),
        eq(fda510kProjects.organizationId, guard.orgId),
      ),
    )
    .limit(1);
  if (rows.length === 0) {
    res.status(404).json({ success: false, error: 'Project not found' });
    return null;
  }
  return guard.orgId;
}
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ||
  'http://localhost:3000,http://localhost:5000,http://127.0.0.1:3000,http://127.0.0.1:5000,https://trialsage.com,https://app.trialsage.com')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

/**
 * Authenticate an SSE subscriber and return its organization id.
 *
 * SECURITY (C2C-DEVICE-002): this previously verified the signature and then
 * THREW THE CLAIMS AWAY, so the stream was filtered on the caller-supplied
 * :projectId alone — any authenticated user from any organization could stream
 * another tenant's field updates. The decoded principal is now the source of
 * the organization id, and the caller must own the project (checked by the
 * route). Non-access tokens (refresh / MFA-partial) are rejected, matching the
 * canonical access path.
 *
 * Returns the org id, or null after having sent the error response.
 */
function authenticateSseOrg(req: express.Request, res: express.Response): number | null {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Bearer token required' });
    return null;
  }
  let decoded: any;
  try {
    decoded = verifyJwtWithRotation(auth.slice(7));
  } catch {
    res.status(401).json({ success: false, error: 'Invalid authentication token' });
    return null;
  }
  if (nonAccessTokenReason(decoded)) {
    res.status(401).json({ success: false, error: 'Invalid authentication token' });
    return null;
  }
  const raw = decoded?.organizationId ?? decoded?.orgId ?? decoded?.tenant_id;
  const orgId = raw == null ? NaN : Number(raw);
  if (!Number.isFinite(orgId)) {
    res.status(403).json({ success: false, error: 'Tenant context required' });
    return null;
  }
  return orgId;
}

function resolveSseOrigin(req: express.Request): string | null {
  const origin = (req.headers.origin as string) || '';
  if (!origin) return null;
  return allowedOrigins.includes(origin) ? origin : null;
}

/**
 * Update a field value and synchronize across documents
 */
router.post('/update-field', async (req, res) => {
  try {
    // `userId` is deliberately NOT read from the body — attribution comes from
    // the verified principal only.
    const { projectId, source, field, value } = req.body;

    if (!projectId || !source || !field || value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: projectId, source, field, value'
      });
    }
    if (source !== 'workflow' && source !== 'document') {
      return res.status(400).json({ success: false, error: 'Invalid source' });
    }

    // Authenticated + tenant-owned, or the request stops here.
    const orgId = await requireOwnedProject(req, res, Number(projectId));
    if (orgId === null) return;

    // Update field and propagate changes
    await smartFieldLinking.updateField({
      source: source as 'workflow' | 'document',
      field,
      value,
      userId: Number((req as any).user?.id ?? (req as any).user?.userId) || undefined,
      timestamp: new Date(),
      metadata: {
        projectId: Number(projectId),
        organizationId: orgId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      }
    });
    
    res.json({
      success: true,
      message: 'Field updated and synchronized',
      field,
      value
    });
  } catch (error) {
    console.error('Error updating field:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update field'
    });
  }
});

/**
 * Get field links for a section
 */
router.get('/field-links/:section', (req, res) => {
  try {
    const { section } = req.params;
    const links = smartFieldLinking.getFieldLinksForSection(section);
    
    res.json({
      success: true,
      section,
      links
    });
  } catch (error) {
    console.error('Error getting field links:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get field links'
    });
  }
});

/**
 * Check field completeness for a project
 */
router.get('/completeness/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    // Authenticated + tenant-owned, or the request stops here.
    const orgId = await requireOwnedProject(req, res, Number(projectId));
    if (orgId === null) return;

    const completeness = await smartFieldLinking.checkFieldCompleteness(
      parseInt(projectId)
    );

    res.json({
      success: true,
      projectId,
      completeness
    });
  } catch (error) {
    console.error('Error checking completeness:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check field completeness'
    });
  }
});

/**
 * Subscribe to field updates via Server-Sent Events (SSE)
 */
router.get('/subscribe/:projectId', async (req, res) => {
  const orgId = authenticateSseOrg(req, res);
  if (orgId === null) return;
  const allowedOrigin = resolveSseOrigin(req);
  if ((req.headers.origin as string) && !allowedOrigin) {
    return res.status(403).json({ success: false, error: 'Origin not allowed' });
  }
  const { projectId } = req.params;

  // The subscriber's own organization must own the project it is streaming.
  // Checked BEFORE any SSE header is written so a rejection is still a normal
  // JSON response. Fail closed if ownership cannot be established.
  const projectIdNum = Number(projectId);
  if (!Number.isInteger(projectIdNum) || projectIdNum <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid projectId' });
  }
  if (!db) {
    return res.status(503).json({ success: false, error: 'Database unavailable' });
  }
  const owned = await db
    .select({ id: fda510kProjects.id })
    .from(fda510kProjects)
    .where(
      and(
        eq(fda510kProjects.id, projectIdNum),
        eq(fda510kProjects.organizationId, orgId),
      ),
    )
    .limit(1);
  if (owned.length === 0) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    ...(allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin } : {}),
    'Vary': 'Origin'
  });
  
  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', projectId })}\n\n`);
  
  // Listen for field updates.
  // Match on organization AND project: matching the project alone would stream
  // another tenant's update the moment two organizations share a project id.
  // An update carrying no organizationId is not proven to belong to this tenant,
  // so it is dropped rather than forwarded.
  const handleUpdate = (update: any) => {
    if (update.metadata?.organizationId !== orgId) return;
    if (update.metadata?.projectId === projectIdNum) {
      res.write(`data: ${JSON.stringify({
        type: 'fieldUpdate',
        ...update
      })}\n\n`);
    }
  };
  
  smartFieldLinking.on('fieldUpdated', handleUpdate);
  
  // Clean up on disconnect
  req.on('close', () => {
    smartFieldLinking.off('fieldUpdated', handleUpdate);
  });
});

export default router;
