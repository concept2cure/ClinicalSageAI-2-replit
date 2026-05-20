/**
 * Pure helper functions used by the AnA persistent chat panel.
 *
 * Extracted from AnaPersistentPanel.tsx as part of the staged split.
 * Every function here is referentially transparent (no hooks, no
 * side-effects, no module-level state).
 *
 * @module client/src/concept2cure/components/chat/anaPanelUtils
 */

import type {
  AnaRIOrchestration,
  FollowUpChip,
  IntentLens,
  VerdictSignal,
} from './anaPanelTypes';

/**
 * Detect AnA 1.0 RI seniority signals in response text and return
 * badges to render beneath the message. Matches the verdict vocabulary,
 * prioritization hierarchy, and confidence levels from the AnA doctrine.
 */
export function detectVerdictSignals(content: string): VerdictSignal[] {
  const signals: VerdictSignal[] = [];
  const lower = content.toLowerCase();

  // Verdict detection
  if (/\bdefensible\b/.test(lower) && /\bverdict\b/i.test(content))
    signals.push({
      type: 'verdict',
      label: 'Defensible',
      color: 'text-emerald-700',
      bgColor: 'bg-emerald-50 border-emerald-200',
    });
  else if (/\bvulnerable\b/.test(lower) && /\bverdict\b/i.test(content))
    signals.push({
      type: 'verdict',
      label: 'Vulnerable',
      color: 'text-amber-700',
      bgColor: 'bg-amber-50 border-amber-200',
    });
  else if (/\boverclaimed\b/.test(lower))
    signals.push({
      type: 'verdict',
      label: 'Overclaimed',
      color: 'text-red-700',
      bgColor: 'bg-red-50 border-red-200',
    });
  else if (/\bsupportable with revision\b/.test(lower))
    signals.push({
      type: 'verdict',
      label: 'Supportable with Revision',
      color: 'text-blue-700',
      bgColor: 'bg-blue-50 border-blue-200',
    });

  // Priority detection
  if (
    /\bblocker\b/.test(lower) &&
    (/\bfix before\b/.test(lower) || /\brtf\b/.test(lower) || /\bcrl\b/.test(lower))
  )
    signals.push({
      type: 'priority',
      label: 'Blocker Identified',
      color: 'text-red-700',
      bgColor: 'bg-red-50 border-red-200',
    });
  else if (/\breviewer friction\b/.test(lower))
    signals.push({
      type: 'priority',
      label: 'Reviewer Friction',
      color: 'text-amber-700',
      bgColor: 'bg-amber-50 border-amber-200',
    });

  // Confidence detection
  if (/\bstrong\b.*\bact on this\b/.test(lower))
    signals.push({
      type: 'confidence',
      label: 'High Confidence',
      color: 'text-emerald-700',
      bgColor: 'bg-emerald-50 border-emerald-200',
    });
  else if (/\bprovisional\b.*\bpending\b/.test(lower))
    signals.push({
      type: 'confidence',
      label: 'Provisional',
      color: 'text-amber-700',
      bgColor: 'bg-amber-50 border-amber-200',
    });

  // Action detection
  if (/\bescalat(e|ion)\b/.test(lower) && /\bwarrant\b/.test(lower))
    signals.push({
      type: 'action',
      label: 'Escalation Recommended',
      color: 'text-violet-700',
      bgColor: 'bg-violet-50 border-violet-200',
    });
  else if (/\bno[- ]go\b/.test(lower))
    signals.push({
      type: 'action',
      label: 'No-Go',
      color: 'text-red-700',
      bgColor: 'bg-red-50 border-red-200',
    });
  else if (/\bproceed\b/.test(lower) && /\bmitigation\b/.test(lower))
    signals.push({
      type: 'action',
      label: 'Proceed with Mitigation',
      color: 'text-blue-700',
      bgColor: 'bg-blue-50 border-blue-200',
    });

  return signals;
}

/**
 * Split an assistant response into a "bottom-line" first-sentence
 * summary and the remaining details. Used for collapsed previews so
 * the chat surface can fit long responses without forcing the reader
 * to scroll the entire text on first impression.
 */
export function buildAssistantPreview(content: string): { bottomLine: string; details: string } {
  const normalized = content.trim();
  if (!normalized) return { bottomLine: '', details: '' };

  const paragraphs = normalized.split(/\n\s*\n/).filter(Boolean);
  const firstParagraph = paragraphs[0] || normalized;
  const firstSentence = firstParagraph
    .split(/(?<=[.!?])\s+/)
    .find(sentence => sentence.trim().length > 0);

  const bottomLine = (firstSentence || firstParagraph).trim();
  const details = normalized.startsWith(bottomLine)
    ? normalized.slice(bottomLine.length).trim()
    : normalized;

  return { bottomLine, details };
}

/**
 * Build the inline follow-up chip suggestions that appear after an
 * assistant turn. The chips are intent-aware (the active IntentLens)
 * and content-aware (whether the response itself mentions specific
 * regulatory framing terms like compare / strategy / audit).
 */
export function buildFollowUpChips(args: {
  intentLens: IntentLens;
  hasProject: boolean;
  assistantContent: string;
}): FollowUpChip[] {
  const { intentLens, hasProject, assistantContent } = args;
  const chips: FollowUpChip[] = [];
  const lc = assistantContent.toLowerCase();

  const pushChip = (id: string, label: string, prompt: string) => {
    if (chips.some(c => c.id === id)) return;
    chips.push({ id, label, prompt });
  };

  pushChip('next-step', 'Give me next steps', 'Give me the top 3 next steps from your answer.');
  pushChip('risk-gaps', 'Identify risk gaps', 'Identify the biggest risk gaps from this answer.');

  if (hasProject) {
    pushChip('draft-artifact', 'Turn into draft', 'Turn this into a draft artifact I can review.');
  }

  if (intentLens === 'compare' || /\bcompare|versus|vs\.\b/.test(lc)) {
    pushChip('compare-options', 'Compare options', 'Compare the best two options with pros/cons.');
  }

  if (intentLens === 'audit' || /\bcompliance|audit|readiness\b/.test(lc)) {
    pushChip(
      'readiness-check',
      'Run readiness check',
      'Run a readiness check based on this guidance.',
    );
  }

  if (intentLens === 'strategy' || /\bstrategy|pathway|plan\b/.test(lc)) {
    pushChip(
      'timeline',
      'Build a timeline',
      'Build a practical execution timeline from this strategy.',
    );
  }

  return chips.slice(0, 3);
}

/**
 * Coerce the heterogeneous orchestration payloads returned by the AnA
 * RI and Cortex endpoints into the canonical AnaRIOrchestration shape.
 * Returns null when no orchestration info is available so callers can
 * skip rendering the workstream/intent rail entirely.
 */
export function normalizeOrchestrationPayload(payload: any): AnaRIOrchestration | null {
  if (payload?.orchestration) {
    return payload.orchestration as AnaRIOrchestration;
  }

  if (payload?.intelligence) {
    return {
      detectedIntent: {
        lens: payload.intelligence.intent || 'auto',
        confidence: payload.intelligence.intentConfidence || 0,
        signals: [],
      },
      detectedSubmissionType: payload.intelligence.submissionType || null,
      appliedRole: payload.intelligence.role || 'general',
      activeWorkstream: payload.intelligence.activeWorkstream,
      workstreamHandoff: payload.intelligence.workstreamHandoff || null,
      suggestedActions: payload.intelligence.suggestedActions || [],
    };
  }

  return null;
}
