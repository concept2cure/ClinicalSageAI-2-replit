/**
 * A Trial Master File belongs to a study of a project (eTMF convergence E2;
 * founder decisions P-74 and P-75; docs/design/ETMF_CONVERGENCE_2026-10-30.md).
 *
 * The defect: `tmf_artifact_filings` keyed a trial by `trial_id`, free text a
 * person typed, bound to nothing. Any member of the organization could read
 * and write any trial name, whatever project it was meant for, and a filing
 * could reference a document of another project.
 *
 * Here, on PostgreSQL as the runtime role with RLS on, through the mounted
 * /api/etmf router and the Vault's own project admission:
 *
 *   - the trial a route names is a study as GET /api/study-design lists it
 *     (its `studyId`), and the completeness answer says which study it is;
 *   - a name that is no study of the caller's organization, a study with no
 *     project, or a study in a project the caller cannot open is 404
 *     STUDY_NOT_FOUND on every route, and nothing is written;
 *   - a filing stores the study (study_ref) and the study's own id string
 *     (trial_id), so the unique key still holds one row per study and artifact;
 *   - a row filed before this, with no study, is served as no study's filing
 *     even when its free text equals a study's id;
 *   - a filing's Vault document must be a live document of the study's own
 *     project (409 DOCUMENT_NOT_IN_PROJECT otherwise);
 *   - the database holds a filing's study to the filing's own organization.
 *
 * The rate limiter is replaced by a pass-through: it is not what is under test.
 */
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import JSZip from 'jszip';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import { assertVaultFixtureDatabase, assertVaultFixtureRuntime, closeVaultFixtureRuntime, seedVaultFixtureParent } from './vault-current-access-fixture';
import { nativeCatalogRunId } from './catalog-native-fixture';

