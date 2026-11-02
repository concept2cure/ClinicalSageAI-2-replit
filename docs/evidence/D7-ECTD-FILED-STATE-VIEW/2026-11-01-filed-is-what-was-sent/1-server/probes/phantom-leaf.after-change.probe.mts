/**
 * Amended copy (F1 server part, 2026-11-01) of the orchestrator's phantom-leaf probe
 * (scratchpad/ectd-probe/phantom-leaf.probe.mts, 2026-10-25). Kept in the evidence directory only.
 *
 * The original builds a schema with no ectd_sequences.transmit_attempt_id and no
 * submission_transmittals, and models a send that left no record of what it carried; after the
 * change the fold reads both, so the original stops with "column s.transmit_attempt_id does not
 * exist" (see probes/unchanged-probes.after-change.txt). This copy models the send as it is made
 * after the change: 0000 is bound to its transmit attempt, and the transmit guard wrote one
 * transmittal row of the same organisation whose metadata.dispatchBinding names that attempt and
 * sequence and whose metadata.leafManifest is what was sent (general.pdf only), built with the
 * same buildLeafManifest the guard uses. (F1 review: the sequence also records the signature its
 * transmit claim took, and the row names its agency, FDA, as the fold now checks both.) Everything else is the original: two compiles of 0000,
 *   preview A (earlier):  general.pdf, draft-only.pdf
 *   final   B (later):    general.pdf
 * and 0000 sent.
 */
import { PGlite } from '@electric-sql/pglite';
import { loadFiledStateBySubmission, type PoolLike } from '/home/user/ClinicalSageAI-2-replit/server/services/ectd/prior-sequence-loader';
import { buildLeafManifest } from '/home/user/ClinicalSageAI-2-replit/server/services/ectd/sequence-manifest';

const ORG = 7;
const ATTEMPT = 'a0000000-0000-4000-8000-000000000001';
const leaf = (ctdSection: string, fileName: string, md5: string, operation = 'new') => ({
  ctdSection, fileName, md5, operation, href: `m3/${fileName}`, leafId: `leaf-${fileName.replace(/\W/g, '-')}`, backbone: 'index.xml',
});

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
`);
const ins = (manifest: unknown, at: string) => pg.query(
  `INSERT INTO ectd_compilations (organization_id, submission_id, compilation_type, sequence_number, leaf_manifest, compiled_at)
   VALUES ($1, 1, 'original', '0000', $2, $3)`, [ORG, JSON.stringify(manifest), at]);
await ins([leaf('3.2.S.1', 'general.pdf', 'a'.repeat(32)), leaf('3.2.S.2', 'draft-only.pdf', 'b'.repeat(32))], '2026-10-01T10:00:00');
await ins([leaf('3.2.S.1', 'general.pdf', 'a'.repeat(32))], '2026-10-02T10:00:00');
const sequenceId = (await pg.query<{ id: number }>(`SELECT id FROM ectd_sequences WHERE sequence_number = '0000'`)).rows[0].id;
await pg.query(`INSERT INTO submission_transmittals (organization_id, region, status, metadata) VALUES ($1, 'fda', 'received', $2::jsonb)`, [ORG, JSON.stringify({
  dispatchBinding: { attemptId: ATTEMPT, organizationId: ORG, sequenceId, signatureActionId: 'sig-1', bundleSha256: 'a'.repeat(64) },
  leafManifest: buildLeafManifest([leaf('3.2.S.1', 'general.pdf', 'a'.repeat(32))]),
})]);

const state = await loadFiledStateBySubmission(pool, { organizationId: ORG, submissionId: 1 });
const names = state.leaves.map((l) => l.fileName).sort();
console.log('on file per the fold:', JSON.stringify(names), ' sequences:', JSON.stringify(state.sequences));
console.log(names.includes('draft-only.pdf')
  ? 'DEFECT REPRODUCED: draft-only.pdf, carried only by an earlier preview of the sent sequence, is reported as on file at the agency.'
  : 'not reproduced: the fold reports only what the transmit recorded it sent.');
await pg.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
