/**
 * The PGlite database the signed-content suites run on (P-63, P-64; D5,
 * docs/evidence/D5-SIGNED-CONTENT-LOCKED/2026-10-29/): the real labeling and
 * risk tables from their migrations, the signature table as the governed-sign
 * suites shape it, and the seeders and inspector's digests both suites read.
 * Used by signed-content-locked.pglite.test.ts and
 * risk-acceptance-locked.pglite.test.ts; each keeps its own module mocks,
 * because vitest hoists them per file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';
import type request from 'supertest';
import { canonicalJson } from '../../services/part11/signature-persistence';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

export const ORG = 7;
export const AUTHOR = 3;
export const SIGNER = 5;
export const MEMBER = 6;
export const PROGRAM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const GOOD = 'correct horse battery staple';
export const SIGNATURE = { meaning: 'approval', reason: 'Checked against the design output and the risk file', password: GOOD };
export const REOPEN = { meaning: 'responsibility', reason: 'A field complaint changes the probability estimate', password: GOOD };
export const WITHDRAWAL = 'The German artwork changed after review; re-review it';
/** The chain hash the stubbed ledger returns. */
export const CHAIN = 'c'.repeat(64);

type Row = Record<string, any>;
export type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; affectedRows?: number }> };

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const digestOf = (content: unknown) => sha256(canonicalJson(content));
export const manifestOf = (row: Row) => (typeof row.signature_manifest === 'string' ? JSON.parse(row.signature_manifest) : row.signature_manifest);

export async function createSignedRecordTables(pg: Db & { exec: (sql: string) => Promise<unknown> }): Promise<void> {
  await pg.exec(`CREATE TABLE organizations (id int PRIMARY KEY);
    CREATE TABLE users (id int PRIMARY KEY, name text, email text, title text);
    CREATE TABLE organization_users (id serial PRIMARY KEY, organization_id int NOT NULL, user_id int NOT NULL);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id int NOT NULL REFERENCES organizations(id), deleted_at timestamptz);
    CREATE TABLE q_submissions (id uuid PRIMARY KEY);
    CREATE TABLE ectd_templates (id serial PRIMARY KEY, organization_id int, granule_id text, is_default boolean);
    INSERT INTO organizations VALUES (${ORG}), (8);
    INSERT INTO users VALUES (${AUTHOR}, 'Ana Author', 'author@example.com', NULL), (${SIGNER}, 'Sam Signer', 'signer@example.com', 'Head of RA'),
                             (${MEMBER}, 'Mo Member', 'member@example.com', NULL);
    INSERT INTO organization_users (organization_id, user_id) VALUES (${ORG}, ${AUTHOR}), (${ORG}, ${SIGNER}), (${ORG}, ${MEMBER});
    INSERT INTO regulatory_programs (id, organization_id) VALUES ('${PROGRAM}', ${ORG});`);
  await pg.exec(read('migrations/20260511_qms_and_labeling.sql'));
  await pg.exec(read('migrations/20261029b_labeling_approval_stamps_and_creators.sql'));
  await pg.exec(read('migrations/20260507_mdx_beta_surfaces.sql'));
  await pg.exec(`CREATE TABLE concept2cure_artifacts (id serial PRIMARY KEY, artifact_id text, organization_id int NOT NULL,
    content text NOT NULL, version int NOT NULL DEFAULT 1, ctd_section text)`);
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
}

export async function clearSignedRecords(pg: Db): Promise<void> {
  for (const t of ['electronic_signatures', 'labeling_translations', 'labeling_symbols', 'labeling_documents', 'risk_controls', 'risk_items', 'concept2cure_artifacts']) {
    await pg.query(`DELETE FROM ${t}`);
  }
}

