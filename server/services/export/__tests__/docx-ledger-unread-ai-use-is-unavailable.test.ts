/**
 * The AnALedger's AI-use sections say "unavailable" when their read failed —
 * never "none".
 *
 * Until 2026-10-15 loadProposals, loadRunSummary and loadAuthoringPlan in
 * docx-ledger-collector caught every error (a missing table without even a
 * log line) and returned [], a zero run summary, or null. The embedded ledger
 * then read <Proposals count="0">, <Runs total="0"><ModelsUsed/> and
 * <AuthoringPlan xsi:nil="true"/>, and the text summary "Proposals: 0" /
 * "Citation runs: 0": no AI proposal applied, no citation run, no model used,
 * no authoring plan — for reads that never happened. The audit log and the
 * signatures already carried an `…Unavailable` reason (WO-16B finding 10);
 * these three now do too, and the DOCX export refuses on them as it does there.
 *
 * Failure is injected at the dependency, as in
 * tests/gates/unverified-verdicts/docx-ledger.gate.test.ts: the process-wide
 * `pg` stub's query() rejects the chosen tables and answers everything else.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mockPool } from '../../../../tests/setup';

const pgError = (code: string) => (table: string) =>
  Object.assign(new Error(code === '42P01' ? `relation "${table}" does not exist` : `permission denied for table ${table}`), { code });
const denied = pgError('42501');

const artifactRow = {
  id: 11,
  artifact_id: 'art-1',
  organization_id: 7,
  project_id: 3,
  title: 'Module 2.5 Clinical Overview',
  ctd_section: '2.5',
  type: 'section',
  category: 'clinical',
  status: 'draft',
  version: 2,
  content_hash: 'h',
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-02T00:00:00.000Z',
  published_at: null,
  locked_at: null,
  citations: null,
  citation_run_id: null,
  citations_at: null,
  org_name: 'Probe Org',
  org_uuid: null,
  project_name: 'Probe Project',
};

function queryText(arg: unknown): string {
  return typeof arg === 'string' ? arg : String((arg as { text?: string })?.text ?? '');
}

const TABLES = ['ana_submission_chat_proposals', 'ana_artifact_citation_runs', 'authoring_plans'] as const;
type Table = (typeof TABLES)[number];

/** Every query answers (zero rows) except those against `failing`, which reject. */
function serve(failing: Partial<Record<Table, (table: string) => Error>>) {
  (mockPool as { query: unknown }).query = vi.fn((sql: unknown) => {
    const text = queryText(sql);
    for (const table of TABLES) {
      const fail = failing[table];
      if (fail && new RegExp(`FROM ${table}`, 'i').test(text)) return Promise.reject(fail(table));
    }
    if (/SELECT content\s+FROM concept2cure_artifacts/i.test(text)) return Promise.resolve({ rows: [{ content: 'body' }], rowCount: 1 });
    if (/FROM concept2cure_artifacts a/i.test(text)) return Promise.resolve({ rows: [artifactRow], rowCount: 1 });
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
}

const originalQuery = mockPool.query;
type Collector = typeof import('../docx-ledger-collector');
type Xml = typeof import('../docx-ledger-xml');
type Exporter = typeof import('../docx-ledger-export');
let collectArtifactLedger: Collector['collectArtifactLedger'];
let serializeAnALedgerXml: Xml['serializeAnALedgerXml'];
let exportArtifactWithLedger: Exporter['exportArtifactWithLedger'];
let renderProvenanceSummaryText: Exporter['renderProvenanceSummaryText'];

// Imported once, including the authoring-plan generator the collector loads
// lazily: the graph is seconds to transform cold.
beforeAll(async () => {
  ({ collectArtifactLedger } = await import('../docx-ledger-collector'));
  ({ serializeAnALedgerXml } = await import('../docx-ledger-xml'));
  ({ exportArtifactWithLedger, renderProvenanceSummaryText } = await import('../docx-ledger-export'));
  await import('../../ana/authoring-plan-generator');
}, 60_000);
afterAll(() => {
  (mockPool as { query: unknown }).query = originalQuery;
});

describe('AnALedger AI-use sections: a read that failed is unavailable, not empty', () => {
  it('a failed proposals read says unavailable with the reason, and claims no count', async () => {
    serve({ ana_submission_chat_proposals: denied });
    const ledger = (await collectArtifactLedger('art-1', 7))!;
    const xml = serializeAnALedgerXml(ledger);
    expect(xml).toMatch(/<Proposals unavailable="true" reason="[^"]*42501[^"]*"\/>/);
    expect(xml).not.toMatch(/<Proposals count=/);
    expect(ledger.proposalsUnavailable).toMatch(/42501/);
  });

  it('a failed citation-run read says unavailable, and names no total and no models', async () => {
    serve({ ana_artifact_citation_runs: denied });
    const ledger = (await collectArtifactLedger('art-1', 7))!;
    const xml = serializeAnALedgerXml(ledger);
    expect(xml).toMatch(/<Runs unavailable="true" reason="[^"]*42501[^"]*"\/>/);
    expect(xml).not.toMatch(/<Runs total=/);
    expect(xml).not.toMatch(/<ModelsUsed/);
    expect(ledger.runsUnavailable).toMatch(/42501/);
    expect(ledger.runs).toBeNull();
  });

  it('a failed authoring-plan read says unavailable — not "no plan exists"', async () => {
    serve({ authoring_plans: denied });
    const ledger = (await collectArtifactLedger('art-1', 7))!;
    const xml = serializeAnALedgerXml(ledger);
    expect(xml).toMatch(/<AuthoringPlan unavailable="true" reason="[^"]*42501[^"]*"\/>/);
    expect(xml).not.toMatch(/<AuthoringPlan xsi:nil="true"\/>/);
    expect(ledger.authoringPlan).toBeNull();
    expect(ledger.authoringPlanUnavailable).toMatch(/42501/);
  });

  it('a missing table is unavailable too — an absent store is not an empty history', async () => {
    serve({ ana_submission_chat_proposals: pgError('42P01'), ana_artifact_citation_runs: pgError('42P01') });
    const ledger = (await collectArtifactLedger('art-1', 7))!;
    expect(ledger.proposalsUnavailable).toMatch(/42P01/);
    expect(ledger.runsUnavailable).toMatch(/42P01/);
  });

  it('the text summary says UNAVAILABLE, never "Proposals: 0" or "Citation runs: 0"', async () => {
    serve({ ana_submission_chat_proposals: denied, ana_artifact_citation_runs: denied });
    const text = renderProvenanceSummaryText((await collectArtifactLedger('art-1', 7))!);
    expect(text).toMatch(/Proposals: UNAVAILABLE — .*42501/);
    expect(text).toMatch(/Citation runs: UNAVAILABLE — .*42501/);
    expect(text).not.toMatch(/Proposals: 0/);
    expect(text).not.toMatch(/Citation runs: 0/);
  });

  it.each([
    ['proposals', 'ana_submission_chat_proposals'],
    ['citation runs', 'ana_artifact_citation_runs'],
    ['authoring plan', 'authoring_plans'],
  ] as const)('the DOCX export refuses when the %s read failed', async (_label, table) => {
    serve({ [table]: denied });
    await expect(exportArtifactWithLedger('art-1', 7)).rejects.toMatchObject({
      name: 'VerificationUnavailableError',
    });
  });
});

describe('AnALedger AI-use sections: a read that ran and found nothing is an honest zero', () => {
  it('renders count="0", total="0" and a nil plan only when the reads succeeded', async () => {
    serve({});
    const ledger = (await collectArtifactLedger('art-1', 7))!;
    expect(ledger.proposalsUnavailable).toBeNull();
    expect(ledger.runsUnavailable).toBeNull();
    expect(ledger.authoringPlanUnavailable).toBeNull();
    const xml = serializeAnALedgerXml(ledger);
    expect(xml).toContain('<Proposals count="0">');
    expect(xml).toContain('<Runs total="0">');
    expect(xml).toContain('<AuthoringPlan xsi:nil="true"/>');
    const text = renderProvenanceSummaryText(ledger);
    expect(text).toContain('Proposals: 0');
    expect(text).toContain('Citation runs: 0');
  });
});
