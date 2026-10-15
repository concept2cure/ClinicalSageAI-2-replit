/**
 * The package-model spine end to end: the REAL assemble route, REAL SQL
 * (PGlite), the REAL packager and the REAL ZIP, plus the REAL filed-history
 * write governed transmit makes after an accepted send — across sequences.
 *
 * Why this exists. The assemble suite next door mocks the packager and the
 * filesystem, so the route's own plan and the bytes the packager wrote are never
 * compared. That is how a follow-up whose submission type the packager could not
 * resolve returned a bare 500 while that suite passed, and it is why the case
 * below could not be seen at all: this container has no Ghostscript, the
 * production image does (Dockerfile.optimized), and the packager converts every
 * leaf to PDF/A when it is present. The conversion changes the bytes — and,
 * because Ghostscript stamps dates and a random document ID, changes them
 * differently on every run. The filed history recorded the md5 of the CONVERTED
 * bytes; the next assembly planned against the md5 of the bytes it rendered,
 * BEFORE conversion. Two stages of one document never compare equal, so in
 * production every follow-up re-filed every unchanged document as `replace`, a
 * sequence in which nothing changed was never refused, and the operator was told
 * "0 left unchanged on file".
 *
 * The production toolchain is simulated by the stand-in Ghostscript in
 * server/services/ectd/__tests__/stand-in-ghostscript.harness.ts.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';

// BUNDLE_DIR binds when the route module loads, so it is set before any import.
const { bundleDir } = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR || '/tmp'}/pkg-spine-e2e-${process.pid}`;
  process.env.SUBMISSION_BUNDLE_DIR = dir;
  return { bundleDir: dir };
});

vi.mock('../server/routes/c2c/actions', () => ({
  recordGovernedAction: vi.fn(async () => ({ actionId: 'act_x', auditId: 'aud_x', sha256Chain: 'c' })),
}));

vi.mock('../server/db', async () => {
  const { pg: db, drizzleDb } = await import('./support/package-spine-pglite');
  return {
    db: drizzleDb,
    pool: {
      connect: async () => ({ query: (sql: string, params?: unknown[]) => db.query(sql, params ?? []), release: () => {} }),
      query: (sql: string, params?: unknown[]) => db.query(sql, params ?? []),
    },
  };
});
// Engines the router imports that this path never calls.
vi.mock('../server/submission-ops/policy-engine', () => ({ resolvePolicy: vi.fn(), resolveAllPolicies: vi.fn() }));
vi.mock('../server/submission-ops/readiness-engine', () => ({ computePackageReadiness: vi.fn() }));
vi.mock('../server/submission-ops/automation-runner', () => ({ runAutomationSweep: vi.fn() }));
vi.mock('../server/services/intelligence/index.js', () => ({ getProjectSignals: vi.fn(), analyzeCrossArtifactIntelligence: vi.fn() }));
vi.mock('../server/services/regulatory-correspondence/operating-layer', () => ({ readCanonicalDueSoonAndWorkload: vi.fn() }));
vi.mock('../server/src/services/ectd', () => ({ buildECTDZip: vi.fn() }));

import { installStandInGhostscript, type StandInGhostscript } from '../server/services/ectd/__tests__/stand-in-ghostscript.harness';
import { recordFiledSequence } from '../server/services/ectd/package-content-change';
import { pg } from './support/package-spine-pglite';
import {
  ORG, PKG, IND_AMENDMENT, seed, assemble, storedMetadata, storedBundle, fileTheStoredBundle, assertInternallyConsistent,
} from './support/package-spine-e2e.harness';

let gs: StandInGhostscript;
const withProductionToolchain = <T,>(fn: () => Promise<T>) => gs.run(fn);
beforeAll(async () => { gs = await installStandInGhostscript(); });
afterAll(async () => {
  await gs?.dispose();
  await fs.rm(bundleDir, { recursive: true, force: true }).catch(() => {});
});
beforeEach(seed);

describe('the package-model spine, end to end on the real packager', () => {
  it('sequence 0000 is internally consistent: every href resolves and every checksum is the md5 of the bytes shipped', async () => {
    const res = await assemble();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const { zip, bundle } = await storedBundle();
    await assertInternallyConsistent(zip);
    expect(bundle.leafManifest).toHaveLength(3);
    expect(bundle.leafManifest.every((l: any) => typeof l.leafKey === 'string')).toBe(true);
  });

  it('control, no toolchain: a follow-up in which nothing changed is refused as NOTHING_TO_FILE', async () => {
    expect((await assemble()).status).toBe(200);
    await fileTheStoredBundle('original');
    const res = await assemble({ sequence: '0001', ...IND_AMENDMENT });
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.code).toBe('NOTHING_TO_FILE');
  });

  it('WITH the production PDF/A toolchain: a follow-up in which nothing changed still files nothing', async () => {
    await withProductionToolchain(async () => {
      expect((await assemble()).status).toBe(200);
      const { zip, bundle } = await storedBundle();
      // The stand-in really did convert: the shipped bytes are not the rendered ones.
      expect(bundle.submissionGrade?.pdfaConverted, 'leaves were converted').toBeGreaterThan(0);
      await assertInternallyConsistent(zip);
      await fileTheStoredBundle('original');

      const res = await assemble({ sequence: '0001', ...IND_AMENDMENT });
      expect(res.status, `a sequence re-filing ${JSON.stringify(res.body?.data?.bundle?.lifecycle)} unchanged documents`).toBe(409);
      expect(res.body.code).toBe('NOTHING_TO_FILE');
    });
  }, 60_000);

  it('WITH the production PDF/A toolchain: only the edited document ships, as a replace of the leaf on file', async () => {
    await withProductionToolchain(async () => {
      expect((await assemble()).status).toBe(200);
      const { zip: zip0 } = await storedBundle();
      await fileTheStoredBundle('original');

      await pg.query(
        `UPDATE concept2cure_artifacts SET content = 'The overview, version two.', version = 2, approved_version_id = 2,
           updated_at = '2026-02-03T04:05:06Z' WHERE id = 2`,
      );
      const res = await assemble({ sequence: '0001', ...IND_AMENDMENT });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.data.bundle.lifecycle.summary).toMatchObject({ replace: 1, new: 0, unchanged: 2 });

      const { zip: zip1, bundle } = await storedBundle();
      await assertInternallyConsistent(zip1);
      expect(bundle.leafManifest).toHaveLength(1);
      expect(bundle.leafManifest[0]).toMatchObject({ ctdSection: '2.5', operation: 'replace' });
      // Its modified-file names a leaf that sequence 0000's backbone carries.
      const index = await zip1.file('index.xml')!.async('string');
      const pointer = /modified-file="([^"]+)"/.exec(index)?.[1];
      expect(pointer, 'the replace names what it supersedes').toBeTruthy();
      const [file, leafId] = pointer!.split('#');
      const landed = path.posix.normalize(path.posix.join('0001', file));
      expect(landed.startsWith('0000/')).toBe(true);
      const priorBackbone = await zip0.file(landed.slice('0000/'.length))!.async('string');
      expect(priorBackbone, `${pointer} names a leaf 0000 filed`).toContain(`ID="${leafId}"`);
    });
  }, 60_000);
});

describe('a filed withdrawal leaves the filed state (sweep F10)', () => {
  /** File 0000; then withdraw the description in 0001 and file that too. The
   *  section goes with its only document, so 0001 carries the withdrawal alone. */
  async function fileAWithdrawal() {
    expect((await assemble()).status).toBe(200);
    await fileTheStoredBundle('original');
    const filed = (await storedMetadata()).filedSequences[0].leaves.find((l: any) => l.ctdSection === '3.2.P.1');
    await pg.query(`DELETE FROM c2c_package_sections WHERE id = 14`);
    const res = await assemble({
      sequence: '0001', ...IND_AMENDMENT,
      withdraw: [{ ctdSection: '3.2.P.1', fileName: filed.fileName }],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.bundle.lifecycle.summary).toMatchObject({ delete: 1, new: 0, replace: 0 });
    await fileTheStoredBundle('Efficacy Supplement');
    return filed as { fileName: string; leafKey: string };
  }

  it('the filed withdrawal records WHICH document left, by its identity', async () => {
    const filed = await fileAWithdrawal();
    const history = (await storedMetadata()).filedSequences;
    expect(history[1].leaves).toEqual([
      expect.objectContaining({ operation: 'delete', fileName: filed.fileName, leafKey: filed.leafKey }),
    ]);
  });

  it('withdrawing the same document again is refused: it is no longer on file', async () => {
    const filed = await fileAWithdrawal();
    const res = await assemble({
      sequence: '0002', ...IND_AMENDMENT,
      withdraw: [{ ctdSection: '3.2.P.1', fileName: filed.fileName }],
    });
    expect(res.status, `a second delete of a withdrawn leaf: ${JSON.stringify(res.body?.data?.bundle?.lifecycle)}`).toBe(409);
    expect(res.body.code).toBe('WITHDRAWAL_NOT_ON_FILE');
  });

  it('the withdrawn document, filed again unchanged, is NEW — not "already on file", not a replace', async () => {
    await fileAWithdrawal();
    await pg.exec(`
      INSERT INTO c2c_package_sections (id, section_id, org_id, package_db_id, section_key, section_label, sort_order)
        VALUES (14, 'sec_desc', ${ORG}, ${PKG}, '3.2.P.1', 'Description and Composition', 2);
      INSERT INTO c2c_artifact_section_map (org_id, artifact_id, section_db_id) VALUES (${ORG}, 3, 14);`);
    const res = await assemble({ sequence: '0002', ...IND_AMENDMENT });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.bundle.lifecycle.summary).toMatchObject({ new: 1, replace: 0, delete: 0, unchanged: 2 });
    const { zip, bundle } = await storedBundle();
    expect(bundle.leafManifest).toEqual([expect.objectContaining({ ctdSection: '3.2.P.1', operation: 'new' })]);
    expect(await zip.file('index.xml')!.async('string')).not.toContain('modified-file=');
  });
});

