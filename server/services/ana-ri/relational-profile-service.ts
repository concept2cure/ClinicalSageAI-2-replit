/**
 * AnA Relational Profile Service — how AnA's personality self-develops.
 *
 * Two halves:
 *
 *   loadRelationalOverlay() — read path, on every chat turn. Pulls the
 *   user-level profile (project_id IS NULL) plus the project-scoped one
 *   and renders them as the RELATIONAL CONTEXT prompt block, so AnA
 *   walks into the conversation already knowing how this person likes to
 *   work, what the project's pressure points are, and which of her own
 *   past mistakes to own if they come up.
 *
 *   reflectAfterTurn() — write path, fire-and-forget after a turn
 *   completes. Throttled: AnA reflects every REFLECT_EVERY_N turns, or
 *   immediately when the turn carries an emotional/corrective signal
 *   (stress, frustration, a win, or the user correcting AnA). Reflection
 *   is one cheap LLM call (summarization tier) that rewrites her notes —
 *   profile summary, tone calibration, emotional read, and any mistake
 *   she made that the user corrected.
 *
 * Both halves are defensive: a missing table (42P01) or any other error
 * degrades to "no overlay" / "no reflection" — the chat turn is never
 * blocked or failed by this layer.
 *
 * @module server/services/ana-ri/relational-profile-service
 */

import { getPool } from '../../db/runtime.js';
import { ensureGateway } from '../../routes/chat/shared.js';
import { renderRelationalContextBlock } from './personality-core.js';
import type {
  AnaToneCalibration,
  AnaEmotionalSignal,
  AnaAcknowledgedMistake,
} from '../../../shared/schema/ana-relational.js';
import { createScopedLogger } from '../../utils/logger.js';

const logger = createScopedLogger('ana-relational');

/** Reflect every Nth turn even without an emotional/corrective signal. */
const REFLECT_EVERY_N = parseInt(process.env.ANA_RELATIONAL_REFLECT_EVERY_N ?? '4', 10);
/** Cap stored prose so profiles stay prompt-sized, not essay-sized. */
const MAX_SUMMARY_CHARS = 1100;
const MAX_SIGNALS_KEPT = 5;
const MAX_MISTAKES_KEPT = 8;

/**
 * Cheap, deterministic detector for turns worth reflecting on immediately:
 * visible emotion (stress, frustration, relief, celebration) or the user
 * correcting AnA — the moments a perceptive colleague would not forget.
 */
export function detectReflectionSignal(userMessage: string): boolean {
  const m = (userMessage || '').toLowerCase();
  return (
    /\b(stress|stressed|overwhelm|frustrat|exhausted|worried|anxious|panic|deadline|urgent|asap|tonight|this week)\b/.test(m) ||
    /\b(thank|thanks|appreciate|great work|well done|approved|accepted|cleared|we got|good news)\b/.test(m) ||
    /\b(that'?s (wrong|incorrect|not right)|you('re| are) (wrong|mistaken)|actually,|you made (a|an) (mistake|error)|that was incorrect|you missed)\b/.test(m)
  );
}

interface ProfileRow {
  id: number;
  project_id: number | null;
  profile_summary: string | null;
  tone_calibration: AnaToneCalibration | null;
  emotional_signals: AnaEmotionalSignal[] | null;
  acknowledged_mistakes: AnaAcknowledgedMistake[] | null;
  interaction_count: number;
}

async function loadProfiles(
  organizationId: number,
  userId: number,
  projectId?: number | null
): Promise<{ user: ProfileRow | null; project: ProfileRow | null }> {
  const { rows } = await getPool().query(
    `SELECT id, project_id, profile_summary, tone_calibration, emotional_signals,
            acknowledged_mistakes, interaction_count
       FROM ana_relational_profiles
      WHERE organization_id = $1
        AND user_id = $2
        AND (project_id IS NULL OR project_id = $3)`,
    [organizationId, userId, projectId ?? null]
  );
  let user: ProfileRow | null = null;
  let project: ProfileRow | null = null;
  for (const row of rows as ProfileRow[]) {
    if (row.project_id === null) user = row;
    else project = row;
  }
  return { user, project };
}

/**
 * Render AnA's relational notes for this (user, project) as a prompt block.
 * Returns '' when nothing has been learned yet or the table is absent.
 */
