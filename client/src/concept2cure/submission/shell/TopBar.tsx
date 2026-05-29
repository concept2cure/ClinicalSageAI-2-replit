// Submission gateway TopBar — breadcrumb + density toggle + environment toggle +
// region filter. Mirrors tasking TopBar idioms.

import * as React from 'react';
import { SubmissionIcon } from '../icons';
import { REGION_LABEL } from '../data/nav';

export type Environment = 'staging' | 'production';
export type RegionFilter = 'all' | 'fda' | 'ema' | 'pmda';

interface TopBarProps {
  hereLabel:       string;
  density:         string;
  onDensity:       (d: string) => void;
  environment:     Environment;
  onEnvironment:   (e: Environment) => void;
  region:          RegionFilter;
  onSelectRegion:  (r: RegionFilter) => void;
  onOpenPalette:   () => void;
}

export function SubmissionTopBar({
  hereLabel, density, onDensity, environment, onEnvironment,
  region, onSelectRegion, onOpenPalette,
}: TopBarProps) {
  return (
    <header className="topbar">
      <div className="crumbs">
        <span>Concept2Cure.RI</span>
        <span className="sep">›</span>
        <span>Submission gateway</span>
        <span className="sep">›</span>
        <span className="here">{hereLabel}</span>
      </div>
      <div className="tb-spacer" />
      <button className="tb-cmdk" type="button" onClick={onOpenPalette} title="Command · ⌘K">
        <span className="ico"><SubmissionIcon name="search" /></span>
        <span className="lbl">Ask AnA, jump to…</span>
        <span className="kbd">⌘K</span>
      </button>
      <div className="bp-density-toggle" role="tablist" aria-label="Environment">
        {(['production', 'staging'] as const).map(e => (
          <button key={e} type="button"
                  role="tab"
                  aria-selected={environment === e}
                  data-active={environment === e || undefined}
                  onClick={() => onEnvironment(e)}
                  title={e === 'production' ? 'Production agency endpoint' : 'Pre-production endpoint'}>
            {e === 'production' ? 'Production' : 'Staging'}
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
          value={region}
          onChange={e => onSelectRegion(e.target.value as RegionFilter)}
          aria-label="Region filter"
          style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)' }}>
          <option value="all">All regions</option>
          <option value="fda">{REGION_LABEL.fda}</option>
          <option value="ema">{REGION_LABEL.ema}</option>
          <option value="pmda">{REGION_LABEL.pmda}</option>
        </select>
        <button className="tb-btn" type="button" title="Notifications" aria-label="Notifications"><SubmissionIcon name="bell" /></button>
        <button className="tb-btn" type="button" title="Help" aria-label="Help"><SubmissionIcon name="helpCircle" /></button>
      </div>
    </header>
  );
}
