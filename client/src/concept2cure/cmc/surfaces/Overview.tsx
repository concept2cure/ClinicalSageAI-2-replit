// CMC Module 3 overview — live portfolio RPI cards + Module 3 build-state
// readiness for the selected project. Every value is bound to a live endpoint;
// blocks with no endpoint are omitted rather than faked.

import * as React from 'react';
import { CmcIcon } from '../icons';
import { usePortfolioOverview, useModule3Readiness } from '../../hooks/useCMC';
import type { CmcPortfolioRow } from '../../services/cmcService';
import { CMC_SUGGESTIONS } from '../data/nav';
import { Loading, ErrorState, Empty, NoProject, StatusChip } from './state';

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bp-kpi">
      <div className="bp-kpi-lbl">{label}</div>
      <div className="bp-kpi-val">{value}</div>
      {sub && <div className="bp-kpi-sub">{sub}</div>}
    </div>
  );
}

interface OverviewProps {
  projectId: string | null;
  portfolioRows: CmcPortfolioRow[];
  onAskAna: (text: string) => void;
}

export function CmcOverview({ projectId, portfolioRows, onAskAna }: OverviewProps) {
  const portfolio = usePortfolioOverview();
  const readiness = useModule3Readiness(projectId);

  const rows = portfolio.data ?? portfolioRows;
  const avgRpi = rows.length
    ? Math.round(rows.reduce((a, r) => a + (r.rpi ?? 0), 0) / rows.length)
    : 0;
  const irOverdue = rows.reduce((a, r) => a + (r.ir_overdue ?? 0), 0);
  const m3Missing = rows.reduce((a, r) => a + (r.m3_missing ?? 0), 0);

  const suggestions = CMC_SUGGESTIONS.overview;
  const r = readiness.data;
  const readyPct = r && r.totalSections > 0
    ? Math.round((r.approvedSections / r.totalSections) * 100)
    : 0;
  const readyTone = readyPct >= 80 ? 'ok' : readyPct >= 50 ? 'warn' : 'err';

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">CMC · Module 3 operating system</div>
          <h1 className="bp-title">Module 3 overview</h1>
          <div className="bp-meta">{rows.length} submissions · RPI {avgRpi} average</div>
        </div>
        <div className="bp-page-actions">
          <button className="bp-btn-primary" type="button"
                  onClick={() => onAskAna('Run the ICH compliance check and show every gap')}>
            <CmcIcon name="sparkles" /> Ask AnA
          </button>
        </div>
      </div>

      <div className="bp-od-starters">
        {suggestions.map((s, i) => (
          <button key={i} className="bp-od-starter" type="button" onClick={() => onAskAna(s)}>
            <span className="bp-od-starter-ico"><CmcIcon name="sparkles" /></span>
            {s}
          </button>
        ))}
      </div>

      {/* Portfolio RPI cards */}
      <div className="bp-kpi-row">
        <KpiCard label="Submissions" value={rows.length} sub="across the portfolio" />
        <KpiCard label="RPI average" value={avgRpi} sub="regulatory preparedness index" />
        <KpiCard label="IR overdue" value={irOverdue} sub="information requests" />
        <KpiCard label="Module 3 gaps" value={m3Missing} sub="sections missing" />
      </div>

      {/* Portfolio table */}
      <div className="bp-card">
        <div className="bp-card-head">
          <span>Portfolio</span>
          <span className="bp-meta">{rows.length} submissions</span>
        </div>
        {portfolio.isLoading ? (
          <Loading label="Loading portfolio…" />
        ) : portfolio.isError ? (
          <ErrorState message="Could not load the portfolio overview." />
        ) : rows.length === 0 ? (
          <Empty>No submissions found for your organization.</Empty>
        ) : (
          <table className="bp-table">
            <thead>
              <tr>
                <th>Submission</th>
                <th>Product</th>
                <th>Region</th>
                <th>Type</th>
                <th>RPI</th>
                <th>IR overdue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.sub_id}>
                  <td style={{ fontWeight: 600 }}>{row.sub_id}</td>
                  <td>{row.product_id ?? '—'}</td>
                  <td>{row.region ?? '—'}</td>
                  <td><span className="bp-pill">{row.app_type ?? '—'}</span></td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{row.rpi}</td>
                  <td>{row.ir_overdue ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Module 3 build-state readiness for the selected project */}
      <div className="bp-card" style={{ marginTop: 14 }}>
        <div className="bp-card-head">
          <span>Module 3 build state</span>
          <span className="bp-meta">§3.2.S drug substance · §3.2.P drug product</span>
        </div>
        {!projectId ? (
          <NoProject />
        ) : readiness.isLoading ? (
          <Loading label="Computing readiness…" />
        ) : readiness.isError ? (
          <ErrorState message="Could not compute Module 3 readiness." />
        ) : !r || r.totalSections === 0 ? (
          <Empty>No Module 3 sections built yet for this project.</Empty>
        ) : (
          <div style={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div className="cmc-prog-bar" style={{ flex: 1 }}>
                <div className="cmc-prog-fill" data-tone={readyTone} style={{ width: `${readyPct}%` }} />
              </div>
              <span className="cmc-sec-conv">{readyPct}%</span>
              {r.exportReady
                ? <StatusChip tone="ok" label="Export ready" />
                : <StatusChip tone="warn" label="Not export ready" />}
            </div>
            <div className="bp-meta">
              {r.approvedSections} of {r.totalSections} sections approved
              {r.staleSections > 0 ? ` · ${r.staleSections} stale` : ''}
              {r.openCriticalContradictions > 0
                ? ` · ${r.openCriticalContradictions} open critical contradictions`
                : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
