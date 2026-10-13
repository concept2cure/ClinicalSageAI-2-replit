/**
 * Why a PQ criterion cannot be applied as written.
 *
 * Split out of pq-verdict.ts (founder decision P-31, 2026-10-13) when the
 * extraction half was added and the file crossed its line limit. The two
 * halves belong together: they answer one question for two components under
 * one rule — a criterion this verdict does not measure, or one that is missing
 * or not a number between 0 and 1, is INCOMPLETE and never met. Keeping them
 * in one place is what stops the next component acquiring a third, looser
 * copy, which is how extraction came to have none at all.
 *
 * @module server/eval/pq/pq-criteria
 */
/** A 0–1 score: finite, and in range. NaN never compares below a minimum, so it must never reach a mean. */
export const isUnitScore = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

/** A value as a reason shows it: strings quoted, so "0.6" reads differently from 0.6. */
export const shown = (v: unknown): string => (typeof v === 'string' ? JSON.stringify(v) : String(v));

/** A sample floor: a whole number of items, at least one. */
export const isFloor = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1;

/** The rag criteria this verdict applies. A key outside this list is not assessed, so it is INCOMPLETE. */
const RAG_CRITERIA = ['minHitRate', 'minFaithfulness', 'minItemFaithfulness', 'minScoredItems'] as const;

/**
 * Why the protocol's rag criteria cannot be applied as written. Each of these
 * used to be skipped in silence — a missing or string minimum was not checked,
 * and an unknown key (a misspelt floor) was not read — so rag PASSed on any
 * scored item. A criterion that cannot be applied is INCOMPLETE, never met.
 *
 * `minScoredItems` is the sample floor: the fewest distinct items the pinned
 * model verifiably answered on which EACH criterion must be measured. Generation
 * has one (minTasksPerDocType); without one here, one scored item out of a
 * 30-50 item gold set would qualify the component.
 *
 * `minItemFaithfulness` is the PER-ITEM floor, and it is required for the same
 * reason (founder decision P-31, 2026-10-13). `minFaithfulness` is a MEAN, and
 * the judge is told that 0 means the answer is "unsupported or contradicted"
 * — so at the protocol's own sample floor of 30, nine zero-scored items pass a
 * mean of 0.70. Thirty per cent of the bank could be fabrication and the model
 * would qualify to draft high-risk regulatory content. Generation already has
 * the right shape for a per-item harm (`maxForbiddenHits: 0`, an absolute zero
 * rather than an average); rag now matches it. A protocol that declares no
 * per-item floor cannot qualify the component, exactly as one with no sample
 * floor cannot.
 */
export function ragCriteriaProblems(criteria: Record<string, unknown> | undefined): string[] {
  const c: Record<string, unknown> = criteria && typeof criteria === 'object' ? criteria : {};
  const out: string[] = [];
  for (const key of Object.keys(c)) {
    if (!(RAG_CRITERIA as readonly string[]).includes(key)) {
      out.push(`rag criterion "${key}" is not one this verdict measures (${RAG_CRITERIA.join(', ')}), so it was not assessed`);
    }
  }
  for (const key of ['minHitRate', 'minFaithfulness'] as const) {
    if (!isUnitScore(c[key])) {
      out.push(`rag criterion ${key} is ${key in c ? shown(c[key]) : 'missing'}, not a number between 0 and 1`);
    }
  }
  if (!isUnitScore(c.minItemFaithfulness)) {
    out.push(
      'minItemFaithfulness' in c
        ? `rag criterion minItemFaithfulness is ${shown(c.minItemFaithfulness)}, not a number between 0 and 1`
        : 'the protocol sets no per-item rag faithfulness floor (criteria.minItemFaithfulness), so a mean could qualify the component over answers the judge scored as unsupported',
    );
  }
  const floor = c.minScoredItems;
  if (floor === undefined) {
    out.push('the protocol sets no rag sample floor (criteria.minScoredItems), so no number of scored items could qualify the component');
  } else if (!isFloor(floor)) {
    out.push(`rag criterion minScoredItems is ${shown(floor)}, not a positive whole number`);
  }
  return out;
}

/** The extraction criteria this verdict applies. A key outside this list is not assessed, so it is INCOMPLETE. */
const EXTRACTION_CRITERIA = ['minF1'] as const;

/**
 * Why the protocol's extraction criteria cannot be applied as written — the
 * mirror of {@link ragCriteriaProblems}, and added for the same reason
 * (founder decision P-31, 2026-10-13): a missing, misspelt or non-numeric
 * minimum left the component with nothing to miss, so the PQ passed on it.
 *
 * `minTasksPerDocType` is deliberately NOT in the list yet. The protocol
 * declares no extraction sample floor, and P-31 records why it is owed rather
 * than set here: the floor that matches generation's is 10 per document type,
 * the bank holds 4, and the 18 tasks owed need real source text with real
 * expected fields. Inventing them would fabricate the evidence the bank exists
 * to provide (gold-tasks.json says so of itself). Until the bank can meet a
 * floor, declaring one would turn a green gate red without making any model
 * better qualified — and the protocol is `draft`, so it can qualify nothing in
 * the meantime either way.
 */
export function extractionCriteriaProblems(criteria: Record<string, unknown> | undefined): string[] {
  const c: Record<string, unknown> = criteria && typeof criteria === 'object' ? criteria : {};
  const out: string[] = [];
  for (const key of Object.keys(c)) {
    if (!(EXTRACTION_CRITERIA as readonly string[]).includes(key)) {
      out.push(`extraction criterion "${key}" is not one this verdict measures (${EXTRACTION_CRITERIA.join(', ')}), so it was not assessed`);
    }
  }
  if (!isUnitScore(c.minF1)) {
    out.push(`extraction criterion minF1 is ${'minF1' in c ? shown(c.minF1) : 'missing'}, not a number between 0 and 1`);
  }
  return out;
}
