/**
 * Master Administration — Identity & SCIM section.
 *
 * Extracted from MasterAdmin.tsx to keep that module under the repo-health
 * size gate. Enterprise identity provisioning, platform-side: per-client SCIM
 * bearer tokens (scim_tenants — only the sha-256 hash is stored; the plaintext
 * is shown ONCE at mint/rotate) and the SCIM IP allowlist (scim_ip_allowlist).
 * Both routers are requirePlatformAdmin-gated; a support-tier operator who can
 * open this console sees the server's 403 verbatim.
 */
import React, { useState } from 'react';
import { I } from '../icons';
import {
  ConsoleError,
  ConsoleLoading,
  When,
  adminSend,
  useAdminGet,
} from '../platformAdminConnect';

/* ════════════ 7 · Identity & SCIM ════════════
   Enterprise identity provisioning, platform-side: per-client SCIM bearer
   tokens (scim_tenants — only the sha-256 hash is stored; the plaintext is
   shown ONCE at mint/rotate) and the SCIM IP allowlist (scim_ip_allowlist).
   Both routers are super_admin/platform_admin-gated; a support-tier operator
   who can open this console sees the server's 403 verbatim. */

interface MaScimTenant {
  id: number;
  organizationId: number;
  label: string | null;
  enabled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}
interface MaScimRule {
  id: number;
  organizationId: number;
  cidr: string;
  label: string | null;
  enabled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export function MaIdentity({ refreshTick, onToast }: { refreshTick: number; onToast: (m: string) => void }) {
  const [tick, setTick] = useState(0);
  const tenants = useAdminGet<{ tenants: MaScimTenant[] }>('/api/admin/scim-tenants', ['scimT', refreshTick, tick]);
  const rules = useAdminGet<{ rules: MaScimRule[] }>('/api/admin/scim-ip-allowlist', ['scimR', refreshTick, tick]);

  // The plaintext token exists exactly once, in this state, until dismissed.
  const [minted, setMinted] = useState<{ label: string; token: string } | null>(null);
  const [tForm, setTForm] = useState({ orgId: '', label: '' });
  const [rForm, setRForm] = useState({ orgId: '', cidr: '', label: '' });
  const [busy, setBusy] = useState(false);

  const createTenant = async () => {
    const organizationId = Number(tForm.orgId);
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      onToast('Enter the client organization id (integer)');
      return;
    }
    setBusy(true);
    const r = await adminSend('POST', '/api/admin/scim-tenants', {
      organizationId,
      label: tForm.label.trim() || undefined,
    });
    setBusy(false);
    if (!r.ok) {
      onToast('Could not mint SCIM token -- ' + (r.error || 'request failed'));
      return;
    }
    const body = r.body as { token?: string; label?: string | null } | null;
    if (body?.token) {
      setMinted({ label: tForm.label.trim() || `org ${organizationId}`, token: body.token });
    }
    setTForm({ orgId: '', label: '' });
    setTick((t) => t + 1);
    onToast('SCIM tenant created -- token shown once below');
  };

  const rotateTenant = async (t: MaScimTenant) => {
    const r = await adminSend('POST', `/api/admin/scim-tenants/${t.id}/rotate`);
    if (!r.ok) {
      onToast('Could not rotate -- ' + (r.error || 'request failed'));
      return;
    }
    const body = r.body as { token?: string } | null;
    if (body?.token) {
      setMinted({ label: t.label || `org ${t.organizationId}`, token: body.token });
    }
    setTick((x) => x + 1);
    onToast('Token rotated -- the previous token is dead; new token shown once below');
  };

  const toggleTenant = async (t: MaScimTenant) => {
    const r = await adminSend('PATCH', `/api/admin/scim-tenants/${t.id}`, { enabled: !t.enabled });
    if (!r.ok) onToast('Could not update -- ' + (r.error || 'request failed'));
    setTick((x) => x + 1);
  };