vi.mock('../../server/middleware/rateLimiter', () => ({
  createRateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  default: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const RUN = nativeCatalogRunId();
const PROBE = `dbtest-etmf-study-${RUN}`;
const REASON = 'Filed for the study binding proof.';

type Tenant = { orgId: number; orgUuid: string };
type Actor = Tenant & { userId: number; role: string };
type Study = { id: number; studyId: string };

let owner: Pool;
let mine: Tenant;
let theirs: Tenant;
let lead: Actor; // organization admin: owns every project of `mine`
let member: Actor; // organization member: shared on project A only
let outsider: Actor; // admin of the other organization
let progA: string;
let progB: string;
let progC: string;
let progT: string;
let studyA: Study;
let studyB: Study;
let studyT: Study;
let studyNoProject: Study;
let docA: string;
let docA2: string;
let docB: string;
let docC: string;
let docT: string;

async function appFor(actor: Actor): Promise<express.Express> {
  const etmf = (await import('../../server/routes/etmf.routes')).default;
  const studyDesign = (await import('../../server/routes/study-design')).default;
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const { expandRoleClaims } = await import('../../server/middleware/auth');
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    Object.assign(req, {
      userId: actor.userId, tenantId: actor.orgId, userRole: actor.role,
      user: { id: actor.userId, organizationId: actor.orgId, organizationUuid: actor.orgUuid, role: actor.role, roles: expandRoleClaims(actor.role, undefined) },
    });
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/etmf', etmf);
  a.use('/api/study-design', studyDesign);
  return a;
}
const as = async (actor: Actor) => request(await appFor(actor));
const trial = (study: Study) => `/api/etmf/trials/${encodeURIComponent(study.studyId)}`;

async function tenant(slug: string): Promise<Tenant> {
  const org = await owner.query(
    `INSERT INTO organizations (name, slug, status) VALUES ($1, $2, 'active') RETURNING id, uuid`,
    [`${PROBE} ${slug}`, `${PROBE}-${slug}`],
  );
  return { orgId: Number(org.rows[0].id), orgUuid: String(org.rows[0].uuid) };
}

async function user(slug: string): Promise<number> {
  const made = await owner.query(
    `INSERT INTO users (email, name, password_hash, status) VALUES ($1, $2, 'not-a-real-hash', 'active') RETURNING id`,
    [`${PROBE}-${slug}@example.test`, `TMF ${slug}`],
  );
  return Number(made.rows[0].id);
}

/** A project with its one tracking record, private, owned by `ownerId` (made an organization admin by the fixture). */
async function program(t: Tenant, name: string, ownerId: number): Promise<string> {
  const prog = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Trialium 5mg') RETURNING id`,
    [`${PROBE} ${name}`, `${PROBE}-${name}`.toUpperCase(), t.orgId],
  );
  const programId = String(prog.rows[0].id);
  await seedVaultFixtureParent(owner, { ...t, programId }, { userId: ownerId, namespace: `${PROBE}-${name}-parent` });
  return programId;
}

async function study(t: Tenant, programId: string | null, suffix: string): Promise<Study> {
  const studyId = `${PROBE}-${suffix}`;
  const { rows } = await owner.query(
    `INSERT INTO cdisc_prm_studies (tenant_id, study_id, program_id, protocol_id, protocol_title, protocol_version, study_phase, indication)
     VALUES ($1, $2, $3, $4, $5, '1.0', 'Phase II', 'Hypertension') RETURNING id`,
    [t.orgId, studyId, programId, `PROT-${suffix}`, `Study ${suffix} of the binding proof`],
  );
  return { id: Number(rows[0].id), studyId };
}

/** A Vault document row. `as` sets what a version of a family differs by; by default a document of its own, version 1.0. */
async function vaultDocument(t: Tenant, programId: string, createdBy: number,
  as: { code?: string; title?: string; version?: string; fileName?: string; supersedes?: string } = {}): Promise<string> {
  const id = randomUUID();
  const code = as.code ?? `TMF-${id}`;
  await owner.query(
    `INSERT INTO vault.documents (id, program_id, organization_id, document_code, document_title, document_type, version,
       file_name, file_size, mime_type, content_hash, s3_bucket, s3_key, created_by, supersedes_id)
     VALUES ($1, $2, $3, $4::text, $5::text, 'PROTOCOL', $6, $7, 1, 'application/pdf', $8, 'synthetic-local', 'synthetic-key', $9, $10)`,
    // One content hash per document: a project holds a given content once.
    [id, programId, t.orgId, code, as.title ?? code, as.version ?? '1.0', as.fileName ?? 'synthetic-protocol.pdf',
      createHash('sha256').update(id).digest('hex'), createdBy, as.supersedes ?? null],
  );
  return id;
}

const filingRows = async (orgId: number, trialId: string) =>
  (await owner.query(
    'SELECT id, organization_id, trial_id, artifact_code, document_ref, study_ref FROM tmf_artifact_filings WHERE organization_id = $1 AND trial_id = $2 ORDER BY artifact_code',
    [orgId, trialId],
  )).rows;

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await assertVaultFixtureDatabase(owner);
  mine = await tenant('mine');
  theirs = await tenant('theirs');
  const leadId = await user('lead');
  const memberId = await user('member');
  const outsiderId = await user('outsider');
  progA = await program(mine, 'alpha', leadId);
  progB = await program(mine, 'beta', leadId);
  progC = await program(mine, 'gamma', leadId);
  progT = await program(theirs, 'theirs', outsiderId);
  lead = { ...mine, userId: leadId, role: 'admin' };
  outsider = { ...theirs, userId: outsiderId, role: 'admin' };
  // The member belongs to the organization and is shared (edit) on project A only.
  await owner.query("INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'member')", [mine.orgId, memberId]);
  const shared = await owner.query(
    `INSERT INTO project_members (project_id, organization_id, user_id, role, status, invited_by_id)
     SELECT id, organization_id, $3, 'edit', 'active', $4 FROM projects
      WHERE organization_id = $1 AND regulatory_program_id = $2 RETURNING project_id`,
    [mine.orgId, progA, memberId, leadId],
  );
  expect(shared.rows).toHaveLength(1);
  member = { ...mine, userId: memberId, role: 'member' };
  await assertVaultFixtureRuntime({ ...mine, programId: progA });

  studyA = await study(mine, progA, 'A');
  studyB = await study(mine, progB, 'B');
  studyT = await study(theirs, progT, 'T');
  studyNoProject = await study(mine, null, 'NOPROJECT');
  docA = await vaultDocument(mine, progA, leadId);
  docA2 = await vaultDocument(mine, progA, leadId);
  docB = await vaultDocument(mine, progB, leadId);
  docC = await vaultDocument(mine, progC, leadId);
  docT = await vaultDocument(theirs, progT, outsiderId);
}, 90_000);

