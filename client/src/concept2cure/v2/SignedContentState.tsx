/**
 * Whether a signature still binds the record it signed, said in words
 * (D5, 21 CFR Part 11 §11.70; docs/evidence/D5-SIGNED-CONTENT-ON-SCREEN/2026-10-29/).
 *
 * The server re-derives it on read: readSignedContentStates
 * (server/services/part11/signed-content-state.ts) takes the newest signature
 * in force on a target and compares the digest it bound with the record's
 * digest now. GET /api/mdx/labeling/:id carries it for the document and each
 * translation, and GET /api/mdx/risk-items/:id for the residual-risk
 * acceptance, as `signedContent`. This module is the one client reading of that
 * facet: the Labeling screen and the risk register (on the Risk screen and in
 * Engineering) draw it with SignedContentLine and hand it to AnA with
 * signedContentForAna.
 *
 * The protocol workspace's SignatureLine (surfaces/ProtocolDevReviews.tsx)
 * reads a different server facet (protocol-signature-manifestation.ts:
 * signed, revoked, none, with the protocol's signing-policy qualification),
 * which the server has not converged onto readSignedContentStates. It stays
 * where it is, as the server read does.
 *
 * Which state a record is in is the server's. Here it is only said:
 *   - a facet this client cannot read is `unavailable`, never `unsigned`;
 *   - every state is words first, with a tone and an icon beside them, so
 *     colour is never the only signal.
 *
 * @module client/src/concept2cure/v2/SignedContentState
 */
import React from 'react';
import { GovernedTimestamp } from '../_shared/components/GovernedTimestamp';
import { signatureMeaningLabel } from '../_shared/signatureMeaning';
import { useLiveData } from './dataConnect';
import { I } from './icons';

export type SignedContentStateName = 'matches' | 'changed' | 'unverified' | 'withdrawn' | 'unsigned' | 'unavailable';

/** The server's SignedContentFacet, as far as the screen reads it. */
export interface SignedContentFacet {
  state: SignedContentStateName;
  signatureId: number | null;
  signerName: string | null;
  /** ISO 8601. */
  signedAt: string | null;
  meaning: string | null;
  bindingBasis: string | null;
  /** Why the state is not `matches`, in the server's words. */
  reason: string | null;
}

const STATES: ReadonlySet<string> = new Set(['matches', 'changed', 'unverified', 'withdrawn', 'unsigned', 'unavailable']);

/** The basis of a signature taken before its content was bound: the ledger chain hash (BINDING_BASIS.GOVERNED_ACTION_LEDGER). */
export const PRE_BINDING_BASIS = 'governed-action-sha256-chain';

export const UNAVAILABLE_FACET: SignedContentFacet = Object.freeze({
  state: 'unavailable', signatureId: null, signerName: null, signedAt: null, meaning: null, bindingBasis: null, reason: null,
});

const text = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** The facet the server sent, or `unavailable` for anything this client cannot read as one. */
export function signedContentFacetOf(v: unknown): SignedContentFacet {
  const f = v as Record<string, unknown> | null | undefined;
  if (!f || typeof f !== 'object' || typeof f.state !== 'string' || !STATES.has(f.state)) return UNAVAILABLE_FACET;
  return {
    state: f.state as SignedContentStateName,
    signatureId: typeof f.signatureId === 'number' ? f.signatureId : null,
    signerName: text(f.signerName),
    signedAt: text(f.signedAt),
    meaning: text(f.meaning),
    bindingBasis: text(f.bindingBasis),
    reason: text(f.reason),
  };
}

/** A signature is on record, in force or not. */
export function carriesSignature(f: SignedContentFacet): boolean {
  return f.state === 'matches' || f.state === 'changed' || f.state === 'unverified' || f.state === 'withdrawn';
}

/** The state in words. */
export function signedContentWords(f: SignedContentFacet): string {
  switch (f.state) {
    case 'matches': return 'Signed content unchanged';
    case 'changed': return 'Changed since it was signed';
    case 'unverified':
      return f.bindingBasis === PRE_BINDING_BASIS
        ? 'Signed before content binding; not verifiable'
        : 'Signed; the signed content could not be verified';
    case 'withdrawn': return 'Signature withdrawn';
    case 'unsigned': return 'Not signed';
    default: return 'Signature state could not be read';
  }
}