  const deleteTenant = async (t: MaScimTenant) => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Revoke the SCIM connection for ${t.label || `org ${t.organizationId}`}? The IdP loses provisioning access immediately.`,
      )
    ) {
      return;
    }
    const r = await adminSend('DELETE', `/api/admin/scim-tenants/${t.id}`);
    if (!r.ok) onToast('Could not revoke -- ' + (r.error || 'request failed'));
    else onToast('SCIM tenant revoked');
    setTick((x) => x + 1);
  };

  const createRule = async () => {
    const organizationId = Number(rForm.orgId);
    if (!Number.isFinite(organizationId) || organizationId <= 0 || !rForm.cidr.trim()) {
      onToast('Enter the client organization id and a CIDR');
      return;
    }
    setBusy(true);
    const r = await adminSend('POST', '/api/admin/scim-ip-allowlist', {
      organizationId,
      cidr: rForm.cidr.trim(),
      label: rForm.label.trim() || undefined,
    });
    setBusy(false);
    if (!r.ok) {
      onToast('Could not add rule -- ' + (r.error || 'request failed'));
      return;
    }
    setRForm({ orgId: '', cidr: '', label: '' });
    setTick((x) => x + 1);
    onToast('IP rule added');
  };

  const toggleRule = async (rule: MaScimRule) => {
    const r = await adminSend('PATCH', `/api/admin/scim-ip-allowlist/${rule.id}`, {
      enabled: !rule.enabled,
    });
    if (!r.ok) onToast('Could not update -- ' + (r.error || 'request failed'));
    setTick((x) => x + 1);
  };

  const deleteRule = async (rule: MaScimRule) => {
    const r = await adminSend('DELETE', `/api/admin/scim-ip-allowlist/${rule.id}`);
    if (!r.ok) onToast('Could not delete -- ' + (r.error || 'request failed'));
    else onToast('IP rule deleted');
    setTick((x) => x + 1);
  };

  return (
    <div>
      {minted && (
        <div
          style={{
            marginBottom: 14,
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid var(--success)',
            background: 'color-mix(in srgb,var(--success) 8%,transparent)',
            fontSize: 12,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {I.shieldCheck} SCIM bearer token for "{minted.label}" -- copy it into the IdP now;
            only its hash is stored and it is never shown again
          </div>
          <code className="mono" style={{ fontSize: 11, wordBreak: 'break-all', userSelect: 'all' }}>
            {minted.token}
          </code>
          <div style={{ marginTop: 6 }}>
            <button className="sp-ask" onClick={() => setMinted(null)}>
              I stored it -- dismiss
            </button>
          </div>
        </div>
      )}

      <div className="sec-hdr">
        <div className="sec-title">SCIM tenants</div>
        <div className="sec-sub">per-client provisioning tokens -- /scim/v2</div>
      </div>
      {tenants.loading ? (
        <ConsoleLoading label="SCIM tenants" />
      ) : tenants.error ? (
        <ConsoleError error={tenants.error} onRetry={tenants.retry} />
      ) : !tenants.data || tenants.data.tenants.length === 0 ? (
        <div className="scaf-note" style={{ marginBottom: 10 }}>
          No SCIM connections yet -- mint the first token below and configure it in the client's
          IdP.
        </div>
      ) : (
        <div className="ctable" style={{ maxWidth: 860, marginBottom: 10 }}>
          <div className="ct-head" style={{ gridTemplateColumns: '70px 1.3fr 90px 96px 220px' }}>
            <div>Org</div><div>Label</div><div>State</div><div>Created</div><div></div>
          </div>
          {tenants.data.tenants.map((t) => (
            <div key={t.id} className="ct-row" style={{ gridTemplateColumns: '70px 1.3fr 90px 96px 220px' }}>
              <div className="mono" style={{ fontVariantNumeric: 'tabular-nums' }}>{t.organizationId}</div>
              <div className="ct-strong">{t.label || '--'}</div>
              <div><span className={`rd-chip tone-${t.enabled ? 'ok' : 'idle'}`}>{t.enabled ? 'enabled' : 'disabled'}</span></div>
              <div><When iso={t.createdAt} /></div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="sp-ask" onClick={() => void rotateTenant(t)}>Rotate token</button>
                <button className="sp-ask" onClick={() => void toggleTenant(t)}>
                  {t.enabled ? 'Disable' : 'Enable'}
                </button>
                <button
                  className="sp-ask"
                  style={{ color: 'var(--error)', borderColor: 'var(--error)' }}
                  onClick={() => void deleteTenant(t)}
                >
                  Revoke
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="ac-grant-form" style={{ maxWidth: 860, marginBottom: 20 }}>
        <input
          className="ob-in"
          style={{ margin: 0, width: 120, flex: '0 0 120px' }}
          placeholder="Org id"
          inputMode="numeric"
          value={tForm.orgId}
          onChange={(e) => setTForm({ ...tForm, orgId: e.target.value })}
        />
        <input
          className="ob-in"
          style={{ margin: 0, flex: 1 }}
          placeholder="Label (e.g. Okta -- Bright Biosciences)"
          value={tForm.label}
          onChange={(e) => setTForm({ ...tForm, label: e.target.value })}
        />
        <button className="sp-primary" style={{ padding: '8px 14px' }} disabled={busy} onClick={() => void createTenant()}>
          {I.plus} Mint SCIM token
        </button>
      </div>

      <div className="sec-hdr">
        <div className="sec-title">SCIM IP allowlist</div>
        <div className="sec-sub">restrict /scim/v2 to IdP egress ranges</div>
      </div>
      {rules.loading ? (
        <ConsoleLoading label="IP rules" />
      ) : rules.error ? (
        <ConsoleError error={rules.error} onRetry={rules.retry} />
      ) : !rules.data || rules.data.rules.length === 0 ? (
        <div className="scaf-note" style={{ marginBottom: 10 }}>
          No IP rules -- SCIM accepts any source address. Add the IdP's egress CIDRs to lock it
          down.
        </div>
      ) : (
        <div className="ctable" style={{ maxWidth: 860, marginBottom: 10 }}>
          <div className="ct-head" style={{ gridTemplateColumns: '70px 1fr 1fr 90px 150px' }}>
            <div>Org</div><div>CIDR</div><div>Label</div><div>State</div><div></div>
          </div>
          {rules.data.rules.map((rule) => (
            <div key={rule.id} className="ct-row" style={{ gridTemplateColumns: '70px 1fr 1fr 90px 150px' }}>
              <div className="mono" style={{ fontVariantNumeric: 'tabular-nums' }}>{rule.organizationId}</div>
              <div className="mono" style={{ fontSize: 11.5 }}>{rule.cidr}</div>
              <div style={{ color: 'var(--text-400)' }}>{rule.label || '--'}</div>
              <div><span className={`rd-chip tone-${rule.enabled ? 'ok' : 'idle'}`}>{rule.enabled ? 'enabled' : 'disabled'}</span></div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="sp-ask" onClick={() => void toggleRule(rule)}>
                  {rule.enabled ? 'Disable' : 'Enable'}
                </button>
                <button
                  className="sp-ask"
                  style={{ color: 'var(--error)', borderColor: 'var(--error)' }}
                  onClick={() => void deleteRule(rule)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="ac-grant-form" style={{ maxWidth: 860 }}>
        <input
          className="ob-in"
          style={{ margin: 0, width: 120, flex: '0 0 120px' }}
          placeholder="Org id"
          inputMode="numeric"
          value={rForm.orgId}
          onChange={(e) => setRForm({ ...rForm, orgId: e.target.value })}
        />
        <input
          className="ob-in"
          style={{ margin: 0, flex: 1 }}
          placeholder="CIDR (e.g. 203.0.113.0/24)"
          value={rForm.cidr}
          onChange={(e) => setRForm({ ...rForm, cidr: e.target.value })}
        />
        <input
          className="ob-in"
          style={{ margin: 0, flex: 1 }}
          placeholder="Label (optional)"
          value={rForm.label}
          onChange={(e) => setRForm({ ...rForm, label: e.target.value })}
        />
        <button className="sp-primary" style={{ padding: '8px 14px' }} disabled={busy} onClick={() => void createRule()}>
          {I.plus} Add rule
        </button>
      </div>
    </div>
  );
}
