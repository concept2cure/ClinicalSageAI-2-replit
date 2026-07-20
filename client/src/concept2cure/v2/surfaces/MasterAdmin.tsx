/**
 * Master Administration — the internal, non-client-facing support console over
 * the live cross-tenant estate. UI deliverable of
 * HANDOFF_TO_DESIGN_master_admin_business_center.md §4, wired 1:1 to
 * /api/admin/master/* (server/routes/admin/master-admin.ts — authMiddleware →
 * requirePlatformAdmin, DB-authoritative via platform_role_grants).
 *
 * No fixtures by design: an operations console must never render fabricated
 * estate data. Every view carries loading / empty / error+retry, 401 routes to
 * sign-in, and 403 shows a non-leaky access-denied. Mutations (suspend/
 * reactivate, module toggles, flag toggles) are governed: a reason-for-change
 * (min 3 chars) is captured and lands in the audit chain server-side.
 */
import React, { useMemo, useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import {
  ConsoleDenied,
  ConsoleError,
  ConsoleLoading,
  KpiCard,
  ReasonDialog,
  StatusChip,
  When,
  adminSend,
  num,
  uptime,
  useAdminGet,
} from '../platformAdminConnect';
import { MaIdentity } from './MasterAdminIdentity';
import '../styles/project-home-v2.css';
import '../styles/ana-v2.css';

/* ── Response shapes (mirror the master-admin.ts SQL exactly) ───────────────── */

interface MaCounts {
  total: number;
  active: number;
  suspended: number;
  new_30d: number;
  active_30d?: number;
}
interface MaOverview {
  tenants: MaCounts;
  users: MaCounts;
  usage: { credits_30d: number; events_30d: number };
  modules: { enabled: number };
  audit: { last_24h: number; last_7d: number };
  tiers: Array<{ tier: string | null; count: number }>;
  generatedAt: string;
}
interface MaTenantRow {
  id: number;
  name: string;
  slug: string;
  tier: string | null;
  status: string | null;
  client_type: string | null;
  seats_purchased: number | null;
  max_users: number | null;
  payment_status: string | null;
  created_at: string | null;
  member_count: number;
  last_active: string | null;
  enabled_modules: number;
  credits_30d: number;
}
interface MaTenantDetail {
  tenant: {
    id: number;
    name: string;
    slug: string;
    domain: string | null;
    tier: string | null;
    status: string | null;
    client_type: string | null;
    billing_cycle: string | null;
    payment_status: string | null;
    seats_purchased: number | null;
    max_users: number | null;
    max_projects: number | null;
    max_storage: number | null;
    trial_ends_at: string | null;
    next_billing_date: string | null;
    created_at: string | null;
    updated_at: string | null;
  };
  members: Array<{
    id: number;
    name: string | null;
    email: string;
    title: string | null;
    status: string | null;
    last_login: string | null;
    mfa_enabled: boolean | null;
    role: string;
  }>;
  modules: Array<{
    module_id: string;
    name: string | null;
    category: string | null;
    enabled: boolean;
    enabled_at: string | null;
    updated_at: string | null;
  }>;
  usage: Array<{ feature_id: string; credits: number; events: number }>;
  recentAudit: Array<{
    id: string;
    user_id: number | null;
    action: string;
    table_name: string | null;
    record_id: string | null;
    ip_address: string | null;
    created_at: string;
  }>;
}
interface MaUserRow {
  id: number;
  email: string;
  name: string | null;
  title: string | null;
  status: string | null;
  last_login: string | null;
  mfa_enabled: boolean | null;
  created_at: string | null;
  memberships: Array<{ orgId: number; orgName: string; role: string }>;
}
interface MaBilling {
  byPaymentStatus: Array<{ payment_status: string; count: number }>;
  trialsEndingSoon: Array<{ id: number; name: string; slug: string; tier: string | null; trial_ends_at: string }>;
  pastDue: Array<{ id: number; name: string; slug: string; tier: string | null; payment_status: string; next_billing_date: string | null }>;
  unacknowledgedAlerts: Array<{ id: number; organization_id: number | null; type: string | null; threshold: number | null; message: string | null; created_at: string; organization_name: string | null }>;
}
interface MaEntitlementRow {
  module_id: string;
  name: string | null;
  category: string | null;
  description: string | null;
  enabled_orgs: number;
  total_subscriptions: number;
}
interface MaFlag {
  id: number;
  feature_key: string;
  description: string | null;
  enabled: boolean;
  enabled_for_organization_ids: unknown;
  enabled_for_client_workspace_ids: unknown;
  updated_at: string | null;
}
interface MaHealth {
  status: string;
  database: { ok: boolean; pool: { total?: number; idle?: number; waiting?: number } };
  process: {
    uptimeSeconds: number;
    nodeVersion: string;
    env: string;
    memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
  };
}
interface MaAudit {
  events: Array<{
    id: string;
    tenant_id: number | null;
    user_id: number | null;
    action: string;
    table_name: string | null;
    record_id: string | null;
    ip_address: string | null;
    created_at: string;
    actor_email: string | null;
    tenant_name: string | null;
  }>;
  total: number;
  limit: number;
  offset: number;
}
interface MaConnectors {
  connectors: Array<{
    id: number;
    organization_id: number | null;
    connector_id: string;
    is_valid: boolean;
    last_validated_at: string | null;
    created_at: string | null;
    organization_name: string | null;
  }>;
}
interface MaJobs {
  jobs: Array<{
    id: number | string;
    organization_id: number | null;
    status: string;
    progress: number | null;
    credits_used: number | null;
    created_at: string;
    completed_at: string | null;
    organization_name: string | null;
  }>;
  summary7d: Array<{ status: string; count: number }>;
}

/** Length of a jsonb array column that may arrive as an array or a JSON string. */
function overrideCount(v: unknown): number {
  if (Array.isArray(v)) return v.length;
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch (_e) {
      return 0;
    }
  }
  return 0;
}

