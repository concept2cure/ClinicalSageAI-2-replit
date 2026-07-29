/**
 * Distiller — turn a raw harvested item into a structured KnowledgeCard.
 *
 * This is the highest-leverage step: it converts an unstructured page/feed item
 * into a single normalised, dated, grounded statement of "what changed". It
 * routes through the existing unified AI client (Claude-first, gateway-audited),
 * requests strict JSON, and applies a lightweight grounding check before the
 * card is allowed to influence anything.
 *
 * Never throws. On any failure (no API key, malformed JSON, empty content) it
 * returns null and the scan simply moves on — the loop stays resilient.
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

/** Heuristic grounding check: do the summary's salient tokens appear in the source text? */
export function isGrounded(summary: string, sourceText: string): boolean {
  const src = sourceText.toLowerCase();
  const tokens = summary
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 5);
  if (tokens.length === 0) return false;
  const present = tokens.filter(t => src.includes(t)).length;
  // Require a majority of substantive tokens to be traceable to the source.
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

/**
 * Distil one item into a card, or null if it carries no substantive change or
 * the model output is unusable. Pure I/O boundary — all failures are swallowed.
 */
export async function distill(item: RawHarvestItem, source: HorizonSource): Promise<KnowledgeCard | null> {
  if (!item.content || item.content.trim().length < 40) return null;

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
    logger.warn(`Distil call failed for ${source.id}: ${err?.message}`);
    return null;
  }

  const parsed = safeParse(raw);
  if (!parsed || !parsed.isRegulatoryChange) return null;
  if (!parsed.summary || !parsed.title) return null;

  const grounded = isGrounded(parsed.summary, item.content);

  const draft: CardDraft = {
    sourceId: source.id,
    body: source.body,
    jurisdictions: [source.jurisdiction],
    standardCode: parsed.standardCode || undefined,
    title: parsed.title,
    changeKind: coerceChangeKind(parsed.changeKind),
    summary: parsed.summary,
    effectiveDate: parsed.effectiveDate || undefined,
    publishedAt: item.publishedAt,
    supersedes: parsed.supersedes || undefined,
    segments: source.segments,
    topics: parsed.topics?.length ? parsed.topics : source.topics,
    url: item.url || source.url,
    confidence: clampConfidence(parsed.confidence),
    grounded,
  };

  return makeCard(draft);
}
