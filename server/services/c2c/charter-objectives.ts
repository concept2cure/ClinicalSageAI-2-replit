/**
 * A project's objective of record: its charter's `objectives` section.
 *
 * The founder (P-80, 2026-11-01): a project states "what the ultimate objective
 * of the study was", and what a project holds is immutable with its whole
 * history (P-79). The plan (docs/design/ONE_DESIGN_PLAN.md §1a, S1) found three
 * stores that could hold it and chose the program charter (P-82), because its
 * sections are versioned and content-hashed (21 CFR 11.70(b)) and every change
 * is an append-only charter_audit_events row with its before and after
 * (migrations/20260911_charter_audit_immutability.sql). This module completes
 * that charter for one purpose: reading and recording the objectives section.
 * It adds no table: project_charters, charter_sections and charter_audit_events
 * exist on every applier.
 *
 * The objective carries its sources (the protocol section, the trial registry
 * entry, the sponsor's release or publication, a data-room item), so a reader
 * can see where it was taken from. A person records it, with a reason. AnA
 * reads the current version on every turn (objectivesContextBlock).
 *
 * @module server/services/c2c/charter-objectives
 */
import { createHash } from 'crypto';
import { and, desc, eq } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { charterAuditEvents, charterSections, projectCharters } from '@shared/schema/project-charter';
import { requestDb, requestPgClient } from '../../db/requestDb';
import auditService from '../auditService';
import { ProjectAdmissionRefusal, requireProjectAdmission } from '../../routes/c2c/project-access';
import { createScopedLogger } from '../../utils/logger.js';

const log = createScopedLogger('charter-objectives');

export const OBJECTIVES_SECTION_KEY = 'objectives';
export const OBJECTIVE_SOURCE_KINDS = ['protocol', 'registry', 'publication', 'press_release', 'data_room', 'other'] as const;

