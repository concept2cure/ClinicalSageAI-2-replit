import React, { useCallback, useEffect, useState } from 'react';
import { apiRequest, ApiRequestError } from '@/lib/queryClient';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig, C2CFormField } from '../C2CForm';
import '../styles/translation-v2.css';

/**
 * Agency gateway accounts: whose account submissions go out under, chosen per
 * agency gateway and per environment (D7, founder decision 2026-10-01: "have
 * both the platform and client … account as options … part of an account
 * setting in our admin settings when clients onboard").
 *
 *   GET /api/gateway-accounts                                 every gateway × environment
 *   PUT /api/gateway-accounts/:region/:gateway/:environment   { mode, senderIdentifier?,
 *       credentials?, reason, reauth: { password, totp? } }   owner or administrator
 *
 * One component, rendered by admin Setup and by the onboarding wizard, so there
 * is one place the choice is made. What is shown is what the server stored: it
 * is read again after every change. A read that fails is shown as unread, never
 * as "platform". Certificates and keys go to the server and are never read
 * back; the list names which are held, not what they are.
 */

type Mode = 'platform' | 'client';
type Status = 'ready' | 'platform_not_configured' | 'credentials_needed' | 'client_not_supported';

interface ClientField {
  name: string;
  label: string;
  pem?: boolean;
}

export interface GatewayAccount {
  region: string;
  gateway: string;
  agency: string;
  label: string;
  identifierLabel: string;
  environment: 'production' | 'staging';
  mode: Mode;
  clientTransmit: boolean;
  clientFields: ClientField[];
  senderIdentifier: string | null;
  credentialFieldsHeld: string[];
  status: Status;
}

function isAccountList(v: unknown): v is { accounts: GatewayAccount[] } {
  const list = (v as { accounts?: unknown } | null)?.accounts;
  return Array.isArray(list) && list.every((a) => a && typeof a === 'object' && typeof (a as GatewayAccount).mode === 'string');
}

const unwrap = (body: unknown): unknown =>
  body && typeof body === 'object' && 'data' in (body as object) && !('accounts' in (body as object))
    ? (body as { data: unknown }).data
    : body;

/** A request's outcome with the server's own refusal text, whether apiRequest threw or returned. */
async function send(method: 'GET' | 'PUT', path: string, body?: unknown): Promise<{ ok: boolean; status: number; body: unknown }> {
  try {
    const res = await apiRequest(method, path, body);
    return { ok: res.ok, status: res.status, body: unwrap(await res.json().catch(() => null)) };
  } catch (err) {
    if (err instanceof ApiRequestError) return { ok: false, status: err.status, body: err.payload ?? null };
    return { ok: false, status: 0, body: null };
  }
}

const STATUS_TEXT: Record<Status, string> = {
  ready: 'Ready',
  platform_not_configured: 'Not yet configured for this environment',
  credentials_needed: 'Identifier, certificate or key still needed',
  client_not_supported:
    'Recorded. Sending under your own account is not yet available for this agency; a transmit is refused until it is, never sent under ours.',
};

const ENV_LABEL = { production: 'Production', staging: 'Test' } as const;

function modeText(a: GatewayAccount): string {
  if (a.mode === 'platform') return 'Platform account';
  return a.senderIdentifier ? `Your account (${a.senderIdentifier})` : 'Your account';
}

/** The refusal, in the server's words where it gave some. */
export function refusalText(status: number, body: unknown): string {
  if (status === 0) return 'The server could not be reached, so nothing was changed.';
  if (status === 401) return 'Not changed: your password was not confirmed.';
  if (status === 403) return "Not changed: only the organisation's owner or administrator can change this.";
  const said = (body as { error?: { message?: unknown } } | null)?.error?.message;
  return typeof said === 'string' && said ? `Not changed: ${said}` : `Not changed (HTTP ${status}).`;
}

/** The change form for one gateway and environment. Secret fields are blank: what is held is never sent back. */
export function changeForm(a: GatewayAccount): C2CFormConfig {
  const fields: C2CFormField[] = [
    {
      key: 'mode',
      label: 'Submissions go out under',
      type: 'select',
      required: true,
      default: a.mode,
      options: [
        { value: 'platform', label: "The platform's account" },
        { value: 'client', label: "Our organisation's own account" },
      ],
    },
    {
      key: 'senderIdentifier',
      label: a.identifierLabel,
      type: 'text',
      default: a.senderIdentifier ?? '',
      desc: 'Used only for your own account.',
    },
    ...a.clientFields.map<C2CFormField>((f) => ({
      key: f.name,
      label: f.label,
      type: 'textarea',
      rows: 4,
      placeholder: a.credentialFieldsHeld.includes(f.name)
        ? 'Held. Leave blank to keep it, or paste a replacement.'
        : '-----BEGIN …',
      desc: 'Used only for your own account. Stored encrypted; never shown again.',
    })),
    { key: 'reason', label: 'Reason for the change (recorded)', type: 'textarea', required: true, placeholder: 'At least 10 characters.' },
    { key: 'password', label: 'Password (re-authentication)', type: 'password', required: true, half: true },
    { key: 'totp', label: 'Authentication code (if enabled)', type: 'text', half: true },
  ];
  return {
    eyebrow: `${a.agency} · ${ENV_LABEL[a.environment]}`,
    title: a.label,
    sub: a.clientTransmit
      ? 'Choose whose account this agency sees submissions from. Choosing the platform account again removes every certificate and key held for your own.'
      : 'Your choice is recorded now. Sending under your own account is not yet available for this agency, so a transmit under it is refused rather than sent under the platform account.',
    governed: true,
    submitLabel: 'Save',
    fields,
  };
}

