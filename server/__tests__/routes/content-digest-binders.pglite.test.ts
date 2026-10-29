/**
 * A labeling approval and a residual-risk acceptance bind the content they sign
 * (D5, 21 CFR Part 11 §11.70; docs/evidence/D5-CONTENT-DIGEST-BINDERS/2026-10-29/).
 *
 * Until 2026-10-29 the three acts on `labeling-document:<id>`,
 * `labeling-translation:<id>` and `risk-item:<id>` went through
 * signGovernedAct with no content binder registered for their prefix, so
 * deriveGovernedTargetBinding fell back and the signature bound the ledger's
 * chain hash, with that basis named. Nothing tied the signature to the label
 * or the hazard, so an edit after signing (a symbol added to an approved
 * label, the benefit-risk rationale rewritten after the acceptance) could not
 * be told apart from the record that was signed.
 *
 * Runs for real, on an in-process PGlite: the labeling and risk routers and
 * their SQL, the ceremony (signGovernedAct), persistGovernedSignSignature with
 * the content binders, resolveSignerIdentity and the electronic_signatures
 * INSERT. Stubbed at their module boundaries: the password check, the signer's
 * role, the tenant context and the ledger pair (which returns a fixed chain
 * hash, so the test can see it kept on the manifest).
 *
 * Each digest is recomputed here from the record by the documented recipe, as
 * an inspector would, so the list of attested fields is pinned field by field.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { canonicalJson, manifestSignatureHash } from '../../services/part11/signature-persistence';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const ORG = 7;
const AUTHOR = 3;
const SIGNER = 5;
const GOOD = 'correct horse battery staple';
const SIGNATURE = { meaning: 'approval', reason: 'Checked against the design output and the risk file', password: GOOD };
const WITHDRAWAL = 'The German artwork changed after review; re-review it';
/** The chain hash the stubbed ledger returns: kept on the manifest beside the content digest. */
const CHAIN = 'c'.repeat(64);

const h = vi.hoisted(() => ({
  pg: null as unknown as { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; affectedRows?: number }> },
  log: [] as string[],
  ledger: 0,
}));

const conn = {
  query: async (sql: string, params: unknown[] = []) => {
    const word = sql.trim().split(/\s+/)[0].toUpperCase();
    if (word === 'BEGIN' || word === 'COMMIT' || word === 'ROLLBACK') h.log.push(word);
    const r = await h.pg.query(sql, params);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  },
  release: () => undefined,
};

vi.mock('../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => conn.query(s, p), connect: async () => conn }, getPool: () => conn, db: {} }));
vi.mock('../../db.js', () => ({ pool: { query: (s: string, p?: unknown[]) => conn.query(s, p), connect: async () => conn }, getPool: () => conn, db: {} }));
vi.mock('../../db/requestDb', async (orig) => ({ ...(await orig<Record<string, unknown>>()), requestPgClient: () => conn }));
vi.mock('../../middleware/signing-attempt-limiter', () => ({
  signingAttemptLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../services/tenant/governed-tenant-context', () => ({ setTenantContextTx: async () => undefined }));
vi.mock('../../services/part11/reverify-signer', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  reverifySigner: async (_u: number, creds: { password?: string }) => (creds.password === GOOD
    ? { ok: true, authenticationMethod: 'password', secondFactorVerified: false }
    : { ok: false, status: 401, code: 'PASSWORD_VERIFICATION_FAILED', error: 'The password was not accepted.' }),
}));
vi.mock('../../services/part11/reverify-signer-deps', () => ({ signerReverificationDeps: () => ({}) }));
vi.mock('../../services/part11/resolve-signer-role', () => ({ resolveSignerOrgRole: async () => 'approver' }));
vi.mock('../../routes/c2c/actions', () => ({
  recordGovernedAction: async (_c: unknown, p: { command: string; target: string }) => {
    h.ledger += 1;
    h.log.push(`LEDGER:${p.command}:${p.target}`);
    return { actionId: `act_${h.ledger}`, auditId: `aud_${h.ledger}`, sha256Chain: CHAIN };
  },
}));

import labelingRouter from '../../routes/mdx-labeling';
import riskRouter from '../../routes/mdx-risk-management';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: SIGNER, organizationId: ORG, role: 'member' };
    next();
  });
  a.use('/api/mdx', labelingRouter);
  a.use('/api/mdx', riskRouter);
  return a;
}

