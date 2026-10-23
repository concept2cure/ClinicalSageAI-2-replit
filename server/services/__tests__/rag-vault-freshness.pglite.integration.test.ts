/** Real canonical lexical/revalidation SQL on PGlite; no native RLS or provider claim. */
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AdvancedRAGPipeline, type RetrievedDocument, type RetrievalOptions } from '../advancedRAGPipeline.js';
import {
  createDispositionHarness, type DispositionFixture, type DispositionHarness,
} from '../document-data-disposition/__tests__/disposition-fixture.js';
import { chunkExtractedText } from '../vault/document-chunking.service.js';

type Snapshot = { extractedTextSha256: string | null; charStart: number | null; charEnd: number | null };
type Passage = RetrievedDocument & { vaultPassageSnapshot?: Snapshot };
type Internal = {
  vaultLexicalArm(client: DispositionFixture['db'], args: {
    query: string; limit: number; organizationUuid: string; keyless: boolean;
  }): Promise<Passage[]>;
  revalidateCandidates(documents: RetrievedDocument[], options: RetrievalOptions): Promise<Passage[]>;
  expandContext(documents: RetrievedDocument[], window: number, organizationUuid?: string): Promise<Passage[]>;
};
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const STUDY = 'The endpoint assessment recorded 42 responders with no device malfunction. 科学 🧬 [a-z]+ $1 (.*)';
let harness: DispositionHarness;
beforeAll(async () => {
  harness = await createDispositionHarness();
  await harness.pg.exec(`
    ALTER TABLE organizations ADD COLUMN uuid uuid NOT NULL DEFAULT gen_random_uuid();
    ALTER TABLE vault.documents ADD COLUMN file_name text;
    ALTER TABLE vault.document_chunks ADD COLUMN chunk_index integer;
    ALTER TABLE vault.document_chunks ADD COLUMN page_number integer;
    ALTER TABLE vault.document_chunks ADD COLUMN section_title text;
    ALTER TABLE vault.document_chunks ADD COLUMN char_start integer;
    ALTER TABLE vault.document_chunks ADD COLUMN char_end integer;
  `);
});
afterAll(async () => { await harness.close(); });

function pipeline(f: DispositionFixture): Internal {
  const instance = Object.create(AdvancedRAGPipeline.prototype) as Internal;
  Object.assign(instance, { pool: f.db });
  return instance;
}

async function fixture(config: { extracted?: string | null; basis?: string; offsets?: boolean } = {}) {
  const f = await harness.seed();
  const uuid = randomUUID();
  const stored = config.extracted === undefined ? STUDY : config.extracted;
  const chunk = chunkExtractedText(config.basis ?? STUDY)[0];
  const chunkId = randomUUID();
  await f.pg.query('UPDATE organizations SET uuid=$2 WHERE id=$1', [f.org, uuid]);
  // tenant-isolation-safe: isolated fixture document selected by exact organization and ID.
  await f.pg.query('UPDATE vault.documents SET extracted_text=$2 WHERE id=$1 AND organization_id=$3', [f.vault, stored, f.org]);
  // tenant-isolation-safe: the immediately seeded fixture organization owns this parent.
  await f.pg.query('DELETE FROM vault.document_chunks WHERE document_id=$1', [f.vault]);
  // tenant-isolation-safe: fixture parent was just seeded with explicit organization/program.
  await f.pg.query(`INSERT INTO vault.document_chunks
    (id,document_id,chunk_index,chunk_text,char_start,char_end) VALUES ($1,$2,0,$3,$4,$5)`,
  [chunkId, f.vault, chunk.text, config.offsets === false ? null : chunk.charStart, config.offsets === false ? null : chunk.charEnd]);
  const p = pipeline(f);
  const options: RetrievalOptions = { strategy: 'basic', organizationUuid: uuid };
  const initial = await p.vaultLexicalArm(f.db, { query: 'endpoint', limit: 5, organizationUuid: uuid, keyless: true });
  expect(initial).toHaveLength(1);
  return { f, p, uuid, options, initial, chunk, chunkId, stored };
}

async function extract(s: Awaited<ReturnType<typeof fixture>>, text: string | null) {
  // tenant-isolation-safe: exact fixture document, organization and unchanged original identity.
  await s.f.pg.query('UPDATE vault.documents SET extracted_text=$2 WHERE id=$1 AND organization_id=$3', [s.f.vault, text, s.f.org]);
  const row = (await s.f.pg.query<{ content_hash: string }>(
    // tenant-isolation-safe: verifies the fixture's original-byte hash, never another tenant's row.
    'SELECT content_hash FROM vault.documents WHERE id=$1 AND organization_id=$2', [s.f.vault, s.f.org])).rows[0];
  expect(row.content_hash).toBe('a'.repeat(64));
}

