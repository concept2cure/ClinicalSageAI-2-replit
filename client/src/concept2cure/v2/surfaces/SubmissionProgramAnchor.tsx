/**
 * Submission Center — anchor a submission that records no project to one
 * (P-14's remedy, docs/LAUNCH_DEFINITION_OF_DONE.md, 2026-10-08).
 *
 * P-14 refuses a project's document placed into a submission with no project
 * (409 UNANCHORED_SUBMISSION, whose message now names this control). A
 * submission created before submissions recorded their project had no way to
 * get one. This sits under the submission's header, only when the server
 * recorded no project (`programId === null`; an absent field is not a recorded
 * null), and POSTs /api/submissions/:id/program-anchor { programId, reason }.
 *
 * The server decides (anchorSubmissionToProgram): the project's lead or an
 * organization manager, a live project of this organization of the
 * submission's own filing type, a submission with no project, none of another
 * project's documents already in it. The project starts unstated (P-21), a
 * reason is required, and the answer is shown in the server's words; success
 * is said only once the server returns the anchor.
 *
 * QA 2026-10-08 (j6): the select listed every programme of the organization —
 * device programmes, a BLA, an MAA and a J-NDA for an NDA — and an anchor is
 * not undone here. It now offers exactly what GET
 * /api/submissions/:id/program-anchor answers (listAnchorCandidates: the
 * projects whose filing type is the submission's, by the rule the anchor
 * applies), and counts the others without naming them.
 */
import React from 'react';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { mutateVerbatim, clause, type Notice } from './SubmissionSeqWorkspaces';
import { useLiveData, hasKeys } from '../dataConnect';

export interface AnchorProgramme {
  id: string;
  title: string;
  code: string;
}

/** GET /api/submissions/:id/program-anchor (listAnchorCandidates). */
interface AnchorCandidates {
  applicationType: string;
  applicationTypeLabel: string;
  candidates: AnchorProgramme[];
  otherTypes: number;
}

/** "2 projects of other filing types are", "1 project of another filing type is". */
const projectsOf = (n: number): string =>
  n === 1 ? '1 project of another filing type is' : `${n} projects of other filing types are`;

/** What the server offered, in the control's words. */
function offeredProjects(data: AnchorCandidates | null) {
  const programmes = Array.isArray(data?.candidates) ? data.candidates : [];
  const typeLabel = data?.applicationTypeLabel ?? '';
  const others = Number(data?.otherTypes ?? 0);
  return {
    programmes,
    emptyNote:
      `No ${typeLabel} project exists in this organization to anchor this submission to` +
      (others > 0 ? `; ${projectsOf(others)} not offered, because a submission is anchored only to a project of its own filing type.` : '.'),
    typeNote: `Only ${typeLabel} projects are offered${others > 0 ? `; ${projectsOf(others)} not.` : '.'}`,
  };
}

/** The read when it is not a list to choose from — reading, unreadable or empty — or null when it is. */
function offeredStatus(offered: { loading: boolean; error?: string; data: AnchorCandidates | null }, emptyNote: string, count: number) {
  if (offered.loading) {
    return (
      <div className="scaf-note" role="status">
        Reading the projects this submission can be anchored to…
      </div>
    );
  }
  if (offered.error || !offered.data) {
    return (
      <div className="sc-verdict tone-err" role="status">
        The projects this submission can be anchored to could not be read, so nothing is offered right now.
      </div>
    );
  }
  return count === 0 ? (
    <div className="scaf-note" role="status">
      {emptyNote}
    </div>
  ) : null;
}

const programmeLabel = (p: AnchorProgramme): string => [p.code, p.title].filter(Boolean).join(' · ') || p.id;

