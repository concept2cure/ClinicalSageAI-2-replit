// @vitest-environment jsdom
/**
 * Onboarding activate() — pure activation mappers.
 *
 * activate() was a documented no-op; it now calls the real endpoints. These
 * tests lock the pure client→server contract bridges so every value the
 * wizard can emit is one the live endpoints actually accept:
 *   • archetypeToPrimaryIndustry: every selectable LIC_ARCHETYPES id maps
 *     into the PRIMARY_INDUSTRY enum validated by
 *     PATCH /api/mdx/industry-profile; unknowns fall back to biotech_pharma.
 *   • inviteRoleToOrgRole: every LIC_ROLES id maps into the org-role enum of
 *     POST /api/tenant-users (createUserSchema); platform-tier roles are
 *     down-scoped, unknowns fail closed to least-privilege 'member'.
 *   • inviteNameFromEmail: always satisfies the endpoint's name min-length.
 *   • checkoutRequestFor: paid tiers route to the correct billing endpoint
 *     with a schema-valid body; enterprise (custom pricing) and the DTC free
 *     tier (rejected by the route schema) are honestly UNAVAILABLE — never a
 *     pretend checkout call.
 */
import { describe, it, expect } from 'vitest';
import {
  archetypeToPrimaryIndustry,
  inviteRoleToOrgRole,
  inviteNameFromEmail,
  checkoutRequestFor,
} from '../surfaces/Onboarding';
import { LIC_ARCHETYPES, LIC_ROLES } from '../fixtures/onboarding-data';

/* Mirrors PRIMARY_INDUSTRY in server/routes/mdx-industry-context.ts. */
const PRIMARY_INDUSTRY = [
  'medical_device_diagnostics',
  'biotech_pharma',
  'cro',
  'regulatory_consulting',
  'academic_research',
];

/* Mirrors createUserSchema.role in server/routes/tenant-users.ts. */
const ORG_ROLES = ['admin', 'manager', 'member', 'viewer'];

describe('archetypeToPrimaryIndustry', () => {
  it('maps every selectable archetype into the PATCH /api/mdx/industry-profile enum', () => {
    for (const a of LIC_ARCHETYPES) {
      expect(PRIMARY_INDUSTRY).toContain(archetypeToPrimaryIndustry(a.id));
    }
  });

  it('maps the specific archetype semantics', () => {
    expect(archetypeToPrimaryIndustry('medtech')).toBe('medical_device_diagnostics');
    expect(archetypeToPrimaryIndustry('cro')).toBe('cro');
    expect(archetypeToPrimaryIndustry('regulatory')).toBe('regulatory_consulting');
    expect(archetypeToPrimaryIndustry('medical_writing')).toBe('regulatory_consulting');
    expect(archetypeToPrimaryIndustry('academic')).toBe('academic_research');
    for (const pharma of ['virtual_biotech', 'biotech', 'big_pharma', 'pharma']) {
      expect(archetypeToPrimaryIndustry(pharma)).toBe('biotech_pharma');
    }
  });

  it('falls back to biotech_pharma for unknown archetypes', () => {
    expect(archetypeToPrimaryIndustry('something_else')).toBe('biotech_pharma');
    expect(archetypeToPrimaryIndustry('')).toBe('biotech_pharma');
  });
});

describe('inviteRoleToOrgRole', () => {
  it('maps every wizard-selectable platform role into the POST /api/tenant-users enum', () => {
    for (const r of LIC_ROLES) {
      expect(ORG_ROLES).toContain(inviteRoleToOrgRole(r.id));
    }
  });

  it('down-scopes business-tier roles to org admin and support to member', () => {
    expect(inviteRoleToOrgRole('owner')).toBe('admin');
    expect(inviteRoleToOrgRole('business_admin')).toBe('admin');
    expect(inviteRoleToOrgRole('super_admin')).toBe('admin');
    expect(inviteRoleToOrgRole('platform_admin')).toBe('manager');
    expect(inviteRoleToOrgRole('support')).toBe('member');
  });

  it('fails closed to least-privilege member for unknown roles', () => {
    expect(inviteRoleToOrgRole('root')).toBe('member');
    expect(inviteRoleToOrgRole('')).toBe('member');
  });
});

