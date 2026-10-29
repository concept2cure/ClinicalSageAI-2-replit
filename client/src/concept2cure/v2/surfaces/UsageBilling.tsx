import React, { useMemo, useState } from 'react';
import { I } from '../icons';
import { useLiveData, EmptyState, hasKeys, type DataState, type ShapeGuard } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { useSurfaceActionHandlers, type SurfaceActionHandler } from '../surfaceActions';
import '../styles/project-home-v2.css';
import { getSurfaceMeta } from '../registryModel';

/* ── Per-tier rate limits — canonical rate card, verbatim from the server's
   RATE_LIMITS grid (billing-dashboard.ts). This is reference config, NOT
   fixture data: a published per-tier rate card rendered for comparison,
   with the org's real tier highlighted. ── */

interface RateLimit {
  requestsPerMinute: number;
  requestsPerDay: number;
  tokensPerMinute: number;
  tokensPerDay: number;
}

const USAGE_RATE_LIMITS: Record<string, RateLimit> = {
  free: { requestsPerMinute: 10, requestsPerDay: 100, tokensPerMinute: 10000, tokensPerDay: 100000 },
  standard: { requestsPerMinute: 60, requestsPerDay: 5000, tokensPerMinute: 100000, tokensPerDay: 1000000 },
  professional: { requestsPerMinute: 120, requestsPerDay: 20000, tokensPerMinute: 500000, tokensPerDay: 5000000 },
  enterprise: { requestsPerMinute: 500, requestsPerDay: 100000, tokensPerMinute: 2000000, tokensPerDay: 20000000 },
};

/* ── Credits are NOT shown (settings/integrity audit 2026-10-17, finding 4).
   The credit ledger (server/services/credit-ledger.ts) is never spent:
   `debitCredits` has no caller, so no use of the product draws a balance down,
   and auto-reload can never fire. This surface used to render the balance,
   a "Buy more" button, an auto-reload switch and a per-category credit card —
   an unmetered number presented as metering. They are gone until something
   actually debits the ledger. Paying and invoices go through Stripe: the
   portal is "Manage billing" on Compare subscriptions (LicensingSurface).

   ── The invoice list is not here (D2, fold billing into Licensing,
   2026-10-29). It was this screen's Billing tab, shown to every member under
   both ids. It moved to Licensing under the plan status (LicensingInvoices.tsx),
   for billing administrators, which is also who GET /api/billing/invoices now
   admits. Usage, the weekly caps and the rate card stay here, on 'usage', for
   every member: they are what a member runs into while working, and Licensing
   is where a subscription is bought. ── */

/* ── Live response shapes — aligned to the real /api/billing payload.
   GET /usage/limits → UsageLimitsSnapshot (services/usage-windows.ts)
   Each panel renders REAL persisted data, an honest EMPTY state, or an
   honest ERROR state via useLiveData — never a fabricated stand-in. ── */

interface LiveWeeklyBucket {
  label: string;
  pctUsed: number;
  // ISO string on the wire; null only when a bucket has no reset (defensive —
  // the backend currently always sets it). Rendered null-safe, never faked.
  resetsAt: string | null;
}

interface LiveUsageSnapshot {
  plan: string;
  planLabel: string;
  // Loosely shaped on the wire: a partial/malformed snapshot may omit session
  // or send a non-array weekly. Each panel guards its own slice and renders an
  // honest empty state rather than crashing or falling back to a fixture.
  session?: { pctUsed: number; resetsAt: string | null; windowHours: number };
  weekly: LiveWeeklyBucket[];
  lastUpdated: string | null;
}

/* ── Shape guards — a 200 is not proof of a shape ──
   Every panel crashed on a response that was merely plausible. A route
   answering `{ data: [] }` unwraps to a bare `[]`, and `[]` is TRUTHY: it
   walked past Panel's `!state.data` check, matched nothing the panel then
   read, and `c.autoReload.topupCents` threw mid-render — so the user was told
   the surface was broken when the truthful answer, already written three
   lines up, was "we couldn't load this". `{}`, a 200 carrying `{ error }`,
   and a JSON scalar all landed the same way.

   Guarding the fetch routes those into each panel's existing error state.
   The guards check key PRESENCE, not truthiness: a present-but-null field is
   real data (a snapshot with no session yet) and belongs in the panel's
   empty state, so the member-level checks below handle it instead. ── */

