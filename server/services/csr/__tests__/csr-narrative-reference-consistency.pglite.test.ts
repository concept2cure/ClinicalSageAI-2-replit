/** Real SQL regression targets for the existing narrative-reference reader.
 * Synthetic minimal schema covers the queried columns, not full migrations,
 * production RLS, or multi-connection PostgreSQL isolation. */
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { readCsrNarrativeReference, sqlLandedNarratives } from '../csr-narrative-landed';
import { narrativeSectionBlock } from '../narrative-section';
import type { NarrativeQueryable } from '../csr-narrative-store';

const JOB = { organizationId: 7, jobId: 41 };
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const text = 'Synthetic observation ALFA.';
const qc = { armName: 'Synthetic arm', categories: ['serious'] as const, events: ['Synthetic event'], missingFields: [], prose: 'template' };
const section = 'Synthetic basis ALFA.' + narrativeSectionBlock({ subjectId: 'SYN-001', armName: qc.armName,
  categories: ['serious'], events: qc.events, text });
let pg: PGlite;
const q: NarrativeQueryable = { query: (sql, args) => pg.query<Record<string, unknown>>(sql, args as never[]) };
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE csr_section_outputs (
    organization_id integer, job_id integer, section_number text, content text, content_hash text);
    CREATE TABLE csr_narrative_outputs (
      organization_id integer, job_id integer, subject_id text, sequence integer, status text,
      content text, content_hash text, facts_digest text, qc jsonb);`);
});
afterAll(async () => { await pg?.close(); });
beforeEach(async () => {
  await pg.exec('TRUNCATE csr_section_outputs, csr_narrative_outputs');
  await q.query(`INSERT INTO csr_section_outputs VALUES (7,41,'14.3.3',$1,$2)`, [section, sha(section)]);
  await q.query(`INSERT INTO csr_narrative_outputs VALUES (7,41,'SYN-001',0,'composed',$1,$2,$3,$4::jsonb)`,
    [text, sha(text), sha('facts'), JSON.stringify(qc)]);
});

it('verifies the actual SQL reader and keeps tenant scoping', async () => {
  expect(await readCsrNarrativeReference(q, JOB)).toMatchObject({ state: 'verified', reference: {
    narratives: 1, landedSha256: sha(section), landedLength: section.length,
  } });
  expect(await readCsrNarrativeReference(q, { ...JOB, organizationId: 8 })).toEqual({ state: 'not-landed' });
});

it('a captured SQL view cannot read the replacement section revision', async () => {
  const view = (await sqlLandedNarratives(q, JOB))!;
  const next = section.replaceAll('ALFA', 'BETA');
  await q.query('UPDATE csr_section_outputs SET content=$1, content_hash=$2', [next, sha(next)]);
  expect(await view.slice(0, 30)).toBe('');
});

it('rechecks the actual section after the final narrative-store digest', async () => {
  let digests = 0;
  const hooked: NarrativeQueryable = { query: async (sql, args) => {
    const result = await q.query(sql, args);
    if (sql.startsWith('SELECT subject_id, sequence, status, content_hash, facts_digest,') && ++digests === 2) {
      const next = section.replace('Synthetic basis ALFA.', 'Synthetic basis BETA.');
      await q.query('UPDATE csr_section_outputs SET content=$1, content_hash=$2', [next, sha(next)]);
    }
    return result;
  } };
  expect(await readCsrNarrativeReference(hooked, JOB)).toMatchObject({ state: 'mismatch' });
});

it('refuses replacing both subject and section bytes after the first section header read', async () => {
  let changed = false;
  const hooked: NarrativeQueryable = { query: async (sql, args) => {
    const result = await q.query(sql, args);
    if (!changed && sql.startsWith('SELECT content_hash, char_length(content)')) {
      changed = true;
      const next = section.replaceAll('ALFA', 'BETA');
      await q.query('UPDATE csr_section_outputs SET content=$1, content_hash=$2', [next, sha(next)]);
      const nextSubject = text.replace('ALFA', 'BETA');
      await q.query('UPDATE csr_narrative_outputs SET content=$1, content_hash=$2', [nextSubject, sha(nextSubject)]);
    }
    return result;
  } };
  expect(await readCsrNarrativeReference(hooked, JOB)).toMatchObject({ state: 'mismatch' });
});

it('refuses an unhashed edit after matching every narrative', async () => {
  let digests = 0;
  const hooked: NarrativeQueryable = { query: async (sql, args) => {
    const result = await q.query(sql, args);
    if (sql.startsWith('SELECT subject_id, sequence, status, content_hash, facts_digest,') && ++digests === 2) {
      await q.query("UPDATE csr_section_outputs SET content=content || ' Unhashed alteration.'");
    }
    return result;
  } };
  await expect(readCsrNarrativeReference(hooked, JOB)).rejects.toMatchObject({ code: 'CSR_NARRATIVES_HASH_MISMATCH' });
});

it('refuses a section removed after all narrative rows were matched', async () => {
  let digests = 0;
  const hooked: NarrativeQueryable = { query: async (sql, args) => {
    const result = await q.query(sql, args);
    if (sql.startsWith('SELECT subject_id, sequence, status, content_hash, facts_digest,') && ++digests === 2) {
      await q.query('DELETE FROM csr_section_outputs WHERE organization_id=$1 AND job_id=$2', [7,41]);
    }
    return result;
  } };
  expect(await readCsrNarrativeReference(hooked, JOB)).toMatchObject({ state: 'mismatch' });
});
