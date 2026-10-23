/** Isolated native PostgreSQL qualification, synthetic records only. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import pg from 'pg';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { PROGRAM_SPINE_PGLITE_DDL, SUBMISSION_CORE_PGLITE_DDL } from '../../../../../server/db/pglite-harness';
import {
  readRecordedPackageIdentity, packageIdentityRefusal, lockRecordedPackageIdentity, fdaContactsForPackageIdentity,
} from '../../../../../server/services/ectd/package-identity';
import { deriveGovernedTargetBinding } from '../../../../../server/services/part11/signature-persistence';
import { buildPackagerInputFromCore } from '../../../../../server/services/ectd/core-to-packager';
import { packageEctdSubmission } from '../../../../../server/services/submission-gateways/regional-packager';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../../..');
const connectionString = process.env.APPLICANT_PROOF_DATABASE_URL;
assert.ok(connectionString, 'APPLICANT_PROOF_DATABASE_URL must name the isolated qualification database.');
const first = new pg.Client({ connectionString, application_name: 'applicant-identity-qualification' });
const second = new pg.Client({ connectionString, application_name: 'applicant-identity-lock-contender' });
const paths = [
  'migrations/20260609_ind_master_data.sql', 'migrations/20261021_regulatory_programs_applicant_sponsor.sql',
  'scripts/db/migration-set.mjs', 'server/db/pglite-harness.ts',
  'server/services/ectd/package-identity.ts', 'server/services/part11/signature-persistence.ts',
  'server/services/part11/ectd-sequence-binding.ts', 'server/services/ectd/core-to-packager.ts',
  'server/services/submission-gateways/regional-packager.ts', 'server/services/submission-gateways/ectd-packager/types.ts',
  'docs/evidence/MR-10/2026-10-21-applicant-identity/native/check.ts',
];
const pins = () => Object.fromEntries(paths.map(path => [path, createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')]));
const before = pins();
const migration = readFileSync(resolve(root, paths[1]), 'utf8');
const sponsorMigration = readFileSync(resolve(root, paths[0]), 'utf8');
const program = '11111111-1111-4111-8111-111111111111';
const sponsor = '22222222-2222-4222-8222-222222222222';
const foreign = '33333333-3333-4333-8333-333333333333';
const result: Record<string, unknown> = { syntheticRecords: true, humanWitnessed: false, sourcePins: before, checks: [] };
const checks = result.checks as string[];
await first.connect();
await second.connect();
try {
  result.serverVersion = (await first.query('SELECT version() AS version')).rows[0].version;
  // This database belongs only to this probe; no production or prior fixture is touched.
  assert.equal((await first.query('SELECT current_database() AS name')).rows[0].name, 'applicant_identity');
  await first.query(PROGRAM_SPINE_PGLITE_DDL);
  await first.query(SUBMISSION_CORE_PGLITE_DDL);
  await first.query(sponsorMigration);
  await assert.rejects(first.query('SELECT applicant_sponsor_id FROM regulatory_programs'), { code: '42703' });
  checks.push('Before migration, selecting the missing program binding fails with 42703.');
  await first.query(migration);
  await first.query(`INSERT INTO organizations(id,name) VALUES (1,'Synthetic tenant one'),(2,'Synthetic tenant two')`);
  await first.query(`INSERT INTO ind_sponsors(id,organization_id,name,duns,contact_name,contact_phone,contact_email)
    VALUES ($1,1,'Synthetic recorded applicant','123456789','Synthetic regulatory contact','+1 555 0100','ra@example.test'),
           ($2,2,'Foreign synthetic applicant','987654321','Foreign contact','+1 555 0199','foreign@example.test')`, [sponsor, foreign]);
  await first.query(`INSERT INTO regulatory_programs(id,organization_id,name,code,program_type,product_name,application_number,applicant_sponsor_id,updated_at)
    VALUES ($1,1,'Synthetic native qualification','NATIVE-IND','IND','Synthetic product','123456',$2,'2026-10-21 01:00:00.123456+00')`, [program, sponsor]);
  await first.query(migration);
  assert.equal((await first.query('SELECT applicant_sponsor_id FROM regulatory_programs WHERE id=$1', [program])).rows[0].applicant_sponsor_id, sponsor);
  checks.push('Actual additive migration replay preserves the existing sponsor binding and master data.');
  await assert.rejects(first.query('UPDATE regulatory_programs SET applicant_sponsor_id=$1 WHERE id=$2', [foreign, program]), { code: '23503' });
  checks.push('Composite foreign key refuses a cross-tenant sponsor (23503).');
  const identity = await readRecordedPackageIdentity(first, 1, program);
  assert.equal(identity.applicantId, '123456789');
  assert.equal(identity.applicantName, 'Synthetic recorded applicant');
  assert.equal(packageIdentityRefusal(identity, 'Nothing was built.', { fda: true }), null);
  const other = await readRecordedPackageIdentity(first, 2, program);
  assert.equal(other.applicantId, null);
  assert.notEqual(other.applicantName, identity.applicantName);
  checks.push('Canonical native reader uses the explicitly bound applicant, and cannot read it through another tenant.');
  // Program updated_at is TIMESTAMP WITHOUT TIME ZONE in the real schema;
  // use its full stored value directly. Sponsor updated_at is TIMESTAMPTZ.
  const stamp = `to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
  const revision = (await first.query(`SELECT ${stamp} AS revision FROM regulatory_programs WHERE id=$1`, [program])).rows[0].revision;
  assert.equal(revision, '2026-10-21T01:00:00.123456Z');
  await first.query("SET TIME ZONE 'Pacific/Honolulu'");
  assert.equal((await first.query(`SELECT ${stamp} AS revision FROM regulatory_programs WHERE id=$1`, [program])).rows[0].revision, revision);
  await first.query("SET TIME ZONE 'UTC'");
  assert.equal((await first.query(`UPDATE regulatory_programs SET updated_at=clock_timestamp() WHERE id=$1 AND ${stamp}=$2 RETURNING id`, [program, revision])).rowCount, 1);
  assert.equal((await first.query(`UPDATE regulatory_programs SET updated_at=clock_timestamp() WHERE id=$1 AND ${stamp}=$2 RETURNING id`, [program, revision])).rowCount, 0);
  checks.push('Exact program revision retains six fractional digits across session time zones; unchanged legacy precision matches once and stale CAS refuses.');
  await first.query(`INSERT INTO submissions(id,title,application_type,client_type,primary_region,organization_id,created_by,program_id)
    VALUES (10,'Synthetic native IND','ind','biotech','fda',1,9,$1)`, [program]);
  await first.query(`INSERT INTO ectd_sequences(id,submission_id,region,sequence_number,organization_id,created_by)
    VALUES (20,10,'fda','0000',1,9)`);
  const signed = await deriveGovernedTargetBinding(first, 'ectd-sequence:20', 1);
  assert.equal(signed.recordedPackageIdentity?.identity.applicantId, '123456789');
  assert.ok(signed.digest);
  await first.query('UPDATE ind_sponsors SET contact_email=$1 WHERE id=$2', ['changed@example.test', sponsor]);
  assert.notEqual((await deriveGovernedTargetBinding(first, 'ectd-sequence:20', 1)).digest, signed.digest);
  assert.equal(signed.recordedPackageIdentity?.identity.contact.email, 'ra@example.test');
  checks.push('Native signature derivation changes when the stored contact changes; prior captured proof stays immutable.');
  await second.query("SET lock_timeout='150ms'");
  await first.query('BEGIN');
  await first.query('SELECT id FROM ectd_sequences WHERE id=20 AND organization_id=1 FOR UPDATE');
  await lockRecordedPackageIdentity(first, 1, program);
  await assert.rejects(second.query('UPDATE regulatory_programs SET application_number=$1 WHERE id=$2', ['654321', program]), { code: '55P03' });
  await assert.rejects(second.query('UPDATE ind_sponsors SET contact_phone=$1 WHERE id=$2', ['+1 555 0111', sponsor]), { code: '55P03' });
  assert.equal((await second.query('UPDATE ind_sponsors SET name=$1 WHERE id=$2 RETURNING id', ['Unrelated tenant updated', foreign])).rowCount, 1);
  await first.query('COMMIT');
  assert.equal((await second.query('UPDATE ind_sponsors SET contact_phone=$1 WHERE id=$2 RETURNING id', ['+1 555 0111', sponsor])).rowCount, 1);
  checks.push('Sequence/program/sponsor capture locks block competing identity edits, permit unrelated tenant work, and release after commit.');
  const folder = await mkdtemp(resolve(tmpdir(), 'applicant-native-package-'));
  try {
    const captured = await readRecordedPackageIdentity(first, 1, program);
    const pdf = await PDFDocument.create();
    pdf.addPage().drawText('Synthetic applicant identity qualification. No agency acceptance claimed.');
    const source = resolve(folder, 'proof.pdf');
    writeFileSync(source, await pdf.save());
    const { input, skipped } = buildPackagerInputFromCore({
      sequence: { region: 'fda', sequenceNumber: '0000', type: 'original' },
      submission: { applicationType: 'ind', productName: 'Synthetic qualification product' },
      leaves: [{ sectionCode: 'm3.2.s.1', title: 'Synthetic qualification leaf', lifecycleOp: 'new' }],
      resolveFile: () => ({ sourcePath: source, fileName: 'proof.pdf' }),
      applicationId: captured.applicationNumber!, sponsorId: captured.applicantId!, sponsorName: captured.applicantName!,
      contacts: fdaContactsForPackageIdentity(captured), outputDir: folder,
    });
    assert.equal(skipped.length, 0);
    const bundle = await packageEctdSubmission(input);
    const bytes = readFileSync(bundle.path);
    const xml = await (await JSZip.loadAsync(bytes)).file('m1/us/us-regional.xml')!.async('string');
    assert.ok(xml.includes(`<id>${captured.applicantId}</id>`));
    assert.ok(xml.includes(`<company-name>${captured.applicantName}</company-name>`));
    assert.ok(xml.includes(`<email>${captured.contact.email}</email>`));
    assert.ok(xml.includes(`<telephone>${captured.contact.phone}</telephone>`));
    assert.ok(!xml.includes('UNASSIGNED'));
    assert.match(JSON.stringify(bundle.regionalBackbone), /telephone-number-type/);
    writeFileSync(resolve(here, 'recorded-applicant.zip'), bytes);
    writeFileSync(resolve(here, 'package-evidence.json'), JSON.stringify({ syntheticRecords: true, agencyAcceptance: false,
      capturedIdentity: captured, packageSha256: bundle.sha256, sourcePins: before,
      dtdStatus: bundle.dtdStatus, regionalBackbone: bundle.regionalBackbone }, null, 2) + '\n');
    checks.push('Real canonical adapter/packager ZIP contains the native recorded DUNS/name/contact, no placeholders, and retains unresolved agency telephone-type gaps.');
  } finally { await rm(folder, { recursive: true, force: true }); }
  assert.deepEqual(pins(), before, 'Qualification inputs moved during execution.');
  result.passed = true;
  writeFileSync(resolve(here, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} finally {
  await first.query('ROLLBACK').catch(() => {});
  await Promise.all([first.end(), second.end()]);
}
