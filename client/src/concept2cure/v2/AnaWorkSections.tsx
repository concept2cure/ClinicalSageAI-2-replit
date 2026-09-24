/**
 * The sections of AnA's progress panel — each one a small, honest renderer
 * over the projections in anaWorkModel.ts. Composed by AnaWorkPanel; split out
 * so every function here stays readable on one screen and the panel itself is
 * only composition.
 *
 * Three sections, in the order a person asks about work in progress:
 *
 *   Steps                 where she is — her declared plan when she made one,
 *                         otherwise the phases the turn reported — on one
 *                         vertical rail, the current step emphasised
 *   Outputs               what the conversation has produced
 *   Used in this session  uploads, memory, tools and project context — one
 *                         line each, only when there is something true to say
 *
 * Tool durations and the inputs she passed are in the transcript, behind each
 * step's own disclosure (AnaActivity), not repeated here.
 *
 * @module client/src/concept2cure/v2/AnaWorkSections
 */

import React from 'react';

import { I } from './icons';
import type { AnaChatMessage, AnaToolCall } from '../components/ana/useAnaChat';
import type { AnaPlanStep, AnaProgressPhase } from '../components/ana/useAnaChat.types';
import { currentStep, formatElapsed, formatStepDuration } from '../components/ana/anaProgress';
import type { AgentActivityView } from './useAgentActivity';
import { clip, formatClock, SENDING_PLACEHOLDER, type OutputRow, type UsedRow } from './anaWorkModel';

/** The one status glyph: check / warning triangle / dot. Shared with AnaActivity. */
export function statusGlyph(status: AnaToolCall['status']): React.ReactElement {
  if (status === 'success') return I.check;
  if (status === 'error') return I.alertTriangle;
  return I.dot;
}

/** A titled, always-open section. The title is a real heading (SC 1.3.1). */
export function Section({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="ana-work-sec">
      <h3 className="ana-work-sec-t">
        {title}
        {meta ? <span className="ana-work-sec-m">{meta}</span> : null}
      </h3>
      {children}
    </section>
  );
}

/* ── Steps ────────────────────────────────────────────────────────────────── */

type RailState = 'done' | 'current' | 'pending' | 'stopped';

/**
 * One step on the rail. The state is carried by the marker AND by text for
 * assistive tech (the visually hidden suffix), never by colour alone.
 */
