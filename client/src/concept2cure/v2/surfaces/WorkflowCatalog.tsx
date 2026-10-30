// Existing live module catalog, reached as Subscription & features (an administrator's view since
// 2026-10-25; docs/design/CLIENT_JOURNEY_2026-10-25.md; named so on 2026-10-26, section 9 of
// .design/client-journey/INFORMATION_ARCHITECTURE.md); ids and write contracts stay stable.
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { I } from '../icons';
import { useLiveData, EmptyState } from '../dataConnect';
import { ApiRequestError, apiRequest } from '@/lib/queryClient';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { notifySurfaceActionReady, useSurfaceActionHandlers } from '../surfaceActions';
import { getSurfaceMeta } from '../registryModel';
import { LIC_TIER_LEVEL } from '../fixtures/licensing';
import { lockNotice, lockShortReason, type NavSurfaceEntitlement } from '../navEntitlements';
import { PLATFORM_SERVICES } from '../fixtures/admin-data';
import type { AppsCatalogApp, AppsCatalogGroup, AppLicense } from '../fixtures/admin-data';
import { GovernedConfirmDialog, type ConfirmResult } from '../../_shared/components/GovernedConfirmDialog';
import { C2CToast, useToast } from '../toast';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { groupCatalogWorkflows, type CatalogFeature } from '../catalogWorkflows';
import '../styles/workflows-v2.css';
import { isMdxProjectFeature } from '@shared/constants/mdx-project-features';
import { MdxCatalogSolution } from './MdxCatalogSolution';

/* ════════════ Apps catalog ════════════
   Live-wired to /api/module-subscriptions (mounted in
   server/bootstrap/register-inline-routes.ts, router
   server/routes/module-subscriptions.ts):
     GET /catalog            → { modules: [{ moduleId, name, description,
                                 category, isEnabled, isAvailable,
                                 requiredTier, sortOrder }] }
     GET /license            → { tier, industryMode, usage: { projects|users:
                                 { currentCount, maxAllowed } } }
     PUT /:moduleId/toggle   → { moduleId, enabled } (admin-only; 403 with a
                                 reason when the tier does not include it)
   Fixture-free: the surface renders the real catalog + license, an honest empty
   state, or an honest error state — no APPS_CATALOG / APP_LICENSE fallback and no
   Sample-data pill. Fields the backend cannot truthfully supply (renewsAt — no
   renewal column is read anywhere server-side) are left empty, never invented.

   ENTITLEMENT HONESTY. Every card states one of four things, and they are not
   interchangeable: the module is open to this organization (subscribed, or in
   the plan with no row written — the server's 'included', which needs none);
   an administrator switched it off; the plan does not include it; it is not
   offered for this workspace's industry.

   "In the plan, no row written" used to be a fifth state, drawn locked with no
   Open button: "Included in your plan. Not switched on for this organization."
   The server has never treated it as locked — decideNavEntitlement answers
   'included', entitled; canAccessModule admits it — so the rail beside this
   screen opened every module this screen said was off (launch sweep finding
   44). `on` is now the verdict's own answer (open ⇔ no lock). The reason and the remedy travel
   together — the last one has no remedy on this screen and is given none,
   rather than a plans button that would resolve nothing. The wording is the
   shell's own (lockNotice / lockShortReason in navEntitlements.tsx), so the
   rail's explanation for a lock and this catalog's explanation for the same
   lock are the same sentence. */

/** One live catalog row (ModuleCatalogEntry, server/services/license-manager.ts). */
export interface LiveModuleEntry {
  moduleId: string;
  name: string;
  description: string | null;
  category: string | null;
  isEnabled: boolean;
  /* The subscription row's OWN state (ModuleSubscriptionState). `isEnabled`
     collapses "an administrator switched this off" and "this organization never
     had a row written" into one `false` — the right answer for "may they use
     it", the wrong answer for "why not". The server keeps the two apart for
     exactly that reason; this surface used to drop the field on the floor and
     told the owner of EVERY off module that "an admin can re-enable it", which
     invents an administrator's decision for modules nobody has ever touched.

     Optional because a deployment whose server predates the field still returns
     rows without it. `moduleVerdict` then falls back to 'none', which is the
     branch that makes no accusation and claims no lock — see rule 1. */
  subscriptionState?: 'enabled' | 'disabled' | 'none';
  isAvailable: boolean;
  requiredTier: string | null;
  /** 'later' ⇒ outside the launch catalog; locks only while the payload's
   *  launchScope.enforced is true. Optional: an older server omits it. */
  launchScope?: 'launch' | 'later';
  sortOrder: number;
}

