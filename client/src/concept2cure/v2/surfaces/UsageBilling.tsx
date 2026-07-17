import React, { useState } from 'react';
import { I } from '../icons';
import { SampleTag, useLive } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';

/* ── Per-tier rate limits — verbatim from billing-dashboard.ts ── */

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

/* ── Fixture data — sample state grounded in the real shapes ── */

interface WeeklyMetric {
  metric: string;
  pctUsed: number;
  reset: string;
}

interface CreditRow {
  name: string;
  used: number;
  total: number;
}

interface Invoice {
  date: string;
  total: number;
  status: string;
}

const TIER = 'professional';
const SESSION = { pctUsed: 55, resetIn: '2 hr 25 min' };

const WEEKLY: WeeklyMetric[] = [
  { metric: 'All models', pctUsed: 19, reset: 'Sun 8:00 AM' },
  { metric: 'Deep research', pctUsed: 34, reset: 'Sun 8:00 AM' },
  { metric: 'AnA Builder', pctUsed: 12, reset: 'Sun 8:00 AM' },
];

const CREDITS: CreditRow[] = [
  { name: 'Deep-research credits', used: 130, total: 200 },
  { name: 'Builder credits', used: 18, total: 50 },
];

const BALANCE = 20.64;
const AUTO_RELOAD_TO = 25;
const AUTO_RELOAD_AT = 10;

const INVOICES: Invoice[] = [
  { date: 'Jul 1, 2026', total: 16.70, status: 'Paid' },
  { date: 'Jul 1, 2026', total: 17.07, status: 'Paid' },
  { date: 'Jun 30, 2026', total: 17.92, status: 'Paid' },
  { date: 'Jun 25, 2026', total: 220.60, status: 'Paid' },
  { date: 'Jun 24, 2026', total: 16.73, status: 'Paid' },
];

/* ── Live response shapes — what /api/billing actually returns ──
   GET /usage/limits → UsageLimitsSnapshot (services/usage-windows.ts)
   GET /invoices     → { invoices: Stripe projection[] } (billing-dashboard.ts)
   GET /credits      → { balanceCents, ledger, autoReload } (credit-ledger.ts)
   Each parser is a structural fail-closed guard: adopt the response only when
   it carries the exact fields this surface renders; anything else (error
   shape, missing fields, empty list) keeps the honest fixture. */

interface LiveWeeklyBucket {
  label: string;
  pctUsed: number;
  resetsAt: string | null;
}

interface LiveUsageSnapshot {
  plan: string;
  planLabel: string;
  session: { pctUsed: number; resetsAt: string | null; windowHours: number };
  weekly: LiveWeeklyBucket[];
  lastUpdated: string | null;
}

function parseUsageSnapshot(x: unknown): LiveUsageSnapshot | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const s = o.session as Record<string, unknown> | null | undefined;
  if (typeof o.plan !== 'string' || !s || typeof s !== 'object') return null;
  if (typeof s.pctUsed !== 'number') return null;
  if (!Array.isArray(o.weekly) || o.weekly.length === 0) return null;
  const weekly: LiveWeeklyBucket[] = [];
  for (const w of o.weekly) {
    if (!w || typeof w !== 'object') return null;
    const b = w as Record<string, unknown>;
    if (typeof b.label !== 'string' || typeof b.pctUsed !== 'number') return null;
    weekly.push({
      label: b.label,
      pctUsed: b.pctUsed,
      resetsAt: typeof b.resetsAt === 'string' ? b.resetsAt : null,
    });
  }
  return {
    plan: o.plan,
    planLabel: typeof o.planLabel === 'string' ? o.planLabel : o.plan,
    session: {
      pctUsed: s.pctUsed,
      resetsAt: typeof s.resetsAt === 'string' ? s.resetsAt : null,
      windowHours: typeof s.windowHours === 'number' ? s.windowHours : 5,
    },
    weekly,
    lastUpdated: typeof o.lastUpdated === 'string' ? o.lastUpdated : null,
  };
}

interface LiveInvoice {
  date: string | null;
  amount: number;
  status: string;
  number: string | null;
  url: string | null;
  currency: string | null;
}

function parseInvoices(x: unknown): LiveInvoice[] | null {
  if (!x || typeof x !== 'object') return null;
  const list = (x as { invoices?: unknown }).invoices;
  // An empty live list fails closed to the fixture (mirrors useLiveList:
  // nothing to show → keep the sample so the surface isn't blank).
  if (!Array.isArray(list) || list.length === 0) return null;
  const rows: LiveInvoice[] = [];
  for (const it of list) {
    if (!it || typeof it !== 'object') return null;
    const r = it as Record<string, unknown>;
    if (typeof r.amount !== 'number' || typeof r.status !== 'string') return null;
    rows.push({
      date: typeof r.date === 'string' ? r.date : null,
      amount: r.amount,
      status: r.status,
      number: typeof r.number === 'string' ? r.number : null,
      url: typeof r.hostedUrl === 'string' ? r.hostedUrl : typeof r.pdfUrl === 'string' ? r.pdfUrl : null,
      currency: typeof r.currency === 'string' ? r.currency : null,
    });
  }
  return rows;
}

