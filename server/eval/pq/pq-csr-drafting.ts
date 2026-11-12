/**
 * The qualification component that measures CSR drafting (founder decisions P-115 item 2 and P-118, 2026-11-10).
 *
 * Split out of pq-verdict.ts, which is past its line limit, as pq-criteria.ts was. It holds the record a CSR
 * drafting run retains and the one reading of that record the verdict applies. It is pure: no model, no gateway,
 * no file. The run that produces the record (the CSR builder's own drafting, over one public study) is a separate
 * piece and is still owed; so is the canonical evidence check on such a record (verify-pq-record.ts refuses to
 * verify a pass on it until then).
 *
 * What is measured, and how each shortfall is called:
 *   - every planned narrative heading verifiably drafted by the pinned model. A heading that was not drafted (the
 *     provider failed) or whose serving model could not be verified makes the run INCOMPLETE. That is the run's
 *     shortfall, not the model's, as rule 4 of the verdict says of every other component;
 *   - the share of headings whose FIRST draft passed every check of the builder. Below the floor is a FAIL: each
 *     refusal was caught, and a model refused that often is still not fit to draft a report (P-118);
 *   - in accepted text, no figure that a second pass, independent of the builder's own check, could not find as a
 *     claimed cell of the retained tables (CLAUDE.md RULE 2; P-115 item 1). One is a FAIL;
 *   - in accepted text, no forbidden phrase, as the generation component requires. One is a FAIL.
 * A criterion that is missing, misspelt or not a number this step can apply is INCOMPLETE, never met
 * (pq-criteria.ts states the rule for the other components).
 *
 * @module server/eval/pq/pq-csr-drafting
 */
import { isUnitScore, shown } from './pq-criteria';

/** One ICH E3 narrative heading as the CSR builder drafted it under qualification. */
export interface PqCsrDraftingResult {
  sectionNumber: string;
  /** The model the gateway reported for the draft; null when no draft came back. */
  servedModel: string | null;
  servedModelVerified: boolean;
  /** What became of the model's first draft: kept because every builder check passed, or refused by one. Null when no draft came back. */
  firstDraft: 'accepted' | 'refused' | null;
  /** In accepted text only: figures the independent second pass could not find as a claimed cell of the retained tables. */
  unclaimedFigures: number | null;
  /** In accepted text only: forbidden phrases, by the generation component's own list. */
  forbiddenHits: number | null;
  error?: string;
}

/** What a CSR drafting run retains for the verdict. */
export interface PqCsrDraftingRecord {
  /** The public study the builder drafted over, and the digest of the source it read. */
  study: { studyId: string; sourceSha256: string };
  /** Every narrative heading the builder drafts, in report order. */
  plannedHeadings: string[];
  /** One row for each planned heading. */
  headings: PqCsrDraftingResult[];
}

interface Component { required: boolean; executable: boolean; criteria: Record<string, unknown> }
export interface PqCsrDraftingFindings { incomplete: string[]; missed: string[] }

const SHARES = ['minHeadingsAttemptedShare', 'minAcceptedDraftShare'] as const;
const CEILINGS = ['maxUnclaimedFiguresInAcceptedText', 'maxForbiddenHits'] as const;
const CRITERIA: readonly string[] = [...SHARES, ...CEILINGS];
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const sections = (rows: readonly PqCsrDraftingResult[]): string => rows.map((row) => `§${row.sectionNumber}`).join(', ');
const round = (share: number): number => Math.round(share * 100) / 100;

/** Why the protocol's CSR drafting criteria cannot be applied as written. */
export function csrDraftingCriteriaProblems(criteria: Record<string, unknown> | undefined): string[] {
  const c: Record<string, unknown> = criteria && typeof criteria === 'object' ? criteria : {};
  const out: string[] = [];
  for (const key of Object.keys(c)) {
    if (!CRITERIA.includes(key)) out.push(`csrDrafting criterion "${key}" is not one this verdict measures (${CRITERIA.join(', ')}), so it was not assessed`);
  }
  for (const key of SHARES) {
    if (!isUnitScore(c[key])) out.push(`csrDrafting criterion ${key} is ${key in c ? shown(c[key]) : 'missing'}, not a number between 0 and 1`);
  }
  for (const key of CEILINGS) {
    if (!isCount(c[key])) out.push(`csrDrafting criterion ${key} is ${key in c ? shown(c[key]) : 'missing'}, not a whole number of zero or more`);
  }
  return out;
}

const isHeadingNumber = (v: unknown): v is string => typeof v === 'string' && /^\d+(?:\.\d+)*$/.test(v);
const saysWhoAnswered = (r: Partial<PqCsrDraftingResult>): boolean =>
  (r.servedModel === null || typeof r.servedModel === 'string') && typeof r.servedModelVerified === 'boolean';
const saysFirstDraft = (r: Partial<PqCsrDraftingResult>): boolean => r.firstDraft === null || r.firstDraft === 'accepted' || r.firstDraft === 'refused';
const countsAreWhole = (r: Partial<PqCsrDraftingResult>): boolean =>
  (r.unclaimedFigures === null || isCount(r.unclaimedFigures)) && (r.forbiddenHits === null || isCount(r.forbiddenHits));

function rowProblem(row: unknown): string | null {
  const r = row as Partial<PqCsrDraftingResult> | null;
  if (!r || typeof r !== 'object' || !isHeadingNumber(r.sectionNumber)) return 'a heading row names no ICH E3 heading';
  if (!saysWhoAnswered(r)) return `§${r.sectionNumber} does not say which model answered`;
  if (!saysFirstDraft(r)) return `§${r.sectionNumber} does not say what became of its first draft`;
  if (!countsAreWhole(r)) return `§${r.sectionNumber} carries a count that is not a whole number`;
  return null;
}

