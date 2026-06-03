/**
 * Model cards — published documentation of each gateway model's intended use,
 * capabilities, known limitations, governance role, and eval status.
 *
 * Cards are derived from the gateway model registry + the approved-models
 * lockfile so they cannot drift from what actually runs. Render to markdown via
 * `buildModelCardsDocument()` (see scripts/ai-governance/generate-model-cards.ts).
 *
 * @module server/services/ai-governance/model-cards
 */

import type { ModelConfig, TaskType } from '../ai-gateway/types';
import type { ApprovedModel } from './approved-models';

export type QualityTier = 'flagship' | 'high' | 'standard' | 'economy';

export interface ModelCard {
  id: string;
  provider: string;
  pinnedVersion: string;
  contextWindow: number;
  qualityScore: number;
  qualityTier: QualityTier;
  costPer1kInput: number;
  costPer1kOutput: number;
  capabilities: TaskType[];
  role: ApprovedModel['role'] | 'unpinned';
  intendedUse: string;
  limitations: string[];
  evalStatus: {
    versionPinned: boolean;
    accuracyMeasuredPerDocType: boolean;
    reference: string;
    note: string;
  };
  lastReviewed: string;
}

/** Curated intended-use notes keyed by model family prefix. */
const FAMILY_NOTES: Array<{ match: (id: string) => boolean; intendedUse: string; extraLimitations: string[] }> = [
  {
    match: id => id.startsWith('claude-opus'),
    intendedUse:
      'Primary model for high-risk regulatory authoring, document analysis, and review where reasoning depth matters most. Outputs are decision support and require human review before approval.',
    extraLimitations: ['Higher cost and latency than Sonnet/Haiku; reserve for high-risk tasks.'],
  },
  {
    match: id => id.startsWith('claude-sonnet'),
    intendedUse:
      'Balanced quality/cost model for drafting, analysis, and structured output; sits below Opus on the quality ladder as the first fallback.',
    extraLimitations: ['Slightly lower reasoning depth than Opus on the hardest regulatory tasks.'],
  },
  {
    match: id => id.startsWith('claude-haiku'),
    intendedUse:
      'Fast, low-cost model for chat, summarization, and structured output; last Anthropic rung in the fallback chain. Not approved for high-risk regulatory drafting.',
    extraLimitations: ['Reduced reasoning depth; not for substantive regulatory argumentation.'],
  },
  {
    match: id => id === 'gpt-4o',
    intendedUse:
      'Cross-provider primary for structured output and the first OpenAI fallback when Anthropic is unavailable. Outputs are decision support and require human review.',
    extraLimitations: ['Cross-provider fallback may change phrasing relative to the Claude primary.'],
  },
  {
    match: id => id === 'gpt-4o-mini',
    intendedUse:
      'Economy model for chat and summarization. Not approved for high-risk regulatory drafting or review.',
    extraLimitations: ['Lowest reasoning depth among OpenAI options.'],
  },
  {
    match: id => id.startsWith('kimi') || id.startsWith('moonshot'),
    intendedUse:
      'Long-context cross-provider fallback used only when both Anthropic and OpenAI are unavailable. Decision support; requires human review.',
    extraLimitations: ['Final fallback rung; expect the largest stylistic divergence from the primary model.'],
  },
];

/** Limitations that apply to every non-deterministic LLM in the platform. */
const UNIVERSAL_LIMITATIONS: string[] = [
  'Non-deterministic: identical inputs may produce different outputs unless a seed is supplied; every generation is recorded in the gateway audit trail (model, prompt hash, temperature, seed).',
  'May produce plausible but unsupported claims (hallucination); generated claims carry a groundedness score and below-threshold content is gated for human review before approval.',
  'Not fine-tuned on a proprietary regulatory corpus; regulatory expertise is supplied via system prompts and retrieval, not weights.',
  'Bounded by a training-data knowledge cutoff; current guidance must be supplied via retrieval.',
];

export function qualityTier(score: number): QualityTier {
  if (score >= 98) return 'flagship';
  if (score >= 90) return 'high';
  if (score >= 84) return 'standard';
  return 'economy';
}

