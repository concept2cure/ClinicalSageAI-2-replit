import React, { useMemo, useState } from 'react';
import { I } from '../icons';
import { useLiveData, EmptyState, hasKeys, type DataState, type ShapeGuard } from '../dataConnect';
import { apiCall, apiErrorText } from '../apiCall';
import { C2CToast, useToast } from '../toast';
import { GovernedConfirmDialog } from '../../_shared/components/GovernedConfirmDialog';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import '../styles/project-home-v2.css';

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

/* ── Live response shapes — aligned to the real /api/billing payloads.
   GET /usage/limits → UsageLimitsSnapshot (services/usage-windows.ts)
   GET /invoices     → { invoices: Stripe projection[] } (billing-dashboard.ts)
   GET /credits      → { balanceCents, ledger, autoReload } (credit-ledger.ts)
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

/* Stripe invoice projection (billing-dashboard.ts /invoices). date, status,
   number, and the PDF/hosted URLs come straight from Stripe and are null on
   the wire when absent, so they are nullable and rendered null-safe — never
   fabricated. amount/currency are always present on the projection. */
interface LiveInvoice {
  date: string | null;
  amount: number;
  status: string | null;
  number: string | null;
  hostedUrl: string | null;
  pdfUrl: string | null;
  currency: string | null;
}

interface LiveInvoices {
  invoices: LiveInvoice[];
}

/* Loosely shaped on the wire for the same reason as the usage snapshot: a
   skewed payload can carry a null balance, or no autoReload block at all.
   Both panels guard their own slice and render an honest empty state rather
   than dividing `undefined` by 100 and printing "$NaN". */
interface LiveCredits {
  balanceCents: number | null;
  autoReload: { enabled: boolean; thresholdCents: number; topupCents: number } | null;
}

/* ── Shape guards — a 200 is not proof of a shape ──
   All three panels crashed on a response that was merely plausible. A route
   answering `{ data: [] }` unwraps to a bare `[]`, and `[]` is TRUTHY: it
   walked past Panel's `!state.data` check, matched nothing the panel then
   read, and `c.autoReload.topupCents` threw mid-render — so the user was told
   the surface was broken when the truthful answer, already written three
   lines up, was "we couldn't load this". `{}`, a 200 carrying `{ error }`,
   and a JSON scalar all landed the same way.

   Guarding the fetch routes those into each panel's existing error state.
   The guards check key PRESENCE, not truthiness: a present-but-null field is
   real data ("auto-reload isn't configured yet") and belongs in the panel's
   empty state, so the member-level checks below handle it instead. ── */

/** `{ plan, weekly, … }` — the usage snapshot. Deliberately only the two keys
    that identify it: a partial snapshot missing `session`, or carrying a
    non-array `weekly`, is a real degraded payload each panel already reports
    as its own honest empty, and must not be inflated into a whole-surface
    error. */
const isUsageSnapshot: ShapeGuard<LiveUsageSnapshot> = hasKeys<LiveUsageSnapshot>('plan', 'weekly');

/** `{ balanceCents, autoReload }` — the credit read. */
const isCredits: ShapeGuard<LiveCredits> = hasKeys<LiveCredits>('balanceCents', 'autoReload');

/** `{ invoices: [...] }` — presence isn't enough here: the panel maps over
    `invoices` immediately, so the array itself is the contract. A non-array
    `invoices` is a shape failure, not "no invoices yet", and saying the org
    has no billing history when the payload was malformed is the same lie in
    a quieter voice. */
const isInvoices: ShapeGuard<LiveInvoices> = (value: unknown): value is LiveInvoices => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const rows = (value as { invoices?: unknown }).invoices;
  return Array.isArray(rows) && rows.every((r) => r !== null && typeof r === 'object');
};

/* ── Helpers ── */

/** A cents field from the wire → a real number, or null when the payload
    didn't carry one. `null / 100` is 0, so a missing balance would otherwise
    render as a confident "$0.00". */
