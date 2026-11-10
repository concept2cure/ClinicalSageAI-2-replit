/**
 * Amended copy (F1 server part, 2026-11-01) of the orchestrator's sent-without-compile probe
 * (scratchpad/ectd-probe/sent-without-compile.probe.mts, trunk d914c2618). Kept in the evidence
 * directory only.
 *
 * The original's schema has no ectd_sequences.transmit_attempt_id and no submission_transmittals,
 * and its send leaves no record of what it carried, so after the change it stops with "column
 * s.transmit_attempt_id does not exist" (probes/unchanged-probes.after-change.txt). This copy models
 * the send as it is made after the change: 0000 is bound to its transmit attempt, and the transmit
 * guard wrote one same-organisation transmittal whose metadata.dispatchBinding names that attempt
 * and sequence and whose metadata.leafManifest (buildLeafManifest, as the guard builds it) is what
 * was sent: general.pdf with md5 c. (F1 review: the sequence also records the signature its transmit
 * claim took, and the row names its agency, FDA, as the fold now checks both.)
 *   1. 0000 sent with NO compile on record -> filed, and 0001 binds against what 0000 sent.
 *   2. a compile of 0000 with general.pdf md5 a is then recorded -> the fold still reports md5 c,
 *      what was sent, and not the compile's.
 */
import { PGlite } from '@electric-sql/pglite';
import { loadFiledStateBySubmission, loadLatestPriorManifestBySubmission, type PoolLike } from '/home/user/ClinicalSageAI-2-replit/server/services/ectd/prior-sequence-loader';
import { buildLeafManifest } from '/home/user/ClinicalSageAI-2-replit/server/services/ectd/sequence-manifest';

const ORG = 7;
const ATTEMPT = 'a0000000-0000-4000-8000-000000000002';
async function main() {
  const pg = new PGlite();
  const pool: PoolLike = { query: (sql: string, params?: unknown[]) => pg.query(sql, params) as any };
  await pg.exec(`
    CREATE TABLE ectd_sequences (id SERIAL PRIMARY KEY, submission_id INTEGER NOT NULL, region TEXT NOT NULL DEFAULT 'fda',
      sequence_number TEXT NOT NULL, organization_id INTEGER NOT NULL, dispatch_status TEXT, transmit_attempt_id UUID, transmit_signature_action_id TEXT, deleted_at TIMESTAMPTZ);
    CREATE TABLE ectd_compilations (id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, submission_id INTEGER,
      compilation_type TEXT NOT NULL DEFAULT 'module', application_number TEXT, sequence_number TEXT, leaf_manifest JSON, compiled_at TIMESTAMP);
    CREATE TABLE submission_transmittals (id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, region TEXT, status TEXT NOT NULL DEFAULT 'pending', metadata JSONB DEFAULT '{}'::jsonb);
    INSERT INTO ectd_sequences (submission_id, sequence_number, organization_id, dispatch_status, transmit_attempt_id, transmit_signature_action_id) VALUES (1, '0000', ${ORG}, 'sent', '${ATTEMPT}', 'sig-1');
    INSERT INTO ectd_sequences (submission_id, sequence_number, organization_id, dispatch_status) VALUES (1, '0001', ${ORG}, NULL);
  `);
  const sequenceId = (await pg.query<{ id: number }>(`SELECT id FROM ectd_sequences WHERE sequence_number = '0000'`)).rows[0].id;
  await pg.query(`INSERT INTO submission_transmittals (organization_id, region, status, metadata) VALUES ($1, 'fda', 'received', $2::jsonb)`, [ORG, JSON.stringify({
    dispatchBinding: { attemptId: ATTEMPT, organizationId: ORG, sequenceId, signatureActionId: 'sig-1', bundleSha256: 'a'.repeat(64) },
    leafManifest: buildLeafManifest([{ ctdSection: '3.2.S.1', fileName: 'general.pdf', md5: 'c'.repeat(32), operation: 'new', href: 'm3/general.pdf', leafId: 'leaf-general', backbone: 'index.xml' }]),
  })]);
  const s1 = await loadFiledStateBySubmission(pool, { organizationId: ORG, submissionId: 1 });
  const p1 = await loadLatestPriorManifestBySubmission(pool, { organizationId: ORG, submissionId: 1, currentSequence: '0001' });
  console.log('case 1 (0000 sent, no compile row, the transmit recorded what it sent):');
  console.log('  view leaves:', JSON.stringify(s1.leaves.map((l) => l.fileName)), ' sequences:', JSON.stringify(s1.sequences));
  console.log('  prior state 0001 binds against:', JSON.stringify(p1.leaves.map((l) => ({ f: l.fileName, seq: l.sequenceNumber, md5: l.md5.slice(0, 4) }))), 'through', JSON.stringify(p1.priorSequenceNumber));
  console.log(p1.priorSequenceNumber === '' && p1.leaves.length === 0
    ? '  DEFECT (b) REPRODUCED: a sent sequence with no compile row is absent from the prior state; 0001 would file every leaf as new with no modified-file.'
    : `  not reproduced: 0000 is ${s1.sequences[0]?.filed ? 'filed' : 'NOT filed'} (basis ${s1.sequences[0]?.basis}), and 0001 binds against ${p1.leaves.length} leaf/leaves on file from ${p1.priorSequenceNumber}.`);

  await pg.query(`INSERT INTO ectd_compilations (organization_id, submission_id, compilation_type, sequence_number, leaf_manifest, compiled_at)
    VALUES ($1, 1, 'original', '0000', $2, '2026-10-01T10:00:00')`,
    [ORG, JSON.stringify([{ ctdSection: '3.2.S.1', fileName: 'general.pdf', md5: 'a'.repeat(32), operation: 'new', href: 'm3/general.pdf', leafId: 'leaf-general', backbone: 'index.xml' }])]);
  const s2 = await loadFiledStateBySubmission(pool, { organizationId: ORG, submissionId: 1 });
  console.log('case 2 (a compile of 0000 with md5 a is also on record):');
  console.log('  view leaves:', JSON.stringify(s2.leaves.map((l) => ({ f: l.fileName, md5: l.md5.slice(0, 4) }))), ' basis:', JSON.stringify(s2.sequences[0]?.basis));
  console.log(s2.leaves[0]?.md5.startsWith('c')
    ? '  the md5 is what the transmit recorded it sent (cccc), not the compile\'s.'
    : '  DEFECT: the md5 is the compile\'s, not what was sent.');
  await pg.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