describe('an empty section files nothing (sweep F11)', () => {
  const unmapTheDescription = () => pg.query(`DELETE FROM c2c_artifact_section_map WHERE artifact_id = 3`);

  it('ships no leaf for it — no generated placeholder document reaches the agency — and says so', async () => {
    await unmapTheDescription();
    const res = await assemble();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const { zip, bundle } = await storedBundle();
    await assertInternallyConsistent(zip);
    expect(bundle.leafManifest.map((l: any) => l.ctdSection).sort()).toEqual(['1.2', '2.5']);
    expect(bundle.leafManifest.some((l: any) => String(l.leafKey).startsWith('section:'))).toBe(false);
    expect(Object.keys(zip.files).some((n) => n.includes('3-2-p-1'))).toBe(false);
    const findings: Array<{ severity: string; ruleId: string; message: string }> = bundle.validation.findings;
    expect(findings).toContainEqual(expect.objectContaining({
      severity: 'warning', ruleId: 'SECTION-EMPTY', message: expect.stringMatching(/Description and Composition \(3\.2\.P\.1\).*files nothing/),
    }));
    // The summary counts the empty section although nothing ships for it.
    expect(findings.find((f) => f.ruleId === 'SUMMARY')?.message).toMatch(/2 leaf\(s\), 1 empty section\(s\)/);
  });

  it("withdrawing a section's only document files the withdrawal alone, not a placeholder in its place", async () => {
    expect((await assemble()).status).toBe(200);
    await fileTheStoredBundle('original');
    const filed = (await storedMetadata()).filedSequences[0].leaves.find((l: any) => l.ctdSection === '3.2.P.1');
    await unmapTheDescription();
    const res = await assemble({
      sequence: '0001', ...IND_AMENDMENT,
      withdraw: [{ ctdSection: '3.2.P.1', fileName: filed.fileName }],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.bundle.lifecycle.summary).toMatchObject({ new: 0, delete: 1 });
    const { bundle } = await storedBundle();
    expect(bundle.leafManifest).toEqual([expect.objectContaining({ ctdSection: '3.2.P.1', operation: 'delete' })]);
  });
});

describe('per-submission Module 1 documents on an FDA follow-up (sweep F13)', () => {
  it("a revised cover letter files as NEW in the follow-up — sequence 0000's letter is not superseded", async () => {
    expect((await assemble()).status).toBe(200);
    await fileTheStoredBundle('original');
    await pg.query(`UPDATE concept2cure_artifacts SET content = 'We submit sequence 0001.', version = 2, approved_version_id = 2,
      updated_at = '2026-02-03T04:05:06Z' WHERE id = 1`);
    const res = await assemble({ sequence: '0001', ...IND_AMENDMENT });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.bundle.lifecycle.summary).toMatchObject({ new: 1, replace: 0 });
    const { zip, bundle } = await storedBundle();
    expect(bundle.leafManifest).toEqual([expect.objectContaining({ ctdSection: '1.2', operation: 'new' })]);
    expect(await zip.file('m1/us/us-regional.xml')!.async('string')).not.toContain('modified-file=');
  });

  it('an IND follow-up that carries no Form FDA 1571 is blocked, and one with no new cover letter is warned', async () => {
    expect((await assemble()).status).toBe(200);
    await fileTheStoredBundle('original');
    await pg.query(`UPDATE concept2cure_artifacts SET content = 'The overview, version two.', version = 2, approved_version_id = 2,
      updated_at = '2026-02-03T04:05:06Z' WHERE id = 2`);
    const res = await assemble({ sequence: '0001', ...IND_AMENDMENT });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const { bundle } = await storedBundle();
    const byRule = (id: string) => bundle.validation.findings.filter((f: any) => f.ruleId === id);
    expect(byRule('M1-FORM-1571-MISSING')).toEqual([expect.objectContaining({ severity: 'error' })]);
    expect(byRule('M1-COVER-LETTER-MISSING')).toEqual([expect.objectContaining({ severity: 'warning' })]);
  });
});

