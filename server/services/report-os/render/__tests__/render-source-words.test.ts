/**
 * A report names its sources and their status in words (sales rehearsal E17 and E18; the CSR lane's map of
 * 2026-11-12; seen in the running app in C2C-101's Executive Readiness Digest,
 * docs/evidence/F1/2026-11-12-reporting-source-words/).
 *
 * Every report that is not a Quality report printed the engine's ids and stored values to the reader:
 * "artifact_state · ready", "regional_package_manifest · partial", under the heading "Provider readiness", and a
 * market assessment read "Assessed as a Investigational New Drug Application". The Quality reports already named
 * their one source in words; the rule is now the same for every report.
 *
 * A sealed report keeps the words it was sealed with: it is served from its stored document (sealing/run-seal.ts).
 */
import { describe, expect, it } from 'vitest';
import { renderReport, type RenderInput } from '../render';
import { sourceLabel, sourceStatusWords } from '../source-words';

const AT = '2026-11-12T00:00:00.000Z';
const input = (over: Partial<RenderInput> = {}): RenderInput => ({
  reportTypeId: 'readiness.executive_digest', reportTypeLabel: 'Executive Readiness Digest', scopeType: 'project', scopeId: '1',
  providers: [
    { provider: 'artifact_state', observedAt: AT, status: 'ready' },
    { provider: 'artifact_approval', observedAt: AT, status: 'missing', blocker: 'No filing section is approved or locked (0 of 72).' },
    { provider: 'submission_readiness', observedAt: AT, status: 'missing', blocker: '23 regulatory gaps detected (Investigational New Drug Application)' },
    { provider: 'regional_package_manifest', observedAt: AT, status: 'partial', blocker: 'Required package sections/artifacts are incomplete' },
  ],
  blockers: [], summary: { scopeType: 'project', scopeId: '1', scopeLabel: 'C2C-101' }, status: 'partial', generatedAt: AT, ...over,
});
const sourceTable = (report: ReturnType<typeof renderReport>) => {
  const section = report.sections.find((s) => s.id === 'provider-readiness');
  const table = section?.blocks.find((b) => b.kind === 'table');
  if (!section || table?.kind !== 'table') throw new Error('the source table is missing');
  return { title: section.title, columns: table.columns, rows: table.rows };
};

describe('the report’s table of sources', () => {
  it('names each source and its status in words, under a heading a reader can read', () => {
    expect(sourceTable(renderReport(input()))).toEqual({
      title: 'Source readiness',
      columns: ['Source', 'Status', 'Note'],
      rows: [
        ['What the project holds', 'Ready', '—'],
        ['Approved or locked', 'Missing', 'No filing section is approved or locked (0 of 72).'],
        ['Submission readiness', 'Missing', '23 regulatory gaps detected (Investigational New Drug Application)'],
        ['Regional package', 'Partial', 'Required package sections/artifacts are incomplete'],
      ],
    });
  });

  it('prints no engine id and no stored status value in the table', () => {
    const { rows } = sourceTable(renderReport(input()));
    for (const [source, status] of rows) {
      expect(String(source)).not.toMatch(/_/);
      expect(String(status)).not.toMatch(/^(ready|partial|missing)$/);
    }
  });

  it('names a register’s source, and reads an id it does not know as words, never as stored', () => {
    const report = renderReport(input({ providers: [
      { provider: 'fcoi_disclosures', observedAt: AT, status: 'ready' },
      { provider: 'ha_commitments', observedAt: AT, status: 'ready' },
      { provider: 'a_new_engine', observedAt: AT, status: 'partial' },
    ] }));
    expect(sourceTable(report).rows.map((r) => r[0])).toEqual(['Financial disclosures', 'Health authority commitments', 'A new engine']);
  });

  it('keeps the Quality reports’ own name for their source', () => {
    expect(sourceLabel('quality_project_evidence')).toBe('Quality evidence');
  });

  it('reads a status it does not know as recorded, in words', () => {
    expect(sourceStatusWords('ready')).toBe('Ready');
    expect(sourceStatusWords('not_computed')).toBe('Not computed');
  });
});

describe('a market assessment’s first sentence', () => {
  const market = (filing: string, agency: string) =>
    renderReport(input({ providers: [], summary: { scopeType: 'project', scopeId: '1', market: { filing, agency } } })).sections[0].blocks.map((b) => ('text' in b ? b.text : ''));

  it.each([
    ['Investigational New Drug Application', 'FDA', 'Assessed as an Investigational New Drug Application with FDA.'],
    ['MAA', 'EMA', 'Assessed as an MAA with EMA.'],
    ['Biologics License Application', 'FDA', 'Assessed as a Biologics License Application with FDA.'],
    ['510(k)', 'FDA', 'Assessed as a 510(k) with FDA.'],
  ])('%s reads with the right article', (filing, agency, sentence) => {
    expect(market(filing, agency)).toContain(sentence);
  });
});