/**
 * Display row — the fixture shape, plus the live module's name and the two
 * entitlement facts the card has to keep apart.
 *
 * `lock` and `toggleable` are separate on purpose. A module an administrator
 * switched OFF is locked (nobody can open it) AND toggleable (an admin turning
 * it back on is precisely the remedy). A module above the org's tier is locked
 * and NOT toggleable. Folding either into the other produces a card that either
 * hides the fix or offers a button whose only outcome is a 403.
 */
type AppRow = AppsCatalogApp & {
  name?: string;
  /** Why this organization cannot open the module, or null when it can. */
  lock: NavSurfaceEntitlement | null;
  /** Whether PUT /:moduleId/toggle would be accepted — mirrors canAccessModule. */
  toggleable: boolean;
};
type AppGroup = Omit<AppsCatalogGroup, 'apps'> & { apps: AppRow[] };

export function isLiveModuleEntry(m: unknown): m is LiveModuleEntry {
  if (!m || typeof m !== 'object') return false;
  const r = m as Record<string, unknown>;
  return (
    typeof r.moduleId === 'string' &&
    typeof r.name === 'string' &&
    typeof r.isEnabled === 'boolean' &&
    typeof r.isAvailable === 'boolean'
  );
}

/**
 * The payload is the catalog contract — `{ modules: [...] }` with a real array.
 *
 * Passed to `useLiveData` so a 200 that is NOT the catalog (an envelope change,
 * a proxy's HTML login page, `{ data: [] }`) reaches the surface's error branch
 * instead of its empty branch. Before this, `mapLiveCatalog` returned null for
 * both a malformed body and an empty list, and the surface rendered "No apps
 * enabled yet" — an error presented to a paying customer as the finding that
 * their organization has no applications, and published to AnA as the same
 * claim. Written inline rather than with `hasKeys('modules')` because the whole
 * point is that `modules` must be an ARRAY, which a key check does not assert.
 */
function isCatalogPayload(v: unknown): v is { modules: LiveModuleEntry[] } {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  return Array.isArray((v as { modules?: unknown }).modules);
}

/**
 * The plan band a module sits in — the lowest tier that includes it, or
 * 'Included' when the catalog attaches no tier requirement at all.
 *
 * This replaces `liveTierLabel`, which mapped `!isAvailable` to 'Add-on' BEFORE
 * looking at `requiredTier`. That was defensible while every catalog row had an
 * empty `tiers` array; since 20260823_module_catalog_commercial_packaging.sql
 * gave all 84 rows a real band it is two separate lies. It threw away the one
 * number a customer needs ("which plan do I need?") in favour of 'Add-on', a
 * word that promises something purchasable — and it said that word just as
 * loudly for a module withheld by INDUSTRY MODE, which no plan on the price
 * list will ever unlock. What is not available and why is now `lock`'s job; the
 * chip states the packaging fact and nothing else.
 */
function tierBandLabel(m: LiveModuleEntry): string {
  if (!m.requiredTier) return 'Included';
  return m.requiredTier.charAt(0).toUpperCase() + m.requiredTier.slice(1);
}

/**
 * Why this organization cannot open a module, as the shell's own lock verdict —
 * or null when it can.
 *
 * The branch order mirrors `decideNavEntitlement`
 * (server/services/entitlements/navigation-entitlements.ts) deliberately, down
 * to its tier/industry tie-break, so the rail and this catalog never give one
 * customer two different reasons for one lock. Two differences, both required:
 *
 *   - No `master_admin` branch. That grant answers "may this VIEWER open it",
 *     and the platform owner may open everything. This screen answers "what has
 *     this ORGANIZATION subscribed to", which is the state the toggle writes;
 *     collapsing it to `entitled` would show a master admin every module as
 *     available while the org's switches are off, and hide the switch that is
 *     the entire purpose of the page.
 *   - Read from GET /catalog, not from `useNavEntitlements()`. The nav payload
 *     carries no verdict for the Apps catalog's own destinations by design
 *     (rule 2: an unknown id is not licensable), and it is resolved once per
 *     session, so it would not see the write this page just made.
 *
 * The tie-break inherits the server's bias on purpose: with the org's tier
 * unknown (the licence read failed independently of the catalog read), it
 * reports 'industry' rather than 'tier'. Being wrongly told to ask an
 * administrator costs a conversation; being wrongly told to upgrade sells
 * somebody a plan that changes nothing.
 */
