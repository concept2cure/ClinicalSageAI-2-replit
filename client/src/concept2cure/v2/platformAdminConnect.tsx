/**
 * Data layer for the INTERNAL platform consoles (Master Administration +
 * Business Center) — deliberately NOT dataConnect's `live ?? fixture`
 * contract. These are operator consoles over cross-tenant estate data
 * (HANDOFF_TO_DESIGN_master_admin_business_center.md): rendering fabricated
 * sample rows here would be actively misleading, so there are no fixtures.
 * Every view gets the four honest states instead:
 *
 *   loading   → calm skeleton text
 *   401       → route to sign-in (unauthenticated)
 *   403       → non-leaky access-denied (no data hints, no counts)
 *   error     → message + retry
 *
 * Reads go through fetch with the project's standard auth headers
 * (Bearer + x-organization-id) so 401/403 arrive as inspectable statuses
 * rather than thrown strings; governed writes use adminSend() which never
 * throws and always surfaces the server's reason.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { getAuthHeaders } from '@/utils/authToken';
import { I } from './icons';

export interface AdminFetchState<T> {
  data: T | null;
  loading: boolean;
  /** HTTP status of the last response; null when the request itself failed. */
  status: number | null;
  error: string | null;
}

async function readError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  if (body && typeof body === 'object' && typeof (body as any).error === 'string') {
    return (body as any).error;
  }
  return `HTTP ${res.status}`;
}

export function useAdminGet<T>(
  path: string | null,
  deps: React.DependencyList = [path],
): AdminFetchState<T> & { retry: () => void } {
  const [state, setState] = useState<AdminFetchState<T>>({
    data: null,
    loading: Boolean(path),
    status: null,
    error: null,
  });
  const [bump, setBump] = useState(0);
  const retry = useCallback(() => setBump((b) => b + 1), []);

  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setState({ data: null, loading: false, status: null, error: null });
      return undefined;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    fetch(path, { headers: getAuthHeaders(), credentials: 'include' })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setState({
            data: null,
            loading: false,
            status: res.status,
            error: res.status === 401 || res.status === 403 ? null : await readError(res),
          });
          return;
        }
        const data = (await res.json().catch(() => null)) as T | null;
        setState({
          data,
          loading: false,
          status: res.status,
          error: data === null ? 'Malformed response' : null,
        });
      })
      .catch((e) => {
        if (cancelled) return;
        setState({
          data: null,
          loading: false,
          status: null,
          error: e instanceof Error ? e.message : String(e),
        });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, bump]);

  return { ...state, retry };
}

/** Governed write — resolves with the outcome, never throws. */
export async function adminSend(
  method: 'PATCH' | 'POST' | 'DELETE',
  path: string,
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; status: number | null; error: string | null; body: unknown }> {
  try {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const parsed = await res.json().catch(() => null);
    return {
      ok: res.ok,
      status: res.status,
      error: res.ok
        ? null
        : parsed && typeof (parsed as any).error === 'string'
          ? (parsed as any).error
          : `HTTP ${res.status}`,
      body: parsed,
    };
  } catch (e) {
    return {
      ok: false,
      status: null,
      error: e instanceof Error ? e.message : String(e),
      body: null,
    };
  }
}

/** Authenticated blob download (Bearer-gated CSV exports — an <a href> cannot
 *  carry the JWT). */
export async function adminDownload(path: string, filename: string): Promise<boolean> {
  try {
    const res = await fetch(path, { headers: getAuthHeaders(), credentials: 'include' });
    if (!res.ok) return false;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return true;
  } catch (_e) {
    return false;
  }
}

/* ── Formatting (cents → currency, timestamps, numbers) ─────────────────────── */

export function usd(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return '--';
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
}

export function pct(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '--';
  return `${v}%`;
}

export function num(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '--';
  return v.toLocaleString('en-US');
}

/** Relative "3d ago" with the absolute ISO timestamp for the title tooltip. */
export function ago(iso: string | null | undefined): { rel: string; abs: string } {
  if (!iso) return { rel: 'never', abs: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { rel: String(iso), abs: '' };
  const abs = d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const ms = Date.now() - d.getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return { rel: 'just now', abs };
  if (mins < 60) return { rel: `${mins}m ago`, abs };
  const hours = Math.round(mins / 60);
  if (hours < 48) return { rel: `${hours}h ago`, abs };
  const days = Math.round(hours / 24);
  if (days < 60) return { rel: `${days}d ago`, abs };
  return { rel: d.toISOString().slice(0, 10), abs };
}

export function uptime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '--';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/* ── Shared console states ──────────────────────────────────────────────────── */

export function ConsoleLoading({ label }: { label: string }) {
  return (
    <div className="scaf-note" role="status" style={{ marginTop: 8 }}>
      Loading {label}...
    </div>
  );
}

export function ConsoleError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        padding: '12px 14px',
        borderRadius: 8,
        border: '1px solid var(--error)',
        background: 'color-mix(in srgb,var(--error) 8%,transparent)',
        fontSize: 12.5,
        maxWidth: 560,
        marginTop: 8,
      }}
    >
      <span style={{ color: 'var(--error)' }}>{I.alertTriangle}</span>
      <span style={{ flex: 1 }}>Could not load -- {error}</span>
      <button className="sp-ask" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

