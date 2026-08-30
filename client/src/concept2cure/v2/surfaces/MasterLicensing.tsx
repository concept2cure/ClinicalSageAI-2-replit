/**
 * Master Licensing — the platform-admin control room for what each plan tier
 * includes and what each workspace is actually entitled to.
 *
 * Three tabs, one governed write path:
 *   Packaging     — the module x tier matrix. Sets `minTier` per module.
 *   Tenants       — per-organization tier, plus the module-by-module verdict
 *                   (effective state AND the reason for it, in plain words).
 *   Feature flags — the deployment-wide toggles in `feature_toggles`.
 *
 * ── Fixture-free by construction ─────────────────────────────────────────────
 * Every list on this surface is a live read of
 * `/api/admin/master/licensing`, `/api/admin/master/licensing/tenants/:id` and
 * `/api/admin/master/feature-flags`. There is no inline catalogue, no seeded
 * tier matrix and no sample organization anywhere in this file. A failed read
 * renders `<ErrorState>` with a retry — never an empty table, because "we could
 * not load the licensing model" and "this platform licenses nothing" are
 * opposite facts and a licensing console that confuses them is worse than one
 * that does not load. Shape guards are passed to `useLiveData` so a 200 that is
 * not the documented payload reaches the SAME error branch rather than being
 * cast into a lie about the type.
 *
 * ── Every write reports the server's outcome ─────────────────────────────────
 * All four mutations are optimistic and all four revert on failure, and the
 * toast carries `apiErrorText(...)` — the server's own sentence — rather than a
 * generic one this file made up. A change that the server refused is never left
 * on screen looking applied.
 *
 * ── Why the reason prompt is the shared dialog ───────────────────────────────
 * The server requires a reason (min 3 chars) on every mutation here and audit-
 * logs it verbatim. That is exactly what `<GovernedConfirmDialog>` exists for,
 * so this surface uses it rather than growing a fourth reason-for-change modal.
 * `minReason` is set to 3 to match the server's floor precisely: a client gate
 * stricter than the API would refuse writes the platform actually allows, and a
 * looser one would produce a round trip that can only fail.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { I } from '../icons';
import { useLiveData, ErrorState, EmptyState, hasKeys } from '../dataConnect';
import { apiCall, apiErrorText } from '../apiCall';
import { usePublishSurfaceContext } from '../surfaceContext';
import { useSurfaceActionHandlers } from '../surfaceActions';
import { ceremonyOpen } from '../ceremony';
import { C2CToast, useToast } from '../toast';
import {
  GovernedConfirmDialog,
  type ConfirmConfig,
} from '../../_shared/components/GovernedConfirmDialog';
import AccessRequestsPanel from './licensing/AccessRequestsPanel';
import EnforcementModeControl from './licensing/EnforcementModeControl';
import LicensingHistoryPanel from './licensing/LicensingHistoryPanel';
import { TrialsPanel } from './licensing/TrialsPanel';
import '../styles/misc-surfaces-v2.css';

/* ── The server contract, as this surface reads it ─────────────────────────── */

type Tier = 'free' | 'standard' | 'professional' | 'enterprise';

const TIERS: Tier[] = ['free', 'standard', 'professional', 'enterprise'];

const TIER_LABEL: Record<Tier, string> = {
  free: 'Free',
  standard: 'Standard',
  professional: 'Professional',
  enterprise: 'Enterprise',
};

/** `null` minTier is unrestricted — the module is in every tier. */
function tierLabel(t: string | null | undefined): string {
  if (!t) return 'Unrestricted';
  return TIER_LABEL[t as Tier] ?? t.charAt(0).toUpperCase() + t.slice(1);
}

interface LicensingModule {
  moduleId: string;
  name: string;
  category: string | null;
  minTier: Tier | null;
  industries: string[];
  deprecated: boolean;
  grantedOrgs: number;
  revokedOrgs: number;
}

interface LicensingOrg {
  id: string | number;
  name: string;
  slug: string;
  tier: string;
  industryMode: string;
  status: string;
  grants: number;
  revocations: number;
}

interface LicensingPayload {
  tiers: Tier[];
  modules: LicensingModule[];
  organizations: LicensingOrg[];
}

type ModuleSource = 'subscribed' | 'included' | 'disabled' | 'tier' | 'industry';

interface TenantModule {
  moduleId: string;
  name: string;
  category: string | null;
  minTier: Tier | null;
  subscriptionState: 'enabled' | 'disabled' | 'none';
  effective: boolean;
  source: ModuleSource;
}

