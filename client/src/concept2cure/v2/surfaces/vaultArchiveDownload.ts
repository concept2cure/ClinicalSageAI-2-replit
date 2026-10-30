/**
 * Save a Vault archive only when it hashes to what the server recorded for it.
 * One path for every archive the Vault sends: a seal's closing archive (VR-20)
 * and a folder's export (MR-08 Stage 6). The server commits the archive's
 * SHA-256 to the audit trail before a byte is sent and states it in
 * X-Content-SHA256; a file that does not match is not saved.
 */
import { downloadBlob } from '../download';

export type ArchiveOutcome = { text: string; saved: boolean };

export async function sha256Hex(buf: ArrayBuffer): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const digest = await subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface ArchiveWords {
  /** The refusal's opening, e.g. "The closing archive was not saved." */
  failed: string;
  /** What the file is, capitalised, e.g. "Closing archive". */
  noun: string;
  /** The file name when the server gave none. */
  fallbackName: string;
  /** What a count of withheld files means for this archive. */
  withheld: (n: number) => string;
}

export async function saveVerifiedArchive(res: Response, words: ArchiveWords): Promise<ArchiveOutcome> {
  const header = (name: string) => (res.headers && typeof res.headers.get === 'function' ? res.headers.get(name) : null);
  const recorded = (header('X-Content-SHA256') ?? '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(recorded)) {
    return { text: `${words.failed} The server did not state the archive's SHA-256, so it was not saved.`, saved: false };
  }
  const bytes = await res.arrayBuffer();
  const received = await sha256Hex(bytes);
  if (received !== null && received !== recorded) {
    return { text: `${words.failed} The file received does not match the SHA-256 the server recorded for it, so it was not saved.`, saved: false };
  }
  const named = /filename="?([^";]+)"?/.exec(header('Content-Disposition') ?? '');
  if (!downloadBlob(named ? named[1] : words.fallbackName, new Blob([bytes], { type: 'application/zip' }))) {
    return { text: `The ${words.noun.toLowerCase()} was received, but the browser refused to save it.`, saved: false };
  }
  const withheld = Number(header('X-Archive-Withheld') ?? '0');
  const saved = received === null
    ? `${words.noun} saved. SHA-256 recorded by the server: ${recorded}. This browser could not check it; sha256sum will.`
    : `${words.noun} saved. Its SHA-256, checked on receipt against the server's record: ${recorded}.`;
  return { text: withheld > 0 ? `${saved} ${words.withheld(withheld)}` : saved, saved: true };
}
