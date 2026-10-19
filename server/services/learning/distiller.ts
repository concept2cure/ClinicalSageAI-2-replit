/**
 * Distiller — turn a raw harvested item into a structured KnowledgeCard.
 *
 * This is the highest-leverage step: it converts an unstructured page/feed item
 * into a single normalised, dated, grounded statement of "what changed". It
 * routes through the existing unified AI client (Claude-first, gateway-audited),
 * requests strict JSON, and applies a lightweight grounding check before the
 * card is allowed to influence anything.
 *
 * Never throws. A failure (no API key, unusable output, too little text) comes
 * back as `failed` with its reason, which is distinct from the model reporting
 * `no_change`. Until 2026-10-15 both returned null, so a scan with the model
 * unavailable read as a week with no regulatory change.
 */

import { ai } from '../../lib/unified-ai-client.js';
import { createScopedLogger } from '../../utils/logger.js';
import type { HorizonSource } from './regulatory-horizon-sources.js';
import type { RawHarvestItem } from './harvester.js';
import {
  makeCard,
  type CardChangeKind,
  type CardDraft,
  type KnowledgeCard,
} from './knowledge-card.js';

const logger = createScopedLogger('horizon-distiller');

const CHANGE_KINDS: CardChangeKind[] = [
  'new_guideline',
  'revision',
  'draft_for_consultation',
  'effective_date',
  'withdrawal',
  'press',
  'other',
];

interface DistilledShape {
  isRegulatoryChange: boolean;
  standardCode?: string;
  title?: string;
  changeKind?: string;
  summary?: string;
  effectiveDate?: string;
  supersedes?: string;
  topics?: string[];
  confidence?: number;
}

const SYSTEM_PROMPT = `You are AnA's regulatory horizon analyst. You read raw text from a regulator or harmonisation body and extract, if present, a SINGLE most-significant change to clinical-trial or regulatory standards.

Return STRICT JSON only, matching:
{
  "isRegulatoryChange": boolean,   // false if the text is navigation/boilerplate/no substantive change
  "standardCode": string|null,     // canonical code if resolvable, e.g. "E6(R3)", "ISO 14155", "M11"
  "title": string,                 // concise title of the change
  "changeKind": "new_guideline"|"revision"|"draft_for_consultation"|"effective_date"|"withdrawal"|"press"|"other",
  "summary": string,               // 1-3 sentences: what changed and why it matters in practice
  "effectiveDate": string|null,    // ISO date if explicitly stated, else null
  "supersedes": string|null,       // code this replaces, if stated
  "topics": string[],              // short topic tags
  "confidence": number             // 0..1, how certain you are this is a real, correctly-extracted change
}

Rules:
- Do NOT invent codes, dates, or facts. If the text does not state something, use null.
- Only set isRegulatoryChange=true when there is a substantive standard/guidance change, draft, effective date, or withdrawal.
- Be conservative with confidence: lower it when the text is ambiguous or you inferred beyond what is written.`;

/**
 * Heuristic grounding check: do at least 40% of the summary's words of five or
 * more characters appear somewhere in the source text? A token-overlap screen,
 * not a check that each claim is supported.
 */
export function isGrounded(summary: string, sourceText: string): boolean {
  const src = sourceText.toLowerCase();
  const tokens = summary
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 5);
  if (tokens.length === 0) return false;
  const present = tokens.filter(t => src.includes(t)).length;
  // At least 40% of substantive tokens must be traceable to the source (not a majority).
  return present / tokens.length >= 0.4;
}

function coerceChangeKind(v: unknown): CardChangeKind {
  return typeof v === 'string' && (CHANGE_KINDS as string[]).includes(v) ? (v as CardChangeKind) : 'other';
}

function clampConfidence(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function safeParse(text: string): DistilledShape | null {
  try {
    // Tolerate models that wrap JSON in prose/fences.
    const match = text.match(/\{[\s\S]*\}/);
    return match ? (JSON.parse(match[0]) as DistilledShape) : null;
  } catch {
    return null;
  }
}

/** The model's reply, read: a change to card, no change, or why it is unusable. */
type Reply =
  | { kind: 'change'; shape: DistilledShape; title: string; summary: string }
  | { kind: 'no_change' }
  | { kind: 'unusable'; reason: string };

function readReply(text: string): Reply {
  const parsed = safeParse(text);
  if (!parsed) return { kind: 'unusable', reason: 'model output was not parseable JSON' };
  if (parsed.isRegulatoryChange === false) return { kind: 'no_change' };
  if (parsed.isRegulatoryChange !== true) {
    return { kind: 'unusable', reason: 'model output did not say whether the text reports a change' };
  }
  if (!parsed.summary || !parsed.title) return { kind: 'unusable', reason: 'model output lacked a title or summary' };
  return { kind: 'change', shape: parsed, title: parsed.title, summary: parsed.summary };
}

/** What became of one harvested item. */
export type DistillOutcome =
  | { status: 'distilled'; card: KnowledgeCard }
  /** The model read the item and reported no substantive regulatory change. */
  | { status: 'no_change' }
  /** Nothing was distilled: too little text, the model call failed, or its output was unusable. */
  | { status: 'failed'; reason: string };

/**
 * Distil one item into a card. `no_change` only when the model read the item and
 * said so; every other way of producing no card is `failed`, with the reason.
 */
export async function distill(item: RawHarvestItem, source: HorizonSource): Promise<DistillOutcome> {
  if (!item.content || item.content.trim().length < 40) {
    return { status: 'failed', reason: 'too little text to distil (under 40 characters)' };
  }

  let raw: string;
  try {
    raw = await ai.complete(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Source: ${source.body} (${source.jurisdiction}) — ${source.title}\nURL: ${item.url || source.url}\n\nTEXT:\n${item.content}`,
        },
      ],
      { taskType: 'general', maxTokens: 900, temperature: 0, jsonMode: true, callerModule: 'horizon-distiller' },
    );
  } catch (err: any) {
    // The detail stays in the log; the digest that carries the reason is served to users.
    logger.warn(`Distil call failed for ${source.id}: ${err?.message}`);
    return { status: 'failed', reason: 'model call failed' };
  }

  const reply = readReply(raw);
  if (reply.kind === 'no_change') return { status: 'no_change' };
  if (reply.kind === 'unusable') return { status: 'failed', reason: reply.reason };
  const parsed = reply.shape;

  const grounded = isGrounded(reply.summary, item.content);

  const draft: CardDraft = {
    sourceId: source.id,
    body: source.body,
    jurisdictions: [source.jurisdiction],
    standardCode: parsed.standardCode || undefined,
    title: reply.title,
    changeKind: coerceChangeKind(parsed.changeKind),
    summary: reply.summary,
    effectiveDate: parsed.effectiveDate || undefined,
    publishedAt: item.publishedAt,
    supersedes: parsed.supersedes || undefined,
    segments: source.segments,
    topics: parsed.topics?.length ? parsed.topics : source.topics,
    url: item.url || source.url,
    confidence: clampConfidence(parsed.confidence),
    grounded,
  };

  return { status: 'distilled', card: makeCard(draft) };
}