/**
 * Non-leaky access gate. 401 routes to sign-in; 403 renders a denial with NO
 * data hints (per the SOW: an unauthorized viewer must learn nothing about
 * the estate — not even that data exists behind the door).
 */
export function ConsoleDenied({ status, tierLabel }: { status: 401 | 403; tierLabel: string }) {
  if (status === 401) {
    return (
      <div style={{ maxWidth: 480, margin: '48px auto', textAlign: 'center' }}>
        <div style={{ fontSize: 22, marginBottom: 8 }}>{I.lock}</div>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Sign in required</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-400)', marginBottom: 14 }}>
          Your session has expired or you are not signed in.
        </div>
        <a className="sp-primary" style={{ textDecoration: 'none', padding: '8px 16px' }} href="/concept2cure/login">
          Go to sign-in
        </a>
      </div>
    );
  }
  return (
    <div style={{ maxWidth: 480, margin: '48px auto', textAlign: 'center' }}>
      <div style={{ fontSize: 22, marginBottom: 8 }}>{I.lock}</div>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Restricted console</div>
      <div style={{ fontSize: 12.5, color: 'var(--text-400)' }}>
        This area is limited to {tierLabel}. Your account does not hold that access. If you
        believe it should, ask a platform administrator to grant it from Access management.
      </div>
    </div>
  );
}

/* ── Governed reason-for-change dialog (Part 11 posture) ────────────────────── */

export interface ReasonDialogProps {
  title: string;
  /** Plain statement of what will happen — shown before the reason field. */
  consequence: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function ReasonDialog({
  title,
  consequence,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: ReasonDialogProps) {
  const [reason, setReason] = useState('');
  const valid = reason.trim().length >= 3;
  return (
    <div className="esign-bd" onClick={onCancel}>
      <div className="esign-modal gov-modal" onClick={(e) => e.stopPropagation()}>
        <div className="esign-h">
          <span className="ico" style={danger ? { color: 'var(--error)' } : undefined}>
            {danger ? I.alertTriangle : I.shieldCheck}
          </span>
          <div style={{ flex: 1 }}>
            <div className="t">{title}</div>
            <div className="sub" style={{ fontSize: 11, color: 'var(--text-400)', marginTop: 2 }}>
              Governed action -- reason recorded in the tamper-evident audit trail
            </div>
          </div>
          <button className="tbtn" onClick={onCancel} aria-label="Cancel">
            {I.close}
          </button>
        </div>
        <div className="gov-body">
          <div
            className="gov-notice"
            style={
              danger
                ? { borderColor: 'var(--error)', background: 'color-mix(in srgb,var(--error) 7%,transparent)' }
                : undefined
            }
          >
            <span className="ico" style={{ color: danger ? 'var(--error)' : 'var(--accent-200)' }}>
              {danger ? I.alertTriangle : I.lock}
            </span>
            <span>{consequence}</span>
          </div>
          <label className="gov-field">
            <span className="gov-label">Reason for change (required, min 3 chars)</span>
            <textarea
              className="gov-textarea"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Client requested suspension pending contract renewal"
              autoFocus
            />
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="sp-ask" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button
              className="sp-primary"
              style={danger ? { background: 'var(--error)' } : undefined}
              disabled={!valid || busy}
              onClick={() => valid && onConfirm(reason.trim())}
            >
              {busy ? 'Working...' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Small shared widgets ───────────────────────────────────────────────────── */

export function StatusChip({ value }: { value: string | null | undefined }) {
  const v = String(value ?? '--');
  const tone =
    v === 'active' || v === 'healthy' || v === 'completed'
      ? 'ok'
      : v === 'suspended' || v === 'past_due' || v === 'failed' || v === 'degraded'
        ? 'err'
        : v === 'trialing' || v === 'incomplete' || v === 'running' || v === 'pending'
          ? 'warn'
          : 'idle';
  return <span className={`rd-chip tone-${tone}`}>{v}</span>;
}

export function KpiCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: 'ok' | 'warn' | 'err';
}) {
  return (
    <div
      className="pj-card"
      style={{ padding: '12px 14px', minWidth: 148, flex: '1 1 148px' }}
    >
      <div style={{ fontSize: 11, color: 'var(--text-400)', fontWeight: 500 }}>{label}</div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 650,
          fontVariantNumeric: 'tabular-nums',
          marginTop: 2,
          color:
            tone === 'err' ? 'var(--error)' : tone === 'warn' ? 'var(--warning)' : tone === 'ok' ? 'var(--success)' : 'var(--text-100)',
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 10.5, color: 'var(--text-400)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/** Timestamp cell — relative, with absolute UTC in the tooltip. */
export function When({ iso }: { iso: string | null | undefined }) {
  const t = ago(iso);
  return (
    <span className="mono" style={{ fontSize: 11, color: 'var(--text-400)' }} title={t.abs}>
      {t.rel}
    </span>
  );
}
