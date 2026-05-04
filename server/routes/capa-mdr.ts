/**
 * CAPA / complaint / MDR / vigilance routes — mounted at /api/capa-mdr.
 *
 *   Triage queue
 *     GET    /api/capa-mdr/triage?program_id=...&open_only=true
 *
 *   Complaints
 *     GET    /api/capa-mdr/complaints
 *     POST   /api/capa-mdr/complaints
 *     GET    /api/capa-mdr/complaints/:id
 *     POST   /api/capa-mdr/complaints/:id/transition
 *
 *   MDR events
 *     GET    /api/capa-mdr/mdr-events
 *     POST   /api/capa-mdr/mdr-events
 *     GET    /api/capa-mdr/mdr-events/:id
 *     POST   /api/capa-mdr/mdr-events/:id/transition
 *
 *   CAPA records
 *     GET    /api/capa-mdr/capa
 *     POST   /api/capa-mdr/capa
 *     GET    /api/capa-mdr/capa/:id
 *     POST   /api/capa-mdr/capa/:id/transition
 *     POST   /api/capa-mdr/capa/:id/actions
 *     POST   /api/capa-mdr/capa/actions/:actionId/transition
 *
 *   Vigilance timeline
 *     GET    /api/capa-mdr/vigilance?program_id=...&entity_type=...&entity_id=...
 *
 * All endpoints require an authenticated user with an organization context.
 * Per-program access control is enforced inside the service via JOINs against
 * regulatoryPrograms.organization_id.
 */

import { Router, Request, Response } from 'express';

import { authenticateToken } from '../middleware/auth';
import {
  createComplaint,
  listComplaints,
  getComplaint,
  transitionComplaint,
  createMdrEvent,
  listMdrEvents,
  getMdrEvent,
  transitionMdrEvent,
  createCapaRecord,
  listCapaRecords,
  getCapaRecord,
  transitionCapa,
  addCapaAction,
  transitionCapaAction,
  listVigilanceEvents,
  getTriageQueue,
  TenantAccessError,
  NotFoundError,
} from '../services/capa-mdr/capaMdr.service';
import { InvalidTransitionError } from '../services/capa-mdr/stateMachine';
import {
  COMPLAINT_SOURCES,
  COMPLAINT_CHANNELS,
  COMPLAINT_STATES,
  HARM_LEVELS,
  SEVERITY_LEVELS,
  MDR_JURISDICTIONS,
  FDA_MDR_REPORT_TYPES,
  EU_MDR_SEVERITY,
  MDR_STATES,
  CAPA_TYPES,
  CAPA_SOURCES,
  CAPA_STATES,
  RISK_LEVELS,
  ACTION_STATES,
  ACTION_TYPES,
  VIGILANCE_EVENT_KINDS,
} from '../../shared/schema/capa-mdr';

const router = Router();
router.use(authenticateToken);

// ─── helpers ────────────────────────────────────────────────────────────────

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

function getUserId(req: Request): string | null {
  const raw = (req as any).user?.id;
  if (raw === undefined || raw === null) return null;
  return typeof raw === 'string' ? raw : String(raw);
}

function getUserRole(req: Request): string | null {
  const raw = (req as any).user?.role;
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

function parseDate(v: unknown): Date | null {
  if (typeof v !== 'string' || v.length === 0) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function inSet<T extends string>(set: readonly T[], v: unknown): v is T {
  return typeof v === 'string' && (set as readonly string[]).includes(v);
}

/**
 * Read a path param as a string. Express's `req.params[k]` is typed as
 * `string | string[]` (Express 5 + path-to-regexp v7) but path params with
 * single-value capture groups are always `string` at runtime.
 */
function pathParam(req: Request, key: string): string {
  const v = req.params[key];
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

/**
 * Read a query param as a single string when present, otherwise undefined.
 * Express types query values as `string | string[] | ParsedQs | ParsedQs[]`.
 */
function queryParam(req: Request, key: string): string | undefined {
  const v = req.query[key];
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return undefined;
}

function err(res: Response, e: unknown): Response {
  if (e instanceof TenantAccessError) return res.status(403).json({ error: e.message });
  if (e instanceof NotFoundError) return res.status(404).json({ error: e.message });
  if (e instanceof InvalidTransitionError) return res.status(422).json({ error: e.message });
  const detail = e instanceof Error ? e.message : 'unknown';
  return res.status(500).json({ error: 'Operation failed', detail });
}

// ─── Triage queue ───────────────────────────────────────────────────────────

router.get('/triage', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });

  try {
    const limitRaw = queryParam(req, 'limit');
    const items = await getTriageQueue(orgId, {
      programId: queryParam(req, 'program_id'),
      openOnly: queryParam(req, 'open_only') !== 'false',
      limit: limitRaw ? parseInt(limitRaw, 10) || undefined : undefined,
    });
    res.json({ items, count: items.length });
  } catch (e) {
    err(res, e);
  }
});

