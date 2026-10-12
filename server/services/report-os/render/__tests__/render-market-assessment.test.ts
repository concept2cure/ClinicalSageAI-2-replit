/**
 * A market assessment renders ITS OWN content, and never the readiness digest's
 * sentence about a readiness it did not compute.
 *
 * `readinessBlocks` reads `summary.regulatory`, a key only the readiness
 * orchestrator writes. A market assessment (`regional/filing-readiness.ts`)
 * writes `summary.market` and `summary.module1` instead, so without a market
 * branch in `renderReport` the executive summary of a report that DID compute a
 * market assessment read "Submission readiness not computed." That is the j8
 * family of defect in the renderer rather than the engine: a report saying the
 * opposite of what it performed.
 *
 * The second group is the honest-state rule the engine and the renderer have to
 * agree on: not-assessed is its own statement, never a zero and never a gap
 * list.
 */
import { describe, expect, it } from 'vitest';
import { renderReport, type RenderInput } from '../render';

const AT = '2026-10-11T00:00:00.000Z';

const marketRun = (over: {
  market?: Record<string, unknown>;
  module1?: Record<string, unknown>;
  blockers?: string[];
} = {}): RenderInput => ({
  reportTypeId: 'usa_fda.nda_bla_filing_readiness',
  reportTypeLabel: 'FDA NDA / BLA Filing Readiness Assessment (eCTD)',
  scopeType: 'project',
  scopeId: '11',
  providers: [
    { provider: 'module1_content', observedAt: AT, status: 'partial', blocker: '2 of 9 required US Module 1 heading(s) have no document recorded under them.' },
    { provider: 'market_support', observedAt: AT, status: 'ready' },
  ],
  confidence: null,
  blockers: over.blockers ?? [],
  summary: {
    scopeType: 'project',
    scopeId: '11',
    scopeLabel: 'C2C-004 NDA Program',
    market: {
      jurisdiction: 'US',
      agency: 'FDA',
      filing: 'New Drug Application',
      applicationKind: 'nda',
      module1Spec: 'FDA eCTD Module 1 controlled vocabulary v4',
      line: 'Structured Module 1; the FDA gateway is wired and unproven.',
      offer: { tier: 'build_and_sequence', label: 'Build and sequence', reason: 'Authored, built and frozen here as an eCTD sequence for FDA.', appliesTo: null },
      ...over.market,
    },
    module1: {
      assessed: true,
      requiredHeadings: 9,
      coveredHeadings: 7,
      missingHeadings: [{ code: '1.3.1', title: 'Product information' }, { code: '1.14.1', title: 'Draft labeling' }],
      undetermined: [],
      recordedCodeCount: 12,
      ...over.module1,
    },
  },
  status: 'partial',
  generatedAt: AT,
});

const text = (r: ReturnType<typeof renderReport>) => JSON.stringify(r.sections);

describe('a market assessment states its own market, not a readiness', () => {
  it('does not claim submission readiness was not computed — it computed something else', () => {
    const r = renderReport(marketRun());
    // The defect: the digest's sentence on a report that performed a market
    // assessment.
    expect(text(r)).not.toMatch(/Submission readiness not computed/);
    expect(r.sections[0].blocks).not.toContainEqual({
      kind: 'metric', label: 'Submission readiness', value: null, status: 'missing',
    });
  });

  it("prints the canonical market statement verbatim, and the specification its heading numbers follow", () => {
    const r = renderReport(marketRun());
    const summary = JSON.stringify(r.sections[0].blocks);
    expect(summary).toContain('Structured Module 1; the FDA gateway is wired and unproven.');
    expect(summary).toContain('Authored, built and frozen here as an eCTD sequence for FDA.');
    expect(summary).toContain('FDA eCTD Module 1 controlled vocabulary v4');
    expect(summary).toContain('New Drug Application');
  });

  it('names each required heading with no document, with the heading’s own title', () => {
    const r = renderReport(marketRun());
    const section = r.sections.find((s) => s.id === 'market-module1');
    expect(section).toBeDefined();
    const table = section!.blocks.find((b) => b.kind === 'table');
    expect(table).toBeDefined();
    expect(JSON.stringify(table)).toContain('1.3.1');
    expect(JSON.stringify(table)).toContain('Draft labeling');
    expect(section!.blocks).toContainEqual({
      kind: 'metric', label: 'Required Module 1 headings covered', value: 7, unit: 'of 9',
    });
  });

  it('states a conditional heading as "required if", never as satisfied or not required', () => {
    const r = renderReport(
      marketRun({ module1: { undetermined: [{ code: '1.3.4', title: 'Paediatric information', condition: 'paediatric_obligation' }] } }),
    );
    const section = r.sections.find((s) => s.id === 'market-module1')!;
    const tables = section.blocks.filter((b) => b.kind === 'table');
    const conditional = tables.find((b) => JSON.stringify(b).includes('Required if'));
    expect(conditional).toBeDefined();
    expect(JSON.stringify(conditional)).toContain('paediatric obligation');
  });
});

