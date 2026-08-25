/**
 * Codebase Coverage — kit app/coverage.jsx ported (registry id `coverage`,
 * contract-ready: @shared/constants/ui-surface-registry).
 *
 * The whole reconciled surface registry, alive in the UI: every canonical
 * surface, its real mounted API prefixes, AnA tool families, typed contract
 * and honest readiness — cross-referenced against what THIS shell has actually
 * ported (SURFACE_VIEWS) and whether the backend link is live. Doubles as the
 * Phase-3 install/coverage tracker.
 */
import React from 'react';
import {
  UI_SURFACES,
  CROSS_CUTTING_CONCERNS,
  type NavTier,
} from '@shared/constants/ui-surface-registry';
import { I } from '../icons';
import { connected } from '../dataConnect';
import { SURFACE_VIEWS } from '../surfaceViews';
// coverage-v2.css is loaded globally by V2App (shared surface primitives).

const READ: Record<string, { label: string; tone: string }> = {
  'contract-ready': { label: 'Contract-ready', tone: 'ok' },
  'routes-ready': { label: 'Routes-ready', tone: 'ai' },
  'kit-only': { label: 'Kit-only', tone: 'warn' },
  planned: { label: 'Planned', tone: 'idle' },
};
const TIERS: { id: NavTier; label: string }[] = [
  { id: 'global', label: 'Global' },
  { id: 'project', label: 'Project' },
  { id: 'specialist', label: 'Specialist' },
  { id: 'admin', label: 'Admin' },
];