// ─── Complaints ─────────────────────────────────────────────────────────────

router.get('/complaints', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });

  try {
    const stateRaw = queryParam(req, 'state');
    const sourceRaw = queryParam(req, 'source');
    const severityRaw = queryParam(req, 'severity');
    const rows = await listComplaints(orgId, {
      programId: queryParam(req, 'program_id'),
      state: inSet(COMPLAINT_STATES, stateRaw) ? stateRaw : undefined,
      source: inSet(COMPLAINT_SOURCES, sourceRaw) ? sourceRaw : undefined,
      severity: inSet(SEVERITY_LEVELS, severityRaw) ? severityRaw : undefined,
      openOnly: queryParam(req, 'open_only') === 'true',
    });
    res.json({ rows, count: rows.length });
  } catch (e) {
    err(res, e);
  }
});

router.post('/complaints', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });

  const body = req.body ?? {};
  if (typeof body.programId !== 'string' || body.programId.length === 0) {
    return res.status(422).json({ error: 'programId is required' });
  }
  if (!inSet(COMPLAINT_SOURCES, body.source)) {
    return res.status(422).json({ error: `source must be one of: ${COMPLAINT_SOURCES.join(', ')}` });
  }
  if (!inSet(COMPLAINT_CHANNELS, body.channel)) {
    return res.status(422).json({ error: `channel must be one of: ${COMPLAINT_CHANNELS.join(', ')}` });
  }
  const receivedAt = parseDate(body.receivedAt);
  if (!receivedAt) return res.status(422).json({ error: 'receivedAt must be ISO-8601' });
  if (typeof body.eventNarrative !== 'string' || body.eventNarrative.trim().length === 0) {
    return res.status(422).json({ error: 'eventNarrative is required' });
  }
  if (body.patientHarm !== undefined && !inSet(HARM_LEVELS, body.patientHarm)) {
    return res.status(422).json({ error: `patientHarm must be one of: ${HARM_LEVELS.join(', ')}` });
  }
  if (body.severityAssessment !== undefined && !inSet(SEVERITY_LEVELS, body.severityAssessment)) {
    return res.status(422).json({ error: `severityAssessment must be one of: ${SEVERITY_LEVELS.join(', ')}` });
  }

  try {
    const row = await createComplaint(orgId, {
      programId: body.programId,
      source: body.source,
      channel: body.channel,
      receivedAt,
      reporter: body.reporter ?? null,
      deviceUdiDi: body.deviceUdiDi ?? null,
      deviceLot: body.deviceLot ?? null,
      deviceSerial: body.deviceSerial ?? null,
      deviceModel: body.deviceModel ?? null,
      eventDate: parseDate(body.eventDate),
      eventLocationCountry: body.eventLocationCountry ?? null,
      eventNarrative: body.eventNarrative,
      patientHarm: body.patientHarm,
      severityAssessment: body.severityAssessment,
      isMalfunction: body.isMalfunction === true,
      anticipatesCorrection: body.anticipatesCorrection === true,
      trendThresholdCrossed: body.trendThresholdCrossed === true,
      createdBy: getUserId(req),
    });
    res.status(201).json(row);
  } catch (e) {
    err(res, e);
  }
});

router.get('/complaints/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });

  try {
    const row = await getComplaint(orgId, pathParam(req, 'id'));
    if (!row) return res.status(404).json({ error: 'Complaint not found' });
    res.json(row);
  } catch (e) {
    err(res, e);
  }
});

router.post('/complaints/:id/transition', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });

  const body = req.body ?? {};
  if (!inSet(COMPLAINT_STATES, body.to)) {
    return res.status(422).json({ error: `to must be one of: ${COMPLAINT_STATES.join(', ')}` });
  }

  try {
    const row = await transitionComplaint(orgId, pathParam(req, 'id'), {
      to: body.to,
      triageDecision: body.triageDecision ?? null,
      closureReason: body.closureReason ?? null,
      reason: typeof body.reason === 'string' ? body.reason : null,
      actor: getUserId(req),
      actorRole: getUserRole(req),
    });
    res.json(row);
  } catch (e) {
    err(res, e);
  }
});

// ─── MDR events ─────────────────────────────────────────────────────────────

router.get('/mdr-events', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });

  try {
    const stateRaw = queryParam(req, 'state');
    const jurisdictionRaw = queryParam(req, 'jurisdiction');
    const rows = await listMdrEvents(orgId, {
      programId: queryParam(req, 'program_id'),
      state: inSet(MDR_STATES, stateRaw) ? stateRaw : undefined,
      jurisdiction: inSet(MDR_JURISDICTIONS, jurisdictionRaw) ? jurisdictionRaw : undefined,
      overdueOnly: queryParam(req, 'overdue') === 'true',
    });
    res.json({ rows, count: rows.length });
  } catch (e) {
    err(res, e);
  }
});