type Row = Record<string, any>;
const one = async (sql: string, params: unknown[] = []): Promise<Row> => (await h.pg.query(sql, params)).rows[0];
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
/** The recipe an inspector re-derives: sha256 over the canonical JSON (keys sorted). */
const digestOf = (content: unknown) => sha256(canonicalJson(content));

/** Every signature row on a target, oldest first. */
const signaturesOn = async (target: string) => (await h.pg.query(
  `SELECT id, binding_basis, bound_payload_digest, signature_manifest, signature_hash, signer_name
     FROM electronic_signatures WHERE organization_id = $1 AND signed_target = $2 ORDER BY id`, [ORG, target])).rows;
const signatureCount = async () => Number((await one('SELECT count(*)::int AS n FROM electronic_signatures')).n);
const manifestOf = (row: Row) => (typeof row.signature_manifest === 'string' ? JSON.parse(row.signature_manifest) : row.signature_manifest);

async function seedDoc(fields: Row = {}): Promise<number> {
  const f = { status: 'review', artifact_id: null, udi_di: '00812345678906', region: 'us', expires_at: '2029-01-31', ...fields };
  const r = await one(
    `INSERT INTO labeling_documents (organization_id, device_name, doc_kind, version, status, language, region, udi_di, expires_at, artifact_id, created_by)
     VALUES ($1, 'Aurora CGM', 'ifu', '2.1', $2, 'en', $3, $4, $5::date, $6, $7) RETURNING id`,
    [ORG, f.status, f.region, f.udi_di, f.expires_at, f.artifact_id, AUTHOR]);
  await h.pg.query(
    `INSERT INTO labeling_symbols (labeling_document_id, organization_id, symbol_code, symbol_name, description, required_by)
     VALUES ($1, $2, '5.4.3', 'Consult instructions for use', 'Read the IFU before use', ARRAY['FDA','EU'])`, [r.id, ORG]);
  return r.id;
}

/** labeling-document/v1, as the README names it. */
async function expectedDocDigest(id: number, artifact: { id: number; content: string } | null = null): Promise<string> {
  const symbols = (await h.pg.query(
    `SELECT symbol_code, symbol_name, description, required_by FROM labeling_symbols
      WHERE labeling_document_id = $1 AND organization_id = $2 ORDER BY symbol_code, id`, [id, ORG])).rows;
  const d = await one(
    `SELECT device_name, doc_kind, version, language, region, udi_di, to_char(expires_at, 'YYYY-MM-DD') AS expires_at
       FROM labeling_documents WHERE id = $1`, [id]);
  return digestOf({
    recipe: 'labeling-document/v1',
    labelingDocumentId: id,
    deviceName: d.device_name,
    docKind: d.doc_kind,
    version: d.version,
    language: d.language,
    region: d.region,
    udiDi: d.udi_di,
    expiresAt: d.expires_at,
    artifact: artifact ? { id: artifact.id, contentSha256: sha256(artifact.content) } : null,
    symbols: symbols.map((s) => ({ symbolCode: s.symbol_code, symbolName: s.symbol_name, description: s.description, requiredBy: s.required_by })),
  });
}

async function seedTranslation(): Promise<{ docId: number; id: number }> {
  const docId = await seedDoc({ status: 'draft' });
  const r = await one(
    `INSERT INTO labeling_translations (labeling_document_id, organization_id, language, translator, translation_method, back_translation_verified, status, created_by)
     VALUES ($1, $2, 'de', 'A. Weber', 'human', true, 'review', $3) RETURNING id`, [docId, ORG, AUTHOR]);
  return { docId, id: r.id };
}

/** labeling-translation/v1. */
async function expectedTranslationDigest(id: number): Promise<string> {
  const t = await one(
    `SELECT labeling_document_id, language, translator, translation_method, back_translation_verified
       FROM labeling_translations WHERE id = $1`, [id]);
  return digestOf({
    recipe: 'labeling-translation/v1',
    translationId: id,
    labelingDocumentId: t.labeling_document_id,
    language: t.language,
    translator: t.translator,
    translationMethod: t.translation_method,
    backTranslationVerified: t.back_translation_verified,
    artifact: null,
  });
}

