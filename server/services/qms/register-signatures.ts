/**
 * The signature block a controlled-document register row carries (MR-12 Stage
 * 5 step 4; 21 CFR 11.50): for the version in force, who approved it, when
 * (UTC) and with what meaning, and whether that approval still stands and
 * still binds the content; for a retired document, who retired it.
 *
 * The approval is judged by the one exact reader training and periodic review
 * use (current-release-approval.ts), batched, so the register can never show
 * an approval those readers would refuse. A read that fails is `unavailable`,
 * never unsigned.
 *
 * @module server/services/qms/register-signatures
 */
import type { QmsDocumentRow } from './document-approval-signature';
import type { InForceRelease } from './in-force-release';
import type { TrainingSqlClient } from './training';
import {
  readQmsReleaseApprovals,
  readQmsRetirementSignatures,
  type CurrentQmsReleaseApproval,
  type QmsRetirementSignature,
} from './current-release-approval';

export interface RegisterApprovalSignature {
  /** The version in force that this approval made effective. */
  version: string;
  state: CurrentQmsReleaseApproval['state'];
  signatureId: number | null;
  reason: string | null;
  signerName: string | null;
  signedAt: string | null;
  meaning: string | null;
}

export interface RegisterRetirementSignature {
  state: QmsRetirementSignature['state'];
  signatureId: number | null;
  signerName: string | null;
  signedAt: string | null;
  meaning: string | null;
}

export interface RegisterSignatureColumns {
  approval_signature: RegisterApprovalSignature | null;
  retirement_signature: RegisterRetirementSignature | null;
}

/** Each row's signature columns: an approval for a row with a version in force, a retirement for a retired row. */
export async function readRegisterSignatures(
  client: TrainingSqlClient,
  organizationId: number,
  rows: readonly QmsDocumentRow[],
  inForce: ReadonlyMap<number, InForceRelease>,
): Promise<(row: QmsDocumentRow) => RegisterSignatureColumns> {
  const retiredIds = rows.filter((row) => row.status === 'retired').map((row) => Number(row.id));
  const [approvals, retirements] = await Promise.all([
    readQmsReleaseApprovals(client, organizationId, [...inForce.values()].map((entry) => entry.release)),
    readQmsRetirementSignatures(client, organizationId, retiredIds),
  ]);
  return (row) => {
    const id = Number(row.id);
    const entry = inForce.get(id);
    const approval = entry ? approvals.get(id) : undefined;
    const retirement = row.status === 'retired' ? retirements.get(id) : undefined;
    return {
      approval_signature: entry && approval ? approvalColumn(String(entry.release.version), approval) : null,
      retirement_signature: retirement ? retirementColumn(retirement) : null,
    };
  };
}

function approvalColumn(version: string, approval: CurrentQmsReleaseApproval): RegisterApprovalSignature {
  return {
    version, state: approval.state, signatureId: approval.signatureId, reason: approval.reason,
    signerName: approval.signer?.signerName ?? null, signedAt: approval.signer?.signedAt ?? null, meaning: approval.signer?.meaning ?? null,
  };
}

function retirementColumn(retirement: QmsRetirementSignature): RegisterRetirementSignature {
  if (!('signer' in retirement)) return { state: retirement.state, signatureId: null, signerName: null, signedAt: null, meaning: null };
  return { state: retirement.state, signatureId: retirement.signatureId, ...retirement.signer };
}
