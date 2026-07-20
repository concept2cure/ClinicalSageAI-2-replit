import React, { useState } from 'react';
import { I } from '../icons';
import { useLiveData, EmptyState, type DataState } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
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

interface LiveCredits {
  balanceCents: number;
  autoReload: { enabled: boolean; thresholdCents: number; topupCents: number };
}

/* ── Helpers ── */

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

export function UsageBilling({ onAsk, surface }: SurfaceViewProps) {
  const initTab =
    surface && surface.id === 'billing' ? 'billing' : 'usage';
  const [tab, setTab] = useState(initTab);

  // Three org-scoped GETs behind /api/billing (billing-dashboard.ts), each a
  // real DB / Stripe read. No fixtures: every panel renders live data, an
  // honest empty, or an honest error.
  const usageState = useLiveData<LiveUsageSnapshot>('/api/billing/usage/limits');
  const invoicesState = useLiveData<LiveInvoices>('/api/billing/invoices');
  const creditsState = useLiveData<LiveCredits>('/api/billing/credits');
  const snap = usageState.data;

  // Real org tier drives the plan label + the rate-limit table highlight;
  // null while the snapshot is loading or unavailable (no fabricated tier).
  const tier = snap ? snap.plan : null;

  const nav = (id: string) => {
    try {
      localStorage.setItem('c2c_open_surface', id);
    } catch (_e) { /* noop */ }
  };

  return (
    <div className="sp" style={{ maxWidth: 1000 }}>
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">
            Settings {I.dot} /api/billing (dashboard)
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
              >
                {(c) => (
                  <>
                    <div>
                      <div className="ub-bal-n">${(c.balanceCents / 100).toFixed(2)}</div>
                      <div className="ub-bal-l">Current balance</div>
                    </div>
                    <button className="ub-buy">
                      Buy more{' '}
                      <span className="ub-buy-tag">Up to 30% off</span>
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
              >
                {(c) => {
                  const reloadTo = c.autoReload.topupCents / 100;
                  const reloadAt = c.autoReload.thresholdCents / 100;
                  const reloadOff = !c.autoReload.enabled;
                  return (
                    <>
                      <div>
                        <div className="ub-row-t">Auto-reload</div>
                        <div className="ub-row-s">
                          {reloadOff ? 'Off — when enabled, tops off' : 'Top off'} to $
                          {_usd(reloadTo)} when your balance is ${_usd(reloadAt)}
                        </div>
                      </div>
                      <button className="sp-ask">Manage</button>
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
          <div className="pj-card" style={{ marginTop: 14 }}>
            <div className="pj-card-b ub-referral">
              <div className="ub-ref-ic">{I.gift || I.sparkles}</div>
              <div className="ub-ref-b">
                <div className="ub-row-t">Give AnA, get more AnA</div>
                <div className="ub-row-s">
                  Send a colleague a free week. If they subscribe, you both
                  get $10 in usage credits. Terms apply.
                </div>
              </div>
              <button className="sp-ask">
                {I.link || I.copy} Copy link
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'limits' && (
        <div className="pj-card">
          <div className="pj-card-h">
            <span className="t">Rate limits by tier</span>
            <span className="s">
              RATE_LIMITS - billing-dashboard.ts
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
    </div>
  );
}
