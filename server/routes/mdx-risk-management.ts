/**
 * Risk management (ISO 14971) — backs Surface 5 of the paying-client beta.
 *
 *   GET    /api/mdx/risk-items?program_id=<UUID>     hazard/harm/risk rows
 *   POST   /api/mdx/risk-items                       create a risk item
 *   GET    /api/mdx/risk-items/:id                   single row + controls
 *   PATCH  /api/mdx/risk-items/:id                   partial update;
 *                                                    to `accepted`, an e-signature
 *   POST   /api/mdx/risk-items/:id/controls          add a risk control
 *   PATCH  /api/mdx/risk-controls/:controlId         update control status
 *   GET    /api/mdx/risk-summary/:programId          aggregate metrics
 *
 * The risk matrix follows the ISO 14971 convention: severity 1..5 ×
 * probability 1..5. initial_risk and residual_risk are stored numerically
 * (the product) and the kit derives the matrix cell client-side.
 *
 * Tenant-scoped via risk_items.organization_id. Audit-logged via global
 * mutation middleware. AnA can create + update via the new tools.
 *
 * D2, fold F1 slice A, 2026-10-29
 * (docs/evidence/D2-ONE-ANA/2026-10-29/fold-f1a-risk-design-controls-safety/):
 *   - A request that names a project (`program_id` on the list,
 *     `:programId` on the summary, `programId` in a create or update body) is
 *     admitted first, through admitProject (server/lib/admit-project.ts, over
 *     programInOrganization): 404 when the organization does not own the live
 *     project, 503 when the check cannot run, and nothing read or written
 *     either way. A project is stored only after that check. The list says
 *     `meta.scope: 'program'` with the `programId`, or `'organization'`.
 *   - Every write takes an editing role (requireEditorAccess, as the UDI and
 *     labeling writes do since 43fb57cc). The reads stay open to every member.
 *   - Accepting a hazard's residual risk is an electronic signature (below).
 */

import { Router, Request, Response, type RequestHandler } from 'express';
import { z } from 'zod';

import { createScopedLogger } from '../utils/logger';
import {
  ok, created, clientError, orgRequired, notFoundInTenant, serverError,
} from '../lib/api-response';
import { pool } from '../db';
import { admitProject as admitProjectShared } from '../lib/admit-project';
import { checkOrgMembership, requireEditorAccess } from '../middleware/orgMembership';
import { DECISION_ACT_MEANINGS } from '../services/part11/signature-meanings';
import { signedActAttempts, signGovernedAct } from './governed-signed-act';

const router = Router();
const log = createScopedLogger('mdx-risk');

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

/** The shared project-ownership refusal (server/lib/admit-project.ts). */
const admitProject = (res: Response, programId: string | null | undefined, orgId: number) =>
  admitProjectShared(res, log, programId, orgId);

/** What a list covers: one project's register, or, with no project named, the organization's. */
function scopeOf(programId: string | null | undefined): { scope: 'program'; programId: string } | { scope: 'organization' } {
  return programId ? { scope: 'program', programId } : { scope: 'organization' };
}

/**
 * An assignee must belong to the risk's organization. `public.users` has no RLS,
 * and the engineering panel (mdx-engineering.ts) joins users on assigned_to to
 * show the owner's name — so an unchecked id here let an editor in one tenant
 * assign another tenant's user and read that user's name back. Refused with 422,
 * not silently dropped; an unverifiable membership throws and fails closed.
 */
async function assigneeRefusal(orgId: number, assignedTo: number | null | undefined): Promise<string | null> {
  if (assignedTo === null || assignedTo === undefined) return null;
  const membership = await checkOrgMembership(assignedTo, orgId);
  if (membership === 'member') return null;
  if (membership === 'revoked') return 'assignedTo is not a member of this organization';
  throw new Error('assignee organization membership could not be verified');
}

/**
 * The checks a hazard write runs before it touches risk_items: the project it
 * names (admitProject), then the assignee (assigneeRefusal). True when one of
 * them has answered the request, and nothing may be written.
 */
