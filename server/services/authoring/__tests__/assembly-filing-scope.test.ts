import { describe, expect, it } from 'vitest';
import { resolveAssemblyTemplate } from '../authoring-assembly-source';
import { builtinAuthoringTemplateId, getBuiltinAuthoringTemplate } from '../builtin-authoring-templates';
import { builtinTemplateSource } from '../authoring-template-sections';
import { getIndAuthoringTemplates } from '../ind-authoring-templates';
import type { AssemblyDocument } from '../authoring-assembly-plan';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const DOC = 'aaaaaaaa-0000-4000-8000-000000000001';
const STORED = 'dddddddd-0000-4000-8000-000000000001';
const regional = [
  ['US_HDE', 'hde', 'fda'], ['CA_MDL', 'mdl', 'hc'], ['CA_IVD_LICENCE', 'ivd_licence', 'hc'],
  ['JP_SHONIN', 'shonin', 'pmda'], ['JP_NINTEI', 'ninsho', 'jp_rcb'],
  ['JP_TODOKEDE', 'todokede', 'pmda'], ['JP_IVD_APPROVAL', 'ivd_approval', 'pmda'], ['JP_CDX', 'jp_cdx', 'pmda'],
] as const;
const templateId = (entry: string) => builtinAuthoringTemplateId(entry);
const document = (over: Record<string, unknown> = {}): AssemblyDocument => ({
  id: DOC, module: null, client_program_id: PROGRAM, status: 'draft', c2c_document_id: 'filing', ...over,
});

function fixture(docType = 'mdl', agency = 'hc', options: {
  missing?: boolean; fail?: boolean; stored?: Record<string, unknown>; bound?: Record<string, unknown>;
} = {}) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const bound = { id: 'filing', project_id: PROGRAM, org_id: 1, doc_type: docType, agency, filing_scope: 'home', ...options.bound };
  const stored = { id: STORED, template_name: 'Stored regional source', is_active: true, tenant_id: 1,
    template_content: { sections: [{ code: 'administrative', title: 'Stored heading', content: '', order_index: 1 }] },
    regions: ['FDA'], agency: 'FDA', metadata: {}, ...options.stored };
  const q = { query: async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    if (/FROM c2c_documents\b/.test(sql)) {
      if (options.fail) throw new Error('Synthetic binding read failure');
      return { rows: options.missing ? [] : [bound] };
    }
    if (sql.includes('to_regclass')) return { rows: [{ available: false }] };
    if (sql.includes('FROM authoring_templates')) return { rows: [stored] };
    throw new Error('Unexpected fixture query: ' + sql);
  } };
  return { q, calls, bound };
}

async function recorded(registry: string): Promise<AssemblyDocument> {
  const template = await getBuiltinAuthoringTemplate(templateId('registry:' + registry));
  return document({ c2c_document_id: null, template_id: template!.id,
    provenance: { templateSource: builtinTemplateSource(template) } });
}

describe('actual bound filing scope before assembly', () => {
  it.each(regional)('%s refuses a different full application without relying on parent template provenance', async (registry, docType, agency) => {
    const f = fixture(docType, agency);
    const selected = registry === 'US_HDE' ? 'US_PMA' : 'US_HDE';
    await expect(resolveAssemblyTemplate(f.q, 1, templateId('registry:' + selected), document(), false))
      .rejects.toMatchObject({ status: 409, code: 'ASSEMBLY_FILING_SCOPE_MISMATCH' });
  });

  it.each(regional)('%s permits only its actual exact preparation identity', async (registry, docType, agency) => {
    const f = fixture(docType, agency);
    const plan = await resolveAssemblyTemplate(f.q, 1, templateId('registry:' + registry), document(), true);
    expect(plan.aiDraftable).toBe(false);
    expect(plan.sections.length).toBeGreaterThan(0);
    const read = f.calls.find(call => /FROM c2c_documents\b/.test(call.sql));
    expect(read?.params).toEqual(['filing', 1, PROGRAM]);
    expect(read?.sql).toMatch(/org_id\s*=\s*\$2/);
    expect(read?.sql).toMatch(/project_id\s*=\s*\$3/);
    expect(read?.sql).toContain('FOR SHARE');
  });

  it.each([
    ['mdl', 'hc', 'CA_IVD_LICENCE'], ['shonin', 'pmda', 'JP_NINTEI'], ['ninsho', 'jp_rcb', 'JP_SHONIN'],
  ])('refuses same-region %s / %s against %s', async (docType, agency, registry) => {
    await expect(resolveAssemblyTemplate(fixture(docType, agency).q, 1, templateId('registry:' + registry), document(), false))
      .rejects.toMatchObject({ status: 409, code: 'ASSEMBLY_FILING_SCOPE_MISMATCH' });
  });

  it.each(['missing', 'foreign-tenant', 'foreign-project'])('%s binding is unavailable, never an unbound fallback', async () => {
    await expect(resolveAssemblyTemplate(fixture('mdl', 'hc', { missing: true }).q, 1,
      templateId('registry:CA_MDL'), document(), false)).rejects.toMatchObject({ status: 404, code: 'ASSEMBLY_FILING_NOT_FOUND' });
  });

  it('unreadable binding refuses before returning any template', async () => {
    await expect(resolveAssemblyTemplate(fixture('mdl', 'hc', { fail: true }).q, 1,
      templateId('registry:CA_MDL'), document(), false)).rejects.toMatchObject({ status: 503, code: 'ASSEMBLY_FILING_UNVERIFIED' });
  });

  it.each([['mdl', 'fda'], ['ninsho', 'pmda'], ['unknown-class', 'hc']])('incoherent stored %s / %s cannot substitute a template', async (docType, agency) => {
    await expect(resolveAssemblyTemplate(fixture(docType, agency).q, 1,
      templateId('registry:CA_MDL'), document(), false)).rejects.toMatchObject({ status: 503, code: 'ASSEMBLY_FILING_UNVERIFIED' });
  });
});

