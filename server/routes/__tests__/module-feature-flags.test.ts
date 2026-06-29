/**
 * Tests for the per-org feature-flag allowlist guard (Build 3).
 * applyOrgFeatureOverrides is the security-critical merge: it applies ONLY
 * allowlisted boolean keys from organizations.settings.features, so an org
 * admin can never toggle an arbitrary internal flag, and the default stays
 * fail-closed (Document Studio off).
 */

import { describe, it, expect } from 'vitest';
import { applyOrgFeatureOverrides } from '../module-subscriptions';

describe('applyOrgFeatureOverrides', () => {
  it('defaults to ENABLE_ANA_DOCUMENT_STUDIO false (fail-closed)', () => {
    expect(applyOrgFeatureOverrides(undefined)).toEqual({ ENABLE_ANA_DOCUMENT_STUDIO: false });
    expect(applyOrgFeatureOverrides(null)).toEqual({ ENABLE_ANA_DOCUMENT_STUDIO: false });
    expect(applyOrgFeatureOverrides({})).toEqual({ ENABLE_ANA_DOCUMENT_STUDIO: false });
  });

  it('applies a true override for an allowlisted key', () => {
    expect(applyOrgFeatureOverrides({ ENABLE_ANA_DOCUMENT_STUDIO: true })).toEqual({
      ENABLE_ANA_DOCUMENT_STUDIO: true,
    });
  });

  it('applies an explicit false override', () => {
    expect(applyOrgFeatureOverrides({ ENABLE_ANA_DOCUMENT_STUDIO: false })).toEqual({
      ENABLE_ANA_DOCUMENT_STUDIO: false,
    });
  });

  it('ignores non-boolean values for allowlisted keys', () => {
    expect(applyOrgFeatureOverrides({ ENABLE_ANA_DOCUMENT_STUDIO: 'true' })).toEqual({
      ENABLE_ANA_DOCUMENT_STUDIO: false,
    });
    expect(applyOrgFeatureOverrides({ ENABLE_ANA_DOCUMENT_STUDIO: 1 })).toEqual({
      ENABLE_ANA_DOCUMENT_STUDIO: false,
    });
  });

  it('never echoes non-allowlisted keys (no arbitrary flag toggling)', () => {
    const out = applyOrgFeatureOverrides({
      ENABLE_ANA_DOCUMENT_STUDIO: true,
      ENABLE_SECRET_ADMIN_MODE: true,
      SOME_INTERNAL_FLAG: true,
    });
    expect(out).toEqual({ ENABLE_ANA_DOCUMENT_STUDIO: true });
    expect(out).not.toHaveProperty('ENABLE_SECRET_ADMIN_MODE');
    expect(out).not.toHaveProperty('SOME_INTERNAL_FLAG');
  });
});