describe('inviteNameFromEmail', () => {
  it('uses the email local part as the provisional display name', () => {
    expect(inviteNameFromEmail('jane.doe@bright.bio')).toBe('jane.doe');
    expect(inviteNameFromEmail('ra-lead@org.com')).toBe('ra-lead');
  });

  it('always satisfies the endpoint min-length of 2', () => {
    // Single-char local part → full email keeps the schema satisfied.
    expect(inviteNameFromEmail('a@org.com')).toBe('a@org.com');
    expect(inviteNameFromEmail('a@org.com').length).toBeGreaterThanOrEqual(2);
    expect(inviteNameFromEmail('jd@org.com')).toBe('jd');
  });
});

describe('checkoutRequestFor', () => {
  it('routes DTC paid tiers to POST /api/billing/dtc-checkout with a schema-valid body', () => {
    const req = checkoutRequestFor('dtc', 'standard', 'annual', 5);
    expect(req).toEqual({
      path: '/api/billing/dtc-checkout',
      body: { tier: 'standard', billingCycle: 'annual' },
    });
    const pro = checkoutRequestFor('dtc', 'professional', 'monthly', 1);
    expect(pro).toEqual({
      path: '/api/billing/dtc-checkout',
      body: { tier: 'professional', billingCycle: 'monthly' },
    });
  });

  it('routes per-user (b2b) paid tiers to POST /api/billing/checkout with seats', () => {
    const req = checkoutRequestFor('b2b', 'professional', 'annual', 12);
    expect(req).toEqual({
      path: '/api/billing/checkout',
      body: { tier: 'professional', billingCycle: 'annual', seats: 12 },
    });
  });

  it('clamps seats to a positive integer (schema requires min 1)', () => {
    const req = checkoutRequestFor('b2b', 'standard', 'monthly', 0);
    expect('path' in req && req.body.seats).toBe(1);
    const neg = checkoutRequestFor('b2b', 'standard', 'monthly', -3);
    expect('path' in neg && neg.body.seats).toBe(1);
  });

  it('normalizes any non-annual cycle to monthly (schema enum)', () => {
    const req = checkoutRequestFor('dtc', 'standard', 'weekly', 1);
    expect('path' in req && req.body.billingCycle).toBe('monthly');
  });

  it('reports enterprise as unavailable — custom pricing has no self-service checkout', () => {
    for (const model of ['dtc', 'b2b']) {
      const req = checkoutRequestFor(model, 'enterprise', 'annual', 50);
      expect('unavailable' in req).toBe(true);
      if ('unavailable' in req) {
        expect(req.unavailable).toMatch(/no plan was provisioned/i);
      }
    }
  });

  /* This case used to assert the opposite, on the premise named in its own
     title: "the route schema rejects tier free". That premise was removed by
     the commit that made the free tier provision for real — the DTC endpoint
     now sets the tier, invalidates the posture and provisions the modules
     without touching Stripe, and says so in a comment on checkoutRequestFor.
     The assertion outlived the reason for it and started failing on the branch.

     Realigned rather than deleted: the behaviour still needs pinning, and the
     interesting property is that free goes to the DTC endpoint like every other
     self-service tier instead of being special-cased into a dead end. */
  it('sends the DTC free tier to checkout like any other self-service tier', () => {
    const req = checkoutRequestFor('dtc', 'free', 'monthly', 1);
    expect('unavailable' in req).toBe(false);
    if (!('unavailable' in req)) {
      expect(req.path).toBe('/api/billing/dtc-checkout');
      expect(req.body).toMatchObject({ tier: 'free', billingCycle: 'monthly' });
    }
  });

  it('still refuses enterprise on the DTC path — custom pricing has no checkout', () => {
    // The neighbouring case above covers both models; this one guards the
    // specific branch order, so that widening the free tier did not also let
    // enterprise through the DTC path.
    const req = checkoutRequestFor('dtc', 'enterprise', 'monthly', 1);
    expect('unavailable' in req).toBe(true);
  });
});
