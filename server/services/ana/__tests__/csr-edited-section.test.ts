/** 2026-10-30 (edited-section re-check): what an edited CSR section's current
 * text does with each claimed cell. Pure. */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { editedClaimOutcome } from '../csr-edited-section';
import { planSections } from '../csr-saved-evidence';
import { CSR_CLAIM_RECEIPTS_SCHEMA, type CsrImportedSectionEvidence } from '../../csr/csr-claim-receipts';
import { acceptedSectionText, renderSection } from '../../authoring/authoring-read-render';
import { numericalText } from '../../../../shared/authoring/csr-scientific-review';

const CELL = { value: '16/305 (5.2%)' };
const PLACEBO = '10/300 (3.3%)';

describe('editedClaimOutcome', () => {
  it('is stated when the cell is verbatim, or every number of it survives a reformat', () => {
    expect(editedClaimOutcome('Cure: 16/305 (5.2%) subjects.', CELL, [CELL.value])).toEqual({ state: 'stated' });
    expect(editedClaimOutcome('Cure in 16 of 305 subjects (5.2%).', CELL, [CELL.value])).toEqual({ state: 'stated' });
    expect(editedClaimOutcome('Cure in 16 of 305 subjects (5.2%).', { ...CELL, population: 'n (%)' }, [CELL.value]))
      .toEqual({ state: 'stated' });
  });

  it('names the changed figure in the cell\'s shape, or an n/N with its denominator', () => {
    expect(editedClaimOutcome('Cure: 18/305 (5.9%) subjects.', CELL, [CELL.value])).toEqual({ state: 'changed', stated: '18/305 (5.9%)' });
    expect(editedClaimOutcome('Cure in 18 of 305 subjects.', CELL, [CELL.value])).toEqual({ state: 'changed', stated: '18 of 305' });
  });

  it('does not take another claimed cell for a changed figure', () => {
    expect(editedClaimOutcome(`Placebo: ${PLACEBO}.`, CELL, [CELL.value, PLACEBO])).toEqual({ state: 'removed' });
  });

  // Review (2026-10-30): a numerator another claimed cell happens to carry is
  // not that cell's figure. 18 of 305 is no claimed n/N, so it is FIGURE_CHANGED.
  it('names an n/N whose numerator coincides with another claimed cell\'s number', () => {
    const other = '18/300 (6.0%)';
    expect(editedClaimOutcome(`Cure in 18 of 305 subjects (5.2%). Placebo: ${other}.`, CELL, [CELL.value, other]))
      .toEqual({ state: 'changed', stated: '18 of 305' });
    expect(editedClaimOutcome(`Cure in 18 of 305 subjects. Placebo: ${other}.`, CELL, [CELL.value, other]))
      .toEqual({ state: 'changed', stated: '18 of 305' });
  });

  it('gives a one-number cell no shape: a different number is left to the unclaimed check', () => {
    expect(editedClaimOutcome('Randomized: 306.', { value: '305' }, ['305'])).toEqual({ state: 'removed' });
    expect(editedClaimOutcome('Randomized: 305.', { value: '305' }, ['305'])).toEqual({ state: 'stated' });
  });

  it('checks all conflicting shapes and ratios before accepting an exact occurrence', () => {
    expect(editedClaimOutcome(`First: ${CELL.value}. Second: 18/305 (5.9%).`, CELL, [CELL.value]))
      .toEqual({ state: 'changed', stated: '18/305 (5.9%)' });
    expect(editedClaimOutcome(`First: ${CELL.value}. Second: 18 of 305 subjects.`, CELL, [CELL.value]))
      .toEqual({ state: 'changed', stated: '18 of 305' });
  });

  it.each([
    ['<0.001', 'p=0.001.'], ['0.001', 'p<0.001.'], ['-2.50', 'The difference was 2.50.'],
    ['2.50', 'The difference was 2.5.'], ['12%', '12 patients completed.'], ['12', '12% completed.'],
  ])('does not call %s stated after its numeric meaning changes to %s', (value, prose) => {
    expect(editedClaimOutcome(prose, { value }, [value]).state).not.toBe('stated');
  });

  it('does not find a scalar count merely inside a ratio, suffix or longer number', () => {
    for (const text of ['10/12 subjects.', '112 subjects.', '12e3 subjects.', '12mg was supplied.']) {
      expect(editedClaimOutcome(text, { value: '12' }, ['12']).state).not.toBe('stated');
    }
  });

  it('preserves a correctly encoded figure and independently claimed aggregates', () => {
    expect(editedClaimOutcome('p &lt; 0.001.', { value: '<0.001' }, ['<0.001'])).toEqual({ state: 'stated' });
    const other = '18/305 (5.9%)';
    expect(editedClaimOutcome(`${CELL.value}; ${other}.`, CELL, [CELL.value, other])).toEqual({ state: 'stated' });
  });

  it.each([['Response (%)', true], ['%', true], ['Percentage', true], ['95% CI', false], ['n (%)', false], ['Count (%)', false]])(
    'rechecks saved percentage text only with percent-only column context (%s)', (header, accepted) => {
    const text = 'The response rate was 83.3%.';
    const hash = createHash('sha256').update(text).digest('hex');
    const receipt: CsrImportedSectionEvidence = { schema: CSR_CLAIM_RECEIPTS_SCHEMA,
      programId: '33333333-2222-4333-8444-000000000001', runId: '33333333-2222-4333-8444-000000000002',
      studyId: 'SYNTHETIC', sectionNumber: '11.4', evidenceDigest: 'a'.repeat(64), sourceSha256: 'b'.repeat(64),
      outputSha256: hash, sectionSha256: hash, studyInformationNumbers: [],
      claims: [{ table: 'primaryEfficacy', row: 0, column: 2, value: '83.3', endpoint: 'Response', population: header }] };
    const plans = planSections([{ code: '11.4', text, content: text }], new Map([['11.4', receipt]]));
    expect(plans[0].unclaimed).toEqual(accepted ? [] : ['83.3']);
  });

  it('retains an explicitly supplied percentage unit while rechecking the edited claim', () => {
    const claim = { value: '83.3', population: 'Response (%)' };
    expect(editedClaimOutcome('The response rate was 83.3%.', claim, ['83.3'])).toEqual({ state: 'stated' });
  });

  it.each(['95% CI', 'n (%)', 'Count (%)'])('does not treat %s as a percent-only column for an edited claim', population => {
    expect(editedClaimOutcome('The response rate was 83.3%.', { value: '83.3', population }, ['83.3']).state).not.toBe('stated');
  });
});

