/**
 * The product-class vocabulary — the regulatory invariants, asserted directly.
 *
 * These are the facts the MDX work order names as type constraints rather than
 * preferences. Each test below corresponds to a way the platform got one wrong:
 * a 510(k) recorded as a biologic, an EU MDR technical file recorded as a drug,
 * and a workstream bucket that omitted both so the programmes were invisible in
 * the portfolio's MDX filter.
 */

import { describe, it, expect } from 'vitest';
import {
  productTypeForFilingType,
  workstreamForFilingType,
  workstreamSqlCase,
  isDeviceFamily,
  isIvdFamily,
  isMedicinalProduct,
  isProductType,
  listProductTypes,
  DEVICE_FAMILY_PRODUCT_TYPES,
  PRODUCT_TYPES,
} from '../product-types.js';

describe('a device filing is never a medicinal product', () => {
  // The invariant, stated once and checked over every device instrument this
  // vocabulary knows.
  const DEVICE_FILINGS = ['510k', 'de_novo', 'pma', 'hde', 'ide', 'device', 'cer', 'mdr'];
  const IVD_FILINGS = ['ivd', 'ivdr'];

  it.each(DEVICE_FILINGS)('%s resolves to a device', (filing) => {
    expect(productTypeForFilingType(filing)).toBe('device');
  });

  it.each(IVD_FILINGS)('%s resolves to an IVD', (filing) => {
    expect(productTypeForFilingType(filing)).toBe('ivd');
  });

  it.each([...DEVICE_FILINGS, ...IVD_FILINGS])(
    '%s can never resolve to a drug or a biologic',
    (filing) => {
      const resolved = productTypeForFilingType(filing);
      expect(resolved).not.toBe('biologic');
      expect(resolved).not.toBe('drug');
      expect(isDeviceFamily(resolved)).toBe(true);
    },
  );

  it('resolves the EU technical files that used to fall through to a drug', () => {
    // `mdr` and `ivdr` were absent from every branch of the old derivation,
    // which ended in a bare `return 'drug'`. An EU MDR Class IIb technical file
    // — a device conformity assessment — was stored as a drug programme.
    expect(productTypeForFilingType('mdr')).toBe('device');
    expect(productTypeForFilingType('ivdr')).toBe('ivd');
  });

  it('does not guess at a filing type it has never seen', () => {
    // Returning null rather than 'drug' is the point: an unclassifiable filing
    // is a question for the user, not a silent default into the pharma lane.
    expect(productTypeForFilingType('widget')).toBeNull();
    expect(productTypeForFilingType('')).toBeNull();
    expect(productTypeForFilingType(null)).toBeNull();
  });

  it('normalises casing and separators the store actually holds', () => {
    // regulatory_programs holds mixed casing: '510K', 'De-Novo', 'de novo'.
    expect(productTypeForFilingType('510K')).toBe('device');
    expect(productTypeForFilingType('DE-NOVO')).toBe('device');
    expect(productTypeForFilingType('de novo')).toBe('device');
  });
});

describe('the lane refines within the device family, and only there', () => {
  it('reads a 510(k) started from the Diagnostics lane as an IVD 510(k)', () => {
    expect(productTypeForFilingType('510k', 'medtech')).toBe('device');
    expect(productTypeForFilingType('510k', 'diagnostics')).toBe('ivd');
    expect(productTypeForFilingType('pma', 'diagnostics')).toBe('ivd');
  });

  it('cannot make a device filing medicinal, whatever the lane says', () => {
    // The failure this guard exists for: the wizard opened on the Pharma &
    // Biotech tab and sent that lane's product class for a device filing.
    for (const lane of ['biotech', 'pharma', 'health', 'cro', 'nonsense']) {
      expect(productTypeForFilingType('510k', lane)).toBe('device');
      expect(productTypeForFilingType('mdr', lane)).toBe('device');
    }
  });

  it('leaves medicinal filings alone', () => {
    expect(productTypeForFilingType('ind', 'diagnostics')).toBe('biologic');
    expect(productTypeForFilingType('nda', 'medtech')).toBe('drug');
  });
});