async function writeRefused(
  res: Response, orgId: number, programId: string | null | undefined, assignedTo: number | null | undefined,
): Promise<boolean> {
  if (!(await admitProject(res, programId, orgId))) return true;
  const refusal = await assigneeRefusal(orgId, assignedTo);
  if (refusal) {
    clientError(res, 422, refusal);
    return true;
  }
  return false;
}

/**
 * `acceptable: true` records that the hazard's residual risk is acceptable: the
 * same ISO 14971 judgment as accepting it, which the Risk screen counts as a
 * recorded acceptance. Only the signed acceptance sets it (acceptResidualSigned,
 * below). A PATCH that sets it without accepting is refused before the body is
 * read (D2, 2026-10-29). `false` or `null` records no acceptance and passes.
 */
const refuseUnsignedAcceptability: RequestHandler = (req, res, next) => {
  if (req.body?.acceptable !== true || req.body?.status === 'accepted') return next();
  clientError(
    res,
    428,
    "Recording a hazard's residual risk as acceptable is accepting it, an electronic signature: accept its residual risk with your password, what the signature means and a reason. Nothing was saved.",
    { code: 'RESIDUAL_ACCEPTANCE_REQUIRES_SIGNATURE' },
  );
};

/**
 * A hazard is added unaccepted. Accepting its residual risk is the signed act on
 * PATCH /risk-items/:id; a create with status `accepted` was an acceptance with
 * no signature (D2, 2026-10-29). Refused before the body is read.
 */
const refuseAcceptedCreate: RequestHandler = (req, res, next) => {
  if (req.body?.status !== 'accepted') return next();
  clientError(
    res,
    428,
    'Accepting residual risk is an electronic signature: add the hazard, then accept its residual risk with your password, what the signature means and a reason. Nothing was saved.',
    { code: 'RESIDUAL_ACCEPTANCE_REQUIRES_SIGNATURE' },
  );
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCALE_1_5 = z.number().int().min(1).max(5);
const CONTROL_STRATEGY = ['design_eliminate', 'design_reduce', 'protective', 'information'] as const;
const STATUS_ITEM = ['open', 'mitigating', 'verified', 'accepted', 'closed'] as const;
const STATUS_CTRL = ['proposed', 'implemented', 'verified', 'effective'] as const;
const CONTROL_TYPE = ['inherent_safety', 'protective_measure', 'information_safety'] as const;
const SOURCES = ['fmea', 'pha', 'fault_tree', 'literature', 'complaint', 'capa', 'other'] as const;

const listQuery = z.object({
  program_id: z.string().regex(UUID_RE).optional(),
  status:     z.enum(STATUS_ITEM).optional(),
  limit:      z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(500)).optional(),
});

const createItemBody = z.object({
  programId:           z.string().regex(UUID_RE).optional().nullable(),
  refCode:             z.string().max(40).optional().nullable(),
  hazard:              z.string().min(1).max(2000),
  hazardousSituation:  z.string().max(2000).optional().nullable(),
  harm:                z.string().min(1).max(2000),
  sequenceOfEvents:    z.string().max(4000).optional().nullable(),
  severity:            SCALE_1_5,
  probability:         SCALE_1_5,
  detectability:       SCALE_1_5.optional().nullable(),
  controlStrategy:     z.enum(CONTROL_STRATEGY).optional().nullable(),
  source:              z.enum(SOURCES).optional().nullable(),
  status:              z.enum(STATUS_ITEM).optional(),
  assignedTo:          z.number().int().positive().optional().nullable(),
});

const patchItemBody = createItemBody.partial().extend({
  residualSeverity:    SCALE_1_5.optional().nullable(),
  residualProbability: SCALE_1_5.optional().nullable(),
  acceptable:          z.boolean().optional().nullable(),
  benefitRiskRationale: z.string().max(4000).optional().nullable(),
});