afterAll(async () => {
  // Keep this invocation's records and append-only history.
  try { await closeVaultFixtureRuntime(); }
  finally { await owner?.end(); }
});

describe('the trial a route names is a study of the open project', () => {
  it('takes the studyId that GET /api/study-design lists, and says which study the answer is about', async () => {
    const listed = await (await as(lead)).get(`/api/study-design?program_id=${progA}`);
    expect(listed.status, JSON.stringify(listed.body)).toBe(200);
    const design = listed.body.designs.find((d: { studyId: string }) => d.studyId === studyA.studyId);
    expect(design).toMatchObject({ studyId: studyA.studyId, programId: progA, title: 'Study A of the binding proof', phase: 'Phase II' });

    const res = await (await as(lead)).get(`/api/etmf/trials/${encodeURIComponent(design.studyId)}/completeness?scope=essential`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    // The same names the list shows, with the row id and the protocol id.
    expect(res.body.study).toEqual({
      id: studyA.id, studyId: studyA.studyId, programId: progA, protocolId: 'PROT-A',
      title: design.title, phase: design.phase, indication: design.indication, status: design.status,
    });
    // The assessment keeps its shape.
    expect(res.body).toMatchObject({ ready: false, basis: 'verified_documents', scope: 'essential' });
    expect(res.body.zones).toHaveLength(11);
    expect(res.body.summary.totalMissing).toBeGreaterThan(0);
  });

  it('refuses a name that is no study the caller can open, on every route, and writes nothing', async () => {
    const refused: Array<[string, Actor, string]> = [
      ['a name no study has', lead, `${PROBE}-NO-SUCH-STUDY`],
      ['free text of the kind that used to be typed', lead, 'T-1'],
      ["the study's row id, which is not its name", lead, String(studyA.id)],
      ["another organization's study", lead, studyT.studyId],
      ['a study with no project', lead, studyNoProject.studyId],
      ['a study in a project the caller cannot open', member, studyB.studyId],
    ];
    for (const [what, actor, name] of refused) {
      const base = `/api/etmf/trials/${encodeURIComponent(name)}`;
      const calls = [
        (await as(actor)).get(`${base}/artifacts`),
        (await as(actor)).get(`${base}/completeness`),
        (await as(actor)).get(`${base}/inspection-package`),
        (await as(actor)).post(`${base}/artifacts`).send({ artifactCode: 'protocol', documentRef: `vault://${docA}`, reason: REASON }),
        (await as(actor)).post(`${base}/artifacts/bulk`).send({ artifacts: [{ artifactCode: 'protocol' }], reason: REASON }),
      ];
      for (const call of calls) {
        const res = await call;
        expect(res.status, `${what}: ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`).toBe(404);
        expect(res.body).toMatchObject({ success: false, error: 'STUDY_NOT_FOUND' });
        expect(typeof res.body.message).toBe('string');
      }
      expect(await filingRows(actor.orgId, name), what).toEqual([]);
    }
  }, 60_000);

  it('lets a member shared on the project read and file its study, and no other project\'s', async () => {
    const filed = await (await as(member)).post(`${trial(studyA)}/artifacts`).send({ artifactCode: 'investigators_brochure', documentRef: `vault://${docA}`, reason: REASON });
    expect(filed.status, JSON.stringify(filed.body)).toBe(201);
    expect(filed.body).toMatchObject({ organizationId: mine.orgId, createdBy: member.userId, studyRef: studyA.id, trialId: studyA.studyId });
    const listed = await (await as(member)).get(`${trial(studyA)}/artifacts`);
    expect(listed.status).toBe(200);
    expect(listed.body.map((f: { artifactCode: string }) => f.artifactCode)).toContain('investigators_brochure');
    expect((await (await as(lead)).get(`${trial(studyB)}/artifacts`)).status).toBe(200);
    expect((await (await as(member)).get(`${trial(studyB)}/artifacts`)).status).toBe(404);
  });
});

describe('a filing is bound to its study', () => {
  it('stores the study and the study\'s own id string, one row per study and artifact', async () => {
    const first = await (await as(lead)).post(`${trial(studyA)}/artifacts`).send({ artifactCode: 'protocol', documentRef: `vault://${docA}`, reason: REASON });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body).toMatchObject({ studyRef: studyA.id, trialId: studyA.studyId, artifactCode: 'protocol', zoneNumber: 2, documentRef: `vault://${docA}` });
    const again = await (await as(lead)).post(`${trial(studyA)}/artifacts`).send({ artifactCode: 'protocol', documentRef: `vault://${docA2}`, reason: REASON });
    expect(again.status).toBe(201);
    expect(again.body.id).toBe(first.body.id);
    const stored = (await filingRows(mine.orgId, studyA.studyId)).filter((r) => r.artifact_code === 'protocol');
    expect(stored).toEqual([{ id: first.body.id, organization_id: mine.orgId, trial_id: studyA.studyId, artifact_code: 'protocol',
      document_ref: `vault://${docA2}`, study_ref: studyA.id }]);
  });

  it('never serves a row with no study as a study\'s filing, even when its free text equals the study\'s id', async () => {
    // A row as they were filed before 2026-11-10: free text, no study.
    const legacy = await owner.query(
      `INSERT INTO tmf_artifact_filings (organization_id, trial_id, artifact_code, zone_number, document_ref, created_by)
       VALUES ($1, $2, 'sample_icf', 2, 'typed-by-hand-reference', $3) RETURNING id`,
      [mine.orgId, studyA.studyId, lead.userId],
    );
    const legacyId = String(legacy.rows[0].id);
    const listed = await (await as(lead)).get(`${trial(studyA)}/artifacts`);
    expect(listed.status).toBe(200);
    expect(listed.body.map((f: { id: string }) => f.id)).not.toContain(legacyId);
    expect(listed.body.every((f: { studyRef: number }) => f.studyRef === studyA.id)).toBe(true);
    const assessed = await (await as(lead)).get(`${trial(studyA)}/completeness`);
    const zone2 = assessed.body.zones.find((z: { number: number }) => z.number === 2);
    expect(zone2.missing).toContain('sample_icf');
    // Not even as "filed but unverified": it is not this study's filing at all.
    expect(zone2.unverified.map((u: { code: string }) => u.code)).not.toContain('sample_icf');
    expect(assessed.body.documentEvidence.sample_icf).toBeUndefined();
    // It cannot be removed through the study's routes either: it belongs to no study.
    const removed = await (await as(lead)).delete(`/api/etmf/artifacts/${legacyId}`).send({ reason: REASON });
    expect(removed.status).toBe(404);
    expect((await owner.query('SELECT study_ref, document_ref FROM tmf_artifact_filings WHERE id = $1', [legacyId])).rows)
      .toEqual([{ study_ref: null, document_ref: 'typed-by-hand-reference' }]);

    // Filing the artifact for the study takes that row's place: the unique key holds, and the row is now the study's.
    const filed = await (await as(lead)).post(`${trial(studyA)}/artifacts`).send({ artifactCode: 'sample_icf', documentRef: `vault://${docA}`, reason: REASON });
    expect(filed.status, JSON.stringify(filed.body)).toBe(201);
    const stored = (await filingRows(mine.orgId, studyA.studyId)).filter((r) => r.artifact_code === 'sample_icf');
    expect(stored).toEqual([{ id: legacyId, organization_id: mine.orgId, trial_id: studyA.studyId, artifact_code: 'sample_icf',
      document_ref: `vault://${docA}`, study_ref: studyA.id }]);
  });

  it('holds a filing\'s study to the filing\'s own organization, in the database', async () => {
    await expect(owner.query(
      `INSERT INTO tmf_artifact_filings (organization_id, trial_id, artifact_code, study_ref) VALUES ($1, $2, 'protocol', $3)`,
      [mine.orgId, `${PROBE}-foreign-study`, studyT.id],
    )).rejects.toMatchObject({ code: '23503', constraint: 'tmf_artifact_filings_study_same_org_fk' });
  });

  it('keeps a filing on record, detached, when its study design is deleted', async () => {
    const gone = await study(mine, progA, 'DELETED');
    const filed = await (await as(lead)).post(`${trial(gone)}/artifacts`).send({ artifactCode: 'protocol', documentRef: `vault://${docA}`, reason: REASON });
    expect(filed.status, JSON.stringify(filed.body)).toBe(201);
    await owner.query('DELETE FROM cdisc_prm_studies WHERE id = $1', [gone.id]);
    expect(await filingRows(mine.orgId, gone.studyId)).toMatchObject([{ id: filed.body.id, study_ref: null, document_ref: `vault://${docA}` }]);
    expect((await (await as(lead)).get(`${trial(gone)}/artifacts`)).status).toBe(404);
  });
});

