/**
 * The sections of AnA's work dock — each one a small, honest renderer over
 * the projections in anaWorkModel.ts. Composed by AnaWorkPanel; split out so
 * every function here stays readable on one screen and the panel itself is
 * only composition.
 *
 * @module client/src/concept2cure/v2/AnaWorkSections
 */

import React from 'react';

import { I } from './icons';
import type { AnaChatMessage, AnaToolCall, MessageAttachment } from '../components/ana/useAnaChat';
import type { AnaProgressPhase } from '../components/ana/useAnaChat.types';
import {
  byRound,
  currentStep,
  formatElapsed,
  formatStepDuration,
  summarizeToolWork,
  type ToolTally,
} from '../components/ana/anaProgress';
import type { AgentActivityView } from './useAgentActivity';
import { clip, formatClock, stepDuration, SENDING_PLACEHOLDER, type OutputRow } from './anaWorkModel';

/** The one status glyph: check / warning triangle / dot. Shared with AnaActivity. */
export function statusGlyph(status: AnaToolCall['status']): React.ReactElement {
  if (status === 'success') return I.check;
  if (status === 'error') return I.alertTriangle;
  return I.dot;
}

/* ── Building blocks ──────────────────────────────────────────────────────── */

/** Collapsible section. The header is a real button; the body is labelled by it. */
export function Section({
  title,
  meta,
  open,
  onToggle,
  children,
}: {
  title: string;
  meta?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const id = React.useId();
  /* The body stays mounted and is hidden with the `hidden` attribute rather
     than conditionally rendered: the header's aria-controls must point at an
     element that exists while the section is collapsed, or the reference
     dangles (SC 4.1.2). The title is a real heading wrapping the disclosure
     button, so a screen reader browsing by heading finds the five sections. */
  return (
    <section className="ana-work-sec" data-open={open ? 'true' : 'false'}>
      <h3 className="ana-work-sec-hh">
        <button type="button" className="ana-work-sec-h" aria-expanded={open} aria-controls={id} onClick={onToggle}>
          <span className="ana-work-sec-t">{title}</span>
          {meta ? <span className="ana-work-sec-m">{meta}</span> : null}
          <span className="ana-work-sec-chev" aria-hidden="true">{open ? I.chevDown : I.chevRight}</span>
        </button>
      </h3>
      <div className="ana-work-sec-b" id={id} hidden={!open}>
        {children}
      </div>
    </section>
  );
}

/** Steps, queue rows and outputs share one row shape. */
export function Row({
  status,
  icon,
  label,
  trailing,
  children,
}: {
  status: 'running' | 'success' | 'error';
  icon?: React.ReactElement;
  label: string;
  trailing?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`ana-work-step is-${status}`}>
      <span className="ana-work-glyph" aria-hidden="true">{icon ?? statusGlyph(status)}</span>
      <span className="ana-work-step-l">{label}</span>
      {trailing ? <span className="ana-work-step-t">{trailing}</span> : null}
      {children}
    </div>
  );
}

function ToolRow({ c, now }: { c: AnaToolCall; now: number }) {
  const [open, setOpen] = React.useState(false);
  const inputsId = React.useId();
  const hasInput = c.input !== undefined && c.input !== null;
  return (
    <Row status={c.status} label={c.label || c.name} trailing={c.status === 'running' ? 'running' : stepDuration(c, now)}>
      {c.status === 'error' && <span className="ana-work-note">{c.message || 'did not complete'}</span>}
      {hasInput && (
        <button
          type="button"
          className="ana-work-link"
          aria-expanded={open}
          aria-controls={inputsId}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Hide inputs' : 'Inputs'}
        </button>
      )}
      {hasInput && (
        /* Mounted while the row exists so aria-controls resolves; a scroll
           container with a tab stop, named as a region like the reasoning
           block in AnaActivity (SC 2.1.1). */
        <pre
          className="ana-work-pre"
          id={inputsId}
          hidden={!open}
          tabIndex={0}
          role="region"
          aria-label="Inputs AnA passed to this step"
        >
          {JSON.stringify(c.input, null, 2)}
        </pre>
      )}
    </Row>
  );
}

