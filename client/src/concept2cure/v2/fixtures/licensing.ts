/**
 * Licensing / billing / access data -- ported verbatim from concept2cure-v2:
 *   server/services/billing.ts  -> DTC_PRICING, PRICING (by archetype),
 *                                  BUNDLE_DISCOUNTS, tier levels, features
 *   server/routes/billing.ts    -> /checkout /portal /status /pricing
 *                                  /dtc-checkout /dtc-pricing
 *   server/routes/admin/access-management.ts -> GRANTABLE_ROLES,
 *                                  BUSINESS_TIER_ROLES, governed grant/revoke
 *
 * GENERATED from the kit data file -- edit the kit first, then re-port.
 */

/* ---- Interfaces ---- */

export interface DtcTier {
  name: string;
  tier: string;
  baseMonthly: number | null;
  annualDiscountPct: number;
  maxUsers: number;
  maxProjects: number;
  maxStorageGB: number;
  deepResearchCredits: number;
  builderCredits: number;
  trialDays: number;
}

export interface B2bTier {
  name: string;
  tier: string;
  perUserMonthly: number | null;
  annualDiscountPct: number;
  includedTokensMonthly: number;
  maxProjects: number;
  maxStorageGB: number;
  minCommitmentMonths: number;
  features: string[];
}

export interface Archetype {
  id: string;
  label: string;
  family: string;
}

export interface Bundle {
  minUsers: number;
  discountPct: number;
  label: string;
}

export interface LicRole {
  id: string;
  label: string;
  business: boolean;
  desc: string;
}

export interface BillingStatus {
  tier: string;
  paymentStatus: string;
  billingCycle: string;
  seats: number;
  currentPeriodEnd?: string;
}

/* ---- DTC self-service tiers (DTC_PRICING) -- dollars ---- */
export const LIC_DTC: DtcTier[] = [
  { name: 'Researcher', tier: 'free', baseMonthly: 0, annualDiscountPct: 0, maxUsers: 1, maxProjects: 2, maxStorageGB: 1, deepResearchCredits: 5, builderCredits: 0, trialDays: 0 },
  { name: 'Startup Biotech', tier: 'standard', baseMonthly: 499, annualDiscountPct: 15, maxUsers: 5, maxProjects: 10, maxStorageGB: 25, deepResearchCredits: 50, builderCredits: 10, trialDays: 14 },
  { name: 'Growth', tier: 'professional', baseMonthly: 1499, annualDiscountPct: 15, maxUsers: 25, maxProjects: 50, maxStorageGB: 100, deepResearchCredits: 200, builderCredits: 50, trialDays: 14 },
  { name: 'Enterprise', tier: 'enterprise', baseMonthly: null, annualDiscountPct: 0, maxUsers: -1, maxProjects: -1, maxStorageGB: -1, deepResearchCredits: -1, builderCredits: -1, trialDays: 30 },
];

