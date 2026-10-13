/**
 * The one read shape, and the one call, the biostatistics panels use.
 *
 * Extracted 2026-10-13 when the knowledge-graph panel became the second caller
 * of what `adaptiveMonitoringApi` had kept private. CLAUDE.md working
 * agreement: one canonical implementation per capability — two panels copying
 * a fetch wrapper is how one of them ends up rendering a failure as an empty
 * result while the other does not.
 *
 * @module client/src/concept2cure/v2/surfaces/biostatPanelWire
 */
import { apiRequest, serverMessage, errorCodeOf, ApiRequestError } from '@/lib/queryClient';

/** Every read a panel makes, in one shape: the value, or why there is none. */
export type Read<T> =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; value: T }
  | { kind: 'failed'; message: string };

export const FAILED = 'The server did not answer. Nothing is shown rather than an empty result.';

/** The message of whatever went wrong, never a blank. */
export function messageOf(e: unknown): string {
  return e instanceof Error && e.message.trim().length > 0 ? e.message : FAILED;
}

function detailOf(json: unknown, status: number): string {
  return serverMessage(json) ?? errorCodeOf(json) ?? `HTTP ${status}`;
}

/**
 * One call against a `{ success, data }` route.
 *
 * A refusal reaches the caller as the server's own sentence; a transport
 * failure is re-thrown as it came, because dressing it as a refusal would
 * claim the server answered when it did not.
 */
export async function readOne<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await apiRequest(method, path, body);
  } catch (e) {
    if (!(e instanceof ApiRequestError)) throw e;
    // The server's own sentence, with the refusal it came from attached.
    throw new Error(e.message, { cause: e });
  }
  const json = (await res.json().catch(() => null)) as { data?: T } | null;
  if (!res.ok) throw new Error(detailOf(json, res.status));
  if (!json || json.data === undefined) throw new Error(FAILED);
  return json.data;
}
