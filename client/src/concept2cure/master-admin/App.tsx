/**
 * Master Administration root — the platform-owner + support console.
 *
 * Non-client-facing. Composes a scoped shell (Rail + TopBar) around one of the
 * monitoring/support surfaces. Access is gated client-side by platform role;
 * the server independently enforces the same boundary on every endpoint
 * (server/middleware/requirePlatformAdmin), so this gate is UX, not security.
 */

import * as React from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/services/portal/authService';
import { Rail } from './shell/Rail';
import { TopBar } from './shell/TopBar';
import { Overview } from './surfaces/Overview';
import { TenantsSurface } from './surfaces/TenantsSurface';
import { UsersSurface } from './surfaces/UsersSurface';
import { BillingSurface } from './surfaces/BillingSurface';
import { EntitlementsSurface } from './surfaces/EntitlementsSurface';
import { FeatureFlagsSurface } from './surfaces/FeatureFlagsSurface';
import { OperationsSurface } from './surfaces/OperationsSurface';
import { AuditSurface } from './surfaces/AuditSurface';
import { MA_LABELS } from './data/nav';

/** Roles that may open the Master Administration console. */
const PLATFORM_ROLES = ['super_admin', 'platform_admin', 'support'];

function getStored<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  const v = localStorage.getItem(key);
  if (v == null) return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

function persist(key: string, value: unknown) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota; ignore */
  }
}

function initials(name?: string | null, email?: string | null): string {
  const src = (name || email || 'NA').trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export function App() {
  const { user, hasRole } = useAuth();
  const [, setLocation] = useLocation();

  const [activeNav, setActiveNav] = React.useState<string>(() =>
    getStored('madmin.activeNav', 'overview')
  );
  const [collapsed, setCollapsed] = React.useState<boolean>(() =>
    getStored('madmin.collapsed', false)
  );
  // Bumping this key re-mounts the active surface → triggers a fresh fetch.
  const [refreshKey, setRefreshKey] = React.useState(0);

  React.useEffect(() => persist('madmin.activeNav', activeNav), [activeNav]);
  React.useEffect(() => persist('madmin.collapsed', collapsed), [collapsed]);

  const isPlatformAdmin = PLATFORM_ROLES.some(r => hasRole(r));

  if (!isPlatformAdmin) {
    return (
      <div className="madmin">
        <div className="ma-denied">
          <div className="ma-denied-card">
            <div className="ma-denied-title">Master Administration</div>
            <p className="ma-denied-body">
              This console is restricted to the platform owner and support team. Your account does
              not have a platform administration role.
            </p>
            <p className="ma-denied-hint">
              If you need access, ask a platform administrator to grant the{' '}
              <code>super_admin</code>, <code>platform_admin</code>, or <code>support</code> role.
            </p>
            <button className="ma-btn ma-btn-primary" onClick={() => setLocation('/concept2cure')}>
              Back to platform
            </button>
          </div>
        </div>
      </div>
    );
  }

  const hereLabel = MA_LABELS[activeNav] || 'Overview';

  let surface: React.ReactNode;
  switch (activeNav) {
    case 'tenants':
      surface = <TenantsSurface />;
      break;
    case 'users':
      surface = <UsersSurface />;
      break;
    case 'billing':
      surface = <BillingSurface />;
      break;
    case 'entitlements':
      surface = <EntitlementsSurface />;
      break;
    case 'flags':
      surface = <FeatureFlagsSurface />;
      break;
    case 'audit':
      surface = <AuditSurface />;
      break;
    case 'operations':
      surface = <OperationsSurface />;
      break;
    default:
      surface = <Overview onJump={setActiveNav} />;
  }

  return (
    <div className="madmin">
      <div className="ma-shell" data-collapsed={collapsed}>
        <Rail
          activeNav={activeNav}
          setActiveNav={setActiveNav}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          onExit={() => setLocation('/concept2cure')}
          user={{
            name: user?.displayName || user?.email || 'Platform admin',
            initials: initials(user?.displayName, user?.email),
            role: 'Platform · Support',
          }}
        />
        <main className="ma-main">
          <TopBar hereLabel={hereLabel} onRefresh={() => setRefreshKey(k => k + 1)} />
          <div className="ma-page">
            <div className="ma-page-inner" key={`${activeNav}:${refreshKey}`}>
              {surface}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
