/**
 * The meanings a signer may declare (§11.50(a)(3)), as the client offers them.
 *
 * One list for every sign surface: the shared EsignModal and the Pathway
 * approval card both read it, so neither can offer a meaning the server's
 * closed vocabulary (server/services/part11/signature-meanings.ts,
 * GOVERNED_SIGN_MEANINGS) would refuse.
 */
import type { EsigMeaning } from '../hooks/useEsignature';

export const ESIGN_MEANINGS: ReadonlyArray<{ id: EsigMeaning; label: string; desc: string }> = [
  { id: 'authorship', label: 'Authorship', desc: 'You authored this content' },
  { id: 'review', label: 'Review', desc: 'You reviewed this content' },
  { id: 'approval', label: 'Approval', desc: 'You approve this content for use' },
  { id: 'responsibility', label: 'Responsibility', desc: 'You take responsibility for this content' },
  { id: 'release', label: 'Release', desc: 'You authorize release or submission' },
];

/**
 * Meanings that belong to one act and are offered only where a dialog names
 * them (`meanings`): retiring a controlled document (P-51). A dialog that names
 * none offers the five above.
 */
export const ACT_ESIGN_MEANINGS: ReadonlyArray<{ id: EsigMeaning; label: string; desc: string }> = [
  { id: 'retirement', label: 'Retirement', desc: 'You withdraw this document from use' },
];

/** Every meaning a dialog can name. */
export const ALL_ESIGN_MEANINGS = [...ESIGN_MEANINGS, ...ACT_ESIGN_MEANINGS];

/** True only for one of the ids above. */
export function isEsignMeaning(value: unknown): value is EsigMeaning {
  return typeof value === 'string' && ALL_ESIGN_MEANINGS.some((m) => m.id === value);
}