export function buildModelCard(model: ModelConfig, approved?: ApprovedModel): ModelCard {
  const family = FAMILY_NOTES.find(n => n.match(model.id));
  const intendedUse =
    family?.intendedUse ??
    `General-purpose model supporting: ${model.capabilities.join(', ')}. Decision support; requires human review.`;

  return {
    id: model.id,
    provider: model.provider,
    pinnedVersion: model.model,
    contextWindow: model.contextWindow,
    qualityScore: model.qualityScore,
    qualityTier: qualityTier(model.qualityScore),
    costPer1kInput: model.costPer1kInput,
    costPer1kOutput: model.costPer1kOutput,
    capabilities: model.capabilities,
    role: approved?.role ?? 'unpinned',
    intendedUse,
    limitations: [...UNIVERSAL_LIMITATIONS, ...(family?.extraLimitations ?? [])],
    evalStatus: {
      versionPinned: Boolean(approved),
      accuracyMeasuredPerDocType: false,
      reference: approved?.evalReference ?? 'server/eval/rag/ (retrieval/faithfulness harness).',
      note: 'Per-document-type extraction/generation accuracy is not yet measured; the RAG faithfulness harness and PQ protocol are the evidence path. Version pinning + the drift gate regression-test model swaps in the interim.',
    },
    lastReviewed: approved?.lastReviewed ?? 'unreviewed',
  };
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(5)}`;
}

/** Render a single model card to markdown. */
export function renderModelCard(card: ModelCard): string {
  const lines: string[] = [];
  lines.push(`## ${card.id}`);
  lines.push('');
  lines.push(`- **Provider:** ${card.provider}`);
  lines.push(`- **Pinned version:** \`${card.pinnedVersion}\``);
  lines.push(`- **Governance role:** ${card.role}`);
  lines.push(`- **Quality tier:** ${card.qualityTier} (score ${card.qualityScore})`);
  lines.push(`- **Context window:** ${card.contextWindow.toLocaleString()} tokens`);
  lines.push(`- **Cost / 1k tokens:** ${fmtUsd(card.costPer1kInput)} in · ${fmtUsd(card.costPer1kOutput)} out`);
  lines.push(`- **Intended tasks:** ${card.capabilities.join(', ')}`);
  lines.push(`- **Last governance review:** ${card.lastReviewed}`);
  lines.push('');
  lines.push(`**Intended use.** ${card.intendedUse}`);
  lines.push('');
  lines.push('**Known limitations.**');
  for (const lim of card.limitations) lines.push(`- ${lim}`);
  lines.push('');
  lines.push('**Eval status.**');
  lines.push(`- Version pinned in lockfile: ${card.evalStatus.versionPinned ? 'yes' : 'no'}`);
  lines.push(`- Per-document-type accuracy measured: ${card.evalStatus.accuracyMeasuredPerDocType ? 'yes' : 'no'}`);
  lines.push(`- Evidence: ${card.evalStatus.reference}`);
  lines.push(`- Note: ${card.evalStatus.note}`);
  lines.push('');
  return lines.join('\n');
}

/** Build the full model-cards document for all gateway models. */
export function buildModelCardsDocument(models: ModelConfig[], approved: ApprovedModel[]): string {
  const approvedById = new Map(approved.map(a => [a.id, a]));
  const cards = models.map(m => buildModelCard(m, approvedById.get(m.id)));

  const header: string[] = [];
  header.push('# Model cards — Concept2Cure AnA');
  header.push('');
  header.push('> Generated from the gateway model registry + the approved-models lockfile by');
  header.push('> `scripts/ai-governance/generate-model-cards.ts`. Do not edit by hand.');
  header.push('');
  header.push('## Governance posture');
  header.push('');
  header.push('- **Single gateway.** All governed AI calls route through `server/services/ai-gateway`, which records model, prompt hash, prompt version, temperature, seed, and the fallback chain for every request.');
  header.push('- **Version pinning.** Each model is pinned to an exact provider version in `server/services/ai-governance/approved-models.ts`. A model cannot be swapped without updating that lockfile.');
  header.push('- **Drift gate.** A regression test compares the live registry against the lockfile and fails on any unreviewed model swap, so the gateway fallback law cannot silently change the validated model set.');
  header.push('- **Human oversight.** Generated claims carry a groundedness score; below a capability\'s threshold, content is gated for human review before approval (`server/services/ai-governance/review-policy.ts`).');
  header.push('- **Eval evidence.** Retrieval/faithfulness via `server/eval/rag/`; per-document-type accuracy is the active follow-up (not yet measured).');
  header.push('');
  header.push(`_Models documented: ${cards.length}. Generated for review; not a substitute for executed validation protocols._`);
  header.push('');
  header.push('---');
  header.push('');

  return header.join('\n') + cards.map(renderModelCard).join('\n---\n\n');
}
