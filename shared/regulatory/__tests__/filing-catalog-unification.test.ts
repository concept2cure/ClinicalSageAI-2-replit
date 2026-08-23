/**
 * BP-W1-2 — one filing catalog, one count, one source of truth.
 *
 * The product used to hold three filing-type catalogs: the canonical
 * GLOBAL_REGISTRY, a hand-mirrored tuple table behind the project wizard, and
 * a fixture behind the Filings catalog page. The wizard advertised 158 types,
 * the catalog 113, and BP-W1-3 metadata corrections landed in one copy and not
 * the others. These assertions pin the unification:
 *
 *   1. Every number a surface renders is DERIVED from the one catalog.
 *   2. The corrected regulatory metadata is what BOTH surfaces now read.
 *   3. Every id the retired mirror ever exported still resolves.
 *
 * If a second list of filing types reappears, the parity assertions here are
 * the first thing that should fail.
 */
import { describe, it, expect } from 'vitest';
import { GLOBAL_REGISTRY } from '../global-document-registry';
import {
  FILING_CATALOG,
  LEGACY_FILING_ID_ALIASES,
  filingCatalogTotal,
  filingCountBySegment,
  filingCatalogTree,
  resolveFilingCatalogEntry,
} from '../filing-catalog';

describe('one catalog, one count', () => {
  it('the catalog is exactly the active registry', () => {
    const active = GLOBAL_REGISTRY.filter((e) => e.active);
    expect(FILING_CATALOG.length).toBe(active.length);
    expect(filingCatalogTotal()).toBe(active.length);
  });

  it('segment counts and the tree sum to the same total', () => {
    const bySeg = filingCountBySegment();
    const segSum = Object.values(bySeg).reduce((a, b) => a + b, 0);
    const treeSum = filingCatalogTree().reduce((a, s) => a + s.count, 0);
    expect(segSum).toBe(filingCatalogTotal());
    expect(treeSum).toBe(filingCatalogTotal());
  });

  it('client ids are unique and lowercase-canonical', () => {
    const ids = FILING_CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of FILING_CATALOG) expect(e.id).toBe(e.registryId.toLowerCase());
  });
});

describe('the corrected metadata is what every surface reads (BP-W1-3 parity)', () => {
  // The mirrors are gone, so asserting the catalog IS asserting both surfaces.
  it("the Investigator's Brochure is Module 1 for a US IND, not Module 5", () => {
    const ib = resolveFilingCatalogEntry('investigator_brochure')!;
    expect(ib.id).toBe('ich_ib');
    expect(ib.ctdModule).toContain('M1');
    expect(ib.ctdModule).not.toBe('M5');
  });

  it('a SUSAR is an E2B transmission, not an eCTD M5 document', () => {
    const susar = resolveFilingCatalogEntry('susar_report')!;
    expect(susar.submissionFormat).toBe('E2B(R3)');
    expect(susar.ctdModule).toBe('—');
  });

  it('abbreviated generic pathways carry their BE evidence in Module 5', () => {
    for (const legacy of ['anda', 'ands_hc', 'generic_eu']) {
      const e = resolveFilingCatalogEntry(legacy)!;
      expect(e.ctdModule, `${legacy} module scope`).toContain('5.3.1');
    }
  });

  it('PSP and PIP are separate filings to separate agencies', () => {
    const psp = resolveFilingCatalogEntry('pediatric_plan')!;
    expect(psp.id).toBe('us_psp');
    expect(psp.agency).toBe('FDA');
    const pip = resolveFilingCatalogEntry('eu_pip')!;
    expect(pip.agency).toBe('EMA');
    expect(psp.displayName).not.toMatch(/PIP/);
    expect(pip.displayName).not.toMatch(/PSP/);
  });

  it('a CEP is issued by EDQM and a GMP certificate by a national authority — not EMA', () => {
    expect(resolveFilingCatalogEntry('cep')!.agency).toBe('EDQM');
    expect(resolveFilingCatalogEntry('gmp_cert')!.agency).toBe('National competent authority');
  });

  it('MedWatch / FAERS is not a filing type; the two real obligations are', () => {
    const names = FILING_CATALOG.map((e) => e.displayName.toLowerCase());
    expect(names.some((n) => n.includes('medwatch'))).toBe(false);
    expect(resolveFilingCatalogEntry('icsr_15day')).toBeTruthy();
    expect(resolveFilingCatalogEntry('pader')).toBeTruthy();
  });

  it('Module 1 is regional: one row per modeled agency, no combined row', () => {
    const m1 = FILING_CATALOG.filter((e) => /CTD Module 1 — /.test(e.displayName));
    const agencies = m1.map((e) => e.agency).sort();
    expect(agencies).toEqual(
      ['EMA', 'FDA', 'Health Canada', 'MHRA', 'NMPA', 'PMDA', 'Swissmedic', 'TGA'].sort(),
    );
    const combined = FILING_CATALOG.filter((e) => /module 1.*(regional administrative|non-us)/i.test(e.displayName));
    expect(combined).toEqual([]);
  });
});

describe('nothing the retired mirrors offered was lost', () => {
  it('every legacy mirror id resolves to a catalog entry', () => {
    const unresolved = Object.keys(LEGACY_FILING_ID_ALIASES).filter(
      (k) => !resolveFilingCatalogEntry(k),
    );
    expect(unresolved).toEqual([]);
  });

  it('device and IVD rows all carry a pathway (a missing key means "US NDA" downstream)', () => {
    const missing = FILING_CATALOG.filter(
      (e) =>
        (e.segment === 'medical_devices' || e.segment === 'diagnostics_ivd') && !e.pathwayKey,
    ).map((e) => e.id);
    expect(missing).toEqual([]);
  });
});

describe('BP-W1-4 — every module assignment is traceable to a named authority', () => {
  it('no active entry carries a ctdModule without a moduleAuthority', () => {
    // Module assignment decides backbone placement and whether the sequence
    // validates. An unsourced assignment cannot be checked, only re-guessed —
    // so an assignment without a named specification (or an explicit audit
    // flag awaiting the SME) is a defect, not a default. This is the gate
    // that keeps the next entry from landing untraced.
    const untraced = GLOBAL_REGISTRY.filter(
      (e) => e.active && e.ctdModule && !(e.moduleAuthority && e.moduleAuthority.trim().length > 0),
    ).map((e) => `${e.id} (${e.ctdModule})`);
    expect(untraced).toEqual([]);
  });
});
