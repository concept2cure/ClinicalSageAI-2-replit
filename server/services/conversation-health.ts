/**
 * Conversation Health Score Service
 *
 * Monitors conversation health across multiple dimensions to detect
 * degradation before it impacts user experience or output quality.
 *
 * Signals: message count, token load, topic diversity, latency drift,
 * retrieval confidence, repetition rate, unresolved questions.
 *
 * @module server/services/conversation-health
 */

import { pool } from '../db.js';

export type HealthState = 'healthy' | 'heavy' | 'degrading' | 'at_risk';

export interface ConversationHealthReport {
  conversationId: number;
  healthScore: number; // 0-100
  healthState: HealthState;
  signals: {
    messageCount: number;
    estimatedTokens: number;
    averageLatencyMs: number | null;
    latencyDriftPercent: number | null;
    retrievalConfidence: number | null;
    unresolvedQuestions: number;
    topicCount: number;
    repetitionRate: number;
  };
  warnings: string[];
  suggestedActions: string[];
  computedAt: string;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Compute conversation health for a concept2cure conversation.
 */
export async function computeConversationHealth(
  conversationId: number,
  organizationId: number
): Promise<ConversationHealthReport> {
  // Load all messages for analysis
  const messagesResult = await pool.query(
    `SELECT role, content, token_count, latency_ms, created_at
     FROM concept2cure_messages
     WHERE conversation_id = $1 AND organization_id = $2
     ORDER BY created_at ASC`,
    [conversationId, organizationId]
  );
  const messages = messagesResult.rows;
  const messageCount = messages.length;

  // Token estimation
  let estimatedTokens = 0;
  for (const msg of messages) {
    estimatedTokens += msg.token_count > 0 ? msg.token_count : estimateTokens(msg.content || '');
  }

  // Latency analysis: compare first-half vs second-half average
  const assistantMsgs = messages.filter((m: any) => m.role === 'assistant' && m.latency_ms > 0);
  let averageLatencyMs: number | null = null;
  let latencyDriftPercent: number | null = null;
  if (assistantMsgs.length >= 4) {
    const half = Math.floor(assistantMsgs.length / 2);
    const firstHalf = assistantMsgs.slice(0, half);
    const secondHalf = assistantMsgs.slice(half);
    const avgFirst = firstHalf.reduce((s: number, m: any) => s + m.latency_ms, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s: number, m: any) => s + m.latency_ms, 0) / secondHalf.length;
    averageLatencyMs = Math.round((avgFirst + avgSecond) / 2);
    latencyDriftPercent = avgFirst > 0 ? Math.round(((avgSecond - avgFirst) / avgFirst) * 100) : null;
  } else if (assistantMsgs.length > 0) {
    averageLatencyMs = Math.round(
      assistantMsgs.reduce((s: number, m: any) => s + m.latency_ms, 0) / assistantMsgs.length
    );
  }

