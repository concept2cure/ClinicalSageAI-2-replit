/**
 * Admin and access → Settings, and the SSO tab's door to the Identity console.
 *
 * Setup folded into Admin and access (D2, 2026-10-29; founder direction: "most
 * 'app' into core functionality"; .design/client-journey/FUNCTION_PARITY.md,
 * "Into administration (`admin-console`) / From `setup`";
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-setup/). Each of Setup's governed
 * settings is its existing card, mounted here, with its own read and its own
 * governed write — nothing is re-implemented:
 *
 *   OrganizationProfileCard   name and client type, under one reason
 *   SessionPolicySetting      idle sign-out and concurrent sessions, under a reason
 *                             (it replaces the read-only "Session timeout" row
 *                             GET /api/mdx/admin used to serve)
 *   GatewayAccountsSetting    whose agency gateway account submissions go out under
 *   PdfARequirementSetting    whether production submissions must be PDF/A
 *   RetentionPeriodCard       the Vault's retention period
 *   LegalHoldsCard            list, place and lift legal holds
 *   ClaudeConnectorSetting    the connector for Claude (already here)
 *   CompanyDocumentSettings   company identity, letterhead and legal documents (already here)
 *   ValidationKitCard         the GAMP 5 validation package, each document as it records
 *                             itself, every download recorded (decision P-67)
 *
 * Above them, the rows GET /api/mdx/admin derives from the organisation's
 * record (the second factor at sign-in, single sign-on, branding) are shown as
 * they are. They are facts here; the cards are where settings change.
 */
import React, { useEffect, useRef, useState } from 'react';
import { apiRequest, ApiRequestError } from '@/lib/queryClient';
import { authService } from '@/services/portal/authService';
import { useAuthoringReadSession } from '../editor/authoringCurrentRead';
import { C2CForm, type C2CFormConfig, type C2CFormFieldControl } from '../C2CForm';
import { I } from '../icons';
import { EmptyState } from '../dataConnect';
import { ClaudeConnectorSetting } from './ClaudeConnectorSetting';
import { CompanyDocumentSettings } from './CompanyDocumentSettings';
import { GatewayAccountsSetting } from './GatewayAccountsSetting';
import { LegalHoldsCard } from './LegalHoldsCard';
import { OrganizationProfileCard, saveFailure, type OrganizationProfileContext } from './OrganizationProfileCard';
import { PdfARequirementSetting } from './PdfARequirementSetting';
import { RetentionPeriodCard } from './RetentionPeriodCard';
import { SessionPolicySetting } from '../onboarding/SessionPolicySetting';
import { ValidationKitCard } from './ValidationKitCard';
import '../styles/translation-v2.css';

/** A row of GET /api/mdx/admin's settings facet. `kind: 'policy'` is a fact about the deployment. */
export interface AdminSettingRow {
  id: string;
  label: string;
  value: string;
  kind?: string;
  desc: string;
}

/** The question the Settings tab hands AnA; AnA answers from admin-console's published context. */
export const SUMMARISE_CONFIGURATION = 'Summarize my org configuration';

interface CardsProps {
  onNav: (id: string) => void;
  /** What the Profile card lets AnA be told; null when it unmounts. */
  onProfileContext?: (context: OrganizationProfileContext | null) => void;
}

/** Every governed organisation setting, each its own card with its own read and write. */
export function OrganizationSettingsCards({ onNav, onProfileContext }: CardsProps) {
  return (
    <div className="txw-settings">
      <OrganizationProfileCard onContext={onProfileContext} />
      <SessionPolicySetting />
      {/* Agency gateway accounts: the platform's or the organisation's own, per
          gateway and environment (D7, founder decision 2026-10-01). */}
      <GatewayAccountsSetting />
      <ClientCredentialVaultCard />
      {/* PDF/A only where this organisation's procedures require it (D7, decided 2026-10-01). */}
      <PdfARequirementSetting />
      {/* Records retention (P1-22; ADR-0014 §6): its own route and its own chained audit row. */}
      <RetentionPeriodCard describeFailure={saveFailure} />
      <LegalHoldsCard describeFailure={saveFailure} />
      {/* Its own read and its own door, for the owner or an administrator (P1-47). */}
      <ClaudeConnectorSetting />
      <CompanyDocumentSettings onNav={onNav} />
      {/* The vendor's validation package, which a regulated customer files in their
          computer-system-validation record (decision P-67). */}
      <ValidationKitCard />
    </div>
  );
}

