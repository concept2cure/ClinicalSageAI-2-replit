/**
 * @fileoverview AnA's `ana-action` blocks, as proposals a person confirms.
 * @module server/services/ana-guidance-executor
 *
 * The persona tells AnA to end a substantive deliverable — a memo, a strategy
 * note, a reviewer brief, a risk-log entry, a rewrite — with a fenced
 * ```ana-action JSON block. Both chat paths hand her reply here: the live
 * stream's post-processing (server/routes/ana-ri/post-processing.ts) and
 * POST /api/chat (server/routes/chat/send-message.ts).
 *
 * ── What changed, and why (2026-10-01, P0-12 residual; audit DP-08) ─────────
 * Until today a block at "strong" or "moderate" confidence was EXECUTED here:
 * a governed artifact created in the project, and for `review_thread` a review
 * thread opened with a comment written in the person's name. Nobody was asked.
 * It was a third write door beside the command partition (command-rbac.ts)
 * and the tool register (ana/tool-authorization.ts) — the two places that
 * make every other AnA write a proposal — with writes of its own that neither
 * saw.
 *
 * Now a block is translated into the canonical platform command it asks for,
 * `create_artifact`, and put through executeCommands with no person's
 * confirmation on the context. The partition decides, exactly as it does for
 * a ```command block: create_artifact is a write, so the answer is the
 * HUMAN_CONFIRMATION_REQUIRED proposal (confirm tier), which the client
 * renders as the sign-off prompt (extractPendingSignoffs). A person's yes goes
 * to POST /api/ana-ri/governed-action, which runs the same command's handler
 * (createArtifact in ana-ri/command-executor.ts) — the one write path, with
 * its quality gate and governed persistence. RBAC answers first: someone who
 * may not create the artifact is told so, not asked to confirm it.
 *
 * What a person can no longer get by AnA's word alone, and where it is now:
 *   - the artifact → the create_artifact proposal on the same turn;
 *   - the review thread and its opening comment → once the backing memo
 *     exists, `create_review_thread` and `add_review_comment` (both proposals
 *     through the same partition), on the artifact the person created.
 *
 * Provisional and uncertain blocks propose nothing, as before: the persona
 * tells AnA to recommend, not act, at those levels.
 *
 * Every block leaves a line in the answer saying what became of it — proposed
 * and not yet saved, or not saved and why — taken from the partition's answer
 * (fix round, 2026-10-01). Both chat paths store what settleActionBlocks
 * answers, so neither can say a block ran when nothing did.
 *
 * POST /api/chat cannot hold a turn to ask, as the live stream does, so it
 * also returns the platform-command proposals its tool loop produced
 * (pendingSignoffFromToolResult) in the same envelope; until then those
 * reached only the model and the person had nothing to confirm.
 *
 * This module writes nothing and stamps nothing. It must not: the governed
 * route is the one writer of `humanConfirmed`.
 */

import type { CommandContext, CommandResult } from './ana-ri/command-executor.js';
import { PLATFORM_COMMAND_TOOL } from './ana/governed-tool-gate.js';
import { parseIntegerProjectId } from '../lib/project-id.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type AnaActionType =
  | 'rewrite'
  | 'memo'
  | 'strategy_note'
  | 'reviewer_brief'
  | 'risk_log'
  | 'review_thread';

export type AnaConfidenceLevel = 'strong' | 'moderate' | 'provisional' | 'uncertain';

// ═══════════════════════════════════════════════════════════════════════════════
// SIGNAL DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

export interface DetectedActionSignal {
  type: AnaActionType;
  confidence: AnaConfidenceLevel;
  title: string;
  content: string;
  sectionCode?: string;
  decisionContext?: string;
  guidanceSummary?: string;
}

const VALID_ACTION_TYPES: Set<string> = new Set([
  'rewrite', 'memo', 'strategy_note', 'reviewer_brief', 'risk_log', 'review_thread',
]);
const VALID_CONFIDENCE: Set<string> = new Set(['strong', 'moderate', 'provisional', 'uncertain']);

// ── Safety limits — prevent runaway artifact creation ──────────────────────
const MAX_ACTIONS_PER_RESPONSE = 5;
const MAX_CONTENT_LENGTH = 100_000; // ~100KB per artifact
const MAX_TITLE_LENGTH = 500;

/**
 * Detect structured action signals in AnA's response text.
 * Primary: looks for ```ana-action JSON blocks.
 * Fallback: looks for <!--ana-action JSON --> HTML comments (LLMs sometimes emit these).
 */
