/** Consume one integrity-checked historical tool result, never scientific approval.
 * Uses the existing turn reader and current artifact reader. No writes, alternate
 * registry, full audit-chain/HMAC verdict, or source-qualified seal path.
 */
import { sha256Hex, type Queryable, type RecordedStep, type TurnRecordBody } from './turn-record.js';
import { loadTurnRecord, verifyStoredTurnRecord, TurnRecordReadError, type StoredTurnRecord } from './turn-record-verify.js';
import { loadSavedText } from './docx-fidelity.js';
import type { SealVerifiedVersionInput } from './verifiedSealService.js';

export const RECORDED_FIDELITY_READ_LIMITS = Object.freeze({
  maxRecordBytes: 1_048_576, maxAuditBytes: 65_536, maxTextBytes: 1_048_576,
  maxTotalTextBytes: 4_194_304, maxTextRefs: 1024,
});
interface Receipt { turnRecordId: string; stepIndex: number; resultSha256: string; toolUseId?: string }
interface Target {
  organizationId: number; projectId: number; artifactPk: number; artifactId: string;
  versionId: number; version: number; contentSha256: string;
}
const digest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const positiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 2_147_483_647;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export class RecordedFidelityError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message); this.name = 'RecordedFidelityError';
  }
}
function refused(code: string, message: string, status = 400): never {
  throw new RecordedFidelityError(code, message, status);
}

/** Validate before acquiring a connection. Preserve explicit null/malformed refs. */
export function parseVerificationReceipt(value: unknown): Receipt {
  if (!object(value)) return refused('INVALID_VERIFICATION_RECEIPT', 'A complete recorded verification reference is required.');
  const allowed = ['turnRecordId', 'stepIndex', 'resultSha256', 'toolUseId'];
  const valid = [
    typeof value.turnRecordId === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value.turnRecordId),
    Number.isInteger(value.stepIndex) && Number(value.stepIndex) >= 0 && Number(value.stepIndex) <= 10000,
    digest(value.resultSha256),
    value.toolUseId === undefined || (typeof value.toolUseId === 'string' && value.toolUseId.trim().length > 0 && value.toolUseId.length <= 256),
    Object.keys(value).every(key => allowed.includes(key)),
  ];
  if (!valid.every(Boolean)) return refused('INVALID_VERIFICATION_RECEIPT', 'The recorded verification reference is malformed.');
  return { turnRecordId: String(value.turnRecordId).toLowerCase(), stepIndex: Number(value.stepIndex),
    resultSha256: value.resultSha256 as string, toolUseId: value.toolUseId as string | undefined };
}

async function authenticatedRecord(q: Queryable, organizationId: number, receipt: Receipt): Promise<StoredTurnRecord> {
  const stored = await loadTurnRecord(q, organizationId, receipt.turnRecordId, RECORDED_FIDELITY_READ_LIMITS);
  if (!stored) return refused('RECEIPT_UNAVAILABLE', 'The referenced verification record is unavailable.', 404);
  const verdict = verifyStoredTurnRecord(stored);
  if (!verdict.ok || verdict.chainPayloadIntact !== true || stored.organizationId !== organizationId) {
    return refused('RECEIPT_INTEGRITY_FAILED', 'The referenced record, texts or audit receipt did not verify.', 409);
  }
  return stored;
}

function selectedResult(stored: StoredTurnRecord, receipt: Receipt): { report: Record<string, unknown>; body: TurnRecordBody } {
  const body = JSON.parse(stored.recordText) as TurnRecordBody;
  if (!object(body.turn) || body.schema !== stored.schemaVersion || body.turn.organizationId !== stored.organizationId) {
    return refused('RECEIPT_INTEGRITY_FAILED', 'The recorded context is inconsistent.', 409);
  }
  const step = body.steps[receipt.stepIndex] as RecordedStep | undefined;
  if (!step) return refused('RECEIPT_STEP_MISMATCH', 'The reference does not identify a recorded step.', 409);
  const eligible = [step.tool === 'verify_docx_against_source', step.status === 'success',
    step.runBy === 'platform', step.error === null,
    step.heldBack === undefined || step.heldBack === false, step.result?.sha256 === receipt.resultSha256];
  if (receipt.toolUseId !== undefined) {
    eligible.push(step.toolUseId === receipt.toolUseId,
      body.steps.filter(s => s.toolUseId === receipt.toolUseId).length === 1);
  }
  if (!eligible.every(Boolean)) return refused('RECEIPT_STEP_MISMATCH', 'The reference does not identify one successful full verifier result.', 409);
  const text = stored.texts.get(receipt.resultSha256)!;
  let report: unknown;
  try { report = JSON.parse(text); } catch { return refused('RECEIPT_SCOPE_INSUFFICIENT', 'The recorded verifier result is not usable fidelity evidence.'); }
  if (!object(report)) return refused('RECEIPT_SCOPE_INSUFFICIENT', 'The recorded verifier result is not usable fidelity evidence.');
  return { report, body };
}

