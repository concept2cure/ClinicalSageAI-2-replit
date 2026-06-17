/**
 * Precedent corpus tenant-isolation boundary — tested directly on the pure
 * SQL-fragment builder (no DB, no mocks).
 */
import { describe, it, expect } from 'vitest';
import { buildPrecedentOrgIsolation } from '../precedent-isolation';

describe('buildPrecedentOrgIsolation', () => {
  it('with an org: returns public OR that org, binding the org id', () => {
    const f = buildPrecedentOrgIsolation(42, 1);
    expect(f.condition).toBe('(organization_id IS NULL OR organization_id = $1)');
    expect(f.params).toEqual([42]);
    expect(f.nextParamIdx).toBe(2);
  });

  it('without an org: returns public only, binding nothing', () => {
    const f = buildPrecedentOrgIsolation(undefined, 1);
    expect(f.condition).toBe('organization_id IS NULL');
    expect(f.params).toEqual([]);
    expect(f.nextParamIdx).toBe(1);
    // Critically: never an equality that could match another tenant.
    expect(f.condition).not.toMatch(/organization_id = /);
  });

  it('threads the parameter index so later conditions stay aligned', () => {
    const f = buildPrecedentOrgIsolation(7, 3);
    expect(f.condition).toBe('(organization_id IS NULL OR organization_id = $3)');
    expect(f.nextParamIdx).toBe(4);
  });
});