describe('family membership — CDx is an IVD, SaMD is a device', () => {
  it('treats companion diagnostics as IVDs', () => {
    // A CDx is regulated AS an IVD. Anything asking "is this an IVD?" that
    // compares to the literal 'ivd' drops it — which is how the IVDR reviewer
    // persona and the IVD standards stopped applying to companion diagnostics.
    expect(isIvdFamily('cdx')).toBe(true);
    expect(isDeviceFamily('cdx')).toBe(true);
    expect(isMedicinalProduct('cdx')).toBe(false);
  });

  it('treats software as a medical device as a device', () => {
    expect(isDeviceFamily('samd')).toBe(true);
    // But not an IVD — software is not a diagnostic assay.
    expect(isIvdFamily('samd')).toBe(false);
  });

  it('keeps medicinal products out of the device family', () => {
    expect(isDeviceFamily('drug')).toBe(false);
    expect(isDeviceFamily('biologic')).toBe(false);
    expect(isMedicinalProduct('drug')).toBe(true);
    expect(isMedicinalProduct('biologic')).toBe(true);
  });

  it('is null-safe and case-insensitive', () => {
    expect(isDeviceFamily(null)).toBe(false);
    expect(isDeviceFamily(undefined)).toBe(false);
    expect(isDeviceFamily('DEVICE')).toBe(true);
    expect(isIvdFamily('CDx')).toBe(true);
  });

  it('lists exactly the four device-family classes', () => {
    expect([...DEVICE_FAMILY_PRODUCT_TYPES].sort()).toEqual(['cdx', 'device', 'ivd', 'samd']);
  });
});

describe('the vocabulary itself', () => {
  it('carries the six classes, each with a label and a regulatory reference', () => {
    expect(listProductTypes().sort()).toEqual(
      ['biologic', 'cdx', 'device', 'drug', 'ivd', 'samd'],
    );
    for (const entry of PRODUCT_TYPES) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.description?.length ?? 0).toBeGreaterThan(20);
      expect(entry.regulatoryRefs?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('recognises its own members and nothing else', () => {
    expect(isProductType('device')).toBe(true);
    expect(isProductType('samd')).toBe(true);
    expect(isProductType('combination')).toBe(false);
    expect(isProductType(null)).toBe(false);
  });
});

describe('workstream bucketing', () => {
  it('puts every device and IVD instrument in MDX', () => {
    for (const filing of ['510k', 'de_novo', 'pma', 'hde', 'ide', 'device', 'ivd', 'cer', 'mdr', 'ivdr']) {
      expect(workstreamForFilingType(filing)).toBe('MDX');
    }
  });

  it('buckets the medicinal lanes', () => {
    expect(workstreamForFilingType('ind')).toBe('Biotech');
    expect(workstreamForFilingType('bla')).toBe('Biotech');
    expect(workstreamForFilingType('nda')).toBe('Pharma');
    expect(workstreamForFilingType('cta')).toBe('Pharma');
  });

  it('returns null rather than guessing for an unknown filing type', () => {
    expect(workstreamForFilingType('widget')).toBeNull();
  });

  it('generates SQL that agrees with the function, member for member', () => {
    // The two must not drift: the server projects the SQL, the wizard's review
    // step calls the function, and the review step is a promise about what will
    // persist. Generating one from the other is what makes that promise hold.
    const sql = workstreamSqlCase('p.program_type');
    expect(sql).toMatch(/lower\(p\.program_type\)/);
    for (const filing of ['510k', 'mdr', 'ivdr', 'ind', 'nda']) {
      expect(sql).toContain(`'${filing}'`);
    }
    // Every filing type the function buckets must appear in the SQL.
    for (const filing of ['510k', 'de_novo', 'pma', 'hde', 'ide', 'device', 'ivd', 'cer', 'mdr', 'ivdr',
                          'ind', 'bla', 'biologic', 'nda', 'maa', 'jnda', 'anda', 'cta']) {
      expect(sql).toContain(`'${filing}'`);
    }
  });
});
