/**
 * The AI-draft response envelope — parsing, kept pure and away from the route.
 *
 * The drafting endpoint asks the model for
 * `{"content": "...", "attributions": [{"quote": "...", "src": n}]}` so it can
 * park which sentences the model says it derived from which retrieved source
 * (source-attribution Phase 4b). The model is not obliged to comply: it may
 * fence the JSON, wrap it in prose, emit a malformed object, or ignore the
 * instruction entirely and answer with the draft itself.
 *
 * Every one of those shapes has to end with a draft in the author's editor.
 * Structured paraphrase is ADDITIVE — it buys better lineage when it works and
 * must never cost a draft when it does not — so the rule here is: extract what
 * is unambiguously present, drop what is not, and on any shortfall treat the
 * whole response as plain prose with no attributions. Nothing is guessed at:
 * an attribution missing a string quote or a non-integer `src` is discarded
 * rather than repaired, because a repaired citation is an invented one.
 *
 * `src` is a 1-BASED POSITION in the evidence list the prompt showed the model,
 * not a database id. Resolving a position to a canonical
 * `cre_evidence_sources.id` is the caller's job, and the accept gate re-checks
 * that the id was one actually retrieved before any lineage is recorded.
 *
 * Pure — no I/O, no clock, no model call — which is what makes the one risky
 * surface (tolerance to malformed input) exhaustively unit-testable.
 */

/** One sentence the model claims it derived from the source at position `src`. */
export interface DraftAttributionClaim {
  /** A sentence copied verbatim out of `content`, per the prompt's contract. */
  quote: string;
  /** 1-based position in the evidence list shown to the model. */
  src: number;
}

export interface ParsedDraftEnvelope {
  /** The drafted prose. Empty only when the model returned nothing at all. */
  content: string;
  /** Claims that survived validation; empty when the envelope carried none. */
  attributions: DraftAttributionClaim[];
}

/** Strip a ```json fence and return the outermost {...}, or null if there is none. */
function extractJsonObject(raw: string): unknown {
  const fenced = raw
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(fenced.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Keep only well-formed {quote: string, src: integer} claims; drop the rest. */
function readClaims(value: unknown): DraftAttributionClaim[] {
  if (!Array.isArray(value)) return [];
  const out: DraftAttributionClaim[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const { quote, src } = entry as { quote?: unknown; src?: unknown };
    if (typeof quote !== 'string') continue;
    const position = Number(src);
    if (!Number.isInteger(position)) continue;
    out.push({ quote, src: position });
  }
  return out;
}

/**
 * Parse a model response into a draft plus its asserted attributions.
 *
 * Never throws and never returns null: a response that is not the requested
 * envelope comes back as `{ content: <the whole response>, attributions: [] }`,
 * which is exactly the pre-Phase-4 behaviour and lands a usable draft.
 */
export function parseDraftEnvelope(rawResponse: string | null | undefined): ParsedDraftEnvelope {
  const raw = (rawResponse ?? '').trim();
  const parsed = extractJsonObject(raw);
  const content = (parsed as { content?: unknown } | null)?.content;
  if (typeof content === 'string' && content.trim()) {
    return {
      content: content.trim(),
      attributions: readClaims((parsed as { attributions?: unknown }).attributions),
    };
  }
  // No usable structured content — the response IS the draft.
  return { content: raw, attributions: [] };
}
