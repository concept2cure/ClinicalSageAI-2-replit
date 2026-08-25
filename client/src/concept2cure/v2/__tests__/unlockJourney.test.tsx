// @vitest-environment jsdom
/**
 * The unlock journey, end to end: lock -> panel -> plans page.
 *
 * This is the moment an upgrade either happens or does not, and until now the
 * last step threw the context away. A customer clicked a greyed rail entry,
 * read that PV cockpit needs Professional, pressed "View plans", and landed on
 * a generic price list that had never heard of PV cockpit — left to hold the
 * module name and the required tier in their head and do the join themselves.
 *
 * These tests hold the hand-off to three properties, each of which fails
 * silently:
 *   - the intent reaches the plans page at all;
 *   - it is consumed ONCE, so a later unrelated visit is not told about a
 *     module the customer stopped thinking about;
 *   - a lock with no PLAN remedy does not get sold a plan.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearUnlockIntent,
  setUnlockIntent,
  takeUnlockIntent,
} from '../unlockIntent';
import { lockNotice } from '../navEntitlements';

beforeEach(() => clearUnlockIntent());

describe('unlock intent', () => {
  it('carries the module and its real required tier', () => {
    setUnlockIntent({ moduleId: 'pv-cockpit', label: 'PV cockpit', requiredTier: 'professional' });
    expect(takeUnlockIntent()).toEqual({
      moduleId: 'pv-cockpit',
      label: 'PV cockpit',
      requiredTier: 'professional',
    });
  });

  /* One-shot. If the intent persisted, a customer opening the plans page later
     from the account menu would be told they were unlocking something they had
     long since stopped thinking about — and shown a required-tier claim with no
     current basis. */
  it('is consumed exactly once', () => {
    setUnlockIntent({ moduleId: 'risk', label: 'Risk management', requiredTier: 'standard' });
    expect(takeUnlockIntent()).not.toBeNull();
    expect(takeUnlockIntent()).toBeNull();
    expect(takeUnlockIntent()).toBeNull();
  });

  it('is null when the plans page is reached any other way', () => {
    expect(takeUnlockIntent()).toBeNull();
  });

  it('can be abandoned without being consumed', () => {
    setUnlockIntent({ moduleId: 'x', label: 'X', requiredTier: 'free' });
    clearUnlockIntent();
    expect(takeUnlockIntent()).toBeNull();
  });
});

describe('only a tier lock is sent to the plans page at all', () => {
  /* The routing decision that makes the banner honest. lockNotice sends a tier
     gap to `licensing`; an admin disable goes to the Apps catalog and an
     industry mismatch to workspace setup, because NEITHER is fixed by buying a
     plan. If those ever started routing to `licensing`, the banner would be
     offering a remedy that changes nothing. */
  it('routes a tier lock to plans, and the other two somewhere a plan cannot help', () => {
    const tier = lockNotice(
      { id: 'pv-cockpit', label: 'PV cockpit', entitled: false, source: 'tier', requiredTier: 'professional' },
      { isOrgAdmin: true },
    );
    expect(tier.ctaTarget).toBe('licensing');

    const disabled = lockNotice(
      { id: 'risk', label: 'Risk management', entitled: false, source: 'disabled', requiredTier: null },
      { isOrgAdmin: true },
    );
    expect(disabled.ctaTarget).not.toBe('licensing');

    const industry = lockNotice(
      { id: 'labeling', label: 'Labeling', entitled: false, source: 'industry', requiredTier: null },
      { isOrgAdmin: true },
    );
    expect(industry.ctaTarget).not.toBe('licensing');
  });

  it('offers a non-admin no action they cannot take', () => {
    // An admin-only remedy shown to someone who cannot perform it is a dead end
    // dressed as a next step.
    const disabled = lockNotice(
      { id: 'risk', label: 'Risk management', entitled: false, source: 'disabled', requiredTier: null },
      { isOrgAdmin: false },
    );
    expect(disabled.ctaLabel).toBeNull();
    expect(disabled.ctaTarget).toBeNull();
    expect(disabled.body).toMatch(/administrator/i);
  });
});
