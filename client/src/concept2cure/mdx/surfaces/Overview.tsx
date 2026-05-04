/**
 * Overview surface — portfolio health KPIs + program grid/list.
 * Ported from Surfaces.jsx > OverviewSurface.
 */

import * as React from 'react';
import { I } from '../icons';
import { MDX_HEALTH, MDX_PROGRAMS, type Program } from '../data/programs';
import { AskAnaChip } from './AskAnaChip';

const PATHWAY_LABEL = { k510: '510(k)', pma: 'PMA', cer: 'CER' } as const;
type PathFilter = 'all' | 'k510' | 'pma' | 'cer';
type StatusFilter = 'all' | 'active' | 'blocked' | 'idle';

export interface OverviewProps {
  onOpenProgram: (p: Program) => void;
  onAskAna: (text: string) => void;
}

export function Overview({ onOpenProgram, onAskAna }: OverviewProps) {
  const GRID_THRESHOLD = 12;
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('mdx.viewMode') : null;
  const defaultView: 'grid' | 'list' =
    stored === 'list' || stored === 'grid'
      ? stored
      : MDX_PROGRAMS.length > GRID_THRESHOLD
      ? 'list'
      : 'grid';
  const [view, setView] = React.useState<'grid' | 'list'>(defaultView);
  const [pathFilter, setPathFilter] = React.useState<PathFilter>('all');
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all');

  const setViewPersist = (v: 'grid' | 'list') => {
    setView(v);
    if (typeof localStorage !== 'undefined') localStorage.setItem('mdx.viewMode', v);
  };

  const programs = React.useMemo(
    () =>
      MDX_PROGRAMS.filter(
        p =>
          (pathFilter === 'all' || p.pathway === pathFilter) &&
          (statusFilter === 'all' || p.status === statusFilter),
      ),
    [pathFilter, statusFilter],
  );

  const counts = {
    all:      MDX_PROGRAMS.length,
    k510:     MDX_PROGRAMS.filter(p => p.pathway === 'k510').length,
    pma:      MDX_PROGRAMS.filter(p => p.pathway === 'pma').length,
    cer:      MDX_PROGRAMS.filter(p => p.pathway === 'cer').length,
    active:   MDX_PROGRAMS.filter(p => p.status === 'active').length,
    blocked:  MDX_PROGRAMS.filter(p => p.status === 'blocked').length,
    idle:     MDX_PROGRAMS.filter(p => p.status === 'idle').length,
    complete: MDX_PROGRAMS.filter(p => p.status === 'complete').length,
  };

  return (
    <>
      <div className="section-hdr">
        <div>
          <div className="section-title">Device portfolio health</div>
          <div className="section-sub">
            {MDX_PROGRAMS.length} active programs across 510(k), PMA and CER pathways
          </div>
        </div>
        <button
          className="section-more"
          onClick={() =>
            onAskAna('Generate the portfolio readiness report across all MDX programs.')
          }
        >
          Readiness report {I.right}
        </button>
      </div>
      <div className="health">
        {MDX_HEALTH.map((d, i) => (
          <div key={i} className="health-card">
            <div className="health-label">{d.label}</div>
            <div className="health-metric">
              {d.metric}
              {d.unit && <span className="unit">{d.unit}</span>}
            </div>
            {d.bar && (
              <div className="readiness">
                <div
                  className={`readiness-fill ${d.bar.tone || ''}`}
                  style={{ width: `${d.bar.pct}%` }}
                />
              </div>
            )}
            <div className={`health-meta ${d.tone || ''}`}>{d.meta}</div>
          </div>
        ))}
      </div>

      <div className="section-hdr">
        <div>
          <div className="section-title">Programs</div>
          <div className="section-sub">
            {programs.length} of {MDX_PROGRAMS.length} shown
          </div>
        </div>
        <button
          className="section-more"
          onClick={() =>
            onAskAna('Walk me through creating a new MDX program (510(k), PMA, or CER).')
          }
        >
          New program {I.right}
        </button>
      </div>

      <div className="view-toolbar">
        <div className="chipset">
          <span
            style={{
              fontSize: 10,
              color: 'var(--text-400)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginRight: 2,
            }}
          >
            Pathway
          </span>
          <button className="chip" data-on={pathFilter === 'all'} onClick={() => setPathFilter('all')}>
            All <span className="count">{counts.all}</span>
          </button>
          <button className="chip" data-on={pathFilter === 'k510'} onClick={() => setPathFilter('k510')}>
            510(k) <span className="count">{counts.k510}</span>
          </button>
          <button className="chip" data-on={pathFilter === 'pma'} onClick={() => setPathFilter('pma')}>
            PMA <span className="count">{counts.pma}</span>
          </button>
          <button className="chip" data-on={pathFilter === 'cer'} onClick={() => setPathFilter('cer')}>
            CER <span className="count">{counts.cer}</span>
          </button>
        </div>
        <div className="chipset" style={{ marginLeft: 8 }}>
          <span
            style={{
              fontSize: 10,
              color: 'var(--text-400)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginRight: 2,
            }}
          >
            Status
          </span>
          <button className="chip" data-on={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
            All
          </button>
          <button className="chip" data-on={statusFilter === 'active'} onClick={() => setStatusFilter('active')}>
            <span className="status-dot active" /> Active <span className="count">{counts.active}</span>
          </button>
          <button className="chip" data-on={statusFilter === 'blocked'} onClick={() => setStatusFilter('blocked')}>
            <span className="status-dot blocked" /> Blocked <span className="count">{counts.blocked}</span>
          </button>
          <button className="chip" data-on={statusFilter === 'idle'} onClick={() => setStatusFilter('idle')}>
            <span className="status-dot idle" /> Idle <span className="count">{counts.idle}</span>
          </button>
        </div>
        <div className="view-spacer" />
        <div className="view-toggle" role="group" aria-label="View mode">
          <button aria-pressed={view === 'grid'} onClick={() => setViewPersist('grid')} title="Grid view">
            {I.grid} Grid
          </button>
          <button aria-pressed={view === 'list'} onClick={() => setViewPersist('list')} title="List view">
            {I.dots} List
          </button>
        </div>
      </div>

      {view === 'grid' ? (
        <div className="programs">
          {programs.map(p => (
            <button key={p.id} className="pg-card" onClick={() => onOpenProgram(p)}>
              <div className="pg-head">
                <div>
                  <div className="pg-title">{p.title}</div>
                  <div className="pg-code">
                    {p.code} · Lead: {p.lead}
                  </div>
                </div>
                <span className={`status-chip ${p.status}`}>
                  <span className={`status-dot ${p.status}`} /> {p.status}
                </span>
                {onAskAna && (
                  <AskAnaChip
                    onAsk={() => onAskAna(`Summarize status and risks for ${p.title}`)}
                    label={`Ask AnA about ${p.code}`}
                  />
                )}
              </div>
              <div className="pg-stage">
                <div className="pg-stage-label">
                  <span>{p.stage}</span>
                  <span className="r">{p.readiness}% ready</span>
                </div>
                <div className="pg-bar">
                  <div
                    className="pg-bar-fill"
                    style={{
                      width: `${p.readiness}%`,
                      background:
                        p.status === 'blocked'
                          ? 'var(--warning)'
                          : p.status === 'complete'
                          ? 'var(--success)'
                          : 'var(--accent-100)',
                    }}
                  />
                </div>
              </div>
              {p.nextBlocker ? (
                <div className="pg-blocker">
                  <span className="ico">{I.alertCircle}</span>
                  <span className="txt">{p.nextBlocker}</span>
                </div>
              ) : (
                <div
                  className="pg-blocker"
                  style={{ background: 'var(--bg-050)', borderLeftColor: 'var(--success)' }}
                >
                  <span className="ico" style={{ color: 'var(--success)' }}>
                    {I.check}
                  </span>
                  <span className="txt">No open blockers</span>
                </div>
              )}
              <div className="pg-foot">
                <span>{p.meta}</span>
                <div className="pg-owners">
                  {p.owners.map((o, i) => (
                    <span key={i} className="pg-owner">
                      {o}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="pg-list">
          <div className="pg-list-hdr">
            <div>Program</div>
            <div>Pathway</div>
            <div>Stage / Readiness</div>
            <div>Next blocker</div>
            <div>Lead</div>
            <div style={{ textAlign: 'right' }}>Due / Activity</div>
          </div>
          {programs.map(p => (
            <button key={p.id} className="pg-list-row" onClick={() => onOpenProgram(p)}>
              <div>
                <div className="pg-list-title">{p.title}</div>
                <div className="pg-list-sub">{p.code}</div>
              </div>
              <div>
                <span className={`path-chip ${p.pathway}`}>
                  <span className={`status-dot ${p.status}`} /> {PATHWAY_LABEL[p.pathway]}
                </span>
              </div>
              <div className="pg-list-stage">
                <span className="s">{p.stage}</span>
                <span className="r">
                  <span className="pct">{p.readiness}%</span>
                  <span className="pg-bar">
                    <span
                      className="pg-bar-fill"
                      style={{
                        width: `${p.readiness}%`,
                        background:
                          p.status === 'blocked'
                            ? 'var(--warning)'
                            : p.status === 'complete'
                            ? 'var(--success)'
                            : 'var(--accent-100)',
                        display: 'block',
                        height: '100%',
                      }}
                    />
                  </span>
                </span>
              </div>
              <div className={`pg-list-blocker ${p.nextBlocker ? '' : 'none'}`}>
                <span className="ico">{p.nextBlocker ? I.alertCircle : I.check}</span>
                <span className="txt">{p.nextBlocker || 'No open blockers'}</span>
              </div>
              <div className="pg-list-owner">
                {p.lead
                  .split(' ')
                  .map(s => s[0])
                  .join('')}
              </div>
              <div className="pg-list-due">
                <span>{p.dueLabel}</span>
                <span className="act">{p.lastActivity}</span>
                {onAskAna && (
                  <AskAnaChip
                    onAsk={() => onAskAna(`Summarize status and risks for ${p.title}`)}
                    label={`Ask AnA about ${p.code}`}
                  />
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
