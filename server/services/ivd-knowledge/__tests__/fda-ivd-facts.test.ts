/**
 * FDA IVD corpus — two dated facts an IVD client acts on.
 *
 * 1. The PCCP has three components in FDA's final guidance of 2024-12-04
 *    (FR 2024-28361): Description of Modifications, Modification Protocol and
 *    Impact Assessment. "SACP" is the 2019 discussion-paper vocabulary and is
 *    not a component of the final guidance.
 * 2. The De Novo classification final rule (21 CFR 860 subpart D) was published
 *    2021-10-05 (86 FR 54826, FR Doc. 2021-21677) and took effect 2022-01-03.
 *    "Effective 2021" is wrong.
 *
 * Basis: docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/g-fda-ivd-facts-facts.md
 */

import { describe, it, expect } from 'vitest';
import { FDA_IVD_KNOWLEDGE } from '../regulatory/fda-ivd';
import type { KnowledgeEntry } from '../types';

function entry(id: string): KnowledgeEntry {
  const e = FDA_IVD_KNOWLEDGE.find((x) => x.id === id);
  if (!e) throw new Error(`missing corpus entry ${id}`);
  return e;
}

function allText(e: KnowledgeEntry): string {
  return [
    e.title,
    e.summary,
    e.detail,
    ...e.keyPoints,
    ...(e.pitfalls ?? []),
    ...e.citations.map((c) => `${c.label} ${c.url ?? ''}`),
  ].join('\n');
}

describe('FDA IVD corpus: PCCP components (final guidance 2024-12-04)', () => {
  const pccp = entry('fda.ivd.expedited-programs');
  const text = allText(pccp);

  it('names the three components of the final guidance', () => {
    expect(text).toContain('Description of Modifications');
    expect(text).toContain('Modification Protocol');
    expect(text).toContain('Impact Assessment');
  });

  it('does not use the 2019 SACP term anywhere in the FDA IVD corpus', () => {
    for (const e of FDA_IVD_KNOWLEDGE) {
      expect(allText(e), e.id).not.toMatch(/\bSACP\b/);
    }
  });

  it('cites the final guidance by its date and an FDA- or Federal Register-hosted URL', () => {
    const c = pccp.citations.find((x) => /Predetermined Change Control Plan|PCCP/.test(x.label) && /Guidance/.test(x.label));
    expect(c, 'PCCP guidance citation').toBeDefined();
    expect(c!.label).toMatch(/2024-12-04/);
    expect(c!.url ?? '').toMatch(/^https:\/\/(www\.)?(fda\.gov|federalregister\.gov)\//);
  });
});

describe('FDA IVD corpus: De Novo final rule dates (FR 2021-21677)', () => {
  const deNovo = entry('fda.ivd.de-novo');
  const text = allText(deNovo);

  it('states publication 2021-10-05 and effective date 2022-01-03', () => {
    expect(text).toContain('2021-10-05');
    expect(text).toContain('2022-01-03');
  });

  it('never says the rule took effect in 2021', () => {
    for (const e of FDA_IVD_KNOWLEDGE) {
      expect(allText(e), e.id).not.toMatch(/effective 2021|De Novo final rule, 2021\)/);
    }
  });

  it('cites the Federal Register document by number with a regulator-hosted URL', () => {
    const c = deNovo.citations.find((x) => /860 subpart D/.test(x.label));
    expect(c, '21 CFR 860 subpart D citation').toBeDefined();
    expect(c!.label).toContain('2021-21677');
    expect(c!.url ?? '').toMatch(/^https:\/\/(www\.)?(federalregister\.gov|govinfo\.gov)\//);
  });
});
