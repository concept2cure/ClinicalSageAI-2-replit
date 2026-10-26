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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
interface RuleChange { rule: ScimRule; action: 'toggle' | 'delete' }
interface TokenChange { tenant: ScimTenant; action: 'rotate' | 'toggle' | 'delete' }

function ruleChangeFormFor(change: RuleChange | null): C2CFormConfig | null {
  if (!change) return null;
  const act = change.action === 'delete' ? 'Delete' : change.rule.enabled ? 'Disable' : 'Enable';
  return {
    eyebrow: 'SCIM provisioning · IP allowlist', title: `${act} allowlist rule ${change.rule.cidr}?`,
    governed: 'This changes which source addresses may provision users for the rule’s organization. If no enabled rules remain for an organization, any source address with a valid SCIM token may provision users. Deleting a rule removes it permanently.',
    submitLabel: `${act} rule`, fields: [{ key: 'reason', label: 'Reason for the allowlist change', type: 'textarea', required: true, rows: 3, desc: '3–500 characters, recorded with the policy change.' }],
  };
}

function tokenChangeFormFor(change: TokenChange | null, busy: boolean): C2CFormConfig | null {
  if (!change) return null;
  const action = change.action === 'rotate' ? 'Rotate' : change.action === 'delete' ? 'Revoke' : change.tenant.enabled ? 'Disable' : 'Enable';
  return {
    eyebrow: 'SCIM provisioning', title: `${action} SCIM token #${change.tenant.id}?`,
    governed: change.action === 'rotate'
      ? 'Rotation invalidates the previous token immediately. Update your identity provider with the new token, which is shown once after the change is recorded.'
      : change.action === 'delete' ? 'Revocation permanently removes this provisioning credential. The identity provider will need a new token to provision users.'
        : 'This changes whether the identity provider can provision users with this credential. Existing user memberships are not changed.',
    submitLabel: `${action} token`, busy: busy ? 'Recording the token change…' : undefined,
    fields: [{ key: 'reason', label: 'Reason for the token change', type: 'textarea', required: true, rows: 3, desc: '3–500 characters, recorded with the credential change. Do not include credentials.' }],
  };
}

interface RawResult<T> { ok: boolean; status: number; body: T | null; message: string | null; auditConfirmed?: boolean }
type ReadState = 'loading' | 'ready' | 'forbidden' | 'error';

/** Never throws. `apiRequest` THROWS on a non-2xx (other than 401), so the
 *  status and the server's sentence are read off the ApiRequestError. This
 *  used to catch it bare and report every refusal as status 0: the 403 branch
 *  below could never run, a refused directory read "didn't respond", and a
 *  refused write toasted "HTTP 0" (launch sweep findings 20 and 114). */
async function rawJson<T = any>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<RawResult<T>> {
  try {
    const res = await apiRequest(method, path, body);
    if (res.status === 204) return { ok: true, status: 204, body: null, message: null, auditConfirmed: res.headers?.get('X-Audit-Row-Persisted') === 'true' && res.headers?.get('X-Audit-Row-Chained') === 'true' };
    const parsed = (await res.json().catch(() => null)) as T | null;
    return { ok: res.ok, status: res.status, body: parsed, message: null };
  } catch (e) {
    if (e instanceof ApiRequestError) return { ok: false, status: e.status, body: (e.payload ?? null) as T | null, message: e.message || null };
    return { ok: false, status: 0, body: null, message: null };
  }
}

function tokenAuditConfirmed(body: unknown) {
  const audit = (body as { auditTrail?: { persisted?: boolean; chained?: boolean } } | null)?.auditTrail;
  return audit?.persisted === true && audit.chained === true;
}

function tokenChangeConfirmed(result: RawResult<ScimTenant & { token?: string }>, change: TokenChange) {
  if (change.action === 'delete') return result.status === 204 && result.auditConfirmed === true;
  const body = result.body;
  if (!tokenAuditConfirmed(body) || body?.id !== change.tenant.id || body.organizationId !== change.tenant.organizationId) return false;
  return change.action === 'rotate' ? typeof body.token === 'string' && body.token.startsWith('scim_') : body.enabled === !change.tenant.enabled;
}

