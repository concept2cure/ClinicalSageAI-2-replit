/**
 * Submission Gateway Transmittals — the "file to the agency" surface.
 *
 * Registry id: `gateway-transmittals`.
 *
 * Wired to the real multi-region dispatch layer
 * (server/routes/mdx-submission-gateway.ts, mounted /api/mdx, org-scoped from
 * the JWT; envelope {data, meta}):
 *   • GET  /gateways?environment=            — the region gateways + whether
 *                                              credentials are configured
 *   • GET  /gateways/transmittals            — the org's transmittal log
 *   • POST /gateways/:region/:gateway/transmit — governed transmit (reason ≥8
 *          + §11 re-auth password/TOTP, verified server-side; 409 = an active
 *          transmittal already holds the lock)
 *   • GET  /gateways/transmittals/:id/status — poll the gateway
 *   • GET  /gateways/transmittals/:id/ack    — download the ACK (binary)
 *   • POST /gateways/transmittals/:id/rollback — governed rollback (reason ≥8)
 *
 * HONESTY: gateways and the transmittal log render live data or honest
 * empty/error states. Transmit/rollback are real awaited writes gated by the
 * server's re-auth; a 401 (re-auth failed), 412 (credentials not configured),
 * 422 (structural gate), and the 409 active-transmittal lock are each surfaced
 * with the server's own reason.
 *
 * The ACK download states WHO WROTE THE BYTES. Only an FDA AS2 MDN is an agency
 * artefact; for every other gateway the platform composes a record from its own
 * transmittal row, and this surface used to hand that file over with the words
 * "the agency's actual bytes" — enough for a sponsor to archive a document
 * Concept2Cure wrote as proof an agency received a submission. The server sends
 * provenance on X-Ack-Provenance and names the file accordingly; the toast below
 * says which one arrived.
 *
 * Rollback is likewise scoped honestly: it records a rollback in THIS platform's
 * audit trail and frees the transmit lock. It does not retract anything at the
 * agency, and the copy no longer implies that it does.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { EmptyState } from '../dataConnect';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import { apiRequest } from '@/lib/queryClient';
import '../styles/project-home-v2.css';

interface GatewayInfo { region?: string; gateway?: string; name?: string; configured?: boolean; environment?: string; [k: string]: unknown; }
interface Transmittal {
  id: number; region: string; gateway: string; format?: string | null; submission_type?: string | null;
  transmission_id?: string | null; status: string; error_class?: string | null; error_message?: string | null;
  submitted_at?: string | null; ack_received_at?: string | null; completed_at?: string | null;
}

const REGIONS = ['fda', 'ema', 'pmda', 'ca'];
const GATEWAYS = ['esg', 'cesp', 'eudamed', 'pmda_gateway', 'hc_cesg'];

function useToast(): [string, (m: string) => void] {
  const [msg, setMsg] = useState('');
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fire = useCallback((m: string) => { setMsg(m); if (t.current) clearTimeout(t.current); t.current = setTimeout(() => setMsg(''), 5200); }, []);
  return [msg, fire];
}
function C2CToast({ msg }: { msg: string }) {
  if (!msg) return null;
  return <div className="de-toast"><span className="ico">{I.checkCircle}</span>{msg}</div>;
}
async function readData<T = any>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T | null; raw: any }> {
  try {
    const res = await apiRequest(method, path, body);
    const parsed = (await res.json().catch(() => null)) as any;
    return { ok: res.ok, status: res.status, data: (parsed?.data ?? null) as T | null, raw: parsed };
  } catch { return { ok: false, status: 0, data: null, raw: null }; }
}
function statusTone(s: string) {
  const v = s.toLowerCase();
  if (v.includes('ack') || v.includes('complete') || v.includes('success')) return 'ok';
  if (v.includes('fail') || v.includes('error') || v.includes('reject')) return 'err';
  return 'warn';
}

const TRANSMIT_FORM: C2CFormConfig = {
  eyebrow: 'Regulatory dispatch · §11 re-authentication',
  title: 'Transmit to agency gateway',
  sub: 'The transmit is gated server-side: your credentials are re-verified, the structural gate runs, and the transmittal is recorded before transport.',
  governed: true, submitLabel: 'Transmit',
  fields: [
    { key: 'region', label: 'Region', type: 'select', options: REGIONS, default: 'fda', half: true },
    { key: 'gateway', label: 'Gateway', type: 'select', options: GATEWAYS, default: 'esg', half: true },
    { key: 'packageId', label: 'Package id (stored bundle)', type: 'number', half: true, desc: 'Numeric submission package whose stored bundle descriptor is transmitted.' },
    { key: 'submissionType', label: 'Submission type', type: 'text', half: true, placeholder: 'e.g. original' },
    { key: 'reason', label: 'Reason for transmission (governed)', type: 'textarea', required: true, placeholder: 'At least 8 characters — recorded with the transmittal.' },
    { key: 'password', label: 'Password (re-authentication)', type: 'password', required: true, half: true },
    { key: 'totp', label: 'Authentication code (if enabled)', type: 'text', half: true },
  ],
};
const ROLLBACK_FORM = (id: number): C2CFormConfig => ({
  eyebrow: 'Regulatory dispatch',
  title: `Roll back transmittal #${id}`,
  sub: 'Records the rollback in this platform’s Part 11 audit trail and frees the transmit lock. '
     + 'It does NOT retract the submission at the agency — the agency still holds the transmitted '
     + 'bytes, and you must file the agency-side retraction directly (FDA: WebTrader).',
  governed: true, submitLabel: 'Roll back',
  fields: [
    { key: 'reason', label: 'Reason (governed)', type: 'textarea', required: true, placeholder: 'At least 8 characters.' },
    { key: 'password', label: 'Password (re-authentication)', type: 'password', half: true },
    { key: 'totp', label: 'Authentication code', type: 'text', half: true },
  ],
});

export function GatewayTransmittals(_props: SurfaceViewProps) {
  const [gateways, setGateways] = useState<GatewayInfo[]>([]);
  const [rows, setRows] = useState<Transmittal[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [dialog, setDialog] = useState<'transmit' | { rollback: number } | null>(null);
  const [statusView, setStatusView] = useState<{ id: number; body: Record<string, unknown> } | null>(null);
  const [toast, fireToast] = useToast();

  const load = useCallback(async () => {
    setState('loading');
    const [g, t] = await Promise.all([
      readData<GatewayInfo[]>('GET', '/api/mdx/gateways'),
      readData<Transmittal[]>('GET', '/api/mdx/gateways/transmittals'),
    ]);
    if (!t.ok && !g.ok) { setState('error'); return; }
    setGateways(Array.isArray(g.data) ? g.data : []);
    setRows(Array.isArray(t.data) ? t.data : []);
    setState('ready');
  }, []);
  useEffect(() => { void load(); }, [load]);

  const transmit = useCallback(async (v: Record<string, string>) => {
    const region = v.region || 'fda';
    const gateway = v.gateway || 'esg';
    const body: Record<string, unknown> = {
      reason: v.reason,
      reauth: { password: v.password, totp: v.totp || undefined },
    };
    if (v.packageId) body.packageId = Number(v.packageId);
    if (v.submissionType) body.submissionType = v.submissionType;
    const { ok, status, raw } = await readData('POST', `/api/mdx/gateways/${region}/${gateway}/transmit`, body);
    if (status === 401) { fireToast('Not transmitted — re-authentication failed (§11). Nothing left the platform.'); return; }
    if (status === 409) {
      const held = (raw as any)?.data ?? raw;
      fireToast(`Not transmitted — transmittal #${held?.transmittalId ?? '?'} is already active (${held?.status ?? 'in flight'}). Roll it back first.`);
      return;
    }
    if (status === 412) { fireToast('Not transmitted — gateway credentials are not configured for this environment.'); return; }
    if (status === 422) { fireToast('Not transmitted — the structural gate rejected the bundle: ' + ((raw as any)?.error ?? 'validation failed') + '.'); return; }
    if (!ok) { fireToast(`Transmit failed (HTTP ${status}) — ` + ((raw as any)?.error ?? 'nothing was sent') + '.'); return; }
    setDialog(null);
    const txId = (raw as any)?.data?.result?.transactionId ?? (raw as any)?.data?.transactionId;
    fireToast('Transmitted via ' + region.toUpperCase() + '/' + gateway + (txId ? ' · gateway ref ' + txId : '') + '.');
    void load();
  }, [load, fireToast]);

  const checkStatus = useCallback(async (id: number) => {
    const { ok, status, data } = await readData<Record<string, unknown>>('GET', `/api/mdx/gateways/transmittals/${id}/status`);
    if (!ok || !data) { fireToast(`Status check failed (HTTP ${status}).`); return; }
    setStatusView({ id, body: data });
    void load();
  }, [load, fireToast]);

  const downloadAck = useCallback(async (id: number) => {
    try {
      const res = await apiRequest('GET', `/api/mdx/gateways/transmittals/${id}/ack`);
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        fireToast('No ACK available — ' + ((json as any)?.error ?? `HTTP ${res.status}`) + '.');
        return;
      }
      const provenance = res.headers.get('X-Ack-Provenance');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = provenance === 'agency'
        ? `agency-acknowledgement-${id}.txt`
        : `concept2cure-transmittal-record-${id}-NOT-AN-AGENCY-ACK.txt`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      fireToast(provenance === 'agency'
        ? 'Agency acknowledgment downloaded — the agency’s own bytes.'
        : 'Downloaded this platform’s transmittal record. It is NOT an agency acknowledgment — obtain the agency receipt from the agency portal.');
    } catch (e) {
      fireToast('ACK download failed — ' + (e instanceof Error ? e.message : String(e)) + '.');
    }
  }, [fireToast]);

  const rollback = useCallback(async (v: Record<string, string>) => {
    if (!dialog || dialog === 'transmit') return;
    const id = dialog.rollback;
    const { ok, status, raw } = await readData('POST', `/api/mdx/gateways/transmittals/${id}/rollback`, {
      reason: v.reason, reauth: v.password ? { password: v.password, totp: v.totp || undefined } : undefined,
    });
    if (status === 401) { fireToast('Not rolled back — re-authentication failed.'); return; }
    if (!ok) { fireToast(`Rollback failed (HTTP ${status}) — ` + ((raw as any)?.error ?? 'nothing changed') + '.'); return; }
    setDialog(null);
    fireToast(`Transmittal #${id} marked rolled back in the audit trail. The agency still holds the transmitted bytes — file the agency-side retraction separately.`);
    void load();
  }, [dialog, load, fireToast]);

  return (
    <div className="cm-body">
      <div className="pj-card">
        <div className="pj-card-h">
          <span className="t">Agency gateways</span>
          <button className="btn primary" style={{ height: 32 }} onClick={() => setDialog('transmit')}>{I.upload || I.layers} Transmit</button>
        </div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          {state === 'loading' ? <div style={{ padding: 16 }}><EmptyState icon={I.layers} title="Loading gateways…" /></div>
            : state === 'error' ? <div style={{ padding: 16 }}><EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t reach the dispatch layer" hint="GET /api/mdx/gateways didn’t respond. Sign in to your tenant and retry." /></div>
            : gateways.length === 0 ? <div style={{ padding: 16 }}><EmptyState icon={I.layers} title="No gateways registered" hint="Region gateways (FDA ESG, EMA CESP, PMDA, Health Canada) appear here with their credential status." /></div>
            : <table className="reg-tbl"><thead><tr><th>Gateway</th><th>Region</th><th>Environment</th><th style={{ textAlign: 'right' }}>Credentials</th></tr></thead>
              <tbody>{gateways.map((g, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{String(g.name ?? g.gateway ?? '—')}</td>
                  <td className="mono">{String(g.region ?? '—').toUpperCase()}</td>
                  <td>{String(g.environment ?? '—')}</td>
                  <td style={{ textAlign: 'right' }}><span className={'rd-chip tone-' + (g.configured ? 'ok' : 'warn')}>{g.configured ? 'configured' : 'not configured'}</span></td>
                </tr>))}</tbody></table>}
        </div>
      </div>

      <div className="pj-card">
        <div className="pj-card-h"><span className="t">Transmittal log</span><span className="s">{rows.length}</span></div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          {rows.length === 0 ? <div style={{ padding: 16 }}><EmptyState icon={I.clock} title="No transmittals yet" hint="Every transmit is recorded here with its gateway reference, status, acknowledgment, and rollback history." /></div>
            : <table className="reg-tbl"><thead><tr><th>#</th><th>Route</th><th>Gateway ref</th><th>Status</th><th>Submitted</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>{rows.map((t) => (
                <tr key={t.id}>
                  <td className="mono">#{t.id}</td>
                  <td>{t.region.toUpperCase()} / {t.gateway}{t.submission_type ? ' · ' + t.submission_type : ''}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{t.transmission_id ?? '—'}</td>
                  <td><span className={'rd-chip tone-' + statusTone(t.status)}>{t.status}</span>
                    {t.error_message && <div style={{ fontSize: 11, color: 'var(--c2c-err,#b42318)' }}>{t.error_message}</div>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{t.submitted_at ? new Date(t.submitted_at).toLocaleString() : '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="nda-open" onClick={() => checkStatus(t.id)}>{I.zap} Status</button>
                    <button className="nda-open" style={{ marginLeft: 6 }} onClick={() => downloadAck(t.id)} disabled={!t.ack_received_at} title={t.ack_received_at ? 'Download the acknowledgment or transmittal record — the file states which' : 'Nothing to download yet'}>{I.download} ACK</button>
                    <button className="nda-open" style={{ marginLeft: 6 }} onClick={() => setDialog({ rollback: t.id })}>{I.rotateCcw} Rollback</button>
                  </td>
                </tr>))}</tbody></table>}
        </div>
      </div>

      {statusView && (
        <div className="pj-card">
          <div className="pj-card-h"><span className="t">Gateway status · transmittal #{statusView.id}</span><span className="s">live poll</span></div>
          <div className="pj-card-b" style={{ padding: 0 }}>
            <table className="reg-tbl"><tbody>
              {Object.entries(statusView.body).filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v)).map(([k, v]) => (
                <tr key={k}><td>{k}</td><td style={{ textAlign: 'right' }} className="mono">{String(v)}</td></tr>
              ))}
            </tbody></table>
          </div>
        </div>
      )}

      {dialog === 'transmit' && <C2CForm config={TRANSMIT_FORM} onCancel={() => setDialog(null)} onSubmit={transmit} />}
      {dialog && dialog !== 'transmit' && <C2CForm config={ROLLBACK_FORM(dialog.rollback)} onCancel={() => setDialog(null)} onSubmit={rollback} />}
      <C2CToast msg={toast} />
    </div>
  );
}