function cents(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function _fmt(n: number): string {
  if (n >= 1000000) return n / 1000000 + 'M';
  if (n >= 1000) return n / 1000 + 'K';
  return String(n);
}

/** Stripe invoice status → chip tone (paid good, open/past_due attention). */
const INVOICE_TONE: Record<string, string> = { paid: 'ok', open: 'warn', past_due: 'warn' };

function _cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Dollar figure without trailing .00 noise ("25", "25.50"). */
function _usd(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** ISO → "Jul 1, 2026" (invoice-date display shape); "—" when absent. */
function fmtDay(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

/** Live Stripe amounts carry their real currency — format it honestly. */
function fmtMoney(amount: number, currency: string | null): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: (currency || 'USD').toUpperCase(),
    }).format(amount);
  } catch {
    return '$' + amount.toFixed(2);
  }
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
   free render every data panel uses. `isEmpty` lets a wrapped-object payload
   (e.g. { invoices: [] }) report empty, since the hook only auto-detects
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
    return <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading…</div>;
  }
  if (state.error) {
    return <EmptyState tone="error" icon={I.alertTriangle} title={errorTitle} hint={errorHint} />;
  }
  if (!state.data || (isEmpty ? isEmpty(state.data) : false)) {
    return <EmptyState icon={I.fileText} title={emptyTitle} hint={emptyHint} />;
  }
  return <>{children(state.data)}</>;
}

/* ── Usage & billing surface ──
   Shared by both `usage` and `billing` registry IDs (the kit registers
   both pointing to this component). The `surface.id` prop selects the
   initial tab. */

