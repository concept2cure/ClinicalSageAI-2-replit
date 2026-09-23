/**
 * Protocol Development API — Capability C2C-17
 *
 * Governed protocol authoring: create a document (auto-seeded sections), edit
 * the cover page (title / number / phase / sponsor / PI), edit sections (with
 * an optional updated_at concurrency token), add objectives / eligibility /
 * schedule visits (rename, remove) / study team, remove a schedule-of-
 * assessments row, snapshot versions, read completeness, and finalize behind
 * the deterministic completeness gate. Every mutation runs BEGIN → Tx →
 * recordGovernedAction → COMMIT, org-scoped. Routes added 2026-09-21 run on
 * the request-scoped connection (governedScoped). Mounted at
 * /api/protocol-development.
 *
 * @module server/routes/protocol-development
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { requestPgClient } from '../db/requestDb';
import { recordGovernedAction } from './c2c/actions';
import {
  createProtocolDocumentTx,
  updateSynopsisTx,
  updateDocumentHeaderTx,
  updateSectionTx,
  addObjectiveTx,
  addEligibilityCriterionTx,
  addVisitTx,
  updateVisitTx,
  removeVisitTx,
  removeSoaAssessmentTx,
  addTeamMemberTx,
  bindStudyDesignTx,
  unbindStudyDesignTx,
  getCompleteness,
  snapshotVersionTx,
  finalizeProtocolTx,
  listProtocolDocuments,
  getProtocolDocument,
} from '../services/protocol-development/protocol-development-service';
import {
  recordProtocolDocCreated, recordProtocolSectionUpdated, recordProtocolObjectiveAdded,
  recordProtocolEligibilityAdded, recordProtocolVisitAdded, recordProtocolVersionSnapshot, recordProtocolFinalized,
} from '../services/protocol-development-metrics';
import { setTenantContextTx } from '../services/tenant/governed-tenant-context';
import {
  readDerivation,
  applyDerivationTx,
  DerivationError,
} from '../services/protocol-development/design-derivation-service';

const router = Router();

function resolveUserId(req: Request): number | null {
  const r = req as any;
  const raw = r.userId ?? r.user?.id ?? r.user?.userId;
  const n = raw == null ? NaN : typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}
function resolveOrgId(req: Request): number | null {
  const r = req as any;
  const raw = r.tenantId ?? r.organizationId ?? r.user?.organizationId ?? r.user?.tenantId;
  const n = raw == null ? NaN : typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}
const CODE_STATUS: Record<string, number> = { NOT_FOUND: 404, INVALID_STATE: 409, BAD_INPUT: 400, SECTION_CHANGED: 409 };
function fail(res: Response, err: unknown): void {
  // DerivationError uses the same code vocabulary, so it maps through the same
  // table rather than getting its own handler.
  const code = err instanceof DerivationError ? err.code : (err as { code?: string } | null)?.code;
  if (code && CODE_STATUS[code]) {
    res.status(CODE_STATUS[code]).json({ error: { code, message: err instanceof Error ? err.message : 'Request failed.' } });
    return;
  }
  res.status(500).json({ error: { code: 'INTERNAL', message: err instanceof Error ? err.message : 'Request failed.' } });
}
const reason = z.string().trim().min(8, 'Provide a reason of at least 8 characters.');
const KIND = z.enum(['iacuc', 'irb', 'clinical', 'ibc']);

async function governed(
  req: Request,
  res: Response,
  command: string,
  reasonText: string,
  run: (client: any, orgId: number, userId: number) => Promise<{ target: string; payload?: Record<string, unknown>; body: Record<string, unknown> }>,
): Promise<void> {
  const userId = resolveUserId(req);
  const orgId = resolveOrgId(req);
  if (!userId || !orgId) {
    res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, orgId);
    const { target, payload, body } = await run(client, orgId, userId);
    const gov = await recordGovernedAction(client, { orgId, userId, command, target, reason: reasonText, payload, domain: 'protocol_development' });
    await client.query('COMMIT');
    res.status(201).json({ ...body, ...gov });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(res, err);
  } finally {
    client.release();
  }
}

/**
 * Same ceremony as `governed`, on the REQUEST-SCOPED connection (`req.dbClient`,
 * installed at the auth boundary with the tenant session variables applied)
 * instead of a fresh shared-pool checkout. This is the path the requestDb
 * adoption ratchet (scripts/ci/audit-requestdb-coverage.mjs) expects new
 * tenant-facing writes to take; the routes added on 2026-09-21 (header,
 * visit rename/remove, assessment remove) use it. Fails closed: a request
 * with no tenant-scoped client is refused, never served from the pool.
 * The connection's lifecycle is the middleware's (released on response end),
 * so nothing here calls release().
 */
