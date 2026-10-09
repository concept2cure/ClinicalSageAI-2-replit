/**
 * The BX-204 dossier-map demo files each Module 1 row under the FDA code that
 * means what the row says.
 *
 * scripts/seed/ga-demo.d/105-dossier-map.mjs put three of its four Module 1
 * rows under codes that mean something else in FDA's own vocabulary
 * (controlled-vocab/cv-v4-data.ts):
 *   - Draft Labeling at m1.3.1 (FDA's draft labeling text is m1.14.1.3);
 *   - Meeting Materials at m1.14.1 (FDA: m1.6.2 meeting background materials);
 *   - Financial Disclosure at m1.12.4 (FDA's m1.12.4 is "request for comments
 *     and advice"; financial disclosure is m1.3.4).
 * A demo that shows a regulatory user their dossier map teaches the wrong map.
 * Found by the IND eCTD demo lane (docs/work-orders/README.md).
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- a .mjs seed with no type declarations
import { SECTIONS } from '../../scripts/seed/ga-demo.d/105-dossier-map.mjs';
import { CV_CONTEXT_OF_USE } from '../../server/services/ectd/controlled-vocab/cv-v4-data';

/** The word each Module 1 title must share with FDA's description of its code. */
const KEYWORD: Record<string, string> = {
  'FDA Forms': 'forms',
  'Draft Labeling': 'labeling',
  'Meeting Materials': 'meeting',
  'Financial Disclosure': 'financial',
};

describe('the dossier-map demo files Module 1 where FDA does', () => {
  const module1 = (SECTIONS as Array<[string, string, string, string]>).filter(([, mod]) => mod === 'M1');

  it('seeds the four Module 1 rows', () => {
    expect(module1.map(([, , title]) => title).sort()).toEqual(Object.keys(KEYWORD).sort());
  });

  for (const [code, , title] of (SECTIONS as Array<[string, string, string, string]>).filter(([, m]) => m === 'M1')) {
    it(`files "${title}" under a code FDA describes as ${KEYWORD[title]}`, () => {
      const vocab = CV_CONTEXT_OF_USE.codes.find((c) => c.code === `us_${code.replace(/^m/, '')}`);
      expect(vocab, `${code} is not an FDA Module 1 code`).toBeDefined();
      expect(vocab!.description.toLowerCase()).toContain(KEYWORD[title]);
    });
  }
});
