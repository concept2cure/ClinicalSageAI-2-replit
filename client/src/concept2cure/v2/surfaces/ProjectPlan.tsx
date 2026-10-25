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

const DATE = { year: 'numeric', month: 'short', day: 'numeric' } as const;
function targetWords(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : null;
  return d && Number.isFinite(d.getTime()) ? `Target submission ${d.toLocaleDateString(undefined, DATE)}` : 'No target submission date recorded';
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
    <AssignAction deliverable={deliverable} programId={pid} projectId={projectId} onAssigned={() => setEpoch(value => value + 1)} />
  );
  const devicePlan = deviceFiling && prog ? mdxProjectPlan(prog, otherFilings) : null;
  const assignmentsUnread = assignments.error && (
    <p className="pf-sel-m" role="status" data-testid="plan-assignments-error">
      Who each item is assigned to could not be read. Assigning still works; the project’s tasks below list what was assigned.
    </p>
  );
  return (
    <div className="pj-stagebody" data-testid="pj-plan">
      {usInd ? (
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
      ) : devicePlan && prog ? (
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
    </div>
  );
}