const refused = (r: RawResult<unknown>) => r.status === 401 || r.status === 403;
const readStateOf = (r: RawResult<unknown>): ReadState => (refused(r) ? 'forbidden' : r.ok ? 'ready' : 'error');

/** A failed write, said as what the server answered: its refusal in its own
 *  words, no response as no response — never "HTTP 0". */
function failText(r: RawResult<unknown>, verb: string): string {
  if (r.status === 0) return `Couldn’t ${verb} — the response could not be confirmed. Reload the list before trying again.`;
  if (refused(r)) return `Couldn’t ${verb} — this account is not a platform administrator.`;
  return r.message ? `Couldn’t ${verb}: ${r.message}` : `Couldn’t ${verb} (HTTP ${r.status}).`;
}

function validPolicyReason(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length >= 3 && value.trim().length <= 500;
}
function policyReadbackRequired(result: RawResult<unknown>): boolean {
  return result.status === 0 || (result.body as { code?: unknown } | null)?.code === 'SCIM_POLICY_COMMIT_UNCONFIRMED';
}

const TOKEN_FORM: C2CFormConfig = {
  eyebrow: 'SCIM provisioning',
  title: 'Issue SCIM bearer token',
  sub: 'The token is generated server-side and shown ONCE — configure your IdP with it immediately. Only its SHA-256 hash is stored (§11.10(d)).',
  governed: true, submitLabel: 'Issue token',
  fields: [
    { key: 'organizationId', label: 'Organization id', type: 'number', required: true, half: true },
    { key: 'label', label: 'Label', type: 'text', half: true, placeholder: 'e.g. Okta production' },
    { key: 'reason', label: 'Reason for the token change', type: 'textarea', required: true, rows: 3, desc: '3–500 characters; do not include credentials.' },
  ],
};
function TokenForms({ issueOpen, changeForm, busy, onCancel, onIssue, onChange }: {
  issueOpen: boolean; changeForm: C2CFormConfig | null; busy: boolean; onCancel: () => void;
  onIssue: (values: Record<string, string>) => Promise<void>;
  onChange: (values: Record<string, string>) => Promise<void>;
}) {
  return <>
    {issueOpen && <C2CForm config={{ ...TOKEN_FORM, busy: busy ? 'Recording the token change…' : undefined }} onCancel={onCancel} onSubmit={onIssue} />}
    {changeForm && <C2CForm config={changeForm} onCancel={onCancel} onSubmit={onChange} />}
  </>;
}

