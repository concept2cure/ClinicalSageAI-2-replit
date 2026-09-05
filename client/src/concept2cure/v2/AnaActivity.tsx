/**
 * What AnA is doing, while she is doing it.
 *
 * ── The gap this closes ──────────────────────────────────────────────────────
 * A turn already reports a great deal about itself. `useAnaChat` captures the
 * intent lens AnA read the question through, the document type she detected,
 * every deterministic tool she invoked — with its label, its agentic-loop
 * round, its arguments and its result — her extended reasoning, and the
 * deliverable she produced.
 *
 * The shell rail rendered exactly one line of that:
 *
 *     body: m.text || (m.streaming ? m.statusPhase || 'Thinking…' : '')
 *
 * So while AnA ran a sample-size calculation through a deterministic
 * biostatistics engine, swept the dossier for contradictions and checked
 * citation coverage across three rounds, the person waiting saw the word
 * "Thinking…". Every signal needed to show the work was already arriving over
 * the wire and being discarded at the render layer.
 *
 * ── What it shows, and what it refuses to ────────────────────────────────────
 * Only things that actually happened. Each row is a tool AnA really called,
 * under the label the server gave it; the rounds are her real agentic-loop
 * rounds, so a multi-round investigation reads as the progression it was. A
 * turn that ran no tools renders no tool rows rather than inventing reassuring
 * activity, and a failed step is shown failed rather than quietly dropped —
 * the point is to make the work legible, which is worth nothing if the record
 * is decorated.
 *
 * There is no progress bar and no percentage. Neither is knowable here: the
 * loop runs until AnA decides she has enough, so any bar would be a fiction
 * with a number on it.
 *
 * @module client/src/concept2cure/v2/AnaActivity
 */

import React from 'react';

import { SR_ONLY_STYLE } from '../hooks/useChatUpload';
import { I } from './icons';
import type { AnaToolCall } from '../components/ana/useAnaChat';
import { byRound, formatElapsed, LENS_PHRASE } from '../components/ana/anaProgress';
import { statusGlyph } from './AnaWorkSections';
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
  /** Extended reasoning, when the model produced any. */
  thinking?: string;
  /** Title of the deliverable produced this turn, if one was. */
  draftTitle?: string;
  /**
   * Client clock (ms) when the turn was sent, and when it ended. With both the
   * collapsed line can say how long the turn took; with only the first, the
   * live phase carries a running clock ("Running 2 steps… · 57s") so a long
   * silent window reads as time passing rather than as a stall.
   */
  startedAt?: number;
  completedAt?: number;
}



/**
 * How much of a still-streaming thought to show. Long enough to be a real
 * sentence, short enough that it never competes with the answer arriving
 * beneath it.
 */
const THOUGHT_TAIL = 180;

/**
 * The most recent thing she has actually said to herself.
 *
 * Her extended reasoning streams token by token, and the whole of it is the
 * wrong thing to put above a streaming answer — it is long, and it grows. So
 * while the turn is in flight only the newest stretch is shown, and the full
 * text is there once the record is opened.
 *
 * It is her TEXT, truncated — never a summary of it. A paraphrase would be this
 * component inventing a thought she did not have, which is the same defect as
 * inventing a step she did not run. The leading ellipsis marks the cut so a
 * fragment is never read as a complete sentence.
 */
function latestThought(thinking: string): string {
  const lines = thinking.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1] ?? '';
  if (last.length <= THOUGHT_TAIL) return last;
  const cut = last.slice(last.length - THOUGHT_TAIL);
  // Start at a word boundary; a half-word reads as a rendering bug.
  const space = cut.indexOf(' ');
  return `…${space > 0 ? cut.slice(space + 1) : cut}`;
}


