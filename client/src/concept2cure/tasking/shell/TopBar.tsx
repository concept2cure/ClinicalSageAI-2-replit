// Tasking TopBar — breadcrumb + density toggle + program (project) filter +
// mine / everyone owner toggle. Mirrors risk TopBar idioms.

import * as React from 'react';
import { TaskingIcon } from '../icons';

export interface TaskingProjectOption {
  /** Numeric project id the unified-tasks API filters on. */
  id: number;
  label: string;
}

interface TopBarProps {
  hereLabel:       string;
  density:         string;
  onDensity:       (d: string) => void;
  projectId:       number | null;
  projectOptions:  TaskingProjectOption[];
  onSelectProject: (id: number | null) => void;
  owner:           'all' | 'mine';
  onSelectOwner:   (v: 'all' | 'mine') => void;
  onOpenPalette:   () => void;
}

export function TaskingTopBar({
  hereLabel, density, onDensity, projectId, projectOptions, onSelectProject,
  owner, onSelectOwner, onOpenPalette,
}: TopBarProps) {
  return (
    <header className="topbar">
      <div className="crumbs">
        <span>Concept2Cure.RI</span>
        <span className="sep">›</span>
        <span>Tasking</span>
        <span className="sep">›</span>
        <span className="here">{hereLabel}</span>
      </div>
      <div className="tb-spacer" />
      <button className="tb-cmdk" type="button" onClick={onOpenPalette} title="Command · ⌘K">
        <span className="ico"><TaskingIcon name="search" /></span>
        <span className="lbl">Ask AnA, jump to…</span>
        <span className="kbd">⌘K</span>
      </button>
      <div className="bp-density-toggle" role="tablist" aria-label="Owner">
        {(['all', 'mine'] as const).map(o => (
          <button key={o} type="button"
                  role="tab"
                  aria-selected={owner === o}
                  data-active={owner === o || undefined}
                  onClick={() => onSelectOwner(o)}
                  title={o === 'all' ? 'Everyone' : 'Assigned to you'}>
            {o === 'all' ? 'Everyone' : 'Mine'}
          </button>
        ))}
      </div>
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
          value={projectId == null ? '' : String(projectId)}
          onChange={e => onSelectProject(e.target.value === '' ? null : Number(e.target.value))}
          aria-label="Program filter"
          style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)' }}>
          <option value="">All programs</option>
          {projectOptions.map(o => (
            <option key={o.id} value={String(o.id)}>{o.label}</option>
          ))}
        </select>
        <button className="tb-btn" type="button" title="Notifications" aria-label="Notifications"><TaskingIcon name="bell" /></button>
        <button className="tb-btn" type="button" title="Help" aria-label="Help"><TaskingIcon name="helpCircle" /></button>
      </div>
    </header>
  );
}
