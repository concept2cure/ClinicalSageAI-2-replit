/**
 * The sections of AnA's progress panel — each one a small, honest renderer
 * over the projections in anaWorkModel.ts. Composed by AnaWorkPanel; split out
 * so every function here stays readable on one screen and the panel itself is
 * only composition.
 *
 * Two sections, in the order a person asks about work in progress:
 *
 *   Steps                 where she is — her declared plan when she made one,
 *                         otherwise the phases the turn reported — on one
 *                         vertical rail, the current step emphasised
 *   Used in this session  uploads, memory, tools and project context — one
 *                         line each, only when there is something true to say
 *
 * Tool durations and the inputs she passed are in the transcript, behind each
 * step's own disclosure (AnaActivity), not repeated here.
 *
 * Also the run-control strip (RunControlStrip): pause, resume, steer, stop,
 * and Manual's hold — one strip for every host that shows a live run.
 *
 * @module client/src/concept2cure/v2/AnaWorkSections
 */

import React from 'react';

import { I } from './icons';
import type { AnaChatMessage, AnaToolCall, RunControlStatus } from '../components/ana/useAnaChat';
import type { AnaPlanStep, AnaProgressPhase, AnaRunHold } from '../components/ana/useAnaChat.types';
import { MAX_INTERJECTION_CHARS, type AnaRunPolicy } from '@shared/ana/run-control-limits';
import { PAUSE_WORDS } from '@shared/ana/run-policy';
import { SR_ONLY_STYLE } from '../hooks/useChatUpload';
import { currentStep, formatElapsed, formatStepDuration } from '../components/ana/anaProgress';
import type { AgentActivityView } from './useAgentActivity';
import { clip, formatClock, SENDING_PLACEHOLDER, type UsedRow } from './anaWorkModel';