export function detectActionSignals(responseText: string): DetectedActionSignal[] {
  const signals: DetectedActionSignal[] = [];

  // Primary pattern: fenced code block
  const fencedPattern = /```ana-action\s*\n([\s\S]*?)\n```/g;
  // Fallback: HTML comment pattern (LLMs sometimes wrap in comments)
  const commentPattern = /<!--\s*ana-action\s*\n([\s\S]*?)\n\s*-->/g;

  for (const pattern of [fencedPattern, commentPattern]) {
    if (signals.length >= MAX_ACTIONS_PER_RESPONSE) break;
    let match;
    while ((match = pattern.exec(responseText)) !== null) {
      try {
        const raw = match[1].trim();
        const parsed = JSON.parse(raw);

        // Validate required fields and types
        if (
          typeof parsed.type === 'string' &&
          typeof parsed.confidence === 'string' &&
          typeof parsed.title === 'string' &&
          typeof parsed.content === 'string' &&
          VALID_ACTION_TYPES.has(parsed.type) &&
          VALID_CONFIDENCE.has(parsed.confidence) &&
          parsed.title.length > 0 &&
          parsed.content.length > 0
        ) {
          // Enforce safety limits
          const sanitizedTitle = parsed.title.slice(0, MAX_TITLE_LENGTH).replace(/[\x00-\x1f]/g, '');
          const truncatedContent = parsed.content.length > MAX_CONTENT_LENGTH
            ? parsed.content.slice(0, MAX_CONTENT_LENGTH) + '\n\n[Content truncated — exceeded maximum length]'
            : parsed.content;

          signals.push({
            type: parsed.type as AnaActionType,
            confidence: parsed.confidence as AnaConfidenceLevel,
            title: sanitizedTitle,
            content: truncatedContent,
            sectionCode: typeof parsed.sectionCode === 'string' ? parsed.sectionCode.slice(0, 50) : undefined,
            decisionContext: typeof parsed.decisionContext === 'string' ? parsed.decisionContext.slice(0, 200) : undefined,
            guidanceSummary: typeof parsed.guidanceSummary === 'string' ? parsed.guidanceSummary.slice(0, 500) : undefined,
          });

          // Stop processing if we hit the max
          if (signals.length >= MAX_ACTIONS_PER_RESPONSE) {
            console.warn(`[AnA Executor] Hit max actions limit (${MAX_ACTIONS_PER_RESPONSE}), ignoring remaining signals`);
            break;
          }
        } else {
          console.warn('[AnA Executor] Action signal missing required fields or invalid type/confidence');
        }
      } catch {
        console.warn('[AnA Executor] Malformed JSON in action signal block, skipping');
      }
    }
  }

  return signals;
}

/**
 * Strip action signal blocks from the response text so they don't
 * render as visible code blocks in the chat UI.
 */
