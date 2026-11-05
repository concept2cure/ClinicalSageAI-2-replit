/** Narrow executable regression: actual narrative worker/store, SQL-boundary
 * double. This proves write admission/rollback behavior, NOT PostgreSQL locks
 * or production tenant RLS. All records are synthetic. */
import * as assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { it, vi } from 'vitest';

const h = vi.hoisted(() => ({ compose: null as null | ((input: { store: { save(row: unknown): Promise<boolean> } }) => Promise<unknown>) }));
vi.mock('../../../utils/logger.js', () => ({ createScopedLogger: () => ({ error() {} }) }));
vi.mock('../source-access.js', () => ({ CsrSourceInputError: class extends Error {} }));
vi.mock('../csr-narrative-job.js', () => ({ NARRATIVE_COMPOSER: 'csr-narrative-job',
  runNarrativeJob: async (input: Parameters<NonNullable<typeof h.compose>>[0]) => {
    if (!h.compose) throw new Error('This test must not invoke a clinical composer');
    return h.compose(input);
  } }));

vi.mock('../saved-clinical-tables.js', () => ({ readSavedClinicalTables: async () => ({
  studies: [{ source: { studyId: 'SYN-1', protocolNumber: 'SYN-PROTOCOL', documentId: 'synthetic-manifest', sha256: 'e'.repeat(64) } }],
}) }));
vi.mock('../vault-source-input.js', () => ({ readCsrAdamDatasets: async () => ({
  bundle: { studyInfo: { protocolNumber: 'SYN-PROTOCOL' } }, datasets: {},
}) }));

import { sqlNarrativeStore, buildCsrNarratives, type NarrativeQueryable } from '../csr-narrative-store';
import { runNarrativeRun, type CsrNarrativeWorkerDeps } from '../csr-narrative-run';
import type { NarrativeJobResult, SavedNarrative, NarrativeSectionRow } from '../csr-narrative-job';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const scope = { organizationId: 7, jobId: 41, projectId: 11,
  narrativeAttempt: { runId: 91, attempt: 1 } };
const row = (text = 'Synthetic subject narrative'): SavedNarrative => ({ subjectId: 'SYN-1', sequence: 0,
  status: 'composed', content: text, contentHash: sha(text), factsDigest: 'f'.repeat(64),
  qc: { armName: 'Synthetic arm', categories: ['death'], events: [], missingFields: [], prose: 'template' } });
const result = (status: NarrativeJobResult['status']): NarrativeJobResult => ({ status, selected: 1,
  composed: status === 'complete' ? 1 : 0, refused: 0, resumed: 0,
  counts: { death: 1, serious: 0, discontinuation: 0, aesi: 0 }, sections: { written: [], kept: [] } });
function sectionInput(chunks: string[] = ['Synthetic opening\n', 'Synthetic narrative\n'], fail = false) {
  const crossReference: NarrativeSectionRow = { sectionNumber: '12.3.2', content: 'See retained narratives.',
    contentHash: sha('See retained narratives.'), lineage: { composer: 'csr-narrative-job' } };
  return { narratives: { sectionNumber: '14.3.3' as const, lineage: { composer: 'csr-narrative-job' },
    chunks: (async function* () { for (const chunk of chunks) yield chunk; if (fail) throw new Error('Synthetic stream interrupted'); })() },
    crossReference };
}

/** Interprets only the SQL used by the actual worker/store. Unexpected SQL
 * fails the test. SELECT locks are recorded until commit/rollback so tests
 * assert admission and writes share one transaction. This is not a database. */
