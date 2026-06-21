/**
 * @fileoverview Intelligent entitlements resolver
 * @module server/services/licensing/entitlements-service
 * @version 1.0.0
 *
 * @description
 * The "intelligent licensing" layer. Composes the existing license-manager
 * (tier, module catalog, feature gating, quotas) with the EULA acceptance
 * service into a single, explainable entitlements summary per organization /
 * user — and runs a rule-based recommendation engine that tells the user
 * exactly what is locked, why, and how to unlock it (upgrade target, quota
 * pressure, outstanding agreements).
 *
 * This module owns NO pricing. It maps capability → required tier and
 * surfaces upgrade *targets*; commercial pricing lives in billing.
 */

import {
  getLicenseInfo,
  getModuleCatalog,
  checkProjectQuota,
  checkUserQuota,
  FEATURE_TIER_MAP,
  type ModuleCatalogEntry,
} from '../license-manager.js';
import { getOutstandingAgreements, type LicenseAgreement } from './eula-service.js';

// ─────────────────────────────────────────────────────────────────────────────
// Tier model
// ─────────────────────────────────────────────────────────────────────────────

export const TIER_ORDER = ['free', 'standard', 'professional', 'enterprise'] as const;
export type Tier = (typeof TIER_ORDER)[number];

export function tierLevel(tier: string): number {
  const idx = TIER_ORDER.indexOf(tier as Tier);
  return idx === -1 ? 0 : idx;
}

