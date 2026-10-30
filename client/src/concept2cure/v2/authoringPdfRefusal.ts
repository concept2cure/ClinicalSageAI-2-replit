/** The existing Authoring converter's two definite pre-write 503 contracts.
 * This does not change generic mutation or export uncertainty handling. */
import { errorCodeOf, serverMessage } from '@/lib/queryClient';

const codes = new Set(['PDF_RENDERER_UNAVAILABLE', 'CONVERTER_BUSY']);
const fields = new Set(['success', 'error', 'code', 'message', 'data', 'correlationId', 'retryAfterSeconds']);
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function negativeBody(body: Record<string, unknown>, nested: Record<string, unknown> | null): boolean {
  if (Object.keys(body).some(key => !fields.has(key)) || body.data != null) return false;
  if (body.success !== undefined && body.success !== false) return false;
  if (nested) return Object.keys(nested).every(key => key === 'code' || key === 'message');
  // A flat refusal names its reason in `error`: a code or a sentence, read only
  // through the canonical envelope readers (ci:error-envelope).
  return Boolean(errorCodeOf({ error: body.error }) ?? serverMessage({ error: body.error }));
}

function coherentCode(value: Record<string, unknown>, nested: Record<string, unknown> | null, code: string | undefined): string | null {
  const bodyCode = errorCodeOf(value);
  if (!bodyCode || !codes.has(bodyCode)) return null;
  const explicit = [code, value.code, nested?.code,
    typeof value.error === 'string' ? errorCodeOf({ error: value.error }) : undefined];
  return explicit.every(candidate => candidate === undefined || candidate === bodyCode) ? bodyCode : null;
}

function retryDelayMatches(code: string, delay: unknown): boolean {
  if (delay !== undefined && !(typeof delay === 'number' && Number.isSafeInteger(delay) && delay > 0)) return false;
  return code !== 'CONVERTER_BUSY' || delay !== undefined;
}

/** Require a coherent actual refusal body, never a code alone or a write receipt. */
export function authoringPdfPrewriteRefusal(status: number | undefined, code: string | undefined, value: unknown): boolean {
  if (status !== 503 || !object(value)) return false;
  const nested = object(value.error) ? value.error : null;
  if (!negativeBody(value, nested)) return false;
  const bodyCode = coherentCode(value, nested, code);
  if (!bodyCode) return false;
  if (!serverMessage({ message: nested?.message ?? value.message })) return false;
  return retryDelayMatches(bodyCode, value.retryAfterSeconds);
}