  // Unresolved questions: user messages ending with ? without a following assistant response
  let unresolvedQuestions = 0;
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === 'user' && msg.content?.trim().endsWith('?')) {
      const next = messages[i + 1];
      if (!next || next.role !== 'assistant') {
        unresolvedQuestions++;
      }
    }
  }

  // Simple topic diversity: count distinct keyword clusters in user messages
  const userTexts = messages
    .filter((m: any) => m.role === 'user')
    .map((m: any) => (m.content || '').toLowerCase());
  const topicKeywords = [
    'regulatory', '510k', 'pma', 'cer', 'clinical', 'evidence',
    'cmc', 'manufacturing', 'chemistry', 'ind', 'nda', 'protocol',
    'safety', 'efficacy', 'literature', 'predicate', 'fda', 'ema',
    'submission', 'review', 'strategy', 'risk', 'labeling', 'design',
  ];
  const detectedTopics = new Set<string>();
  for (const text of userTexts) {
    for (const keyword of topicKeywords) {
      if (text.includes(keyword)) {
        detectedTopics.add(keyword);
      }
    }
  }
  const topicCount = Math.max(1, Math.ceil(detectedTopics.size / 3)); // cluster into ~groups of 3

  // Repetition: check if user messages repeat similar content
  let repetitionRate = 0;
  if (userTexts.length >= 4) {
    let repeats = 0;
    for (let i = 1; i < userTexts.length; i++) {
      const prev = userTexts[i - 1];
      const curr = userTexts[i];
      // Simple overlap: if >60% of words match, count as repeat
      const prevWords = new Set(prev.split(/\s+/).filter((w: string) => w.length > 3));
      const currWords = curr.split(/\s+/).filter((w: string) => w.length > 3);
      if (prevWords.size > 0 && currWords.length > 0) {
        const overlap = currWords.filter((w: string) => prevWords.has(w)).length;
        if (overlap / currWords.length > 0.6) repeats++;
      }
    }
    repetitionRate = Math.round((repeats / (userTexts.length - 1)) * 100);
  }

  // Retrieval confidence (from RAG queries if available)
  let retrievalConfidence: number | null = null;
  try {
    const ragResult = await pool.query(
      `SELECT AVG(relevance_score) as avg_score
       FROM rag_queries
       WHERE organization_id = $1
       AND created_at > NOW() - INTERVAL '24 hours'
       LIMIT 1`,
      [organizationId]
    );
    if (ragResult.rows[0]?.avg_score) {
      retrievalConfidence = Math.round(parseFloat(ragResult.rows[0].avg_score) * 100);
    }
  } catch {
    // RAG table may not exist
  }

  // Compute health score (0-100, higher is better)
  let score = 100;

  // Penalize high message count
  if (messageCount > 100) score -= 30;
  else if (messageCount > 50) score -= 15;
  else if (messageCount > 30) score -= 5;

  // Penalize high token load
  if (estimatedTokens > 100_000) score -= 25;
  else if (estimatedTokens > 50_000) score -= 15;
  else if (estimatedTokens > 20_000) score -= 5;

  // Penalize latency drift
  if (latencyDriftPercent !== null && latencyDriftPercent > 50) score -= 15;
  else if (latencyDriftPercent !== null && latencyDriftPercent > 25) score -= 8;

  // Penalize unresolved questions
  score -= Math.min(unresolvedQuestions * 3, 15);

  // Penalize topic sprawl
  if (topicCount > 5) score -= 15;
  else if (topicCount > 3) score -= 8;

  // Penalize repetition
  if (repetitionRate > 30) score -= 15;
  else if (repetitionRate > 15) score -= 8;

  score = Math.max(0, Math.min(100, score));

  // Determine state
  let healthState: HealthState;
  if (score >= 70) healthState = 'healthy';
  else if (score >= 50) healthState = 'heavy';
  else if (score >= 30) healthState = 'degrading';
  else healthState = 'at_risk';

  // Generate warnings and suggested actions
  const warnings: string[] = [];
  const suggestedActions: string[] = [];

  if (messageCount > 50) {
    warnings.push(`This conversation has ${messageCount} messages and ~${Math.round(estimatedTokens / 1000)}k tokens.`);
    suggestedActions.push('Generate a working memory summary to compress context.');
  }
  if (topicCount > 3) {
    warnings.push(`Multiple topics detected (${topicCount} distinct areas).`);
    suggestedActions.push('Consider splitting into focused workstreams.');
  }
  if (unresolvedQuestions > 2) {
    warnings.push(`${unresolvedQuestions} unresolved questions detected.`);
    suggestedActions.push('Review and address outstanding questions.');
  }
  if (repetitionRate > 15) {
    warnings.push(`High repetition rate (${repetitionRate}%) — users may be re-asking.`);
    suggestedActions.push('Check if previous responses addressed user needs.');
  }
  if (latencyDriftPercent !== null && latencyDriftPercent > 25) {
    warnings.push(`Response latency increasing (+${latencyDriftPercent}% from start).`);
    suggestedActions.push('Summarize and trim conversation history.');
  }

  // Store health score on the conversation record
  try {
    await pool.query(
      `UPDATE concept2cure_conversations
       SET metadata = COALESCE(metadata, '{}'::json)::jsonb || $1::jsonb,
           updated_at = NOW()
       WHERE id = $2 AND organization_id = $3`,
      [
        JSON.stringify({
          healthScore: score,
          healthState,
          lastHealthCheck: new Date().toISOString(),
        }),
        conversationId,
        organizationId,
      ]
    );
  } catch {
    // Non-critical — health still returned even if storage fails
  }

  return {
    conversationId,
    healthScore: score,
    healthState,
    signals: {
      messageCount,
      estimatedTokens,
      averageLatencyMs,
      latencyDriftPercent,
      retrievalConfidence,
      unresolvedQuestions,
      topicCount,
      repetitionRate,
    },
    warnings,
    suggestedActions,
    computedAt: new Date().toISOString(),
  };
}
