/**
 * Place a legal hold on a document, from its record in the Vault.
 *
 * P-125 point 8 (2026-11-11): "Legal holds are placed where the record is. 'Place legal hold' belongs on the record
 * in the Vault, for everyone the server already allows." The record showed an active hold (VaultHoldNotice.tsx) and
 * offered no way to place one. Placing lived only in Admin › Settings (LegalHoldsCard.tsx), a door open to
 * administrators and owners, while the server also lets a manager or an approver place a hold
 * (server/routes/vault-legal-holds.ts). A manager told to preserve a document had nowhere to do it.
 *
 * Nothing is rebuilt: the same governed route, which writes the hold and its chained audit row in one transaction.
 * This is the form for one version, where the version is. Whether it is offered is the server's answer, on the
 * Vault read (`mayPlaceLegalHold`), from the route's own rule; the route still decides.
 */
import React, { useId, useState } from 'react';
import { apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import { I } from '../icons';
import { LEGAL_HOLDS_PATH } from './LegalHoldsCard';

/** The route's own bounds (placeSchema): a reference of 1 to 200 characters, a reason of 3 to 2,000. */
export function placeHoldProblem(reference: string, reason: string): string | null {
  const ref = reference.trim();
  const why = reason.trim();
  if (!ref) return 'Give the matter reference: your inspection, litigation or preservation reference.';
  if (ref.length > 200) return 'Use a matter reference of no more than 200 characters.';
  if (why.length < 3) return 'Give the reason for the hold.';
  if (why.length > 2000) return 'Use a reason of no more than 2,000 characters.';
  return null;
}

interface PlacedHold { reference?: unknown; active?: unknown; scope?: unknown; documentId?: unknown }

/** The hold the server says it recorded for this version, or null when its answer does not confirm one. */
function confirmedHold(body: unknown, documentId: string): { reference: string } | null {
  const hold = (body as { hold?: PlacedHold } | null)?.hold;
  if (!hold || hold.active !== true || hold.scope !== 'document' || hold.documentId !== documentId) return null;
  return typeof hold.reference === 'string' && hold.reference ? { reference: hold.reference } : null;
}

export function VaultPlaceHold({ documentId, title, onPlaced }: {
  /** vault.documents.id of the version on the record. */
  documentId: string;
  title: string;
  /** The hold is recorded: the page re-reads the Vault so the record shows it. */
  onPlaced: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const refId = useId();
  const reasonId = useId();
  const problem = placeHoldProblem(reference, reason);

  const place = async () => {
    if (busy || problem) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiRequest('POST', LEGAL_HOLDS_PATH, { scope: 'document', documentId, reference: reference.trim(), reason: reason.trim() });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setError(redactInternals(serverMessage(body) ?? '', `The hold was not placed (HTTP ${res.status}).`));
        return;
      }
      const hold = confirmedHold(body, documentId);
      if (!hold) {
        setError('The server returned no recorded active hold for this version, so the hold is not confirmed. Reload the page before trying again.');
        return;
      }
      setOpen(false);
      setReference('');
      setReason('');
      setSaid(`Legal hold ${hold.reference} is placed on this version of ${title}. Your reason is recorded with it.`);
      onPlaced();
    } catch (e) {
      setError(redactInternals(e instanceof Error ? e.message : '', 'The hold was not placed.'));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="vd-confirm" data-testid="vault-place-hold">
        {said ? <div className="vd-d-idx" role="status" data-testid="vault-place-hold-said">{said}</div> : null}
        <div className="vd-confirm-acts">
          <button type="button" className="btn ghost small" onClick={() => { setSaid(null); setOpen(true); }}>
            {I.lock} Place legal hold
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="vd-confirm-form" role="group" aria-label={`Place a legal hold on this version of ${title}`} data-testid="vault-place-hold">
      <p className="vd-dr-meta">
        A hold keeps this version from being withdrawn or disposed of until it is lifted. The hold and its audit-trail
        entry are recorded together.
      </p>
      <label className="vd-dr-meta" htmlFor={refId}>Matter reference: your inspection, litigation or preservation reference</label>
      <input id={refId} className="c2c-input" value={reference} maxLength={200} disabled={busy} autoFocus
        onChange={(e) => setReference(e.target.value)} />
      <label className="vd-dr-meta" htmlFor={reasonId}>Reason for the hold. Recorded with your name and the time.</label>
      <textarea id={reasonId} className="vd-d-filing-reason" rows={2} value={reason} disabled={busy}
        placeholder="Required, at least 3 characters" onChange={(e) => setReason(e.target.value)} />
      <div className="vd-confirm-acts">
        <button type="button" className="btn ghost small" disabled={busy || problem !== null} onClick={() => void place()}>
          {busy ? 'Recording the hold…' : 'Place hold on this version'}
        </button>
        <button type="button" className="vd-dr-toggle" disabled={busy} onClick={() => { setOpen(false); setError(null); }}>Cancel</button>
      </div>
      {error ? <div className="vd-dr-err" role="alert">{error}</div> : null}
    </div>
  );
}
