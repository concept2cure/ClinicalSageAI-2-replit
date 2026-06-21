/** Overview — platform KPIs across every tenant, plus a tier breakdown. */

import * as React from 'react';
import { useOverview } from '../hooks/useMasterAdmin';
import { Kpi, SectionHeader, Loading, ErrorState, Badge } from '../components/ui';
import { fmtNumber } from '../util';

export function Overview({ onJump }: { onJump?: (nav: string) => void }) {
  const { data, loading, error, refresh } = useOverview();

  if (loading && !data) return <Loading label="Loading platform overview…" />;
  if (error && !data) return <ErrorState error={error} onRetry={refresh} />;
  if (!data) return null;

  return (
    <div className="ma-stack">
      <SectionHeader
        title="Platform overview"
        sub="Estate-wide health for the platform owner and support team."
      />

      <div className="ma-kpi-grid">
        <Kpi
          label="Total clients"
          value={fmtNumber(data.tenants.total)}
          meta={`${data.tenants.active} active · ${data.tenants.suspended} suspended`}
        />
        <Kpi
          label="New clients (30d)"
          value={fmtNumber(data.tenants.new_30d)}
          meta="organizations created"
          metaTone="ok"
        />
        <Kpi
          label="Total users"
          value={fmtNumber(data.users.total)}
          meta={`${data.users.active_30d} active in last 30d`}
        />
        <Kpi
          label="New users (30d)"
          value={fmtNumber(data.users.new_30d)}
          meta={`${data.users.suspended} suspended`}
          metaTone={data.users.suspended > 0 ? 'warn' : 'muted'}
        />
        <Kpi
          label="Usage credits (30d)"
          value={fmtNumber(data.usage.credits_30d)}
          meta={`${fmtNumber(data.usage.events_30d)} metered events`}
        />
        <Kpi
          label="Enabled modules"
          value={fmtNumber(data.modules.enabled)}
          meta="active subscriptions"
        />
        <Kpi
          label="Audit events (24h)"
          value={fmtNumber(data.audit.last_24h)}
          meta={`${fmtNumber(data.audit.last_7d)} in last 7d`}
        />
      </div>

      <div className="ma-card">
        <SectionHeader title="Clients by tier">
          {onJump && (
            <button className="ma-link" onClick={() => onJump('tenants')}>
              View all clients →
            </button>
          )}
        </SectionHeader>
        <div className="ma-tier-row">
          {data.tiers.length === 0 && <span className="ma-muted">No clients yet.</span>}
          {data.tiers.map(t => (
            <div className="ma-tier" key={t.tier}>
              <Badge tone="accent">{t.tier}</Badge>
              <span className="ma-tier-count">{fmtNumber(t.count)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="ma-foot-note">
        Snapshot generated {new Date(data.generatedAt).toLocaleString()}.
      </div>
    </div>
  );
}
