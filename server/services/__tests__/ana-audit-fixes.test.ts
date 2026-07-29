/**
 * Regression guards for the AnA audit fixes (round 1).
 *
 * 1. Role allowlist completeness — the shared VALID_ROLES gate must accept every
 *    role AnA can adopt, or explicitly-passed roles get silently downgraded to
 *    'general' (the #875 regression these fixes address). Derives the full role
 *    set from ROLE_TEMPLATES (a Record<UserRole>) so adding a future role and
 *    forgetting the allowlist fails here.
 * 2. inferRole robustness — substring matches must not misfire ('qa' inside
 *    'squad'/'equality'; bare 'safety' over-matching pharmacovigilance).
 */

import { describe, it, expect } from 'vitest';
import { VALID_ROLES } from '../../routes/ana-ri/shared.js';
import { ROLE_TEMPLATES, inferRole } from '../ana-ri/role-adapter.js';

describe('role allowlist completeness', () => {
  it('shared VALID_ROLES accepts every role in ROLE_TEMPLATES', () => {
    const allRoles = Object.keys(ROLE_TEMPLATES);
    const missing = allRoles.filter(r => !VALID_ROLES.has(r as any));
    expect(missing, `roles missing from shared VALID_ROLES: ${missing.join(', ')}`).toEqual([]);
  });

  it('accepts the three roles added in #875', () => {
    expect(VALID_ROLES.has('biostatistician' as any)).toBe(true);
    expect(VALID_ROLES.has('pharmacovigilance' as any)).toBe(true);
    expect(VALID_ROLES.has('quality' as any)).toBe(true);
  });
});

describe('inferRole robustness', () => {
  it('matches QA titles to quality without firing on "qa" inside other words', () => {
    expect(inferRole({ title: 'QA Director' })).toBe('quality');
    expect(inferRole({ title: 'Squad Lead' })).not.toBe('quality');
    expect(inferRole({ title: 'Head of Equality' })).not.toBe('quality');
  });

  it('routes drug-safety to pharmacovigilance but not generic "safety"', () => {
    expect(inferRole({ title: 'Drug Safety Lead' })).toBe('pharmacovigilance');
    expect(inferRole({ department: 'Drug Safety' })).toBe('pharmacovigilance');
    // Generic / non-PV "safety" must not be force-routed to pharmacovigilance
    expect(inferRole({ department: 'Product Safety' })).not.toBe('pharmacovigilance');
    expect(inferRole({ screenName: 'quality-and-safety-dashboard' })).not.toBe('pharmacovigilance');
  });
});