async function seedHazard(): Promise<number> {
  const r = await one(
    `INSERT INTO risk_items (organization_id, ref_code, hazard, hazardous_situation, harm, sequence_of_events, severity, probability,
                             detectability, initial_risk, residual_severity, residual_probability, residual_risk, control_strategy,
                             benefit_risk_rationale, status, source)
     VALUES ($1, 'HZ-01', 'Sensor drift', 'Reading high while glucose falls', 'Mis-dosing', 'Drift, then a missed low alert', 4, 3,
             2, 12, 4, 1, 4, 'design_reduce', 'Benefit of continuous monitoring outweighs the residual', 'verified', 'fmea') RETURNING id`, [ORG]);
  await h.pg.query(
    `INSERT INTO risk_controls (risk_item_id, organization_id, description, control_type, verification_evidence, status)
     VALUES ($1, $2, 'Factory calibration check', 'inherent_safety', 'VER-0042', 'verified')`, [r.id, ORG]);
  return r.id;
}

/** risk-residual-acceptance/v1. */
async function expectedHazardDigest(id: number): Promise<string> {
  const r = await one('SELECT * FROM risk_items WHERE id = $1', [id]);
  const controls = (await h.pg.query('SELECT * FROM risk_controls WHERE risk_item_id = $1 ORDER BY id', [id])).rows;
  return digestOf({
    recipe: 'risk-residual-acceptance/v1',
    riskItemId: id,
    refCode: r.ref_code,
    hazard: r.hazard,
    hazardousSituation: r.hazardous_situation,
    harm: r.harm,
    sequenceOfEvents: r.sequence_of_events,
    severity: r.severity,
    probability: r.probability,
    detectability: r.detectability,
    initialRisk: r.initial_risk,
    controlStrategy: r.control_strategy,
    source: r.source,
    residualSeverity: r.residual_severity,
    residualProbability: r.residual_probability,
    residualRisk: r.residual_risk,
    benefitRiskRationale: r.benefit_risk_rationale,
    controls: controls.map((c) => ({
      description: c.description, controlType: c.control_type, implementationEvidence: c.implementation_evidence,
      verificationEvidence: c.verification_evidence, effectivenessEvidence: c.effectiveness_evidence,
      introducesNewRisk: c.introduces_new_risk, newRiskItemId: c.new_risk_item_id, status: c.status,
    })),
  });
}

const patchDoc = (id: number, body: Row) => request(app()).patch(`/api/mdx/labeling/${id}`).send(body);
const patchTrans = (id: number, body: Row) => request(app()).patch(`/api/mdx/labeling/translations/${id}`).send(body);
const getDoc = (id: number) => request(app()).get(`/api/mdx/labeling/${id}`);
const patchRisk = (id: number, body: Row) => request(app()).patch(`/api/mdx/risk-items/${id}`).send(body);
const getRisk = (id: number) => request(app()).get(`/api/mdx/risk-items/${id}`);

