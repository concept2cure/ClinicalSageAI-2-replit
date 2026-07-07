import React, { useState, useMemo } from 'react';
import { I } from '../icons';
import {
  getSectionContext,
  SEC_DEFAULT,
  M1_CHECKLISTS,
  M1_STATUS_META,
  M1_MARKETS,
  type SectionContextEntry,
  type HealthMetrics,
  type Recommendation,
  type MarketsMatrix,
  type MarketsMatrixTarget,
  type MarketsMatrixGap,
  type M1ChecklistItem,
} from '../fixtures/editor-health-data';

/* ── Component prop interfaces ─────────────────────────────────────── */

interface SectionData {
  num: string;
  label: string;
  conf?: number;
  status?: string;
  blocker?: string;
  id?: string;
}

interface GovContext {
  errFlags?: number;
  warnFlags?: number;
  wordCount?: number;
  empty?: boolean;
}

interface PreflightResult {
  fails: number;
}

interface PathwayTreeItem {
  id: string;
  status?: string;
  blocker?: string;
  num?: string;
  label?: string;
}

interface PathwayVolume {
  vol: string;
  items?: PathwayTreeItem[];
}

interface Pathway {
  code: string;
  tree?: PathwayVolume[];
}

interface ModuleStats {
  vol: string;
  total: number;
  complete: number;
  review: number;
  draft: number;
  empty: number;
  blockers: number;
  pct: number;
}

interface SectionHealthProps {
  section: SectionData;
  pathway: Pathway;
  govCtx: GovContext;
  preflight: PreflightResult | null;
  onAction?: (action: string) => void;
  onVerb?: (verb: string) => void;
  market?: string;
}

interface DossierReadinessProps {
  pathway: Pathway;
  docMap: Record<string, string>;
  allSecs: SectionData[];
  lang?: string;
}

/* ── SectionHealth -- the reviewer panel ───────────────────────────── */

