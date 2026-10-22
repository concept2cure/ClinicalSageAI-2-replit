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
 * The line saying which takes focus, so the person hears where they landed.
 * `onApplied` tells the sender's owner the arrival was used, so it is not
 * applied again on a later visit to the tab. Nothing here writes.
 */
import React from 'react';
import { normalizeCtdCode } from '@shared/regulatory/section-code';
import { SC_SEQ_STATUS } from '../fixtures/submission';
import type { BuilderSection } from './submissionNavTarget';

type ArrivalKind = 'place' | 'locked' | 'leaf' | 'leaf-missing' | 'read-failed';

interface Arrival {
  section: BuilderSection;
  kind: ArrivalKind;
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
      return `The leaf at ${code} that the readiness finding names is marked below.`;
    case 'leaf-missing':
      return `No leaf at ${code} is in sequence ${seq.sequenceNumber} now, so nothing is marked. Validation shows the current findings.`;
    default:
      return code
        ? `The leaves could not be read, so section ${code} was not opened.`
        : 'The leaves could not be read, so the placement form was not opened.';
  }
}

export interface BuilderSectionArrival {
  /** The line to show, focused once; null when the Builder was not sent here. */
  line: React.ReactNode;
  /** Open the placement form at this section; a new object per arrival. */
  placeAt: { code: string | null } | null;
  /** Whether a placed leaf at `sectionCode` is the one the finding names. */
  marks: (sectionCode: string) => boolean;
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
    if (leaves.error) kind = 'read-failed';
    else if (section.act === 'place') kind = locked ? 'locked' : 'place';
    else kind = leaves.rows.some((r) => sameSection(r.sectionCode, section.code)) ? 'leaf' : 'leaf-missing';
    setArrival({ section, kind });
    applied.current?.();
  }, [section, leaves.loading, leaves.error, leaves.rows, locked]);

  React.useEffect(() => {
    if (arrival) lineRef.current?.focus();
  }, [arrival]);

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
  return { line, placeAt, marks };
}