describe('the Gaps section agrees with the assessment in the same document', () => {
  /* A market assessment writes no `summary.regulatory`, so `gapsSectionFor`
     fell to its last branch and printed "Gaps were not evaluated for this
     scope" in the same document as the section listing the gaps it had just
     evaluated. One report, two contradictory statements. */
  it('lists the Module 1 gaps rather than saying none were evaluated', async () => {
    const r = renderReport(marketRun());
    const gaps = r.sections.find((s) => s.id === 'gaps')!;
    expect(JSON.stringify(gaps)).not.toMatch(/were not evaluated/);
    expect(JSON.stringify(gaps)).toContain('1.3.1');
    expect(JSON.stringify(gaps)).toContain('Draft labeling');
  });

  it('says "no gaps" when every required heading has a document', () => {
    const r = renderReport(marketRun({ module1: { coveredHeadings: 9, missingHeadings: [] } }));
    const gaps = r.sections.find((s) => s.id === 'gaps')!;
    expect(JSON.stringify(gaps)).toMatch(/No gaps detected/);
    expect(JSON.stringify(gaps)).not.toMatch(/were not evaluated/);
  });

  /* The two rules meeting: the "no document may say 'No gaps detected' beside
     its own blockers" rule (be20b53d9) and the market assessment's blockers,
     which include every declared dependency it does not answer. A real market
     run therefore always carries blockers, so a clean Module 1 must NOT read as
     a clear result. Neither session's tests covered the interaction. */
  it('withholds the clear result when the document also lists blockers', () => {
    const r = renderReport(
      marketRun({
        module1: { coveredHeadings: 9, missingHeadings: [] },
        blockers: ['question risk: not computed by this assessment, which reads this market\u2019s Module 1 content and the market statement only.'],
      }),
    );
    const gaps = r.sections.find((s) => s.id === 'gaps')!;
    expect(JSON.stringify(gaps)).not.toMatch(/No gaps detected/);
    expect(JSON.stringify(gaps)).toMatch(/this is not a clear result/);
  });

  it('says WHY nothing could be evaluated, not the generic scope sentence', () => {
    const r = renderReport(
      marketRun({
        module1: { assessed: false, requiredHeadings: 9, coveredHeadings: null, missingHeadings: null, undetermined: [], recordedCodeCount: 0 },
      }),
    );
    const gaps = r.sections.find((s) => s.id === 'gaps')!;
    expect(JSON.stringify(gaps)).toMatch(/records a CTD section code/);
    expect(JSON.stringify(gaps)).not.toMatch(/not evaluated for this scope/);
    expect(JSON.stringify(gaps)).not.toMatch(/No gaps detected/);
  });
});

describe('not assessed is its own statement', () => {
  it('reports no coverage figure at all when nothing recorded a CTD code', () => {
    const r = renderReport(
      marketRun({
        module1: { assessed: false, requiredHeadings: 9, coveredHeadings: null, missingHeadings: null, undetermined: [], recordedCodeCount: 0 },
      }),
    );
    const section = r.sections.find((s) => s.id === 'market-module1')!;
    // Not a zero: a zero would read as "nine required headings, none covered".
    expect(section.blocks).toContainEqual({
      kind: 'metric', label: 'Required Module 1 headings covered', value: null, status: 'missing',
    });
    expect(section.blocks).not.toContainEqual({
      kind: 'metric', label: 'Required Module 1 headings covered', value: 0, unit: 'of 9',
    });
    expect(JSON.stringify(section.blocks)).toMatch(/was not assessed/);
    // And no gap table, because no heading was found to be absent.
    expect(section.blocks.some((b) => b.kind === 'table')).toBe(false);
  });

  it("says so when the market's offer refuses the filing, in the market's own words", () => {
    const refusal = 'Health Canada has no governed NDS outline here, so a project would have nothing to author and no channel to send it.';
    const r = renderReport(
      marketRun({ market: { offer: { tier: 'not_offered', label: 'Not offered', reason: refusal, appliesTo: null } } }),
    );
    expect(JSON.stringify(r.sections[0].blocks)).toContain(refusal);
  });
});
