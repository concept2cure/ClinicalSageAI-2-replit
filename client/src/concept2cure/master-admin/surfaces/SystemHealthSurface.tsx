/** System Health — live process / DB-pool snapshot of the running service. */

import * as React from 'react';
import { useSystemHealth } from '../hooks/useMasterAdmin';
import { Kpi, SectionHeader, Loading, ErrorState, Badge } from '../components/ui';
import { fmtUptime, statusTone } from '../util';

export function SystemHealthSurface() {
  const { data, loading, error, refresh } = useSystemHealth();

  // Light auto-refresh while the surface is mounted.
  React.useEffect(() => {
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  if (loading && !data) return <Loading label="Probing system health…" />;
  if (error && !data) return <ErrorState error={error} onRetry={refresh} />;
  if (!data) return null;

  return (
    <div className="ma-stack">
      <SectionHeader title="System health" sub="Live snapshot of the running platform service.">
        <Badge tone={statusTone(data.status)}>{data.status}</Badge>
      </SectionHeader>

      <div className="ma-kpi-grid">
        <Kpi
          label="Database"
          value={data.database.ok ? 'Connected' : 'Down'}
          metaTone={data.database.ok ? 'ok' : 'err'}
          meta={data.database.ok ? 'responding to queries' : 'probe failed'}
        />
        <Kpi
          label="Pool — total"
          value={data.database.pool.total ?? '—'}
          meta={`${data.database.pool.idle ?? 0} idle · ${data.database.pool.waiting ?? 0} waiting`}
          metaTone={(data.database.pool.waiting ?? 0) > 0 ? 'warn' : 'muted'}
        />
        <Kpi label="Uptime" value={fmtUptime(data.process.uptimeSeconds)} meta="since last restart" />
        <Kpi label="Environment" value={data.process.env} meta={`Node ${data.process.nodeVersion}`} />
        <Kpi
          label="Memory — heap"
          value={data.process.memory.heapUsedMb}
          unit="MB"
          meta={`of ${data.process.memory.heapTotalMb} MB · RSS ${data.process.memory.rssMb} MB`}
        />
      </div>

      <div className="ma-foot-note">
        Auto-refreshes every 15s. Last probe {new Date(data.generatedAt).toLocaleTimeString()}.
      </div>
    </div>
  );
}