export async function loadRelationalOverlay(input: {
  organizationId?: number | null;
  userId?: number | null;
  projectId?: number | null;
}): Promise<string> {
  const { organizationId, userId, projectId } = input;
  if (!organizationId || !userId || !Number.isFinite(Number(userId))) return '';
  try {
    const { user, project } = await loadProfiles(
      Number(organizationId),
      Number(userId),
      projectId != null ? Number(projectId) : null
    );
    if (!user && !project) return '';

    const signals = [
      ...(user?.emotional_signals ?? []),
      ...(project?.emotional_signals ?? []),
    ].slice(-1);

    return renderRelationalContextBlock({
      userNotes: user?.profile_summary ?? null,
      projectNotes: project?.profile_summary ?? null,
      toneCalibration: (user?.tone_calibration as Record<string, unknown>) ?? null,
      recentEmotionalSignal: signals[0]?.signal ?? null,
      acknowledgedMistakes: [
        ...(user?.acknowledged_mistakes ?? []),
        ...(project?.acknowledged_mistakes ?? []),
      ],
      interactionCount: (user?.interaction_count ?? 0) + (project?.interaction_count ?? 0),
    });
  } catch (err: any) {
    if (err?.code !== '42P01') {
      logger.warn(`relational overlay load failed: ${err?.message}`);
    }
    return '';
  }
}

/**
 * Bump the interaction counter for a scope, creating the row when absent.
 * Returns the updated row (or null when the table is missing).
 */
async function touchProfile(
  organizationId: number,
  userId: number,
  projectId: number | null
): Promise<ProfileRow | null> {
  const updated = await getPool().query(
    `UPDATE ana_relational_profiles
        SET interaction_count = interaction_count + 1,
            last_interaction_at = now(),
            updated_at = now()
      WHERE organization_id = $1 AND user_id = $2
        AND project_id IS NOT DISTINCT FROM $3
      RETURNING id, project_id, profile_summary, tone_calibration,
                emotional_signals, acknowledged_mistakes, interaction_count`,
    [organizationId, userId, projectId]
  );
  if (updated.rows.length > 0) return updated.rows[0] as ProfileRow;

  const inserted = await getPool().query(
    `INSERT INTO ana_relational_profiles
       (organization_id, user_id, project_id, interaction_count, last_interaction_at)
     VALUES ($1, $2, $3, 1, now())
     ON CONFLICT DO NOTHING
     RETURNING id, project_id, profile_summary, tone_calibration,
               emotional_signals, acknowledged_mistakes, interaction_count`,
    [organizationId, userId, projectId]
  );
  if (inserted.rows.length > 0) return inserted.rows[0] as ProfileRow;
  // Lost a concurrent-insert race — re-run the update once.
  const retry = await getPool().query(
    `UPDATE ana_relational_profiles
        SET interaction_count = interaction_count + 1,
            last_interaction_at = now(), updated_at = now()
      WHERE organization_id = $1 AND user_id = $2
        AND project_id IS NOT DISTINCT FROM $3
      RETURNING id, project_id, profile_summary, tone_calibration,
                emotional_signals, acknowledged_mistakes, interaction_count`,
    [organizationId, userId, projectId]
  );
  return (retry.rows[0] as ProfileRow) ?? null;
}

interface ReflectionResult {
  profileSummary?: string;
  toneCalibration?: AnaToneCalibration;
  emotionalNote?: string | null;
  mistakeNote?: { mistake: string; correction: string } | null;
}

function parseReflection(raw: string): ReflectionResult | null {
  const trimmed = (raw || '').trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fence?.[1], trimmed].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end <= start) continue;
    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1));
      if (parsed && typeof parsed === 'object') return parsed as ReflectionResult;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

function buildReflectionPrompt(params: {
  scopeLabel: string;
  existingSummary: string | null;
  userMessage: string;
  assistantMessage: string;
}): string {
  const { scopeLabel, existingSummary, userMessage, assistantMessage } = params;
  return [
    'You are AnA reflecting privately after a conversation turn, updating your own',
    `working notes about ${scopeLabel}. These notes shape how you show up for them`,
    'next time — tone, level of detail, humor tolerance, what they care about,',
    'what stresses them, and any mistake you made that they corrected.',
    '',
    '--- YOUR CURRENT NOTES ---',
    existingSummary || '(none yet — this relationship is new)',
    '--- END CURRENT NOTES ---',
    '',
    '--- LATEST TURN ---',
    `User: ${userMessage.slice(0, 1500)}`,
    `You (AnA): ${assistantMessage.slice(0, 1500)}`,
    '--- END TURN ---',
    '',
    'Return ONE JSON object, nothing else:',
    '{',
    `  "profileSummary": string,   // your updated notes, <= ${MAX_SUMMARY_CHARS} chars, prose, durable observations only — no transcript replay`,
    '  "toneCalibration": { "warmth": "low|medium|high", "humor": "none|rare|welcome", "formality": "relaxed|standard|formal", "detail": "concise|standard|exhaustive" },',
    '  "emotionalNote": string | null,  // <= 160 chars: current emotional read worth carrying into the NEXT turn, else null',
    '  "mistakeNote": { "mistake": string, "correction": string } | null  // ONLY if the user corrected something you got wrong this turn',
    '}',
    '',
    'Rules: keep observations kind and professional — these are notes a trusted',
    'colleague would be comfortable having read aloud. No PII beyond what the',
    'user volunteered. Merge, don\'t append: rewrite the summary as one coherent',
    'picture. If nothing meaningful changed, return the existing summary unchanged.',
  ].join('\n');
}