interface LiveCredits {
  balanceCents: number;
  autoReload: { enabled: boolean; thresholdCents: number; topupCents: number };
}

function parseCredits(x: unknown): LiveCredits | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (typeof o.balanceCents !== 'number') return null;
  const ar = o.autoReload as Record<string, unknown> | null | undefined;
  if (!ar || typeof ar !== 'object') return null;
  if (typeof ar.thresholdCents !== 'number' || typeof ar.topupCents !== 'number') return null;
  return {
    balanceCents: o.balanceCents,
    autoReload: {
      enabled: ar.enabled === true,
      thresholdCents: ar.thresholdCents,
      topupCents: ar.topupCents,
    },
  };
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

/** ISO → "Jul 1, 2026" (the fixture's invoice-date display shape). */
function fmtDay(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** ISO → "Sun 8:00 AM" (weekly reset display shape). */
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

interface InvoiceRowDisplay {
  date: string;
  total: string;
  status: string;
  tone: string;
  url: string | null;
  number: string | null;
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

/* ── Usage & billing surface ──
   Shared by both `usage` and `billing` registry IDs (the kit registers
   both pointing to this component). The `surface.id` prop selects the
   initial tab. */

export function UsageBilling({ onAsk, surface }: SurfaceViewProps) {
  const initTab =
    surface && surface.id === 'billing' ? 'billing' : 'usage';
  const [tab, setTab] = useState(initTab);

  // live ?? fixture, per panel (fail-closed): three org-scoped GETs behind
  // /api/billing (billing-dashboard.ts). Each panel adopts only a response
  // that structurally matches what it renders and wears its own honesty
  // pill — mixed states stay truthful (GAP RULE: never present fabricated
  // data as live).
  const limitsRaw = useLive<unknown>('/api/billing/usage/limits', null);
  const invoicesRaw = useLive<unknown>('/api/billing/invoices', null);
  const creditsRaw = useLive<unknown>('/api/billing/credits', null);
  const snap = limitsRaw.sample ? null : parseUsageSnapshot(limitsRaw.data);
  const liveInvoices = invoicesRaw.sample ? null : parseInvoices(invoicesRaw.data);
  const credits = creditsRaw.sample ? null : parseCredits(creditsRaw.data);
  const usageSample = snap === null;
  const invoicesSample = liveInvoices === null;
  const creditsSample = credits === null;

  // plan/tier: drives the plan label + the rate-limit table highlight
  const tier = snap ? snap.plan : TIER;
  const tierLabel = snap ? snap.planLabel : TIER;

  // session bucket: % used + reset line derived from the real window
  const sessionPct = snap ? snap.session.pctUsed : SESSION.pctUsed;
  const sessionResetIn = snap ? fmtResetIn(snap.session.resetsAt) : SESSION.resetIn;
  const sessionResetLine =
    snap && !sessionResetIn
      ? 'No active session — a new ' + snap.session.windowHours + '-hour window starts on first use'
      : 'Resets in ' + sessionResetIn;

  // weekly buckets: label→metric, pctUsed, resetsAt→reset
  const weekly: WeeklyMetric[] = snap
    ? snap.weekly.map((w) => ({ metric: w.label, pctUsed: w.pctUsed, reset: fmtResetAt(w.resetsAt) }))
    : WEEKLY;
  const updatedLine = snap && snap.lastUpdated ? fmtAgo(snap.lastUpdated) : 'less than a minute ago';

  // credit ledger: balance + auto-reload settings
  const balance = credits ? credits.balanceCents / 100 : BALANCE;
  const reloadTo = credits ? credits.autoReload.topupCents / 100 : AUTO_RELOAD_TO;
  const reloadAt = credits ? credits.autoReload.thresholdCents / 100 : AUTO_RELOAD_AT;
  const reloadOff = credits !== null && !credits.autoReload.enabled;

  // invoices: date→date, amount→total, status→status, hostedUrl→View link
  const invoiceRows: InvoiceRowDisplay[] = liveInvoices
    ? liveInvoices.map((v) => ({
        date: fmtDay(v.date),
        total: fmtMoney(v.amount, v.currency),
        status: _cap(v.status),
        tone: INVOICE_TONE[v.status.toLowerCase()] || 'idle',
        url: v.url,
        number: v.number,
      }))
    : INVOICES.map((v) => ({
        date: v.date,
        total: '$' + v.total.toFixed(2),
        status: v.status,
        tone: INVOICE_TONE[v.status.toLowerCase()] || 'idle',
        url: null,
        number: null,
      }));

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
              <span className="t">
                Plan usage limits <SampleTag sample={usageSample} />
              </span>
              <span className="s">{tierLabel} plan</span>
            </div>
            <div className="pj-card-b">
              <div className="ub-row">
                <div className="ub-row-l">
                  <div className="ub-row-t">Current session</div>
                  <div className="ub-row-s">{sessionResetLine}</div>
                </div>
                <UsageBar pct={sessionPct} />
                <span className="ub-pct">{sessionPct}% used</span>
              </div>
            </div>
          </div>
          <div className="pj-card" style={{ marginBottom: 14 }}>
            <div className="pj-card-h">
              <span className="t">
                Weekly limits <SampleTag sample={usageSample} />
              </span>
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
              {weekly.map((w, i) => (
                <div key={i} className="ub-row">
                  <div className="ub-row-l">
                    <div className="ub-row-t">{w.metric}</div>
                    <div className="ub-row-s">Resets {w.reset}</div>
                  </div>
                  <UsageBar pct={w.pctUsed} />
                  <span className="ub-pct">{w.pctUsed}% used</span>
                </div>
              ))}
              <div className="ub-updated">
                {I.refresh || ''} Last updated: {updatedLine}
              </div>
            </div>
          </div>
          {/* Per-category credit pools (used-of-quota) have no backend
              concept — the credit ledger is one flat balance — so this panel
              stays honestly fixture-backed (fail-closed, never invented). */}
          <div className="pj-card">
            <div className="pj-card-h">
              <span className="t">
                Usage credits <SampleTag sample={true} />
              </span>
              <span className="s">resets monthly</span>
            </div>
            <div className="pj-card-b">
              {CREDITS.map((c, i) => {
                const pct = Math.round((c.used / c.total) * 100);
                return (
                  <div key={i} className="ub-row">
                    <div className="ub-row-l">
                      <div className="ub-row-t">{c.name}</div>
                      <div className="ub-row-s">
                        {c.used} of {c.total} used
                      </div>
                    </div>
                    <UsageBar pct={pct} />
                    <span className="ub-pct">{c.total - c.used} left</span>
                  </div>
                );
              })}
              <div className="cm-pushbar" style={{ marginTop: 12 }}>
                <button
                  className="sp-primary"
                  style={{ padding: '7px 13px' }}
                  onClick={() => setTab('billing')}
                >
                  {I.plus} Buy more credits
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'billing' && (
        <div>
          <div className="pj-card" style={{ marginBottom: 14 }}>
            <div className="pj-card-b ub-balance">
              <div>
                <div className="ub-bal-n">${balance.toFixed(2)}</div>
                <div className="ub-bal-l">
                  Current balance <SampleTag sample={creditsSample} />
                </div>
              </div>
              <button className="ub-buy">
                Buy more{' '}
                <span className="ub-buy-tag">Up to 30% off</span>
              </button>
            </div>
          </div>
          <div className="pj-card" style={{ marginBottom: 14 }}>
            <div className="pj-card-b ub-reload">
              <div>
                <div className="ub-row-t">
                  Auto-reload <SampleTag sample={creditsSample} />
                </div>
                <div className="ub-row-s">
                  {reloadOff ? 'Off — when enabled, tops off' : 'Top off'} to $
                  {_usd(reloadTo)} when your balance is ${_usd(reloadAt)}
                </div>
              </div>
              <button className="sp-ask">Manage</button>
            </div>
          </div>
          <div className="pj-card">
            <div className="pj-card-h">
              <span className="t">
                Invoices <SampleTag sample={invoicesSample} />
              </span>
              <span className="s">Stripe</span>
            </div>
            <div className="pj-card-b" style={{ padding: 0 }}>
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
                  {invoiceRows.map((v, i) => (
                    <tr key={i}>
                      <td>{v.date}</td>
                      <td>
                        {v.total}{' '}
                        <span
                          className="ub-i"
                          title={v.number ? 'Invoice ' + v.number : 'Invoice detail'}
                        >
                          {I.info || 'i'}
                        </span>
                      </td>
                      <td>
                        <span className={'rd-chip tone-' + v.tone}>{v.status}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {v.url ? (
                          <a className="ub-view" href={v.url} target="_blank" rel="noreferrer">
                            View
                          </a>
                        ) : invoicesSample ? (
                          <a className="ub-view">View</a>
                        ) : (
                          <span className="ub-row-s">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
            Your organization is on the <b>{tier}</b> tier{' '}
            <SampleTag sample={usageSample} /> — weekly limits and overage
            caps are governed (admin/owner, reason-for-change, audited).
          </div>
        </div>
      )}
    </div>
  );
}
