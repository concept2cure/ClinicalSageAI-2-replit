/**
 * The ONE dispatch from a report type to the engine that computes it.
 *
 * ── WHY THIS MODULE EXISTS ──────────────────────────────────────────────────
 * `report-engine.ts` says WHICH engine computes a type. Two callers then had to
 * act on that answer — `POST /api/report-os/runs` and the subscription sweep —
 * and they drifted, which is the whole history of the QA 2026-10-08 (j8) defect:
 *
 *   - j8 itself: the route called the readiness orchestrator for every type,
 *     so every market- and register-named report was the Executive Readiness
 *     Digest under another title. Fixed in the route.
 *   - 2026-10-11: the SWEEP still did that, for all sixteen domain registers.
 *     It had no caller until the Schedules screen gave it one.
 *   - 2026-10-12: the sweep's ternary gained a `regional` arm and STILL had no
 *     `lineage` arm, so a document-scoped Evidence & Provenance Trace
 *     subscription fell through to the digest — the same defect, surviving for
 *     the one engine nobody enumerated. Three fixes, one at a time, because the
 *     dispatch existed twice.
 *
 * So it exists once, here, and the engine union is matched EXHAUSTIVELY with a
 * compile-time `never` check. Two guarantees, and they are NOT the same one:
 *
 *   - An engine NOBODY HANDLES stops the build. Verified: the four-arm version
 *     compiles; adding a fifth member to `ReportEngine` fails with
 *     "TS2322: Type 'string' is not assignable to type 'never'" at `unreached`.
 *     That is the guarantee against the next `regional`-shaped addition.
 *   - An engine handled by the WRONG ARM does not. A lineage branch that asks
 *     the readiness engine instead still compiles. Only
 *     `scheduling/__tests__/worker-register-engine.test.ts` catches that, which
 *     is why that case asserts the ENGINE ASKED FOR and not merely that the
 *     digest was avoided.
 *
 * @module server/services/report-os/compute-run
 */

import { createScopedLogger } from '../../utils/logger';
import { computeInitialRun, type RunComputationResult } from './orchestrator';
import { computeDomainRun, computeRegionalRun, type ReportEngine } from './report-engine';
import type { RenderedReport } from './render/types';
import type { ReportScope } from '@shared/schema/report-os';

const log = createScopedLogger('report-os-compute-run');

/**
 * A type that cannot be computed for this scope, with the reason a reader gets.
 *
 * Both callers surface it the same way and neither substitutes another report:
 * the route answers `422 REPORT_TYPE_NOT_COMPUTED` with `message`, and the sweep
 * lets it throw so the item fails and its cursor does not advance.
 */
export class ReportTypeNotComputed extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportTypeNotComputed';
  }
}

/** The report type's registry row, for the engines that read it. */
export interface DeclaredType {
  label?: string | null;
  region?: string | null;
  dataDependencies?: readonly string[] | null;
}

export interface ComputeRunInput {
  engine: ReportEngine;
  typeId: string;
  organizationId: number;
  scopeType: ReportScope | string;
  scopeId: string;
  /** A client filter only supported engines can substantiate. */
  clientWorkspaceId?: number | null;
  /** The registry row. The `regional` engine reads it; it reads the deployed row itself when omitted. */
  declared?: DeclaredType;
  /** Program scope only: the project ids of the report program group. */
  programProjectIds?: number[];
  /**
   * A registry id and submission type the CALLER supplied, for the readiness
   * orchestrator. The sweep has neither and passes neither — it used to pass the
   * report type id as `explicitRegistryId`, which `orchestrator.ts` declares and
   * never reads, and which was the carrier of the j8 defect.
   */
  explicitRegistryId?: string;
  explicitSubmissionType?: string;
}

export interface ComputeRunResult {
  computed: RunComputationResult;
  /** The evidence trace's own rendered document, when the lineage engine ran. */
  lineageRendered?: RenderedReport;
}

/**
 * The document-scoped evidence trace: its body is the EXISTING per-document
 * lineage dossier mapped into RenderedReport blocks with provenance atoms, and
 * its confidence is the lineage engine's measured provenance completeness (P-26).
 *
 * The generic project-scope providers do not apply to a single artifact, so
 * their (spurious) blockers are dropped. No dossier is NO RUN: it used to fall
 * back to the generic run, which is the digest under the trace's title.
 */
