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
 * the project's tasks follow, moved here from Author. The team left Plan on 2026-11-06 (D3-3): it is the
 * Team card in Project knowledge, on every step, and the Team drawer it opens.
 *
 * S11 step 4 (THE_PROGRAM §3.5, §8): the step opens with what is due for the
 * signed-in person in this project's plan, and each IND document says the
 * work-breakdown task that produces it, with that task's due date and owner
 * (the content plan joined to the work). The project's pyramid is read once
 * here (useProjectPyramid) and shared with the Program plan below.
 *
 * A filing with neither plan says so and where its documents are; it is not
 * given an invented list.
 */
import React, { useState } from 'react';
import { I } from '../icons';
import { EmptyState } from '../dataConnect';
import { IndFilingPlan } from '../editor/IndDocumentLibrary';
import { ProjectMdxWorkflow, mdxProjectPlan, type MdxWorkflowProject } from './ProjectMdxWorkflow';
import { AssignAction, AssignmentLine, DueForYou, planDueFor, usePlanAssignments, type PlanDeliverable } from './PlanAssign';
import { useAuthUser } from '@/services/portal/authService';
import { STEP_DOORS } from '../projectDoors';
import { biotechPlanEntry, ProjectBiotechPlan } from './ProjectBiotechPlan';
import { FilingLifecycleReference } from './FilingLifecycleReference';
import { PlanStrategy } from './ProjectObjective';
import { ProducedBy, producingTask, ProjectProgramPlan, useProjectPyramid } from './PyramidProject';

/** The features a US IND phase is composed in, when they serve this project. Each opens on the open project, and
 *  is named as the same job is named wherever its door appears (projectDoors.ts). */
function IndPhaseDoor({ phaseId, usInd, cmcComposes, available, onNav, onStage }: {
  phaseId: string; usInd: boolean; cmcComposes: boolean;
  available: (id: string) => boolean; onNav: (id: string) => void; onStage: (id: string) => void;
}) {
  const door = phaseId === 'phase3' && cmcComposes && available('cmc')
    ? { label: STEP_DOORS.cmc, act: () => onNav('cmc') }
    : phaseId === 'phase7' && usInd && available('ind-checklist')
      ? { label: STEP_DOORS.indForms, act: () => onNav('ind-checklist') }
      : phaseId === 'phase8'
        ? { label: STEP_DOORS.placeInSequence, act: () => onStage('submit') }
        : null;
  if (!door) return null;
  return <div className="pj-plan-door"><button type="button" className="btn ghost" onClick={door.act}>{door.label} {I.right}</button></div>;
}

/* "Your tasks" was a section here that listed none: it said the person's own
   tasks were not filtered to this project and linked to Tasks for every
   project. Removed 2026-10-31. This project's tasks are the Tasks section above
   (ProjectWorkPanel, read by the program UUID through the server's anchor). */

const DATE = { year: 'numeric', month: 'short', day: 'numeric' } as const;
/** The recorded date, as recorded: the column is a date stored as midnight with no zone, so its date part is
 *  formatted in UTC and never shifted a day by the viewer's zone. */
function targetWords(iso: string | null | undefined): string {
  const day = /^\d{4}-\d{2}-\d{2}/.exec(String(iso ?? ''))?.[0];
  const d = day ? new Date(`${day}T00:00:00Z`) : null;
  return d && Number.isFinite(d.getTime()) ? `Target submission ${d.toLocaleDateString(undefined, { ...DATE, timeZone: 'UTC' })}` : 'No target submission date recorded';
}

/** Under the work breakdown's workstreams, for a device plan: its own workstreams (above) carry no work-breakdown key,
 *  so they are not counted in these, and the plan says so rather than guessing a mapping. */
function deviceWorkstreamNote(devicePlan: unknown): string | undefined {
  return devicePlan ? 'The device workstreams above are listed by their own items, which have no work-breakdown key, so they are not counted in these workstreams.' : undefined;
}

/**
 * The Plan step's shared reads: the plan's tasks (once, for assignments, owners and what is due for the person) and
 * the project's pyramid (once, for the content plan's join and the Program plan). A deliverable's line says who it is
 * assigned to and, for an IND document, the work-breakdown task that produces it.
 */