class DatabaseDouble implements NarrativeQueryable {
  parent = { id: 41, organization_id: 7, status: 'complete' };
  run = { id: 91, job_id: 41, organization_id: 7, status: 'running', attempt: 1,
    requested_by: 5, result: null as unknown, subjects_done: 0 };
  saved = new Map<string, Record<string, unknown>>();
  sections = new Map<string, { content: string; contentHash: string; composer: string }>();
  statements: Array<{ sql: string; params: unknown[] }> = [];
  transaction = false;
  parentLocked = false;
  attemptLocked = false;
  writes: Array<{ transaction: boolean; parent: boolean; attempt: boolean }> = [];
  failSave = false;
  failCommit = false;
  beforeOwnershipRead?: () => void;
  private snapshot?: { saved: DatabaseDouble['saved']; sections: DatabaseDouble['sections'] };
  async query(text: string, p: unknown[] = []): Promise<{ rows: Record<string, unknown>[] }> {
    const sql = text.replace(/\s+/g, ' ').trim();
    this.statements.push({ sql, params: [...p] });
    const found = (yes: boolean, r: Record<string, unknown> = { id: 1 }) => ({ rows: yes ? [structuredClone(r)] : [] });
    const release = () => { this.transaction = false; this.parentLocked = false; this.attemptLocked = false; };
    if (sql === 'BEGIN') {
      assert.equal(this.transaction, false, 'A narrative save must not nest transactions');
      this.transaction = true;
      this.snapshot = { saved: structuredClone(this.saved), sections: structuredClone(this.sections) };
      return found(false);
    }
    if (sql === 'COMMIT') {
      assert.equal(this.transaction, true);
      if (this.failCommit) throw new Error('Synthetic commit failure before commit');
      this.snapshot = undefined; release(); return found(false);
    }
    if (sql === 'ROLLBACK') {
      if (this.snapshot) { this.saved = this.snapshot.saved; this.sections = this.snapshot.sections; }
      this.snapshot = undefined; release(); return found(false);
    }
    if (sql.startsWith('SELECT id, project_id, study_id, status, study_info_snapshot FROM csr_build_jobs')) {
      return found(p[0] === this.parent.id && p[1] === this.parent.organization_id, {
        ...this.parent, project_id: 11, study_id: 'SYN-PROTOCOL',
        study_info_snapshot: { evidenceSource: { programId: 'SYN-PROGRAM', runId: 'SYN-RUN', studyId: 'SYN-1' } },
      });
    }
    if (sql.startsWith('SELECT id, status FROM csr_build_jobs')) {
      assert.equal(this.transaction, true); assert.match(sql, /FOR UPDATE$/);
      const matches = p[0] === this.parent.id && p[1] === this.parent.organization_id;
      if (matches) this.parentLocked = true;
      return found(matches, this.parent);
    }
    if (sql.startsWith('SELECT id FROM csr_narrative_runs')) {
      this.beforeOwnershipRead?.(); this.beforeOwnershipRead = undefined;
      assert.equal(this.transaction, true); assert.equal(this.parentLocked, true);
      assert.match(sql, /FOR UPDATE$/);
      const matches = p[0] === this.run.id && p[1] === this.run.organization_id &&
        p[2] === this.run.job_id && p[3] === this.run.attempt && this.run.status === 'running';
      if (matches) this.attemptLocked = true;
      return found(matches, this.run);
    }
    if (sql.startsWith('INSERT INTO csr_narrative_outputs')) {
      if (this.failSave) throw new Error('Synthetic insert failure');
      if (p[0] !== this.parent.organization_id || p[1] !== this.parent.id || this.parent.status === 'cancelled') return found(false);
      this.writes.push({ transaction: this.transaction, parent: this.parentLocked, attempt: this.attemptLocked });
      this.saved.set(String(p[2]), { content: p[5], contentHash: p[6], qc: p[8] });
      return found(true);
    }
    if (sql.startsWith('INSERT INTO csr_section_outputs')) {
      const section = String(p[3]);
      const previous = this.sections.get(section);
      if (previous && section !== '14.3.3' && previous.composer !== p[9]) return found(false);
      this.writes.push({ transaction: this.transaction, parent: this.parentLocked, attempt: this.attemptLocked });
      this.sections.set(section, { content: String(p[4]), contentHash: String(p[5]), composer: 'csr-narrative-job' });
      return found(true, { section_number: section });
    }
    if (sql.startsWith('UPDATE csr_section_outputs SET content = content ||')) {
      const current = this.sections.get('14.3.3'); assert.ok(current);
      current.content += String(p[2]); return found(false);
    }
    if (sql.startsWith('UPDATE csr_section_outputs SET content_hash')) {
      const current = this.sections.get('14.3.3');
      if (!current || sha(current.content) !== p[2]) return found(false);
      current.contentHash = String(p[2]); return found(true, { section_number: '14.3.3' });
    }
    if (sql.startsWith("UPDATE csr_narrative_runs SET status = 'running'")) {
      if (p[0] !== this.run.id || p[1] !== this.run.organization_id || this.run.status !== 'queued') return found(false);
      this.run.status = 'running'; this.run.attempt++;
      return found(true, this.run);
    }
    if (sql.startsWith('UPDATE csr_narrative_runs SET subjects_done')) {
      const matches = p[0] === this.run.id && p[1] === this.run.attempt && this.run.status === 'running' &&
        this.parent.status !== 'cancelled' && (p.length < 6 || (p[4] === this.run.organization_id && p[5] === this.run.job_id));
      if (matches) this.run.subjects_done = Number(p[2]);
      return found(matches);
    }
    if (sql.startsWith('UPDATE csr_narrative_runs SET status = $3')) {
      const matches = p[0] === this.run.id && p[1] === this.run.attempt && this.run.status === 'running' &&
        (p.length < 9 || (p[7] === this.run.organization_id && p[8] === this.run.job_id));
      if (matches) { this.run.status = String(p[2]); this.run.result = p[3]; }
      return found(matches);
    }
    throw new Error('Unexpected query: ' + sql);
  }
}

