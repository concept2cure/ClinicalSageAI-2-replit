/**
 * Business Center topbar — breadcrumbs, an owner/finance context badge, and a
 * refresh action. Kept lean: this is an internal, non client-facing console.
 */

import * as React from 'react';
import { I } from '../../mdx/icons';

export interface TopBarProps {
  hereLabel: string;
  onRefresh: () => void;
}

export function TopBar({ hereLabel, onRefresh }: TopBarProps) {
  return (
    <header className="bizc-topbar">
      <div className="bizc-crumbs">
        <span>Concept2Cure</span>
        <span className="bizc-sep">›</span>
        <span>Business Center</span>
        <span className="bizc-sep">›</span>
        <span className="bizc-here">{hereLabel}</span>
      </div>
      <div className="bizc-tb-spacer" />
      <span className="bizc-tb-tag" title="Internal, non client-facing console">
        <span className="bizc-dot" /> Owner · finance
      </span>
      <button
        className="bizc-tb-btn"
        onClick={onRefresh}
        title="Refresh data"
        aria-label="Refresh data"
      >
        {I.zap}
      </button>
    </header>
  );
}
