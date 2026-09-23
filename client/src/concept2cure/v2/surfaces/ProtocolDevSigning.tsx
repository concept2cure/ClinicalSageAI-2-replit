/**
 * Protocol development — the two acts that are electronic signatures.
 *
 * Finalizing a protocol and recording a reviewer's disposition both run the
 * shared Part 11 EsignModal: §11.50 meaning, reason, and §11.200 re-entry of the
 * password, plus the authenticator code when the signer has one enrolled. The
 * modal pre-checks the password at /api/esignature/verify-password (rate
 * limited); the signing request then carries the password and code as `reauth`,
 * and the server re-verifies them inside the same transaction that writes the
 * change, the ledger row and the electronic_signatures row. Nothing stores them.
 * There is no other path to either act; the reason-only drawers they used to
 * have wrote a `sign` ledger row nobody had signed.
 */
import React from 'react';
import { EsignModal, type EsigSignedManifest, type EsignModalProps, type EsignSigner } from '../../_shared/components/EsignModal';
import { useAuthUser, type AuthUser } from '@/services/portal/authService';
import { finalizeProtocol, recordReviewDisposition } from './ProtocolDevWrites';

export type ProtocolSigning =
  | { kind: 'finalize' }
  | {
      kind: 'disposition';
      assignmentId: number;
      reviewer: string;
      disposition: string;
      /** The user the review is assigned to; null when it names someone with no account. */
      reviewerUserId: number | null;
    };

export interface ProtocolSignModalProps {
  signing: ProtocolSigning;
  documentId: number;
  documentTitle: string;
  onClose: () => void;
  /** Fires only after the server confirmed the signature. */
  onSigned: (signing: ProtocolSigning, result: Record<string, unknown>) => void;
}

const DISPOSITION_LABEL: Record<string, string> = {
  approve: 'Approve',
  approve_with_changes: 'Approve with changes',
  reject: 'Reject',
  abstain: 'Abstain',
};

/**
 * The signer the dialog prints. After a reload the session may carry no display
 * name or first name; never print "undefined" as the signer. The server records
 * the real printed name.
 */
function printedSigner(authUser: AuthUser | null): EsignSigner | undefined {
  const printed = [authUser?.displayName, [authUser?.firstName, authUser?.lastName].filter(Boolean).join(' '), authUser?.email]
    .find((v) => typeof v === 'string' && v.trim().length > 0);
  return printed ? { name: printed.trim(), ...(authUser?.email ? { email: authUser.email } : {}) } : undefined;
}

/** What each act says it signs, and the meaning it proposes. */
type ActDefaults = Pick<EsignModalProps, 'action' | 'target' | 'targetMeta' | 'defaultMeaning'>;

function actDefaults(signing: ProtocolSigning, documentId: number, documentTitle: string): ActDefaults {
  const protocol = documentTitle || `Protocol ${documentId}`;
  if (signing.kind === 'finalize') {
    return {
      action: 'Finalize protocol',
      target: protocol,
      targetMeta: 'The completeness check runs first. Finalizing freezes a new version.',
      defaultMeaning: 'authorship',
    };
  }
  const decision = DISPOSITION_LABEL[signing.disposition] ?? signing.disposition;
  const onBehalf = signing.reviewerUserId === null;
  return {
    action: `Sign disposition: ${decision}`,
    target: `${signing.reviewer || 'Reviewer'} · ${protocol}`,
    targetMeta: onBehalf
      ? `${signing.reviewer || 'This reviewer'} has no account here. You are recording their decision and take responsibility for the record.`
      : 'Your review of this protocol, signed as its assigned reviewer.',
    defaultMeaning: onBehalf ? 'responsibility' : 'review',
  };
}

export function ProtocolSignModal({ signing, documentId, documentTitle, onClose, onSigned }: ProtocolSignModalProps) {
  const authUser = useAuthUser();
  const signer = printedSigner(authUser);
  // The server demands the code whenever one is enrolled; ask for it up front.
  const requireMfa = authUser?.mfaEnabled === true;

  const onSign = async (input: { meaning: string; reason: string; password: string; totp?: string }): Promise<EsigSignedManifest> => {
    const result =
      signing.kind === 'finalize'
        ? await finalizeProtocol(documentId, input)
        : await recordReviewDisposition(signing.assignmentId, { disposition: signing.disposition, ...input });
    onSigned(signing, result);
    return {
      meaning: input.meaning as EsigSignedManifest['meaning'],
      reason: input.reason,
      signedAt: typeof result.signedAt === 'string' ? result.signedAt : '',
      ...(typeof result.sha256Chain === 'string' ? { hash: result.sha256Chain } : {}),
    };
  };

  return (
    <EsignModal
      open
      {...actDefaults(signing, documentId, documentTitle)}
      signer={signer}
      requireMfa={requireMfa}
      onClose={onClose}
      onSign={onSign}
    />
  );
}