interface Governed {
  title: string;
  consequence: string;
  confirmLabel: string;
  danger?: boolean;
  run: (reason: string) => Promise<{ ok: boolean; error: string | null }>;
}

const MA_SECTIONS: Array<[string, string, string]> = [
  ['overview', 'Overview', 'grid'],
  ['clients', 'Clients', 'building'],
  ['users', 'Users', 'user'],
  ['billing', 'Billing', 'creditCard'],
  ['entitlements', 'Entitlements', 'checkSquare'],
  ['flags', 'Feature flags', 'sliders'],
  ['identity', 'Identity & SCIM', 'key'],
  ['audit', 'Audit trail', 'scroll'],
  ['ops', 'Operations', 'zap'],
];

export function MasterAdmin({ onAsk }: SurfaceViewProps) {
  const [sec, setSec] = useState('overview');
  const [gov, setGov] = useState<Governed | null>(null);
  const [govBusy, setGovBusy] = useState(false);
  const [toast, setToast] = useState('');
  const fireToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(''), 3200);
  };

  // The overview read doubles as the console's access probe: platform-admin
  // gating is uniform across /api/admin/master, so its 401/403 decides the
  // whole console's state without leaking anything else.
  const [refreshTick, setRefreshTick] = useState(0);
  const overview = useAdminGet<MaOverview>('/api/admin/master/overview', ['ov', refreshTick]);

  const runGoverned = async (g: Governed, reason: string) => {
    setGovBusy(true);
    const r = await g.run(reason);
    setGovBusy(false);
    setGov(null);
    if (r.ok) {
      fireToast('Done -- reason recorded -- audited');
      setRefreshTick((t) => t + 1);
    } else {
      fireToast('Not applied -- ' + (r.error || 'request failed'));
    }
  };

  if (overview.status === 401 || overview.status === 403) {
    return (
      <div className="page-inner">
        <MaHeader />
        <ConsoleDenied
          status={overview.status}
          tierLabel="platform administrators and support staff"
        />
      </div>
    );
  }

  return (
    <div className="page-inner" style={{ maxWidth: 1240 }}>
      <MaHeader
        right={
          <button
            className="btn ghost"
            onClick={() => setRefreshTick((t) => t + 1)}
            title="Refresh all data"
          >
            {I.rotateCw} Refresh
          </button>
        }
      />
      <div className="sp-2col" style={{ gridTemplateColumns: '200px 1fr', alignItems: 'start' }}>
        <div className="pj-card">
          <div className="pj-card-b" style={{ padding: 8 }}>
            <div className="ac-nav">
              {MA_SECTIONS.map(([id, label, icon]) => (
                <button
                  key={id}
                  className={'ac-nav-b' + (sec === id ? ' on' : '')}
                  onClick={() => setSec(id)}
                >
                  {I[icon] || I.grid}
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          {sec === 'overview' && (
            <MaOverviewView state={overview} onJump={setSec} />
          )}
          {sec === 'clients' && (
            <MaClients refreshTick={refreshTick} setGov={setGov} />
          )}
          {sec === 'users' && <MaUsers refreshTick={refreshTick} setGov={setGov} />}
          {sec === 'billing' && (
            <MaBillingView refreshTick={refreshTick} onAck={async (id) => {
              const r = await adminSend('PATCH', `/api/admin/master/billing/alerts/${id}/acknowledge`);
              if (r.ok) {
                fireToast('Alert acknowledged -- audited');
                setRefreshTick((t) => t + 1);
              } else {
                fireToast('Could not acknowledge -- ' + (r.error || 'request failed'));
              }
            }} />
          )}
          {sec === 'entitlements' && <MaEntitlements refreshTick={refreshTick} />}
          {sec === 'flags' && <MaFlags refreshTick={refreshTick} setGov={setGov} />}
          {sec === 'identity' && <MaIdentity refreshTick={refreshTick} onToast={fireToast} />}
          {sec === 'audit' && <MaAuditExplorer refreshTick={refreshTick} />}
          {sec === 'ops' && <MaOps refreshTick={refreshTick} />}
        </div>
      </div>

      {gov && (
        <ReasonDialog
          title={gov.title}
          consequence={gov.consequence}
          confirmLabel={gov.confirmLabel}
          danger={gov.danger}
          busy={govBusy}
          onConfirm={(reason) => void runGoverned(gov, reason)}
          onCancel={() => setGov(null)}
        />
      )}
      {toast && (
        <div className="pdev-toast">
          {I.check} {toast}
        </div>
      )}
    </div>
  );
}

function MaHeader({ right }: { right?: React.ReactNode }) {
  return (
    <div className="ph">
      <div>
        <div className="ph-eyebrow">
          Platform operations -- /api/admin/master --{' '}
          <span style={{ color: 'var(--warning)' }}>internal, non client-facing</span>
        </div>
        <h1 className="ph-title">Master Administration</h1>
        <div className="ph-sub">
          Cross-tenant monitoring and product-level support. Every mutation captures a reason and
          lands in the tamper-evident audit chain.
        </div>
      </div>
      {right && <div style={{ display: 'flex', gap: 8 }}>{right}</div>}
    </div>
  );
}

/* ════════════ 1 · Overview ════════════ */

function MaOverviewView({
  state,
  onJump,
}: {
  state: ReturnType<typeof useAdminGet<MaOverview>>;
  onJump: (sec: string) => void;
}) {
  if (state.loading) return <ConsoleLoading label="platform overview" />;
  if (state.error) return <ConsoleError error={state.error} onRetry={state.retry} />;
  const d = state.data;
  if (!d) return <ConsoleLoading label="platform overview" />;
  const fresh =
    d.tenants.total === 0 && d.users.total === 0;
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <KpiCard label="Clients" value={num(d.tenants.total)} sub={`${num(d.tenants.active)} active -- ${num(d.tenants.suspended)} suspended`} />
        <KpiCard label="New clients (30d)" value={num(d.tenants.new_30d)} />
        <KpiCard label="Users" value={num(d.users.total)} sub={`${num(d.users.suspended)} suspended`} />
        <KpiCard label="Active users (30d)" value={num(d.users.active_30d)} sub={`${num(d.users.new_30d)} new`} />
        <KpiCard label="Usage credits (30d)" value={num(d.usage.credits_30d)} sub={`${num(d.usage.events_30d)} metering events`} />
        <KpiCard label="Modules enabled" value={num(d.modules.enabled)} sub="across all clients" />
        <KpiCard label="Audit entries (24h)" value={num(d.audit.last_24h)} sub={`${num(d.audit.last_7d)} in 7d`} />
      </div>

      {fresh && (
        <div className="scaf-note" style={{ marginTop: 14, maxWidth: 640 }}>
          Fresh install -- no organizations or users exist yet. The estate populates here as
          clients onboard.
        </div>
      )}

      <div className="sec" style={{ marginTop: 18 }}>
        <div className="sec-hdr">
          <div className="sec-title">Tier breakdown</div>
          <div className="sec-sub">organizations.tier</div>
        </div>
        {d.tiers.length === 0 ? (
          <div className="scaf-note">No organizations yet.</div>
        ) : (
          <div className="ctable" style={{ maxWidth: 420 }}>
            <div className="ct-head" style={{ gridTemplateColumns: '1fr 90px' }}>
              <div>Tier</div>
              <div style={{ textAlign: 'right' }}>Clients</div>
            </div>
            {d.tiers.map((t) => (
              <div key={String(t.tier)} className="ct-row" style={{ gridTemplateColumns: '1fr 90px' }}>
                <div className="ct-strong">{t.tier ?? '--'}</div>
                <div className="mono" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {num(t.count)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        {(
          [
            ['clients', 'Review clients'],
            ['billing', 'Billing monitor'],
            ['audit', 'Audit explorer'],
            ['ops', 'System health'],
          ] as [string, string][]
        ).map(([id, label]) => (
          <button key={id} className="sp-ask" onClick={() => onJump(id)}>
            {label} {I.arrowRight}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ════════════ 2 · Clients ════════════ */

function MaClients({
  refreshTick,
  setGov,
}: {
  refreshTick: number;
  setGov: (g: Governed) => void;
}) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [sel, setSel] = useState<number | null>(null);
  const [detailTick, setDetailTick] = useState(0);
  const path = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (status) p.set('status', status);
    const qs = p.toString();
    return `/api/admin/master/tenants${qs ? `?${qs}` : ''}`;
  }, [q, status]);
  const list = useAdminGet<{ tenants: MaTenantRow[] }>(path, [path, refreshTick]);
  const detail = useAdminGet<MaTenantDetail>(
    sel === null ? null : `/api/admin/master/tenants/${sel}`,
    [sel, refreshTick, detailTick],
  );

  const suspend = (t: { id: number; name: string; status: string | null }) => {
    const suspending = t.status !== 'suspended';
    setGov({
      title: `${suspending ? 'Suspend' : 'Reactivate'} ${t.name}`,
      consequence: suspending
        ? `Every member of ${t.name} loses access at their next request until the client is reactivated.`
        : `${t.name} returns to active service; members can sign in again immediately.`,
      confirmLabel: suspending ? 'Suspend client' : 'Reactivate client',
      danger: suspending,
      run: async (reason) => {
        const r = await adminSend('PATCH', `/api/admin/master/tenants/${t.id}/status`, {
          status: suspending ? 'suspended' : 'active',
          reason,
        });
        if (r.ok) setDetailTick((x) => x + 1);
        return { ok: r.ok, error: r.error };
      },
    });
  };

  const toggleModule = (
    tenant: { id: number; name: string },
    mod: { module_id: string; name: string | null; enabled: boolean },
  ) => {
    const enabling = !mod.enabled;
    const label = mod.name || mod.module_id;
    setGov({
      title: `${enabling ? 'Enable' : 'Disable'} ${label} for ${tenant.name}`,
      consequence: enabling
        ? `${tenant.name} gains access to ${label} immediately.`
        : `${tenant.name} loses access to ${label} immediately; in-flight work in that module becomes unreachable until re-enabled.`,
      confirmLabel: enabling ? 'Enable module' : 'Disable module',
      danger: !enabling,
      run: async (reason) => {
        const r = await adminSend('PATCH', `/api/admin/master/tenants/${tenant.id}/modules`, {
          moduleId: mod.module_id,
          enabled: enabling,
          reason,
        });
        if (r.ok) setDetailTick((x) => x + 1);
        return { ok: r.ok, error: r.error };
      },
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="vault-search" style={{ flex: '1 1 220px', maxWidth: 320 }}>
          <span className="ico">{I.search}</span>
          <input placeholder="Search name or slug..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="seg">
          {['', 'active', 'suspended', 'inactive'].map((s) => (
            <button key={s || 'all'} className={`seg-b${status === s ? ' on' : ''}`} onClick={() => setStatus(s)}>
              {s || 'all'}
            </button>
          ))}
        </div>
      </div>

      {list.loading ? (
        <ConsoleLoading label="clients" />
      ) : list.error ? (
        <ConsoleError error={list.error} onRetry={list.retry} />
      ) : !list.data || list.data.tenants.length === 0 ? (
        <div className="scaf-note">No clients match. Clear the search or status filter, or onboard the first client.</div>
      ) : (
        <div className="ctable">
          <div className="ct-head" style={{ gridTemplateColumns: '1.4fr 90px 90px 90px 70px 90px 90px 96px' }}>
            <div>Client</div>
            <div>Tier</div>
            <div>Status</div>
            <div>Payment</div>
            <div style={{ textAlign: 'right' }}>Members</div>
            <div style={{ textAlign: 'right' }}>Modules</div>
            <div style={{ textAlign: 'right' }}>Credits 30d</div>
            <div>Last active</div>
          </div>
          {list.data.tenants.map((t) => (
            <button
              key={t.id}
              className="ct-row"
              style={{
                gridTemplateColumns: '1.4fr 90px 90px 90px 70px 90px 90px 96px',
                background: sel === t.id ? 'var(--accent-000)' : undefined,
              }}
              onClick={() => setSel(sel === t.id ? null : t.id)}
            >
              <div className="vn">
                <span className="ct-strong">{t.name}</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--text-400)' }}>{t.slug}</span>
              </div>
              <div>{t.tier ?? '--'}</div>
              <div><StatusChip value={t.status} /></div>
              <div><StatusChip value={t.payment_status} /></div>
              <div className="mono" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(t.member_count)}</div>
              <div className="mono" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(t.enabled_modules)}</div>
              <div className="mono" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(t.credits_30d)}</div>
              <div><When iso={t.last_active} /></div>
            </button>
          ))}
        </div>
      )}

      {sel !== null && (
        <div style={{ marginTop: 14, padding: 16, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-100)' }}>
          {detail.loading ? (
            <ConsoleLoading label="client detail" />
          ) : detail.error ? (
            <ConsoleError error={detail.error} onRetry={detail.retry} />
          ) : detail.data ? (
            <MaTenantDetailView d={detail.data} onSuspend={suspend} onToggleModule={toggleModule} onClose={() => setSel(null)} />
          ) : null}
        </div>
      )}
    </div>
  );
}

function MaTenantDetailView({
  d,
  onSuspend,
  onToggleModule,
  onClose,
}: {
  d: MaTenantDetail;
  onSuspend: (t: { id: number; name: string; status: string | null }) => void;
  onToggleModule: (
    tenant: { id: number; name: string },
    mod: { module_id: string; name: string | null; enabled: boolean },
  ) => void;
  onClose: () => void;
}) {
  const t = d.tenant;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ fontWeight: 650, fontSize: 15, flex: 1 }}>
          {t.name} <span className="mono" style={{ fontSize: 11, color: 'var(--text-400)' }}>{t.slug}</span>{' '}
          <StatusChip value={t.status} />
        </div>
        <button
          className={t.status === 'suspended' ? 'sp-primary' : 'sp-ask'}
          style={t.status !== 'suspended' ? { color: 'var(--error)', borderColor: 'var(--error)' } : undefined}
          onClick={() => onSuspend({ id: t.id, name: t.name, status: t.status })}
        >
          {t.status === 'suspended' ? 'Reactivate client' : 'Suspend client'}
        </button>
        <button className="tbtn" onClick={onClose} aria-label="Close detail">{I.close}</button>
      </div>

      <div className="ac-fields" style={{ marginBottom: 14 }}>
        {(
          [
            ['Tier', t.tier ?? '--'],
            ['Client type', t.client_type ?? '--'],
            ['Billing', `${t.billing_cycle ?? '--'} -- ${t.payment_status ?? '--'}`],
            ['Seats', `${num(t.seats_purchased)} purchased -- ${num(t.max_users)} max`],
            ['Limits', `${num(t.max_projects)} projects -- ${num(t.max_storage)} GB`],
            ['Created', t.created_at ? String(t.created_at).slice(0, 10) : '--'],
          ] as [string, string][]
        ).map(([k, v], i) => (
          <div key={i} className="ac-field">
            <span className="k">{k}</span>
            <span className="v">{v}</span>
          </div>
        ))}
      </div>

      <div className="sec-hdr"><div className="sec-title">Members</div><div className="sec-sub">{d.members.length} in organization_users</div></div>
      {d.members.length === 0 ? (
        <div className="scaf-note">No members.</div>
      ) : (
        <div className="ctable" style={{ marginBottom: 14 }}>
          <div className="ct-head" style={{ gridTemplateColumns: '1.2fr 1.4fr 90px 90px 60px 96px' }}>
            <div>Name</div><div>Email</div><div>Role</div><div>Status</div><div>MFA</div><div>Last login</div>
          </div>
          {d.members.map((m) => (
            <div key={m.id} className="ct-row" style={{ gridTemplateColumns: '1.2fr 1.4fr 90px 90px 60px 96px' }}>
              <div className="ct-strong">{m.name || '--'}</div>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.email}</div>
              <div><span className="rd-chip tone-ai">{m.role}</span></div>
              <div><StatusChip value={m.status} /></div>
              <div>{m.mfa_enabled ? <span title="MFA enabled">{I.shieldCheck}</span> : <span style={{ color: 'var(--text-500)' }}>off</span>}</div>
              <div><When iso={m.last_login} /></div>
            </div>
          ))}
        </div>
      )}

      <div className="sec-hdr"><div className="sec-title">Module entitlements</div><div className="sec-sub">{d.modules.filter((m) => m.enabled).length} enabled of {d.modules.length}</div></div>
      {d.modules.length === 0 ? (
        <div className="scaf-note">No module subscriptions provisioned for this client yet.</div>
      ) : (
        <div className="ctable" style={{ marginBottom: 14 }}>
          <div className="ct-head" style={{ gridTemplateColumns: '1.4fr 110px 90px 80px' }}>
            <div>Module</div><div>Category</div><div>State</div><div></div>
          </div>
          {d.modules.map((m) => (
            <div key={m.module_id} className="ct-row" style={{ gridTemplateColumns: '1.4fr 110px 90px 80px' }}>
              <div className="ct-strong">{m.name || m.module_id}</div>
              <div style={{ color: 'var(--text-400)' }}>{m.category ?? '--'}</div>
              <div><span className={`rd-chip tone-${m.enabled ? 'ok' : 'idle'}`}>{m.enabled ? 'enabled' : 'disabled'}</span></div>
              <div>
                <button
                  className="lic-toggle"
                  role="switch"
                  aria-checked={m.enabled}
                  aria-label={`${m.enabled ? 'Disable' : 'Enable'} ${m.name || m.module_id}`}
                  data-on={m.enabled || undefined}
                  onClick={() => onToggleModule({ id: t.id, name: t.name }, m)}
                >
                  <span className="lic-toggle-k"></span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="sec-hdr"><div className="sec-title">Usage by feature (30d)</div></div>
      {d.usage.length === 0 ? (
        <div className="scaf-note" style={{ marginBottom: 14 }}>No metered usage in the last 30 days.</div>
      ) : (
        <div className="ctable" style={{ maxWidth: 520, marginBottom: 14 }}>
          <div className="ct-head" style={{ gridTemplateColumns: '1fr 100px 90px' }}>
            <div>Feature</div><div style={{ textAlign: 'right' }}>Credits</div><div style={{ textAlign: 'right' }}>Events</div>
          </div>
          {d.usage.map((u) => (
            <div key={u.feature_id} className="ct-row" style={{ gridTemplateColumns: '1fr 100px 90px' }}>
              <div className="mono" style={{ fontSize: 11 }}>{u.feature_id}</div>
              <div className="mono" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(u.credits)}</div>
              <div className="mono" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(u.events)}</div>
            </div>
          ))}
        </div>
      )}

      <div className="sec-hdr"><div className="sec-title">Recent audit</div><div className="sec-sub">last {d.recentAudit.length} entries</div></div>
      {d.recentAudit.length === 0 ? (
        <div className="scaf-note">No audit entries for this client yet.</div>
      ) : (
        <div className="ctable">
          <div className="ct-head" style={{ gridTemplateColumns: '96px 1fr 1fr 110px' }}>
            <div>When</div><div>Action</div><div>Target</div><div>IP</div>
          </div>
          {d.recentAudit.map((a) => (
            <div key={a.id} className="ct-row" style={{ gridTemplateColumns: '96px 1fr 1fr 110px' }}>
              <div><When iso={a.created_at} /></div>
              <div>{a.action}</div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-400)' }}>
                {a.table_name ?? '--'}{a.record_id ? ` #${a.record_id}` : ''}
              </div>
              <div className="mono" style={{ fontSize: 11 }}>{a.ip_address ?? '--'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════ 3 · Users ════════════ */

function MaUsers({ refreshTick, setGov }: { refreshTick: number; setGov: (g: Governed) => void }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const path = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (status) p.set('status', status);
    const qs = p.toString();
    return `/api/admin/master/users${qs ? `?${qs}` : ''}`;
  }, [q, status]);
  const list = useAdminGet<{ users: MaUserRow[] }>(path, [path, refreshTick]);

  const suspend = (u: MaUserRow) => {
    const suspending = u.status !== 'suspended';
    setGov({
      title: `${suspending ? 'Suspend' : 'Reactivate'} ${u.email}`,
      consequence: suspending
        ? `${u.email} is signed out at their next request and cannot sign in until reactivated.`
        : `${u.email} can sign in again immediately.`,
      confirmLabel: suspending ? 'Suspend user' : 'Reactivate user',
      danger: suspending,
      run: async (reason) => {
        const r = await adminSend('PATCH', `/api/admin/master/users/${u.id}/status`, {
          status: suspending ? 'suspended' : 'active',
          reason,
        });
        return { ok: r.ok, error: r.error };
      },
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="vault-search" style={{ flex: '1 1 220px', maxWidth: 320 }}>
          <span className="ico">{I.search}</span>
          <input placeholder="Search email or name..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="seg">
          {['', 'active', 'suspended'].map((s) => (
            <button key={s || 'all'} className={`seg-b${status === s ? ' on' : ''}`} onClick={() => setStatus(s)}>
              {s || 'all'}
            </button>
          ))}
        </div>
      </div>
      {list.loading ? (
        <ConsoleLoading label="users" />
      ) : list.error ? (
        <ConsoleError error={list.error} onRetry={list.retry} />
      ) : !list.data || list.data.users.length === 0 ? (
        <div className="scaf-note">No users match.</div>
      ) : (
        <div className="ctable">
          <div className="ct-head" style={{ gridTemplateColumns: '1.5fr 1.3fr 90px 60px 96px 110px' }}>
            <div>User</div><div>Memberships</div><div>Status</div><div>MFA</div><div>Last login</div><div></div>
          </div>
          {list.data.users.map((u) => (
            <div key={u.id} className="ct-row" style={{ gridTemplateColumns: '1.5fr 1.3fr 90px 60px 96px 110px' }}>
              <div className="vn">
                <span className="ct-strong">{u.name || u.email}</span>
                {u.name && <span style={{ fontSize: 11, color: 'var(--text-400)' }}>{u.email}</span>}
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {u.memberships.length === 0 ? (
                  <span style={{ color: 'var(--text-500)', fontSize: 11 }}>none</span>
                ) : (
                  u.memberships.map((m, i) => (
                    <span key={i} className="rd-chip tone-ai" title={m.role}>
                      {m.orgName} -- {m.role}
                    </span>
                  ))
                )}
              </div>
              <div><StatusChip value={u.status} /></div>
              <div>{u.mfa_enabled ? <span title="MFA enabled">{I.shieldCheck}</span> : <span style={{ color: 'var(--text-500)' }}>off</span>}</div>
              <div><When iso={u.last_login} /></div>
              <div>
                <button
                  className="sp-ask"
                  style={u.status !== 'suspended' ? { color: 'var(--error)', borderColor: 'var(--error)' } : undefined}
                  onClick={() => suspend(u)}
                >
                  {u.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════ 4 · Billing ════════════ */

function MaBillingView({
  refreshTick,
  onAck,
}: {
  refreshTick: number;
  onAck: (id: number) => Promise<void>;
}) {
  const b = useAdminGet<MaBilling>('/api/admin/master/billing', ['billing', refreshTick]);
  if (b.loading) return <ConsoleLoading label="billing overview" />;
  if (b.error) return <ConsoleError error={b.error} onRetry={b.retry} />;
  const d = b.data;
  if (!d) return <ConsoleLoading label="billing overview" />;
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        {d.byPaymentStatus.map((s) => (
          <KpiCard
            key={s.payment_status}
            label={s.payment_status}
            value={num(s.count)}
            tone={s.payment_status === 'past_due' ? 'err' : s.payment_status === 'active' ? 'ok' : undefined}
          />
        ))}
        {d.byPaymentStatus.length === 0 && <div className="scaf-note">No organizations yet.</div>}
      </div>

      <div className="sec-hdr"><div className="sec-title">Unacknowledged alerts</div><div className="sec-sub">{d.unacknowledgedAlerts.length} open</div></div>
      {d.unacknowledgedAlerts.length === 0 ? (
        <div className="scaf-note" style={{ marginBottom: 16 }}>No open billing alerts.</div>
      ) : (
        <div className="ctable" style={{ marginBottom: 16 }}>
          <div className="ct-head" style={{ gridTemplateColumns: '96px 1fr 1.4fr 110px' }}>
            <div>When</div><div>Client</div><div>Alert</div><div></div>
          </div>
          {d.unacknowledgedAlerts.map((a) => (
            <div key={a.id} className="ct-row" style={{ gridTemplateColumns: '96px 1fr 1.4fr 110px' }}>
              <div><When iso={a.created_at} /></div>
              <div className="ct-strong">{a.organization_name ?? `org ${a.organization_id ?? '--'}`}</div>
              <div style={{ fontSize: 12 }}>
                <span className="rd-chip tone-warn" style={{ marginRight: 6 }}>{a.type ?? 'alert'}</span>
                {a.message ?? '--'}
              </div>
              <div>
                <button className="sp-ask" onClick={() => void onAck(a.id)}>Acknowledge</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="sec-hdr"><div className="sec-title">Trials ending within 14 days</div></div>
      {d.trialsEndingSoon.length === 0 ? (
        <div className="scaf-note" style={{ marginBottom: 16 }}>No trials ending soon.</div>
      ) : (
        <div className="ctable" style={{ maxWidth: 640, marginBottom: 16 }}>
          <div className="ct-head" style={{ gridTemplateColumns: '1.4fr 100px 120px' }}>
            <div>Client</div><div>Tier</div><div>Trial ends</div>
          </div>
          {d.trialsEndingSoon.map((t) => (
            <div key={t.id} className="ct-row" style={{ gridTemplateColumns: '1.4fr 100px 120px' }}>
              <div className="ct-strong">{t.name}</div>
              <div>{t.tier ?? '--'}</div>
              <div className="mono" style={{ fontSize: 11 }}>{String(t.trial_ends_at).slice(0, 10)}</div>
            </div>
          ))}
        </div>
      )}

      <div className="sec-hdr"><div className="sec-title">Past due / incomplete</div></div>
      {d.pastDue.length === 0 ? (
        <div className="scaf-note">No past-due clients.</div>
      ) : (
        <div className="ctable" style={{ maxWidth: 720 }}>
          <div className="ct-head" style={{ gridTemplateColumns: '1.4fr 100px 110px 130px' }}>
            <div>Client</div><div>Tier</div><div>Status</div><div>Next billing</div>
          </div>
          {d.pastDue.map((t) => (
            <div key={t.id} className="ct-row" style={{ gridTemplateColumns: '1.4fr 100px 110px 130px' }}>
              <div className="ct-strong">{t.name}</div>
              <div>{t.tier ?? '--'}</div>
              <div><StatusChip value={t.payment_status} /></div>
              <div className="mono" style={{ fontSize: 11 }}>{t.next_billing_date ? String(t.next_billing_date).slice(0, 10) : '--'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════ 5 · Entitlements ════════════ */

function MaEntitlements({ refreshTick }: { refreshTick: number }) {
  const e = useAdminGet<{ modules: MaEntitlementRow[] }>('/api/admin/master/entitlements', ['ent', refreshTick]);
  if (e.loading) return <ConsoleLoading label="entitlements" />;
  if (e.error) return <ConsoleError error={e.error} onRetry={e.retry} />;
  const rows = e.data?.modules ?? [];
  if (rows.length === 0) {
    return <div className="scaf-note">Module catalog is empty (available_modules).</div>;
  }
  const byCategory = new Map<string, MaEntitlementRow[]>();
  for (const r of rows) {
    const cat = r.category || 'other';
    byCategory.set(cat, [...(byCategory.get(cat) || []), r]);
  }
  return (
    <div>
      {[...byCategory.entries()].map(([cat, mods]) => (
        <div className="sec" key={cat}>
          <div className="sec-hdr">
            <div className="sec-title">{cat.charAt(0).toUpperCase() + cat.slice(1)}</div>
            <div className="sec-sub">{mods.length} modules</div>
          </div>
          <div className="ctable">
            <div className="ct-head" style={{ gridTemplateColumns: '1.4fr 2fr 110px 130px' }}>
              <div>Module</div><div>Description</div><div style={{ textAlign: 'right' }}>Enabled clients</div><div style={{ textAlign: 'right' }}>Subscriptions</div>
            </div>
            {mods.map((m) => (
              <div key={m.module_id} className="ct-row" style={{ gridTemplateColumns: '1.4fr 2fr 110px 130px' }}>
                <div className="ct-strong">{m.name || m.module_id}</div>
                <div style={{ color: 'var(--text-400)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.description ?? '--'}</div>
                <div className="mono" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(m.enabled_orgs)}</div>
                <div className="mono" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(m.total_subscriptions)}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="scaf-note" style={{ marginTop: 8 }}>
        Per-client enable/disable lives in the client detail drawer (Clients section) -- both are
        governed writes to module_subscriptions.
      </div>
    </div>
  );
}

/* ════════════ 6 · Feature flags ════════════ */

function MaFlags({ refreshTick, setGov }: { refreshTick: number; setGov: (g: Governed) => void }) {
  const f = useAdminGet<{ flags: MaFlag[] }>('/api/admin/master/feature-flags', ['flags', refreshTick]);
  if (f.loading) return <ConsoleLoading label="feature flags" />;
  if (f.error) return <ConsoleError error={f.error} onRetry={f.retry} />;
  const rows = f.data?.flags ?? [];
  if (rows.length === 0) return <div className="scaf-note">No feature flags defined (feature_toggles).</div>;

  const toggle = (flag: MaFlag) => {
    const enabling = !flag.enabled;
    setGov({
      title: `${enabling ? 'Enable' : 'Disable'} ${flag.feature_key} globally`,
      consequence: enabling
        ? `${flag.feature_key} turns ON for every client without a per-client override.`
        : `${flag.feature_key} turns OFF for every client without a per-client override. Clients relying on it lose the behavior at their next request.`,
      confirmLabel: enabling ? 'Enable flag' : 'Disable flag',
      danger: !enabling,
      run: async (reason) => {
        const r = await adminSend('PATCH', `/api/admin/master/feature-flags/${encodeURIComponent(flag.feature_key)}`, {
          enabled: enabling,
          reason,
        });
        return { ok: r.ok, error: r.error };
      },
    });
  };

  return (
    <div className="ctable">
      <div className="ct-head" style={{ gridTemplateColumns: '1.3fr 2fr 110px 110px 90px 70px' }}>
        <div>Flag</div><div>Description</div><div style={{ textAlign: 'right' }}>Org overrides</div><div style={{ textAlign: 'right' }}>Workspace overrides</div><div>Updated</div><div>Global</div>
      </div>
      {rows.map((flag) => (
        <div key={flag.feature_key} className="ct-row" style={{ gridTemplateColumns: '1.3fr 2fr 110px 110px 90px 70px' }}>
          <div className="mono" style={{ fontSize: 11.5, fontWeight: 600 }}>{flag.feature_key}</div>
          <div style={{ color: 'var(--text-400)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis' }}>{flag.description ?? '--'}</div>
          <div className="mono" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(overrideCount(flag.enabled_for_organization_ids))}</div>
          <div className="mono" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(overrideCount(flag.enabled_for_client_workspace_ids))}</div>
          <div><When iso={flag.updated_at} /></div>
          <div>
            <button
              className="lic-toggle"
              role="switch"
              aria-checked={flag.enabled}
              aria-label={`${flag.enabled ? 'Disable' : 'Enable'} ${flag.feature_key} globally`}
              data-on={flag.enabled || undefined}
              onClick={() => toggle(flag)}
            >
              <span className="lic-toggle-k"></span>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ════════════ 7 · Audit explorer ════════════ */

function MaAuditExplorer({ refreshTick }: { refreshTick: number }) {
  const [client, setClient] = useState('');
  const [action, setAction] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const path = useMemo(() => {
    const p = new URLSearchParams();
    if (client.trim()) p.set('client', client.trim());
    if (action.trim()) p.set('action', action.trim());
    p.set('limit', String(limit));
    p.set('offset', String(offset));
    return `/api/admin/master/audit?${p.toString()}`;
  }, [client, action, offset]);
  const a = useAdminGet<MaAudit>(path, [path, refreshTick]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div className="vault-search" style={{ flex: '0 1 180px' }}>
          <span className="ico">{I.building}</span>
          <input
            placeholder="Client id..."
            value={client}
            onChange={(e) => { setClient(e.target.value); setOffset(0); }}
            inputMode="numeric"
          />
        </div>
        <div className="vault-search" style={{ flex: '1 1 220px', maxWidth: 320 }}>
          <span className="ico">{I.search}</span>
          <input placeholder="Filter action..." value={action} onChange={(e) => { setAction(e.target.value); setOffset(0); }} />
        </div>
      </div>
      {a.loading ? (
        <ConsoleLoading label="audit log" />
      ) : a.error ? (
        <ConsoleError error={a.error} onRetry={a.retry} />
      ) : !a.data || a.data.events.length === 0 ? (
        <div className="scaf-note">No audit entries match.</div>
      ) : (
        <React.Fragment>
          <div className="ctable">
            <div className="ct-head" style={{ gridTemplateColumns: '96px 1fr 1fr 1.2fr 1fr 110px' }}>
              <div>When</div><div>Action</div><div>Target</div><div>Actor</div><div>Client</div><div>IP</div>
            </div>
            {a.data.events.map((e) => (
              <div key={e.id} className="ct-row" style={{ gridTemplateColumns: '96px 1fr 1fr 1.2fr 1fr 110px' }}>
                <div><When iso={e.created_at} /></div>
                <div>{e.action}</div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--text-400)' }}>
                  {e.table_name ?? '--'}{e.record_id ? ` #${String(e.record_id).slice(0, 12)}` : ''}
                </div>
                <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.actor_email ?? (e.user_id != null ? `user ${e.user_id}` : 'system')}</div>
                <div style={{ fontSize: 12 }}>{e.tenant_name ?? (e.tenant_id != null ? `org ${e.tenant_id}` : '--')}</div>
                <div className="mono" style={{ fontSize: 11 }}>{e.ip_address ?? '--'}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
            <button className="sp-ask" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
              {I.left} Newer
            </button>
            <span style={{ fontSize: 11.5, color: 'var(--text-400)', fontVariantNumeric: 'tabular-nums' }}>
              {offset + 1}-{Math.min(offset + limit, a.data.total)} of {num(a.data.total)}
            </span>
            <button
              className="sp-ask"
              disabled={offset + limit >= a.data.total}
              onClick={() => setOffset(offset + limit)}
            >
              Older {I.right}
            </button>
          </div>
        </React.Fragment>
      )}
    </div>
  );
}

/* ════════════ 8 · Operations ════════════ */

function MaOps({ refreshTick }: { refreshTick: number }) {
  const [tick, setTick] = useState(0);
  const health = useAdminGet<MaHealth>('/api/admin/master/system-health', ['health', refreshTick, tick]);
  const connectors = useAdminGet<MaConnectors>('/api/admin/master/connectors', ['conn', refreshTick]);
  const jobs = useAdminGet<MaJobs>('/api/admin/master/jobs', ['jobs', refreshTick]);
  const h = health.data;
  return (
    <div>
      <div className="sec-hdr">
        <div className="sec-title">System health</div>
        <div className="sec-sub">
          <button className="sp-ask" style={{ padding: '2px 10px' }} onClick={() => setTick((t) => t + 1)}>
            Refresh
          </button>
        </div>
      </div>
      {health.loading ? (
        <ConsoleLoading label="system health" />
      ) : health.error ? (
        <ConsoleError error={health.error} onRetry={health.retry} />
      ) : h ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
          <KpiCard label="Status" value={h.status} tone={h.status === 'healthy' ? 'ok' : 'err'} sub={`env ${h.process.env} -- node ${h.process.nodeVersion}`} />
          <KpiCard
            label="DB pool"
            value={h.database.ok ? `${num(h.database.pool.total)} conns` : 'down'}
            tone={h.database.ok ? undefined : 'err'}
            sub={h.database.ok ? `${num(h.database.pool.idle)} idle -- ${num(h.database.pool.waiting)} waiting` : 'database unreachable'}
          />
          <KpiCard label="Uptime" value={uptime(h.process.uptimeSeconds)} />
          <KpiCard label="Memory" value={`${num(h.process.memory.rssMb)} MB`} sub={`heap ${num(h.process.memory.heapUsedMb)}/${num(h.process.memory.heapTotalMb)} MB`} />
        </div>
      ) : null}

      <div className="sec-hdr"><div className="sec-title">Connector health</div><div className="sec-sub">per-client credential validity -- no secrets shown</div></div>
      {connectors.loading ? (
        <ConsoleLoading label="connectors" />
      ) : connectors.error ? (
        <ConsoleError error={connectors.error} onRetry={connectors.retry} />
      ) : !connectors.data || connectors.data.connectors.length === 0 ? (
        <div className="scaf-note" style={{ marginBottom: 18 }}>No client connectors configured.</div>
      ) : (
        <div className="ctable" style={{ maxWidth: 760, marginBottom: 18 }}>
          <div className="ct-head" style={{ gridTemplateColumns: '1.2fr 1fr 100px 120px' }}>
            <div>Client</div><div>Connector</div><div>Validity</div><div>Last validated</div>
          </div>
          {connectors.data.connectors.map((c) => (
            <div key={c.id} className="ct-row" style={{ gridTemplateColumns: '1.2fr 1fr 100px 120px' }}>
              <div className="ct-strong">{c.organization_name ?? `org ${c.organization_id ?? '--'}`}</div>
              <div className="mono" style={{ fontSize: 11.5 }}>{c.connector_id}</div>
              <div><span className={`rd-chip tone-${c.is_valid ? 'ok' : 'err'}`}>{c.is_valid ? 'valid' : 'invalid'}</span></div>
              <div><When iso={c.last_validated_at} /></div>
            </div>
          ))}
        </div>
      )}

      <div className="sec-hdr"><div className="sec-title">Deep-research jobs</div><div className="sec-sub">7-day throughput + recent runs</div></div>
      {jobs.loading ? (
        <ConsoleLoading label="jobs" />
      ) : jobs.error ? (
        <ConsoleError error={jobs.error} onRetry={jobs.retry} />
      ) : !jobs.data ? null : (
        <React.Fragment>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {jobs.data.summary7d.length === 0 ? (
              <div className="scaf-note">No jobs in the last 7 days.</div>
            ) : (
              jobs.data.summary7d.map((s) => (
                <span key={s.status} className={`rd-chip tone-${s.status === 'completed' ? 'ok' : s.status === 'failed' ? 'err' : 'warn'}`}>
                  {s.status}: {num(s.count)}
                </span>
              ))
            )}
          </div>
          {jobs.data.jobs.length > 0 && (
            <div className="ctable" style={{ maxWidth: 860 }}>
              <div className="ct-head" style={{ gridTemplateColumns: '1.2fr 100px 90px 90px 96px 96px' }}>
                <div>Client</div><div>Status</div><div style={{ textAlign: 'right' }}>Progress</div><div style={{ textAlign: 'right' }}>Credits</div><div>Started</div><div>Completed</div>
              </div>
              {jobs.data.jobs.map((j) => (
                <div key={String(j.id)} className="ct-row" style={{ gridTemplateColumns: '1.2fr 100px 90px 90px 96px 96px' }}>
                  <div className="ct-strong">{j.organization_name ?? `org ${j.organization_id ?? '--'}`}</div>
                  <div><StatusChip value={j.status} /></div>
                  <div className="mono" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{j.progress != null ? `${j.progress}%` : '--'}</div>
                  <div className="mono" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(j.credits_used)}</div>
                  <div><When iso={j.created_at} /></div>
                  <div><When iso={j.completed_at} /></div>
                </div>
              ))}
            </div>
          )}
        </React.Fragment>
      )}
    </div>
  );
}
