/**
 * What AnA is doing, while she is doing it — the per-turn record in the
 * transcript.
 *
 * ── The gap this closes ──────────────────────────────────────────────────────
 * A turn already reports a great deal about itself. `useAnaChat` captures the
 * intent lens AnA read the question through, the document type she detected,
 * the plan she declared, every deterministic tool she invoked — with its
 * label, its agentic-loop round, its arguments and its duration — her extended
 * reasoning, and the deliverable she produced. The rail used to render one
 * line of that ("Thinking…") while all of it arrived over the wire.
 *
 * ── How it reads ─────────────────────────────────────────────────────────────
 * One quiet bordered list, one row per thing that happened, in the order it
 * happened: "Planned 5 steps", "Searching the literature for estimand",
 * "Drafted Clinical Overview 2.5". The verb is muted and the object is not, so
 * the eye lands on WHAT she worked on. A row with more to say — how long a
 * step took, the inputs she passed, the steps of her plan, the whole of her
 * reasoning — carries its own chevron and opens in place. While she works the
 * list is open; once the answer has landed it folds to one summary line.
 *
 * ── What it refuses to show ──────────────────────────────────────────────────
 * Only things that actually happened. Each tool row is a tool AnA really
 * called, under the label the server gave it; a plan row is a plan she
 * declared; a failed step is shown failed, in the sentence the server wrote,
 * never as the raw payload. A turn that ran nothing renders nothing. There is
 * no progress bar and no percentage: the loop runs until she decides she has
 * enough, so any bar would be a fiction with a number on it.
 *
 * Every host renders this one component — the persistent rail, the full-page
 * conversation, the document editor, the eCTD co-author and risk-based
 * monitoring — through `activityPropsFor`, the one mapping from a turn.
 *
 * @module client/src/concept2cure/v2/AnaActivity
 */

import React from 'react';

import { SR_ONLY_STYLE } from '../hooks/useChatUpload';
import { I } from './icons';
import type { AnaChatMessage, AnaToolCall } from '../components/ana/useAnaChat';
import type { AnaPlanChange, AnaPlanStep } from '../components/ana/useAnaChat.types';
import { formatElapsed, LENS_PHRASE, PLAN_TOOL } from '../components/ana/anaProgress';
import { statusGlyph } from './AnaWorkSections';
import { stepDuration } from './anaWorkModel';
import { useNow } from './useNow';

export interface AnaActivityProps {
  /** True while the turn is still in flight. */
  streaming?: boolean;
  /** Server-reported phase, e.g. "Loading project memory…". */
  phase?: string;
  /** Detected intent lens for this turn (audit / risk / compare / …). */
  lens?: string;
  /** Document type AnA detected she was being asked to draft. */
  documentType?: string;
  /** Deterministic tools invoked this turn. */
  toolCalls?: AnaToolCall[];
  /** Every change to the plan she declared, in arrival order. */
  planChanges?: AnaPlanChange[];
  /**
   * Her plan as last declared. Read only when there is no change history —
   * a thread reopened later, which persists the final plan and not when each
   * step changed — so the row says "Plan", not "Planned".
   */
  plan?: AnaPlanStep[];
  /** Extended reasoning, when the model produced any. */
  thinking?: string;
  /** Title of the deliverable produced this turn, if one was. */
  draftTitle?: string;
  /** The answer came from a fallback provider — a disclosure, never hidden. */
  fallback?: boolean;
  /**
   * Client clock (ms) when the turn was sent, and when it ended. With both the
   * collapsed line can say how long the turn took; with only the first, the
   * live phase carries a running clock ("Running 2 steps… · 57s") so a long
   * silent window reads as time passing rather than as a stall.
   */
  startedAt?: number;
  completedAt?: number;
}

/** The one mapping from a turn to its record. Every host uses it. */
export function activityPropsFor(m: AnaChatMessage): AnaActivityProps {
  return {
    streaming: m.streaming,
    phase: m.statusPhase,
    lens: m.detectedLens,
    documentType: m.detectedDocumentType,
    toolCalls: m.toolCalls,
    planChanges: m.planChanges,
    plan: m.plan,
    thinking: m.thinking,
    draftTitle: m.generatedDraft?.title,
    fallback: m.fallback,
    startedAt: m.sentAt,
    completedAt: m.completedAt,
  };
}

