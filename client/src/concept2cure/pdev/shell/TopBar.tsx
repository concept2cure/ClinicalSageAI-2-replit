/**
 * PDEV top bar — breadcrumb + active-program pill + command-palette
 * placeholder. Port of design-system/ui_kits/pdev/Shell.jsx > PdevTopBar.
 *
 * Command palette is a placeholder in PR 1 (calls `onOpenPalette` which
 * surfaces the request to AnA in lieu of a real ⌘K modal); the real
 * palette lands with the global Search surface in Phase 8.
 */

import * as React from 'react';
import { PdevIcon } from '../icons';
import type { PdevProgramView } from '../data/types';

interface TopBarProps {
  hereLabel: string;
  program: PdevProgramView['program'] | null;
  onOpenPalette: () => void;
}

export function PdevTopBar({ hereLabel, program, onOpenPalette }: TopBarProps) {
  return (
    <header className="pdev-topbar">
      <div className="pdev-crumbs">
        <span>Concept2Cure.RI</span>
        <span className="sep">›</span>
        <span>PDEV</span>
        {program && (
          <>
            <span className="sep">›</span>
            <span>{program.code}</span>
          </>
        )}
        <span className="sep">›</span>
        <span className="here">{hereLabel}</span>
      </div>
      <div className="pdev-tb-spacer" />
      {program && (
        <button
          className="pdev-tb-pill"
          onClick={onOpenPalette}
          title="Switch program"
          type="button"
        >
          <span className="pdev-dot" />
          <span>
            {program.code} · {program.productName.split(' · ')[0]}
          </span>
          <span className="chev">
            <PdevIcon name="down" />
          </span>
        </button>
      )}
      <button
        className="pdev-tb-cmdk"
        onClick={onOpenPalette}
        title="Command palette · ⌘K"
        type="button"
      >
        <span className="ico">
          <PdevIcon name="search" />
        </span>
        <span className="lbl">Ask AnA, jump to…</span>
        <span className="kbd">⌘K</span>
      </button>
      <div className="pdev-tb-actions">
        <button className="pdev-tb-btn" type="button" aria-label="Filter">
          <PdevIcon name="filter" />
        </button>
        <button className="pdev-tb-btn" type="button" aria-label="Notifications">
          <PdevIcon name="bell" />
        </button>
        <button className="pdev-tb-btn" type="button" aria-label="Help">
          <PdevIcon name="help" />
        </button>
      </div>
    </header>
  );
}