describe('recorded operation is not inferred from a shared program class or recipient', () => {
  it('refuses an unmapped chosen device operation rather than borrowing its program class', async () => {
    const f = fixture('pma', 'fda', { bound: { program_type: 'pma', primary_agency: 'FDA',
      program_metadata: { submissionTypeId: 'US_EUA' } } });
    await expect(resolveAssemblyTemplate(f.q, 1, templateId('registry:US_EUA'), document(), false))
      .rejects.toMatchObject({ status: 503, code: 'ASSEMBLY_FILING_UNVERIFIED' });
  });

  it('leaves an unmapped saved clinical-investigation authority unverified instead of substituting MDR documentation', async () => {
    const f = fixture('mdr', 'ema', { bound: { program_type: 'mdr', primary_agency: 'EMA',
      program_metadata: { submissionTypeId: 'EU_CLIN_INVESTIGATION' } } });
    await expect(resolveAssemblyTemplate(f.q, 1, templateId('registry:EU_MDR_TECHDOC'), document(), false))
      .rejects.toMatchObject({ status: 503, code: 'ASSEMBLY_FILING_UNVERIFIED' });
  });
});

describe('implicit IND and explicit regional sources require verified bound scope', () => {
  it.each([['cta', 'hc'], ['nda', 'fda']])('refuses an implicit US IND Module 1 source on bound %s / %s', async (docType, agency) => {
    const template = getIndAuthoringTemplates().find(row => row.module === 'M1')!;
    await expect(resolveAssemblyTemplate(fixture(docType, agency).q, 1, template.id, document({ module: 'M1' }), false))
      .rejects.toMatchObject({ status: 409, code: 'ASSEMBLY_FILING_SCOPE_MISMATCH' });
  });

  it('permits an implicit US IND Module 1 source on the verified FDA IND filing', async () => {
    const template = getIndAuthoringTemplates().find(row => row.module === 'M1')!;
    const result = await resolveAssemblyTemplate(fixture('ind', 'fda').q, 1, template.id, document({ module: 'M1' }), false);
    expect(result.sections.length).toBeGreaterThan(0);
  });

  it('refuses implicit whole-phase IND preparation on a different medicinal filing', async () => {
    const template = getIndAuthoringTemplates().find(row => row.module === null)!;
    expect(template).toBeDefined();
    await expect(resolveAssemblyTemplate(fixture('nda', 'fda').q, 1, template.id, document(), false))
      .rejects.toMatchObject({ status: 409, code: 'ASSEMBLY_FILING_SCOPE_MISMATCH' });
  });

  it('refuses an explicitly FDA builtin when the bound recipient only establishes GLOBAL', async () => {
    const f = fixture('ind', 'ich', { bound: { program_type: 'ind', primary_agency: 'ICH' } });
    await expect(resolveAssemblyTemplate(f.q, 1, templateId('registry:US_IND'), document(), false))
      .rejects.toMatchObject({ status: 409, code: 'ASSEMBLY_FILING_SCOPE_MISMATCH' });
  });

  it('refuses an explicitly FDA stored source when the bound recipient only establishes GLOBAL', async () => {
    const f = fixture('nda', 'ich', { bound: { program_type: 'nda', primary_agency: 'ICH' } });
    await expect(resolveAssemblyTemplate(f.q, 1, STORED, document(), false))
      .rejects.toMatchObject({ status: 409, code: 'ASSEMBLY_FILING_SCOPE_MISMATCH' });
  });

  it('keeps common Module 2 available when the bound recipient establishes only GLOBAL', async () => {
    const template = getIndAuthoringTemplates().find(row => row.module === 'M2' && row.aiDraftable)!;
    const f = fixture('nda', 'ich', { bound: { program_type: 'nda', primary_agency: 'ICH' } });
    const result = await resolveAssemblyTemplate(f.q, 1, template.id, document({ module: 'M2' }), false);
    expect(result.sections.length).toBeGreaterThan(0);
  });
});