describe('the identity an FDA follow-up declares (sweep F04, F08)', () => {
  const fileOriginal = async () => {
    expect((await assemble()).status).toBe(200);
    await fileTheStoredBundle('original');
  };
  const reviseOverview = () => pg.query(`UPDATE concept2cure_artifacts SET content = 'The overview, version two.', version = 2,
    approved_version_id = 2, updated_at = '2026-02-03T04:05:06Z' WHERE id = 2`);

  it('an IND amendment declares the activity it continues: Original Application, sub-type Amendment, submission-id 0000', async () => {
    await fileOriginal();
    await reviseOverview();
    const res = await assemble({ sequence: '0001', ...IND_AMENDMENT });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const { zip, bundle } = await storedBundle();
    const us = await zip.file('m1/us/us-regional.xml')!.async('string');
    expect(us).toMatch(/<submission-id submission-type="fdast1">0000<\/submission-id>/);
    expect(us).toMatch(/<sequence-number submission-sub-type="fdasst4">0001<\/sequence-number>/);
    expect(bundle).toMatchObject({
      submissionType: 'Original Application', submissionTypeCode: 'fdast1', submissionSubTypeCode: 'fdasst4', submissionId: '0000',
    });
    await fileTheStoredBundle('ignored', 2);
    expect((await storedMetadata()).filedSequences[1]).toMatchObject({
      submissionTypeCode: 'fdast1', submissionSubTypeCode: 'fdasst4', submissionId: '0000',
    });
  });

  it('REFUSES what an IND cannot file, a word that only resembles a term, and a follow-up that does not say what it is', async () => {
    await fileOriginal();
    await reviseOverview();
    const supplement = await assemble({ sequence: '0001', submissionType: 'Efficacy Supplement', submissionSubType: 'Original' });
    expect(supplement.status, JSON.stringify(supplement.body)).toBe(409);
    expect(supplement.body.code).toBe('SUBMISSION_TYPE_NOT_FOR_APPLICATION');
    const guessed = await assemble({ sequence: '0001', submissionType: 'IND', submissionSubType: 'Amendment', submissionId: '0000' });
    expect(guessed.status, JSON.stringify(guessed.body)).toBe(409);
    expect(guessed.body.code).toBe('SUBMISSION_TYPE_UNKNOWN');
    const unsaid = await assemble({ sequence: '0001', submissionType: 'Original Application' });
    expect(unsaid.status, JSON.stringify(unsaid.body)).toBe(409);
    expect(unsaid.body).toMatchObject({ code: 'SUBMISSION_SUB_TYPE_REQUIRED', acceptedSubmissionSubTypes: expect.arrayContaining(['Amendment']) });
  });
});