beforeAll(async () => {
  const pg = new PGlite();
  h.pg = pg as unknown as typeof h.pg;
  await pg.exec(`CREATE TABLE organizations (id int PRIMARY KEY);
    CREATE TABLE users (id int PRIMARY KEY, name text, email text, title text);
    CREATE TABLE organization_users (id serial PRIMARY KEY, organization_id int NOT NULL, user_id int NOT NULL);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id int NOT NULL REFERENCES organizations(id), deleted_at timestamptz);
    CREATE TABLE q_submissions (id uuid PRIMARY KEY);
    CREATE TABLE ectd_templates (id serial PRIMARY KEY, organization_id int, granule_id text, is_default boolean);
    INSERT INTO organizations VALUES (${ORG}), (8);
    INSERT INTO users VALUES (${AUTHOR}, 'Ana Author', 'author@example.com', NULL), (${SIGNER}, 'Sam Signer', 'signer@example.com', 'Head of RA');
    INSERT INTO organization_users (organization_id, user_id) VALUES (${ORG}, ${AUTHOR}), (${ORG}, ${SIGNER});`);
  await pg.exec(read('migrations/20260511_qms_and_labeling.sql'));
  await pg.exec(read('migrations/20261029b_labeling_approval_stamps_and_creators.sql'));
  await pg.exec(read('migrations/20260507_mdx_beta_surfaces.sql'));
  // The Authoring artifact a label may name (push-provisioned in production; the columns the binder reads).
  await pg.exec(`CREATE TABLE concept2cure_artifacts (id serial PRIMARY KEY, artifact_id text, organization_id int NOT NULL,
    content text NOT NULL, version int NOT NULL DEFAULT 1, ctd_section text)`);
  // electronic_signatures as the governed-sign PGlite suite shapes it after 20260813d: the columns the one INSERT writes.
  await pg.exec(`CREATE TABLE electronic_signatures (
    id serial PRIMARY KEY, document_id integer, version_id integer, signed_target text, binding_basis text,
    signature_type varchar(50) NOT NULL, signature_purpose text NOT NULL, signature_level integer DEFAULT 1,
    signer_id integer NOT NULL, signer_name text NOT NULL, signer_title text, signer_email text NOT NULL,
    authentication_method varchar(50) NOT NULL, authentication_timestamp timestamp NOT NULL, second_factor_verified boolean DEFAULT false,
    signature_hash varchar(256) NOT NULL, signature_meaning text, signature_manifest json,
    is_valid boolean DEFAULT true, verification_status varchar(50), verification_date timestamp,
    compliance_statement text, legal_disclaimer text, ip_address varchar(45), device_info json,
    signed_at timestamp DEFAULT now() NOT NULL, created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now(),
    organization_id integer, bound_payload_digest text NOT NULL DEFAULT '', superseded_by integer)`);
}, 60_000);
afterAll(async () => { await (h.pg as unknown as PGlite)?.close(); });
beforeEach(async () => {
  await h.pg.query('DELETE FROM electronic_signatures');
  await h.pg.query('DELETE FROM labeling_translations');
  await h.pg.query('DELETE FROM labeling_symbols');
  await h.pg.query('DELETE FROM labeling_documents');
  await h.pg.query('DELETE FROM risk_controls');
  await h.pg.query('DELETE FROM risk_items');
  await h.pg.query('DELETE FROM concept2cure_artifacts');
  h.log.length = 0;
});

describe('a labeling document approval binds the label it approves', () => {
  it('the signature row carries the label content digest, the basis named, and the chain hash kept on the manifest', async () => {
    const id = await seedDoc();
    const reviewed = await expectedDocDigest(id);
    const res = await patchDoc(id, { status: 'approved', ...SIGNATURE });
    expect(res.status).toBe(201);
    const [sig] = await signaturesOn(`labeling-document:${id}`);
    expect(sig.binding_basis).toBe('labeling-document-content-sha256');
    expect(sig.bound_payload_digest).toBe(reviewed);
    expect(sig.bound_payload_digest).not.toBe(CHAIN);
    const manifest = manifestOf(sig);
    // The ledger-chain basis is still recorded, beside the content digest.
    expect(manifest).toMatchObject({ auditSha256Chain: CHAIN, boundPayloadDigest: reviewed, bindingBasis: 'labeling-document-content-sha256' });
    expect(manifest.bindingNote).toMatch(/labeling-document\/v1/);
    expect(sig.signature_hash).toBe(manifestSignatureHash(manifest));
  });

  it('the read says the signature matches the label as it stands', async () => {
    const id = await seedDoc();
    await patchDoc(id, { status: 'approved', ...SIGNATURE });
    const res = await getDoc(id);
    expect(res.status).toBe(200);
    expect(res.body.data.signedContent).toMatchObject({
      state: 'matches', signerName: 'Sam Signer', meaning: 'approval', bindingBasis: 'labeling-document-content-sha256',
    });
    expect(res.body.data.signedContent.signedDigest).toBe(res.body.data.signedContent.currentDigest);
  });

  it('a symbol added to the approved label after signing is detected', async () => {
    const id = await seedDoc();
    await patchDoc(id, { status: 'approved', ...SIGNATURE });
    const signed = (await signaturesOn(`labeling-document:${id}`))[0].bound_payload_digest;
    const added = await request(app()).post(`/api/mdx/labeling/${id}/symbols`).send({ symbolCode: '5.1.1', symbolName: 'Manufacturer' });
    expect(added.status).toBe(201);
    const res = await getDoc(id);
    expect(res.body.data.signedContent).toMatchObject({ state: 'changed', signedDigest: signed, currentDigest: await expectedDocDigest(id) });
    expect(res.body.data.signedContent.currentDigest).not.toBe(signed);
  });

  it('a field edited after the approval is withdrawn is detected against the signature', async () => {
    const id = await seedDoc();
    await patchDoc(id, { status: 'approved', ...SIGNATURE });
    expect((await patchDoc(id, { status: 'draft', reason: WITHDRAWAL })).status).toBe(200);
    expect((await patchDoc(id, { udiDi: '00812345678913' })).status).toBe(200);
    expect((await getDoc(id)).body.data.signedContent.state).toBe('changed');
  });

  it('moving to effective changes no attested field: both signatures bind the digest the signer reviewed', async () => {
    const id = await seedDoc();
    const reviewed = await expectedDocDigest(id);
    await patchDoc(id, { status: 'approved', ...SIGNATURE });
    expect((await patchDoc(id, { status: 'effective', effectiveDate: '2026-11-01', ...SIGNATURE })).status).toBe(201);
    const rows = await signaturesOn(`labeling-document:${id}`);
    expect(rows.map((r) => r.bound_payload_digest)).toEqual([reviewed, reviewed]);
    expect((await getDoc(id)).body.data.signedContent.state).toBe('matches');
  });

  it('the label text it names is bound, and an edit of that text after signing is detected', async () => {
    const art = await one(`INSERT INTO concept2cure_artifacts (artifact_id, organization_id, content) VALUES ('IFU-1', $1, 'Insert the sensor at a 90 degree angle.') RETURNING id`, [ORG]);
    const id = await seedDoc({ artifact_id: art.id });
    await patchDoc(id, { status: 'approved', ...SIGNATURE });
    const [sig] = await signaturesOn(`labeling-document:${id}`);
    expect(sig.bound_payload_digest).toBe(await expectedDocDigest(id, { id: art.id, content: 'Insert the sensor at a 90 degree angle.' }));
    await h.pg.query(`UPDATE concept2cure_artifacts SET content = 'Insert the sensor at a 45 degree angle.' WHERE id = $1`, [art.id]);
    expect((await getDoc(id)).body.data.signedContent.state).toBe('changed');
  });
});

