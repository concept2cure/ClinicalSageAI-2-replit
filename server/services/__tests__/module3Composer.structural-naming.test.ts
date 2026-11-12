/**
 * §3.1 and §3.3 name the drug substance by the drug substance record (GA-DEMO-03).
 *
 * Both sections read `name` with `val()`, which returns the FIRST matching
 * source's value. Their sources are the drug substance AND the drug product, so
 * whenever the product record arrived first — which is how the C2C-201 demo
 * project composes — §3.1 said "The drug substance is C2C-201 tablets". The
 * product's name is not the substance's name; each is read from its own record.
 */
import { describe, expect, it } from 'vitest';

import { composeModule3FromCanonicalSources, type CanonicalSource } from '../module3Composer';

const substance: CanonicalSource = {
  id: 'ds-1',
  sourceType: 'drug_substance',
  sourcePayload: { name: 'C2C-201', manufacturer: 'Chemical Operations' },
};
const product: CanonicalSource = {
  id: 'dp-1',
  sourceType: 'drug_product',
  sourcePayload: { name: 'C2C-201 tablets', dosageFormDescription: 'Film-coated tablet' },
};

function section(sources: CanonicalSource[], key: string) {
  const found = composeModule3FromCanonicalSources(sources).find((s) => s.sectionKey === key);
  if (!found) throw new Error(`section ${key} was not composed`);
  return found.narrativeDraft;
}

describe('§3.1 and §3.3 read the drug substance name from the drug substance', () => {
  it.each([
    ['product first', [product, substance]],
    ['substance first', [substance, product]],
  ])('§3.1 names the substance, not the product (%s)', (_order, sources) => {
    const text = section(sources, '3.1');
    expect(text).toContain('The drug substance is C2C-201. ');
    expect(text).not.toContain('The drug substance is C2C-201 tablets');
    expect(text).toContain('The drug product, C2C-201 tablets, is formulated as a Film-coated tablet.');
  });

  it.each([
    ['product first', [product, substance]],
    ['substance first', [substance, product]],
  ])('§3.3 names the substance, not the product (%s)', (_order, sources) => {
    const text = section(sources, '3.3');
    expect(text).toContain('for the drug substance (C2C-201) and drug product (Film-coated tablet)');
  });

  it('does not borrow the product name when the substance record names nothing', () => {
    const text = section([product, { ...substance, sourcePayload: { manufacturer: 'Chemical Operations' } }], '3.1');
    expect(text).not.toContain('The drug substance is');
  });
});
