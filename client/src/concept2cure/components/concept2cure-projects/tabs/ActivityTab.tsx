/**
 * ActivityTab — 21 CFR Part 11 audit-log viewer.
 * Mirror of design-system/ui_kits/home/ProjectsExtras.jsx
 * (ProjectActivityScreen, lines 53–164).
 */
import { useMemo, useState } from 'react';
import { I } from '../icons';
import { useProjectActivity } from '../data/useProjectActivity';
import type { Project } from '../types';

const PACT_KIND_LABEL: Record<string, string> = {
  export: 'Export',
  file: 'File',
  memory: 'Memory',
  instr: 'Instructions',
  esig: 'E-signature',
  comment: 'Comment',
  lifecycle: 'Lifecycle',
  access: 'Access',
};

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
  const { events, loading } = useProjectActivity(project.id);
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
          <button
            type="button"
            className="prj-btn"
            onClick={() => {
              const headers = ['Timestamp', 'Kind', 'Actor', 'Role', 'Action', 'Target', 'IP', 'E-signature', 'Signature'];
              const rows = filtered.map(e => [
                e.ts, PACT_KIND_LABEL[e.kind] || e.kind, e.actor, e.role, e.action, e.target, e.ip,
                e.e ? 'yes' : 'no', e.sig,
              ]);
              const csv = [headers, ...rows]
                .map(line => line.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
                .join('\r\n');
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-activity-${new Date().toISOString().slice(0, 10)}.csv`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
            }}
          >
            Export CSV
          </button>
          <button
            type="button"
            className="prj-btn"
            onClick={() => {
              const lines = filtered.map(e =>
                `${e.ts}  [${PACT_KIND_LABEL[e.kind] || e.kind}]  ${e.actor} (${e.role}) ${e.action} → ${e.target}  ip=${e.ip}  sig=${e.sig}${e.e ? '  e-sig=yes' : ''}`,
              );
              const w = window.open('', '_blank');
              if (!w) return;
              w.document.write(`<!doctype html><meta charset="utf-8"><title>Activity · ${project.name}</title>`);
              w.document.write('<style>body{font-family:ui-monospace,Menlo,monospace;font-size:11px;line-height:1.5;padding:24px;color:#222}h1{font-size:14px;margin:0 0 16px}pre{white-space:pre-wrap;word-break:break-word;margin:0}</style>');
              w.document.write(`<h1>Activity · ${project.name} · ${new Date().toISOString()}</h1>`);
              w.document.write(`<pre>${lines.map(l => l.replace(/&/g, '&amp;').replace(/</g, '&lt;')).join('\n')}</pre>`);
              w.document.close();
              w.focus();
              w.print();
            }}
          >
            Export PDF
          </button>
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
        {loading && (
          <div className="pact-empty">
            <div className="pact-empty-title">Loading…</div>
          </div>
        )}
        {!loading && byDay.length === 0 && (
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