describe('a labeling translation approval binds the translation it approves', () => {
  it('the signature row carries the translation content digest', async () => {
    const { id } = await seedTranslation();
    const reviewed = await expectedTranslationDigest(id);
    expect((await patchTrans(id, { status: 'approved', ...SIGNATURE })).status).toBe(201);
    const [sig] = await signaturesOn(`labeling-translation:${id}`);
    expect(sig.binding_basis).toBe('labeling-translation-content-sha256');
    expect(sig.bound_payload_digest).toBe(reviewed);
    expect(manifestOf(sig).auditSha256Chain).toBe(CHAIN);
  });

  it('the document read says each translation matches, and an edit after a withdrawal is detected', async () => {
    const { docId, id } = await seedTranslation();
    await patchTrans(id, { status: 'approved', ...SIGNATURE });
    const before = await getDoc(docId);
    expect(before.body.data.translations[0].signedContent.state).toBe('matches');
    expect((await patchTrans(id, { status: 'review', reason: WITHDRAWAL })).status).toBe(200);
    expect((await patchTrans(id, { translator: 'B. Schmidt' })).status).toBe(200);
    const after = await getDoc(docId);
    expect(after.body.data.translations[0].signedContent.state).toBe('changed');
  });
});

describe('accepting a residual risk binds the hazard as it was accepted', () => {
  it('the signature row carries the hazard content digest, with its controls', async () => {
    const id = await seedHazard();
    const reviewed = await expectedHazardDigest(id);
    expect((await patchRisk(id, { status: 'accepted', ...SIGNATURE })).status).toBe(201);
    const [sig] = await signaturesOn(`risk-item:${id}`);
    expect(sig.binding_basis).toBe('risk-residual-acceptance-content-sha256');
    expect(sig.bound_payload_digest).toBe(reviewed);
    expect(manifestOf(sig)).toMatchObject({ auditSha256Chain: CHAIN, boundPayloadDigest: reviewed });
  });

  it('the read says it matches, then detects a benefit-risk rationale rewritten after the acceptance', async () => {
    const id = await seedHazard();
    await patchRisk(id, { status: 'accepted', ...SIGNATURE });
    expect((await getRisk(id)).body.data.signedContent.state).toBe('matches');
    expect((await patchRisk(id, { benefitRiskRationale: 'Accepted on commercial grounds' })).status).toBe(200);
    expect((await getRisk(id)).body.data.signedContent).toMatchObject({ state: 'changed', currentDigest: await expectedHazardDigest(id) });
  });

  it('detects a risk control changed after the acceptance', async () => {
    const id = await seedHazard();
    await patchRisk(id, { status: 'accepted', ...SIGNATURE });
    const ctl = await one('SELECT id FROM risk_controls WHERE risk_item_id = $1', [id]);
    expect((await request(app()).patch(`/api/mdx/risk-controls/${ctl.id}`).send({ verificationEvidence: 'none' })).status).toBe(200);
    expect((await getRisk(id)).body.data.signedContent.state).toBe('changed');
  });
});