/** True when the record has something real to show for a settled turn. */
export function hasReportableWork(a: AnaActivityProps): boolean {
  return Boolean(
    (a.toolCalls && a.toolCalls.length > 0) ||
      (a.planChanges && a.planChanges.length > 0) ||
      (a.plan && a.plan.length > 0) ||
      (a.lens && LENS_PHRASE[a.lens]) ||
      a.documentType ||
      a.thinking ||
      a.draftTitle,
  );
}

/**
 * How much of a still-streaming thought to show. Long enough to be a real
 * sentence, short enough that it never competes with the answer arriving
 * beneath it.
 */
const THOUGHT_TAIL = 180;

/**
 * The most recent thing she has actually said to herself — her TEXT,
 * truncated, never a summary of it. A paraphrase would be this component
 * inventing a thought she did not have. The leading ellipsis marks the cut so
 * a fragment is never read as a complete sentence.
 */
function latestThought(thinking: string): string {
  const lines = thinking.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1] ?? '';
  if (last.length <= THOUGHT_TAIL) return last;
  const cut = last.slice(last.length - THOUGHT_TAIL);
  const space = cut.indexOf(' ');
  return `…${space > 0 ? cut.slice(space + 1) : cut}`;
}

/**
 * A step label split into its verb and its object. The server quotes the
 * argument it names — `Searching the literature for "estimand"` — so the
 * quoted span is the object; a label with none has no object and reads whole.
 */
export function splitLabel(label: string): { verb: string; object?: string; rest?: string } {
  const m = /^(.*?)\s*"([^"]+)"(.*)$/.exec(label);
  if (!m || !m[2].trim()) return { verb: label };
  return { verb: m[1].trim(), object: m[2].trim(), ...(m[3].trim() ? { rest: m[3].trim() } : {}) };
}

/* ── Rows ─────────────────────────────────────────────────────────────────── */

