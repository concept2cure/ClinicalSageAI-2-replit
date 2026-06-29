/**
 * Translation service — public barrel + ORCHESTRATOR.
 *
 * This module is the single import surface for the translation engine. It
 * re-exports the contract types, the glossary/DNT engine, the translation
 * memory, the hybrid-workflow state machine, and the providers; and it adds the
 * {@link TranslationOrchestrator} that wires them together for the DRAFT step:
 *
 *     TM lookup ──hit──▶ reuse approved human/post-edited target (no model call)
 *         │ miss
 *         ▼
 *     glossary MASK ▶ provider draft (gateway) ▶ glossary UNMASK + preferred terms
 *         ▼
 *     workflow transition: pending ──draft──▶ mt_draft (method 'machine')
 *
 * The orchestrator is PURE except for its two injected, side-effectful
 * dependencies — the {@link TranslationProvider} and the {@link TranslationMemory}.
 * Everything else (masking, workflow transitions, hashing) is pure and
 * deterministic, so the orchestration logic is unit-testable with a stub provider
 * and an in-memory TM.
 *
 * REGULATED-PLATFORM GUARDRAILS preserved by this orchestrator:
 *  - A machine draft lands in 'mt_draft' / method 'machine' and is NEVER
 *    approvable on its own — promotion past 'mt_draft' goes through the workflow
 *    state machine (post-edit + back-translation + distinct reviewer).
 *  - DNT identifiers are masked before the model and restored after (the
 *    LLM provider's mask→call→unmask cycle), so identifiers never reach the model.
 *  - A TM reuse hit only ever surfaces previously APPROVED human / mt_postedited
 *    content (the TM rejects 'machine'); reused segments are marked accordingly so
 *    they still flow through review rather than being silently approved.
 *  - Deterministic/demo draft content is flagged through to the workflow so it
 *    can be refused at approval time.
 *
 * @module server/services/translation
 */

import { createHash } from 'node:crypto';

import { createScopedLogger } from '../../utils/logger.js';
import {
  applyLockedTargetTerms,
  mask,
  unmask,
  type MaskingGlossary,
} from './glossary';
import { TRANSLATION_PROMPT_VERSION } from './providers/llm-provider';
import {
  transition,
  type WorkflowActor,
  type TransitionContext,
} from './hybrid-workflow';
import type { TranslationMemory } from './translation-memory';
import type {
  MaskResult,
  ProviderTranslateInput,
  ProviderTranslateOutput,
  SegmentProvenance,
  TmMatch,
  TranslationProvider,
  TranslationSegment,
} from './types';

const logger = createScopedLogger('translation-orchestrator');

// ── Public barrel ────────────────────────────────────────────────────────────

// Contract types (shared) re-exported through the service's own type surface.
export * from './types';

// Glossary / DNT engine.
export {
  BUILTIN_DNT_CATEGORIES,
  applyLockedTargetTerms,
  compileGlossary,
  detectDntSpans,
  emptyGlossary,
  isPlaceholder,
  mask,
  registerDntTerms,
  unmask,
  type MaskingGlossary,
} from './glossary';

// Translation memory.
export {
  DEFAULT_FUZZY_THRESHOLD,
  InMemoryTranslationMemory,
  createInMemoryTranslationMemory,
  fromSegment,
  hashSource,
  levenshtein,
  normalizeForMatch,
  similarity,
  type TmEntry,
  type TmLookupOptions,
  type TmMethod,
  type TranslationMemory,
} from './translation-memory';

// Hybrid workflow state machine.
export {
  TERMINAL_STATUSES,
  WorkflowTransitionError,
  allowedActions,
  approvalGuard,
  isApprovable,
  isSubmissionReady,
  isTerminal,
  transition,
  type TransitionContext,
  type WorkflowAction,
  type WorkflowActor,
  type WorkflowErrorCode,
} from './hybrid-workflow';

// Providers.
export {
  LLM_PROVIDER_ID,
  LlmProviderError,
  LlmTranslationProvider,
  TRANSLATION_PROMPT_VERSION,
  buildGatewayRequest,
  buildSystemPrompt,
  createLlmTranslationProvider,
  engineLabel,
  type GatewayLike,
  type LlmProviderErrorCode,
  type LlmProviderOptions,
} from './providers/llm-provider';
export {
  MANUAL_ENGINE_LABEL,
  MANUAL_PROVIDER_ID,
  ManualProviderError,
  ManualTranslationProvider,
  createManualTranslationProvider,
  type ManualTranslateInput,
  type ManualProviderErrorCode,
} from './providers/manual-provider';

// ── Orchestrator types ───────────────────────────────────────────────────────