function RailItem({
  state,
  label,
  trailing,
  pulsing,
  children,
}: {
  state: RailState;
  label: string;
  trailing?: string;
  pulsing?: boolean;
  children?: React.ReactNode;
}) {
  const spoken = { done: 'done', current: 'in progress', pending: 'not started', stopped: 'not finished' }[state];
  return (
    <li className={`ana-rail-item is-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
      <span className={`ana-rail-mark${pulsing ? ' is-pulsing' : ''}`} aria-hidden="true">
        {state === 'done' ? I.check : state === 'stopped' ? I.minus : null}
      </span>
      <span className="ana-rail-l">
        {label}
        <span className="sr-only"> — {spoken}</span>
      </span>
      {trailing ? <span className="ana-rail-t">{trailing}</span> : null}
      {children}
    </li>
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
  if (p.status === 'stopped') return '';
  const ms = (p.endedAt ?? p.startedAt) - p.startedAt;
  return ms < 10_000 ? formatStepDuration(ms) : formatElapsed(ms);
}

function planState(s: AnaPlanStep, live: boolean): RailState {
  if (s.status === 'completed') return 'done';
  if (s.status === 'in_progress') return live ? 'current' : 'stopped';
  return 'pending';
}

/** The step in flight, under the item it belongs to. */
function CurrentTool({ step }: { step: AnaToolCall | null }) {
  if (!step) return null;
  return (
    <span className="ana-rail-sub">
      <span aria-hidden="true">{I.arrowRight}</span> {step.label || step.name}
    </span>
  );
}

/**
 * Her declared plan when she made one; otherwise the phases the turn reported.
 * Neither is a template: a plan is exactly what she declared, a step is done
 * only because she marked it so, and a phase exists only once its event
 * arrived.
 */
export function StepsBody({
  turn,
  live,
  paused,
  now,
}: {
  turn: AnaChatMessage;
  live: boolean;
  paused: boolean;
  now: number;
}) {
  const step = currentStep(turn.toolCalls);
  const plan = turn.plan ?? [];
  if (plan.length > 0) {
    const firstActive = plan.findIndex((s) => s.status === 'in_progress');
    return (
      <ol className="ana-rail" aria-label="Plan">
        {plan.map((s, i) => (
          <RailItem key={s.title} state={planState(s, live)} label={s.title} pulsing={live && !paused && i === firstActive}>
            {live && i === firstActive && <CurrentTool step={step} />}
          </RailItem>
        ))}
      </ol>
    );
  }
  const phases = turn.progress ?? [];
  if (phases.length === 0) {
    if (!live) return <p className="ana-work-empty">This turn did not report its steps.</p>;
    return (
      <ol className="ana-rail" aria-label="Progress">
        <RailItem state="current" label={turn.statusPhase || SENDING_PLACEHOLDER} pulsing={!paused} />
      </ol>
    );
  }
  return (
    <ol className="ana-rail" aria-label="Progress">
      {phases.map((p) => {
        const state: RailState = p.status === 'active' ? 'current' : p.status === 'done' ? 'done' : 'stopped';
        return (
          <RailItem
            key={`${p.phase}-${p.startedAt}`}
            state={state}
            label={p.label}
            trailing={phaseTime(p, now)}
            pulsing={state === 'current' && live && !paused}
          >
            {state === 'current' && <CurrentTool step={step} />}
          </RailItem>
        );
      })}
    </ol>
  );
}

/** Steers the server accepted that wait for the next round. */
export function SteersWaiting({ steers }: { steers: string[] }) {
  if (steers.length === 0) return null;
  return (
    <div className="ana-work-steers">
      <div className="ana-work-steers-h">Waiting for the next round</div>
      {steers.map((s, i) => (
        <div key={`${i}-${s}`} className="ana-work-steer">
          <span aria-hidden="true">{I.chevRight}</span>
          <span>{clip(s, 120)}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Outputs and what was used ────────────────────────────────────────────── */

/** One line: icon, label, and a muted detail that truncates rather than wraps. */
function LineRow({
  icon,
  label,
  detail,
  note,
  tone,
}: {
  icon: React.ReactElement;
  label: string;
  detail?: string;
  note?: string;
  tone?: 'warn';
}) {
  return (
    <li className={`ana-work-line${tone ? ` is-${tone}` : ''}`}>
      <span className="ana-work-line-ic" aria-hidden="true">{icon}</span>
      <span className="ana-work-line-l">{label}</span>
      {detail ? (
        <span className="ana-work-line-d" title={detail}>
          {detail}
        </span>
      ) : null}
      {note ? <span className="ana-work-line-n">{note}</span> : null}
    </li>
  );
}

export function OutputsBody({ outputs }: { outputs: OutputRow[] }) {
  return (
    <ul className="ana-work-lines">
      {outputs.map((o) => (
        <LineRow
          key={o.key}
          icon={I[o.icon]}
          label={o.label}
          detail={o.note}
          tone={o.icon === 'alertTriangle' ? 'warn' : undefined}
        />
      ))}
    </ul>
  );
}

export function UsedBody({ rows }: { rows: UsedRow[] }) {
  return (
    <ul className="ana-work-lines">
      {rows.map((r) => (
        <LineRow key={r.key} icon={I[r.icon]} label={r.label} detail={r.detail} note={r.note} />
      ))}
    </ul>
  );
}

/**
 * Background investigations. Only when the server reported some, or the read
 * failed — a failure is said as a failure with a retry, never as an empty
 * queue. A queue that is empty, or not yet read, adds no section.
 */
export function BackgroundQueue({ q }: { q: AgentActivityView | undefined }) {
  if (!q) return null;
  if (q.state === 'error') {
    return (
      <Section title="Background">
        <div className="ana-work-err" role="status">
          <span aria-hidden="true">{I.alertTriangle}</span>
          <span>Couldn't read the background queue.</span>
          <button type="button" className="ana-work-link" onClick={q.refresh}>
            Retry
          </button>
        </div>
      </Section>
    );
  }
  const qs = q.summary;
  if (!qs || qs.items.length === 0) return null;
  return (
    <Section title="Background">
      <div className="ana-work-sum">
        {qs.activeCount} running · {qs.stalledCount} stalled · {qs.recentlyCompletedCount} finished in the last day
      </div>
      <ul className="ana-work-lines">
        {qs.items.slice(0, 5).map((it) => (
          <LineRow
            key={it.id}
            icon={I.telescope}
            label={clip(it.question, 110)}
            detail={`${it.status}${it.toolCalls > 0 ? ` · ${it.toolCalls} ${it.toolCalls === 1 ? 'tool call' : 'tool calls'}` : ''}`}
          />
        ))}
      </ul>
      {q.readAt !== null && <div className="ana-work-asof">As of {formatClock(q.readAt)}</div>}
    </Section>
  );
}