/** The next tier above the given one, or null at the ceiling. */
export function nextTier(tier: string): Tier | null {
  const idx = tierLevel(tier);
  return idx < TIER_ORDER.length - 1 ? TIER_ORDER[idx + 1] : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature metadata — maps each gated feature to its owning module + business
// value, so recommendations can rank what an upgrade unlocks. Keys mirror
// license-manager's FEATURE_TIER_MAP.
// ─────────────────────────────────────────────────────────────────────────────

type FeatureValue = 'high' | 'medium' | 'low';

interface FeatureMeta {
  label: string;
  module: string;
  value: FeatureValue;
}

export const FEATURE_METADATA: Record<string, FeatureMeta> = {
  // Core
  chat: { label: 'AnA Chat', module: 'AnA AI', value: 'high' },
  csr_search: { label: 'CSR Search', module: 'Evidence', value: 'medium' },
  basic_intelligence: { label: 'Basic Intelligence', module: 'Intelligence', value: 'low' },
  project_management: { label: 'Project Management', module: 'Platform', value: 'high' },
  pubmed_connector: { label: 'PubMed Connector', module: 'Evidence', value: 'medium' },
  clinical_trials_gov: { label: 'ClinicalTrials.gov Connector', module: 'Evidence', value: 'medium' },
  // Standard
  deep_research: { label: 'Deep Research', module: 'Evidence', value: 'high' },
  csr_builder: { label: 'CSR Builder', module: 'Specialist', value: 'high' },
  ectd_authoring: { label: 'eCTD Authoring', module: 'Submissions', value: 'high' },
  fda_connector: { label: 'FDA Connector', module: 'Evidence', value: 'medium' },
  ema_connector: { label: 'EMA Connector', module: 'Evidence', value: 'medium' },
  ana_platform_control: { label: 'AnA Platform Control', module: 'AnA AI', value: 'medium' },
  ana_settings_management: { label: 'AnA Settings Management', module: 'AnA AI', value: 'low' },
  ana_project_management: { label: 'AnA Project Management', module: 'AnA AI', value: 'medium' },
  ana_module_control: { label: 'AnA Module Control', module: 'AnA AI', value: 'low' },
  ana_onboarding: { label: 'AnA Onboarding', module: 'AnA AI', value: 'low' },
  ana_compliance_config: { label: 'AnA Compliance Config', module: 'AnA AI', value: 'medium' },
  ana_ai_config: { label: 'AnA AI Config', module: 'AnA AI', value: 'low' },
  ana_usage_analysis: { label: 'AnA Usage Analysis', module: 'AnA AI', value: 'low' },
  safety_narrative: { label: 'Safety Narrative', module: 'Specialist', value: 'medium' },
  intelligent_reports: { label: 'Intelligent Reports', module: 'Reporting', value: 'medium' },
  // Professional
  ctd_builder: { label: 'CTD Builder', module: 'Submissions', value: 'high' },
  multi_agency_export: { label: 'Multi-Agency Export', module: 'Submissions', value: 'high' },
  veeva_connector: { label: 'Veeva Connector', module: 'Evidence', value: 'medium' },
  medidata_connector: { label: 'Medidata Connector', module: 'Evidence', value: 'medium' },
  pmda_connector: { label: 'PMDA Connector', module: 'Evidence', value: 'low' },
  nmpa_connector: { label: 'NMPA Connector', module: 'Evidence', value: 'low' },
  document_builder: { label: 'Document Builder', module: 'Authoring', value: 'high' },
  biostatistics: { label: 'Biostatistics', module: 'Specialist', value: 'high' },
  statistical_defensibility: { label: 'Statistical Defensibility', module: 'Specialist', value: 'medium' },
  cmc_blueprint: { label: 'CMC Blueprint', module: 'Biopharma', value: 'high' },
  ana_proactive_mode: { label: 'AnA Proactive Mode', module: 'AnA AI', value: 'high' },
  ana_auto_remediate: { label: 'AnA Auto-Remediate', module: 'AnA AI', value: 'medium' },
  // Enterprise
  unlimited_research: { label: 'Unlimited Research', module: 'Evidence', value: 'high' },
  api_access: { label: 'API Access', module: 'Platform', value: 'high' },
  sso: { label: 'SSO / SAML', module: 'Platform', value: 'high' },
  custom_integrations: { label: 'Custom Integrations', module: 'Platform', value: 'medium' },
  ana_autonomous_actions: { label: 'AnA Autonomous Actions', module: 'AnA AI', value: 'high' },
  electronic_signatures: { label: 'Electronic Signatures (21 CFR Part 11)', module: 'Compliance', value: 'high' },
};

const VALUE_WEIGHT: Record<FeatureValue, number> = { high: 3, medium: 2, low: 1 };

// ─────────────────────────────────────────────────────────────────────────────
// Resolved shapes
// ─────────────────────────────────────────────────────────────────────────────

export interface FeatureEntitlement {
  key: string;
  label: string;
  module: string;
  requiredTier: string;
  value: FeatureValue;
  available: boolean;
}

export interface QuotaUsage {
  key: 'projects' | 'users';
  label: string;
  current: number;
  max: number;
  pct: number; // 0..100
  withinQuota: boolean;
}

export interface Recommendation {
  type: 'license_acceptance' | 'quota_warning' | 'upgrade_tier' | 'module_enable';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  action?: { label: string; url: string };
  meta?: Record<string, unknown>;
}

export interface EntitlementSummary {
  organizationId: number;
  tier: string;
  industryMode: string;
  nextTier: Tier | null;
  modules: ModuleCatalogEntry[];
  features: FeatureEntitlement[];
  quotas: QuotaUsage[];
  outstandingAgreements: Pick<LicenseAgreement, 'id' | 'agreementKey' | 'version' | 'title' | 'scope'>[];
  licenseAccepted: boolean;
  recommendations: Recommendation[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure builders (unit-testable, no DB)
// ─────────────────────────────────────────────────────────────────────────────

/** Build the full feature catalog with availability for a given tier. */
export function buildFeatureCatalog(tier: string): FeatureEntitlement[] {
  const level = tierLevel(tier);
  return Object.entries(FEATURE_TIER_MAP).map(([key, requiredTier]) => {
    const meta = FEATURE_METADATA[key] ?? { label: key, module: 'Other', value: 'low' as FeatureValue };
    return {
      key,
      label: meta.label,
      module: meta.module,
      requiredTier,
      value: meta.value,
      available: level >= tierLevel(requiredTier),
    };
  });
}

interface RecommendationInput {
  tier: string;
  features: FeatureEntitlement[];
  quotas: QuotaUsage[];
  outstandingAgreements: { id: string; title: string }[];
}

const UPGRADE_URL = '/settings/subscription';

/**
 * Rule-based recommendation engine. Intelligent in that it (a) prioritises
 * compliance (license acceptance) and quota pressure, then (b) recommends the
 * single upgrade target that unlocks the most business value, listing the
 * highest-value features it would unlock.
 */
export function computeRecommendations(input: RecommendationInput): Recommendation[] {
  const recs: Recommendation[] = [];

  // 1) Outstanding license agreements — highest priority (blocks compliant use).
  if (input.outstandingAgreements.length > 0) {
    recs.push({
      type: 'license_acceptance',
      severity: 'critical',
      title: 'Action required: accept license agreements',
      detail: `${input.outstandingAgreements.length} agreement(s) require acceptance: ${input.outstandingAgreements
        .map(a => a.title)
        .join(', ')}.`,
      action: { label: 'Review & accept', url: '/legal/agreements' },
      meta: { agreementIds: input.outstandingAgreements.map(a => a.id) },
    });
  }

  // 2) Quota pressure.
  for (const q of input.quotas) {
    if (!q.withinQuota || q.pct >= 100) {
      recs.push({
        type: 'quota_warning',
        severity: 'critical',
        title: `${q.label} limit reached`,
        detail: `You are using ${q.current} of ${q.max} ${q.label.toLowerCase()}. Upgrade to add more.`,
        action: { label: 'Upgrade plan', url: UPGRADE_URL },
        meta: { key: q.key, current: q.current, max: q.max },
      });
    } else if (q.pct >= 80) {
      recs.push({
        type: 'quota_warning',
        severity: 'warning',
        title: `Approaching ${q.label.toLowerCase()} limit`,
        detail: `You are using ${q.current} of ${q.max} ${q.label.toLowerCase()} (${q.pct}%).`,
        action: { label: 'Upgrade plan', url: UPGRADE_URL },
        meta: { key: q.key, current: q.current, max: q.max },
      });
    }
  }

  // 3) Best upgrade target — the next tier that unlocks the most value.
  const target = nextTier(input.tier);
  if (target) {
    const targetLevel = tierLevel(target);
    const wouldUnlock = input.features
      .filter(f => !f.available && tierLevel(f.requiredTier) <= targetLevel)
      .sort((a, b) => VALUE_WEIGHT[b.value] - VALUE_WEIGHT[a.value]);

    if (wouldUnlock.length > 0) {
      const top = wouldUnlock.slice(0, 3).map(f => f.label);
      recs.push({
        type: 'upgrade_tier',
        severity: 'info',
        title: `Upgrade to ${target} to unlock ${wouldUnlock.length} feature${
          wouldUnlock.length === 1 ? '' : 's'
        }`,
        detail: `Including: ${top.join(', ')}${wouldUnlock.length > top.length ? ', and more' : ''}.`,
        action: { label: `See ${target} plan`, url: UPGRADE_URL },
        meta: { targetTier: target, unlockCount: wouldUnlock.length, features: wouldUnlock.map(f => f.key) },
      });
    }
  }

  return recs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolver (DB-backed)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the full, explainable entitlements summary for an organization
 * (optionally scoped to a user for license-acceptance status).
 */
export async function resolveEntitlements(
  organizationId: number,
  userId?: number
): Promise<EntitlementSummary | null> {
  const license = await getLicenseInfo(organizationId);
  if (!license) return null;

  const [modules, projectQuota, userQuota, outstanding] = await Promise.all([
    getModuleCatalog(organizationId),
    checkProjectQuota(organizationId),
    checkUserQuota(organizationId),
    userId != null ? getOutstandingAgreements(userId, organizationId) : Promise.resolve([]),
  ]);

  const features = buildFeatureCatalog(license.tier);

  const quotas: QuotaUsage[] = [
    {
      key: 'projects',
      label: 'Projects',
      current: projectQuota.currentCount,
      max: projectQuota.maxAllowed,
      pct: pct(projectQuota.currentCount, projectQuota.maxAllowed),
      withinQuota: projectQuota.withinQuota,
    },
    {
      key: 'users',
      label: 'Users',
      current: userQuota.currentCount,
      max: userQuota.maxAllowed,
      pct: pct(userQuota.currentCount, userQuota.maxAllowed),
      withinQuota: userQuota.withinQuota,
    },
  ];

  const recommendations = computeRecommendations({
    tier: license.tier,
    features,
    quotas,
    outstandingAgreements: outstanding.map(a => ({ id: a.id, title: a.title })),
  });

  return {
    organizationId,
    tier: license.tier,
    industryMode: license.industryMode,
    nextTier: nextTier(license.tier),
    modules,
    features,
    quotas,
    outstandingAgreements: outstanding.map(a => ({
      id: a.id,
      agreementKey: a.agreementKey,
      version: a.version,
      title: a.title,
      scope: a.scope,
    })),
    licenseAccepted: outstanding.length === 0,
    recommendations,
  };
}

function pct(current: number, max: number): number {
  if (!max || max <= 0) return 0;
  return Math.min(100, Math.round((current / max) * 100));
}
