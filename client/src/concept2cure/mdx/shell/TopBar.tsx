/**
 * 48px topbar — breadcrumbs + program pill + ⌘K palette trigger + actions.
 * Ported from Shell.jsx > TopBar.
 */

import * as React from 'react';
import { I } from '../icons';
import type { Program } from '../data/programs';

export interface TopBarProps {
  hereLabel: string;
  program: Program | null;
  onOpenPalette: () => void;
}

export function TopBar({ hereLabel, program, onOpenPalette }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="crumbs">
        <span style={{ color: 'inherit' }}>Concept2Cure.RI</span>
        <span className="sep">›</span>
        <span>Medical Device and Diagnostics</span>
        <span className="sep">›</span>
        <span className="here">{hereLabel}</span>
      </div>
      <div className="tb-spacer" />
      {program && (
        <button
          className="tb-pill"
          title="Switch program (⌘K)"
          onClick={onOpenPalette}
        >
          <span className="dot" />
          <span>
            {program.code} · {program.title.split(' ').slice(0, 2).join(' ')}
          </span>
          <span style={{ color: 'var(--text-400)' }}>{I.down}</span>
        </button>
      )}

      <button className="tb-cmdk" onClick={onOpenPalette} title="Command · ⌘K">
        <span className="ico">{I.search}</span>
        <span className="lbl">Ask AnA, jump to…</span>
        <span className="kbd">⌘K</span>
      </button>

      <div className="tb-actions">
        <button className="tb-btn" title="Filter">{I.filter}</button>
        <button className="tb-btn" title="Notifications">{I.bell}</button>
        <button className="tb-btn" title="Help">{I.help}</button>
      </div>
    </header>
  );
}