interface TenantDetail {
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
interface FeatureFlag {
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
function verdictText(m: TenantModule): string {
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
    default:
      return m.effective ? 'Available to this workspace' : 'Not available to this workspace';
  }
}

/* ── Enforcement report ─────────────────────────────────────────────────────
   What route-level enforcement is refusing, or would refuse if it were on.

   The one thing this must never do is collapse "nothing has been observed" into
   "nothing would be refused". They render identically as an empty table and they
   mean opposite things: the second is a green light to switch enforcement on,
   the first is an absence of evidence. `observingSince: null` is the server
   saying it holds no evidence, and the surface below says so in those words. */

interface EnforcementObservation {
  path: string;
  organizationId: number;
  modules: string[];
  reasons: string[];
  enforced: boolean;
  firstSeen: string;
  lastSeen: string;
  count: number;
}

interface EnforcementReport {
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

/* ── The one governed action shape ─────────────────────────────────────────── */

type Pending =
  | { kind: 'module-tier'; config: ConfirmConfig; moduleId: string; label: string; from: Tier | null; to: Tier | null }
  | { kind: 'tenant-tier'; config: ConfirmConfig; orgId: string; label: string; from: string; to: Tier }
  | { kind: 'tenant-provision'; config: ConfirmConfig; orgId: string; label: string; tier: string }
  | { kind: 'tenant-module'; config: ConfirmConfig; orgId: string; moduleId: string; label: string; enabled: boolean }
  | { kind: 'flag'; config: ConfirmConfig; key: string; label: string; enabled: boolean }
  | { kind: 'enforcement-clear'; config: ConfirmConfig; observations: number };

const TABS = [
  { id: 'packaging', label: 'Packaging', icon: 'layers' },
  { id: 'tenants', label: 'Tenants', icon: 'building' },
  { id: 'access-requests', label: 'Access requests', icon: 'clipboardList' },
  { id: 'trials', label: 'Trials', icon: 'clock' },
  { id: 'flags', label: 'Feature flags', icon: 'sliders' },
  { id: 'enforcement', label: 'Enforcement', icon: 'shieldAlert' },
  { id: 'history', label: 'Decisions', icon: 'history' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const LICENSING_PATH = '/api/admin/master/licensing';
const FLAGS_PATH = '/api/admin/master/feature-flags';
const ENFORCEMENT_PATH = '/api/admin/master/licensing/enforcement';

/** Absolute, not relative: "3 hours ago" invites an operator to reason about a
 *  window whose start this server cannot actually vouch for across a restart. */
function whenText(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function MasterLicensing() {
  const [tab, setTab] = useState<TabId>('packaging');
  const [reload, setReload] = useState(0);
  const [toast, fireToast] = useToast();
  const [pending, setPending] = useState<Pending | null>(null);

  const retry = () => setReload((n) => n + 1);

  /* ── Live reads ─────────────────────────────────────────────────────────── */

  const lic = useLiveData<LicensingPayload>(
    LICENSING_PATH,
    [reload],
    hasKeys<LicensingPayload>('modules', 'organizations'),
  );

  const [selectedOrg, setSelectedOrg] = useState<string>('');
  const tenantPath = selectedOrg
    ? `${LICENSING_PATH}/tenants/${encodeURIComponent(selectedOrg)}`
    : null;
  const tenant = useLiveData<TenantDetail>(
    tenantPath,
    [tenantPath, reload],
    hasKeys<TenantDetail>('organization', 'modules'),
  );

  // Only fetched once the tab is opened: a flag list nobody is looking at is a
  // request nobody asked for.
  const flagsPath = tab === 'flags' ? FLAGS_PATH : null;
  const flagsState = useLiveData<{ flags: FeatureFlag[] }>(
    flagsPath,
    [flagsPath, reload],
    hasKeys<{ flags: FeatureFlag[] }>('flags'),
  );

  const enfPath = tab === 'enforcement' ? ENFORCEMENT_PATH : null;
  const enf = useLiveData<EnforcementReport>(
    enfPath,
    [enfPath, reload],
    hasKeys<EnforcementReport>('mode', 'observations'),
  );

  /* ── Editable copies, seeded once per resolved fetch ────────────────────────
     Optimistic writes need somewhere to write. Each copy is seeded from the
     live payload by identity, so the seed runs when the fetch re-resolves and
     never on an unrelated re-render. */

  const [modules, setModules] = useState<LicensingModule[] | null>(null);
  const moduleSeed = useRef<LicensingModule[] | null>(null);
  useEffect(() => {
    const live = lic.data?.modules;
    if (Array.isArray(live) && moduleSeed.current !== live) {
      moduleSeed.current = live;
      setModules(live);
    }
  }, [lic.data]);

  const [tenantModules, setTenantModules] = useState<TenantModule[] | null>(null);
  const tenantSeed = useRef<TenantModule[] | null>(null);
  useEffect(() => {
    const live = tenant.data?.modules;
    if (Array.isArray(live) && tenantSeed.current !== live) {
      tenantSeed.current = live;
      setTenantModules(live);
    }
  }, [tenant.data]);

  const [orgTier, setOrgTier] = useState<string | null>(null);
  /** The last provisioning run's REAL outcome, straight from the server. Null
   *  until one has run — this surface never shows a provisioning result it did
   *  not receive. */
  const [provisionResult, setProvisionResult] = useState<
    { name: string; granted: number; retained: Array<{ moduleId: string; name: string }> } | null
  >(null);
  useEffect(() => {
    setOrgTier(tenant.data?.organization?.tier ?? null);
    setProvisionResult(null); // a previous tenant's result must never sit over this one
  }, [tenant.data]);

  const [flags, setFlags] = useState<FeatureFlag[] | null>(null);
  const flagSeed = useRef<FeatureFlag[] | null>(null);
  useEffect(() => {
    const live = flagsState.data?.flags;
    if (Array.isArray(live) && flagSeed.current !== live) {
      flagSeed.current = live;
      setFlags(live);
    }
  }, [flagsState.data]);

  const moduleRows = modules ?? [];
  const orgRows = useMemo(
    () => (Array.isArray(lic.data?.organizations) ? lic.data!.organizations : []),
    [lic.data],
  );
  const tenantRows = tenantModules ?? [];
  const flagRows = flags ?? [];

  /* ── Packaging filters ──────────────────────────────────────────────────── */

  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const m of moduleRows) if (m.category) set.add(m.category);
    return Array.from(set).sort();
  }, [moduleRows]);

  const visibleModules = useMemo(() => {
    const q = search.trim().toLowerCase();
    return moduleRows.filter((m) => {
      if (category !== 'all' && (m.category ?? '') !== category) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.moduleId.toLowerCase().includes(q) ||
        (m.category ?? '').toLowerCase().includes(q)
      );
    });
  }, [moduleRows, category, search]);

  /* ── Optimistic writers ─────────────────────────────────────────────────── */

  const setModuleTier = (moduleId: string, tier: Tier | null) =>
    setModules((prev) =>
      (prev ?? []).map((m) => (m.moduleId === moduleId ? { ...m, minTier: tier } : m)),
    );

  const setTenantModuleState = (moduleId: string, enabled: boolean) =>
    setTenantModules((prev) =>
      (prev ?? []).map((m) =>
        m.moduleId === moduleId
          ? {
              ...m,
              subscriptionState: enabled ? 'enabled' : 'disabled',
              effective: enabled,
              source: enabled ? 'subscribed' : 'disabled',
            }
          : m,
      ),
    );

  const setFlagState = (key: string, enabled: boolean) =>
    setFlags((prev) => (prev ?? []).map((f) => (f.feature_key === key ? { ...f, enabled } : f)));

  /* ── The single governed write path ─────────────────────────────────────── */

