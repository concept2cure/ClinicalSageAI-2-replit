import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest, ApiRequestError } from '@/lib/queryClient';
import { getJwtOrgId } from '@/utils/authToken';
import '../styles/translation-v2.css';

/**
 * Whether this organisation requires PDF/A for its production submissions
 * (D7, the PDF/A rule decided 2026-10-01; server/services/ectd/pdfa-requirement.ts).
 *
 *   GET   /api/organizations/:id/settings   settings.submission.requirePdfA
 *   PATCH /api/organizations/:id/settings   { settings: { submission: { requirePdfA } }, reason }
 *
 * Off by default: every agency the platform transmits to accepts plain PDF
 * 1.4–1.7 as well as PDF/A. On, a production transmit with any PDF leaf that is
 * not PDF/A is refused before it leaves, and the refusal names this setting.
 * The route audits the change with its reason and requires an organisation
 * administrator; a refusal is shown as refused. A read that fails is shown as
 * unread, never as "Off". `:id` is the organisationId claim on the caller's own
 * token, as Setup uses it.
 */

type Read = { state: 'reading' } | { state: 'failed' } | { state: 'read'; on: boolean };

function requireFrom(body: unknown): boolean | null {
  const settings = (body as { settings?: unknown } | null)?.settings;
  if (!settings || typeof settings !== 'object') return null;
  return (settings as { submission?: { requirePdfA?: unknown } }).submission?.requirePdfA === true;
}

async function send(
  method: 'GET' | 'PATCH',
  path: string,
  body?: unknown
): Promise<{ ok: boolean; status: number; body: unknown }> {
  try {
    const res = await apiRequest(method, path, body);
    return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) };
  } catch (err) {
    if (err instanceof ApiRequestError)
      return { ok: false, status: err.status, body: err.payload ?? null };
    return { ok: false, status: 0, body: null };
  }
}

function refused(status: number): string {
  if (status === 0) return 'Not changed: the server could not be reached.';
  if (status === 403) return "Not changed: only the organisation's administrator can change this.";
  return `Not changed (HTTP ${status}).`;
}

interface ValueProps {
  read: Read;
  confirming: boolean;
  reason: string;
  saving: boolean;
  onReason: (v: string) => void;
  onRetry: () => void;
  onAsk: () => void;
  onConfirm: (on: boolean) => void;
  onCancel: () => void;
}

/** The value column: unread, read, or the confirmation that takes a reason. */
function PdfAValue({
  read,
  confirming,
  reason,
  saving,
  onReason,
  onRetry,
  onAsk,
  onConfirm,
  onCancel,
}: ValueProps) {
  if (read.state === 'reading') return <span className="txw-help">Reading…</span>;
  if (read.state === 'failed') {
    return (
      <span className="txw-help" data-tone="warn">
        Could not be read.{' '}
        <button type="button" className="btn ghost small" onClick={onRetry}>
          Retry
        </button>
      </span>
    );
  }
  if (!confirming) {
    return (
      <div className="txw-row-r-grid">
        <span>{read.on ? 'Required' : 'Not required'}</span>
        <button
          type="button"
          className="btn ghost small"
          aria-label="Require PDF/A for production submissions"
          onClick={onAsk}
        >
          Change…
        </button>
      </div>
    );
  }
  return (
    <>
      <input
        aria-label="Reason for the change"
        className="txw-gov-field"
        placeholder="Reason (recorded)"
        value={reason}
        onChange={e => onReason(e.target.value)}
      />
      <div className="txw-row-r-grid">
        <button
          type="button"
          className="btn primary small"
          disabled={saving || reason.trim().length < 3}
          onClick={() => onConfirm(!read.on)}
        >
          {read.on ? 'Stop requiring PDF/A' : 'Require PDF/A'}
        </button>
        <button type="button" className="btn ghost small" disabled={saving} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </>
  );
}

export function PdfARequirementSetting() {
  const path = useMemo(
    () => `/api/organizations/${encodeURIComponent(getJwtOrgId())}/settings`,
    []
  );
  const [read, setRead] = useState<Read>({ state: 'reading' });
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  const load = useCallback(async () => {
    setRead({ state: 'reading' });
    const r = await send('GET', path);
    const on = r.ok ? requireFrom(r.body) : null;
    setRead(on === null ? { state: 'failed' } : { state: 'read', on });
  }, [path]);
  useEffect(() => {
    void load();
  }, [load]);

  const change = async (on: boolean) => {
    setSaving(true);
    const r = await send('PATCH', path, {
      settings: { submission: { requirePdfA: on } },
      reason: reason.trim(),
    });
    setSaving(false);
    setConfirming(false);
    setReason('');
    setNote(
      r.ok
        ? { tone: 'ok', text: 'Saved and recorded in the audit trail.' }
        : { tone: 'warn', text: refused(r.status) }
    );
    await load();
  };

  return (
    <div className="txw-set-card">
      <div className="txw-set-head">
        <div className="txw-set-head-l">
          <div className="txw-set-eyebrow">Submissions</div>
          <h2 className="txw-set-title">Submission files</h2>
          <p className="txw-set-sub">
            What every production submission's files must be, beyond what the agency requires.
          </p>
        </div>
      </div>
      <div className="txw-set-body">
        <div className="txw-row" data-testid="pdfa-requirement-setting">
          <div className="txw-row-l">
            Require PDF/A
            <small>
              FDA, EMA and the other agencies accept plain PDF 1.4–1.7 as well as PDF/A, so this is
              off unless your own procedures require PDF/A. On, a production submission with any PDF
              that is not PDF/A is refused before it is sent.
            </small>
          </div>
          <div className="txw-row-r">
            <PdfAValue
              read={read}
              confirming={confirming}
              reason={reason}
              saving={saving}
              onReason={setReason}
              onRetry={() => void load()}
              onAsk={() => {
                setNote(null);
                setConfirming(true);
              }}
              onConfirm={on => void change(on)}
              onCancel={() => setConfirming(false)}
            />
            <div
              className={note ? 'txw-help' : undefined}
              data-tone={note?.tone === 'warn' ? 'warn' : undefined}
              role="status"
              aria-live="polite"
            >
              {note?.text ?? null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