/** The seeders and reads both suites use, on `pg`. */
export function signedRecords(pg: Db) {
  const one = async (sql: string, params: unknown[] = []): Promise<Row> => (await pg.query(sql, params)).rows[0];

  async function seedDoc(fields: Row = {}): Promise<number> {
    const f = { status: 'review', artifact_id: null, version: '2.1', ...fields };
    const r = await one(
      `INSERT INTO labeling_documents (organization_id, device_name, doc_kind, version, status, language, region, udi_di, expires_at, artifact_id, created_by, effective_date)
       VALUES ($1, 'Aurora CGM', 'ifu', $2, $3, 'en', 'us', '00812345678906', '2029-01-31', $4, $5, $6) RETURNING id`,
      [ORG, f.version, f.status, f.artifact_id, AUTHOR, f.status === 'effective' || f.status === 'superseded' ? '2026-10-02' : null]);
    await pg.query(
      `INSERT INTO labeling_symbols (labeling_document_id, organization_id, symbol_code, symbol_name, description, required_by)
       VALUES ($1, $2, '5.4.3', 'Consult instructions for use', 'Read the IFU before use', ARRAY['FDA','EU'])`, [r.id, ORG]);
    return r.id;
  }

  async function seedTranslation(docFields: Row = { status: 'draft' }, transFields: Row = {}): Promise<{ docId: number; id: number }> {
    const docId = await seedDoc(docFields);
    const f = { status: 'review', ...transFields };
    const r = await one(
      `INSERT INTO labeling_translations (labeling_document_id, organization_id, language, translator, translation_method, back_translation_verified, status, created_by)
       VALUES ($1, $2, 'de', 'A. Weber', 'human', true, $3, $4) RETURNING id`, [docId, ORG, f.status, AUTHOR]);
    return { docId, id: r.id };
  }

  async function seedHazard(fields: Row = {}): Promise<number> {
    const f = { status: 'verified', acceptable: null, ...fields };
    const r = await one(
      `INSERT INTO risk_items (organization_id, ref_code, hazard, hazardous_situation, harm, sequence_of_events, severity, probability,
                               detectability, initial_risk, residual_severity, residual_probability, residual_risk, control_strategy,
                               benefit_risk_rationale, status, source, acceptable)
       VALUES ($1, 'HZ-01', 'Sensor drift', 'Reading high while glucose falls', 'Mis-dosing', 'Drift, then a missed low alert', 4, 3,
               2, 12, 4, 1, 4, 'design_reduce', 'Benefit of continuous monitoring outweighs the residual', $2, 'fmea', $3) RETURNING id`,
      [ORG, f.status, f.acceptable]);
    await pg.query(
      `INSERT INTO risk_controls (risk_item_id, organization_id, description, control_type, verification_evidence, status)
       VALUES ($1, $2, 'Factory calibration check', 'inherent_safety', 'VER-0042', 'verified')`, [r.id, ORG]);
    return r.id;
  }

  /** labeling-document/v1, as the binder README names it. */
  async function expectedDocDigest(id: number): Promise<string> {
    const d = await one(
      `SELECT device_name, doc_kind, version, language, region, udi_di, to_char(expires_at, 'YYYY-MM-DD') AS expires_at
         FROM labeling_documents WHERE id = $1`, [id]);
    const symbols = await pg.query(
      `SELECT symbol_code, symbol_name, description, required_by FROM labeling_symbols
        WHERE labeling_document_id = $1 AND organization_id = $2 ORDER BY symbol_code, id`, [id, ORG]);
    return digestOf({
      recipe: 'labeling-document/v1', labelingDocumentId: id, deviceName: d.device_name, docKind: d.doc_kind, version: d.version,
      language: d.language, region: d.region, udiDi: d.udi_di, expiresAt: d.expires_at, artifact: null,
      symbols: symbols.rows.map((s: Row) => ({ symbolCode: s.symbol_code, symbolName: s.symbol_name, description: s.description, requiredBy: s.required_by })),
    });
  }

  const transRow = (id: number) => one('SELECT * FROM labeling_translations WHERE id = $1', [id]);

  /** The translation's own fields, as both recipes digest them. */
  async function translationOwn(id: number, recipe: string): Promise<Row> {
    const t = await transRow(id);
    return {
      recipe, translationId: id, labelingDocumentId: t.labeling_document_id, language: t.language, translator: t.translator,
      translationMethod: t.translation_method, backTranslationVerified: t.back_translation_verified, artifact: null,
    };
  }

  return {
    one,
    seedDoc,
    seedTranslation,
    seedHazard,
    expectedDocDigest,
    translationOwn,
    transRow,
    docRow: (id: number) => one('SELECT * FROM labeling_documents WHERE id = $1', [id]),
    hazardRow: (id: number) => one('SELECT * FROM risk_items WHERE id = $1', [id]),
    symbolsOf: async (docId: number) => (await pg.query('SELECT * FROM labeling_symbols WHERE labeling_document_id = $1 ORDER BY id', [docId])).rows,
    controlsOf: async (id: number) => (await pg.query('SELECT * FROM risk_controls WHERE risk_item_id = $1 ORDER BY id', [id])).rows,
    signaturesOn: async (target: string) => (await pg.query(
      `SELECT id, binding_basis, bound_payload_digest, signature_manifest, signature_meaning
         FROM electronic_signatures WHERE organization_id = $1 AND signed_target = $2 ORDER BY id`, [ORG, target])).rows,
    signatureCount: async () => Number((await one('SELECT count(*)::int AS n FROM electronic_signatures')).n),
    /** labeling-translation/v2 (P-64): v1's fields, and the source's version and content digest. */
    expectedTranslationV2Digest: async (id: number): Promise<string> => {
      const t = await transRow(id);
      const d = await one('SELECT id, version FROM labeling_documents WHERE id = $1', [t.labeling_document_id]);
      return digestOf({ ...(await translationOwn(id, 'labeling-translation/v2')), source: { version: d.version, contentDigest: await expectedDocDigest(d.id) } });
    },
  };
}

/** A refusal of signed content: 409, the one code, the fields or child named, and nothing saved. */
export function expectLocked(res: request.Response, record: string, what: { fields?: string[]; child?: string }) {
  expect({ status: res.status, code: res.body?.details?.code, record: res.body?.details?.record }).toEqual({ status: 409, code: 'SIGNED_CONTENT_LOCKED', record });
  if (what.fields) expect(res.body.details.fields).toEqual(what.fields);
  if (what.child) expect(res.body.details.child).toBe(what.child);
  expect(res.body.error).toMatch(/is not edited in place/);
  expect(res.body.error).toMatch(/Nothing was saved\.$/);
}
