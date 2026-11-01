/**
 * generate_document writes no regulated document from content the model
 * supplies (CLAUDE.md Rule 2; Rule 2 audit S6b, 2026-11-01; ONE_DESIGN_PLAN S4).
 *
 * generate_document built a DOCX from `sections[].content`, which the model
 * writes, for any document type it was given. A CSR, a Module 3, a CER, a
 * 510(k), the Module 2, 4 and 5 bodies and an IB came out with every figure
 * typed in the call. The refusal for an eCTD backbone and an ICSR sat after
 * that branch, so sections went straight past it. An omitted document_type was
 * built as a CSR.
 *
 * Each of those documents has a record path. The CSR is drafted per section
 * from a retained run's engine tables, Module 3 is compiled from the CMC
 * records, the CER is the device's stored CER, the 510(k) is the project's
 * eSTAR, Module 2 has its record-composed tools, and the IB is the project's
 * document in the one editor. The refusal names that path. The intelligence
 * flows that offered "Generate CSR / 510(k) / CER / Module 3" offer it too.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  generateFromScratch: vi.fn(async () => ({ outputPath: '/tmp/x.docx', format: 'docx', sizeBytes: 10, buildDurationMs: 1 })),
  buildFromTemplate: vi.fn(async () => ({ outputPath: '/tmp/x.docx', format: 'docx', sizeBytes: 10, replacementsApplied: 1, buildDurationMs: 1 })),
}));
vi.mock('../../docx/masterDocumentBuilder.js', () => ({
  getMasterDocumentBuilder: () => ({ generateFromScratch: h.generateFromScratch, buildFromTemplate: h.buildFromTemplate }),
}));

// The governed-write guard admits only an approved model's turn; the support
// helper runs the handler as one, so these cases reach the handler itself.
import { approvedToolHandler } from './support/approved-tool-handler';
import { GENERATE_DOCUMENT } from '../AnaToolDefinitions';
import { buildSuggestedActions } from '../intelligence-questions/engine.js';
import { getFlowDefinition } from '../intelligence-questions/flows/index.js';
import type { FlowCategory } from '../intelligence-questions/types.js';

const CTX = { organizationId: 7, userId: 3 } as never;
const SECTIONS = [{ number: '11.4.1', title: 'Primary efficacy', content: 'ORR 42% (95% CI 35–49); assay 99.8%' }];
const run = async (input: Record<string, unknown>) => JSON.parse(await approvedToolHandler('generate_document')!(input, CTX));

beforeEach(() => {
  h.generateFromScratch.mockClear();
  h.buildFromTemplate.mockClear();
});

/** Each refused type, and a tool or route its refusal names. */
const REFUSED: Array<[string, RegExp]> = [
  ['csr', /get_csr_section_evidence/],
  ['ctd_module5', /get_csr_section_evidence/],
  ['ctd_module3', /module3-os\/compile/],
  ['ctd_module2', /draft_clinical_overview_m2_5/],
  ['ctd_module4', /study reports/],
  ['cer', /assess_stored_cer/],
  ['510k', /write_kit_section/],
  ['ib', /draft_authoring_document/],
  ['pma', /P-55/],
  ['ectd_backbone', /submission assembly/],
  ['icsr', /safety-report/],
];

describe('generate_document refuses a regulated document written in the call', () => {
  it.each(REFUSED)('%s with sections: refused, its record path named, nothing built', async (documentType, path) => {
    const out = await run({ document_type: documentType, title: 'T', sections: SECTIONS });
    expect(out).toMatchObject({ success: false, refused: true, documentType });
    expect(out.message).toMatch(path);
    expect(JSON.stringify(out)).not.toContain('42%');
    expect(h.generateFromScratch).not.toHaveBeenCalled();
  });

  it('refuses template mode for those types too: the replacements are model-written as well', async () => {
    const out = await run({ document_type: 'csr', title: 'T', template_path: 'uploads/csr.docx', replacements: { '{{ORR}}': '42%' } });
    expect(out).toMatchObject({ success: false, refused: true, documentType: 'csr' });
    expect(h.buildFromTemplate).not.toHaveBeenCalled();
  });

  it('asks for the document type instead of building a CSR when none is given', async () => {
    const out = await run({ title: 'T', sections: SECTIONS });
    expect(out).toMatchObject({ status: 'needs_parameters', missing: ['document_type'] });
    expect(h.generateFromScratch).not.toHaveBeenCalled();
  });

  it.each(['protocol', 'sap'])('still builds a %s, whose content is design rather than results', async (documentType) => {
    const out = await run({ document_type: documentType, title: 'T', sections: [{ number: '1', title: 'Objectives', content: 'Primary objective' }] });
    expect(out, JSON.stringify(out)).toMatchObject({ success: true });
    expect(h.generateFromScratch).toHaveBeenCalledTimes(1);
  });
});

describe('the definition says which documents it does not write', () => {
  it('does not claim to generate a CSR, CER, 510(k) or ICSR, and names where they are made', () => {
    expect(GENERATE_DOCUMENT.description).not.toMatch(/\(CSR, CTD section, CER, 510\(k\)/);
    expect(GENERATE_DOCUMENT.description).toMatch(/refuses/i);
    expect(GENERATE_DOCUMENT.description.length).toBeLessThanOrEqual(1024);
  });
});

describe('the intelligence flows offer the record path, not generate_document', () => {
  const lookupCtx = { organizationId: 1, userId: 1, projectId: null, clientType: null };
  it.each<[FlowCategory, string]>([
    ['csr_report', 'get_csr_section_evidence'],
    ['device_510k', 'write_kit_section'],
    ['cer_report', 'assess_stored_cer'],
    ['cmc_specification', 'navigate_to'],
    ['device_pma', 'write_kit_section'],
  ])('%s suggests %s and no generate_document', (category, tool) => {
    const actions = buildSuggestedActions(getFlowDefinition(category, lookupCtx)!);
    const types = actions.map((a) => a.actionType);
    expect(types).toContain(tool);
    expect(types).not.toContain('generate_document');
  });
});