const httpUrl = z.string().trim().max(2000).url().refine((u) => /^https?:\/\//i.test(u), 'An http or https address');

export const objectivesBodySchema = z.object({
  objective: z.string().trim().min(1).max(4000),
  successCriteria: z.string().trim().max(8000).optional(),
  sources: z.array(z.object({
    kind: z.enum(OBJECTIVE_SOURCE_KINDS),
    title: z.string().trim().min(1).max(500),
    url: httpUrl.optional(),
    locator: z.string().trim().max(500).optional(),
  }).strict()).max(20).default([]),
  /** Why this version is recorded: 21 CFR 11.10(e) asks a change to say why. */
  reason: z.string().trim().min(1).max(1000),
}).strict();

export type ObjectivesBody = z.infer<typeof objectivesBodySchema>;
export interface ObjectivesContent {
  objective: string;
  successCriteria: string | null;
  sources: ObjectivesBody['sources'];
}
export interface CurrentObjectives {
  content: ObjectivesContent;
  version: number;
  contentHash: string;
  status: string;
  updatedAt: string;
  updatedBy: number | null;
}
export interface ObjectivesHistoryEntry {
  version: number | null;
  eventType: string;
  occurredAt: string;
  actorUserId: number;
  reason: string | null;
  content: ObjectivesContent | null;
}
export interface ObjectivesRecord {
  charterId: number | null;
  current: CurrentObjectives | null;
  history: ObjectivesHistoryEntry[];
}

/** The program fields a charter is classified from. */
export interface ProgramClassificationInput {
  programType: string | null;
  primaryAgency: string | null;
  productName: string | null;
}

export class CharterObjectivesRefusal extends Error {
  constructor(readonly status: 400 | 404 | 409, readonly code: string, message: string) {
    super(message);
    this.name = 'CharterObjectivesRefusal';
  }
}

// The charter's own vocabularies (server/routes/charters.ts SUBMISSION_TYPES and
// REGULATORY_REGIONS), keyed by the program's values.
const SUBMISSION_TYPE: Record<string, string> = {
  ind: 'IND', nda: 'NDA', bla: 'BLA', '510k': '510K', pma: 'PMA', maa: 'MAA',
  de_novo: 'DE_NOVO', denovo: 'DE_NOVO', eua: 'EUA', ivdr: 'IVDR',
};
const REGION: Record<string, string> = {
  FDA: 'FDA', EMA: 'EMA', PMDA: 'PMDA', MHRA: 'MHRA', HC: 'HealthCanada', HEALTHCANADA: 'HealthCanada',
  HEALTH_CANADA: 'HealthCanada', TGA: 'TGA', NMPA: 'NMPA',
};

/** The charter classification a program implies, or a refusal naming what it lacks. */
export function charterClassification(p: ProgramClassificationInput): { submissionType: string; regulatoryRegion: string; productName: string } {
  const submissionType = SUBMISSION_TYPE[String(p.programType ?? '').trim().toLowerCase()];
  const regulatoryRegion = REGION[String(p.primaryAgency ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_')];
  const productName = String(p.productName ?? '').trim();
  const missing = [!submissionType && 'an application type the charter knows', !regulatoryRegion && 'a primary agency the charter knows', !productName && 'a product name']
    .filter(Boolean);
  if (missing.length) {
    throw new CharterObjectivesRefusal(409, 'CHARTER_CLASSIFICATION_MISSING',
      `This project's charter cannot be started: the project records no ${missing.join(', no ')}. Complete the project's details first.`);
  }
  return { submissionType: submissionType!, regulatoryRegion: regulatoryRegion!, productName };
}

/** Sorted keys, no whitespace: the same content always hashes the same. */
function canonical(content: ObjectivesContent): string {
  return JSON.stringify({
    objective: content.objective,
    sources: content.sources.map((s) => ({ kind: s.kind, locator: s.locator ?? null, title: s.title, url: s.url ?? null })),
    successCriteria: content.successCriteria,
  });
}
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/**
 * The per-row integrity digest of a charter_audit_events row, over a canonical
 * projection, so the row is verifiable in isolation. The DB CHECK refuses a
 * malformed digest. Shared with server/routes/charters.ts (one implementation).
 */
export function computeCharterAuditEventHash(input: {
  charterId: number; entityType: string; entityId: number; eventType: string;
  actorUserId: number; occurredAt: string; afterValue: unknown;
}): string {
  const projection = {
    actorUserId: input.actorUserId,
    afterValue: input.afterValue ?? null,
    charterId: input.charterId,
    entityId: input.entityId,
    entityType: input.entityType,
    eventType: input.eventType,
    occurredAt: input.occurredAt,
  };
  return createHash('sha256').update(JSON.stringify(projection)).digest('hex');
}

function parseContent(raw: string | null): ObjectivesContent | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<ObjectivesContent>;
    if (typeof v.objective !== 'string') return null;
    return { objective: v.objective, successCriteria: typeof v.successCriteria === 'string' ? v.successCriteria : null,
      sources: Array.isArray(v.sources) ? v.sources as ObjectivesContent['sources'] : [] };
  } catch {
    return null;
  }
}

type Db = PgDatabase<any, any, any>;

async function projectCharter(db: Db, orgId: number, projectId: number) {
  const rows = await db.select({ id: projectCharters.id }).from(projectCharters)
    .where(and(eq(projectCharters.organizationId, orgId), eq(projectCharters.projectId, projectId)))
    .orderBy(projectCharters.id).limit(2);
  if (rows.length > 1) {
    throw new CharterObjectivesRefusal(409, 'CHARTER_AMBIGUOUS', 'This project has more than one charter, so its objective of record cannot be named. Nothing was read or changed.');
  }
  return rows[0] ?? null;
}

async function objectivesSection(db: Db, charterId: number, lock = false) {
  const q = db.select({
    id: charterSections.id, content: charterSections.content, version: charterSections.version,
    contentHash: charterSections.contentHash, status: charterSections.status, readOnly: charterSections.readOnly,
    updatedAt: charterSections.updatedAt, updatedBy: charterSections.updatedBy,
  }).from(charterSections)
    .where(and(eq(charterSections.charterId, charterId), eq(charterSections.sectionKey, OBJECTIVES_SECTION_KEY)))
    .orderBy(charterSections.id).limit(2);
  const rows = lock ? await q.for('update') : await q;
  if (rows.length > 1) {
    throw new CharterObjectivesRefusal(409, 'OBJECTIVES_AMBIGUOUS', "This project's charter has more than one objectives section. Nothing was read or changed.");
  }
  return rows[0] ?? null;
}

/** The project's current objective, and every recorded version, newest first. */
export async function readProjectObjectives(db: Db, scope: { orgId: number; projectId: number }): Promise<ObjectivesRecord> {
  const charter = await projectCharter(db, scope.orgId, scope.projectId);
  if (!charter) return { charterId: null, current: null, history: [] };
  const section = await objectivesSection(db, charter.id);
  if (!section) return { charterId: charter.id, current: null, history: [] };
  const content = parseContent(section.content);
  const events = await db.select({
    eventType: charterAuditEvents.eventType, occurredAt: charterAuditEvents.occurredAt,
    actorUserId: charterAuditEvents.actorUserId, reason: charterAuditEvents.reason, afterValue: charterAuditEvents.afterValue,
  }).from(charterAuditEvents)
    .where(and(eq(charterAuditEvents.organizationId, scope.orgId), eq(charterAuditEvents.charterId, charter.id),
      eq(charterAuditEvents.entityType, 'section'), eq(charterAuditEvents.entityId, section.id)))
    .orderBy(desc(charterAuditEvents.occurredAt), desc(charterAuditEvents.id)).limit(50);
  return {
    charterId: charter.id,
    current: content ? {
      content, version: section.version, contentHash: section.contentHash ?? '', status: section.status ?? 'draft',
      updatedAt: new Date(section.updatedAt).toISOString(), updatedBy: section.updatedBy ?? null,
    } : null,
    history: events.map((e) => {
      const after = (e.afterValue ?? {}) as { version?: number; content?: string };
      return {
        version: typeof after.version === 'number' ? after.version : null, eventType: e.eventType,
        occurredAt: new Date(e.occurredAt).toISOString(), actorUserId: e.actorUserId, reason: e.reason ?? null,
        content: parseContent(after.content ?? null),
      };
    }),
  };
}

export interface RecordObjectivesInput {
  orgId: number;
  userId: number;
  projectId: number;
  program: ProgramClassificationInput;
  body: ObjectivesBody;
  ipAddress?: string | null;
  userAgent?: string | null;
  now?: () => Date;
}

/**
 * Record a new version of the project's objective. The charter is started from
 * the program's own classification when the project has none. The section, its
 * version and hash chain, and the append-only audit row (before, after and the
 * reason) are one transaction. The same content again records nothing.
 */
export async function recordProjectObjectives(db: Db, input: RecordObjectivesInput) {
  const content: ObjectivesContent = {
    objective: input.body.objective, successCriteria: input.body.successCriteria?.trim() || null, sources: input.body.sources,
  };
  const text = canonical(content);
  const contentHash = sha256(text);
  const now = input.now ?? (() => new Date());
  return db.transaction(async (tx) => {
    const audit = async (e: { charterId: number; entityType: 'charter' | 'section'; entityId: number;
      eventType: 'created' | 'updated'; beforeValue: unknown; afterValue: unknown }) => {
      const occurredAt = now();
      await tx.insert(charterAuditEvents).values({
        organizationId: input.orgId, charterId: e.charterId, entityType: e.entityType, entityId: e.entityId, eventType: e.eventType,
        actorUserId: input.userId, actorRole: null, occurredAt, beforeValue: e.beforeValue as never, afterValue: e.afterValue as never,
        ipAddress: input.ipAddress ?? null, userAgent: input.userAgent ?? null, reason: input.body.reason, signatureMeaning: null,
        eventHash: computeCharterAuditEventHash({ charterId: e.charterId, entityType: e.entityType, entityId: e.entityId,
          eventType: e.eventType, actorUserId: input.userId, occurredAt: occurredAt.toISOString(), afterValue: e.afterValue }),
      });
    };

    let charter = await projectCharter(tx as Db, input.orgId, input.projectId);
    if (!charter) {
      const cls = charterClassification(input.program);
      const snapshot = { customInstructions: null, indication: null, productName: cls.productName,
        regulatoryRegion: cls.regulatoryRegion, submissionType: cls.submissionType, version: 1 };
      const [created] = await tx.insert(projectCharters).values({
        organizationId: input.orgId, projectId: input.projectId, submissionType: cls.submissionType,
        regulatoryRegion: cls.regulatoryRegion, productName: cls.productName, approvalStatus: 'draft',
        contentHash: sha256(JSON.stringify(snapshot)), version: 1, createdBy: input.userId, updatedBy: input.userId,
      }).returning({ id: projectCharters.id });
      if (!created) throw new Error('Charter INSERT returned no row');
      charter = created;
      await audit({ charterId: charter.id, entityType: 'charter', entityId: charter.id, eventType: 'created', beforeValue: null,
        afterValue: { ...snapshot, startedBy: 'objectives' } });
    }

    const section = await objectivesSection(tx as Db, charter.id, true);
    if (section?.readOnly) {
      throw new CharterObjectivesRefusal(409, 'OBJECTIVES_LOCKED', "This project's objective is locked. Nothing was changed.");
    }
    if (section && section.contentHash === contentHash) {
      return { charterId: charter.id, sectionId: section.id, version: section.version, contentHash, unchanged: true };
    }
    const version = section ? section.version + 1 : 1;
    const after = { version, contentHash, previousVersionHash: section?.contentHash ?? null, content: text };
    let sectionId: number;
    if (section) {
      await tx.update(charterSections).set({
        content: text, version, contentHash, previousVersionHash: section.contentHash, status: 'draft',
        updatedBy: input.userId, updatedAt: now(),
      }).where(eq(charterSections.id, section.id));
      sectionId = section.id;
    } else {
      const [row] = await tx.insert(charterSections).values({
        charterId: charter.id, sectionKey: OBJECTIVES_SECTION_KEY, sectionLabel: 'Objectives', content: text, version,
        contentHash, previousVersionHash: null, status: 'draft', sortOrder: 0, createdBy: input.userId, updatedBy: input.userId,
      }).returning({ id: charterSections.id });
      if (!row) throw new Error('Section INSERT returned no row');
      sectionId = row.id;
    }
    await audit({ charterId: charter.id, entityType: 'section', entityId: sectionId, eventType: section ? 'updated' : 'created',
      beforeValue: section ? { version: section.version, contentHash: section.contentHash, content: section.content } : null, afterValue: after });
    return { charterId: charter.id, sectionId, version, contentHash, unchanged: false };
  });
}

/** The objective as AnA reads it on a turn: the current version and where it came from. */
export function objectivesContextBlock(record: ObjectivesRecord): string | null {
  const c = record.current?.content;
  if (!c) return null;
  const lines = [`\n## The project's objective (of record, version ${record.current!.version})`, c.objective];
  if (c.successCriteria) lines.push(`\nSuccess criteria:\n${c.successCriteria}`);
  if (c.sources.length) {
    lines.push('\nSources:');
    for (const s of c.sources) lines.push(`- ${s.title}${s.locator ? `, ${s.locator}` : ''}${s.url ? ` (${s.url})` : ''} [${s.kind.replace('_', ' ')}]`);
  }
  lines.push('\nHold every narrative to this objective. When a request or a draft departs from it, or the data do not support it, say so.');
  return lines.join('\n');
}

// ───────────────────────────────────────────────────────────
// The project's objective of record (P-80, P-82; ONE_DESIGN_PLAN.md §1a S1)
//   GET /api/charters/by-project/:ref/objectives
//   PUT /api/charters/by-project/:ref/objectives
// :ref is the project's program UUID (or its integer project). Both are
// project-admitted (workspace, sharing, archive), unlike the org-scoped charter
// reads: a project's objective is that project's to see and to change.
// ───────────────────────────────────────────────────────────

const UUID_REF = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Tenant = { orgId: number; userId: number };

async function admittedObjectivesProject(req: Request, res: Response, tenant: Tenant, forWrite: boolean) {
  const ref = String(req.params.ref ?? '').trim();
  const { strictProjectRowForRef } = await import('./program-project-anchor');
  const projectId = await strictProjectRowForRef(requestDb(req), { ref, orgId: tenant.orgId, context: 'charter-objectives' });
  if (projectId === null) {
    res.status(404).json({ success: false, error: 'PROJECT_NOT_FOUND', message: 'Project not found.' });
    return null;
  }
  await requireProjectAdmission(req, String(projectId), forWrite,
    UUID_REF.test(ref) ? { executor: requestPgClient(req), programId: ref.toLowerCase() } : undefined);
  return { ...tenant, projectId, ref };
}

function objectivesRefusal(res: Response, err: unknown, doing: string) {
  if (err instanceof CharterObjectivesRefusal || err instanceof ProjectAdmissionRefusal) {
    return res.status(err.status).json({ success: false, error: err.code, message: err.message });
  }
  log.error(`Failed ${doing}`, { err: err instanceof Error ? err.message : String(err) });
  return res.status(500).json({ success: false, error: 'CHARTER_OBJECTIVES_UNAVAILABLE', message: `The project's objective could not be ${doing === 'reading the objective' ? 'read' : 'recorded'}. Nothing was changed.` });
}

/** GET /api/charters/by-project/:ref/objectives (server/routes/charters.ts mounts it). */
export async function sendProjectObjectives(req: Request, res: Response, tenant: Tenant) {
  try {
    const scope = await admittedObjectivesProject(req, res, tenant, false);
    if (!scope) return;
    const record = await readProjectObjectives(requestDb(req) as never, { orgId: scope.orgId, projectId: scope.projectId });
    return res.json({ success: true, data: record });
  } catch (err) {
    return objectivesRefusal(res, err, 'reading the objective');
  }
}

/** PUT /api/charters/by-project/:ref/objectives (server/routes/charters.ts mounts it). */
export async function changeProjectObjectives(req: Request, res: Response, tenant: Tenant) {
  const parsed = objectivesBodySchema.safeParse(req.body);
  if (!parsed.success) {
    // As for the charter: the objective's text may be sponsor-confidential, so
    // the issues are logged and not echoed.
    log.warn('Invalid objectives payload', { issues: parsed.error.issues });
    return res.status(400).json({ success: false, error: 'INVALID_OBJECTIVES', message: 'State the objective and a reason for this version. Source addresses must be http or https.' });
  }
  try {
    const scope = await admittedObjectivesProject(req, res, tenant, true);
    if (!scope) return;
    const programRows = await requestPgClient(req).query(
      `SELECT rp.program_type, rp.primary_agency, rp.product_name
         FROM projects p JOIN regulatory_programs rp ON rp.id = p.regulatory_program_id AND rp.organization_id = p.organization_id
        WHERE p.id = $1 AND p.organization_id = $2`, [scope.projectId, scope.orgId]);
    const row = (programRows.rows[0] ?? {}) as { program_type?: string; primary_agency?: string; product_name?: string };
    const result = await recordProjectObjectives(requestDb(req) as never, {
      orgId: scope.orgId, userId: scope.userId, projectId: scope.projectId,
      program: { programType: row.program_type ?? null, primaryAgency: row.primary_agency ?? null, productName: row.product_name ?? null },
      body: parsed.data, ipAddress: req.ip ?? null, userAgent: req.get('user-agent') ?? null,
    });
    if (!result.unchanged) {
      const { invalidateIntelligencePrefix } = await import('../lumen-context/intelligence-prefix');
      invalidateIntelligencePrefix(scope.orgId, scope.ref);
      invalidateIntelligencePrefix(scope.orgId, scope.projectId);
      const recorded = await auditService.logAction({
        organizationId: scope.orgId, userId: scope.userId, action: 'charter.objectives.recorded', resourceType: 'charter_section',
        resourceId: result.sectionId, ipAddress: req.ip, userAgent: req.get('user-agent') ?? undefined,
        details: { charterId: result.charterId, projectId: scope.projectId, version: result.version, contentHash: result.contentHash, reason: parsed.data.reason },
      });
      if (!recorded.persisted) log.error('charter.objectives.recorded audit_logs row was not persisted; the in-transaction charter audit row stands', { sectionId: result.sectionId });
    }
    const record = await readProjectObjectives(requestDb(req) as never, { orgId: scope.orgId, projectId: scope.projectId });
    return res.json({ success: true, data: record, meta: { version: result.version, unchanged: result.unchanged } });
  } catch (err) {
    return objectivesRefusal(res, err, 'recording the objective');
  }
}
