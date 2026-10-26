/**
 * Overview surface — portfolio health KPIs + program grid/list.
 * Ported from Surfaces.jsx > OverviewSurface.
 */

import * as React from 'react';
import { I } from '../icons';
import type { DueTone, HealthKpi, Program } from '../data/programs';
import { AskAnaChip } from './AskAnaChip';
import { ClientReviewZone } from '../components/ClientReviewZone';

import { PATHWAY_LABEL, REGULATORY_PATHWAYS, type RegulatoryPathway } from '../../../../../shared/constants/mdx';
type PathFilter = 'all' | RegulatoryPathway;
type StatusFilter = 'all' | 'active' | 'blocked' | 'idle';

export interface OverviewProps {
  /** Live programs from App.tsx (already adapted to kit shape). */
  programs: Program[];
  onOpenProgram: (p: Program) => void;
  onAskAna: (text: string) => void;
  onNewProject: () => void;
}

/**
 * Live aggregate health KPIs derived from the same source-of-truth program
 * list, so what the user sees in the strip matches what lands in the cards
 * below. An empty list derives an empty-tenant strip.
 */
function deriveLiveHealth(programs: Program[]): HealthKpi[] {
  const total = programs.length;
  const k510 = programs.filter((p) => p.pathway === 'k510').length;
  const pma = programs.filter((p) => p.pathway === 'pma').length;
  const cleared = programs.filter((p) => p.status === 'complete').length;
  const blocked = programs.filter((p) => p.status === 'blocked');
  const inFlight = programs.filter((p) => p.stageIdx >= 5 && p.status !== 'complete').length;
  const measured = programs.map(p => p.readiness).filter((pct): pct is number =>
    typeof pct === 'number' && Number.isFinite(pct));
  const avgReadiness = measured.length
    ? Math.round(measured.reduce((sum, pct) => sum + pct, 0) / measured.length) : null;
  const readinessTone: DueTone = (avgReadiness ?? 0) >= 70 ? 'ok' : (avgReadiness ?? 0) >= 40 ? 'warn' : 'err';
  const blockedMeta = blocked.length === 0
    ? 'None open'
    : blocked
        .slice(0, 3)
        .map((p) => p.code.split(' ')[0] || p.title.split(/\s+/)[0])
        .join(' · ');

  return [
    { label: 'Active projects',      metric: String(total),         meta: `${k510} 510(k) · ${pma} PMA · ${cleared} cleared` },
    { label: 'Average readiness', metric: avgReadiness === null ? 'Not recorded' : String(avgReadiness),
      ...(avgReadiness === null ? {} : { unit: '%', bar: { pct: avgReadiness, tone: readinessTone } }),
      meta: `${measured.length} of ${total} projects measured` },
    { label: 'Blockers open',        metric: String(blocked.length), meta: blockedMeta, tone: blocked.length > 0 ? 'err' : 'ok' },
    { label: 'Submissions in flight',metric: String(inFlight),       meta: 'Stages: assemble · submit' },
  ];
}

export function Overview({ programs: sourcePrograms, onOpenProgram, onAskAna, onNewProject }: OverviewProps) {
  /* Health KPI strip is derived from the SAME source as the cards so the
     two never disagree — including for an empty tenant, whose honest strip
     is "0 programs". The kit's MDX_HEALTH ("Active programs 14 · Down 3 pts vs
     last week") stood in for an empty list, then for sample mode; both are
     gone. */
  const sourceHealth = deriveLiveHealth(sourcePrograms);

  const GRID_THRESHOLD = 12;
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('mdx.viewMode') : null;
  const defaultView: 'grid' | 'list' =
    stored === 'list' || stored === 'grid'
      ? stored
      : sourcePrograms.length > GRID_THRESHOLD
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
      sourcePrograms.filter(
        p =>
          (pathFilter === 'all' || p.pathway === pathFilter) &&
          (statusFilter === 'all' || p.status === statusFilter),
      ),
    [sourcePrograms, pathFilter, statusFilter],
  );

  const counts = React.useMemo(
    () => ({
      all:      sourcePrograms.length,
      byPathway: Object.fromEntries(REGULATORY_PATHWAYS.map(pathway =>
        [pathway, sourcePrograms.filter(p => p.pathway === pathway).length])),
      active:   sourcePrograms.filter(p => p.status === 'active').length,
      blocked:  sourcePrograms.filter(p => p.status === 'blocked').length,
      idle:     sourcePrograms.filter(p => p.status === 'idle').length,
      complete: sourcePrograms.filter(p => p.status === 'complete').length,
    }),
    [sourcePrograms],
  );

  return (
    <>
      <div className="section-hdr">
        <div>
          <div className="section-title">Device portfolio health</div>
          <div className="section-sub">
            {sourcePrograms.length} projects across device pathways
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
        {sourceHealth.map((d, i) => (
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
          <div className="section-title">Projects</div>
          <div className="section-sub">
            {programs.length} of {sourcePrograms.length} shown
          </div>
        </div>
        <button
          className="section-more"
          onClick={onNewProject}
        >
          New project {I.right}
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
          {REGULATORY_PATHWAYS.filter(pathway => counts.byPathway[pathway] > 0 || pathFilter === pathway).map(pathway => (
            <button key={pathway} className="chip" data-on={pathFilter === pathway} onClick={() => setPathFilter(pathway)}>
              {PATHWAY_LABEL[pathway]} <span className="count">{counts.byPathway[pathway]}</span>
            </button>
          ))}
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

      {/* Empty-state takeover. When the live fetch has resolved and this
          tenant has zero programs that match the active filters, surface
          explicit empty-state copy + CTAs rather than rendering the kit
          fixture's example tiles (which would mislead paying clients
          into thinking those programs are theirs). */}
      {sourcePrograms.length === 0 && programs.length === 0 ? (
        <div
          className="empty-state"
        >
          <div className="empty-state-t">
            No projects yet
          </div>
          <div className="empty-state-s">
            Projects you create appear here. Choose the filing and client workspace in New project.
          </div>
          <button
            className="btn primary small"
            onClick={onNewProject}
          >
            {I.plus} Create your first project
          </button>
        </div>
      ) : view === 'grid' ? (
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
                  <span className="r">{p.readiness === null ? 'Not recorded' : `${p.readiness}% ready`}</span>
                </div>
                {p.readiness !== null && <div className="pg-bar">
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
                </div>}
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
            <div>Project</div>
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
                  <span className="pct">{p.readiness === null ? 'Not recorded' : `${p.readiness}%`}</span>
                  {p.readiness !== null && <span className="pg-bar">
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
                  </span>}
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

      {/* Client Review Room (MDX-CLIENT-01): read-first view of the tasks
          the client is allowed to see, grouped by visibility state. The
          endpoint whitelists client-visible states in SQL, so internal
          work never reaches this zone. Org-wide — unified_tasks carries
          no program uuid linkage yet (labelled honestly in the zone). */}
      <ClientReviewZone />
    </>
  );
}