export function SectionHealth({ section, pathway, govCtx, preflight, onAction, onVerb, market }: SectionHealthProps) {
  const secCtx = useMemo<SectionContextEntry>(() => getSectionContext(section.num), [section.num]);

  const health = useMemo<HealthMetrics>(() => {
    const conf = section.conf || 0.5;
    const readiness = Math.round(conf * 100);
    const contradictions = govCtx.errFlags || 0;
    const warnings = govCtx.warnFlags || 0;
    const missingEvidence = secCtx
      ? Math.max(0, secCtx.evidence.length - Math.floor(conf * secCtx.evidence.length))
      : (conf < 0.7 ? 2 : conf < 0.9 ? 1 : 0);
    const regGaps = preflight ? preflight.fails : 0;
    const wordCount = govCtx.wordCount || 0;
    const isEmpty = !!govCtx.empty;
    return { readiness, contradictions, warnings, missingEvidence, regGaps, wordCount, isEmpty };
  }, [section, govCtx, preflight, secCtx]);

  /* Build recommendations */
  const recommendations = useMemo<Recommendation[]>(() => {
    const recs: Recommendation[] = [];
    if (health.isEmpty) recs.push({ sev: 'err', text: 'Section is empty -- draft from linked evidence', action: 'draft' });
    if (health.contradictions > 0) recs.push({ sev: 'err', text: health.contradictions + ' contradiction' + (health.contradictions > 1 ? 's' : '') + ' -- resolve before review', action: 'contradictions' });
    if (health.regGaps > 0) recs.push({ sev: 'err', text: health.regGaps + ' regulatory gap' + (health.regGaps > 1 ? 's' : '') + ' blocking promotion', action: 'preflight' });
    if (health.missingEvidence > 0) recs.push({ sev: 'warn', text: health.missingEvidence + ' evidence source' + (health.missingEvidence > 1 ? 's' : '') + ' not linked', action: 'sources' });
    if (health.warnings > 0) recs.push({ sev: 'warn', text: health.warnings + ' advisory' + (health.warnings > 1 ? '' : '') + ' -- review recommended', action: 'review' });
    if (secCtx && secCtx !== SEC_DEFAULT) {
      const dIdx = Math.floor((section.conf || 0.5) * (secCtx.deficiencies.length - 1));
      if (health.readiness < 85) recs.push({ sev: 'info', text: secCtx.deficiencies[Math.min(dIdx, secCtx.deficiencies.length - 1)], action: 'gap' });
    }
    if (health.readiness >= 85 && !health.isEmpty && health.contradictions === 0 && health.regGaps === 0)
      recs.push({ sev: 'ok', text: 'Section meets minimum readiness -- eligible for review', action: 'promote_to_review' });
    return recs;
  }, [health, secCtx, section]);

  return (
    <div className="sh">
      {/* Readiness gauge */}
      <div className="sh-gauge">
        <div className="sh-gauge-ring" style={{ '--pct': health.readiness } as React.CSSProperties}>
          <span className="sh-gauge-val">{health.readiness}<small>%</small></span>
        </div>
        <div className="sh-gauge-label">
          <span className="sh-gauge-t">Section readiness</span>
          <span className="sh-gauge-sub">{'§'}{section.num} {'·'} {section.label}</span>
        </div>
      </div>

      {/* Metrics */}
      <div className="sh-metrics">
        <div className="sh-metric" data-sev={health.contradictions > 0 ? 'err' : 'ok'}>
          <span className="sh-metric-v">{health.contradictions}</span>
          <span className="sh-metric-l">Contradictions</span>
        </div>
        <div className="sh-metric" data-sev={health.missingEvidence > 0 ? 'warn' : 'ok'}>
          <span className="sh-metric-v">{health.missingEvidence}</span>
          <span className="sh-metric-l">Missing evidence</span>
        </div>
        <div className="sh-metric" data-sev={health.regGaps > 0 ? 'err' : 'ok'}>
          <span className="sh-metric-v">{health.regGaps}</span>
          <span className="sh-metric-l">Regulatory gaps</span>
        </div>
        <div className="sh-metric" data-sev="info">
          <span className="sh-metric-v">{health.wordCount.toLocaleString()}</span>
          <span className="sh-metric-l">Words</span>
        </div>
      </div>

      {/* Required + evidence */}
      {secCtx && (
        <div className="sh-ctx">
          <div className="sh-ctx-h">Required for {'§'}{section.num} <span className="sh-ctx-type">{secCtx.type}</span></div>
          <div className="sh-ctx-tags">{secCtx.needs.map((n, i) => <span key={i} className="sh-ctx-tag">{n}</span>)}</div>
          <div className="sh-ctx-h" style={{ marginTop: 8 }}>Expected evidence</div>
          <div className="sh-ctx-tags">{secCtx.evidence.map((e, i) => <span key={i} className="sh-ctx-tag ev">{e}</span>)}</div>
        </div>
      )}

      {/* Recommendations */}
      <div className="sh-recs">
        <div className="sh-recs-h">{I.alertTriangle} Recommendations</div>
        {recommendations.length === 0
          ? <div className="sh-rec-empty">{I.check} No issues -- section looks good</div>
          : recommendations.map((r, i) => (
            <button key={i} className="sh-rec" data-sev={r.sev} onClick={() => onAction && onAction(r.action)}>
              <span className="sh-rec-dot" />
              <span className="sh-rec-text">{r.text}</span>
              <span className="sh-rec-arrow">{I.chevRight}</span>
            </button>
          ))
        }
      </div>

      {/* Section-aware contextual actions */}
      <div className="sh-actions">
        <div className="sh-actions-h">{secCtx.type} <span>{'§'}{section.num}</span></div>
        {(secCtx.actions || []).map(a => (
          <button key={a.id} className="sh-action" onClick={() => {
            if (a.verb === 'draft' || a.verb === 'edit') { onVerb && onVerb(a.verb); }
            else { onAction && onAction(a.verb); }
          }}>
            <span className="ico">{I[a.ic] || I.sparkles}</span>
            <div><b>{a.label}</b><span>{a.desc}</span></div>
          </button>
        ))}
      </div>
    </div>
  );
}


/* ── DossierReadiness -- submission-level readiness + cross-market matrix ── */

