/**
 * A device or IVD exit asks whether the filing still holds the document's text.
 *
 * P-29.3, docs/EXIT_ATTESTATION_DECISION_2026-10-18.md: an exit attests to the
 * EDITING layer (`authoring_sections`); the filing (`c2c_document_sections`) is
 * a derived projection. For a drug or biologic client the seals compare the two
 * (`filingAgreesWithEditing`). For a device client nothing did: `/build`, the
 * official eSTAR's section attachments, the filing-readiness verdict and the
 * assembly verdict read the filing and asked neither store anything, so a
 * device package could carry text the document did not.
 *
 * Run against PostgreSQL (PGlite), with the stores shaped as the shipped
 * migrations shape them — `authoring_documents.c2c_document_id` is text, bound
 * through a non-unique index (migrations/20260728_authoring_document_governed_binding.sql)
 * — so the question is answered by the real SQL, not by a fake that agrees with
 * whatever the code under test sends it.
 *
 * Only program ACCESS is stubbed: it is qualified with real SQL in the adjacent
 * estar-vault-attachment-access PGlite fixture, and these cases own the filing.
 */
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../c2c/current-program-access', async (original) => ({
  ...(await original<object>()),
  requireCurrentProgramAccess: async () => ({ actor: { userId: 7, role: 'member' } }),
}));

import { governedDeviceFilingAgreement, type DeviceContentClient } from '../estar-content-leaves';
import { createDeviceAttachmentResolver } from '../estar-attachment-plan';
import { filedCopyDivergedSentence } from '../../../c2c/filing-section-target';

const ORG = 2;
const OTHER_ORG = 3;
const PROGRAM = '2b6d4a80-6a35-4b1e-9f6e-3a9d2c1e5f70';
const EDITING = '0f7c1a52-3b6e-4d2a-9c8b-1e5f7a3d9b20';
const FOREIGN_EDITING = '6a1e9d3b-7c42-4f80-a5b1-2d8c4e6f0a13';
const DESCRIPTION = 'The Aurora pump is an ambulatory infusion device for subcutaneous insulin delivery.';
const BIOCOMPAT = 'Biocompatibility was evaluated per ISO 10993-1 for a surface device, skin contact, prolonged duration.';

