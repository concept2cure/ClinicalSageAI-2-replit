/**
 * PDEV rail nav config — port of PDEV_NAV_ITEMS / PDEV_NAV_GROUPS from
 * design-system/ui_kits/pdev/data.jsx.
 *
 * The full kit declares 8 nav items spanning Workstream + Workspace
 * groups (overview, cmc, nonclinical, clinical, regulatory, ind_assembly,
 * contradictions, fda_interactions). Phase 7.0 + 7.1 ships only the
 * Workstream group (5 items); Workspace items light up in later sub-phases
 * once their surfaces land.
 */

export type PdevNavGroupId = 'workstream' | 'workspace' | 'system';

export interface PdevNavGroup {
  id: PdevNavGroupId;
  label: string;
}

export interface PdevNavItem {
  id: string;
  label: string;
  /** Icon key — resolved against the icon set in icons.tsx. */
  icon: string;
  group: PdevNavGroupId;
  /** When true, the item renders disabled with a "Coming in later phase"
   *  hint. Avoids dropping it from the rail when designers expect it. */
  comingSoon?: boolean;
}

export const PDEV_NAV_GROUPS: readonly PdevNavGroup[] = [
  { id: 'workstream', label: 'Workstream' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'system', label: '' },
];

export const PDEV_NAV_ITEMS: readonly PdevNavItem[] = [
  { id: 'overview', label: 'Overview', icon: 'grid', group: 'workstream' },
  { id: 'cmc', label: 'CMC', icon: 'beaker', group: 'workstream' },
  { id: 'nonclinical', label: 'Nonclinical', icon: 'microscope', group: 'workstream' },
  { id: 'clinical', label: 'Clinical', icon: 'stethoscope', group: 'workstream' },
  { id: 'regulatory', label: 'Regulatory', icon: 'shieldCheck', group: 'workstream' },
  { id: 'ind_assembly', label: 'IND assembly', icon: 'rocket', group: 'workspace', comingSoon: true },
  { id: 'contradictions', label: 'Contradictions', icon: 'alertCircle', group: 'workspace', comingSoon: true },
  { id: 'fda_interactions', label: 'FDA interactions', icon: 'chat', group: 'workspace', comingSoon: true },
];

export type PdevNavId = (typeof PDEV_NAV_ITEMS)[number]['id'];

export function isWorkstreamNav(id: string): id is PdevWorkstreamNavId {
  return id === 'cmc' || id === 'nonclinical' || id === 'clinical' || id === 'regulatory';
}

export type PdevWorkstreamNavId = 'cmc' | 'nonclinical' | 'clinical' | 'regulatory';