function moduleVerdict(
  m: LiveModuleEntry,
  orgTier: string | null,
  launchScopeEnforced: boolean,
): NavSurfaceEntitlement | null {
  const base = { id: m.moduleId, label: m.name, requiredTier: m.requiredTier };
  /* The release boundary comes first and ignores the licence: a module the
     org has bought or been granted is still not in this release. The server
     applies the same order (applyLaunchScope), so the card and the rail agree. */
  if (launchScopeEnforced && m.launchScope === 'later') {
    return { ...base, entitled: false, source: 'launch-scope', requiredTier: null };
  }
  const state = m.subscriptionState ?? (m.isEnabled ? 'enabled' : 'none');
  if (state === 'enabled') return null; // 'subscribed'
  if (state === 'disabled') return { ...base, entitled: false, source: 'disabled' };
  if (m.isAvailable) return null; // 'included' — in the plan, no row written yet
  const orgRank = orgTier != null ? LIC_TIER_LEVEL[orgTier] : undefined;
  const needRank = m.requiredTier != null ? LIC_TIER_LEVEL[m.requiredTier] : undefined;
  const belowTier = orgRank !== undefined && needRank !== undefined && orgRank < needRank;
  return { ...base, entitled: false, source: belowTier ? 'tier' : 'industry' };
}

/**
 * The `opts` lockNotice requires, for the fields that do not read it.
 *
 * Named rather than inlined so the constraint is visible at the call site: the
 * Apps card renders `status` and the tier branch's CTA, and no branch of
 * lockNotice consults `isOrgAdmin` to produce either. Reading `body`, or the
 * 'disabled' / 'industry' CTAs, from this value WOULD be a fabricated claim
 * about the viewer's role — see the comment where it is used.
 */
const ROLE_AGNOSTIC = { isOrgAdmin: false } as const;

/**
 * Map GET /catalog into the grouped display. Always an array: `isCatalogPayload`
 * has already rejected anything that is not the contract, so `[]` here means
 * the catalog is genuinely empty — the honest empty state, never a failure.
 */
function mapLiveCatalog(payload: unknown, orgTier: string | null, launchScopeEnforced: boolean): AppGroup[] {
  if (!isCatalogPayload(payload)) return [];
  const rows = payload.modules.filter(isLiveModuleEntry);
  const byCat = new Map<string, LiveModuleEntry[]>();
  for (const m of rows) {
    const cat = m.category || 'other';
    const list = byCat.get(cat) || [];
    list.push(m);
    byCat.set(cat, list);
  }
  const groups = Array.from(byCat.values());
  for (const mods of groups) mods.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  groups.sort((a, b) => (a[0]?.sortOrder || 0) - (b[0]?.sortOrder || 0));
  return groups.map((mods) => {
    const cat = mods[0]?.category || 'other';
    return {
      group: cat.charAt(0).toUpperCase() + cat.slice(1),
      note: `${mods.length} module${mods.length === 1 ? '' : 's'} — live subscription state for this organization`,
      apps: mods.map((m) => {
        const lock = moduleVerdict(m, orgTier, launchScopeEnforced);
        return {
          id: m.moduleId,
          name: m.name,
          tier: tierBandLabel(m),
          // Open to this organization ⇔ no lock — not `isEnabled`, which is
          // false for a module the plan includes with no row written.
          on: lock === null,
          desc: m.description || m.name,
          lock,
          /* canAccessModule() allows the write when the module is already in the
             org's enabled set OR its tier and industry match — so an org that
             downgraded can still switch OFF a module it is currently running,
             and nothing else outside the plan can be switched at all. */
          /* No switch for a module the release excludes: a toggle that writes a
             grant nothing honours is a dead control. */
          toggleable: (m.isAvailable || m.isEnabled) && !(launchScopeEnforced && m.launchScope === 'later'),
        };
      }),
    };
  });
}

/** Whether this organization can open the module — the catalog verdict's own
 *  answer, for a list that only needs yes or no (the tier decides only the
 *  reason, so it is not needed here). */
export function moduleIsOpen(m: LiveModuleEntry, launchScopeEnforced: boolean): boolean {
  return moduleVerdict(m, null, launchScopeEnforced) === null;
}

/** A usage figure from GET /license. `limit` is null when the organization row
    records no limit — reported as null since 2026-10-15, never a default. */
type LicenceUsage = { current: number; limit: number | null };
const EMPTY_USAGE: LicenceUsage = { current: 0, limit: 0 };
type LiveAppLicense = Omit<AppLicense, 'usage'> & { usage: { projects: LicenceUsage; users: LicenceUsage } };

function liveUsage(u: { currentCount?: unknown; maxAllowed?: unknown } | undefined): LicenceUsage | null {
  if (!u || typeof u.currentCount !== 'number') return null;
  const limit = u.maxAllowed === null ? null : typeof u.maxAllowed === 'number' ? u.maxAllowed : undefined;
  if (limit === undefined) return null;
  return { current: u.currentCount, limit };
}

