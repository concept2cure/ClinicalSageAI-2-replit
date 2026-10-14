import React, { useRef, useState } from 'react';
import { apiRequest, ApiRequestError, serverMessage } from '@/lib/queryClient';
import { API_KEY_SCOPES } from '@shared/schema/api-keys';
import { C2CForm, type C2CFormConfig } from '../C2CForm';

const SCOPE_LABELS: Record<(typeof API_KEY_SCOPES)[number], string> = {
  'csr:read': 'Clinical study report reads', 'regulatory:read': 'Regulatory intelligence reads',
  'endpoints:read': 'Endpoint library reads', 'precedent:read': 'Precedent reads',
  'trial-design:read': 'Trial design reads', 'documents:read': 'Document reads',
};
const FORM: C2CFormConfig = {
  eyebrow: 'Admin and access · API keys', title: 'Create an API key', submitLabel: 'Create key',
  governed: 'This key grants the selected read access within your current organization. Scopes are fixed at creation. Store the key securely when it is shown; it cannot be read again. You can revoke it from API keys.',
  fields: [
    { key: 'name', label: 'Key name', type: 'text', required: true },
    ...API_KEY_SCOPES.map((scope) => ({ key: `scope_${scope}`, label: SCOPE_LABELS[scope], type: 'seg' as const, default: 'no', half: true, options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }] })),
    { key: 'expiresAt', label: 'Expiration date (optional)', type: 'date', half: true, desc: 'The key expires at the start of this date in UTC.' },
    { key: 'rateLimit', label: 'Requests per minute', type: 'number', min: 1, default: '60', half: true },
    { key: 'reason', label: 'Reason for issuing this key', type: 'textarea', required: true, rows: 3, desc: '3–500 characters, recorded with the key issuance.' },
  ],
};

function keyBody(values: Record<string, string>): { body: Record<string, unknown> } | { error: string } {
  const name = values.name?.trim() ?? '';
  const scopes = API_KEY_SCOPES.filter((scope) => values[`scope_${scope}`] === 'yes');
  if (!name || name.length > 255) return { error: 'Enter a key name of 1–255 characters.' };
  if (!scopes.length) return { error: 'Choose at least one read permission for this key.' };
  const rateLimit = Number(values.rateLimit);
  if (!Number.isInteger(rateLimit) || rateLimit < 1) return { error: 'Requests per minute must be a positive whole number.' };
  const reason = values.reason?.trim() ?? '';
  if (reason.length < 3 || reason.length > 500) return { error: 'Enter a reason of 3–500 characters for issuing this key.' };
  const body: Record<string, unknown> = { name, scopes, rateLimit, reason };
  if (values.expiresAt) {
    const date = new Date(`${values.expiresAt}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) return { error: 'Choose an expiration date in the future.' };
    body.expiresAt = date.toISOString();
  }
  return { body };
}

function createdKey(body: unknown): { key: string; name: string } | null {
  if (!body || typeof body !== 'object') return null;
  const value = body as { apiKey?: unknown; keyId?: unknown; name?: unknown };
  if (typeof value.apiKey !== 'string' || !value.apiKey || !Number.isInteger(value.keyId) || Number(value.keyId) < 1 || typeof value.name !== 'string') return null;
  return { key: value.apiKey, name: value.name };
}

/** One raw-key response, held only in this component until explicitly dismissed. */
export function ApiKeyCreate({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState<{ key: string; name: string } | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const sending = useRef(false);

  const create = async (values: Record<string, string>) => {
    if (sending.current) return;
    const request = keyBody(values);
    if ('error' in request) { setNote(request.error); return; }
    sending.current = true;
    setSaving(true);
    setNote('');
    try {
      const response = await apiRequest('POST', '/api/api-keys', request.body);
      const body = await response.json().catch(() => null);
      const issued = response.ok ? createdKey(body) : null;
      if (!issued) {
        setNote(serverMessage(body) ?? 'Key creation could not be confirmed. Check the key list before trying again.');
        return;
      }
      setRevealed(issued);
      setOpen(false);
    } catch (error) {
      setNote(error instanceof ApiRequestError
        ? serverMessage(error.payload) ?? 'The key could not be created. Contact your organization administrator if you need access.'
        : 'The server could not be reached. Check the key list before trying again.');
    } finally {
      sending.current = false;
      setSaving(false);
    }
  };

  const copy = async () => {
    if (!revealed) return;
    try {
      if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('Unavailable');
      await navigator.clipboard.writeText(revealed.key);
      setNote('API key copied. Store it securely before dismissing this view.');
    } catch { setNote('The key could not be copied. Select the visible key and copy it manually.'); }
  };
  const dismiss = () => { setRevealed(null); setNote(''); onCreated?.(); };
  return <div className="adm-settings">
    <button type="button" className="btn ghost" disabled={revealed !== null} onClick={() => { setOpen(true); setNote(''); }}>Create API key</button>
    {revealed && <div className="ob-review" aria-label="New API key">
      <p className="scaf-note">API key “{revealed.name}” was created. This is the only time its full value is shown. Store it securely before dismissing this view.</p>
      <label className="scaf-note" htmlFor="created-api-key">New API key value</label>
      <input id="created-api-key" className="ob-in" readOnly value={revealed.key} onFocus={(e) => e.currentTarget.select()} />
      <button type="button" className="btn ghost small" onClick={() => void copy()}>Copy new API key</button>
      <button type="button" className="btn ghost small" onClick={dismiss}>I have stored the key</button>
    </div>}
    <div className={note ? 'scaf-note' : 'sr-only'} role="status" aria-live="polite">{note}</div>
    {open && <C2CForm config={{ ...FORM, notice: note || undefined, busy: saving ? 'Creating the API key…' : undefined }} onCancel={() => { if (!saving) { setOpen(false); setNote(''); } }} onSubmit={(values) => void create(values)} />}
  </div>;
}
