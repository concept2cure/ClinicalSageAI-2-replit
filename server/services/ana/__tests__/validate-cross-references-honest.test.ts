/**
 * validate_cross_references checks each reference against the tenant's own
 * document outlines, and says what it could not check.
 *
 * It returned every reference as 'unverified' with "requires document store
 * access — flagged for manual review", read no document, and took no tenant.
 * A document in the organization has an outline (c2c_document_sections); a
 * reference is found in this document, found in another document of the same
 * project, present only as a parent section, or not found. A table or figure
 * number has no resolver, so it is not assessed — never passed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../db', () => ({ getPool: () => ({ query }) }));
vi.mock('../../../db.js', () => ({ getPool: () => ({ query }) }));

import { getToolHandler } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const DOC = { id: 'doc_a', project_id: '11111111-1111-1111-1111-111111111111', title: 'Module 2.5 Clinical Overview' };
const SECTIONS = [
  { document_id: 'doc_a', title: DOC.title, section_key: 'm2.5.4', status: 'drafted' },
  { document_id: 'doc_a', title: DOC.title, section_key: 'm2.5.6', status: 'todo' },
  { document_id: 'doc_q', title: 'Quality — drug product', section_key: '3.2.P.5', status: 'approved' },
  { document_id: 'doc_q', title: 'Quality — drug product', section_key: '3.2.P.5.1', status: 'approved' },
];

function wire({ doc = DOC as typeof DOC | null, sections = SECTIONS } = {}) {
  query.mockImplementation(async (sql: string, params: unknown[]) => {
    if (/FROM c2c_documents\s+WHERE org_id = \$1 AND id = \$2/.test(sql)) {
      return { rows: doc && params[0] === 7 && params[1] === doc.id ? [doc] : [] };
    }
    if (/FROM c2c_document_sections s\s+JOIN c2c_documents d/.test(sql)) {
      expect(params).toEqual([7, DOC.project_id]);
      return { rows: sections };
    }
    throw new Error(`unexpected SQL: ${sql}`);
  });
}

const run = async (input: Record<string, unknown>, ctx: Record<string, unknown> = { organizationId: 7 }) =>
  JSON.parse(await getToolHandler('validate_cross_references')!(input, ctx as any));

beforeEach(() => {
  query.mockReset();
});

describe('validate_cross_references', () => {
  it('resolves each reference against the outlines of the tenant\'s own documents', async () => {
    wire();
    const out = await run({
      document_id: 'doc_a',
      section_references: ['Section 2.5.4', 'Module 2.5.6', 'Section 3.2.P.5.1', '3.2.P.5.2', 'Section 3.2.S.4'],
    });
    const byRef = Object.fromEntries(out.results.map((r: { reference: string }) => [r.reference, r]));
    expect(byRef['Section 2.5.4']).toMatchObject({ status: 'found_in_document', section: '2.5.4', sectionStatus: 'drafted' });
    expect(byRef['Module 2.5.6']).toMatchObject({ status: 'found_in_document', sectionStatus: 'todo' });
    expect(byRef['Section 3.2.P.5.1']).toMatchObject({ status: 'found_in_project', documentId: 'doc_q' });
    expect(byRef['3.2.P.5.2']).toMatchObject({ status: 'parent_only', nearestSection: '3.2.P.5' });
    expect(byRef['Section 3.2.S.4']).toMatchObject({ status: 'not_found' });
    expect(out.summary).toMatchObject({ found: 3, parentOnly: 1, notFound: 1, notAssessed: 0 });
    expect(JSON.stringify(out)).not.toMatch(/unverified|flagged for manual review/);
  });

  it('does not assess table and figure numbers, and does not pass them', async () => {
    wire();
    const out = await run({ document_id: 'doc_a', section_references: ['Table 4', 'Figure 1', 'see the appendix'] });
    for (const r of out.results) expect(r.status).toBe('not_assessed');
    expect(out.summary.found).toBe(0);
  });

  it('refuses a document outside the organization, and says the same as for one that does not exist', async () => {
    wire();
    const other = await run({ document_id: 'doc_a', section_references: ['2.5.4'] }, { organizationId: 8 });
    const missing = await run({ document_id: 'doc_zzz', section_references: ['2.5.4'] });
    expect(other.error).toMatch(/No document 'doc_a' in this organization/);
    expect(missing.error).toMatch(/No document 'doc_zzz' in this organization/);
    expect(other.results).toBeUndefined();
  });

  it('refuses without a tenant, and asks for the references it is to check', async () => {
    wire();
    expect((await run({ document_id: 'doc_a', section_references: ['2.5'] }, {})).error).toMatch(/tenant/);
    expect((await run({ document_id: 'doc_a' })).error).toMatch(/section_references/);
    expect(query).not.toHaveBeenCalled();
  });

  it('matches a section by its code, not by a longer code that starts the same', async () => {
    wire({ sections: [{ document_id: 'doc_a', title: DOC.title, section_key: '2.5.10', status: 'drafted' }] });
    const out = await run({ document_id: 'doc_a', section_references: ['Section 2.5.1'] });
    expect(out.results[0].status).toBe('not_found');
  });

  it('describes what it checks, not a table or figure check it does not do', () => {
    const def = ALL_ANA_TOOLS.find((t) => t.name === 'validate_cross_references')!;
    expect(def.description).not.toMatch(/table\/figure numbers are correct/i);
    expect(def.input_schema.required).toEqual(['document_id', 'section_references']);
  });
});
