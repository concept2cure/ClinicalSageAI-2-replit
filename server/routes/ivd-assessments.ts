/**
 * IVD assessment persistence routes — mounted at /api/ivd-assessments.
 *
 * Persists IVD lifecycle calculator results and generated post-market documents
 * as org-scoped, audited records (the "save" backend for the IVD UI surfaces).
 *
 *   GET  /                          list saved assessments (?type=&program_id=&limit=)
 *   POST /                          save an assessment
 *   GET  /:id                       single assessment
 *   DELETE /:id                     soft-delete
 *   GET  /documents                 list generated documents (?doc_type=&program_id=)
 *   POST /documents                 save a generated document
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireEditorAccessForWrites } from '../middleware/orgMembership';
import { governedIvdWrite, IvdWriteRefusal } from '../services/regulatory/ivd-governed-write';
import { ProgramRecordWriteRefusal } from '../services/c2c/governed-program-write';
import { classifyIvdrAnnexVIII } from '../services/regulatory/ivdr-classification';
import { buildFsn } from '../services/postmarket/report-authoring';
import { IvdDraftStateRefusal } from '../services/regulatory/ivd-assessments.service';

import { authenticateToken } from '../middleware/auth';
import { serverError } from '../lib/api-response';
import { createScopedLogger } from '../utils/logger';
import { requestPgClient } from '../db/requestDb';
import { corpusVersion } from '../services/ivd-knowledge/knowledge.service';
import {
  saveAssessment, listAssessments, getAssessment, deleteAssessment,
  saveGeneratedDocument, listGeneratedDocuments,
  isAssessmentType, isDocumentType, IVD_ASSESSMENT_TYPES, IVD_DOCUMENT_TYPES,
} from '../services/regulatory/ivd-assessments.service';

const router = Router();
router.use(authenticateToken);
router.use(requireEditorAccessForWrites);

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}
function q(req: Request, key: string): string | undefined {
  const v = req.query[key];
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return undefined;
}
function pathParam(req: Request, key: string): string {
  const v = req.params[key];
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}
const logger = createScopedLogger('ivd-assessments');

/* Saves use the existing canonical writers on the request transaction. The
   governed audit and row commit together; a failed audit rolls back the save.
   Calculated previews are supplied by /api/ivd-lifecycle and remain unsaved. */

/* This file kept a private `fail()` that put `Error.message` in the response as
   `detail` — the exact disclosure server/lib/api-response.ts documents having
   removed from every other MDX endpoint. A Postgres failure here shipped its
   table, column and constraint names to whatever read the response: a browser
   devtools panel, a proxy log, a saved HAR. `serverError` logs the real message
   against the request id the caller is shown, and answers with a code, a
   sentence and that id — one way of doing this, not two. */
function orgGuard(req: Request, res: Response): number | null {
  const orgId = getOrgId(req);
  if (orgId === null) { res.status(403).json({ error: 'Organization context required' }); return null; }
  return orgId;
}

// ── Assessments ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const orgId = orgGuard(req, res); if (orgId === null) return;
  try {
    const limitRaw = q(req, 'limit');
    const rows = await listAssessments(orgId, {
      assessmentType: q(req, 'type'),
      programId: q(req, 'program_id'),
      limit: limitRaw ? parseInt(limitRaw, 10) || undefined : undefined,
    }, requestPgClient(req));
    res.json({ rows, count: rows.length });
  } catch (e) { serverError(res, logger, 'listing IVD assessments', e); }
});

function writeFailure(res: Response, error: unknown, action: string) {
  if (error instanceof IvdWriteRefusal || error instanceof ProgramRecordWriteRefusal || error instanceof IvdDraftStateRefusal) {
    return res.status(error.status).json({ error: { code: error.code, message: error.message } });
  }
  return serverError(res, logger, action, error);
}

router.post('/', async (req, res) => {
  const b = req.body ?? {};
  if (!isAssessmentType(b.assessmentType)) return res.status(422).json({ error: `assessmentType must be one of: ${IVD_ASSESSMENT_TYPES.join(', ')}` });
  if (!b.result || typeof b.result !== 'object') return res.status(422).json({ error: 'A saved result object is required' });
  try {
    const result = b.assessmentType === 'ivdr_classification' ? classifyIvdrAnnexVIII(b.inputs ?? {}) : b.result;
    const row = await governedIvdWrite(req, { programId: b.programId, reason: b.reason, command: 'create', kind: 'ivd-assessment' },
      (client, orgId, actorId) => saveAssessment(orgId, { assessmentType: b.assessmentType, title: b.title ?? null,
        inputs: b.inputs ?? {}, result, verdict: b.assessmentType === 'ivdr_classification' ? result.classification : b.verdict ?? null,
        corpusVersion: corpusVersion(), engineVersion: b.assessmentType === 'ivdr_classification' ? 'ivdr-annex-viii-canonical' : null,
        createdBy: String(actorId), programId: b.programId }, client));
    res.setHeader('X-Audit-Row-Persisted', 'true'); res.status(201).json(row);
  } catch (error) { writeFailure(res, error, 'saving the IVD assessment'); }
});

