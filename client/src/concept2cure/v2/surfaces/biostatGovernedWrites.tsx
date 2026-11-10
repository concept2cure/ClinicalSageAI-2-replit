/**
 * The bridge's two governed writes, and the reason each one asks for.
 *
 * Split out of `biostatBridge.tsx` on 2026-11-02 (RULE 6: a file split out of
 * a large one goes inside the folder it came from). That module had reached
 * exactly the repository's 500-line ceiling, so D5-3's assessment section
 * could not be built in it without the line gate going red — and these two
 * forms were the block that did not belong to the rest of it. The bridge
 * module is reads, placements and the two surfaces' renderings; these are the
 * writes, and they depend on nothing in it:
 * `computedTotalN`, `pct` and `muted` come from the engine-result half, the
 * form chrome from `C2CForm`, and `DesignAssessment` only as a type. Nothing
 * else imported them, so nothing else had to change.
 *
 * ── Honesty ──────────────────────────────────────────────────────────────────
 * Neither write fires on a click: each is a reason form, and the toast that
 * follows reports what the SERVER confirmed, never what was asked for. A
 * refusal is shown as the refusal it is, in the sentence the route wrote
 * (`bridgeRefusal` below, which exists because that sentence used to be
 * dropped in favour of "HTTP 422").
 *
 * @module client/src/concept2cure/v2/surfaces/biostatGovernedWrites
 */
