/**
 * Phase 3 Projects — list-view filter constants + saved views.
 *
 * Verbatim from design-system/ui_kits/home/ProjectsExtras.jsx
 * (PLF_*, lines 410–421).
 */
import type { SavedView } from '../types';

export const PLF_TYPES    = ['510(k)', 'IND', 'NDA', 'BLA', 'PMA', 'EU MDR CER', 'IVDR'] as const;
export const PLF_STATUSES = ['Active', 'In review', 'Submitted', 'Draft', 'Archived'] as const;
export const PLF_AGENCIES = ['FDA', 'EMA', 'PMDA', 'MHRA', 'Health Canada'] as const;
export const PLF_OWNERS   = ['JM Smith', 'A Park', 'L Tanaka', 'F Müller', 'D Reyes'] as const;
export const PLF_ACTIVITY = ['Today', 'This week', 'This month', 'This quarter'] as const;

export const PLF_SAVED_VIEWS: SavedView[] = [
  { id: 'mine-active',    label: 'My active 510(k)s',       filters: { type: ['510(k)'], status: ['Active', 'In review'], owner: ['JM Smith'] } },
  { id: 'pending-agency', label: 'Pending agency response', filters: { status: ['Submitted'] } },
  { id: 'eu-mdr-q3',      label: 'EU MDR — this quarter',   filters: { agency: ['EMA'], activity: ['This quarter'] } },
  { id: 'archived',       label: 'Archived',                filters: { status: ['Archived'] } },
];
