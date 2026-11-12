/**
 * The trial master file report pack, `etmf.completeness_pack`, computed from the deployed trial master file store
 * (services/etmf/tmf-artifact-persistence.ts) as the person who runs it. Split out of
 * research-compliance-report-providers.ts (2026-11-12), in its folder; computeDomainReport calls it.
 *
 * @module server/services/report-os/trial-master-file-pack
 */
import { UnsupportedReportClientScope } from './client-scope';
import { getCurrentAccessibleProgramScope, verifiedProgramAnchors, requireProgramScopeStillCurrent, ProgramReadAccessError, type VerifiedProgramAnchor } from '../c2c/current-program-access';
import type { TrialTmf } from '../etmf/tmf-artifact-persistence';
import type { TmfDocumentEvidence } from '../etmf/tmf-completeness';
import type { DomainReportOptions, DomainReportResult } from './research-compliance-report-providers';

const now = () => new Date().toISOString();

/* ── The trial master file pack (etmf.completeness_pack) ──
 * 2026-11-12 (eTMF convergence E4 step 1, docs/design/ETMF_CONVERGENCE_E4_PLAN_2026-11-10.md §5; founder decisions
 * P-74, P-75 and P-124 item 5). Its case was in research-compliance-report-providers.ts; it is this file now, split
 * out in its folder (that file would otherwise pass its size), and computeDomainReport calls it.
 *
 * This pack counted the two tables of the second trial master
 * file store for the whole organization, with no person named: statuses a
 * person typed with no document behind them, from tables no deploy creates.
 *
 * It reads the deployed store now (services/etmf/tmf-artifact-persistence.ts).
 * The studies are those of the projects the acting person can open: one
 * project for a project run, every admitted project for an organization run.
 * Each study is read through readTrialTmf, which admits the person to the
 * study's project again. Every figure is assessTmfCompleteness's answer for a
 * study or a count of those answers; no model is asked for a number, and no
 * percentage or stated status is carried over from the retired pack.
 */
export const TMF_PACK_TYPE = 'etmf.completeness_pack';

export type TmfPackRefusal = 'TMF_PACK_ACTOR_REQUIRED' | 'TMF_PACK_SCOPE_UNSUPPORTED' | 'TMF_PACK_PROJECT_UNVERIFIED'
  | 'TMF_PACK_STUDY_LIMIT' | 'TMF_PACK_STUDY_CHANGED';

/** Why the pack was not computed. compute-run.ts answers it as REPORT_TYPE_NOT_COMPUTED, by this name. */
export class TrialMasterFilePackUnavailable extends Error {
  constructor(readonly code: TmfPackRefusal, message: string) {
    super(message);
    this.name = 'TrialMasterFilePackUnavailable';
  }
}

/** listStudyDesigns returns at most this many studies of a project; a project at the cap is refused, not truncated. */
const TMF_PACK_STUDY_LIMIT = 200;
const TMF_PACK_SOURCES = ['cdisc_prm_studies', 'tmf_artifact_filings', 'vault.documents'];
const TMF_PACK_PRESENT = 'A record counts as present only when it is filed against a document that is in its project\'s Vault now.';
const TMF_PACK_UNRECONCILED = 'Some projects need their tracking record reconciled before they can be read; their studies are not counted.';

export interface TmfPackStudyRow {
  study: string; protocol: string; title: string;
  ready: 'yes' | 'no' | 'not determined';
  filings: number; required: number; present: number; missing: number;
  filedWithoutAVerifiedDocument: number;
  /** Declared not applicable to the study, each with a person's reason (P-124 item 5): not in `required`. */
  notApplicable: number;
}
type TmfPackEvidence = Record<TmfDocumentEvidence, number>;
type TmfPackIdentity = { organizationId: number; userId: number };
type TmfStore = typeof import('../etmf/tmf-artifact-persistence');

function tmfPackContext(options: DomainReportOptions | undefined) {
  const context = options?.recordContext;
  if (!context?.executor || !Number.isSafeInteger(context.userId) || !context.userId) {
    throw new TrialMasterFilePackUnavailable('TMF_PACK_ACTOR_REQUIRED',
      'A trial master file is read as the person who runs the report, and this run names no person. The report was not computed.');
  }
  return { executor: context.executor, userId: context.userId };
}

