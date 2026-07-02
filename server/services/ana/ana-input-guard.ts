/**
 * AnA Input Guard — thin wrapper that WIRES the existing prompt-injection
 * defense into the AnA chat/stream hot path.
 *
 * This module deliberately contains NO detection logic of its own. All
 * detection, risk scoring (block threshold = 7), sanitization and content
 * encapsulation live in {@link ../../lib/prompt-injection-protection} and are
 * reused verbatim via {@link getPromptInjectionProtection}. The gap this closes
 * (per the AI-safety audit) is that the library was never invoked on the
 * user-input path — so every user turn now flows through {@link guardUserInput}.
 *
 * SAFETY / ROLLOUT CONTRACT — default behavior MUST NOT change:
 *   1. Detection ALWAYS runs. On a high-risk score we write a tamper-evident
 *      audit record (reusing {@link auditService}) and log a structured warning.
 *      This is pure OBSERVATION — zero behavior change, zero output change.
 *   2. Hard-block (throw {@link PromptInjectionError}) happens ONLY when
 *      `PROMPT_INJECTION_ENFORCE === 'true'` (default OFF). Regulatory text can
 *      legitimately match jailbreak patterns, so enforcement is opt-in until
 *      false positives are tuned.
 *   3. Content encapsulation (wrapping the user text in injection-resistant
 *      delimiters via `encapsulateUserContent`) is applied ONLY when
 *      `PROMPT_INJECTION_ENCAPSULATE === 'true'` (default OFF), so the prompt
 *      structure the model sees is unchanged by default.
 *
 * With both flags off (the default), the ONLY effect is detection + audit
 * logging of attacks. The deliverable is COVERAGE (every input inspected +
 * logged) with enforcement a config flip.
 *
 * @module server/services/ana/ana-input-guard
 * @compliance FDA 21 CFR Part 11, OWASP LLM Top 10
 */

import {
  getPromptInjectionProtection,
  PromptInjectionError,
  type PromptInjectionDetection,
} from '../../lib/prompt-injection-protection.js';
import auditService from '../auditService.js';

export { PromptInjectionError };
export type { PromptInjectionDetection };

/** Coarse risk bucket derived from the library's numeric risk score. */
export type GuardRiskLevel = 'none' | 'low' | 'medium' | 'high';

/** Ambient request context reused for the audit record (mirrors stream.ts). */
export interface GuardContext {
  organizationId?: string | number | null;
  userId?: string | number | null;
  projectId?: string | number | null;
  threadId?: string | number | null;
  route?: string;
  ipAddress?: string;
  userAgent?: string;
}

/** Result of inspecting a single user turn. */
export interface GuardResult {
  /**
   * The text to hand to the model. Identical to the input by default; the
   * injection-resistant encapsulated form ONLY when PROMPT_INJECTION_ENCAPSULATE
   * is enabled.
   */
  text: string;
  /** Numeric risk score from the shared detector (severity-weighted). */
  riskScore: number;
  /** Coarse bucket derived from riskScore. */
  riskLevel: GuardRiskLevel;
  /** True when riskScore >= the library's blocking threshold (7). */
  blocked: boolean;
  /** Every pattern the detector matched (may be empty). */
  detections: PromptInjectionDetection[];
  /** True when enforcement was active AND the input would have been blocked. */
  enforced: boolean;
  /** True when the returned `text` was encapsulated. */
  encapsulated: boolean;
}

const ENV_ENFORCE = 'PROMPT_INJECTION_ENFORCE';
const ENV_ENCAPSULATE = 'PROMPT_INJECTION_ENCAPSULATE';

function isEnforceEnabled(): boolean {
  return process.env[ENV_ENFORCE] === 'true';
}

function isEncapsulateEnabled(): boolean {
  return process.env[ENV_ENCAPSULATE] === 'true';
}

