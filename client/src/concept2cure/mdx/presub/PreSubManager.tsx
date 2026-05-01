/**
 * Pre-Sub manager — 510(k) Q-Submission tracker.
 * Ported from design-system/ui_kits/mdx/PreSub.jsx.
 *
 * Three rows: page header · KPI strip · filter row + list/detail two-pane.
 * Detail pane has tabs: Questions · Timeline · Commitments — each commitment
 * links into the live dossier (eSTAR section).
 */

import * as React from 'react';
import { I } from '../icons';
import {
  PRESUB_KPIS,
  PRESUB_TYPES,
  PRESUB_STAGES,
  PRESUB_LIST,
  PRESUB_DETAIL,
  type PresubTypeId,
  type PresubStageId,
  type PresubListRow,
  type PresubQuestion,
  type DossierLink,
} from '../data/presub';

interface PreSubTypeChipProps {
  type: PresubTypeId;
}

function PreSubTypeChip({ type }: PreSubTypeChipProps) {
  const t = PRESUB_TYPES.find(x => x.id === type) || PRESUB_TYPES[0];
  return <span className={`ps-type ps-type-${t.id}`}>{t.label}</span>;
}

interface PreSubStageStripProps {
  stage: PresubStageId;
}

function PreSubStageStrip({ stage }: PreSubStageStripProps) {
  const idx = PRESUB_STAGES.findIndex(s => s.id === stage);
  return (
    <div className="ps-strip">
      {PRESUB_STAGES.map((s, i) => (
        <div
          key={s.id}
          className="ps-strip-cell"
          data-state={i < idx ? 'done' : i === idx ? 'active' : 'todo'}
          title={s.desc}
        >
          <div className="ps-strip-num">{String(i + 1).padStart(2, '0')}</div>
          <div className="ps-strip-lbl">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

interface PreSubRowProps {
  row: PresubListRow;
  selected: boolean;
  onPick: () => void;
}

function PreSubRow({ row, selected, onPick }: PreSubRowProps) {
  const stageMeta = PRESUB_STAGES.find(s => s.id === row.stage);
  return (
    <button className="ps-row" data-on={selected || undefined} onClick={onPick}>
      <div className="ps-row-l">
        <div className="ps-row-id">
          <span className="mono">{row.qNumber}</span>
          <PreSubTypeChip type={row.type} />
        </div>
        <div className="ps-row-title">{row.title}</div>
        <div className="ps-row-prog">{row.prog} · {row.fdaTeam}</div>
      </div>
      <div className="ps-row-r">
        <div className="ps-row-stage" data-tone={row.tone || ''}>
          <span className="ps-row-stage-dot" />
          <span>{stageMeta?.label}</span>
          <span className="ps-row-stage-days">· {row.daysIn}d</span>
        </div>
        <div className="ps-row-meta">
          <span>{row.answered}/{row.questions} answered</span>
          {row.commitments > 0 && (
            <span className="ps-row-commit" data-on={row.rolledIn === row.commitments}>
              {row.rolledIn}/{row.commitments} commitments rolled in
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

interface PreSubQuestionViewProps {
  q: PresubQuestion;
  onJumpToDossier?: (link: DossierLink) => void;
}

function PreSubQuestionView({ q, onJumpToDossier }: PreSubQuestionViewProps) {
  return (
    <div className="ps-q" data-status={q.status}>
      <div className="ps-q-head">
        <span className="ps-q-n">Q{q.n}</span>
        <span className={`ps-q-status ps-q-status-${q.status}`}>
          {q.status === 'answered' ? 'FDA responded' : 'Awaiting FDA'}
        </span>
      </div>
      <div className="ps-q-text">{q.q}</div>

      <div className="ps-q-pos">
        <div className="ps-q-pos-lbl">Our position</div>
        <div className="ps-q-pos-body">{q.ourPosition}</div>
      </div>

      {q.fdaResponse && (
        <div className="ps-q-fda">
          <div className="ps-q-fda-lbl">FDA response</div>
          <div className="ps-q-fda-body">{q.fdaResponse}</div>
        </div>
      )}

      {q.commitment && (
        <div
          className="ps-q-commit"
          data-rolled={q.commitment.rolledIn || undefined}
          data-blocker={q.commitment.blocker || undefined}
        >
          <div className="ps-q-commit-l">
            <span className="ps-q-commit-ico">{I.checkCircle}</span>
            <div>
              <div className="ps-q-commit-lbl">Commitment</div>
              <div className="ps-q-commit-body">{q.commitment.text}</div>
            </div>
          </div>
          <div className="ps-q-commit-r">
            {q.commitment.dossierLink && (
              <button
                className="ps-q-commit-link"
                onClick={() => onJumpToDossier?.(q.commitment!.dossierLink)}
              >
                <span>{q.commitment.dossierLink.label}</span>
                <span className="ico">{I.right}</span>
              </button>
            )}
            <span
              className={`ps-q-commit-state ${
                q.commitment.rolledIn ? 'ok' : q.commitment.blocker ? 'err' : 'warn'
              }`}
            >
              {q.commitment.rolledIn ? 'Rolled in' : q.commitment.blocker ? 'Blocker' : 'Pending'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

interface PreSubDetailProps {
  row: PresubListRow;
  onJumpToDossier?: (link: DossierLink) => void;
  onAskAna?: (text: string) => void;
}

type DetailTab = 'questions' | 'timeline' | 'commitments';

function PreSubDetail({ row, onJumpToDossier, onAskAna }: PreSubDetailProps) {
  const detail = PRESUB_DETAIL[row.id];
  const [tab, setTab] = React.useState<DetailTab>('questions');

  if (!detail) {
    return (
      <div className="ps-detail">
        <div className="ps-detail-head">
          <div>
            <div className="ps-detail-eyebrow">{row.prog} · {row.qNumber !== '—' ? row.qNumber : 'Unfiled'}</div>
            <h3 className="ps-detail-title">{row.title}</h3>
            <div className="ps-detail-target">FDA team · {row.fdaTeam}</div>
          </div>
        </div>
        <div className="ps-empty">
          <div className="ps-empty-t">Package in draft</div>
          <div className="ps-empty-s">Question list and FDA response will appear once the Q-Sub is filed.</div>
        </div>
      </div>
    );
  }

  const answered = detail.questions.filter(q => q.status === 'answered').length;
  const commitmentQs = detail.questions.filter(q => q.commitment);

  return (
    <div className="ps-detail">
      <div className="ps-detail-head">
        <div>
          <div className="ps-detail-eyebrow">
            {row.prog} · {row.qNumber} · <PreSubTypeChip type={row.type} />
          </div>
          <h3 className="ps-detail-title">{row.title}</h3>
          <div className="ps-detail-target">
            FDA team · {row.fdaTeam}
            {row.filed && ` · Filed ${row.filed}`}
            {row.targetDate && ` · Target ${row.targetDate}`}
          </div>
        </div>
        <div className="ps-detail-actions">
          <button
            className="btn ghost small"
            onClick={() => onAskAna?.(`Summarize ${row.qNumber} commitments`)}
          >
            {I.sparkles} Summarize
          </button>
          <button className="btn primary small">{I.download} Export package</button>
        </div>
      </div>

      <div className="ps-summary">{detail.summary}</div>

      <div className="ps-strip-wrap">
        <PreSubStageStrip stage={row.stage} />
        {row.meeting && (
          <div className="ps-meeting">
            <span className="ico">{I.calendar}</span>
            <div>
              <div className="ps-meeting-when">Meeting · {row.meeting.date}</div>
              <div className="ps-meeting-meta">{row.meeting.kind} · {row.meeting.team}</div>
            </div>
            <span className={`ps-meeting-state ${row.meeting.confirmed ? 'ok' : 'warn'}`}>
              {row.meeting.confirmed ? 'Confirmed' : 'Tentative'}
            </span>
          </div>
        )}
      </div>

      <div className="ps-tabs">
        <button className="ps-tab" data-on={tab === 'questions'} onClick={() => setTab('questions')}>
          Questions <span className="ps-tab-n">{answered}/{detail.questions.length}</span>
        </button>
        <button className="ps-tab" data-on={tab === 'timeline'} onClick={() => setTab('timeline')}>
          Timeline <span className="ps-tab-n">{detail.timeline.length}</span>
        </button>
        <button className="ps-tab" data-on={tab === 'commitments'} onClick={() => setTab('commitments')}>
          Commitments <span className="ps-tab-n">{commitmentQs.length}</span>
        </button>
      </div>

      {tab === 'questions' && (
        <div className="ps-q-list">
          {detail.questions.map(q => (
            <PreSubQuestionView key={q.n} q={q} onJumpToDossier={onJumpToDossier} />
          ))}
        </div>
      )}

      {tab === 'timeline' && (
        <div className="ps-timeline">
          {detail.timeline.map((t, i) => (
            <div key={i} className="ps-timeline-row">
              <span className="ps-timeline-when">{t.when}</span>
              <span className="ps-timeline-who">{t.who}</span>
              <span className="ps-timeline-what">{t.what}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'commitments' && (
        <div className="ps-commit-table">
          {commitmentQs.length === 0 && (
            <div className="ps-empty">
              <div className="ps-empty-t">No commitments yet</div>
              <div className="ps-empty-s">Captured after the FDA meeting or written response.</div>
            </div>
          )}
          {commitmentQs.map(q => {
            const c = q.commitment!;
            return (
              <div
                key={c.id}
                className="ps-commit-row"
                data-rolled={c.rolledIn || undefined}
                data-blocker={c.blocker || undefined}
              >
                <div className="ps-commit-id mono">{c.id}</div>
                <div className="ps-commit-text">{c.text}</div>
                <div className="ps-commit-from">From Q{q.n}</div>
                <button
                  className="ps-commit-jump"
                  onClick={() => onJumpToDossier?.(c.dossierLink)}
                >
                  {c.dossierLink.label} {I.right}
                </button>
                <span
                  className={`ps-commit-state ${c.rolledIn ? 'ok' : c.blocker ? 'err' : 'warn'}`}
                >
                  {c.rolledIn ? 'Rolled in' : c.blocker ? 'Blocker' : 'Pending'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export interface PreSubManagerProps {
  onAskAna: (text: string) => void;
  onJumpToDossier?: (link: DossierLink) => void;
}

type ListFilter = 'all' | 'mine' | PresubTypeId;
type StageFilter = 'all' | PresubStageId;

export function PreSubManager({ onAskAna, onJumpToDossier }: PreSubManagerProps) {
  const [filter, setFilter] = React.useState<ListFilter>('all');
  const [stageFilter, setStageFilter] = React.useState<StageFilter>('all');
  const [selected, setSelected] = React.useState<string>('qs-2025-1142');

  const filtered = PRESUB_LIST
    .filter(r => {
      if (filter === 'mine') return ['BX-204', 'OR-801'].includes(r.prog);
      if (filter !== 'all') return r.type === filter;
      return true;
    })
    .filter(r => stageFilter === 'all' || r.stage === stageFilter);

  const sel = PRESUB_LIST.find(r => r.id === selected) || filtered[0];

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workbench</div>
          <h1 className="page-title">Pre-Sub manager</h1>
          <div className="page-sub">
            FDA Q-Submission program — Pre-Sub, SIR, Study Risk, Agreement. Track questions, FDA responses, and commitments back to the live dossier.
          </div>
        </div>
        <div className="page-actions">
          <button className="btn ghost small">{I.download} Export</button>
          <button className="btn primary small">{I.plus} New Q-Sub</button>
        </div>
      </div>

      <div className="metrics-row">
        {PRESUB_KPIS.map((m, i) => (
          <div key={i} className="metric-card" data-tone={m.tone || ''}>
            <div className="metric-label">{m.label}</div>
            <div className="metric-val">{m.metric}{m.unit && <span className="unit">{m.unit}</span>}</div>
            <div className="metric-meta">{m.meta}</div>
          </div>
        ))}
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Q-Submissions in flight</h2>
          <span className="section-sub">
            {PRESUB_LIST.length} total · {PRESUB_LIST.filter(r => r.stage === 'await').length} awaiting FDA · {PRESUB_LIST.filter(r => r.stage === 'feedback').length} feedback received
          </span>
        </div>

        <div className="ps-filter-row">
          <div className="seg small">
            <button className="seg-btn" data-on={filter === 'all'} onClick={() => setFilter('all')}>All</button>
            <button className="seg-btn" data-on={filter === 'mine'} onClick={() => setFilter('mine')}>Mine</button>
            {PRESUB_TYPES.map(t => (
              <button
                key={t.id}
                className="seg-btn"
                data-on={filter === t.id}
                onClick={() => setFilter(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="ps-filter-spacer" />
          <div className="seg small">
            <button
              className="seg-btn"
              data-on={stageFilter === 'all'}
              onClick={() => setStageFilter('all')}
            >
              Any stage
            </button>
            {PRESUB_STAGES.map(s => (
              <button
                key={s.id}
                className="seg-btn"
                data-on={stageFilter === s.id}
                onClick={() => setStageFilter(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="ps-layout">
          <div className="ps-list">
            {filtered.map(r => (
              <PreSubRow
                key={r.id}
                row={r}
                selected={!!sel && sel.id === r.id}
                onPick={() => setSelected(r.id)}
              />
            ))}
            {filtered.length === 0 && (
              <div className="ps-empty">
                <div className="ps-empty-t">No Q-Subs match these filters</div>
                <div className="ps-empty-s">Clear filters to see the full portfolio.</div>
              </div>
            )}
          </div>

          {sel && (
            <PreSubDetail row={sel} onJumpToDossier={onJumpToDossier} onAskAna={onAskAna} />
          )}
        </div>
      </section>
    </>
  );
}
