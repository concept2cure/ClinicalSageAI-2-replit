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
/** An option's text, with its count only when the server sent one: no count is not a 0. */
const optionLabel = (label: string, value: number | undefined) => value === undefined ? label : `${label} (${value})`;

/**
 * Each portfolio workstream code as a client type, in sentence case. "MDX" is
 * an internal code; the rail names that client type "Medical Device & IVD"
 * (registryModel.ts), written here in sentence case. The project page's About
 * card reads the same map (D3-2), so a project's client type is named once.
 */
export const WS_LABEL: Readonly<Record<string, string>> = {
  MDX: 'Medical device & IVD',
  Biotech: 'Biotech',
  Pharma: 'Pharma',
  CRO: 'CRO',
};

/** The client types the filter offers, in the server's filter values (shared/navigation/surface-actions.ts). */
const CLIENT_TYPES = ['MDX', 'Biotech', 'Pharma'] as const;

/** Workstream counts ignore ws/pathway; pathway counts honor ws and ignore
 * pathway. Both honor Client. A selected value stays clearable after a failed
 * read: its option is kept, and "All" is always offered.
 *
 * Two toolbar selects (D2 §1.4 item 4), where there were two rows of
 * segmented buttons: the same state, the same server URL
 * (`portfolioFilterUrl`) and the same `projects.filter` action. */
export function ProjectPortfolioFilters({ workstream, pathway, counts, hasDeviceRows, onWorkstream, onPathway }: {
  workstream: string; pathway: string; counts: PortfolioCounts | null; hasDeviceRows: boolean;
  onWorkstream: (value: string) => void; onPathway: (value: string) => void;
}) {
  const pathways = REGULATORY_PATHWAYS.filter(key => (counts?.byPathway[key] ?? 0) > 0 || key === pathway);
  /* Drug and biologic applications are pathways too since 2026-10-31 (IND,
     NDA, BLA…: every one was "Other"), so the select shows whenever there is a
     choice to make, in any workstream. */
  const pathwaysVisible = pathway !== 'all' || pathways.length > 1
    || (counts === null && (workstream === 'MDX' || hasDeviceRows));
  return <>
    <select className="c2c-input pj-filter" aria-label="Client type" value={workstream}
      onChange={event => onWorkstream(event.target.value)}>
      <option value="all">{optionLabel('All client types', counts ? sum(counts.byWorkstream) : undefined)}</option>
      {CLIENT_TYPES.map(key => <option key={key} value={key}>
        {optionLabel(WS_LABEL[key], counts ? counts.byWorkstream[key] ?? 0 : undefined)}
      </option>)}
      {workstream !== 'all' && !(CLIENT_TYPES as readonly string[]).includes(workstream)
        && <option value={workstream}>{WS_LABEL[workstream] ?? workstream}</option>}
    </select>
    {pathwaysVisible && <select className="c2c-input pj-filter" aria-label="Pathway" value={pathway}
      onChange={event => onPathway(event.target.value)}>
      <option value="all">{optionLabel('All pathways', counts ? sum(counts.byPathway) : undefined)}</option>
      {pathways.map(key => <option key={key} value={key}>{optionLabel(PATHWAY_LABEL[key], counts?.byPathway[key])}</option>)}
    </select>}
  </>;
}