const createControlBody = z.object({
  description:            z.string().min(1).max(2000),
  controlType:            z.enum(CONTROL_TYPE),
  implementationEvidence: z.string().max(2000).optional().nullable(),
  verificationEvidence:   z.string().max(2000).optional().nullable(),
  effectivenessEvidence:  z.string().max(2000).optional().nullable(),
  introducesNewRisk:      z.boolean().optional(),
  newRiskItemId:          z.number().int().positive().optional().nullable(),
  status:                 z.enum(STATUS_CTRL).optional(),
});

const patchControlBody = createControlBody.partial();

/* ─── GET /api/mdx/risk-items ─────────────────────────────────────── */

router.get('/risk-items', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  const { program_id: programId, status, limit = 200 } = parsed.data;

  const filters: string[] = [`organization_id = $1`, `deleted_at IS NULL`];
  const args: unknown[] = [orgId];
  if (programId) { args.push(programId); filters.push(`program_id = $${args.length}`); }
  if (status)    { args.push(status);    filters.push(`status = $${args.length}`); }
  args.push(limit);

  try {
    if (!(await admitProject(res, programId, orgId))) return;
    const { rows } = await pool.query(
      `SELECT * FROM risk_items WHERE ${filters.join(' AND ')}
        ORDER BY (residual_risk IS NULL) DESC, residual_risk DESC, initial_risk DESC, updated_at DESC
        LIMIT $${args.length}`,
      args,
    );
    return ok(res, rows, { count: rows.length, ...scopeOf(programId) });
  } catch (err) {
    return serverError(res, log, 'list-items', err);
  }
});

/* ─── POST /api/mdx/risk-items ────────────────────────────────────── */

router.post('/risk-items', requireEditorAccess, refuseAcceptedCreate, async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = createItemBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  const initialRisk = p.severity * p.probability;

  try {
    if (await writeRefused(res, orgId, p.programId, p.assignedTo)) return;
    const { rows } = await pool.query(
      `INSERT INTO risk_items (
         organization_id, program_id, ref_code, hazard, hazardous_situation, harm,
         sequence_of_events, severity, probability, detectability, initial_risk,
         control_strategy, status, source, assigned_to
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
       )
       RETURNING *`,
      [
        orgId, p.programId ?? null, p.refCode ?? null, p.hazard, p.hazardousSituation ?? null,
        p.harm, p.sequenceOfEvents ?? null, p.severity, p.probability, p.detectability ?? null,
        initialRisk, p.controlStrategy ?? null, p.status ?? 'open', p.source ?? null,
        p.assignedTo ?? null,
      ],
    );
    return created(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'create-item', err);
  }
});

/* ─── GET /api/mdx/risk-items/:id ─────────────────────────────────── */

