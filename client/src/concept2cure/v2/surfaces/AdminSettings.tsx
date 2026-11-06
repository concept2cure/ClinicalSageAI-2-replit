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
  onAsk?: (text: string) => void;
  onNav: (id: string) => void;
  /** What the Profile card lets AnA be told; null when it unmounts. */
  onProfileContext?: (context: OrganizationProfileContext | null) => void;
}

/** Every governed organisation setting, each its own card with its own read and write. */
export function OrganizationSettingsCards({ onNav, onProfileContext, onAsk }: CardsProps) {
  return (
    <div className="txw-settings">
      <OrganizationProfileCard onContext={onProfileContext} />
      <SessionPolicySetting />
      {/* Agency gateway accounts: the platform's or the organisation's own, per
          gateway and environment (D7, founder decision 2026-10-01). */}
      <GatewayAccountsSetting />
      <ClientCredentialVaultCard />
      <AiPlacementPolicyCard onAsk={onAsk} />
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
      <OrganizationSettingsCards onNav={onNav} onProfileContext={onProfileContext} onAsk={onAsk} />
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

interface PlacementPolicy { residency: string | null; zeroDataRetention: boolean; allowedSubstrates: string[] | null; allowedProviders: string[] | null; publicSourceFrontier: boolean; publicSourceEgress: boolean }
interface DerivativePolicy { enabled: boolean; kmsKeyArn: string; maxLifetimeSeconds: number; version: number }
interface DerivativeRecord { derivativeId: string; documentId: string; projectId: number; policyVersion: number; version: number; payloadSha256: string; expiresAt: string; status: 'prepared' | 'attested' | 'revoked' }
interface DerivativeReview { derivativeId: string; version: number; payloadSha256: string; expiresAt: string; exactPayload: string }
interface PlacementMetadata { policy: PlacementPolicy | null; custody: { policy: DerivativePolicy | null; records: DerivativeRecord[] } }
type PlacementAction = 'placement' | 'derivative_policy' | 'derivative_prepare' | 'derivative_review' | 'derivative_attest' | 'derivative_revoke';
interface PlacementEdit { action: PlacementAction; record?: DerivativeRecord; review?: DerivativeReview }
const PLACEMENT_PATH = '/api/ai-placement-policy';
const derivativeObject = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const positiveInteger = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const DERIVATIVE_UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const DERIVATIVE_SHA = /^[a-f0-9]{64}$/;
const PLACEMENT_PROVIDERS = ['anthropic', 'openai', 'moonshot', 'bedrock', 'vertex', 'azure', 'local'];
const PLACEMENT_SUBSTRATES = ['frontier_shared', 'frontier_private', 'self_hosted'];
const typedList = (value: unknown, allowed: string[]): value is string[] | null => value === null || (Array.isArray(value) && value.length > 0 && value.every(x => typeof x === 'string' && allowed.includes(x)));
function placementPolicy(value: unknown): PlacementPolicy | null | undefined {
  if (value === null) return null;
  const p = derivativeObject(value);
  if (!(p.residency === null || ['us', 'eu', 'apac', 'on_prem'].includes(String(p.residency))) ||
    !['zeroDataRetention', 'publicSourceFrontier', 'publicSourceEgress'].every(k => typeof p[k] === 'boolean') ||
    !typedList(p.allowedProviders, PLACEMENT_PROVIDERS) || !typedList(p.allowedSubstrates, PLACEMENT_SUBSTRATES)) return undefined;
  return p as unknown as PlacementPolicy;
}
function derivativePolicy(value: unknown): DerivativePolicy | null | undefined {
  if (value === null) return null;
  const p = derivativeObject(value);
  return typeof p.enabled === 'boolean' && typeof p.kmsKeyArn === 'string' && positiveInteger(p.version) && positiveInteger(p.maxLifetimeSeconds) && p.maxLifetimeSeconds <= 86400
    ? { enabled: p.enabled, kmsKeyArn: p.kmsKeyArn, maxLifetimeSeconds: p.maxLifetimeSeconds, version: p.version } : undefined;
}
function derivativeRecord(value: unknown, organization: string): DerivativeRecord | null {
  const r = derivativeObject(value);
  if (String(r.organizationId) !== organization || !DERIVATIVE_UUID.test(String(r.derivativeId)) || !DERIVATIVE_UUID.test(String(r.documentId)) || !positiveInteger(r.projectId) || !positiveInteger(r.version)
    || !positiveInteger(r.policyVersion) || !DERIVATIVE_SHA.test(String(r.payloadSha256)) || !Number.isFinite(Date.parse(String(r.expiresAt))) || !['prepared', 'attested', 'revoked'].includes(String(r.status))) return null;
  return { derivativeId: String(r.derivativeId), documentId: String(r.documentId), projectId: r.projectId, policyVersion: r.policyVersion, version: r.version, payloadSha256: String(r.payloadSha256), expiresAt: String(r.expiresAt), status: r.status as DerivativeRecord['status'] };
}
function placementMetadata(value: unknown, organization: string): PlacementMetadata | null {
  const body = derivativeObject(value), custody = derivativeObject(body.derivativeCustody);
  const policy = placementPolicy(body.policy), candidatePolicy = derivativePolicy(custody.policy);
  if (String(body.organizationId) !== organization || policy === undefined || candidatePolicy === undefined || !Array.isArray(custody.records)) return null;
  const records = custody.records.map(record => derivativeRecord(record, organization));
  return records.every((r): r is DerivativeRecord => r !== null) ? { policy, custody: { policy: candidatePolicy, records } } : null;
}
const choice = (key: string, label: string, value = false) => ({ key, label, type: 'select' as const, default: value ? 'yes' : 'no', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] });
function placementFields(data: PlacementMetadata): C2CFormConfig['fields'] {
  const p = data.policy;
  return [{ key: 'residency', label: 'Data residency', type: 'select', default: p?.residency ?? '', options: ['', 'us', 'eu', 'apac', 'on_prem'] },
    choice('zeroDataRetention', 'Require zero data retention', p?.zeroDataRetention),
    { key: 'allowedProviders', label: 'Allowed providers (comma-separated; blank uses deployment defaults)', type: 'text', default: p?.allowedProviders?.join(', ') ?? '', desc: PLACEMENT_PROVIDERS.join(', ') },
    { key: 'allowedSubstrates', label: 'Allowed substrates (comma-separated; blank has no added constraint)', type: 'text', default: p?.allowedSubstrates?.join(', ') ?? '', desc: PLACEMENT_SUBSTRATES.join(', ') },
    choice('publicSourceFrontier', 'Allow public-source frontier requests', p?.publicSourceFrontier), choice('publicSourceEgress', 'Allow public-source requests', p?.publicSourceEgress ?? true)];
}
function derivativeFields(action: PlacementAction, data: PlacementMetadata): C2CFormConfig['fields'] {
  if (action === 'placement') return placementFields(data);
  if (action === 'derivative_policy') return [choice('enabled', 'Enable reviewed T2 derivatives', data.custody.policy?.enabled),
    { key: 'kmsKeyArn', label: 'Tenant KMS key ARN (immutable key, not an alias)', type: 'text', required: true, default: data.custody.policy?.kmsKeyArn },
    { key: 'maxLifetimeSeconds', label: 'Maximum candidate lifetime (seconds)', type: 'number', required: true, min: 1, max: 86400, default: String(data.custody.policy?.maxLifetimeSeconds ?? 3600) }];
  if (action === 'derivative_prepare') return [
    { key: 'projectId', label: 'Project number', type: 'number', required: true, min: 1 }, { key: 'documentId', label: 'Current Vault document ID', type: 'text', required: true },
    { key: 'template', label: 'Minimized template', type: 'textarea', rows: 5, required: true, desc: 'Write only the context needed. Use {{0}}, {{1}}, etc., each once. Template prose remains in the outbound payload and needs manual review.' },
    { key: 'spans', label: 'Ordered source spans (JSON)', type: 'textarea', rows: 4, required: true, placeholder: '[{"start":0,"end":12,"label":"ENTITY"}]', desc: 'UTF-16 offsets, end exclusive. Labels: ENTITY, MOLECULE, VALUE, IDENTIFIER, NAME. No source text is entered here.' },
    { key: 'expiresInSeconds', label: 'Candidate lifetime (seconds)', type: 'number', required: true, min: 1, max: data.custody.policy?.maxLifetimeSeconds ?? 86400, default: String(Math.min(data.custody.policy?.maxLifetimeSeconds ?? 3600, 3600)) }];
  return action === 'derivative_attest' ? [choice('reviewAcknowledged', 'Exact outbound payload reviewed')] : [];
}
const PLACEMENT_TITLES: Record<PlacementAction, string> = { placement: 'Change AI placement policy', derivative_policy: 'Configure derivative policy', derivative_prepare: 'Prepare derivative candidate', derivative_review: 'Read exact candidate payload', derivative_attest: 'Attest reviewed payload', derivative_revoke: 'Revoke derivative candidate' };
function placementForm(edit: PlacementEdit, data: PlacementMetadata): C2CFormConfig {
  return { eyebrow: 'Client administration · AI data use', title: PLACEMENT_TITLES[edit.action], submitLabel: edit.action === 'derivative_review' ? 'Read candidate for review' : PLACEMENT_TITLES[edit.action], governed: true,
    sub: 'Structured minimization is a proposal. Review every remaining word before attesting. T3 data stays local.',
    notice: edit.review ? `Candidate version ${edit.review.version} · SHA-256 ${edit.review.payloadSha256} · Expires ${edit.review.expiresAt}` : undefined,
    fields: [...derivativeFields(edit.action, data), { key: 'reasonForChange', label: 'Reason (recorded; at least 8 characters)', type: 'textarea', required: true, desc: 'Do not include source values, payload text or passwords.' },
      ...(edit.action === 'placement' ? [] : [{ key: 'password', label: 'Your password (re-authentication)', type: 'password' as const, required: true }, { key: 'totpCode', label: 'Authentication code (if enabled)', type: 'password' as const }])] };
}
function parsePlacementList(text: string, allowed: string[]): string[] | null {
  const list = text.split(',').map(x => x.trim()).filter(Boolean);
  if (list.some(x => !allowed.includes(x))) throw new Error('INVALID_INPUT');
  return list.length ? [...new Set(list)] : null;
}
function derivativeSpans(value: string, template: string): unknown[] {
  const spans: unknown = JSON.parse(value);
  if (!Array.isArray(spans) || spans.length < 1 || spans.length > 100 || template.length > 100000) throw new Error('INVALID_INPUT');
  let end = 0;
  return spans.map((v, i) => { const s = derivativeObject(v);
    if (Object.keys(s).some(k => !['start', 'end', 'label'].includes(k)) || !Number.isSafeInteger(s.start) || !Number.isSafeInteger(s.end) || Number(s.start) < end || Number(s.end) <= Number(s.start)
      || !['ENTITY', 'MOLECULE', 'VALUE', 'IDENTIFIER', 'NAME'].includes(String(s.label)) || template.split(`{{${i}}}`).length !== 2) throw new Error('INVALID_INPUT');
    end = Number(s.end); return { start: s.start, end: s.end, label: s.label }; });
}
function placementActionBody(edit: PlacementEdit, values: Record<string, string>): Record<string, unknown> {
  const reasonForChange = values.reasonForChange.trim();
  if (reasonForChange.length < 8) throw new Error('INVALID_INPUT');
  if (edit.action === 'placement') return { residency: values.residency || null, zeroDataRetention: values.zeroDataRetention === 'yes', publicSourceFrontier: values.publicSourceFrontier === 'yes', publicSourceEgress: values.publicSourceEgress === 'yes',
    allowedProviders: parsePlacementList(values.allowedProviders, PLACEMENT_PROVIDERS), allowedSubstrates: parsePlacementList(values.allowedSubstrates, PLACEMENT_SUBSTRATES), reasonForChange };
  const body: Record<string, unknown> = { action: edit.action, reasonForChange, reauth: { password: values.password, totp: values.totpCode || undefined } };
  if (edit.action === 'derivative_policy') return { ...body, policy: { enabled: values.enabled === 'yes', kmsKeyArn: values.kmsKeyArn, maxLifetimeSeconds: Number(values.maxLifetimeSeconds) } };
  if (edit.action === 'derivative_prepare') return { ...body, projectId: Number(values.projectId), documentId: values.documentId.trim().toLowerCase(), template: values.template, spans: derivativeSpans(values.spans, values.template), expiresInSeconds: Number(values.expiresInSeconds) };
  if (!edit.record) throw new Error('INVALID_INPUT');
  if (edit.action === 'derivative_attest' && (!edit.review || values.reviewAcknowledged !== 'yes')) throw new Error('REVIEW_REQUIRED');
  const proof = edit.review ?? edit.record;
  return { ...body, projectId: edit.record.projectId, derivativeId: edit.record.derivativeId,
    ...(edit.action === 'derivative_review' ? {} : { expectedVersion: proof.version, payloadSha256: proof.payloadSha256 }) };
}
async function candidateReview(value: unknown, record: DerivativeRecord): Promise<DerivativeReview | null> {
  const r = derivativeObject(value);
  if (!(r.derivativeId === record.derivativeId && r.version === record.version && r.payloadSha256 === record.payloadSha256 && r.expiresAt === record.expiresAt && typeof r.exactPayload === 'string' && r.exactPayload.length > 0 && r.exactPayload.length <= 100000) || !globalThis.crypto?.subtle) return null;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(r.exactPayload));
  if (Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('') !== record.payloadSha256) return null;
  return { derivativeId: record.derivativeId, version: record.version, payloadSha256: record.payloadSha256, expiresAt: record.expiresAt, exactPayload: r.exactPayload };
}
const confirmedPlacementReceipt = (res: { ok: boolean }, receipt: Record<string, unknown>, organization: string) =>
  res.ok && receipt.audited === true && String(receipt.organizationId) === organization;
