/**
 * The signer's signing posture, as the server states it (P-25 follow-up,
 * 2026-10-08): GET /api/v1/auth/session answers `user.signing`, whether this
 * account needs an authenticator to sign and whether it has one, from the rule
 * the signing ceremony applies (server/services/part11/reverify-signer.ts,
 * signingPostureOf). The e-signature dialog reads it when it opens, so a signer
 * who must enrol first is told so before typing a password.
 *
 * A notice, not the control: the server refuses the signature either way.
 *
 * @module client/src/concept2cure/_shared/signingPosture
 */
import * as React from 'react';
import { getAuthHeaders } from '@/utils/authToken';

/** What the server states about this signer (GET /api/v1/auth/session, `user.signing`). */
export interface SigningPosture {
  authenticatorRequired: boolean;
  authenticatorEnrolled: boolean;
}

/**
 * The server's statement of the signer's posture, or null when it could not be
 * read or did not say. Null leaves the dialog as it was: the server still
 * refuses a signature it would not accept.
 */
export async function readSigningPosture(): Promise<SigningPosture | null> {
  try {
    const res = await fetch('/api/v1/auth/session', { credentials: 'include', headers: getAuthHeaders() });
    if (!res.ok) return null;
    const signing = ((await res.json()) as { user?: { signing?: unknown } } | null)?.user?.signing as
      | Partial<SigningPosture>
      | undefined;
    return signing && typeof signing.authenticatorRequired === 'boolean' && typeof signing.authenticatorEnrolled === 'boolean'
      ? { authenticatorRequired: signing.authenticatorRequired, authenticatorEnrolled: signing.authenticatorEnrolled }
      : null;
  } catch {
    return null;
  }
}

/** The posture, read each time `open` turns true; null until the server answers, or when it cannot. */
export function useSigningPosture(open: boolean): SigningPosture | null {
  const [posture, setPosture] = React.useState<SigningPosture | null>(null);
  React.useEffect(() => {
    if (!open) return undefined;
    let current = true;
    setPosture(null);
    void readSigningPosture().then((p) => {
      if (current) setPosture(p);
    });
    return () => {
      current = false;
    };
  }, [open]);
  return posture;
}