/** Map GET /license into the fixture display shape, or null on shape mismatch.
    `renewsAt` stays empty — the backend holds no renewal date to report.
    2026-10-15: a null `maxAllowed` was a shape mismatch, so one unrecorded
    limit discarded the whole licence band; it is now shown as not recorded. */
function mapLiveLicense(payload: unknown): LiveAppLicense | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as {
    tier?: unknown;
    industryMode?: unknown;
    usage?: {
      projects?: { currentCount?: unknown; maxAllowed?: unknown };
      users?: { currentCount?: unknown; maxAllowed?: unknown };
    };
  };
  const projects = liveUsage(p.usage?.projects);
  const users = liveUsage(p.usage?.users);
  if (typeof p.tier !== 'string' || !projects || !users) return null;
  return {
    tier: p.tier,
    industryMode: typeof p.industryMode === 'string' ? p.industryMode : '',
    renewsAt: '',
    usage: { projects, users },
  };
}

/** One usage figure in the licence band; no bar against a limit nobody recorded. */
function LicenceQuota({ label, usage }: { label: string; usage: LicenceUsage }) {
  const { current, limit } = usage;
  return (
    <div className="lic-quota">
      <div className="lic-q-l">{label}</div>
      {limit === null ? null : (
        <div className="lic-q-bar">
          <div
            className="lic-q-fill"
            data-warn={(limit && current / limit > 0.85) || undefined}
            style={{
              width: (limit ? Math.min(100, (current / limit) * 100) : 0) + '%',
            }}
          />
        </div>
      )}
      <div className="lic-q-n mono">
        {current} / {limit ?? 'not recorded'}
      </div>
    </div>
  );
}

/** "14 of 25 projects", or "14 projects (no recorded limit)" — never "of null". */
function usagePhrase(u: LicenceUsage, noun: string): string {
  return u.limit === null ? `${u.current} ${noun} (no recorded limit)` : `${u.current} of ${u.limit} ${noun}`;
}

