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

import { I } from './icons';
import type { AnaToolCall } from '../components/ana/useAnaChat';

/** How AnA read the question. Rendered as her opening decision, not a label. */
const LENS_PHRASE: Record<string, string> = {
  audit: 'auditing it',
  improve: 'looking for what to strengthen',
  risk: 'weighing the risk',
  strategy: 'thinking strategically',
  compare: 'comparing',
};

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
}

function glyph(status: AnaToolCall['status']): React.ReactElement {
  if (status === 'success') return I.check;
  if (status === 'error') return I.alertTriangle;
  return I.dot;
}

/**
 * Group calls by agentic-loop round, preserving order. A single-round turn
 * renders flat — the round headings only earn their space once AnA actually
 * went back for more.
 */
function byRound(calls: AnaToolCall[]): Array<{ round: number; calls: AnaToolCall[] }> {
  const groups = new Map<number, AnaToolCall[]>();
  for (const c of calls) {
    const r = typeof c.round === 'number' && c.round > 0 ? c.round : 1;
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(c);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([round, cs]) => ({ round, calls: cs }));
}

export function AnaActivity({
  streaming,
  phase,
  lens,
  documentType,
  toolCalls,
  thinking,
  draftTitle,
}: AnaActivityProps) {
  const calls = toolCalls ?? [];
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
    if (ran > 0) parts.push(`${ran} ${ran === 1 ? 'check' : 'checks'} run`);
    if (failed > 0) parts.push(`${failed} failed`);
    if (draftTitle) parts.push(`drafted ${draftTitle}`);
    if (thinking) parts.push('reasoning');
    return parts.length > 0 ? parts.join(' · ') : 'How this was answered';
  })();

  return (
    <div className="ana-activity" data-streaming={streaming ? 'true' : 'false'}>
      {!streaming && (
        <button
          type="button"
          className="ana-activity-toggle"
          aria-expanded={expanded}
          onClick={() => setOpen(o => !o)}
        >
          {open ? I.chevDown : I.chevRight}
          <span>{summary}</span>
        </button>
      )}

      {expanded && (
        <div className="ana-activity-body">
          {/* The live phase. `polite` so a screen-reader user hears progress
              without it interrupting the answer as it arrives. */}
          {streaming && phase && (
            <div className="ana-activity-phase" aria-live="polite">
              <span className="ana-activity-pulse" aria-hidden="true">{I.dot}</span>
              {phase}
            </div>
          )}

          {hasDecision && (
            <div className="ana-activity-read">
              {lens && LENS_PHRASE[lens] ? `Reading this as ${LENS_PHRASE[lens]}` : 'Reading this'}
              {documentType ? ` · ${documentType}` : ''}
            </div>
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
                  <span className="ana-activity-glyph" aria-hidden="true">{glyph(c.status)}</span>
                  <span className="ana-activity-label">{c.label || c.name}</span>
                  {c.status === 'error' && <span className="ana-activity-note">didn’t complete</span>}
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
