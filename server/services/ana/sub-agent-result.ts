/**
 * The pure half of `run_agent` (row 74, S5; ADR-0015 §7): how a verification
 * agent's deterministic checks are read, how their outcomes become one verdict,
 * and how a finished agent is recorded in the turn's trace.
 *
 * Kept apart from `sub-agent.ts`, which loads the executor and the gateway, so
 * the stream and the trace can import these without pulling either in.
 *
 * Every reader fails closed. A result it cannot parse, a verdict it does not
 * know, or a 'clean' that compared nothing is never a pass: "nothing was
 * checked" is not "clean" (ADR-0015 §7). The verdict comes only from these
 * checks; the agent's own report is advisory.
 *
 * Re-derived 2026-10-05 from trunk's handlers (e7021b7bb is the canonical
 * dossier and integrity implementation): the dossier check answers a
 * not-compared case with `{ error, notCompared }` or `{ error, unavailable }`,
 * and a 'clean' over zero documents with `artifactsCompared: 0`.
 *
 * @module server/services/ana/sub-agent-result
 */

import type { DossierConsistencyVerdict } from '@shared/ana/dossier-consistency';

/**
 * The checks a verification agent runs on the text it was given, before it
 * starts. Each is deterministic and calls no model. What each establishes, and
 * no more (dated 2026-10-05):
 *   - check_grounding: whether each quantitative claim carries a citation
 *     marker. The marker is not checked against any source.
 *   - check_numerical_integrity: whether a labelled figure stated more than
 *     once in the text is stated with two different values.
 *   - check_dossier_consistency: whether a labelled figure differs from the
 *     same labelled figure in the open project's other documents.
 */
export const HARNESS_CHECKS = ['check_grounding', 'check_numerical_integrity', 'check_dossier_consistency'] as const;
export type HarnessCheck = (typeof HARNESS_CHECKS)[number];

/**
 * One check's outcome. 'not_assessed' means it compared nothing; it is never
 * counted as a pass. 'see_result' means the check ran and its result needs a
 * reader's judgement.
 */
export type CheckOutcome = 'pass' | 'fail' | 'see_result' | 'not_assessed' | 'error';

export interface CheckReading {
  check: HarnessCheck;
  outcome: CheckOutcome;
  /** One plain sentence, prefixed with what was checked. */
  statement: string;
}

export type VerifyVerdict = 'issues_found' | 'no_issues_found' | 'inconclusive' | 'nothing_checkable';

function parsed(json: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(json);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null);

const UNREADABLE = 'the check returned a result that could not be read.';

/** `check_grounding`. It never passes: a marker is not a source. */
export function readGroundingCheck(json: string): CheckReading {
  const read = (outcome: CheckOutcome, s: string): CheckReading => ({
    check: 'check_grounding',
    outcome,
    statement: `Citation markers: ${s}`,
  });
  const r = parsed(json);
  if (!r) return read('error', UNREADABLE);
  if (isText(r.error)) return read('error', r.error);
  const total = count(r.totalClaims);
  if (total === null) return read('error', UNREADABLE);
  if (total === 0) return read('not_assessed', 'no quantitative claim was found, so none was checked.');
  // An array of { sentence, numbers }: `ungroundedClaims > 0` is false for any array.
  if (!Array.isArray(r.ungroundedClaims)) return read('error', UNREADABLE);
  const unmarked = r.ungroundedClaims.length;
  if (unmarked > 0) return read('fail', `${unmarked} of ${total} quantitative claims carry no citation marker.`);
  return read(
    'see_result',
    `all ${total} quantitative claims carry a citation marker; the cited sources were not opened.`,
  );
}

/** `check_numerical_integrity`. 'clean' passes only if a figure was actually compared. */
export function readIntegrityCheck(json: string): CheckReading {
  const read = (outcome: CheckOutcome, s: string): CheckReading => ({
    check: 'check_numerical_integrity',
    outcome,
    statement: `Internal consistency: ${s}`,
  });
  const r = parsed(json);
  if (!r) return read('error', UNREADABLE);
  if (isText(r.error)) return read('error', r.error);
  const facts = count(r.factsExtracted);
  const compared = count(r.labelsCompared);
  switch (r.verdict) {
    case 'likely_inconsistency':
      return read('fail', 'the same document-level quantity is stated with two different values.');
    case 'review_candidates': {
      const n = count(r.candidateCount) ?? 0;
      return read(
        'see_result',
        `${n} labelled figure${n === 1 ? ' is' : 's are'} stated with more than one value; each may be a mismatch or a legitimate difference (arms, timepoints).`,
      );
    }
    case 'clean':
      if (facts === null) return read('error', UNREADABLE);
      if (facts === 0) return read('not_assessed', 'no labelled figures were found.');
      if (!compared) {
        return read('not_assessed', 'no labelled figure is stated more than once, so no values were compared.');
      }
      return read(
        'pass',
        `${compared} labelled figure${compared === 1 ? ' is' : 's are'} stated more than once; none has two different values.`,
      );
    default:
      return read('error', UNREADABLE);
  }
}

