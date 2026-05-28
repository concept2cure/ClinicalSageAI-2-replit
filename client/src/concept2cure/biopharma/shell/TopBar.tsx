// Biopharma TopBar — port of ui_kits/biopharma/shell.jsx TopBar.

import * as React from 'react';
import { BioIcon } from '../icons';
import type { BiopharmaProgram } from '../data/programs';

interface TopBarProps {
  hereLabel:      string;
  program:        BiopharmaProgram | null;
  density:        string;
  onDensity:      (d: string) => void;
  clientType:     string;
  setClientType:  (t: string) => void;
  onOpenPalette:  () => void;
}

export function BiopharmaTopBar({ hereLabel, program, density, onDensity, clientType, setClientType, onOpenPalette }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="crumbs">
        <span>Concept2Cure.RI</span>
        <span className="sep">›</span>
        <span>Biotech and Pharma</span>
        <span className="sep">›</span>
        <span className="here">{hereLabel}</span>
      </div>
      <div className="tb-spacer" />
      {program && (
        <button className="tb-pill" type="button" title="Switch program (⌘K)" onClick={onOpenPalette}>
          <span className="dot" />
          <span>{program.code ?? program.name}</span>
          <span style={{ color: 'var(--text-400)' }}><BioIcon name="chevronDown" /></span>
        </button>
      )}
      <button className="tb-cmdk" type="button" onClick={onOpenPalette} title="Command · ⌘K">
        <span className="ico"><BioIcon name="search" /></span>
        <span className="lbl">Ask AnA, jump to…</span>
        <span className="kbd">⌘K</span>
      </button>
      <div className="bp-density-toggle" role="tablist" aria-label="Density">
        {(['compact','comfortable','spacious'] as const).map(d => (
          <button key={d} type="button"
                  data-active={density === d || undefined}
                  onClick={() => onDensity(d)}
                  title={`${d.charAt(0).toUpperCase() + d.slice(1)} density`}>
            {d.charAt(0).toUpperCase() + d.slice(1)}
          </button>
        ))}
      </div>
      <div className="tb-actions">
        <select
          value={clientType}
          onChange={e => setClientType(e.target.value)}
          aria-label="Client type"
          style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)' }}>
          <option value="pharma">Pharma</option>
          <option value="biotech">Biotech</option>
        </select>
        <button className="tb-btn" type="button" title="Filter"><BioIcon name="filter" /></button>
        <button className="tb-btn" type="button" title="Notifications"><BioIcon name="bell" /></button>
        <button className="tb-btn" type="button" title="Help"><BioIcon name="helpCircle" /></button>
      </div>
    </header>
  );
}