describe('CSR text is decoded according to its actual caller contract', () => {
  it('does not decode a raw double-encoded comparator twice during an edited-claim check', () => {
    expect(editedClaimOutcome('<p>p &amp;lt;0.001.</p>', { value: '<0.001' }, ['<0.001']).state).not.toBe('stated');
  });

  it.each(['ng/mL', 'µg/mL', 'pg/mL', 'copies/mL'])('preserves the exact %s source display without equating it to a count', unit => {
    expect(editedClaimOutcome(`Concentration: 5 ${unit}.`, { value: '5' }, ['5']).state).not.toBe('stated');
    expect(editedClaimOutcome(`Concentration: 5 ${unit}.`, { value: `5 ${unit}` }, [`5 ${unit}`])).toEqual({ state: 'stated' });
  });

  it.each([['<p>p &amp;lt;0.001.</p>', false], ['p &lt;0.001.', false], ['<p>p &constructor;0.001.</p>', false],
    ['<p>p &toString;0.001.</p>', false], ['<p>p &lt;0.001.</p>', true]] as const)(
    'rechecks already-rendered saved/draft text without another HTML interpretation: %s', (content, supported) => {
      const text = acceptedSectionText(renderSection(content));
      const hash = createHash('sha256').update(content).digest('hex');
      const receipt: CsrImportedSectionEvidence = { schema: CSR_CLAIM_RECEIPTS_SCHEMA,
        programId: '33333333-2222-4333-8444-000000000001', runId: '33333333-2222-4333-8444-000000000002',
        studyId: 'SYNTHETIC', sectionNumber: '11.4', evidenceDigest: 'a'.repeat(64), sourceSha256: 'b'.repeat(64),
        outputSha256: hash, sectionSha256: hash, studyInformationNumbers: [],
        claims: [{ table: 'primaryEfficacy', row: 0, column: 2, value: '<0.001', endpoint: 'Result', population: 'p-value' }] };
      const [plan] = planSections([{ code: '11.4', text, content }], new Map([['11.4', receipt]]));
      expect(plan.unclaimed.length === 0).toBe(supported);
      const outcome = editedClaimOutcome(text, receipt.claims[0], ['<0.001'], numericalText(text, 'text'));
      expect(outcome.state === 'stated').toBe(supported);
      expect(plan.content).toBe(content);
    });
});
