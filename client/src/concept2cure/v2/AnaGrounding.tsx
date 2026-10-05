/**
 * What was checked about this answer.
 *
 * ── What it shows (2026-10-04, AnA reasoning) ────────────────────────────────
 * Two readings, in this order, never merged:
 *
 *   1. The engine's check. The server compares every identifier, regulation,
 *      quote and figure in the answer with what AnA consulted this turn (the
 *      tools that ran, the web, the project data she was given, the person's
 *      own message) and names the verdicts the answer states
 *      (server/services/ana/answer-grounding.ts). "Found" means it is in this
 *      turn's sources, not that the sentence around it is right; the strip
 *      says "found in this turn's sources" and no more.
 *   2. AnA's own labels. [KNOWN] / [INFERRED] / [MISSING] are the model
 *      describing its own claims. They are reported as hers: a labelled claim
 *      is "labelled", not "grounded", and a label is not a source.
 *
 * Until this change the strip was built from the labels alone, as "3 of 3
 * claims grounded · 2 sources" with a green check; the engine's check was
 * computed, shown nowhere and not recorded; and a label check that ran and
 * failed (any overclaim, any contradiction) read "not assessed", because the
 * client dropped `attempted`.
 *
 * ── The rules this component keeps ───────────────────────────────────────────
 * - A zero is never a clean bill of health. No source consulted means the
 *   claims are not checked, not found; nothing to check is not a pass; a
 *   label check that did not run says so and shows no count.
 * - Nothing earns a check mark. "Found" is a value in this turn's sources, not
 *   a sentence verified, and a check mark read as more (refute-review of the
 *   first engine, HS-2).
 * - Each claim is said as it ended: found, not found, AnA's own input to a
 *   tool, only in the person's message, or not checked because a source AnA
 *   read is one this check cannot read.
 * - Nothing is synthesised here. Each line restates the server's own counts
 *   and texts; the one sentence of prose that is not a count is the server's
 *   risk summary, shown verbatim.
 * - Every row carries its own glyph and words (WCAG 1.4.1).
 *
 * @module client/src/concept2cure/v2/AnaGrounding
 */

import React from 'react';

import type {
  AnaGroundingEvidence,
  AnswerCheckView,
  CheckedClaim,
} from '../components/ana/anaAnswerCheck';
import { I } from './icons';

export type { AnaGroundingEvidence } from '../components/ana/anaAnswerCheck';

/** How the label flags read in a sentence a reviewer would use. */
const FLAG_WORD: Record<string, string> = {
  ungrounded: 'unlabelled',
  overclaim: 'overclaim',
  contradiction: 'contradiction',
};

/** What each kind of checked claim is called. */
const CLAIM_WORD: Record<string, string> = {
  nct: 'trial id',
  isrctn: 'trial id',
  eudract: 'trial id',
  pmid: 'citation',
  doi: 'citation',
  fda_510k: 'submission number',
  fda_pma: 'submission number',
  fda_denovo: 'submission number',
  fda_nda: 'submission number',
  fda_bla: 'submission number',
  fda_anda: 'submission number',
  cfr: 'regulation',
  ich: 'guideline',
  quote: 'quote',
  figure: 'figure',
};

/** Claims listed under a row, at most; the rest are counted. */
const MAX_LISTED = 3;

const claimsWord = (n: number) => `${n} specific claim${n === 1 ? '' : 's'}`;

/** A source as a person would name it. */
function sourceName(source: string): string {
  if (source.startsWith('tool:')) return source.slice(5).replace(/_/g, ' ');
  if (source.startsWith('attachment:')) return source.slice('attachment:'.length);
  if (source === 'context') return 'project context';
  if (source === 'person') return 'your message';
  return source;
}

/** "one overclaim, one unlabelled": the label flags, counted and named. */
function describeFlags(flags: AnaGroundingEvidence['flaggedClaims']): string {
  if (!flags || flags.length === 0) return '';
  const counts = new Map<string, number>();
  for (const f of flags) {
    const w = FLAG_WORD[f.kind] ?? f.kind;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()].map(([w, n]) => (n === 1 ? `one ${w}` : `${n} ${w}s`)).join(', ');
}

/* No tone certifies: "found" means the value is in this turn's sources, not
   that the sentence is right, so no row earns a check mark (round 2 of the
   engine: a check mark read as verification it never was). */
type Tone = 'weak' | 'unknown';
const GLYPH: Record<Tone, React.ReactElement> = { weak: I.alertTriangle, unknown: I.info };

function Row({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <div className="ana-grounding-row">
      <span className={`ana-grounding-ic is-${tone}`} aria-hidden="true">
        {GLYPH[tone]}
      </span>
      <span>{children}</span>
    </div>
  );
}

/** Up to MAX_LISTED claims quoted with their kind, then a count of the rest. */
function Listed({ items }: { items: CheckedClaim[] }) {
  if (items.length === 0) return null;
  const more = items.length - MAX_LISTED;
  return (
    <>
      {items.slice(0, MAX_LISTED).map((c, i) => (
        <div className="ana-grounding-claim" key={`${c.kind}-${i}`}>
          “{c.text}” — {CLAIM_WORD[c.kind] ?? c.kind}
        </div>
      ))}
      {more > 0 && <div className="ana-grounding-risk">and {more} more</div>}
    </>
  );
}

const countWord = (n: number) => (n === 1 ? '1 is' : `${n} are`);

