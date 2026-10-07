import { describe, it, expect, vi } from 'vitest';

const gatewayRoute = vi.hoisted(() =>
  vi.fn(async (_request: unknown) => ({
    content: 'draft',
    model: 'claude-opus-4',
    usage: { inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0 },
    latencyMs: 1,
    finishReason: 'end_turn',
  })),
);
vi.mock('../../ai-gateway/gateway', () => ({ getGateway: () => ({ route: gatewayRoute }) }));

import { AnaDocumentDraftingService, resolveDraftingRequirements, resolveSectionRequirements } from '../AnaDocumentDraftingService';
import { renderSectionBrief } from '../../ind/ctd/section-brief';

/**
 * The generic drafting engine must ground every draft in the section blueprint,
 * not just the framework-level system prompt. resolveSectionRequirements is the
 * pure resolver that injects the governing standard + content type + required
 * flag for (submissionType, sectionType).
 */
describe('resolveSectionRequirements — blueprint grounding', () => {
  it('grounds a drug CMC section in its ICH guidance (matched by code or title)', () => {
    for (const sectionType of ['3.2.S', 'Drug Substance', 'drug substance']) {
      const req = resolveSectionRequirements('US_IND', sectionType);
      expect(req, `US_IND / ${sectionType}`).not.toBeNull();
      expect(req).toContain('Drug Substance');
      expect(req).toContain('Governing standard: ICH M4Q');
      expect(req).toContain('REQUIRED section');
    }
  });

  it('grounds a device section in the device blueprint (not the drug CTD)', () => {
    const req = resolveSectionRequirements('US_510K', 'Substantial Equivalence');
    expect(req).not.toBeNull();
    expect(req).toContain('Substantial Equivalence');
    expect(req).toContain('510(k)');
  });

  it('grounds an IVD performance section for an IVD marketing type', () => {
    const req = resolveSectionRequirements('US_510K_IVD', 'Analytical Performance');
    expect(req).not.toBeNull();
    expect(req).toContain('Analytical Performance');
  });

  it('returns null when the submission type is absent or unresolvable', () => {
    expect(resolveSectionRequirements(undefined, 'Drug Substance')).toBeNull();
    expect(resolveSectionRequirements('NOT_A_REAL_TYPE', 'Drug Substance')).toBeNull();
  });

  it('returns null for a section the blueprint does not contain', () => {
    expect(resolveSectionRequirements('US_IND', 'Totally Fabricated Section 99')).toBeNull();
  });
});

/**
 * g-batch-draft-canonical (D2 findings 28 and 74, 2026-10-05).
 *
 * batch_draft_sections and /api/claude/batch draft through draftDocument, and
 * resolveSectionRequirements was their only statement of what a section must
 * contain. It read the 17-row CTD_SECTIONS blueprint: an IND's 1.2 was
 * "Administrative Forms" (FDA's eCTD table of contents: 1.1 Forms, 1.2 Cover
 * letters), and 2.7.4, 5.3.5.3, 1.14.4.1 and 3.2.P.5 got nothing at all. For a
 * CTD-framework entry the requirements now come from the canonical record
 * (server/services/ind/ctd/requirements-resolver.ts resolveRequirements):
 * Modules 2–5 for any region, Module 1 only for a US entry, and an explicit
 * "not indexed — do not supply from memory" line otherwise. A non-CTD
 * blueprint (510(k), an IB's own numbering) is never briefed as a CTD module.
 */
const firstLine = (code: string) => renderSectionBrief(code)!.split('\n')[0];

