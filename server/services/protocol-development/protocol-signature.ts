/**
 * The signature ceremony for the protocol workspace's two signed acts:
 * finalizing a protocol and recording a reviewer's disposition.
 *
 * Both routes used to write a `command='sign'` ledger row through
 * recordGovernedAction and nothing else (weekly review 2026-09-22, finding P1).
 * They now run the platform's one ceremony, signGovernedAct
 * (services/part11/governed-signature-ceremony.ts): meaning, permission gate,
 * re-authentication, separation of duties, the domain write, the ledger pair
 * and the electronic_signatures row, on one transaction. This module only names
 * the protocol workspace's ledger domain and surface. The ceremony lived here
 * until report finalize needed it (reporting review 2026-10-01); it moved
 * rather than being copied.
 *
 * @module server/services/protocol-development/protocol-signature
 */
import {
  CEREMONY_SIGN_MEANINGS,
  GovernedSignatureRefusal,
  signGovernedAct,
  signerIpAddress,
  type CeremonySignMeaning,
  type GovernedSignatureInput,
} from '../part11/governed-signature-ceremony';

export const PROTOCOL_SIGN_MEANINGS = CEREMONY_SIGN_MEANINGS;
export type ProtocolSignMeaning = CeremonySignMeaning;

/** A refusal the route returns as-is: nothing was written. */
export { GovernedSignatureRefusal as ProtocolSignatureRefusal, signerIpAddress };

export type ProtocolSignatureInput = Omit<GovernedSignatureInput, 'domain' | 'surface' | 'subject'>;

export function signProtocolAct(input: ProtocolSignatureInput): Promise<Record<string, unknown>> {
  return signGovernedAct({ ...input, domain: 'protocol_development', surface: 'protocol-workspace', subject: 'protocol' });
}
