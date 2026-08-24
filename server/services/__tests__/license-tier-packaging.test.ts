/**
 * Tier-packaging decisions, pinned.
 *
 * These are PRICING decisions with a rationale recorded in the map itself —
 * a silent regression here re-creates a defect someone already argued out of
 * the product. The map is code, so the pin is a test, not a migration check.
 */
import { describe, expect, it } from 'vitest';
import { FEATURE_TIER_MAP, isFeatureAvailable } from '../license-manager';

describe('FEATURE_TIER_MAP — decided bands stay decided', () => {
  it('e-signature is available from STANDARD up — governance is the entry ticket, not the enterprise wall', () => {
    // Read 'enterprise' until 2026-08-23, which would have made the standard
    // plan unable to approve anything the moment a route enforced it. Every
    // governed action in this product manifests an e-signature; a tier that
    // cannot e-sign is not a reduced product in a GxP tool — it is not a
    // product. See the rationale block on the map entry.
    expect(FEATURE_TIER_MAP.electronic_signatures).toBe('standard');
    expect(isFeatureAvailable('electronic_signatures', 'standard')).toBe(true);
    expect(isFeatureAvailable('electronic_signatures', 'professional')).toBe(true);
    expect(isFeatureAvailable('electronic_signatures', 'enterprise')).toBe(true);
    // 'free' stays out — the entry ticket is to the PAID product.
    expect(isFeatureAvailable('electronic_signatures', 'free')).toBe(false);
  });

  it('the transferable enterprise gates stay enterprise — identity, API, autonomy', () => {
    expect(FEATURE_TIER_MAP.sso).toBe('enterprise');
    expect(FEATURE_TIER_MAP.api_access).toBe('enterprise');
    expect(FEATURE_TIER_MAP.ana_autonomous_actions).toBe('enterprise');
  });
});
