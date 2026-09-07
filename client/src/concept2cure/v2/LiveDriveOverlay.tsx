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
 * driving there is nothing here at all.
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
}: {
  state: LiveDriveState;
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
  onSteer?: (message: string) => void;
}) {
  const { active, mode, steps, turnApplied, turnActionsApplied } = state;
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

  if (!active) return null;
  const last = steps.length > 0 ? steps[steps.length - 1] : null;
  const demo = mode === 'demo';
  /* Moves applied THIS turn — real counts from the reducer, never a script
     position the client cannot verify. */
  const moves = turnApplied + turnActionsApplied;

  const submitSteer = () => {
    const text = steer.trim();
    if (!text || !onSteer) return;
    onSteer(text);
    setSteer('');
  };

  return (
    <div className="ana-drive-strip" role="status" aria-live="polite" data-mode={mode}>
      <div className="ana-drive-row">
        <span className="ana-drive-dot" aria-hidden="true" />
        <span className="ana-drive-title">{demo ? 'AnA is demonstrating' : 'AnA is driving'}</span>
        {demo && moves > 0 && (
          <span className="ana-drive-count">{moves} {moves === 1 ? 'stop' : 'stops'}</span>
        )}
        {activity && (
          <span className="ana-drive-activity" title={activity}>
            {activity}
          </span>
        )}
        {last && (
          <span className="ana-drive-step" title={last.label}>
            <span className="ana-drive-step-ic" aria-hidden="true">
              {last.kind === 'act' ? I.zap : I.arrowRight}
            </span>
            {last.label}
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
              onChange={(e) => setSteer(e.target.value)}
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
        <div className="ana-drive-actions">
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
