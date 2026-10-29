/**
 * The one POST a Vault version's review and approval make to the document
 * lifecycle route, and what its refusals say (VR-13). Moved out of
 * VaultLifecycle.tsx unchanged in RR1b, so the review route's acts
 * (VaultReviewRoute.tsx) post through the same call and say refusals in the
 * same words.
 */
import { ApiRequestError, apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';

const GATE_TEXT: Record<string, string> = {
  REVIEW_SIGNOFF_REQUIRED: "Approval needs a review sign-off on this version's current content. A reviewer signs the review first.",
  CONTENT_REQUIRED: 'This version has no stored content to review. Upload the file as a new version.',
  ILLEGAL_TRANSITION: "That step does not apply at this version's current stage. Reload to see its stage.",
};

const UNKNOWN_OUTCOME =
  "The connection dropped, so it is not known whether this was recorded. Reload the Vault and check the version's history before trying again.";

/** What a refusal says: the gate in words, else the server's own message. */
function refusalText(payload: unknown, fallback: string, failed: string): string {
  const blocked = (payload as { blockedBy?: unknown } | null)?.blockedBy;
  const gate = Array.isArray(blocked) ? blocked.map((c) => GATE_TEXT[String(c).split(':')[0]]).find(Boolean) : undefined;
  return gate ?? `${failed} ${redactInternals(serverMessage(payload), fallback)}`;
}

/** POST to the lifecycle route (named in full at each call, so the launch-scope gate sees it). */
export async function lifecyclePost(url: string, body: Record<string, unknown>, failed: string): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await apiRequest('POST', url, body);
  } catch (e) {
    // apiRequest throws on every refusal but a 401; only a thrown non-API error is a dropped connection.
    if (e instanceof ApiRequestError) throw new Error(refusalText(e.payload, e.message, failed), { cause: e });
    throw new Error(UNKNOWN_OUTCOME, { cause: e });
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json || json.ok === false) {
    throw new Error(refusalText(json, 'No reason was returned. Reload and try again.', failed));
  }
  return json;
}

