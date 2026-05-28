/**
 * Q-Sub briefing-document workspace — Phase 7.
 *
 * Open Q-Subs on the left as cards · selected Q-Sub's briefing-document
 * sections center · FDA correspondence thread on the right.
 *
 * Ported 1:1 from design-system/ui_kits/mdx/surfaces/QSub.jsx.
 */

import * as React from 'react';
import { I } from '../icons';
import { DocumentsPanel } from '../components/DocumentsPanel';
import {
  QSUB_KPIS,
  QSUB_TYPES,
  QSUB_SECTIONS,
  QSUB_OPEN,
  QSUB_CORRESPONDENCE,
  QSUB_DOCUMENTS,
  QSUB_DOC_FRAMEWORKS,
} from '../data/qsub';
import { usePresubList } from '../hooks/usePresub';
import type { PresubListRow } from '../data/presub';
import type { QsubOpen } from '../data/qsub';
import type { Program } from '../data/programs';

function adaptToQsubOpen(r: PresubListRow): QsubOpen {
  const typeMap: Record<string, QsubOpen['type']> = {
    presub: 'pre-sub', sir: 'study-risk', srd: 'study-risk',
    agree: 'pre-sub', info: 'pre-sub', pccp: 'pccp',
  };
  const stageMap: Record<string, QsubOpen['status']> = {
    draft: 'drafting', await: 'awaiting-FDA',
    feedback: 'feedback-received', closed: 'closed',
  };
  return {
    id: r.id,
    program: r.prog,
    type: typeMap[r.type] ?? 'pre-sub',
    title: r.title,
    status: stageMap[r.stage] ?? 'drafting',
    submittedAt: r.filed,
    feedbackAt: null,
    reviewer: r.fdaTeam,
    cycleAge: `${r.daysIn}d in cycle`,
    questionCount: r.questions,
    accepted: r.answered,
    modified: 0,
    declined: 0,
  };
}

interface Props {
  program: Program | null;
  onAskAna: (msg: string) => void;
  onOpenEditor?: (docId: string) => void;
}

export function QSubSurface({ program, onAskAna, onOpenEditor }: Props) {
  const live = usePresubList();
  const qsubs = live.list ? live.list.map(adaptToQsubOpen) : QSUB_OPEN;
  const kpis = live.kpis ?? QSUB_KPIS;

  const programFilter = program?.code?.split(' ')[0] ?? null;
  const programQsubs = programFilter ? qsubs.filter(q => q.program === programFilter) : qsubs;
  const [selected, setSelected] = React.useState<string>('');
  const sel = programQsubs.find(q => q.id === selected) ?? programQsubs[0] ?? QSUB_OPEN[0];
  const thread = QSUB_CORRESPONDENCE.filter(c => c.qsub === selected);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workbench · Pre-Submission</div>
          <h1 className="page-title">Q-Sub briefing</h1>
          <div className="page-sub">
            Pre-Submission program. {qsubs.length} open Q-Subs · {QSUB_DOCUMENTS.length} briefing documents.
            Submit specific questions for FDA's view before committing to a full filing.
          </div>
        </div>
        <div className="page-actions">
          <button className="btn ghost small" onClick={() => onAskAna('Show me every Q-Sub that received FDA feedback in the last 90 days and summarize the responses.')}>
            {I.eye} View history
          </button>
          <button className="btn primary small" onClick={() => onAskAna('Start a new Q-Sub. Confirm program, Q-Sub type (pre-sub / study-risk / submission-issue / PCCP), and lead question.')}>
            {I.plus} New Q-Sub
          </button>
        </div>
      </div>

      <div className="metrics-row metrics-compact">
        {kpis.map((k, i) => (
          <div key={i} className="metric-card" data-tone={k.tone ?? ''}>
            <div className="metric-label">{k.label}</div>
            <div className="metric-val">{k.metric}{k.unit && <span className="unit">{k.unit}</span>}</div>
            <div className="metric-meta">{k.meta}</div>
          </div>
        ))}
      </div>

      <div className="qsub-grid">
        {/* Q-Subs ledger */}
        <aside className="qsub-ledger">
          <div className="qsub-ledger-lbl">Open Q-Subs</div>
          {programQsubs.map(q => {
            const tdef = QSUB_TYPES.find(t => t.id === q.type);
            return (
              <button key={q.id} className="qsub-card" data-on={selected === q.id} onClick={() => setSelected(q.id)}>
                <div className="qsub-card-head">
                  <span className="mono small qsub-card-id">{q.id}</span>
                  <span className={`qsub-type-tag qsub-type-${q.type}`}>{tdef?.label}</span>
                </div>
                <div className="qsub-card-title">{q.title}</div>
                <div className="qsub-card-meta">
                  <span className="ctable-strong">{q.program}</span>
                  <span className="dot-sep">·</span>
                  <span style={{ color: q.status === 'awaiting-FDA' ? 'var(--warning)' : 'var(--text-400)' }}>{q.status}</span>
                </div>
                <div className="qsub-card-foot">
                  <span>{q.questionCount} questions</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-400)', fontSize: 11 }}>{q.cycleAge}</span>
                </div>
              </button>
            );
          })}
        </aside>

        {/* Selected Q-Sub: briefing-document sections + documents */}
        <div className="qsub-main">
          <section className="section">
            <div className="section-head">
              <h2>{sel.id} · {sel.title}</h2>
              <span className="section-sub">{sel.program} · {QSUB_TYPES.find(t => t.id === sel.type)?.label}</span>
            </div>
            <div className="qsub-sections">
              {QSUB_SECTIONS.map((s, idx) => (
                <button
                  key={s.id}
                  className="qsub-section"
                  onClick={() => onOpenEditor && onOpenEditor(`doc-qsub-${sel.program.toLowerCase()}-${s.id}`)}
                >
                  <div className="qsub-section-num mono tiny">§{idx + 1}</div>
                  <div className="qsub-section-body">
                    <div className="qsub-section-label">
                      {s.label}{s.required && <span style={{ color: 'var(--error)' }}> *</span>}
                    </div>
                    <div className="qsub-section-hint">{s.hint}</div>
                  </div>
                  <span className="qsub-section-arr">{I.arrowRight}</span>
                </button>
              ))}
            </div>
          </section>

          <DocumentsPanel
            title="Briefing documents + FDA responses"
            subtitle="One document per Q-Sub · feedback files attached when received"
            docs={QSUB_DOCUMENTS}
            frameworks={QSUB_DOC_FRAMEWORKS}
            onOpenEditor={onOpenEditor}
            onAskAna={onAskAna}
          />
        </div>

        {/* FDA correspondence thread */}
        <aside className="qsub-thread">
          <div className="qsub-thread-lbl">Correspondence · {sel.id}</div>
          {thread.length === 0 && <div style={{ color: 'var(--text-400)', fontSize: 12, padding: 8 }}>No correspondence yet.</div>}
          {thread.map(c => (
            <div key={c.id} className="qsub-msg" data-from={c.from.toLowerCase()}>
              <div className="qsub-msg-head">
                <span className={`qsub-msg-from qsub-from-${c.from.toLowerCase()}`}>{c.from}</span>
                <span className="qsub-msg-when mono tiny">{c.when}</span>
              </div>
              <div className="qsub-msg-kind">{c.kind}</div>
              <div className="qsub-msg-body">{c.body}</div>
            </div>
          ))}
        </aside>
      </div>
    </>
  );
}
