/**
 * The verdict step that measures CSR drafting, and the verdict that reads the use a run was made for (founder
 * decisions P-115 item 2 and P-118; the protocol's own `scope.enforcement` note says both were owed).
 *
 * No model is called. Each rule is seen to fire on the case it exists for, and the approved protocol file itself is
 * read to show that nothing can pass on it yet: its CSR drafting component is still declared not executable, and
 * changing that is a new version and a new founder approval, not this change.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeVerdict, type PqGenerationResult, type PqProtocol } from '../pq-verdict';
import type { PqCsrDraftingRecord, PqCsrDraftingResult } from '../pq-csr-drafting';

const CSR_USE = 'evidence-bound-csr-drafting';
const SOURCE_USE = 'source-based-drafting';
const CRITERIA = { minHeadingsAttemptedShare: 1, minAcceptedDraftShare: 0.85, maxUnclaimedFiguresInAcceptedText: 0, maxForbiddenHits: 0 };

function protocol(csrCriteria: Record<string, unknown> = CRITERIA): PqProtocol {
  return {
    protocolId: 'PQ-TEST', version: '1.0.0', status: 'approved', approvedBy: 'System owner', approvedOn: '2026-11-10',
    components: {
      generation: { required: true, executable: true, criteria: { minSectionCoverage: 0.85, maxForbiddenHits: 0, minTasksPerDocType: 2 }, criteriaSource: 'test' },
      rag: { required: true, executable: false, notExecutableReason: 'the retrieval bank is not complete', criteria: {}, criteriaSource: 'test' },
      csrDrafting: { required: true, executable: true, criteria: csrCriteria as Record<string, number>, criteriaSource: 'test' },
    },
    scope: { uses: {
      [CSR_USE]: { components: ['generation', 'csrDrafting'] },
      [SOURCE_USE]: { components: ['generation', 'rag'] },
    } },
  };
}
const generation: PqGenerationResult[] = ['a', 'b'].map((id) => ({ taskId: id, docType: 'ind', servedModel: 'claude-opus-5-5',
  servedModelVerified: true, sectionCoverage: 0.95, forbiddenHits: 0 }));

/** Twenty narrative headings, each drafted by the pinned model and accepted on its first draft, nothing unclaimed. */
const PLANNED = Array.from({ length: 20 }, (_, i) => `${9 + Math.floor(i / 5)}.${(i % 5) + 1}`);
const heading = (sectionNumber: string, over: Partial<PqCsrDraftingResult> = {}): PqCsrDraftingResult => ({
  sectionNumber, servedModel: 'claude-opus-5-5', servedModelVerified: true, firstDraft: 'accepted', unclaimedFigures: 0, forbiddenHits: 0, ...over });
function record(change: Record<string, Partial<PqCsrDraftingResult>> = {}, over: Partial<PqCsrDraftingRecord> = {}): PqCsrDraftingRecord {
  return { study: { studyId: 'CDISCPILOT01', sourceSha256: 'a'.repeat(64) }, plannedHeadings: PLANNED,
    headings: PLANNED.map((n) => heading(n, change[n])), ...over };
}
const verdict = (csrDrafting: PqCsrDraftingRecord | undefined, p = protocol(), use: string | undefined = CSR_USE) =>
  computeVerdict(p, generation, [], undefined, { use, csrDrafting });

describe('CSR drafting is measured: every heading drafted, the share accepted first time, no figure the tables do not hold', () => {
  it('passes a run in which every planned heading was drafted by the pinned model and accepted, with nothing unclaimed', () => {
    expect(verdict(record())).toEqual({ verdict: 'PASS', reasons: [`every component the use "${CSR_USE}" needs executed and met approved criteria`] });
  });

  it('passes at the floor: 17 of 20 first drafts accepted is 0.85', () => {
    const refused = Object.fromEntries(PLANNED.slice(0, 3).map((n) => [n, { firstDraft: 'refused' as const, unclaimedFigures: null, forbiddenHits: null }]));
    expect(verdict(record(refused)).verdict).toBe('PASS');
  });

  it('fails when more than about one first draft in seven is refused, and names the share and the headings', () => {
    const refused = Object.fromEntries(PLANNED.slice(0, 4).map((n) => [n, { firstDraft: 'refused' as const, unclaimedFigures: null, forbiddenHits: null }]));
    const result = verdict(record(refused));
    expect(result.verdict).toBe('FAIL');
    expect(result.reasons.join(' ')).toMatch(/accepted-draft share 0\.8 is below minAcceptedDraftShare 0\.85/);
    expect(result.reasons.join(' ')).toContain('§9.1, §9.2, §9.3, §9.4');
  });

  it('fails on one figure in accepted text that the second pass could not find in the retained tables', () => {
    const result = verdict(record({ '10.2': { unclaimedFigures: 1 } }));
    expect(result.verdict).toBe('FAIL');
    expect(result.reasons.join(' ')).toMatch(/1 figure in accepted text is not a claimed cell of the retained tables \(§10\.2\); maxUnclaimedFiguresInAcceptedText is 0/);
  });

  it('fails on a forbidden phrase in accepted text', () => {
    const result = verdict(record({ '11.3': { forbiddenHits: 2 } }));
    expect(result.verdict).toBe('FAIL');
    expect(result.reasons.join(' ')).toMatch(/2 forbidden hits in accepted text \(§11\.3\); maxForbiddenHits is 0/);
  });
});

