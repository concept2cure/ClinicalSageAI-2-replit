import React from 'react';
import { PATHWAY_LABEL, REGULATORY_PATHWAYS } from '@shared/constants/mdx';

interface PortfolioCounts {
  total: number;
  byWorkstream: Record<string, number>;
  byPathway: Record<string, number>;
  filingWithin60Days: number;
}

const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
function countMap(value: unknown): value is Record<string, number> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(isCount);
}
/** Absent metadata is an older page-only response, never a whole-portfolio zero. */
export function portfolioCounts(meta: Record<string, unknown> | undefined): PortfolioCounts | null {
  const counts = meta?.counts as Partial<PortfolioCounts> | undefined;
  if (!counts || !isCount(counts.total) || !isCount(counts.filingWithin60Days)
    || !countMap(counts.byWorkstream) || !countMap(counts.byPathway)) return null;
  return counts as PortfolioCounts;
}

/** Extend the existing Client URL with bound server filters, in stable order. */
export function portfolioFilterUrl(clientWorkspaceId: string, workstream: string, pathway: string): string {
  const params = new URLSearchParams();
  for (const [name, value] of [['clientWorkspaceId', clientWorkspaceId], ['ws', workstream], ['pathway', pathway]]) {
    if (value !== 'all') params.set(name, value);
  }
  const query = params.toString();
  return `/api/c2c/projects${query ? `?${query}` : ''}`;
}

export function portfolioIsUnfilteredEmpty(empty: boolean, workstream: string, pathway: string): boolean {
  return empty && [workstream, pathway].every(value => value === 'all');
}

export function portfolioStatusChoices(statuses: string[], selected: string) {
  const choices = ['all', ...new Set([...statuses.filter(Boolean), ...[selected].filter(value => value !== 'all')])];
  return { choices, visible: choices.length > 2 || selected !== 'all' };
}

const sum = (values: Record<string, number>) => Object.values(values).reduce((total, value) => total + value, 0);
const chipLabel = (label: string, value: number | undefined) => value === undefined ? label : `${label} ${value}`;

/** Workstream counts ignore ws/pathway; pathway counts honor ws and ignore
 * pathway. Both honor Client. Selected chips remain clearable after failures. */
export function ProjectPortfolioFilters({ workstream, pathway, counts, hasDeviceRows, onWorkstream, onPathway }: {
  workstream: string; pathway: string; counts: PortfolioCounts | null; hasDeviceRows: boolean;
  onWorkstream: (value: string) => void; onPathway: (value: string) => void;
}) {
  const pathwaysVisible = workstream === 'MDX' || pathway !== 'all' || hasDeviceRows || (counts?.byWorkstream.MDX ?? 0) > 0;
  const pathways = REGULATORY_PATHWAYS.filter(key => (counts?.byPathway[key] ?? 0) > 0 || key === pathway);
  return <div style={{ display: 'grid', gap: 8, marginBottom: 8, justifyItems: 'start' }}>
    <div className="ws-switch" style={{ marginBottom: 0 }} role="group" aria-label="Workstream filters">
      {['all', 'MDX', 'Biotech', 'Pharma'].map(key => <button key={key}
        className={`ws-btn${workstream === key ? ' on' : ''}`} aria-pressed={workstream === key}
        onClick={() => onWorkstream(key)}>
        {chipLabel(key === 'all' ? 'All workstreams' : key, counts ? (key === 'all' ? sum(counts.byWorkstream) : counts.byWorkstream[key] ?? 0) : undefined)}
      </button>)}
    </div>
    {pathwaysVisible && <div className="ws-switch" style={{ marginBottom: 0, flexWrap: 'wrap', maxWidth: '100%' }} role="group" aria-label="Pathway filters">
      <button className={`ws-btn${pathway === 'all' ? ' on' : ''}`} aria-pressed={pathway === 'all'} onClick={() => onPathway('all')}>
        {chipLabel('All pathways', counts ? sum(counts.byPathway) : undefined)}
      </button>
      {pathways.map(key => <button key={key} className={`ws-btn${pathway === key ? ' on' : ''}`}
        aria-pressed={pathway === key} onClick={() => onPathway(key)}>
        {chipLabel(PATHWAY_LABEL[key], counts?.byPathway[key])}
      </button>)}
    </div>}
  </div>;
}