it('saves an owned narrative and its exact hash while holding both row locks until commit', async () => {
  const db = new DatabaseDouble();
  assert.equal(await sqlNarrativeStore(db, scope).save(row()), true);
  assert.equal(db.saved.get('SYN-1')?.contentHash, row().contentHash);
  assert.deepEqual(db.writes, [{ transaction: true, parent: true, attempt: true }]);
  assert.equal(db.transaction, false);
});

it('does not overwrite a replacement attempt narrative with a late old model response', async () => {
  const db = new DatabaseDouble();
  db.run.attempt = 2;
  db.saved.set('SYN-1', { content: 'Replacement text', contentHash: sha('Replacement text') });
  assert.equal(await sqlNarrativeStore(db, scope).save(row('Late old text')), false);
  assert.equal(db.saved.get('SYN-1')?.content, 'Replacement text');
  assert.equal(db.writes.length, 0);
});

it('rejects an older run even when it has the same numeric attempt as a new run', async () => {
  const db = new DatabaseDouble(); db.run.id = 92;
  assert.equal(await sqlNarrativeStore(db, scope).save(row()), false);
  assert.equal(db.saved.size, 0);
});

it('refuses a requeued run before the replacement has claimed it', async () => {
  const db = new DatabaseDouble(); db.run.status = 'queued';
  assert.equal(await sqlNarrativeStore(db, scope).save(row()), false);
  assert.equal(db.saved.size, 0);
});

it('checks recovery at the locked write boundary, not only an earlier progress heartbeat', async () => {
  const db = new DatabaseDouble();
  db.beforeOwnershipRead = () => { db.run.attempt = 2; };
  assert.equal(await sqlNarrativeStore(db, scope).save(row()), false);
  assert.equal(db.writes.length, 0);
});

it('rejects an invalid supplied attempt identity rather than treating it as legacy direct-store work', async () => {
  const db = new DatabaseDouble();
  assert.equal(await sqlNarrativeStore(db, { ...scope, narrativeAttempt: { runId: 91, attempt: 0 } }).save(row()), false);
  assert.equal(db.writes.length, 0);
});

it('blocks final section landing when the attempt is superseded after its last progress update', async () => {
  const db = new DatabaseDouble(); db.run.attempt = 2;
  db.sections.set('14.3.3', { content: 'New run output', contentHash: sha('New run output'), composer: 'csr-narrative-job' });
  await assert.rejects(sqlNarrativeStore(db, scope).writeSections(sectionInput()),
    { code: 'CSR_NARRATIVE_BUILD_NOT_RUNNABLE' });
  assert.equal(db.sections.get('14.3.3')?.content, 'New run output');
  assert.equal(db.writes.length, 0);
});

it('cancellation after progress prevents final narratives and cross-reference from landing', async () => {
  const db = new DatabaseDouble(); db.parent.status = 'cancelled';
  await assert.rejects(sqlNarrativeStore(db, scope).writeSections(sectionInput()),
    { code: 'CSR_NARRATIVE_BUILD_NOT_RUNNABLE' });
  assert.equal(db.sections.size, 0);
});

it('streams and hashes the owned narrative section, preserving a separately authored cross-reference', async () => {
  const db = new DatabaseDouble();
  db.sections.set('12.3.2', { content: 'Human-authored analysis', contentHash: sha('Human-authored analysis'), composer: 'manual' });
  const landed = await sqlNarrativeStore(db, scope).writeSections(sectionInput());
  assert.deepEqual(landed, { written: ['14.3.3'], kept: ['12.3.2'] });
  assert.equal(db.sections.get('14.3.3')?.contentHash, sha('Synthetic opening\nSynthetic narrative\n'));
  assert.equal(db.sections.get('12.3.2')?.content, 'Human-authored analysis');
  assert.ok(db.writes.every(w => w.transaction && w.parent && w.attempt));
});

it('rolls back partial streamed text and leaves both previous sections intact on stream failure', async () => {
  const db = new DatabaseDouble();
  db.sections.set('14.3.3', { content: 'Saved', contentHash: sha('Saved'), composer: 'csr-narrative-job' });
  const before = structuredClone(db.sections);
  await assert.rejects(sqlNarrativeStore(db, scope).writeSections(sectionInput(['Partial'], true)), /stream interrupted/);
  assert.deepEqual(db.sections, before);
  assert.equal(db.transaction, false);
});

