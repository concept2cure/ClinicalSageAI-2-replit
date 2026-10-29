/**
 * CSR slice 4 (docs/design/CSR_END_TO_END_2026-10-29.md): the E3 writing
 * knowledge reaches AnA through the two tools it already calls —
 * get_document_section_requirements (the per-heading E3 brief) and
 * medical_writing_guidance (the CSR writing standard, per section). Proved
 * through the registered handlers, not the helpers behind them.
 */
import { describe, it, expect, vi } from 'vitest';

const { resolveSignerOrgRole } = vi.hoisted(() => ({
  resolveSignerOrgRole: vi.fn(async (): Promise<string | null> => 'member'),
}));
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole }));

import { getToolHandler } from '../AnaToolExecutor';
import { documentSectionRequirements } from '../regulatory-knowledge-tools';
import { MEDICAL_WRITING_GUIDANCE } from '../evidence-literature-tool-defs';

async function guidance(input: Record<string, unknown>) {
  const handler = getToolHandler('medical_writing_guidance');
  expect(typeof handler).toBe('function');
  return JSON.parse(await handler!(input, {} as never));
}

describe('get_document_section_requirements returns the E3 writing knowledge', () => {
  it('§11.4.1 carries its writing rules, the estimand attributes and E9(R1)', () => {
    const out = JSON.parse(documentSectionRequirements({ document: 'csr', section: '11.4.1' }));
    const text = JSON.stringify(out);
    expect(text).toContain('How to write it');
    expect(text).toMatch(/intercurrent event/i);
    expect(text).toContain('ICH E9(R1)');
  });

  it('§10.1 names its display model, E3 Annex IVa', () => {
    const text = documentSectionRequirements({ document: 'csr', section: '10.1' });
    expect(text).toContain('Annex IVa');
  });

  it('§16.1.2, title-only until 2026-10-29, says what it carries and how it is compiled', () => {
    const text = documentSectionRequirements({ document: 'csr', section: '16.1.2' });
    expect(text).toMatch(/unique pages/i);
    expect(text).toContain('Presented as');
  });
});

describe('medical_writing_guidance returns the CSR writing standard per section', () => {
  it('declares a section input', () => {
    expect(Object.keys(MEDICAL_WRITING_GUIDANCE.input_schema.properties as object)).toContain('section');
  });

  it('a CSR request returns report-wide tense, voice, hedging and causality rules and the terminology standards', async () => {
    const out = await guidance({ document_type: 'csr' });
    const rules = out.csrWriting.rules.map((r: { topic: string }) => r.topic);
    for (const topic of ['tense', 'voice', 'hedging', 'causality', 'interpretation']) expect(rules).toContain(topic);
    const terms = out.csrWriting.terminology.map((t: { id: string }) => t.id);
    for (const id of ['meddra', 'ctcae', 'whodd', 'cdisc']) expect(terms).toContain(id);
    expect(out.csrWriting.sentencePatterns.map((p: { id: string }) => p.id)).toEqual(
      expect.arrayContaining(['disposition', 'demographics', 'efficacy-estimate', 'ae-frequency', 'lab-shift']),
    );
    expect(out.brief).toContain('CSR writing standard');
  });

  it('with a section, returns that heading’s own rules from the E3 tree', async () => {
    const out = await guidance({ document_type: 'csr', section: '§12.2.2' });
    expect(out.csrWriting.section.number).toBe('12.2.2');
    expect(out.csrWriting.section.writing.length).toBeGreaterThan(0);
    expect(out.brief).toContain('§12.2.2');
  });

  it('an E3 number that does not exist is said, never answered from another heading', async () => {
    const out = await guidance({ document_type: 'csr', section: '12.9' });
    expect(out.csrWriting.section).toBeNull();
    expect(out.csrWriting.sectionNotFound).toMatch(/12\.9/);
  });

  it('therapeutic-area vocabulary reaches the CSR: oncology, vaccines, psychiatry, endocrinology', async () => {
    const onc = await guidance({ document_type: 'csr', therapeutic_area: 'oncology' });
    expect(onc.brief).toMatch(/iRECIST/);
    expect(onc.therapeuticArea.csrVocabulary.join(' ')).toMatch(/duration of response/i);
    const vac = await guidance({ document_type: 'csr', therapeutic_area: 'vaccines' });
    expect(vac.therapeuticArea.csrVocabulary.join(' ')).toMatch(/solicited/i);
    const psy = await guidance({ document_type: 'csr', therapeutic_area: 'psychiatry' });
    expect(psy.resolved.therapeuticArea).toBe('psychiatry');
    expect(psy.therapeuticArea.csrVocabulary.join(' ')).toMatch(/MADRS|PANSS/);
    const endo = await guidance({ document_type: 'csr', therapeutic_area: 'diabetes' });
    expect(endo.therapeuticArea.csrVocabulary.join(' ')).toMatch(/HbA1c/);
  });

  it('a non-CSR document carries no CSR writing block', async () => {
    const out = await guidance({ document_type: 'protocol' });
    expect(out.csrWriting).toBeUndefined();
  });
});