describe('device components use the existing exact preparation compatibility rule', () => {
  it.each([
    ['US_PMA', 'k510_summary'], ['EU_IVDR', 'gspr_checklist'], ['EU_MDR_TECHDOC', 'performance_evaluation_report'],
  ])('recorded %s refuses component %s despite a shared jurisdiction', async (parent, component) => {
    await expect(resolveAssemblyTemplate(fixture().q, 1, templateId('component:' + component), await recorded(parent), false))
      .rejects.toMatchObject({ status: 409, code: 'ASSEMBLY_TEMPLATE_SCOPE_MISMATCH' });
  });

  it.each([
    ['pma', 'fda', 'k510_summary'], ['ivdr', 'ema', 'gspr_checklist'], ['mdr', 'ema', 'performance_evaluation_report'],
  ])('bound %s / %s refuses component %s', async (docType, agency, component) => {
    await expect(resolveAssemblyTemplate(fixture(docType, agency).q, 1, templateId('component:' + component), document(), false))
      .rejects.toMatchObject({ status: 409, code: 'ASSEMBLY_FILING_SCOPE_MISMATCH' });
  });

  it.each([
    ['US_510K', 'k510_summary'], ['EU_IVDR', 'ivdr_gspr_checklist'], ['EU_IVDR', 'performance_evaluation_report'],
    ['EU_MDR_TECHDOC', 'gspr_checklist'],
  ])('recorded %s permits applicable component %s', async (parent, component) => {
    expect((await resolveAssemblyTemplate(fixture().q, 1, templateId('component:' + component), await recorded(parent), false)).sections.length)
      .toBeGreaterThan(0);
  });

  it.each([
    ['k510', 'fda', 'k510_summary'], ['ivdr', 'ema', 'ivdr_gspr_checklist'], ['ivdr', 'ema', 'performance_evaluation_report'],
    ['mdr', 'ema', 'gspr_checklist'],
  ])('bound %s / %s permits applicable component %s', async (docType, agency, component) => {
    expect((await resolveAssemblyTemplate(fixture(docType, agency).q, 1, templateId('component:' + component), document(), false)).sections.length)
      .toBeGreaterThan(0);
  });
});