export function UsageBilling({ onAsk, surface, onNav }: SurfaceViewProps) {
  const initTab =
    surface && surface.id === 'billing' ? 'billing' : 'usage';
  const [tab, setTab] = useState(initTab);

  // Three org-scoped GETs behind /api/billing (billing-dashboard.ts), each a
  // real DB / Stripe read. No fixtures: every panel renders live data, an
  // honest empty, or an honest error.
  const usageState = useLiveData<LiveUsageSnapshot>(
    '/api/billing/usage/limits',
    ['/api/billing/usage/limits'],
    isUsageSnapshot,
  );
  const invoicesState = useLiveData<LiveInvoices>(
    '/api/billing/invoices',
    ['/api/billing/invoices'],
    isInvoices,
  );
  /* Re-read nonce. `useLiveData` re-fetches when its dependency array changes,
     which is how a surface refreshes after a governed write — the same idiom
     MasterLicensing uses. Bumping it is the only honest way to learn the
     resulting auto-reload rule: the server owns it, and this surface must not
     display a rule it inferred rather than received. */
  const [reload, setReload] = useState(0);
  const refreshCredits = () => setReload((n) => n + 1);
  const creditsState = useLiveData<LiveCredits>(
    '/api/billing/credits',
    ['/api/billing/credits', reload],
    isCredits,
  );
  const [toast, fireToast] = useToast();
  /** The auto-reload change awaiting its reason-for-change, or null. The server
   *  requires a reason on this endpoint and audits it verbatim, so the dialog is
   *  not decoration — a PATCH without one can only 400. */
  const [reloadEdit, setReloadEdit] = useState<{ enabled: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  /* Credit top-up goes through Stripe's own portal rather than a bespoke
     purchase screen, because ledger credits move money-equivalent value:
     POST /api/billing/credits/adjust is platform-admin only precisely so a
     tenant cannot self-issue them. The portal is the one place a customer can
     actually put money in. Opened in a new tab so the workspace is not lost. */
  const buyMore = async () => {
    setBusy(true);
    const res = await apiCall<{ portalUrl?: string }>('POST', '/api/billing/portal', {
      returnUrl: window.location.href,
    });
    setBusy(false);
    const url = res.ok ? res.body?.portalUrl : null;
    if (url) {
      window.open(url, '_blank', 'noopener');
      return;
    }
    // No URL back means no portal session was created. Never report one that
    // was not — this button used to do nothing at all, and silently doing
    // nothing while looking successful would be the same defect wearing a
    // handler.
    fireToast(
      res.ok
        ? 'Billing portal did not return a link. Try again shortly.'
        : apiErrorText(res, 'Could not open the billing portal.'),
      'error',
    );
  };

  const saveAutoReload = async ({ reason }: { reason: string }) => {
    const edit = reloadEdit;
    if (!edit) return;
    setReloadEdit(null);
    setBusy(true);
    const res = await apiCall('PUT', '/api/billing/credits/auto-reload', {
      enabled: edit.enabled,
      reason,
    });
    setBusy(false);
    if (!res.ok) {
      // 403 here is the real and common case: the endpoint is admin/owner only.
      fireToast(apiErrorText(res, 'Auto-reload was not changed.'), 'error');
      return;
    }
    fireToast(edit.enabled ? 'Auto-reload is on.' : 'Auto-reload is off.');
    // Only the server knows the resulting rule; re-read rather than assume it.
    refreshCredits();
  };

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

     `surface` is `getSurface(activeId)`, so `surface.id` IS the mounted id.

     Each of the three reads fails independently, and each publishes its own
     state: a balance or an invoice list invented from a failed read would be a
     financial claim about the customer's account. */
  const activeId = surface && surface.id === 'billing' ? 'billing' : 'usage';
  const anaContext = useMemo(() => {
    const inv = invoicesState.data;
    const cr = creditsState.data;
    return {
      summary:
        `Usage and billing, "${tab}" tab. ` +
        (usageState.loading
          ? 'The usage snapshot is still loading.'
          : usageState.error || !snap
            ? 'The usage snapshot could not be read, so no plan or limit figures are on screen — a failure, not a zero.'
            : `Plan "${snap.planLabel}"` +
              (snap.session ? `, session window ${snap.session.pctUsed}% used over ${snap.session.windowHours}h` : '') +
              `, ${(snap.weekly ?? []).length} weekly cap bucket(s).`) +
        ' ' +
        (creditsState.loading
          ? 'Credits are still loading.'
          : creditsState.error || !cr || cr.balanceCents == null
            ? 'The credit balance is unavailable.'
            : `Credit balance ${(cr.balanceCents / 100).toFixed(2)}.`) +
        ' ' +
        (invoicesState.loading
          ? 'Invoices are still loading.'
          : invoicesState.error || !inv
            ? 'The invoice list could not be read.'
            : `${inv.invoices.length} invoice(s).`),
      facts: {
        openTab: tab,
        plan: snap ? { tier: snap.plan, label: snap.planLabel, lastUpdated: snap.lastUpdated } : null,
        planUnavailable: usageState.error ? 'the usage snapshot read failed' : null,
        sessionWindow: snap?.session ?? null,
        weeklyCaps: snap?.weekly ?? null,
        credits: cr && cr.balanceCents != null
          ? { balanceCents: cr.balanceCents, autoReload: cr.autoReload }
          : null,
        creditsUnavailable: creditsState.error ? 'the credits read failed' : null,
        invoices: inv
          ? inv.invoices.slice(0, 10).map((iv) => ({
              number: iv.number, date: iv.date, amount: iv.amount,
              currency: iv.currency, status: iv.status,
            }))
          : null,
        invoicesUnavailable: invoicesState.error ? 'the invoice read failed' : null,
      },
      availableActions: [
        'Switch between the usage and billing tabs',
        'Read plan usage limits, the session window and the weekly caps',
        'Read the credit balance and its auto-reload settings',
        'Open an invoice (hosted page or PDF) from the invoice list',
        'View all plans on the licensing surface',
      ],
    };
  }, [tab, usageState.loading, usageState.error, snap, invoicesState.loading, invoicesState.error, invoicesState.data, creditsState.loading, creditsState.error, creditsState.data]);
  usePublishSurfaceContext('usage', activeId === 'usage' ? anaContext : null);
  usePublishSurfaceContext('billing', activeId === 'billing' ? anaContext : null);

  return (
    <div className="sp" style={{ maxWidth: 1000 }}>
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">
            Settings {I.dot} Billing
          </div>
          <h1 className="sp-title">Usage &amp; billing</h1>
          <p className="sp-state">
            Plan usage limits, weekly caps, usage credits, rate limits,
            balance, auto-reload and invoices — the metering behind your plan.
          </p>
        </div>
        <button className="sp-primary" onClick={() => nav('licensing')}>
          {I.creditCard || I.arrowRight} View all plans
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
          className={'reg-tab' + (tab === 'billing' ? ' on' : '')}
          onClick={() => setTab('billing')}
        >
          Billing
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
              <a
                className="ub-link"
                onClick={() =>
                  onAsk &&
                  onAsk(
                    'Explain how weekly usage limits and overage caps work.',
                  )
                }
              >
                Learn more about usage limits
              </a>
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
                      {I.refresh || ''} Last updated: {s.lastUpdated ? fmtAgo(s.lastUpdated) : '—'}
                    </div>
                  </>
                )}
              </Panel>
            </div>
          </div>
          {/* Per-category credit pools (used-of-quota) have NO backend concept
              — the credit ledger is one flat pooled balance (see the Billing
              tab), never broken out per category (server credit-ledger.ts). An
              honest empty beats a fabricated used-of-quota panel. */}
          <div className="pj-card">
            <div className="pj-card-h">
              <span className="t">Usage credits</span>
              <span className="s">per category</span>
            </div>
            <div className="pj-card-b">
              <EmptyState
                icon={I.info}
                title="Per-category usage credits aren't available yet"
                hint="Credits are tracked as one pooled balance (see the Billing tab). The backend does not yet break credits out into per-category pools."
              />
            </div>
          </div>
        </div>
      )}

      {tab === 'billing' && (
        <div>
          <div className="pj-card" style={{ marginBottom: 14 }}>
            <div className="pj-card-b ub-balance">
              <Panel
                state={creditsState}
                errorTitle="Couldn't load your balance"
                errorHint="The credit balance didn't respond. Sign in and retry, or check the service is reachable."
                emptyTitle="No balance yet"
                // A balance the payload never carried is not a balance of zero.
                isEmpty={(c) => cents(c.balanceCents) === null}
              >
                {(c) => (
                  <>
                    <div>
                      <div className="ub-bal-n">${(cents(c.balanceCents)! / 100).toFixed(2)}</div>
                      <div className="ub-bal-l">Current balance</div>
                    </div>
                    <button className="ub-buy" onClick={buyMore} disabled={busy}>
                      Buy more{' '}
                      {/* The discount claim is gone. Nothing in the product
                          computes or applies it: no volume tier, no coupon, no
                          promotion code reaches Stripe from here. It was a
                          number on a button, and a price claim a customer
                          cannot get is worse than no claim. */}
                    </button>
                  </>
                )}
              </Panel>
            </div>
          </div>
          <div className="pj-card" style={{ marginBottom: 14 }}>
            <div className="pj-card-b ub-reload">
              <Panel
                state={creditsState}
                errorTitle="Couldn't load auto-reload"
                errorHint="The auto-reload settings didn't respond. Sign in and retry, or check the service is reachable."
                emptyTitle="No auto-reload settings yet"
                // This is where the surface died: the shape guard above proves
                // the KEY is there, not that it holds an object — and an org
                // with no auto-reload row is a real state, not an error. So
                // the block is checked here, and a missing one shows the
                // panel's own empty rather than throwing on `.topupCents`.
                isEmpty={(c) =>
                  !c.autoReload ||
                  cents(c.autoReload.topupCents) === null ||
                  cents(c.autoReload.thresholdCents) === null
                }
              >
                {(c) => {
                  const reload = c.autoReload!;
                  const reloadTo = cents(reload.topupCents)! / 100;
                  const reloadAt = cents(reload.thresholdCents)! / 100;
                  const reloadOff = !reload.enabled;
                  return (
                    <>
                      <div>
                        <div className="ub-row-t">Auto-reload</div>
                        <div className="ub-row-s">
                          {reloadOff ? 'Off — when enabled, tops off' : 'Top off'} to $
                          {_usd(reloadTo)} when your balance is ${_usd(reloadAt)}
                        </div>
                      </div>
                      <button
                        className="sp-ask"
                        disabled={busy}
                        onClick={() => setReloadEdit({ enabled: reloadOff })}
                      >
                        {reloadOff ? 'Turn on' : 'Turn off'}
                      </button>
                    </>
                  );
                }}
              </Panel>
            </div>
          </div>
          <div className="pj-card">
            <div className="pj-card-h">
              <span className="t">Invoices</span>
              <span className="s">Stripe</span>
            </div>
            <div className="pj-card-b" style={{ padding: 0 }}>
              <Panel
                state={invoicesState}
                errorTitle="Couldn't load invoices"
                errorHint="Stripe didn't return your invoices. Sign in and retry, or check the billing service is reachable."
                emptyTitle="No invoices yet"
                emptyHint="Invoices from Stripe appear here once your organization has billing activity."
                isEmpty={(d) => d.invoices.length === 0}
              >
                {(d) => (
                  <table className="ub-inv">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Total</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.invoices.map((v, i) => {
                        const url = v.hostedUrl || v.pdfUrl || null;
                        const tone = INVOICE_TONE[(v.status || '').toLowerCase()] || 'idle';
                        return (
                          <tr key={i}>
                            <td>{fmtDay(v.date)}</td>
                            <td>
                              {fmtMoney(v.amount, v.currency)}{' '}
                              <span
                                className="ub-i"
                                title={v.number ? 'Invoice ' + v.number : 'Invoice detail'}
                              >
                                {I.info || 'i'}
                              </span>
                            </td>
                            <td>
                              <span className={'rd-chip tone-' + tone}>{v.status ? _cap(v.status) : '—'}</span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {url ? (
                                <a className="ub-view" href={url} target="_blank" rel="noreferrer">
                                  View
                                </a>
                              ) : (
                                <span className="ub-row-s">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </Panel>
            </div>
          </div>
          {/* THE REFERRAL CARD IS DELETED, not repaired.
              It read "Send a colleague a free week. If they subscribe, you both
              get $10 in usage credits." with a "Copy link" button that had no
              onClick. The button being dead was the smaller half of the problem.

              There is no referral programme behind it — no invite issuance, no
              referral code, no attribution of a signup to a referrer, and no
              path that could credit either account. `POST /credits/adjust` is
              platform-admin only precisely because ledger credits move
              money-equivalent value and tenants may not self-issue them, so
              nothing in the product could honour this even manually.

              A dead button wastes a click. An offer of $10 that the product
              cannot pay is a commitment made to a customer on behalf of a
              programme that does not exist, and no copy edit fixes that — only
              building the programme, or not making the offer. Removed until the
              former. */}
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
              <>Loading your plan tier…</>
            ) : (
              <>
                Weekly limits and overage caps are governed (admin/owner,
                reason-for-change, audited).
              </>
            )}
          </div>
        </div>
      )}

      {reloadEdit && (
        /* The server requires a reason on this endpoint and writes it verbatim
           into the audit trail, so the prompt is the contract, not a courtesy.
           minReason 3 matches the server's floor exactly: stricter would refuse
           writes the platform allows, looser would produce a round trip that
           can only fail. */
        <GovernedConfirmDialog
          open
          action={reloadEdit.enabled ? 'Turn auto-reload on' : 'Turn auto-reload off'}
          target={
            reloadEdit.enabled
              ? 'Credit balance will top up automatically at the configured threshold'
              : 'Credit balance will no longer top up automatically'
          }
          resource="credit auto-reload"
          minReason={3}
          onCancel={() => setReloadEdit(null)}
          onConfirm={saveAutoReload}
        />
      )}
      <C2CToast msg={toast} />
    </div>
  );
}
