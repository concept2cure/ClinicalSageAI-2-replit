import React from 'react';
import { ProjectSkills } from '../ProjectSkills';
import { ProjectRecordedContext } from './ProjectRecordedContext';
import { DossierReadinessCard, type DossierState, type RowCopy } from './ProjectDossier';
import type { BuiltDocument } from '../editor/CanvasDocumentList';

/* Author's cards in the project page's side column (ProjectHome renders the
   column beside every step): the dossier's readiness, the skills AnA follows
   here, and the cards the numeric project-home read-model serves. `copyFor`
   and `onOpenDoc` are Module completion's: a market's line on the readiness
   card opens its editing copy as its rows do (FILING_SPINE.md F3). */
export function ProjectSide({ pid, dossier, copyFor, onOpenDoc, onAsk }: {
  pid: string | null; dossier: DossierState; copyFor: (filingId: string) => RowCopy;
  onOpenDoc: (doc: BuiltDocument, within: string | null) => void; onAsk?: (text: string) => void;
}) {
  return (
    <>
      {/* Dossier readiness — a status figure, so it lives with the other
          status cards in the aside rather than between the conversation and
          the work (the constitution's no-KPI-hero rule for project landing).
          Always present: the home filing's figure from the dossier read,
          each added market on its own line, or why there is no figure. No
          ring is drawn for no figure — an empty ring reads as 0%. */}
      <DossierReadinessCard read={dossier} copyFor={copyFor} onOpen={onOpenDoc} />
      {/* The skills AnA follows in this project: deployed here, off here,
          and written for it (ProjectSkills.tsx). */}
      {pid && <ProjectSkills projectRef={pid} onAsk={onAsk} />}
      <ProjectRecordedContext programId={pid} />
    </>
  );
}
