import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  DispositionError,
  type DispositionApplyInput,
  type DispositionPreviewInput,
  type DispositionServiceDependencies,
  type Snapshot,
} from './types';

const HASH = /^[0-9a-f]{64}$/;
const FRESH_PREVIEW_MESSAGE = 'Open a fresh impact preview before confirming.';
const INVALID_SIGNATURE_MESSAGE = 'The preview signature is invalid. Open a fresh preview.';
const EXPIRED_OR_MISMATCHED_MESSAGE = 'The preview expired or belongs to a different choice, source, project or actor. Open a fresh preview.';

interface SignedPreviewPayload {
  version: number;
  organizationId: number;
  programId: string;
  actorId: number;
  targetType: DispositionPreviewInput['targetType'];
  targetId: string;
  replacementId: string | null;
  hash: string;
  expiresAt: string;
}

export function hashSnapshot(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function previewComponents(previewToken: string): { body: string; signature: string } {
  if (typeof previewToken !== 'string' || previewToken.length > 6000) {
    throw new DispositionError(409, 'STALE_PREVIEW', FRESH_PREVIEW_MESSAGE);
  }
  const [body, signature, extra] = previewToken.split('.');
  if (!body || !signature || extra !== undefined) {
    throw new DispositionError(409, 'STALE_PREVIEW', FRESH_PREVIEW_MESSAGE);
  }
  return { body, signature };
}

function parsePreviewBody(body: string): SignedPreviewPayload {
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw new DispositionError(409, 'STALE_PREVIEW', FRESH_PREVIEW_MESSAGE);
  }
}

function bindingMatches(payload: SignedPreviewPayload, input: DispositionApplyInput): boolean {
  return payload.version === 1
    && payload.organizationId === input.organizationId
    && payload.programId === input.programId
    && payload.actorId === input.actorId
    && payload.targetType === input.targetType
    && payload.targetId === String(input.targetId)
    && payload.replacementId === (input.replacementId ?? null);
}

function sealIsCurrent(payload: SignedPreviewPayload, now: () => Date): boolean {
  return HASH.test(payload.hash ?? '')
    && Number.isFinite(Date.parse(payload.expiresAt))
    && !(Date.parse(payload.expiresAt) <= now().getTime());
}

function signatureFor(body: string, secret: string): string {
  if (secret.length < 32) {
    throw new DispositionError(503, 'PREVIEW_SIGNING_UNAVAILABLE', 'The disposition preview cannot be authenticated. Nothing was changed.');
  }
  return createHmac('sha256', secret).update(body).digest('base64url');
}

export function createDispositionTokenCodec(deps: Pick<DispositionServiceDependencies, 'tokenSecret' | 'clock'>) {
  const now = deps.clock ?? (() => new Date());
  const sign = (body: string) => signatureFor(body, deps.tokenSecret);

  function token(input: DispositionPreviewInput, snapshot: Snapshot, expiresAt: string): string {
    const body = Buffer.from(JSON.stringify({
      version: 1,
      organizationId: input.organizationId,
      programId: input.programId,
      actorId: input.actorId,
      targetType: input.targetType,
      targetId: String(input.targetId),
      replacementId: input.replacementId ?? null,
      hash: hashSnapshot(snapshot),
      expiresAt,
    })).toString('base64url');
    return `${body}.${sign(body)}`;
  }

  function decode(input: DispositionApplyInput): { hash: string; expiresAt: string } {
    const { body, signature } = previewComponents(input.previewToken);
    const expected = Buffer.from(sign(body));
    const supplied = Buffer.from(signature);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      throw new DispositionError(409, 'STALE_PREVIEW', INVALID_SIGNATURE_MESSAGE);
    }
    const parsed = parsePreviewBody(body);
    if (!bindingMatches(parsed, input) || !sealIsCurrent(parsed, now)) {
      throw new DispositionError(409, 'STALE_PREVIEW', EXPIRED_OR_MISMATCHED_MESSAGE);
    }
    return parsed;
  }

  return { token, decode };
}
