import React from 'react';
import { ProjectSkills } from '../ProjectSkills';
import { ProjectRecordedContext } from './ProjectRecordedContext';
import { ProjectRecords, type ProjectRecordsRead } from './ProjectRecords';
import type { DataState } from '../dataConnect';

/* The lower cards of Project knowledge, the project page's side column, on every step (D3-2a, D3.md §4.8 items 5–7):
   what AnA knows (the saved profile's memory and instructions), the skills AnA follows here, and the project's
   records. ProjectHome renders About, Filing, Team and Work areas above them.

   They were Author-only until 2026-11-06. The dossier's readiness card left this column then: its figure is the
   Filing card's first row, and its detail is on the Author step beside Module completion. */
export function ProjectSide({ pid, onAsk, records, activity }: {
  pid: string | null; onAsk?: (text: string) => void; records: DataState<ProjectRecordsRead>; activity?: React.ReactNode;
}) {
  return (
    <>
      <ProjectRecordedContext programId={pid} />
      {pid && <ProjectSkills projectRef={pid} onAsk={onAsk} />}
      {pid && <ProjectRecords state={records} activity={activity} />}
    </>
  );
}
