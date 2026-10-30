/**
 * Rate limits — the request limits the platform enforces, on the usage screen
 * (D2, fold billing Part 2; decision P-68;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-billing/).
 *
 * The usage screen's "Rate limits by tier" tab was a client copy of a server
 * grid nothing enforced (free 10 requests a minute … enterprise 500), with the
 * organisation's tier highlighted in it. What the product applies is
 * server/config/platform-limits.ts, and it is the same for every subscription.
 * GET /api/billing/rate-limits now states exactly that: the Redis limiter's
 * categories on every request, the in-memory limiter on the routes that mount
 * it, and the organisation's tier as recorded or not recorded.
 *
 * Each state is its own branch: loading; a failed or malformed read is
 * "Couldn't load rate limits" with Try again, never an empty table; the limits.
 */
import React, { useState } from 'react';
import { useLiveData, ErrorState, type DataState, type ShapeGuard } from '../dataConnect';

export interface LimitRow {
  category: string;
  label: string;
  windowSeconds: number;
  perSignedInUser: number;
  perAddress: number;
  exemptRoles: string[];
}

export interface RateLimits {
  tier: string | null;
  tierRecorded: boolean;
  sameForEverySubscription: true;
  limits: LimitRow[];
  sharedRouteLimits: { appliesTo: string[]; limits: LimitRow[] };
}

const isRow = (r: unknown): r is LimitRow => {
  if (!r || typeof r !== 'object') return false;
  const v = r as Record<string, unknown>;
  return (
    typeof v.label === 'string' &&
    [v.windowSeconds, v.perSignedInUser, v.perAddress].every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    Array.isArray(v.exemptRoles)
  );
};

/** The route's answer, whole: a 200 is not proof of a shape, and a table with a row missing its numbers is a wrong table. */
export const isRateLimits: ShapeGuard<RateLimits> = (value: unknown): value is RateLimits => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const shared = v.sharedRouteLimits as Record<string, unknown> | undefined;
  return (
    v.sameForEverySubscription === true &&
    typeof v.tierRecorded === 'boolean' &&
    (v.tier === null || typeof v.tier === 'string') &&
    Array.isArray(v.limits) && v.limits.length > 0 && v.limits.every(isRow) &&
    !!shared && Array.isArray(shared.appliesTo) && shared.appliesTo.every((n) => typeof n === 'string') &&
    Array.isArray(shared.limits) && shared.limits.every(isRow)
  );
};

export interface RateLimitsRead {
  state: DataState<RateLimits>;
  retry: () => void;
}

/** Read once on mount, so AnA knows the limits on either tab; Try again reads again. */
export function useRateLimits(): RateLimitsRead {
  const [attempt, setAttempt] = useState(0);
  const state = useLiveData<RateLimits>('/api/billing/rate-limits', ['/api/billing/rate-limits', attempt], isRateLimits);
  return { state, retry: () => setAttempt((a) => a + 1) };
}

/** What AnA reads of the limits, in every state. */
export function rateLimitContext(state: DataState<RateLimits>): { rateLimits: unknown; rateLimitsUnavailable: string | null } {
  if (state.loading) return { rateLimits: null, rateLimitsUnavailable: 'still loading' };
  if (state.error || !state.data) return { rateLimits: null, rateLimitsUnavailable: 'the rate-limit read failed' };
  const d = state.data;
  const rows = (rs: LimitRow[]) =>
    rs.map((r) => ({ label: r.label, perSignedInUser: r.perSignedInUser, perAddress: r.perAddress, windowSeconds: r.windowSeconds, exemptRoles: r.exemptRoles }));
  return {
    rateLimits: {
      sameForEverySubscription: true,
      tier: d.tier,
      tierRecorded: d.tierRecorded,
      limits: rows(d.limits),
      sharedRouteLimits: { appliesTo: d.sharedRouteLimits.appliesTo, limits: rows(d.sharedRouteLimits.limits) },
    },
    rateLimitsUnavailable: null,
  };
}

/** 60 → "1 min", 900 → "15 min", 3600 → "1 hr". */
function fmtWindow(seconds: number): string {
  if (seconds >= 3600 && seconds % 3600 === 0) return seconds / 3600 + ' hr';
  if (seconds >= 60 && seconds % 60 === 0) return seconds / 60 + ' min';
  return seconds + ' s';
}

/** "A", "A and B", "A, B and C". */
function listed(names: string[]): string {
  return names.length <= 1 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

function LimitTable({ rows, label }: { rows: LimitRow[]; label: string }) {
  return (
    <table className="ub-inv" aria-label={label}>
      <thead>
        <tr>
          <th>Requests</th>
          <th>Per signed-in user</th>
          <th>Per address, not signed in</th>
          <th>Window</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.category}>
            <td>{r.label}</td>
            <td>{r.perSignedInUser.toLocaleString('en-US')}</td>
            <td>{r.perAddress.toLocaleString('en-US')}</td>
            <td>{fmtWindow(r.windowSeconds)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RateLimitsBody({ read }: { read: RateLimitsRead }) {
  const { state } = read;
  if (state.loading) {
    return <div role="status" className="scaf-note" style={{ padding: '18px 16px' }}>Loading rate limits…</div>;
  }
  if (state.error || !state.data) {
    return (
      <ErrorState
        title="Couldn't load rate limits"
        message="The limits the platform applies didn't load. Try again, or check the service is reachable."
        retry={read.retry}
      />
    );
  }
  const d = state.data;
  const exempt = d.limits.filter((r) => r.exemptRoles.includes('admin'));
  return (
    <>
      <LimitTable rows={d.limits} label="Rate limits" />
      <div className="scaf-note" style={{ margin: '12px 16px 0' }}>
        {d.tierRecorded && d.tier
          ? `These limits are the same for every subscription, including your organization’s (${d.tier}).`
          : 'Your organization’s subscription tier is not recorded. These limits are the same for every subscription.'}
        {exempt.map((r) => ` Administrators are not limited on ${r.label}.`).join('')}
      </div>
      {d.sharedRouteLimits.appliesTo.length > 0 && (
        <>
          <p className="scaf-note" style={{ margin: '12px 16px 8px' }}>
            {listed(d.sharedRouteLimits.appliesTo)} also count requests against a second limit, shared across them:
          </p>
          <LimitTable rows={d.sharedRouteLimits.limits} label="Second limit on some routes" />
        </>
      )}
    </>
  );
}

export function RateLimitsCard({ read }: { read: RateLimitsRead }) {
  return (
    <div className="pj-card">
      <div className="pj-card-h">
        <span className="t">Rate limits</span>
        <span className="s">The same for every subscription</span>
      </div>
      <div className="pj-card-b" style={{ padding: 0 }}>
        <RateLimitsBody read={read} />
      </div>
      <div className="scaf-note" style={{ margin: '12px 16px 16px' }}>
        Weekly limits and overage caps are governed (admin/owner, reason-for-change, audited).
      </div>
    </div>
  );
}
