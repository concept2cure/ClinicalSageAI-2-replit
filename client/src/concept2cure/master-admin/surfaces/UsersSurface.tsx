/**
 * Users surface — every platform user with their org memberships, MFA state,
 * last login, and a governed suspend/reactivate action for support.
 */

import * as React from 'react';
import { useUsers, useUserStatusMutation } from '../hooks/useMasterAdmin';
import { Badge, SectionHeader, Loading, ErrorState, Empty } from '../components/ui';
import { GovernedActionDialog } from '../components/GovernedActionDialog';
import { fmtRelative, statusTone } from '../util';
import type { PlatformUser, StatusValue } from '../types';

const STATUS_FILTERS = ['all', 'active', 'suspended', 'inactive'] as const;

export function UsersSurface() {
  const [q, setQ] = React.useState('');
  const [debouncedQ, setDebouncedQ] = React.useState('');
  const [status, setStatus] = React.useState<(typeof STATUS_FILTERS)[number]>('all');
  const [target, setTarget] = React.useState<{ user: PlatformUser; next: StatusValue } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [mutErr, setMutErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const { data, loading, error, refresh } = useUsers({
    q: debouncedQ || undefined,
    status: status === 'all' ? undefined : status,
  });
  const mutate = useUserStatusMutation();
  const users = data?.users ?? [];

  const runMutation = async (reason: string) => {
    if (!target) return;
    setBusy(true);
    setMutErr(null);
    const result = await mutate(target.user.id, target.next, reason);
    setBusy(false);
    if (result.ok) {
      setTarget(null);
      refresh();
    } else {
      setMutErr(result.error || 'Action failed.');
    }
  };

  return (
    <div className="ma-stack">
      <SectionHeader title="Users" sub="Every user across all clients." />

      <div className="ma-toolbar">
        <div className="ma-search">
          <input
            className="ma-input"
            placeholder="Search by name or email…"
            value={q}
            onChange={e => setQ(e.target.value)}
            aria-label="Search users"
          />
        </div>
        <div className="ma-chipset">
          {STATUS_FILTERS.map(s => (
            <button key={s} className="ma-chip" data-on={status === s} onClick={() => setStatus(s)}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading && !data ? (
        <Loading label="Loading users…" />
      ) : error && !data ? (
        <ErrorState error={error} onRetry={refresh} />
      ) : users.length === 0 ? (
        <Empty label="No users match your filters." />
      ) : (
        <div className="ma-table-wrap">
          <table className="ma-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Memberships</th>
                <th>MFA</th>
                <th>Status</th>
                <th>Last login</th>
                <th className="ma-num">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const next: StatusValue = u.status === 'active' ? 'suspended' : 'active';
                return (
                  <tr key={u.id}>
                    <td>
                      <div className="ma-cell-primary">{u.name}</div>
                      <div className="ma-cell-sub">{u.email}{u.title ? ` · ${u.title}` : ''}</div>
                    </td>
                    <td>
                      <div className="ma-tag-list">
                        {u.memberships.length === 0 && <span className="ma-muted">none</span>}
                        {u.memberships.slice(0, 3).map(m => (
                          <Badge key={m.orgId} tone="muted" >{m.orgName} · {m.role}</Badge>
                        ))}
                        {u.memberships.length > 3 && (
                          <span className="ma-muted">+{u.memberships.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td>{u.mfa_enabled ? <Badge tone="ok">on</Badge> : <Badge tone="warn">off</Badge>}</td>
                    <td><Badge tone={statusTone(u.status)}>{u.status}</Badge></td>
                    <td>{fmtRelative(u.last_login)}</td>
                    <td className="ma-num">
                      <button
                        className={`ma-btn ma-btn-sm ${next === 'suspended' ? 'ma-btn-danger' : 'ma-btn-primary'}`}
                        onClick={() => { setMutErr(null); setTarget({ user: u, next }); }}
                      >
                        {next === 'suspended' ? 'Suspend' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <GovernedActionDialog
        open={target != null}
        title={target?.next === 'suspended' ? 'Suspend user' : 'Reactivate user'}
        description={
          target?.next === 'suspended'
            ? `Suspending "${target?.user.email}" blocks their access platform-wide. Recorded to the audit trail.`
            : `Reactivating "${target?.user.email}" restores their access. Recorded to the audit trail.`
        }
        confirmLabel={target?.next === 'suspended' ? 'Suspend user' : 'Reactivate user'}
        destructive={target?.next === 'suspended'}
        busy={busy}
        error={mutErr}
        onConfirm={runMutation}
        onCancel={() => setTarget(null)}
      />
    </div>
  );
}