/** What the check compared, and how each claim ended, when AnA consulted something. */
function SourcesRows({ check }: { check: AnswerCheckView }) {
  const { claims, found, notFound, fromInput, fromPerson, unchecked, unreadable } = check;
  if (claims === 0) return <Row tone="unknown">No specific claims to check against this turn's sources</Row>;
  const inputTools = [...new Set(fromInput.map((c) => sourceName(c.source)))];
  return (
    <>
      {notFound.length > 0 ? (
        <>
          <Row tone="weak">
            {notFound.length} of {claimsWord(claims)} not found in this turn's sources
          </Row>
          <Listed items={notFound} />
        </>
      ) : (
        <Row tone="unknown">
          {found === claims
            ? claims === 1
              ? "The one specific claim was found in this turn's sources"
              : `All ${claims} specific claims found in this turn's sources`
            : `${found} of ${claimsWord(claims)} found in this turn's sources`}
        </Row>
      )}
      {fromInput.length > 0 && (
        <>
          <Row tone="unknown">
            {countWord(fromInput.length)} AnA's own input to {inputTools.join(', ')}, not a result
          </Row>
          <Listed items={fromInput} />
        </>
      )}
      {fromPerson.length > 0 && (
        <>
          <Row tone="unknown">{fromPerson.length} only in your message, not in this turn's sources</Row>
          <Listed items={fromPerson} />
        </>
      )}
      {unchecked.length > 0 && (
        <>
          <Row tone="unknown">
            {claimsWord(unchecked.length)} not checked — may be in {unreadable.map(sourceName).join(', ')}, which this
            check cannot read
          </Row>
          <Listed items={unchecked} />
        </>
      )}
      {unchecked.length === 0 && unreadable.length > 0 && (
        <div className="ana-grounding-risk">Not readable by this check: {unreadable.map(sourceName).join(', ')}</div>
      )}
      {check.sources.length > 0 && (
        <div className="ana-grounding-risk">Checked against: {check.sources.map(sourceName).join(', ')}</div>
      )}
    </>
  );
}

/** The engine's check: what was found in this turn's sources, and what was not. */
function CheckRows({ check }: { check: AnswerCheckView }) {
  return (
    <>
      {check.basis === 'no_sources' ? (
        <>
          <Row tone="unknown">
            {check.unchecked.length > 0
              ? `No source consulted this turn — ${claimsWord(check.unchecked.length)} not checked`
              : 'No source consulted this turn'}
          </Row>
          <Listed items={check.unchecked} />
          {check.fromPerson.length > 0 && (
            <>
              <Row tone="unknown">{check.fromPerson.length} only in your message, not checked against a source</Row>
              <Listed items={check.fromPerson} />
            </>
          )}
        </>
      ) : (
        <SourcesRows check={check} />
      )}
      {check.verdicts.length > 0 && (
        <>
          <Row tone="weak">
            {check.verdicts.length === 1 ? 'States a verdict' : `States ${check.verdicts.length} verdicts`}, not
            checked — a verdict needs an engine result behind it
          </Row>
          <Listed items={check.verdicts.map((v) => ({ kind: 'verdict', text: v.text }))} />
        </>
      )}
    </>
  );
}

/** "11 claims labelled · 2 unlabelled or overclaimed · 1 marked missing". */
function labelCounts({ groundedClaims, weakClaims, missingSupport }: AnaGroundingEvidence): string {
  const parts = [`${groundedClaims} ${groundedClaims === 1 ? 'claim' : 'claims'} labelled`];
  if (weakClaims > 0) parts.push(`${weakClaims} unlabelled or overclaimed`);
  if (missingSupport > 0) parts.push(`${missingSupport} marked missing`);
  return parts.join(' · ');
}

/** The labels were assessed, and failed or found claims to label. */
const hasLabels = (e: AnaGroundingEvidence) =>
  e.attempted && (!e.validated || e.groundedClaims + e.weakClaims + e.missingSupport > 0);

/** AnA's own evidence labels, reported as hers. */
function LabelRows({ evidence, hasCheck }: { evidence: AnaGroundingEvidence; hasCheck: boolean }) {
  /* NOT ASSESSED, or nothing labelled: said before any count is read, because
     every count is zero here and zero reads as a clean bill of health. Beside
     the engine's check, it adds nothing and is not shown. */
  if (!hasLabels(evidence)) {
    if (hasCheck) return null;
    return (
      <Row tone="unknown">
        {evidence.attempted ? 'No claims identified to check in this answer' : 'Not assessed for this answer'}
      </Row>
    );
  }
  const { validated, weakClaims, missingSupport, flaggedClaims, riskSummary } = evidence;
  const clean = validated && weakClaims === 0 && missingSupport === 0;
  const flagWords = describeFlags(flaggedClaims);
  /* The first flagged claim is quoted rather than merely counted: a count
     tells a reviewer there is a problem and not which sentence has it. */
  const firstFlag = !clean && flaggedClaims && flaggedClaims.length > 0 ? flaggedClaims[0] : null;
  return (
    <>
      <Row tone={clean ? 'unknown' : 'weak'}>
        AnA's labels: {labelCounts(evidence)}
        {flagWords ? <> — <span className="ana-grounding-kinds">{flagWords}</span></> : null}
      </Row>
      {firstFlag && (
        <div className="ana-grounding-claim">
          “{firstFlag.text}” — {FLAG_WORD[firstFlag.kind] ?? firstFlag.kind}
        </div>
      )}
      {/* The server's own sentence, when it wrote one. Never synthesised here. */}
      {!clean && riskSummary && <div className="ana-grounding-risk">{riskSummary}</div>}
    </>
  );
}

export function AnaGrounding({ evidence }: { evidence?: AnaGroundingEvidence }) {
  if (!evidence) return null;
  return (
    <div className="ana-grounding">
      {evidence.check && <CheckRows check={evidence.check} />}
      <LabelRows evidence={evidence} hasCheck={Boolean(evidence.check)} />
    </div>
  );
}

export default AnaGrounding;
