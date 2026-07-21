/**
 * Part11SignModal — reusable 21 CFR Part 11 electronic-signature dialog.
 *
 * Drives the REAL server-side signing chain (server/routes/esignature.ts,
 * mounted /api/esignature):
 *   1. POST /verify-password  (§11.200(a)(1)(i) — knowledge factor)
 *   2. POST /verify-mfa       (§11.200(a)(1)(ii) — possession factor, when a
 *                              code is supplied / MFA is enabled)
 *   3. POST /sign             — records the signature in electronic_signatures
 *                              with a server-computed hash, binds it to the
 *                              version's content bytes (§11.70), and writes the
 *                              central audit-trail row (§11.10(e)). The server
 *                              RE-VERIFIES both factors at signing — the verify
 *                              steps above are progressive UX, never the
 *                              authority.
 *
 * On success it renders the §11.50 signature MANIFESTATION — signer identity,
 * the declared meaning, the purpose/action, the UTC signing time, and the
 * server signature hash — the human-readable record a regulator expects, built
 * only from the server's response (never fabricated).
 *
 * Reusable across every surface that signs a governed document version
 * (submission sign-release, document approval, report seal). It targets the
 * numeric {documentId, versionId} governed-documents store; it does NOT sign
 * the uuid authoring_documents store (that store has its own PIN e-sign).
 *
 * Accessibility (WCAG 2.2 AA): modal dialog with focus trap + initial focus,
 * real <label>s, a §11.50 meaning radiogroup, an error live region, and Escape
 * to cancel — mirrors GovernedActionSignoff.
 */
import { useEffect, useId, useRef, useState } from 'react';

import styles from './styles.module.css';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/services/portal/authService';

/** The §11.50 signature meanings and the declaration text each records. */
const MEANING_OPTIONS: ReadonlyArray<{ value: SignatureMeaning; label: string; declaration: string }> = [
  { value: 'AUTHOR', label: 'Authorship', declaration: 'I am the author of this document version.' },
  { value: 'REVIEWER', label: 'Review', declaration: 'I have reviewed this document version.' },
  { value: 'APPROVER', label: 'Approval', declaration: 'I approve this document version for its intended use.' },
];
export type SignatureMeaning = 'AUTHOR' | 'REVIEWER' | 'APPROVER';

export interface Part11SignRequest {
  /** Numeric document id in the governed-documents store. */
  documentId: number;
  /** Numeric version id (document_versions) whose bytes are bound to the signature. */
  versionId: number;
  /** Machine purpose, e.g. "approval" | "review" | "verification". */
  signaturePurpose: string;
  /** Recorded action, e.g. "approved" | "reviewed" | "rejected". */
  action: string;
  /** Human context shown in the dialog header, e.g. "Approve M2.3 Quality Overall Summary". */
  title: string;
  /** Optional longer consequence description. */
  message?: string;
  defaultMeaning?: SignatureMeaning;
}

export interface Part11Manifest {
  signatureId: number | string;
  signatureHash: string;
  signedAt: string;
  meaning: SignatureMeaning;
  signaturePurpose: string;
  action: string;
  signerName: string;
  signerEmail: string;
}

export interface Part11SignModalProps {
  request: Part11SignRequest;
  /** Called once the signature is durably recorded, with the §11.50 manifest. */
  onSigned: (manifest: Part11Manifest) => void;
  /** Dismiss without signing. */
  onCancel: () => void;
}

/** POST helper that never throws — honest {ok,status,body}. */
async function post<T = any>(path: string, body: unknown): Promise<{ ok: boolean; status: number; body: T | null }> {
  try {
    const res = await apiRequest('POST', path, body);
    const parsed = (await res.json().catch(() => null)) as T | null;
    return { ok: res.ok, status: res.status, body: parsed };
  } catch (e) {
    return { ok: false, status: 0, body: null };
  }
}

