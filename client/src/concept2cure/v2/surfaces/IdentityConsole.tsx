/**
 * Enterprise Identity Console — SSO (SAML) + SCIM provisioning administration.
 *
 * Registry id: `identity-console`.
 *
 * Wired to the real enterprise-identity backends:
 *   • SCIM provisioning tokens (server/routes/admin/scim-tenants.ts, mounted
 *     /api/admin/scim-tenants, super_admin/platform_admin only):
 *       GET    /              — { tenants: [...] } (hashes never returned)
 *       POST   /              — create; the plaintext bearer token is returned
 *                               ONCE (§11.10(d): only its SHA-256 is stored)
 *       POST   /:id/rotate    — rotate; new token returned once
 *       PATCH  /:id           — enable/disable
 *       DELETE /:id           — revoke (204)
 *   • SCIM IP allowlist (server/routes/admin/scim-ip-allowlist.ts, mounted
 *     /api/admin/scim-ip-allowlist): GET { rules } / POST / PATCH / DELETE.
 *   • SSO (server/routes/sso.ts, mounted /api/auth/sso): the SAML endpoints an
 *     IdP administrator needs — metadata, initiate, callback, logout — shown as
 *     copyable references to the REAL mounted routes. Provider settings are
 *     server-configured; this console does not pretend to edit them.
 *
 * HONESTY: lists render live data, an honest empty, or an honest error (403 is
 * surfaced as "requires a platform administrator"). The one-time token is shown
 * exactly once from the server's response and never persisted client-side.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { EmptyState } from '../dataConnect';
import { usePublishSurfaceContext } from '../surfaceContext';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import { apiRequest, ApiRequestError } from '@/lib/queryClient';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';

interface ScimTenant { id: number; organizationId: number; label: string | null; enabled: boolean; createdAt?: string; updatedAt?: string; }
interface ScimRule { id: number; organizationId: number; cidr: string; label: string | null; enabled: boolean; }

interface RawResult<T> { ok: boolean; status: number; body: T | null; message: string | null }
type ReadState = 'loading' | 'ready' | 'forbidden' | 'error';

/** Never throws. `apiRequest` THROWS on a non-2xx (other than 401), so the
 *  status and the server's sentence are read off the ApiRequestError. This
 *  used to catch it bare and report every refusal as status 0: the 403 branch
 *  below could never run, a refused directory read "didn't respond", and a
 *  refused write toasted "HTTP 0" (launch sweep findings 20 and 114). */
async function rawJson<T = any>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<RawResult<T>> {
  try {
    const res = await apiRequest(method, path, body);
    if (res.status === 204) return { ok: true, status: 204, body: null, message: null };
    const parsed = (await res.json().catch(() => null)) as T | null;
    return { ok: res.ok, status: res.status, body: parsed, message: null };
  } catch (e) {
    if (e instanceof ApiRequestError) return { ok: false, status: e.status, body: null, message: e.message || null };
    return { ok: false, status: 0, body: null, message: null };
  }
}

const refused = (r: RawResult<unknown>) => r.status === 401 || r.status === 403;
const readStateOf = (r: RawResult<unknown>): ReadState => (refused(r) ? 'forbidden' : r.ok ? 'ready' : 'error');

/** A failed write, said as what the server answered: its refusal in its own
 *  words, no response as no response — never "HTTP 0". */
function failText(r: RawResult<unknown>, verb: string): string {
  if (r.status === 0) return `Couldn’t ${verb} — the server didn’t respond. Try again.`;
  if (refused(r)) return `Couldn’t ${verb} — this account is not a platform administrator.`;
  return r.message ? `Couldn’t ${verb}: ${r.message}` : `Couldn’t ${verb} (HTTP ${r.status}).`;
}

const TOKEN_FORM: C2CFormConfig = {
  eyebrow: 'SCIM provisioning',
  title: 'Issue SCIM bearer token',
  sub: 'The token is generated server-side and shown ONCE — configure your IdP with it immediately. Only its SHA-256 hash is stored (§11.10(d)).',
  governed: true, submitLabel: 'Issue token',
  fields: [
    { key: 'organizationId', label: 'Organization id', type: 'number', required: true, half: true },
    { key: 'label', label: 'Label', type: 'text', half: true, placeholder: 'e.g. Okta production' },
  ],
};
const RULE_FORM: C2CFormConfig = {
  eyebrow: 'SCIM provisioning',
  title: 'Add IP allowlist rule',
  sub: 'Only these source addresses may call the SCIM endpoint for the organization.',
  governed: true, submitLabel: 'Add rule',
  fields: [
    { key: 'organizationId', label: 'Organization id', type: 'number', required: true, half: true },
    { key: 'cidr', label: 'CIDR / address', type: 'text', required: true, half: true, placeholder: 'e.g. 203.0.113.0/24' },
    { key: 'label', label: 'Label', type: 'text', placeholder: 'e.g. Okta egress range' },
  ],
};

