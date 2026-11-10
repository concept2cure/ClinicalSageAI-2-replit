/*
 * Schema-only copy (F1 review, 2026-11-02) of the orchestrator's probe sent-without-compile.probe.mts.
 * Kept in the evidence directory only. The ONLY change is the schema: the columns the fold now reads
 * (ectd_sequences.transmit_attempt_id and transmit_signature_action_id) and an EMPTY submission_transmittals
 * table, so the probe's own scenario runs unchanged: sequences sent before the transmit guard kept a record
 * of what each send carried. Its data, steps and verdict lines are the original's.
 */
/**
 * Probe (phantom-leaf mapping, 2026-11-01, trunk d914c2618): defect (b) of the
 * review notes. Transmit writes no ectd_compilations row, so the fold of what the
 * agency holds knows a sent sequence only through a compile. Two cases:
 *   1. 0000 sent with NO compile on record  -> the fold is empty; 0001 binds against nothing.
 *   2. 0000 compiled with general.pdf md5 a, then sent (transmit re-assembles; suppose the
 *      leaf's bytes are md5 c by then) -> the fold still reports md5 a.
 * Case 2 cannot be told apart from a correct fold by the data alone; it is shown
 * here only to make the point that the fold's md5 comes from the compile, not the send.
 */
import { PGlite } from '@electric-sql/pglite';
import { loadFiledStateBySubmission, loadLatestPriorManifestBySubmission, type PoolLike } from '/home/user/ClinicalSageAI-2-replit/server/services/ectd/prior-sequence-loader';

const ORG = 7;
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
    INSERT INTO ectd_sequences (submission_id, sequence_number, organization_id, dispatch_status) VALUES (1, '0001', ${ORG}, NULL);
  `);
  const s1 = await loadFiledStateBySubmission(pool, { organizationId: ORG, submissionId: 1 });
  const p1 = await loadLatestPriorManifestBySubmission(pool, { organizationId: ORG, submissionId: 1, currentSequence: '0001' });
  console.log('case 1 (0000 sent, no compile row):');
  console.log('  view leaves:', JSON.stringify(s1.leaves.map((l) => l.fileName)), ' sequences:', JSON.stringify(s1.sequences));
  console.log('  prior state 0001 binds against:', JSON.stringify(p1));
  console.log(p1.priorSequenceNumber === '' && p1.leaves.length === 0
    ? '  DEFECT (b) REPRODUCED: a sent sequence with no compile row is absent from the prior state; 0001 would file every leaf as new with no modified-file.'
    : '  not reproduced');

  await pg.query(`INSERT INTO ectd_compilations (organization_id, submission_id, compilation_type, sequence_number, leaf_manifest, compiled_at)
    VALUES ($1, 1, 'original', '0000', $2, '2026-10-01T10:00:00')`,
    [ORG, JSON.stringify([{ ctdSection: '3.2.S.1', fileName: 'general.pdf', md5: 'a'.repeat(32), operation: 'new', href: 'm3/general.pdf', leafId: 'leaf-general', backbone: 'index.xml' }])]);
  const s2 = await loadFiledStateBySubmission(pool, { organizationId: ORG, submissionId: 1 });
  console.log('case 2 (one compile before the send):');
  console.log('  view leaves:', JSON.stringify(s2.leaves.map((l) => ({ f: l.fileName, md5: l.md5.slice(0, 4) }))));
  console.log('  the md5 is the compile\'s; transmit re-assembles and records no manifest, so nothing on record says what was sent.');
  await pg.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