describe('a filing\'s Vault document belongs to the study\'s project', () => {
  it('refuses a document of another project, absent, or of another organization, with one code, and writes nothing', async () => {
    const elsewhere: Array<[string, string]> = [
      ['a document of another project the caller can open', docC],
      ["a document of another project of the organization", docB],
      ["another organization's document", docT],
      ['an id no document has', randomUUID()],
    ];
    for (const [what, id] of elsewhere) {
      const res = await (await as(lead)).post(`${trial(studyA)}/artifacts`).send({ artifactCode: 'sample_crf', documentRef: `vault://${id}`, reason: REASON });
      expect(res.status, `${what}: ${JSON.stringify(res.body)}`).toBe(409);
      expect(res.body).toMatchObject({ success: false, error: 'DOCUMENT_NOT_IN_PROJECT' });
      // The answer does not say which of the four it was.
      expect(res.body.message).toBe((await (await as(lead)).post(`${trial(studyA)}/artifacts`)
        .send({ artifactCode: 'sample_crf', documentRef: `vault://${randomUUID()}`, reason: REASON })).body.message);
    }
    expect((await filingRows(mine.orgId, studyA.studyId)).map((r) => r.artifact_code)).not.toContain('sample_crf');
  });

  it('still refuses a path built from the trial and the artifact code', async () => {
    const res = await (await as(lead)).post(`${trial(studyA)}/artifacts`).send({ artifactCode: 'sample_crf', documentRef: `vault://${studyA.studyId}/sample_crf`, reason: REASON });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, error: 'UNRESOLVABLE_DOCUMENT_REF' });
  });

  it('reports each item of a batch, and files only what is in the project', async () => {
    const res = await (await as(lead)).post(`${trial(studyB)}/artifacts/bulk`).send({ reason: REASON, artifacts: [
      { artifactCode: 'protocol', documentRef: `vault://${docB}` },
      { artifactCode: 'investigators_brochure', documentRef: `vault://${docA}` },
      { artifactCode: 'not-a-code' },
    ] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ filed: 1, total: 3, results: [
      { artifactCode: 'protocol', ok: true },
      { artifactCode: 'investigators_brochure', ok: false, error: 'DOCUMENT_NOT_IN_PROJECT' },
      { artifactCode: 'not-a-code', ok: false, error: 'UNKNOWN_ARTIFACT' },
    ] });
    expect(await filingRows(mine.orgId, studyB.studyId)).toMatchObject([{ artifact_code: 'protocol', document_ref: `vault://${docB}`, study_ref: studyB.id }]);
  });

  it('counts a filing as verified only while its document is a live document of the study\'s project', async () => {
    // A row whose reference names another project's document cannot be made through the route; laid here by the owner.
    await owner.query(
      `INSERT INTO tmf_artifact_filings (organization_id, trial_id, artifact_code, zone_number, document_ref, study_ref)
       VALUES ($1, $2, 'sample_crf', 2, $3, $4)`,
      [mine.orgId, studyB.studyId, `vault://${docC}`, studyB.id],
    );
    const res = await (await as(lead)).get(`${trial(studyB)}/completeness`);
    expect(res.status).toBe(200);
    expect(res.body.documentEvidence).toMatchObject({ protocol: 'verified', sample_crf: 'unresolved' });
  });
});