  const runPending = async ({ reason }: { reason: string }) => {
    const action = pending;
    if (!action) return;
    setPending(null);

    if (action.kind === 'module-tier') {
      setModuleTier(action.moduleId, action.to); // optimistic
      const res = await apiCall(
        'PATCH',
        `${LICENSING_PATH}/modules/${encodeURIComponent(action.moduleId)}`,
        { minTier: action.to, reason },
      );
      if (!res.ok) {
        setModuleTier(action.moduleId, action.from); // revert — nothing was saved
        fireToast(
          apiErrorText(res, `${action.label} was not changed.`),
          'error',
        );
        return;
      }
      fireToast(`${action.label} now requires ${tierLabel(action.to)}.`);
      return;
    }

    if (action.kind === 'tenant-tier') {
      setOrgTier(action.to); // optimistic
      const res = await apiCall(
        'PATCH',
        `${LICENSING_PATH}/tenants/${encodeURIComponent(action.orgId)}/tier`,
        { tier: action.to, reason },
      );
      if (!res.ok) {
        setOrgTier(action.from);
        fireToast(apiErrorText(res, `${action.label} was not changed.`), 'error');
        return;
      }
      fireToast(`${action.label} moved to ${tierLabel(action.to)}.`);
      // The tier changes every verdict on the list, and only the server can
      // recompute them. Re-read rather than guess.
      retry();
      return;
    }

    if (action.kind === 'tenant-provision') {
      /* Not optimistic, deliberately. Provisioning's OUTCOME is the point —
         how many grants it added, and which grants the tenant keeps that this
         plan does not include — and only the server can compute either. Guessing
         a result here and correcting it a moment later would show the operator a
         number that was never true. */
      const res = await apiCall(
        'POST',
        `${LICENSING_PATH}/tenants/${encodeURIComponent(action.orgId)}/provision`,
        { reason },
      );
      if (!res.ok) {
        fireToast(apiErrorText(res, `${action.label} was not provisioned.`), 'error');
        return;
      }
      const body = (res.body ?? {}) as {
        granted?: number;
        retainedAboveTier?: Array<{ moduleId: string; name: string }>;
      };
      const granted = typeof body.granted === 'number' ? body.granted : 0;
      const retained = Array.isArray(body.retainedAboveTier) ? body.retainedAboveTier : [];
      /* Both halves, always. "Provisioned" alone reads as "the plan now
         applies", and after a DOWNGRADE that is false: provisioning grants and
         never revokes, so the tenant keeps everything it already held. An
         operator who is not told that concludes capability was withdrawn when
         it was not. */
      setProvisionResult({
        name: action.label,
        granted,
        retained,
      });
      fireToast(
        granted === 0
          ? `${action.label} — no new modules to grant on this plan.`
          : `${action.label} — ${granted} module${granted === 1 ? '' : 's'} granted.`,
      );
      retry();
      return;
    }

    if (action.kind === 'tenant-module') {
      setTenantModuleState(action.moduleId, action.enabled);
      const res = await apiCall(
        'PATCH',
        `/api/admin/master/tenants/${encodeURIComponent(action.orgId)}/modules`,
        { moduleId: action.moduleId, enabled: action.enabled, reason },
      );
      if (!res.ok) {
        setTenantModuleState(action.moduleId, !action.enabled);
        fireToast(apiErrorText(res, `${action.label} was not changed.`), 'error');
        return;
      }
      fireToast(
        action.enabled
          ? `${action.label} granted for this workspace.`
          : `${action.label} turned off for this workspace.`,
      );
      retry();
      return;
    }

    if (action.kind === 'enforcement-clear') {
      const res = await apiCall('DELETE', ENFORCEMENT_PATH, { reason });
      if (!res.ok) {
        fireToast(apiErrorText(res, 'The observation window was not reset.'), 'error');
        return;
      }
      fireToast('Observation window reset. Denials recorded from now on.');
      retry();
      return;
    }

    setFlagState(action.key, action.enabled);
    const res = await apiCall('PATCH', `${FLAGS_PATH}/${encodeURIComponent(action.key)}`, {
      enabled: action.enabled,
      reason,
    });
    if (!res.ok) {
      setFlagState(action.key, !action.enabled);
      fireToast(apiErrorText(res, `${action.label} was not changed.`), 'error');
      return;
    }
    fireToast(action.enabled ? `${action.label} is on.` : `${action.label} is off.`);
  };

  /* ── Prompt builders ────────────────────────────────────────────────────── */

  const askModuleTier = (m: LicensingModule, to: Tier | null) => {
    if (m.minTier === to) return;
    setPending({
      kind: 'module-tier',
      moduleId: m.moduleId,
      label: m.name,
      from: m.minTier,
      to,
      config: {
        action: 'Change the plan tier a module belongs to',
        target: `${m.name} · ${tierLabel(m.minTier)} → ${tierLabel(to)}`,
        resource: m.moduleId,
        minReason: 3,
      },
    });
  };

  const askEnforcementClear = () => {
    setPending({
      kind: 'enforcement-clear',
      observations: enf.data?.observations.length ?? 0,
      config: {
        action: 'Discard the recorded denials and start a new window',
        target: `${enf.data?.observations.length ?? 0} recorded`,
        resource: 'Enforcement observations',
        minReason: 3,
      },
    });
  };

  const askTenantProvision = () => {
    const org = tenant.data?.organization;
    if (!org) return;
    setProvisionResult(null);
    setPending({
      kind: 'tenant-provision',
      orgId: String(org.id),
      label: org.name,
      tier: (orgTier ?? org.tier) as string,
      config: {
        action: 'Apply the plan to this workspace',
        target: `${org.name} · ${tierLabel(orgTier ?? org.tier)}`,
        resource: org.slug,
        minReason: 3,
      },
    });
  };

  const askTenantTier = (to: Tier) => {
    const org = tenant.data?.organization;
    if (!org || orgTier === to) return;
    setPending({
      kind: 'tenant-tier',
      orgId: String(org.id),
      label: org.name,
      from: orgTier ?? org.tier,
      to,
      config: {
        action: 'Change a workspace plan tier',
        target: `${org.name} · ${tierLabel(orgTier ?? org.tier)} → ${tierLabel(to)}`,
        resource: org.slug,
        minReason: 3,
      },
    });
  };

  const askTenantModule = (m: TenantModule, enabled: boolean) => {
    const org = tenant.data?.organization;
    if (!org) return;
    setPending({
      kind: 'tenant-module',
      orgId: String(org.id),
      moduleId: m.moduleId,
      label: m.name,
      enabled,
      config: {
        action: enabled ? 'Grant a module to a workspace' : 'Turn a module off for a workspace',
        target: `${m.name} · ${org.name}`,
        resource: m.moduleId,
        minReason: 3,
      },
    });
  };