export function CodebaseCoverage({
  onAsk,
  onNav,
}: {
  onAsk: (text: string) => void;
  onNav: (id: string) => void;
}) {
  const reg = UI_SURFACES;
  const isBuilt = (id: string) => Boolean(SURFACE_VIEWS[id]?.component) || id === 'home';
  const open = (id: string) => {
    if (!isBuilt(id)) return;
    onNav(id);
  };
  const [tier, setTier] = React.useState<'all' | NavTier>('all');
  const [q, setQ] = React.useState('');

  const surfaced = reg.filter((s) => isBuilt(s.id)).length;
  const apiConnected = connected();
  const readCounts = React.useMemo(() => {
    const m: Record<string, number> = {};
    reg.forEach((s) => {
      m[s.readiness] = (m[s.readiness] ?? 0) + 1;
    });
    return m;
  }, [reg]);

  const shown = reg.filter((s) => {
    if (tier !== 'all' && s.navTier !== tier) return false;
    if (q) {
      const t = `${s.label} ${s.id} ${s.notes ?? ''} ${s.apiPrefixes.join(' ')}`.toLowerCase();
      if (!t.includes(q.toLowerCase())) return false;
    }
    return true;
  });
  const byTier = TIERS.map((t) => ({ ...t, items: shown.filter((s) => s.navTier === t.id) })).filter(
    (t) => t.items.length
  );

  return (
    <div className="sp cv-page">
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">Install map · surface registry</div>
          <h1 className="sp-title">Codebase coverage</h1>
          <p className="sp-state">
            Every canonical surface in concept2cure-v2, its real mounted API prefixes, AnA tool
            families, typed contract and honest readiness — cross-referenced against what&#39;s ported
            and wired here. This is the single source of truth the product installs against.
          </p>
        </div>
        <button
          type="button"
          className="sp-primary"
          onClick={() =>
            onAsk(
              'Which surfaces are routes-ready but not yet wired to their live endpoints, and what would each need?'
            )
          }
        >
          {I.sparkles} Plan the remaining wiring
        </button>
      </div>

      <div className="cv-kpis">
        <div className="cv-kpi">
          <span className="n">{reg.length}</span>
          <span className="l">Canonical surfaces</span>
        </div>
        <div className="cv-kpi">
          <span className="n cv-n-ok">{surfaced}</span>
          <span className="l">Ported in this shell</span>
        </div>
        <div className="cv-kpi">
          <span className="n">{readCounts['contract-ready'] ?? 0}</span>
          <span className="l">Contract-ready</span>
        </div>
        <div className="cv-kpi">
          <span className="n">{readCounts['routes-ready'] ?? 0}</span>
          <span className="l">Routes-ready</span>
        </div>
        <div className="cv-kpi">
          <span className="n">{(readCounts['kit-only'] ?? 0) + (readCounts['planned'] ?? 0)}</span>
          <span className="l">Kit-only / planned</span>
        </div>
        <div className="cv-kpi">
          <span className={`n ${apiConnected ? 'cv-n-ok' : 'cv-n-idle'}`}>
            {apiConnected ? 'Live' : 'Sample'}
          </span>
          <span className="l">Backend link {apiConnected ? 'connected' : '· fixtures'}</span>
        </div>
      </div>

      <div className="cv-controls">
        <div className="cv-tiers">
          <button
            type="button"
            className={`cv-tier${tier === 'all' ? ' on' : ''}`}
            onClick={() => setTier('all')}
          >
            All
          </button>
          {TIERS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`cv-tier${tier === t.id ? ' on' : ''}`}
              onClick={() => setTier(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          className="cv-search"
          aria-label="Filter capabilities" placeholder="Filter by capability, id, endpoint…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {byTier.map((t) => (
        <div key={t.id} className="cv-sec">
          <div className="cv-sec-h">
            <span className="t">{t.label}</span>
            <span className="s">{t.items.length} surfaces</span>
          </div>
          <div className="cv-grid">
            {t.items.map((s) => {
              const built = isBuilt(s.id);
              const rd = READ[s.readiness] ?? { label: s.readiness, tone: 'idle' };
              return (
                <div key={s.id} className={`cv-card${built ? '' : ' cv-missing'}`}>
                  <div className="cv-card-top">
                    <button
                      type="button"
                      className="cv-card-title"
                      disabled={!built}
                      onClick={() => open(s.id)}
                      title={built ? 'Open surface' : 'Not ported yet'}
                    >
                      {s.label}
                    </button>
                    <span className={`rd-chip tone-${rd.tone}`}>{rd.label}</span>
                  </div>
                  <div className="cv-card-id">
                    {s.id} · {s.group}
                  </div>
                  <div className="cv-eps">
                    {s.apiPrefixes.map((a, i) => (
                      <span key={i} className="cv-ep">
                        {a}
                      </span>
                    ))}
                  </div>
                  {s.notes && <div className="cv-note">{s.notes}</div>}
                  <div className="cv-card-foot">
                    <span className="cv-flags">
                      {built ? (
                        <span className="cv-flag ok">{I.check} Ported</span>
                      ) : (
                        <span className="cv-flag miss">Not built</span>
                      )}
                      {s.sharedContract && (
                        <span className="cv-flag" title={s.sharedContract}>
                          {I.fileText} contract
                        </span>
                      )}
                      {s.discoveryCatalog && (
                        <span className="cv-flag" title={s.discoveryCatalog}>
                          {I.grid} catalog
                        </span>
                      )}
                      {s.anaToolFamilies.length > 0 && (
                        <span className="cv-flag" title={s.anaToolFamilies.join(', ')}>
                          {I.sparkles} {s.anaToolFamilies.length} AnA
                        </span>
                      )}
                    </span>
                    {built && (
                      <button type="button" className="cv-open" onClick={() => open(s.id)}>
                        Open {I.right}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="cv-sec">
        <div className="cv-sec-h">
          <span className="t">Cross-cutting concerns</span>
          <span className="s">app-wide · every surface depends on these</span>
        </div>
        <div className="cv-grid">
          {CROSS_CUTTING_CONCERNS.map((c) => (
            <div key={c.id} className="cv-card">
              <div className="cv-card-top">
                <span className="cv-card-title cv-card-title-static">{c.label}</span>
              </div>
              <div className="cv-eps">
                {c.apiPrefixes.map((a, i) => (
                  <span key={i} className="cv-ep">
                    {a}
                  </span>
                ))}
              </div>
              <div className="cv-note">{c.notes}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