describe('stored regional scope and deliberate unbound working copies', () => {
  it.each([
    { regions: ['FDA'], agency: 'FDA' }, { regions: ['JP'], agency: 'PMDA' }, { regions: ['CA'], agency: 'FDA' },
  ])('Canadian bound target refuses explicit stored conflict %j', async stored => {
    await expect(resolveAssemblyTemplate(fixture('mdl', 'hc', { stored }).q, 1, STORED, document(), false))
      .rejects.toMatchObject({ status: 409, code: 'ASSEMBLY_FILING_SCOPE_MISMATCH' });
  });

  it('registered-body target refuses an explicit PMDA template even in Japan', async () => {
    await expect(resolveAssemblyTemplate(fixture('ninsho', 'jp_rcb', { stored: { regions: ['JP'], agency: 'PMDA' } }).q,
      1, STORED, document(), false)).rejects.toMatchObject({ status: 409, code: 'ASSEMBLY_FILING_SCOPE_MISMATCH' });
  });

  it('Canadian recorded stored scope remains manual without asserted AI eligibility', async () => {
    const result = await resolveAssemblyTemplate(fixture('mdl', 'hc', { stored: { regions: ['CA'], agency: 'Health_Canada' } }).q,
      1, STORED, document(), false);
    expect(result.aiDraftable).toBe(false);
    expect(result.draftRegion).toBe('Health Canada');
  });

  it('a declared multi-region template may be assembled manually in one of its recorded regions', async () => {
    const result = await resolveAssemblyTemplate(fixture('mdl', 'hc', { stored: { regions: ['FDA', 'CA'], agency: null } }).q,
      1, STORED, document(), false);
    expect(result.aiDraftable).toBe(false);
    expect(result.draftRegion).toBeNull();
  });

  it('a multi-region template with no matching region refuses a bound Canadian target', async () => {
    await expect(resolveAssemblyTemplate(fixture('mdl', 'hc', { stored: { regions: ['FDA', 'JP'], agency: null } }).q,
      1, STORED, document(), false)).rejects.toMatchObject({ status: 409, code: 'ASSEMBLY_FILING_SCOPE_MISMATCH' });
  });

  it('an unknown explicit stored region does not become permission to use a bound filing', async () => {
    await expect(resolveAssemblyTemplate(fixture('mdl', 'hc', { stored: { regions: ['unknown-region'], agency: null } }).q,
      1, STORED, document(), false)).rejects.toMatchObject({ status: 503, code: 'ASSEMBLY_TEMPLATE_SCOPE_UNVERIFIED' });
  });

  it('a global unqualified worksheet remains manual in a bound Canadian target', async () => {
    const result = await resolveAssemblyTemplate(fixture('mdl', 'hc', { stored: { regions: ['GLOBAL'], agency: 'ICH' } }).q,
      1, STORED, document(), false);
    expect(result.aiDraftable).toBe(false);
    expect(result.draftRegion).toBeNull();
  });

  it('Canadian home jurisdiction cannot borrow FDA authority through an ICH stored pack', async () => {
    const f = fixture('nda', 'ich', { bound: { program_type: 'nda', primary_agency: 'Health_Canada' },
      stored: { regions: ['CA'], agency: 'FDA' } });
    await expect(resolveAssemblyTemplate(f.q, 1, STORED, document(), false))
      .rejects.toMatchObject({ status: 409, code: 'ASSEMBLY_FILING_SCOPE_MISMATCH' });
  });

  it('Canadian home jurisdiction retains an explicit matching authority with an ICH stored pack', async () => {
    const f = fixture('nda', 'ich', { bound: { program_type: 'nda', primary_agency: 'Health_Canada' },
      stored: { regions: ['CA'], agency: 'Health_Canada' } });
    const result = await resolveAssemblyTemplate(f.q, 1, STORED, document(), false);
    expect(result.draftRegion).toBe('Health Canada');
  });

  it('unbound regional working copy does not inherit the project home filing', async () => {
    const f = fixture('mdl', 'hc');
    const result = await resolveAssemblyTemplate(f.q, 1, templateId('registry:JP_SHONIN'), document({ c2c_document_id: null }), false);
    expect(result.draftRegion).toBe('PMDA');
    expect(f.calls.some(call => /FROM c2c_documents\b/.test(call.sql))).toBe(false);
  });

  it('unbound Canadian NDS remains available despite its unmapped governed filing operation', async () => {
    const f = fixture('nda', 'ich', { bound: { program_type: 'nda', primary_agency: 'Health Canada',
      program_metadata: { submissionTypeId: 'CA_NDS' } } });
    const result = await resolveAssemblyTemplate(f.q, 1, templateId('registry:CA_NDS'), document({ c2c_document_id: null }), false);
    expect(result.draftRegion).toBe('Health Canada');
    expect(f.calls.some(call => /FROM c2c_documents\b/.test(call.sql))).toBe(false);
  });

  it('common Module 2 remains available with supported noncontradictory saved filing metadata', async () => {
    const template = getIndAuthoringTemplates().find(row => row.module === 'M2' && row.aiDraftable)!;
    const f = fixture('nda', 'fda', { bound: { program_type: 'nda', primary_agency: 'FDA',
      program_metadata: { submissionTypeId: 'US_NDA' } } });
    const result = await resolveAssemblyTemplate(f.q, 1, template.id, document({ module: 'M2' }), false);
    expect(result.aiDraftable).toBe(true);
  });

  it('legacy common Module 2 remains available in a bound medicinal filing', async () => {
    const template = getIndAuthoringTemplates().find(row => row.module === 'M2' && row.aiDraftable)!;
    const result = await resolveAssemblyTemplate(fixture('nda', 'fda').q, 1, template.id, document({ module: 'M2' }), false);
    expect(result.aiDraftable).toBe(true);
  });
});
