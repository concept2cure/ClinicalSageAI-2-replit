/**
 * Navigation entitlements — the rail's one source of truth for what this
 * organization has licensed.
 *
 * This replaces the shell's client-side fixture, which named three module ids
 * in source (`LICENSE_UNLICENSED = ['labeling', 'risk', 'pdev']`), applied them
 * identically to every tenant, and was never called by anything — so the rail
 * offered every destination to every organization regardless of what they had
 * bought. Verdicts now come from `GET /api/module-subscriptions/navigation`,
 * which resolves them per organization from persisted subscription, plan and
 * catalog state (server/services/entitlements/navigation-entitlements.ts).
 *
 * THREE RULES THIS MODULE ENFORCES, all of them about not lying:
 *
 *   1. NO VERDICT ⇒ NO LOCK. Until the fetch resolves, and forever after if it
 *      fails, `verdictFor()` returns null and the rail renders normally. A lock
 *      badge is a claim about a customer's contract; deriving that claim from a
 *      failed request would tell a paying customer they do not own what they
 *      paid for. The rail is wayfinding — the security boundary is server-side
 *      route gating, which is unaffected either way.
 *   2. AN UNKNOWN ID IS NOT LICENSABLE. The payload carries one verdict per
 *      catalog module. Destinations with no catalog row — AnA Command, the Apps
 *      catalog, and deliberately `audit-trail` / `part11-console`, which under
 *      21 CFR §11.10(e) may not be something an org can be sold or an admin can
 *      switch off — are absent, and absent means unconditionally available.
 *      That is load-bearing in the other direction too: the Apps catalog and
 *      AnA carry no catalog row, so they can never lock — which is what keeps
 *      the step that RESOLVES a lock reachable from a locked rail.
 *   3. THE REASON IS THE REAL ONE. A locked destination says which of the four
 *      real reasons applies and offers the step that actually resolves it. An
 *      org told to upgrade when the true reason is their industry mode would
 *      buy a plan that changes nothing.
 */
import React from 'react';
import { useLiveData } from './dataConnect';

/** Mirrors NavEntitlementSource (server/services/entitlements/navigation-entitlements.ts). */
export type NavEntitlementSource =
  | 'master_admin'
  | 'subscribed'
  | 'included'
  | 'disabled'
  | 'tier'
  | 'industry';

export interface NavSurfaceEntitlement {
  id: string;
  label: string;
  entitled: boolean;
  source: NavEntitlementSource;
  requiredTier: string | null;
}

export interface NavEntitlementsPayload {
  organizationId: number;
  tier: string | null;
  industryMode: string | null;
  masterAdmin: boolean;
  /** False ⇒ the server computed no verdicts; render no lock state. */
  resolved: boolean;
  surfaces: NavSurfaceEntitlement[];
}

export interface NavEntitlementsValue {
  /** The verdict for a destination, or null when there is none to render. */
  verdictFor: (id: string) => NavSurfaceEntitlement | null;
  /** True once the server has returned a usable verdict set. */
  resolved: boolean;
  /** True when the viewer holds the platform-owner grant (everything unlocked). */
  masterAdmin: boolean;
  /** The organization's plan tier, when known. */
  tier: string | null;
}

const EMPTY: NavEntitlementsValue = {
  verdictFor: () => null,
  resolved: false,
  masterAdmin: false,
  tier: null,
};

const NavEntitlementsContext = React.createContext<NavEntitlementsValue>(EMPTY);

/**
 * A 200 is only evidence that something came back. This asserts the body is
 * actually the verdict contract before any of it is believed.
 *
 * Written inline rather than composed from `hasKeys`, for two reasons. It is
 * stricter — `surfaces` must be an ARRAY, not merely present, and a `{ data: [] }`
 * envelope or a proxy's HTML login page is rejected rather than unwrapped into
 * something truthy that satisfies no field. And it removes a module-load-time
 * call into `./dataConnect`, which several suites replace with a partial mock:
 * evaluating a guard factory at import time made every one of those suites fail
 * the moment `Shell.tsx` gained this import, in files that have nothing to do
 * with entitlements.
 */
function isNavEntitlementsPayload(value: unknown): value is NavEntitlementsPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.resolved === 'boolean' && Array.isArray(v.surfaces);
}