/** `{ plan, weekly, … }` — the usage snapshot. Deliberately only the two keys
    that identify it: a partial snapshot missing `session`, or carrying a
    non-array `weekly`, is a real degraded payload each panel already reports
    as its own honest empty, and must not be inflated into a whole-surface
    error. */
const isUsageSnapshot: ShapeGuard<LiveUsageSnapshot> = hasKeys<LiveUsageSnapshot>('plan', 'weekly');

/* ── Helpers ── */

function _fmt(n: number): string {
  if (n >= 1000000) return n / 1000000 + 'M';
  if (n >= 1000) return n / 1000 + 'K';
  return String(n);
}

/** ISO → "Sun 8:00 AM" (weekly reset display shape); "—" when absent. */
function fmtResetAt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return (
    d.toLocaleDateString('en-US', { weekday: 'short' }) +
    ' ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  );
}

/** ISO reset timestamp → "2 hr 25 min" remaining; null when idle/expired. */
function fmtResetIn(iso: string | null): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const mins = Math.max(1, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? h + ' hr ' + m + ' min' : m + ' min';
}

/** ISO → relative "last updated" text. */
function fmtAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 60000) return 'less than a minute ago';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return mins + ' min ago';
  return Math.floor(mins / 60) + ' hr ' + (mins % 60) + ' min ago';
}

function UsageBar({ pct, tone }: { pct: number; tone?: string }) {
  return (
    <div className="ub-bar">
      <span
        style={{
          width: Math.min(100, pct) + '%',
          background:
            tone || (pct >= 90 ? 'var(--warning)' : 'var(--accent-100)'),
        }}
      />
    </div>
  );
}

/* ── Honest four-state guard (loading → error → empty → real) — the fixture-
   free render every data panel uses. `isEmpty` lets an object payload (a
   snapshot with no session) report empty, since the hook only auto-detects
   empty for null/array payloads. ── */
function Panel<T>({
  state,
  errorTitle,
  errorHint,
  emptyTitle,
  emptyHint,
  isEmpty,
  children,
}: {
  state: DataState<T>;
  errorTitle: string;
  errorHint: React.ReactNode;
  emptyTitle: string;
  emptyHint?: React.ReactNode;
  isEmpty?: (data: T) => boolean;
  children: (data: T) => React.ReactNode;
}) {
  if (state.loading) {
    return <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>Loading…</div>;
  }
  if (state.error) {
    return <EmptyState tone="error" icon={I.alertTriangle} title={errorTitle} hint={errorHint} />;
  }
  if (!state.data || (isEmpty ? isEmpty(state.data) : false)) {
    return <EmptyState icon={I.fileText} title={emptyTitle} hint={emptyHint} />;
  }
  return <>{children(state.data)}</>;
}

/* ── Usage & limits surface ──
   Mounted under both `usage` and `billing` registry ids until `billing` is
   retired as an alias of Licensing; both open on the usage tab, since the
   invoice list moved to Licensing. */