const currentAttestedDerivative = (record: DerivativeRecord, data: PlacementMetadata) => record.status === 'attested' && data.custody.policy?.enabled && record.policyVersion === data.custody.policy.version && Date.parse(record.expiresAt) > Date.now();
export function AiPlacementPolicyCard({ onAsk }: { onAsk?: (text: string) => void } = {}) {
  const session = useAuthoringReadSession(authService.getUser()), owner = useRef(session); owner.current = session;
  const organization = session.actor.split(':')[0], current = () => owner.current === session && session.sameRevision();
  const [epoch, refresh] = useState(0), [read, setRead] = useState<{ owner: typeof session; data: PlacementMetadata | null } | null>(null);
  const [edit, setEdit] = useState<{ owner: typeof session; value: PlacementEdit } | null>(null), [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ owner: typeof session; text: string } | null>(null), setMessage = (text: string) => setNotice({ owner: session, text });
  useEffect(() => { let active = true; setEdit(null); setRead(null); setBusy(false); setNotice(previous => previous?.owner === session ? previous : null);
    void apiRequest('GET', PLACEMENT_PATH).then(async res => { const body: unknown = await res.json();
      if (active && owner.current === session && session.sameRevision()) setRead({ owner: session, data: res.ok ? placementMetadata(body, organization) : null });
    }).catch(() => { if (active && owner.current === session && session.sameRevision()) setRead({ owner: session, data: null }); });
    return () => { active = false; }; }, [session, organization, epoch]);
  const data = current() && read?.owner === session ? read.data : null, activeEdit = current() && edit?.owner === session ? edit.value : null;
  const open = (value: PlacementEdit) => { if (current() && data && !busy) { setMessage(''); setEdit({ owner: session, value }); } };
  const save = async (values: Record<string, string>) => {
    if (!activeEdit || !current() || busy) return;
    const capture = activeEdit; let body: Record<string, unknown>;
    setEdit(null); setMessage('');
    try { body = placementActionBody(capture, values); } catch { setMessage('Not submitted. Check the fields and explicitly confirm the exact payload when attesting.'); return; }
    setBusy(true);
    try { const res = await apiRequest('PUT', PLACEMENT_PATH, body), receipt = derivativeObject(await res.json().catch(() => null));
      if (!current()) return;
      if (!confirmedPlacementReceipt(res, receipt, organization)) throw new Error('UNCONFIRMED');
      if (capture.action === 'derivative_review' && capture.record) {
        const review = await candidateReview(receipt.derivativeCustody, capture.record); if (!current()) return; if (!review) throw new Error('UNCONFIRMED');
        setEdit({ owner: session, value: { action: 'derivative_attest', record: capture.record, review } });
      } else { setMessage('Change recorded. Reload the current policy and candidate status before further use.'); refresh(n => n + 1); }
    } catch { if (current()) setMessage('The action could not be confirmed. Read the current record and re-authenticate before trying again.'); }
    finally { if (current()) setBusy(false); }
  };
  const askForDraft = onAsk ? (record: DerivativeRecord) => {
    if (current() && data && !busy && currentAttestedDerivative(record, data)) { setEdit(null); onAsk(`Use draft_authoring_document with derivativeId ${record.derivativeId} in project ${record.projectId} to create a reviewed derivative draft in the existing editor. Use only the approved candidate; approval and filing remain separate.`); }
  } : undefined;
  return <AiPlacementPolicyView data={data} activeEdit={activeEdit} busy={busy} message={current() && notice?.owner === session ? notice.text : ''} readComplete={read !== null}
    formKey={`${session.actor}:${session.key}`} onRetry={() => refresh(n => n + 1)} onOpen={open} onCancel={() => setEdit(null)} onSave={values => { void save(values); }} onDraft={askForDraft} />;
}
interface PlacementViewProps { data: PlacementMetadata | null; activeEdit: PlacementEdit | null; busy: boolean; message: string; readComplete: boolean; formKey: string;
  onDraft?: (record: DerivativeRecord) => void; onRetry: () => void; onOpen: (edit: PlacementEdit) => void; onCancel: () => void; onSave: (values: Record<string, string>) => void }
