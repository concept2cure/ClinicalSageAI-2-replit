/** Adapter/rendering tests only. The canonical savedTemplateReview boundary is
 * supplied as a typed validated result; HTTP/PGlite suites qualify its SQL,
 * source/assembly validation and access decisions separately. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecordedTemplateSource } from '../../../../shared/authoring/recorded-template-source';
import type { RequestSqlClient } from '../../../db/requestDb';
import type { SavedTemplateReview } from '../../ana/saved-template-review';

const h = vi.hoisted(() => ({ review: vi.fn() }));
vi.mock('../../ana/saved-template-review', () => ({ savedTemplateReview: h.review }));

import { buildSectionDraftPrompt, DraftTemplateReferenceError, savedSectionDraftTemplate } from '../authoring-draft-template';

const DOC = 'aaaaaaaa-0000-4000-8000-000000000001';
const PROGRAM = 'bbbbbbbb-0000-4000-8000-000000000001';
const SECTION = 'cccccccc-0000-4000-8000-000000000001';
const PARENT = 'dddddddd-0000-4000-8000-000000000001';
const SELECTED = 'eeeeeeee-0000-4000-8000-000000000001';
const BEGIN = 'BEGIN_SAVED_SECTION_TEMPLATE_REFERENCE_JSON';
const END = 'END_SAVED_SECTION_TEMPLATE_REFERENCE_JSON';
const LIMIT = 16 * 1024;
const SCOPE = { tenantId: 7, documentId: DOC, programId: PROGRAM, sectionId: SECTION, code: '3' };
const q: RequestSqlClient = { query: async () => { throw new Error('The adapter must reuse the canonical validator'); } };
const header = { template_id: PARENT, provenance: {}, title: 'Renamed working document' };
const source = (region: 'US' | 'CA' | 'EU' | 'JP' | 'GLOBAL' = 'US', id = PARENT): RecordedTemplateSource => {
  const registryId = { US: 'US_IND', CA: 'CA_CTA', EU: 'EU_CTA', JP: 'JP_CTN', GLOBAL: 'ICH_IB' }[region];
  return { id, entryId: `registry:${registryId}`, version: 1, sha256: 'a'.repeat(64), kind: 'narrative',
    aiDraftable: true, authoringMode: 'ai_draft', originalFormat: 'docx', limitations: ['Retain original source records.'],
    filingContext: { registryId, region, agency: { US: 'FDA', CA: 'Health Canada', EU: 'EMA', JP: 'PMDA', GLOBAL: 'ICH' }[region] } };
};

function reviewed(parent: RecordedTemplateSource | null = source(), guidance = 'Exact saved reference guidance.'): SavedTemplateReview {
  return { template: { id: PARENT, sourceState: parent ? 'recorded' : 'not-recorded',
    ...(parent ? { kind: parent.kind, aiDraftable: parent.aiDraftable } : {}) }, source: parent,
    references: [{ sectionId: SECTION, templateId: PARENT, authority: 'recorded',
      ...(parent ? { sourceVerification: 'full-recorded' as const, source: { ...parent } } : {}),
      fields: { guidance_text: guidance, compliance_checklist: ['Use the actual source version.'] } }], items: [] };
}

function assembled(parent: RecordedTemplateSource, selected: RecordedTemplateSource): SavedTemplateReview {
  const result = reviewed(parent);
  result.references = [{ sectionId: SECTION, templateId: selected.id, authority: 'recorded', sourceVerification: 'full-recorded',
    source: { ...selected }, assembly: { version: 1, docId: DOC, programId: PROGRAM, templateId: selected.id,
      templateSnapshot: selected.sha256, fingerprint: 'b'.repeat(64) }, fields: { guidance_text: 'Selected section guidance, not the parent outline.' } }];
  return result;
}

function blockJson(block: string): Record<string, unknown> {
  const start = block.indexOf(BEGIN);
  const end = block.lastIndexOf(END);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return JSON.parse(block.slice(start + BEGIN.length, end).trim()) as Record<string, unknown>;
}

function publicReferences(review: SavedTemplateReview) {
  return review.references.map(reference => ({ sectionId: reference.sectionId, templateId: reference.templateId,
    authority: reference.authority, ...(reference.sourceVerification ? { sourceVerification: reference.sourceVerification } : {}),
    ...(reference.state ? { state: reference.state } : {}), fields: reference.fields,
    ...(reference.assembly ? { assembly: reference.assembly } : {}) }));
}

const read = (requestedRegion?: unknown) => savedSectionDraftTemplate(q, SCOPE, header, requestedRegion);
async function denied(code: string, status: number, requestedRegion?: unknown) {
  await expect(read(requestedRegion)).rejects.toBeInstanceOf(DraftTemplateReferenceError);
  await expect(read(requestedRegion)).rejects.toMatchObject({ code, status });
}

beforeEach(() => { h.review.mockReset().mockResolvedValue(reviewed()); });

describe('the adapter renders only the exact admitted section reference', () => {
  it('calls the existing validator for the captured document/project and one saved section without extra SQL', async () => {
    const before = JSON.stringify({ header, scope: SCOPE });
    const result = await read();
    expect(h.review).toHaveBeenCalledOnce();
    expect(h.review.mock.calls[0][0]).toBe(q);
    expect(h.review.mock.calls[0][1]).toMatchObject({ tenantId: 7, documentId: DOC, programId: PROGRAM });
    expect(h.review.mock.calls[0][2]).toBe(header);
    expect(h.review.mock.calls[0][3]).toEqual([{ sectionId: SECTION, code: '3' }]);
    expect(JSON.stringify({ header, scope: SCOPE })).toBe(before);
    expect(blockJson(result.referenceBlock)).toMatchObject({ sectionId: SECTION, sectionCode: '3',
      templateId: PARENT, sourceVerification: 'full-recorded', templateSource: source() });
  });

  it('honors an assembled section’s identity, region and limits over a different/manual parent', async () => {
    const parent = { ...source(), kind: 'preparation' as const, aiDraftable: false, authoringMode: 'manual', limitations: ['Parent manual source only.'] };
    const selected = source('CA', SELECTED);
    const input = assembled(parent, selected);
    h.review.mockResolvedValue(input);
    const before = JSON.stringify(input);
    const result = await read();
    expect(result.region).toBe('Health Canada');
    const payload = blockJson(result.referenceBlock);
    expect(payload).toMatchObject({ templateId: SELECTED,
      templateSource: selected, sourceVerification: 'full-recorded', references: publicReferences(input) });
    expect(payload).not.toHaveProperty('parentTemplateId');
    expect(result.referenceBlock).not.toContain(PARENT);
    expect(result.referenceBlock).not.toContain('Parent manual source only.');
    expect(JSON.stringify(input)).toBe(before);
  });

  it('keeps exact Unicode, quotes, newlines and checklist text without shortening the reference', async () => {
    const guidance = '研究資料🧬 — "original"\n' + 'Exact source statement. '.repeat(100);
    const input = reviewed(source('JP'), guidance);
    h.review.mockResolvedValue(input);
    const result = await read();
    expect(blockJson(result.referenceBlock).references).toEqual(publicReferences(input));
    expect(Buffer.byteLength(result.referenceBlock, 'utf8')).toBeLessThanOrEqual(LIMIT);
  });

  it('preserves null for an unbound document instead of inventing a program sentinel', async () => {
    h.review.mockResolvedValue(reviewed(null));
    await savedSectionDraftTemplate(q, { ...SCOPE, programId: null }, header, undefined);
    expect(h.review.mock.calls[0][1]).toMatchObject({ programId: null });
  });

  it('keeps an ad-hoc document available without inventing a template or eligibility record', async () => {
    h.review.mockResolvedValue({ template: { id: null, sourceState: 'not-recorded' }, source: null, references: [], items: [] } satisfies SavedTemplateReview);
    const result = await savedSectionDraftTemplate(q, SCOPE, { template_id: null, provenance: null }, undefined);
    expect(result.region).toBe('FDA');
    expect(blockJson(result.referenceBlock)).toMatchObject({ templateId: null, templateSource: null,
      sourceVerification: 'not-recorded', references: [] });
  });
});

describe('recorded limits are not replaced by current guidance or a parent template', () => {
  it.each([
    { aiDraftable: false }, { kind: 'preparation' as const }, { authoringMode: 'manual' },
  ])('refuses the explicit recorded restriction %j', async restriction => {
    h.review.mockResolvedValue(reviewed({ ...source(), ...restriction }));
    await denied('TEMPLATE_NOT_DRAFTABLE', 409);
  });

  it('refuses a selected manual section even when its parent permits drafting', async () => {
    h.review.mockResolvedValue(assembled(source(), { ...source('CA', SELECTED), aiDraftable: false, authoringMode: 'manual' }));
    await denied('TEMPLATE_NOT_DRAFTABLE', 409);
  });

  it('does not infer complete source fields or eligibility from current-reference text', async () => {
    const input = reviewed(null);
    input.references = [{ sectionId: SECTION, templateId: PARENT, authority: 'current-reference',
      fields: { guidance_text: 'Current guidance is not saved eligibility.', ai_prompts: '{"aiDraftable":true}' } }];
    h.review.mockResolvedValue(input);
    const result = await read('EMA');
    expect(result.region).toBe('EMA');
    expect(blockJson(result.referenceBlock)).toMatchObject({ sourceVerification: 'not-recorded',
      templateSource: null, references: publicReferences(input) });
  });

  it('retains historical identity-only source fields without filling missing eligibility', async () => {
    const input = reviewed(null);
    input.references[0].sourceVerification = 'identity-only';
    input.references[0].source = { id: PARENT };
    h.review.mockResolvedValue(input);
    const result = await read('PMDA');
    expect(blockJson(result.referenceBlock)).toMatchObject({ sourceVerification: 'identity-only', templateSource: { id: PARENT } });
  });

  it('still enforces an explicit negative restriction in historical identity-only fields', async () => {
    const input = reviewed(null);
    input.references[0].sourceVerification = 'identity-only';
    input.references[0].source = { id: PARENT, aiDraftable: false };
    h.review.mockResolvedValue(input);
    await denied('TEMPLATE_NOT_DRAFTABLE', 409);
  });

  it('reports canonical validation failure as unavailable instead of using another/current template', async () => {
    h.review.mockRejectedValue(new Error('Malformed recorded receipt'));
    await denied('TEMPLATE_REFERENCE_UNAVAILABLE', 503);
  });
});

describe('writing region follows the effective saved source without inventing a jurisdiction', () => {
  it.each([['US', 'FDA'], ['CA', 'Health Canada'], ['EU', 'EMA'], ['JP', 'PMDA']] as const)('derives %s writing control only when the caller omitted it', async (region, expected) => {
    h.review.mockResolvedValue(reviewed(source(region)));
    expect((await read()).region).toBe(expected);
    expect((await read(expected)).region).toBe(expected);
  });

  it('refuses an explicit region conflicting with the recorded section', async () => {
    h.review.mockResolvedValue(assembled(source(), source('JP', SELECTED)));
    await denied('TEMPLATE_REGION_MISMATCH', 409, 'FDA');
  });

  it('does not inherit a receiving region from the parent when the selected section is GLOBAL', async () => {
    h.review.mockResolvedValue(assembled(source(), source('GLOBAL', SELECTED)));
    expect((await read('PMDA')).region).toBe('PMDA');
  });

  it.each([reviewed(null), reviewed(source('GLOBAL'))])('retains legacy/default writing preference without promoting it to recorded jurisdiction', async input => {
    h.review.mockResolvedValue(input);
    expect((await read()).region).toBe('FDA');
    expect((await read('Health Canada')).region).toBe('Health Canada');
  });
});

describe('the entire mandatory reference block has one UTF-8 byte budget', () => {
  it('accepts the exact full-block ASCII boundary and refuses the next byte without clipping', async () => {
    let low = 1;
    let high = LIMIT;
    let best = '';
    let size = 0;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      h.review.mockResolvedValue(reviewed(source(), 'A'.repeat(middle)));
      try {
        const result = await read();
        best = result.referenceBlock;
        size = middle;
        low = middle + 1;
      } catch (error) {
        expect(error).toMatchObject({ status: 409, code: 'TEMPLATE_REFERENCE_TOO_LARGE' });
        high = middle - 1;
      }
    }
    expect(Buffer.byteLength(best, 'utf8')).toBe(LIMIT);
    expect(best).toContain('A'.repeat(size));
    h.review.mockResolvedValue(reviewed(source(), 'A'.repeat(size + 1)));
    await denied('TEMPLATE_REFERENCE_TOO_LARGE', 409);
  });

  it('counts multibyte Unicode rather than JavaScript character length', async () => {
    const guidance = '🧬'.repeat(4500);
    expect(guidance.length).toBeLessThan(LIMIT);
    expect(Buffer.byteLength(guidance, 'utf8')).toBeGreaterThan(LIMIT);
    h.review.mockResolvedValue(reviewed(source(), guidance));
    await denied('TEMPLATE_REFERENCE_TOO_LARGE', 409);
  });
});

describe('the one prompt composer retains caller and evidence inputs separately', () => {
  it('keeps exact tone/context/requirements and the source-attribution envelope, with a working-draft instruction', () => {
    const referenceBlock = `${BEGIN}\n{"sectionId":"${SECTION}","guidance":"REFERENCE ONLY"}\n${END}`;
    const evidenceBlock = '\n--- PROJECT DATA ROOM EVIDENCE ---\n[SRC-1] "Study"\nMeasured source statement.\n--- END EVIDENCE ---';
    const context = 'Caller context "verbatim"\nsecond line';
    const requirements = 'Do not shorten this user requirement. 🧬';
    const prompt = buildSectionDraftPrompt({ section: { module: 'M3', code: '3.2.S', title: 'Renamed section', product_code: 'P-17' },
      tone: 'Concise scientific writing', region: 'EMA', context, requirements, evidenceBlock, referenceBlock });
    for (const exact of [referenceBlock, evidenceBlock, context, requirements, 'Concise scientific writing', 'Renamed section', 'P-17']) {
      expect(prompt).toContain(exact);
    }
    expect(prompt).toMatch(/working draft/i);
    expect(prompt).not.toMatch(/compliance-ready/i);
    expect(prompt).toContain('"content"');
    expect(prompt).toContain('"attributions"');
    expect(prompt).toContain('"quote"');
    expect(prompt).toContain('"src"');
    expect(prompt).toContain('Never cite a src not shown above');
    expect(prompt).toContain('do NOT put [SRC-n] markers');
  });
});