/**
 * Fetch the verdict set once for the session and provide it to the shell.
 *
 * Mounted above the rail rather than inside it so the rail and the locked-state
 * panel read the same answer — two independent fetches could disagree about
 * whether a destination is locked while the panel explaining it is open.
 */
export function NavEntitlementsProvider({ children }: { children: React.ReactNode }) {
  const state = useLiveData<NavEntitlementsPayload>(
    '/api/module-subscriptions/navigation',
    ['/api/module-subscriptions/navigation'],
    isNavEntitlementsPayload,
  );

  const value = React.useMemo<NavEntitlementsValue>(() => {
    const payload = state.data;
    // Rule 1: anything short of a resolved payload yields no verdicts at all.
    if (!payload || payload.resolved !== true || !Array.isArray(payload.surfaces)) {
      return EMPTY;
    }
    const byId = new Map<string, NavSurfaceEntitlement>();
    for (const s of payload.surfaces) {
      if (s && typeof s.id === 'string') byId.set(s.id, s);
    }
    return {
      // Rule 2: an id the catalog does not carry is not licensable.
      verdictFor: (id: string) => byId.get(id) ?? null,
      resolved: true,
      masterAdmin: payload.masterAdmin === true,
      tier: typeof payload.tier === 'string' ? payload.tier : null,
    };
  }, [state.data]);

  return (
    <NavEntitlementsContext.Provider value={value}>{children}</NavEntitlementsContext.Provider>
  );
}

export function useNavEntitlements(): NavEntitlementsValue {
  return React.useContext(NavEntitlementsContext);
}

/** True when a destination must be rendered as locked. Null verdicts (no
 *  answer, or not licensable) are never locked — see rules 1 and 2. */
export function isLocked(verdict: NavSurfaceEntitlement | null): boolean {
  return verdict != null && verdict.entitled === false;
}

export interface LockNotice {
  /** What the state is, in the fewest words that stay true. */
  status: string;
  /** Why it is locked, and what changes it. */
  body: string;
  /** The single next step, or null when there is no step the viewer can take. */
  ctaLabel: string | null;
  /** Surface id the CTA opens. Null when ctaLabel is null. */
  ctaTarget: string | null;
  /**
   * True when the step left for THIS viewer is to ask an administrator.
   *
   * Separate from `ctaLabel`, and it has to be. `ctaLabel` is the step the
   * viewer can take THEMSELVES — open the plans page, open the Apps catalog —
   * and for a member who cannot buy it is correctly null on two of the three
   * lock reasons. That honesty was also a dead end: the panel named the reason,
   * refused to offer a button that would be refused, and left the person who
   * actually needs the module with nothing to do. This is the step that was
   * missing, and it is never offered to an org administrator, who holds the
   * control already and would only be asking themselves.
   */
  requestable: boolean;
}

/** One of the viewer's own access requests, as GET /api/module-access-requests/mine
 *  returns it. The panel reads only these fields. */
export interface ModuleAccessRequestSummary {
  id: number;
  moduleId: string;
  status: 'open' | 'approved' | 'declined';
  note: string | null;
  createdAt: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
}

/**
 * An absolute date, never a relative one.
 *
 * "3 days ago" invites a regulatory reader to do arithmetic against a clock
 * they cannot see, and it is exactly the phrase that becomes wrong when a page
 * is left open. Returns null for an instant that will not parse, so a
 * date-shaped string nobody can trust is never rendered as a date.
 */
export function requestDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { dateStyle: 'long' });
}

/**
 * What to say about a request this viewer has already made, or null when there
 * is nothing to report.
 *
 * The open case is the one that matters. Without it, a second press on
 * "Request access" is absorbed into the request already on file and reported as
 * success — which teaches the requester that pressing the button does nothing.
 * The panel says a request is already open and when it was made, and offers no
 * second press.
 */
export function requestNotice(request: ModuleAccessRequestSummary | null): string | null {
  if (!request) return null;
  const made = requestDate(request.createdAt);
  const answered = requestDate(request.decidedAt);
  switch (request.status) {
    case 'open':
      return made
        ? `You asked for this app on ${made}. It is with your administrators.`
        : 'You have already asked for this app. It is with your administrators.';
    case 'declined': {
      const when = answered ? `Declined on ${answered}.` : 'Your last request was declined.';
      return request.decisionReason ? `${when} Reason given: ${request.decisionReason}` : when;
    }
    case 'approved':
      return answered
        ? `Your request was approved on ${answered}. If this app is still locked, reload the page.`
        : 'Your request was approved. If this app is still locked, reload the page.';
    default:
      return null;
  }
}

