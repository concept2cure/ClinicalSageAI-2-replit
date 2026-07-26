/**
 * Report Governance — the sealed-report lifecycle over intelligent-reports.
 *
 * Registry id: `report-governance`.
 *
 * Wired to server/routes/intelligent-reports.ts (mounted
 * /api/intelligent-reports, org-scoped from the JWT — the :organizationId path
 * segment is deliberately ignored server-side):
 *   • GET  /list/:org             — the org's governed reports ({data, count})
 *   • GET  /:id/verify            — cryptographic integrity check of a sealed
 *                                   record (content hash / merkle chain)
 *   • GET  /:id/provenance        — provenance atoms; GET /:id/attestations
 *   • POST /:id/seal {justification}   — seal the record
 *   • POST /:id/revoke {justification} — revoke a sealed record
 *
 * The Insights surface covers generate→render for report-os; THIS surface is
 * the governance-of-reports loop (verify/seal/revoke + provenance) that had no
 * consumer. Honest everywhere: live list or honest empty/error; verify verdicts
 * and hashes come only from the server; seal/revoke require a justification and
 * refetch so status is the server's.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { EmptyState } from '../dataConnect';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import { apiRequest } from '@/lib/queryClient';
import '../styles/project-home-v2.css';

interface GovReport {
  id: number;
  reportCode?: string | null;
  title?: string | null;
  domain?: string | null;
  sealStatus?: string | null;
  seal_status?: string | null;
  complianceScore?: number | null;
  verificationCode?: string | null;
  createdAt?: string | null;
}

function useToast(): [string, (m: string) => void] {
  const [msg, setMsg] = useState('');
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fire = useCallback((m: string) => { setMsg(m); if (t.current) clearTimeout(t.current); t.current = setTimeout(() => setMsg(''), 4200); }, []);
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
function sealTone(s: string | null | undefined) {
  const v = String(s ?? '').toLowerCase();
  return v === 'sealed' ? 'ok' : v === 'revoked' ? 'err' : 'warn';
}
const JUSTIFY_FORM = (verb: string, title: string): C2CFormConfig => ({
  eyebrow: 'Report governance',
  title: verb + ' report',
  sub: `“${title}” — the justification is recorded with the ${verb.toLowerCase()} event.`,
  governed: true, submitLabel: verb,
  fields: [{ key: 'justification', label: 'Justification', type: 'textarea', required: true, placeholder: 'Why this record is being ' + verb.toLowerCase() + 'd' }],
});

export function ReportGovernance(_props: SurfaceViewProps) {
  const [reports, setReports] = useState<GovReport[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [verifyRes, setVerifyRes] = useState<{ id: number; verdict: Record<string, unknown> } | null>(null);
  const [detail, setDetail] = useState<{ id: number; provenance: number; attestations: number } | null>(null);
  const [dialog, setDialog] = useState<{ kind: 'seal' | 'revoke'; report: GovReport } | null>(null);
  const [toast, fireToast] = useToast();

  const load = useCallback(async () => {
    setState('loading');
    // The org segment is ignored server-side (JWT wins); 0 is a placeholder.
    const { ok, data } = await readData<GovReport[]>('GET', '/api/intelligent-reports/list/0');
    if (!ok) { setState('error'); return; }
    setReports(Array.isArray(data) ? data : []);
    setState('ready');
  }, []);
  useEffect(() => { void load(); }, [load]);

  const verify = useCallback(async (r: GovReport) => {
    const { ok, status, data } = await readData<Record<string, unknown>>('GET', `/api/intelligent-reports/${r.id}/verify`);
    if (!ok || !data) { fireToast(status === 401 ? 'Sign in to verify.' : `Verification didn’t run (HTTP ${status}).`); return; }
    setVerifyRes({ id: r.id, verdict: data });
  }, [fireToast]);

  const inspect = useCallback(async (r: GovReport) => {
    const [p, a] = await Promise.all([
      readData<unknown[]>('GET', `/api/intelligent-reports/${r.id}/provenance`),
      readData<unknown[]>('GET', `/api/intelligent-reports/${r.id}/attestations`),
    ]);
    setDetail({ id: r.id, provenance: Array.isArray(p.data) ? p.data.length : 0, attestations: Array.isArray(a.data) ? a.data.length : 0 });
  }, []);

  const act = useCallback(async (v: Record<string, string>) => {
    if (!dialog) return;
    const { kind, report } = dialog;
    const { ok, status } = await readData('POST', `/api/intelligent-reports/${report.id}/${kind}`, { justification: v.justification });
    if (!ok) { fireToast(status === 401 ? 'Sign in first.' : `Couldn’t ${kind} the report (HTTP ${status}). Nothing changed.`); return; }
    setDialog(null);
    fireToast('Report ' + (kind === 'seal' ? 'sealed' : 'revoked') + ' · ' + (report.reportCode ?? report.id) + '.');
    void load();
  }, [dialog, load, fireToast]);

  const verdictRows = (v: Record<string, unknown>): Array<[string, string]> =>
    Object.entries(v)
      .filter(([, val]) => ['string', 'number', 'boolean'].includes(typeof val))
      .map(([k, val]) => [k, String(val)]);

  return (
    <div className="cm-body">
      <div className="pj-card">
        <div className="pj-card-h"><span className="t">Governed reports</span><span className="s">{reports.length} · /api/intelligent-reports</span></div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          {state === 'loading' ? <div style={{ padding: 16 }}><EmptyState icon={I.scroll} title="Loading governed reports…" /></div>
            : state === 'error' ? <div style={{ padding: 16 }}><EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load governed reports" hint="GET /api/intelligent-reports/list didn’t respond. Sign in to your tenant and retry." /></div>
            : reports.length === 0 ? <div style={{ padding: 16 }}><EmptyState icon={I.scroll} title="No governed reports yet" hint="Reports generated through the intelligent-reports engine appear here with their seal status, integrity verification, and provenance." /></div>
            : <table className="reg-tbl"><thead><tr><th>Code</th><th>Title</th><th>Domain</th><th>Seal</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>{reports.map((r) => {
                const seal = r.sealStatus ?? r.seal_status;
                return (
                  <tr key={r.id}>
                    <td className="mono">{r.reportCode ?? '#' + r.id}</td>
                    <td>{r.title ?? '—'}</td>
                    <td>{r.domain ?? '—'}</td>
                    <td><span className={'rd-chip tone-' + sealTone(seal)}>{seal ?? 'draft'}</span></td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="nda-open" onClick={() => verify(r)}>{I.shieldCheck} Verify</button>
                      <button className="nda-open" style={{ marginLeft: 6 }} onClick={() => inspect(r)}>{I.eye} Provenance</button>
                      {String(seal).toLowerCase() !== 'sealed' && String(seal).toLowerCase() !== 'revoked' && (
                        <button className="nda-open" style={{ marginLeft: 6 }} onClick={() => setDialog({ kind: 'seal', report: r })}>{I.lock} Seal</button>
                      )}
                      {String(seal).toLowerCase() === 'sealed' && (
                        <button className="nda-open" style={{ marginLeft: 6 }} onClick={() => setDialog({ kind: 'revoke', report: r })}>{I.alertTriangle} Revoke</button>
                      )}
                    </td>
                  </tr>
                );
              })}</tbody></table>}
        </div>
      </div>

      {verifyRes && (
        <div className="pj-card">
          <div className="pj-card-h"><span className="t">Integrity verification · report {verifyRes.id}</span><span className="s">GET /:id/verify</span></div>
          <div className="pj-card-b" style={{ padding: 0 }}>
            {verdictRows(verifyRes.verdict).length === 0
              ? <div style={{ padding: 16 }}><EmptyState icon={I.shieldCheck} title="Verification ran" hint="The server returned no scalar verdict fields to tabulate." /></div>
              : <table className="reg-tbl"><tbody>{verdictRows(verifyRes.verdict).map(([k, v]) => (
                  <tr key={k}><td>{k}</td><td style={{ textAlign: 'right' }} className="mono">{v}</td></tr>))}</tbody></table>}
          </div>
        </div>
      )}

      {detail && (
        <div className="pj-con" style={{ margin: '0 0 14px' }}>
          <span className="ico">{I.eye}</span>
          <div><div className="pj-con-t">Report {detail.id} — {detail.provenance} provenance atom(s) · {detail.attestations} attestation(s)</div>
            <div className="pj-con-d">Counts come from the report’s recorded provenance and attestation rows.</div></div>
        </div>
      )}

      {dialog && (
        <C2CForm
          config={JUSTIFY_FORM(dialog.kind === 'seal' ? 'Seal' : 'Revoke', dialog.report.title ?? String(dialog.report.id))}
          onCancel={() => setDialog(null)}
          onSubmit={act}
        />
      )}
      <C2CToast msg={toast} />
    </div>
  );
}