describe('resolveSectionRequirements — CTD entries draft against the canonical record', () => {

  it('briefs 2.7.4, 5.3.5.3 and 3.2.P.5 from the record (the blueprint had no row for them)', () => {
    const r274 = resolveSectionRequirements('nda', '2.7.4');
    expect(r274).not.toBeNull();
    expect(r274).toContain('Summary of Clinical Safety');
    expect(r274).toContain(firstLine('2.7.4'));

    const r5353 = resolveSectionRequirements('US_NDA', '5.3.5.3');
    expect(r5353).toContain(firstLine('5.3.5.3'));

    const r32p5 = resolveSectionRequirements('bla', '3.2.P.5');
    expect(r32p5).toContain('Control of Drug Product');
    expect(r32p5).toContain(firstLine('3.2.P.5'));
  });

  it("names a US IND's 1.2 the cover letter, never the blueprint's 'Administrative Forms'", () => {
    const r = resolveSectionRequirements('ind', '1.2');
    expect(r).toContain('Cover Letter');
    expect(r).not.toContain('Administrative Forms');
    expect(r).toContain(firstLine('1.2'));
  });

  it("briefs a US IND's 1.14.4.1 as the Investigator's Brochure", () => {
    const r = resolveSectionRequirements('ind', '1.14.4.1');
    expect(r).not.toBeNull();
    expect(r).toContain("Investigator's Brochure");
  });

  it('says a CTD code the record does not index is not indexed, instead of returning nothing', () => {
    const r = resolveSectionRequirements('nda', '9.9.9');
    expect(r).not.toBeNull();
    expect(r).toContain('9.9.9');
    expect(r).toContain('do not supply');
  });

  it("never gives an EU MAA the US Module 1 or the blueprint's Module 1 row", () => {
    for (const sectionType of ['1.2', 'Cover Letter']) {
      const r = resolveSectionRequirements('EU_MAA', sectionType);
      expect(r, `EU_MAA / ${sectionType}`).not.toBeNull();
      expect(r).not.toContain('Cover Letter');
      expect(r).not.toContain('Administrative Forms');
      expect(r).toContain('Module 1 is regional');
      expect(r).toContain('EU');
      expect(r).toContain('do not supply');
    }
  });

  it('briefs Modules 2–5 from the ICH record for a non-US CTD entry', () => {
    const r = resolveSectionRequirements('EU_MAA', '2.7.4');
    expect(r).toContain(firstLine('2.7.4'));
  });

  it('answers a unique canonical title with that section, and lists every code for an ambiguous one', () => {
    expect(resolveSectionRequirements('US_NDA', 'summary of clinical safety')).toContain(firstLine('2.7.4'));

    const lit = resolveSectionRequirements('US_IND', 'Literature References');
    expect(lit).not.toBeNull();
    for (const code of ['2.7.5', '4.3', '5.4']) expect(lit).toContain(code);
    expect(lit).not.toContain('## Drafting');
  });

  it('adds the record brief to a blueprint title match outside Module 1 (US IND "Drug Substance" → 3.2.S)', () => {
    const r = resolveSectionRequirements('US_IND', 'Drug Substance');
    expect(r).toContain('Governing standard: ICH M4Q');
    expect(r).toContain(renderSectionBrief('3.2.S')!.split('\n')[0]);
  });

  it('never briefs a non-CTD blueprint section as a CTD module (510(k) §3, an IB section 3)', () => {
    for (const [type, section] of [['fda_510k', 'Device Description'], ['US_510K', '3'], ['ICH_IB', '3']]) {
      const r = resolveSectionRequirements(type, section);
      expect(r, `${type} / ${section}`).not.toBeNull();
      expect(r).not.toContain('Module 3');
      expect(r).not.toContain('## Drafting');
      expect(r).toMatch(/authoring blueprint|SECTION AUTHORING GUIDANCE/);
    }
    expect(resolveSectionRequirements('fda_510k', 'Device Description')).toContain('Device Description');
  });
});

/**
 * Review round 1 (g-batch-draft-canonical): a canonical title held by a
 * different section must never override the entry's own row with that title,
 * and a leading code decides even when the title that follows it is wrong.
 */
