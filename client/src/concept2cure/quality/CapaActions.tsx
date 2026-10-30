/**
 * CapaActions — a CAPA's action items, opened from its row in the CAPA
 * register. Reads GET /api/capa-mdr/capa/:id (the record and its `actions`)
 * and moves an action along the lifecycle the server enforces
 * (shared/constants/capa-lifecycle.ts ACTION_TRANSITIONS). Done needs the
 * evidence of completion; blocked and cancelled need a reason. Each move is the
 * server's audited write (POST /api/capa-mdr/capa/actions/:id/transition).
 *
 * @module client/src/concept2cure/quality/CapaActions
 */

import * as React from 'react';
import { C2CForm } from '../v2/C2CForm';
import { ErrorState } from '../v2/dataConnect';
import { useFetchJson } from '../mdx/hooks/useFetchJson';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import type { ActionState } from '@shared/schema/capa-mdr';
import { formatDate } from './data';
import {
  ACTION_STATE_LABEL, CAPA_ACTION_TYPE_LABEL, actionMoves, transitionCapaAction,
  type CapaActionRow, type CapaRow,
} from './qmsRecordData';

const TONE: Record<ActionState, string> = { planned: 'draft', in_progress: 'review', done: 'effective', blocked: 'err', cancelled: 'muted' };

export function CapaActions({ capa, onChanged }: { capa: CapaRow; onChanged: () => void }) {
  const read = useFetchJson<{ actions?: unknown }>(`/api/capa-mdr/capa/${encodeURIComponent(capa.id)}`);
  const actions = Array.isArray(read.data?.actions) ? (read.data!.actions as CapaActionRow[]) : null;
  const [moving, setMoving] = React.useState<{ action: CapaActionRow; to: ActionState } | null>(null);
  const [refusal, setRefusal] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const writing = React.useRef(false);

  const record = async (v: Record<string, string>) => {
    if (!moving || writing.current) return;
    const reason = v.reason?.trim() ?? '';
    const evidence = v.evidence?.trim() ?? '';
    if (moving.to === 'done' && !evidence) { setRefusal('Not recorded — name the evidence that the action was done.'); return; }
    if ((moving.to === 'blocked' || moving.to === 'cancelled') && reason.length < GOVERNED_REASON_MIN) {
      setRefusal(`Not recorded — a reason of at least ${GOVERNED_REASON_MIN} characters is required.`);
      return;
    }
    writing.current = true;
    setRefusal(null);
    try {
      await transitionCapaAction(moving.action.id, { to: moving.to, reason, evidence });
      setNotice(`Action ${moving.action.n} is ${ACTION_STATE_LABEL[moving.to].toLowerCase()}.`);
      setMoving(null);
      read.refresh();
      onChanged();
    } catch (err) {
      setRefusal(`Not recorded — ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      writing.current = false;
    }
  };

  return (
    <>
      <div className="qcc-detail-head">
        <span className="qcc-detail-title">Action items</span>
      </div>
      {notice && <div className="qcc-detail-empty" role="status">{notice}</div>}
      {read.error ? (
        <ErrorState title="The action items could not be read" message={read.error} retry={read.refresh} testId="capa-actions-failed" />
      ) : actions === null ? (
        <div className="qcc-detail-empty" role="status">{read.loading ? 'Loading the action items…' : 'The server did not return the action items.'}</div>
      ) : actions.length === 0 ? (
        <div className="qcc-detail-empty">No action items yet. Add one with Add action.</div>
      ) : (
        <ol className="qcc-actions">
          {actions.map((a) => (
            <li key={a.id} className="qcc-action">
              <span className="mono">#{a.n}</span>
              <span className="qms-tag">{CAPA_ACTION_TYPE_LABEL[a.type] ?? a.type}</span>
              <span className="qcc-action-desc">{a.description}</span>
              <span className="qcc-action-meta">
                {[a.owner, a.dueDate ? `due ${formatDate(a.dueDate)}` : null, a.completedAt ? `done ${formatDate(a.completedAt)}` : null].filter(Boolean).join(' · ') || '—'}
              </span>
              <span className="qms-pill" data-tone={TONE[a.state]}>{ACTION_STATE_LABEL[a.state] ?? a.state}</span>
              <span className="qms-rowacts">
                {actionMoves(a).map((to) => (
                  <button key={to} className="qms-chip" onClick={() => { setRefusal(null); setMoving({ action: a, to }); }}>
                    {ACTION_STATE_LABEL[to]}
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ol>
      )}
      {moving && (
        <C2CForm
          config={{
            eyebrow: `CAPA ${capa.capaCode}`,
            title: `Action ${moving.action.n}: ${ACTION_STATE_LABEL[moving.to]}`,
            sub: moving.action.description,
            governed: 'The move is written to the audit trail under your name.',
            submitLabel: 'Record the move',
            ...(refusal ? { notice: refusal } : {}),
            fields: moving.to === 'done'
              ? [{ key: 'evidence', label: 'Evidence of completion', type: 'textarea', rows: 3, required: true, desc: 'The record that shows it was done: a training record, the revised SOP, a supplier letter, a test report.' }]
              : [{
                key: 'reason', label: 'Reason', type: 'textarea', rows: 3,
                required: moving.to === 'blocked' || moving.to === 'cancelled',
                ...(moving.to === 'blocked' || moving.to === 'cancelled' ? { desc: `At least ${GOVERNED_REASON_MIN} characters, recorded verbatim.` } : {}),
              }],
          }}
          onCancel={() => setMoving(null)}
          onSubmit={(v) => void record(v)}
        />
      )}
    </>
  );
}