/** True for one project, false for this organization. Any other scope is refused: nothing else names whose studies to read. */
function tmfPackIsProject(orgId: number, options: DomainReportOptions | undefined): boolean {
  if (options?.scopeType === 'project') return true;
  if (options?.scopeType !== 'account' || options.scopeId !== String(orgId)) {
    throw new TrialMasterFilePackUnavailable('TMF_PACK_SCOPE_UNSUPPORTED', 'The trial master file report is computed for one project or for this organization.');
  }
  if (options.clientWorkspaceId != null) {
    throw new UnsupportedReportClientScope('The organization\'s trial master file report cannot be filtered to a client workspace. Run it for one project.');
  }
  return false;
}

/** The admitted projects to read: all of them, or the one a project run names, in the client workspace it claims. */
function tmfPackAnchors(anchors: readonly VerifiedProgramAnchor[], options: DomainReportOptions | undefined, project: boolean) {
  if (!project) return anchors;
  const id = typeof options?.scopeId === 'string' && /^[1-9]\d*$/.test(options.scopeId) ? Number(options.scopeId) : NaN;
  const selected = anchors.filter(anchor => anchor.projectId === id);
  if (selected.length !== 1 || (options?.clientWorkspaceId != null && selected[0].clientWorkspaceId !== options.clientWorkspaceId)) {
    throw new TrialMasterFilePackUnavailable('TMF_PACK_PROJECT_UNVERIFIED',
      'This report\'s project could not be verified as one the person who ran it can open. The report was not computed.');
  }
  return selected;
}

/** A study's refusal, with the status and code the run route answers for a project's. Never a study left out of the count. */
function tmfStudyRefusal(error: unknown, store: TmfStore): unknown {
  if (!(error instanceof store.TmfArtifactError)) return error;
  if (error.code === 'STUDY_ACCESS_UNAVAILABLE') {
    return new ProgramReadAccessError(503, 'STUDY_ACCESS_UNAVAILABLE', 'Current access to a study\'s project could not be verified. No trial master file figure was supplied.');
  }
  if (error.code === 'STUDY_NOT_FOUND') {
    return new ProgramReadAccessError(503, 'PROJECT_ACCESS_CHANGED', 'A study of this report could not be opened while it was read. No trial master file figure was supplied.');
  }
  return error;
}

/** One study's row, from the deployed store's own assessment of it. */
function tmfPackStudyRow(tmf: TrialTmf, anchor: VerifiedProgramAnchor): { row: TmfPackStudyRow; evidence: TmfDocumentEvidence[] } {
  const { study, filings, completeness } = tmf;
  // The study read is the one listed for this project, and its documents were verified when it was assessed.
  if (study.programId.toLowerCase() !== anchor.programId.toLowerCase() || completeness.basis !== 'verified_documents' || !completeness.documentEvidence) {
    throw new TrialMasterFilePackUnavailable('TMF_PACK_STUDY_CHANGED', 'A study of this report changed while it was read. The report was not computed.');
  }
  const { totalRequired, totalMissing, totalUnverified, totalNotApplicable } = completeness.summary;
  const ready = completeness.ready === true ? 'yes' : completeness.ready === false ? 'no' : 'not determined';
  return { evidence: Object.values(completeness.documentEvidence),
    row: { study: study.studyId, protocol: study.protocolId, title: study.title, ready,
      // A declaration that a record does not apply is not a filing.
      filings: filings.filter((f) => f.notApplicableReason == null).length,
      required: totalRequired, present: totalRequired - totalMissing, missing: totalMissing, filedWithoutAVerifiedDocument: totalUnverified,
      notApplicable: totalNotApplicable } };
}

/** Every study of the admitted projects, each read once. A read that fails throws; it is never an absent row. */
async function readTmfPackStudies(anchors: readonly VerifiedProgramAnchor[], identity: TmfPackIdentity) {
  const store = await import('../etmf/tmf-artifact-persistence');
  const { listStudyDesigns } = await import('../study-design/study-design-repository');
  const rows: TmfPackStudyRow[] = [];
  const evidence: TmfPackEvidence = { verified: 0, no_document: 0, unresolved: 0, unverifiable: 0 };
  const accessProjectIds: number[] = [];
  for (const anchor of anchors) {
    const designs = await listStudyDesigns(identity.organizationId, { programId: anchor.programId, limit: TMF_PACK_STUDY_LIMIT });
    if (designs.length >= TMF_PACK_STUDY_LIMIT) {
      throw new TrialMasterFilePackUnavailable('TMF_PACK_STUDY_LIMIT',
        `A project of this report holds ${TMF_PACK_STUDY_LIMIT} or more studies, more than one report reads. No truncated report was produced.`);
    }
    for (const design of designs) {
      let tmf: TrialTmf;
      try { tmf = await store.readTrialTmf(design.studyId, identity, 'essential'); }
      catch (error) { throw tmfStudyRefusal(error, store); }
      const read = tmfPackStudyRow(tmf, anchor);
      rows.push(read.row);
      for (const found of read.evidence) evidence[found] += 1;
    }
    if (designs.length) accessProjectIds.push(anchor.projectId);
  }
  rows.sort((a, b) => a.study.localeCompare(b.study));
  return { rows, evidence, accessProjectIds };
}

