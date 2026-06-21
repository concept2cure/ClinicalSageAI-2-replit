/**
 * Master Administration nav data. Icon keys resolve against the shared MDX
 * icon registry (../mdx/icons) so we reuse one Lucide-derived set.
 */

import type { IconKey } from '../../mdx/icons';

export interface NavItem {
  id: string;
  label: string;
  icon: IconKey;
  group: 'monitor' | 'support' | 'platform';
}

export interface NavGroup {
  id: NavItem['group'];
  label: string;
}

export const MA_NAV_GROUPS: NavGroup[] = [
  { id: 'monitor', label: 'Monitoring' },
  { id: 'support', label: 'Support' },
  { id: 'platform', label: 'Platform' },
];

export const MA_NAV: NavItem[] = [
  // Monitoring — at-a-glance health of the estate.
  { id: 'overview', label: 'Overview', icon: 'grid', group: 'monitor' },
  { id: 'tenants', label: 'Clients', icon: 'database', group: 'monitor' },
  { id: 'users', label: 'Users', icon: 'users', group: 'monitor' },

  // Support — entitlements + cross-tenant audit for the support team.
  { id: 'entitlements', label: 'Entitlements', icon: 'shieldCheck', group: 'support' },
  { id: 'audit', label: 'Audit Trail', icon: 'scroll', group: 'support' },

  // Platform — operational health of the running service.
  { id: 'health', label: 'System Health', icon: 'zap', group: 'platform' },
];

export const MA_LABELS: Record<string, string> = {
  overview: 'Overview',
  tenants: 'Clients',
  users: 'Users',
  entitlements: 'Entitlements',
  audit: 'Audit Trail',
  health: 'System Health',
};
