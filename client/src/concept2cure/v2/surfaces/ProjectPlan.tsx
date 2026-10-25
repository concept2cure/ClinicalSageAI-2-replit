/**
 * Plan — the project's first step: what the filing needs, who does it, and by
 * when (docs/design/CLIENT_JOURNEY_2026-10-25.md, pass 3; decisions 3 and 4).
 *
 * Nothing here is a second list. What the filing needs is the existing plan of
 * work for its kind of filing, with the features that compose it opened from
 * where they are needed rather than from a catalogue:
 *   · a US IND: every IND deliverable by phase (editor/IndDocumentLibrary
 *     `IndFilingPlan`, over GET /api/authoring/ind-document-catalog, the IND
 *     pyramid's projection), each started from its template in the one editor;
 *     a phase that a feature composes opens it on this project (Module 3 →
 *     CMC / Module 3 within its composition boundary; Module 1 → IND forms);
 *   · a device or diagnostic filing: its workstreams (ProjectMdxWorkflow, which
 *     sat above the steps until this pass), each opening its existing feature.
 * Each item can be assigned to a person with a due date (PlanAssign.tsx), and
 * the team and the project's tasks follow, moved here from Author.
 *
 * A filing with neither plan says so and where its documents are; it is not
 * given an invented list.
 */
import React, { useState } from 'react';
import { I } from '../icons';
import { EmptyState } from '../dataConnect';
import { applySurfaceAction } from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';
import { IndFilingPlan } from '../editor/IndDocumentLibrary';
import { ProjectMdxWorkflow, mdxProjectPlan, type MdxWorkflowProject } from './ProjectMdxWorkflow';
import { AssignAction, AssignmentLine, usePlanAssignments, type PlanDeliverable } from './PlanAssign';

/** The features a US IND phase is composed in, when they serve this project. Each opens on the open project. */
function IndPhaseDoor({ phaseId, usInd, cmcComposes, available, onNav, onStage }: {
  phaseId: string; usInd: boolean; cmcComposes: boolean;
  available: (id: string) => boolean; onNav: (id: string) => void; onStage: (id: string) => void;
}) {
  const door = phaseId === 'phase3' && cmcComposes && available('cmc')
    ? { label: 'Compose Module 3 in CMC / Module 3', act: () => onNav('cmc') }
    : phaseId === 'phase7' && usInd && available('ind-checklist')
      ? { label: 'Prepare Forms 1571, 1572 and 3674 in IND forms', act: () => onNav('ind-checklist') }
      : phaseId === 'phase8'
        ? { label: 'Place approved documents in the sequence on Submit', act: () => onStage('submit') }
        : null;
  if (!door) return null;
  return <div className="pj-plan-door"><button type="button" className="btn ghost" onClick={door.act}>{door.label} {I.right}</button></div>;
}

/* ════ My work on this project ═════════════════════════════════════════════
   ONE_ANA_ONE_CANVAS.md slice 24; on Plan since pass 3 (moved from Project
   home). The program's tasks and approvals are listed just above it (ProjectWorkPanel, read by the program UUID through
   the server's anchor). My work, the signed-in person's own queue, is not
   filtered to this project yet; this says so in one line and links to it.
   This section said "Tasks & submission readiness aren't wired"; the dispatch
   readiness is on the Submit stage now.

   "Open My work" opens what the nav's My work opens: the task board on the
   signed-in person's own tasks, asked of the board through the same validated
   action bus (tasking.filter, mine), not the board on everyone's. */
function MyWorkLine({ onNav, available }: { onNav: (id: string) => void; available: (id: string) => boolean }) {
  const openMyWork = () => {
    const res = resolveSurfaceAction('tasking.filter', { mine: 'true' });
    if (res.ok) applySurfaceAction(res.directive, () => onNav('tasks'));
    else onNav('tasks');
  };
  return (
    <section className="pj-sec" aria-labelledby="pj-mywork-h">
      <div className="pj-sec-h">
        <h2 id="pj-mywork-h">My work</h2>
        {available('tasks') && (
          <button type="button" className="btn ghost" style={{ fontSize: 12, padding: '4px 12px' }} onClick={openMyWork}>
            Open My work {I.right}
          </button>
        )}
      </div>
      <p className="pj-desc">Your work is not filtered to this project yet. My work lists it for every project.</p>
    </section>
  );
}

const DATE = { year: 'numeric', month: 'short', day: 'numeric' } as const;
/** The recorded date, as recorded: the column is a date stored as midnight with no zone, so its date part is
 *  formatted in UTC and never shifted a day by the viewer's zone. */