router.post('/mdr-events', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });

  const body = req.body ?? {};
  if (typeof body.programId !== 'string' || body.programId.length === 0) {
    return res.status(422).json({ error: 'programId is required' });
  }
  if (!inSet(MDR_JURISDICTIONS, body.jurisdiction)) {
    return res.status(422).json({ error: `jurisdiction must be one of: ${MDR_JURISDICTIONS.join(', ')}` });
  }
  const decisionDate = parseDate(body.decisionDate);
  if (!decisionDate) return res.status(422).json({ error: 'decisionDate must be ISO-8601' });
  if (typeof body.eventNarrative !== 'string' || body.eventNarrative.trim().length === 0) {
    return res.status(422).json({ error: 'eventNarrative is required' });
  }
  if (body.usFdaReportType !== undefined && body.usFdaReportType !== null
      && !inSet(FDA_MDR_REPORT_TYPES, body.usFdaReportType)) {
    return res.status(422).json({ error: `usFdaReportType must be one of: ${FDA_MDR_REPORT_TYPES.join(', ')}` });
  }
  if (body.euMdrSeverity !== undefined && body.euMdrSeverity !== null
      && !inSet(EU_MDR_SEVERITY, body.euMdrSeverity)) {
    return res.status(422).json({ error: `euMdrSeverity must be one of: ${EU_MDR_SEVERITY.join(', ')}` });
  }

  try {
    const row = await createMdrEvent(orgId, {
      programId: body.programId,
      sourceComplaintId: body.sourceComplaintId ?? null,
      jurisdiction: body.jurisdiction,
      usFdaReportType: body.usFdaReportType ?? null,
      euMdrSeverity: body.euMdrSeverity ?? null,
      decisionDate,
      eventNarrative: body.eventNarrative,
      fdaPatientCode: body.fdaPatientCode ?? null,
      fdaDeviceProblemCode: body.fdaDeviceProblemCode ?? null,
      fdaHealthEffectCode: body.fdaHealthEffectCode ?? null,
      patientOutcome: body.patientOutcome ?? null,
      correctionsTaken: body.correctionsTaken ?? null,
      attachmentRefs: Array.isArray(body.attachmentRefs) ? body.attachmentRefs : undefined,
      createdBy: getUserId(req),
    });
    res.status(201).json(row);
  } catch (e) {
    err(res, e);
  }
});

router.get('/mdr-events/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });

  try {
    const row = await getMdrEvent(orgId, pathParam(req, 'id'));
    if (!row) return res.status(404).json({ error: 'MDR event not found' });
    res.json(row);
  } catch (e) {
    err(res, e);
  }
});

router.post('/mdr-events/:id/transition', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });

  const body = req.body ?? {};
  if (!inSet(MDR_STATES, body.to)) {
    return res.status(422).json({ error: `to must be one of: ${MDR_STATES.join(', ')}` });
  }

  try {
    const row = await transitionMdrEvent(orgId, pathParam(req, 'id'), {
      to: body.to,
      reason: typeof body.reason === 'string' ? body.reason : null,
      fdaReportNumber: body.fdaReportNumber ?? null,
      euReportNumber: body.euReportNumber ?? null,
      reportConfirmationCode: body.reportConfirmationCode ?? null,
      actor: getUserId(req),
      actorRole: getUserRole(req),
    });
    res.json(row);
  } catch (e) {
    err(res, e);
  }
});

// ─── CAPA records ───────────────────────────────────────────────────────────

router.get('/capa', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });

  try {
    const stateRaw = queryParam(req, 'state');
    const sourceRaw = queryParam(req, 'source');
    const riskRaw = queryParam(req, 'risk_level');
    const rows = await listCapaRecords(orgId, {
      programId: queryParam(req, 'program_id'),
      state: inSet(CAPA_STATES, stateRaw) ? stateRaw : undefined,
      source: inSet(CAPA_SOURCES, sourceRaw) ? sourceRaw : undefined,
      riskLevel: inSet(RISK_LEVELS, riskRaw) ? riskRaw : undefined,
      openOnly: queryParam(req, 'open_only') === 'true',
    });
    res.json({ rows, count: rows.length });
  } catch (e) {
    err(res, e);
  }
});

