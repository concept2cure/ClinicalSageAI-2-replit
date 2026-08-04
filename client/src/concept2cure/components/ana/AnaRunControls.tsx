/**
 * AnA run controls — pause / resume / interject a live agentic run.
 *
 * A compact, self-contained strip shown above the composer while AnA is
 * actively working a multi-round investigation. It lets the human take control
 * mid-run — pause AnA at the next step, type a steer ("focus on the pediatric
 * subgroup instead"), or resume — instead of only being able to hard-stop.
 *
 * Presentational only: all state lives in useAnaChat (runStatus + control
 * methods). Renders nothing when no run is active. Theme-neutral inline styling
 * so it reads correctly in both light and dark shells without design-token
 * coupling.
 */
import { useState } from 'react';
import type { RunControlStatus } from './useAnaChat';

export interface AnaRunControlsProps {
  status: RunControlStatus;
  onPause: () => void;
  onResume: () => void;
  onInterject: (message: string) => void;
}

const stripStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
  padding: '6px 10px',
  margin: '0 0 8px',
  borderRadius: 10,
  border: '1px solid rgba(127,127,127,0.25)',
  background: 'rgba(127,127,127,0.08)',
  fontSize: 13,
};

const btnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 10px',
  borderRadius: 8,
  border: '1px solid rgba(127,127,127,0.35)',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  font: 'inherit',
};

const dotStyle = (color: string): React.CSSProperties => ({
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: color,
  flex: '0 0 auto',
});

export function AnaRunControls({ status, onPause, onResume, onInterject }: AnaRunControlsProps) {
  const [steer, setSteer] = useState('');

  if (status !== 'running' && status !== 'paused') return null;

  const submitSteer = () => {
    const text = steer.trim();
    if (!text) return;
    onInterject(text);
    setSteer('');
  };

  return (
    <div style={stripStyle} role="group" aria-label="AnA run controls">
      {status === 'running' ? (
        <>
          <span style={dotStyle('#22c55e')} aria-hidden />
          <span style={{ opacity: 0.85 }}>AnA is working…</span>
          <button type="button" style={btnStyle} onClick={onPause} aria-label="Pause AnA">
            ⏸ Pause
          </button>
        </>
      ) : (
        <>
          <span style={dotStyle('#f59e0b')} aria-hidden />
          <span style={{ opacity: 0.85 }}>Paused — add a note or redirect</span>
          <input
            type="text"
            value={steer}
            onChange={(e) => setSteer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitSteer();
              }
            }}
            placeholder="e.g. focus on the pediatric subgroup instead"
            aria-label="Interjection message for AnA"
            style={{
              flex: '1 1 220px',
              minWidth: 160,
              padding: '4px 8px',
              borderRadius: 8,
              border: '1px solid rgba(127,127,127,0.35)',
              background: 'rgba(127,127,127,0.06)',
              color: 'inherit',
              font: 'inherit',
            }}
          />
          <button
            type="button"
            style={btnStyle}
            onClick={submitSteer}
            disabled={!steer.trim()}
            aria-label="Send interjection to AnA"
          >
            Send steer
          </button>
          <button type="button" style={btnStyle} onClick={onResume} aria-label="Resume AnA">
            ▶ Resume
          </button>
        </>
      )}
    </div>
  );
}
