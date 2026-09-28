/**
 * Protocol industry-gap engines — their inputs, read tenant-scoped, and the
 * one place each engine is called for a protocol document.
 *
 * `docs/design/PROTOCOL_INDUSTRY_GAPS.md` Tier 1 added eight pure engines
 * (trial schema, SPIRIT 2013, CtQ factors, USDM export, DCT profile, WHO TRDS,
 * deviation trends, section redline), and Tier 2 put the BOIN dose-escalation
 * Poisson–Gamma enrollment, exact group-sequential, MMRM, external-control
 * borrowing and multiplicity engines on the spine; Tier 3 added the biospecimen
 * profile and the master-protocol check. Each is deterministic and reads no
 * database. This module is the boundary: it reads the rows an engine needs,
 * for ONE protocol of ONE organisation, and hands them over unchanged. AnA's
 * tools (`AnaToolExecutor.ts`) and the HTTP routes both call these functions,
 * so what AnA reports and what the screen shows come from the same read and
 * the same engine call — by construction, not by inspection.
 *
 * FAIL CLOSED. Every "could not read" is a thrown {@link ProtocolDevError}
 * with a sentence that says what did not run and why, never an empty result:
 *  - the protocol does not exist for this organisation → NOT_FOUND;
 *  - no study design is bound → INVALID_STATE (the engines did not run; that
 *    is not a clean result);
 *  - a bound design that cannot be read for this organisation → INVALID_STATE;
 *  - a version label that is not recorded → NOT_FOUND, recorded twice →
 *    INVALID_STATE (ambiguous — the engine is not handed a guess);
 *  - a snapshot that does not parse → INVALID_STATE.
 *
 * TWO TENANT LAYERS. Every read runs on the caller's connection — the
 * request-scoped client a route gets from `requestPgClient(req)`, or the read
 * transaction an AnA tool opens with `setTenantContextTx` — so RLS applies as
 * the second boundary, and every statement ALSO filters on organization_id
 * (tenant_id for the design row) explicitly. The bound design is read through
 * the same connection and the one mapper (`rowsToStudyDesign`), not through
 * the global drizzle handle, so no read here escapes the caller's tenant
 * context. (Security review, 2026-09-28: the first cut used the shared pool.)
 *
 * No clock here: the deviation trend's `today` is injected by the caller.
 *
 * @module server/services/protocol-development/protocol-industry-service
 */

import { ProtocolDevError } from './protocol-development-service';
import { redlineVersions, type ProtocolRedline, type ProtocolSnapshot } from './protocol-redline';
import { rowsToStudyDesign } from '../study-design/study-design-repository';
import type { StudyDesign } from '../study-design/study-design-types';
import { projectTrialSchema } from '../study-design/trial-schema';
import { assessSpiritConformance, type SpiritProtocolDocument } from '../study-design/spirit-conformance';
import { deriveCtqFactors } from '../study-design/ctq-derivation';
import { projectUsdm } from '../study-design/usdm-projection';
import { profileDecentralization } from '../study-design/dct-profile';
import { projectWhoIctrp } from '../study-design/who-ictrp-registration';
import { projectDoseEscalation } from '../study-design/dose-escalation';
import { projectEnrollment } from '../study-design/enrollment-projection';
import { projectInterimOperatingCharacteristics } from '../study-design/interim-oc';
import { projectMmrmSizing } from '../study-design/mmrm-sizing';
import { projectExternalControlPlan } from '../study-design/external-control-plan';
import { checkMultiplicity } from '../study-design/multiplicity-check';
import { profileBiospecimens } from '../study-design/biospecimen-profile';
import { checkMasterProtocol } from '../study-design/master-protocol';
import { trendDeviations, type DeviationRow, type DeviationTrends } from '../protocol-deviations/deviation-trends';

/** The caller's tenant-scoped connection: `requestPgClient(req)` or an AnA read transaction. */
export interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

/** The label that asks the redline for the protocol's live, unsnapshotted sections. */
export const CURRENT_VERSION_LABEL = 'current';

interface BoundDesign {
  documentId: number;
  studyDesignId: string;
  design: StudyDesign;
}

/**
 * The study design bound to a protocol document, read for this organisation.
 * Throws rather than returning null: a protocol with no design is a reason the
 * engine did not run, and the caller must be able to say so.
 */