router.get('/risk-items/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');

  try {
    const { rows } = await pool.query(
      `SELECT * FROM risk_items WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, orgId],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Risk item');
    const controls = await pool.query(
      `SELECT * FROM risk_controls WHERE risk_item_id = $1 ORDER BY id`,
      [id],
    );
    return ok(res, { ...rows[0], controls: controls.rows });
  } catch (err) {
    return serverError(res, log, 'get-item', err);
  }
});

/* ─── PATCH /api/mdx/risk-items/:id ───────────────────────────────── */

/* ─── Accepting residual risk: an electronic signature ───────────────────────
   ISO 14971 leaves the acceptance of a hazard's residual risk to a documented
   human decision, and the product tour calls it "a signed human judgment"
   (shared/navigation/demo-scripts.ts). Until 2026-10-29 the PATCH below set
   status `accepted` from a session alone: no editor gate, no
   re-authentication (21 CFR 11.200), no declared meaning (11.50(a)(3)), no
   reason, and no electronic_signatures row (11.50, 11.70).

   A PATCH to `accepted` now runs the platform's one route-level signing
   ceremony, signGovernedAct (./governed-signed-act.ts), as the labeling
   translation approval does on its route (mdx-labeling.ts, 96537cfe). In order:
     1. signing authority, before the password;
     2. the password, and the second factor when one is enrolled;
     3. on one transaction: status `accepted` and `acceptable` true, the
        `sign` ledger pair and the signature row.
   `acceptable: true` is the same judgment, so a PATCH that sets it without
   accepting answers 428 (refuseUnsignedAcceptability). Any other status change
   asks for nothing, as before.

   Not here: separation of duties. risk_items records no author, so there is no
   one to compare the signer with. */

/** The per-signer signing-attempt limit, only for the requests that sign. */
const whenAccepting: RequestHandler = (req, res, next) =>
  req.body?.status === 'accepted' ? signedActAttempts(req, res, next) : next();

/** The acceptance's own refusals, by code, for signGovernedAct. */
const RESIDUAL_ACCEPTANCE_CODE_STATUS = {
  RISK_ITEM_NOT_FOUND: 404,
  RISK_ALREADY_ACCEPTED: 409,
} as const;

function acceptanceRefused(code: keyof typeof RESIDUAL_ACCEPTANCE_CODE_STATUS, message: string): Error {
  return Object.assign(new Error(message), { code });
}

type AcceptedHazardRow = {
  program_id: string | null; ref_code: string | null; hazard: string; harm: string; status: string;
  severity: number; probability: number; initial_risk: number | null;
  residual_severity: number | null; residual_probability: number | null; residual_risk: number | null;
  acceptable: boolean | null; benefit_risk_rationale: string | null;
};

/** What was accepted, for the ledger and the signature manifest: the hazard as it stood. */
function acceptedHazard(id: number, h: AcceptedHazardRow): Record<string, unknown> {
  return {
    riskItemId: id,
    refCode: h.ref_code,
    programId: h.program_id,
    hazard: h.hazard,
    harm: h.harm,
    previousStatus: h.status,
    severity: h.severity,
    probability: h.probability,
    initialRisk: h.initial_risk,
    residualSeverity: h.residual_severity,
    residualProbability: h.residual_probability,
    residualRisk: h.residual_risk,
    previousAcceptable: h.acceptable,
    acceptable: true,
    benefitRiskRationaleRecorded: Boolean(h.benefit_risk_rationale),
  };
}

/** The signed acceptance of risk item `id`'s residual risk. Answers the request itself. */
async function acceptResidualSigned(
  req: Request, res: Response, id: number, patch: Record<string, unknown>,
): Promise<void> {
  /* The signature covers the hazard as it stands. A field edited in the same
     request would be signed before anyone reviewed it. */
  const edits = Object.keys(patch).filter(
    (k) => k !== 'status' && patch[k] !== undefined && !(k === 'acceptable' && patch[k] === true),
  );
  if (edits.length > 0) {
    res.status(400).json({ error: {
      code: 'RESIDUAL_ACCEPTANCE_EDITS_FIELDS',
      message: `An acceptance signs the hazard's residual risk as it stands. Save the change to ${edits.join(', ')} first, then accept it. Nothing was signed.`,
    } });
    return;
  }
  const target = `risk-item:${id}`;
  await signGovernedAct(req, res, {
    domain: 'risk',
    target,
    meanings: DECISION_ACT_MEANINGS,
    codeStatus: RESIDUAL_ACCEPTANCE_CODE_STATUS,
    run: async (client, orgId) => {
      /* On the signing transaction, under the ceremony's lock on this target
         (DP-65): a second acceptance waits here and then reads what the first
         left. The hazard must be live and the organization's. */
      const { rows } = await client.query<AcceptedHazardRow>(
        `SELECT program_id, ref_code, hazard, harm, status, severity, probability, initial_risk,
                residual_severity, residual_probability, residual_risk, acceptable, benefit_risk_rationale
           FROM risk_items
          WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
          FOR UPDATE`,
        [id, orgId],
      );
      const current = rows[0];
      if (!current) throw acceptanceRefused('RISK_ITEM_NOT_FOUND', 'Risk item not found. Nothing was signed.');
      if (current.status === 'accepted') {
        throw acceptanceRefused('RISK_ALREADY_ACCEPTED', "This hazard's residual risk is already accepted. Nothing was signed.");
      }
      const updated = await client.query(
        `UPDATE risk_items SET status = 'accepted', acceptable = TRUE, updated_at = NOW()
          WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
          RETURNING *`,
        [id, orgId],
      );
      return { target, payload: acceptedHazard(id, current), body: { data: updated.rows[0] } };
    },
  });
}

