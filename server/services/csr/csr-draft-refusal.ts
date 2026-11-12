/**
 * A CSR drafting call the provider or the gateway will not answer. Split out of csr-builder.ts (2026-11-10), which
 * calls it for every ICH E3 heading it drafts.
 *
 * Until then the builder caught every failure of a drafting call without a reason and used the heading's template,
 * or nothing where the heading has none. Walked in a Codespace-style environment against a strict stand-in for the
 * Messages API: the gateway's per-minute limit refused the 50th call, the build ran through its remaining 70
 * headings in under a second with every call refused, and ended "failed at 56%: §11.1, §11.2 … have no saved text".
 * A refused key, an account with no credit and the provider's own 429 read the same way.
 *
 * Now a limit or an overload is waited out and the heading drafted again; a refusal waiting cannot change stops the
 * build on that heading with a typed code; and a refusal about one heading's content leaves that heading its
 * template, with the reason.
 */

/**
 * Room for one heading. The drafting models reason before they write, and that reasoning is billed against the same
 * ceiling as the text (Opus 5.5 cannot run without it). At 4,096 a results heading that lists a claim for every
 * figure could be cut off before its claims block, and then every figure in it was unreconciled.
 */
export const CSR_SECTION_MAX_TOKENS = 16_000;

/**
 * Where a build shows the heading it is writing (csr-job-runner.ts csrLiveBuild): `start` when a drafting call
 * begins, `text` for each piece of prose the model streams. The founder, 2026-11-10: "I want to see it happening".
 */
export interface CsrLiveDraft { start(): void; text(chunk: string): void }

/** The gateway's stream callback for a drafting call: prose goes to the live view; the model's reasoning does not. */
export const streamInto = (live?: CsrLiveDraft) => (chunk: string, meta?: { type?: string }): void => {
  if (live && chunk && (!meta || meta.type === 'text')) live.text(chunk);
};

/** How long the build waits before drafting a heading again after a rate limit or an overloaded provider. */
const DRAFT_RETRY_WAITS_MS = [20_000, 40_000, 60_000, 60_000] as const;

/**
 * A drafting call that waiting cannot make succeed: the provider refuses the deployment's key or account, no approved
 * drafting model is configured, or a limit did not lift. The build stops on this heading with the code as its typed
 * receipt (csr-job-runner.ts safeCsrJobFailure); the message is the code itself, never the provider's text.
 */
export class CsrDraftingUnavailableError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'CsrDraftingUnavailableError';
  }
}

type DraftingRefusal =
  | { kind: 'wait'; code: string; waitMs?: number }
  | { kind: 'stop'; code: string }
  | { kind: 'section'; reason: string };

/**
 * What a failed drafting call means for the build, from the gateway's own classifier (gateway-error-map.ts). Null for
 * an error the gateway did not raise: the heading keeps its template, as before.
 *
 * Imported when a call fails, not at module load: csr-builder.ts imports this file, and its import graph must not
 * pull the gateway into the Authoring source/export graph (see loadCSRClient there).
 */
async function draftingRefusal(error: unknown): Promise<DraftingRefusal | null> {
  const [{ classifyGatewayError, isGatewayError }, { GatewayPolicyError, GatewayNoProviderError }] = await Promise.all([
    import('../ai-gateway/gateway-error-map.js'), import('../ai-gateway/gateway.js'),
  ]);
  if (!isGatewayError(error)) return null;
  const { code } = classifyGatewayError(error);
  switch (code) {
    case 'RATE_LIMITED': {
      // The gateway's own limit names its window; the provider's does not, so it backs off.
      const windowMs = Number((error as { rateLimit?: { windowMs?: unknown } }).rateLimit?.windowMs);
      return { kind: 'wait', code: 'CSR_DRAFTING_RATE_LIMITED', ...(Number.isFinite(windowMs) && windowMs > 0 ? { waitMs: Math.min(windowMs + 1_000, 120_000) } : {}) };
    }
    case 'OVERLOADED': return { kind: 'wait', code: 'CSR_DRAFTING_PROVIDER_UNAVAILABLE' };
    case 'PROVIDER_KEY_REFUSED': return { kind: 'stop', code: 'CSR_DRAFTING_KEY_REFUSED' };
    case 'PROVIDER_ACCOUNT_REFUSED': return { kind: 'stop', code: 'CSR_DRAFTING_ACCOUNT_REFUSED' };
    case 'MODEL_NOT_QUALIFIED': return { kind: 'stop', code: 'CSR_DRAFTING_MODEL_NOT_QUALIFIED' };
    case 'PLACEMENT_REFUSED': return { kind: 'stop', code: 'CSR_DRAFTING_PLACEMENT_REFUSED' };
    case 'TOKEN_LIMIT_EXCEEDED': return { kind: 'section', reason: 'gateway_input_too_large' };
    case 'PROVIDER_UNAVAILABLE':
      // A policy refusal concerns this heading's content; the next heading may be served.
      if (error instanceof GatewayPolicyError) return { kind: 'section', reason: 'gateway_policy_refused' };
      if (error instanceof GatewayNoProviderError) return { kind: 'stop', code: 'CSR_DRAFTING_PROVIDER_UNAVAILABLE' };
      return { kind: 'wait', code: 'CSR_DRAFTING_PROVIDER_UNAVAILABLE' };
    default: return { kind: 'section', reason: `gateway_${code.toLowerCase()}` };
  }
}

/**
 * One drafting call, with its waits. Returns the reply, or `refused`: the typed reason this heading's content was
 * not drafted (null for an error the gateway did not raise: the heading keeps its template, as before). Throws
 * CsrDraftingUnavailableError when the build should stop.
 */
export async function callDraftingModel<T>(sectionNumber: string, call: () => Promise<T>, live?: CsrLiveDraft): Promise<{ reply: T } | { refused: string | null }> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      live?.start();
      return { reply: await call() };
    } catch (error) {
      // Never log an SDK error object: its message/response may contain the clinical prompt, source-table cells or
      // provider credentials. Only the gateway's own classification (a fixed code) leaves here.
      const refusal = await draftingRefusal(error);
      if (refusal?.kind === 'wait' && attempt < DRAFT_RETRY_WAITS_MS.length) {
        console.warn(`[CSR Builder] Drafting of section ${sectionNumber} was refused (${refusal.code}); waiting to draft it again.`);
        await new Promise(resolve => setTimeout(resolve, refusal.waitMs ?? DRAFT_RETRY_WAITS_MS[attempt]));
        continue;
      }
      if (refusal && refusal.kind !== 'section') {
        console.warn(`[CSR Builder] Drafting stopped at section ${sectionNumber}: ${refusal.code}.`);
        throw new CsrDraftingUnavailableError(refusal.code);
      }
      const reason = refusal ? refusal.reason : null;
      console.warn(`[CSR Builder] AI drafting failed for section ${sectionNumber}${reason ? ` (${reason})` : ''}; a needs-data template will be used.`);
      return { refused: reason };
    }
  }
}
