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

/** True only for one of the ids above. */
export function isEsignMeaning(value: unknown): value is EsigMeaning {
  return typeof value === 'string' && ESIGN_MEANINGS.some((m) => m.id === value);
}
