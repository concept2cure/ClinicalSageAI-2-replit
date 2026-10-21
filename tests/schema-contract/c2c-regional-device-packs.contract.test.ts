/** Exact regional device application outlines use the existing governed pack pipeline. */
import { afterEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { C2C_MIGRATION_FILES } from '../../scripts/db/migration-set.mjs';
import { FILING_CLASS_PACKS, filingClassPackSections, filingClassPackUncertainties } from '../../server/services/c2c/filing-class-packs';
import { getRegistryDocumentTemplate, type TemplateSection } from '../../server/services/market-specs/document-template-library';
import { scaffoldProjectDocuments } from '../../server/services/c2c/scaffold-project-documents';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = 'migrations/20261020_regional_device_application_packs.sql';
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const CASES = [
  ['US_HDE', 'hde', 'fda', 'FDA'], ['CA_MDL', 'mdl', 'hc', 'Health_Canada'],
  ['CA_IVD_LICENCE', 'ivd_licence', 'hc', 'Health_Canada'], ['JP_SHONIN', 'shonin', 'pmda', 'PMDA'],
  ['JP_NINTEI', 'ninsho', 'jp_rcb', 'Registered_Certification_Body'], ['JP_TODOKEDE', 'todokede', 'pmda', 'PMDA'],
  ['JP_IVD_APPROVAL', 'ivd_approval', 'pmda', 'PMDA'], ['JP_CDX', 'jp_cdx', 'pmda', 'PMDA'],
] as const;

describe('new immutable regional device preparation packs', () => {
  it.each(CASES)('%s has its exact low-confidence, unreviewed-source pack specification', async (registryId, docType, agency) => {
    const spec = FILING_CLASS_PACKS.find(p => p.docType === docType);
    expect(spec, `${registryId} has no governed pack spec`).toBeDefined();
    expect(spec).toMatchObject({ agency, sourceBasis: 'reasoned_construction', confidence: 'low', supersedes: null, minted: '2026-10-20' });
    expect(await filingClassPackUncertainties(spec!)).toMatch(/not reviewed by a regulatory professional/i);
    expect(await filingClassPackUncertainties(spec!)).not.toMatch(/hosts are unreachable/);
    const source = await getRegistryDocumentTemplate(registryId);
    const projected: unknown[] = [];
    function flatten(sections: TemplateSection[], parent: string | null) {
      for (const s of sections) {
        projected.push({ key: s.number, parent_key: parent, label: s.heading, mandatory: s.required, path_order: projected.length + 1 });
        flatten(s.subsections ?? [], s.number);
      }
    }
    flatten([...(source!.frontMatter ?? []), ...source!.sections], null);
    expect(await filingClassPackSections(docType)).toEqual(projected);
    expect(projected.length).toBeGreaterThan(0);
    expect((await filingClassPackSections(docType)).every(s => !s.mandatory)).toBe(true);
  });
});

let pg: PGlite | undefined;
afterEach(async () => { await pg?.close(); pg = undefined; });

/** Existing pack files, plus this increment, in the real applier's order. */
function packFiles(includeNew = true): string[] {
  return (C2C_MIGRATION_FILES as string[]).filter(file =>
    /20260528_phase9_document_schema|20260804_phase9_rule_pack_outlines|20260806_cta_ema_ctr536_outline|20260806b_anda_ide_filing_types|20260810_pma_fda_814_20_outline|20260810b_eu_mdr_ivdr_outlines|20260810[cd]_rule_pack_|20260901_ind_fda_m1_v2_3_outline|20260901b_estar_510k_denovo_outlines|20260902_ind_fda_outline_v2_2_initial_ind_flags|20261005_fda_jnda_m1_outline_v2_2|20261005b_pma_fda_outline_v1_1_software_documentation_level|20261005c_k510_denovo_estar_outline_v1_1|20261018_filing_class_rule_packs|20261018c_filing_class_packs_review_corrections|20261019b_filing_class_packs_v1_2_critic_followups/.test(file)
    || (includeNew && file === FILE));
}

async function boot(includeNew = true) {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE organizations (id serial PRIMARY KEY);
    CREATE TABLE users (id serial PRIMARY KEY);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY);
    CREATE TABLE audit_logs (id text PRIMARY KEY, tenant_id integer, user_id integer, action text,
      table_name text, record_id text, actor_id text, target text, target_type text, target_id text,
      reason text, payload_hash text, ana_action_id text, sha256_chain text, occurred_at timestamptz DEFAULT now(),
      hmac_seal text, old_values json, new_values json, ip_address text, user_agent text);
    INSERT INTO organizations DEFAULT VALUES; INSERT INTO users DEFAULT VALUES;`);
  await pg.exec(read('migrations/20260527_mutation_primitives.sql'));
  for (const file of packFiles(includeNew)) await pg.exec(read(file));
}

async function scaffold(programType: string, primaryAgency: string) {
  const projectId = crypto.randomUUID();
  await pg!.query('INSERT INTO regulatory_programs (id) VALUES ($1)', [projectId]);
  const client = { query: (sql: string, params?: unknown[]) => pg!.query(sql, params as any[]) };
  return scaffoldProjectDocuments({ client, orgId: 1, userId: 1, projectId, programType, primaryAgency, productName: 'Regional monitor' } as Parameters<typeof scaffoldProjectDocuments>[0]);
}

describe('regional device packs scaffold and replay on an installed database', () => {
  it('the new migration is actually on the applier after provenance and prior class packs', () => {
    const files = C2C_MIGRATION_FILES as string[];
    expect(files).toContain(FILE);
    expect(files.indexOf(FILE)).toBeGreaterThan(files.indexOf('migrations/20261019b_filing_class_packs_v1_2_critic_followups.sql'));
  });

  it('without the migration, an exact admitted class cannot substitute another agency pack', async () => {
    await boot(false);
    for (const [, docType, , agency] of CASES) expect((await scaffold(docType, agency)).skipped).toBe('NO_RULE_PACK');
  }, 60_000);

  it('every exact application starts at zero/draft, binds its source tree and discloses provenance without a transmit channel', async () => {
    await boot();
    for (const [, docType, agency, inputAgency] of CASES) {
      const result = await scaffold(docType, inputAgency);
      expect(result.skipped, docType).toBeUndefined();
      const { rows } = await pg!.query<any>(`SELECT d.doc_type, d.agency, d.status, d.readiness, d.rule_pack_version,
        rp.required_sections, rp.source_basis, rp.confidence, rp.review_status, rp.reviewed_by, rp.esubmit_channel
        FROM c2c_documents d JOIN c2c_rule_packs rp ON (rp.doc_type, rp.agency, rp.version) = (d.doc_type, d.agency, d.rule_pack_version)
        WHERE d.id=$1`, [result.documentId]);
      const spec = FILING_CLASS_PACKS.find(p => p.docType === docType)!;
      expect(rows[0]).toMatchObject({ doc_type: docType, agency, status: 'draft', readiness: 0,
        rule_pack_version: spec.version, source_basis: 'reasoned_construction', confidence: 'low', review_status: 'unreviewed', reviewed_by: null, esubmit_channel: null });
      expect(rows[0].required_sections).toEqual(await filingClassPackSections(docType));
      const sections = await pg!.query<any>('SELECT status, content, mandatory FROM c2c_document_sections WHERE document_id=$1', [result.documentId]);
      expect(sections.rows).toHaveLength(result.sectionCount);
      expect(sections.rows.every(s => s.status === 'todo' && JSON.stringify(s.content) === '{}' && s.mandatory === false)).toBe(true);
    }
  }, 60_000);

  it('replays old wideners over bound old/new records without narrowing, changing existing provenance or losing review attribution', async () => {
    await boot(false);
    const old = await scaffold('nda', 'FDA');
    await pg!.query(`UPDATE c2c_rule_packs SET review_status='reviewed', reviewed_by='Prior reviewer, RAC', reviewed_at='2026-10-19T10:00:00Z',
      review_scope='Prior contract fixture only', reviewed_sections_sha=c2c_rule_pack_sections_digest(required_sections)
      WHERE doc_type='nda' AND agency='fda' AND superseded_by IS NULL`);
    const prior = await pg!.query('SELECT * FROM c2c_rule_packs ORDER BY doc_type, agency, version');
    await pg!.exec(read(FILE));
    for (const [, docType, , agency] of CASES) await scaffold(docType, agency);
    await pg!.query(`UPDATE c2c_rule_packs SET review_status='reviewed', reviewed_by='Test reviewer, RAC', reviewed_at='2026-10-20T10:00:00Z',
      review_scope='Contract fixture only', reviewed_sections_sha=c2c_rule_pack_sections_digest(required_sections)
      WHERE doc_type='ninsho' AND agency='jp_rcb'`);
    const packsBefore = await pg!.query('SELECT * FROM c2c_rule_packs ORDER BY doc_type, agency, version');
    const docsBefore = await pg!.query('SELECT * FROM c2c_documents ORDER BY id');
    const sectionsBefore = await pg!.query('SELECT * FROM c2c_document_sections ORDER BY id');
    for (let replay = 0; replay < 2; replay++) for (const file of packFiles()) await pg!.exec(read(file));
    expect((await pg!.query('SELECT * FROM c2c_rule_packs ORDER BY doc_type, agency, version')).rows).toEqual(packsBefore.rows);
    expect((await pg!.query('SELECT * FROM c2c_documents ORDER BY id')).rows).toEqual(docsBefore.rows);
    expect((await pg!.query('SELECT * FROM c2c_document_sections ORDER BY id')).rows).toEqual(sectionsBefore.rows);
    const oldPacks = (await pg!.query<any>('SELECT * FROM c2c_rule_packs ORDER BY doc_type, agency, version')).rows.filter(r => !CASES.some(c => c[1] === r.doc_type));
    expect(oldPacks).toEqual(prior.rows);
    expect((await pg!.query<any>('SELECT id FROM c2c_documents WHERE id=$1', [old.documentId])).rows).toHaveLength(1);
    expect((await pg!.query<any>(`SELECT effective_review_state FROM c2c_rule_packs_review_state WHERE doc_type='ninsho' AND agency='jp_rcb'`)).rows[0].effective_review_state).toBe('reviewed_current');
    expect((await pg!.query<any>(`SELECT effective_review_state FROM c2c_rule_packs_review_state WHERE doc_type='nda' AND agency='fda'
      AND version=(SELECT rule_pack_version FROM c2c_documents WHERE id=$1)`, [old.documentId])).rows[0].effective_review_state).toBe('reviewed_current');
    await expect(pg!.query(`UPDATE c2c_documents SET agency='not_an_agency' WHERE doc_type='ninsho'`)).rejects.toThrow(/agency_check/);
    await expect(pg!.query(`UPDATE c2c_documents SET doc_type='not_a_filing' WHERE doc_type='ninsho'`)).rejects.toThrow(/doc_type_check/);
  }, 90_000);

  it('a same-length altered regional pack refuses the deploy instead of accepting ON CONFLICT', async () => {
    await boot();
    await pg!.query(`UPDATE c2c_rule_packs SET required_sections=jsonb_set(required_sections, '{0,mandatory}', 'true') WHERE doc_type='mdl' AND agency='hc'`);
    await expect(pg!.exec(read(FILE))).rejects.toThrow(/mdl:hc.*tree matches: false/);
  }, 60_000);

  it('installs both named CHECKs when a provisioned table has neither constraint', async () => {
    await boot();
    await pg!.exec(`ALTER TABLE c2c_documents DROP CONSTRAINT c2c_documents_doc_type_check;
      ALTER TABLE c2c_documents DROP CONSTRAINT c2c_documents_agency_check;`);
    await pg!.exec(read(FILE));
    expect((await scaffold('ninsho', 'Registered_Certification_Body')).skipped).toBeUndefined();
    await expect(pg!.query(`UPDATE c2c_documents SET agency='not_an_agency'`)).rejects.toThrow(/agency_check/);
    await expect(pg!.query(`UPDATE c2c_documents SET doc_type='not_a_filing'`)).rejects.toThrow(/doc_type_check/);
  }, 60_000);

  it('older files and this file preserve future strict supersets and the records they admit', async () => {
    await boot();
    const current = await scaffold('ninsho', 'Registered_Certification_Body');
    const constraints = await pg!.query<{ conname: string; definition: string }>(`SELECT conname, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE conrelid='c2c_documents'::regclass AND conname IN ('c2c_documents_doc_type_check','c2c_documents_agency_check') ORDER BY conname`);
    for (const row of constraints.rows) {
      const column = row.conname === 'c2c_documents_doc_type_check' ? 'doc_type' : 'agency';
      const value = column === 'doc_type' ? 'future_device_application' : 'future_device_recipient';
      const predicate = row.definition.slice('CHECK '.length);
      // Identifiers and predicates come from this fixture's own constraints, not caller input.
      await pg!.exec(`ALTER TABLE c2c_documents DROP CONSTRAINT ${row.conname};
        ALTER TABLE c2c_documents ADD CONSTRAINT ${row.conname} CHECK (${predicate} OR ${column}='${value}');`);
    }
    await pg!.exec(`INSERT INTO c2c_rule_packs(doc_type,agency,version,label,required_sections)
      VALUES('future_device_application','future_device_recipient','fixture-v1','Future fixture','[]');`);
    await pg!.query(`INSERT INTO c2c_documents(id,org_id,project_id,doc_type,agency,rule_pack_version,title)
      SELECT 'future-record',org_id,project_id,'future_device_application','future_device_recipient','fixture-v1','Future fixture'
      FROM c2c_documents WHERE id=$1`, [current.documentId]);
    const readChecks = () => pg!.query(`SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conrelid='c2c_documents'::regclass AND conname IN ('c2c_documents_doc_type_check','c2c_documents_agency_check') ORDER BY conname`);
    const before = await readChecks();
    for (const file of packFiles()) await pg!.exec(read(file));
    expect((await readChecks()).rows).toEqual(before.rows);
    expect((await pg!.query(`SELECT id FROM c2c_documents WHERE id='future-record'`)).rows).toHaveLength(1);
    await expect(pg!.query(`UPDATE c2c_documents SET agency='not_an_agency' WHERE id='future-record'`)).rejects.toThrow(/agency_check/);
    await expect(pg!.query(`UPDATE c2c_documents SET doc_type='not_a_filing' WHERE id='future-record'`)).rejects.toThrow(/doc_type_check/);
  }, 60_000);
});