describe('a document moved to another CTD section (sweep F12)', () => {
  it('blocks the sequence that files it at the new section while the copy at the old one stays current, naming the withdrawal', async () => {
    expect((await assemble()).status).toBe(200);
    await fileTheStoredBundle('original');
    const old = (await storedMetadata()).filedSequences[0].leaves.find((l: any) => l.ctdSection === '2.5');
    // The clinical overview's declared section is corrected to 2.7.3.
    await pg.query(`UPDATE concept2cure_artifacts SET ctd_section = '2.7.3' WHERE id = 2`);

    const res = await assemble({ sequence: '0001', ...IND_AMENDMENT });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.bundle.lifecycle.summary).toMatchObject({ new: 1, delete: 0 });
    const { bundle } = await storedBundle();
    const relocated = bundle.validation.findings.filter((f: any) => f.ruleId === 'LEAF-RELOCATED-OLD-COPY-CURRENT');
    expect(relocated).toHaveLength(1);
    expect(relocated[0].severity).toBe('error');
    expect(relocated[0].message).toContain(`withdraw: [{ ctdSection: '2.5', fileName: '${old.fileName}' }]`);

    // The move done whole: the new filing and the withdrawal in one sequence.
    const whole = await assemble({
      sequence: '0001', ...IND_AMENDMENT,
      withdraw: [{ ctdSection: '2.5', fileName: old.fileName }],
    });
    expect(whole.status, JSON.stringify(whole.body)).toBe(200);
    expect(whole.body.data.bundle.lifecycle.summary).toMatchObject({ new: 1, delete: 1 });
    const after = (await storedBundle()).bundle;
    expect(after.validation.findings.some((f: any) => f.ruleId === 'LEAF-RELOCATED-OLD-COPY-CURRENT')).toBe(false);
  });
});