interface TabProps extends CardsProps {
  settings: AdminSettingRow[];
  /** The settings facet's read failed on the server (meta.unavailable). */
  settingsDown: boolean;
  onRetry: () => void;
  onAsk?: (text: string) => void;
}

/** The Settings tab: the record's rows as they are, then the governed cards. */
export function AdminSettingsTab({ settings, settingsDown, onRetry, onNav, onAsk, onProfileContext }: TabProps) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>Org settings</h2>
        <span className="section-sub">
          Each card below reads its setting and changes it under a reason, written to the audit trail.
        </span>
        {onAsk && (
          <button type="button" className="btn ghost small adm-key-create" onClick={() => onAsk(SUMMARISE_CONFIGURATION)}>
            {I.sparkles} Ask AnA to summarise this configuration
          </button>
        )}
      </div>
      {settingsDown && (
        <div className="adm-facet-error">
          <EmptyState
            tone="error"
            icon={I.alertTriangle}
            title="Couldn't load org settings"
            hint="The organization's settings could not be read, so single sign-on and branding are not shown. Each card below reads its own setting."
            retry={onRetry}
          />
        </div>
      )}
      {settings.length > 0 && (
        <div className="adm-settings">
          {/* Slice 0: each row sent AnA "Change setting …"; no AnA tool changes an
              organization setting, so a row shows the value and offers nothing. */}
          {settings.map((s) => (
            <div key={s.id} className="adm-setting adm-setting-fixed">
              <div>
                <div className="adm-setting-label">{s.label}</div>
                <div className="adm-setting-desc">{s.desc}</div>
              </div>
              <div className="adm-setting-val">
                <span>{s.value}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <OrganizationSettingsCards onNav={onNav} onProfileContext={onProfileContext} />
    </section>
  );
}

/** The SSO tab's door: SAML, SCIM tokens and the SCIM IP allowlist are governed in the Identity console. */
export function IdentityConsoleDoor({ onNav }: { onNav: (id: string) => void }) {
  return (
    <section className="section" aria-label="Identity console">
      <div className="section-head">
        <h2>Identity console</h2>
        <span className="section-sub">
          SAML endpoints, SCIM provisioning tokens and the SCIM IP allowlist are governed there, not here. A
          switch on this page would be a second copy of that state with nothing to reconcile it.
        </span>
        <button type="button" className="btn ghost small adm-key-create" onClick={() => onNav('identity-console')}>
          {I.lock} Open Identity console
        </button>
      </div>
    </section>
  );
}


interface CredentialField { name: string; label: string; secret: boolean; required: boolean; multiline?: boolean }
interface CredentialCard {
  id: string; name: string; kind: 'connector' | 'llm'; purpose: string;
  status: 'missing' | 'stored_unvalidated' | 'stored_not_connected' | 'expired' | 'revoked' | 'unavailable';
  fields: CredentialField[]; scopes: string[]; grantedScopes: string[];
  expiresAt: string | null; lastChangedAt: string | null; secretFieldsHeld: string[]; canManage: boolean;
}
interface CredentialCards { organizationId: number; canManage: boolean; credentialCards: CredentialCard[] }
type CredentialAction = 'capture' | 'rotate' | 'revoke';
const CREDENTIAL_PATH = '/api/deep-research/connectors';
const CREDENTIAL_IDS = new Set([
  'veeva_vault', 'llm_anthropic', 'llm_openai', 'llm_moonshot', 'clinical_trials_prs', 'fda_portal',
  'google_drive', 'box', 'onedrive', 'sharepoint', 'medidata_rave', 'fhir-r4', 'sam_exclusions', 'ellucian_banner',
]);
const CREDENTIAL_STATUSES: Record<CredentialCard['status'], string> = {
  missing: 'Not stored', stored_unvalidated: 'Stored · not validated', stored_not_connected: 'Stored · portal actions not connected', expired: 'Expired',
  revoked: 'Revoked', unavailable: 'Unavailable',
};
const SCOPE_LABELS: Record<string, string> = {
  connector_search: 'Search documents', connector_fetch: 'Read documents', connector_upload: 'Upload documents',
  model_inference: 'Use for model requests', embedding: 'Create embeddings', account_reference: 'Keep account reference only',
};

function validCredentialFields(card: CredentialCard): boolean {
  return Array.isArray(card.fields) && card.fields.every(f => typeof f.name === 'string' && typeof f.label === 'string'
    && typeof f.secret === 'boolean' && typeof f.required === 'boolean'
    && (f.multiline === undefined || typeof f.multiline === 'boolean') && (f.multiline !== true || f.secret));
}
function validCredentialCard(card: CredentialCard): boolean {
  return Boolean(card) && CREDENTIAL_IDS.has(card.id) && typeof card.name === 'string' && typeof card.purpose === 'string'
    && (card.kind === 'connector' || card.kind === 'llm') && Object.hasOwn(CREDENTIAL_STATUSES, card.status)
    && typeof card.canManage === 'boolean' && validCredentialFields(card) && validCredentialGrant(card);
}
function validCredentialGrant(card: CredentialCard): boolean {
  return Array.isArray(card.scopes) && card.scopes.every(x => Object.hasOwn(SCOPE_LABELS, x))
    && Array.isArray(card.grantedScopes) && card.grantedScopes.every(x => card.scopes.includes(x))
    && Array.isArray(card.secretFieldsHeld) && card.secretFieldsHeld.every(x => card.fields.some(f => f.name === x))
    && (card.expiresAt === null || typeof card.expiresAt === 'string')
    && (card.lastChangedAt === null || typeof card.lastChangedAt === 'string');
}
/** Only the metadata contract is admitted; saved values are never a field default. */
function credentialMetadata(value: unknown, organization: string): CredentialCards | null {
  const v = value as Partial<CredentialCards> | null;
  if (!v || String(v.organizationId) !== organization || typeof v.canManage !== 'boolean' || !Array.isArray(v.credentialCards)) return null;
  return v.credentialCards.every(validCredentialCard) ? v as CredentialCards : null;
}

export function credentialCaptureForm(card: CredentialCard, action: CredentialAction): C2CFormConfig {
  return {
    eyebrow: 'Client administration · credential vault',
    title: `${action === 'revoke' ? 'Revoke' : action === 'rotate' ? 'Replace' : 'Store'} ${card.name} credential`,
    sub: action === 'revoke' ? 'Stop use of this stored credential. The change is recorded without its value.'
      : 'Enter the credential here. Saved values cannot be read back. Storage does not validate a connection or qualify a model.',
    governed: true,
    submitLabel: action === 'revoke' ? 'Revoke credential' : 'Store credential',
    fields: [
      ...(action === 'revoke' ? [] : card.fields.map(f => ({
        key: `credential.${f.name}`, label: f.label, type: f.secret ? 'password' as const : 'text' as const,
        required: f.required, desc: f.secret ? 'Write-only. Never shown again.' : undefined,
      }))),
      ...(action === 'revoke' ? [] : card.scopes.map(scope => ({
        key: `scope.${scope}`, label: SCOPE_LABELS[scope], type: 'select' as const,
        default: card.grantedScopes.includes(scope) || (card.status === 'missing' && (scope === 'connector_search' || scope === 'model_inference' || card.scopes.length === 1)) ? 'yes' : 'no',
        options: [{ value: 'yes', label: 'Allow' }, { value: 'no', label: 'Do not allow' }],
      }))),
      ...(action === 'revoke' ? [] : [{ key: 'expiresAt', label: 'Expires on (UTC, optional)', type: 'date' as const }]),
      { key: 'reason', label: 'Reason for the change (recorded)', type: 'textarea', required: true, placeholder: 'At least 10 characters. Do not include credentials.' },
      { key: 'reauthPassword', label: 'Your password (re-authentication)', type: 'password', required: true },
      { key: 'reauthTotp', label: 'Authentication code (if enabled)', type: 'password' },
    ],
  };
}

/** No response text or arbitrary exception can reflect a submitted credential. */
function credentialRefusal(status: number): string {
  if (status === 401) return 'Not changed. Your identity could not be confirmed; enter your password and authentication code again.';
  if (status === 403) return 'Not changed. Only a client organisation administrator or owner can manage these credentials.';
  if (status === 400 || status === 422) return 'Not changed. Check the required credential fields, permissions, expiry and reason.';
  if (status === 409) return 'Not changed. The credential record changed; reopen it before trying again.';
  return 'The credential change could not be confirmed. Reopen the card to read its current status.';
}

async function submitCredential(body: Record<string, unknown>, organization: string): Promise<{ status: number; accepted: boolean }> {
  try {
    const res = await apiRequest('POST', CREDENTIAL_PATH, body);
    const receipt = await res.json().catch(() => null) as { success?: unknown; organizationId?: unknown } | null;
    return { status: res.status, accepted: res.ok && receipt?.success === true && String(receipt.organizationId) === organization };
  } catch (err) {
    return { status: err instanceof ApiRequestError ? err.status : 0, accepted: false };
  }
}

/** Secure capture stays in administration; nothing from this drawer is published to AnA. */
export function ClientCredentialVaultCard() {
  const session = useAuthoringReadSession(authService.getUser());
  const ownerRef = useRef(session); ownerRef.current = session;
  const organization = session.actor.split(':')[0];
  const [epoch, setEpoch] = useState(0);
  const [read, setRead] = useState<{ owner: typeof session; data: CredentialCards | null; state: 'loading' | 'failed' | 'read' } | null>(null);
  const [editing, setEditing] = useState<{ owner: typeof session; card: CredentialCard; action: CredentialAction } | null>(null);
  const [outcome, setOutcome] = useState<{ owner: typeof session; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const current = () => ownerRef.current === session && session.sameRevision();
  useEffect(() => {
    let active = true;
    setEditing(null); setOutcome(previous => previous?.owner === session ? previous : null); setBusy(false);
    if (!organization || !session.sameRevision()) return;
    setRead({ owner: session, data: null, state: 'loading' });
    void (async () => {
      try {
        const res = await apiRequest('GET', CREDENTIAL_PATH);
        const body: unknown = await res.json().catch(() => null);
        if (!active || ownerRef.current !== session || !session.sameRevision()) return;
        const data = res.ok ? credentialMetadata(body, organization) : null;
        setRead({ owner: session, data, state: data ? 'read' : 'failed' });
      } catch {
        if (active && ownerRef.current === session && session.sameRevision()) setRead({ owner: session, data: null, state: 'failed' });
      }
    })();
    return () => { active = false; };
  }, [session, organization, epoch]);
  const data = current() && read?.owner === session ? read.data : null;
  const activeEdit = current() && editing?.owner === session ? editing : null;
  const open = (card: CredentialCard, action: CredentialAction) => {
    if (current() && data?.canManage && card.canManage && !busy) setEditing({ owner: session, card, action });
  };
  const save = async (values: Record<string, string>) => {
    const capture = activeEdit;
    if (!capture || !current() || !data?.canManage || !capture.card.canManage || busy) return;
    const body: Record<string, unknown> = { connectorId: capture.card.id, action: capture.action,
      reason: values.reason, reauth: { password: values.reauthPassword, totp: values.reauthTotp || undefined } };
    if (capture.action !== 'revoke') {
      body.credentials = Object.fromEntries(capture.card.fields.filter(f => values[`credential.${f.name}`]?.trim())
        .map(f => [f.name, values[`credential.${f.name}`]]));
      body.scopes = capture.card.scopes.filter(scope => values[`scope.${scope}`] === 'yes');
      body.expiresAt = values.expiresAt ? `${values.expiresAt}T00:00:00.000Z` : null;
    }
    setEditing(null); setBusy(true); setOutcome(null);
    const { status, accepted } = await submitCredential(body, organization);
    if (!current()) return;
    setBusy(false);
    setOutcome({ owner: session, text: accepted
      ? 'Credential change recorded. Read the current status below; secret values are never displayed.' : credentialRefusal(status) });
    setEpoch(n => n + 1);
  };
  return <CredentialVaultView data={data} editing={activeEdit} busy={busy}
    unavailable={!organization || !current()} failed={read?.owner === session && read.state === 'failed'}
    outcome={outcome?.owner === session && current() ? outcome.text : null}
    formKey={`${session.actor}:${session.key}`} onRetry={() => setEpoch(n => n + 1)}
    onOpen={open} onCancel={() => setEditing(null)} onSave={values => { void save(values); }} />;
}

interface CredentialVaultViewProps {
  data: CredentialCards | null; editing: { card: CredentialCard; action: CredentialAction } | null;
  busy: boolean; unavailable: boolean; failed: boolean; outcome: string | null; formKey: string;
  onRetry: () => void; onOpen: (card: CredentialCard, action: CredentialAction) => void;
  onCancel: () => void; onSave: (values: Record<string, string>) => void;
}
function CredentialVaultView({ data, editing, busy, unavailable, failed, outcome, formKey, onRetry, onOpen, onCancel, onSave }: CredentialVaultViewProps) {
  return <div className="txw-set-card" data-testid="client-credential-vault">
    <div className="txw-set-head"><div className="txw-set-head-l">
      <div className="txw-set-eyebrow">Client administration</div><h2 className="txw-set-title">Credential vault</h2>
      <p className="txw-set-sub">Store credentials for your organisation's connected services and model providers here.
        Only administrators and owners can store, replace or revoke them, with re-authentication and an audit record.
        Agency gateway credentials are managed in the card above. Model qualification is separate.</p>
    </div></div>
    <div className="txw-set-body">
      {outcome && <p role="status">{outcome}</p>}
      {unavailable ? <p role="status">Reopen Settings after your session change to read the current credential vault.</p>
        : !data ? <p role="status">{failed ? <>The credential vault could not be read. <button type="button" className="btn ghost small" onClick={onRetry}>Retry</button></> : 'Reading credential metadata…'}</p>
        : <>{!data.canManage && <p>Only your organisation's administrator or owner can manage credentials.</p>}
          {data.credentialCards.map(card => <div className="txw-row" key={card.id} data-testid={`credential-card-${card.id}`}>
            <div className="txw-row-l">{card.name}<small>{card.purpose}</small></div>
            <div className="txw-row-r"><span>{CREDENTIAL_STATUSES[card.status]}</span>
              <span className="txw-help">Permissions: {card.grantedScopes.map(x => SCOPE_LABELS[x]).join(', ') || 'None granted'}</span>
              {card.lastChangedAt && <span className="txw-help">Last changed: {card.lastChangedAt}</span>}
              {card.expiresAt && <span className="txw-help">Expires: {card.expiresAt}</span>}
              {data.canManage && card.canManage && <div>
                <button type="button" className="btn ghost small" disabled={busy} onClick={() => onOpen(card, card.secretFieldsHeld.length ? 'rotate' : 'capture')}>{card.secretFieldsHeld.length ? 'Replace credential…' : 'Store credential…'}</button>
                {card.secretFieldsHeld.length > 0 && card.status !== 'revoked' && <button type="button" className="btn ghost small" disabled={busy} onClick={() => onOpen(card, 'revoke')}>Revoke…</button>}
              </div>}
            </div>
          </div>)}
        </>}
    </div>
    {editing && <C2CForm key={`${formKey}:${editing.card.id}:${editing.action}`} config={credentialCaptureForm(editing.card, editing.action)}
      onCancel={onCancel} onSubmit={onSave}
      renderField={(field, control) => editing.card.fields.some(f => f.secret && f.multiline === true && `credential.${f.name}` === field.key)
        ? multilineCredentialCapture(control) : undefined} />}
  </div>;
}


/** Multiline keys never enter a browser text control: only a fixed password mask is rendered. */
function multilineCredentialCapture(control: C2CFormFieldControl) {
  return <div>
    <input id={control.id} className="de-input" type="password" readOnly value={control.value ? '********' : ''}
      onPaste={event => { event.preventDefault(); control.onChange(event.clipboardData.getData('text/plain')); }}
      aria-required={control.required} aria-invalid={control.invalid} aria-describedby={control.describedBy}
      autoComplete="off" autoCapitalize="off" spellCheck={false} data-secret-entry="true" placeholder="Paste complete PEM here" />
    <span className="txw-help">{control.value ? 'Credential captured. Paste again to replace it.' : 'Paste the complete PEM. Its text is never displayed.'}</span>
    {control.value && <button type="button" className="btn ghost small" onClick={() => control.onChange('')}>Clear captured credential</button>}
  </div>;
}