describe('a CSR drafting run that did not finish, or cannot be read, is incomplete: never a pass, and not the model’s failure', () => {
  it('is incomplete when the component was not run at all', () => {
    const result = verdict(undefined);
    expect(result.verdict).toBe('INCOMPLETE');
    expect(result.reasons).toContain('required component "csrDrafting" is executable but was not run');
  });

  it('is incomplete, not failed, when a planned heading was never drafted: the provider failed, not the model', () => {
    const result = verdict(record({ '12.5': { firstDraft: null, servedModel: null, servedModelVerified: false, unclaimedFigures: null, forbiddenHits: null, error: 'provider overloaded' } }));
    expect(result.verdict).toBe('INCOMPLETE');
    expect(result.reasons.join(' ')).toMatch(/19 of 20 planned headings were verifiably drafted by the pinned model \(share 0\.95\), below minHeadingsAttemptedShare 1/);
    expect(result.reasons.join(' ')).toContain('§12.5: provider overloaded');
  });

  it('is incomplete when a heading was answered by a model that could not be verified as the pinned one', () => {
    const result = verdict(record({ '9.3': { servedModel: 'claude-sonnet-5-5', servedModelVerified: false } }));
    expect(result.verdict).toBe('INCOMPLETE');
    expect(result.reasons.join(' ')).toMatch(/§9\.3 was answered by "claude-sonnet-5-5", which could not be verified as the pinned model/);
  });

  it('does not hold against the pinned model what another model wrote: its unclaimed figures make the run incomplete, not failed', () => {
    const result = verdict(record({ '9.3': { servedModel: 'claude-sonnet-5-5', servedModelVerified: false, unclaimedFigures: 4, forbiddenHits: 2 } }));
    expect(result.verdict).toBe('INCOMPLETE');
    expect(result.reasons.join(' ')).not.toMatch(/figures in accepted text|forbidden hits/);
  });

  it('is incomplete when accepted text carries no second-pass figure count', () => {
    const result = verdict(record({ '9.1': { unclaimedFigures: null } }));
    expect(result.verdict).toBe('INCOMPLETE');
    expect(result.reasons.join(' ')).toMatch(/§9\.1 was accepted but carries no second-pass count/);
  });

  it('is incomplete when the record does not hold exactly one row for each planned heading', () => {
    const missing = record({}, { headings: PLANNED.slice(1).map((n) => heading(n)) });
    const doubled = record({}, { headings: [...PLANNED.map((n) => heading(n)), heading('9.1')] });
    const unplanned = record({}, { headings: [...PLANNED.slice(1).map((n) => heading(n)), heading('99.9')] });
    const empty = record({}, { plannedHeadings: [], headings: [] });
    for (const bad of [missing, doubled, unplanned, empty]) {
      const result = verdict(bad);
      expect(result.verdict).toBe('INCOMPLETE');
      expect(result.reasons.join(' ')).toMatch(/csrDrafting record/);
    }
  });

  it('is incomplete when a criterion is missing, misspelt, or not a number this verdict can apply', () => {
    const { minAcceptedDraftShare, ...withoutShare } = CRITERIA;
    expect(minAcceptedDraftShare).toBe(0.85);
    for (const [criteria, said] of [
      [withoutShare, /minAcceptedDraftShare is missing/],
      [{ ...CRITERIA, minAcceptedDraftShare: '0.85' }, /minAcceptedDraftShare is "0\.85", not a number between 0 and 1/],
      [{ ...CRITERIA, maxUnclaimedFigures: 0 }, /"maxUnclaimedFigures" is not one this verdict measures/],
      [{ ...CRITERIA, maxForbiddenHits: -1 }, /maxForbiddenHits is -1, not a whole number of zero or more/],
    ] as const) {
      const result = verdict(record(), protocol(criteria));
      expect(result.verdict).toBe('INCOMPLETE');
      expect(result.reasons.join(' ')).toMatch(said);
    }
  });

  it('a failure is reported even when the run is also incomplete: a miss is something real', () => {
    const result = verdict(record({ '9.1': { unclaimedFigures: 3 }, '12.5': { firstDraft: null, servedModel: null, servedModelVerified: false, unclaimedFigures: null, forbiddenHits: null, error: 'timeout' } }));
    expect(result.verdict).toBe('FAIL');
    expect(result.reasons.join(' ')).toMatch(/3 figures in accepted text/);
    expect(result.reasons.join(' ')).toMatch(/19 of 20 planned headings/);
  });
});

