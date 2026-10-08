/**
 * LiveDriveOverlay — the always-visible control strip while AnA is driving.
 *
 * Mounted once in V2App beside CmdK/CollabLayer, inside the persistent shell
 * root, so it stays on screen across every navigation AnA makes — which is the
 * point: the person watching must always see WHO is driving, WHERE she just
 * went, and have take-over one keypress away (Escape) on whatever surface the
 * drive lands on.
 *
 * Honest by construction: it renders only while a real `drive_state
 * {enabled:true}` turn is live, and the step it shows is the last move that
 * actually happened — a navigation or a performed screen operation —
 * there is no simulated progress and no idle placeholder. When AnA is not
 * driving there is nothing here at all — except one notice: a reply of the
 * shell's conversation that finished while another screen was showing, with
 * the way back to it (`replyElsewhere`), until the person goes back or
 * dismisses it.
 *
 * Interactive by design: the strip carries a steer field — a question or a
 * course-correction typed here lands mid-run through the run-control
 * interject, so during a drive or a demonstration the person can speak to AnA
 * without taking the wheel away from her.
 */
import React from 'react';
import type { LiveDriveState } from './liveDrive';
import { I } from './icons';

export function LiveDriveOverlay({
  state,
  activity,
  narration,
  onTakeOver,
  onStop,
  onSteer,
  waiting,
  onBackToConversation,
  replyElsewhere,
  onDismissReply,
}: {
  state: LiveDriveState;
  /**
   * Opens the conversation in progress. Passed while the shell's chat is
   * answering and the conversation is not the screen showing — AnA's drive
   * took the person away from it (design record ONE_ANA_ONE_CANVAS.md, slice 4
   * and risk 13: the strip keeps Stop, Take over and "Back to conversation").
   */
  onBackToConversation?: () => void;
  /**
   * The end of a reply that finished while the conversation was not on
   * screen, or null. With no right rail, nothing else on that screen shows it:
   * the strip stays, after the drive, to say the reply is there and to offer
   * the way back (QA 2026-10-08, j5). `''` when the turn ended with no words.
   */
  replyElsewhere?: string | null;
  /** Closes the reply notice; the reply stays in the conversation. */
  onDismissReply?: () => void;
  /**
   * AnA is held for a person (anaWorkModel.waitingForPerson): a Manual hold or
   * an approval she asked for. She is not driving then, and the strip says so
   * (row 74, end-to-end finding F2).
   */
  waiting?: 'manual' | 'approval' | null;
  /**
   * What AnA is doing RIGHT NOW — the running tool's label (or the turn's
   * status phase) from the live stream. Only ever a label the turn genuinely
   * reported; undefined renders nothing rather than a fabricated verb.
   */
  activity?: string;
  /**
   * The tail of AnA's REAL streaming narration. The shell passes it only on
   * surfaces that own the conversation (where the rail — the normal transcript
   * — is hidden), so a demo stop on e.g. the authoring editor is still heard.
   */
  narration?: string;
  /** Stop applying AnA's moves this turn (she keeps answering). */
  onTakeOver: () => void;
  /** Cancel the run entirely (the rail's Stop, reachable from the strip). */
  onStop: () => void;
  /** Interject a question/steer into the running turn (AnA keeps driving). */
  /* Returns whether the server accepted the steer — the drive strip keeps the
     text on a refusal rather than emptying the box as if it had been sent. */
  onSteer?: (message: string) => void | boolean | Promise<boolean | void>;
}) {
  const { active, mode, steps, turnLanded } = state;
  const [steer, setSteer] = React.useState('');

  /* Escape = take over, from anywhere, while the drive is live. Registered
     only while active so it cannot shadow other surfaces' Escape handling
     (CmdK closes itself on Escape before this matters — it stops propagation
     inside its own dialog). */
  React.useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onTakeOver();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onTakeOver]);

  /* Cleared only once the server has accepted it. Previously this emptied the
     box unconditionally, so a refused steer was indistinguishable from a sent
     one — see the note on the same seam in Shell.tsx's run-control bar.

     Declared above the `!active` early return, with the other hooks: it used to
     sit below it, so the hook ran only while the overlay was active and React
     saw a different hook count on the render where `active` flipped back on —
     "Rendered more hooks than during the previous render", a crash rather than
     a warning. */
  const [steerRefused, setSteerRefused] = React.useState(false);

  if (!active) {
    if (replyElsewhere == null) return null;
    return (
      <div className="ana-drive-strip" role="status" aria-live="polite" data-mode="reply">
        <div className="ana-drive-row">
          <span className="ana-drive-title">AnA&rsquo;s reply is in the conversation</span>
          <div className="ana-drive-actions">
            {onBackToConversation && (
              <button type="button" className="ana-drive-btn" onClick={onBackToConversation}>
                Back to conversation
              </button>
            )}
            {onDismissReply && (
              <button type="button" className="ana-drive-btn" onClick={onDismissReply}>
                Dismiss
              </button>
            )}
          </div>
        </div>
        {replyElsewhere && <div className="ana-drive-narration">{replyElsewhere}</div>}
      </div>
    );
  }
  const last = steps.length > 0 ? steps[steps.length - 1] : null;
  const demo = mode === 'demo';
  /* Moves that LANDED this turn — real counts from the reducer, never a script
     position the client cannot verify, and never a move still queued or one
     that failed (those are charged to the budget, not counted as stops). */
  const moves = turnLanded;
  /* A failure is worded by what the move was. A navigation's label is a
     screen's name ("CMC / Quality (Module 3)"): the screen did not open. An
     operation's label is a verb phrase ("Search the vault") and reads as one
     after "Could not". Every failure used to take the operation wording, so a
     screen that did not open read "Could not cMC / Quality (Module 3): …". */
  const failedLine =
    last && last.failed
      ? last.kind === 'navigate'
        ? `Could not open ${last.label}: ${last.failed}`
        : `Could not ${last.label.charAt(0).toLowerCase() + last.label.slice(1)}: ${last.failed}`
      : null;

  const submitSteer = () => {
    const text = steer.trim();
    if (!text || !onSteer) return;
    setSteerRefused(false);
    void Promise.resolve(onSteer(text))
      .then((accepted) => {
        if (accepted === false) { setSteerRefused(true); return; }
        setSteer('');
      })
      .catch(() => setSteerRefused(true));
  };

  return (
    <div className="ana-drive-strip" role="status" aria-live="polite" data-mode={mode}>
      <div className="ana-drive-row">
        <span className="ana-drive-dot" aria-hidden="true" />
        <span className="ana-drive-title">{waiting ? 'AnA is waiting for you' : demo ? 'AnA is demonstrating' : 'AnA is driving'}</span>
        {demo && moves > 0 && (
          <span className="ana-drive-count">{moves} {moves === 1 ? 'stop' : 'stops'}</span>
        )}
        {activity && (
          <span className="ana-drive-activity" title={activity}>
            {activity}
          </span>
        )}
        {last && !last.failed && (
          <span className="ana-drive-step" title={last.label}>
            <span className="ana-drive-step-ic" aria-hidden="true">
              {last.kind === 'act' ? I.zap : I.arrowRight}
            </span>
            {last.label}
          </span>
        )}
        {failedLine && (
          <span className="ana-drive-step is-failed" title={failedLine}>
            {failedLine}
          </span>
        )}
        {onSteer && (
          <form
            className="ana-drive-steer"
            onSubmit={(e) => {
              e.preventDefault();
              submitSteer();
            }}
          >
            <input
              type="text"
              className="ana-drive-steer-input"
              placeholder={demo ? 'Ask AnA anything mid-demo…' : 'Ask or steer AnA…'}
              aria-label="Ask or steer AnA while she drives"
              value={steer}
              aria-invalid={steerRefused || undefined}
              aria-describedby={steerRefused ? 'ana-drive-steer-err' : undefined}
              onChange={(e) => {
                setSteer(e.target.value);
                if (steerRefused) setSteerRefused(false);
              }}
              /* The strip's own Escape must still take over — but not while
                 the person is typing here; let them abandon the field first. */
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
          </form>
        )}
        {steerRefused && (
          <span id="ana-drive-steer-err" className="ana-drive-steer-err" role="status">
            Not sent — AnA did not accept this. The text is still here.
          </span>
        )}
        <div className="ana-drive-actions">
          {onBackToConversation && (
            <button type="button" className="ana-drive-btn" onClick={onBackToConversation}>
              Back to conversation
            </button>
          )}
          <button type="button" className="ana-drive-btn" onClick={onTakeOver}>
            Take over
            <kbd className="ana-drive-kbd" aria-hidden="true">
              Esc
            </kbd>
          </button>
          <button type="button" className="ana-drive-btn is-stop" onClick={onStop}>
            Stop
          </button>
        </div>
      </div>
      {narration && <div className="ana-drive-narration">{narration}</div>}
    </div>
  );
}