/** The project picker and the reason, as the anchor control shows them once opened. */
function AnchorForm({
  submissionId,
  programmes,
  typeNote,
  programId,
  onProgram,
  reason,
  onReason,
  busy,
  onSubmit,
  onCancel,
}: {
  submissionId: number;
  programmes: AnchorProgramme[];
  /** Which filing type is offered, and how many projects are not. */
  typeNote: string;
  programId: string;
  onProgram: (id: string) => void;
  reason: string;
  onReason: (text: string) => void;
  busy: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const reasonOk = reason.trim().length >= GOVERNED_REASON_MIN;
  const shortReason = reason.trim().length > 0 && !reasonOk;
  const reasonId = `sc-anchor-reason-${submissionId}`;
  return (
    <div className="sc-leafform">
      <div className="sc-field">
        <label htmlFor={`sc-anchor-project-${submissionId}`}>Project</label>
        <select
          id={`sc-anchor-project-${submissionId}`}
          className="sc-subpick"
          value={programId}
          disabled={busy}
          onChange={(e) => onProgram(e.target.value)}
        >
          <option value="">Not stated — choose</option>
          {programmes.map((p) => (
            <option key={p.id} value={p.id}>
              {programmeLabel(p)}
            </option>
          ))}
        </select>
        <div className="scaf-note">{typeNote}</div>
      </div>
      <div className="sc-field">
        <label htmlFor={reasonId}>
          Reason for anchoring<span className="req" aria-hidden="true">*</span>
        </label>
        <textarea
          id={reasonId}
          className="sc-subpick"
          rows={2}
          value={reason}
          disabled={busy}
          onChange={(e) => onReason(e.target.value)}
          aria-required="true"
          aria-invalid={shortReason || undefined}
          aria-describedby={`${reasonId}-note`}
        />
        <div id={`${reasonId}-note`} className="scaf-note">
          {shortReason
            ? `At least ${GOVERNED_REASON_MIN} characters.`
            : `Required, at least ${GOVERNED_REASON_MIN} characters. Recorded with the change in the audit trail.`}
        </div>
      </div>
      <button type="button" className="sp-primary sc-btn" disabled={!programId || !reasonOk || busy} onClick={onSubmit}>
        {busy ? 'Anchoring…' : 'Anchor submission'}
      </button>
      <button type="button" className="sc-trans-b" disabled={busy} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

export function SubmissionProgramAnchor({
  submission,
  onAnchored,
}: {
  submission: { id: number; title: string };
  /** Called once the server has anchored the submission, with the line to show. */
  onAnchored: (notice: Notice) => void;
}) {
  const [open, setOpen] = React.useState(false);
  // Read when the control is opened: the projects this submission may be anchored to.
  const candidatesPath = open ? `/api/submissions/${submission.id}/program-anchor` : null;
  const offered = useLiveData<AnchorCandidates>(
    candidatesPath,
    [candidatesPath],
    hasKeys<AnchorCandidates>('candidates', 'applicationTypeLabel'),
  );
  const { programmes, emptyNote, typeNote } = offeredProjects(offered.data);
  const notChoosable = open ? offeredStatus(offered, emptyNote, programmes.length) : null;
  const [programId, setProgramId] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [refusal, setRefusal] = React.useState<string | null>(null);
  React.useEffect(() => {
    setOpen(false);
    setProgramId('');
    setReason('');
    setRefusal(null);
  }, [submission.id]);

  const anchor = async () => {
    if (!programId || reason.trim().length < GOVERNED_REASON_MIN || busy) return;
    setBusy(true);
    setRefusal(null);
    const r = await mutateVerbatim<{ id?: number; programId?: string | null }>(
      'POST',
      `/api/submissions/${submission.id}/program-anchor`,
      { programId, reason: reason.trim() },
    );
    setBusy(false);
    if (r.data && r.data.programId === programId) {
      const chosen = programmes.find((p) => p.id === programId);
      setOpen(false);
      onAnchored({
        tone: 'ok',
        text: `${submission.title} is now anchored to ${chosen?.code ? `Program ${chosen.code}` : chosen?.title ?? 'the chosen project'} — server-confirmed. That project’s documents can now be placed in it.`,
      });
      return;
    }
    setRefusal(
      r.unconfirmed
        ? `We cannot confirm whether ${submission.title} was anchored. Reload the submission before trying again.`
        : `Not anchored — ${clause(r.error ?? 'the request failed')}.`,
    );
  };

  return (
    <div className="sc-mb">
      <div className="scaf-note sc-mb">
        This submission is not anchored to a project, so no project’s documents can be placed in it. Anchor it to the project it
        belongs to; the project’s lead or an organization manager can.
      </div>
      {!open ? (
        <button type="button" className="sc-trans-b" onClick={() => setOpen(true)}>
          Anchor to a project
        </button>
      ) : notChoosable ? (
        notChoosable
      ) : (
        <AnchorForm
          submissionId={submission.id}
          programmes={programmes}
          typeNote={typeNote}
          programId={programId}
          onProgram={setProgramId}
          reason={reason}
          onReason={setReason}
          busy={busy}
          onSubmit={() => void anchor()}
          onCancel={() => setOpen(false)}
        />
      )}
      {refusal && (
        <div className="sc-verdict tone-err sc-mt" role="status">
          {refusal}
        </div>
      )}
    </div>
  );
}
