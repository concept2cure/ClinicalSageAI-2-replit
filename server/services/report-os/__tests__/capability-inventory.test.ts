import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { reportAvailability, DOMAIN_REPORT_TYPE_IDS } from '../report-engine';
import { REGIONAL_REPORT_TYPE_IDS } from '../regional/filing-types';
import { reportCapabilityCounts, reportCapabilityInventory } from '../capability-inventory';

describe('authoritative report completion inventory', () => {
  it('reconciles all 61 generated registry definitions to 23 engine-backed, 5 prediction and 33 uncomputed types', () => {
    const inventory = reportCapabilityInventory();
    expect(reportCapabilityCounts(inventory)).toEqual({ defined: 61, engineBacked: 23, predictionUnavailable: 5, uncomputed: 33 });
    expect(new Set(inventory.map(row => row.typeId)).size).toBe(61);
    const seed = readFileSync('migrations/20260930_report_type_registry_seed.sql', 'utf8');
    for (const row of inventory) {
      expect(seed).toContain(`('${row.typeId}',`);
      expect(row.computedScopes).toEqual(row.declaredScopes.filter(scope => reportAvailability(row.typeId, scope, row.declaredScopes).runnable));
    }
    expect(inventory.filter(row => row.engine === 'domain').map(row => row.typeId).sort()).toEqual([...DOMAIN_REPORT_TYPE_IDS].sort());
    expect(inventory.filter(row => row.engine === 'regional').map(row => row.typeId).sort()).toEqual([...REGIONAL_REPORT_TYPE_IDS].sort());
  });
  it('keeps each missing engine and prediction out of every generic run scope', () => {
    for (const row of reportCapabilityInventory().filter(item => item.state !== 'engine-backed')) {
      expect(row.engine).toBeNull(); expect(row.computedScopes).toEqual([]);
      for (const scope of row.declaredScopes) expect(reportAvailability(row.typeId, scope, row.declaredScopes).runnable).toBe(false);
      expect(row.qualification).toMatch(row.state === 'prediction-unavailable' ? /No validated prediction/ : /No canonical engine/);
    }
  });
});
