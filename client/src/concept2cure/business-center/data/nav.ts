/**
 * Business Center nav data. Icon keys resolve against the shared MDX icon
 * registry (../../mdx/icons) so we reuse one Lucide-derived set.
 */

import type { IconKey } from '../../mdx/icons';

export interface NavItem {
  id: string;
  label: string;
  icon: IconKey;
  group: 'finance' | 'governance';
}

export interface NavGroup {
  id: NavItem['group'];
  label: string;
}

export const BIZC_NAV_GROUPS: NavGroup[] = [
  { id: 'finance', label: 'Finance' },
  { id: 'governance', label: 'Governance' },
];

export const BIZC_NAV: NavItem[] = [
  // Finance — portfolio economics and the editable rate cards.
  { id: 'summary', label: 'Executive Summary', icon: 'trendingUp', group: 'finance' },
  { id: 'cost-accounting', label: 'Cost Accounting', icon: 'barChart3', group: 'finance' },
  { id: 'rate-cards', label: 'Rate Cards', icon: 'sliders', group: 'finance' },

  // Governance — metering accuracy and access roster.
  { id: 'metering', label: 'Metering Coverage', icon: 'shieldCheck', group: 'governance' },
  { id: 'access', label: 'Access', icon: 'userCheck', group: 'governance' },
];

export const BIZC_LABELS: Record<string, string> = {
  summary: 'Executive Summary',
  'cost-accounting': 'Cost Accounting',
  'rate-cards': 'Rate Cards',
  metering: 'Metering Coverage',
  access: 'Access',
};
