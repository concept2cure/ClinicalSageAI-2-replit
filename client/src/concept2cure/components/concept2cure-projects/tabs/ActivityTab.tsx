/**
 * ActivityTab — 21 CFR Part 11 audit-log viewer.
 * Mirror of design-system/ui_kits/home/ProjectsExtras.jsx
 * (ProjectActivityScreen, lines 53–164).
 */
import { useMemo, useState } from 'react';
import { I } from '../icons';
import { PACT_EVENTS, PACT_KIND_LABEL } from '../data';
import type { Project } from '../types';

interface Props {
  project: Project;
}

const FILTERS = [
  { id: 'all',       label: 'All' },
  { id: 'lifecycle', label: 'Lifecycle' },
  { id: 'file',      label: 'Files' },
  { id: 'memory',    label: 'Memory' },
  { id: 'instr',     label: 'Instructions' },
  { id: 'comment',   label: 'Comments' },
  { id: 'esig',      label: 'E-signatures' },
  { id: 'export',    label: 'Exports' },
  { id: 'access',    label: 'Access' },
] as const;

type FilterId = typeof FILTERS[number]['id'];

export function ActivityTab({ project }: Props) {
  const events = PACT_EVENTS[project.id] || [];
  const [filter, setFilter] = useState<FilterId>('all');
  const [query, setQuery] = useState('');

  const filtered = events.filter(e =>
    (filter === 'all' || e.kind === filter)
    && (!query || (e.action + ' ' + e.target + ' ' + e.actor).toLowerCase().includes(query.toLowerCase())),
  );

  const byDay = useMemo(() => {
    const g: Record<string, typeof filtered> = {};
    for (const e of filtered) {
      const d = e.ts.slice(0, 10);
      (g[d] = g[d] || []).push(e);
    }
    return Object.entries(g);
  }, [filtered]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: events.length };
    for (const e of events) c[e.kind] = (c[e.kind] || 0) + 1;
    return c;
  }, [events]);

  return (
    <div className="pact" data-screen-label={`Activity · ${project.name}`}>
      <header className="pact-head">
        <div>
          <div className="pact-eyebrow">Activity log</div>
          <h2 className="pact-title">Tamper-evident audit trail</h2>
          <p className="pact-sub">
            Every change in this project is recorded with actor, timestamp, IP, and a SHA-256 signature. Append-only and exportable for inspection per 21 CFR Part 11.
          </p>
        </div>
        <div className="pact-head-r">
          <span className="pact-integrity">
            <span className="pact-integrity-dot" />
            Integrity verified
          </span>
          <button type="button" className="prj-btn">Export CSV</button>
          <button type="button" className="prj-btn">Export PDF</button>
        </div>
      </header>

      <div className="pact-toolbar">
        <div className="pact-chips">
          {FILTERS.map(f => (
            <button
              type="button"
              key={f.id}
              className={`pact-chip ${filter === f.id ? 'is-on' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              {counts[f.id] != null && <span className="pact-chip-c">{counts[f.id]}</span>}
            </button>
          ))}
        </div>
        <div className="pact-search">
          <span className="pact-search-ico">{I.search}</span>
          <input
            className="pact-search-input"
            placeholder="Search actor, action, or target…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="pact-list">
        {byDay.length === 0 && (
          <div className="pact-empty">
            <div className="pact-empty-title">No matching events</div>
            <div className="pact-empty-sub">Try a different filter or clear the search.</div>
          </div>
        )}
        {byDay.map(([day, items]) => (
          <section key={day} className="pact-day">
            <header className="pact-day-h">
              <span className="pact-day-d">{day}</span>
              <span className="pact-day-c">
                {items.length} event{items.length === 1 ? '' : 's'}
              </span>
            </header>
            <ul className="pact-rows">
              {items.map((e, i) => (
                <li key={i} className="pact-row" data-kind={e.kind}>
                  <span className="pact-time">{e.ts.slice(11, 19)}Z</span>
                  <span className="pact-kind">{PACT_KIND_LABEL[e.kind] || e.kind}</span>
                  <div className="pact-body">
                    <div className="pact-action">
                      <span className="pact-actor">{e.actor}</span>
                      <span className="pact-actor-role">{e.role}</span>
                      <span className="pact-verb">{e.action}</span>
                    </div>
                    <div className="pact-target">{e.target}</div>
                  </div>
                  <div className="pact-meta">
                    <span className="pact-ip" title="IP address">{e.ip}</span>
                    {e.e && <span className="pact-esig" title="E-signature attached">e-sig</span>}
                    <span className="pact-sig" title="Cryptographic signature">{e.sig}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