function fidelityTarget(report: Record<string, unknown>): Target {
  const divergence = object(report.divergence) ? report.divergence : {};
  const eligible = [report.ok === true, report.artifactVerified === true, report.sourceDiffPerformed === true,
    report.scope === 'persisted_artifact_fidelity', report.comparisonBasis === 'persisted_artifact',
    report.sourceVerified === false, report.sourceQualification === 'unassessed', report.sealEligible === false,
    Array.isArray(report.missingRequiredStrings) && report.missingRequiredStrings.length === 0,
    divergence.additions === 0, divergence.deletions === 0,
    digest(report.docxSha256), Number.isSafeInteger(report.docxSizeBytes) && Number(report.docxSizeBytes) > 0,
    typeof report.extractionMethod === 'string' && report.extractionMethod !== 'none',
  ];
  if (!eligible.every(Boolean)) return refused('RECEIPT_SCOPE_INSUFFICIENT', 'Only recorded copying fidelity is supported; source qualification is not established.');
  const target = report.target;
  if (!object(target)) return refused('RECEIPT_TARGET_MISMATCH', 'The recorded target is incomplete.', 409);
  const valid = [
    [target.organizationId, target.projectId, target.artifactPk, target.versionId, target.version].every(positiveInteger),
    typeof target.artifactId === 'string' && target.artifactId.trim().length > 0,
    digest(target.contentSha256), report.comparisonTextSha256 === target.contentSha256,
    report.extractedTextSha256 === target.contentSha256,
  ];
  if (!valid.every(Boolean)) return refused('RECEIPT_TARGET_MISMATCH', 'The recorded target or text hashes are inconsistent.', 409);
  return target as unknown as Target;
}

async function bindCurrentTarget(q: Queryable, input: SealVerifiedVersionInput, target: Target, body: TurnRecordBody): Promise<void> {
  const selectors = [[input.artifactPk, target.artifactPk], [input.artifactExternalId, target.artifactId],
    [input.existingVersionId, target.versionId], [input.existingVersionNumber, target.version]];
  const agrees = [target.organizationId === input.organizationId, target.projectId === input.projectId,
    input.artifactPk !== undefined || input.artifactExternalId !== undefined,
    input.existingVersionId !== undefined || input.existingVersionNumber !== undefined,
    sha256Hex(input.content) === target.contentSha256,
    selectors.every(([selector, actual]) => selector === undefined || selector === actual),
    typeof body.turn.projectId === 'string',
  ];
  if (!agrees.every(Boolean)) return refused('RECEIPT_TARGET_MISMATCH', 'The recorded target does not match the requested seal.', 409);
  const saved = await loadSavedText(q, { organizationId: input.organizationId, projectId: input.projectId,
    projectRef: body.turn.projectId }, input.organizationId, { artifactId: target.artifactId, version: target.version });
  if (!saved || !Object.entries(target).every(([key, value]) => saved.target[key as keyof Target] === value)) {
    return refused('RECEIPT_TARGET_MISMATCH', 'The recorded target changed or is unavailable under current ownership and disposition.', 409);
  }
}

/** A compact historical integrity receipt, never returned as seal authorization. */
export async function consumeRecordedDocxFidelity(q: Queryable, input: SealVerifiedVersionInput, reference: unknown) {
  const receipt = parseVerificationReceipt(reference);
  try {
    const stored = await authenticatedRecord(q, input.organizationId, receipt);
    const { report, body } = selectedResult(stored, receipt);
    const target = fidelityTarget(report);
    await bindCurrentTarget(q, input, target, body);
    return { ...receipt, recordSha256: stored.recordSha256, target,
      scope: 'persisted_artifact_fidelity' as const, sourceVerified: false as const,
      sourceQualification: 'unassessed' as const, sealEligible: false as const,
      auditPayloadVerified: true as const, fullAuditChainVerified: false as const };
  } catch (error) {
    if (error instanceof RecordedFidelityError) throw error;
    if (error instanceof TurnRecordReadError) return refused(
      error.code === 'LIMIT_EXCEEDED' ? 'RECEIPT_LIMIT_EXCEEDED' : 'RECEIPT_INTEGRITY_FAILED', error.message, 409);
    return refused('VERIFICATION_UNAVAILABLE', 'Recorded fidelity verification could not complete.', 503);
  }
}