function targetWords(iso: string | null | undefined): string {
  const day = /^\d{4}-\d{2}-\d{2}/.exec(String(iso ?? ''))?.[0];
  const d = day ? new Date(`${day}T00:00:00Z`) : null;
  return d && Number.isFinite(d.getTime()) ? `Target submission ${d.toLocaleDateString(undefined, { ...DATE, timeZone: 'UTC' })}` : 'No target submission date recorded';
}

export function ProjectPlan({ pid, prog, usInd, cmcComposes, deviceFiling, otherFilings, marketsState, projectId,
  available, onNav, onStage, onAsk, onOpenDocument, team, tasks }: {
  pid: string;
  /** The verified project read (ProjectHome `prog`), for the device plan and the target date. */
  prog: (MdxWorkflowProject & { target_submission_date?: string | null }) | null;
  usInd: boolean;
  cmcComposes: boolean;
  deviceFiling: boolean;
  otherFilings: string[];
  marketsState: 'loading' | 'unavailable' | 'ready';
  /** projects.id behind the program (useProjectTeam), the key tasks are scoped by; null until verified. */
  projectId: number | null;
  available: (id: string) => boolean;
  onNav: (id: string) => void;
  onStage: (id: string) => void;
  onAsk: (text: string) => void;
  onOpenDocument: (docId: string) => void;
  team: React.ReactNode;
  tasks: React.ReactNode;
}) {
  const [epoch, setEpoch] = useState(0);
  const assignments = usePlanAssignments(pid, epoch);
  const assignmentOf = (id: string) => {
    const found = assignments.byDeliverable.get(id);
    return found ? <AssignmentLine assignment={found} /> : null;
  };
  const assignAction = (deliverable: PlanDeliverable) => (
    <AssignAction deliverable={deliverable} programId={pid} projectId={projectId} assigned={assignments.byDeliverable.has(deliverable.id)}
      onAssigned={() => setEpoch(value => value + 1)} />
  );
  const devicePlan = deviceFiling && prog ? mdxProjectPlan(prog, otherFilings) : null;
  const assignmentsUnread = assignments.error && (
    <p className="pf-sel-m" role="status" data-testid="plan-assignments-error">
      Who each item is assigned to could not be read. An assignment you make is confirmed when it is saved.
    </p>
  );
  return (
    <div className="pj-stagebody" data-testid="pj-plan">
      {!prog ? (
        /* The project record is still being read: which plan applies is not known yet. */
        <EmptyState busy icon={I.fileText} title="Reading this project…" />
      ) : usInd ? (
        <section className="pj-sec" aria-labelledby="pj-plan-h">
          <div className="pj-sec-h">
            <h2 id="pj-plan-h">What this IND needs</h2>
            <span className="sec-sub">{targetWords(prog?.target_submission_date)}</span>
          </div>
          <p className="pj-desc">Every document of an initial IND, by phase. Start one from its template, assign it to a person, or ask AnA to work on it.</p>
          {assignmentsUnread}
          <IndFilingPlan programId={pid} onAsk={onAsk} onOpenDocument={onOpenDocument}
            assignmentOf={assignmentOf} assignAction={assignAction}
            phaseDoor={phaseId => <IndPhaseDoor phaseId={phaseId} usInd={usInd} cmcComposes={cmcComposes} available={available} onNav={onNav} onStage={onStage} />} />
        </section>
      ) : devicePlan ? (
        <>
          {assignmentsUnread}
          <ProjectMdxWorkflow project={prog} otherFilings={otherFilings} marketsState={marketsState}
            onNav={onNav} onStage={onStage} onAsk={onAsk} available={available}
            assignmentOf={assignmentOf} assignAction={assignAction} />
        </>
      ) : (
        <section className="pj-sec" aria-labelledby="pj-plan-h">
          <div className="pj-sec-h">
            <h2 id="pj-plan-h">What this filing needs</h2>
            <span className="sec-sub">{targetWords(prog?.target_submission_date)}</span>
          </div>
          <p className="pj-desc" data-testid="pj-plan-none">
            A list of what the filing needs is available for US INDs and device filings in this release. This filing’s documents are on Author.
          </p>
          <div className="pj-plan-door"><button type="button" className="btn ghost" onClick={() => onStage('author')}>Open Author {I.right}</button></div>
        </section>
      )}
      {team}
      {/* Read again after each Assign, so the new task is listed without a reload. */}
      <React.Fragment key={epoch}>{tasks}</React.Fragment>
      <MyWorkLine onNav={onNav} available={available} />
    </div>
  );
}