/** The one status glyph: check / warning triangle / dot. Shared with AnaActivity. */
export function statusGlyph(status: AnaToolCall['status']): React.ReactElement {
  if (status === 'success') return I.check;
  if (status === 'error' || status === 'unconfirmed') return I.alertTriangle;
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

/* ── What was used ────────────────────────────────────────────────────────── */

/** One line: icon, label, and a muted detail that truncates rather than wraps. */
function LineRow({
  icon,
  label,
  detail,
  note,
}: {
  icon: React.ReactElement;
  label: string;
  detail?: string;
  note?: string;
}) {
  return (
    <li className="ana-work-line">
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

/* ── Run control ──────────────────────────────────────────────────────────── */

/** "Next: A; B; C; +2" — the steps a Manual hold is waiting to run, three at most. */
function nextLine(next: string[]): string {
  const shown = next.slice(0, 3).join('; ');
  return `Next: ${shown}${next.length > 3 ? `; +${next.length - 3}` : ''}`;
}

export interface RunControlStripProps {
  streaming: boolean;
  runStatus: RunControlStatus;
  /** Why the run is held, when it is: a Manual hold gets its own copy and answers. */
  runHold?: AnaRunHold | null;
  /** The policy the turn in flight was sent with: under Manual a steer replaces her next step. */
  runPolicy?: AnaRunPolicy | null;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
  /** Splices a steer into the next round (under a Manual hold: replaces the step). Capped server-side. */
  /* Returns whether the server ACCEPTED the steer, so the box can keep the
     text on a refusal instead of silently eating it. `void` is still allowed:
     a caller that reports nothing is treated as accepted, which is the
     pre-existing behaviour rather than a fabricated failure. */
  onSteer?: (message: string) => void | boolean | Promise<boolean | void>;
}

/**
 * Mid-run control: the one strip, rendered by the rail (Shell.tsx AnaRail) and
 * above the conversation screen's composer (ConversationThread), which the
 * rail is not drawn beside. Moved here from the rail (row 74, S4) so a Manual
 * hold can be answered wherever AnA is waiting.
 *
 * The three actions have three different scopes, and the copy says which is
 * which rather than one blanket promise:
 *   Stop   cuts the step in flight — the model call and the tools are
 *          aborted, so it is "Stopping…", acknowledged by the server.
 *   Pause  holds at the next ROUND BOUNDARY, deliberately: killing a tool to
 *          pause throws the work away and then redoes it, so "after this
 *          step" is the honest label and stays.
 *   Steer  applies at the next round.
 * Steering is the reason this exists: a reviewer watching AnA work a question
 * the wrong way could previously only wait for her to finish, while the server
 * has spliced steers into the next round, and recorded them in the decision
 * lineage, all along. Pause and Steer are offered only when the run is durably
 * controllable; Stop is always offered because aborting the request needs no
 * run record.
 *
 * Under Manual, AnA stops herself before each further step: the strip says she
 * is waiting, names the step, and offers the three answers the server takes —
 * Run this step (resume), Do this instead (a steer, which REPLACES the step:
 * it will not run), and Stop. A hold that ran out ended the turn: it says so,
 * with nothing left to press.
 */
export function RunControlStrip({ streaming, runStatus, runHold, runPolicy, onPause, onResume, onStop, onSteer }: RunControlStripProps) {
  const nextId = React.useId();
  if (runHold?.reason === 'expired') return streaming ? <HoldEndedStrip /> : null;
  if (!streaming || !(onPause || onStop || onSteer)) return null;
  const manual = runStatus === 'paused' && runHold?.reason === 'manual';
  const next = manual && runHold ? runHold.next : [];
  const nextRef = next.length > 0 ? nextId : undefined;
  return (
    <div className="ana-runctl" role="group" aria-label="Control this run">
      <HoldLines manual={manual} next={next} nextId={nextRef} runStatus={runStatus} />
      {onSteer && <SteerForm manual={manual} help={steerHelpFor(manual, runPolicy, runStatus)} nextId={nextRef} onSteer={onSteer} />}
      <RunStripActions runStatus={runStatus} manual={manual} nextId={nextRef} onPause={onPause} onResume={onResume} onStop={onStop} />
    </div>
  );
}

/**
 * What the steer box says: that it replaces the held step, or — while a
 * Manual turn is working — that a steer sent now takes the place of her next
 * step (the server's early steer, filed `superseded`). Nothing otherwise.
 */
export function steerHelpFor(manual: boolean, runPolicy: AnaRunPolicy | null | undefined, runStatus: RunControlStatus): string | null {
  if (manual) return 'The step shown will not run.';
  return runPolicy === 'manual' && runStatus === 'running'
    ? 'Under Manual, a steer sent now replaces her next step unless that step needs your approval; a replaced step does not run.'
    : null;
}

/**
 * The strip's state line, and under a Manual hold what she waits to run and
 * when the wait ends. The polite region is mounted with the strip and filled
 * when she starts waiting: a region that appears with its first words is the
 * case assistive technology misses.
 */
function HoldLines({
  manual,
  next,
  nextId,
  runStatus,
}: {
  manual: boolean;
  next: string[];
  nextId?: string;
  runStatus: RunControlStatus;
}) {
  const waiting = next.length > 0 ? next.join('; ') : 'her next step';
  return (
    <>
      <span aria-live="polite" style={SR_ONLY_STYLE}>
        {manual ? `AnA is waiting for you before: ${waiting}` : ''}
      </span>
      <RunStripState runStatus={runStatus} manual={manual} />
      {nextId && (
        <span id={nextId} className="ana-runctl-next">
          {nextLine(next)}
        </span>
      )}
      {manual && <span className="ana-runctl-help">{`If nobody answers within ${PAUSE_WORDS}, the turn ends.`}</span>}
    </>
  );
}

/** Pause or Resume (under Manual, Run this step), and Stop. Each only when its handler is given. */
function RunStripActions({
  runStatus,
  manual,
  nextId,
  onPause,
  onResume,
  onStop,
}: Pick<RunControlStripProps, 'runStatus' | 'onPause' | 'onResume' | 'onStop'> & { manual: boolean; nextId?: string }) {
  return (
    <div className="ana-runctl-actions">
      {runStatus === 'paused'
        ? onResume && (
            <button
              type="button"
              className={manual ? 'ana-runctl-btn is-primary' : 'ana-runctl-btn'}
              aria-describedby={manual ? nextId : undefined}
              onClick={onResume}
            >
              {manual ? 'Run this step' : 'Resume'}
            </button>
          )
        : onPause && (
            <button type="button" className="ana-runctl-btn" onClick={onPause}>
              Pause
            </button>
          )}
      {onStop && (
        <button type="button" className="ana-runctl-btn is-stop" onClick={onStop}>
          Stop
        </button>
      )}
    </div>
  );
}

/** A Manual hold nobody answered ended the turn: said, with nothing left to press. */
function HoldEndedStrip() {
  return (
    <div className="ana-runctl" role="group" aria-label="Control this run">
      <span className="ana-runctl-state">
        <span className="ana-runctl-dot is-paused" aria-hidden="true">{I.pause}</span>
        Stopped waiting for you
      </span>
    </div>
  );
}

/** Where the run is: working, paused by the person, waiting for them (Manual), or stopping. */
function RunStripState({ runStatus, manual }: { runStatus: RunControlStatus; manual: boolean }) {
  return (
    <span className="ana-runctl-state">
      <span
        className={runStatus === 'paused' || runStatus === 'cancelled' ? 'ana-runctl-dot is-paused' : 'ana-runctl-dot'}
        aria-hidden="true"
      >
        {runStatus === 'paused' ? I.pause : I.dot}
      </span>
      {/* Pause still lands at a round boundary — deliberately: killing a
          tool to pause throws the work away and then redoes it. Stop now
          cuts the step in flight, so the copy must stop saying "after this
          step" for BOTH, and must not claim stopped before the server says
          so. Under Manual nobody paused: she is waiting for the person. */}
      {manual
        ? 'Waiting for you before the next step'
        : runStatus === 'paused'
          ? 'Paused after this step'
          : runStatus === 'cancelled'
            ? 'Stopping…'
            : 'Working'}
    </span>
  );
}

/**
 * The steer box. Under a Manual hold it is "Do this instead": the steer
 * REPLACES the held step, and the box says the step shown will not run.
 *
 * ── The box used to empty whether or not the steer was accepted ──
 * `onSteer(v); setSteer('')` cleared the input synchronously, before anything
 * knew the server's answer — and `interject` answers with a boolean that every
 * call site discarded. A 404 (run already gone), a 409, a validation refusal
 * and a dropped connection all looked identical to success: the sentence
 * vanished from the box, which is the only acknowledgement this control has,
 * and nothing anywhere recorded it. The person had typed an instruction into
 * nothing. Now the text is only cleared once the server has accepted it, and a
 * refusal says so and leaves the sentence where it is, so it can be sent again
 * without retyping.
 */
function SteerForm({
  manual,
  help,
  nextId,
  onSteer,
}: {
  manual: boolean;
  /** Said under the box (and read with it): what a steer sent now does to her next step. */
  help: string | null;
  /** The held step's line, which the box's steer would replace. */
  nextId?: string;
  onSteer: NonNullable<RunControlStripProps['onSteer']>;
}) {
  /* The steer field is separate from the composer's draft on purpose: a steer
     joins the RUNNING turn, a draft starts the next one, and sharing one buffer
     would make it ambiguous which a half-typed sentence was about to do. */
  const [steer, setSteer] = React.useState('');
  /* `steerRefused` exists because the only acknowledgement this control has is
     the box emptying, so a refusal has to say something rather than look like
     a send. */
  const [steerBusy, setSteerBusy] = React.useState(false);
  const [steerRefused, setSteerRefused] = React.useState(false);
  const errId = React.useId();
  const helpId = React.useId();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = steer.trim();
    if (!v || steerBusy) return;
    setSteerBusy(true);
    setSteerRefused(false);
    void Promise.resolve(onSteer(v))
      .then((accepted) => {
        // `undefined` means the handler reports nothing either way; treating
        // that as accepted keeps the old behaviour for any caller that has not
        // been widened, rather than telling the person their steer failed on
        // no evidence.
        if (accepted === false) {
          setSteerRefused(true);
          return;
        }
        setSteer('');
      })
      .catch(() => setSteerRefused(true))
      .finally(() => setSteerBusy(false));
  };
  const describedBy = [steerRefused ? errId : '', manual ? (nextId ?? '') : '', help ? helpId : ''].filter(Boolean).join(' ');
  return (
    <>
      <form className="ana-runctl-steer" onSubmit={submit}>
        <input
          type="text"
          className="ana-runctl-input"
          value={steer}
          maxLength={MAX_INTERJECTION_CHARS}
          onChange={(e) => {
            setSteer(e.target.value);
            if (steerRefused) setSteerRefused(false);
          }}
          placeholder={manual ? 'Or tell AnA what to do instead' : 'Steer this run…'}
          aria-label={manual ? 'Tell AnA what to do instead' : 'Steer this run'}
          aria-invalid={steerRefused || undefined}
          aria-describedby={describedBy || undefined}
        />
        <button type="submit" className="ana-runctl-go" disabled={!steer.trim() || steerBusy}>
          {steerBusy ? 'Sending…' : manual ? 'Do this instead' : 'Steer'}
        </button>
      </form>
      {help && (
        <span id={helpId} className="ana-runctl-help">
          {help}
        </span>
      )}
      {steerRefused && (
        <span id={errId} className="ana-runctl-err" role="status">
          Not sent — AnA did not accept this steer. The text is still here.
        </span>
      )}
    </>
  );
}
