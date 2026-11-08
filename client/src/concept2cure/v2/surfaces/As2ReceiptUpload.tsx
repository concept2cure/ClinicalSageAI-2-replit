import React, { useState } from 'react';
import { apiUpload, serverMessage } from '@/lib/queryClient';
import { environmentWords, TEST_SEND_NOT_A_FILING } from './SubmissionSeqWorkspaces';

const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;
/** `environment`: the original send's, as the server recorded it (absent from an older server). */
type RecordedReceipt = { verified: true; recorded: true; status: 'received' | 'rejected'; sequenceResolution?: 'resolved' | 'already-resolved' | 'unreconciled'; environment?: 'staging' | 'production' };

function isRecordedReceipt(value: unknown): value is RecordedReceipt {
  const result = value as Partial<RecordedReceipt> | null | undefined;
  return result?.verified === true && result?.recorded === true && (result.status === 'received' || result.status === 'rejected');
}

/**
 * A receipt for a send to the agency's test environment, in words. It files
 * nothing, whatever it says: the server settles no sequence on it, so whether it
 * reconciled one is not this receipt's question (F1, row D7, 2026-11-01).
 */
function testReceiptOutcome(result: RecordedReceipt): { ok: boolean; text: string } {
  const from = environmentWords(result.environment);
  return result.status === 'rejected'
    ? { ok: false, text: `Signed agency MDN verified and recorded. It came from ${from}, which rejected this test send. ${TEST_SEND_NOT_A_FILING}, so this receipt does not file or reject a sequence. Review the agency receipt before sending again.` }
    : { ok: true, text: `Signed agency MDN verified and recorded. It came from ${from}. ${TEST_SEND_NOT_A_FILING}, so this receipt files no sequence; the sequence can still be filed with the agency.` };
}

/** Record an agency's signed MDN, without choosing its disposition or ACK stage. */
export function As2ReceiptUpload({ transmittalId, onRecorded }: { transmittalId: number; onRecorded: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [contentType, setContentType] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);

  const record = async () => {
    if (!file || !contentType.trim() || busy) return;
    if (file.size > MAX_RECEIPT_BYTES) { setOutcome({ ok: false, text: 'The agency receipt must be 8 MB or smaller.' }); return; }
    setBusy(true); setOutcome(null);
    try {
      const form = new FormData();
      form.append('receipt', file);
      form.append('contentType', contentType.trim());
      const response = await apiUpload('POST', `/api/mdx/gateways/transmittals/${transmittalId}/as2-receipt`, form);
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setOutcome({ ok: false, text: serverMessage(body) ?? 'The receipt was not recorded. Check the original signed agency response and retry.' });
        return;
      }
      const result = body?.data;
      if (!isRecordedReceipt(result)) {
        setOutcome({ ok: false, text: 'The verification result was not returned. Refresh the transmittal status before retrying.' });
        return;
      }
      if (result.environment === 'staging') setOutcome(testReceiptOutcome(result));
      else setOutcome(result.status === 'rejected'
        ? { ok: false, text: 'Signed agency MDN verified and recorded: FDA transport rejected the submission. Review the agency receipt before correcting it.' + (result.sequenceResolution === 'unreconciled' ? ' This receipt did not reconcile a sequence attempt; review the original transmission record.' : '') }
        : result.sequenceResolution === 'unreconciled'
          ? { ok: false, text: 'Signed agency MDN verified and recorded. This receipt did not reconcile a sequence attempt; review the original transmission record. FDA center acceptance is a separate acknowledgement.' }
          : { ok: true, text: 'Signed agency MDN verified and recorded. FDA center acceptance is a separate acknowledgement.' });
      await onRecorded();
    } catch {
      setOutcome({ ok: false, text: 'The receipt result could not be read. Refresh the transmittal status before retrying.' });
    } finally {
      setBusy(false);
    }
  };

  return <span style={{ display: 'inline-block', marginLeft: 6, whiteSpace: 'normal', textAlign: 'left' }}>
    <button type="button" className="nda-open" onClick={() => setOpen(!open)}>Record agency MDN</button>
    {open && <div role="group" aria-label={`Agency receipt for transmittal ${transmittalId}`}>
      <p className="txw-help">Upload the original signed agency receipt. Its signature and original message must verify; acceptance also requires the matching payload digest. Recording it does not send a submission.</p>
      <label>Signed agency MDN<input aria-label="Signed agency MDN" type="file" disabled={busy} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setOutcome(null); }} /></label>
      <label>Agency response Content-Type<input aria-label="Agency response Content-Type" type="text" value={contentType} disabled={busy} onChange={(e) => setContentType(e.target.value)} placeholder="Original response header, including its boundary" /></label>
      <button type="button" className="nda-open" disabled={busy || !file || !contentType.trim()} onClick={() => { void record(); }}>{busy ? 'Verifying…' : 'Verify and record receipt'}</button>
      {outcome && <p role={outcome.ok ? 'status' : 'alert'}>{outcome.text}</p>}
    </div>}
  </span>;
}
