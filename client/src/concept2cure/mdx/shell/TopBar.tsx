/**
 * 48px topbar — breadcrumbs + program pill + ⌘K palette trigger + actions.
 * Ported from Shell.jsx > TopBar.
 */

import * as React from 'react';
import { I } from '../icons';
import { useSampleMode } from '../components/DataGate';
import { sampleModeAvailable, setSampleMode } from '../lib/sampleMode';
import { NotificationsBell } from './NotificationsBell';
import type { Program } from '../data/programs';

export interface TopBarProps {
  hereLabel: string;
  program: Program | null;
  onOpenPalette: () => void;
}

export function TopBar({ hereLabel, program, onOpenPalette }: TopBarProps) {
  const sampleOn = useSampleMode();
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

      {/* Sample mode is the only way canonical example content reaches a
          surface. It is deliberately loud while on: a user must never be
          unsure whether they are looking at their own regulated data.
          Absent entirely from production builds. */}
      {sampleModeAvailable() && (
        <button
          className={`tb-sample${sampleOn ? ' on' : ''}`}
          onClick={() => setSampleMode(!sampleOn)}
          aria-pressed={sampleOn}
          title={
            sampleOn
              ? 'Showing canonical sample content where your workspace has no data. Click to show your own data only.'
              : 'Show canonical sample content where your workspace has no data.'
          }
        >
          {sampleOn ? I.alertCircle : I.database}
          <span>{sampleOn ? 'Sample data on' : 'Sample data'}</span>
        </button>
      )}

      <div className="tb-actions">
        {/* Filter and Help have no backend behind them yet. Rather than
            wire them to nothing — the dead-control pattern this work has
            been removing — they are left out until they do something.
            The bell is here because /api/mdx/notifications is real. */}
        <NotificationsBell />
      </div>
    </header>
  );
}