/** A row that may open in place. The disclosure is mounted while collapsed so aria-controls resolves. */
function Row({
  status,
  glyph,
  verb,
  object,
  rest,
  trailing,
  note,
  detail,
}: {
  status: 'running' | 'success' | 'error';
  glyph?: React.ReactElement;
  verb: string;
  object?: string;
  rest?: string;
  trailing?: string;
  /** A sentence that must stay visible (a failure), never behind the chevron. */
  note?: string;
  /** What opens in place. The row's visible words are the button's name. */
  detail?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  const text = (
    <span className="ana-activity-text">
      <span className="ana-activity-verb">{verb}</span>
      {/* The spaces are text nodes between the spans, not inside them, so a
          screen reader's name for the row reads "Planned 2 steps", not
          "Planned2 steps". */}
      {object ? <>{' '}<span className="ana-activity-obj">{object}</span></> : null}
      {rest ? <>{' '}<span className="ana-activity-verb">{rest}</span></> : null}
    </span>
  );
  return (
    <li className={`ana-activity-step is-${status}${object ? ' has-obj' : ''}`}>
      <span className="ana-activity-glyph" aria-hidden="true">{glyph ?? statusGlyph(status)}</span>
      {detail ? (
        <button
          type="button"
          className="ana-activity-row"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
        >
          {text}
          {trailing ? <span className="ana-activity-t">{trailing}</span> : null}
          <span className="ana-activity-chev" aria-hidden="true">{open ? I.chevDown : I.chevRight}</span>
        </button>
      ) : (
        <span className="ana-activity-row is-static">
          {text}
          {trailing ? <span className="ana-activity-t">{trailing}</span> : null}
        </span>
      )}
      {note ? <span className="ana-activity-note">{note}</span> : null}
      {detail ? (
        <div className="ana-activity-detail" id={id} hidden={!open}>
          {detail}
        </div>
      ) : null}
    </li>
  );
}

function ToolRow({ c, now }: { c: AnaToolCall; now: number }) {
  const { verb, object, rest } = splitLabel(c.label || c.name);
  const hasInput = c.input !== undefined && c.input !== null;
  const took = c.status === 'running' ? '' : stepDuration(c, now);
  const detail =
    hasInput || took ? (
      <>
        {took && <div className="ana-activity-kv">Took {took}{typeof c.round === 'number' ? ` · round ${c.round}` : ''}</div>}
        {hasInput && (
          /* A scroll container with a tab stop, named as a region (SC 2.1.1).
             The inputs she passed — never the raw result payload, which is the
             internals-in-copy defect this repo has already had once. */
          <pre className="ana-activity-pre" tabIndex={0} role="region" aria-label="Inputs AnA passed to this step">
            {JSON.stringify(c.input, null, 2)}
          </pre>
        )}
      </>
    ) : undefined;
  return (
    <Row
      status={c.status}
      verb={verb}
      object={object}
      rest={rest}
      trailing={c.status === 'running' ? 'running' : took || undefined}
      note={c.status === 'error' ? c.message || 'did not complete' : undefined}
      detail={detail}
    />
  );
}

/** True when a step that succeeded already carries the draft's title in its label. */
function namedBySuccessfulStep(calls: AnaToolCall[], title: string): boolean {
  return calls.some((c) => c.status === 'success' && (c.label ?? '').includes(title));
}

/**
 * The folded line. Failures and deliverables are OUTCOMES and appear here
 * rather than only inside the disclosure — an outcome you have to open a
 * twisty to discover is one the product is hiding. So is a fallback answer.
 */
function foldedLine(o: {
  changes: AnaPlanChange[];
  finalPlan: AnaPlanStep[];
  ran: number;
  failed: number;
  draftTitle?: string;
  thinking?: string;
  fallback?: boolean;
  /** Set only for a turn with a recorded END; never read off the clock. */
  duration: string;
}): string {
  // "Planned" only when the declaration was seen; a reopened thread knows the
  // final list and not how it was built, so it says "Plan".
  const persisted = o.changes.length === 0 && o.finalPlan.length > 0;
  const planned = persisted ? o.finalPlan.length : o.changes.filter((c) => c.initial && c.kind === 'added').length;
  const steps = (n: number) => `${n} ${n === 1 ? 'step' : 'steps'}`;
  const parts = [
    // With a plan, her plan's items are the steps and the tool calls are
    // tools, so "3 steps" on the rail and "4 steps completed" here never read
    // as a contradiction.
    o.ran > 0 ? (planned > 0 ? `${o.ran} ${o.ran === 1 ? 'tool' : 'tools'} run` : `${steps(o.ran)} completed`) : '',
    o.failed > 0 ? `${o.failed} failed` : '',
    o.draftTitle ? `Drafted ${o.draftTitle}` : '',
    o.thinking ? 'reasoning' : '',
    o.fallback ? 'answered by a fallback provider' : '',
  ].filter(Boolean);
  // The plan is the record's first row, in the same words; leading with it
  // here too made the opened record say it twice, three words apart. It leads
  // only when it is all there is to say.
  if (parts.length === 0 && planned > 0) parts.push(`${persisted ? 'Plan ·' : 'Planned'} ${steps(planned)}`);
  if (o.duration) parts.push(`in ${o.duration}`);
  return parts.length > 0 ? parts.join(' · ') : 'How this was read';
}

type Item =
  | { kind: 'tool'; t: number; seq: number; call: AnaToolCall }
  | { kind: 'plan'; t: number; seq: number; steps: string[]; persisted?: boolean }
  | { kind: 'added'; t: number; seq: number; title: string };

/**
 * Tool rows and plan rows in the order they happened. The first plan she
 * declared is one row ("Planned 5 steps"), not five; a step added later is
 * its own row. Starts and completions are not rows — the panel's rail carries
 * them — so the record stays the work, not bookkeeping. The plan tool's own
 * call is shown as the plan it recorded; a FAILED plan call stays a failed
 * row, because a failure is never folded away.
 */
function orderedItems(calls: AnaToolCall[], changes: AnaPlanChange[], plan: AnaPlanStep[]): Item[] {
  const items: Item[] = [];
  let seq = 0;
  let lastT = Number.NEGATIVE_INFINITY;
  for (const c of calls) {
    if (c.name === PLAN_TOOL && c.status !== 'error') continue;
    lastT = typeof c.startedAt === 'number' ? c.startedAt : lastT;
    items.push({ kind: 'tool', t: lastT, seq: seq++, call: c });
  }
  const initial = changes.filter((c) => c.initial && c.kind === 'added');
  if (initial.length > 0) {
    items.push({ kind: 'plan', t: initial[0].at, seq: seq++, steps: initial.map((c) => c.title) });
  } else if (changes.length === 0 && plan.length > 0) {
    // A reopened thread: the final plan, first, with no claim about when.
    items.push({ kind: 'plan', t: Number.NEGATIVE_INFINITY, seq: -1, steps: plan.map((s) => s.title), persisted: true });
  }
  for (const c of changes) {
    if (c.initial || c.kind !== 'added') continue;
    items.push({ kind: 'added', t: c.at, seq: seq++, title: c.title });
  }
  return items.sort((a, b) => (a.t === b.t ? a.seq - b.seq : a.t - b.t));
}

export function AnaActivity({
  streaming,
  phase,
  lens,
  documentType,
  toolCalls,
  planChanges,
  plan,
  thinking,
  draftTitle,
  fallback,
  startedAt,
  completedAt,
}: AnaActivityProps) {
  const calls = toolCalls ?? [];
  const changes = planChanges ?? [];
  const finalPlan = plan ?? [];
  // The clock ticks only while the turn is live AND has a start; a settled turn
  // reads its recorded end, and a turn with no start claims no duration.
  const now = useNow(Boolean(streaming) && typeof startedAt === 'number');
  const elapsed = typeof startedAt === 'number' ? formatElapsed((completedAt ?? now) - startedAt) : '';
  const work = calls.filter((c) => c.name !== PLAN_TOOL || c.status === 'error');
  const ran = work.filter((c) => c.status !== 'running').length;
  const failed = work.filter((c) => c.status === 'error').length;
  // Round headers say "she went back for more". With a declared plan the plan
  // is the structure, and every plan update takes a round of its own, so the
  // first step after "Planned 3 steps" would read "Went back · round 2" when
  // nothing had sent her back. Rounds are named only when there is no plan.
  const planned = finalPlan.length > 0 || changes.length > 0;
  const multiRound =
    !planned && new Set(work.map((c) => (typeof c.round === 'number' && c.round > 0 ? c.round : 1))).size > 1;

  // While working the record is open — that is the whole point. Once the answer
  // has landed it folds, because by then the answer is what matters and the
  // work is something you go back to. Declared before the early returns: this
  // component legitimately renders nothing for a turn with nothing to report.
  const [open, setOpen] = React.useState(false);
  const bodyId = React.useId();

  const lensPhrase = lens && LENS_PHRASE[lens] ? LENS_PHRASE[lens] : null;
  const hasDecision = Boolean(lensPhrase) || Boolean(documentType);
  const hasBody = hasReportableWork({ toolCalls: calls, planChanges: changes, plan: finalPlan, lens, documentType, thinking, draftTitle });
  if (!streaming && !hasBody) return null;
  if (streaming && !hasBody && !phase) return null;

  const expanded = Boolean(streaming) || open;
  const summary = foldedLine({
    changes,
    finalPlan,
    ran,
    failed,
    draftTitle,
    thinking,
    fallback,
    duration: elapsed && typeof completedAt === 'number' ? elapsed : '',
  });

  /* The spoken version of this record: the phase plus the OUTCOMES, in one
     always-mounted polite region (a region that appears in the same paint as
     its first content is the documented case AT misses). The rows themselves
     are not live. */
  const spoken = [
    streaming && phase ? phase : null,
    failed > 0 ? `${failed} ${failed === 1 ? 'step' : 'steps'} did not complete` : null,
    draftTitle ? `Drafted ${draftTitle}` : null,
  ]
    .filter(Boolean)
    .join('. ');

  let lastRound = 0;
  return (
    <div className="ana-activity" data-streaming={streaming ? 'true' : 'false'}>
      <span aria-live="polite" style={SR_ONLY_STYLE}>{spoken}</span>
      {!streaming && (
        <button
          type="button"
          className="ana-activity-toggle"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="ana-activity-toggle-t">{summary}</span>
          {open ? I.chevDown : I.chevRight}
        </button>
      )}

      <div className="ana-activity-body" id={bodyId} hidden={!expanded}>
        <ol className="ana-activity-list">
          {hasDecision && (
            <Row
              status="success"
              glyph={I.eye}
              verb={
                lensPhrase
                  ? `Reading this as ${lensPhrase}${documentType ? ` · drafting ${documentType}` : ''}`
                  : `Drafting ${documentType}`
              }
            />
          )}

          {/* Her reasoning: while in flight the newest stretch, live; once
              settled the whole of it behind the row's chevron, in a bounded
              scroll so a long deliberation cannot push the answer away. */}
          {thinking &&
            (streaming ? (
              <li className="ana-activity-step is-running">
                <span className="ana-activity-glyph" aria-hidden="true">{I.sparkles}</span>
                <span className="ana-activity-row is-static">
                  <span className="ana-activity-text">
                    <span className="ana-activity-verb">Reasoning</span>
                  </span>
                </span>
                <div className="ana-activity-think is-live">{latestThought(thinking)}</div>
              </li>
            ) : (
              <Row
                status="success"
                glyph={I.sparkles}
                verb="Reasoned through the question"
                detail={
                  <div className="ana-activity-think" tabIndex={0} role="region" aria-label="AnA's reasoning">
                    {thinking}
                  </div>
                }
              />
            ))}

          {orderedItems(calls, changes, finalPlan).map((it) => {
            if (it.kind === 'plan') {
              return (
                <Row
                  key={`p-${it.seq}`}
                  status="success"
                  glyph={I.list}
                  verb={it.persisted ? 'Plan ·' : 'Planned'}
                  object={`${it.steps.length} ${it.steps.length === 1 ? 'step' : 'steps'}`}
                  detail={
                    <ol className="ana-activity-plan">
                      {it.steps.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ol>
                  }
                />
              );
            }
            if (it.kind === 'added') {
              return <Row key={`a-${it.seq}`} status="success" glyph={I.plus} verb="Added step" object={it.title} />;
            }
            const round = typeof it.call.round === 'number' && it.call.round > 0 ? it.call.round : 1;
            const header =
              multiRound && round !== lastRound ? (
                /* Round 2 exists because round 1 did not settle it. Naming
                   that is the difference between "it took a while" and "she
                   went back for more". */
                <li className="ana-activity-round-h" key={`r-${round}-${it.seq}`}>
                  {round === 1 ? 'First pass' : `Went back · round ${round}`}
                </li>
              ) : null;
            lastRound = round;
            return (
              <React.Fragment key={`t-${it.seq}`}>
                {header}
                <ToolRow c={it.call} now={now} />
              </React.Fragment>
            );
          })}

          {/* One sentence, not verb + object: the title is the deliverable's
              name, and the card beneath the turn already sets it large. Left
              out when the step that wrote it already names it ("Drafting X",
              checked): the same title twice, one row apart, says nothing new. */}
          {draftTitle && !namedBySuccessfulStep(work, draftTitle) && (
            <Row status="success" glyph={I.fileText} verb={`Drafted ${draftTitle}`} />
          )}

          {fallback && !streaming && (
            <Row status="error" verb="Answered by" object="a fallback provider" />
          )}

          {/* The live phase, last: what she is doing right now, with a running
              clock so a long silent window reads as time passing. */}
          {streaming && phase && (
            <li className="ana-activity-phase">
              <span className="ana-activity-pulse" aria-hidden="true">{I.dot}</span>
              <span>{phase}</span>
              {elapsed && <span className="ana-activity-clock">{elapsed}</span>}
            </li>
          )}
        </ol>
      </div>
    </div>
  );
}

export default AnaActivity;