/** Map the library's numeric score onto a coarse bucket (block threshold = 7). */
function toRiskLevel(riskScore: number, blocked: boolean): GuardRiskLevel {
  if (blocked || riskScore >= 7) return 'high';
  if (riskScore >= 4) return 'medium';
  if (riskScore >= 1) return 'low';
  return 'none';
}

/**
 * Inspect one user turn. ALWAYS runs detection; audits + warns on high risk;
 * blocks only under enforcement; encapsulates only when that flag is set.
 *
 * Never throws for audit/log failures — an audit-trail hiccup must not break the
 * user's turn. The ONLY throw is a {@link PromptInjectionError} when enforcement
 * is enabled and the input crosses the block threshold.
 */
export async function guardUserInput(
  text: string,
  ctx: GuardContext = {},
): Promise<GuardResult> {
  const protection = getPromptInjectionProtection();
  const analysis = protection.analyze(text);
  const riskLevel = toRiskLevel(analysis.riskScore, analysis.blocked);
  const enforceEnabled = isEnforceEnabled();
  const encapsulateEnabled = isEncapsulateEnabled();

  // (a) OBSERVATION — on a high-risk score, log a structured warning and write
  // an audit record. Pure side effect; independent of the two behavior flags.
  if (riskLevel === 'high') {
    const types = Array.from(new Set(analysis.detected.map((d) => d.type)));
    console.warn(
      `[AnaInputGuard] High-risk user input on ${ctx.route ?? 'ana'} — ` +
        `riskScore=${analysis.riskScore} blocked=${analysis.blocked} ` +
        `enforce=${enforceEnabled} types=[${types.join(', ')}]`,
    );
    try {
      // Reuse the same tamper-evident audit pipeline governed actions use.
      await auditService.logAction({
        tenantId: ctx.organizationId ?? undefined,
        userId: ctx.userId ?? undefined,
        action: 'ana.prompt_injection.detected',
        resourceType: 'ana_user_input',
        resourceId: ctx.threadId != null ? String(ctx.threadId) : undefined,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        details: {
          route: ctx.route,
          projectId: ctx.projectId ?? null,
          threadId: ctx.threadId ?? null,
          riskScore: analysis.riskScore,
          riskLevel,
          blocked: analysis.blocked,
          enforced: enforceEnabled,
          detectionTypes: types,
          detections: analysis.detected.map((d) => ({
            type: d.type,
            severity: d.severity,
            description: d.description,
            position: d.position,
          })),
        },
      });
    } catch (auditErr: any) {
      // Non-fatal: never let an audit failure break the user's turn.
      console.error(
        '[AnaInputGuard] Audit write for prompt-injection detection failed (non-fatal):',
        auditErr?.message,
      );
    }
  }

  // (c) HARD-BLOCK — opt-in only. When enforcement is off (default) a high-risk
  // input is observed + audited above but flows through unchanged.
  if (enforceEnabled && analysis.blocked) {
    throw new PromptInjectionError(
      'User input was blocked by the prompt-injection policy',
      analysis.detected,
      analysis.riskScore,
    );
  }

  // (d) ENCAPSULATION — opt-in only. Wrap the user content in the library's
  // injection-resistant delimiters so the model treats it strictly as data.
  // encapsulateUserContent() re-throws on a blocked payload; when enforcement is
  // off we swallow that and fall back to the raw text so the flag alone can
  // never change blocking behavior.
  let outText = text;
  let encapsulated = false;
  if (encapsulateEnabled) {
    try {
      outText = protection.encapsulateUserContent(text);
      encapsulated = true;
    } catch (err) {
      if (err instanceof PromptInjectionError && !enforceEnabled) {
        outText = text;
        encapsulated = false;
      } else {
        throw err;
      }
    }
  }

  return {
    text: outText,
    riskScore: analysis.riskScore,
    riskLevel,
    blocked: analysis.blocked,
    detections: analysis.detected,
    enforced: enforceEnabled && analysis.blocked,
    encapsulated,
  };
}