export function stripActionSignals(responseText: string): string {
  return responseText
    .replace(/```ana-action\s*\n[\s\S]*?\n```/g, '')
    .replace(/<!--\s*ana-action\s*\n[\s\S]*?\n\s*-->/g, '')
    .trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIDENCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Whether a block is put to the person at all. Strong and moderate: AnA has a
 * deliverable ready and proposes filing it. Provisional and uncertain: she
 * recommends only, as the persona instructs, and nothing is proposed.
 */
export function shouldPropose(confidence: AnaConfidenceLevel): boolean {
  return confidence === 'strong' || confidence === 'moderate';
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSLATION TO THE CANONICAL COMMAND
// ═══════════════════════════════════════════════════════════════════════════════

type DispatchedCommand = Parameters<typeof import('./ana-ri/command-executor.js').executeCommands>[0][number];

/** Where the block came from, recorded on the artifact's provenance. */
export interface ActionBlockProvenance {
  threadId?: string;
  conversationId?: string;
}

/**
 * The `create_artifact` command an ana-action block asks for. A review_thread
 * block asks first for the memo the thread would hang on — a thread needs an
 * artifact — under the title the old executor gave it.
 */
export function actionSignalToCommand(
  signal: DetectedActionSignal,
  projectId: number,
  provenance: ActionBlockProvenance = {},
): DispatchedCommand {
  const isThread = signal.type === 'review_thread';
  const metadata: Record<string, unknown> = {
    source: 'ana_guidance',
    anaGenerated: true,
    anaActionType: signal.type,
    confidence: signal.confidence,
  };
  for (const [k, v] of Object.entries({
    decisionContext: signal.decisionContext,
    guidanceSummary: signal.guidanceSummary,
    threadId: provenance.threadId,
    conversationId: provenance.conversationId,
  })) {
    if (v) metadata[k] = v;
  }
  return {
    command: 'create_artifact',
    params: {
      projectId,
      title: isThread ? `[Review Context] ${signal.title}` : signal.title,
      content: signal.content,
      type: isThread ? 'memo' : signal.type,
      ...(signal.sectionCode ? { ctdSection: signal.sectionCode } : {}),
      metadata,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHAT PIPELINE INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

/** The turn a reply belongs to: the verified principal, never the model's text. */
export interface ActionBlockTurn extends ActionBlockProvenance {
  /** The project the chat is scoped to. Parsed fail-closed: a program UUID is not a project. */
  projectId: number | string | null | undefined;
  organizationId: number;
  userId: number;
  userName?: string;
  userRole?: string;
  /** The model call whose reply carried the blocks. */
  servingModel?: CommandContext['servingModel'];
}

/**
 * Take the ana-action blocks out of AnA's reply and turn each one she is
 * confident in into a proposal, through the command partition.
 *
 * Returns the reply without the blocks, followed by one line per block saying
 * what became of it, and the command results — one per proposed block: a
 * HUMAN_CONFIRMATION_REQUIRED proposal, or the refusal that came first (RBAC,
 * tenant policy, an unreadable governance configuration). Callers put the
 * results in the turn's `executedCommands`, beside the results of the reply's
 * ```command blocks, which is what the sign-off prompt reads.
 *
 * The line per block (fix round, 2026-10-01): a block that proposed nothing —
 * provisional, no project in scope, refused — used to leave no trace, and a
 * reply of nothing but such blocks was answered "Action executed
 * successfully." Now the line says it was not saved, and why. When the reply
 * was nothing but blocks, the draft itself is kept above that line: it exists
 * nowhere else, and the sign-off card shows 77 characters of it.
 *
 * Never throws for a reply it cannot act on. A dispatch error propagates: both
 * callers then keep the reply exactly as AnA wrote it, blocks included, so the
 * deliverable stays on screen, nothing is written and nothing claims it was.
 */
export async function processResponseActions(
  responseText: string,
  turn: ActionBlockTurn,
): Promise<{ cleanedText: string; proposals: CommandResult[] }> {
  const signals = detectActionSignals(responseText);
  if (signals.length === 0) return { cleanedText: responseText, proposals: [] };
  const prose = stripActionSignals(responseText);

  // No integer project, no proposal: parseInt('7abb1c22-…') is 7, a valid and
  // wrong project (ADR-0011), and a person would be asked to file into it.
  const projectId = parseIntegerProjectId(turn.projectId);
  const proposable = projectId === null ? [] : signals.filter((s) => shouldPropose(s.confidence));
  const proposals = projectId === null ? [] : await proposeBlocks(proposable, projectId, turn);

  const receipts = signals.map((s) =>
    blockReceipt(s, blockStatus(s, projectId, proposals[proposable.indexOf(s)]), prose === ''),
  );
  console.info(
    `[AnA action blocks] ${signals.length} block(s) → ${proposals.filter(isPendingSignoff).length} put to the person`,
  );
  return { cleanedText: [prose, ...receipts].filter(Boolean).join('\n\n'), proposals };
}

/** The partition's answer to each block: with no person's confirmation, a proposal or a refusal. */
async function proposeBlocks(
  signals: DetectedActionSignal[],
  projectId: number,
  turn: ActionBlockTurn,
): Promise<CommandResult[]> {
  if (signals.length === 0) return [];
  const commands = signals.map((s) => actionSignalToCommand(s, projectId, turn));
  // The context carries no person's confirmation: it is the model's proposal,
  // so every write the partition knows comes back as a proposal and nothing runs.
  const ctx: CommandContext = {
    userId: turn.userId,
    organizationId: turn.organizationId,
    activeProjectId: projectId,
    userName: turn.userName,
    userRole: turn.userRole,
    threadId: turn.threadId,
    servingModel: turn.servingModel ?? null,
  };
  const { executeCommands } = await import('./ana-ri/command-executor.js');
  return executeCommands(commands, ctx);
}

/** What became of one block, as the person reads it. Taken from the partition's answer, never assumed. */
function blockStatus(
  signal: DetectedActionSignal,
  projectId: number | null,
  result: CommandResult | undefined,
): string {
  if (!shouldPropose(signal.confidence)) {
    return `Not saved. AnA marked it ${signal.confidence}, so it was not proposed for saving.`;
  }
  if (projectId === null) {
    return 'Not saved. This conversation is not scoped to a project, so it could not be proposed for saving.';
  }
  if (isPendingSignoff(result)) {
    return 'Proposed for saving as a project artifact. Nothing is saved until you confirm it.';
  }
  const message = typeof result?.message === 'string' ? result.message.trim() : '';
  // Unreachable by construction (create_artifact is propose-only and the
  // context carries no confirmation); if it ever ran, say what the handler said.
  if (result?.success === true) return message || 'Saved as a project artifact.';
  return `Not saved. ${message || 'It could not be proposed for saving.'}`;
}

/** The block's line in the answer, with the draft above it when the reply had nothing else. */
function blockReceipt(signal: DetectedActionSignal, status: string, withDraft: boolean): string {
  return withDraft ? `**${signal.title}**\n\n${signal.content}\n\n> ${status}` : `**${signal.title}**: ${status}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// WHAT THE TURN TELLS THE PERSON
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The two answers the executor gives instead of running a command a person
 * must take: the propose-only gate's, and the Part 11 gate's. Exactly the set
 * the client's sign-off prompt reads (PENDING_SIGNOFF_ERRORS in
 * client/src/concept2cure/components/ana/useGovernedAction.ts).
 */
const PENDING_SIGNOFF_ERRORS: ReadonlySet<string> = new Set(['HUMAN_CONFIRMATION_REQUIRED', 'PART11_SIGNATURE_REQUIRED']);

type ResultLike = { success?: unknown; error?: unknown; message?: unknown } | null | undefined;

/** Is this command result a proposal waiting on a person? */
export function isPendingSignoff(result: ResultLike): boolean {
  return typeof result?.error === 'string' && PENDING_SIGNOFF_ERRORS.has(result.error);
}

/**
 * The stored answer when a turn's reply was empty once its blocks were taken
 * out. It said "Action executed successfully." whatever happened — over a
 * proposal nobody had confirmed, over a refusal where nothing ran, and (until
 * the fix round of 2026-10-01) over nothing at all: an empty list, which is
 * what the live stream passes for a turn that only offered a navigation chip.
 * Now it says which, and claims a run only when every result reports one.
 */
export function blocksOnlyAnswer(executedCommands: ResultLike[]): string {
  if (executedCommands.some(isPendingSignoff)) {
    return 'AnA proposed an action. Nothing has changed yet: review it below and confirm it to proceed.';
  }
  const refusedAt = executedCommands.findIndex((c) => c?.success !== true);
  if (refusedAt !== -1) {
    const message = executedCommands[refusedAt]?.message;
    const why = typeof message === 'string' && message.trim() ? ` ${message.trim()}` : '';
    return `Nothing was changed.${why}`;
  }
  return executedCommands.length > 0 ? 'Action executed successfully.' : 'Nothing was changed.';
}

/**
 * The answer a chat turn stores and shows once AnA's ana-action blocks are
 * settled, and the proposals they came back as — for both chat paths (the live
 * stream's post-processing and POST /api/chat), so the two cannot tell the
 * person different things. A reply without blocks is returned as written.
 * `loopProposals` are the turn's other proposals (POST /api/chat's
 * pendingSignoffFromToolResult), which an otherwise empty answer accounts for.
 */
export async function settleActionBlocks(
  reply: string,
  turn: ActionBlockTurn,
  loopProposals: readonly CommandResult[] = [],
): Promise<{ answer: string; proposals: CommandResult[] }> {
  const { cleanedText, proposals } = await processResponseActions(reply, turn);
  if (cleanedText === reply) return { answer: reply, proposals };
  const answer = cleanedText.trim() ? cleanedText : blocksOnlyAnswer([...loopProposals, ...proposals]);
  return { answer, proposals };
}

/**
 * The proposal a platform command came back as, from one agentic-loop tool
 * result, or null.
 *
 * For the paths that cannot hold a turn and ask (POST /api/chat). The loop's
 * `execute_platform_command` hands a write to executeCommands, which answers
 * with a proposal and runs nothing; until this, that proposal reached only the
 * model, and the person had nothing to confirm. Lifted as the executor built
 * it, so the client's sign-off prompt reads it as it reads a ```command
 * block's, and a person's yes goes to POST /api/ana-ri/governed-action.
 *
 * Only the command carrier's: a tool that writes on its own handler answers
 * with the same shape, but the route runs one only from a held run
 * (TOOL_NEEDS_HELD_RUN), so a prompt for it could never be completed. This
 * reads the partition's answer; it classifies nothing.
 */
export function pendingSignoffFromToolResult(toolName: string, rawResult: string): CommandResult | null {
  if (toolName !== PLATFORM_COMMAND_TOOL) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawResult);
  } catch {
    return null;
  }
  const result = (parsed as { result?: unknown } | null)?.result as
    | (CommandResult & { data?: { retry?: { command?: unknown } } })
    | undefined;
  if (!isPendingSignoff(result)) return null;
  return typeof result?.data?.retry?.command === 'string' && result.data.retry.command ? result : null;
}
