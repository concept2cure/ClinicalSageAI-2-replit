/**
 * Audit Trail — platform-wide, paginated explorer over the tamper-evident
 * audit_logs table. Filter by action; page through with cursor offsets.
 */

import * as React from 'react';
import { useAudit } from '../hooks/useMasterAdmin';
import { Badge, SectionHeader, Loading, ErrorState, Empty } from '../components/ui';
import { fmtRelative } from '../util';

const PAGE = 50;

export function AuditSurface() {
  const [action, setAction] = React.useState('');
  const [debouncedAction, setDebouncedAction] = React.useState('');
  const [offset, setOffset] = React.useState(0);

  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedAction(action);
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [action]);

  const { data, loading, error, refresh } = useAudit({
    action: debouncedAction || undefined,
    limit: PAGE,
    offset,
  });

  const events = data?.events ?? [];
  const total = data?.total ?? 0;
  const page = Math.floor(offset / PAGE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="ma-stack">
      <SectionHeader
        title="Audit trail"
        sub="Platform-wide, tamper-evident record of governed actions."
      />

      <div className="ma-toolbar">
        <div className="ma-search">
          <input
            className="ma-input"
            placeholder="Filter by action (e.g. data_modify)…"
            value={action}
            onChange={e => setAction(e.target.value)}
            aria-label="Filter audit events by action"
          />
        </div>
        <div className="ma-muted">{total.toLocaleString()} events</div>
      </div>

      {loading && !data ? (
        <Loading label="Loading audit events…" />
      ) : error && !data ? (
        <ErrorState error={error} onRetry={refresh} />
      ) : events.length === 0 ? (
        <Empty label="No audit events match your filter." />
      ) : (
        <>
          <div className="ma-table-wrap">
            <table className="ma-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Actor</th>
                  <th>Client</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {events.map(e => (
                  <tr key={e.id}>
                    <td title={new Date(e.created_at).toLocaleString()}>{fmtRelative(e.created_at)}</td>
                    <td><Badge tone="muted">{e.action}</Badge></td>
                    <td>
                      <div className="ma-cell-primary">{e.table_name}</div>
                      <div className="ma-cell-sub">#{e.record_id}</div>
                    </td>
                    <td>{e.actor_email ?? (e.user_id != null ? `user ${e.user_id}` : 'system')}</td>
                    <td>{e.tenant_name ?? (e.tenant_id ? `tenant ${e.tenant_id}` : '—')}</td>
                    <td className="ma-cell-sub">{e.ip_address ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="ma-pager">
            <button
              className="ma-btn"
              disabled={offset === 0 || loading}
              onClick={() => setOffset(Math.max(0, offset - PAGE))}
            >
              ← Previous
            </button>
            <span className="ma-muted">Page {page} of {pages}</span>
            <button
              className="ma-btn"
              disabled={offset + PAGE >= total || loading}
              onClick={() => setOffset(offset + PAGE)}
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