let pg: PGlite;
const client: DeviceContentClient = {
  query: async <T = Record<string, unknown>>(text: string, params?: unknown[]) =>
    ({ rows: (await pg.query(text, params as unknown[])).rows as T[] }),
};

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE c2c_documents (id text PRIMARY KEY, org_id int NOT NULL, project_id text, doc_type text,
      created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE c2c_document_sections (id bigserial PRIMARY KEY, document_id text REFERENCES c2c_documents(id),
      section_key text NOT NULL, label text, status text, content jsonb, mandatory boolean, path_order int);
    CREATE TABLE authoring_documents (id uuid PRIMARY KEY, tenant_id int NOT NULL, status text,
      c2c_document_id text REFERENCES c2c_documents(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now());
    CREATE INDEX authoring_documents_c2c_document_idx ON authoring_documents (c2c_document_id) WHERE c2c_document_id IS NOT NULL;
    CREATE TABLE authoring_sections (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), doc_id uuid REFERENCES authoring_documents(id),
      code text, title text, content text, order_index int, created_at timestamptz NOT NULL DEFAULT now(), tenant_id int NOT NULL);
  `);
}, 60_000);
afterAll(async () => { await pg?.close(); });

/** A 510(k) program whose filing and editing copy agree on B1 and E1. */
beforeEach(async () => {
  await pg.exec('TRUNCATE authoring_sections, authoring_documents, c2c_document_sections, c2c_documents CASCADE');
  await pg.query(`INSERT INTO c2c_documents (id, org_id, project_id, doc_type, created_at) VALUES ($1, $2, $3, 'k510', now() - interval '1 day')`,
    ['doc-k510', ORG, PROGRAM]);
  for (const [i, [key, label, text]] of [['B1', 'Device description and principles of operation', DESCRIPTION], ['E1', 'Biocompatibility', BIOCOMPAT]].entries()) {
    await pg.query(`INSERT INTO c2c_document_sections (document_id, section_key, label, status, content, mandatory, path_order)
      VALUES ('doc-k510', $1, $2, 'approved', jsonb_build_object('text', $3::text), true, $4)`, [key, label, text, i]);
  }
  await pg.query(`INSERT INTO authoring_documents (id, tenant_id, status, c2c_document_id) VALUES ($1, $2, 'DRAFT', 'doc-k510')`, [EDITING, ORG]);
  await pg.query(`INSERT INTO authoring_sections (doc_id, code, title, content, order_index, tenant_id) VALUES
    ($1, 'B1', 'Device description and intended use', $2, 100, $4),
    ($1, 'E1', 'Biocompatibility (ISO 10993)', $3, 500, $4)`, [EDITING, DESCRIPTION, BIOCOMPAT, ORG]);
});

const rewriteFiled = (key: string, text: string) =>
  pg.query(`UPDATE c2c_document_sections SET content = jsonb_build_object('text', $2::text) WHERE document_id = 'doc-k510' AND section_key = $1`, [key, text]);

describe('governedDeviceFilingAgreement: the question, asked from the filing', () => {
  it('a filing that holds its editing copy agrees, and says which document it compared', async () => {
    const a = await governedDeviceFilingAgreement(ORG, PROGRAM, { client });
    expect(a).toMatchObject({ documentId: 'doc-k510', bound: [EDITING], diverged: [], rewritten: [], unfiled: [] });
    expect(a.reason).toBeUndefined();
  });

  it('a filed copy rewritten under the document is named, with the section the author opens', async () => {
    await rewriteFiled('E1', 'Biocompatibility testing is not required for this device.');
    const a = await governedDeviceFilingAgreement(ORG, PROGRAM, { client });
    expect(a.rewritten).toEqual([{ key: 'E1', filed: 'different', section: { id: expect.any(String), code: 'E1' }, authoringDocId: EDITING }]);
    expect(a.unfiled).toEqual([]);
    const said = filedCopyDivergedSentence(a.rewritten);
    expect(said).toMatch(/^The filed copy of section E1 is not the document's text\./);
    expect(said).toMatch(/Re-file saved text/);
  });

  it('a section authored and never filed is reported as unfiled, not as rewritten', async () => {
    await pg.query(`UPDATE c2c_document_sections SET content = '{}'::jsonb WHERE section_key = 'B1'`);
    const a = await governedDeviceFilingAgreement(ORG, PROGRAM, { client });
    expect(a.rewritten).toEqual([]);
    expect(a.unfiled).toEqual(['B1']);
  });

  it('a filing no editing document is bound to is not applicable, and says why', async () => {
    await pg.query('UPDATE authoring_documents SET c2c_document_id = NULL');
    await rewriteFiled('E1', 'Anything at all.');
    const a = await governedDeviceFilingAgreement(ORG, PROGRAM, { client });
    expect(a).toMatchObject({ documentId: 'doc-k510', bound: [], rewritten: [] });
    expect(a.reason).toMatch(/No document in the editor is bound to this filing/);
  });

  it('another organization reaches no filing through this program', async () => {
    const a = await governedDeviceFilingAgreement(OTHER_ORG, PROGRAM, { client });
    expect(a).toMatchObject({ documentId: null, bound: [], rewritten: [] });
    expect(a.reason).toMatch(/no governed device document here/);
  });

  it("another organization's editing document bound to the same filing id is never compared", async () => {
    await pg.query(`INSERT INTO authoring_documents (id, tenant_id, status, c2c_document_id) VALUES ($1, $2, 'DRAFT', 'doc-k510')`, [FOREIGN_EDITING, OTHER_ORG]);
    await pg.query(`INSERT INTO authoring_sections (doc_id, code, title, content, order_index, tenant_id) VALUES ($1, 'E1', 'Biocompatibility', 'Not this text.', 1, $2)`,
      [FOREIGN_EDITING, OTHER_ORG]);
    const a = await governedDeviceFilingAgreement(ORG, PROGRAM, { client });
    expect(a.bound).toEqual([EDITING]);
    expect(a.rewritten).toEqual([]);
  });

  it('compares the class the exit builds from, never the newest device document of another class', async () => {
    // A CER generated today is the newest device document; the 510(k) export files from the k510 one.
    await pg.query(`INSERT INTO c2c_documents (id, org_id, project_id, doc_type) VALUES ('doc-cer', $1, $2, 'cer')`, [ORG, PROGRAM]);
    await rewriteFiled('E1', 'Rewritten under the 510(k).');
    const k510 = await governedDeviceFilingAgreement(ORG, PROGRAM, { client, docTypes: ['k510'] });
    expect(k510.documentId).toBe('doc-k510');
    expect(k510.rewritten.map((d) => d.key)).toEqual(['E1']);
  });
});

describe('the official eSTAR attaches a governed section only when the filing holds its text', () => {
  const resolver = () => createDeviceAttachmentResolver({
    organizationId: ORG, programUuid: PROGRAM, userId: 7, docTypes: ['k510'], client, submissionType: '510k',
  });

  it('attaches a section whose filed copy is the document\'s text', async () => {
    const out = await resolver()({ kind: 'authored_section', sectionCode: 'B1' });
    expect(out.ok).toBe(true);
  });

  it('refuses a section whose filed copy was rewritten, naming it and the remedy', async () => {
    await rewriteFiled('E1', 'Biocompatibility testing is not required for this device, as justified elsewhere.');
    const out = await resolver()({ kind: 'authored_section', sectionCode: 'E1' });
    expect(out.ok, 'a rewritten filed copy was attached to the official eSTAR').toBe(false);
    if (out.ok) return;
    expect(out.reason).toMatch(/^Section "E1" \(Biocompatibility\) was not attached\. The filed copy of section E1 is not the document's text\./);
    expect(out.reason).toMatch(/Re-file saved text/);
  });

  it('still attaches the agreeing sections beside a rewritten one', async () => {
    await rewriteFiled('E1', 'Biocompatibility testing is not required for this device, as justified elsewhere.');
    const out = await resolver()({ kind: 'authored_section', sectionCode: 'B1' });
    expect(out.ok).toBe(true);
  });

  it('refuses at delivery when the editing copy moved after the section was rendered', async () => {
    const resolve = resolver();
    expect((await resolve({ kind: 'authored_section', sectionCode: 'E1' })).ok).toBe(true);
    // The editor's text changed and its re-filing did not land: the rendered
    // attachment is now the filing's text and not the document's.
    await pg.query(`UPDATE authoring_sections SET content = $1 WHERE code = 'E1'`, [`${BIOCOMPAT} Cytotoxicity testing was repeated in 2026.`]);
    await expect(resolve.assertCurrent()).rejects.toMatchObject({ status: 409, code: 'FILING_DIVERGED' });
  });
});