async function reflectScope(params: {
  organizationId: number;
  userId: number;
  projectId: number | null;
  scopeLabel: string;
  userMessage: string;
  assistantMessage: string;
  profile: ProfileRow;
}): Promise<void> {
  const gw = ensureGateway();
  if (!gw || gw.getEnabledProviders().length === 0) return;

  const prompt = buildReflectionPrompt({
    scopeLabel: params.scopeLabel,
    existingSummary: params.profile.profile_summary,
    userMessage: params.userMessage,
    assistantMessage: params.assistantMessage,
  });

  const response = await gw.route({
    taskType: 'summarization',
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 700,
    temperature: 0.3,
    jsonMode: true,
    callerModule: 'ana-relational-profile',
    organizationId: params.organizationId,
    userId: params.userId,
  });

  const reflection = parseReflection(response.content || '');
  if (!reflection) return;

  const now = new Date().toISOString();
  const summary =
    typeof reflection.profileSummary === 'string' && reflection.profileSummary.trim()
      ? reflection.profileSummary.trim().slice(0, MAX_SUMMARY_CHARS)
      : params.profile.profile_summary;

  const tone: AnaToneCalibration =
    reflection.toneCalibration && typeof reflection.toneCalibration === 'object'
      ? reflection.toneCalibration
      : (params.profile.tone_calibration ?? {});

  const signals: AnaEmotionalSignal[] = [...(params.profile.emotional_signals ?? [])];
  if (typeof reflection.emotionalNote === 'string' && reflection.emotionalNote.trim()) {
    signals.push({ at: now, signal: reflection.emotionalNote.trim().slice(0, 200) });
  }

  const mistakes: AnaAcknowledgedMistake[] = [...(params.profile.acknowledged_mistakes ?? [])];
  if (
    reflection.mistakeNote &&
    typeof reflection.mistakeNote.mistake === 'string' &&
    typeof reflection.mistakeNote.correction === 'string' &&
    reflection.mistakeNote.mistake.trim()
  ) {
    mistakes.push({
      at: now,
      mistake: reflection.mistakeNote.mistake.trim().slice(0, 300),
      correction: reflection.mistakeNote.correction.trim().slice(0, 300),
    });
  }

  await getPool().query(
    `UPDATE ana_relational_profiles
        SET profile_summary = $4,
            tone_calibration = $5::jsonb,
            emotional_signals = $6::jsonb,
            acknowledged_mistakes = $7::jsonb,
            updated_at = now()
      WHERE organization_id = $1 AND user_id = $2
        AND project_id IS NOT DISTINCT FROM $3`,
    [
      params.organizationId,
      params.userId,
      params.projectId,
      summary,
      JSON.stringify(tone),
      JSON.stringify(signals.slice(-MAX_SIGNALS_KEPT)),
      JSON.stringify(mistakes.slice(-MAX_MISTAKES_KEPT)),
    ]
  );
}

/**
 * Post-turn reflection. Call fire-and-forget (`void reflectAfterTurn(...)`)
 * after the assistant response is finalized — never awaited on the request
 * path. Bumps interaction counters always; runs the LLM reflection only on
 * the throttle cadence or when the turn carries an emotional/corrective
 * signal.
 */
export async function reflectAfterTurn(input: {
  organizationId?: number | null;
  userId?: number | null;
  projectId?: number | null;
  userMessage: string;
  assistantMessage: string;
}): Promise<void> {
  const organizationId = Number(input.organizationId);
  const userId = Number(input.userId);
  if (!Number.isFinite(organizationId) || organizationId <= 0) return;
  if (!Number.isFinite(userId) || userId <= 0) return;
  const projectId =
    input.projectId != null && Number.isFinite(Number(input.projectId))
      ? Number(input.projectId)
      : null;

  try {
    const userProfile = await touchProfile(organizationId, userId, null);
    const projectProfile =
      projectId != null ? await touchProfile(organizationId, userId, projectId) : null;
    if (!userProfile) return;

    const signaled = detectReflectionSignal(input.userMessage);
    const onCadence =
      REFLECT_EVERY_N > 0 && userProfile.interaction_count % REFLECT_EVERY_N === 0;
    if (!signaled && !onCadence) return;

    await reflectScope({
      organizationId,
      userId,
      projectId: null,
      scopeLabel: 'this user (how they like to work with you, anywhere)',
      userMessage: input.userMessage,
      assistantMessage: input.assistantMessage,
      profile: userProfile,
    });

    if (projectProfile) {
      await reflectScope({
        organizationId,
        userId,
        projectId,
        scopeLabel: "this user's current project (its vocabulary, pressure points, history)",
        userMessage: input.userMessage,
        assistantMessage: input.assistantMessage,
        profile: projectProfile,
      });
    }
  } catch (err: any) {
    if (err?.code !== '42P01') {
      logger.warn(`post-turn reflection failed: ${err?.message}`);
    }
  }
}