async function governedScoped(
  req: Request,
  res: Response,
  command: string,
  reasonText: string,
  run: (client: any, orgId: number, userId: number) => Promise<{ target: string; payload?: Record<string, unknown>; body: Record<string, unknown> }>,
): Promise<void> {
  const userId = resolveUserId(req);
  const orgId = resolveOrgId(req);
  if (!userId || !orgId) {
    res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
    return;
  }
  let client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
  try {
    client = requestPgClient(req);
  } catch {
    res.status(500).json({ error: { code: 'REQUEST_DB_CONTEXT_REQUIRED', message: 'No tenant-scoped database context on this request; nothing was written.' } });
    return;
  }
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, orgId);
    const { target, payload, body } = await run(client, orgId, userId);
    const gov = await recordGovernedAction(client, { orgId, userId, command, target, reason: reasonText, payload, domain: 'protocol_development' });
    await client.query('COMMIT');
    res.status(201).json({ ...body, ...gov });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(res, err);
  }
}

// ─── Documents ───────────────────────────────────────────────────────────────

const docSchema = z.object({
  protocolKind: KIND,
  title: z.string().min(1).max(500),
  protocolNumber: z.string().max(120).optional(),
  designType: z.enum(['interventional', 'observational', 'expanded_access', 'animal_study', 'basic_science', 'registry', 'other']).optional(),
  phase: z.string().max(40).optional(),
  therapeuticArea: z.string().max(120).optional(),
  linkedProtocolId: z.number().int().positive().optional(),
  synopsis: z.string().max(8000).optional(),
  sponsor: z.string().max(300).optional(),
  principalInvestigator: z.string().max(300).optional(),
  reason,
});
router.post('/documents', async (req, res) => {
  const parsed = docSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id, sectionsSeeded } = await createProtocolDocumentTx(client, orgId, userId, parsed.data);
    recordProtocolDocCreated(parsed.data.protocolKind);
    return { target: `protocol-document:${id}`, payload: { kind: parsed.data.protocolKind, sectionsSeeded }, body: { id, sectionsSeeded } };
  });
});

router.get('/documents', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try { res.json(await listProtocolDocuments(orgId, typeof req.query.kind === 'string' ? req.query.kind : undefined)); } catch (err) { fail(res, err); }
});

router.get('/documents/:id', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try {
    const doc = await getProtocolDocument(orgId, id);
    if (!doc) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Protocol document not found.' } });
    res.json(doc);
  } catch (err) { fail(res, err); }
});

router.get('/documents/:id/completeness', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try { res.json(await getCompleteness(orgId, id)); } catch (err) { fail(res, err); }
});

const synopsisSchema = z.object({ synopsis: z.string().min(1).max(8000), reason });
router.patch('/documents/:id/synopsis', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = synopsisSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    await updateSynopsisTx(client, orgId, id, parsed.data.synopsis, userId);
    return { target: `protocol-document:${id}`, body: { id } };
  });
});

/* Cover page: title / protocol number / phase / sponsor / PI. Every field is
   optional and only the keys present are written (an empty string clears).
   Request-scoped connection (see governedScoped). */
const headerSchema = z.object({
  title: z.string().max(500).optional(),
  protocolNumber: z.string().max(120).optional(),
  phase: z.string().max(40).optional(),
  sponsor: z.string().max(300).optional(),
  principalInvestigator: z.string().max(300).optional(),
  reason,
}).strict();
router.patch('/documents/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = headerSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  const { reason: reasonText, ...fields } = parsed.data;
  if (Object.keys(fields).length === 0) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Nothing to change — send at least one cover-page field.' } });
  await governedScoped(req, res, 'update', reasonText, async (client, orgId) => {
    await updateDocumentHeaderTx(client, orgId, id, fields);
    return { target: `protocol-document:${id}`, payload: { fields: Object.keys(fields) }, body: { id, updated: Object.keys(fields) } };
  });
});

// ─── Study design link (PROTOCOL-CONVERGENCE step 1b) ────────────────────────

/* Bind / unbind the protocol document to the persisted study design it is a
   projection of (docs/design/PROTOCOL_DESIGN_CONVERGENCE.md). Read-only in
   effect: nothing is generated into the protocol's sections, and the design is
   not modified — the link is what lets the surface render the DESIGN GATES'
   findings on the protocol and offer the spine's five projections. Both run on
   the request-scoped connection (governedScoped) and are tenant-scoped on both
   sides: another organisation's protocol, and a design that is not this
   tenant's, are both NOT_FOUND with nothing written. */