/**
 * A phase's clock. Live and settled phases share one format above ten
 * seconds ("2m 05s" stays "2m 05s" the instant it completes); below that a
 * settled phase reads at step precision ("800 ms", "2.4s"), which the live
 * whole-second clock cannot show.
 */
function phaseTime(p: AnaProgressPhase, now: number): string {
  if (p.status === 'active') return formatElapsed(now - p.startedAt);
  if (p.status === 'stopped') return 'stopped';
  const ms = (p.endedAt ?? p.startedAt) - p.startedAt;
  return ms < 10_000 ? formatStepDuration(ms) : formatElapsed(ms);
}

function PhaseItem({ p, index, now, step }: { p: AnaProgressPhase; index: number; now: number; step: AnaToolCall | null }) {
  const active = p.status === 'active';
  return (
    <li className={`ana-work-phase is-${p.status}`} aria-current={active ? 'step' : undefined}>
      <span className="ana-work-num" aria-hidden="true">
        {p.status === 'done' ? I.check : p.status === 'stopped' ? I.close : index + 1}
      </span>
      <span className="ana-work-phase-l">{p.label}</span>
      <span className="ana-work-phase-t">{phaseTime(p, now)}</span>
      {active && step && (
        <span className="ana-work-current">
          <span aria-hidden="true">{I.arrowRight}</span> {step.label || step.name}
        </span>
      )}
    </li>
  );
}

function Chips({ items }: { items: React.ReactNode[] }) {
  return (
    <span className="ana-work-chips">
      {items.map((it, i) => (
        <span key={i} className="ana-work-chip">{it}</span>
      ))}
    </span>
  );
}

/* ── Section bodies ───────────────────────────────────────────────────────── */

export function ProgressBody({ turn, live, now }: { turn: AnaChatMessage; live: boolean; now: number }) {
  const phases = turn.progress ?? [];
  const step = currentStep(turn.toolCalls);
  if (phases.length === 0) {
    if (!live) return <div className="ana-work-empty">This turn did not report its phases.</div>;
    return (
      <ol className="ana-work-phases" aria-label="Progress">
        <li className="ana-work-phase is-active" aria-current="step">
          <span className="ana-work-num">1</span>
          <span className="ana-work-phase-l">{turn.statusPhase || SENDING_PLACEHOLDER}</span>
        </li>
      </ol>
    );
  }
  return (
    <ol className="ana-work-phases" aria-label="Progress">
      {phases.map((p, i) => (
        <PhaseItem key={`${p.phase}-${p.startedAt}`} p={p} index={i} now={now} step={step} />
      ))}
    </ol>
  );
}