router.patch('/risk-items/:id', requireEditorAccess, refuseUnsignedAcceptability, whenAccepting, async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = patchItemBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  if (parsed.data.status === 'accepted') return acceptResidualSigned(req, res, id, parsed.data);

  const COL: Record<string, string> = {
    programId: 'program_id', refCode: 'ref_code', hazard: 'hazard',
    hazardousSituation: 'hazardous_situation', harm: 'harm',
    sequenceOfEvents: 'sequence_of_events', severity: 'severity',
    probability: 'probability', detectability: 'detectability',
    residualSeverity: 'residual_severity', residualProbability: 'residual_probability',
    controlStrategy: 'control_strategy', acceptable: 'acceptable',
    benefitRiskRationale: 'benefit_risk_rationale', status: 'status',
    source: 'source', assignedTo: 'assigned_to',
  };
  const setFrags: string[] = [];
  const args: unknown[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    const col = COL[k];
    if (!col) continue;
    args.push(v);
    setFrags.push(`${col} = $${args.length}`);
  }
  /* ── Recompute the risk products from POST-UPDATE component values ──
     Both products used to go stale on a partial update:

       initial_risk   was never recomputed at all — the code carried a
                      comment saying there was "no clean way" to do it in
                      one statement, so raising a hazard's severity from 2
                      to 5 left initial_risk showing the old product.
       residual_risk  was recomputed only when residualSeverity AND
                      residualProbability arrived together. Sending one
                      alone left a stored product contradicting its own
                      components.

     A stale risk score is not a cosmetic defect: these columns drive the
     ISO 14971 matrix, the "high residual" counts on the risk dashboard,
     and the acceptability banding. A hazard can silently sit in the
     wrong band while its own severity and probability say otherwise.

     There is in fact a clean single-statement form. In Postgres the
     right-hand side of SET sees the OLD row, so COALESCE(<new>, <col>)
     yields the new value when the caller supplied one and the existing
     value when they did not — giving the correct post-update product
     whichever subset of the four components was sent. */
  const touchesInitial =
    parsed.data.severity !== undefined || parsed.data.probability !== undefined;
  if (touchesInitial) {
    args.push(parsed.data.severity ?? null);
    const sevArg = args.length;
    args.push(parsed.data.probability ?? null);
    const probArg = args.length;
    setFrags.push(
      `initial_risk = COALESCE($${sevArg}::int, severity) * COALESCE($${probArg}::int, probability)`,
    );
  }

  const touchesResidual =
    parsed.data.residualSeverity !== undefined ||
    parsed.data.residualProbability !== undefined;
  if (touchesResidual) {
    args.push(parsed.data.residualSeverity ?? null);
    const rSevArg = args.length;
    args.push(parsed.data.residualProbability ?? null);
    const rProbArg = args.length;
    /* Residual components are nullable — a hazard with no mitigation yet
       has no residual estimate. NULL * anything is NULL, so an
       unestimated residual stays NULL rather than becoming a misleading
       zero, and the surface renders it as "not yet assessed". */
    setFrags.push(
      `residual_risk = COALESCE($${rSevArg}::int, residual_severity) * COALESCE($${rProbArg}::int, residual_probability)`,
    );
  }
  if (setFrags.length === 0) return clientError(res, 422, 'No updatable fields in body');
  setFrags.push(`updated_at = NOW()`);
  args.push(id, orgId);

  try {
    if (await writeRefused(res, orgId, parsed.data.programId, parsed.data.assignedTo)) return;
    const { rows } = await pool.query(
      `UPDATE risk_items SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 1} AND organization_id = $${args.length} AND deleted_at IS NULL
        RETURNING *`,
      args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Risk item');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'patch-item', err);
  }
});

/* ─── POST /api/mdx/risk-items/:id/controls ───────────────────────── */

