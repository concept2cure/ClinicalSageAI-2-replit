/**
 * AuthoringFilingBar — the governed "lock it down" filing actions for a
 * selected authoring document, wired to the real authoring store
 * (server/routes/authoring.router.ts, uuid authoring_documents):
 *
 *   • Freeze — POST /api/authoring/docs/:docId/freeze {reason}: snapshots the
 *     whole document into frozen_documents with a sha256 content hash and an
 *     audit-trail entry, flipping the document to FROZEN. The returned hash is
 *     shown so the signer/regulator can re-derive it.
 *   • E-sign — POST /api/authoring/docs/:docId/e-sign {pin, meaning, intent}:
 *     records a 21 CFR Part 11 electronic signature (PIN-verified server-side)
 *     against the document's content hash with an audit entry; an APPROVER
 *     signature flips the document to APPROVED and auto-freezes it.
 *
 * This store is PIN-keyed and uuid-scoped, which is why it uses its own e-sign
 * endpoint rather than the numeric-store Part11SignModal (/api/esignature).
 *
 * HONESTY: real awaited writes; a success toast fires only after the server
 * confirms and includes the server hash; a failed PIN (401) or any error is
 * surfaced honestly and nothing local is fabricated. onChanged() lets the host
 * refetch so the document's new status (FROZEN / APPROVED) comes from the
 * server, not an optimistic guess.
 */
import React, { useState } from 'react';
import { I } from '../icons';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import { apiRequest } from '@/lib/queryClient';

export interface AuthoringFilingBarProps {
  docId: string;
  docTitle: string;
  docStatus: string;
  /** Refetch hook so the host adopts the server's post-write document status. */
  onChanged: () => void;
  /* BP-W0-6, and this is the sharpest instance of it. This component owns
     Freeze and the §11.50 electronic signature. Its prop type erased the tone
     the host's useToast accepts, so every call here defaulted to 'ok' — and a
     REJECTED PIN rendered with the green success tick, aria-live="polite" and
     the same 4.2s dwell as "Document signed". On the one action in the product
     that is a legally binding attestation, failure was indistinguishable from
     success. C2CForm is fire-and-forget and the dialog stays open on failure
     with no inline error, so the toast is the ONLY signal there is. */
  fireToast: (m: string, tone?: 'ok' | 'error') => void;
}

type Dialog = 'freeze' | 'esign' | null;

const FROZEN_STATES = new Set(['FROZEN', 'APPROVED']);

const FREEZE_FORM = (title: string): C2CFormConfig => ({
  eyebrow: 'Part 11 · content freeze',
  title: 'Freeze document',
  sub: `Snapshot “${title}” into an immutable, hash-sealed version before signing or filing.`,
  governed: true,
  submitLabel: 'Freeze and seal',
  fields: [
    { key: 'reason', label: 'Reason for freeze', type: 'textarea', required: true, placeholder: 'e.g. Locking for QA review prior to approval' },
    { key: 'version', label: 'Version label (optional)', type: 'text', placeholder: 'e.g. v1.0.frozen' },
  ],
});

const ESIGN_FORM = (title: string): C2CFormConfig => ({
  eyebrow: 'Part 11 · §11.50 electronic signature',
  title: 'Electronically sign document',
  sub: `Apply a signature to “${title}”. Your PIN is verified server-side; an Approval signature approves and freezes the document.`,
  governed: true,
  submitLabel: 'Sign',
  fields: [
    { key: 'meaning', label: 'Meaning of signature (§11.50)', type: 'seg', options: [
      { value: 'AUTHOR', label: 'Authorship' }, { value: 'REVIEWER', label: 'Review' }, { value: 'APPROVER', label: 'Approval' },
    ], required: true, default: 'REVIEWER' },
    { key: 'intent', label: 'Intent / declaration', type: 'textarea', required: true, placeholder: 'e.g. I have reviewed this document and confirm it is complete and accurate.' },
    // First-time signers set the PIN in the Signatures rail (SigningPinPanel);
    // until that shipped this field was unsatisfiable — required, verified
    // server-side, and creatable nowhere in the product.
    { key: 'pin', label: 'Signing PIN', type: 'password', required: true, placeholder: 'Your electronic-signature PIN — no PIN yet? Set it in the Signatures rail first' },
  ],
});

export function AuthoringFilingBar({ docId, docTitle, docStatus, onChanged, fireToast }: AuthoringFilingBarProps) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const frozen = FROZEN_STATES.has(docStatus);

  const doFreeze = async (v: Record<string, string>) => {
    try {
      const res = await apiRequest('POST', `/api/authoring/docs/${docId}/freeze`, {
        reason: v.reason,
        version: v.version || undefined,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        fireToast('Couldn’t freeze the document — ' + ((json as any)?.error ?? `HTTP ${res.status}`) + '. Nothing was sealed.', 'error');
        return;
      }
      const hash = (json as { contentHash?: string })?.contentHash;
      fireToast('Document frozen and sealed' + (hash ? ' · ' + String(hash).slice(0, 12) + '…' : '') + '.');
      setDialog(null);
      onChanged();
    } catch (e) {
      fireToast('Couldn’t freeze the document — ' + (e instanceof Error ? e.message : String(e)) + '.', 'error');
    }
  };

  const doSign = async (v: Record<string, string>) => {
    try {
      const res = await apiRequest('POST', `/api/authoring/docs/${docId}/e-sign`, {
        pin: v.pin,
        meaning: v.meaning,
        intent: v.intent,
      });
      const json = await res.json().catch(() => null);
      if (res.status === 401) { fireToast('Signature rejected — the PIN was not verified. Nothing was signed.', 'error'); return; }
      if (!res.ok) {
        fireToast('Couldn’t sign the document — ' + ((json as any)?.error ?? `HTTP ${res.status}`) + '. Nothing was signed.', 'error');
        return;
      }
      const hash = (json as { documentHash?: string })?.documentHash;
      const approved = v.meaning === 'APPROVER';
      fireToast('Document signed (' + v.meaning.toLowerCase() + ')' + (approved ? ' — approved and frozen' : '') + (hash ? ' · ' + String(hash).slice(0, 12) + '…' : '') + '.');
      setDialog(null);
      onChanged();
    } catch (e) {
      fireToast('Couldn’t sign the document — ' + (e instanceof Error ? e.message : String(e)) + '.', 'error');
    }
  };

  return (
    <>
      <button className="btn ghost" style={{ height: 30 }} onClick={() => setDialog('freeze')} disabled={frozen}
        title={frozen ? 'Document is already frozen' : 'Snapshot and seal this document'}>
        {I.lock} {frozen ? 'Frozen' : 'Freeze'}
      </button>
      <button className="btn ghost" style={{ height: 30 }} onClick={() => setDialog('esign')}>
        {I.penLine} E-sign
      </button>

      {dialog === 'freeze' && <C2CForm config={FREEZE_FORM(docTitle)} onCancel={() => setDialog(null)} onSubmit={doFreeze} />}
      {dialog === 'esign' && <C2CForm config={ESIGN_FORM(docTitle)} onCancel={() => setDialog(null)} onSubmit={doSign} />}
    </>
  );
}