export function Apps({ onNav }: SurfaceViewProps) {
  const open = (id: string) => onNav(id);
  // Fixture-free live reads. Both endpoints return a bare (non-enveloped) object,
  // so useLiveData yields the payload directly ({ modules } / the license object).
  const catState = useLiveData<{ modules: LiveModuleEntry[]; launchScope?: { enforced: boolean } }>(
    '/api/module-subscriptions/catalog',
    ['/api/module-subscriptions/catalog'],
    // A 200 that is not the catalog contract belongs in the error branch below,
    // not in the empty one — see isCatalogPayload.
    isCatalogPayload,
  );
  const licState = useLiveData<Record<string, unknown>>('/api/module-subscriptions/license');
  const lic = useMemo(() => mapLiveLicense(licState.data), [licState.data]);
  // The org's plan tier decides whether an unavailable module is a tier gap or
  // an industry-mode mismatch, so the catalog mapping depends on the licence
  // read as well as its own. Keyed on the tier STRING rather than the licence
  // object so a re-fetch that returns the same tier does not re-seed below.
  const orgTier = lic?.tier || null;
  const liveGroups = useMemo(
    () => mapLiveCatalog(catState.data, orgTier, catState.data?.launchScope?.enforced === true),
    [catState.data, orgTier],
  );
  // Editable copy for optimistic toggles, re-seeded whenever the live mapping
  // resolves to a new reference — once when the catalog lands, and once more if
  // the licence lands after it and changes a tier/industry verdict. Both are
  // one-shot per resolved input (useMemo over resolved payloads), so this
  // settles rather than looping.
  const [cat, setCat] = useState<AppGroup[] | null>(null);
  const seededRef = useRef<AppGroup[] | null>(null);
  useEffect(() => {
    if (seededRef.current !== liveGroups) {
      seededRef.current = liveGroups;
      setCat(liveGroups);
    }
  }, [liveGroups]);
  // Render from the optimistic copy once seeded, else straight from the live map
  // (avoids a one-frame blank between the fetch resolving and the seed effect).
  const groups = seededRef.current === liveGroups && cat !== null ? cat : liveGroups;
  const [query, setQuery] = useState('');
  const catalogView = useMemo(() => groupCatalogWorkflows(groups, query), [groups, query]);
  const [admin, setAdmin] = useState(false);
  const [toast, fireToast] = useToast();

  const tierLabel = lic?.tier || '';
  const pj: LicenceUsage = lic?.usage?.projects || EMPTY_USAGE;
  const us: LicenceUsage = lic?.usage?.users || EMPTY_USAGE;

  const setOn = (groupIdx: number, appId: string, on: boolean) =>
    setCat((prev) => {
      const base = seededRef.current === liveGroups && prev !== null ? prev : liveGroups;
      return base.map((g, gi) =>
        gi !== groupIdx
          ? g
          : {
              ...g,
              apps: g.apps.map((a) =>
                a.id === appId
                  ? {
                      ...a,
                      on,
                      /* The optimistic row carries the REASON the write
                         implies, not just the switch position. Setting `on`
                         alone left `lock` at null, so a module an administrator
                         had just switched off went on reading "Included in your
                         plan. Not switched on for this organization" until a
                         reload replaced it with the workspace decision that
                         administrator had in fact just made. Only the 'disabled'
                         source is reachable here — the toggle is never rendered
                         for a tier or industry lock — and both directions revert
                         cleanly, because the failure path calls this again with
                         the previous value. */
                      lock: on
                        ? null
                        : {
                            id: a.id,
                            label: a.name || a.id,
                            requiredTier: a.lock?.requiredTier ?? null,
                            entitled: false,
                            source: 'disabled' as const,
                          },
                    }
                  : a,
              ),
            },
      );
    });

  /* A module switch is a governed change (settings/integrity audit,
     2026-10-17): the server takes it only with a stated reason, which it writes
     to the §11.10(e) audit trail. So the switch opens the canonical
     reason-for-change dialog; nothing is written, and the card does not move,
     until a reason is confirmed and the server has accepted it. */
  const [pendingToggle, setPendingToggle] = useState<{ groupIdx: number; appId: string; next: boolean; label: string } | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const toggle = (groupIdx: number, appId: string, next: boolean) => {
    const row = groups[groupIdx]?.apps.find((a) => a.id === appId);
    const label = row?.name || getSurfaceMeta(appId).label || appId;
    setToggleError(null);
    setPendingToggle({ groupIdx, appId, next, label });
  };
  const runToggle = async ({ reason }: ConfirmResult) => {
    if (!pendingToggle) return;
    const { groupIdx, appId, next, label } = pendingToggle;
    try {
      // PUT /api/module-subscriptions/:moduleId/toggle (org admin, org-scoped,
      // governed) — a real, persisted write. apiRequest passes 401 through;
      // other non-OK throws with the server's reason (admin required / reason
      // required / tier does not include).
      const res = await apiRequest(
        'PUT',
        `/api/module-subscriptions/${encodeURIComponent(appId)}/toggle`,
        { enabled: next, reason },
      );
      if (!res.ok) {
        setToggleError(`Could not ${next ? 'enable' : 'disable'} ${label} — sign in required`);
        fireToast(`Could not ${next ? 'enable' : 'disable'} ${label} — sign in required`);
        return;
      }
      const body = (await res.json().catch(() => null)) as { auditTrail?: { persisted?: boolean } } | null;
      setOn(groupIdx, appId, next);
      setPendingToggle(null);
      // The grant stands even when its audit row was lost; say which happened.
      fireToast(
        (next ? 'Enabled ' : 'Disabled ') + label +
          (body?.auditTrail?.persisted === false ? ' — but its audit entry was not written; this has been logged for follow-up' : ''),
      );
    } catch (e) {
      // Never report a write that did not happen: the card stays as it was.
      const msg =
        `Could not ${next ? 'enable' : 'disable'} ${label} — ` +
        // Only apiRequest's own error has been through the envelope reader;
        // a bare rejection is the fetch failing ("Failed to fetch").
        (e instanceof ApiRequestError && e.message ? e.message : 'request failed');
      setToggleError(msg);
      fireToast(msg);
    }
  };

  /* What AnA can see of this screen.
     The Apps catalog is where a user asks "why can't I open X?" — and the
     answer is an entitlement fact on this page: the tier, whether the module is
     available at that tier, and whether it is switched on for the org. Until
     now AnA was told the surface was called "apps" and had none of it.

     A FAILED read publishes the failure: `groups` is [] both when the catalog
     is genuinely empty and when it did not load, and an assistant telling a
     customer they have no apps because a fetch failed is exactly the
     confidently-wrong answer this channel exists to prevent. */
  const anaContext = useMemo(() => {
    if (catState.loading || licState.loading) {
      return { summary: 'Subscription & features and licence details are still loading; nothing on screen is final yet.' };
    }
    if (catState.error) {
      return {
        summary:
          'Subscription & features could not be read, so this screen is showing no features because of a ' +
          'failure, not because none are entitled.',
        availableActions: ['Retry the catalog read'],
      };
    }
    const all = groups.flatMap((g) => g.apps);
    return {
      summary:
        'Subscription & features lists what the organisation\'s subscription includes. Each feature is used inside a project, ' +
        'along the project journey: Evidence → Author → Review → Submit → Respond' +
        (lic
          ? `. Subscription "${lic.tier}"${lic.industryMode ? ` (${lic.industryMode} mode)` : ''}, ` +
            `${usagePhrase(pj, 'projects')} and ${usagePhrase(us, 'users')} used`
          : '. The licence could not be read, so no subscription or usage figures are on screen') +
        (admin ? '. Admin controls are switched on, so the enable/disable toggles are live.' : ''),
      facts: {
        adminControlsVisible: admin,
        searchQuery: query,
        visibleWorkflows: catalogView.workflows.map(area => ({ id: area.id, label: area.label,
          when: area.when, start: area.start, next: area.next, featureIds: area.features.map(feature => feature.row.id) })),
        matchingFeatures: catalogView.matchingFeatures,
        mdxProjectFeatureIds: all.filter(feature => isMdxProjectFeature(feature.id)).map(feature => feature.id),
        licence: lic
          ? {
              tier: lic.tier,
              industryMode: lic.industryMode || null,
              projects: { used: pj.current, limit: pj.limit },
              users: { used: us.current, limit: us.limit },
            }
          : null,
        licenceUnavailable: licState.error ? 'the licence read failed' : null,
        groups: groups.map((g) => ({
          group: g.group,
          features: (g.apps ?? []).map((a) => ({
            id: a.id,
            name: a.name ?? null,
            tier: a.tier,
            enabled: a.on,
            /* "Why can't I open X?" is the question this surface exists to
               answer, and until now AnA could see only that X was off. The
               reason comes from the same helper the rail and the card use, so
               she cannot answer with a fifth phrasing — or, worse, reach for
               "not included in your plan" when the real cause was an
               administrator switching it off. Null means nothing is blocking
               it beyond the switch itself. */
            unavailableBecause: a.lock ? lockShortReason(a.lock) : null,
            /* Whether the enable/disable write would be accepted. She must not
               tell someone to ask an administrator to switch on a module the
               server would refuse with MODULE_NOT_AVAILABLE. */
            anAdminCanSwitchItOn: a.toggleable && !a.on,
          })),
        })),
      },
      availableActions: [
        'Find a feature and open an available feature',
        'Open Projects to work with MDX features inside a device or diagnostic project',
        'Show the admin controls and enable or disable a feature for this organisation (admin only; takes a reason for change and is written to the audit trail)',
        'Read the subscription tier and the project / user usage against their limits',
      ],
    };
  }, [catState.loading, catState.error, licState.loading, licState.error, groups, lic, pj, us, admin, query, catalogView]);
  /* AnA's hands on this screen (wave 7): the admin controls strip, the one
     thing a person switches here. Enabling or disabling a module for the
     organisation is an entitlement change and stays a governed human act —
     this only shows or hides the controls. */
  useSurfaceActionHandlers('apps', {
    'apps.show-admin-controls': (params) => {
      const want = (params.state ?? '').trim().toLowerCase();
      if (want !== 'on' && want !== 'off') {
        return { ok: false, reason: `"${params.state}" is not a state for the admin controls — choose on or off.` };
      }
      if (catState.loading) return { ok: false, reason: 'Subscription & features is still loading.', retry: true };
      if (catState.error) return { ok: false, reason: 'Subscription & features could not be read, so the admin controls are not on screen.' };
      const next = want === 'on';
      if (admin === next) return { ok: true, detail: `The admin controls are already ${want}` };
      setAdmin(next);
      return { ok: true, detail: next ? 'Showing the admin controls' : 'Hid the admin controls' };
    },
  });
  useEffect(() => {
    if (!catState.loading) notifySurfaceActionReady('apps');
  }, [catState.loading]);
  usePublishSurfaceContext('apps', anaContext);

  const renderAccessRemedy = (a: AppRow) => {
    if (a.toggleable) {
      return (
        <button
          className="btn ghost"
          style={{ height: 26, marginLeft: 'auto' }}
          onClick={() => setAdmin(true)}
          title="Turn on admin controls to enable this feature"
        >
          Admin controls
        </button>
      );
    }
    const notice = a.lock ? lockNotice(a.lock, ROLE_AGNOSTIC) : null;
    if (!notice?.ctaLabel || !notice.ctaTarget) return null;
    return (
      <button
        className="btn primary"
        style={{ height: 26, marginLeft: 'auto' }}
        onClick={() => open(notice.ctaTarget as string)}
        data-testid="admin-upgrade-plan"
      >
        {notice.ctaLabel}
      </button>
    );
  };
  const renderAccessControl = (a: AppRow, groupIdx: number, projectFeature: boolean) => {
    if (admin && a.toggleable) {
      return (
        <button
          className="lic-toggle"
          role="switch"
          aria-checked={a.on}
          aria-label={`${a.on ? 'Disable' : 'Enable'} ${a.name || a.id}`}
          data-on={a.on || undefined}
          style={{ marginLeft: 'auto' }}
          onClick={() => toggle(groupIdx, a.id, !a.on)}
          title={a.on ? 'Disable this feature' : 'Enable this feature'}
        >
          <span className="lic-toggle-k"></span>
        </button>
      );
    }
    if (!a.on) return renderAccessRemedy(a);
    if (projectFeature) return null;
    return (
      <button className="btn ghost" style={{ height: 26, marginLeft: 'auto' }} onClick={() => open(a.id)}>
        Open
      </button>
    );
  };
  const renderAccess = (a: AppRow, groupIdx: number, projectFeature = false) => {
    const notice = a.lock ? lockNotice(a.lock, ROLE_AGNOSTIC) : null;
    return (
      <>
        <span className={`rd-chip rd-chip-sentence tone-${a.lock ? 'idle' : a.on ? 'ai' : 'ok'}`}>
          {notice ? notice.status : a.tier}
        </span>
        {renderAccessControl(a, groupIdx, projectFeature)}
      </>
    );
  };

  const renderFeatures = (features: CatalogFeature<AppRow>[]) => (
    <div className="launch-grid">
            {features.map(({ row: a, groupIndex }) => {
              const surf = getSurfaceMeta(a.id);
              const label = a.name || surf.label || a.id;
              return (
                <div key={a.id} className="launch" data-locked={!a.on || undefined}>
                  {!a.on && <span className="launch-lock">{I.lock}</span>}
                  <div className="launch-top">
                    <span className="launch-ico">
                      {(surf.icon ? I[surf.icon] : null) || I.grid}
                    </span>
                  </div>
                  <div className="launch-title">{label}</div>
                  <div className="launch-desc">
                    {/* Three different facts, three different sentences. An
                        upsell, a workspace decision and an unprovisioned module
                        used to share two strings between them, so an org was
                        told to buy a plan for a module their administrator had
                        switched off — and told an administrator had switched
                        off a module nobody had ever touched. */}
                    {a.lock ? `${label} is ${lockShortReason(a.lock)}.` : a.desc}
                  </div>
                  <div className="launch-foot">{renderAccess(a, groupIndex)}</div>
                </div>
              );
            })}
    </div>
  );

  return (
    <div className="page-inner workflow-page">
      <div className="ph">
        <div>
          <div className="ph-eyebrow">Administration</div>
          <h1 className="ph-title">{getSurfaceMeta('apps').label}</h1>
          {/* Not a place a client works from (docs/design/CLIENT_JOURNEY_2026-10-25.md):
              each feature is used inside a project, and this page says what the
              subscription includes and why a feature is unavailable. The heading
              is the registry label, so it and the breadcrumb are one name. */}
          <p className="ph-sub">What your organization’s subscription includes, and why any feature is unavailable. Your team uses these features inside a project, along its steps: Evidence → Author → Review → Submit → Respond. An administrator turns features on or off here.</p>
        </div>
        <button className="btn ghost" data-on={admin || undefined}
          onClick={() => setAdmin(v => !v)} title="Toggle admin controls">
          {I.settings || I.sliders} {admin ? 'Admin controls on' : 'Admin controls'}
        </button>
      </div>
      <div className="workflow-search">
        <label htmlFor="workflow-search">Find a feature</label>
        <input id="workflow-search" type="search" value={query}
          placeholder="Search by task, document or feature"
          onChange={event => setQuery(event.target.value)} />
      </div>

      {/* License / entitlement header */}
      {licState.loading ? (
        <div role="status" className="scaf-note" style={{ marginBottom: 16 }}>Loading license…</div>
      ) : lic ? (
      <div className="lic-band">
        <div className="lic-tier">
          <span className="lic-tier-dot" data-tier={tierLabel}></span>
          <div>
            <div className="lic-tier-l">Current subscription</div>
            <div className="lic-tier-v">
              {String(tierLabel).charAt(0).toUpperCase() + String(tierLabel).slice(1)}
              {lic.industryMode ? (
                <span className="lic-ind"> — {lic.industryMode}</span>
              ) : null}
            </div>
          </div>
        </div>
        <LicenceQuota label="Projects" usage={pj} />
        <LicenceQuota label="Seats" usage={us} />
        <div className="lic-band-spacer"></div>
        {lic.renewsAt && <div className="lic-renew">Renews {lic.renewsAt}</div>}
        {/* Was <a href="/settings/subscription">. That path matches no route,
            so the browser did a FULL page reload and the SPA router landed the
            admin back on the app home — a hard reload, a lost place in the
            product, and no billing screen. `licensing` is a real registered
            surface and `onNav` is already in scope here. */}
        <button
          className="btn ghost"
          style={{ height: 28 }}
          onClick={() => open('licensing')}
          data-testid="admin-manage-plan"
        >
          {I.creditCard || I.zap} {getSurfaceMeta('licensing').label}
        </button>
      </div>
      ) : (
        <div
          className="scaf-note"
          style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}
        >
          {I.info}
          <span>
            License &amp; entitlement details are unavailable right now
            {licState.error ? " — the billing service didn't respond" : ''}.
          </span>
          <button
            className="btn ghost"
            style={{ height: 28, marginLeft: 'auto' }}
            onClick={() => open('licensing')}
            data-testid="admin-manage-plan-fallback"
          >
            {I.creditCard || I.zap} {getSurfaceMeta('licensing').label}
          </button>
        </div>
      )}

      {catState.loading ? (
        <div className="sec">
          <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>Loading features…</div>
        </div>
      ) : catState.error ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load features"
          hint="Your workspace features could not be loaded. Check your connection and try again."
        />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={I.grid}
          title="No features available"
          hint="No features are listed for this workspace. Ask your administrator to check the workspace setup."
        />
      ) : (
        <div className="workflow-guide">
          {catalogView.matchingFeatures === 0 ? (
            <EmptyState icon={I.search} title="No features match your search"
              hint="Try a task, document type or feature name, or clear the search." />
          ) : null}
          <span className="sr-only" role="status">
            {query.trim() ? `${catalogView.matchingFeatures} features match your search` : ''}
          </span>
          {catalogView.workflows.map(area => {
            const mdxFeatures = area.features.filter(feature => isMdxProjectFeature(feature.row.id));
            const sharedFeatures = area.features.filter(feature => !isMdxProjectFeature(feature.row.id));
            return (
              <section key={area.id} className="workflow-area" aria-label={area.label}>
                <h2>{area.label}</h2>
                <dl className="workflow-guidance">
                  <div><dt>When to use</dt><dd>{area.when}</dd></div>
                  <div><dt>Start with</dt><dd>{area.start}</dd></div>
                  <div><dt>Next</dt><dd>{area.next}</dd></div>
                </dl>
                <MdxCatalogSolution
                  onOpenProjects={() => open('projects')}
                  expanded={admin || !!query.trim()}
                  features={mdxFeatures.map(({ row: feature, groupIndex }) => {
                    const label = feature.name || getSurfaceMeta(feature.id).label || feature.id;
                    return {
                      id: feature.id,
                      label,
                      description: feature.lock ? `${label} is ${lockShortReason(feature.lock)}.` : feature.desc,
                      locked: !!feature.lock,
                      access: renderAccess(feature, groupIndex, true),
                    };
                  })}
                />
                {sharedFeatures.length > 0 && (
                  <details data-workflow={area.id} open={admin || !!query.trim()}>
                    <summary>Features and steps ({sharedFeatures.length})</summary>
                    {renderFeatures(sharedFeatures)}
                  </details>
                )}
              </section>
            );
          })}
          {catalogView.additional.length > 0 && (
            <details className="workflow-additional" data-workflow="additional" open={admin || !!query.trim()}>
              <summary>Additional capabilities</summary>
              <p>Other features listed for your workspace. Each states whether it is available and how to get access.</p>
              {catalogView.additional.map(group => (
                <section key={group.label} className="sec">
                  <h2 className="sec-title">{group.label}</h2>
                  {renderFeatures(group.features)}
                </section>
              ))}
            </details>
          )}
        </div>
      )}

      {admin && <details className="workflow-additional">
        <summary>Supporting platform services</summary>
      <div className="sec">
        <div className="sec-hdr">
          <div className="sec-title">Platform services</div>
          <div className="sec-sub">Shared services supporting these features</div>
        </div>
        <div className="svc-note">
          {I.info}
          <span>These services support drafting, evidence, reporting and signing within the features above.</span>
        </div>
        <div className="svc-grid">
          {PLATFORM_SERVICES.map((s, i) => (
            <div key={i} className="svc-card">
              <div className="svc-ico">{I[s.icon] || I.zap}</div>
              <div>
                <div className="svc-name">{s.name}</div>
                <div className="svc-desc">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      </details>}
      <GovernedConfirmDialog
        open={pendingToggle !== null}
        action={pendingToggle ? `${pendingToggle.next ? 'Enable' : 'Disable'} ${pendingToggle.label}` : ''}
        target={pendingToggle ? `For every member of this organisation · module ${pendingToggle.appId}` : ''}
        minReason={GOVERNED_REASON_MIN}
        onCancel={() => { setPendingToggle(null); setToggleError(null); }}
        onConfirm={runToggle}
        submitError={toggleError}
      />
      <C2CToast msg={toast} />
    </div>
  );
}

