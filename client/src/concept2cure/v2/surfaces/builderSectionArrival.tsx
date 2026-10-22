/**
 * The Builder, arrived at from a readiness finding (F18,
 * docs/design/FILING_SPINE.md §7.2).
 *
 * Submission Readiness's acts open the Submission Center on a market's
 * sequence in the Builder, naming a section (submissionNavTarget
 * `BuilderSection`). This reads the arrival once the sequence's leaves have
 * settled, against the rows the server returned:
 *
 *   - `place`: the placement form opens with Section filled in (empty when the
 *     finding named none), unless the sequence is frozen or dispatched;
 *   - `leaf`: the placed leaf at that section is marked, by the CTD code
 *     (normalizeCtdCode, so 'm2.7.3' is 2.7.3), or the line says no leaf there
 *     is placed now.
 *
 * The line saying which takes focus when nothing else has it, so the person
 * hears where they landed. It is used once: `onApplied` tells the sender's
 * owner, so a later visit to the tab does not apply it again, and `done`
 * retires it after the placement it asked for, a Cancel, or any other write,
 * so the form does not reopen and the line does not describe a state that has
 * passed (F18 review, 2026-10-22). Nothing here writes.
 */
import React from 'react';
import { normalizeCtdCode } from '@shared/regulatory/section-code';
import { SC_SEQ_STATUS } from '../fixtures/submission';
import type { BuilderSection } from './submissionNavTarget';

type ArrivalKind = 'place' | 'locked' | 'leaf' | 'leaf-missing' | 'read-failed';

interface Arrival {
  section: BuilderSection;
  kind: ArrivalKind;
  /** How many placed leaves are at the section (a leaf act). */
  count: number;
}

/** Two section codes are one section when their CTD codes are equal; a code
 *  that is not code-shaped is compared as written. */
export function sameSection(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeCtdCode(a) ?? String(a ?? '').trim();
  const right = normalizeCtdCode(b) ?? String(b ?? '').trim();
  return left !== '' && left === right;
}

function arrivalLine(a: Arrival, seq: { sequenceNumber: string; status: string }): string {
  const code = a.section.code;
  switch (a.kind) {
    case 'place':
      return code
        ? `Placing a leaf at ${code}, the section the readiness finding names. Choose the document and give the reason.`
        : `Placing a leaf in sequence ${seq.sequenceNumber}, as the readiness finding asks. Choose the document, its section and the reason.`;
    case 'locked':
      return `Sequence ${seq.sequenceNumber} is ${SC_SEQ_STATUS[seq.status]?.l.toLowerCase() ?? seq.status}, so no leaf can be placed in it.`;
    case 'leaf':
      return a.count > 1
        ? `${a.count} leaves are placed at ${code} and are marked below. The finding on Submission Readiness names the one it is about.`
        : `The leaf at ${code} that the readiness finding names is marked below.`;
    case 'leaf-missing':
      return `No leaf at ${code} is in sequence ${seq.sequenceNumber} now, so nothing is marked. Validation shows the current findings.`;
    default: {
      // The read failed, so the arrival is not re-applied when it later
      // answers: the line says what was not done and how to ask again.
      let what = 'the placement form was not opened';
      if (a.section.act === 'leaf') what = `the leaf at ${code} was not marked`;
      else if (code) what = `the placement form was not opened at ${code}`;
      return `The leaves could not be read, so ${what}. Open the finding on Submission Readiness again to retry.`;
    }
  }
}

export interface BuilderSectionArrival {
  /** The line to show, focused once; null when the Builder was not sent here. */
  line: React.ReactNode;
  /** Where the line belongs: beside the placement form ('form') for a place
   *  act, above the leaves ('top') otherwise. */
  lineAt: 'form' | 'top';
  /** Open the placement form at this section; a new object per arrival. */
  placeAt: { code: string | null } | null;
  /** Whether a placed leaf at `sectionCode` is at the section the finding names. */
  marks: (sectionCode: string) => boolean;
  /** The row tag beside a marked leaf: the one named, or one of several there. */
  markLabel: string;
  /** Retire the arrival: its line, its mark and its placement form. */
  done: () => void;
}

export function useBuilderSectionArrival({ section, leaves, seq, locked, onApplied }: {
  section: BuilderSection | null | undefined;
  leaves: { loading: boolean; error?: string | null; rows: Array<{ sectionCode: string }> };
  seq: { sequenceNumber: string; status: string };
  locked: boolean;
  onApplied?: () => void;
}): BuilderSectionArrival {
  const [arrival, setArrival] = React.useState<Arrival | null>(null);
  const lineRef = React.useRef<HTMLParagraphElement>(null);
  const applied = React.useRef(onApplied);
  applied.current = onApplied;

  React.useEffect(() => {
    if (!section || leaves.loading) return;
    let kind: ArrivalKind;
    const count = leaves.error ? 0 : leaves.rows.filter((r) => sameSection(r.sectionCode, section.code)).length;
    if (leaves.error) kind = 'read-failed';
    else if (section.act === 'place') kind = locked ? 'locked' : 'place';
    else kind = count > 0 ? 'leaf' : 'leaf-missing';
    setArrival({ section, kind, count });
    applied.current?.();
  }, [section, leaves.loading, leaves.error, leaves.rows, locked]);

  /* Focus moves to the line only when nothing else holds it: the read can
     settle after the person has already moved on. */
  React.useEffect(() => {
    const active = typeof document === 'undefined' ? null : document.activeElement;
    if (arrival && (!active || active === document.body)) lineRef.current?.focus();
  }, [arrival]);
  const done = React.useCallback(() => setArrival(null), []);

  const placeAt = React.useMemo(() => (arrival?.kind === 'place' ? { code: arrival.section.code } : null), [arrival]);
  const marks = React.useCallback(
    (sectionCode: string) => arrival?.kind === 'leaf' && sameSection(sectionCode, arrival.section.code),
    [arrival],
  );
  const line = arrival ? (
    <p ref={lineRef} tabIndex={-1} role="status" className="scaf-note" data-testid="sc-builder-arrival" data-arrival={arrival.kind}>
      {arrivalLine(arrival, seq)}
    </p>
  ) : null;
  const lineAt: 'form' | 'top' = arrival && (arrival.kind === 'place' || arrival.kind === 'locked') ? 'form' : 'top';
  const markLabel = arrival && arrival.count > 1 ? 'At the section the finding names' : 'Named by readiness';
  return { line, lineAt, placeAt, marks, markLabel, done };
}
