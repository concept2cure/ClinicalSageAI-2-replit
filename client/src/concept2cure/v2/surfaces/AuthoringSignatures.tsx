/**
 * The §11.50 signature manifestation for an authoring document.
 *
 * ── What was missing ─────────────────────────────────────────────────────────
 * 21 CFR §11.50(b) requires the signer's printed name, the date and time of
 * signing, and the meaning of the signature to be "included as part of any
 * human readable form of the electronic record". `authoring_signatures` has
 * stored all three since it was created, and `GET /docs/:docId/signatures` has
 * exposed them — with **no caller anywhere in the client**. The only
 * manifestation a signer ever saw was a toast reading "Document signed
 * (approver) · a1b2c3d4e5f6…", which fades after 4.2 seconds and omits the
 * printed name, the exact time and the reason they typed thirty seconds
 * earlier.
 *
 * A record that exists and is never displayed satisfies §11.50(a) — the data is
 * captured — and fails §11.50(b), which is about the human-readable form.
 *
 * ── Scope ────────────────────────────────────────────────────────────────────
 * This is the ELECTRONIC DISPLAY half of §11.50(b). The other half — the
 * printout — is closed too: `POST /docs/:docId/export` renders the signature
 * manifest (printed name, executed time, meaning, §11.70 coverage) into all
 * three formats via `signatureManifestLines` in authoring.router.ts, pinned by
 * server/routes/__tests__/authoringExportSignatureManifest.test.ts. An earlier
 * version of this header recorded the printout half as still open; that note
 * outlived the fix and read as if the gap persisted.
 *
 * ── Honesty rules ────────────────────────────────────────────────────────────
 * A missing printed name renders AS missing. `signer_name` is NULL when the
 * user record yielded none, precisely so this pane can say so rather than
 * showing the email address in the printed-name row and implying §11.50(a)(1)
 * is satisfied. Falling back to the email here would re-create, in the display
 * layer, the exact defect that was just removed from the storage layer.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { I } from '../icons';
import { EmptyState } from '../dataConnect';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { GovernedTimestamp } from '../../_shared/components/GovernedTimestamp';

/** A row of `authoring_signatures`, as GET /docs/:docId/signatures returns it. */
export interface AuthoringSignature {
  id: string;
  signer_email: string | null;
  /** §11.50(a)(1). NULL when no printed name is on record — never the email. */
  signer_name: string | null;
  meaning: string | null;
  reason: string | null;
  method: string | null;
  content_hash: string | null;
  signature_digest: string | null;
  /** §11.70 — which frozen snapshot this signature covers. */
  covered_freeze_version: string | null;
  covered_content_hash: string | null;
  pin_verified: boolean | null;
  signed_at: string | null;
}

/**
 * §11.50(a)(3) wording. The store holds `AUTHOR` / `REVIEWER` / `APPROVER`;
 * rendering those tokens raw would put a database enum where the regulation
 * asks for the meaning of the signature.
 */
const MEANING_LABEL: Record<string, string> = {
  AUTHOR: 'Authorship',
  REVIEWER: 'Review',
  APPROVER: 'Approval',
};

/** Unrecognised meanings render verbatim rather than being mapped to a guess. */
function meaningLabel(m: string | null): string {
  if (!m) return 'Not recorded';
  return MEANING_LABEL[m.toUpperCase()] ?? m;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="es-manifest-row" style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 8, padding: '3px 0', fontSize: 12 }}>
      <span style={{ color: 'var(--text-400)' }}>{label}</span>
      <span>{children}</span>
    </div>
  );
}

export function AuthoringSignatures({ docId }: { docId: string | null }) {
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [rows, setRows] = useState<AuthoringSignature[]>([]);
  const [detail, setDetail] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    setState('loading');
    try {
      const res = await apiRequest('GET', `/api/authoring/docs/${id}/signatures`);
      const json = (await res.json().catch(() => null)) as
        | { signatures?: AuthoringSignature[] }
        | null;
      if (!res.ok) {
        setDetail(serverMessage(json) ?? `The signature record did not load (HTTP ${res.status}).`);
        setState('error');
        return;
      }
      setRows(Array.isArray(json?.signatures) ? json!.signatures! : []);
      setState('ready');
    } catch {
      setDetail('The signature record could not be reached.');
      setState('error');
    }
  }, []);

  useEffect(() => {
    if (docId) void load(docId);
    else setState('idle');
  }, [docId, load]);

  if (!docId) {
    return (
      <EmptyState icon={I.shieldCheck} title="No document open"
        hint="Open a document to see the electronic signatures applied to it." />
    );
  }
  if (state === 'loading') {
    return <div className="scaf-note" style={{ padding: 12 }}>Reading the signature record…</div>;
  }
  if (state === 'error') {
    return (
      <EmptyState
        icon={I.alertTriangle}
        tone="error"
        title="Couldn’t read the signature record"
        /* An unread signature record is NOT an unsigned document, and on a
           §11.50 manifestation that distinction is the whole point. */
        hint={`${detail ?? ''} This is a failed read, not a document with no signatures — nothing is claimed about whether it has been signed.`}
      />
    );
  }
  if (!rows.length) {
    return (
      <EmptyState icon={I.shieldCheck} title="No electronic signatures on this document"
        hint="Signatures applied through the filing bar appear here with the signer’s printed name, the meaning of the signature, and the exact time it was executed." />
    );
  }

  return (
    <div style={{ padding: '4px 0' }}>
      {rows.map((s) => (
        <div key={s.id} className="es-manifest" style={{ padding: '10px 12px', borderBottom: '1px solid var(--c2c-line,#e4e7ec)' }}>
          <Row label="Signed by">
            {s.signer_name
              ? <><b>{s.signer_name}</b>{s.signer_email ? <span style={{ color: 'var(--text-400)' }}> · {s.signer_email}</span> : null}</>
              : (
                /* §11.50(a)(1) is not satisfied by an address. Saying so is the
                   honest render; substituting the email here would rebuild the
                   defect this pane exists to expose. */
                <span>
                  {s.signer_email ?? 'Unknown signer'}
                  <span style={{ color: 'var(--warning)' }}> · no printed name on record</span>
                </span>
              )}
          </Row>
          <Row label="Meaning">{meaningLabel(s.meaning)}</Row>
          <Row label="Executed">
            <GovernedTimestamp value={s.signed_at} layout="inline" />
          </Row>
          {s.reason ? <Row label="Reason">{s.reason}</Row> : null}
          <Row label="Method">
            {s.method ?? 'Not recorded'}
            {s.pin_verified ? <span style={{ color: 'var(--text-400)' }}> · PIN verified</span> : null}
          </Row>
          {/* §11.70: WHAT was signed, not merely that something was. */}
          <Row label="Covers">
            {s.covered_freeze_version
              ? <>frozen version {s.covered_freeze_version}</>
              : <span style={{ color: 'var(--text-400)' }}>no frozen snapshot was in force when this was signed</span>}
          </Row>
          {s.content_hash ? (
            <Row label="Content hash">
              <span className="mono" style={{ fontSize: 11, wordBreak: 'break-all' }}>{s.content_hash}</span>
            </Row>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default AuthoringSignatures;