/** Whether there is anything to report, and why not: no study and no filing are different answers. */
function tmfPackStanding(rows: readonly TmfPackStudyRow[], project: boolean, unreconciled: boolean): { status: 'ready' | 'partial' | 'missing'; blocker?: string } {
  const also = unreconciled ? ` ${TMF_PACK_UNRECONCILED}` : '';
  if (!rows.length) {
    return { status: 'missing', blocker: (project ? 'This project has no protocol-design study, so it has no trial master file.'
      : 'No project the person who ran this report can open has a protocol-design study, so there is no trial master file to report.') + also };
  }
  if (!rows.some(row => row.filings > 0)) {
    return { status: 'missing', blocker: (project ? 'No trial master file filing is recorded for this project.'
      : 'No trial master file filing is recorded in the projects the person who ran this report can open.') + also };
  }
  return unreconciled ? { status: 'partial', blocker: TMF_PACK_UNRECONCILED } : { status: 'ready' };
}

function tmfPackSummary(rows: readonly TmfPackStudyRow[], evidence: TmfPackEvidence, project: boolean): Record<string, unknown> {
  const sum = (pick: (row: TmfPackStudyRow) => number) => rows.reduce((total, row) => total + pick(row), 0);
  const standing = (ready: TmfPackStudyRow['ready']) => rows.filter(row => row.ready === ready).length;
  return {
    // The register section's own first sentence (render/render.ts registerCoverage): whose studies were counted.
    coverage: project ? `Counts are this project's studies and their trial master file filings. ${TMF_PACK_PRESENT}`
      : `Counts are the studies, and their trial master file filings, of the projects the person who ran this report can open; they are the whole organization's only if that person can open every project. ${TMF_PACK_PRESENT}`,
    studies: rows.length,
    studiesWithAFiling: rows.filter(row => row.filings > 0).length,
    filings: sum(row => row.filings),
    filingsByDocumentEvidence: evidence,
    essentialRecordsRequired: sum(row => row.required),
    essentialRecordsPresent: sum(row => row.present),
    essentialRecordsMissing: sum(row => row.missing),
    essentialRecordsNotApplicable: sum(row => row.notApplicable),
    studiesReady: standing('yes'),
    studiesNotReady: standing('no'),
    studiesNotDetermined: standing('not determined'),
    byStudy: rows,
  };
}

export async function computeTrialMasterFilePack(orgId: number, options?: DomainReportOptions): Promise<DomainReportResult> {
  const context = tmfPackContext(options);
  const project = tmfPackIsProject(orgId, options);
  const q = context.executor;
  const identity = { organizationId: orgId, userId: context.userId };
  const scope = await getCurrentAccessibleProgramScope(q, identity);
  const anchors = tmfPackAnchors(verifiedProgramAnchors(q, identity, scope), options, project);
  const read = await readTmfPackStudies(anchors, identity);
  // A project shared or withdrawn while its studies were read refuses the whole report.
  await requireProgramScopeStillCurrent(q, identity, scope);
  const observedAt = now();
  const computedScope = project ? 'project' : 'organization';
  return { computedScope, accessProjectIds: read.accessProjectIds,
    summary: tmfPackSummary(read.rows, read.evidence, project),
    provider: { provider: 'etmf', observedAt, ...tmfPackStanding(read.rows, project, !project && scope.reconciliationRequired),
      atoms: TMF_PACK_SOURCES.map(sourceTable => ({ sourceTable, transformation: 'aggregation' as const })),
      calculation: { method: 'assessTmfCompleteness over each study\'s live filings, essential records of the DIA TMF Reference Model', basis: 'verified_documents', scope: 'essential', computedScope } },
    provenance: { organizationId: orgId, observedAt, computedScope, queries: [{
      query: 'readTrialTmf per study of the admitted projects: the study, its live filings and their assessment',
      parameters: [orgId, { scopeType: options?.scopeType, scopeId: options?.scopeId }], rows: read.rows,
    }] } };
}