/*
 * 2026-10-01 (W5/D7, sweep F19). recordFiledSequence answered `true` for a
 * DIFFERENT bundle sent under a sequence already on file, and kept the first
 * one's inventory: the second send was reported recorded while the history
 * described the other. It now says which of the two happened.
 */
describe('one bundle per filed sequence (sweep F19)', () => {
  it('the same bundle again is already recorded; a different bundle under that number is a conflict, and nothing is written', async () => {
    expect((await assemble()).status).toBe(200);
    const filed = await fileTheStoredBundle('original');
    const again = { sequence: '0000', submissionType: 'original', sha256: filed.sha256, transmittalId: 5, leaves: filed.leafManifest };
    expect(await recordFiledSequence(PKG, again)).toEqual({ outcome: 'already-recorded' });
    const before = await storedMetadata();
    expect(before.filedSequences).toEqual([expect.objectContaining({ sha256: filed.sha256, transmittalId: 1, state: 'transmitted' })]);
    expect(await recordFiledSequence(PKG, { ...again, sha256: 'c'.repeat(64) }))
      .toEqual({ outcome: 'conflict', filed: { sha256: filed.sha256, transmittalId: 1 } });
    expect(await storedMetadata(), 'the conflict wrote nothing').toEqual(before);
  });
});

/*
 * 2026-10-01 (W5/D7, sweep F05, F07b). The packager writes the applicant and
 * its contacts into us-regional.xml, and the assemble route never passed a
 * contact, so no package-spine backbone named one. The route now hands the
 * recorded regulatory contact over; this reads it back out of the real file.
 */
