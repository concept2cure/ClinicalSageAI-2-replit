/**
 * LinkedTab — predicate / parent IND / child NDA / sister CER /
 * referenced artifact relationships, plus dependency-map SVG.
 * Mirror of design-system/ui_kits/home/ProjectsExtras.jsx
 * (ProjectLinkedScreen, lines 195–295).
 */
import { useMemo } from 'react';
import { I } from '../icons';
import { PLNK_LINKS, PLNK_KIND_META } from '../data';
import type { Project } from '../types';

interface Props {
  project: Project;
}

export function LinkedTab({ project }: Props) {
  const links = PLNK_LINKS[project.id] || [];
  const groups = useMemo(() => {
    const g: Record<string, typeof links> = {};
    for (const l of links) (g[l.kind] = g[l.kind] || []).push(l);
    return Object.entries(g);
  }, [links]);

  return (
    <div className="plnk" data-screen-label={`Linked · ${project.name}`}>
      <header className="plnk-head">
        <div>
          <div className="plnk-eyebrow">Linked projects</div>
          <h2 className="plnk-title">What this project depends on, and what depends on it</h2>
          <p className="plnk-sub">
            Predicates, parent submissions, sister applications, and referenced artifacts. Claude follows these links when reasoning across submissions.
          </p>
        </div>
        <div className="plnk-head-r">
          <button type="button" className="prj-btn primary">{I.plus} Link project</button>
        </div>
      </header>

      {links.length === 0 && (
        <div className="plnk-empty">
          <div className="plnk-empty-ico">{I.beaker}</div>
          <div className="plnk-empty-title">No linked projects yet</div>
          <div className="plnk-empty-sub">
            Link a predicate device, a parent IND, or a sister submission to share context. Claude will pull memory from linked projects when relevant.
          </div>
          <button type="button" className="prj-btn primary">{I.plus} Link a project</button>
        </div>
      )}

      {groups.map(([kind, items]) => {
        const meta = PLNK_KIND_META[kind as keyof typeof PLNK_KIND_META] || { label: kind, hint: '' };
        return (
          <section key={kind} className="plnk-group">
            <header className="plnk-group-h">
              <div>
                <div className="plnk-group-name">{meta.label}</div>
                <div className="plnk-group-hint">{meta.hint}</div>
              </div>
              <span className="plnk-group-c">{items.length}</span>
            </header>
            <ul className="plnk-list">
              {items.map(l => (
                <li key={l.id} className="plnk-row" data-dir={l.dir}>
                  <span className="plnk-arrow" title={l.dir === 'in' ? 'Incoming' : 'Outgoing'}>
                    {l.dir === 'in' ? '↓' : '↑'}
                  </span>
                  <div className="plnk-body">
                    <div className="plnk-name-row">
                      <span className="plnk-name">{l.otherName}</span>
                      <span className="plnk-type-pill">{l.otherType}</span>
                      <span className={`plnk-status-pill is-${l.status}`}>
                        {l.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="plnk-via">{l.via} · linked {l.date}</div>
                  </div>
                  <div className="plnk-row-actions">
                    <button type="button" className="prj-btn" title="Open linked project">Open</button>
                    <button type="button" className="prj-icon-btn" title="Unlink">{I.close}</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {links.length > 0 && (
        <div className="plnk-graph">
          <div className="plnk-graph-h">Dependency map</div>
          <svg
            className="plnk-graph-svg"
            viewBox="0 0 800 200"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
          >
            <defs>
              <marker id="plnk-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
              </marker>
            </defs>
            <g>
              <rect x="320" y="80" width="160" height="40" rx="6" fill="var(--bg-100)" stroke="var(--text-100)" />
              <text x="400" y="105" textAnchor="middle" fontSize="11" fill="var(--text-100)">
                {project.name.length > 22 ? project.name.slice(0, 22) + '…' : project.name}
              </text>
            </g>
            {links.slice(0, 6).map((l, i) => {
              const segs = links.slice(0, 6).length;
              const angle = (i / segs) * Math.PI * 2 - Math.PI / 2;
              const cx = 400 + Math.cos(angle) * 220;
              const cy = 100 + Math.sin(angle) * 60;
              const x = Math.max(20, Math.min(680, cx - 70));
              const y = Math.max(10, Math.min(170, cy - 14));
              return (
                <g key={l.id}>
                  <line
                    x1={400}
                    y1={100}
                    x2={x + 70}
                    y2={y + 14}
                    stroke="var(--border)"
                    strokeWidth={1}
                    markerEnd="url(#plnk-arr)"
                    color="var(--text-400)"
                  />
                  <rect x={x} y={y} width={140} height={28} rx={5} fill="var(--bg-000)" stroke="var(--border)" />
                  <text x={x + 70} y={y + 18} textAnchor="middle" fontSize={10} fill="var(--text-200)">
                    {l.otherName.length > 22 ? l.otherName.slice(0, 22) + '…' : l.otherName}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}