export async function readBoundDesign(q: Queryable, orgId: number, documentId: number): Promise<BoundDesign> {
  const res = await q.query(
    `SELECT study_design_id FROM protocol_documents
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [documentId, orgId],
  );
  if (res.rows.length === 0) {
    throw new ProtocolDevError('NOT_FOUND', `Protocol document ${documentId} was not found for this organization.`);
  }
  const raw = (res.rows[0] as { study_design_id?: unknown }).study_design_id;
  const studyDesignId = typeof raw === 'string' ? raw.trim() : '';
  if (!studyDesignId) {
    throw new ProtocolDevError(
      'INVALID_STATE',
      `No study design is bound to protocol ${documentId}, so the engine did not run. This is not a clean result — bind a design first.`,
    );
  }
  const row = await q.query(
    `SELECT study_id, metadata FROM cdisc_prm_studies WHERE study_id = $1 AND tenant_id = $2 LIMIT 1`,
    [studyDesignId, orgId],
  );
  const design = row.rows.length ? rowsToStudyDesign(row.rows[0]) : null;
  if (!design) {
    throw new ProtocolDevError(
      'INVALID_STATE',
      `Protocol ${documentId} names study design ${studyDesignId}, but that design could not be read for this organization, so the engine did not run.`,
    );
  }
  return { documentId, studyDesignId, design };
}

/** The protocol's own sections, in the shape SPIRIT's document-evidenced rows read. */
async function readSpiritDocument(q: Queryable, orgId: number, documentId: number): Promise<SpiritProtocolDocument> {
  const res = await q.query(
    `SELECT section_key, title, content, status FROM protocol_sections
      WHERE protocol_document_id = $1 AND organization_id = $2 AND deleted_at IS NULL
      ORDER BY order_index, id`,
    [documentId, orgId],
  );
  return {
    sections: (res.rows as Array<Record<string, unknown>>).map((r) => ({
      sectionKey: String(r.section_key ?? ''),
      title: String(r.title ?? ''),
      content: typeof r.content === 'string' ? r.content : null,
      status: String(r.status ?? ''),
    })),
  };
}

/** Every engine that reads only the bound design, keyed by the name routes and tools use. */
export const DESIGN_ENGINES = {
  'trial-schema': (d: StudyDesign) => ({ trialSchema: projectTrialSchema(d) }),
  ctq: (d: StudyDesign) => ({ ctq: deriveCtqFactors(d) }),
  usdm: (d: StudyDesign) => ({ usdm: projectUsdm(d) }),
  'dct-profile': (d: StudyDesign) => ({ dctProfile: profileDecentralization(d.scheduleOfActivities) }),
  'who-ictrp': (d: StudyDesign) => ({ whoIctrp: projectWhoIctrp(d) }),
  'dose-escalation': (d: StudyDesign) => ({ doseEscalation: projectDoseEscalation(d) }),
  enrollment: (d: StudyDesign) => ({ enrollment: projectEnrollment(d) }),
  'interim-oc': (d: StudyDesign) => ({ interimOc: projectInterimOperatingCharacteristics(d) }),
  mmrm: (d: StudyDesign) => ({ mmrm: projectMmrmSizing(d) }),
  'external-control': (d: StudyDesign) => ({ externalControl: projectExternalControlPlan(d) }),
  multiplicity: (d: StudyDesign) => ({ multiplicity: checkMultiplicity(d) }),
  biospecimens: (d: StudyDesign) => ({ biospecimens: profileBiospecimens(d) }),
  'master-protocol': (d: StudyDesign) => ({ masterProtocol: checkMasterProtocol(d) }),
} as const;

export type DesignEngineName = keyof typeof DESIGN_ENGINES;

/** Run one design-only engine over the design bound to a protocol document. */
export async function designEngineForProtocol<K extends DesignEngineName>(
  q: Queryable,
  orgId: number,
  documentId: number,
  engine: K,
): Promise<{ documentId: number; studyDesignId: string } & ReturnType<(typeof DESIGN_ENGINES)[K]>> {
  const bound = await readBoundDesign(q, orgId, documentId);
  const project = DESIGN_ENGINES[engine] as (d: StudyDesign) => ReturnType<(typeof DESIGN_ENGINES)[K]>;
  return { documentId, studyDesignId: bound.studyDesignId, ...project(bound.design) };
}

/**
 * SPIRIT over the bound design AND the protocol's own sections. The document
 * is always passed, so document-evidenced rows are judged from the sections
 * that exist rather than reported not_assessable.
 */
export async function spiritForProtocol(q: Queryable, orgId: number, documentId: number) {
  const bound = await readBoundDesign(q, orgId, documentId);
  const doc = await readSpiritDocument(q, orgId, documentId);
  return { documentId, studyDesignId: bound.studyDesignId, spirit: assessSpiritConformance(bound.design, doc) };
}

// ─── Deviation trends ────────────────────────────────────────────────────────

/** The recorded deviations of one protocol, as the trend engine reads them. */
async function readDeviationRows(q: Queryable, orgId: number, documentId: number): Promise<DeviationRow[]> {
  const exists = await q.query(
    `SELECT 1 FROM protocol_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [documentId, orgId],
  );
  if (exists.rows.length === 0) {
    throw new ProtocolDevError('NOT_FOUND', `Protocol document ${documentId} was not found for this organization.`);
  }
  const res = await q.query(
    `SELECT d.id, d.category, d.severity, d.status, d.is_reportable, d.created_at,
            COUNT(c.id) FILTER (WHERE c.status IN ('open','in_progress'))::int AS capa_open,
            COUNT(c.id)::int AS capa_total
       FROM protocol_deviations d
       LEFT JOIN protocol_capa_actions c
         ON c.deviation_id = d.id AND c.organization_id = d.organization_id AND c.deleted_at IS NULL
      WHERE d.organization_id = $1 AND d.protocol_document_id = $2 AND d.deleted_at IS NULL
      GROUP BY d.id
      ORDER BY d.created_at, d.id`,
    [orgId, documentId],
  );
  return (res.rows as Array<Record<string, unknown>>).map((r) => ({
    id: Number(r.id),
    category: (r.category ?? null) as DeviationRow['category'],
    severity: (r.severity ?? null) as DeviationRow['severity'],
    status: r.status as DeviationRow['status'],
    isReportable: typeof r.is_reportable === 'boolean' ? r.is_reportable : null,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    // protocol_deviations records no closure timestamp; the engine reports the
    // lag as not known rather than reading updated_at as a closure date.
    closedAt: null,
    capaActionsOpen: Number(r.capa_open),
    capaActionsTotal: Number(r.capa_total),
  }));
}

