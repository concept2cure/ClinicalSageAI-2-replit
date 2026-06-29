/**
 * Tests for client-side per-org feature-flag hydration (Build 3).
 * applyOrgFeatureFlags applies a server-provided flag map to the client flag
 * module — only allowlisted keys — so a pilot org turns Document Studio on
 * while the global default stays off.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  applyOrgFeatureFlags,
  isFeatureEnabled,
  resetFeatureFlags,
  ORG_OVERRIDABLE_FLAGS,
} from '../featureFlags';

afterEach(() => resetFeatureFlags());

describe('applyOrgFeatureFlags', () => {
  it('global default for ENABLE_ANA_DOCUMENT_STUDIO is off', () => {
    expect(isFeatureEnabled('ENABLE_ANA_DOCUMENT_STUDIO')).toBe(false);
  });

  it('enables the studio flag for a pilot org', () => {
    applyOrgFeatureFlags({ ENABLE_ANA_DOCUMENT_STUDIO: true });
    expect(isFeatureEnabled('ENABLE_ANA_DOCUMENT_STUDIO')).toBe(true);
  });

  it('leaves the flag off when omitted or undefined', () => {
    applyOrgFeatureFlags(undefined);
    expect(isFeatureEnabled('ENABLE_ANA_DOCUMENT_STUDIO')).toBe(false);
    applyOrgFeatureFlags({});
    expect(isFeatureEnabled('ENABLE_ANA_DOCUMENT_STUDIO')).toBe(false);
  });

  it('respects an explicit false from the server', () => {
    applyOrgFeatureFlags({ ENABLE_ANA_DOCUMENT_STUDIO: true });
    expect(isFeatureEnabled('ENABLE_ANA_DOCUMENT_STUDIO')).toBe(true);
    applyOrgFeatureFlags({ ENABLE_ANA_DOCUMENT_STUDIO: false });
    expect(isFeatureEnabled('ENABLE_ANA_DOCUMENT_STUDIO')).toBe(false);
  });

  it('only touches allowlisted flags', () => {
    expect(ORG_OVERRIDABLE_FLAGS).toContain('ENABLE_ANA_DOCUMENT_STUDIO');
    // A non-allowlisted key in the payload must not be applied even if present.
    applyOrgFeatureFlags({ ENABLE_510K_MODULE: false } as Record<string, boolean>);
    // ENABLE_510K_MODULE keeps its module default (true), untouched by org hydration.
    expect(isFeatureEnabled('ENABLE_510K_MODULE')).toBe(true);
  });
});
