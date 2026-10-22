/**
 * CMC source evidence — the Vault document a CMC record was taken from
 * (row D2; services/cmc/source-evidence.ts holds the rules).
 *
 *   GET  /source-evidence/:projectId[?sectionKey=]   the records feeding a section (or all), each with its evidence
 *   GET  /source-evidence/:projectId/documents       the program's current Vault versions a record could cite
 *   POST /source-evidence/:projectId                 { sourceKey, documentId, reason } — link
 *   POST /source-evidence/:projectId/:linkId/unlink  { reason } — remove a link, keeping its row
 *
 * The project guard (PF-15) answers another organization's project with 404
 * before a handler runs. The writes sit behind requireEditorAccess, the repo's
 * one governed-write gate, so a viewer is refused before anything is read; the
 * service then requires a reason, a record of this program and a current Vault
 * version of the same program. A refusal is returned with its status and its
 * sentence; an unexpected error is a 500 that names no table.
 */
import express from 'express';
import { getPool } from '../../db';
import { serverError } from '../../lib/api-response';
import { governedActorId, requireEditorAccess } from '../../middleware/orgMembership';
import { createScopedLogger } from '../../utils/logger';
import { clientIpOf } from '../../utils/client-ip';
import {
  linkSourceEvidence,
  listLinkableDocuments,
  listSourceEvidence,
  unlinkSourceEvidence,
  type Refusal,
} from '../../services/cmc/source-evidence';
import { guardModule3Project, module3OrgId } from './module3-project-guard';
import { requestPgClient } from '../../db/requestDb';
import { listRegisterLinks, retryRegisterLink, RegisterLinkRefusal } from '../../services/cmc/register-link-recovery';

const router = express.Router();
const log = createScopedLogger('cmc-source-evidence');
guardModule3Project(router, log);

const SECTION_KEY = /^3\.[0-9A-Z.]{1,40}$/;

// Recovery is a projection of saved records, not a second source-data intake.
// The same project guard covers these routes before any register is addressed.
router.get('/register-links/:projectId', async (req, res) => {
  const orgId = orgOr401(req, res);
  if (orgId === null) return;
  try {
    const links = await listRegisterLinks(requestPgClient(req), orgId, String(req.params.projectId));
    return res.json({ success: true, data: { links } });
  } catch (err) {
    return serverError(res, log, 'reading Module 3 register links', err);
  }
});

router.post('/register-links/:projectId/:register/:recordId/retry', requireEditorAccess, async (req, res) => {
  const orgId = orgOr401(req, res);
  if (orgId === null) return;
  const userId = governedActorId(req);
  if (!userId) return res.status(401).json({ success: false, error: 'AUTH_REQUIRED', message: 'Sign in to retry the saved record’s Module 3 link.' });
  if (Object.keys(req.body ?? {}).length) return res.status(400).json({ success: false, error: 'INVALID_PAYLOAD', message: 'A retry reads the saved record. Supply no source data or project override.' });
  try {
    const linkage = await retryRegisterLink(requestPgClient(req), { organizationId: orgId, projectId: String(req.params.projectId), register: String(req.params.register), recordId: String(req.params.recordId), userId });
    return res.json({ success: true, ...linkage });
  } catch (err) {
    if (err instanceof RegisterLinkRefusal) return res.status(err.status).json({ success: false, error: 'REGISTER_NOT_FOUND', message: err.message });
    return serverError(res, log, 'retrying the saved record’s Module 3 link', err);
  }
});

function refused(res: express.Response, r: Refusal) {
  return res.status(r.status).json({ success: false, error: r.code, message: r.message });
}

/** The organization, or the 401 the other Module 3 routers send without one. */
function orgOr401(req: express.Request, res: express.Response): number | null {
  try {
    return module3OrgId(req);
  } catch {
    res.status(401).json({ success: false, error: 'Organization context required' });
    return null;
  }
}

router.get('/source-evidence/:projectId', async (req, res) => {
  const orgId = orgOr401(req, res);
  if (orgId === null) return;
  const sectionKey = typeof req.query.sectionKey === 'string' ? req.query.sectionKey.trim() : '';
  if (sectionKey && !SECTION_KEY.test(sectionKey)) {
    return res.status(400).json({ success: false, error: 'INVALID_SECTION', message: 'Name a Module 3 section, e.g. 3.2.P.5.4.' });
  }
  try {
    const out = await listSourceEvidence(getPool(), {
      organizationId: orgId,
      programId: req.params.projectId,
      sectionKey: sectionKey || undefined,
    });
    if (!out.ok) return refused(res, out);
    return res.json({ success: true, data: out.sources });
  } catch (err) {
    return serverError(res, log, 'reading CMC source evidence', err, { projectId: req.params.projectId });
  }
});

router.get('/source-evidence/:projectId/documents', async (req, res) => {
  const orgId = orgOr401(req, res);
  if (orgId === null) return;
  try {
    const out = await listLinkableDocuments(getPool(), { organizationId: orgId, programId: req.params.projectId });
    if (!out.ok) return refused(res, out);
    return res.json({ success: true, data: out.documents });
  } catch (err) {
    return serverError(res, log, 'listing Vault documents for CMC evidence', err, { projectId: req.params.projectId });
  }
});

router.post('/source-evidence/:projectId', requireEditorAccess, async (req, res) => {
  const orgId = orgOr401(req, res);
  if (orgId === null) return;
  const userId = governedActorId(req);
  if (!userId) return res.status(401).json({ success: false, error: 'AUTH_REQUIRED', message: 'Sign in to link evidence.' });
  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    const out = await linkSourceEvidence(getPool(), {
      organizationId: orgId,
      programId: req.params.projectId,
      userId,
      sourceKey: body.sourceKey,
      documentId: body.documentId,
      reason: body.reason,
      ipAddress: clientIpOf(req) ?? undefined,
      userAgent: req.headers['user-agent'],
    });
    if (!out.ok) return refused(res, out);
    return res.status(201).json({ success: true, data: { id: out.id, moved: out.moved } });
  } catch (err) {
    return serverError(res, log, 'linking CMC source evidence', err, { projectId: req.params.projectId });
  }
});

router.post('/source-evidence/:projectId/:linkId/unlink', requireEditorAccess, async (req, res) => {
  const orgId = orgOr401(req, res);
  if (orgId === null) return;
  const userId = governedActorId(req);
  if (!userId) return res.status(401).json({ success: false, error: 'AUTH_REQUIRED', message: 'Sign in to remove evidence.' });
  try {
    const out = await unlinkSourceEvidence(getPool(), {
      organizationId: orgId,
      programId: req.params.projectId,
      userId,
      linkId: req.params.linkId,
      reason: (req.body ?? {}).reason,
      ipAddress: clientIpOf(req) ?? undefined,
      userAgent: req.headers['user-agent'],
    });
    if (!out.ok) return refused(res, out);
    return res.json({ success: true });
  } catch (err) {
    return serverError(res, log, 'removing CMC source evidence', err, { projectId: req.params.projectId });
  }
});

export default router;
