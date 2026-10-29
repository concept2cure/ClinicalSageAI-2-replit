/**
 * The Vault's seals (VR-19, docs/design/VAULT_DATA_ROOM_SEAL_2026-10-29.md).
 *
 * GET  /api/c2c/project-vault/:id/seals
 * POST /api/c2c/project-vault/:id/seals              (the one e-sign ceremony)
 * GET  /api/c2c/project-vault/:id/seals/:sealId/verify?bytes=1
 * GET  /api/c2c/project-vault/:id/seals/:sealId/archive   (VR-20, the closing archive)
 *
 * Each seal is listed with when, who, why, how many documents and its hash. A
 * role that may write the Vault is offered "Seal this Vault" through the
 * shared EsignModal; the server also requires signing authority. Verify
 * re-reads every sealed file and says the verdict in words: intact, changed
 * (naming the documents) or could not verify. A list that could not be read
 * says so, and is never shown as "no seals".
 *
 * Once a seal verifies intact, its closing archive can be downloaded: one ZIP
 * of the sealed files, the manifest as signed, an index, SHA256SUMS and the
 * audit extract (docs/design/VAULT_CLOSING_ARCHIVE_2026-10-29.md). The file
 * received is checked against the SHA-256 the server recorded before it is
 * saved, and that hash is stated.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ApiRequestError, apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import { useAuthUser } from '@/services/portal/authService';
import { EsignModal, esignSignerOf, type EsigSignedManifest } from '../../_shared/components/EsignModal';
import { useVaultCanWrite } from './VaultViewOnly';
import { downloadBlob } from '../download';

export interface VaultSealShape {
  id: string;
  reason: string;
  manifestSha256: string;
  documentCount: number;
  sealedBy: number;
  sealedByName: string | null;
  sealedAt: string;
}

export interface SealVerificationShape {
  verdict: 'intact' | 'changed' | 'could_not_verify';
  changed: Array<{ id: string; title: string | null; why: 'removed' | 'content_changed' }>;
  unreadable: Array<{ id: string; title: string | null; why: string }>;
  manifestIntact: boolean;
  bytesChecked: boolean;
}

const READ_FAILED = 'The seals could not be read.';
const VERIFY_FAILED = 'The seal could not be verified. This is not a verdict.';
const SEAL_UNCONFIRMED = 'The server did not confirm the seal. Reload the Vault and check its seals before you seal again.';
const ARCHIVE_FAILED = 'The closing archive was not downloaded.';

const base = (projectId: string) => `/api/c2c/project-vault/${encodeURIComponent(projectId)}`;

function utc(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function isSeal(v: unknown): v is VaultSealShape {
  const s = v as Partial<VaultSealShape> | null;
  return !!s && typeof s.id === 'string' && typeof s.reason === 'string' && typeof s.manifestSha256 === 'string' &&
    typeof s.documentCount === 'number' && typeof s.sealedBy === 'number' && typeof s.sealedAt === 'string' &&
    (s.sealedByName === null || typeof s.sealedByName === 'string');
}

function isVerification(v: unknown): v is SealVerificationShape {
  const s = v as Partial<SealVerificationShape> | null;
  return !!s && ['intact', 'changed', 'could_not_verify'].includes(String(s.verdict)) &&
    Array.isArray(s.changed) && Array.isArray(s.unreadable) && typeof s.manifestIntact === 'boolean' && typeof s.bytesChecked === 'boolean';
}

/** The verdict in words: what was checked, and what did not match. */
export function verdictSentence(v: SealVerificationShape): string {
  const named = (list: Array<{ title: string | null; id: string }>) => list.map((d) => d.title || d.id).join(', ');
  if (v.verdict === 'intact') {
    return v.bytesChecked
      ? 'Intact: every sealed document is recorded with its sealed hash, and each stored file was read again and matches.'
      : 'Intact: every sealed document is recorded with its sealed hash.';
  }
  if (v.verdict === 'changed') {
    const removed = v.changed.filter((d) => d.why === 'removed');
    const altered = v.changed.filter((d) => d.why === 'content_changed');
    return ['Changed: the Vault no longer matches this seal.',
      removed.length ? `No longer recorded: ${named(removed)}.` : '',
      altered.length ? `Recorded with a different hash: ${named(altered)}.` : ''].filter(Boolean).join(' ');
  }
  return ['Could not verify: this seal is not confirmed intact.',
    v.manifestIntact ? '' : 'The seal’s own record no longer hashes to the value recorded when it was signed.',
    v.unreadable.length ? `Not readable: ${v.unreadable.map((d) => `${d.title || d.id} (${d.why})`).join('; ')}.` : ''].filter(Boolean).join(' ');
}

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  return (await res.json().catch(() => null)) as Record<string, unknown> | null;
}

