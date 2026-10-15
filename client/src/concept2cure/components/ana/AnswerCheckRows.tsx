/**
 * The engine's check, as rows: what a check of AnA's text found in this
 * turn's sources, and what it did not.
 *
 * One renderer for two places that show the same check:
 *   - the strip under every answer (v2/AnaGrounding.tsx), with AnA's own
 *     labels after it;
 *   - the sign-off dialog for a governed draft (GovernedActionSignoff.tsx),
 *     where the draft's prose was checked before the person approves it
 *     (GRD-2 / FIG-3, AnA reasoning round 3, 2026-10-05).
 * Moved here from AnaGrounding.tsx so both read one implementation.
 *
 * The rules it keeps (AnaGrounding.tsx has the history):
 * - A zero is never a clean bill of health. No source consulted means the
 *   claims are not checked, not found; nothing to check is not a pass.
 * - Nothing earns a check mark. "Found" is a value in this turn's sources, not
 *   a sentence verified.
 * - Each claim is said as it ended: found, not found, AnA's own input to a
 *   tool, only in the person's message, or not checked because a source AnA
 *   read is one this check cannot read.
 * - Nothing is synthesised: each line restates the server's own counts and
 *   texts.
 * - Every row carries its own glyph and words (WCAG 1.4.1).
 *
 * @module client/src/concept2cure/components/ana/AnswerCheckRows
 */

import React from 'react';
import type { LucideIcon } from 'lucide-react';

import type { AnswerCheckView, CheckedClaim } from './anaAnswerCheck';
import { I } from './icons';

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

/* No tone certifies: "found" means the value is in this turn's sources, not
   that the sentence is right, so no row earns a check mark (round 2 of the
   engine: a check mark read as verification it never was). */
export type CheckTone = 'weak' | 'unknown';
const glyph = (Icon: LucideIcon) => <Icon size="1em" strokeWidth={1.75} aria-hidden="true" focusable="false" />;
const GLYPH: Record<CheckTone, React.ReactElement> = { weak: glyph(I.alert), unknown: glyph(I.info) };

/** One row of the check or of AnA's labels: its glyph, then its words. */
export function CheckRow({ tone, children }: { tone: CheckTone; children: React.ReactNode }) {
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
  if (claims === 0) return <CheckRow tone="unknown">No specific claims to check against this turn's sources</CheckRow>;
  const inputTools = [...new Set(fromInput.map((c) => sourceName(c.source)))];
  return (
    <>
      {notFound.length > 0 ? (
        <>
          <CheckRow tone="weak">
            {notFound.length} of {claimsWord(claims)} not found in this turn's sources
          </CheckRow>
          <Listed items={notFound} />
        </>
      ) : (
        <CheckRow tone="unknown">
          {found === claims
            ? claims === 1
              ? "The one specific claim was found in this turn's sources"
              : `All ${claims} specific claims found in this turn's sources`
            : `${found} of ${claimsWord(claims)} found in this turn's sources`}
        </CheckRow>
      )}
      {fromInput.length > 0 && (
        <>
          <CheckRow tone="unknown">
            {countWord(fromInput.length)} AnA's own input to {inputTools.join(', ')}, not a result
          </CheckRow>
          <Listed items={fromInput} />
        </>
      )}
      {fromPerson.length > 0 && (
        <>
          <CheckRow tone="unknown">{fromPerson.length} only in your message, not in this turn's sources</CheckRow>
          <Listed items={fromPerson} />
        </>
      )}
      {unchecked.length > 0 && (
        <>
          <CheckRow tone="unknown">
            {claimsWord(unchecked.length)} not checked — may be in {unreadable.map(sourceName).join(', ')}, which this
            check cannot read
          </CheckRow>
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
export function AnswerCheckRows({ check }: { check: AnswerCheckView }) {
  return (
    <>
      {check.basis === 'no_sources' ? (
        <>
          <CheckRow tone="unknown">
            {check.unchecked.length > 0
              ? `No source consulted this turn — ${claimsWord(check.unchecked.length)} not checked`
              : 'No source consulted this turn'}
          </CheckRow>
          <Listed items={check.unchecked} />
          {check.fromPerson.length > 0 && (
            <>
              <CheckRow tone="unknown">{check.fromPerson.length} only in your message, not checked against a source</CheckRow>
              <Listed items={check.fromPerson} />
            </>
          )}
        </>
      ) : (
        <SourcesRows check={check} />
      )}
      {check.verdicts.length > 0 && (
        <>
          <CheckRow tone="weak">
            {check.verdicts.length === 1 ? 'States a verdict' : `States ${check.verdicts.length} verdicts`}, not
            checked — a verdict needs an engine result behind it
          </CheckRow>
          <Listed items={check.verdicts.map((v) => ({ kind: 'verdict', text: v.text }))} />
        </>
      )}
    </>
  );
}
