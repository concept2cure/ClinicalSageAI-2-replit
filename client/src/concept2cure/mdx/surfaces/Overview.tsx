/**
 * Overview surface — portfolio health KPIs + program grid/list.
 * Ported from Surfaces.jsx > OverviewSurface.
 */

import * as React from 'react';
import { I } from '../icons';
import { MDX_HEALTH, type Program, type DueTone } from '../data/programs';
import { AskAnaChip } from './AskAnaChip';
import { ClientReviewZone } from '../components/ClientReviewZone';

// Must cover every ProgramPathway member (k510 | pma | cer | ivdr); `ivdr` was
// added to the union but not here, so indexing failed (TS7053). Ledger C-22.
const PATHWAY_LABEL = { k510: '510(k)', pma: 'PMA', cer: 'CER', ivdr: 'IVDR' } as const;
type PathFilter = 'all' | 'k510' | 'pma' | 'cer';
type StatusFilter = 'all' | 'active' | 'blocked' | 'idle';

export interface OverviewProps {
  /** Live programs from App.tsx (already adapted to kit shape). */
  programs: Program[];
  onOpenProgram: (p: Program) => void;
  onAskAna: (text: string) => void;
}

/**
 * Live aggregate health KPIs derived from the same source-of-truth program
 * list, so what the user sees in the strip matches what lands in the cards
 * below. Falls back to the kit's MDX_HEALTH constants when the live list
 * is null (loading state — keeps the KPI strip from flashing empty).
 */
function deriveLiveHealth(programs: Program[]): typeof MDX_HEALTH {
  const total = programs.length;
  const k510 = programs.filter((p) => p.pathway === 'k510').length;
  const pma = programs.filter((p) => p.pathway === 'pma').length;
  const cleared = programs.filter((p) => p.status === 'complete').length;
  const blocked = programs.filter((p) => p.status === 'blocked');
  const inFlight = programs.filter((p) => p.stageIdx >= 5 && p.status !== 'complete').length;
  const avgReadiness = total > 0
    ? Math.round(programs.reduce((s, p) => s + p.readiness, 0) / total)
    : 0;
  const readinessTone: DueTone = avgReadiness >= 70 ? 'ok' : avgReadiness >= 40 ? 'warn' : 'err';
  const blockedMeta = blocked.length === 0
    ? 'None open'
    : blocked
        .slice(0, 3)
        .map((p) => p.code.split(' ')[0] || p.title.split(/\s+/)[0])
        .join(' · ');

  return [
    { label: 'Active programs',      metric: String(total),         meta: `${k510} 510(k) · ${pma} PMA · ${cleared} cleared` },
    { label: 'Average readiness',    metric: String(avgReadiness), unit: '%', bar: { pct: avgReadiness, tone: readinessTone }, meta: 'Across MDX portfolio' },
    { label: 'Blockers open',        metric: String(blocked.length), meta: blockedMeta, tone: blocked.length > 0 ? 'err' : 'ok' },
    { label: 'Submissions in flight',metric: String(inFlight),       meta: 'Stages: assemble · submit' },
  ];
}

export function Overview({ programs: sourcePrograms, onOpenProgram, onAskAna }: OverviewProps) {
  /* Health KPI strip is derived from the SAME source as the cards so the
     two never disagree. When the parent passes the kit fixture during the
     initial fetch, MDX_HEALTH renders so the strip doesn't flash empty. */
  const sourceHealth = sourcePrograms.length > 0
    ? deriveLiveHealth(sourcePrograms)
    : MDX_HEALTH;

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
      k510:     sourcePrograms.filter(p => p.pathway === 'k510').length,
      pma:      sourcePrograms.filter(p => p.pathway === 'pma').length,
      cer:      sourcePrograms.filter(p => p.pathway === 'cer').length,
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
            {sourcePrograms.length} active programs across 510(k), PMA and CER pathways
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
          <div className="section-title">Programs</div>
          <div className="section-sub">
            {programs.length} of {sourcePrograms.length} shown
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
            No programs yet
          </div>
          <div className="empty-state-s">
            Programs you create appear here. Start a 510(k), PMA, or CER program from the workflow above.
          </div>
          <button
            className="btn primary small"
            onClick={() =>
              onAskAna('Walk me through creating a new MDX program (510(k), PMA, or CER).')
            }
          >
            {I.plus} Create your first program
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

      {/* Client Review Room (MDX-CLIENT-01): read-first view of the tasks
          the client is allowed to see, grouped by visibility state. The
          endpoint whitelists client-visible states in SQL, so internal
          work never reaches this zone. Org-wide — unified_tasks carries
          no program uuid linkage yet (labelled honestly in the zone). */}
      <ClientReviewZone />
    </>
  );
}