function usePlanReads(pid: string, prog: { target_submission_date?: string | null } | null, epoch: number) {
  const assignments = usePlanAssignments(pid, epoch);
  const user = useAuthUser();
  const pyramid = useProjectPyramid(pid, prog?.target_submission_date ?? null);
  const assignmentOf = (id: string) => {
    const found = assignments.byDeliverable.get(id);
    if (!found && !producingTask(id, pyramid.data)) return null;
    return <>
      {found && <AssignmentLine assignment={found} />}
      <ProducedBy deliverableId={id} read={pyramid.data} owners={assignments.byPyramidTask} />
    </>;
  };
  // Whose tasks they are is the session's, never guessed: no signed-in person, no list.
  const dueForYou = user?.id == null ? null
    : <DueForYou items={planDueFor(assignments.rows, pid, user.id)} unread={Boolean(assignments.error)} />;
  return { assignments, pyramid, assignmentOf, dueForYou };
}

export function ProjectPlan({ pid, prog, usInd, cmcComposes, deviceFiling, otherFilings, marketsState, projectId,
  available, onNav, onStage, onAsk, onOpenDocument, onWorkChanged, tasks }: {
  pid: string;
  /** The verified project read (ProjectHome `prog`), for the device plan and the target date. */
  prog: (MdxWorkflowProject & { target_submission_date?: string | null; registry_id?: string | null; submission_type_id?: string | null }) | null;
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
  /** The page's unified-work read is read again after an assignment (D3-2b: it is lifted, so a remount no longer re-reads it). */
  onWorkChanged?: () => void;
  tasks: React.ReactNode;
}) {
  const [epoch, setEpoch] = useState(0);
  const assigned = () => { setEpoch(value => value + 1); onWorkChanged?.(); };
  const { assignments, pyramid, assignmentOf, dueForYou } = usePlanReads(pid, prog, epoch);
  const assignAction = (deliverable: PlanDeliverable) => (
    <AssignAction deliverable={deliverable} programId={pid} projectId={projectId} assigned={assignments.byDeliverable.has(deliverable.id)}
      onAssigned={assigned} />
  );
  const devicePlan = deviceFiling && prog ? mdxProjectPlan(prog, otherFilings) : null;
  const biotech = biotechPlanEntry(prog, pid);
  const assignmentsUnread = assignments.error && (
    <p className="pf-sel-m" role="status" data-testid="plan-assignments-error">
      Who each item is assigned to could not be read. An assignment you make is confirmed when it is saved.
    </p>
  );
  return (
    <div className="pj-stagebody" data-testid="pj-plan">
      {/* What is due for the person, first (THE_PROGRAM §8 item 2). Only for a signed-in person: whose tasks they are
          is the session's, never guessed. */}
      {/* How the project means to reach its objective, first (THE_PROGRAM §8 item 1). The objective itself is under the
          project's name, in view on every step. */}
      {prog && <PlanStrategy programId={pid} canEdit={(prog as { canChange?: boolean }).canChange !== false} />}
      {prog && dueForYou}
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
        <div className="pj-plan-device">
          {assignmentsUnread}
          <ProjectMdxWorkflow project={prog} otherFilings={otherFilings} marketsState={marketsState}
            onNav={onNav} onStage={onStage} onAsk={onAsk} available={available}
            assignmentOf={assignmentOf} assignAction={assignAction} />
        </div>
      ) : biotech ? (
        <ProjectBiotechPlan programId={pid} entry={biotech} onOpenDocument={onOpenDocument} onAsk={onAsk}
          assignmentOf={assignmentOf} assignAction={assignAction} />
      ) : (
        <section className="pj-sec" aria-labelledby="pj-plan-h">
          <div className="pj-sec-h">
            <h2 id="pj-plan-h">What this filing needs</h2>
            <span className="sec-sub">{targetWords(prog?.target_submission_date)}</span>
          </div>
          <p className="pj-desc" data-testid="pj-plan-none">
            A list of what the filing needs is available for US INDs and device filings in this release. This filing’s documents are on Author.
          </p>
          <div className="pj-plan-door"><button type="button" className="btn ghost" onClick={() => onStage('author')}>{STEP_DOORS.filingDocuments} {I.right}</button></div>
        </section>
      )}
      {/* The filing's work breakdown with this project's progress (S11): beside what the filing needs, the work
          that produces it, phase by phase, with its critical path. */}
      {prog && <ProjectProgramPlan programId={pid} read={pyramid} projectId={projectId} workstreamNote={deviceWorkstreamNote(devicePlan)} owners={assignments.byPyramidTask}
        ownersUnread={Boolean(assignments.error)} onAssigned={assigned}
        onNav={onNav} onAsk={onAsk} />}
      {/* Tasks and approvals, by due date, before the reference (D3-4, D3.md §4.7 Plan item 1). Read again after each
          Assign, so the new task is listed without a reload. */}
      <React.Fragment key={epoch}>{tasks}</React.Fragment>
      {prog && <FilingLifecycleReference filingId={prog.submission_type_id} recorded={{ programType: prog.program_type, primaryAgency: prog.primary_agency }} />}
    </div>
  );
}
