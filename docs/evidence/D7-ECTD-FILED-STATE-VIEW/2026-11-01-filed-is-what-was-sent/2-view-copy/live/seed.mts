// Seed for the F1 live check: one tenant, one user (admin), two projects. Same SQL as tests/db/ectd-filed-state-view.dbtest.ts.
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { buildLeafManifest } from '/home/user/ClinicalSageAI-2-replit/server/services/ectd/sequence-manifest';
const owner = new Pool({ connectionString: 'postgresql://postgres@127.0.0.1:55432/c2c_test', max: 2 });
const RUN = randomUUID().slice(0, 8);
const TAG = `live-f1-${RUN}`;
const leaf = (ctdSection: string, fileName: string, md5: string, operation = 'new', extra: Record<string, unknown> = {}) => ({
  ctdSection, fileName, md5, operation, title: fileName.replace(/\.pdf$/, '').replace(/-/g, ' '), href: `m3/${fileName}`,
  leafId: `leaf-${fileName.replace(/\W/g, '-')}`, backbone: 'index.xml', ...extra,
});
const q = (sql: string, p: unknown[] = []) => owner.query(sql, p);
const email = `${TAG}@example.invalid`;
const userId = Number((await q(`INSERT INTO users (email, name, password_hash) VALUES ($1, 'Fil Ed', 'not-a-real-hash') RETURNING id`, [email])).rows[0].id);
const org = (await q(`INSERT INTO organizations (name, slug, status) VALUES ($1, $1, 'active') RETURNING id`, [TAG])).rows[0];
const orgId = Number(org.id);
await q('INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, $3)', [orgId, userId, 'admin']);
await q('UPDATE users SET default_organization_id = $1 WHERE id = $2', [orgId, userId]).catch(() => undefined);
async function project(name: string): Promise<{ programId: string; sub: number }> {
  const prog = (await q(`INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Invented product') RETURNING id`, [name, `${TAG}-${name}`.toUpperCase().replace(/\W/g, '-'), orgId])).rows[0];
  const sub = Number((await q(`INSERT INTO submissions (title, application_type, client_type, primary_region, organization_id, created_by, program_id)
     VALUES ($1, 'ind', 'pharma', 'fda', $2, $3, $4) RETURNING id`, [`${name} IND 123456`, orgId, userId, prog.id])).rows[0].id);
  return { programId: String(prog.id), sub };
}
async function seq(sub: number, number: string, dispatch: string | null, attempt: string | null = null): Promise<number> {
  return Number((await q(`INSERT INTO ectd_sequences (submission_id, region, sequence_number, organization_id, created_by, dispatch_status, transmit_attempt_id, transmit_signature_action_id)
     VALUES ($1, 'fda', $2, $3, $4, $5, $6, $7) RETURNING id`, [sub, number, orgId, userId, dispatch, attempt, attempt ? `${TAG}-sig-${number}` : null])).rows[0].id);
}
// Project A: 0000 acknowledged before the guard kept a record (read from its compile), 0001 sent with a record, 0002 unresolved.
const A = await project('Live F1 mixed');
await seq(A.sub, '0000', 'acknowledged');
await q(`INSERT INTO ectd_compilations (organization_id, compilation_name, compilation_type, status, application_number, sequence_number, leaf_manifest, submission_id, compiled_at)
   VALUES ($1, $2, 'module', 'completed', 'IND 123456', '0000', $3::json, $4, now() - interval '30 days')`,
  [orgId, `${TAG} 0000`, JSON.stringify([leaf('3.2.S.1', 'general.pdf', 'a'.repeat(32)), leaf('5.3.5.1', 'csr.pdf', 'b'.repeat(32))]), A.sub]);
const attempt1 = randomUUID();
const s1 = await seq(A.sub, '0001', 'sent', attempt1);
await q(`INSERT INTO submission_transmittals (organization_id, region, gateway, format, transport, bundle_sha256, status, submitted_by, metadata)
   VALUES ($1, 'fda', 'esg', 'ectd', 'as2', $2, 'received', $3, $4::jsonb)`, [orgId, 'a'.repeat(64), userId, JSON.stringify({
  applicationId: 'IND123456', sequence: '0001',
  dispatchBinding: { attemptId: attempt1, organizationId: orgId, sequenceId: s1, signatureActionId: `${TAG}-sig-0001`, bundleSha256: 'a'.repeat(64) },
  leafManifest: buildLeafManifest([leaf('3.2.S.1', 'general-v2.pdf', 'c'.repeat(32), 'replace', { modifiedFile: '../0000/index.xml#leaf-general-pdf' })] as never),
})]);
await seq(A.sub, '0002', 'transmitting', randomUUID());
// Project B: one acknowledged sequence, and nothing on record says what it carried.
const B = await project('Live F1 unrecorded');
await seq(B.sub, '0000', 'acknowledged');
console.log(JSON.stringify({ TAG, email, orgId, userId, mixed: A.programId, unrecorded: B.programId }));
await owner.end();