describe('the verdict reads the use: a run is judged on the components its use needs, and no others', () => {
  it('without a use, every required component applies, as before: the retrieval component that cannot run keeps it incomplete', () => {
    const result = computeVerdict(protocol(), generation, [], undefined, { csrDrafting: record() });
    expect(result.verdict).toBe('INCOMPLETE');
    expect(result.reasons.join(' ')).toMatch(/required component "rag" cannot be executed yet/);
  });

  it('for CSR drafting, the retrieval component is not needed, and its absence is not a reason', () => {
    expect(verdict(record()).verdict).toBe('PASS');
  });

  it('for source-based drafting, CSR drafting is not needed, and the retrieval component still is', () => {
    const result = computeVerdict(protocol(), generation, [], undefined, { use: SOURCE_USE });
    expect(result.verdict).toBe('INCOMPLETE');
    expect(result.reasons.join(' ')).toMatch(/required component "rag" cannot be executed yet/);
    expect(result.reasons.join(' ')).not.toMatch(/csrDrafting/);
  });

  it('a component a use does not need is not waived for the use that does', () => {
    const p = protocol();
    p.components.csrDrafting.executable = false;
    p.components.csrDrafting.notExecutableReason = 'the run is not written';
    const result = verdict(record(), p);
    expect(result.verdict).toBe('INCOMPLETE');
    expect(result.reasons).toContain('required component "csrDrafting" cannot be executed yet: the run is not written');
  });

  it('refuses a use the protocol does not declare, and one that names a component the protocol does not hold or leaves generation out', () => {
    expect(verdict(record(), protocol(), 'anything-else')).toEqual({ verdict: 'INCOMPLETE',
      reasons: ['the protocol declares no use "anything-else" whose components this verdict can apply'] });
    const unknownComponent = protocol();
    unknownComponent.scope!.uses![CSR_USE].components = ['generation', 'csrDrafting', 'translation'];
    expect(verdict(record(), unknownComponent).verdict).toBe('INCOMPLETE');
    const noGeneration = protocol();
    noGeneration.scope!.uses![CSR_USE].components = ['csrDrafting'];
    expect(verdict(record(), noGeneration).verdict).toBe('INCOMPLETE');
    const noScope = protocol();
    delete noScope.scope;
    expect(verdict(record(), noScope).verdict).toBe('INCOMPLETE');
  });
});

describe('the approved protocol itself: its uses are ones this verdict can apply, and nothing passes on it yet', () => {
  const approved = JSON.parse(readFileSync(path.join(__dirname, '..', 'pq-protocol.json'), 'utf8')) as PqProtocol;

  it('declares both uses over components it holds, each with generation', () => {
    const uses = approved.scope?.uses ?? {};
    expect(Object.keys(uses).sort()).toEqual([CSR_USE, SOURCE_USE]);
    for (const use of Object.values(uses)) {
      expect(use.components).toContain('generation');
      for (const name of use.components) expect(Object.keys(approved.components)).toContain(name);
    }
  });

  it('a perfect CSR drafting run is still incomplete on it: the component is declared not executable until a new version is approved', () => {
    const result = computeVerdict(approved, generation, [], undefined, { use: CSR_USE, csrDrafting: record() });
    expect(result.verdict).toBe('INCOMPLETE');
    expect(result.reasons.join(' ')).toMatch(/required component "csrDrafting" cannot be executed yet/);
  });
});