describe('the us-regional backbone names the applicant and its regulatory contact (sweep F05, F07b)', () => {
  it('us-regional.xml carries the D-U-N-S number as <id>, the company name, the six-digit application number and the contact', async () => {
    const res = await assemble();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const { zip, bundle } = await storedBundle();
    expect(bundle.validation.findings.filter((f: any) => f.ruleId === 'REGULATORY-IDENTIFIER-MISSING')).toEqual([]);
    const xml = await zip.file('m1/us/us-regional.xml')!.async('string');
    expect(xml).toContain('<id>123456789</id>');
    expect(xml).toContain('<company-name>Acme Biologics Inc</company-name>');
    expect(xml).toContain('<application-number application-type="fdaat4">123456</application-number>');
    expect(xml).toMatch(
      /<applicant-contacts>\s*<applicant-contact>\s*<applicant-contact-name applicant-contact-type="fdaact1">Jane Q\. Regulatory<\/applicant-contact-name>\s*<telephones>\s*<telephone>\+1 301 555 0100<\/telephone>\s*<\/telephones>\s*<emails>\s*<email>regulatory@acme\.example<\/email>\s*<\/emails>\s*<\/applicant-contact>\s*<\/applicant-contacts>/,
    );
  });
});

/*
 * 2026-10-01 (W5/D7, sweep F19, part 2). A sequence is recorded filed when the
 * gateway accepts the bytes. When the agency then did not load it (a technical
 * rejection), nothing took it off file: its number could never be reused, and
 * the next sequence was planned against content the agency does not hold. The
 * governed action that records the rejection, through the real SQL: the record
 * the assembler then honours, the one transaction a failed write rolls back,
 * the refusals that write nothing, and the rollback that must NOT un-file. Its
 * keying and refusal rules are pinned in
 * server/services/ectd/__tests__/filed-sequence-rejection.test.ts.
 */
const { persistSignature } = vi.hoisted(() => ({ persistSignature: vi.fn() }));
// The signer lookup and the electronic_signatures INSERT are the shared writer's
// own, pinned in its suites; what is asserted here is what it is handed.
vi.mock('../server/services/part11/signature-persistence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../server/services/part11/signature-persistence')>()),
  persistGovernedActionSignature: persistSignature,
}));

const NOTICE = '5f0c2d7a-0b6f-4d1e-9c39-4f0e9a516f10';
const NOTICE_SHA = 'ab'.repeat(32);
const REJECTION_DDL = `
  DROP TABLE IF EXISTS submission_transmittals CASCADE; DROP SCHEMA IF EXISTS vault CASCADE; CREATE SCHEMA vault;
  CREATE TABLE vault.documents (id UUID PRIMARY KEY, organization_id INTEGER NOT NULL, content_hash TEXT NOT NULL, created_by INTEGER, deleted_at TIMESTAMPTZ);
  CREATE TABLE submission_transmittals (
    id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, program_id UUID, package_id INTEGER, parent_transmittal_id INTEGER,
    region TEXT NOT NULL, gateway TEXT NOT NULL, format TEXT NOT NULL, submission_type TEXT, transport TEXT, bundle_path TEXT,
    bundle_sha256 TEXT, bundle_size_bytes BIGINT, transmission_id TEXT, mdn_raw TEXT, status TEXT NOT NULL DEFAULT 'pending',
    http_status INTEGER, error_class TEXT, error_message TEXT, submitted_by INTEGER, submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ack_received_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, metadata JSONB DEFAULT '{}'::jsonb, audit_trail_ref TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  CREATE UNIQUE INDEX sub_trans_active_lock_idx ON submission_transmittals (organization_id, package_id, bundle_sha256)
    WHERE status IN ('pending', 'in_transit', 'received');`;