  const askFlag = (f: FeatureFlag, enabled: boolean) => {
    setPending({
      kind: 'flag',
      key: f.feature_key,
      label: f.feature_key,
      enabled,
      config: {
        action: enabled ? 'Turn a feature flag on' : 'Turn a feature flag off',
        target: `${f.feature_key} · ${f.enabled ? 'on' : 'off'} → ${enabled ? 'on' : 'off'}`,
        resource: f.feature_key,
        minReason: 3,
      },
    });
  };

  /* ── Render ─────────────────────────────────────────────────────────────── */

  const selectedOrgRow = orgRows.find((o) => String(o.id) === selectedOrg) ?? null;

  /* WHAT ANA SEES HERE — current-tab aggregates only. This is the cross-tenant
     platform-owner console: the org roster, a selected workspace's identity,
     entitlement maps, flag scope lists, observation rows (path / org / modules /
     reasons) and provisioning retained-lists name customers and what they pay
     for, so none of them are published. */
  const anaContext = useMemo(() => {
    const facts: Record<string, unknown> = { openTab: tab };
    let summary: string;
    if (tab === 'packaging') {
      facts.categoryFilter = category;
      facts.searchTerm = search;
      if (lic.loading) {
        summary = 'Licensing, Packaging tab — the module catalogue is still loading.';
      } else if (lic.error) {
        facts.licensingUnavailable = lic.error;
        summary =
          'Licensing, Packaging tab — the licensing model could not be read. A failed read, not a platform that licenses nothing.';
      } else if (moduleRows.length === 0) {
        summary =
          'Licensing, Packaging tab — no modules are registered, so there is nothing to package into tiers yet.';
      } else {
        facts.moduleCount = moduleRows.length;
        facts.visibleModuleCount = visibleModules.length;
        summary =
          `Licensing, Packaging tab — ${moduleRows.length} module(s) in the catalogue, ` +
          `${visibleModules.length} shown` +
          (category !== 'all' ? ` (category "${category}")` : '') +
          (search.trim() ? ` (search "${search.trim()}")` : '') + '.';
      }
    } else if (tab === 'tenants') {
      facts.aWorkspaceIsSelected = selectedOrg !== '';
      if (lic.loading) {
        summary = 'Licensing, Tenants tab — the workspace list is still loading.';
      } else if (lic.error) {
        facts.licensingUnavailable = lic.error;
        summary =
          'Licensing, Tenants tab — the workspace list could not be read. A failed read, not a platform with no workspaces.';
      } else if (orgRows.length === 0) {
        summary = 'Licensing, Tenants tab — no workspaces on this deployment yet.';
      } else {
        facts.workspaceCount = orgRows.length;
        // The tenant-detail read is its own read; its state is mirrored without
        // naming the workspace.
        let detail = 'no workspace is selected';
        if (selectedOrg) {
          if (tenant.loading) {
            detail = 'a workspace is selected and its detail is still loading';
          } else if (tenant.error) {
            facts.tenantUnavailable = tenant.error;
            detail =
              'a workspace is selected but its detail could not be read — a failed read, not a workspace with no entitlements';
          } else {
            detail = 'a workspace is selected and its module-by-module verdict is on screen';
          }
        }
        summary = `Licensing, Tenants tab — ${orgRows.length} workspace(s) on this deployment; ${detail}.`;
      }
    } else if (tab === 'flags') {
      if (flagsState.loading) {
        summary = 'Licensing, Feature flags tab — the flags are still loading.';
      } else if (flagsState.error) {
        facts.flagsUnavailable = flagsState.error;
        summary =
          'Licensing, Feature flags tab — the flags could not be read. A failed read, not a deployment with no flags.';
      } else if (flagRows.length === 0) {
        summary = 'Licensing, Feature flags tab — no feature flags are registered on this deployment.';
      } else {
        const enabled = flagRows.filter((f) => f.enabled).length;
        facts.flagCount = flagRows.length;
        facts.flagsEnabled = enabled;
        summary = `Licensing, Feature flags tab — ${flagRows.length} deployment-wide flag(s), ${enabled} enabled.`;
      }
    } else if (tab === 'enforcement') {
      if (enf.loading) {
        summary = 'Licensing, Enforcement tab — the enforcement report is still loading.';
      } else if (enf.error || !enf.data) {
        facts.enforcementUnavailable = enf.error ?? 'The platform returned no report for this server.';
        summary =
          'Licensing, Enforcement tab — the enforcement report could not be read. A failed read, not a report of zero refusals.';
      } else {
        // Three states, never collapsed: off ≠ nothing recorded ≠ observed.
        facts.enforcementMode = enf.data.mode;
        facts.enforcementObserving = enf.data.observingSince !== null;
        if (enf.data.mode === 'off') {
          summary =
            'Licensing, Enforcement tab — enforcement is off: route-level checks are not being applied and nothing is measured, so there is nothing to report.';
        } else if (enf.data.observingSince === null) {
          summary =
            'Licensing, Enforcement tab — observation is on but this server has recorded nothing since restart. Absence of evidence, not evidence nothing would be refused.';
        } else {
          facts.observationCount = enf.data.observations.length;
          facts.organizationsAffected = enf.data.organizationsAffected;
          facts.modulesAffectedCount = enf.data.modulesAffected.length;
          facts.truncated = enf.data.truncated;
          summary =
            `Licensing, Enforcement tab — mode "${enf.data.mode}"` +
            (enf.data.mode === 'enforce'
              ? ' (everything recorded was actually refused)'
              : ' (observing only — everything recorded was served)') +
            `, recorded since ${whenText(enf.data.observingSince)}: ` +
            `${enf.data.observations.length} observation(s) across ${enf.data.organizationsAffected} workspace(s) and ${enf.data.modulesAffected.length} module(s)` +
            (enf.data.truncated ? '; the record is truncated at capacity, older entries dropped' : '') +
            '.';
        }
      }
    } else {
      // Access requests / Trials / Decisions are self-contained panels with
      // their own reads; nothing of theirs is visible from here to report.
      const label = TABS.find((t) => t.id === tab)?.label ?? tab;
      summary = `Licensing, ${label} tab — this panel owns its own read; its contents are not part of what this console publishes.`;
    }
    return {
      summary,
      facts,
      availableActions: [
        'packaging, per-workspace entitlements, feature flags and enforcement mode change here — every change requires a reason and lands in the platform audit log',
        'Switch among the seven tabs: Packaging, Tenants, Access requests, Trials, Feature flags, Enforcement, Decisions',
        'Filter the packaging table by category, or search the module catalogue',
      ],
    };
  }, [
    tab, category, search, lic.loading, lic.error, moduleRows, visibleModules,
    selectedOrg, orgRows, tenant.loading, tenant.error,
    flagsState.loading, flagsState.error, flagRows, enf.loading, enf.error, enf.data,
  ]);
  /* Tab and packaging-filter view state ONLY. Every change this console makes
     — packaging a module into a tier, granting or revoking a workspace's
     module, flipping a feature flag, changing deployment enforcement — is a
     governed platform-owner act behind a reason dialog. Workspace SELECTION is
     deliberately not driven either: it fires a cross-tenant read, and a model
     that can pick which customer to look at is one that can be steered. */
  useSurfaceActionHandlers('master-licensing', {
    'master-licensing.open-tab': (params) => {
      const target = String(params.tab ?? '');
      const meta = TABS.find((t) => t.id === target);
      if (!meta) return { ok: false, reason: `No licensing tab named "${params.tab}".` };
      if (tab === target) return { ok: true, detail: `Already on ${meta.label}` };
      if (ceremonyOpen()) {
        return {
          ok: false,
          reason:
            'A governed confirmation is open on this console — switching tabs would discard it. ' +
            'Let the person finish or cancel it first.',
        };
      }
      setTab(target as TabId);
      return { ok: true, detail: `Opened ${meta.label}` };
    },
    'master-licensing.filter-modules': (params) => {
      const raw = String(params.category ?? '').trim();
      if (!raw) return { ok: false, reason: 'Name a category, or "all".' };
      if (ceremonyOpen()) {
        return { ok: false, reason: 'A governed confirmation is open on this console — let the person finish or cancel it first.' };
      }
      const needle = raw.toLowerCase();
      const target = needle === 'all' ? 'all' : categories.find((c) => c.toLowerCase() === needle);
      if (!target) {
        return {
          ok: false,
          reason: `No module category named "${raw}". On screen: all, ${categories.join(', ')}.`,
        };
      }
      const switched = tab !== 'packaging';
      if (switched) setTab('packaging');
      setCategory(target);
      return {
        ok: true,
        detail: `Filtered the module catalog to ${target}` + (switched ? ' on the packaging tab' : ''),
      };
    },
    'master-licensing.search-modules': (params) => {
      const next = String(params.query ?? '');
      if (ceremonyOpen()) {
        return { ok: false, reason: 'A governed confirmation is open on this console — let the person finish or cancel it first.' };
      }
      const switched = tab !== 'packaging';
      if (switched) setTab('packaging');
      setSearch(next);
      return {
        ok: true,
        detail: next.trim()
          ? `Searched the module catalog for "${next.trim()}"` + (switched ? ' on the packaging tab' : '')
          : 'Cleared the module search',
      };
    },
  });

