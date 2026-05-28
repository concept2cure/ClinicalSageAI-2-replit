// Biopharma Overview — port of ui_kits/biopharma/surfaces.jsx BiopharmaOverview.
// Shows portfolio KPIs + program table + suggestions.

import * as React from 'react';
import { BioIcon } from '../icons';
import type { BiopharmaProgram } from '../data/programs';

const STATUS_TONE: Record<string, string> = {
  active:   'ok',
  blocked:  'err',
  complete: 'ok',
  inactive: 'dim',
};

function ReadinessBar({ pct }: { pct: number }) {
  const tone = pct >= 80 ? 'ok' : pct >= 50 ? 'warn' : 'err';
  return (
    <div className="bp-prog-bar" title={`${pct}% ready`}>
      <div className="bp-prog-fill" data-tone={tone} style={{ width: `${pct}%` }} />
    </div>
  );
}

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
  programs:  BiopharmaProgram[];
  onAskAna:  (text: string) => void;
  loading?:  boolean;
}

export function BiopharmaOverview({ programs, onAskAna, loading }: OverviewProps) {
  const active   = programs.filter(p => p.status === 'active').length;
  const ready    = programs.filter(p => (p.completion_percentage ?? 0) >= 80).length;
  const blocked  = programs.filter(p => p.status === 'blocked').length;
  const avgReady = programs.length
    ? Math.round(programs.reduce((a, p) => a + (p.completion_percentage ?? 0), 0) / programs.length)
    : 0;

  const suggestions = [
    'Find biopharma precedents for breakthrough designation',
    'Generate cross-portfolio readiness report',
    'Flag filing risks for the next 90 days',
  ];

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">Biopharma portfolio</div>
          <h1 className="bp-title">Overview</h1>
          <div className="bp-meta">{programs.length} programs · {active} active</div>
        </div>
        <div className="bp-page-actions">
          <button className="bp-btn-primary" type="button" onClick={() => onAskAna('Generate cross-portfolio readiness report')}>
            <BioIcon name="sparkles" /> Ask AnA
          </button>
        </div>
      </div>

      {/* Suggestion starters */}
      <div className="bp-od-starters">
        {suggestions.map((s, i) => (
          <button key={i} className="bp-od-starter" type="button" onClick={() => onAskAna(s)}>
            <span className="bp-od-starter-ico"><BioIcon name="sparkles" /></span>
            {s}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="bp-kpi-row">
        <KpiCard label="Active programs"      value={active}   sub={`${programs.length} total`} />
        <KpiCard label="Portfolio readiness"  value={`${avgReady}%`} sub={`${ready} at 80%+`} />
        <KpiCard label="Blocked"              value={blocked}  sub="require attention" />
        <KpiCard label="Programs"             value={programs.length} sub="across IND, NDA, BLA, MAA" />
      </div>

      {/* Program table */}
      <div className="bp-card">
        <div className="bp-card-head">
          <span>Portfolio</span>
          <span className="bp-meta">{programs.length} programs</span>
        </div>
        {loading ? (
          <div className="bp-empty">Loading programs…</div>
        ) : programs.length === 0 ? (
          <div className="bp-empty">No biopharma programs found for your organization.</div>
        ) : (
          <table className="bp-table">
            <thead>
              <tr>
                <th>Program</th>
                <th>Type</th>
                <th>Status</th>
                <th>Agency</th>
                <th>Readiness</th>
                <th>PDUFA</th>
              </tr>
            </thead>
            <tbody>
              {programs.map(p => (
                <tr key={p.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{p.code ?? p.name}</div>
                    <div className="bp-meta">{p.lead_indication}</div>
                  </td>
                  <td><span className="bp-pill">{p.program_type}</span></td>
                  <td>
                    <span className={`bp-dot-pill`} data-tone={STATUS_TONE[p.status ?? ''] ?? 'dim'}>
                      <span className="dot" />{p.status ?? '—'}
                    </span>
                  </td>
                  <td>{(p.target_agencies ?? []).join(', ') || '—'}</td>
                  <td style={{ minWidth: 120 }}>
                    <ReadinessBar pct={p.completion_percentage ?? 0} />
                    <span className="bp-meta">{p.completion_percentage ?? 0}%</span>
                  </td>
                  <td className="bp-meta">{p.pdufa_date ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