const RULE_FORM: C2CFormConfig = {
  eyebrow: 'SCIM provisioning',
  title: 'Add IP allowlist rule',
  sub: 'Only these source addresses may call the SCIM endpoint for the organization.',
  governed: true, submitLabel: 'Add rule',
  fields: [
    { key: 'organizationId', label: 'Organization id', type: 'number', required: true, half: true },
    { key: 'cidr', label: 'CIDR / address', type: 'text', required: true, half: true, placeholder: 'e.g. 203.0.113.0/24' },
    { key: 'label', label: 'Label', type: 'text', placeholder: 'e.g. Okta egress range' },
    { key: 'reason', label: 'Reason for the allowlist change', type: 'textarea', required: true, rows: 3, desc: '3–500 characters, recorded with the policy change.' },
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
  const [ruleChange, setRuleChange] = useState<RuleChange | null>(null);
  const changingRule = useRef(false);
  const [tokenChange, setTokenChange] = useState<TokenChange | null>(null);
  const [tokenBusy, setTokenBusy] = useState(false);
  const changingToken = useRef(false);
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

  const tokenFailure = async (result: RawResult<unknown>, verb: string) => {
    fireToast(result.ok ? 'The token change was not confirmed. Review the directory before trying again; a new secret may need to be replaced.' : failText(result, verb), 'error');
    if (result.status === 0 || result.ok || (result.body as { code?: string } | null)?.code === 'SCIM_TOKEN_COMMIT_UNCONFIRMED') {
      setDialog(null); setTokenChange(null); setRevealed(null);
      await load();
    }
  };

  const issueToken = async (v: Record<string, string>) => {
    if (changingToken.current) return;
    if (!validPolicyReason(v.reason)) { fireToast('Give a reason for change between 3 and 500 characters.', 'error'); return; }
    changingToken.current = true; setTokenBusy(true);
    try {
      const issued = await rawJson<ScimTenant & { token?: string }>('POST', '/api/admin/scim-tenants', {
        organizationId: Number(v.organizationId), label: v.label || undefined, reason: v.reason.trim(),
      });
      const body = issued.body;
      if (!issued.ok || !tokenAuditConfirmed(body) || typeof body?.token !== 'string' || !body.token.startsWith('scim_') || !Number.isSafeInteger(body.id) || body.id < 1 || body.organizationId !== Number(v.organizationId)) {
        await tokenFailure(issued, 'confirm the issued token'); return;
      }
      setDialog(null); setRevealed({ id: body.id, token: body.token });
      fireToast('SCIM token issued — copy it now; it will not be shown again.');
      await load();
    } finally { changingToken.current = false; setTokenBusy(false); }
  };

  const changeToken = async (values: Record<string, string>) => {
    if (!tokenChange || changingToken.current) return;
    if (!validPolicyReason(values.reason)) { fireToast('Give a reason for change between 3 and 500 characters.', 'error'); return; }
    changingToken.current = true; setTokenBusy(true);
    const { tenant, action } = tokenChange;
    try {
      const result = await rawJson<ScimTenant & { token?: string }>(
        action === 'delete' ? 'DELETE' : action === 'rotate' ? 'POST' : 'PATCH',
        `/api/admin/scim-tenants/${tenant.id}${action === 'rotate' ? '/rotate' : ''}`,
        { reason: values.reason.trim(), ...(action === 'toggle' ? { enabled: !tenant.enabled } : {}) },
      );
      const body = result.body;
      const confirmed = tokenChangeConfirmed(result, tokenChange);
      if (!result.ok || !confirmed) { await tokenFailure(result, 'confirm the token change'); return; }
      setTokenChange(null);
      if (action === 'rotate') {
        setRevealed({ id: tenant.id, token: body!.token! });
        fireToast('Token rotated — the previous token is now invalid. Copy the new one now.');
      } else {
        if (revealed?.id === tenant.id) setRevealed(null);
        fireToast(action === 'delete' ? 'SCIM token revoked.' : `SCIM token ${tenant.enabled ? 'disabled' : 'enabled'}.`);
      }
      await load();
    } finally { changingToken.current = false; setTokenBusy(false); }
  };
  const tokenChangeForm = tokenChangeFormFor(tokenChange, tokenBusy);

  const addRule = useCallback(async (v: Record<string, string>) => {
    if (!validPolicyReason(v.reason)) { fireToast('Give a reason for change between 3 and 500 characters.', 'error'); return; }
    const added = await rawJson<ScimRule>('POST', '/api/admin/scim-ip-allowlist', {
      organizationId: Number(v.organizationId), cidr: v.cidr, label: v.label || undefined, reason: v.reason,
    });
    const { ok, body } = added;
    if (!ok || !body?.id) {
      fireToast(failText(added, 'add the rule'), 'error');
      if (policyReadbackRequired(added) || ok) { setDialog(null); await load(); }
      return;
    }
    setDialog(null);
    fireToast('Allowlist rule added · ' + body.cidr);
    void load();
  }, [load, fireToast]);

  const changeRule = async (values: Record<string, string>) => {
    if (!ruleChange || changingRule.current) return;
    if (!validPolicyReason(values.reason)) { fireToast('Give a reason for change between 3 and 500 characters.', 'error'); return; }
    changingRule.current = true;
    const { rule, action } = ruleChange;
    try {
      const result = action === 'delete'
        ? await rawJson('DELETE', `/api/admin/scim-ip-allowlist/${rule.id}`, { reason: values.reason.trim() })
        : await rawJson<ScimRule>('PATCH', `/api/admin/scim-ip-allowlist/${rule.id}`, { enabled: !rule.enabled, reason: values.reason.trim() });
      if (!result.ok) {
        fireToast(failText(result, action === 'delete' ? 'delete the allowlist rule' : 'change the allowlist rule'), 'error');
        if (policyReadbackRequired(result)) { setRuleChange(null); await load(); }
        return;
      }
      const body = result.body as ScimRule | null;
      const confirmed = action === 'delete' ? result.status === 204 : body?.id === rule.id && body.enabled === !rule.enabled;
      if (!confirmed) {
        fireToast('The allowlist change was not confirmed by the response. Reload the list before retrying.', 'error');
        setRuleChange(null); await load();
        return;
      }
      setRuleChange(null);
      fireToast(action === 'delete' ? 'Allowlist rule deleted.' : `Allowlist rule ${rule.enabled ? 'disabled' : 'enabled'}.`);
      void load();
    } finally { changingRule.current = false; }
  };
  const ruleChangeForm = ruleChangeFormFor(ruleChange);

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
          {tenantState === 'ready' && <button className="nda-open" disabled={tokenBusy} onClick={() => setDialog('token')}>{I.plus} Issue token</button>}
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
                    <button className="nda-open" disabled={tokenBusy} onClick={() => setTokenChange({ tenant: t, action: 'rotate' })}>{I.zap} Rotate</button>
                    <button className="nda-open" style={{ marginLeft: 6 }} disabled={tokenBusy} onClick={() => setTokenChange({ tenant: t, action: 'toggle' })}>{t.enabled ? 'Disable' : 'Enable'}</button>
                    <button className="nda-open" style={{ marginLeft: 6 }} disabled={tokenBusy} onClick={() => setTokenChange({ tenant: t, action: 'delete' })}>{I.alertTriangle} Revoke</button>
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
            : <table className="reg-tbl"><thead><tr><th>Id</th><th>Organization</th><th>CIDR</th><th>Label</th><th style={{ textAlign: 'right' }}>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>{rules.map((r) => (
                <tr key={r.id}>
                  <td className="mono">#{r.id}</td><td className="mono">{r.organizationId}</td><td className="mono">{r.cidr}</td><td>{r.label ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}><span className={'rd-chip tone-' + (r.enabled ? 'ok' : 'dim')}>{r.enabled ? 'enabled' : 'disabled'}</span></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="nda-open" onClick={() => setRuleChange({ rule: r, action: 'toggle' })} aria-label={`${r.enabled ? 'Disable' : 'Enable'} SCIM rule ${r.cidr}`}>{r.enabled ? 'Disable' : 'Enable'}</button>
                    <button className="nda-open" style={{ marginLeft: 6 }} onClick={() => setRuleChange({ rule: r, action: 'delete' })} aria-label={`Delete SCIM rule ${r.cidr}`}>Delete</button>
                  </td>
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

      <TokenForms issueOpen={dialog === 'token'} changeForm={tokenChangeForm} busy={tokenBusy}
        onCancel={() => { if (!changingToken.current) { setDialog(null); setTokenChange(null); } }} onIssue={issueToken} onChange={changeToken} />
      {dialog === 'rule' && <C2CForm config={RULE_FORM} onCancel={() => setDialog(null)} onSubmit={addRule} />}
      {ruleChangeForm && <C2CForm config={ruleChangeForm} onCancel={() => { if (!changingRule.current) setRuleChange(null); }} onSubmit={(values) => void changeRule(values)} />}
      <C2CToast msg={toast} />
    </div>
  );
}