const bindDesignSchema = z.object({ studyDesignId: z.string().min(1).max(100), reason }).strict();
router.post('/documents/:id/study-design', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = bindDesignSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governedScoped(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const bound = await bindStudyDesignTx(client, orgId, id, parsed.data.studyDesignId, userId);
    return {
      target: `protocol-document:${id}`,
      payload: { studyDesignId: bound.studyDesignId, studyDesignTitle: bound.title },
      body: { documentId: id, studyDesignId: bound.studyDesignId, studyDesignTitle: bound.title },
    };
  });
});

router.post('/documents/:id/study-design/remove', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = z.object({ reason }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governedScoped(req, res, 'update', parsed.data.reason, async (client, orgId) => {
    await unbindStudyDesignTx(client, orgId, id);
    return {
      target: `protocol-document:${id}`,
      payload: { studyDesignId: null },
      body: { documentId: id, studyDesignId: null },
    };
  });
});

/* ── Derivation: the protocol read back INTO the design ────────────────────
   The bind routes above make the protocol a projection of the design. These
   two close the loop the other way (docs/design/PROTOCOL_INTELLIGENCE.md,
   "Direction two"): what the protocol's registers evidence about the design,
   offered as a reviewed diff, applied only where a human says so.

   GET is read-only and writes nothing, including no audit row — looking at a
   diff is not a governed action. POST is governed like every other mutation
   here, and takes the PATHS accepted rather than the values: the server
   recomputes the derivation from the live rows, so a protocol someone else
   edited since the diff was displayed cannot be written from a stale payload. */
router.get('/documents/:id/design-derivation', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try {
    const client = requestPgClient(req);
    const view = await readDerivation(client, orgId, id);
    return res.json({
      documentId: view.documentId,
      studyDesignId: view.studyDesignId,
      derivation: view.derivation,
    });
  } catch (err) {
    return fail(res, err);
  }
});

const applyDerivationSchema = z
  .object({ acceptedPaths: z.array(z.string().min(1).max(120)).min(1).max(20), reason })
  .strict();
router.post('/documents/:id/design-derivation/apply', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = applyDerivationSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governedScoped(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const result = await applyDerivationTx(client, orgId, id, parsed.data.acceptedPaths, userId);
    return {
      target: `study-design:${result.studyDesignId}`,
      payload: {
        fromProtocolDocumentId: id,
        applied: result.applied,
        rejected: result.rejected.map((r) => r.path),
      },
      body: {
        documentId: id,
        studyDesignId: result.studyDesignId,
        applied: result.applied,
        rejected: result.rejected,
        derivation: result.derivation,
      },
    };
  });
});

// ─── Sections ────────────────────────────────────────────────────────────────

/* `expectedUpdatedAt` is the section's updated_at the editor loaded; the
   service refuses with SECTION_CHANGED (409) when the row has moved since. */
const sectionSchema = z.object({ content: z.string().max(50000).optional(), status: z.enum(['not_started', 'draft', 'complete']).optional(), expectedUpdatedAt: z.string().max(64).optional(), reason });
router.patch('/sections/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = sectionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    await updateSectionTx(client, orgId, id, parsed.data, userId);
    recordProtocolSectionUpdated();
    const after = await client.query(`SELECT updated_at, status FROM protocol_sections WHERE id = $1 AND organization_id = $2`, [id, orgId]);
    return { target: `protocol-section:${id}`, payload: { status: parsed.data.status }, body: { id, updatedAt: after.rows[0]?.updated_at ?? null, status: after.rows[0]?.status ?? null } };
  });
});

// ─── Structured components ───────────────────────────────────────────────────

const objectiveSchema = z.object({ objectiveType: z.enum(['primary', 'secondary', 'exploratory']).optional(), objective: z.string().min(1).max(2000), endpoint: z.string().max(2000).optional(), timepoint: z.string().max(200).optional(), reason });
router.post('/documents/:id/objectives', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = objectiveSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id: oid } = await addObjectiveTx(client, orgId, userId, id, parsed.data);
    recordProtocolObjectiveAdded();
    return { target: `protocol-document:${id}`, payload: { objectiveId: oid }, body: { documentId: id, objectiveId: oid } };
  });
});

const eligibilitySchema = z.object({ kind: z.enum(['inclusion', 'exclusion']), criterion: z.string().min(1).max(2000), reason });
router.post('/documents/:id/eligibility', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = eligibilitySchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id: eid } = await addEligibilityCriterionTx(client, orgId, userId, id, parsed.data);
    recordProtocolEligibilityAdded();
    return { target: `protocol-document:${id}`, payload: { criterionId: eid, kind: parsed.data.kind }, body: { documentId: id, criterionId: eid } };
  });
});