const TONE: Readonly<Record<SignedContentStateName, string>> = {
  matches: 'ok', changed: 'err', unverified: 'warn', withdrawn: 'idle', unsigned: 'idle', unavailable: 'warn',
};
const ICON: Readonly<Record<SignedContentStateName, React.ReactNode>> = {
  matches: I.checkCircle, changed: I.alertTriangle, unverified: I.info, withdrawn: I.history, unsigned: null, unavailable: I.info,
};

/** The server's sentence, where the words alone do not say why. */
function detailOf(f: SignedContentFacet): string | null {
  if (f.state === 'changed') return f.reason;
  if (f.state === 'unverified' && f.bindingBasis !== PRE_BINDING_BASIS) return f.reason;
  return null;
}

/**
 * Whether a line is drawn: while the state is read, or once read, for a record
 * whose status says it is signed (`expected`), or that carries a signature.
 * A record that was never signed and is not expected to be says nothing.
 */
export function showsSignedContent(f: SignedContentFacet | null, expected: boolean, reading = false): boolean {
  if (reading || !f) return expected;
  return expected || carriesSignature(f);
}

const LINE: React.CSSProperties = { display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-300)' };

/**
 * One record's signature state: the words, then who signed, the meaning and
 * the time, then the server's reason where the words do not say it.
 */
export function SignedContentLine({ facet, expected, reading = false, label, testId }: {
  /** The facet as read; null while reading, or when the read failed (then it is `unavailable`). */
  facet: SignedContentFacet | null;
  /** The record's status says it is signed (approved, effective, accepted). */
  expected: boolean;
  reading?: boolean;
  /** What the signature is, e.g. "Approval signature". */
  label: string;
  testId?: string;
}) {
  if (!showsSignedContent(facet, expected, reading)) return null;
  if (reading) {
    return <span role="status" style={LINE} data-state="reading" data-testid={testId}>{label}: reading its state…</span>;
  }
  const f = facet ?? UNAVAILABLE_FACET;
  const detail = detailOf(f);
  return (
    <span style={LINE} data-state={f.state} data-testid={testId}>
      <span>{label}:</span>
      <span className={`rd-chip tone-${TONE[f.state]}`}>{ICON[f.state]}{signedContentWords(f)}</span>
      {carriesSignature(f) && (
        <span>
          Signed by <strong>{f.signerName ?? 'a signer with no printed name on record'}</strong>
          {' · ' + signatureMeaningLabel(f.meaning) + ' · '}
          <GovernedTimestamp value={f.signedAt} layout="inline" />
        </span>
      )}
      {detail && <span>{detail}</span>}
    </span>
  );
}

/** What AnA is told of one record's signature. `unavailable` says it is not "unsigned". */
export function signedContentForAna(f: SignedContentFacet | null, reading = false): Record<string, unknown> {
  if (reading) return { state: 'reading', words: 'The signature state is still being read; nothing is claimed about it yet.' };
  const x = f ?? UNAVAILABLE_FACET;
  return {
    state: x.state,
    words: signedContentWords(x),
    ...(carriesSignature(x) ? { signedBy: x.signerName, meaning: x.meaning, signedAt: x.signedAt } : {}),
    ...(x.reason ? { reason: x.reason } : {}),
    ...(x.state === 'unavailable' ? { note: 'The signature state was not read. This is not a statement that the record is unsigned.' } : {}),
  };
}

export interface SignedRecordRead {
  reading: boolean;
  /** The record's own facet; `unavailable` when the read failed or answered for another record. */
  facet: SignedContentFacet;
  /** The record the read answered, when it is the one asked for. */
  record: Record<string, unknown> | null;
}

/**
 * Read one record's GET for its `signedContent`. The answer is used only once
 * settled and only when it is the record asked for (`id`): a read in flight
 * still holds the previous record's answer.
 */
export function useSignedRecord(path: string | null, id: number | null, deps: React.DependencyList): SignedRecordRead {
  const read = useLiveData<unknown>(path, deps);
  return React.useMemo(() => {
    if (!path) return { reading: false, facet: UNAVAILABLE_FACET, record: null };
    if (read.loading) return { reading: true, facet: UNAVAILABLE_FACET, record: null };
    const data = read.data as Record<string, unknown> | null;
    const mine = !read.error && !!data && typeof data === 'object' && !Array.isArray(data) && Number(data.id) === id;
    return mine
      ? { reading: false, facet: signedContentFacetOf(data.signedContent), record: data }
      : { reading: false, facet: UNAVAILABLE_FACET, record: null };
  }, [path, id, read.loading, read.error, read.data]);
}
