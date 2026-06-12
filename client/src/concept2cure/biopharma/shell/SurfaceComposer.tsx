/**
 * SurfaceComposer — the conversation-first lead-in every biopharma pathway
 * surface wraps its dashboard in (Phase 10.2, PHASE_10_2_INSTALL.md §3.2).
 *
 * Pattern: greeting + state-of-this-surface · composer with drop zone ·
 * 4 starters · Today queue · then the existing dashboard as children,
 * collapsed by default ("reference data, expand to scan").
 *
 * Honesty rules: the composer/queue only dispatch prompts to AnA via
 * onAskAna — nothing here fabricates results. Sections backed by sample
 * fixtures pass `queueSample` / `dashboardSample` so the labeled pill
 * renders.
 *
 * Port of ui_kits/biopharma/surfaces.jsx > SurfaceComposer.
 *
 * @module client/src/concept2cure/biopharma/shell/SurfaceComposer
 */

import * as React from 'react';
import { BioIcon } from '../icons';

export type QueueTone = 'info' | 'warn' | 'err';

export interface SurfaceQueueItem {
  /** BioIcon name. */
  ico: string;
  title: string;
  sub: string;
  tone?: QueueTone;
  /** Action label on the right edge (defaults to "Open"). */
  action?: string;
  /** Prompt / slash command dispatched to AnA on click. */
  cmd: string;
}

export type SurfaceStarter = string | { text: string; ico?: string };

export interface SurfaceComposerProps {
  /** Free-text scope for the composer placeholder, e.g. "this IND". */
  scope: string;
  /** Small uppercase label above the title, e.g. "IND / CTA · §312". */
  kicker?: string;
  /** Headline. */
  title: React.ReactNode;
  /** One-line state of this surface. */
  stateLine?: React.ReactNode;
  /** Up to 4 surface-aware starter prompts. */
  starters?: SurfaceStarter[];
  /** Today queue — 3-5 tasks. */
  queue?: SurfaceQueueItem[];
  /** True when the queue is fixture-backed — renders the sample-data pill. */
  queueSample?: boolean;
  /** Primary action buttons rendered under the state line. */
  primary?: React.ReactNode;
  onAskAna: (text: string) => void;
  /** Collapsed reference-dashboard section label. */
  dashboardLabel?: string;
  /** True when the dashboard is fixture-backed — renders the sample pill. */
  dashboardSample?: boolean;
  children?: React.ReactNode;
}

export function SurfaceComposer({
  scope,
  kicker,
  title,
  stateLine,
  starters,
  queue,
  queueSample,
  primary,
  onAskAna,
  dashboardLabel,
  dashboardSample,
  children,
}: SurfaceComposerProps) {
  const [dashboardOpen, setDashboardOpen] = React.useState(false);
  const [composerValue, setComposerValue] = React.useState('');
  const [dragOver, setDragOver] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const send = (text: string) => {
    if (text && text.trim()) onAskAna(text.trim());
    setComposerValue('');
  };

  const fileNames = (files: FileList | null): string =>
    files && files.length ? Array.from(files).map(f => f.name).join(', ') : '';

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const names = fileNames(e.dataTransfer?.files ?? null);
    if (!names) return;
    onAskAna(
      `Classify and file these uploaded documents under ${scope}: ${names}. Suggest which section to anchor them to.`,
    );
  };

  return (
    <div className="bp-surface bp-overview-start">
      <div className="bp-od-greet">
        {kicker && <div className="bp-kicker" style={{ marginBottom: 8 }}>{kicker}</div>}
        <h1>{title}</h1>
        {stateLine && <p className="bp-od-state">{stateLine}</p>}
        {primary && <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>{primary}</div>}
      </div>

      <div
        className={`bp-od-composer ${dragOver ? 'bp-od-composer-drag' : ''}`}
        onDragEnter={e => { e.preventDefault(); setDragOver(true); }}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <textarea
          rows={1}
          placeholder={`Drop files, ask AnA, or capture a note about ${scope}…`}
          value={composerValue}
          onChange={e => setComposerValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(composerValue);
            }
          }}
        />
        <div className="bp-od-composer-row">
          <input
            ref={fileRef}
            type="file"
            hidden
            multiple
            onChange={e => {
              const names = fileNames(e.target.files);
              if (names) onAskAna(`Classify and file these uploaded documents under ${scope}: ${names}.`);
              e.target.value = '';
            }}
          />
          <button className="bp-od-chip" type="button" onClick={() => fileRef.current?.click()}>
            <BioIcon name="paperclip" /> Drop files
          </button>
          <span className="bp-od-chip" style={{ marginLeft: 'auto', cursor: 'default' }}>
            AnA 1.0
          </span>
          <button
            className="bp-od-send"
            type="button"
            disabled={!composerValue.trim()}
            onClick={() => send(composerValue)}
            aria-label="Send to AnA"
          >
            <BioIcon name="arrowRight" />
          </button>
        </div>
        {dragOver && (
          <div className="bp-od-drop-hint">
            Drop to file with AnA — she'll classify and anchor it to {scope}.
          </div>
        )}
      </div>

      {starters && starters.length > 0 && (
        <div className="bp-od-starters">
          {starters.map((s, i) => {
            const text = typeof s === 'string' ? s : s.text;
            const ico = typeof s === 'object' && s.ico ? s.ico : 'sparkles';
            return (
              <button key={i} className="bp-od-starter" type="button" onClick={() => onAskAna(text)}>
                <span className="bp-od-starter-ico"><BioIcon name={ico} /></span>
                <span>{text}</span>
              </button>
            );
          })}
        </div>
      )}

      {queue && queue.length > 0 && (
        <section className="bp-od-section">
          <header className="bp-od-section-head">
            <h2>Today · needs attention here</h2>
            <span className="bp-od-section-meta">{queue.length} items</span>
            {queueSample && <span className="bp-pill bp-pill-draft">Sample data</span>}
          </header>
          <div className="bp-od-queue">
            {queue.map((q, i) => (
              <button
                key={i}
                className={`bp-od-q-item bp-od-q-${q.tone ?? 'info'}`}
                type="button"
                onClick={() => onAskAna(q.cmd)}
              >
                <span className="bp-od-q-ico"><BioIcon name={q.ico} /></span>
                <div className="bp-od-q-body">
                  <div className="bp-od-q-title">{q.title}</div>
                  <div className="bp-od-q-sub">{q.sub}</div>
                </div>
                <span className="bp-od-q-action">
                  {q.action ?? 'Open'}{' '}
                  <span style={{ display: 'inline-flex' }}><BioIcon name="arrowRight" /></span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {children && (
        <section className="bp-od-section">
          <button
            className="bp-od-section-head bp-od-toggle"
            type="button"
            onClick={() => setDashboardOpen(o => !o)}
          >
            <span className="bp-od-chev" data-open={dashboardOpen || undefined}>
              <BioIcon name="chevronRight" />
            </span>
            <h2>{dashboardLabel ?? 'Reference data'}</h2>
            {dashboardSample && <span className="bp-pill bp-pill-draft">Sample data</span>}
            <span className="bp-od-section-meta">{dashboardOpen ? 'collapse' : 'expand to scan'}</span>
          </button>
          {dashboardOpen && <div style={{ marginTop: 14 }}>{children}</div>}
        </section>
      )}
    </div>
  );
}
