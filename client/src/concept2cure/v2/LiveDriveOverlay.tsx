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
 * {enabled:true}` turn is live, and the step it shows is the last navigation
 * that actually happened — there is no simulated progress and no idle
 * placeholder. When AnA is not driving there is nothing here at all.
 */
import React from 'react';
import type { LiveDriveState } from './liveDrive';

export function LiveDriveOverlay({
  state,
  activity,
  onTakeOver,
  onStop,
}: {
  state: LiveDriveState;
  /**
   * What AnA is doing RIGHT NOW — the running tool's label (or the turn's
   * status phase) from the live stream. Only ever a label the turn genuinely
   * reported; undefined renders nothing rather than a fabricated verb.
   */
  activity?: string;
  /** Stop applying AnA's navigations this turn (she keeps answering). */
  onTakeOver: () => void;
  /** Cancel the run entirely (the rail's Stop, reachable from the strip). */
  onStop: () => void;
}) {
  const { active, steps } = state;

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

  return (
    <div className="ana-drive-strip" role="status" aria-live="polite">
      <span className="ana-drive-dot" aria-hidden="true" />
      <span className="ana-drive-title">AnA is driving</span>
      {activity && (
        <span className="ana-drive-activity" title={activity}>
          {activity}
        </span>
      )}
      {last && (
        <span className="ana-drive-step" title={last.label}>
          → {last.label}
        </span>
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
  );
}
