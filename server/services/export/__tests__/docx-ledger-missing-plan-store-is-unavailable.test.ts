/**
 * A missing authoring_plans table reaches the AnALedger as "unavailable", not
 * as "no plan".
 *
 * Until 2026-10-15 getActiveAuthoringPlanForSection and
 * getLatestAuthoringPlanForArtifact (authoring-plan-generator) answered 42P01
 * with `return null` before the docx-ledger collector saw an error, so the
 * embedded ledger read <AuthoringPlan xsi:nil="true"/> — "this artifact was
 * authored against no plan" — for a store nobody could read, and the DOCX
 * export, which refuses an unread AI-use record, shipped. The two lookups now
 * let the error through; the collector records the reason and the export
 * refuses, as it already did for a plan read that failed any other way.
 *
 * Failure is injected at the process-wide `pg` stub, as in
 * docx-ledger-unread-ai-use-is-unavailable.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mockPool } from '../../../../tests/setup';

const missing = () =>
  Object.assign(new Error('relation "authoring_plans" does not exist'), { code: '42P01' });

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

function serveWithoutPlanStore() {
  (mockPool as { query: unknown }).query = vi.fn((sql: unknown) => {
    const text = typeof sql === 'string' ? sql : String((sql as { text?: string })?.text ?? '');
    if (/FROM authoring_plans/i.test(text)) return Promise.reject(missing());
    if (/SELECT content\s+FROM concept2cure_artifacts/i.test(text)) return Promise.resolve({ rows: [{ content: 'body' }], rowCount: 1 });
    if (/FROM concept2cure_artifacts a/i.test(text)) return Promise.resolve({ rows: [artifactRow], rowCount: 1 });
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
}

const originalQuery = mockPool.query;
type Generator = typeof import('../../ana/authoring-plan-generator');
let generator: Generator;
let collectArtifactLedger: typeof import('../docx-ledger-collector')['collectArtifactLedger'];
let serializeAnALedgerXml: typeof import('../docx-ledger-xml')['serializeAnALedgerXml'];
let exportArtifactWithLedger: typeof import('../docx-ledger-export')['exportArtifactWithLedger'];

beforeAll(async () => {
  generator = await import('../../ana/authoring-plan-generator');
  ({ collectArtifactLedger } = await import('../docx-ledger-collector'));
  ({ serializeAnALedgerXml } = await import('../docx-ledger-xml'));
  ({ exportArtifactWithLedger } = await import('../docx-ledger-export'));
}, 60_000);
afterAll(() => {
  (mockPool as { query: unknown }).query = originalQuery;
});

describe('authoring_plans missing: the plan lookups say so', () => {
  it('both lookups reject with the 42P01 instead of answering "no plan"', async () => {
    serveWithoutPlanStore();
    await expect(generator.getActiveAuthoringPlanForSection(3, 7, '2.5')).rejects.toMatchObject({ code: '42P01' });
    await expect(generator.getLatestAuthoringPlanForArtifact('art-1', 7)).rejects.toMatchObject({ code: '42P01' });
  });

  it('the ledger records the plan as unavailable with the reason, never as nil', async () => {
    serveWithoutPlanStore();
    const ledger = (await collectArtifactLedger('art-1', 7))!;
    expect(ledger.authoringPlan).toBeNull();
    expect(ledger.authoringPlanUnavailable, 'a missing plan store was recorded as "no plan"').toMatch(/42P01/);
    const xml = serializeAnALedgerXml(ledger);
    expect(xml).toMatch(/<AuthoringPlan unavailable="true" reason="[^"]*42P01[^"]*"\/>/);
    expect(xml).not.toContain('<AuthoringPlan xsi:nil="true"/>');
  });

  it('the DOCX export refuses rather than embed an unread plan record', async () => {
    serveWithoutPlanStore();
    await expect(exportArtifactWithLedger('art-1', 7)).rejects.toMatchObject({ name: 'VerificationUnavailableError' });
  });
});