/** A dossier 'clean' passes only over figures and documents actually compared, all of them. */
function cleanDossierOutcome(r: Record<string, unknown>): CheckOutcome {
  const docs = count(r.artifactsCompared);
  const figures = count(r.draftFactsExtracted);
  if (docs === null || figures === null) return 'error';
  if (docs === 0 || figures === 0) return 'not_assessed';
  // Only some of the project's documents were read: clean over a part is not a pass.
  if (r.truncated === true) return 'see_result';
  return 'pass';
}

/**
 * `check_dossier_consistency`. Every statement is the handler's own words
 * after 'Project records: ', so no second copy of its sentences exists.
 */
export function readDossierCheck(json: string): CheckReading {
  const read = (outcome: CheckOutcome, s: string): CheckReading => ({
    check: 'check_dossier_consistency',
    outcome,
    statement: `Project records: ${s}`,
  });
  const r = parsed(json);
  if (!r) return read('error', UNREADABLE);
  if (isText(r.error)) {
    // Compared nothing for a stated reason (a short draft, no figures) is not
    // assessed; a failed read is an error.
    return read(isText(r.notCompared) && r.unavailable !== true ? 'not_assessed' : 'error', r.error);
  }
  const said = isText(r.recommendation) ? r.recommendation : UNREADABLE;
  // Switched exhaustively over the shared union; anything else (not a
  // string, or a verdict this reader does not know) falls to the error.
  const verdict = r.verdict as DossierConsistencyVerdict;
  switch (verdict) {
    case 'blocker':
    case 'needs_review':
      // needs_review is a high-severity figure divergence: the same kind of
      // finding as a blocker, one step lower.
      return read('fail', said);
    case 'minor_issues':
      return read('see_result', said);
    case 'not_assessed':
      return read('not_assessed', said);
    case 'clean':
      return read(cleanDossierOutcome(r), said);
    default: {
      const unknown: never = verdict;
      void unknown;
      return read('error', UNREADABLE);
    }
  }
}

/**
 * The dossier check was not called. Under the v2 shell this is the common case:
 * the open program is a uuid, and the check reads an integer project.
 */
export function dossierCheckSkipped(programOpen: boolean): CheckReading {
  return {
    check: 'check_dossier_consistency',
    outcome: 'not_assessed',
    statement: programOpen
      ? 'Project records: not compared. The open program has no numeric project id this check can read.'
      : 'Project records: not compared. No project is open.',
  };
}

/**
 * One verdict from the checks' outcomes. Any fail is an issue; otherwise any
 * error or result needing judgement leaves it inconclusive; a pass with
 * nothing worse is no issues; and checks that all compared nothing are
 * nothing checkable — never no issues.
 */
export function aggregateVerdict(readings: readonly CheckReading[]): VerifyVerdict {
  const has = (o: CheckOutcome) => readings.some(r => r.outcome === o);
  if (has('fail')) return 'issues_found';
  if (has('error') || has('see_result')) return 'inconclusive';
  if (has('pass')) return 'no_issues_found';
  return 'nothing_checkable';
}

/** The status a step is recorded with. 'incomplete' is only ever an agent's. */
export type MechanicalStatus = 'success' | 'error' | 'not_found' | 'cancelled';
export type AgentTraceStatus = MechanicalStatus | 'incomplete';

/**
 * A finished `run_agent` step's status. It refines only a mechanical
 * 'success': anything else (a person's Stop, a refusal, a throw) is kept.
 * An agent that ran to completion succeeded whatever its verdict — the
 * verdict carries the uncertainty. 'incomplete' means one thing: the child
 * stopped at a budget. A result that cannot be read is never 'success'.
 */
export function agentTraceStatus(mechanical: MechanicalStatus, fullResult: string): AgentTraceStatus {
  if (mechanical !== 'success') return mechanical;
  const r = parsed(fullResult);
  if (!r) return 'incomplete';
  if (isText(r.error)) return 'error';
  switch (r.status) {
    case 'completed':
      return 'success';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'incomplete';
  }
}

const BUDGET_SHORT: Record<string, string> = { rounds: 'round limit', tokens: 'token budget', time: 'time budget' };

/**
 * One line for a finished `run_agent` step, from what the result says it did:
 * role, status, the budget that stopped it, the verdict. Never a prefix of the
 * JSON, which would end mid-objective.
 */
export function agentResultSummary(fullResult: string): string {
  const r = parsed(fullResult);
  if (!r) return 'agent: result could not be read';
  const agent = (r.agent ?? {}) as { role?: unknown };
  const who = agent.role === 'verify' ? 'verification agent' : 'agent';
  if (isText(r.error)) {
    return `${who}: did not run (${r.error}${isText(r.code) ? `, ${r.code}` : ''})`;
  }
  const status = typeof r.status === 'string' ? r.status : 'unknown';
  const budget = typeof r.budget === 'string' && BUDGET_SHORT[r.budget] ? ` (${BUDGET_SHORT[r.budget]})` : '';
  const verdict = typeof r.verdict === 'string' ? `, ${r.verdict}` : '';
  return `${who}: ${status}${budget}${verdict}`;
}