/* ---- B2B per-user PRICING by archetype (dollars/user/month) ---- */
export const LIC_PRICING: Record<string, B2bTier[]> = {
  pharma: [
    { name: 'Standard', tier: 'standard', perUserMonthly: 459, annualDiscountPct: 13, includedTokensMonthly: 4_000_000, maxProjects: 20, maxStorageGB: 25, minCommitmentMonths: 3, features: ['AI Copilot', 'eCTD Authoring', 'CER Generation', '510(k) Module', 'Compliance Analysis', 'Basic Integrations'] },
    { name: 'Professional', tier: 'professional', perUserMonthly: 399, annualDiscountPct: 13, includedTokensMonthly: 8_000_000, maxProjects: 100, maxStorageGB: 100, minCommitmentMonths: 3, features: ['Everything in Standard', 'Advanced Analytics', 'Priority Support', 'Custom Workflows', 'All Integrations', 'SAML SSO'] },
    { name: 'Enterprise', tier: 'enterprise', perUserMonthly: null, annualDiscountPct: 20, includedTokensMonthly: 20_000_000, maxProjects: -1, maxStorageGB: 1000, minCommitmentMonths: 12, features: ['Everything in Professional', 'Dedicated Support', 'Custom AI Models', 'On-Prem Option', 'SLA Guarantee', 'Compliance Audit Pack'] },
  ],
  medtech: [
    { name: 'Standard', tier: 'standard', perUserMonthly: 349, annualDiscountPct: 13, includedTokensMonthly: 2_000_000, maxProjects: 20, maxStorageGB: 25, minCommitmentMonths: 3, features: ['AI Copilot', '510(k) Workflow', 'CER Generation', 'Predicate Intelligence', 'eSTAR Builder', 'GSPR Mapping'] },
    { name: 'Professional', tier: 'professional', perUserMonthly: 299, annualDiscountPct: 13, includedTokensMonthly: 4_000_000, maxProjects: 100, maxStorageGB: 100, minCommitmentMonths: 3, features: ['Everything in Standard', 'EU MDR/IVDR Support', 'Advanced Analytics', 'Priority Support', 'All Integrations', 'SAML SSO'] },
    { name: 'Enterprise', tier: 'enterprise', perUserMonthly: null, annualDiscountPct: 20, includedTokensMonthly: 20_000_000, maxProjects: -1, maxStorageGB: 1000, minCommitmentMonths: 12, features: ['Everything in Professional', 'Dedicated CSM', 'Custom Validations', 'On-Prem Option', 'SLA Guarantee', 'Audit Pack'] },
  ],
  academic: [
    { name: 'Research', tier: 'standard', perUserMonthly: 149, annualDiscountPct: 20, includedTokensMonthly: 500_000, maxProjects: 10, maxStorageGB: 10, minCommitmentMonths: 3, features: ['AI Copilot', 'Literature Review', 'Protocol Design', 'Basic CER', 'Evidence Synthesis', 'Export to PDF/DOCX'] },
    { name: 'Department', tier: 'professional', perUserMonthly: 119, annualDiscountPct: 20, includedTokensMonthly: 1_000_000, maxProjects: 50, maxStorageGB: 50, minCommitmentMonths: 3, features: ['Everything in Research', 'Biostatistics Module', 'Advanced Analytics', 'Team Collaboration', 'All Integrations'] },
    { name: 'Institution', tier: 'enterprise', perUserMonthly: null, annualDiscountPct: 25, includedTokensMonthly: 5_000_000, maxProjects: -1, maxStorageGB: 500, minCommitmentMonths: 12, features: ['Everything in Department', 'Unlimited Projects', 'Custom Training', 'Dedicated Support', 'SAML SSO'] },
  ],
};

/* Archetype (organizations.industry_mode) -> pricing family. Verbatim aliases. */
export const LIC_ARCHETYPES: Archetype[] = [
  { id: 'virtual_biotech', label: 'Virtual biotech', family: 'pharma' },
  { id: 'biotech', label: 'Biotech', family: 'pharma' },
  { id: 'big_pharma', label: 'Big pharma', family: 'pharma' },
  { id: 'pharma', label: 'Pharma', family: 'pharma' },
  { id: 'cro', label: 'CRO / research', family: 'pharma' },
  { id: 'medtech', label: 'Medical device & IVD', family: 'medtech' },
  { id: 'regulatory', label: 'Regulatory consulting', family: 'pharma' },
  { id: 'medical_writing', label: 'Medical writing', family: 'pharma' },
  { id: 'academic', label: 'Academic & research', family: 'academic' },
];

/* Bundle (seat) discounts -- BUNDLE_DISCOUNTS */
export const LIC_BUNDLES: Bundle[] = [
  { minUsers: 5, discountPct: 10, label: 'Team (5+)' },
  { minUsers: 10, discountPct: 15, label: 'Department (10+)' },
  { minUsers: 25, discountPct: 20, label: 'Division (25+)' },
  { minUsers: 50, discountPct: 25, label: 'Enterprise (50+)' },
];

export const LIC_TIER_LEVEL: Record<string, number> = {
  free: 0,
  standard: 1,
  professional: 2,
  enterprise: 3,
};

/* Platform-grantable roles (GRANTABLE_ROLES); business-tier confer finance. */
export const LIC_ROLES: LicRole[] = [
  { id: 'owner', label: 'Owner', business: true, desc: 'Full control incl. finance & billing' },
  { id: 'business_admin', label: 'Business admin', business: true, desc: 'Finance, billing, business center' },
  { id: 'super_admin', label: 'Super admin', business: true, desc: 'Platform-wide administration' },
  { id: 'platform_admin', label: 'Platform admin', business: false, desc: 'Platform ops, no finance' },
  { id: 'support', label: 'Support', business: false, desc: 'Assist tenants; read-heavy' },
];


/* Helper: seat bundle discount lookup */
export function licBundle(seats: number): { discountPct: number; label: string | null } {
  let d = 0;
  let l: string | null = null;
  LIC_BUNDLES.forEach((b) => {
    if (seats >= b.minUsers) {
      d = b.discountPct;
      l = b.label;
    }
  });
  return { discountPct: d, label: l };
}
