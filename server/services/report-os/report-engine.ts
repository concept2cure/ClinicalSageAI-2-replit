/**
 * Which engine computes a governed report type's content — the one place that
 * says so — and whether a type applies to the program it would run over.
 *
 * ── Why this exists (QA 2026-10-08, journey j8) ──────────────────────────────
 * Every typed report the canvas ran came back as the same document: the
 * readiness providers' table, the same blocker, the same figures, under
 * whichever title was asked for. POST /runs called the readiness orchestrator
 * (computeInitialRun) for every reportTypeId, passing the type as an
 * `explicitRegistryId` the orchestrator never reads; the research-compliance
 * domain summary it merged in was never rendered. So "EMA RMP / PSUR Signal
 * Alignment", "NMPA CTD Module Gap Analysis" and "Compliance & Audit Assurance"
 * were the Executive Readiness Digest with another heading — a report claiming
 * an analysis nothing performed.
 *
 * A type now runs only when an engine computes its content:
 *   readiness  the Executive Readiness Digest: computeInitialRun, whose
 *              submission readiness is evaluateReadiness (orchestrator.ts);
 *   domain     the research-compliance / sponsored-programs registers, each a
 *              deterministic query over its own tables
 *              (research-compliance-report-providers.ts);
 *   lineage    the Evidence & Provenance Trace over ONE document, from the
 *              document's lineage dossier (lineage-trace-report.ts).
 * Every other type is refused with REPORT_TYPE_NOT_COMPUTED, and the canvas
 * shows it as not computed in this release — the same rule as predictions
 * (PREDICTION_NOT_A_RUN) and as product decision P-7: a tool with no engine
 * says it is unavailable.
 *
 * Pure apart from computeDomainRun, which loads its provider lazily so this
 * module can be imported without a database.
 *
 * @module server/services/report-os/report-engine
 */

import { filterTypesForSegment, type ReportSegment } from './segment';
import type { RunComputationResult } from './orchestrator';

export type ReportEngine = 'readiness' | 'domain' | 'lineage';

/** The report type ids the research-compliance domain providers compute. */
export const DOMAIN_REPORT_TYPE_IDS = [
  'fcoi.disclosure_register', 'ha.commitment_register', 'iacuc.protocol_register', 'irb.submission_register',
  'ibc.registration_register', 'nonclinical.study_send_register', 'grants.portfolio_register', 'rim.registration_grid',
  'inspection.readiness_pack', 'controlled_substances.inventory_ledger', 'lifecycle.obligation_calendar',
  'etmf.completeness_pack', 'research_compliance.training_status',
  'effort.certification_register', 'research_security.coi_register',
  'research_admin.scorecard',
] as const;

const DOMAIN_TYPES: ReadonlySet<string> = new Set(DOMAIN_REPORT_TYPE_IDS);

/** The engine that computes `typeId` over `scopeType`, or null when none does. */
export function reportEngineFor(typeId: string, scopeType: string): ReportEngine | null {
  if (typeId === 'readiness.executive_digest') return 'readiness';
  if (DOMAIN_TYPES.has(typeId)) return 'domain';
  if (typeId === 'provenance.evidence_trace_report' && scopeType === 'document') return 'lineage';
  return null;
}

export const REPORT_TYPE_NOT_COMPUTED = 'REPORT_TYPE_NOT_COMPUTED';

/** Why a type with no engine is not run. */
export function reportTypeNotComputedMessage(label: string): string {
  return `No engine computes the ${label} over this scope in this release, so it is not run. ` +
    'The readiness digest is not shown under its name.';
}

export const REPORT_TYPE_NOT_APPLICABLE = 'REPORT_TYPE_NOT_APPLICABLE';

/**
 * Whether a type applies to a program of `segments` (from the program's
 * recorded product type, segment.ts). An unknown product type — an empty list —
 * is not a reason to refuse: nothing recorded says the type does not apply. A
 * type with no segment list is universal.
 */
export function reportTypeApplies(
  type: { allowedClientSegments?: string[] | null },
  segments: ReportSegment[],
): boolean {
  if (segments.length === 0) return true;
  return filterTypesForSegment([type], segments).length > 0;
}

/** Why a type does not apply to the program's product type. */
export function reportTypeNotApplicableMessage(
  label: string,
  allowed: readonly string[],
  segments: readonly string[],
): string {
  return `The ${label} applies to ${allowed.join(' / ')} programs; this program is recorded as ${segments.join(' / ')}, so it is not run.`;
}

/**
 * A domain register's run: its own provider and summary, and nothing of the
 * readiness digest. The counts are the organisation's (the domain tables are
 * not keyed to a project), and the summary says so for the renderer.
 *
 * No confidence: nothing measures one for a register (see orchestrator.ts).
 * Throws when the type has no domain provider, so a run is never the readiness
 * digest by default.
 */
export async function computeDomainRun(
  typeId: string,
  organizationId: number,
  scopeType: string,
  scopeId: string,
): Promise<RunComputationResult> {
  const { computeDomainReport } = await import('./research-compliance-report-providers');
  const domain = await computeDomainReport(typeId, organizationId);
  if (!domain) throw new Error(`No domain provider computes ${typeId}`);
  const blockers = domain.provider.status !== 'ready' && domain.provider.blocker ? [domain.provider.blocker] : [];
  return {
    providers: [domain.provider],
    confidence: null,
    blockers,
    criticalBlockers: [],
    summary: { scopeType, scopeId, domain: domain.summary, domainScope: 'organization' },
  };
}