describe('the inspection package is the study\'s', () => {
  it('names the study in its manifest and its file name, and lists only the study\'s filings', async () => {
    const res = await (await as(lead)).get(`${trial(studyB)}/inspection-package?scope=essential`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/zip/);
    expect(res.headers['content-disposition']).toBe(`attachment; filename="tmf-inspection-${studyB.studyId}.zip"`);
    const zip = await JSZip.loadAsync(res.body as Buffer);
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(manifest).toMatchObject({ trialId: studyB.studyId, organizationId: mine.orgId,
      study: { id: studyB.id, studyId: studyB.studyId, protocolId: 'PROT-B', programId: progB } });
    const index = (await zip.file('inspection-index.csv')!.async('string')).trim().split('\n').slice(1).map((l) => l.split(',')[1]);
    expect(index.sort()).toEqual(['protocol', 'sample_crf']);
  });
});

describe('a filing is removed only by someone who can write its study\'s project', () => {
  it('answers 404 for a filing of a project the caller cannot open, and leaves it', async () => {
    const [filing] = (await filingRows(mine.orgId, studyB.studyId)).filter((r) => r.artifact_code === 'protocol');
    const refused = await (await as(member)).delete(`/api/etmf/artifacts/${filing.id}`).send({ reason: REASON });
    expect(refused.status).toBe(404);
    expect(refused.body).toMatchObject({ success: false, error: 'NOT_FOUND' });
    const foreign = await (await as(outsider)).delete(`/api/etmf/artifacts/${filing.id}`).send({ reason: REASON });
    expect(foreign.status).toBe(404);
    expect((await owner.query('SELECT 1 FROM tmf_artifact_filings WHERE id = $1', [filing.id])).rows).toHaveLength(1);
    const removed = await (await as(lead)).delete(`/api/etmf/artifacts/${filing.id}`).send({ reason: REASON });
    expect(removed.status).toBe(204);
    expect((await (await as(lead)).get(`${trial(studyB)}/artifacts`)).body.map((f: { id: string }) => f.id)).not.toContain(filing.id);
  });
});