describe("resolveDraftingRequirements — titles and codes resolve inside the entry's own outline", () => {
  it("answers a title from the entry's own blueprint row before a same-titled canonical section elsewhere", () => {
    for (const type of ['US_DMF', 'ICH_M3_DS']) {
      const r = resolveDraftingRequirements(type, 'Stability');
      expect(r.requirementsSource, `${type} / Stability`).toBe('blueprint+record:ctd-section:3.2.S.7:exact');
      expect(r.requirements).toContain(firstLine('3.2.S.7'));
      expect(r.requirements).not.toContain(firstLine('3.2.P.8'));
    }

    const intro = resolveDraftingRequirements('ICH_QOS', 'Introduction');
    expect(intro.requirementsSource).toBe('blueprint+record:ctd-section:2.3:ancestor');
    expect(intro.requirements).toContain('2.3.I');
    expect(intro.requirements).not.toContain(firstLine('2.2'));

    const regional = resolveDraftingRequirements('ICH_QOS', 'Regional Information');
    expect(regional.requirementsSource).toBe('blueprint+record:ctd-section:2.3.R:exact');
    expect(regional.requirements).not.toContain(firstLine('3.2.R'));

    // A title the record holds twice is the entry's own row when only one of
    // those sections lies inside the entry's outline (a DMF has no 3.2.P).
    expect(resolveDraftingRequirements('US_DMF', 'Reference Standards or Materials').requirementsSource)
      .toBe('blueprint+record:ctd-section:3.2.S.5:exact');
    expect(resolveDraftingRequirements('ICH_M3_DP', 'Reference Standards or Materials').requirementsSource)
      .toBe('blueprint+record:ctd-section:3.2.P.6:exact');
    // …and stays a candidate listing when several lie inside it (an IND's 2.7.5 and 5.4).
    expect(resolveDraftingRequirements('US_IND', 'Literature References').requirementsSource).toBe('record:candidates');

    // A title the outline lacks, which the record holds only outside the
    // entry's modules, is not briefed as that other module's section.
    const qosStability = resolveDraftingRequirements('ICH_QOS', 'Stability');
    expect(qosStability.requirementsSource).toBe('record:outside-outline');
    expect(qosStability.requirements).toContain('3.2.P.8');
    expect(qosStability.requirements).not.toContain(firstLine('3.2.P.8'));
    expect(qosStability.requirements).toContain('do not supply');
  });

  it('treats a leading section code as the code whatever title follows it, and says when the title disagrees', () => {
    const r = resolveDraftingRequirements('US_NDA', '2.7.4 Clinical Safety');
    expect(r.requirementsSource).toBe('record:ctd-section:2.7.4:exact+title-mismatch');
    expect(r.requirements).toContain(firstLine('2.7.4'));
    expect(r.requirements).toContain('"Clinical Safety"');

    // The CTD_SECTIONS blueprint's own "1.1 Cover Letter": drafted to FDA's 1.1,
    // with the record's 1.2 Cover Letter named so the author can correct it.
    const cl = resolveDraftingRequirements('US_IND', '1.1 Cover Letter');
    expect(cl.requirementsSource).toBe('record:ctd-section:1.1:parent+title-mismatch');
    expect(cl.requirements).toContain('1.2');

    // A matching title adds no note.
    expect(resolveDraftingRequirements('US_NDA', '2.7.4 Summary of Clinical Safety').requirementsSource)
      .toBe('record:ctd-section:2.7.4:exact');
    expect(resolveDraftingRequirements('ICH_M3_DS', '3.2.S.7 Stability').requirementsSource)
      .toBe('blueprint+record:ctd-section:3.2.S.7:exact');
  });
});

describe('draftDocument — the canonical brief reaches the model, and its source is recorded', () => {
  it('sends the 2.7.4 brief in the user message and requirementsSource in gateway metadata', async () => {
    gatewayRoute.mockClear();
    const service = new (AnaDocumentDraftingService as unknown as new () => AnaDocumentDraftingService)();
    await service.draftDocument({ framework: 'ich_clinical', submissionType: 'US_NDA', sectionType: '2.7.4', instructions: 'Draft it.' });
    const sent = gatewayRoute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }>; metadata: Record<string, unknown> };
    const user = sent.messages.find((m) => m.role === 'user')!.content;
    expect(user).toContain(renderSectionBrief('2.7.4')!.split('\n')[0]);
    expect(sent.metadata.requirementsSource).toBe('record:ctd-section:2.7.4:exact');
  });

  it('records a 510(k) section as blueprint-sourced and sends no CTD brief', async () => {
    gatewayRoute.mockClear();
    const service = new (AnaDocumentDraftingService as unknown as new () => AnaDocumentDraftingService)();
    await service.draftDocument({ framework: 'fda_510k', submissionType: 'fda_510k', sectionType: 'Device Description', instructions: 'Draft it.' });
    const sent = gatewayRoute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }>; metadata: Record<string, unknown> };
    const user = sent.messages.find((m) => m.role === 'user')!.content;
    expect(user).not.toContain('## Drafting');
    expect(sent.metadata.requirementsSource).toBe('blueprint');
  });
});
