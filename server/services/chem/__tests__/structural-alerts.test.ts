/**
 * Cheminformatics structural-alert + validation tests.
 *
 * Correctness is locked against real SMILES: known nitrosamines must fire the
 * high-confidence N–N=O alert; benign drugs must not; the validator must catch
 * unbalanced branches/rings.
 */
import { describe, it, expect } from 'vitest';
import {
  validateSmiles,
  explicitAtomWeight,
  screenStructuralAlerts,
} from '../structural-alerts';
import { assessDevelopability } from '../developability';

describe('validateSmiles', () => {
  it('accepts well-formed SMILES and inventories heavy atoms', () => {
    const v = validateSmiles('CCO'); // ethanol
    expect(v.valid).toBe(true);
    expect(v.errors).toHaveLength(0);
    expect(v.atomCounts.C).toBe(2);
    expect(v.atomCounts.O).toBe(1);
    expect(v.heavyAtomCount).toBe(3);
  });

  it('counts two-character halogens and bracket atoms', () => {
    const v = validateSmiles('ClCCBr');
    expect(v.valid).toBe(true);
    expect(v.atomCounts.Cl).toBe(1);
    expect(v.atomCounts.Br).toBe(1);
    expect(v.atomCounts.C).toBe(2);
  });

  it('flags unbalanced branch parentheses', () => {
    const v = validateSmiles('CC(C');
    expect(v.valid).toBe(false);
    expect(v.errors.join(' ')).toMatch(/parenthes/i);
  });

  it('flags an unpaired ring-closure label', () => {
    const v = validateSmiles('C1CCCCC'); // missing the closing 1
    expect(v.valid).toBe(false);
    expect(v.errors.join(' ')).toMatch(/ring-closure/i);
  });

  it('rejects an empty string', () => {
    expect(validateSmiles('   ').valid).toBe(false);
  });

  it('does not treat ring digits inside aromatic rings as unpaired (benzene)', () => {
    const v = validateSmiles('c1ccccc1');
    expect(v.valid).toBe(true);
    expect(v.atomCounts.C).toBe(6);
  });
});

describe('explicitAtomWeight', () => {
  it('sums average atomic weights of explicit atoms', () => {
    const { atomCounts } = validateSmiles('CCO');
    // 2*C + O explicit only (implicit H not modeled): 24.022 + 15.999
    expect(explicitAtomWeight(atomCounts)).toBeCloseTo(40.021, 2);
  });
});

describe('screenStructuralAlerts — nitrosamine detection (high confidence)', () => {
  const nitrosamines: Array<[string, string]> = [
    ['NDMA (N-nitrosodimethylamine)', 'CN(C)N=O'],
    ['NDEA (N-nitrosodiethylamine)', 'CCN(CC)N=O'],
    ['N-nitrosopyrrolidine', 'O=NN1CCCC1'],
  ];

  it.each(nitrosamines)('fires the N-nitrosamine alert for %s', (_name, smiles) => {
    const report = screenStructuralAlerts(smiles);
    expect(report.validation.valid).toBe(true);
    const alert = report.alerts.find(a => a.id === 'n_nitrosamine');
    expect(alert).toBeDefined();
    expect(alert?.confidence).toBe('high');
    expect(alert?.ichM7Relevant).toBe(true);
    expect(report.hasMutagenicAlert).toBe(true);
  });

  it('does not fire nitrosamine on a benign molecule (caffeine)', () => {
    const report = screenStructuralAlerts('CN1C=NC2=C1C(=O)N(C(=O)N2C)C');
    expect(report.validation.valid).toBe(true);
    expect(report.alerts.find(a => a.id === 'n_nitrosamine')).toBeUndefined();
  });

  it('does not fire nitrosamine on a nitro compound (nitrobenzene)', () => {
    const report = screenStructuralAlerts('c1ccccc1[N+](=O)[O-]');
    expect(report.alerts.find(a => a.id === 'n_nitrosamine')).toBeUndefined();
  });

  it('carries the screening (not classification) disclaimer', () => {
    const report = screenStructuralAlerts('CN(C)N=O');
    expect(report.disclaimer).toMatch(/ICH M7/);
    expect(report.disclaimer).toMatch(/not an ICH M7\(R2\) classification|Substructure screen/i);
  });
});

describe('screenStructuralAlerts — other motifs', () => {
  it('flags an aromatic nitro group (nitrobenzene)', () => {
    const report = screenStructuralAlerts('c1ccccc1[N+](=O)[O-]');
    expect(report.alerts.some(a => a.id === 'aromatic_nitro')).toBe(true);
  });

  it('flags an epoxide (ethylene oxide)', () => {
    const report = screenStructuralAlerts('C1CO1');
    expect(report.alerts.some(a => a.id === 'epoxide_aziridine')).toBe(true);
  });

  it('returns no alerts for an invalid SMILES (no matching on garbage)', () => {
    const report = screenStructuralAlerts('CC(C');
    expect(report.validation.valid).toBe(false);
    expect(report.alerts).toHaveLength(0);
  });
});

describe('assessDevelopability', () => {
  it('passes a clean oral small molecule', () => {
    const r = assessDevelopability({
      molecularWeight: 300,
      alogp: 2.1,
      psa: 60,
      hba: 4,
      hbd: 1,
      rotatableBonds: 5,
      ro5Violations: 0,
      qed: 0.82,
    });
    expect(r.flagCount).toBe(0);
    expect(r.summary).toMatch(/No oral-developability flags/);
  });

  it('flags MW and PSA breaches with explicit thresholds', () => {
    const r = assessDevelopability({ molecularWeight: 650, psa: 160, hbd: 2, hba: 3, alogp: 3, rotatableBonds: 4 });
    const mw = r.flags.find(f => f.property === 'Molecular weight');
    const psa = r.flags.find(f => f.property === 'Polar surface area');
    expect(mw?.status).toBe('flag');
    expect(psa?.status).toBe('flag');
    expect(r.flagCount).toBe(2);
  });

  it('reports unknown (not pass) when descriptors are missing', () => {
    const r = assessDevelopability({});
    expect(r.flags.every(f => f.status === 'unknown')).toBe(true);
    expect(r.summary).toMatch(/Insufficient descriptors/);
  });
});
