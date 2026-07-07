import React, { useState } from 'react';
import { I } from '../icons';
import { SampleTag } from '../dataConnect';
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

/* ── Helpers ── */

function _fmt(n: number): string {
  if (n >= 1000000) return n / 1000000 + 'M';
  if (n >= 1000) return n / 1000 + 'K';
  return String(n);
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

  const rl = USAGE_RATE_LIMITS[TIER];

  const nav = (id: string) => {
    try {
      localStorage.setItem('c2c_open_surface', id);
    } catch (_e) { /* noop */ }
  };

  return (
    <div className="sp" style={{ maxWidth: 1000 }}>
      <SampleTag sample={true} />
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
              <span className="s">{TIER} plan</span>
            </div>
            <div className="pj-card-b">
              <div className="ub-row">
                <div className="ub-row-l">
                  <div className="ub-row-t">Current session</div>
                  <div className="ub-row-s">
                    Resets in {SESSION.resetIn}
                  </div>
                </div>
                <UsageBar pct={SESSION.pctUsed} />
                <span className="ub-pct">{SESSION.pctUsed}% used</span>
              </div>
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
              {WEEKLY.map((w, i) => (
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
                {I.refresh || ''} Last updated: less than a minute ago
              </div>
            </div>
          </div>
          <div className="pj-card">
            <div className="pj-card-h">
              <span className="t">Usage credits</span>
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
                <div className="ub-bal-n">${BALANCE.toFixed(2)}</div>
                <div className="ub-bal-l">Current balance</div>
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
                <div className="ub-row-t">Auto-reload</div>
                <div className="ub-row-s">
                  Top off to ${AUTO_RELOAD_TO} when your balance is $
                  {AUTO_RELOAD_AT}
                </div>
              </div>
              <button className="sp-ask">Manage</button>
            </div>
          </div>
          <div className="pj-card">
            <div className="pj-card-h">
              <span className="t">Invoices</span>
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
                  {INVOICES.map((v, i) => (
                    <tr key={i}>
                      <td>{v.date}</td>
                      <td>
                        ${v.total.toFixed(2)}{' '}
                        <span className="ub-i" title="Invoice detail">
                          {I.info || 'i'}
                        </span>
                      </td>
                      <td>
                        <span className="rd-chip tone-ok">{v.status}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <a className="ub-view">View</a>
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
                  <tr key={t} data-cur={t === TIER || undefined}>
                    <td>
                      <span
                        className={
                          'rd-chip tone-' + (t === TIER ? 'ai' : 'idle')
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
            Your organization is on the <b>{TIER}</b> tier. Weekly limits
            and overage caps are governed (admin/owner, reason-for-change,
            audited).
          </div>
        </div>
      )}
    </div>
  );
}
