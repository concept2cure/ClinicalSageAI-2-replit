/** The existing template/library/create-seed path must use the actual filing's keys. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { FDA_510K_IVD_SECTIONS } from '../../shared/regulatory/device-authoring-sections';
import { getApplicationType } from '../../shared/regulatory/global-document-registry';
import { getSectionBlueprintForEntry } from '../../shared/regulatory/project-bootstrap';
import { filingSectionKey } from '../../shared/regulatory/filing-section-key';
import { findActiveRulePack } from '../../server/services/c2c/rule-pack-lookup';
import { getRegistryDocumentTemplate } from '../../server/services/market-specs/document-template-library';
import { builtinAuthoringTemplateId, getBuiltinAuthoringTemplate } from '../../server/services/authoring/builtin-authoring-templates';
import { builtinTemplateSectionMetadata, builtinTemplateSource, resolveTemplateSections } from '../../server/services/authoring/authoring-template-sections';

const TARGETS = [
  { registryId: 'US_510K', productType: 'device', count: 38, version: 'fda-estar-510k-v1.1', uuid: '519dfd9a-dc91-57ea-a6b5-d45259d8b6c1' },
  { registryId: 'US_510K_MOD', productType: 'device', count: 38, version: 'fda-estar-510k-v1.1', uuid: '0bcadb22-d9d9-5175-94da-19fc7d34fb0a' },
  { registryId: 'US_CDX_510K', productType: 'cdx', count: 47, version: 'fda-estar-510k-ivd-v1.0', uuid: '50953bfa-0352-5463-baae-3a6e98490254' },
] as const;
type PackNode = { key: string; label: string; mandatory: boolean; path_order: number };
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
let db: PGlite;
const q = { query: (sql: string, params?: unknown[]) => db.query(sql, params) };

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE organizations(id serial PRIMARY KEY);
    CREATE TABLE users(id serial PRIMARY KEY);
    CREATE TABLE regulatory_programs(id uuid PRIMARY KEY);
    CREATE TABLE audit_logs(id text PRIMARY KEY,tenant_id integer,user_id integer,action text,table_name text,
      record_id text,actor_id text,target text,target_type text,target_id text,reason text,payload_hash text,
      ana_action_id text,sha256_chain text,occurred_at timestamptz DEFAULT now(),hmac_seal text,
      old_values json,new_values json,ip_address text,user_agent text);`);
  for (const file of [
    'migrations/20260527_mutation_primitives.sql',
    'migrations/20260528_phase9_document_schema.sql',
    'migrations/20260804_phase9_rule_pack_outlines.sql',
    'migrations/20260810c_rule_pack_provenance.sql',
    'migrations/20260810d_rule_pack_review_attribution.sql',
    'migrations/20260901b_estar_510k_denovo_outlines.sql',
    'migrations/20261005c_k510_denovo_estar_outline_v1_1.sql',
    'migrations/20261114_k510_ivd_estar_outline_v1_0.sql',
  ]) await db.exec(readFileSync(file, 'utf8'));
}, 60_000);
afterAll(async () => { await db?.close(); });

const blueprint = (id: string) => getSectionBlueprintForEntry(getApplicationType(id)!);

describe('US 510(k) template sections reach their existing governed filing nodes', () => {
  it.each(TARGETS)('$registryId: library, builtin and create-seed resolver match the actual SQL pack', async target => {
    const pack = await findActiveRulePack(q, 'k510', 'fda', target.productType);
    expect(pack?.version).toBe(target.version);
    const nodes = pack!.required_sections as PackNode[];
    expect(nodes).toHaveLength(target.count);
    const template = await getRegistryDocumentTemplate(target.registryId);
    expect(template?.sections).toHaveLength(target.count);
    expect(template!.sections.map(s => ({ key: s.number, label: s.heading, mandatory: s.required })))
      .toEqual(nodes.map(s => ({ key: s.key, label: s.label, mandatory: s.mandatory })));
    const id = builtinAuthoringTemplateId(`registry:${target.registryId}`);
    expect(id).toBe(target.uuid);
    const builtin = await getBuiltinAuthoringTemplate(id);
    expect(builtin).toMatchObject({ id: target.uuid, version: 1, module: null, kind: 'preparation',
      aiDraftable: false, authoringMode: 'manual', originalFormat: 'eSTAR',
      filingContext: { registryId: target.registryId, region: 'US', agency: 'FDA' } });
    const seeds = await resolveTemplateSections(q, 7, id, { builtin });
    expect(Array.isArray(seeds)).toBe(true);
    if (!Array.isArray(seeds)) throw new Error('Expected the actual builtin section seeds');
    expect(seeds.map(s => s.code)).toEqual(nodes.map(s => s.key));
    expect(seeds.every(s => s.content === '')).toBe(true);
    expect(seeds.map(s => s.ordering)).toEqual(seeds.map((_, i) => i));
    const keys = nodes.map(s => s.key);
    for (const section of seeds) expect(filingSectionKey(keys, section.code)).toBe(section.code);
    const source = builtinTemplateSource(builtin)!;
    expect(source).toMatchObject({ id: target.uuid, entryId: `registry:${target.registryId}`, version: 1,
      kind: 'preparation', aiDraftable: false, authoringMode: 'manual' });
    expect(source.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(builtinTemplateSectionMetadata(builtin, source, seeds[0].code)).toEqual({
      templateSource: source, templateGuidance: builtin!.sections[0].guidance,
    });
  });

  it.each(['US_510K', 'US_510K_MOD'])('%s carries every former topic at its existing FDA key without IVD-only guidance', registryId => {
    const sections = blueprint(registryId).sections;
    for (const [key, topic] of [
      ['A1', /cover letter/i], ['B2', /indications for use/i], ['B1', /device description/i],
      ['C2', /substantial equivalence/i], ['E5', /bench performance/i], ['E1', /biocompatibility/i],
      ['E2', /software/i], ['D2', /labeling/i], ['E7', /clinical performance/i], ['A5', /510\(k\) summary/i],
    ] as const) expect(sections.find(s => s.code === key)?.title).toMatch(topic);
    expect(sections.every(s => /FDA/.test(s.guidance ?? ''))).toBe(true);
    expect(sections.map(s => s.guidance).join(' ')).not.toMatch(/IVD|tissue.contact|non.contact|hides.*branch|Annex XIII|Article 56/i);
    expect(sections.find(s => s.code === 'E5')?.required).toBe(true);
    expect(sections.find(s => s.code === 'E1')?.required).toBe(true);
  });

  it('copies generic rows without mutating the published IVD source or its objects', () => {
    expect(hash(FDA_510K_IVD_SECTIONS)).toBe('2bbae431bb4416cdd4518986d3ba95c15c8ab55f6d0167d0841b979e3c066b46');
    const generic = blueprint('US_510K').sections;
    expect(generic).not.toBe(FDA_510K_IVD_SECTIONS);
    for (const row of generic) expect(row).not.toBe(FDA_510K_IVD_SECTIONS.find(s => s.code === row.code));
    expect(FDA_510K_IVD_SECTIONS).toHaveLength(47);
    expect(FDA_510K_IVD_SECTIONS.find(s => s.code === 'E5')?.required).toBe(false);
    expect(FDA_510K_IVD_SECTIONS.find(s => s.code === 'E9')?.required).toBe(true);
  });

  it('keeps UK registration on its exact recorded ten-row source', () => {
    expect(hash(blueprint('UK_DEVICE_REG'))).toBe('339918c79e9926e2c29d1aade56de07e0e6efc97e8adf3908e8b41958e80d38d');
    expect(blueprint('UK_DEVICE_REG').sections.map(s => s.code)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  });
});
