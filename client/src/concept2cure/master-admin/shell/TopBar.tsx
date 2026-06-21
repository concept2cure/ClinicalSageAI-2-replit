/**
 * Master Administration topbar — breadcrumbs + a support-only context badge +
 * a refresh action. Kept intentionally lean: this is an internal console.
 */

import * as React from 'react';
import { I } from '../../mdx/icons';

export interface TopBarProps {
  hereLabel: string;
  onRefresh: () => void;
}

export function TopBar({ hereLabel, onRefresh }: TopBarProps) {
  return (
    <header className="ma-topbar">
      <div className="ma-crumbs">
        <span>Concept2Cure</span>
        <span className="ma-sep">›</span>
        <span>Master Administration</span>
        <span className="ma-sep">›</span>
        <span className="ma-here">{hereLabel}</span>
      </div>
      <div className="ma-tb-spacer" />
      <span className="ma-tb-tag" title="Internal, non client-facing console">
        <span className="ma-dot" /> Platform owner · support
      </span>
      <button className="ma-tb-btn" onClick={onRefresh} title="Refresh data" aria-label="Refresh data">
        {I.zap}
      </button>
    </header>
  );
}