describe('fail closed: content that cannot be bound is not signed over the chain hash instead', () => {
  it('a label naming text that cannot be read: 409, nothing signed, the document unchanged', async () => {
    const id = await seedDoc({ artifact_id: 999 });
    const res = await patchDoc(id, { status: 'approved', ...SIGNATURE });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SIGNATURE_CONTENT_UNBOUND');
    expect(res.body.error.message).toMatch(/Nothing was signed\.$/);
    expect(await signatureCount()).toBe(0);
    expect(await one('SELECT status, approved_by FROM labeling_documents WHERE id = $1', [id])).toEqual({ status: 'review', approved_by: null });
    expect(h.log).toContain('ROLLBACK');
    expect(h.log).not.toContain('COMMIT');
  });

  it('a hazard whose controls cannot be read: 409, nothing signed, the hazard not accepted', async () => {
    const id = await seedHazard();
    await h.pg.query('ALTER TABLE risk_controls RENAME TO risk_controls_away');
    try {
      const res = await patchRisk(id, { status: 'accepted', ...SIGNATURE });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SIGNATURE_CONTENT_UNBOUND');
    } finally {
      await h.pg.query('ALTER TABLE risk_controls_away RENAME TO risk_controls');
    }
    expect(await signatureCount()).toBe(0);
    expect(await one('SELECT status, acceptable FROM risk_items WHERE id = $1', [id])).toEqual({ status: 'verified', acceptable: null });
  });
});

describe('the read is honest about signatures it cannot check', () => {
  /** A row as the writer wrote it before 2026-10-29: the ledger chain hash, with that basis. */
  async function ledgerSignature(target: string, over: Row = {}) {
    const manifest = { kind: 'governed-sign', target, boundPayloadDigest: CHAIN, bindingBasis: 'governed-action-sha256-chain' };
    await h.pg.query(
      `INSERT INTO electronic_signatures (signed_target, binding_basis, signature_type, signature_purpose, signer_id, signer_name, signer_email,
         authentication_method, authentication_timestamp, signature_hash, signature_meaning, signature_manifest, is_valid,
         verification_status, signed_at, bound_payload_digest, organization_id)
       VALUES ($1, 'governed-action-sha256-chain', 'governed-action', 'r', $2, 'Sam Signer', 'signer@example.com', 'password', now(),
         $3, 'approval', $4, $5, $6, now(), $7, $8)`,
      [target, SIGNER, manifestSignatureHash(manifest), JSON.stringify(manifest), over.is_valid ?? true, over.verification_status ?? null, CHAIN, ORG]);
  }

  it('a signature from before content binding is unverified, never "matches" or "changed"', async () => {
    const id = await seedDoc({ status: 'approved' });
    await ledgerSignature(`labeling-document:${id}`);
    const facet = (await getDoc(id)).body.data.signedContent;
    expect(facet.state).toBe('unverified');
    expect(facet.reason).toMatch(/chain hash/);
  });

  it('a revoked signature reads as withdrawn', async () => {
    const id = await seedDoc({ status: 'approved' });
    await ledgerSignature(`labeling-document:${id}`, { is_valid: false, verification_status: 'revoked' });
    expect((await getDoc(id)).body.data.signedContent.state).toBe('withdrawn');
  });

  it('a record never signed reads as unsigned', async () => {
    const id = await seedHazard();
    expect((await getRisk(id)).body.data.signedContent).toMatchObject({ state: 'unsigned', signatureId: null });
  });
});