/** Trend one protocol's deviations. `today` is injected (ISO date), never read here. */
export async function deviationTrendsForProtocol(
  q: Queryable,
  orgId: number,
  documentId: number,
  opts: { today: string; windowMonths?: number },
): Promise<{ documentId: number; trends: DeviationTrends }> {
  const rows = await readDeviationRows(q, orgId, documentId);
  return { documentId, trends: trendDeviations(rows, opts) };
}

// ─── Redline ─────────────────────────────────────────────────────────────────

function parseSnapshot(raw: unknown, label: string, documentId: number): ProtocolSnapshot {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      value = null;
    }
  }
  const v = value as { version?: unknown; sections?: unknown } | null;
  if (!v || !Array.isArray(v.sections)) {
    throw new ProtocolDevError('INVALID_STATE', `The snapshot recorded for version ${label} of protocol ${documentId} could not be read, so no redline was produced.`);
  }
  return { version: typeof v.version === 'string' ? v.version : label, sections: v.sections as ProtocolSnapshot['sections'] };
}

async function readLiveSnapshot(q: Queryable, orgId: number, documentId: number): Promise<ProtocolSnapshot> {
  const doc = await q.query(
    `SELECT version FROM protocol_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [documentId, orgId],
  );
  if (doc.rows.length === 0) throw new ProtocolDevError('NOT_FOUND', `Protocol document ${documentId} was not found for this organization.`);
  const sections = await q.query(
    `SELECT section_key, title, content, status, order_index FROM protocol_sections
      WHERE protocol_document_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY order_index, id`,
    [documentId, orgId],
  );
  const recorded = (doc.rows[0] as { version?: unknown }).version;
  return {
    version: `${CURRENT_VERSION_LABEL} (working copy${typeof recorded === 'string' && recorded ? ` after ${recorded}` : ''})`,
    sections: sections.rows as ProtocolSnapshot['sections'],
  };
}

async function readSnapshot(q: Queryable, orgId: number, documentId: number, label: string): Promise<ProtocolSnapshot> {
  if (label === CURRENT_VERSION_LABEL) return readLiveSnapshot(q, orgId, documentId);
  const res = await q.query(
    `SELECT snapshot FROM protocol_versions
      WHERE protocol_document_id = $1 AND organization_id = $2 AND version = $3
      ORDER BY created_at, id`,
    [documentId, orgId, label],
  );
  if (res.rows.length === 0) {
    throw new ProtocolDevError('NOT_FOUND', `Version ${label} is not recorded for protocol ${documentId} in this organization, so no redline was produced.`);
  }
  if (res.rows.length > 1) {
    throw new ProtocolDevError('INVALID_STATE', `Version ${label} is recorded ${res.rows.length} times for protocol ${documentId}; the redline will not pick one.`);
  }
  return parseSnapshot((res.rows[0] as { snapshot: unknown }).snapshot, label, documentId);
}

/**
 * Section redline between two versions of one protocol. `to` may be
 * {@link CURRENT_VERSION_LABEL} to compare a recorded version against the
 * working copy — the comparison an amendment is drafted against.
 */
export async function redlineForProtocol(
  q: Queryable,
  orgId: number,
  documentId: number,
  from: string,
  to: string,
): Promise<{ documentId: number; redline: ProtocolRedline }> {
  const fromLabel = from.trim();
  const toLabel = to.trim();
  if (!fromLabel || !toLabel) throw new ProtocolDevError('BAD_INPUT', 'Both version labels are required.');
  if (fromLabel === CURRENT_VERSION_LABEL) {
    throw new ProtocolDevError('BAD_INPUT', `"${CURRENT_VERSION_LABEL}" can only be the later version: compare a recorded version against the working copy.`);
  }
  const before = await readSnapshot(q, orgId, documentId, fromLabel);
  const after = await readSnapshot(q, orgId, documentId, toLabel);
  return { documentId, redline: redlineVersions(before, after) };
}
