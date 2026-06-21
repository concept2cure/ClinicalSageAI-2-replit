/**
 * Clients surface — every organization (tenant) on the platform with search,
 * status filter, a detail drawer (members, modules, usage, recent audit), and
 * a governed suspend/reactivate action.
 */

import * as React from 'react';
import {
  useTenants,
  useTenantDetail,
  useTenantStatusMutation,
  useEntitlements,
  useModuleToggleMutation,
} from '../hooks/useMasterAdmin';
import { Badge, SectionHeader, Loading, ErrorState, Empty } from '../components/ui';
import { GovernedActionDialog } from '../components/GovernedActionDialog';
import { fmtDate, fmtRelative, fmtNumber, statusTone } from '../util';
import type { StatusValue, TenantRow } from '../types';

const STATUS_FILTERS = ['all', 'active', 'suspended', 'inactive'] as const;

export function TenantsSurface() {
  const [q, setQ] = React.useState('');
  const [debouncedQ, setDebouncedQ] = React.useState('');
  const [status, setStatus] = React.useState<(typeof STATUS_FILTERS)[number]>('all');
  const [openId, setOpenId] = React.useState<number | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const { data, loading, error, refresh } = useTenants({
    q: debouncedQ || undefined,
    status: status === 'all' ? undefined : status,
  });

  const tenants = data?.tenants ?? [];

  return (
    <div className="ma-stack">
      <SectionHeader title="Clients" sub="Every organization on the platform." />

      <div className="ma-toolbar">
        <div className="ma-search">
          <input
            className="ma-input"
            placeholder="Search by name or slug…"
            value={q}
            onChange={e => setQ(e.target.value)}
            aria-label="Search clients"
          />
        </div>
        <div className="ma-chipset">
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              className="ma-chip"
              data-on={status === s}
              onClick={() => setStatus(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading && !data ? (
        <Loading label="Loading clients…" />
      ) : error && !data ? (
        <ErrorState error={error} onRetry={refresh} />
      ) : tenants.length === 0 ? (
        <Empty label="No clients match your filters." />
      ) : (
        <div className="ma-table-wrap">
          <table className="ma-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Tier</th>
                <th>Status</th>
                <th className="ma-num">Members</th>
                <th className="ma-num">Modules</th>
                <th className="ma-num">Credits 30d</th>
                <th>Last active</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map(t => (
                <tr key={t.id} className="ma-row" onClick={() => setOpenId(t.id)} tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter') setOpenId(t.id); }}>
                  <td>
                    <div className="ma-cell-primary">{t.name}</div>
                    <div className="ma-cell-sub">{t.slug} · {t.client_type}</div>
                  </td>
                  <td><Badge tone="accent">{t.tier}</Badge></td>
                  <td><Badge tone={statusTone(t.status)}>{t.status}</Badge></td>
                  <td className="ma-num">{t.member_count}{t.max_users ? ` / ${t.max_users}` : ''}</td>
                  <td className="ma-num">{t.enabled_modules}</td>
                  <td className="ma-num">{fmtNumber(t.credits_30d)}</td>
                  <td>{fmtRelative(t.last_active)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openId != null && (
        <TenantDrawer
          id={openId}
          rowHint={tenants.find(t => t.id === openId) ?? null}
          onClose={() => setOpenId(null)}
          onChanged={() => {
            refresh();
          }}
        />
      )}
    </div>
  );
}

function TenantDrawer({
  id,
  rowHint,
  onClose,
  onChanged,
}: {
  id: number;
  rowHint: TenantRow | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { data, loading, error, refresh } = useTenantDetail(id);
  const catalog = useEntitlements();
  const mutate = useTenantStatusMutation();
  const toggleModule = useModuleToggleMutation();
  const [dialog, setDialog] = React.useState<StatusValue | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [mutErr, setMutErr] = React.useState<string | null>(null);
  const [moduleDialog, setModuleDialog] = React.useState<{ moduleId: string; name: string; next: boolean } | null>(null);
  const [modBusy, setModBusy] = React.useState(false);
  const [modErr, setModErr] = React.useState<string | null>(null);

  const enabledMap = React.useMemo(
    () => new Map((data?.modules ?? []).map(m => [m.module_id, m.enabled])),
    [data?.modules]
  );

  const runModuleMutation = async (reason: string) => {
    if (!moduleDialog) return;
    setModBusy(true);
    setModErr(null);
    const r = await toggleModule(id, moduleDialog.moduleId, moduleDialog.next, reason);
    setModBusy(false);
    if (r.ok) {
      setModuleDialog(null);
      refresh();
      onChanged();
    } else {
      setModErr(r.error || 'Action failed.');
    }
  };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !dialog) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, dialog]);

  const tenant = data?.tenant;
  const currentStatus = tenant?.status ?? rowHint?.status ?? 'active';
  const targetStatus: StatusValue = currentStatus === 'active' ? 'suspended' : 'active';

  const runMutation = async (reason: string) => {
    if (!dialog) return;
    setBusy(true);
    setMutErr(null);
    const result = await mutate(id, dialog, reason);
    setBusy(false);
    if (result.ok) {
      setDialog(null);
      refresh();
      onChanged();
    } else {
      setMutErr(result.error || 'Action failed.');
    }
  };

  return (
    <div className="ma-drawer-scrim" onClick={onClose}>
      <aside className="ma-drawer" onClick={e => e.stopPropagation()} aria-label="Client detail">
        <div className="ma-drawer-head">
          <div>
            <div className="ma-drawer-title">{tenant?.name ?? rowHint?.name ?? `Client #${id}`}</div>
            <div className="ma-cell-sub">{tenant?.slug ?? rowHint?.slug}</div>
          </div>
          <button className="ma-tb-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {loading && !data ? (
          <Loading label="Loading client…" />
        ) : error && !data ? (
          <ErrorState error={error} onRetry={refresh} />
        ) : tenant ? (
          <div className="ma-drawer-body">
            <div className="ma-kv-grid">
              <KV k="Status"><Badge tone={statusTone(tenant.status)}>{tenant.status}</Badge></KV>
              <KV k="Tier"><Badge tone="accent">{tenant.tier}</Badge></KV>
              <KV k="Type">{tenant.client_type}</KV>
              <KV k="Payment">{tenant.payment_status ?? '—'}</KV>
              <KV k="Seats">{tenant.seats_purchased ?? '—'}</KV>
              <KV k="Max users">{tenant.max_users ?? '—'}</KV>
              <KV k="Created">{fmtDate(tenant.created_at)}</KV>
              <KV k="Domain">{tenant.domain ?? '—'}</KV>
            </div>

            <div className="ma-drawer-actions">
              <button
                className={`ma-btn ${targetStatus === 'suspended' ? 'ma-btn-danger' : 'ma-btn-primary'}`}
                onClick={() => { setMutErr(null); setDialog(targetStatus); }}
              >
                {targetStatus === 'suspended' ? 'Suspend client' : 'Reactivate client'}
              </button>
            </div>

            <Subsection title={`Members (${data!.members.length})`}>
              {data!.members.length === 0 ? (
                <Empty label="No members." />
              ) : (
                <table className="ma-table ma-table-compact">
                  <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Last login</th></tr></thead>
                  <tbody>
                    {data!.members.map(m => (
                      <tr key={m.id}>
                        <td>
                          <div className="ma-cell-primary">{m.name}</div>
                          <div className="ma-cell-sub">{m.email}</div>
                        </td>
                        <td><Badge tone="muted">{m.role}</Badge></td>
                        <td><Badge tone={statusTone(m.status)}>{m.status}</Badge></td>
                        <td>{fmtRelative(m.last_login)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Subsection>

            <Subsection title="Modules and entitlements">
              {(catalog.data?.modules.length ?? 0) === 0 ? (
                <Empty label="No modules in the catalog." />
              ) : (
                <table className="ma-table ma-table-compact">
                  <thead><tr><th>Module</th><th>State</th><th className="ma-num">Action</th></tr></thead>
                  <tbody>
                    {catalog.data!.modules.map(m => {
                      const enabled = enabledMap.get(m.module_id) ?? false;
                      return (
                        <tr key={m.module_id}>
                          <td>
                            <div className="ma-cell-primary">{m.name ?? m.module_id}</div>
                            {m.category && <div className="ma-cell-sub">{m.category}</div>}
                          </td>
                          <td><Badge tone={enabled ? 'ok' : 'muted'}>{enabled ? 'enabled' : 'disabled'}</Badge></td>
                          <td className="ma-num">
                            <button
                              className={`ma-btn ma-btn-sm ${enabled ? 'ma-btn-danger' : 'ma-btn-primary'}`}
                              onClick={() => {
                                setModErr(null);
                                setModuleDialog({ moduleId: m.module_id, name: m.name ?? m.module_id, next: !enabled });
                              }}
                            >
                              {enabled ? 'Disable' : 'Enable'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Subsection>

            <Subsection title="Usage by feature (30d)">
              {data!.usage.length === 0 ? (
                <Empty label="No metered usage in the last 30 days." />
              ) : (
                <table className="ma-table ma-table-compact">
                  <thead><tr><th>Feature</th><th className="ma-num">Credits</th><th className="ma-num">Events</th></tr></thead>
                  <tbody>
                    {data!.usage.map(u => (
                      <tr key={u.feature_id}>
                        <td>{u.feature_id}</td>
                        <td className="ma-num">{fmtNumber(u.credits)}</td>
                        <td className="ma-num">{fmtNumber(u.events)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Subsection>

            <Subsection title="Recent audit">
              {data!.recentAudit.length === 0 ? (
                <Empty label="No recent audit events." />
              ) : (
                <ul className="ma-audit-list">
                  {data!.recentAudit.map(a => (
                    <li key={a.id}>
                      <span className="ma-audit-action">{a.action}</span>
                      <span className="ma-cell-sub">{a.table_name}</span>
                      <span className="ma-audit-when">{fmtRelative(a.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Subsection>
          </div>
        ) : null}

        <GovernedActionDialog
          open={dialog != null}
          title={dialog === 'suspended' ? 'Suspend client' : 'Reactivate client'}
          description={
            dialog === 'suspended'
              ? `Suspending "${tenant?.name ?? ''}" blocks access for all of its members. This is recorded to the audit trail.`
              : `Reactivating "${tenant?.name ?? ''}" restores access for its members. This is recorded to the audit trail.`
          }
          confirmLabel={dialog === 'suspended' ? 'Suspend client' : 'Reactivate client'}
          destructive={dialog === 'suspended'}
          busy={busy}
          error={mutErr}
          onConfirm={runMutation}
          onCancel={() => setDialog(null)}
        />

        <GovernedActionDialog
          open={moduleDialog != null}
          title={moduleDialog?.next ? 'Enable module' : 'Disable module'}
          description={
            moduleDialog?.next
              ? `Enable "${moduleDialog?.name}" for ${tenant?.name ?? 'this client'}. Recorded to the audit trail.`
              : `Disable "${moduleDialog?.name}" for ${tenant?.name ?? 'this client'}. Recorded to the audit trail.`
          }
          confirmLabel={moduleDialog?.next ? 'Enable module' : 'Disable module'}
          destructive={moduleDialog ? !moduleDialog.next : false}
          busy={modBusy}
          error={modErr}
          onConfirm={runModuleMutation}
          onCancel={() => setModuleDialog(null)}
        />
      </aside>
    </div>
  );
}

function KV({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="ma-kv">
      <div className="ma-kv-k">{k}</div>
      <div className="ma-kv-v">{children}</div>
    </div>
  );
}

function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="ma-subsection">
      <div className="ma-subsection-title">{title}</div>
      {children}
    </div>
  );
}