/** What a DRAFT orchestration produced for a single segment. */
export interface DraftOutcome {
  /** The segment after the orchestration (status advanced, provenance stamped). */
  segment: TranslationSegment;
  /**
   * How the target text was obtained:
   *  - 'tm_reuse'  — an approved TM hit was reused (no model call); segment is
   *                  left in 'mt_draft' so it still flows through human review,
   *                  but its method reflects the reused human/post-edited source.
   *  - 'machine'   — a fresh machine draft from the provider (method 'machine').
   */
  source: 'tm_reuse' | 'machine';
  /** Engine/version that produced the draft (TM provenance engine, or model id). */
  engine: string;
  /** True when the underlying draft was deterministic/demo content. */
  deterministic: boolean;
  /** The TM match that was reused, when source === 'tm_reuse'. */
  tmMatch?: TmMatch;
  /** The mask result used for the model call, when source === 'machine'. */
  mask?: MaskResult;
}

/** Dependencies injected into the orchestrator (the only side-effectful parts). */
export interface OrchestratorDeps {
  /** The DRAFT engine (AI-gateway-backed by default). */
  provider: TranslationProvider;
  /** Translation memory for reuse before paying for a model call. */
  tm: TranslationMemory;
}

/** Options for {@link TranslationOrchestrator.draftSegment}. */
export interface DraftSegmentOptions {
  /** Compiled glossary (DNT masking + preferred-term hints) for this tenant/lang. */
  glossary: MaskingGlossary;
  /** Optional user id for the gateway audit trail (the system runs the draft). */
  userId?: number;
  /** Hard data-residency constraint threaded to the gateway. */
  dataResidency?: ProviderTranslateInput['dataResidency'];
  /** Require zero-data-retention routing at the provider. */
  zeroDataRetention?: boolean;
  /**
   * Reuse approved Translation-Memory hits before calling the model (default
   * true). When a hit is reused, no model call is made.
   */
  useTm?: boolean;
  /** Minimum TM similarity (0..1) to reuse a fuzzy hit. Defaults to the TM default. */
  tmThreshold?: number;
  /** ISO-8601 clock injected for reproducible provenance timestamps. */
  now?: string;
}

// ── Helpers (pure) ───────────────────────────────────────────────────────────

/** SHA-256 (hex) of a string — same primitive the segments/TM use for keys. */
function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Derive the non-DNT preferred-term hints to bias the model, from a compiled
 * glossary. Pure. Only language-applicable terms with a non-empty target form.
 */