describe('the list says what each filing\'s document is (E3b)', () => {
  it('names each Vault document of the study\'s project, and gives null for any other reference', async () => {
    const studyC = await study(mine, progC, 'C');
    const code = `${PROBE}-CSR`;
    const first = await vaultDocument(mine, progC, lead.userId, { code, title: 'Clinical study report', version: '1.0' });
    const second = await vaultDocument(mine, progC, lead.userId, { code, title: 'Clinical study report', version: '2.0', supersedes: first });
    const untitled = await vaultDocument(mine, progC, lead.userId, { title: '', fileName: 'monitoring-plan-signed.pdf' });
    const deleted = await vaultDocument(mine, progC, lead.userId, { title: 'Deleted after filing' });
    const file = async (artifactCode: string, documentRef?: string) => {
      const res = await (await as(lead)).post(`${trial(studyC)}/artifacts`).send({ artifactCode, documentRef, reason: REASON });
      expect(res.status, `${artifactCode}: ${JSON.stringify(res.body)}`).toBe(201);
    };
    await file('protocol', `vault://${first}`);
    await file('investigators_brochure', `vault://${second}`);
    await file('monitoring_plan', `vault://${untitled}`);
    await file('regulatory_submission', `vault://${deleted}`);
    await file('sample_icf', 'https://sponsor.example/tmf/icf.pdf');
    await file('insurance');
    await owner.query('UPDATE vault.documents SET deleted_at = now() WHERE id = $1', [deleted]);
    // References the route refuses, laid by the owner: another project's document, and another organization's.
    await owner.query(
      `INSERT INTO tmf_artifact_filings (organization_id, trial_id, artifact_code, zone_number, document_ref, study_ref)
       VALUES ($1, $2, 'sample_crf', 2, $3, $5), ($1, $2, 'tmf_plan', 1, $4, $5)`,
      [mine.orgId, studyC.studyId, `vault://${docA}`, `vault://${docT}`, studyC.id],
    );

    const res = await (await as(lead)).get(`${trial(studyC)}/artifacts`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const documentOf = Object.fromEntries(res.body.map((f: { artifactCode: string; document: unknown }) => [f.artifactCode, f.document]));
    expect(documentOf).toEqual({
      // The first version has a live successor: named, and not the current version.
      protocol: { id: first, title: 'Clinical study report', version: '1.0', current: false },
      investigators_brochure: { id: second, title: 'Clinical study report', version: '2.0', current: true },
      // No title: the file name, which is the document's own.
      monitoring_plan: { id: untitled, title: 'monitoring-plan-signed.pdf', version: '1.0', current: true },
      // Deleted since, off-platform, no reference, another project's, another organization's: no document, no guess.
      regulatory_submission: null,
      sample_icf: null,
      insurance: null,
      sample_crf: null,
      tmf_plan: null,
    });
    // The filing's own fields are as they were, and nothing of another project's document is in the answer.
    expect(res.body.find((f: { artifactCode: string }) => f.artifactCode === 'sample_crf')).toMatchObject({ documentRef: `vault://${docA}`, studyRef: studyC.id });
    expect(JSON.stringify(res.body)).not.toContain(`TMF-${docA}`);
    expect(JSON.stringify(res.body)).not.toContain(`TMF-${docT}`);
  });

  it('follows the document: a version added later makes the filed one no longer current', async () => {
    const studyD = await study(mine, progC, 'D');
    const code = `${PROBE}-SAP`;
    const v1 = await vaultDocument(mine, progC, lead.userId, { code, title: 'Statistical analysis plan', version: '1.0' });
    const filed = await (await as(lead)).post(`${trial(studyD)}/artifacts`).send({ artifactCode: 'sap', documentRef: `vault://${v1}`, reason: REASON });
    expect(filed.status, JSON.stringify(filed.body)).toBe(201);
    const before = await (await as(lead)).get(`${trial(studyD)}/artifacts`);
    expect(before.body.map((f: { document: unknown }) => f.document)).toEqual([{ id: v1, title: 'Statistical analysis plan', version: '1.0', current: true }]);
    await vaultDocument(mine, progC, lead.userId, { code, title: 'Statistical analysis plan', version: '2.0', supersedes: v1 });
    const after = await (await as(lead)).get(`${trial(studyD)}/artifacts`);
    expect(after.body.map((f: { document: unknown }) => f.document)).toEqual([{ id: v1, title: 'Statistical analysis plan', version: '1.0', current: false }]);
  });
});
