/**
 * @fileoverview The ONE reader that may hand a program's CMC data to a submission package.
 * @module server/services/cmc/load-approved-cmc-sources-for-project
 *
 * ## The defect this closes
 *
 * GA plan item 1 (decision 2026-10-05): *retire the submission orchestrator's
 * parallel Module 3.*
 *
 * Module 3 reaches a submission through one governed path: compile the
 * sections, approve each one under Part 11, let `evaluateFinalExportGate`
 * judge the program, then place the sections as leaves
 * (`place-module3-into-submission.ts`). Approval is where a person takes
 * responsibility for the content; the gate is where the program's
 * contradictions, staleness, provenance gaps and compiled-record drift are
 * weighed.
 *
 * The submission-package orchestrator had a second path that skipped all of
 * it. `POST /api/submission-orchestrator/runs` (Mode A) called
 * `loadCmcSourcesForProject`, which reads **every** `cmc_source_objects` row
 * for the program — approved or not, swept or not, stale or not — and the
 * `m3.compose` step composed Module 3 from them. Those composed sections then
 * became the run's leaf manifest (`package.assemble` derives one leaf per
 * composed section), which `package.sign` signs.
 *
 * So a program whose Module 3 nobody had approved — or whose approvals the
 * gate refuses — could be composed, assembled, validated and **released under
 * an e-signature**, with none of the governance the one path exists to impose.
 *
 * ## The rule
 *
 * A submission package carries a program's Module 3 only when that program's
 * export gate is **open**. The gate is not re-implemented here and its verdict
 * is not re-interpreted: `evaluateFinalExportGate` is asked, and its `allowed`
 * decides.
 *
 * When the gate refuses, the run carries **no** Module 3 — every `m3.*` step
 * and `m2.3.qos` record "no inputs", and the assembled package holds no
 * Module 3 leaf. It does not carry a partial or unapproved one, because a
 * package assembled from content nobody approved is the thing this exists to
 * prevent.
 *
 * ## Why this is not silent
 *
 * The refusal reason travels back to the caller, which records it on the run's
 * audit row. A run that carries no Module 3 because the gate is closed reads
 * differently from one over a program that has no CMC data at all — and both
 * read differently from a gate that could not be evaluated, which is returned
 * as `unknown` and never as "nothing to carry".
 */

import { evaluateFinalExportGate } from './final-export-gate.js';
import { loadCmcSourcesForProject } from './load-cmc-sources-for-project.js';
import { assessProgramCompositionScope } from './module3-compile.js';
import type { CanonicalSource } from '../module3Composer';
import { createScopedLogger } from '../../utils/logger.js';

const log = createScopedLogger('load-approved-cmc-sources');

export type GovernedCmcSources =
  | {
      /** The gate is open: these sources may be composed into a package. */
      gate: 'open';
      sources: CanonicalSource[];
      approvedSections: number;
    }
  | {
      /** The gate refused, so the package carries no Module 3. */
      gate: 'closed';
      sources: [];
      /** The gate's own wording, for the audit row and the caller's response. */
      reason: string;
    }
  | {
      /** The gate could not be evaluated. Not an empty program. */
      gate: 'unknown';
      sources: [];
      reason: string;
    };

/**
 * The program's CMC sources, but only if its Module 3 may be exported.
 *
 * @param orgId      Positive integer organization id.
 * @param projectId  CMC program uuid (`cmc_projects.id`).
 * @param actorId    Who the run is attributed to, for the gate's own read.
 */
export async function loadApprovedCmcSourcesForProject(
  orgId: number,
  projectId: string,
  actorId: string,
): Promise<GovernedCmcSources> {
  let verdict: Awaited<ReturnType<typeof evaluateFinalExportGate>>;
  try {
    verdict = await evaluateFinalExportGate({ orgId, projectId, actorId });
  } catch (err) {
    /* Fail closed, and say which failure it was. Returning an empty list
       without this branch would tell a caller that a program with approved,
       gate-clean Module 3 simply had none. */
    const detail = err instanceof Error ? err.message : String(err);
    log.warn('export gate could not be evaluated; the package carries no Module 3', {
      orgId,
      projectId,
      err: detail,
    });
    return {
      gate: 'unknown',
      sources: [],
      reason:
        `This program's Module 3 export gate could not be evaluated, so no Module 3 was carried into the ` +
        `package. Nothing is known about its approval state. The failure is in the server log.`,
    };
  }

  if (!verdict.allowed) {
    return {
      gate: 'closed',
      sources: [],
      reason:
        verdict.error ??
        `This program's Module 3 is not cleared for export, so no Module 3 was carried into the package. ` +
          `Approve every composed section in the CMC module and clear its findings first.`,
    };
  }

  /* The composition boundary (decision P-28: small-molecule Module 3 for a US
     IND). The gate judges approval, not what the program is: a biologic, or a
     program filing an NDA, whose sections were approved before the boundary
     existed passes it, and the orchestrator then composed, assembled and
     signed that Module 3 into a package (2026-10-22, the launch-boundary
     re-proof's review). Asked here, the one door the orchestrator's Module 3
     comes through; the refusal is the reason the run records. */
  let scopeRefusal: Awaited<ReturnType<typeof assessProgramCompositionScope>>;
  try {
    scopeRefusal = await assessProgramCompositionScope(orgId, projectId);
  } catch (err) {
    log.warn('composition boundary could not be evaluated; the package carries no Module 3', {
      orgId,
      projectId,
      err: err instanceof Error ? err.message : String(err),
    });
    return {
      gate: 'unknown',
      sources: [],
      reason:
        `Whether this program's Module 3 is within what this platform composes could not be established, so ` +
        `no Module 3 was carried into the package. The failure is in the server log.`,
    };
  }
  if (scopeRefusal) return { gate: 'closed', sources: [], reason: scopeRefusal.message };

  const sources = await loadCmcSourcesForProject(orgId, projectId);
  return { gate: 'open', sources, approvedSections: verdict.data.approvedSections };
}

export default { loadApprovedCmcSourcesForProject };