export function RunQueue({ calls, tally, live }: { calls: AnaToolCall[]; tally: ToolTally; live: boolean }) {
  return (
    <div className="ana-work-group">
      <div className="ana-work-group-h">This run</div>
      {tally.total === 0 && (
        <div className="ana-work-empty">
          {live ? 'This turn has queued no tool steps yet.' : 'This turn needed no tool steps.'}
        </div>
      )}
      {byRound(calls).map(({ round, calls: cs }) => (
        <div key={round} className="ana-work-round">
          {/* The transcript record's words for the same rounds: round 2
              exists because round 1 did not settle it. */}
          {tally.rounds > 1 && (
            <div className="ana-work-round-h">{round === 1 ? 'First pass' : `Went back · round ${round}`}</div>
          )}
          {cs.map((c, i) => (
            <Row
              key={`${round}-${i}-${c.name}`}
              status={c.status}
              label={c.label || c.name}
              trailing={c.status === 'running' ? 'running' : c.status === 'error' ? 'failed' : 'done'}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SteerQueue({ steers }: { steers: string[] }) {
  if (steers.length === 0) return null;
  return (
    <div className="ana-work-group">
      <div className="ana-work-group-h">Steers waiting for the next round</div>
      {steers.map((s, i) => (
        <Row key={`${i}-${s}`} status="running" icon={I.chevRight} label={clip(s, 120)} trailing="queued" />
      ))}
    </div>
  );
}

export function BackgroundQueueBody({ q }: { q: AgentActivityView | undefined }) {
  if (!q) return <div className="ana-work-empty">Not shown on this surface.</div>;
  if (q.state === 'error') {
    return (
      <div className="ana-work-err" role="status">
        <span aria-hidden="true">{I.alertTriangle}</span>
        <span>Couldn't read the background queue.</span>
        <button type="button" className="ana-work-link" onClick={q.refresh}>Retry</button>
      </div>
    );
  }
  const qs = q.summary;
  if (!qs) return <div className="ana-work-empty">Reading the background queue…</div>;
  return (
    <>
      {qs.items.length === 0 ? (
        <div className="ana-work-empty">The server reports no background investigations for this workspace.</div>
      ) : (
        <>
          <div className="ana-work-sum">
            {qs.activeCount} running · {qs.stalledCount} stalled · {qs.recentlyCompletedCount} finished in the last day
          </div>
          {qs.items.slice(0, 5).map((it) => (
            <div key={it.id} className="ana-work-qi">
              <div className="ana-work-qi-q">{clip(it.question, 110)}</div>
              <div className="ana-work-qi-s">
                {it.status}
                {it.toolCalls > 0 ? ` · ${it.toolCalls} ${it.toolCalls === 1 ? 'tool call' : 'tool calls'}` : ''}
              </div>
            </div>
          ))}
        </>
      )}
      {q.readAt !== null && <div className="ana-work-asof">As of {formatClock(q.readAt)}</div>}
    </>
  );
}

export function ToolsBody({
  turn,
  calls,
  live,
  now,
  usedInConversation,
}: {
  turn: AnaChatMessage | null;
  calls: AnaToolCall[];
  live: boolean;
  now: number;
  usedInConversation: string[];
}) {
  // Lower-cased by the summariser so it can be embedded mid-sentence; here it
  // stands alone as a line, so it opens with a capital like its neighbours.
  const raw = summarizeToolWork(calls);
  const summary = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : '';
  return (
    <>
      {turn && (
        <div className="ana-work-group">
          <div className="ana-work-sum">
            {summary || (live ? 'No tools called yet this turn.' : 'No tools were called this turn.')}
          </div>
          {calls.map((c, i) => (
            <ToolRow key={`${i}-${c.name}-${c.startedAt ?? ''}`} c={c} now={now} />
          ))}
        </div>
      )}
      {usedInConversation.length > 0 && (
        <div className="ana-work-group">
          <div className="ana-work-group-h">Used in this conversation</div>
          <Chips items={usedInConversation} />
        </div>
      )}
      {!turn && <div className="ana-work-empty">Tools appear here as AnA calls them.</div>}
    </>
  );
}

export function OutputsBody({ outputs }: { outputs: OutputRow[] }) {
  if (outputs.length === 0) {
    return <div className="ana-work-empty">Drafts, actions and reports this conversation produces appear here.</div>;
  }
  return (
    <>
      {outputs.map((o) => (
        <Row key={o.key} status="success" icon={I[o.icon]} label={o.label} trailing={o.note} />
      ))}
    </>
  );
}

export function ContextBody({
  rows,
  pinnedTools,
  attachments,
}: {
  rows: Array<[string, string]>;
  pinnedTools: string[];
  attachments: MessageAttachment[];
}) {
  if (rows.length === 0 && attachments.length === 0 && pinnedTools.length === 0) {
    return <div className="ana-work-empty">No project or module context is attached to this conversation.</div>;
  }
  return (
    <>
      {rows.map(([k, v]) => (
        <div key={k} className="ana-work-kv">
          <span className="ana-work-k">{k}</span>
          <span className="ana-work-v">{v}</span>
        </div>
      ))}
      {pinnedTools.length > 0 && (
        <div className="ana-work-kv">
          <span className="ana-work-k">Pinned tools</span>
          <Chips items={pinnedTools} />
        </div>
      )}
      {attachments.length > 0 && (
        <div className="ana-work-kv">
          <span className="ana-work-k">Attached</span>
          <Chips
            items={attachments.map((a) => (
              <React.Fragment key={a.id}>
                <span aria-hidden="true">{I.paperclip}</span> {a.name}
              </React.Fragment>
            ))}
          />
        </div>
      )}
    </>
  );
}
