/**
 * An export says what the chain walk found without naming another
 * organization's rows (DP-44, 2026-09-29). The walk loads other organizations'
 * legacy rows as context, so a break can name one of theirs — the broken row,
 * or the row its hash commits to — by id and organization number.
 */
import { describe, expect, it } from 'vitest';

import type { ChainBreak } from '../chain';
import { breakForTenant } from '../audited-export';

const ORG = 7;
const brk = (over: Partial<ChainBreak>): ChainBreak => ({
  id: 'row-own',
  expected: 'e'.repeat(64),
  stored: 's'.repeat(64),
  tenantId: ORG,
  segment: 'sequenced',
  commitsTo: null,
  ...over,
});

describe('breakForTenant', () => {
  it('names this organization\'s broken row and the row of its own that it commits to', () => {
    expect(breakForTenant(ORG, brk({ commitsTo: { id: 'row-prev', tenantId: ORG } }))).toEqual({
      segment: 'sequenced',
      id: 'row-own',
      expected: 'e'.repeat(64),
      stored: 's'.repeat(64),
      commitsTo: { id: 'row-prev' },
    });
  });

  it('does not name another organization\'s row the break commits to', () => {
    const out = breakForTenant(ORG, brk({ segment: 'legacy', commitsTo: { id: 'their-row', tenantId: 9 } }));
    expect(out.commitsTo).toBe('another organization');
    expect(JSON.stringify(out)).not.toContain('their-row');
    expect(JSON.stringify(out)).not.toContain('"tenantId"');
  });

  it('does not name, or give the hashes of, a broken row that is another organization\'s', () => {
    const out = breakForTenant(ORG, brk({ id: 'their-broken-row', tenantId: 9, commitsTo: 'genesis' }));
    expect(out).toEqual({ segment: 'sequenced', row: 'another organization', commitsTo: 'genesis' });
  });

  it('keeps genesis and "nothing derives it" as they are', () => {
    expect(breakForTenant(ORG, brk({ commitsTo: 'genesis' })).commitsTo).toBe('genesis');
    expect(breakForTenant(ORG, brk({ commitsTo: null })).commitsTo).toBeNull();
  });
});
