import React, { useEffect, useRef, useState } from 'react';
import { API_KEY_SCOPES, type ApiKeyScope } from '@shared/constants/api-key-scopes';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { registerCeremonyOpen } from '../ceremony';
import { I } from '../icons';
import { useDialog } from '../useDialog';
import { isApiRequestError } from '../apiCall';

type KeyDraft = { name: string; expiry: string; rateLimit: string; reason: string };
type KeyRequest = { name: string; scopes: ApiKeyScope[]; rateLimit: number; reason: string; expiresAt?: string };

function creationRequest(draft: KeyDraft, scopes: ApiKeyScope[]): { error: string } | { body: KeyRequest } {
  const rpm = Number(draft.rateLimit);
  const expiresAt = draft.expiry ? new Date(draft.expiry) : null;
  if (!draft.name.trim() || draft.name.trim().length > 255) return { error: 'Enter a key name with 1–255 characters.' };
  if (!scopes.length) return { error: 'Select at least one read-only scope.' };
  if (draft.reason.trim().length < 3 || draft.reason.trim().length > 500) return { error: 'Enter a reason with 3–500 characters.' };
  if (!Number.isInteger(rpm) || rpm <= 0) return { error: 'Requests per minute must be a positive whole number.' };
  if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now())) return { error: 'Choose an expiration in the future, or leave it empty.' };
  return { body: {
    name: draft.name.trim(), scopes: API_KEY_SCOPES.filter(scope => scopes.includes(scope)),
    rateLimit: rpm, reason: draft.reason.trim(), ...(expiresAt ? { expiresAt: expiresAt.toISOString() } : {}),
  } };
}

function issuanceFailure(error: unknown, handedOver: boolean): { uncertain: boolean; message: string } {
  const known = isApiRequestError(error);
  const code = known ? (error.payload as { code?: unknown } | null)?.code : undefined;
  const uncertain = !handedOver && (!known || code === 'API_KEY_COMMIT_UNCONFIRMED');
  return { uncertain, message: uncertain && code !== 'API_KEY_COMMIT_UNCONFIRMED'
    ? 'The one-time key response could not be confirmed. Check the key list before issuing another.'
    : error instanceof Error ? error.message : 'The key service could not be reached.' };
}

/** The key stays in this drawer's memory until it is dismissed. No context,
 * storage, toast, or callback receives it. The server returns it once. */