const rejection = {
  svc: undefined as unknown as typeof import('../server/services/ectd/filed-sequence-rejection'),
  ledger: undefined as unknown as ReturnType<typeof vi.fn>,
};
/** The tables the action reads and writes, the agency's notice in the Vault, and fresh mocks. */
async function setUpRejection() {
  rejection.svc = await import('../server/services/ectd/filed-sequence-rejection');
  rejection.ledger = vi.mocked((await import('../server/routes/c2c/actions')).recordGovernedAction) as unknown as ReturnType<typeof vi.fn>;
  await pg.exec(REJECTION_DDL);
  await pg.query(`INSERT INTO vault.documents (id, organization_id, content_hash) VALUES ($1, $2, $3)`, [NOTICE, ORG, NOTICE_SHA]);
  rejection.ledger.mockReset();
  rejection.ledger.mockImplementation(async () => ({ actionId: 'act_x', auditId: 'aud_x', sha256Chain: 'c' }));
  persistSignature.mockReset();
  persistSignature.mockImplementation(async () => ({ id: 4242, signedAt: new Date('2026-10-01T00:00:00Z') }));
}
/** A production send the gateway accepted: the history entry governed transmit writes, and its transmittal row. */
async function send(id: number, submissionType: string) {
  const filed = await fileTheStoredBundle(submissionType, id);
  await pg.query(
    `INSERT INTO submission_transmittals (id, organization_id, package_id, region, gateway, format, bundle_sha256, status)
     VALUES ($1, $2, $3, 'fda', 'esg', 'ectd', $4, 'received') ON CONFLICT (id) DO UPDATE SET bundle_sha256 = EXCLUDED.bundle_sha256`,
    [id, ORG, PKG, filed.sha256],
  );
  return filed;
}
const revise = (version: number) => pg.query(
  `UPDATE concept2cure_artifacts SET content = $1, version = $2, approved_version_id = $2, updated_at = $3 WHERE id = 2`,
  [`The overview, version ${version}.`, version, `2026-02-0${version}T04:05:06Z`],
);
/** 0000 filed by transmittal 1, then 0001 (a revised overview) by transmittal 2. */
async function fileTwoSequences() {
  expect((await assemble()).status).toBe(200);
  await send(1, 'original');
  await revise(2);
  expect((await assemble({ sequence: '0001', ...IND_AMENDMENT })).status).toBe(200);
  const sent = await send(2, 'Efficacy Supplement');
  rejection.ledger.mockClear(); // the assemblies' own ledger rows are not the action's
  return sent;
}
const reject = (transmittalId: number, over: Record<string, unknown> = {}) => rejection.svc.recordFiledSequenceRejection({
  orgId: ORG, transmittalId, actorUserId: 777, meaning: 'responsibility', reason: 'FDA technical rejection notice: Ack3 failed',
  evidenceDocumentId: NOTICE, authenticationMethod: 'password', secondFactorVerified: false, ipAddress: '127.0.0.1',
  reauthVerifiedAt: new Date(), ...over,
});
/** Everything the action may write: the package's metadata and every transmittal row. */
const everything = async () => ({
  metadata: await storedMetadata(),
  transmittals: (await pg.query(`SELECT id, status, error_class, error_message, metadata FROM submission_transmittals ORDER BY id`)).rows,
});

