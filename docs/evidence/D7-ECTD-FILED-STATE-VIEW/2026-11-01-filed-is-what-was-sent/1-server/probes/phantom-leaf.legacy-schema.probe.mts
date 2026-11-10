/*
 * Schema-only copy (F1 review, 2026-11-02) of the orchestrator's probe phantom-leaf.probe.mts.
 * Kept in the evidence directory only. The ONLY change is the schema: the columns the fold now reads
 * (ectd_sequences.transmit_attempt_id and transmit_signature_action_id) and an EMPTY submission_transmittals
 * table, so the probe's own scenario runs unchanged: sequences sent before the transmit guard kept a record
 * of what each send carried. Its data, steps and verdict lines are the original's.
 */
/**
 * Probe (orchestrator, 2026-10-25): does "what the agency holds" include a leaf that only an
 * earlier PREVIEW compile of a sent sequence carried? Two compiles of 0000, then 0000 is sent:
 *   preview A (earlier):  general.pdf, draft-only.pdf
 *   final   B (later):    general.pdf
 * The agency received B's leaves. draft-only.pdf was never sent.
 */
import { PGlite } from '@electric-sql/pglite';
import { loadFiledStateBySubmission, type PoolLike } from '/home/user/ClinicalSageAI-2-replit/server/services/ectd/prior-sequence-loader';

const ORG = 7;
const leaf = (ctdSection: string, fileName: string, md5: string, operation = 'new') => ({
  ctdSection, fileName, md5, operation, href: `m3/${fileName}`, leafId: `leaf-${fileName.replace(/\W/g, '-')}`, backbone: 'index.xml',
});

async function main() {
const pg = new PGlite();
const pool: PoolLike = { query: (sql: string, params?: unknown[]) => pg.query(sql, params) as any };
await pg.exec(`
  CREATE TABLE ectd_sequences (id SERIAL PRIMARY KEY, submission_id INTEGER NOT NULL, region TEXT NOT NULL DEFAULT 'fda',
    sequence_number TEXT NOT NULL, organization_id INTEGER NOT NULL, dispatch_status TEXT, deleted_at TIMESTAMPTZ,
      transmit_attempt_id UUID, transmit_signature_action_id TEXT);
    CREATE TABLE submission_transmittals (id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, region TEXT, metadata JSONB);
  CREATE TABLE ectd_compilations (id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, submission_id INTEGER,
    compilation_type TEXT NOT NULL DEFAULT 'module', application_number TEXT, sequence_number TEXT, leaf_manifest JSON, compiled_at TIMESTAMP);
  INSERT INTO ectd_sequences (submission_id, sequence_number, organization_id, dispatch_status) VALUES (1, '0000', ${ORG}, 'sent');
`);
const ins = (manifest: unknown, at: string) => pg.query(
  `INSERT INTO ectd_compilations (organization_id, submission_id, compilation_type, sequence_number, leaf_manifest, compiled_at)
   VALUES ($1, 1, 'original', '0000', $2, $3)`, [ORG, JSON.stringify(manifest), at]);
await ins([leaf('3.2.S.1', 'general.pdf', 'a'.repeat(32)), leaf('3.2.S.2', 'draft-only.pdf', 'b'.repeat(32))], '2026-10-01T10:00:00');
await ins([leaf('3.2.S.1', 'general.pdf', 'a'.repeat(32))], '2026-10-02T10:00:00');

const state = await loadFiledStateBySubmission(pool, { organizationId: ORG, submissionId: 1 });
const names = state.leaves.map((l) => l.fileName).sort();
console.log('on file per the fold:', JSON.stringify(names));
console.log(names.includes('draft-only.pdf')
  ? 'DEFECT REPRODUCED: draft-only.pdf, carried only by an earlier preview of the sent sequence, is reported as on file at the agency.'
  : 'not reproduced: the fold reports only what the final compile carried.');
await pg.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
