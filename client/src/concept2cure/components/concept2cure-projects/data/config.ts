/**
 * Phase 3 Projects — Project Config Panel constants.
 *
 * Verbatim from design-system/ui_kits/home/Projects.jsx (PCP_*, lines
 * 897–922 + member/role/SSO seed data scattered through the panel
 * body). Per HANDOFF Open Questions item 4, the v2-canonical agency
 * vocabulary is the wizard's six-code list — see data/regions.ts. The
 * panel uses that same list, not the prototype's (FDA, EMA, PMDA,
 * Health Canada) which was a pre-audit drift.
 */
import type { ConfigPanelTab } from '../types';

export interface PcpTab {
  id: ConfigPanelTab;
  label: string;
  icon: string;
}

export const PCP_TABS: PcpTab[] = [
  { id: 'general',      label: 'General',      icon: 'settings' },
  { id: 'instructions', label: 'Instructions', icon: 'file' },
  { id: 'team',         label: 'Team',         icon: 'users' },
  { id: 'compliance',   label: 'Compliance',   icon: 'shieldCheck' },
];

export const PCP_SUBMISSION_TYPES: { v: string; l: string }[] = [
  { v: '510K',     l: '510(k)' },
  { v: 'IND',      l: 'IND' },
  { v: 'NDA',      l: 'NDA' },
  { v: 'BLA',      l: 'BLA' },
  { v: 'PMA',      l: 'PMA' },
  { v: 'MAA',      l: 'MAA' },
  { v: 'DE_NOVO',  l: 'De Novo' },
  { v: 'EUA',      l: 'EUA' },
  { v: 'IVDR',     l: 'IVDR' },
];

// Per HANDOFF Open Questions item 4 — unified on the wizard's six-code list.
export const PCP_AGENCIES = ['FDA', 'EMA', 'MHRA', 'HC', 'PMDA', 'Swissmedic'] as const;

export const PCP_STATUSES: { v: string; l: string }[] = [
  { v: 'draft',     l: 'Draft' },
  { v: 'active',    l: 'Active' },
  { v: 'in_review', l: 'In review' },
  { v: 'submitted', l: 'Submitted' },
  { v: 'archived',  l: 'Archived' },
];

export interface PcpRole {
  v: 'Owner' | 'Maintainer' | 'Editor' | 'Viewer';
  l: string;
  hint: string;
}

export const PCP_ROLES: PcpRole[] = [
  { v: 'Owner',      l: 'Owner',      hint: 'Full control, including deletion and ownership transfer' },
  { v: 'Maintainer', l: 'Maintainer', hint: 'Manage members, settings, and submissions' },
  { v: 'Editor',     l: 'Editor',     hint: 'Edit content, files, and chats; cannot manage members' },
  { v: 'Viewer',     l: 'Viewer',     hint: 'Read-only access to project content' },
];

export interface PcpMember {
  id: string;
  name: string;
  email: string;
  role: PcpRole['v'];
  last: string;
}

export const PCP_MEMBERS: Record<string, PcpMember[]> = {
  'mdx-510k': [
    { id: 'm1', name: 'JM Smith', email: 'jm.smith@bionova.com', role: 'Owner',      last: 'today' },
    { id: 'm2', name: 'A Park',   email: 'a.park@bionova.com',   role: 'Editor',     last: '2 hours ago' },
    { id: 'm3', name: 'D Reyes',  email: 'd.reyes@bionova.com',  role: 'Maintainer', last: 'yesterday' },
  ],
  'c2c-ana': [
    { id: 'm1', name: 'JM Smith', email: 'jm.smith@concept2cure.pro', role: 'Owner', last: 'today' },
  ],
  'biopharma-nda': [
    { id: 'm1', name: 'JM Smith',  email: 'jm.smith@concept2cure.pro', role: 'Owner',  last: 'today' },
    { id: 'm2', name: 'L Tanaka',  email: 'l.tanaka@concept2cure.pro', role: 'Editor', last: '4 hours ago' },
  ],
  'eu-mdr-iv415': [
    { id: 'm1', name: 'JM Smith',  email: 'jm.smith@concept2cure.pro', role: 'Owner',  last: 'today' },
    { id: 'm2', name: 'F Müller',  email: 'f.muller@concept2cure.eu',  role: 'Editor', last: '6 hours ago' },
  ],
};

export interface PcpSsoGroup {
  id: string;
  name: string;
  count: number;
  mapped?: PcpRole['v'] | '';
}

export const PCP_SSO_GROUPS: PcpSsoGroup[] = [
  { id: 'g1', name: 'sso:regulatory-leads', count: 12, mapped: 'Maintainer' },
  { id: 'g2', name: 'sso:medical-writers',  count: 28, mapped: 'Editor' },
  { id: 'g3', name: 'sso:read-only',        count: 47, mapped: 'Viewer' },
];