export function Part11SignModal({ request, onSigned, onCancel }: Part11SignModalProps) {
  const { user } = useAuth();
  const [meaning, setMeaning] = useState<SignatureMeaning | null>(request.defaultMeaning ?? null);
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manifest, setManifest] = useState<Part11Manifest | null>(null);

  const titleId = useId();
  const consequenceId = useId();
  const meaningId = useId();
  const pwId = useId();
  const mfaId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  const canSign = meaning != null && password.length > 0 && !signing;

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('[role="radio"], input, button')?.focus();
  }, []);

  const handleSign = async () => {
    if (!canSign || meaning == null) return;
    setSigning(true);
    setError(null);
    try {
      // Step 1 — knowledge factor (progressive feedback; the server re-verifies).
      const pw = await post<{ valid: boolean; error?: string }>('/api/esignature/verify-password', { password });
      if (pw.status === 401) { setError('Your session isn’t authenticated. Sign in and retry.'); return; }
      if (!pw.body?.valid) { setError('Password verification failed. The signature was not applied.'); return; }

      // Step 2 — possession factor, only when a code was supplied.
      if (mfaToken.length > 0) {
        const mfa = await post<{ valid: boolean }>('/api/esignature/verify-mfa', { token: mfaToken });
        if (!mfa.body?.valid) { setError('Authentication code verification failed. The signature was not applied.'); return; }
      }

      // Step 3 — the authoritative signing call (re-verifies both factors,
      // binds to version content, writes the audit row).
      const declaration = MEANING_OPTIONS.find((m) => m.value === meaning)?.declaration ?? '';
      const signRes = await post<{ signatureId: number | string; signatureHash: string; signedAt: string; error?: string }>(
        '/api/esignature/sign',
        {
          documentId: request.documentId,
          versionId: request.versionId,
          signaturePurpose: request.signaturePurpose,
          signatureMeaning: declaration,
          action: request.action,
          password,
          mfaToken: mfaToken.length > 0 ? mfaToken : undefined,
        },
      );
      if (!signRes.ok || !signRes.body?.signatureHash) {
        const msg = (signRes.body as any)?.error;
        setError(
          signRes.status === 403 ? (msg ?? 'Your role does not permit applying an electronic signature (§11.10(g)).')
          : signRes.status === 401 ? (msg ?? 'Signature rejected: re-authentication failed (§11.200).')
          : signRes.status === 422 ? (msg ?? 'Cannot sign: the document version could not be bound to its content (§11.70).')
          : signRes.status === 503 ? 'E-signature schema not present — the environment isn’t ready to sign.'
          : (msg ?? `Signing failed (HTTP ${signRes.status}). Nothing was recorded.`),
        );
        return;
      }
      const m: Part11Manifest = {
        signatureId: signRes.body.signatureId,
        signatureHash: signRes.body.signatureHash,
        signedAt: signRes.body.signedAt,
        meaning,
        signaturePurpose: request.signaturePurpose,
        action: request.action,
        signerName: user?.displayName || [user?.firstName].filter(Boolean).join(' ') || user?.email || 'current user',
        signerEmail: user?.email || '',
      };
      setManifest(m);
      onSigned(m);
    } catch (e) {
      setError('Signing failed — ' + (e instanceof Error ? e.message : String(e)) + '. Nothing was recorded.');
    } finally {
      setSigning(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); return; }
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [role="radio"], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  };

  // Success — render the §11.50 manifestation, built only from the server's response.
  if (manifest) {
    return (
      <div ref={dialogRef} className={styles.signoff} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <p id={titleId} className={styles.signoffTitle}>Electronically signed</p>
        <div className={styles.signoffResolved}>
          <div><b>{manifest.signerName}</b>{manifest.signerEmail ? ` · ${manifest.signerEmail}` : ''}</div>
          <div>Meaning: {MEANING_OPTIONS.find((m) => m.value === manifest.meaning)?.label} · {manifest.action}</div>
          <div>Signed (UTC): {new Date(manifest.signedAt).toISOString()}</div>
          <div style={{ wordBreak: 'break-all' }}>Signature hash: <span className="mono">{manifest.signatureHash}</span></div>
        </div>
        <div className={styles.signoffActions}>
          <button type="button" className={styles.signoffConfirm} onClick={onCancel}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={dialogRef}
      className={styles.signoff}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={consequenceId}
      onKeyDown={handleKeyDown}
    >
      <p id={titleId} className={styles.signoffTitle}>Electronic signature required</p>
      <p id={consequenceId} className={styles.signoffMsg}>
        {request.message ?? request.title}
      </p>

      <span id={meaningId} className={styles.signoffLabel}>Meaning of signature (§11.50)</span>
      <div className={styles.signoffMeanings} role="radiogroup" aria-labelledby={meaningId} aria-required="true">
        {MEANING_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={meaning === opt.value}
            data-active={meaning === opt.value}
            className={styles.signoffMeaning}
            onClick={() => setMeaning(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <label className={styles.signoffLabel} htmlFor={pwId}>Password (electronic signature)</label>
      <input
        id={pwId} type="password" autoComplete="current-password" className={styles.signoffInput}
        value={password} onChange={(e) => setPassword(e.target.value)} aria-required="true"
      />
      <label className={styles.signoffLabel} htmlFor={mfaId}>Authentication code (if enabled)</label>
      <input
        id={mfaId} type="text" inputMode="numeric" autoComplete="one-time-code" className={styles.signoffInput}
        value={mfaToken} onChange={(e) => setMfaToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
      />
      <p className={styles.signoffAttest}>
        By signing you confirm the §11.50 meaning above and your 21 CFR 11.100(b) intent. Your credentials are
        re-verified at signing and are not reused from this session.
      </p>

      {error && <p className={styles.signoffError} role="alert">{error}</p>}

      <div className={styles.signoffActions}>
        <button type="button" className={styles.suggestPill} onClick={onCancel} disabled={signing}>Cancel</button>
        <button type="button" className={styles.signoffConfirm} onClick={handleSign} disabled={!canSign}>
          {signing ? 'Signing…' : 'Sign'}
        </button>
      </div>
    </div>
  );
}