router.post('/risk-items/:id/controls', requireEditorAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const itemId = Number(req.params.id);
  if (!Number.isFinite(itemId)) return clientError(res, 422, 'id must be numeric');
  const parsed = createControlBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;

  /* Verify the risk item belongs to the caller's org before inserting. */
  const own = await pool.query(
    `SELECT 1 FROM risk_items WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [itemId, orgId],
  );
  if (own.rows.length === 0) return notFoundInTenant(res, 'Risk item');

  try {
    const { rows } = await pool.query(
      `INSERT INTO risk_controls (
         risk_item_id, organization_id, description, control_type,
         implementation_evidence, verification_evidence, effectiveness_evidence,
         introduces_new_risk, new_risk_item_id, status
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
       )
       RETURNING *`,
      [
        itemId, orgId, p.description, p.controlType,
        p.implementationEvidence ?? null, p.verificationEvidence ?? null,
        p.effectivenessEvidence ?? null, p.introducesNewRisk ?? false,
        p.newRiskItemId ?? null, p.status ?? 'proposed',
      ],
    );
    return created(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'create-control', err);
  }
});

/* ─── PATCH /api/mdx/risk-controls/:controlId ─────────────────────── */

router.patch('/risk-controls/:controlId', requireEditorAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const ctrlId = Number(req.params.controlId);
  if (!Number.isFinite(ctrlId)) return clientError(res, 422, 'controlId must be numeric');
  const parsed = patchControlBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);

  const COL: Record<string, string> = {
    description: 'description', controlType: 'control_type',
    implementationEvidence: 'implementation_evidence',
    verificationEvidence: 'verification_evidence',
    effectivenessEvidence: 'effectiveness_evidence',
    introducesNewRisk: 'introduces_new_risk',
    newRiskItemId: 'new_risk_item_id', status: 'status',
  };
  const setFrags: string[] = [];
  const args: unknown[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    const col = COL[k];
    if (!col) continue;
    args.push(v);
    setFrags.push(`${col} = $${args.length}`);
  }
  if (setFrags.length === 0) return clientError(res, 422, 'No updatable fields in body');
  setFrags.push(`updated_at = NOW()`);
  args.push(ctrlId, orgId);

  try {
    const { rows } = await pool.query(
      `UPDATE risk_controls SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 1} AND organization_id = $${args.length}
        RETURNING *`,
      args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Risk control');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'patch-control', err);
  }
});

/* ─── GET /api/mdx/risk-summary/:programId ────────────────────────── */

router.get('/risk-summary/:programId', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const programId = String(req.params.programId);
  if (!UUID_RE.test(programId)) return clientError(res, 422, 'programId must be a UUID');

  try {
    if (!(await admitProject(res, programId, orgId))) return;
    const { rows } = await pool.query<{
      total: number; open: number; high_residual: number; accepted: number;
      avg_initial: number | null; avg_residual: number | null;
    }>(
      `SELECT
          COUNT(*)::int                                         AS total,
          COUNT(*) FILTER (WHERE status IN ('open','mitigating'))::int AS open,
          COUNT(*) FILTER (WHERE residual_risk >= 15)::int      AS high_residual,
          COUNT(*) FILTER (WHERE status = 'accepted')::int      AS accepted,
          AVG(initial_risk)::numeric(10,2)                      AS avg_initial,
          AVG(residual_risk)::numeric(10,2)                     AS avg_residual
         FROM risk_items
        WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL`,
      [orgId, programId],
    );
    const r = rows[0] ?? { total: 0, open: 0, high_residual: 0, accepted: 0, avg_initial: null, avg_residual: null };
    return ok(res, {
      total:         r.total,
      open:          r.open,
      highResidual:  r.high_residual,
      accepted:      r.accepted,
      avgInitial:    r.avg_initial !== null ? Number(r.avg_initial) : null,
      avgResidual:   r.avg_residual !== null ? Number(r.avg_residual) : null,
    });
  } catch (err) {
    return serverError(res, log, 'summary', err);
  }
});

export default router;