/** The real mounted SAML endpoints an IdP admin configures against. */
const SSO_ENDPOINTS: Array<[string, string]> = [
  ['SP metadata (give this to your IdP)', '/api/auth/sso/saml/metadata'],
  ['Login initiate (SP-initiated)', '/api/auth/sso/saml/initiate'],
  ['Assertion consumer (ACS callback)', '/api/auth/sso/saml/callback'],
  ['Single logout', '/api/auth/sso/saml/logout'],
];

export function IdentityConsole(_props: SurfaceViewProps) {
  const [tenants, setTenants] = useState<ScimTenant[]>([]);
  const [tenantState, setTenantState] = useState<ReadState>('loading');
  const [rules, setRules] = useState<ScimRule[]>([]);
  /* The allowlist read has its own state. It was never checked: a refused or
     failed read left `rules` at [] and the card said "No allowlist rules —
     the allowlist is not enforced", a statement about the organisation's
     network access posture made from a read that never succeeded (findings
     18 and 110). */
  const [ruleState, setRuleState] = useState<ReadState>('loading');
  const [dialog, setDialog] = useState<'token' | 'rule' | null>(null);
  // One-time secrets, shown exactly once from the server response.
  const [revealed, setRevealed] = useState<{ id: number; token: string } | null>(null);
  const [toast, fireToast] = useToast();

  const load = useCallback(async () => {
    setTenantState('loading');
    setRuleState('loading');
    const [t, r] = await Promise.all([
      rawJson<{ tenants?: ScimTenant[] }>('GET', '/api/admin/scim-tenants'),
      rawJson<{ rules?: ScimRule[] }>('GET', '/api/admin/scim-ip-allowlist'),
    ]);
    /* A 2xx whose body is not the list is a read that did not succeed. */
    const tState = readStateOf(t) === 'ready' && !Array.isArray(t.body?.tenants) ? 'error' : readStateOf(t);
    const rState = readStateOf(r) === 'ready' && !Array.isArray(r.body?.rules) ? 'error' : readStateOf(r);
    setTenants(tState === 'ready' ? t.body!.tenants! : []);
    setRules(rState === 'ready' ? r.body!.rules! : []);
    setRuleState(rState);
    setTenantState(tState);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const issueToken = useCallback(async (v: Record<string, string>) => {
    const issued = await rawJson<ScimTenant & { token?: string }>('POST', '/api/admin/scim-tenants', {
      organizationId: Number(v.organizationId), label: v.label || undefined,
    });
    const { ok, status, body } = issued;
    if (!ok || !body?.token) { fireToast(status === 400 ? 'Couldn’t issue — organizationId (integer) is required.' : failText(issued, 'issue the token'), 'error'); return; }
    setDialog(null);
    setRevealed({ id: body.id, token: body.token });
    fireToast('SCIM token issued — copy it now; it will not be shown again.');
    void load();
  }, [load, fireToast]);

  const rotate = useCallback(async (id: number) => {
    const rotated = await rawJson<ScimTenant & { token?: string }>('POST', `/api/admin/scim-tenants/${id}/rotate`);
    const { ok, body } = rotated;
    if (!ok || !body?.token) { fireToast(failText(rotated, 'rotate the token'), 'error'); return; }
    setRevealed({ id, token: body.token });
    fireToast('Token rotated — the previous token is now invalid. Copy the new one now.');
    void load();
  }, [load, fireToast]);

  const toggleTenant = useCallback(async (t: ScimTenant) => {
    const updated = await rawJson('PATCH', `/api/admin/scim-tenants/${t.id}`, { enabled: !t.enabled });
    if (!updated.ok) { fireToast(failText(updated, 'update the token'), 'error'); return; }
    fireToast((t.enabled ? 'Disabled' : 'Enabled') + ' SCIM tenant #' + t.id + '.');
    void load();
  }, [load, fireToast]);

  const revoke = useCallback(async (id: number) => {
    const revoked = await rawJson('DELETE', `/api/admin/scim-tenants/${id}`);
    if (!revoked.ok) { fireToast(failText(revoked, 'revoke the token'), 'error'); return; }
    fireToast('SCIM tenant #' + id + ' revoked.');
    if (revealed?.id === id) setRevealed(null);
    void load();
  }, [load, revealed, fireToast]);

  const addRule = useCallback(async (v: Record<string, string>) => {
    const added = await rawJson<ScimRule>('POST', '/api/admin/scim-ip-allowlist', {
      organizationId: Number(v.organizationId), cidr: v.cidr, label: v.label || undefined,
    });
    const { ok, status, body } = added;
    if (!ok || !body?.id) { fireToast(status === 400 ? 'Couldn’t add — a valid organizationId and CIDR are required.' : failText(added, 'add the rule'), 'error'); return; }
    setDialog(null);
    fireToast('Allowlist rule added · ' + body.cidr);
    void load();
  }, [load, fireToast]);

  const copy = useCallback((text: string, what: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => fireToast(what + ' copied to the clipboard.'),
      () => fireToast('Couldn’t copy — select and copy manually.', 'error'),
    );
  }, [fireToast]);

  /* WHAT ANA SEES HERE. Above the forbidden early return — this is a hook, and
     a hook below a conditional return runs on some renders and not others.
     Counts and access state only: never the revealed token (a live SCIM bearer
     credential — §11.10(d) keeps only its hash server-side), never rule CIDRs,
     organization ids or tenant labels. Zero allowlist rules is published as
     the count, not as "unrestricted". */
  const anaContext = useMemo(() => {
    if (tenantState === 'loading') {
      return { summary: 'Enterprise identity is still loading; nothing on screen is final yet.', facts: { access: 'loading' } };
    }
    if (tenantState === 'forbidden') {
      return {
        summary:
          'This account cannot administer enterprise identity — the SCIM token and allowlist directory requires the super_admin or platform_admin role, so nothing is listed.',
        facts: { access: 'forbidden' },
      };
    }
    if (tenantState === 'error') {
      return {
        summary:
          'The SCIM tenant directory could not be read — a failed read, not an organization with no SCIM configuration.',
        facts: { access: 'error' },
      };
    }
    return {
      summary:
        `Enterprise identity: ${tenants.length} SCIM token(s) (${tenants.filter((t) => t.enabled).length} enabled), ` +
        (ruleState === 'ready' ? `${rules.length} allowlist rule(s)` : 'the IP allowlist could not be read (its rules are unknown, not absent)') +
        ', and the four SAML endpoints (metadata, initiate, callback, logout) listed.',
      facts: {
        access: tenantState,
        scimTenantCount: tenants.length,
        scimTenantsEnabled: tenants.filter((t) => t.enabled).length,
        allowlistRuleCount: ruleState === 'ready' ? rules.length : null,
        aTokenWasJustRevealed: revealed !== null,
      },
      availableActions: [
        'Issuing, rotating, disabling and revoking SCIM tokens and allowlist rules are platform-administrator acts performed on this screen',
      ],
    };
  }, [tenantState, ruleState, tenants, rules, revealed]);
  usePublishSurfaceContext('identity-console', anaContext);

  if (tenantState === 'forbidden') {
    return (
      <div className="cm-body" style={{ padding: 24 }}>
        <EmptyState icon={I.lock} title="Platform administrator required"
          hint="SCIM token and allowlist administration requires the super_admin or platform_admin role. Sign in with a platform-administrator account to manage enterprise identity." />
      </div>
    );
  }

  return (
    <div className="cm-body">
      {/* One-time token reveal */}
      {revealed && (
        <div className="pj-con" style={{ margin: '0 0 14px' }}>
          <span className="ico">{I.lock}</span>
          <div style={{ minWidth: 0 }}>
            <div className="pj-con-t">SCIM bearer token for tenant #{revealed.id} — shown once, only its hash is stored</div>
            <div className="pj-con-d mono" style={{ wordBreak: 'break-all' }}>{revealed.token}</div>
            <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
              <button className="nda-open" onClick={() => copy(revealed.token, 'Token')}>{I.check} Copy token</button>
              <button className="nda-open" onClick={() => setRevealed(null)}>Dismiss</button>
            </div>
          </div>
        </div>
      )}

      {/* SCIM provisioning tokens */}
      <div className="pj-card">
        <div className="pj-card-h">
          <span className="t">SCIM provisioning tokens</span>
          {tenantState === 'ready' && <button className="nda-open" onClick={() => setDialog('token')}>{I.plus} Issue token</button>}
        </div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          {tenantState === 'loading' ? <div style={{ padding: 16 }}><EmptyState icon={I.lock} title="Loading SCIM tenants…" /></div>
            : tenantState === 'error' ? <div style={{ padding: 16 }}><EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load SCIM tenants" hint="The SCIM tenant directory couldn’t be read, so no tokens are shown. This is not an empty directory." retry={() => void load()} /></div>
            : tenants.length === 0 ? <div style={{ padding: 16 }}><EmptyState icon={I.lock} title="No SCIM tokens issued" hint="Issue a bearer token and configure your identity provider (Okta, Entra, OneLogin) to provision users against /scim/v2." /></div>
            : <table className="reg-tbl"><thead><tr><th>Id</th><th>Organization</th><th>Label</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>{tenants.map((t) => (
                <tr key={t.id}>
                  <td className="mono">#{t.id}</td><td className="mono">{t.organizationId}</td><td>{t.label ?? '—'}</td>
                  <td><span className={'rd-chip tone-' + (t.enabled ? 'ok' : 'dim')}>{t.enabled ? 'enabled' : 'disabled'}</span></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="nda-open" onClick={() => rotate(t.id)}>{I.zap} Rotate</button>
                    <button className="nda-open" style={{ marginLeft: 6 }} onClick={() => toggleTenant(t)}>{t.enabled ? 'Disable' : 'Enable'}</button>
                    <button className="nda-open" style={{ marginLeft: 6 }} onClick={() => revoke(t.id)}>{I.alertTriangle} Revoke</button>
                  </td>
                </tr>))}</tbody></table>}
        </div>
      </div>

      {/* SCIM IP allowlist */}
      <div className="pj-card">
        <div className="pj-card-h">
          <span className="t">SCIM IP allowlist</span>
          {ruleState === 'ready' && <button className="nda-open" onClick={() => setDialog('rule')}>{I.plus} Add rule</button>}
        </div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          {ruleState === 'loading' ? <div style={{ padding: 16 }}><EmptyState busy icon={I.layers} title="Loading the allowlist…" /></div>
            : ruleState === 'forbidden' ? <div style={{ padding: 16 }}><EmptyState icon={I.lock} title="You don’t have access to the allowlist" hint="Its rules could not be read with this account, so nothing is said here about whether the allowlist is enforced." /></div>
            : ruleState === 'error' ? <div style={{ padding: 16 }}><EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load the allowlist" hint="The rules could not be read, so nothing is said here about whether the allowlist is enforced." retry={() => void load()} /></div>
            : rules.length === 0 ? <div style={{ padding: 16 }}><EmptyState icon={I.layers} title="No allowlist rules" hint="Restrict SCIM provisioning to your IdP’s egress addresses. With no rules, the allowlist is not enforced." /></div>
            : <table className="reg-tbl"><thead><tr><th>Id</th><th>Organization</th><th>CIDR</th><th>Label</th><th style={{ textAlign: 'right' }}>Status</th></tr></thead>
              <tbody>{rules.map((r) => (
                <tr key={r.id}>
                  <td className="mono">#{r.id}</td><td className="mono">{r.organizationId}</td><td className="mono">{r.cidr}</td><td>{r.label ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}><span className={'rd-chip tone-' + (r.enabled ? 'ok' : 'dim')}>{r.enabled ? 'enabled' : 'disabled'}</span></td>
                </tr>))}</tbody></table>}
        </div>
      </div>

      {/* SSO endpoints */}
      <div className="pj-card">
        <div className="pj-card-h"><span className="t">SSO — SAML endpoints</span></div>
        <div className="pj-card-b">
          <div style={{ fontSize: 13, color: 'var(--text-400)', marginBottom: 10 }}>
            These are the platform’s live SAML endpoints. Configure your identity provider against them; provider
            certificates and issuer settings are configured server-side by your deployment administrator.
          </div>
          <table className="reg-tbl"><tbody>
            {SSO_ENDPOINTS.map(([label, path]) => (
              <tr key={path}>
                <td>{label}</td>
                <td className="mono" style={{ fontSize: 12 }}>{path}</td>
                <td style={{ textAlign: 'right' }}><button className="nda-open" onClick={() => copy(window.location.origin + path, label)}>{I.check} Copy URL</button></td>
              </tr>
            ))}
          </tbody></table>
        </div>
      </div>

      {dialog === 'token' && <C2CForm config={TOKEN_FORM} onCancel={() => setDialog(null)} onSubmit={issueToken} />}
      {dialog === 'rule' && <C2CForm config={RULE_FORM} onCancel={() => setDialog(null)} onSubmit={addRule} />}
      <C2CToast msg={toast} />
    </div>
  );
}
