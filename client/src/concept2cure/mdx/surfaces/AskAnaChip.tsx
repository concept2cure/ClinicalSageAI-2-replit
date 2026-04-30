/**
 * Inline "Ask AnA about this" affordance — sparkle icon, hover-revealed.
 * Rendered as <span role="button"> because it lives inside clickable rows;
 * stops propagation so it doesn't open the parent.
 *
 * Ported from Surfaces.jsx > AskAnaChip.
 */

import * as React from 'react';
import { I } from '../icons';

export interface AskAnaChipProps {
  onAsk?: () => void;
  label?: string;
  className?: string;
}

export function AskAnaChip({ onAsk, label = 'Ask AnA', className = '' }: AskAnaChipProps) {
  const fire = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    onAsk?.();
  };
  return (
    <span
      className={`ask-ana-chip ${className}`}
      role="button"
      tabIndex={0}
      onClick={fire}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          fire(e);
        }
      }}
      title={label}
      aria-label={label}
    >
      <span className="ico">{I.sparkles}</span>
    </span>
  );
}