export function AnaActivity({
  streaming,
  phase,
  lens,
  documentType,
  toolCalls,
  thinking,
  draftTitle,
  startedAt,
  completedAt,
}: AnaActivityProps) {
  const calls = toolCalls ?? [];
  // The clock ticks only while the turn is live AND has a start; a settled turn
  // reads its recorded end, and a turn with no start claims no duration.
  const now = useNow(Boolean(streaming) && typeof startedAt === 'number');
  const elapsed =
    typeof startedAt === 'number' ? formatElapsed((completedAt ?? now) - startedAt) : '';
  const rounds = byRound(calls);
  const multiRound = rounds.length > 1;
  const ran = calls.filter(c => c.status !== 'running').length;
  const failed = calls.filter(c => c.status === 'error').length;

  // While working the record is open — that is the whole point. Once the answer
  // has landed it collapses, because by then the answer is what matters and the
  // work is something you go back to.
  //
  // Declared before the early returns below: this component legitimately
  // renders nothing for a turn that did no reportable work, and a hook after
  // that branch would run on some turns and not others.
  const [open, setOpen] = React.useState(false);
  const bodyId = React.useId();

  // A settled turn that did nothing worth reporting adds nothing. Say nothing.
  const hasDecision = Boolean(lens && LENS_PHRASE[lens]) || Boolean(documentType);
  const hasBody = calls.length > 0 || hasDecision || Boolean(thinking) || Boolean(draftTitle);
  if (!streaming && !hasBody) return null;
  if (streaming && !hasBody && !phase) return null;

  const expanded = Boolean(streaming) || open;

  // What the collapsed line says. A failure and a deliverable both appear here
  // rather than only inside the disclosure: they are OUTCOMES, and an outcome
  // you have to expand a twisty to discover is one the product is hiding.
  // Steps stay inside — those are the how, and the how is what you go looking
  // for.
  const summary = (() => {
    const parts: string[] = [];
    // "checks" was wrong: a sample-size calculation and a document draft are
    // both steps here and neither is a check. `step` also matches the per-row
    // class name, so summary and detail share one vocabulary.
    if (ran > 0) parts.push(`${ran} ${ran === 1 ? 'step' : 'steps'} completed`);
    if (failed > 0) parts.push(`${failed} failed`);
    if (draftTitle) parts.push(`Drafted ${draftTitle}`);
    if (thinking) parts.push('reasoning');
    // Only a turn with a recorded END gets a duration on its collapsed line; a
    // turn that settled without one (stopped, failed, or reopened from history)
    // must not read a clock off the current time.
    if (elapsed && typeof completedAt === 'number') parts.push(`in ${elapsed}`);
    return parts.length > 0 ? parts.join(' · ') : 'How this was read';
  })();

  /* The spoken version of this record.
   *
   * Sighted users read the rows; this is the one narrow region a screen reader
   * is told about. It carries the phase plus the OUTCOMES — a step that failed,
   * a deliverable produced — because those are status changes a user needs and
   * would otherwise never hear: the rows themselves are not in a live region.
   *
   * It is always mounted and only its text changes. A live region that appears
   * in the same paint as its first content is the documented case AT misses. */
  const spoken = [
    streaming && phase ? phase : null,
    failed > 0 ? `${failed} ${failed === 1 ? 'step' : 'steps'} did not complete` : null,
    draftTitle ? `Drafted ${draftTitle}` : null,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <div className="ana-activity" data-streaming={streaming ? 'true' : 'false'}>
      <span aria-live="polite" style={SR_ONLY_STYLE}>{spoken}</span>
      {!streaming && (
        <button
          type="button"
          className="ana-activity-toggle"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => setOpen(o => !o)}
        >
          {open ? I.chevDown : I.chevRight}
          <span>{summary}</span>
        </button>
      )}

      {/* Mounted while collapsed and hidden with the attribute, so the
          toggle's aria-controls always resolves (SC 4.1.2) — the same rule as
          the dock's sections. */}
      {(
        <div className="ana-activity-body" id={bodyId} hidden={!expanded}>
          {/* The live phase. `polite` so a screen-reader user hears progress
              without it interrupting the answer as it arrives. */}
          {streaming && phase && (
            <div className="ana-activity-phase">
              <span className="ana-activity-pulse" aria-hidden="true">{I.dot}</span>
              {phase}
              {elapsed && <span className="ana-activity-clock">· {elapsed}</span>}
            </div>
          )}

          {hasDecision && (
            <div className="ana-activity-read">
              {lens && LENS_PHRASE[lens] ? `Reading this as ${LENS_PHRASE[lens]}` : 'Reading this question'}
              {documentType ? ` · ${documentType}` : ''}
            </div>
          )}

          {/* Her reasoning. While the turn is in flight this is the newest
              stretch of it, live; once the record is opened after the fact it
              is the whole thing, in a bounded scroll so a long deliberation
              cannot push the answer off the screen. Both are her own words. */}
          {thinking && (
            streaming ? (
              <div className="ana-activity-think is-live">{latestThought(thinking)}</div>
            ) : (
              /* tabIndex + a name, because this one SCROLLS. A container with
                 `overflow-y:auto` and no tab stop is unreachable by keyboard —
                 a sighted mouse user gets the whole deliberation and a
                 keyboard-only user gets the first 240px of it, with no way to
                 know more exists (WCAG 2.1.1). The live variant above does not
                 scroll, so giving it a tab stop would only add an empty stop
                 to the order. */
              <div
                className="ana-activity-think"
                tabIndex={0}
                role="region"
                aria-label="AnA's reasoning"
              >
                {thinking}
              </div>
            )
          )}

          {rounds.map(({ round, calls: cs }) => (
            <div key={round} className="ana-activity-round">
              {multiRound && (
                <div className="ana-activity-round-h">
                  {/* Round 2 exists because round 1 did not settle it. Naming
                      that is the difference between "it took a while" and
                      "she went back for more". */}
                  {round === 1 ? 'First pass' : `Went back · round ${round}`}
                </div>
              )}
              {cs.map((c, i) => (
                <div
                  key={`${round}-${i}-${c.name}`}
                  className={`ana-activity-step is-${c.status}`}
                >
                  <span className="ana-activity-glyph" aria-hidden="true">{statusGlyph(c.status)}</span>
                  <span className="ana-activity-label">{c.label || c.name}</span>
                  {c.status === 'error' && (
                    /* The server writes a sentence for this — "AnA couldn't
                       finish searching the literature. She'll continue with
                       what she has." — which names the step and the
                       consequence. `c.result` is deliberately NOT used here:
                       it is the raw tool payload, and putting that in front of
                       a customer is the internals-in-copy defect this repo has
                       already had once. */
                    <span className="ana-activity-note">{c.message || 'did not complete'}</span>
                  )}
                </div>
              ))}
            </div>
          ))}

          {draftTitle && (
            <div className="ana-activity-step is-success">
              <span className="ana-activity-glyph" aria-hidden="true">{I.fileText}</span>
              <span className="ana-activity-label">Drafted {draftTitle}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AnaActivity;