router.post('/capa', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });

  const body = req.body ?? {};
  if (typeof body.programId !== 'string' || body.programId.length === 0) {
    return res.status(422).json({ error: 'programId is required' });
  }
  if (typeof body.title !== 'string' || body.title.trim().length === 0) {
    return res.status(422).json({ error: 'title is required' });
  }
  if (!inSet(CAPA_TYPES, body.type)) {
    return res.status(422).json({ error: `type must be one of: ${CAPA_TYPES.join(', ')}` });
  }
  if (!inSet(CAPA_SOURCES, body.source)) {
    return res.status(422).json({ error: `source must be one of: ${CAPA_SOURCES.join(', ')}` });
  }
  if (body.riskLevel !== undefined && !inSet(RISK_LEVELS, body.riskLevel)) {
    return res.status(422).json({ error: `riskLevel must be one of: ${RISK_LEVELS.join(', ')}` });
  }

  try {
    const row = await createCapaRecord(orgId, {
      programId: body.programId,
      title: body.title,
      summary: body.summary ?? null,
      type: body.type,
      source: body.source,
      sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : undefined,
      riskLevel: body.riskLevel,
      assignedTo: body.assignedTo ?? null,
      targetCloseDate: parseDate(body.targetCloseDate),
      problemStatement: body.problemStatement ?? null,
      createdBy: getUserId(req),
    });
    res.status(201).json(row);
  } catch (e) {
    err(res, e);
  }
});

router.get('/capa/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });

  try {
    const row = await getCapaRecord(orgId, pathParam(req, 'id'));
    if (!row) return res.status(404).json({ error: 'CAPA not found' });
    res.json(row);
  } catch (e) {
    err(res, e);
  }
});

router.post('/capa/:id/transition', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });

  const body = req.body ?? {};
  if (!inSet(CAPA_STATES, body.to)) {
    return res.status(422).json({ error: `to must be one of: ${CAPA_STATES.join(', ')}` });
  }

  try {
    const row = await transitionCapa(orgId, pathParam(req, 'id'), {
      to: body.to,
      reason: typeof body.reason === 'string' ? body.reason : null,
      effectivenessCheckResult: body.effectivenessCheckResult ?? null,
      actor: getUserId(req),
      actorRole: getUserRole(req),
    });
    res.json(row);
  } catch (e) {
    err(res, e);
  }
});

router.post('/capa/:id/actions', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });

  const body = req.body ?? {};
  if (!inSet(ACTION_TYPES, body.type)) {
    return res.status(422).json({ error: `type must be one of: ${ACTION_TYPES.join(', ')}` });
  }
  if (typeof body.description !== 'string' || body.description.trim().length === 0) {
    return res.status(422).json({ error: 'description is required' });
  }

  try {
    const row = await addCapaAction(orgId, {
      capaId: pathParam(req, 'id'),
      type: body.type,
      description: body.description,
      owner: body.owner ?? null,
      dueDate: parseDate(body.dueDate),
      actor: getUserId(req),
    });
    res.status(201).json(row);
  } catch (e) {
    err(res, e);
  }
});

router.post('/capa/actions/:actionId/transition', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });

  const body = req.body ?? {};
  if (!inSet(ACTION_STATES, body.to)) {
    return res.status(422).json({ error: `to must be one of: ${ACTION_STATES.join(', ')}` });
  }

  try {
    const row = await transitionCapaAction(orgId, pathParam(req, 'actionId'), {
      to: body.to,
      evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : undefined,
      reason: typeof body.reason === 'string' ? body.reason : null,
      actor: getUserId(req),
    });
    res.json(row);
  } catch (e) {
    err(res, e);
  }
});

// ─── Vigilance timeline ─────────────────────────────────────────────────────

router.get('/vigilance', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });

  const programId = queryParam(req, 'program_id');
  if (!programId) {
    return res.status(422).json({ error: 'program_id query param is required' });
  }

  const validEntityTypes = ['complaint', 'mdr_event', 'capa_record', 'capa_action'] as const;
  const entityTypeRaw = queryParam(req, 'entity_type');
  if (entityTypeRaw !== undefined && !inSet(validEntityTypes, entityTypeRaw)) {
    return res.status(422).json({ error: `entity_type must be one of: ${validEntityTypes.join(', ')}` });
  }

  try {
    const kindRaw = queryParam(req, 'kind');
    const limitRaw = queryParam(req, 'limit');
    const rows = await listVigilanceEvents(orgId, {
      programId,
      entityType: inSet(validEntityTypes, entityTypeRaw) ? entityTypeRaw : undefined,
      entityId: queryParam(req, 'entity_id'),
      kind: inSet(VIGILANCE_EVENT_KINDS, kindRaw) ? kindRaw : undefined,
      limit: limitRaw ? parseInt(limitRaw, 10) || undefined : undefined,
    });
    res.json({ rows, count: rows.length });
  } catch (e) {
    err(res, e);
  }
});

export default router;