const visitSchema = z.object({ visitName: z.string().min(1).max(200), timepoint: z.string().max(120).optional(), procedures: z.array(z.string().max(300)).max(100).optional(), reason });
router.post('/documents/:id/visits', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = visitSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id: vid } = await addVisitTx(client, orgId, userId, id, parsed.data);
    recordProtocolVisitAdded();
    return { target: `protocol-document:${id}`, payload: { visitId: vid }, body: { documentId: id, visitId: vid } };
  });
});

/* Rename a visit / set its timepoint. Request-scoped connection. */
const visitPatchSchema = z.object({ visitName: z.string().min(1).max(200).optional(), timepoint: z.string().max(120).optional(), reason });
router.patch('/documents/:id/visits/:visitId', async (req, res) => {
  const id = Number(req.params.id);
  const visitId = Number(req.params.visitId);
  if (!Number.isInteger(id) || !Number.isInteger(visitId)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = visitPatchSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  if (parsed.data.visitName === undefined && parsed.data.timepoint === undefined) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Nothing to change — send visitName and/or timepoint.' } });
  await governedScoped(req, res, 'update', parsed.data.reason, async (client, orgId) => {
    await updateVisitTx(client, orgId, id, visitId, parsed.data);
    return { target: `protocol-visit:${visitId}`, payload: { documentId: id }, body: { documentId: id, visitId } };
  });
});

/* Remove a visit (soft delete). A POST with a reason rather than a bodiless
   DELETE, because the governed ledger needs the reason and the shared HTTP
   client does not send a body on DELETE. */
router.post('/documents/:id/visits/:visitId/remove', async (req, res) => {
  const id = Number(req.params.id);
  const visitId = Number(req.params.visitId);
  if (!Number.isInteger(id) || !Number.isInteger(visitId)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = z.object({ reason }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governedScoped(req, res, 'update', parsed.data.reason, async (client, orgId) => {
    await removeVisitTx(client, orgId, id, visitId);
    return { target: `protocol-visit:${visitId}`, payload: { documentId: id, removed: true }, body: { documentId: id, visitId, removed: true } };
  });
});

/* Remove a schedule-of-assessments row (protocol_soa_assessments, soft
   delete). Lives here rather than on /api/protocol-soa because that router
   has no remove and this one is where the tenant-scoped writes are being
   added; the create stays on /api/protocol-soa (one creator per register). */
router.post('/documents/:id/assessments/:assessmentId/remove', async (req, res) => {
  const id = Number(req.params.id);
  const assessmentId = Number(req.params.assessmentId);
  if (!Number.isInteger(id) || !Number.isInteger(assessmentId)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = z.object({ reason }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governedScoped(req, res, 'update', parsed.data.reason, async (client, orgId) => {
    await removeSoaAssessmentTx(client, orgId, id, assessmentId);
    return { target: `protocol-soa-assessment:${assessmentId}`, payload: { documentId: id, removed: true }, body: { documentId: id, assessmentId, removed: true } };
  });
});

const teamSchema = z.object({
  memberName: z.string().min(1).max(300),
  role: z.enum(['principal_investigator', 'co_investigator', 'sub_investigator', 'coordinator', 'biostatistician', 'data_manager', 'pharmacist', 'veterinarian', 'regulatory', 'other']).optional(),
  personnelId: z.number().int().positive().optional(),
  userId: z.number().int().positive().optional(),
  responsibilities: z.string().max(1000).optional(),
  reason,
});
router.post('/documents/:id/team', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = teamSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id: mid } = await addTeamMemberTx(client, orgId, userId, id, parsed.data);
    return { target: `protocol-document:${id}`, payload: { memberId: mid }, body: { documentId: id, memberId: mid } };
  });
});

// ─── Versioning + finalize ───────────────────────────────────────────────────

const versionSchema = z.object({ changeSummary: z.string().max(2000).optional(), reason });
router.post('/documents/:id/versions', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = versionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { version } = await snapshotVersionTx(client, orgId, userId, id, parsed.data.changeSummary);
    recordProtocolVersionSnapshot();
    return { target: `protocol-document:${id}`, payload: { version }, body: { documentId: id, version } };
  });
});

router.post('/documents/:id/finalize', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = z.object({ reason }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'sign', parsed.data.reason, async (client, orgId, userId) => {
    const result = await finalizeProtocolTx(client, orgId, userId, id);
    recordProtocolFinalized();
    return { target: `protocol-document:${id}`, payload: { version: result.version }, body: { documentId: id, ...result } };
  });
});

export default router;