it('rolls a narrative save back on commit failure without replacing earlier text', async () => {
  const db = new DatabaseDouble(); db.failCommit = true;
  db.saved.set('SYN-1', { content: 'Before' });
  await assert.rejects(sqlNarrativeStore(db, scope).save(row()), /commit failure/);
  assert.equal(db.saved.get('SYN-1')?.content, 'Before');
  assert.equal(db.transaction, false);
});

it('keeps non-queued direct-store compatibility but locks the parent and honors cancellation', async () => {
  const db = new DatabaseDouble();
  const direct = { organizationId: 7, jobId: 41, projectId: 11 };
  assert.equal(await sqlNarrativeStore(db, direct).save(row()), true);
  assert.ok(db.writes[0].transaction && db.writes[0].parent);
  db.parent.status = 'cancelled';
  assert.equal(await sqlNarrativeStore(db, direct).save(row('After cancellation')), false);
  assert.equal(db.saved.get('SYN-1')?.content, row().content);
});

it('refuses foreign-tenant section landing before reading or altering its stored clinical text', async () => {
  const db = new DatabaseDouble();
  await assert.rejects(sqlNarrativeStore(db, { ...scope, organizationId: 8 }).writeSections(sectionInput()),
    { code: 'CSR_NARRATIVE_BUILD_NOT_RUNNABLE' });
  assert.equal(db.writes.length, 0);
});

it('worker forwards the exact claimed attempt to every narrative store created by its build', async () => {
  const db = new DatabaseDouble(); db.run.status = 'queued'; db.run.attempt = 0;
  let received: unknown;
  const deps: CsrNarrativeWorkerDeps = {
    withOrganization: (_org, fn) => fn(db as never),
    build: async (_deps, input) => { received = input.narrativeAttempt; return result('complete'); },
  };
  await runNarrativeRun(91, 7, deps);
  assert.deepEqual(received, { runId: 91, attempt: 1 });
  assert.equal(db.run.status, 'complete');
});

it('a late worker neither saves old narrative bytes nor finishes the replacement run', async () => {
  const db = new DatabaseDouble(); db.run.status = 'queued'; db.run.attempt = 0;
  const deps: CsrNarrativeWorkerDeps = {
    withOrganization: (_org, fn) => fn(db as never),
    build: async (_deps, input) => {
      db.run.attempt = 2; // replacement claimed while provider was outstanding
      db.saved.set('SYN-1', { content: 'New attempt narrative' });
      const saved = await sqlNarrativeStore(db, { ...scope, narrativeAttempt: input.narrativeAttempt }).save(row('Late old narrative'));
      return result(saved ? 'complete' : 'stopped');
    },
  };
  await runNarrativeRun(91, 7, deps);
  assert.equal(db.saved.get('SYN-1')?.content, 'New attempt narrative');
  assert.equal(db.run.status, 'running');
  assert.equal(db.run.attempt, 2);
  assert.equal(db.run.result, null);
});

it('carries claimed attempt through the actual evidence-loading build function into persistence', async () => {
  const db = new DatabaseDouble(); db.run.status = 'queued'; db.run.attempt = 0;
  h.compose = async input => {
    // The provider completes after recovery, while the caller still holds its
    // original build inputs. Both orchestration modules below are real code.
    db.run.attempt = 2;
    db.saved.set('SYN-1', { content: 'Replacement retained narrative' });
    return result(await input.store.save(row('Obsolete derived prose')) ? 'complete' : 'stopped');
  };
  try {
    await runNarrativeRun(91, 7, {
      withOrganization: (_org, fn) => fn(db as never), build: buildCsrNarratives,
    });
  } finally { h.compose = null; }
  assert.equal(db.saved.get('SYN-1')?.content, 'Replacement retained narrative');
  assert.equal(db.run.status, 'running');
  assert.equal(db.run.attempt, 2);
});

it('releases the write transaction and preserves content if the subject insert fails', async () => {
  const db = new DatabaseDouble(); db.failSave = true;
  db.saved.set('SYN-1', { content: 'Earlier verified subject' });
  await assert.rejects(sqlNarrativeStore(db, scope).save(row()), /insert failure/);
  assert.equal(db.saved.get('SYN-1')?.content, 'Earlier verified subject');
  assert.equal(db.transaction, false);
  assert.equal(db.parentLocked, false);
  assert.equal(db.attemptLocked, false);
});
