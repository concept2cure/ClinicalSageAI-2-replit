// Risk TopBar — breadcrumb + density toggle + project selector.
// Mirrors labeling TopBar idioms.

import * as React from 'react';
import { RiskIcon } from '../icons';

export interface RiskProjectOption {
  id: string;
  label: string;
}

interface TopBarProps {
  hereLabel:       string;
  density:         string;
  onDensity:       (d: string) => void;
  projectId:       string | null;
  projectOptions:  RiskProjectOption[];
  onSelectProject: (id: string) => void;
  onOpenPalette:   () => void;
}

export function RiskTopBar({
  hereLabel, density, onDensity, projectId, projectOptions, onSelectProject, onOpenPalette,
}: TopBarProps) {
  return (
    <header className="topbar">
      <div className="crumbs">
        <span>Concept2Cure.RI</span>
        <span className="sep">›</span>
        <span>Risk management</span>
        <span className="sep">›</span>
        <span className="here">{hereLabel}</span>
      </div>
      <div className="tb-spacer" />
      <button className="tb-cmdk" type="button" onClick={onOpenPalette} title="Command · ⌘K">
        <span className="ico"><RiskIcon name="search" /></span>
        <span className="lbl">Ask AnA, jump to…</span>
        <span className="kbd">⌘K</span>
      </button>
      <div className="bp-density-toggle" role="tablist" aria-label="Density">
        {(['compact', 'comfortable', 'spacious'] as const).map(d => (
          <button key={d} type="button"
                  role="tab"
                  aria-selected={density === d}
                  data-active={density === d || undefined}
                  onClick={() => onDensity(d)}
                  title={`${d.charAt(0).toUpperCase() + d.slice(1)} density`}>
            {d.charAt(0).toUpperCase() + d.slice(1)}
          </button>
        ))}
      </div>
      <div className="tb-actions">
        <select
          value={projectId ?? ''}
          onChange={e => onSelectProject(e.target.value)}
          aria-label="Active project"
          style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)' }}>
          {projectOptions.length === 0 && <option value="">No projects</option>}
          {projectOptions.length > 0 && projectId == null && <option value="">Select a project</option>}
          {projectOptions.map(o => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
        <button className="tb-btn" type="button" title="Notifications" aria-label="Notifications"><RiskIcon name="bell" /></button>
        <button className="tb-btn" type="button" title="Help" aria-label="Help"><RiskIcon name="helpCircle" /></button>
      </div>
    </header>
  );
}