import React, { useCallback, useMemo, useState } from 'react';
import { apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import { C2CForm } from '../C2CForm';
import { computedTotalN, muted, pct } from './biostatEngineResult';
import type { DesignAssessment } from './biostatBridge';

/**
 * The sentence the bridge actually sent with a refusal.
 *
 * Its route answers a refused write with the canonical error envelope
 * `{ error: '<CODE>', details: { message: '<sentence>' } }` — `clientError` in
 * server/lib/api-response, carrying `BridgeError.message`. `serverMessage`
 * reads `error.message`, `message`, `detail`, and a bare `error` that is not an
 * enum token; the bridge's sentence is at none of those, and `CANNOT_SIZE` IS
 * an enum token, so every bridge refusal degraded to "HTTP 422". The one part
 * an author can act on — the engine's own reason for refusing — was the part
 * that got dropped.
 *
 * So this reads the bridge's shape too, preferring the canonical reader where
 * it finds copy. `redactInternals` stays as the last gate: the sentence is copy
 * the route wrote, but this must not become a new route for driver text onto a
 * screen. With nothing usable it falls back to the status, which is at least
 * true.
 */
function bridgeRefusal(body: unknown, status: number): string {
  const detail = (body as { details?: { message?: unknown } } | null)?.details?.message;
  const sentence =
    serverMessage(body) ??
    (typeof detail === 'string' && detail.trim() ? redactInternals(detail, '') : '');
  return sentence || `the server returned HTTP ${status}`;
}


export function ApplySampleSizeForm({ assessment: a, onCancel, onDone, onError }: {
  assessment: DesignAssessment; onCancel: () => void; onDone: (msg: string) => void; onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  // computedTotalN, not a third copy of it: it is the one definition of "the
  // engine proposed a usable N", and it rejects a zero.
  const n = computedTotalN(a.computation);
  const submit = async (v: Record<string, string>) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiRequest('POST', `/api/biostat-bridge/designs/${encodeURIComponent(a.studyId)}/apply-sample-size`, { reason: v.reason ?? '' });
      const body = (await res.json().catch(() => null)) as { data?: { plannedSampleSize?: number; auditId?: string } } | null;
      if (!res.ok || !body?.data?.auditId) {
        onError('The sample size was not applied — ' + bridgeRefusal(body, res.status) + '. The design is unchanged.');
        return;
      }
      onDone(`Sample size ${body.data.plannedSampleSize} written to "${a.title}" — the write and its audit record committed together.`);
    } catch (e) {
      onError('The sample size was not applied — ' + (e instanceof Error ? e.message : String(e)) + '. The design is unchanged.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <C2CForm
      config={{
        eyebrow: 'Biostatistics · governed write',
        title: 'Apply sample size to the design',
        sub: `Writes ${n ?? '—'} subjects at ${pct(a.computation?.power ?? null)} power onto the statistical plan of "${a.title}" (currently ${a.readiness.plannedSampleSize ?? 'unset'}). The protocol, SAP and registration projections re-render from it.`,
        governed: true,
        submitLabel: busy ? 'Applying…' : 'Apply and record',
        fields: [{ key: 'reason', label: 'Reason for change', type: 'textarea', required: true, rows: 3, placeholder: 'Why this sample size is being adopted (at least 8 characters)' }],
      }}
      onCancel={onCancel}
      onSubmit={(v) => void submit(v)}
    />
  );
}

export function RaiseTasksForm({ assessment: a, onCancel, onDone, onError }: {
  assessment: DesignAssessment; onCancel: () => void; onDone: (msg: string) => void; onError: (msg: string) => void;
}) {
  const open = useMemo(() => a.proposedTasks.filter((t) => !a.existingTaskKeys.includes(t.key)), [a]);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(open.map((t) => t.key)));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const toggle = useCallback((k: string) => setChosen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; }), []);
  const submit = async () => {
    if (busy || chosen.size === 0) return;
    setBusy(true);
    try {
      const res = await apiRequest('POST', `/api/biostat-bridge/designs/${encodeURIComponent(a.studyId)}/tasks`, {
        keys: [...chosen], ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      const body = (await res.json().catch(() => null)) as { data?: { created?: unknown[]; skipped?: string[] } } | null;
      if (!res.ok || !Array.isArray(body?.data?.created)) {
        onError('No tasks were raised — ' + bridgeRefusal(body, res.status) + '.');
        return;
      }
      const c = body!.data!.created!.length;
      const s = body!.data!.skipped?.length ?? 0;
      onDone(`${c} task${c === 1 ? '' : 's'} raised on the board${s ? ` (${s} already open, skipped)` : ''} — each carries the design as its source.`);
    } catch (e) {
      onError('No tasks were raised — ' + (e instanceof Error ? e.message : String(e)) + '.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="pj-card-b" style={{ borderTop: '1px solid var(--border)', padding: 12, display: 'grid', gap: 8 }} role="group" aria-label="Raise tasks">
      <div style={{ fontSize: 12, fontWeight: 600 }}>Tasks proposed by the assessment</div>
      {open.length === 0 ? (
        <div style={muted}>Every proposed task is already on the board.</div>
      ) : open.map((t) => (
        <label key={t.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12 }}>
          <input type="checkbox" checked={chosen.has(t.key)} onChange={() => toggle(t.key)} aria-label={t.title} />
          <span>
            <span className={'rd-chip tone-' + (t.priority === 'critical' ? 'err' : t.priority === 'high' ? 'warn' : 'idle')} style={{ marginRight: 6 }}>{t.priority}</span>
            <b>{t.title}</b>
            <span style={{ ...muted, display: 'block' }}>{t.trigger} — {t.description}</span>
          </span>
        </label>
      ))}
      {a.existingTaskKeys.length > 0 && (
        <div style={muted}>{a.existingTaskKeys.length} task{a.existingTaskKeys.length === 1 ? ' is' : 's are'} already open on the board for this design.</div>
      )}
      <label style={{ fontSize: 12, display: 'block' }}>
        Reason (optional)
        <input className="c2c-input" style={{ height: 30, width: '100%' }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why these tasks are being raised" />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn primary" style={{ height: 30 }} disabled={busy || chosen.size === 0} onClick={() => void submit()}>{busy ? 'Raising…' : `Raise ${chosen.size} task${chosen.size === 1 ? '' : 's'}`}</button>
        <button className="btn" style={{ height: 30 }} onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}
