import { describe, it, expect } from 'vitest';
import { prerequisiteRows, ESTAR_PREREQUISITES } from '../useEstarFiling';

describe('prerequisiteRows (eSTAR registration → prerequisite chips)', () => {
  it('marks satisfied prerequisites and leaves the rest missing', () => {
    const rows = prerequisiteRows(['fda_esg_account', 'organization_identity']);
    expect(rows).toHaveLength(4);
    expect(rows.find((r) => r.id === 'fda_esg_account')?.satisfied).toBe(true);
    expect(rows.find((r) => r.id === 'organization_identity')?.satisfied).toBe(true);
    expect(rows.find((r) => r.id === 'mdufa_fee_account')?.satisfied).toBe(false);
    expect(rows.find((r) => r.id === 'cdrh_portal_account')?.satisfied).toBe(false);
  });

  it('handles null/undefined as nothing satisfied', () => {
    expect(prerequisiteRows(null).every((r) => !r.satisfied)).toBe(true);
    expect(prerequisiteRows(undefined).every((r) => !r.satisfied)).toBe(true);
  });

  it('preserves the canonical prerequisite order and set', () => {
    const rows = prerequisiteRows([]);
    expect(rows.map((r) => r.id)).toEqual(ESTAR_PREREQUISITES.map((p) => p.id));
  });
});