export function AdminApiKeyCreate({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<ApiKeyScope[]>([]);
  const [expiry, setExpiry] = useState('');
  const [rateLimit, setRateLimit] = useState('60');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [copyNote, setCopyNote] = useState('');
  const uid = React.useId();
  const close = () => {
    if (pending.current) return;
    setSecret(null);
    setCopyNote('');
    onClose();
  };
  const ref = useDialog(close);
  useEffect(() => registerCeremonyOpen(), []);

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending.current || uncertain) return;
    const parsed = creationRequest({ name, expiry, rateLimit, reason }, scopes);
    if ('error' in parsed) { setError(parsed.error); return; }
    pending.current = true; setBusy(true); setError('');
    let handedOver = false;
    try {
      const res = await apiRequest('POST', '/api/api-keys', parsed.body);
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        throw Object.assign(new Error(serverMessage(body) ?? `The server refused key creation (HTTP ${res.status}).`), { name: 'ApiRequestError', status: res.status, payload: body });
      }
      const rawKey = body && typeof body === 'object' && 'apiKey' in body ? body.apiKey : null;
      if (typeof rawKey !== 'string' || !rawKey) {
        setError('The server accepted the request but did not return the key. Check the key list before retrying; revoke the key if its secret cannot be recovered.');
        setUncertain(true);
        onCreated();
        return;
      }
      setSecret(rawKey);
      handedOver = true;
      onCreated();
    } catch (e) {
      const failure = issuanceFailure(e, handedOver);
      setError(failure.message);
      if (failure.uncertain) { setUncertain(true); onCreated(); }
    } finally {
      pending.current = false; setBusy(false);
    }
  };

  const copy = async () => {
    if (!secret) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(secret);
      setCopyNote('API key copied. Store it in your service’s secret manager.');
    } catch {
      setCopyNote('The clipboard could not be written. Select the key and copy it manually before closing.');
    }
  };

  return (
    <div className="de-bd" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="de" ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`} aria-busy={busy} tabIndex={-1}>
        <div className="de-h">
          <div><div className="de-h-eye">Admin and access · API keys</div><div className="de-h-t" id={`${uid}-title`}>{secret ? 'Store your API key' : 'Create API key'}</div></div>
          <button type="button" className="de-x" aria-label="Close" onClick={close} disabled={busy}>{I.close}</button>
        </div>
        {secret ? (
          <>
            <div className="de-body">
              <p className="de-gov" role="status"><span className="de-gov-t">API key created. Store it securely: the full key is shown once and cannot be retrieved after this drawer closes.</span></p>
              <div className="de-field">
                <label className="de-label" htmlFor={`${uid}-secret`}>API key secret</label>
                <input id={`${uid}-secret`} className="de-input mono" readOnly value={secret} autoComplete="off" spellCheck={false} onFocus={e => e.target.select()} />
              </div>
              {copyNote && <p className="de-desc" role="status">{copyNote}</p>}
            </div>
            <div className="de-f">
              <button type="button" className="de-btn ghost" onClick={() => void copy()}>{I.copy} Copy API key</button>
              <button type="button" className="de-btn primary" onClick={close}>{I.check} Done</button>
            </div>
          </>
        ) : (
          <ApiKeyForm uid={uid} draft={{ name, expiry, rateLimit, reason }} scopes={scopes} busy={busy} uncertain={uncertain} error={error}
            onEdit={(field, value) => ({ name: setName, expiry: setExpiry, rateLimit: setRateLimit, reason: setReason })[field](value)}
            onScope={(scope, checked) => setScopes(current => checked ? [...current, scope] : current.filter(s => s !== scope))}
            onSubmit={create} onCancel={close} />
        )}
      </div>
    </div>
  );
}

function ApiKeyForm({ uid, draft, scopes, busy, uncertain, error, onEdit, onScope, onSubmit, onCancel }: {
  uid: string; draft: KeyDraft; scopes: ApiKeyScope[]; busy: boolean; uncertain: boolean; error: string;
  onEdit: (field: keyof KeyDraft, value: string) => void;
  onScope: (scope: ApiKeyScope, checked: boolean) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onCancel: () => void;
}) {
  return (
    <form className="adm-key-form" onSubmit={event => void onSubmit(event)} noValidate>
      <div className="de-body">
        <div className="de-field">
          <label className="de-label" htmlFor={`${uid}-name`}>Key name<span className="req" aria-hidden="true">*</span></label>
          <input className="de-input" id={`${uid}-name`} value={draft.name} onChange={e => onEdit('name', e.target.value)} maxLength={255} aria-required="true" disabled={busy} />
        </div>
        <fieldset className="de-field adm-key-scopes" disabled={busy}>
          <legend className="de-label">Read-only scopes<span className="req" aria-hidden="true">*</span></legend>
          <p className="de-desc">Select only what the service needs. Scopes cannot be changed after creation.</p>
          {API_KEY_SCOPES.map(scope => (
            <label key={scope} className="adm-key-scope"><input type="checkbox" checked={scopes.includes(scope)} onChange={e => onScope(scope, e.target.checked)} /><span className="mono">{scope}</span></label>
          ))}
        </fieldset>
        <div className="de-field">
          <label className="de-label" htmlFor={`${uid}-expiry`}>Expires at (optional)</label>
          <p className="de-desc">Your local time. Leave empty for a key with no expiration.</p>
          <input className="de-input" id={`${uid}-expiry`} type="datetime-local" value={draft.expiry} onChange={e => onEdit('expiry', e.target.value)} disabled={busy} />
        </div>
        <div className="de-field">
          <label className="de-label" htmlFor={`${uid}-rate`}>Requests per minute<span className="req" aria-hidden="true">*</span></label>
          <input className="de-input" id={`${uid}-rate`} type="number" min={1} step={1} value={draft.rateLimit} onChange={e => onEdit('rateLimit', e.target.value)} aria-required="true" disabled={busy} />
        </div>
        <div className="de-field">
          <label className="de-label" htmlFor={`${uid}-reason`}>Reason<span className="req" aria-hidden="true">*</span></label>
          <textarea className="de-textarea" id={`${uid}-reason`} rows={3} maxLength={500} value={draft.reason} onChange={e => onEdit('reason', e.target.value)} aria-required="true" disabled={busy} />
        </div>
        <div className="de-gov"><span className="ico">{I.lock}</span><span className="de-gov-t">This key grants access to your organization’s data within the selected scopes. Creation records your account, the scopes and the stated reason in the audit event.</span></div>
        {error && <div className="de-err" role="alert">{error}</div>}
      </div>
      <div className="de-f">
        <button type="button" className="de-btn ghost" onClick={onCancel} disabled={busy}>{uncertain ? 'Close and check key list' : 'Cancel'}</button>
        <button type="submit" className="de-btn primary" disabled={busy || uncertain}>{I.lock} {busy ? 'Creating…' : 'Create API key'}</button>
      </div>
    </form>
  );
}
