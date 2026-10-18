import {
  qmsTrainingAcknowledgementInputSchema,
  qmsTrainingAcknowledgementResponseSchema,
  qmsTrainingContextSchema,
  type QmsTrainingAcknowledgement,
  type QmsTrainingContext,
} from '@shared/qms/training';
import { apiRequest, ApiRequestError, redactInternals, serverMessage } from '@/lib/queryClient';
import { capturedActorHeaders } from '@/utils/authToken';

export interface PersonalTrainingScope {
  documentId: number;
  userId: number;
  organizationId: number;
}

export interface PersonalTrainingDocument {
  id: number;
  organization_id: number;
  version: string;
  status: QmsTrainingContext['status'];
  metadata?: unknown;
}

export class PersonalTrainingError extends Error {
  constructor(message: string, public readonly unconfirmed = false) {
    super(message);
    this.name = 'PersonalTrainingError';
  }
}

const UNCONFIRMED = 'The acknowledgement could not be confirmed. Reload this record to check whether it was recorded before trying again.';
const UNREADABLE = 'The released revision could not be verified. Reload this record before acknowledging it.';
const REFUSED = 'The acknowledgement was refused. Reload the released revision before trying again.';
const SESSION_CHANGED = 'Your signed-in account or organization changed. Close this document and reopen it before saving or acknowledging.';

export function personalTrainingScope(
  user: { id?: unknown; organizationId?: unknown } | null,
  documentId: number,
): PersonalTrainingScope | null {
  const parseId = (value: unknown) => {
    if (typeof value !== 'number' && (typeof value !== 'string' || !/^[1-9]\d*$/.test(value))) return null;
    const n = Number(value);
    return Number.isInteger(n) && n > 0 && n <= 2_147_483_647 ? n : null;
  };
  const userId = parseId(user?.id);
  const organizationId = parseId(user?.organizationId);
  return userId && organizationId && parseId(documentId) ? { documentId, userId, organizationId } : null;
}

/** Pin the exact bearer whose identity matches the reader. A storage/account
 * change before React rerenders must not attest under a different actor.
 * Claim decoding is a client consistency check; the server verifies the JWT. */
export function personalTrainingWriteHeaders(scope: PersonalTrainingScope): Record<string, string> {
  try {
    if (!personalTrainingScope({ id: scope.userId, organizationId: scope.organizationId }, scope.documentId)) throw new Error(SESSION_CHANGED);
    return capturedActorHeaders(scope);
  } catch {
    throw new PersonalTrainingError(SESSION_CHANGED);
  }
}

function isConfirmedRefusal(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError && error.code !== 'OUTCOME_UNKNOWN' &&
    ((error.status >= 400 && error.status < 500 && error.status !== 408) || error.code === 'AUDIT_WRITE_FAILED');
}

function receiptMatches(receipt: QmsTrainingAcknowledgement, scope: PersonalTrainingScope, context: QmsTrainingContext): boolean {
  return receipt.documentId === scope.documentId && receipt.userId === scope.userId &&
    receipt.documentVersion === context.documentVersion && receipt.contentDigest === context.contentDigest &&
    (receipt.expiresAt === null || Date.parse(receipt.expiresAt) > Date.now());
}

/** Authenticated canonical transport; no optimistic acknowledgement or tenant fallback. */
export async function readPersonalTrainingRecord(scope: PersonalTrainingScope): Promise<{
  context: QmsTrainingContext;
  document: PersonalTrainingDocument;
}> {
  const res = await apiRequest('GET', `/api/mdx/qms/documents/${scope.documentId}`);
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new PersonalTrainingError(serverMessage(body) ?? 'Your session could not be verified. Sign in again to read this record.');
  const envelope = body as { data?: { id?: unknown; organization_id?: unknown; version?: unknown; status?: unknown }; meta?: { training?: unknown } } | null;
  const parsed = qmsTrainingContextSchema.safeParse(envelope?.meta?.training);
  if (!parsed.success || envelope?.data?.id !== scope.documentId ||
      envelope.data.organization_id !== scope.organizationId || parsed.data.documentId !== scope.documentId ||
      envelope.data.version !== parsed.data.documentVersion || envelope.data.status !== parsed.data.status) {
    throw new PersonalTrainingError(UNREADABLE);
  }
  const context = parsed.data;
  if (context.acknowledgement && !receiptMatches(context.acknowledgement, scope, context)) {
    throw new PersonalTrainingError(UNREADABLE);
  }
  return { context, document: envelope.data as PersonalTrainingDocument };
}

export async function readPersonalTraining(scope: PersonalTrainingScope): Promise<QmsTrainingContext> {
  return (await readPersonalTrainingRecord(scope)).context;
}

export async function acknowledgePersonalTraining(scope: PersonalTrainingScope, context: QmsTrainingContext): Promise<{
  receipt: QmsTrainingAcknowledgement;
  alreadyAcknowledged: boolean;
}> {
  if (!context.eligible || context.documentId !== scope.documentId || !context.contentDigest) throw new PersonalTrainingError(REFUSED);
  const input = qmsTrainingAcknowledgementInputSchema.parse({
    documentVersion: context.documentVersion, contentDigest: context.contentDigest,
    understood: true, method: 'attestation',
  });
  const headers = personalTrainingWriteHeaders(scope);
  let res: Response;
  try {
    res = await apiRequest('POST', `/api/mdx/qms/documents/${scope.documentId}/training-ack`, input, headers);
  } catch (error) {
    if (isConfirmedRefusal(error)) {
      throw new PersonalTrainingError(redactInternals(error.message, REFUSED));
    }
    throw new PersonalTrainingError(UNCONFIRMED, true);
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status < 400 || res.status >= 500 || res.status === 408) throw new PersonalTrainingError(UNCONFIRMED, true);
    throw new PersonalTrainingError(serverMessage(body) ?? REFUSED);
  }
  const parsed = qmsTrainingAcknowledgementResponseSchema.safeParse(body);
  if (!parsed.success || !receiptMatches(parsed.data.data, scope, context)) throw new PersonalTrainingError(UNCONFIRMED, true);
  return { receipt: parsed.data.data, alreadyAcknowledged: parsed.data.meta.alreadyAcknowledged === true };
}
