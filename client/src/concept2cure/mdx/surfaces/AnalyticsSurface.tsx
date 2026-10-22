/**
 * AnalyticsSurface — HYBRID (per PHASE_4_INSTALL.md §1.1).
 *
 * Portfolio counts and submission pace use tenant data. Cohorts and per-tool
 * acceptance remain explicitly unavailable until authoritative sources exist.
 * Saved reports read the canonical Reporting register and exact run viewer.
 *
 * Cross-program surface. Port basis:
 * ui_kits/mdx/surfaces/Analytics.jsx.
 */

import * as React from 'react';
import { I } from '../icons';
import { AnalyticsReportLibrary } from '../components/AnalyticsReportLibrary';
import { useAnalytics, type AnalyticsPathway } from '../hooks/useAnalytics';

export interface AnalyticsSurfaceProps {
  onAskAna: (text: string, opts?: { tool?: string }) => void;
}

const PATHWAYS: ReadonlyArray<{ id: AnalyticsPathway; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'k510', label: '510(k)' },
  { id: 'pma', label: 'PMA' },
  { id: 'cer', label: 'CER' },
];

export function AnalyticsSurface({ onAskAna }: AnalyticsSurfaceProps) {
  const pathway: AnalyticsPathway = 'all';
  const live = useAnalytics(pathway);
  const kpis = live.kpis ?? [];
  const phases = live.phases ?? [];
  const blockers = live.blockers ?? [];
  const reviewers = live.reviewers ?? [];
  const usage = live.anaUsage ?? [];
  const pace = live.pace24m ?? [];
  const metricsUnavailable = live.error || (!live.loading && live.kpis === null);
  const showMetrics = !live.loading && !metricsUnavailable;
  const totalSubmitted = pace.reduce((s, n) => s + n, 0);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Intelligence</div>
          <h1 className="page-title">Analytics</h1>
          <div className="page-sub">
            Portfolio counts, submission history and saved reports. Missing
            metric sources are identified below. Read-only.
          </div>
        </div>
        <div className="page-actions">
          <div className="seg small">
            {PATHWAYS.map((p) => (
              <button
                key={p.id}
                className="seg-btn"
                data-on={pathway === p.id || undefined}
                disabled={p.id !== 'all'}
                title={p.id !== 'all' ? 'Pathway-specific aggregates are not available from all current sources.' : undefined}
                type="button"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="section-sub">Pathway filtering is unavailable; these metrics cover the authorized organization.</p>

      <AnalyticsReportLibrary {...live} />
      {live.loading && <p role="status">Loading analytics metrics…</p>}
      {!live.loading && metricsUnavailable && (
        <div role="alert">
          <p>Analytics metrics are unavailable. A required source or its tenant scope could not be verified.</p>
          <button className="btn ghost small" type="button" onClick={live.refresh}>Retry analytics</button>
        </div>
      )}
      {showMetrics && <>

      <div className="metrics-row">
        {kpis.map((k, i) => (
          <div key={i} className="metric-card" data-tone={k.tone ?? ''}>
            <div className="metric-label">{k.label}</div>
            <div className="metric-val">
              {k.metric}
              {k.unit && <span className="unit">{k.unit}</span>}
            </div>
            <div className="metric-meta">{k.meta}</div>
            {k.delta && (
              <div
                className={`anl-delta ${
                  k.delta.startsWith('+')
                    ? 'up'
                    : k.delta.startsWith('-') || k.delta.startsWith('−')
                    ? 'down'
                    : ''
                }`}
              >
                {k.delta.startsWith('+')
                  ? I.trendingUp
                  : k.delta.startsWith('-') || k.delta.startsWith('−')
                  ? I.trendingDown
                  : I.minus}{' '}
                {k.delta}
              </div>
            )}
          </div>
        ))}
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Submission pace</h2>
          <span className="section-sub">
            {totalSubmitted} submitted in last 24 months
          </span>
        </div>
        <div className="anl-pace">
          {pace.map((n, i) => {
            const monthsAgo = pace.length - 1 - i;
            const isThisYear = monthsAgo < 12;
            return (
              <div
                key={i}
                className="anl-pace-col"
                data-thisyear={isThisYear || undefined}
                title={`${monthsAgo} mo ago · ${n} submitted`}
              >
                <div
                  className="anl-pace-bar"
                  style={{ height: `${n * 22 + (n > 0 ? 8 : 0)}px` }}
                >
                  {n > 0 && <span className="anl-pace-n">{n}</span>}
                </div>
                <div className="anl-pace-x">
                  {monthsAgo % 6 === 0 ? `${monthsAgo}m` : ''}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Where the time goes — phase cycle time vs peer median</h2>
          <span className="section-sub">
            Left of axis · faster than peer · Right of axis · slower
          </span>
        </div>
        {phases.length === 0 && <p>Peer cycle-time data is unavailable; no authoritative cohort source is connected.</p>}
        {phases.length > 0 && <div className="anl-phase">
          {phases.map((row, i) => {
            const k510 = row.k510;
            const pma = row.pma;
            const k510Delta = k510.org - k510.peer;
            const pmaDelta = pma.org - pma.peer;
            const maxAbs = 60;
            const k510Mag =
              (Math.min(Math.abs(k510Delta), maxAbs) / maxAbs) * 100;
            const pmaMag =
              (Math.min(Math.abs(pmaDelta), maxAbs) / maxAbs) * 100;
            return (
              <div key={i} className="anl-phase-row">
                <div className="anl-phase-label">{row.phase}</div>
                <div className="anl-phase-bars">
                  {k510.org > 0 && (
                    <div
                      className="anl-phase-track"
                      title={`510(k) — org ${k510.org}d · peer ${k510.peer}d`}
                    >
                      <span className="anl-phase-axis" />
                      <div
                        className={`anl-phase-bar ${k510Delta > 0 ? 'slow' : 'fast'}`}
                        style={{
                          width: `${k510Mag / 2}%`,
                          left:
                            k510Delta > 0 ? '50%' : `${50 - k510Mag / 2}%`,
                        }}
                      />
                      <span className="anl-phase-lbl k510">
                        510(k) · {k510.org}d
                      </span>
                      <span className="anl-phase-peer">
                        peer p50 · {k510.peer}d
                      </span>
                    </div>
                  )}
                  {pma.org > 0 && (
                    <div
                      className="anl-phase-track"
                      title={`PMA — org ${pma.org}d · peer ${pma.peer}d`}
                    >
                      <span className="anl-phase-axis" />
                      <div
                        className={`anl-phase-bar ${pmaDelta > 0 ? 'slow' : 'fast'}`}
                        style={{
                          width: `${pmaMag / 2}%`,
                          left: pmaDelta > 0 ? '50%' : `${50 - pmaMag / 2}%`,
                        }}
                      />
                      <span className="anl-phase-lbl pma">PMA · {pma.org}d</span>
                      <span className="anl-phase-peer">
                        peer p50 · {pma.peer}d
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div className="anl-phase-legend">
            <span className="ll">
              <span className="anl-phase-swatch fast" /> Faster than peer median
            </span>
            <span className="ll">
              <span className="anl-phase-swatch slow" /> Slower than peer median
            </span>
          </div>
        </div>}
      </section>

      <div className="anl-grid">
        <section className="section">
          <div className="section-head">
            <h2>Top blockers · root cause</h2>
            <span className="section-sub">
              Aggregated across portfolio · last 90 days
            </span>
          </div>
          <div className="anl-blockers">
            {blockers.length === 0 && <p>No open blockers were found in the organization registry.</p>}
            {blockers.map((b, i) => (
              <button
                key={i}
                className="anl-blocker"
                onClick={() =>
                  onAskAna(
                    `Pull every program currently blocked on "${b.cause}". Show me the owner, age, and proposed unblock action for each.`,
                  )
                }
                type="button"
              >
                <div className="anl-blocker-head">
                  <span className="anl-blocker-count mono">{b.count}</span>
                  <span className="anl-blocker-cause">{b.cause}</span>
                  {b.trend && <span className={`anl-blocker-trend trend-${b.trend}`}>
                    {b.trend === 'up'
                      ? I.trendingUp
                      : b.trend === 'down'
                      ? I.trendingDown
                      : I.minus}
                  </span>}
                </div>
                <div className="anl-blocker-foot">
                  <span>{b.pathway}</span>
                  <span className="dot-sep" aria-hidden="true">·</span>
                  <span>{b.median === null ? 'Median age not recorded' : `median age ${b.median}d`}</span>
                  <span className="dot-sep" aria-hidden="true">·</span>
                  <span style={{ color: 'var(--text-400)' }}>{b.owner || 'Owner not recorded'}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Reviewer velocity · by product code</h2>
            <span className="section-sub">
              FDA decision days · cohort distribution + our submissions
            </span>
          </div>
          <div className="anl-reviewers">
            {reviewers.length === 0 && <p>FDA reviewer cohort data is unavailable; no authoritative decision corpus is connected.</p>}
            {reviewers.map((r) => {
              const range = r.slowest - r.fastest || 1;
              const orgPos = r.orgMedian > 0 ? ((r.orgMedian - r.fastest) / range) * 100 : null;
              const medianPos = ((r.median - r.fastest) / range) * 100;
              return (
                <button
                  key={r.code}
                  className="anl-reviewer"
                  onClick={() =>
                    onAskAna(
                      `Compare our ${r.code} (${r.name}) submissions against the FDA cohort. Surface specific decisions that explain why we're at ${r.orgMedian || '—'}d vs cohort median ${r.median}d.`,
                    )
                  }
                  type="button"
                >
                  <div className="anl-reviewer-head">
                    <span className="mono small">{r.code}</span>
                    <span className="ctable-strong">{r.name}</span>
                    <span
                      style={{
                        marginLeft: 'auto',
                        color: 'var(--text-400)',
                        fontSize: 12,
                      }}
                    >
                      {r.n} decisions
                    </span>
                  </div>
                  <div className="anl-reviewer-line">
                    <span className="anl-line-fast">{r.fastest}d</span>
                    <div className="anl-line-track">
                      <div className="anl-line-bar" />
                      <div
                        className="anl-line-tick anl-line-median"
                        style={{ left: `${medianPos}%` }}
                        title={`cohort median ${r.median}d`}
                      >
                        <span className="anl-line-tick-lbl">cohort p50</span>
                      </div>
                      {orgPos !== null && (
                        <div
                          className="anl-line-tick anl-line-org"
                          style={{
                            left: `${Math.min(Math.max(orgPos, 0), 100)}%`,
                          }}
                          title={`our median ${r.orgMedian}d`}
                        >
                          <span className="anl-line-tick-lbl">
                            ours · {r.orgMedian}d
                          </span>
                        </div>
                      )}
                    </div>
                    <span className="anl-line-slow">{r.slowest}d</span>
                  </div>
                  <div className="anl-reviewer-foot">
                    <span>
                      cohort first-cycle approval rate · {r.firstCycle}%
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>AnA tool usage · acceptance</h2>
          <span className="section-sub">
            Last 8 weeks · how often AnA&apos;s drafts and traces are accepted
          </span>
        </div>
        <div className="anl-ana">
          {usage.length === 0 && <p>Per-tool acceptance data is unavailable; accepted drafts cannot be attributed to recorded tool calls.</p>}
          {usage.map((u) => {
            const pct = u.calls > 0 ? Math.round((u.accepted / u.calls) * 100) : 0;
            return (
              <div key={u.tool} className="anl-ana-row">
                <div className="anl-ana-tool">
                  <span className="mono small">{u.tool}</span>
                  <span style={{ color: 'var(--text-400)', fontSize: 12 }}>
                    · {u.pathway}
                  </span>
                </div>
                <div className="anl-ana-bar">
                  <div
                    className="anl-ana-bar-fill"
                    style={{ width: `${pct}%` }}
                  />
                  <span className="anl-ana-bar-lbl mono small">
                    {u.accepted}/{u.calls} accepted · {pct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      </>}
    </>
  );
}
