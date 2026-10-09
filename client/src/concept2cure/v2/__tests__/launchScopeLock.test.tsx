/**
 * Launch-scope lock copy — what a customer is told about an app that is
 * built but not in this release.
 *
 * The three other lock reasons each route somewhere that resolves them (plans,
 * the catalog, workspace setup). This one resolves nowhere on the customer's
 * side, and the copy must say so: no CTA, not requestable, and never the tier
 * upsell that the default branch produces.
 */
import { isLaunchScopeLocked, lockNotice, lockShortReason, type NavSurfaceEntitlement } from '../navEntitlements';

const launchLocked: NavSurfaceEntitlement = {
  id: 'rbm',
  label: 'Risk-based monitoring',
  entitled: false,
  source: 'launch-scope',
  requiredTier: null,
};

describe('launch-scope lock', () => {
  it('is recognised only for an unentitled launch-scope verdict', () => {
    expect(isLaunchScopeLocked(launchLocked)).toBe(true);
    expect(isLaunchScopeLocked({ ...launchLocked, entitled: true })).toBe(false);
    expect(isLaunchScopeLocked({ ...launchLocked, source: 'tier' })).toBe(false);
    expect(isLaunchScopeLocked(null)).toBe(false);
  });

  it('names the reason in the accessible short form', () => {
    expect(lockShortReason(launchLocked)).toBe('not in this release');
  });

  it('offers no plan, no toggle and no request — for admins and members alike', () => {
    for (const isOrgAdmin of [true, false]) {
      const n = lockNotice(launchLocked, { isOrgAdmin });
      expect(n.status).toBe('Not in this release');
      expect(n.ctaLabel).toBeNull();
      expect(n.ctaTarget).toBeNull();
      expect(n.requestable).toBe(false);
      expect(n.body).toMatch(/not part of the current release/);
      expect(n.body).not.toMatch(/view plans|included from/i);
    }
  });
});