/**
 * The request on file for one module, or null.
 *
 * An ANSWERED request is only reported while it is the most recent word on the
 * module: once the requester opens a new one, the old decline is history and
 * showing it alongside a live request would say two contradictory things at
 * once. Rows arrive newest first, so the first match is the current one.
 */
export function currentRequestFor(
  requests: ModuleAccessRequestSummary[] | null | undefined,
  moduleId: string,
): ModuleAccessRequestSummary | null {
  if (!Array.isArray(requests)) return null;
  return requests.find((r) => r && r.moduleId === moduleId) ?? null;
}

/**
 * The reason a destination is locked, as a phrase that stands ALONE.
 *
 * Separate from {@link LockNotice.status} on purpose, and the difference is the
 * whole point. `status` is a pill inside the panel, read next to a lock glyph
 * and a paragraph that explains it — "Included from Professional" is clear
 * there. This is appended to a rail button's accessible name, where there is no
 * surrounding context at all, so it has to say what is TRUE about the state on
 * its own.
 *
 * It exists because the rail previously hard-coded "not included in your plan"
 * for every locked entry. That is only true of the `tier` verdict: a module an
 * administrator switched off needs nothing bought, and one outside the
 * workspace's industry mode is not fixed by any plan. So a screen-reader user,
 * and anyone hovering, were told a different — and wrong — reason from the one
 * the panel gave them on activation.
 */
export function lockShortReason(verdict: NavSurfaceEntitlement): string {
  switch (verdict.source) {
    case 'disabled':
      return 'turned off for this workspace';
    case 'industry':
      return 'not offered for this workspace';
    case 'tier':
    default:
      return 'not included in your plan';
  }
}

const TIER_LABEL: Record<string, string> = {
  free: 'Free',
  standard: 'Standard',
  professional: 'Professional',
  enterprise: 'Enterprise',
};

/**
 * Honest copy for a locked destination.
 *
 * Each branch names the reason the server actually returned and routes to the
 * place that resolves THAT reason — plans for a tier gap, the Apps catalog for
 * a module an admin switched off, workspace setup for an industry-mode
 * mismatch. Nothing here invents a price, a tier, or a renewal date.
 */
export function lockNotice(
  verdict: NavSurfaceEntitlement,
  opts: { isOrgAdmin: boolean },
): LockNotice {
  switch (verdict.source) {
    case 'disabled':
      return {
        status: 'Turned off for this workspace',
        body: opts.isOrgAdmin
          ? 'An administrator disabled this app for your organization. You can turn it back on in the Apps catalog.'
          : 'An administrator disabled this app for your organization. Ask them to turn it back on.',
        ctaLabel: opts.isOrgAdmin ? 'Open Apps catalog' : null,
        ctaTarget: opts.isOrgAdmin ? 'apps' : null,
        requestable: !opts.isOrgAdmin,
      };
    case 'industry':
      return {
        status: 'Not offered for this workspace',
        body: 'This app is not part of the catalog for your workspace’s industry setting. Changing that setting is an administrator action, not a plan change.',
        ctaLabel: opts.isOrgAdmin ? 'Open workspace setup' : null,
        ctaTarget: opts.isOrgAdmin ? 'setup' : null,
        requestable: !opts.isOrgAdmin,
      };
    case 'tier':
    default: {
      const tier = verdict.requiredTier ? TIER_LABEL[verdict.requiredTier] : null;
      return {
        status: tier ? `Included from ${tier}` : 'Not included in your plan',
        body: tier
          ? `Your plan does not include this app. It is included from the ${tier} plan upward.`
          : 'Your plan does not include this app.',
        ctaLabel: 'View plans',
        ctaTarget: 'licensing',
        /* A member sees the plans page too — it is the honest explanation of
           what the tier includes — but buying is not theirs to do, so the step
           that IS theirs is offered alongside it. */
        requestable: !opts.isOrgAdmin,
      };
    }
  }
}