const plansHeadings = (planned: unknown): planned is string[] =>
  Array.isArray(planned) && planned.length > 0 && planned.every((n) => typeof n === 'string') && new Set(planned).size === planned.length;
const identifiesStudy = (study: PqCsrDraftingRecord['study'] | undefined): boolean =>
  typeof study?.studyId === 'string' && !!study.studyId && /^[0-9a-f]{64}$/.test(String(study?.sourceSha256));

/** Why the record cannot be read as one row for each planned heading. */
function recordProblems(record: PqCsrDraftingRecord): string[] {
  const planned = record?.plannedHeadings;
  const rows = record?.headings;
  if (!plansHeadings(planned) || !Array.isArray(rows)) return ['the csrDrafting record names no planned headings, or names one twice'];
  if (!identifiesStudy(record.study)) return ['the csrDrafting record does not identify the study it drafted over and the digest of its source'];
  const malformed = rows.map(rowProblem).filter((problem): problem is string => problem !== null);
  if (malformed.length) return malformed.slice(0, 5).map((problem) => `the csrDrafting record is malformed: ${problem}`);
  if (rows.length !== planned.length || planned.some((n, index) => rows[index].sectionNumber !== n)) {
    return ['the csrDrafting record does not hold exactly one row for each planned heading, in report order'];
  }
  return [];
}

function coverageShortfalls(rows: readonly PqCsrDraftingResult[], verified: readonly PqCsrDraftingResult[], floor: number): string[] {
  const out: string[] = [];
  for (const row of rows.filter((r) => r.firstDraft !== null && !r.error && !r.servedModelVerified)) {
    out.push(`csrDrafting heading §${row.sectionNumber} was answered by ${shown(row.servedModel)}, which could not be verified as the pinned model`);
  }
  const share = verified.length / rows.length;
  if (share < floor) {
    const failed = rows.filter((r) => r.error).slice(0, 5).map((r) => `§${r.sectionNumber}: ${r.error}`);
    out.push(`csrDrafting: ${verified.length} of ${rows.length} planned headings were verifiably drafted by the pinned model (share ${round(share)}), below minHeadingsAttemptedShare ${floor}`
      + (failed.length ? ` (${failed.join('; ')})` : ''));
  }
  return out;
}

function criteriaMissed(criteria: Record<string, number>, verified: readonly PqCsrDraftingResult[], accepted: readonly PqCsrDraftingResult[]): string[] {
  const out: string[] = [];
  if (verified.length) {
    const share = accepted.length / verified.length;
    const refused = verified.filter((r) => r.firstDraft === 'refused');
    if (share < criteria.minAcceptedDraftShare) {
      out.push(`csrDrafting accepted-draft share ${round(share)} is below minAcceptedDraftShare ${criteria.minAcceptedDraftShare}: `
        + `${refused.length} of ${verified.length} first drafts were refused (${sections(refused)})`);
    }
  }
  const unclaimed = accepted.filter((r) => (r.unclaimedFigures ?? 0) > 0);
  const figures = unclaimed.reduce((sum, r) => sum + (r.unclaimedFigures ?? 0), 0);
  if (figures > criteria.maxUnclaimedFiguresInAcceptedText) {
    out.push(`csrDrafting: ${figures} ${figures === 1 ? 'figure in accepted text is' : 'figures in accepted text are'} not a claimed cell of the retained tables (${sections(unclaimed)}); `
      + `maxUnclaimedFiguresInAcceptedText is ${criteria.maxUnclaimedFiguresInAcceptedText}`);
  }
  const forbidden = accepted.filter((r) => (r.forbiddenHits ?? 0) > 0);
  const hits = forbidden.reduce((sum, r) => sum + (r.forbiddenHits ?? 0), 0);
  if (hits > criteria.maxForbiddenHits) {
    out.push(`csrDrafting: ${hits} forbidden ${hits === 1 ? 'hit' : 'hits'} in accepted text (${sections(forbidden)}); maxForbiddenHits is ${criteria.maxForbiddenHits}`);
  }
  return out;
}

/**
 * What a CSR drafting record leaves incomplete and what it misses. Nothing when the component is not required or
 * cannot be executed: the verdict's own step already names a required component that cannot run.
 */
export function csrDraftingFindings(component: Component | undefined, record: PqCsrDraftingRecord | undefined): PqCsrDraftingFindings {
  if (!component?.required || !component.executable) return { incomplete: [], missed: [] };
  const criteriaProblems = csrDraftingCriteriaProblems(component.criteria);
  if (criteriaProblems.length) return { incomplete: criteriaProblems, missed: [] };
  if (record === undefined) return { incomplete: ['required component "csrDrafting" is executable but was not run'], missed: [] };
  const unreadable = recordProblems(record);
  if (unreadable.length) return { incomplete: unreadable, missed: [] };
  const criteria = component.criteria as Record<string, number>;
  const rows = record.headings;
  const verified = rows.filter((r) => r.firstDraft !== null && !r.error && r.servedModelVerified);
  const accepted = verified.filter((r) => r.firstDraft === 'accepted');
  const unscored = accepted.filter((r) => r.unclaimedFigures === null || r.forbiddenHits === null);
  return {
    incomplete: [
      ...coverageShortfalls(rows, verified, criteria.minHeadingsAttemptedShare),
      ...unscored.map((r) => `csrDrafting heading §${r.sectionNumber} was accepted but carries no second-pass count of its figures and forbidden phrases`),
    ],
    missed: criteriaMissed(criteria, verified, accepted),
  };
}