/** The PUT body from the form's values. Only fields with something in them are sent. */
export function changeBody(a: GatewayAccount, v: Record<string, string>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    mode: v.mode,
    reason: v.reason,
    reauth: { password: v.password, totp: v.totp || undefined },
  };
  if (v.mode !== 'client') return body;
  if (v.senderIdentifier?.trim()) body.senderIdentifier = v.senderIdentifier.trim();
  const credentials: Record<string, string> = {};
  for (const f of a.clientFields) if (v[f.name]?.trim()) credentials[f.name] = v[f.name];
  if (Object.keys(credentials).length) body.credentials = credentials;
  return body;
}

interface CellProps {
  account: GatewayAccount;
  onChange: (a: GatewayAccount) => void;
}

function AccountCell({ account: a, onChange }: CellProps) {
  return (
    <div className="txw-row-r" data-testid={`gateway-account-${a.region}-${a.gateway}-${a.environment}`}>
      <div>
        <b>{ENV_LABEL[a.environment]}:</b> {modeText(a)}
      </div>
      <span className="txw-help" data-tone={a.status === 'ready' ? undefined : 'warn'}>
        {STATUS_TEXT[a.status]}
      </span>
      <div>
        <button type="button" className="btn ghost small" onClick={() => onChange(a)}>
          Change…
        </button>
      </div>
    </div>
  );
}

/** Rows of one gateway each, its environments side by side. */
function byGateway(accounts: GatewayAccount[]): GatewayAccount[][] {
  const groups = new Map<string, GatewayAccount[]>();
  for (const a of accounts) {
    const key = `${a.region}:${a.gateway}`;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  return [...groups.values()];
}

interface Props {
  /** Shown under the title; onboarding uses it to say the choice can wait. */
  note?: React.ReactNode;
}

export function GatewayAccountsSetting({ note }: Props) {
  const [accounts, setAccounts] = useState<GatewayAccount[] | null>(null);
  const [readState, setReadState] = useState<'reading' | 'read' | 'failed'>('reading');
  const [editing, setEditing] = useState<GatewayAccount | null>(null);
  const [outcome, setOutcome] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  const read = useCallback(async () => {
    setReadState('reading');
    const r = await send('GET', '/api/gateway-accounts');
    if (r.ok && isAccountList(r.body)) {
      setAccounts(r.body.accounts);
      setReadState('read');
    } else {
      setReadState('failed');
    }
  }, []);
  useEffect(() => {
    void read();
  }, [read]);

  const save = async (v: Record<string, string>) => {
    const a = editing;
    if (!a) return;
    // The drawer closes on every outcome: a password must not sit in it for a resubmit.
    setEditing(null);
    const r = await send('PUT', `/api/gateway-accounts/${a.region}/${a.gateway}/${a.environment}`, changeBody(a, v));
    setOutcome(
      r.ok
        ? { tone: 'ok', text: `${a.label}, ${ENV_LABEL[a.environment].toLowerCase()}: saved and recorded in the audit trail.` }
        : { tone: 'warn', text: refusalText(r.status, r.body) },
    );
    await read();
  };

  let body: React.ReactNode;
  if (accounts) {
    body = byGateway(accounts).map((group) => (
      <div className="txw-row" key={`${group[0].region}:${group[0].gateway}`}>
        <div className="txw-row-l">
          {group[0].label}
          <small>{group[0].agency}</small>
        </div>
        <div className="txw-row-r-grid">
          {group.map((a) => (
            <AccountCell key={a.environment} account={a} onChange={setEditing} />
          ))}
        </div>
      </div>
    ));
  } else if (readState === 'reading') {
    body = <span className="txw-help">Reading the gateway accounts…</span>;
  } else {
    body = (
      <span className="txw-help" data-tone="warn">
        The gateway accounts could not be read, so none is shown.{' '}
        <button type="button" className="btn ghost small" onClick={() => void read()}>
          Retry
        </button>
      </span>
    );
  }

  return (
    <div className="txw-set-card" data-testid="gateway-accounts-setting">
      <div className="txw-set-head">
        <div className="txw-set-head-l">
          <div className="txw-set-eyebrow">Submissions</div>
          <h2 className="txw-set-title">Agency gateway accounts</h2>
          <p className="txw-set-sub">
            For each agency gateway, choose whose account your submissions go out under: the platform's, operated
            for you, or your organisation's own. Choose separately for test and production. Each change needs
            your password and a reason, and is recorded in the audit trail.
          </p>
          {note}
        </div>
      </div>
      <div className="txw-set-body">
        <div
          className={outcome ? 'txw-help' : undefined}
          data-tone={outcome?.tone === 'warn' ? 'warn' : undefined}
          role="status"
          aria-live="polite"
        >
          {outcome?.text ?? null}
        </div>
        {body}
      </div>
      {editing && <C2CForm config={changeForm(editing)} onCancel={() => setEditing(null)} onSubmit={(v) => void save(v)} />}
    </div>
  );
}