describe('an agency technical rejection takes a filed sequence off file (sweep F19)', () => {
  beforeEach(setUpRejection);

  it('records it with the notice and a signature bound to it; the number is reused, planned against 0000', async () => {
    const sent = await fileTwoSequences();
    expect(await reject(2)).toMatchObject({
      sequence: '0001', transmittalId: 2, bundleSha256: sent.sha256, staleBundleCleared: null, actionId: 'act_x', signatureId: 4242,
      transmittalStatus: { previous: 'received', current: 'validation_failed' }, evidence: { vaultDocumentId: NOTICE, contentSha256: NOTICE_SHA },
    });
    const { metadata, transmittals } = await everything();
    expect(metadata.filedSequences.map((e: any) => [e.sequence, e.transmittalId, e.state])).toEqual([['0000', 1, 'transmitted'], ['0001', 2, 'rejected']]);
    expect(metadata.filedSequences[1].rejection).toMatchObject({ recordedBy: 777, signatureId: 4242, evidence: { contentSha256: NOTICE_SHA } });
    expect(transmittals[1]).toMatchObject({
      status: 'validation_failed', error_class: 'validation', metadata: { technicalRejection: { sequence: '0001', actionId: 'act_x' } },
    });
    expect(rejection.ledger).toHaveBeenCalledTimes(1);
    expect(persistSignature).toHaveBeenCalledTimes(1);
    // 0001 is free again, and its replace names what the agency holds: 0000.
    const res = await assemble({ sequence: '0001', ...IND_AMENDMENT });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.bundle.lifecycle.summary).toMatchObject({ replace: 1, unchanged: 2 });
    const pointer = String(/modified-file="([^"]+)"/.exec(await (await storedBundle()).zip.file('index.xml')!.async('string'))?.[1]);
    expect(path.posix.normalize(path.posix.join('0001', pointer.split('#')[0])).startsWith('0000/'), pointer).toBe(true);
  });

  it.each(['signature', 'ledger'] as const)('when the %s write fails, nothing is un-filed', async (which) => {
    await fileTwoSequences();
    const before = await everything();
    (which === 'signature' ? persistSignature : rejection.ledger).mockRejectedValueOnce(new Error(`${which} write failed`));
    await expect(reject(2)).rejects.toThrow(`${which} write failed`);
    expect(await everything()).toEqual(before);
  });

  it('clears a stored bundle planned on top of the rejected sequence, with its preflight', async () => {
    await fileTwoSequences();
    await revise(3);
    expect((await assemble({ sequence: '0002', ...IND_AMENDMENT })).status).toBe(200);
    await pg.query(`UPDATE c2c_submission_packages SET metadata = (metadata::jsonb || '{"preflight":{"errorCount":0}}')::json WHERE id = $1`, [PKG]);
    const stale = (await storedMetadata()).bundle;
    expect((await reject(2)).staleBundleCleared).toEqual({ sequence: '0002', sha256: stale.sha256 });
    const after = await storedMetadata();
    expect([after.bundle, after.preflight]).toEqual([undefined, undefined]);
  });

  it('refuses an earlier sequence, and a notice not in this organization’s Vault, writing nothing', async () => {
    await fileTwoSequences();
    const [other, deleted] = ['6a1d3e8b-1c7a-4e2f-8d40-5a1f0b627e21', '7b2e4f9c-2d8b-4f30-9e51-6b2a1c738f32'];
    await pg.query(`INSERT INTO vault.documents (id, organization_id, content_hash, deleted_at) VALUES ($1, 100, $3, NULL), ($2, $4, $3, NOW())`, [other, deleted, NOTICE_SHA, ORG]);
    const before = await everything();
    await expect(reject(1)).rejects.toMatchObject({ code: 'NOT_LATEST_FILED_SEQUENCE' });
    await expect(reject(2, { evidenceDocumentId: other })).rejects.toMatchObject({ code: 'EVIDENCE_NOT_FOUND' });
    await expect(reject(2, { evidenceDocumentId: deleted })).rejects.toMatchObject({ code: 'EVIDENCE_NOT_FOUND' });
    expect(await everything()).toEqual(before);
    expect(persistSignature).not.toHaveBeenCalled();
  });

  it('a rollback does NOT un-file: the agency still holds rolled-back bytes (pinned)', async () => {
    await fileTwoSequences();
    const { rollbackTransmittal } = await import('../server/services/submission-gateways/fda-esg');
    await rollbackTransmittal({
      transmittalId: 2, organizationId: ORG, actorUserId: 777,
      reason: 'Wrong sequence shipped; retracting at the agency', recordGovernedAction: rejection.ledger as any,
    });
    const { metadata, transmittals } = await everything();
    expect(transmittals[1].status).toBe('rolled_back');
    expect(metadata.filedSequences.map((e: any) => [e.sequence, e.state])).toEqual([['0000', 'transmitted'], ['0001', 'transmitted']]);
    const res = await assemble({ sequence: '0001', ...IND_AMENDMENT });
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.code).toBe('SEQUENCE_ALREADY_FILED');
  });
});
