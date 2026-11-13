/**
 * The Platform licensing console's server contract and its pure words: the
 * payload types, the tier names, a workspace verdict's sentence and the
 * enforcement report's sentence. Split out of MasterLicensing.tsx on
 * 2026-11-12, when the console's repairs took it past the 1,500-line ceiling
 * (audit:repo-health:ceiling); nothing here is new.
 */

/* ── The server contract, as this surface reads it ─────────────────────────── */

export type Tier = 'free' | 'standard' | 'professional' | 'enterprise';

export const TIERS: Tier[] = ['free', 'standard', 'professional', 'enterprise'];

export const TIER_LABEL: Record<Tier, string> = {
  free: 'Free',
  standard: 'Standard',
  professional: 'Professional',
  enterprise: 'Enterprise',
};

/** `null` minTier is unrestricted — the module is in every tier. */
export function tierLabel(t: string | null | undefined): string {
  if (!t) return 'Unrestricted';
  return TIER_LABEL[t as Tier] ?? t.charAt(0).toUpperCase() + t.slice(1);
}

export interface LicensingModule {
  moduleId: string;
  name: string;
  category: string | null;
  minTier: Tier | null;
  industries: string[];
  deprecated: boolean;
  grantedOrgs: number;
  revokedOrgs: number;
}

export interface LicensingOrg {
  id: string | number;
  name: string;
  slug: string;
  tier: string;
  industryMode: string;
  status: string;
  grants: number;
  revocations: number;
}

export interface LicensingPayload {
  tiers: Tier[];
  modules: LicensingModule[];
  organizations: LicensingOrg[];
}

export type ModuleSource = 'subscribed' | 'included' | 'disabled' | 'tier' | 'industry' | 'launch-scope';

export interface TenantModule {
  moduleId: string;
  name: string;
  category: string | null;
  minTier: Tier | null;
  subscriptionState: 'enabled' | 'disabled' | 'none';
  effective: boolean;
  source: ModuleSource;
}

export interface TenantDetail {
  organization: {
    id: string | number;
    name: string;
    slug: string;
    tier: string;
    industryMode: string;
    status: string;
  };
  modules: TenantModule[];
}

/** GET /api/admin/master/feature-flags — rows straight out of `feature_toggles`. */
export interface FeatureFlag {
  id: number | string;
  feature_key: string;
  description: string | null;
  enabled: boolean;
  enabled_for_organization_ids: unknown;
  enabled_for_client_workspace_ids: unknown;
  updated_at: string | null;
}

/**
 * The verdict sentence for one module in one workspace.
 *
 * The server sends a five-value enum; a platform admin needs the sentence. Both
 * halves are rendered — the effective state as its own words ("Available" /
 * "Not available") and the reason underneath — so the row never depends on a
 * colour to say which way it went.
 */
export function verdictText(m: TenantModule): string {
  switch (m.source) {
    case 'subscribed':
      return 'Granted for this workspace';
    case 'included':
      return 'Included in their plan';
    case 'disabled':
      return 'Turned off for this workspace';
    case 'tier':
      return m.minTier
        ? `Above their plan (needs ${tierLabel(m.minTier)})`
        : 'Above their plan';
    case 'industry':
      return 'Not offered for their industry';
    case 'launch-scope':
      // The rail's own lock (navigation-entitlements applyLaunchScope).
      return 'Not in this release';
    default:
      return m.effective ? 'Available to this workspace' : 'Not available to this workspace';
  }
}

/**
 * What the report's rows are, said from the rows rather than from the mode.
 * Each row records whether it was refused or served; a switch between modes
 * leaves both kinds on the list, and the old mode-only sentence then called
 * requests served while observing "actually refused" (running app, 2026-11-12).
 */
export function reportSentence(mode: string, rows: ReadonlyArray<{ enforced: boolean }>): string {
  const refused = rows.filter((r) => r.enforced).length;
  const lead = mode === 'enforce' ? 'Enforcement is on.' : 'Enforcement is observing only.';
  if (refused > 0 && refused < rows.length) {
    return `${lead} Each row says whether it was refused, or served while enforcement was only observing.`;
  }
  if (rows.length > 0 && refused === rows.length) return `${lead} Everything below was actually refused.`;
  return mode === 'enforce'
    ? `${lead} Everything below was served, recorded while enforcement was only observing.`
    : 'Enforcement is observing only — everything below was served. This is what switching it on would cost.';
}

/* ── Enforcement report ─────────────────────────────────────────────────────
   What route-level enforcement is refusing, or would refuse if it were on.

   The one thing this must never do is collapse "nothing has been observed" into
   "nothing would be refused". They render identically as an empty table and they
   mean opposite things: the second is a green light to switch enforcement on,
   the first is an absence of evidence. `observingSince: null` is the server
   saying it holds no evidence, and the surface below says so in those words. */

export interface EnforcementObservation {
  path: string;
  organizationId: number;
  modules: string[];
  reasons: string[];
  enforced: boolean;
  firstSeen: string;
  lastSeen: string;
  count: number;
}

export interface EnforcementReport {
  mode: string;
  /** null = this server holds no observations. NOT "nothing would be refused". */
  observingSince: string | null;
  perProcess: boolean;
  capacity: number;
  truncated: boolean;
  organizationsAffected: number;
  modulesAffected: string[];
  observations: EnforcementObservation[];
}