  usePublishSurfaceContext('master-licensing', anaContext);

  return (
    <div className="page-inner ml-lic">
      <div className="ph">
        <div>
          <div className="ph-eyebrow">Platform · master admin</div>
          <h1 className="ph-title">Licensing</h1>
          <div className="ph-sub">
            What each plan tier includes, what each workspace is entitled to, and which feature
            flags this deployment runs. Every change here requires a reason and is written to the
            platform audit log.
          </div>
        </div>
      </div>

      <div className="ml-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className="ml-tab"
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            <span className="ml-tab-ic" aria-hidden="true">{I[t.icon] ?? I.grid}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ══ Packaging ══════════════════════════════════════════════════════ */}
      {tab === 'packaging' && (
        <section className="ml-sec" aria-labelledby="ml-packaging-h">
          <h2 id="ml-packaging-h" className="ml-sec-h">Module packaging</h2>

          <div className="ml-banner">
            <span className="ml-banner-ic" aria-hidden="true">{I.info}</span>
            <p>
              Changing a module&rsquo;s tier does not revoke access a workspace already has. An
              enabled subscription row is an explicit grant and outranks the tier. Raising a tier
              only affects workspaces without such a grant; to remove access from one of them, turn
              the module off for that workspace on the Tenants tab.
            </p>
          </div>

          {lic.loading ? (
            <div className="ml-loading" role="status">Loading the licensing model…</div>
          ) : lic.error ? (
            <ErrorState
              title="Couldn't load the licensing model"
              message={lic.error}
              retry={retry}
              testId="ml-packaging-error"
            />
          ) : moduleRows.length === 0 ? (
            <EmptyState
              icon={I.layers}
              title="No modules are registered"
              hint="The module catalogue is empty, so there is nothing to package into tiers yet. Modules appear here as soon as the platform registers them."
              testId="ml-packaging-empty"
            />
          ) : (
            <>
              <div className="ml-toolbar">
                <div className="ml-field">
                  <label className="ml-label" htmlFor="ml-cat">Category</label>
                  <select
                    id="ml-cat"
                    className="ml-select"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="all">All categories</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="ml-field ml-field-grow">
                  <label className="ml-label" htmlFor="ml-search">Find a module</label>
                  <input
                    id="ml-search"
                    className="ml-input"
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="ml-count" role="status">
                  {visibleModules.length} of {moduleRows.length} modules
                </div>
              </div>

              {visibleModules.length === 0 ? (
                <div className="ml-loading">No module matches this filter.</div>
              ) : (
                <div className="ml-scroll">
                  <div className="ml-table" role="table" aria-label="Modules by plan tier">
                    <div className="ml-thead" role="row">
                      <span role="columnheader">Module</span>
                      <span role="columnheader">Lowest plan tier that includes it</span>
                      <span role="columnheader">Workspace overrides</span>
                    </div>
                    {visibleModules.map((m) => (
                      <div className="ml-row" role="row" key={m.moduleId}>
                        <div role="cell">
                          <div className="ml-name">
                            {m.name}
                            {m.deprecated && <span className="ml-chip" data-tone="warn">Retired</span>}
                          </div>
                          <div className="ml-sub">
                            <span className="mono">{m.moduleId}</span>
                            {m.category ? ` · ${m.category}` : ''}
                            {m.industries?.length
                              ? ` · ${m.industries.length} industr${m.industries.length === 1 ? 'y' : 'ies'}`
                              : ' · every industry'}
                          </div>
                        </div>
                        <div role="cell">
                          <div
                            className="ml-seg"
                            role="group"
                            aria-label={`Lowest plan tier that includes ${m.name}`}
                          >
                            {[null, ...TIERS].map((t) => {
                              const on = m.minTier === t;
                              return (
                                <button
                                  key={t ?? 'unrestricted'}
                                  type="button"
                                  className="ml-seg-btn"
                                  data-on={on || undefined}
                                  aria-pressed={on}
                                  onClick={() => askModuleTier(m, t)}
                                >
                                  {on && (
                                    <span className="ml-seg-tick" aria-hidden="true">{I.check}</span>
                                  )}
                                  {tierLabel(t)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div role="cell" className="ml-sub">
                          {m.grantedOrgs} granted · {m.revokedOrgs} turned off
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* ══ Tenants ════════════════════════════════════════════════════════ */}
      {tab === 'tenants' && (
        <section className="ml-sec" aria-labelledby="ml-tenants-h">
          <h2 id="ml-tenants-h" className="ml-sec-h">Workspaces</h2>

          {lic.loading ? (
            <div className="ml-loading" role="status">Loading workspaces…</div>
          ) : lic.error ? (
            <ErrorState
              title="Couldn't load the workspace list"
              message={lic.error}
              retry={retry}
              testId="ml-tenants-error"
            />
          ) : orgRows.length === 0 ? (
            <EmptyState
              icon={I.building}
              title="No workspaces on this deployment"
              hint="Organizations appear here as soon as they are created. Their plan tier and module grants are administered from this tab."
              testId="ml-tenants-empty"
            />
          ) : (
            <div className="ml-split">
              {/* A list of choices, not a data table: each row IS the control
                  that selects a workspace, so it is a real <button> and carries
                  no ARIA table roles — a row cannot also be a button. */}
              <div className="ml-scroll">
                <div className="ml-table ml-table-orgs">
                  <div className="ml-thead">
                    <span>Workspace</span>
                    <span>Plan</span>
                    <span>Industry</span>
                    <span>Status</span>
                    <span>Overrides</span>
                  </div>
                  {orgRows.map((o) => {
                    const on = String(o.id) === selectedOrg;
                    return (
                      <button
                        type="button"
                        key={String(o.id)}
                        className="ml-row ml-row-btn"
                        data-on={on || undefined}
                        aria-pressed={on}
                        onClick={() => setSelectedOrg(String(o.id))}
                      >
                        <span>
                          <span className="ml-name">{o.name}</span>
                          <span className="ml-sub mono">{o.slug}</span>
                        </span>
                        <span>{tierLabel(o.tier)}</span>
                        <span className="ml-sub">{o.industryMode || 'Not set'}</span>
                        <span className="ml-sub">{o.status || 'Unknown'}</span>
                        <span className="ml-sub">
                          {o.grants} granted · {o.revocations} turned off
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="ml-detail">
                {!selectedOrg ? (
                  <EmptyState
                    icon={I.building}
                    title="No workspace selected"
                    hint="Choose a workspace above to see its plan tier and the module-by-module verdict for it."
                    testId="ml-tenant-unselected"
                  />
                ) : tenant.loading ? (
                  <div className="ml-loading" role="status">
                    Loading {selectedOrgRow?.name ?? 'this workspace'}…
                  </div>
                ) : tenant.error ? (
                  <ErrorState
                    title="Couldn't load this workspace"
                    message={tenant.error}
                    retry={retry}
                    testId="ml-tenant-error"
                  />
                ) : !tenant.data ? (
                  <EmptyState
                    icon={I.building}
                    title="This workspace has no licensing record"
                    hint="The platform returned no organization for this id. It may have been removed since the list was loaded."
                    testId="ml-tenant-empty"
                  />
                ) : (
                  <>
                    <div className="ml-detail-head">
                      <div>
                        <div className="ml-name">{tenant.data.organization.name}</div>
                        <div className="ml-sub">
                          <span className="mono">{tenant.data.organization.slug}</span>
                          {' · '}
                          {tenant.data.organization.industryMode || 'Industry not set'}
                          {' · '}
                          {tenant.data.organization.status || 'Status unknown'}
                        </div>
                      </div>
                      <div className="ml-field">
                        <label className="ml-label" htmlFor="ml-org-tier">Plan tier</label>
                        <select
                          id="ml-org-tier"
                          className="ml-select"
                          value={(orgTier ?? tenant.data.organization.tier) as string}
                          onChange={(e) => askTenantTier(e.target.value as Tier)}
                        >
                          {TIERS.map((t) => (
                            <option key={t} value={t}>{TIER_LABEL[t]}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={askTenantProvision}
                      >
                        Apply plan
                      </button>
                    </div>

                    {/* Changing the tier writes no subscription rows — provisioning
                        is a separate act. Said here rather than left implicit,
                        because a plan change that appears to have taken effect and
                        has not is the failure this control exists to prevent. */}
                    <p className="ml-note">
                      Changing the plan does not grant its modules on its own. Apply
                      the plan to grant what this tier includes. Nothing is ever
                      revoked by applying a plan.
                    </p>

                    {provisionResult && (
                      <div className="ml-provision-result" role="status">
                        <div className="ml-provision-line">
                          {provisionResult.granted === 0
                            ? `No new modules to grant for ${provisionResult.name} on this plan.`
                            : `${provisionResult.granted} module${
                                provisionResult.granted === 1 ? '' : 's'
                              } granted for ${provisionResult.name}.`}
                        </div>
                        {provisionResult.retained.length > 0 && (
                          <div className="ml-provision-retained">
                            <div className="ml-provision-retained-h">
                              Still granted above this plan ({provisionResult.retained.length})
                            </div>
                            <p className="ml-sub">
                              Applying a plan never revokes. These stay available to the
                              workspace until turned off individually below.
                            </p>
                            <ul className="ml-provision-list">
                              {provisionResult.retained.map((r) => (
                                <li key={r.moduleId}>{r.name}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {tenantRows.length === 0 ? (
                      <EmptyState
                        icon={I.layers}
                        title="No modules to show for this workspace"
                        hint="The platform returned no module verdicts for this organization."
                        testId="ml-tenant-modules-empty"
                      />
                    ) : (
                      <div className="ml-scroll">
                        <div
                          className="ml-table ml-table-verdict"
                          role="table"
                          aria-label={`Module access for ${tenant.data.organization.name}`}
                        >
                          <div className="ml-thead" role="row">
                            <span role="columnheader">Module</span>
                            <span role="columnheader">Access</span>
                            <span role="columnheader">Change</span>
                          </div>
                          {tenantRows.map((m) => (
                            <div className="ml-row" role="row" key={m.moduleId}>
                              <div role="cell">
                                <div className="ml-name">{m.name}</div>
                                <div className="ml-sub">
                                  <span className="mono">{m.moduleId}</span>
                                  {m.category ? ` · ${m.category}` : ''}
                                  {` · ${tierLabel(m.minTier)}`}
                                </div>
                              </div>
                              <div role="cell">
                                <span
                                  className="ml-chip"
                                  data-tone={m.effective ? 'ok' : 'off'}
                                >
                                  {m.effective ? 'Available' : 'Not available'}
                                </span>
                                <div className="ml-sub">{verdictText(m)}</div>
                              </div>
                              <div role="cell">
                                <button
                                  type="button"
                                  className="btn ghost"
                                  onClick={() => askTenantModule(m, !m.effective)}
                                >
                                  {m.effective ? 'Turn off' : 'Grant'}
                                  <span className="ml-vh"> {m.name}</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ══ Feature flags ══════════════════════════════════════════════════ */}
      {tab === 'flags' && (
        <section className="ml-sec" aria-labelledby="ml-flags-h">
          <h2 id="ml-flags-h" className="ml-sec-h">Feature flags</h2>
          <div className="ml-banner">
            <span className="ml-banner-ic" aria-hidden="true">{I.info}</span>
            <p>
              These flags are deployment-wide. A flag scoped to specific organizations or client
              workspaces keeps that scope; the switch here changes only whether the flag is on at
              all.
            </p>
          </div>

          {flagsState.loading ? (
            <div className="ml-loading" role="status">Loading feature flags…</div>
          ) : flagsState.error ? (
            <ErrorState
              title="Couldn't load the feature flags"
              message={flagsState.error}
              retry={retry}
              testId="ml-flags-error"
            />
          ) : flagRows.length === 0 ? (
            <EmptyState
              icon={I.sliders}
              title="No feature flags are registered"
              hint="This deployment has no rows in the feature-toggle table, so there is nothing to switch."
              testId="ml-flags-empty"
            />
          ) : (
            <div className="ml-scroll">
              <div className="ml-table ml-table-flags" role="table" aria-label="Feature flags">
                <div className="ml-thead" role="row">
                  <span role="columnheader">Flag</span>
                  <span role="columnheader">State</span>
                  <span role="columnheader">Change</span>
                </div>
                {flagRows.map((f) => {
                  const orgScope = Array.isArray(f.enabled_for_organization_ids)
                    ? f.enabled_for_organization_ids.length
                    : 0;
                  const wsScope = Array.isArray(f.enabled_for_client_workspace_ids)
                    ? f.enabled_for_client_workspace_ids.length
                    : 0;
                  return (
                    <div className="ml-row" role="row" key={f.feature_key}>
                      <div role="cell">
                        <div className="ml-name mono">{f.feature_key}</div>
                        <div className="ml-sub">
                          {f.description || 'No description recorded.'}
                          {orgScope || wsScope
                            ? ` · scoped to ${orgScope} organization${orgScope === 1 ? '' : 's'}, ${wsScope} client workspace${wsScope === 1 ? '' : 's'}`
                            : ''}
                        </div>
                      </div>
                      <div role="cell">
                        <span className="ml-chip" data-tone={f.enabled ? 'ok' : 'off'}>
                          {f.enabled ? 'On' : 'Off'}
                        </span>
                      </div>
                      <div role="cell">
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => askFlag(f, !f.enabled)}
                        >
                          {f.enabled ? 'Turn off' : 'Turn on'}
                          <span className="ml-vh"> {f.feature_key}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ══ Trials ═════════════════════════════════════════════════════════
          A self-contained panel with its own read, its own governed writes and
          its own toast. It is not folded into this file's shared state on
          purpose — this surface is already long, and a panel that owns one
          endpoint end-to-end is the shape the remaining tabs should take too. */}
      {tab === 'trials' && <TrialsPanel />}

      {/* ══ Access requests ════════════════════════════════════════════════
          Every workspace's open requests, for the platform owner. The
          org-scoped view of the same queue is its own surface — one
          implementation, parameterised by scope. */}
      {tab === 'access-requests' && <AccessRequestsPanel />}

      {/* ══ Enforcement ════════════════════════════════════════════════════
          The rollout instrument. Route-level enforcement ships switched off,
          then observing, then on — and the middle step exists so nobody flips
          a live product to refusing requests without first seeing which paying
          workspaces would start being refused.

          Every branch below is written against one rule: an empty table is NOT
          evidence that enforcement is safe to switch on. "Nothing recorded" and
          "nothing would be refused" are different claims and only the server
          knows which one it is making — so the copy follows `observingSince`
          rather than the row count. */}
      {tab === 'enforcement' && (
        <section className="ml-sec" aria-labelledby="ml-enf-h">
          <h2 id="ml-enf-h" className="ml-sec-h">Enforcement</h2>

          {/* The switch sits above the report deliberately: the report exists to
              inform this one decision, and an operator who has just read it
              should not have to leave to act on it. `onChanged` re-reads the
              report, because changing the mode changes what the rows below
              mean — the same denials are observed in one mode and real in the
              other. */}
          <EnforcementModeControl onChanged={retry} />

          {enf.loading ? (
            <div className="ml-loading" role="status">Loading the enforcement report…</div>
          ) : enf.error ? (
            <ErrorState
              title="Couldn't load the enforcement report"
              message={enf.error}
              retry={retry}
              testId="ml-enf-error"
            />
          ) : !enf.data ? (
            <ErrorState
              title="Couldn't load the enforcement report"
              message="The platform returned no report for this server."
              retry={retry}
              testId="ml-enf-noreport"
            />
          ) : (
            <>
              {enf.data.mode === 'off' ? (
                <div className="ml-enf-state" data-tone="unknown" data-testid="ml-enf-off">
                  <span className="ml-enf-ic" aria-hidden="true">{I.shieldAlert}</span>
                  <div>
                    <div className="ml-enf-h">Access checks are not being applied</div>
                    <p className="ml-enf-body">
                      Modules a workspace has not licensed are shown as locked in its navigation,
                      but this server is not checking entitlement when a request arrives — so a
                      workspace that reaches a locked module another way is still served. Nothing
                      is being measured either, which is why there is nothing to report here.
                    </p>
                    <p className="ml-enf-body">
                      Turn on observation for this deployment to record what enforcement would
                      refuse, then read it here before switching enforcement on.
                    </p>
                  </div>
                </div>
              ) : enf.data.observingSince === null ? (
                <div className="ml-enf-state" data-tone="unknown" data-testid="ml-enf-nothing-yet">
                  <span className="ml-enf-ic" aria-hidden="true">{I.shieldAlert}</span>
                  <div>
                    <div className="ml-enf-h">Nothing recorded on this server yet</div>
                    <p className="ml-enf-body">
                      No request has been refused, or would have been refused, since this server
                      last restarted. That is not the same as knowing nothing would be refused —
                      a quiet period and a clean one look identical from here, and the record
                      starts empty after every restart.
                    </p>
                    <p className="ml-enf-body">
                      Leave observation running across a period that covers real use before
                      treating this as evidence.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="ml-enf-state" data-testid="ml-enf-observed">
                  <span className="ml-enf-ic" aria-hidden="true">{I.shieldCheck}</span>
                  <div>
                    <div className="ml-enf-h">
                      {enf.data.mode === 'enforce'
                        ? 'Requests are being refused'
                        : 'Requests that would be refused'}
                    </div>
                    <p className="ml-enf-body">
                      {enf.data.mode === 'enforce'
                        ? 'Enforcement is on. Everything below was actually refused.'
                        : 'Enforcement is observing only — everything below was served. This is what switching it on would cost.'}
                      {' '}Recorded since {whenText(enf.data.observingSince)}.
                    </p>
                  </div>
                </div>
              )}

              {enf.data.mode !== 'off' && (
                <div className="ml-banner">
                  <span className="ml-banner-ic" aria-hidden="true">{I.info}</span>
                  <p>
                    This record is held by one server and is cleared when it restarts. A deployment
                    running several servers keeps a separate record on each, and this is one of
                    them — so treat what you see as a sample, not a total.
                    {enf.data.truncated
                      ? ` Only the ${enf.data.capacity} most recent are kept, and that limit has been reached; older ones have been dropped.`
                      : ''}
                  </p>
                </div>
              )}

              {enf.data.observations.length > 0 && (
                <>
                  <div className="ml-enf-stats">
                    <div className="ml-enf-stat">
                      <b>{enf.data.organizationsAffected}</b>
                      <span>
                        {enf.data.organizationsAffected === 1 ? 'Workspace' : 'Workspaces'}
                      </span>
                    </div>
                    <div className="ml-enf-stat">
                      <b>{enf.data.modulesAffected.length}</b>
                      <span>{enf.data.modulesAffected.length === 1 ? 'Module' : 'Modules'}</span>
                    </div>
                    <div className="ml-enf-stat">
                      <b>{enf.data.observations.length}</b>
                      <span>Recorded</span>
                    </div>
                  </div>

                  <div className="ml-scroll">
                    <div
                      className="ml-table ml-table-enforce"
                      role="table"
                      aria-label="Refused requests"
                    >
                      <div className="ml-thead" role="row">
                        <span role="columnheader">Workspace</span>
                        <span role="columnheader">What it needed</span>
                        <span role="columnheader">Requests</span>
                        <span role="columnheader">Last seen</span>
                      </div>
                      {enf.data.observations.map((o) => {
                        const org = orgRows.find((r) => String(r.id) === String(o.organizationId));
                        return (
                          <div className="ml-row" role="row" key={`${o.organizationId} ${o.path}`}>
                            <div role="cell">
                              <div className="ml-name">{org?.name ?? 'Unknown workspace'}</div>
                              <div className="ml-sub">
                                {org ? (
                                  <>
                                    <span className="mono">{org.slug}</span>
                                    {` · ${tierLabel(org.tier)}`}
                                  </>
                                ) : (
                                  'This workspace is not in the list above — it may have been removed.'
                                )}
                              </div>
                            </div>
                            <div role="cell">
                              <div className="ml-name">
                                {o.modules
                                  .map(
                                    (id) =>
                                      moduleRows.find((m) => m.moduleId === id)?.name ?? id,
                                  )
                                  .join(' or ')}
                              </div>
                              <div className="ml-sub">
                                {o.reasons[0] || 'Not included in this plan.'}
                              </div>
                              <div className="ml-sub mono">{o.path}</div>
                            </div>
                            <div role="cell">
                              <span className="ml-chip" data-tone={o.enforced ? 'warn' : 'off'}>
                                {o.count}
                              </span>
                              <div className="ml-sub">{o.enforced ? 'Refused' : 'Served'}</div>
                            </div>
                            <div role="cell" className="ml-sub">
                              {whenText(o.lastSeen)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="ml-enf-acts">
                    <button type="button" className="btn ghost" onClick={askEnforcementClear}>
                      Start a new window
                    </button>
                    <span className="ml-sub">
                      Discards what is recorded here, so you can see whether a packaging change
                      stopped the refusals.
                    </span>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      )}

      {/* ══ Decisions ══════════════════════════════════════════════════════
          Every licensing change was already written to the Part 11 chain and
          readable nowhere in the product. This is the read side. */}
      {tab === 'history' && <LicensingHistoryPanel />}

      {pending && (
        <GovernedConfirmDialog
          open
          {...pending.config}
          onCancel={() => setPending(null)}
          onConfirm={runPending}
        />
      )}
      <C2CToast msg={toast} />
    </div>
  );
}

export default MasterLicensing;
