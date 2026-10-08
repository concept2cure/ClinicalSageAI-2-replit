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
 * organization manager, a live project of this organization, a submission with
 * no project, none of another project's documents already in it. The project
 * starts unstated (P-21), a reason is required, and the answer is shown in the
 * server's words; success is said only once the server returns the anchor.
 */
import React from 'react';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { mutateVerbatim, clause, type Notice } from './SubmissionSeqWorkspaces';

export interface AnchorProgramme {
  id: string;
  title: string;
  code: string;
}

const programmeLabel = (p: AnchorProgramme): string => [p.code, p.title].filter(Boolean).join(' · ') || p.id;

/** The project picker and the reason, as the anchor control shows them once opened. */
function AnchorForm({
  submissionId,
  programmes,
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
  programmes,
  programmesUnreadable,
  onAnchored,
}: {
  submission: { id: number; title: string };
  /** The organization's projects (GET /api/c2c/projects), as the parent read them. */
  programmes: AnchorProgramme[];
  /** The projects could not be read: nothing is offered to choose from. */
  programmesUnreadable: boolean;
  /** Called once the server has anchored the submission, with the line to show. */
  onAnchored: (notice: Notice) => void;
}) {
  const [open, setOpen] = React.useState(false);
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
      ) : programmesUnreadable ? (
        <div className="sc-verdict tone-err" role="status">
          The projects could not be read, so there is nothing to anchor this submission to right now.
        </div>
      ) : (
        <AnchorForm
          submissionId={submission.id}
          programmes={programmes}
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