/** Seal through the one ceremony; the signed manifest the dialog shows, or the refusal in the server's words. */
async function postSeal(projectId: string, input: { meaning: string; reason: string; password: string; totp?: string }): Promise<EsigSignedManifest> {
  let res: Response;
  try {
    res = await apiRequest('POST', `${base(projectId)}/seals`, {
      password: input.password, ...(input.totp ? { mfaToken: input.totp } : {}), meaning: input.meaning, reason: input.reason,
    });
  } catch (e) {
    // A coded refusal is the server's sentence. A dropped connection or a server
    // error may have come after the commit, so it is not "nothing was sealed".
    const status = (e as { status?: unknown } | null)?.status;
    if (typeof status === 'number' && status < 500) {
      throw new Error(redactInternals(e instanceof ApiRequestError ? serverMessage(e.payload) : null, 'The seal was refused. Nothing was sealed.'), { cause: e });
    }
    throw new Error(SEAL_UNCONFIRMED, { cause: e });
  }
  const json = await readJson(res);
  if (!res.ok) throw new Error(redactInternals(serverMessage(json), `The seal was refused (HTTP ${res.status}). Nothing was sealed.`));
  if (typeof json?.signedAt !== 'string') throw new Error(SEAL_UNCONFIRMED);
  return { meaning: input.meaning as EsigSignedManifest['meaning'], reason: input.reason, signedAt: json.signedAt,
    ...(typeof json.sha256Chain === 'string' ? { hash: json.sha256Chain } : {}) };
}

async function sha256Hex(buf: ArrayBuffer): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const digest = await subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

type ArchiveOutcome = { text: string; saved: boolean };

/** A refused archive request in words: the seal's verdict when the server sent one. */
function archiveRefusal(e: unknown): ArchiveOutcome {
  const payload = e instanceof ApiRequestError ? (e.payload as { verification?: unknown } | undefined) : undefined;
  const verification = payload ? payload.verification : undefined;
  if (isVerification(verification)) return { text: `${ARCHIVE_FAILED} ${verdictSentence(verification)}`, saved: false };
  return { text: redactInternals(e instanceof ApiRequestError ? serverMessage(e.payload) : null, `${ARCHIVE_FAILED} Nothing was saved.`), saved: false };
}

/** Save a received archive only when it hashes to what the server recorded for it. */
async function saveArchive(res: Response, sealId: string): Promise<ArchiveOutcome> {
  const header = (name: string) => (res.headers && typeof res.headers.get === 'function' ? res.headers.get(name) : null);
  const recorded = (header('X-Content-SHA256') ?? '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(recorded)) {
    return { text: `${ARCHIVE_FAILED} The server did not state the archive's SHA-256, so it was not saved.`, saved: false };
  }
  const bytes = await res.arrayBuffer();
  const received = await sha256Hex(bytes);
  if (received !== null && received !== recorded) {
    return { text: `${ARCHIVE_FAILED} The file received does not match the SHA-256 the server recorded for it, so it was not saved.`, saved: false };
  }
  const named = /filename="?([^";]+)"?/.exec(header('Content-Disposition') ?? '');
  const name = named ? named[1] : `vault-seal-${sealId.slice(0, 8)}-closing-archive.zip`;
  if (!downloadBlob(name, new Blob([bytes], { type: 'application/zip' }))) {
    return { text: 'The closing archive was received, but the browser refused to save it.', saved: false };
  }
  const withheld = Number(header('X-Archive-Withheld') ?? '0');
  const saved = received === null
    ? `Closing archive saved. SHA-256 recorded by the server: ${recorded}. This browser could not check it; sha256sum will.`
    : `Closing archive saved. Its SHA-256, checked on receipt against the server's record: ${recorded}.`;
  return {
    text: withheld > 0
      ? `${saved} ${withheld === 1
        ? '1 sealed document’s original file was removed under a data disposition and is not in it; the index lists it.'
        : `${withheld} sealed documents’ original files were removed under a data disposition and are not in it; the index lists them.`}`
      : saved,
    saved: true,
  };
}

/**
 * Fetch a seal's closing archive, check it against the hash the server
 * recorded for it, and save it. The outcome in words, and whether it was saved.
 */
export async function downloadSealArchive(projectId: string, sealId: string): Promise<ArchiveOutcome> {
  let res: Response;
  try {
    res = await apiRequest('GET', `${base(projectId)}/seals/${encodeURIComponent(sealId)}/archive`);
  } catch (e) {
    return archiveRefusal(e);
  }
  if (!res.ok) return { text: redactInternals(serverMessage(await readJson(res)), `${ARCHIVE_FAILED} (HTTP ${res.status})`), saved: false };
  return saveArchive(res, sealId);
}