async function applyLineage(
  computed: RunComputationResult,
  input: ComputeRunInput,
): Promise<RenderedReport> {
  let rendered: RenderedReport | undefined;
  try {
    const [{ buildDocumentLineageDossier }, { dossierToRenderedReport, lineageTraceConfidence }] =
      await Promise.all([
        import('../ana/lineage-dossier.js'),
        import('./lineage-trace-report.js'),
      ]);
    const dossier = await buildDocumentLineageDossier(input.scopeId, input.organizationId);
    if (dossier) {
      computed.confidence = lineageTraceConfidence(dossier);
      computed.blockers = [];
      computed.criticalBlockers = [];
      computed.summary.lineageDocument = dossier.ledger.artifact.artifactId;
      rendered = dossierToRenderedReport(dossier, {
        reportTypeId: input.typeId,
        reportTypeLabel: input.declared?.label ?? input.typeId,
        status: 'partial',
      });
      rendered.computedScope = 'document';
    }
  } catch (err) {
    log.warn('lineage dossier unavailable for evidence trace run', {
      err: err instanceof Error ? err.message : String(err),
    });
  }
  if (!rendered) {
    throw new ReportTypeNotComputed(
      'No lineage record was found for this document, so its evidence trace was not run.',
    );
  }
  return rendered;
}

/**
 * Compute the run for `engine`, whatever the caller is.
 *
 * Throws {@link ReportTypeNotComputed} when the type cannot be computed for this
 * scope — a market the program is not filing in, a document with no lineage
 * record — so a failure to compute is a failed run and never another report in
 * its place.
 */
/** The readiness orchestrator's options, omitting what this caller does not have. */
function readinessOptions(input: ComputeRunInput): Parameters<typeof computeInitialRun>[3] {
  return {
    ...(input.programProjectIds ? { programProjectIds: input.programProjectIds } : {}),
    ...(input.explicitRegistryId ? { explicitRegistryId: input.explicitRegistryId } : {}),
    ...(input.explicitSubmissionType ? { explicitSubmissionType: input.explicitSubmissionType } : {}),
  };
}

/**
 * The market assessment, with its refusals turned into {@link ReportTypeNotComputed}.
 *
 * It refuses rather than guesses — a program with no registry context, a program
 * filing in another market, a scope that is not one program — and each refusal
 * is the market's own reason (regional/filing-readiness.ts).
 */
async function regionalRun(input: ComputeRunInput): Promise<RunComputationResult> {
  try {
    // Undefined asks the engine to read its deployed registry row. An empty
    // declaration suppresses that read and refuses every scheduled market run.
    return await computeRegionalRun(input.typeId, input.organizationId, input.scopeType, input.scopeId, input.declared);
  } catch (error) {
    if (error instanceof Error && error.name === 'RegionalNotComputed') {
      throw new ReportTypeNotComputed(error.message);
    }
    throw error;
  }
}

function recordAccessProjects(result: ComputeRunResult, input: ComputeRunInput): ComputeRunResult {
  if (input.scopeType === 'program') {
    if (!Array.isArray(input.programProjectIds) || !input.programProjectIds.every(id => Number.isSafeInteger(id) && id > 0)) {
      throw new ReportTypeNotComputed('The program group project set could not be verified, so this report was not run.');
    }
    result.computed.summary.accessProjectIds = [...input.programProjectIds];
  }
  return result;
}

export async function computeRunForType(input: ComputeRunInput): Promise<ComputeRunResult> {
  const { engine, typeId, organizationId, scopeType, scopeId } = input;

  if (engine === 'domain') {
    return recordAccessProjects({ computed: await computeDomainRun(typeId, organizationId, scopeType, scopeId, { clientWorkspaceId: input.clientWorkspaceId }) }, input);
  }
  if (engine === 'regional') {
    return recordAccessProjects({ computed: await regionalRun(input) }, input);
  }
  if (engine === 'lineage') {
    // Only this document's dossier is evidence for its trace. Generic readiness
    // treats a numeric scope as a project ID and cannot substantiate this record.
    const computed: RunComputationResult = {
      providers: [], confidence: null, blockers: [], criticalBlockers: [],
      summary: { scopeType, scopeId, computedScope: 'document' },
    };
    return recordAccessProjects({ computed, lineageRendered: await applyLineage(computed, input) }, input);
  }
  if (engine === 'readiness') {
    const computed = await computeInitialRun(
      organizationId,
      scopeType as ReportScope,
      scopeId,
      readinessOptions(input),
    );
    return recordAccessProjects({ computed }, input);
  }

  /* Exhaustiveness, enforced by the compiler. A fifth engine stops the build
     here instead of silently reaching the readiness digest, which is how the
     sweep computed the digest for the lineage trace. */
  const unreached: never = engine;
  throw new ReportTypeNotComputed(`No engine dispatch for ${String(unreached)}.`);
}