export function UsageBilling({ onAsk, surface, onNav }: SurfaceViewProps) {
  const [tab, setTab] = useState<'usage' | 'limits'>('usage');

  // One org-scoped GET behind /api/billing (billing-dashboard.ts), a real DB
  // read. No fixtures: every panel renders live data, an honest empty, or an
  // honest error.
  const usageState = useLiveData<LiveUsageSnapshot>(
    '/api/billing/usage/limits',
    ['/api/billing/usage/limits'],
    isUsageSnapshot,
  );
  const snap = usageState.data;

  // Real org tier drives the plan label + the rate-limit table highlight;
  // null while the snapshot is loading or unavailable (no fabricated tier).
  const tier = snap ? snap.plan : null;

  /* Was a dead write to `c2c_open_surface`, a key with no reader — so "View
     all plans" did nothing. The shell's `onNav` is what navigates. */
  const nav = (id: string) => onNav(id);

  /* What AnA can see of this screen.
     ONE component, TWO routable ids. `billing` and `usage` are separate
     registry entries rendering this same file, and the shell reads context by
     EXACT id — so publishing under a single literal would leave whichever id
     was not chosen blind, with no symptom. Both hooks are therefore called
     unconditionally (React requires that anyway) and the inactive one publishes
     null, which clears only if it still owns the slot. The literals stay
     literal so the CI gate can still see which ids this file claims.

     `surface` is `getSurface(activeId)`, so `surface.id` IS the mounted id. */
  const activeId = surface && surface.id === 'billing' ? 'billing' : 'usage';

  /* AnA can open either on-screen tab — the same click a person makes. `tab`
     is local display state independent of which registry id (`usage`/
     `billing`) is mounted, so the SAME handler body is registered under
     whichever id currently owns the bus slot, mirroring the publish gating
     just above/below. View-state only — nothing governed here. The billing
     tab is gone with the invoice list, so asking for it says where the list
     is instead of opening a tab that does not exist. */
  const openTab: SurfaceActionHandler = (params) => {
    const target = params.tab;
    if (target === 'billing') {
      return {
        ok: false,
        reason: `Invoices are on ${getSurfaceMeta('licensing').label}, for billing administrators. This screen shows usage and rate limits.`,
      };
    }
    if (target !== 'usage' && target !== 'limits') {
      return { ok: false, reason: `"${target}" is not a usage tab.` };
    }
    if (tab === target) return { ok: true, detail: `Already on the ${target} tab` };
    setTab(target);
    return { ok: true, detail: `Opened the ${target} tab` };
  };
  useSurfaceActionHandlers(activeId === 'usage' ? 'usage' : null, { 'usage.open-tab': openTab });
  useSurfaceActionHandlers(activeId === 'billing' ? 'billing' : null, { 'billing.open-tab': openTab });

  const anaContext = useMemo(() => {
    return {
      summary:
        `Usage and limits, "${tab}" tab. ` +
        (usageState.loading
          ? 'The usage snapshot is still loading.'
          : usageState.error || !snap
            ? 'The usage snapshot could not be read, so no plan or limit figures are on screen — a failure, not a zero.'
            : `Plan "${snap.planLabel}"` +
              (snap.session ? `, session window ${snap.session.pctUsed}% used over ${snap.session.windowHours}h` : '') +
              `, ${(snap.weekly ?? []).length} weekly cap bucket(s).`) +
        ' Usage credits are not metered, so no credit balance is shown. ' +
        `Invoices are not on this screen: they are on ${getSurfaceMeta('licensing').label}, for billing administrators.`,
      facts: {
        openTab: tab,
        plan: snap ? { tier: snap.plan, label: snap.planLabel, lastUpdated: snap.lastUpdated } : null,
        planUnavailable: usageState.error ? 'the usage snapshot read failed' : null,
        sessionWindow: snap?.session ?? null,
        weeklyCaps: snap?.weekly ?? null,
        credits: 'not metered — nothing draws down the credit ledger, so no balance is shown',
      },
      availableActions: [
        'Switch between the usage and rate-limits tabs',
        'Read plan usage limits, the session window and the weekly caps',
        'Compare subscriptions on its own screen, where billing administrators read invoices',
      ],
    };
  }, [tab, usageState.loading, usageState.error, snap]);
  usePublishSurfaceContext('usage', activeId === 'usage' ? anaContext : null);
  usePublishSurfaceContext('billing', activeId === 'billing' ? anaContext : null);

  return (
    <div className="sp" style={{ maxWidth: 1000 }}>
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">
            Settings {I.dot} Usage
          </div>
          <h1 className="sp-title">{getSurfaceMeta('usage').label}</h1>
          <p className="sp-state">
            Plan usage limits, weekly caps and rate limits by tier.
          </p>
        </div>
        <button className="sp-primary" onClick={() => nav('licensing')}>
          {I.creditCard || I.arrowRight} {getSurfaceMeta('licensing').label}
        </button>
      </div>

      <div className="reg-tabs">
        <button
          className={'reg-tab' + (tab === 'usage' ? ' on' : '')}
          onClick={() => setTab('usage')}
        >
          Usage
        </button>
        <button
          className={'reg-tab' + (tab === 'limits' ? ' on' : '')}
          onClick={() => setTab('limits')}
        >
          Rate limits
        </button>
      </div>

      {tab === 'usage' && (
        <div>
          <div className="pj-card" style={{ marginBottom: 14 }}>
            <div className="pj-card-h">
              <span className="t">Plan usage limits</span>
              {snap && <span className="s">{snap.planLabel} plan</span>}
            </div>
            <div className="pj-card-b">
              <Panel
                state={usageState}
                errorTitle="Couldn't load plan usage"
                errorHint="The plan usage windows didn't respond. They're computed from your metered API usage — sign in and retry, or check the service is reachable."
                emptyTitle="No plan usage yet"
                emptyHint="Usage appears here once your organization makes its first metered call."
                isEmpty={(s) => !s.session}
              >
                {(s) => {
                  const sess = s.session!;
                  const resetIn = fmtResetIn(sess.resetsAt);
                  const resetLine = !resetIn
                    ? 'No active session — a new ' + sess.windowHours + '-hour window starts on first use'
                    : 'Resets in ' + resetIn;
                  return (
                    <div className="ub-row">
                      <div className="ub-row-l">
                        <div className="ub-row-t">Current session</div>
                        <div className="ub-row-s">{resetLine}</div>
                      </div>
                      <UsageBar pct={sess.pctUsed} />
                      <span className="ub-pct">{sess.pctUsed}% used</span>
                    </div>
                  );
                }}
              </Panel>
            </div>
          </div>
          <div className="pj-card" style={{ marginBottom: 14 }}>
            <div className="pj-card-h">
              <span className="t">Weekly limits</span>
              {/* A button, not an <a> with no href: this asks AnA a question, it
                  does not navigate, and without href the anchor was neither
                  focusable nor activatable from the keyboard. */}
              <button
                type="button"
                className="ub-link"
                style={{ background: 'none', border: 0, padding: 0, font: 'inherit', cursor: 'pointer' }}
                onClick={() =>
                  onAsk &&
                  onAsk(
                    'Explain how weekly usage limits and overage caps work.',
                  )
                }
              >
                Learn more about usage limits
              </button>
            </div>
            <div className="pj-card-b">
              <Panel
                state={usageState}
                errorTitle="Couldn't load weekly limits"
                errorHint="The weekly usage windows didn't respond. Sign in and retry, or check the service is reachable."
                emptyTitle="No weekly usage yet"
                isEmpty={(s) => !Array.isArray(s.weekly) || s.weekly.length === 0}
              >
                {(s) => (
                  <>
                    {s.weekly.map((w, i) => (
                      <div key={i} className="ub-row">
                        <div className="ub-row-l">
                          <div className="ub-row-t">{w.label}</div>
                          <div className="ub-row-s">Resets {fmtResetAt(w.resetsAt)}</div>
                        </div>
                        <UsageBar pct={w.pctUsed} />
                        <span className="ub-pct">{w.pctUsed}% used</span>
                      </div>
                    ))}
                    <div className="ub-updated">
                      {I.rotateCw} Last updated: {s.lastUpdated ? fmtAgo(s.lastUpdated) : '—'}
                    </div>
                  </>
                )}
              </Panel>
            </div>
          </div>
        </div>
      )}

      {tab === 'limits' && (
        <div className="pj-card">
          <div className="pj-card-h">
            <span className="t">Rate limits by tier</span>
            <span className="s">
              Per plan tier
            </span>
          </div>
          <div className="pj-card-b" style={{ padding: 0 }}>
            <table className="ub-inv ub-rl">
              <thead>
                <tr>
                  <th>Tier</th>
                  <th>Req / min</th>
                  <th>Req / day</th>
                  <th>Tokens / min</th>
                  <th>Tokens / day</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(USAGE_RATE_LIMITS).map(([t, l]) => (
                  <tr key={t} data-cur={t === tier || undefined}>
                    <td>
                      <span
                        className={
                          'rd-chip tone-' + (t === tier ? 'ai' : 'idle')
                        }
                      >
                        {t}
                      </span>
                    </td>
                    <td>{_fmt(l.requestsPerMinute)}</td>
                    <td>{_fmt(l.requestsPerDay)}</td>
                    <td>{_fmt(l.tokensPerMinute)}</td>
                    <td>{_fmt(l.tokensPerDay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div
            className="scaf-note"
            style={{ margin: '12px 16px 16px' }}
          >
            {tier ? (
              <>
                Your organization is on the <b>{tier}</b> tier — weekly limits
                and overage caps are governed (admin/owner, reason-for-change,
                audited).
              </>
            ) : usageState.loading ? (
              <span role="status">Loading your plan tier…</span>
            ) : (
              <>
                Weekly limits and overage caps are governed (admin/owner,
                reason-for-change, audited).
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
