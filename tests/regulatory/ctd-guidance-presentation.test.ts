/**
 * What the CTD record presents to AnA, as she sees it (D2, 2026-10-04,
 * docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-04-depth/b3-guidance-presentation-facts.md):
 *   - the Pre-NDA / Pre-BLA efficacy and safety briefing components placed the
 *     ISE / ISS at CTD 2.7.3 / 2.7.4. FDA files them in 5.3.5.3 with a summary
 *     in 2.7.3 / 2.7.4, as this record's own NDA/BLA components say;
 *   - 2.7.1–2.7.4 listed their 2.5.x counterpart as a dependency ("drafted
 *     first") while 2.5.x listed them back, a cycle that contradicts the
 *     2.7-before-2.5 drafting order;
 *   - 2.5.6 named none of the M4E(R2) headings 2.5.6.1–2.5.6.5, and its fields
 *     must fit the section-brief caps so every heading reaches the brief.
 */
import { describe, it, expect } from 'vitest';
import { CTD_AUTHORING_GUIDANCE, getLifecycleDocumentType } from '../../server/services/ind/ctd/index';
import { renderSectionBrief } from '../../server/services/ind/ctd/section-brief';

const G = CTD_AUTHORING_GUIDANCE;

/** An ISS/ISE phrase followed, within the clause, by "per CTD 2.7.x" or "(CTD 2.7.x". */
const ISS_ISE_AT_27 = /(integrated summary of (safety|effectiveness)|\bISS\b|\bISE\b)[^."]{0,60}(per |\()CTD 2\.7\.[34]/i;

describe('Pre-NDA / Pre-BLA briefing components place the ISS/ISE in 5.3.5.3', () => {
  for (const id of ['pre_nda_meeting', 'pre_bla_meeting']) {
    for (const code of ['MTG-EFF', 'MTG-SAFETY']) {
      it(`${id} ${code}`, () => {
        const component = getLifecycleDocumentType(id)?.components.find((c) => c.code === code);
        expect(component, `${id} ${code} is registered`).toBeDefined();
        const text = JSON.stringify(component);
        expect(text).toContain('5.3.5.3');
        expect(text).not.toMatch(ISS_ISE_AT_27);
      });
    }
  }
});

describe('2.7.1–2.7.4 do not depend on the 2.5 sections that are drafted after them', () => {
  for (const code of ['2.7.1', '2.7.2', '2.7.3', '2.7.4']) {
    it(code, () => {
      expect(G[code].dependencies.filter((d) => d.startsWith('2.5'))).toEqual([]);
    });
  }
});

describe('2.5.6 follows the ICH M4E(R2) benefit-risk headings', () => {
  const g = G['2.5.6'];
  const HEADINGS = ['2.5.6.1', '2.5.6.1.1', '2.5.6.1.2', '2.5.6.2', '2.5.6.3', '2.5.6.4', '2.5.6.5'];

  it('names every heading in the content elements and the generation prompt', () => {
    const elements = g.keyContentElements.join(' ');
    for (const h of HEADINGS) {
      expect(elements, `keyContentElements name ${h}`).toContain(h);
      expect(g.generationPrompt, `generationPrompt names ${h}`).toContain(h);
    }
  });

  it("ties the headings to FDA's Benefit-Risk Framework and fits the brief's caps", () => {
    expect(g.authoringGuidance).toMatch(/Benefit-Risk Framework/);
    expect(g.authoringGuidance.length).toBeLessThanOrEqual(900);
    expect(g.keyContentElements.length).toBeLessThanOrEqual(10);
    expect(g.commonPitfalls.length).toBeLessThanOrEqual(6);
  });

  it('warns against product data in the Therapeutic Context', () => {
    expect(g.commonPitfalls.join(' ')).toMatch(/2\.5\.6\.1/);
  });

  it('reaches the section brief with every heading, including from a child code', () => {
    const brief = renderSectionBrief('2.5.6.2');
    expect(brief).not.toBeNull();
    for (const h of HEADINGS) expect(brief, `brief names ${h}`).toContain(h);
  });
});
