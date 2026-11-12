/**
 * The grade of a catalog item as a person reads it (split from DataRoomSourcesPanel.tsx, 2026-11-11):
 * the chip and the basis, for a data-room capture and for a Vault document alike.
 */
import React from 'react';

interface GradeBasisLine { criterion: string; points: number | null; max: number; detail: string }
/** A capture's grade: computed by a deterministic engine over recorded facts, never by a model (RULE 2). */
export interface SourceGrade { grade: 'A' | 'B' | 'C' | 'D'; score: number; basis: GradeBasisLine[]; cap: string | null; engine: string; gradedAt: string }

export const GRADE_TONE: Record<SourceGrade['grade'], string> = { A: 'ok', B: 'ok', C: 'warn', D: 'err' };
const CRITERION: Record<string, string> = {
  provenance: 'Provenance', integrity: 'Integrity', currency: 'Currency', processing: 'Processing',
  verification: 'Verification', conformance: 'Conformance',
};

/** The grade as a chip: the letter and the score. */
export function GradeChip({ grade }: { grade?: SourceGrade | null }) {
  if (!grade) return null;
  return <span className={`rd-chip tone-${GRADE_TONE[grade.grade]}`} data-testid="source-grade"
    title={`Grade ${grade.grade}, ${grade.score} of 100, computed by ${grade.engine} from recorded facts`}>Grade {grade.grade} · {grade.score}</span>;
}

/** Why it has that grade: every criterion with the fact it read, and any cap. Computed by the engine, never written by AnA. */
export function GradeBasis({ grade }: { grade?: SourceGrade | null }) {
  if (!grade) return null;
  return <div className="pf-sel-m" data-testid="source-grade-basis">
    <p className="pf-sel-m" style={{ margin: '6px 0 2px' }}>
      <b>Grade {grade.grade}</b> ({grade.score} of 100), from recorded facts by {grade.engine}, {new Date(grade.gradedAt).toLocaleString()}.
    </p>
    {grade.cap && <p className="pf-sel-m" style={{ margin: '2px 0' }}>{grade.cap}</p>}
    <ul style={{ margin: '2px 0 6px', paddingLeft: 18 }}>
      {grade.basis.map(b => <li key={b.criterion}>
        <b>{CRITERION[b.criterion] ?? b.criterion}</b> {b.points === null ? '(does not apply)' : `${b.points}/${b.max}`}: {b.detail}
      </li>)}
    </ul>
  </div>;
}
