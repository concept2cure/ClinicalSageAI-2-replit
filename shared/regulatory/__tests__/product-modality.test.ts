/**
 * The bridge between what a sponsor says they have and the modality the frame
 * reasons with (founder's directive, 2026-10-12).
 *
 * Both directions are gated. A modality the frame holds that no product type
 * reaches is unaskable — the interview could never put a programme on it. A
 * product type that resolves to nothing would fall back to the whole list of
 * pathways, which is how a biosimilar comes to be offered an ANDA.
 */
import { describe, expect, it } from 'vitest';

import { MODALITIES } from '../modality.js';
import { bridgedProductTypes, modalityOf, NON_MEDICINE_PRODUCT_TYPES } from '../product-modality.js';

describe('the bridge', () => {
  it('reaches every modality the frame holds', () => {
    const reached = new Set(bridgedProductTypes().map(t => modalityOf(t)));
    const unreachable = MODALITIES.filter(m => !reached.has(m));
    expect(unreachable, 'a modality the interview can never put a programme on').toEqual([]);
  });

  it('resolves every product type it claims, to a modality the frame holds', () => {
    for (const productType of bridgedProductTypes()) {
      const modality = modalityOf(productType);
      expect(modality, productType).not.toBeNull();
      expect(MODALITIES, productType).toContain(modality!);
    }
  });

  it('reads a sponsor’s words onto the frame’s', () => {
    expect(modalityOf('monoclonal_antibody')).toBe('mab');
    expect(modalityOf('bispecific'), 'the frame reasons about both as antibodies').toBe('mab');
    expect(modalityOf('combination_product')).toBe('combination');
    expect(modalityOf('BIOSIMILAR'), 'however it is cased').toBe('biosimilar');
  });

  it('resolves a device or a diagnostic to nothing, because the frame has no view of one', () => {
    for (const productType of NON_MEDICINE_PRODUCT_TYPES) {
      expect(modalityOf(productType), productType).toBeNull();
    }
  });

  it('resolves what it does not know to nothing, rather than to a guess', () => {
    expect(modalityOf('radiopharmaceutical')).toBeNull();
    expect(modalityOf('')).toBeNull();
    expect(modalityOf(null)).toBeNull();
    expect(modalityOf(undefined)).toBeNull();
  });
});
