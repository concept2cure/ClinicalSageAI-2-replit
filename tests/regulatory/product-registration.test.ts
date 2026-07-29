import { describe, it, expect } from 'vitest';
import {
  canTransition,
  isOnMarket,
  registrationEventForFiling,
  buildProduct,
  rollupPortfolio,
  REGISTRATION_TRANSITIONS,
  type Registration,
} from '../../shared/regulatory/product-registration';

describe('registration lifecycle state machine', () => {
  it('allows the real forward path and blocks illegal jumps', () => {
    expect(canTransition('not_started', 'in_development')).toBe(true);
    expect(canTransition('under_review', 'approved')).toBe(true);
    expect(canTransition('under_review', 'deficiency')).toBe(true);
    expect(canTransition('deficiency', 'submitted')).toBe(true); // respond → re-review
    expect(canTransition('approved', 'suspended')).toBe(true);
    // illegal: cannot approve straight from development, cannot revive a withdrawn reg
    expect(canTransition('in_development', 'approved')).toBe(false);
    expect(canTransition('withdrawn', 'approved')).toBe(false);
  });

  it('only approved is on-market', () => {
    expect(isOnMarket('approved')).toBe(true);
    expect(isOnMarket('under_review')).toBe(false);
    expect(isOnMarket('suspended')).toBe(false);
  });

  it('every status has a transition entry', () => {
    const statuses = Object.keys(REGISTRATION_TRANSITIONS);
    expect(statuses).toContain('approved');
    expect(statuses).toContain('deficiency');
    expect(statuses.length).toBe(9);
  });
});

describe('filing → registration event', () => {
  it('maps original applications, variations, and investigational filings', () => {
    expect(registrationEventForFiling('NDA')).toBe('initial_application');
    expect(registrationEventForFiling('510k')).toBe('initial_application');
    expect(registrationEventForFiling('IND')).toBe('investigational');
    expect(registrationEventForFiling('not-a-real-thing')).toBeNull();
  });

  it('a supplement is a variation, not a new registration', () => {
    // US_BLA_SUPP is a supplement stage in the registry.
    expect(registrationEventForFiling('US_BLA_SUPP')).toBe('variation');
  });
});

describe('product + portfolio rollup', () => {
  it('derives the segment from product classes', () => {
    const p = buildProduct({ id: 'p1', name: 'Acme mAb', productClasses: ['biologic'] });
    expect(p?.segment).toBe('biotech');
    const dev = buildProduct({ id: 'p2', name: 'Acme Stent', productClasses: ['medical_device'] });
    expect(dev?.segment).toBe('device');
    expect(buildProduct({ id: 'p3', name: 'x', productClasses: ['any'] })).toBeNull();
  });

  it('rolls per-market registrations into approved vs in-flight', () => {
    const regs: Registration[] = [
      { productId: 'p1', market: 'US', status: 'approved' },
      { productId: 'p1', market: 'EU', status: 'under_review' },
      { productId: 'p1', market: 'JP', status: 'deficiency' },
      { productId: 'p1', market: 'CA', status: 'not_started' },
    ];
    const roll = rollupPortfolio(regs);
    expect(roll.total).toBe(4);
    expect(roll.marketsApproved).toEqual(['US']);
    expect(roll.marketsInFlight.sort()).toEqual(['EU', 'JP']);
    expect(roll.byStatus.approved).toBe(1);
    expect(roll.byStatus.not_started).toBe(1);
  });
});
