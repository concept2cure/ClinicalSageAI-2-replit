/**
 * How well-grounded this answer is.
 *
 * ── The gap this closes ──────────────────────────────────────────────────────
 * The server grades every answer it finishes. `validateEvidence` counts the
 * sources, splits the answer's claims into grounded and weak, flags each weak
 * one by kind, and writes a one-line reviewer risk summary; post-processing
 * ships all of it as a `grounding_strip` event. `useAnaChat` receives that and
 * stores it on the message, under a comment reading "for the grounding chip on
 * the reply".
 *
 * There was no chip. Nothing in the product read `groundedClaims`, `weakClaims`
 * or `flaggedClaims` — so a reviewer reading "the three cited precedents
 * cleared at 0.4-0.55" could not tell whether it rested on three precedents or
 * on nothing. On a surface people draft submissions from, that is the single
 * most useful thing an assistant can say about its own output.
 *
 * ── The rule this component exists to enforce ────────────────────────────────
 * `useAnaChat` fills every count with 0 when the field is absent, so a turn the
 * evidence pipeline never graded arrives as:
 *
 *     { validated: false, sourceCount: 0, groundedClaims: 0, weakClaims: 0 }
 *
 * which is byte-identical to a turn that WAS graded and came back clean.
 * Rendered without care that becomes "0 weak claims" — the strongest
 * reassurance the surface can give, produced by having checked nothing.
 *
 * So `validated` gates every number. Unvalidated says it was not assessed and
 * shows no count at all. That is not a failure state: plenty of answers
 * legitimately go ungraded, and saying so is honest where a zero is not.
 *
 * @module client/src/concept2cure/v2/AnaGrounding
 */

import React from 'react';

import { I } from './icons';

export interface AnaGroundingEvidence {
  validated: boolean;
  sourceCount: number;
  groundedClaims: number;
  weakClaims: number;
  missingSupport: number;
  riskSummary?: string;
  flaggedClaims?: { kind: 'ungrounded' | 'overclaim' | 'contradiction'; text: string }[];
}

/** How the server's flag kinds read in a sentence a reviewer would use. */
const KIND_WORD: Record<string, string> = {
  ungrounded: 'unsupported',
  overclaim: 'overclaim',
  contradiction: 'contradiction',
};

/** "one overclaim, one unsupported" — the flags, counted and named. */
function describeFlags(flags: AnaGroundingEvidence['flaggedClaims']): string {
  if (!flags || flags.length === 0) return '';
  const counts = new Map<string, number>();
  for (const f of flags) {
    const w = KIND_WORD[f.kind] ?? f.kind;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([w, n]) => (n === 1 ? `one ${w}` : `${n} ${w}s`))
    .join(', ');
}

export function AnaGrounding({ evidence }: { evidence?: AnaGroundingEvidence }) {
  if (!evidence) return null;

  /* NOT ASSESSED. Checked before any count is read, because every count is
     zero in this state and zero reads as a clean bill of health. */
  if (!evidence.validated) {
    return (
      <div className="ana-grounding">
        <div className="ana-grounding-row">
          <span className="ana-grounding-ic is-unknown" aria-hidden="true">{I.info}</span>
          <span>Grounding not assessed for this answer</span>
        </div>
      </div>
    );
  }

  const { sourceCount, groundedClaims, weakClaims, flaggedClaims, riskSummary } = evidence;
  const total = groundedClaims + weakClaims;
  const flagWords = describeFlags(flaggedClaims);
  /* The first flagged claim is quoted rather than merely counted: "2 weak"
     tells a reviewer there is a problem and not which sentence has it. */
  const firstFlag = flaggedClaims && flaggedClaims.length > 0 ? flaggedClaims[0] : null;

  /* ASSESSED, BUT NOTHING GRADED, IS NOT A PASS EITHER.
   *
   * `validated` gating the numbers closed half of this. The other half is that
   * the server's `validated` is `totalIssues === 0 || …`, so an answer the
   * claim extractor found NOTHING in comes back validated with every count at
   * zero — and this row rendered a green check reading the bare "Claims
   * grounded". Grounded on what? No claim was graded; the extractor identified
   * none to grade.
   *
   * That is the same false reassurance the "not assessed" branch above exists
   * to prevent, arriving by the other route: there, zero meant ungraded; here,
   * zero means nothing found. Neither is a clean bill of health, and only one
   * of them was being reported honestly.
   *
   * The check is kept for the case it was earned — claims were graded and
   * came back grounded — and dropped for the case where there is nothing to
   * certify. */
  const gradedNothing = total === 0;

  return (
    <div className="ana-grounding">
      <div className="ana-grounding-row">
        <span
          className={`ana-grounding-ic ${gradedNothing ? 'is-unknown' : 'is-ok'}`}
          aria-hidden="true"
        >
          {gradedNothing ? I.info : I.check}
        </span>
        <span>
          {gradedNothing
            ? 'No claims identified to check in this answer'
            : `${groundedClaims} of ${total} claims grounded`}
          {sourceCount > 0 ? ` · ${sourceCount} ${sourceCount === 1 ? 'source' : 'sources'}` : ''}
        </span>
      </div>

      {weakClaims > 0 && (
        <div className="ana-grounding-row">
          <span className="ana-grounding-ic is-weak" aria-hidden="true">{I.alertTriangle}</span>
          <span>
            {weakClaims} weak
            {flagWords ? <> — <span className="ana-grounding-kinds">{flagWords}</span></> : null}
          </span>
        </div>
      )}

      {firstFlag && (
        <div className="ana-grounding-claim">
          “{firstFlag.text}” — {KIND_WORD[firstFlag.kind] ?? firstFlag.kind}
        </div>
      )}

      {/* The server's own sentence, when it wrote one. Never synthesised here:
          a risk summary this component invented would be an assessment nothing
          performed. */}
      {riskSummary && <div className="ana-grounding-risk">{riskSummary}</div>}
    </div>
  );
}

export default AnaGrounding;