export function glossaryHintsFor(
  glossary: MaskingGlossary,
): Array<{ source: string; target: string }> {
  return glossary.lockedTargetTerms
    .filter(
      (t) =>
        !t.doNotTranslate &&
        !!t.targetTerm &&
        (t.targetLang == null || t.targetLang === glossary.targetLang),
    )
    .map((t) => ({ source: t.sourceTerm, target: t.targetTerm as string }));
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Ties TM lookup → provider draft (with glossary mask/unmask) → workflow
 * transition into one DRAFT operation. Holds no mutable state of its own; the
 * provider and TM are the injected dependencies.
 */
export class TranslationOrchestrator {
  private readonly provider: TranslationProvider;
  private readonly tm: TranslationMemory;

  constructor(deps: OrchestratorDeps) {
    this.provider = deps.provider;
    this.tm = deps.tm;
  }

  /**
   * Produce a DRAFT for one `pending` segment.
   *
   * Flow:
   *  1. TM lookup (unless disabled). An approved exact/fuzzy hit is reused
   *     verbatim — NO model call — and the segment is advanced to 'mt_draft'
   *     carrying the reused human/post-edited text (it still must pass review).
   *  2. On a miss, MASK the source, draft via the provider, UNMASK, then apply
   *     preferred target terms. The segment is advanced to 'mt_draft' / method
   *     'machine' via the workflow state machine.
   *
   * Throws {@link LlmProviderError} (or any provider error) on a draft failure —
   * the segment is left untouched (caller keeps it 'pending'); nothing is fabricated.
   */
  async draftSegment(
    segment: TranslationSegment,
    options: DraftSegmentOptions,
  ): Promise<DraftOutcome> {
    const now = options.now ?? new Date().toISOString();
    const useTm = options.useTm ?? true;

    // The source hash binds provenance to the exact text translated.
    const sourceHash = segment.sourceHash || sha256Hex(segment.sourceText);

    // ── 1. Translation-memory reuse (approved human/post-edited content only) ──
    if (useTm) {
      const matches = this.tm.lookup(
        {
          organizationId: segment.organizationId,
          sourceLang: segment.sourceLang,
          targetLang: segment.targetLang,
          sourceText: segment.sourceText,
          sourceHash,
        },
        options.tmThreshold != null ? { threshold: options.tmThreshold } : undefined,
      );
      const hit = matches[0];
      if (hit) {
        return this.reuseFromTm(segment, hit, sourceHash, now);
      }
    }

    // ── 2. Machine DRAFT via the provider (mask → gateway → unmask) ──
    return this.machineDraft(segment, options, sourceHash, now);
  }

  /**
   * Advance a segment using an approved TM hit. No model call. The segment moves
   * to 'mt_draft' (so it still flows through human review per the guardrails),
   * carrying the reused target text and the matched provenance's engine label.
   */
  private reuseFromTm(
    segment: TranslationSegment,
    hit: TmMatch,
    sourceHash: string,
    now: string,
  ): DraftOutcome {
    const systemActor: WorkflowActor = { userId: null };
    const drafted = transition(segment, 'draft', systemActor, { now });

    // Reuse stamps the approved target text + the source provenance engine. We
    // record the source hash so the draft is bound to the exact source text.
    const engine = hit.provenance.engine ?? 'tm-reuse';
    const provenance: SegmentProvenance = {
      ...drafted.provenance,
      sourceHash,
      engine,
      promptVersion: null,
    };

    const out: TranslationSegment = {
      ...drafted,
      targetText: hit.targetText,
      sourceHash,
      provenance,
      updatedAt: now,
    };

    logger.debug('Reused approved TM hit for draft', {
      segmentId: segment.id,
      organizationId: segment.organizationId,
      matchKind: hit.matchKind,
      score: hit.score,
    });

    return {
      segment: out,
      source: 'tm_reuse',
      engine,
      deterministic: false,
      tmMatch: hit,
    };
  }

  /**
   * Produce a fresh machine draft. Masks the source from the glossary, calls the
   * provider on masked text only, unmasks, applies preferred target terms, then
   * advances the segment to 'mt_draft' / method 'machine'.
   */
  private async machineDraft(
    segment: TranslationSegment,
    options: DraftSegmentOptions,
    sourceHash: string,
    now: string,
  ): Promise<DraftOutcome> {
    const { glossary } = options;

    // MASK before the model ever sees the text.
    const masked: MaskResult = mask(segment.sourceText, glossary);

    const input: ProviderTranslateInput = {
      maskedSourceText: masked.maskedText,
      sourceLang: segment.sourceLang,
      targetLang: segment.targetLang,
      organizationId: segment.organizationId,
      userId: options.userId,
      glossaryHints: glossaryHintsFor(glossary),
      dataResidency: options.dataResidency,
      zeroDataRetention: options.zeroDataRetention,
    };

    // Provider draft — may throw a typed error; we do NOT catch-and-fabricate.
    const draft = (await this.provider.translate(input)) as ProviderTranslateOutput;

    // UNMASK + enforce preferred (non-DNT) target renderings.
    const restored = unmask(draft.targetText, masked);
    const targetText = applyLockedTargetTerms(restored, glossary);

    const deterministic = draft.deterministic === true;

    // Advance through the state machine: pending → mt_draft, method 'machine'.
    const systemActor: WorkflowActor = { userId: options.userId ?? null };
    const ctx: TransitionContext = { now };
    const drafted = transition(segment, 'draft', systemActor, ctx);

    const provenance: SegmentProvenance = {
      ...drafted.provenance,
      sourceHash,
      engine: draft.engine,
      promptVersion: TRANSLATION_PROMPT_VERSION,
    };

    const out: TranslationSegment = {
      ...drafted,
      targetText,
      sourceHash,
      provenance,
      updatedAt: now,
    };

    if (deterministic) {
      logger.warn('Draft produced from deterministic/demo content; not promotable', {
        segmentId: segment.id,
        organizationId: segment.organizationId,
        engine: draft.engine,
      });
    }

    return {
      segment: out,
      source: 'machine',
      engine: draft.engine,
      deterministic,
      mask: masked,
    };
  }

  /**
   * Draft a batch of segments, isolating per-segment failures. Returns the
   * successful outcomes plus a typed list of failures (segment id + error) so a
   * route handler can report partial success without aborting the batch. A
   * failed segment is simply omitted from `outcomes` and left 'pending'.
   */
  async draftSegments(
    segments: readonly TranslationSegment[],
    options: DraftSegmentOptions,
  ): Promise<{ outcomes: DraftOutcome[]; failures: Array<{ segmentId: number; error: unknown }> }> {
    const outcomes: DraftOutcome[] = [];
    const failures: Array<{ segmentId: number; error: unknown }> = [];
    for (const segment of segments) {
      try {
        outcomes.push(await this.draftSegment(segment, options));
      } catch (error) {
        logger.warn(
          `Draft failed for segment ${segment.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { segmentId: segment.id, organizationId: segment.organizationId },
        );
        failures.push({ segmentId: segment.id, error });
      }
    }
    return { outcomes, failures };
  }
}

/** Factory mirroring the service layer's construction style. */
export function createTranslationOrchestrator(
  deps: OrchestratorDeps,
): TranslationOrchestrator {
  return new TranslationOrchestrator(deps);
}
