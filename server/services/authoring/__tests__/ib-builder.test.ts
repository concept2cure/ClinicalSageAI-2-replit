/**
 * Unit tests for the Investigator's Brochure (IB) authoring engine.
 *
 * Scope: the DETERMINISTIC parts of the engine — section-registry completeness,
 * input availability resolution, gap detection, and the per-section
 * rendered/partial/missing verdict. The AI gateway is mocked (mirroring how
 * csr-builder acquires `ai` via a dynamic import of '../../lib/unified-ai-client')
 * so `buildInvestigatorBrochure` runs offline and its output is fully
 * determined by the inputs rather than a live model.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the unified AI client BEFORE importing the engine. The engine does
// `await import('../../lib/unified-ai-client.js')` at module load, so the mock
// must be registered first. `vi.hoisted` ensures `completeMock` exists when the
// hoisted `vi.mock` factory runs. `ai.complete` returns a deterministic stub.
const { completeMock } = vi.hoisted(() => ({
  completeMock: vi.fn(async (_messages: unknown, _options?: unknown) => 'AI_STUB_DRAFT'),
}));
vi.mock('../../../lib/unified-ai-client.js', () => ({
  ai: { complete: completeMock },
  default: { complete: completeMock },
}));

import {
  IB_STRUCTURE,
  getIBStructure,
  flattenSections,
  resolveAvailability,
  detectSectionGaps,
  sectionStatus,
  buildInvestigatorBrochure,
  type IBBuildRequest,
  type IBSection,
} from '../ib-builder';
import type { M2Summary } from '../../m2-summary-builders';

function findSection(number: string): IBSection {
  const s = flattenSections().find(x => x.number === number);
  if (!s) throw new Error(`section ${number} not found`);
  return s;
}

function fakeSummary(sectionKey: string, narrative: string): M2Summary {
  return {
    sectionKey,
    title: sectionKey,
    narrative,
    tables: [],
    inputSectionKeys: [],
    completeness: 100,
    gaps: [],
    generatedAt: new Date().toISOString(),
  };
}

describe('IB section registry (ICH E6(R2) §7)', () => {
  it('exposes the full ICH E6(R2) §7 section set in order', () => {
    const flat = flattenSections();
    const numbers = flat.map(s => s.number);
    // Front matter + the seven numbered IB chapters and their children.
    for (const required of [
      '0', // Title Page
      '0a', // Confidentiality Statement
      '0b', // Table of Contents
      '1', // Summary
      '2', // Introduction
      '3', // Physical/Chemical/Pharmaceutical Properties and Formulation
      '4', '4.1', '4.2', '4.3', // Nonclinical Studies (pharm / PK / tox)
      '5', '5.1', '5.2', '5.3', // Effects in Humans (PK / safety&efficacy / marketing)
      '6', // Summary of Data and Guidance for the Investigator
      '7', // References
    ]) {
      expect(numbers).toContain(required);
    }
  });

  it('covers every IB content domain via at least one section', () => {
    const domains = new Set(flattenSections().flatMap(s => s.inputs));
    for (const d of ['product', 'nonclinical', 'clinical', 'safety'] as const) {
      expect(domains.has(d)).toBe(true);
    }
  });

  it('returns a deep copy from getIBStructure so the registry is immutable', () => {
    const copy = getIBStructure();
    copy[0].title = 'MUTATED';
    expect(IB_STRUCTURE[0].title).not.toBe('MUTATED');
  });

  it('flattens parents and their children into a single ordered list', () => {
    const parents = IB_STRUCTURE.length;
    const children = IB_STRUCTURE.reduce((n, s) => n + (s.childSections?.length ?? 0), 0);
    expect(flattenSections()).toHaveLength(parents + children);
  });
});

describe('input availability resolution', () => {
  it('flags every domain absent for a bare product-only request', () => {
    const avail = resolveAvailability({ product: { productName: 'BX-115' } });
    expect(avail.product).toBe(false);
    expect(avail.nonclinical).toBe(false);
    expect(avail.clinical).toBe(false);
    expect(avail.safety).toBe(false);
    expect(avail.none).toBe(true);
  });

  it('detects each domain from its respective inputs', () => {
    const avail = resolveAvailability({
      product: { productName: 'BX-115', formulation: '10 mg tablet' },
      nonclinicalOverview: fakeSummary('2.4', 'nonclinical narrative'),
      clinicalSummary: fakeSummary('2.7', 'clinical narrative'),
      safety: { identifiedRisks: ['hepatotoxicity'] },
    });
    expect(avail.product).toBe(true);
    expect(avail.nonclinical).toBe(true);
    expect(avail.clinical).toBe(true);
    expect(avail.safety).toBe(true);
  });
});

describe('gap detection and section verdict', () => {
  const allAvailable = {
    product: true,
    nonclinical: true,
    clinical: true,
    safety: true,
    none: true,
  };
  const noneAvailable = {
    product: false,
    nonclinical: false,
    clinical: false,
    safety: false,
    none: true,
  };

  it('reports no gaps and renders boilerplate sections regardless of inputs', () => {
    const titlePage = findSection('0');
    expect(detectSectionGaps(titlePage, noneAvailable)).toHaveLength(0);
    expect(sectionStatus(titlePage, noneAvailable, [])).toBe('rendered');
  });

  it('marks a single-domain section MISSING when its input is absent', () => {
    const nonclinical = findSection('4'); // requires ['nonclinical']
    const gaps = detectSectionGaps(nonclinical, noneAvailable);
    expect(gaps.length).toBe(1);
    expect(sectionStatus(nonclinical, noneAvailable, gaps)).toBe('missing');
  });

  it('marks a single-domain section RENDERED when its input is present', () => {
    const nonclinical = findSection('4.1'); // requires ['nonclinical']
    const gaps = detectSectionGaps(nonclinical, allAvailable);
    expect(gaps).toHaveLength(0);
    expect(sectionStatus(nonclinical, allAvailable, gaps)).toBe('rendered');
  });

  it('marks a multi-domain section PARTIAL when only some inputs are present', () => {
    const effects = findSection('5'); // requires ['clinical', 'safety']
    const onlyClinical = { ...noneAvailable, clinical: true };
    const gaps = detectSectionGaps(effects, onlyClinical);
    expect(gaps).toHaveLength(1); // safety missing
    expect(sectionStatus(effects, onlyClinical, gaps)).toBe('partial');
  });
});

describe('buildInvestigatorBrochure (deterministic with mocked AI)', () => {
  const minimalRequest: IBBuildRequest = { product: { productName: 'BX-115' } };

  beforeEach(() => {
    completeMock.mockClear();
  });

  it('produces a result for every section, with verdicts driven by inputs', async () => {
    const job = await buildInvestigatorBrochure(minimalRequest);
    expect(job.status).toBe('complete');
    expect(job.sections).toHaveLength(flattenSections().length);

    // With no data domains supplied, the data-bearing sections are missing...
    const summarySection = job.sections.find(s => s.number === '1')!;
    expect(summarySection.status).toBe('missing');
    expect(summarySection.gaps.length).toBeGreaterThan(0);

    // ...but boilerplate sections still render (drafted via the mocked gateway).
    const titlePage = job.sections.find(s => s.number === '0')!;
    expect(titlePage.status).toBe('rendered');
    expect(titlePage.content).toBe('AI_STUB_DRAFT');
  });

  it('uses deterministic templates (and embeds the product name) when templateOnly is set', async () => {
    const job = await buildInvestigatorBrochure({ ...minimalRequest, templateOnly: true });
    const titlePage = job.sections.find(s => s.number === '0')!;
    expect(titlePage.status).toBe('rendered');
    expect(titlePage.content).toContain('BX-115');
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('renders nonclinical/clinical/safety sections once their inputs are supplied', async () => {
    const job = await buildInvestigatorBrochure({
      product: { productName: 'BX-115', formulation: '10 mg tablet', physicalChemicalProperties: 'white powder' },
      nonclinicalOverview: fakeSummary('2.4', 'Repeat-dose tox NOAEL 50 mg/kg.'),
      clinicalOverview: fakeSummary('2.5', 'Phase 1 PK characterized.'),
      clinicalSummary: fakeSummary('2.7', 'Favorable safety.'),
      safety: { identifiedRisks: ['nausea'], marketingExperience: 'Not marketed.' },
    });

    const nonclinical = job.sections.find(s => s.number === '4')!;
    expect(nonclinical.status).toBe('rendered');
    expect(nonclinical.content).toBe('AI_STUB_DRAFT'); // drafted via mocked gateway

    const effects = job.sections.find(s => s.number === '5')!; // clinical + safety
    expect(effects.status).toBe('rendered');

    // Completeness is the fraction of REQUIRED sections rendered; with all
    // domains supplied it should be high (100 here).
    expect(job.completeness).toBe(100);
    expect(completeMock).toHaveBeenCalled();
  });

  it('drives completeness down when only some domains are present', async () => {
    const partial = await buildInvestigatorBrochure({
      product: { productName: 'BX-115', formulation: '10 mg tablet' },
      nonclinicalOverview: fakeSummary('2.4', 'tox data'),
      // no clinical, no safety
    });
    expect(partial.completeness).toBeLessThan(100);
    expect(partial.completeness).toBeGreaterThan(0);
  });
});

describe('IB template mode does not report un-drafted sections complete', () => {
  const fullTemplateRequest: IBBuildRequest = {
    templateOnly: true,
    product: { productName: 'BX-115', formulation: '10 mg tablet', physicalChemicalProperties: 'white powder' },
    nonclinicalOverview: fakeSummary('2.4', 'Repeat-dose tox NOAEL 50 mg/kg.'),
    clinicalOverview: fakeSummary('2.5', 'Phase 1 PK characterized.'),
    clinicalSummary: fakeSummary('2.7', 'Favorable safety.'),
    safety: { identifiedRisks: ['nausea'] }, // NOTE: no marketingExperience
  };

  it('§1 Summary is NOT rendered in template mode — it still carries the "to be drafted" placeholder', async () => {
    const job = await buildInvestigatorBrochure(fullTemplateRequest);
    const summary = job.sections.find(s => s.number === '1')!;
    // Its input domains are all present, so pre-fix it reported 'rendered'
    // while the body still said "[Integrated summary to be drafted ...]".
    expect(summary.content).toMatch(/\[Integrated summary to be drafted/i);
    expect(summary.status).not.toBe('rendered');
  });

  it('§5.3 Marketing Experience does not assert "not currently marketed" when unknown', async () => {
    const job = await buildInvestigatorBrochure(fullTemplateRequest);
    const marketing = job.sections.find(s => s.number === '5.3')!;
    expect(marketing.content).not.toMatch(/not currently marketed in any country/i);
    expect(marketing.content).toMatch(/to be confirmed by the Sponsor/i);
    expect(marketing.status).not.toBe('rendered');
  });

  it('a boilerplate section with an optional [Sponsor] placeholder still renders', async () => {
    const job = await buildInvestigatorBrochure(fullTemplateRequest);
    const titlePage = job.sections.find(s => s.number === '0')!;
    expect(titlePage.status).toBe('rendered'); // boilerplate exempt from the placeholder demotion
  });
});