const ivdrFacts = z.object({
  intendedPurpose: z.string().trim().min(1), deviceName: z.string().optional(),
  isSelfTest: z.boolean(), isNearPatient: z.boolean(), isCompanionDiagnostic: z.boolean(), detectsTransmissibleAgent: z.boolean(),
  bloodScreening: z.boolean(), detectsCancer: z.boolean(), prenatalScreening: z.boolean(), isGeneticTest: z.boolean(),
  analytes: z.array(z.string()).optional(),
}).strict();
router.post('/classification', async (req, res) => {
  const facts = ivdrFacts.safeParse(req.body?.facts);
  if (!facts.success) return res.status(422).json({ error: { code: 'VALIDATION', message: 'Complete the intended-purpose facts explicitly.', details: facts.error.flatten() } });
  try {
    const result = classifyIvdrAnnexVIII(facts.data);
    const b = req.body;
    const row = await governedIvdWrite(req, { programId: b.programId, reason: b.reason, command: 'create', kind: 'ivd-assessment' },
      (client, orgId, actorId) => saveAssessment(orgId, { assessmentType: 'ivdr_classification', title: b.title,
        inputs: facts.data, result, verdict: result.classification, corpusVersion: corpusVersion(),
        engineVersion: 'ivdr-annex-viii-canonical', createdBy: String(actorId), programId: b.programId }, client));
    res.status(201).json(row);
  } catch (error) {
    if ((error as { code?: string }).code === 'VALIDATION') return res.status(422).json({ error: { code: 'VALIDATION', message: error instanceof Error ? error.message : 'Missing IVDR facts.' } });
    writeFailure(res, error, 'saving the IVD classification');
  }
});

router.get('/documents', async (req, res) => {
  const orgId = orgGuard(req, res); if (orgId === null) return;
  try {
    const rows = await listGeneratedDocuments(orgId, { docType: q(req, 'doc_type'), programId: q(req, 'program_id') }, requestPgClient(req));
    res.json({ rows, count: rows.length });
  } catch (e) { serverError(res, logger, 'listing generated IVD documents', e); }
});

router.post('/documents', async (req, res) => {
  const b = req.body ?? {};
  if (!isDocumentType(b.docType)) return res.status(422).json({ error: `docType must be one of: ${IVD_DOCUMENT_TYPES.join(', ')}` });
  if (!b.payload || typeof b.payload !== 'object') return res.status(422).json({ error: 'A saved document payload is required' });
  try {
    const row = await governedIvdWrite(req, { programId: b.programId, reason: b.reason, command: 'create', kind: 'ivd-document' },
      (client, orgId, actorId) => saveGeneratedDocument(orgId, { docType: b.docType, title: b.title ?? null, payload: b.payload,
        status: b.status ?? 'draft', corpusVersion: corpusVersion(), createdBy: String(actorId), programId: b.programId }, client));
    res.setHeader('X-Audit-Row-Persisted', 'true'); res.status(201).json(row);
  } catch (error) { writeFailure(res, error, 'saving the generated IVD document'); }
});

const fsnFacts = z.object({ manufacturerName: z.string().trim().min(1), deviceName: z.string().trim().min(1),
  affectedLots: z.array(z.string().trim().min(1)).min(1), actionType: z.enum(['recall','software_update','advisory','modification','return']),
  reasonForAction: z.string().trim().min(1), riskToHealth: z.string().trim().min(1), recommendedUserAction: z.string().trim().min(1), contactDetails: z.string().trim().min(1),
}).strict();
router.post('/documents/fsn', async (req, res) => {
  const facts = fsnFacts.safeParse(req.body?.facts);
  if (!facts.success) return res.status(422).json({ error: { code: 'VALIDATION', message: 'Complete the Field Safety Notice facts.', details: facts.error.flatten() } });
  try {
    const built = buildFsn(facts.data);
    if (!built.valid) return res.status(422).json({ error: { code: 'VALIDATION', message: 'The Field Safety Notice is incomplete.', missing: built.missing } });
    const b = req.body;
    const row = await governedIvdWrite(req, { programId: b.programId, reason: b.reason, command: 'create', kind: 'ivd-document' },
      (client, orgId, actorId) => saveGeneratedDocument(orgId, { docType: 'fsn', title: b.title, payload: built.payload, status: 'draft',
        corpusVersion: corpusVersion(), createdBy: String(actorId), programId: b.programId }, client));
    res.status(201).json(row);
  } catch (error) { writeFailure(res, error, 'saving the Field Safety Notice'); }
});

router.get('/:id', async (req, res) => {
  const orgId = orgGuard(req, res); if (orgId === null) return;
  try {
    const row = await getAssessment(orgId, pathParam(req, 'id'), requestPgClient(req));
    if (!row) return res.status(404).json({ error: 'Assessment not found' });
    res.json(row);
  } catch (e) { serverError(res, logger, 'loading the IVD assessment', e); }
});

router.delete('/:id', async (req, res) => {
  const b = req.body ?? {};
  try {
    await governedIvdWrite(req, { programId: b.programId, reason: b.reason, command: 'delete', kind: 'ivd-assessment' }, async (client, orgId) => {
      const existing = await getAssessment(orgId, pathParam(req, 'id'), client);
      if (!existing || existing.program_id !== b.programId) throw new IvdWriteRefusal(404, 'NOT_FOUND', 'Assessment not found in this program.');
      if (!await deleteAssessment(orgId, pathParam(req, 'id'), client)) throw new IvdWriteRefusal(404, 'NOT_FOUND', 'Assessment not found.');
      return { id: pathParam(req, 'id') };
    });
    res.json({ ok: true });
  } catch (error) { writeFailure(res, error, 'deleting the IVD assessment'); }
});

export default router;
