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

/* ── Signing-PIN enrollment (§11.200(a)(1)) ─────────────────────────────────
 * The e-sign dialog has always demanded a "Signing PIN", and POST /users/pin
 * has always been able to set one — with NO screen between them: a first-time
 * signer faced a required field nothing in the product could satisfy. This
 * panel is the missing screen.
 *
 * The PIN is user-scoped, not document-scoped, so it renders with or without
 * a document open. There is deliberately no "do I have a PIN?" probe: the
 * server is the authority on that, and its refusals are shown verbatim —
 * "Current PIN is required to change it" IS the honest answer to a rotation
 * attempted without the current PIN, and a wrong current PIN is refused
 * server-side by the bcrypt check, never guessed at here. The PIN itself
 * never appears in any record; the audit trail records only that it was set
 * or rotated, by whom, and when. */
function SigningPinPanel() {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [current, setCurrent] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const submit = useCallback(async () => {
    setNote(null);
    if (pin.length < 6) {
      setNote({ tone: 'err', text: 'The PIN must be at least 6 characters. Nothing was changed.' });
      return;
    }
    if (pin !== confirm) {
      setNote({ tone: 'err', text: 'The two PIN entries do not match. Nothing was changed.' });
      return;
    }
    setBusy(true);
    try {
      const res = await apiRequest('POST', '/api/authoring/users/pin', {
        pin,
        ...(current ? { old_pin: current } : {}),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setNote({
          tone: 'err',
          text: (serverMessage(json) ?? `The PIN was not set (HTTP ${res.status}).`) + ' Nothing was changed.',
        });
        return;
      }
      setPin('');
      setConfirm('');
      setCurrent('');
      setNote({
        tone: 'ok',
        text: 'Signing PIN set — the change is recorded in the audit trail. E-signing asks for this PIN every time.',
      });
    } catch {
      setNote({ tone: 'err', text: 'The PIN service could not be reached. Nothing was changed.' });
    } finally {
      setBusy(false);
    }
  }, [pin, confirm, current]);

  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--c2c-line,#e4e7ec)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{I.lock} Signing PIN</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="nda-open" onClick={() => setOpen(o => !o)} aria-expanded={open}>
          {open ? 'Close' : 'Set or rotate'}
        </button>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text-400)', margin: '4px 0 0' }}>
        The second component of your electronic signature (§11.200). Set it here before your first
        e-sign; every signature asks for it.
      </p>
      {open && (
        <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
          <input
            className="c2c-input"
            type="password"
            autoComplete="new-password"
            aria-label="New signing PIN"
            placeholder="New PIN (at least 6 characters)"
            value={pin}
            onChange={e => setPin(e.target.value)}
          />
          <input
            className="c2c-input"
            type="password"
            autoComplete="new-password"
            aria-label="Confirm new signing PIN"
            placeholder="Confirm new PIN"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
          />
          <input
            className="c2c-input"
            type="password"
            autoComplete="current-password"
            aria-label="Current signing PIN"
            placeholder="Current PIN — leave blank if enrolling for the first time"
            value={current}
            onChange={e => setCurrent(e.target.value)}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="btn primary"
              style={{ height: 28 }}
              disabled={busy || !pin || !confirm}
              onClick={() => void submit()}
            >
              {busy ? 'Setting…' : 'Set signing PIN'}
            </button>
          </div>
        </div>
      )}
      {note && (
        <p
          role="status"
          style={{
            fontSize: 11.5,
            margin: '6px 0 0',
            color: note.tone === 'ok' ? 'var(--success,#067647)' : 'var(--c2c-err,#b42318)',
          }}
        >
          {note.text}
        </p>
      )}
    </div>
  );
}

export function AuthoringSignatures({ docId }: { docId: string | null }) {
  return (
    <>
      <SigningPinPanel />
      <SignatureManifest docId={docId} />
    </>
  );
}

function SignatureManifest({ docId }: { docId: string | null }) {
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
