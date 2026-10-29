/**
 * Module 2 QC over the summaries a package run would build NOW, from the
 * project's saved records (slice G5, docs/design/PARITY_WEAVE_VEEVA_BASICS_2026-10-29.md).
 *
 * The cross-summary QC (`runM2SummaryQc`) was reachable only as
 * POST /api/authoring-pdf/m2-summary/qc over summaries the caller supplied, so
 * a verdict could describe summaries no run would build (Rule 2; the route says
 * so itself: "caller-supplied verdicts do not load current governed program
 * content"). This reads the same inputs the orchestrator's program run reads
 * (routes/submission-orchestrator.ts, POST /runs/for-program) and builds with
 * the same canonical builders and the same arguments:
 *
 *   2.3 — composeFullModule3 over the approved CMC sources, when the CMC gate is
 *         open and the submission's application is in the composition boundary;
 *   2.4 — not built: no store links nonclinical studies to a project (founder
 *         decision R-1), and the program run passes none either;
 *   2.5 / 2.7 — the latest completed CSR build of each study.
 *
 * A summary a run would not build is not invented: it is named in `notBuilt`
 * with the reason, and the QC reports it missing. Nothing is persisted; the
 * verdict is the engine's and the builders' self-reported completeness and gaps.
 *
 * @module server/services/authoring/module2-saved-qc
 */
import {
  buildM23QualityOverallSummary,
  buildM25ClinicalOverview,
  buildM27ClinicalSummary,
  type M2Summary,
} from '../m2-summary-builders';
import { runM2SummaryQc, DEFAULT_EXPECTED_M2, type M2QcResult } from './m2-summary-qc';
import { composeFullModule3, type RegionCode } from '../module3-extensions';
import { applicationRefusal } from '../cmc/composition-scope';
import { loadApprovedCmcSourcesForProject } from '../cmc/load-approved-cmc-sources-for-project';
import { loadCsrInputsForProject } from '../csr/load-csr-inputs-for-project';
import { normalizeSubmissionRegion } from '../module3-regional-readiness';

export interface SavedModule2QcScope {
  organizationId: number;
  userId: number;
  /** regulatory_programs.id of the submission's project. */
  programId: string;
  /** The numeric projects.id the CSR builds are keyed by, or null when the project has none. */
  projectId: number | null;
  /** submissions.application_type and primary_region. */
  applicationType: string;
  primaryRegion: string;
}

export interface SavedModule2Qc {
  /** Where the summaries came from: the project's saved records, built as a run builds them. */
  basis: 'SAVED_PROGRAM_CONTENT';
  qc: M2QcResult;
  /** Each expected summary a run would not build now, and why. */
  notBuilt: Array<{ summaryKey: string; reason: string }>;
  /** What was read. */
  sources: { completedCsrStudies: number; cmcGate: 'open' | 'closed' | 'unknown'; module3Sections: number };
}

/* The program run's own arguments (submission-orchestrator.ts): it records no
   indication or product name, so its 2.5/2.7 carry these placeholders, and so
   does what is graded here. */
const RUN_INDICATION = '[indication not specified]';
const COMPOSABLE: readonly string[] = ['US', 'EU', 'JP', 'CA'] satisfies RegionCode[];
const isComposableRegion = (r: string): r is RegionCode => COMPOSABLE.includes(r);
const RUN_PRODUCT = '[product]';

export async function readSavedModule2Qc(scope: SavedModule2QcScope): Promise<SavedModule2Qc> {
  const [cmc, csrs] = await Promise.all([
    loadApprovedCmcSourcesForProject(scope.organizationId, scope.programId, String(scope.userId)),
    scope.projectId
      ? loadCsrInputsForProject(scope.organizationId, scope.projectId, { actorUserId: scope.userId })
      : Promise.resolve([]),
  ]);
  const summaries: M2Summary[] = [];
  const notBuilt: SavedModule2Qc['notBuilt'] = [];
  let module3Sections = 0;

  const submissionType = scope.applicationType.toUpperCase();
  const region = normalizeSubmissionRegion(scope.primaryRegion);
  const refusal = applicationRefusal(submissionType, 'submission');
  if (cmc.gate !== 'open') {
    notBuilt.push({ summaryKey: '2.3', reason: cmc.reason });
  } else if (refusal) {
    notBuilt.push({ summaryKey: '2.3', reason: refusal.message });
  } else if (!isComposableRegion(region)) {
    notBuilt.push({ summaryKey: '2.3', reason: `Module 3 is not composed for the region ${region}.` });
  } else {
    const m3 = composeFullModule3(cmc.sources, region, { applicationType: submissionType });
    module3Sections = m3.length;
    if (m3.length > 0) summaries.push(buildM23QualityOverallSummary({ module3Sections: m3 }));
    else notBuilt.push({ summaryKey: '2.3', reason: 'The approved CMC sources compose no Module 3 section.' });
  }

  notBuilt.push({
    summaryKey: '2.4',
    reason: 'No store links nonclinical studies to a project yet (founder decision R-1), so a package run builds no 2.4.',
  });

  if (csrs.length > 0) {
    const ctx = { csrs, indication: RUN_INDICATION, investigationalProduct: RUN_PRODUCT };
    summaries.push(buildM25ClinicalOverview(ctx), buildM27ClinicalSummary(ctx));
  } else {
    const reason = scope.projectId
      ? 'No completed CSR build exists for this project.'
      : 'This project has no CSR workspace, so no CSR build exists for it.';
    notBuilt.push({ summaryKey: '2.5', reason }, { summaryKey: '2.7', reason });
  }

  return {
    basis: 'SAVED_PROGRAM_CONTENT',
    qc: runM2SummaryQc({ summaries, expectedSummaries: [...DEFAULT_EXPECTED_M2] }),
    notBuilt,
    sources: { completedCsrStudies: csrs.length, cmcGate: cmc.gate, module3Sections },
  };
}