function SealRow({ projectId, seal }: { projectId: string; seal: VaultSealShape }) {
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<{ text: string; verdict: SealVerificationShape['verdict'] | 'failed' } | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveNote, setArchiveNote] = useState<{ text: string; saved: boolean } | null>(null);
  const archive = async () => {
    setArchiving(true);
    setArchiveNote(null);
    try {
      setArchiveNote(await downloadSealArchive(projectId, seal.id));
    } catch (e) {
      setArchiveNote({ text: e instanceof Error && e.message ? `${ARCHIVE_FAILED} ${e.message}` : ARCHIVE_FAILED, saved: false });
    } finally {
      setArchiving(false);
    }
  };
  const verify = async () => {
    setVerifying(true);
    setResult(null);
    try {
      const res = await apiRequest('GET', `${base(projectId)}/seals/${encodeURIComponent(seal.id)}/verify?bytes=1`);
      const json = await readJson(res);
      const v = (json?.data as { verification?: unknown } | undefined)?.verification;
      if (!res.ok || !isVerification(v)) throw new Error(redactInternals(serverMessage(json), VERIFY_FAILED));
      setResult({ text: verdictSentence(v), verdict: v.verdict });
    } catch (e) {
      setResult({ text: e instanceof Error && e.message ? e.message : VERIFY_FAILED, verdict: 'failed' });
    } finally {
      setVerifying(false);
    }
  };
  return (
    <li className="vd-seal" data-testid="vault-seal-row">
      <div className="vd-seal-head">
        <span>
          Sealed {utc(seal.sealedAt)} by {seal.sealedByName ?? `user ${seal.sealedBy}`} · {seal.documentCount}{' '}
          {seal.documentCount === 1 ? 'document' : 'documents'} ·{' '}
          <span className="mono" title={seal.manifestSha256}>SHA-256 {seal.manifestSha256.slice(0, 12)}…</span>
        </span>
        <button type="button" className="sp-ask" disabled={verifying} onClick={() => void verify()} data-testid="vault-seal-verify">
          {verifying ? 'Verifying…' : 'Verify'}
        </button>
      </div>
      <div className="vd-seal-reason">Reason: {seal.reason}</div>
      {result && (
        <div className="vd-seal-verdict" role={result.verdict === 'intact' ? 'status' : 'alert'} data-testid="vault-seal-verdict">
          {result.text}
        </div>
      )}
      {result?.verdict === 'intact' && (
        <div className="vd-seal-archive">
          <button type="button" className="sp-ask" disabled={archiving} onClick={() => void archive()} data-testid="vault-seal-archive">
            {archiving ? 'Building the archive…' : 'Download closing archive'}
          </button>
          <span className="vd-seals-note">The sealed files, the record as signed, an index, SHA256SUMS and the audit trail, in one ZIP.</span>
        </div>
      )}
      {archiveNote && (
        <div className="vd-seal-verdict vd-seal-archive-note" role={archiveNote.saved ? 'status' : 'alert'} data-testid="vault-seal-archive-note">
          {archiveNote.text}
        </div>
      )}
    </li>
  );
}

export function VaultSeals({ projectId }: { projectId: string }) {
  const canWrite = useVaultCanWrite();
  const user = useAuthUser();
  const [seals, setSeals] = useState<VaultSealShape[] | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [sealing, setSealing] = useState(false);
  const load = useCallback(async () => {
    setReadError(null);
    try {
      const res = await apiRequest('GET', `${base(projectId)}/seals`);
      const json = await readJson(res);
      const list = (json?.data as { seals?: unknown } | undefined)?.seals;
      if (!res.ok || !Array.isArray(list) || !list.every(isSeal)) throw new Error(`${READ_FAILED} ${redactInternals(serverMessage(json), 'This is not an empty list.')}`);
      setSeals(list);
    } catch (e) {
      setSeals(null);
      setReadError(e instanceof Error && e.message ? e.message : READ_FAILED);
    }
  }, [projectId]);
  useEffect(() => { void load(); }, [load]);

  return (
    <section className="vd-seals" aria-labelledby="vault-seals-heading" data-testid="vault-seals">
      <div className="vd-d-seclbl" id="vault-seals-heading">Seals</div>
      <p className="vd-seals-note">
        A seal records every current document in this Vault (its version, content hash, filing and review stage) as it stands, under
        your electronic signature. Nothing can change a seal afterwards; anyone in the organisation can verify it.
      </p>
      {readError && <p role="alert" data-testid="vault-seals-error">{readError} <button type="button" className="sp-ask" onClick={() => void load()}>Try again</button></p>}
      {seals && seals.length === 0 && <p data-testid="vault-seals-empty">This Vault has not been sealed.</p>}
      {seals && seals.length > 0 && <ul className="vd-seal-list">{seals.map((s) => <SealRow key={s.id} projectId={projectId} seal={s} />)}</ul>}
      {canWrite && seals && (
        <button type="button" className="sp-primary" onClick={() => setSealing(true)} data-testid="vault-seal-open">Seal this Vault…</button>
      )}
      {sealing && (
        <EsignModal
          open
          action="Seal this Vault"
          target="Every current document in this project’s Vault"
          targetMeta="You attest that this records each current document's identity, version, content hash, filing and review stage as they stand now. The seal cannot be changed afterwards."
          defaultMeaning="approval"
          meanings={['approval', 'responsibility']}
          signer={esignSignerOf(user as Parameters<typeof esignSignerOf>[0])}
          onClose={() => setSealing(false)}
          onSign={async (input) => {
            const manifest = await postSeal(projectId, input);
            void load();
            return manifest;
          }}
        />
      )}
    </section>
  );
}