describe('real Vault SQL pins and rechecks extraction currency', () => {
  it('pins the extraction hash and UTF-16 coordinates in actual lexical mapper output', async () => {
    const s = await fixture();
    expect(s.initial[0].vaultPassageSnapshot).toEqual({
      extractedTextSha256: sha(STUDY), charStart: s.chunk.charStart, charEnd: s.chunk.charEnd,
    });
  });

  it('rejects same-original-file re-extraction after initial selection', async () => {
    const s = await fixture();
    await extract(s, STUDY.replace('42 responders', '24 responders'));
    expect(await s.p.revalidateCandidates(s.initial, s.options)).toEqual([]);
  });

  it('rejects a changed extraction even when the complete hit still occurs in it', async () => {
    const s = await fixture();
    await extract(s, `${STUDY}\nA corrected safety table follows.`);
    expect(await s.p.revalidateCandidates(s.initial, s.options)).toEqual([]);
  });

  it('rejects an already-stale stored chunk absent from the current extraction', async () => {
    const s = await fixture({ extracted: 'The endpoint assessment has been replaced with corrected facts.' });
    expect(await s.p.revalidateCandidates(s.initial, s.options)).toEqual([]);
  });

  it('rejects same-ID chunk text replacement without replacing candidate text silently', async () => {
    const s = await fixture();
    // tenant-isolation-safe: exact chunk and its fixture-owned parent.
    await s.f.pg.query('UPDATE vault.document_chunks SET chunk_text=$2 WHERE id=$1 AND document_id=$3',
      [s.chunkId, 'The endpoint changed independently.', s.f.vault]);
    expect(await s.p.revalidateCandidates(s.initial, s.options)).toEqual([]);
    expect(s.initial[0].content).toBe(STUDY);
  });

  it('rejects in-place coordinate replacement under unchanged text and extraction', async () => {
    const s = await fixture();
    // tenant-isolation-safe: exact chunk and fixture-owned parent; source text is unchanged.
    await s.f.pg.query('UPDATE vault.document_chunks SET char_start=1 WHERE id=$1 AND document_id=$2', [s.chunkId, s.f.vault]);
    expect(await s.p.revalidateCandidates(s.initial, s.options)).toEqual([]);
  });
});

describe('real Vault SQL preserves honest legacy hit-only behavior', () => {
  it('retains an unchanged literal Unicode/regex-like hit without normalization', async () => {
    const s = await fixture();
    const current = await s.p.revalidateCandidates(s.initial, s.options);
    expect(current).toHaveLength(1);
    expect(current[0].content).toBe(STUDY);
    expect(current[0].content).toContain('🧬 [a-z]+ $1 (.*)');
  });

  it('preserves NULL-offset hits with unavailable context rather than fabricating spans', async () => {
    const s = await fixture({ offsets: false });
    const expanded = await s.p.expandContext(s.initial, 1, s.uuid);
    const current = await s.p.revalidateCandidates(expanded, s.options);
    expect(current).toHaveLength(1);
    expect(current[0].passageContext).toEqual({ status: 'unavailable', reason: 'no_offsets' });
    expect(current[0].expandedContent).toBeUndefined();
    expect(current[0].content).toBe(STUDY);
  });

  it('preserves trimmed-backfill own text without inventing corrected coordinates', async () => {
    const s = await fixture({ extracted: `\n   ${STUDY}\n` });
    const expanded = await s.p.expandContext(s.initial, 1, s.uuid);
    const current = await s.p.revalidateCandidates(expanded, s.options);
    expect(current).toHaveLength(1);
    expect(current[0].passageContext).toEqual({ status: 'unavailable', reason: 'basis_mismatch' });
    expect(current[0].expandedContent).toBeUndefined();
    expect(current[0].hitSpan ?? null).toBeNull();
    expect(current[0].content).toBe(STUDY);
  });

  it('allows an unchanged NULL extraction only as legacy own text without context', async () => {
    const s = await fixture({ extracted: null, offsets: false });
    const current = await s.p.revalidateCandidates(s.initial, s.options);
    expect(current).toHaveLength(1);
    expect(current[0].content).toBe(STUDY);
    expect(current[0].expandedContent).toBeUndefined();
    expect(current[0].passageContext).toBeUndefined();
  });

  it('rejects extraction appearance after a NULL extraction was selected', async () => {
    const s = await fixture({ extracted: null, offsets: false });
    await extract(s, STUDY);
    expect(await s.p.revalidateCandidates(s.initial, s.options)).toEqual([]);
  });

  it('rejects extraction disappearance after source text was selected', async () => {
    const s = await fixture();
    await extract(s, null);
    expect(await s.p.revalidateCandidates(s.initial, s.options)).toEqual([]);
  });
});

describe('freshness extends existing access and disposition SQL', () => {
  it('refuses a valid current candidate under another organization UUID', async () => {
    const s = await fixture();
    const foreign = await fixture();
    expect(await s.p.revalidateCandidates(s.initial, foreign.options)).toEqual([]);
  });

  it('keeps retained extracted data clearly labelled, then refuses later withdrawal', async () => {
    const s = await fixture();
    await s.f.apply('keep_data');
    const retained = await s.p.revalidateCandidates(s.initial, s.options);
    expect(retained).toHaveLength(1);
    expect(retained[0].originalFileAvailable).toBe(false);
    expect(retained[0].title).toContain('original file unavailable');
    await s.f.apply('remove_data');
    expect(await s.p.revalidateCandidates(s.initial, s.options)).toEqual([]);
  });
});
