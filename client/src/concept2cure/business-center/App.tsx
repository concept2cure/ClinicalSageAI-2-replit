/**
 * Business Center root — the owner / finance executive console.
 *
 * Non-client-facing. Composes a scoped shell (Rail + TopBar) around one of the
 * finance / governance surfaces. Access is gated client-side by platform role;
 * the server independently enforces the stricter boundary on every endpoint
 * (server/middleware/requireBusinessAdmin), so this gate is UX, not security.
 */

import * as React from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/services/portal/authService';
import { Rail } from './shell/Rail';
import { TopBar } from './shell/TopBar';
import { ExecutiveSummary } from './surfaces/ExecutiveSummary';
import { CostAccounting } from './surfaces/CostAccounting';
import { RateCards } from './surfaces/RateCards';
import { MeteringCoverage } from './surfaces/MeteringCoverage';
import { Access } from './surfaces/Access';
import { BIZC_LABELS } from './data/nav';

/** Roles that may open the Business Center. */
const BUSINESS_ROLES = ['owner', 'business_admin', 'super_admin'];

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
    getStored('bizc.activeNav', 'summary')
  );
  const [collapsed, setCollapsed] = React.useState<boolean>(() =>
    getStored('bizc.collapsed', false)
  );
  // Bumping this key re-mounts the active surface → triggers a fresh fetch.
  const [refreshKey, setRefreshKey] = React.useState(0);

  React.useEffect(() => persist('bizc.activeNav', activeNav), [activeNav]);
  React.useEffect(() => persist('bizc.collapsed', collapsed), [collapsed]);

  const isBusinessAdmin = BUSINESS_ROLES.some(r => hasRole(r));

  if (!isBusinessAdmin) {
    return (
      <div className="bizc">
        <div className="bizc-denied">
          <div className="bizc-denied-card">
            <div className="bizc-denied-title">Business Center</div>
            <p className="bizc-denied-body">
              The Business Center is restricted to the platform owner and designated finance
              personnel. Your account does not have a business administration role.
            </p>
            <p className="bizc-denied-hint">
              If you need access, ask the platform owner to grant the <code>owner</code>,{' '}
              <code>business_admin</code>, or <code>super_admin</code> role.
            </p>
            <button
              className="bizc-btn bizc-btn-primary"
              onClick={() => setLocation('/concept2cure')}
            >
              Back to platform
            </button>
          </div>
        </div>
      </div>
    );
  }

  const hereLabel = BIZC_LABELS[activeNav] || 'Executive Summary';

  let surface: React.ReactNode;
  switch (activeNav) {
    case 'cost-accounting':
      surface = <CostAccounting />;
      break;
    case 'rate-cards':
      surface = <RateCards />;
      break;
    case 'metering':
      surface = <MeteringCoverage />;
      break;
    case 'access':
      surface = <Access />;
      break;
    default:
      surface = <ExecutiveSummary onJump={setActiveNav} />;
  }

  return (
    <div className="bizc">
      <div className="bizc-shell" data-collapsed={collapsed}>
        <Rail
          activeNav={activeNav}
          setActiveNav={setActiveNav}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          onExit={() => setLocation('/concept2cure')}
          user={{
            name: user?.displayName || user?.email || 'Owner',
            initials: initials(user?.displayName, user?.email),
            role: 'Owner · Finance',
          }}
        />
        <main className="bizc-main">
          <TopBar hereLabel={hereLabel} onRefresh={() => setRefreshKey(k => k + 1)} />
          <div className="bizc-page">
            <div className="bizc-page-inner" key={`${activeNav}:${refreshKey}`}>
              {surface}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
