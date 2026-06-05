/**
 * Temporary — placeholder shown where a Submission Center workspace is wired to
 * live data but its design-system UI kit has not dropped yet. Swap this for the
 * kit component when Claude Design ships it (see _install/README.md).
 *
 * Design-system compliant: sentence case, 13px body, tokens from
 * colors_and_type.css, one muted focal icon, no emoji.
 */
import { Hammer } from 'lucide-react';
import type { CSSProperties } from 'react';

const wrap: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '60vh',
  padding: 24,
  fontFamily: 'var(--font-sans, system-ui, sans-serif)',
};

const card: CSSProperties = {
  maxWidth: 460,
  textAlign: 'center',
  background: 'var(--bg-100, #fff)',
  border: '1px solid var(--border-subtle, var(--border, #e6e6e6))',
  borderRadius: 'var(--radius-lg, 12px)',
  padding: '32px 28px',
};

const eyebrow: CSSProperties = {
  fontSize: 10,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-300, #8a8a8a)',
  marginTop: 12,
};

const title: CSSProperties = {
  fontSize: 18,
  fontWeight: 500,
  color: 'var(--text-100, #1a1a1a)',
  margin: '6px 0 10px',
};

const body: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.5,
  color: 'var(--text-200, #555)',
  margin: 0,
};

const bodyMuted: CSSProperties = { ...body, color: 'var(--text-300, #8a8a8a)', marginTop: 10 };

export interface TemporaryProps {
  /** Workspace name, sentence case, e.g. "Builder". */
  workspace: string;
  /** Optional one-line note about what is live underneath. */
  note?: string;
}

export function Temporary({ workspace, note }: TemporaryProps) {
  return (
    <div style={wrap} data-temporary={workspace}>
      <div style={card}>
        <Hammer size={18} aria-hidden style={{ color: 'var(--text-300, #8a8a8a)' }} />
        <div style={eyebrow}>Temporary</div>
        <h1 style={title}>{workspace}</h1>
        <p style={body}>
          This workspace is wired to live data and waiting on its design-system UI kit. You are seeing a
          temporary placeholder.
        </p>
        {note ? <p style={bodyMuted}>{note}</p> : null}
      </div>
    </div>
  );
}

export default Temporary;
