/**
 * Pyramid analytics — resource allocation / document coverage / critical
 * path — plus the read-only global-submissions browser (kit
 * app/pyramid-analytics.jsx). Rendered as the "Analytics" and "Global
 * submissions" tabs of the Pyramid surface (./Pyramid).
 */
import React, { useState } from 'react';
import { I } from '../icons';
import {
  PY_ROLES, PY_STATUS, pyResources, pyCoverage,
  type PyPyramid, type PyGlobalConfig,
} from '../fixtures/pyramid-data';
import '../styles/pyramid-v2.css';

/** Resources · document coverage · critical path. */
export function PyAnalytics({ pyr, onTask }: { pyr: PyPyramid; onTask: (id: string) => void }) {
  const res = pyResources(pyr);
  const cov = pyCoverage(pyr);
  const maxRem = Math.max(...res.map((r) => r.remaining), 1);
  const crit = pyr.tasks.filter((t) => t.critical);
  const mods: Record<string, typeof cov> = {};
  cov.forEach((c) => {
    const m = (c.section.match(/M(\d)/) || [])[1] || '—';
    (mods[m] = mods[m] || []).push(c);
  });

  return (
    <div className="py-ana">
      <div className="py-ana-cols">
        <div className="py-card">
          <div className="py-card-h">
            Resource allocation
            <span className="py-card-sub">getResourceAllocation · remaining hours vs 320h capacity</span>
          </div>
          <div className="py-res">
            {res.map((r) => (
              <div key={r.role} className="py-res-row" data-over={r.overloaded || undefined}>
                <span className="k">{PY_ROLES[r.role] || r.role}</span>
                <span className="bar"><span style={{ width: `${(r.remaining / maxRem) * 100}%` }} /></span>
                <span className="v mono">{r.remaining}h</span>
                {r.overloaded ? <span className="py-over">{I.alertTriangle}overloaded</span> : <span className="py-over ok">ok</span>}
              </div>
            ))}
          </div>
          <div className="py-ana-note">Bottleneck check: a role whose remaining task-hours exceed its window capacity is flagged — rebalance assignments or extend the timeline before it becomes the critical path.</div>
        </div>

        <div className="py-card">
          <div className="py-card-h">
            Document coverage
            <span className="py-card-sub">getDocumentCoverage · CTD sections × task completion</span>
          </div>
          <div className="py-cov">
            {Object.keys(mods).sort().map((m) => (
              <div key={m} className="py-cov-mod">
                <div className="py-cov-mod-l">Module {m}</div>
                <div className="py-cov-rows">
                  {mods[m].map((c) => (
                    <div key={c.section} className="py-cov-row">
                      <span className="mono sec">{c.section}</span>
                      <span className="bar"><span data-pc={c.pct === 100 ? 2 : c.pct > 0 ? 1 : 0} style={{ width: `${Math.max(c.pct, 4)}%` }} /></span>
                      <span className="v mono">{c.pct}%</span>
                      <span className="n">{c.tasks.length} task{c.tasks.length > 1 ? 's' : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="py-card" style={{ marginTop: 14 }}>
        <div className="py-card-h">
          Critical path
          <span className="py-card-sub">getCriticalPath · the dependency chain that gates dispatch</span>
        </div>
        <div className="py-cp">
          {crit.map((t, i) => (
            <React.Fragment key={t.id}>
              <button className="py-cp-node" data-st={t.status} onClick={() => onTask(t.id)} title={`${t.name} — ${PY_STATUS[t.status]?.l}`}>
                <span className="dot" />
                <span className="t">{t.name}</span>
                <span className="m">{PY_STATUS[t.status]?.l} · {t.hours}h</span>
              </button>
              {i < crit.length - 1 && <span className="py-cp-arrow">{I.chevRight}</span>}
            </React.Fragment>
          ))}
        </div>
        <div className="py-ana-note">Tasks marked critical form the longest dependency chain to submission. Deprioritizing any of these moves the filing date one-for-one.</div>
      </div>
    </div>
  );
}

/** Read-only global-submissions browser (region filter + pyramid cards). */
export function PyGlobal({ globals }: { globals: PyGlobalConfig[] }) {
  const [region, setRegion] = useState('all');
  const regions = ['all', 'Americas', 'Europe', 'Asia-Pacific'];
  const shown = globals.filter((g) => region === 'all' || g.region === region);
  return (
    <div>
      <div className="rbm-bar">
        <div className="rbm-filters">
          {regions.map((r) => (
            <button key={r} className="rbm-filter" data-on={region === r || undefined} onClick={() => setRegion(r)}>{r === 'all' ? 'All regions' : r}</button>
          ))}
        </div>
        <span className="rbm-bar-info">{globals.length} configurations · normalized to the engine task model</span>
      </div>
      <div className="py-glob-grid">
        {shown.map((g) => (
          <div key={g.type} className="py-glob">
            <div className="py-glob-h">
              <span className="py-type-id">{g.type}</span>
              <span className="py-glob-fmt mono">{g.format}</span>
            </div>
            <div className="py-glob-agency">{g.agency}</div>
            <div className="py-glob-m">{g.region} · ~{g.days} days · {g.tasks} tasks</div>
            <div className="py-glob-l">Local requirements</div>
            <ul>{g.local.map((l, i) => <li key={i}>{l}</li>)}</ul>
          </div>
        ))}
      </div>
      <div className="rbm-note">{I.info}Global pyramids are read-only agency configurations (title · level · assignedRole) normalized into the same rendering model as engine pyramids. Sequencing strategy lives in Registrations → reliance pathways.</div>
    </div>
  );
}
