/**
 * Operations — platform-ops view for the owner: live service health, external
 * connector validity across clients, and recent deep-research job throughput.
 */

import * as React from 'react';
import { useSystemHealth, useConnectors, useJobs } from '../hooks/useMasterAdmin';
import { Badge, Kpi, SectionHeader, Loading, ErrorState, Empty } from '../components/ui';
import { fmtRelative, fmtUptime, statusTone } from '../util';

export function OperationsSurface() {
  const health = useSystemHealth();
  const connectors = useConnectors();
  const jobs = useJobs();

  // Light auto-refresh of the live health probe.
  React.useEffect(() => {
    const t = setInterval(health.refresh, 15000);
    return () => clearInterval(t);
  }, [health.refresh]);

  return (
    <div className="ma-stack">
      <SectionHeader title="Operations" sub="Service health, integrations, and platform job throughput.">
        {health.data && <Badge tone={statusTone(health.data.status)}>{health.data.status}</Badge>}
      </SectionHeader>

      {/* System health */}
      {health.loading && !health.data ? (
        <Loading label="Probing system health…" />
      ) : health.error && !health.data ? (
        <ErrorState error={health.error} onRetry={health.refresh} />
      ) : health.data ? (
        <div className="ma-kpi-grid">
          <Kpi
            label="Database"
            value={health.data.database.ok ? 'Connected' : 'Down'}
            metaTone={health.data.database.ok ? 'ok' : 'err'}
            meta={health.data.database.ok ? 'responding' : 'probe failed'}
          />
          <Kpi
            label="Pool — total"
            value={health.data.database.pool.total ?? '—'}
            meta={`${health.data.database.pool.idle ?? 0} idle · ${health.data.database.pool.waiting ?? 0} waiting`}
            metaTone={(health.data.database.pool.waiting ?? 0) > 0 ? 'warn' : 'muted'}
          />
          <Kpi label="Uptime" value={fmtUptime(health.data.process.uptimeSeconds)} meta="since restart" />
          <Kpi label="Environment" value={health.data.process.env} meta={`Node ${health.data.process.nodeVersion}`} />
          <Kpi
            label="Memory — heap"
            value={health.data.process.memory.heapUsedMb}
            unit="MB"
            meta={`of ${health.data.process.memory.heapTotalMb} MB · RSS ${health.data.process.memory.rssMb} MB`}
          />
        </div>
      ) : null}

      {/* Connector health */}
      <div className="ma-card">
        <SectionHeader title="Integration connectors" sub="Per-client connector validity (credentials never shown)." />
        {connectors.loading && !connectors.data ? (
          <Loading label="Loading connectors…" />
        ) : connectors.error && !connectors.data ? (
          <ErrorState error={connectors.error} onRetry={connectors.refresh} />
        ) : (connectors.data?.connectors.length ?? 0) === 0 ? (
          <Empty label="No connectors configured." />
        ) : (
          <table className="ma-table ma-table-compact">
            <thead><tr><th>Client</th><th>Connector</th><th>Valid</th><th>Last validated</th></tr></thead>
            <tbody>
              {connectors.data!.connectors.map(c => (
                <tr key={c.id}>
                  <td>{c.organization_name ?? `org ${c.organization_id}`}</td>
                  <td>{c.connector_id}</td>
                  <td><Badge tone={c.is_valid ? 'ok' : 'err'}>{c.is_valid ? 'valid' : 'invalid'}</Badge></td>
                  <td>{fmtRelative(c.last_validated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Deep-research jobs */}
      <div className="ma-card">
        <SectionHeader title="Deep-research jobs" sub="Recent throughput across all clients." />
        {jobs.data && jobs.data.summary7d.length > 0 && (
          <div className="ma-tag-list">
            {jobs.data.summary7d.map(s => (
              <Badge key={s.status} tone={statusTone(s.status)}>{s.status}: {s.count}</Badge>
            ))}
          </div>
        )}
        {jobs.loading && !jobs.data ? (
          <Loading label="Loading jobs…" />
        ) : jobs.error && !jobs.data ? (
          <ErrorState error={jobs.error} onRetry={jobs.refresh} />
        ) : (jobs.data?.jobs.length ?? 0) === 0 ? (
          <Empty label="No recent jobs." />
        ) : (
          <table className="ma-table ma-table-compact">
            <thead><tr><th>Client</th><th>Status</th><th className="ma-num">Progress</th><th className="ma-num">Credits</th><th>Created</th></tr></thead>
            <tbody>
              {jobs.data!.jobs.map(j => (
                <tr key={j.id}>
                  <td>{j.organization_name ?? (j.organization_id ? `org ${j.organization_id}` : '—')}</td>
                  <td><Badge tone={statusTone(j.status)}>{j.status}</Badge></td>
                  <td className="ma-num">{j.progress ?? 0}%</td>
                  <td className="ma-num">{j.credits_used ?? 0}</td>
                  <td>{fmtRelative(j.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
