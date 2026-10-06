import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  readEvaluationDocument, resolveExpectedSources,
  withEvaluationTenantScope,
  type GuidanceEntry, type GuidanceManifest,
} from '../qualification-corpus.js';
import type { GoldItem } from '../rag-metrics.js';
import { getTenantScope, runWithTenantScope } from '../../../db/tenantStore.js';

// These are synthetic integrity fixtures; they do not verify an official document.
const scope = { organizationId: 1, organizationUuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', programId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };
const hash = 'a'.repeat(64);
const entry: GuidanceEntry = {
  document_code: 'FIXTURE', version: 'revision-1', versionScheme: 'fixture',
  role: 'answer-source', verified: true, versionVerified: true,
  sourceUrl: 'https://example.test/fixture', date: '2026-10-06', sha256: hash,
  redistribution: { termsOf: 'fixture-publisher' },
};
const item: GoldItem = {
  id: 'fixture-item', question: 'What does the fixture say?', expectedSourceKeys: ['FIXTURE@revision-1'],
  expectedAnswerContains: ['recorded'], evidence: { document_code: 'FIXTURE', section: '1', quote: 'The fixture is recorded.' },
};
function manifest(): GuidanceManifest {
  return {
    version: 'fixture', entries: [{ ...entry }],
    publishers: { 'fixture-publisher': { termsVerified: true, terms: 'Fixture terms.', termsUrl: 'https://example.test/terms' } },
  };
}
function reader() {
  return vi.fn(async () => ({ documentId: 'document-1', contentHash: hash, embedded: true }));
}

describe('reviewed-key binding to an evaluation corpus', () => {
  it('resolves a reviewed exact key only when the ingested bytes match and are embedded', async () => {
    const read = reader();
    expect(await resolveExpectedSources(item, manifest(), scope, read)).toEqual({ negativeControl: false, sourceIds: ['document-1'], errors: [] });
    expect(read).toHaveBeenCalledWith(scope, entry);
  });

  it.each([
    ['unverified source', { verified: false }],
    ['unverified revision', { versionVerified: false }],
    ['unpinned revision', { versionScheme: 'UNPINNED' }],
    ['revision distractor', { role: 'revision-distractor' }],
    ['missing source hash', { sha256: null }],
  ])('refuses %s before database lookup', async (_name, mutation) => {
    const m = manifest(); m.entries[0] = { ...m.entries[0], ...mutation };
    const read = reader();
    const result = await resolveExpectedSources(item, m, scope, read);
    expect(result.sourceIds).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(read).not.toHaveBeenCalled();
  });

  it('refuses missing publisher verification before lookup', async () => {
    const m = manifest(); m.publishers['fixture-publisher'].termsVerified = false;
    const read = reader();
    expect((await resolveExpectedSources(item, m, scope, read)).errors.join(' ')).toMatch(/publisher reuse terms/);
    expect(read).not.toHaveBeenCalled();
  });

  it('does not quietly choose between duplicate manifest identities', async () => {
    const m = manifest(); m.entries.push({ ...entry });
    expect((await resolveExpectedSources(item, m, scope, reader())).errors.join(' ')).toMatch(/2 manifest entries/);
  });

  it('requires a reviewed evidence quote and closed official-text checks', async () => {
    const read = reader();
    expect((await resolveExpectedSources({ ...item, evidence: undefined }, manifest(), scope, read)).errors.join(' ')).toMatch(/evidence quote/);
    expect((await resolveExpectedSources({ ...item, openChecks: ['Check applicability'] }, manifest(), scope, read)).errors.join(' ')).toMatch(/unresolved/);
    expect(read).not.toHaveBeenCalled();
  });

  it('checks that expected answer substrings occur in the reviewed quote', async () => {
    expect((await resolveExpectedSources({ ...item, expectedAnswerContains: ['invented detail'] }, manifest(), scope, reader())).errors.join(' ')).toMatch(/not supported/);
  });

  it('does not silently reinterpret unkeyed positive items as controls', async () => {
    const result = await resolveExpectedSources({ ...item, expectedSourceKeys: [] }, manifest(), scope, reader());
    expect(result.negativeControl).toBe(false);
    expect(result.errors.join(' ')).toMatch(/positive item with no expected source/);
  });

  it('admits an explicitly declared negative control with no source keys', async () => {
    const read = reader();
    expect(await resolveExpectedSources({ id: 'control', question: 'Out of scope', tags: ['negative-control'], expectedSourceKeys: [] }, manifest(), scope, read)).toEqual({ negativeControl: true, sourceIds: [], errors: [] });
    expect(read).not.toHaveBeenCalled();
  });

  it('rejects changed bytes instead of scoring the wrong revision', async () => {
    const result = await resolveExpectedSources(item, manifest(), scope, async () => ({ documentId: 'document-1', contentHash: 'b'.repeat(64), embedded: true }));
    expect(result.sourceIds).toEqual([]);
    expect(result.errors.join(' ')).toMatch(/SHA-256/);
  });

  it('rejects an ingested document that the retrieval corpus cannot read as embedded chunks', async () => {
    const result = await resolveExpectedSources(item, manifest(), scope, async () => ({ documentId: 'document-1', contentHash: hash, embedded: false }));
    expect(result.sourceIds).toEqual([]);
    expect(result.errors.join(' ')).toMatch(/no embedded chunks/);
  });

  it('does not preserve a partial binding when another expected source is missing', async () => {
    const m = manifest(); m.entries.push({ ...entry, document_code: 'SECOND', sha256: 'b'.repeat(64) });
    const result = await resolveExpectedSources({ ...item, expectedSourceKeys: ['FIXTURE@revision-1', 'SECOND@revision-1'] }, m, scope, async (_s, e) => {
      if (e.document_code === 'SECOND') throw new Error('No accessible document');
      return { documentId: 'document-1', contentHash: hash, embedded: true };
    });
    expect(result.sourceIds).toEqual([]);
    expect(result.errors.join(' ')).toMatch(/lookup failed/);
  });

  it('refuses the repository gold positives without touching a database', async () => {
    const gold = JSON.parse(readFileSync(new URL('../gold-dataset.json', import.meta.url), 'utf8')) as { items: GoldItem[] };
    const m = JSON.parse(readFileSync(new URL('../guidance-corpus-manifest.json', import.meta.url), 'utf8')) as GuidanceManifest;
    const read = reader();
    const positives = gold.items.filter(i => !i.tags?.includes('negative-control'));
    const results = await Promise.all(positives.map(i => resolveExpectedSources(i, m, scope, read)));
    expect(positives).toHaveLength(18);
    expect(results.every(r => r.sourceIds.length === 0 && r.errors.length > 0)).toBe(true);
    expect(read).not.toHaveBeenCalled();
  });
  it('retains a failed source binding without copying database diagnostic content', async () => {
    const result = await resolveExpectedSources(item, manifest(), scope, async () => { throw new Error('postgresql://fixture-user:fixture-secret@example.test/database'); });
    expect(result.errors.join(' ')).toMatch(/lookup failed/);
    expect(JSON.stringify(result)).not.toContain('fixture-secret');
  });
});

describe('existing Vault identity SQL remains scoped on owner-role connections', () => {
  function pool(rows: unknown[]) {
    const query = vi.fn(async (sql: string, _params?: unknown[]) => ({ rows: sql.includes('FROM vault.documents') ? rows : [] }));
    const release = vi.fn();
    return { connect: vi.fn(async () => ({ query, release })), query, release };
  }
  it('binds organization, programme, code and version in a read-only transaction', async () => {
    const p = pool([{ document_id: 'document-1', content_hash: hash, embedded: true }]);
    expect(await readEvaluationDocument(p as never, scope, entry)).toEqual({ documentId: 'document-1', contentHash: hash, embedded: true });
    const sourceCall = p.query.mock.calls.find(c => c[0].includes('FROM vault.documents'))!;
    expect(sourceCall[0]).toMatch(/o.uuid = \$1::uuid AND d.program_id = \$2::uuid/);
    expect(sourceCall[0]).toMatch(/d.document_code = \$3 AND d.version = \$4/);
    expect(sourceCall[0]).toMatch(/p.organization_id = d.organization_id/);
    expect(sourceCall[1]).toEqual([scope.organizationUuid, scope.programId, 'FIXTURE', 'revision-1', scope.organizationId]);
    expect(p.query.mock.calls[0][0]).toBe('BEGIN READ ONLY');
    expect(p.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
    expect(p.release).toHaveBeenCalledOnce();
  });
  it('fails on inaccessible source and still releases its transaction', async () => {
    const p = pool([]);
    await expect(readEvaluationDocument(p as never, scope, entry)).rejects.toThrow(/0 accessible/);
    expect(p.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
    expect(p.release).toHaveBeenCalledOnce();
  });
  it('rejects malformed scope before opening a database connection', async () => {
    const p = pool([]);
    await expect(readEvaluationDocument(p as never, { ...scope, programId: 'not-a-uuid' }, entry)).rejects.toThrow(/program/i);
    expect(p.connect).not.toHaveBeenCalled();
  });
  it('sets both exact integer/UUID LOCAL GUCs and refuses ambient-scope override before checkout', async () => {
    const p = pool([{ document_id: 'document-1', content_hash: hash, embedded: true }]);
    await readEvaluationDocument(p as never, scope, entry);
    expect(p.query.mock.calls[1]).toEqual([
      "SELECT set_config('app.current_tenant_id', $1, true), set_config('app.current_org_id', $2, true)",
      ['1', scope.organizationUuid],
    ]);
    p.connect.mockClear();
    await runWithTenantScope({ tenantId: '2', orgUuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab', source: 'test' }, async () => {
      await expect(readEvaluationDocument(p as never, scope, entry)).rejects.toThrow(/active tenant/);
    });
    expect(p.connect).not.toHaveBeenCalled();
    withEvaluationTenantScope(scope, () => expect(getTenantScope()).toMatchObject({ tenantId: '1', orgUuid: scope.organizationUuid, role: null }));
  });
});