function AiPlacementPolicyView({ data, activeEdit, busy, message, readComplete, formKey, onRetry, onOpen, onCancel, onSave, onDraft }: PlacementViewProps) {
  return <div className="txw-set-card" data-testid="ai-placement-policy-card"><div className="txw-set-head"><div className="txw-set-head-l"><div className="txw-set-eyebrow">Client administration</div><h2 className="txw-set-title">AI data use and reviewed derivatives</h2><p className="txw-set-sub">Govern where your organisation's data may be processed. A structured template and explicit spans minimize selected T2 source values; a person reviews the exact residual before attestation. This does not automatically establish that the residual is safe. T3 remains local-only.</p></div></div>
    <div className="txw-set-body">{message && <p role="status">{message}</p>}{!data ? <p role="status">{readComplete ? 'AI data-use settings could not be read.' : 'Reading AI data-use settings…'} <button className="btn ghost small" onClick={onRetry}>Retry</button></p> : <>
      <p>{data.policy ? 'A placement policy is recorded.' : 'No placement policy is recorded; deployment defaults apply.'} Derivative policy: {data.custody.policy ? `${data.custody.policy.enabled ? 'Enabled' : 'Disabled'} · version ${data.custody.policy.version}` : 'Not configured'}.</p>
      <button className="btn ghost small" disabled={busy} onClick={() => onOpen({ action: 'placement' })}>Edit AI placement policy…</button><button className="btn ghost small" disabled={busy} onClick={() => onOpen({ action: 'derivative_policy' })}>Configure derivative policy…</button><button className="btn ghost small" disabled={busy || !data.custody.policy?.enabled} onClick={() => onOpen({ action: 'derivative_prepare' })}>Prepare candidate…</button>
      {data.custody.records.map(record => <div className="txw-row" key={record.derivativeId}><div className="txw-row-l">Project {record.projectId} · {record.status}<small>Source {record.documentId}</small><small>Candidate {record.derivativeId} · version {record.version}</small><small>SHA-256 {record.payloadSha256} · expires {record.expiresAt}</small></div><div className="txw-row-r">{onDraft && currentAttestedDerivative(record, data) && <button className="btn ghost small" disabled={busy} onClick={() => onDraft(record)}>Draft reviewed candidate…</button>}{record.status !== 'revoked' && <><button className="btn ghost small" disabled={busy} onClick={() => onOpen({ action: 'derivative_review', record })}>Review candidate…</button><button className="btn ghost small" disabled={busy} onClick={() => onOpen({ action: 'derivative_revoke', record })}>Revoke candidate…</button></>}</div></div>)}
    </>}</div>{activeEdit && data && <C2CForm key={`${formKey}:${activeEdit.action}:${activeEdit.record?.derivativeId ?? ''}`} config={placementForm(activeEdit, data)} onCancel={onCancel} onSubmit={onSave} renderField={(field, control) => field.key === 'reviewAcknowledged' && activeEdit.review ? <><pre aria-label="Exact outbound candidate payload">{activeEdit.review.exactPayload}</pre><select id={control.id} value={control.value} onChange={e => control.onChange(e.target.value)}><option value="no">Not yet reviewed</option><option value="yes">I reviewed every remaining word</option></select></> : undefined} />}
  </div>;
}
