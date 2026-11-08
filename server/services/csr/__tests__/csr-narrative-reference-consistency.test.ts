/** Source-reference reads must describe one saved §14.3.3, not a mixture of
 * revisions. The SQL boundary is a deterministic double; no DB/PQ claim.
 * The actual reader, walker, block formatter, serializer and hashes execute.
 * SYNTHETIC observations only. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { it, vi } from 'vitest';
import type { NarrativePageCursor, SavedNarrative } from '../csr-narrative-job';
import type { NarrativeQueryable } from '../csr-narrative-store';

vi.mock('../csr-narrative-store.js', () => ({
  sqlNarrativeStore: (q: NarrativeQueryable & {
    testPage(job: { organizationId: number; jobId: number }, after: NarrativePageCursor | null, limit: number): Promise<SavedNarrative[]>;
  }, job: { organizationId: number; jobId: number }) => ({
    page: (after: NarrativePageCursor | null, limit: number) => q.testPage(job, after, limit),
  }),
}));
import { BLOCK_START, inlineLandedNarratives, readCsrNarrativeReference, sqlLandedNarratives, walkLandedNarratives } from '../csr-narrative-landed';
import { narrativeSectionBlock } from '../narrative-section';
import { stableStringify } from '../../../../shared/canonical-json';

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const JOB = { organizationId: 7, jobId: 41 };
const OPENING = 'Synthetic selection basis ALFA.';
function subject(sequence: number, text = 'Synthetic observation ALFA.'): SavedNarrative {
  return { subjectId: `SYN-${String(sequence + 1).padStart(4, '0')}`, sequence,
    status: 'composed', content: text, contentHash: sha(text), factsDigest: sha('synthetic-facts'),
    qc: { armName: 'Synthetic arm', categories: ['serious'], events: ['Synthetic event'], missingFields: [], prose: 'template' } };
}
const block = (r: SavedNarrative) => narrativeSectionBlock({ subjectId: r.subjectId, armName: r.qc.armName,
  categories: r.qc.categories, events: r.qc.events, text: r.content! });
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));

class DatabaseDouble implements NarrativeQueryable {
  subjects: SavedNarrative[];
  content: string | null;
  recorded: string;
  headerReads = 0;
  digestReads = 0;
  slices = 0;
  maxPage = 0;
  afterFirstHeader?: () => void;
  afterSlice?: () => void;
  afterSecondDigest?: () => void;
  constructor(count = 1) {
    this.subjects = Array.from({ length: count }, (_, i) => subject(i));
    this.content = OPENING + this.subjects.map(block).join('');
    this.recorded = sha(this.content);
  }
  async testPage(job: typeof JOB, after: NarrativePageCursor | null, limit: number) {
    assert.deepEqual(job, { ...JOB, projectId: null });
    assert.equal(limit, 50);
    const rows = this.subjects.filter(r => !after || r.sequence > after.sequence ||
      (r.sequence === after.sequence && r.subjectId > after.subjectId)).slice(0, limit);
    this.maxPage = Math.max(this.maxPage, rows.length);
    return copy(rows);
  }
  async query(sql: string, params: unknown[] = []): Promise<{ rows: Record<string, unknown>[] }> {
    assert.match(sql, /organization_id = \$1 AND job_id = \$2/);
    if (params[0] !== JOB.organizationId || params[1] !== JOB.jobId) return { rows: [] };
    if (sql.startsWith('SELECT content_hash, char_length(content)')) {
      this.headerReads++;
      const text = this.content;
      const pos = text?.indexOf(BLOCK_START) ?? -1;
      const rows = text === null ? [] : [{ content_hash: this.recorded, length: text.length,
        verified: sha(text) === this.recorded, astral: false,
        opening: text.slice(0, Math.min(pos < 0 ? text.length : pos, Number(params[3]))) }];
      if (this.headerReads === 1) this.afterFirstHeader?.();
      return { rows };
    }
    if (sql.startsWith('SELECT substr(content,')) {
      this.slices++;
      const pinned = /content_hash = \$5/.test(sql);
      const rows = this.content === null || (pinned && this.recorded !== params[4]) ? [] : [{
        text: this.content.slice(Number(params[2]) - 1, Number(params[2]) - 1 + Number(params[3])),
      }];
      this.afterSlice?.();
      return { rows };
    }
    if (sql.startsWith('SELECT subject_id, sequence, status, content_hash, facts_digest,')) {
      this.digestReads++;
      const rows = this.subjects.map(r => ({ subject_id: r.subjectId, sequence: r.sequence,
        status: r.status, content_hash: r.contentHash, facts_digest: r.factsDigest,
        text_sha256: r.content === null ? null : sha(r.content), qc_sha256: sha(stableStringify(r.qc)) }));
      if (this.digestReads === 2) this.afterSecondDigest?.();
      return { rows };
    }
    throw Error('Unexpected SQL boundary: ' + sql.slice(0, 90));
  }
}

it('verifies an unchanged section and keeps its exact source hash and opening', async () => {
  const q = new DatabaseDouble();
  const result = await readCsrNarrativeReference(q, JOB);
  assert.equal(result.state, 'verified');
  if (result.state !== 'verified') return;
  assert.equal(result.reference.narratives, 1);
  assert.equal(result.reference.landedSha256, q.recorded);
  assert.equal(result.reference.landedLength, q.content!.length);
  assert.equal(result.opening, OPENING);
});

it('verifies unchanged narratives over multiple pages without whole-section selection', async () => {
  const q = new DatabaseDouble(123);
  const result = await readCsrNarrativeReference(q, JOB);
  assert.equal(result.state, 'verified');
  if (result.state !== 'verified') return;
  assert.equal(result.reference.narratives, 123);
  assert.equal(q.maxPage, 50);
  assert.equal(q.slices, 3);
});

it('preserves the valid zero-subject selection with its exact opening hash', async () => {
  const q = new DatabaseDouble(0);
  const result = await readCsrNarrativeReference(q, JOB);
  assert.equal(result.state, 'verified');
  if (result.state !== 'verified') return;
  assert.equal(result.reference.narratives, 0);
  assert.equal(result.reference.openingSha256, sha(OPENING));
});

it('does not return a narrative reference for another tenant', async () => {
  const q = new DatabaseDouble();
  assert.deepEqual(await readCsrNarrativeReference(q, { ...JOB, organizationId: 8 }), { state: 'not-landed' });
  assert.equal(q.slices, 0);
});

it('continues refusing a section corrupted before its first read', async () => {
  const q = new DatabaseDouble(); q.content += ' Corruption';
  await assert.rejects(readCsrNarrativeReference(q, JOB), { code: 'CSR_NARRATIVES_HASH_MISMATCH' });
});

it('continues reporting an invalid individual narrative hash', async () => {
  const q = new DatabaseDouble(); q.subjects[0].contentHash = sha('different');
  const result = await readCsrNarrativeReference(q, JOB);
  assert.equal(result.state, 'mismatch');
});

it('continues refusing a changed narrative-store digest', async () => {
  const q = new DatabaseDouble();
  q.afterSlice = () => { q.subjects[0].factsDigest = sha('changed synthetic facts'); };
  const result = await readCsrNarrativeReference(q, JOB);
  assert.equal(result.state, 'mismatch');
});

it('never mixes old section metadata with newly replaced section and narrative bytes', async () => {
  const q = new DatabaseDouble();
  q.afterFirstHeader = () => {
    q.subjects[0] = subject(0, 'Synthetic observation BETA.');
    q.content = OPENING + q.subjects.map(block).join(''); q.recorded = sha(q.content);
  };
  const result = await readCsrNarrativeReference(q, JOB);
  assert.equal(result.state, 'mismatch', 'the old header cannot certify the new body');
});

it('pins slices to the source hash rather than silently reading a replacement revision', async () => {
  const q = new DatabaseDouble(); const source = (await sqlLandedNarratives(q, JOB))!;
  q.content = q.content!.replace('ALFA', 'BETA'); q.recorded = sha(q.content);
  assert.equal(await source.slice(0, 20), '');
});

it('refuses an opening edited after the final narrative window was read', async () => {
  const q = new DatabaseDouble();
  q.afterSlice = () => { q.content = q.content!.replace(OPENING, OPENING.replace('ALFA', 'BETA')); q.recorded = sha(q.content); };
  const result = await readCsrNarrativeReference(q, JOB);
  assert.equal(result.state, 'mismatch');
});

it('refuses section text appended after the final store-digest read', async () => {
  const q = new DatabaseDouble();
  q.afterSecondDigest = () => { q.content += ' New unverified appendix text.'; q.recorded = sha(q.content!); };
  const result = await readCsrNarrativeReference(q, JOB);
  assert.equal(result.state, 'mismatch');
});

it('refuses a landed section deleted during verification instead of certifying a ghost', async () => {
  const q = new DatabaseDouble();
  q.afterSecondDigest = () => { q.content = null; };
  const result = await readCsrNarrativeReference(q, JOB);
  assert.equal(result.state, 'mismatch');
});

it('rejects final content corruption even when its stored hash was not updated', async () => {
  const q = new DatabaseDouble();
  q.afterSecondDigest = () => { q.content += ' Unhashed alteration.'; };
  await assert.rejects(readCsrNarrativeReference(q, JOB), { code: 'CSR_NARRATIVES_HASH_MISMATCH' });
});

it('also rechecks the opening for a zero-subject report', async () => {
  const q = new DatabaseDouble(0);
  q.afterSecondDigest = () => { q.content = 'Different synthetic selection basis.'; q.recorded = sha(q.content); };
  const result = await readCsrNarrativeReference(q, JOB);
  assert.equal(result.state, 'mismatch');
});

it('rejects streamed text whose reconstructed SHA-256 differs from the pinned section digest', async () => {
  const q = new DatabaseDouble();
  const source = inlineLandedNarratives(q.content!);
  source.sha256 = sha('different previously admitted section');
  const walked = await walkLandedNarratives(source, { page: (after, n) => q.testPage({ ...JOB, projectId: null } as typeof JOB, after, n) });
  assert.ok(walked.findings.length > 0, 'matching current blocks alone is not proof of the original section hash');
});

it('rejects an opening-only stream with an incorrect pinned hash', async () => {
  const source = inlineLandedNarratives(OPENING); source.sha256 = sha('another opening');
  const walked = await walkLandedNarratives(source, { page: async () => [] });
  assert.ok(walked.findings.length > 0);
});

it('rejects unhashed body replacement even when the newly supplied subject text is internally valid', async () => {
  const q = new DatabaseDouble();
  q.afterFirstHeader = () => {
    q.subjects[0] = subject(0, 'Synthetic observation BETA.');
    q.content = OPENING + q.subjects.map(block).join(''); // deliberately retain OLD section hash
  };
  const result = await readCsrNarrativeReference(q, JOB);
  assert.equal(result.state, 'mismatch');
});