export function DossierReadiness({ pathway, docMap, allSecs, lang }: DossierReadinessProps) {
  const [tab, setTab] = useState<'module' | 'markets' | 'm1'>('module');
  const [selMkt, setSelMkt] = useState<string | null>(null);
  const tree = pathway.tree || [];
  const MM = (window as unknown as { RCE_MARKETS_MATRIX?: MarketsMatrix }).RCE_MARKETS_MATRIX;

  const modules = useMemo<ModuleStats[]>(() => {
    return tree.map(vol => {
      const items = vol.items || [];
      let total = items.length, complete = 0, review = 0, draft = 0, empty = 0, blockers = 0;
      items.forEach(s => {
        const key = s.id + '::' + (lang || 'en');
        const html = docMap[key] || '';
        const hasContent = html.replace(/<[^>]+>/g, ' ').trim().length > 20;
        const status = s.status || 'draft';
        if (!hasContent) empty++;
        else if (status === 'complete' || status === 'approved') complete++;
        else if (status === 'review') review++;
        else draft++;
        if (s.blocker) blockers++;
      });
      const pct = total > 0 ? Math.round(((complete + review * 0.7 + draft * 0.3) / total) * 100) : 0;
      return { vol: vol.vol, total, complete, review, draft, empty, blockers, pct };
    });
  }, [tree, docMap, lang]);

  const overall = useMemo(() => {
    const totSec = modules.reduce((a, m) => a + m.total, 0);
    const totPct = modules.reduce((a, m) => a + m.pct * m.total, 0);
    const totalBlockers = modules.reduce((a, m) => a + m.blockers, 0);
    return { pct: totSec > 0 ? Math.round(totPct / totSec) : 0, sections: totSec, blockers: totalBlockers };
  }, [modules]);

  const barColor = (pct: number): string => pct >= 85 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--error)';

  return (
    <div className="dr">
      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 12, background: 'var(--bg-100)', borderRadius: 8, padding: 3, border: '1px solid var(--border)' }}>
        <button onClick={() => setTab('module')} style={{ flex: 1, padding: '5px 0', fontSize: 11, fontWeight: tab === 'module' ? 600 : 400, background: tab === 'module' ? 'var(--bg-000)' : 'transparent', border: tab === 'module' ? '1px solid var(--border)' : '1px solid transparent', borderRadius: 6, cursor: 'pointer', color: tab === 'module' ? 'var(--text-100)' : 'var(--text-400)' }}>Modules</button>
        <button onClick={() => setTab('markets')} style={{ flex: 1, padding: '5px 0', fontSize: 11, fontWeight: tab === 'markets' ? 600 : 400, background: tab === 'markets' ? 'var(--bg-000)' : 'transparent', border: tab === 'markets' ? '1px solid var(--border)' : '1px solid transparent', borderRadius: 6, cursor: 'pointer', color: tab === 'markets' ? 'var(--text-100)' : 'var(--text-400)' }}>
          Markets {MM && <span style={{ fontSize: 9, fontWeight: 700, background: 'var(--accent-100)', color: '#fff', borderRadius: 4, padding: '1px 5px', marginLeft: 4 }}>{MM.targets.length}</span>}
        </button>
        <button onClick={() => setTab('m1')} style={{ flex: 1, padding: '5px 0', fontSize: 11, fontWeight: tab === 'm1' ? 600 : 400, background: tab === 'm1' ? 'var(--bg-000)' : 'transparent', border: tab === 'm1' ? '1px solid var(--border)' : '1px solid transparent', borderRadius: 6, cursor: 'pointer', color: tab === 'm1' ? 'var(--text-100)' : 'var(--text-400)' }}>M1 Builder</button>
      </div>

      {tab === 'module' && (
        <>
          <div className="dr-overall">
            <div className="dr-overall-gauge" style={{ '--pct': overall.pct } as React.CSSProperties}>
              <span className="dr-overall-val">{overall.pct}<small>%</small></span>
            </div>
            <div className="dr-overall-info">
              <div className="dr-overall-t">Submission readiness</div>
              <div className="dr-overall-sub">{pathway.code} {'·'} {overall.sections} sections {'·'} {overall.blockers} blocker{overall.blockers === 1 ? '' : 's'}</div>
              <div className="dr-overall-q">{overall.pct >= 85 ? 'Ready for submission review' : overall.pct >= 50 ? 'In progress -- address blockers' : 'Early stage -- significant gaps remain'}</div>
            </div>
          </div>
          <div className="dr-modules">
            <div className="dr-modules-h">Module readiness</div>
            {modules.map((m, i) => (
              <div key={i} className="dr-mod">
                <div className="dr-mod-h">
                  <span className="dr-mod-name">{m.vol}</span>
                  <span className="dr-mod-pct" style={{ color: barColor(m.pct) }}>{m.pct}%</span>
                </div>
                <div className="dr-mod-bar"><div className="dr-mod-fill" style={{ width: m.pct + '%', background: barColor(m.pct) }} /></div>
                <div className="dr-mod-meta">
                  <span>{m.complete} complete</span><span>{m.review} review</span><span>{m.draft} draft</span><span>{m.empty} empty</span>
                  {m.blockers > 0 && <span className="dr-mod-block">{m.blockers} blocker{m.blockers > 1 ? 's' : ''}</span>}
                </div>
              </div>
            ))}
          </div>
          {overall.blockers > 0 && (
            <div className="dr-blockers">
              <div className="dr-blockers-h">{I.alertTriangle} Critical blockers</div>
              {allSecs.filter(s => s.blocker).map((s, i) => (
                <div key={i} className="dr-blocker">
                  <span className="dr-blocker-dot" /><span className="dr-blocker-num">{s.num}</span>
                  <span className="dr-blocker-label">{s.label}</span>
                  <span className="dr-blocker-reason">{s.blocker}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'markets' && MM && (
        <MarketsTab MM={MM} selMkt={selMkt} setSelMkt={setSelMkt} />
      )}

      {tab === 'markets' && !MM && (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-400)', fontSize: 12 }}>No cross-market data loaded for this program.</div>
      )}

      {tab === 'm1' && (
        <M1BuilderPanel />
      )}
    </div>
  );
}


/* ── MarketsTab -- extracted to keep DossierReadiness under budget ── */

function MarketsTab({ MM, selMkt, setSelMkt }: { MM: MarketsMatrix; selMkt: string | null; setSelMkt: (v: string | null) => void }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-400)', marginBottom: 10 }}>{MM.program} {'·'} {MM.targets.length} target markets</div>

      {/* Cross-market matrix */}
      <div style={{ overflowX: 'auto', marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '4px 6px', color: 'var(--text-400)', fontWeight: 500, minWidth: 130 }}>Module</th>
              {MM.targets.map((t: MarketsMatrixTarget) => (
                <th key={t.id} style={{ textAlign: 'center', padding: '4px 4px', color: 'var(--text-300)', fontWeight: 600, fontSize: 10, minWidth: 52 }}>
                  <div>{t.flag}</div>
                  <div>{t.agency}</div>
                  <div style={{ fontWeight: 400, color: 'var(--text-400)' }}>{t.instrument}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MM.modules.map((mod, mi) => (
              <tr key={mi} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 6px' }}>
                  <div style={{ fontSize: 11, fontWeight: 500 }}>{mod.label}</div>
                  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: mod.common ? 'color-mix(in srgb,var(--success) 12%,transparent)' : 'color-mix(in srgb,var(--ai) 10%,transparent)', color: mod.common ? 'var(--success)' : 'var(--ai)', fontWeight: 600 }}>
                    {mod.common ? 'Common · ICH' : 'Market-specific'}
                  </span>
                </td>
                {MM.targets.map((t: MarketsMatrixTarget) => {
                  const pct = mod.markets[t.id] || 0;
                  const col = pct >= 85 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--error)';
                  return (
                    <td key={t.id} style={{ textAlign: 'center', padding: '6px 4px' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: col }}>{pct}%</div>
                      <div style={{ height: 3, background: 'var(--bg-200)', borderRadius: 2, margin: '2px 4px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: pct + '%', background: col, borderRadius: 2 }} />
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Market-specific gap lists */}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-300)', marginBottom: 8 }}>Market-specific gaps</div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
        <button onClick={() => setSelMkt(null)} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)', background: selMkt === null ? 'var(--accent-100)' : 'var(--bg-100)', color: selMkt === null ? '#fff' : 'var(--text-300)', cursor: 'pointer' }}>All</button>
        {MM.targets.map((t: MarketsMatrixTarget) => {
          const gaps = MM.gaps[t.id] || [];
          const errs = gaps.filter((g: MarketsMatrixGap) => g.sev === 'err').length;
          return (
            <button key={t.id} onClick={() => setSelMkt(selMkt === t.id ? null : t.id)} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)', background: selMkt === t.id ? 'var(--accent-100)' : 'var(--bg-100)', color: selMkt === t.id ? '#fff' : 'var(--text-300)', cursor: 'pointer' }}>
              {t.flag} {t.agency} {errs > 0 && <span style={{ fontWeight: 700, color: selMkt === t.id ? '#fff' : 'var(--error)' }}>{errs}</span>}
            </button>
          );
        })}
      </div>
      {MM.targets.filter((t: MarketsMatrixTarget) => selMkt === null || selMkt === t.id).map((t: MarketsMatrixTarget) => {
        const gaps = MM.gaps[t.id] || [];
        if (!gaps.length) return null;
        return (
          <div key={t.id} style={{ marginBottom: 10, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--bg-100)', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{t.flag} {t.agency}</span>
              <span style={{ fontSize: 10, color: 'var(--text-400)' }}>{t.instrument} {'·'} {t.region}</span>
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--error)', fontWeight: 600 }}>{gaps.filter((g: MarketsMatrixGap) => g.sev === 'err').length} required</span>
            </div>
            {gaps.map((g: MarketsMatrixGap, gi: number) => (
              <div key={gi} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 10px', borderBottom: '1px solid var(--bg-100)' }}>
                <span className={`rd-chip tone-${g.sev === 'err' ? 'err' : 'warn'}`} style={{ fontSize: 9, flexShrink: 0, marginTop: 1 }}>{g.sev === 'err' ? 'required' : 'advisory'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 500 }}>{g.doc}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-400)' }}>{g.note}</div>
                </div>
                <span style={{ fontSize: 9, color: 'var(--text-400)', flexShrink: 0 }}>{g.module}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}


/* ── M1BuilderPanel ───────────────────────────────────────────────── */

export function M1BuilderPanel() {
  const [selMkt, setSelMkt] = useState('fda');
  const items: M1ChecklistItem[] = M1_CHECKLISTS[selMkt] || [];
  const mkt = M1_MARKETS.find(m => m.id === selMkt) || M1_MARKETS[0];
  const total = items.length;
  const done = items.filter(i => i.status === 'complete').length;
  const gaps = items.filter(i => i.status === 'not_started').length;

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-400)', marginBottom: 10, lineHeight: 1.4 }}>
        Module 1 (Administrative) is always <strong>market-specific</strong>. Each agency has its own forms, labeling standards, and administrative requirements.
      </div>

      {/* Market tabs */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 12, flexWrap: 'wrap' }}>
        {M1_MARKETS.map(m => {
          const cl: M1ChecklistItem[] = M1_CHECKLISTS[m.id] || [];
          const g = cl.filter(i => i.status === 'not_started').length;
          return (
            <button key={m.id} onClick={() => setSelMkt(m.id)} style={{ fontSize: 10, padding: '4px 9px', borderRadius: 5, border: '1px solid var(--border)', background: selMkt === m.id ? 'var(--accent-100)' : 'var(--bg-100)', color: selMkt === m.id ? '#fff' : 'var(--text-300)', cursor: 'pointer', fontWeight: selMkt === m.id ? 700 : 400 }}>
              {m.flag} {m.agency} {g > 0 && <span style={{ fontSize: 9, color: selMkt === m.id ? '#fff' : 'var(--error)', fontWeight: 700 }}>{g}</span>}
            </button>
          );
        })}
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-400)', marginBottom: 4 }}>
          <span>{mkt.flag} {mkt.agency} -- {mkt.instrument} M1</span>
          <span style={{ color: done === total ? 'var(--success)' : gaps > 0 ? 'var(--error)' : 'var(--warning)', fontWeight: 600 }}>{done}/{total} complete {'·'} {gaps} not started</span>
        </div>
        <div style={{ height: 5, background: 'var(--bg-200)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: (done / Math.max(total, 1) * 100) + '%', background: done === total ? 'var(--success)' : gaps > 2 ? 'var(--error)' : 'var(--warning)', borderRadius: 3 }} />
        </div>
      </div>

      {/* Checklist */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map((item, i) => {
          const sm = M1_STATUS_META[item.status] || M1_STATUS_META.not_started;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 6, background: item.status === 'not_started' ? 'oklch(0.98 0.01 0)' : 'var(--bg-50)', border: '1px solid var(--border)' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, marginTop: 2, background: sm.color, opacity: item.status === 'not_started' ? 0.3 : 1 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 500 }}>{item.label}</span>
                  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: sm.bg, color: sm.color, fontWeight: 600, flexShrink: 0 }}>{sm.label}</span>
                </div>
                <div style={{ fontSize: 9, color: 'var(--text-400)', marginBottom: item.notes ? 3 : 0 }}>{item.ref}</div>
                {item.notes && <div style={{ fontSize: 10, color: item.status === 'not_started' ? 'var(--error)' : 'var(--text-400)', fontStyle: 'italic' }}>{item.notes}</div>}
              </div>
              {item.status === 'not_started' && (
                <button style={{ fontSize: 9, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--accent-100)', background: 'color-mix(in srgb,var(--accent-100) 8%,transparent)', color: 'var(--accent-100)', cursor: 'pointer', flexShrink: 0 }}>Start</button>
              )}
              {item.status === 'draft' && (
                <button style={{ fontSize: 9, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-100)', color: 'var(--text-400)', cursor: 'pointer', flexShrink: 0 }}>Open</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
