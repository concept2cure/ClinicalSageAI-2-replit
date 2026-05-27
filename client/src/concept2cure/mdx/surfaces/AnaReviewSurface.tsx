/**
 * AnA review queue — Phase 7.
 *
 * Workbench tab. Every AnA-generated draft across the platform, in one
 * queue. Reviewers see what's waiting on them and accept / refine /
 * reject — accept triggers the Phase 5 e-signature flow.
 *
 * Ported 1:1 from design-system/ui_kits/mdx/surfaces/AnaReview.jsx.
 */

import * as React from 'react';
import { I } from '../icons';
import { ARQ_KPIS, ARQ_FILTERS, ARQ_DRAFTS } from '../data/ana-review';
import type { Program } from '../data/programs';

interface Props {
  program: Program | null;
  onAskAna: (msg: string) => void;
}

export function AnaReviewSurface({ program, onAskAna }: Props) {
  const [filter, setFilter] = React.useState<'all' | 'mine' | 'unowned' | 'stale'>('all');
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const programFilter = program?.code?.split(' ')[0] ?? null;
  const visible = ARQ_DRAFTS.filter(d => {
    if (programFilter && d.program !== programFilter) return false;
    if (filter === 'all') return true;
    if (filter === 'mine') return d.reviewer === 'JC';
    if (filter === 'unowned') return !d.reviewer;
    if (filter === 'stale') return d.when.endsWith('d ago') || (d.when.endsWith('h ago') && parseInt(d.when) >= 24);
    return true;
  });

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workbench</div>
          <h1 className="page-title">AnA review queue</h1>
          <div className="page-sub">
            Every AnA-generated draft across the portfolio. Accept triggers the Part 11 e-signature flow.
            Refine sends back to AnA with reviewer comments. Reject removes the draft from the artifact.
          </div>
        </div>
        <div className="page-actions">
          <button
            className="btn ghost small"
            disabled={selected.size === 0}
            onClick={() => onAskAna(`Refine ${selected.size} selected drafts — apply consistent reviewer comments to each.`)}
          >
            {I.pencil} Refine selected ({selected.size})
          </button>
          <button
            className="btn primary small"
            disabled={selected.size === 0}
            onClick={() => onAskAna(`Accept ${selected.size} selected drafts. Open the e-signature flow once per draft.`)}
          >
            {I.shieldCheck} Accept selected ({selected.size})
          </button>
        </div>
      </div>

      <div className="metrics-row metrics-compact">
        {ARQ_KPIS.map((k, i) => (
          <div key={i} className="metric-card" data-tone={k.tone ?? ''}>
            <div className="metric-label">{k.label}</div>
            <div className="metric-val">{k.metric}{k.unit && <span className="unit">{k.unit}</span>}</div>
            <div className="metric-meta">{k.meta}</div>
          </div>
        ))}
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Drafts pending review</h2>
          <div className="seg small">
            {ARQ_FILTERS.map(f => (
              <button key={f.id} className="seg-btn" data-on={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>
            ))}
          </div>
          <span className="section-sub">{visible.length} of {ARQ_DRAFTS.length} shown</span>
        </div>
        <div className="arq-list">
          {visible.map(d => (
            <button
              key={d.id}
              className="arq-row"
              data-priority={d.priority}
              data-selected={selected.has(d.id)}
              onClick={() => toggle(d.id)}
            >
              <span className="arq-checkbox" data-on={selected.has(d.id)}>{selected.has(d.id) && I.check}</span>
              <div className="arq-rail" />
              <div className="arq-body">
                <div className="arq-head">
                  <span className="mono small arq-id">{d.id}</span>
                  <span className={`arq-priority arq-pri-${d.priority}`}>{d.priority}</span>
                  <span className="arq-surface mono tiny">{d.surface}</span>
                  <span className="arq-program">{d.program}</span>
                  <span className="dot-sep">·</span>
                  <span className="arq-section">{d.section}</span>
                  <span className="arq-when">{d.when}</span>
                  <span className="arq-confidence" title={`AnA confidence ${Math.round(d.confidence * 100)}%`}>
                    <span className="arq-conf-bar"><span className="arq-conf-fill" style={{ width: `${d.confidence * 100}%` }} /></span>
                    <span className="mono tiny">{Math.round(d.confidence * 100)}%</span>
                  </span>
                </div>
                <div className="arq-summary">{d.summary}</div>
                <div className="arq-foot">
                  <span className="mono tiny" style={{ color: 'var(--text-400)' }}>{d.author}</span>
                  <span className="dot-sep">·</span>
                  <span className="arq-evidence">{d.evidenceN} evidence sources</span>
                  <span className="dot-sep">·</span>
                  <span style={{ color: 'var(--text-300)' }}>{d.sources.slice(0, 2).join(' · ')}</span>
                  <span style={{ marginLeft: 'auto' }} className="arq-reviewer">→ {d.reviewer}</span>
                </div>
              </div>
              <div className="arq-actions" onClick={e => e.stopPropagation()}>
                <button className="btn ghost small" onClick={() => onAskAna(`Refine draft ${d.id} (${d.section}) — what should I tell AnA to change?`)}>
                  {I.pencil}
                </button>
                <button className="btn primary small" onClick={() => onAskAna(`Accept AnA draft ${d.id} (${d.section}). Open the e-signature flow to commit.`)}>
                  {I.check}
                </button>
              </div>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
