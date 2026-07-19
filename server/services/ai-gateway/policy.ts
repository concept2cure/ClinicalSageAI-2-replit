/**
 * AI Gateway — Policy Engine
 *
 * Enforces organizational policies, rate limits, content filters,
 * token budgets, prompt-injection scanning, and PII/PHI controls before
 * AI requests are executed.
 *
 * Two evaluation passes:
 *   - evaluate()          — synchronous checks: token budget, prompt-injection
 *                           scanning (role-aware), blocked patterns, rate
 *                           limits. Returns allow/deny plus non-blocking
 *                           findings for the audit trail.
 *   - evaluatePiiPolicy() — asynchronous PII/PHI pass over outbound message
 *                           content, backed by the governed ai-governance
 *                           content classifier. Produces a structured verdict
 *                           ('allow' | 'flag' | 'redact' | 'block') and, for
 *                           'redact', a copied message set safe for provider
 *                           dispatch. The caller's messages are never mutated.
 */

import type { GatewayRequest, GatewayMessage, PolicyConfig } from './types';
import { detectPromptInjection, type InjectionSeverity } from './promptInjection';
import {
  getContentClassifier,
  type ClassificationMatch,
} from '../ai-governance/classification/index.js';
import { redactSecretsAndPiiText } from '../observability/redaction.js';

// ─────────────────────────────────────────────────────────────────────────────
// Verdict Types
// ─────────────────────────────────────────────────────────────────────────────

/** Disposition the content policy applied to a request (or a single finding). */
export type ContentPolicyAction = 'allow' | 'flag' | 'redact' | 'block';

/**
 * A single content-policy detection. Findings never carry raw sensitive
 * values — only detector names, classes and classifier-redacted excerpts —
 * so they are safe to persist in the audit ledger alongside prompt hashes.
 */
export interface PolicyFinding {
  /** Which policy produced this finding. */
  scope: 'pii' | 'prompt_injection';
  /** Disposition applied to this specific finding. */
  action: Exclude<ContentPolicyAction, 'allow'>;
  /** Index of the offending message within request.messages. */
  messageIndex: number;
  /** Role of the offending message (runtime roles like 'tool' included). */
  role: string;
  /** Detector that fired — classifier detector name or injection category. */
  detector: string;
  /** Sensitivity class for PII findings ('phi' | 'pii' | 'regulatory'). */
  contentClass?: string;
  /** Severity for prompt-injection findings. */
  severity?: InjectionSeverity;
  /** Classifier confidence for PII findings (0..1). */
  confidence?: number;
  /** Redacted excerpt for audit — never the raw sensitive value. */
  redactedSample?: string;
}

export interface PolicyResult {
  allowed: boolean;
  reason?: string;
  /**
   * Content-policy findings gathered during evaluation. Present on both
   * allowed (flag-only) and blocked results so the gateway can record them
   * in the audit trail.
   */
  findings?: PolicyFinding[];
}

/** Structured verdict from the async PII/PHI content pass. */
export interface ContentPolicyVerdict {
  action: ContentPolicyAction;
  /** False only when action === 'block'. */
  allowed: boolean;
  reason?: string;
  findings: PolicyFinding[];
  /**
   * Present when action === 'redact': copied messages with sensitive spans
   * replaced by '[REDACTED]', safe for provider dispatch. The caller's
   * original request/messages are left untouched.
   */
  messages?: GatewayMessage[];
}

// In-memory rate limit tracking
interface RateBucket {
  count: number;
  windowStart: number;
}

const DEFAULT_POLICY: PolicyConfig = {
  maxTokensPerRequest: 128_000,
  maxRequestsPerMinutePerOrg: 100,
  maxRequestsPerMinutePerUser: 30,
  blockedPatterns: [],
  contentFilters: true,
  // Default posture: ON. This platform is PHI-adjacent; an engine constructed
  // without an explicit policy must fail closed, not silently skip the PII
  // pass. Callers that genuinely want the pass off (e.g. an air-gapped
  // self-hosted lane) opt out explicitly with piiDetection: false.
  piiDetection: true,
  // scanAllRoles intentionally left unset here: resolution order is explicit
  // config > AI_GATEWAY_SCAN_ALL_ROLES env var > default ON.
};

// ─────────────────────────────────────────────────────────────────────────────
// PII Detector Dispositions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Disposition per ai-governance classifier detector when piiDetection is on.
 * The split follows the platform's fail-closed + honest-degradation
 * conventions:
 *
 *   - 'redact' — spans covered by the governed redactor
 *     (server/services/observability/redaction.ts::redactSecretsAndPiiText,
 *     the same scrubber that protects outbound telemetry). Redaction is
 *     applied to a COPY of the messages for provider dispatch and verified by
 *     re-classifying; if a span survives, the request blocks instead.
 *   - 'block'  — structured PHI identifiers with no governed span-redactor.
 *     Sending them to a provider under a piiDetection=true policy would
 *     violate the org's stated posture, so the request fails closed.
 *   - 'flag'   — identifiers that are false-positive-prone on regulated
 *     document numbering (10+ digit IDs, GTIN-14 device identifiers) and
 *     have no governed redactor. Blocking here would break legitimate
 *     clinical/regulatory workflows, so they surface in the audit trail
 *     for review instead. This is a documented, deliberate floor — not
 *     silent tolerance.
 *   - 'ignore' — context signals that are not identifiers (regulatory
 *     keywords fire on virtually every document this platform touches).
 *
 * Detectors this table does not know (e.g. future SLM classifier labels)
 * fail closed: any unknown phi/pii-class match blocks.
 */
const PII_DETECTOR_DISPOSITION: Record<string, Exclude<ContentPolicyAction, 'allow'> | 'ignore'> = {
  email: 'redact',
  ssn: 'redact',
  mrn: 'block',
  dob: 'block',
  health_plan_id: 'block',
  phone: 'flag',
  credit_card: 'flag',
  regulatory_keyword: 'ignore',
};

function piiDisposition(match: ClassificationMatch): Exclude<ContentPolicyAction, 'allow'> | 'ignore' {
  const known = PII_DETECTOR_DISPOSITION[match.detector];
  if (known) return known;
  // Unknown detector: fail closed on sensitive classes, ignore the rest.
  return match.class === 'phi' || match.class === 'pii' ? 'block' : 'ignore';
}

const ACTION_RANK: Record<ContentPolicyAction, number> = {
  allow: 0,
  flag: 1,
  redact: 2,
  block: 3,
};

/**
 * Collect every scannable text span of a message: the content string plus
 * text blocks and document titles/context. Base64/file document bodies and
 * images are NOT scannable here — the PII pass records that gap explicitly.
 */
function collectMessageTexts(msg: GatewayMessage): string[] {
  const texts: string[] = [];
  if (typeof msg.content === 'string' && msg.content) texts.push(msg.content);
  for (const block of msg.contentBlocks ?? []) {
    if (block.type === 'text' && block.text) {
      texts.push(block.text);
    } else if (block.type === 'document') {
      if (block.title) texts.push(block.title);
      if (block.context) texts.push(block.context);
    }
  }
  return texts;
}

/**
 * Produce a redacted COPY of the messages for provider dispatch, running
 * every scannable text span through the governed telemetry scrubber.
 * Original message objects (and their content blocks) are never mutated.
 */
function redactMessagesCopy(messages: GatewayMessage[]): GatewayMessage[] {
  return messages.map(msg => {
    const copy: GatewayMessage = {
      ...msg,
      content:
        typeof msg.content === 'string' && msg.content
          ? redactSecretsAndPiiText(msg.content)
          : msg.content,
    };
    if (msg.contentBlocks) {
      copy.contentBlocks = msg.contentBlocks.map(block => {
        if (block.type === 'text') {
          return { ...block, text: redactSecretsAndPiiText(block.text) };
        }
        if (block.type === 'document') {
          return {
            ...block,
            ...(block.title ? { title: redactSecretsAndPiiText(block.title) } : {}),
            ...(block.context ? { context: redactSecretsAndPiiText(block.context) } : {}),
          };
        }
        return block;
      });
    }
    return copy;
  });
}

export class GatewayPolicyEngine {
  private config: PolicyConfig;

  // Rate limit: Map<org/global key, bucket>
  private rateBuckets: Map<string, RateBucket> = new Map();

  // Daily cost accumulator: Map<org/global key, {date: string, totalCost: number}>
  private dailyCost: Map<string, { date: string; total: number }> = new Map();

  constructor(config?: Partial<PolicyConfig>) {
    this.config = { ...DEFAULT_POLICY, ...config };
  }

  /**
   * Evaluate a request against all synchronous policies. Returns non-blocking
   * findings (e.g. medium-severity indirect-injection flags) alongside the
   * allow/deny result so the gateway can audit them.
   */
  evaluate(request: GatewayRequest): PolicyResult {
    // 1. Token budget
    const tokenResult = this.checkTokenBudget(request);
    if (!tokenResult.allowed) return tokenResult;

    // 2. Prompt-injection scan (role-aware)
    const injectionResult = this.checkPromptInjection(request);
    if (!injectionResult.allowed) return injectionResult;
    const findings = injectionResult.findings ?? [];

    // 3. Blocked content patterns
    const contentResult = this.checkBlockedPatterns(request);
    if (!contentResult.allowed) return { ...contentResult, findings };

    // 4. Rate limit (per org)
    const rateResult = this.checkRateLimit(request);
    if (!rateResult.allowed) return { ...rateResult, findings };

    return { allowed: true, findings };
  }

  /**
   * Async PII/PHI pass over outbound message content (all roles — system
   * prompts and assistant history can carry protected data just as user
   * messages can). No-op when piiDetection is off. Detection reuses the
   * governed ai-governance content classifier; redaction reuses the governed
   * telemetry scrubber. See PII_DETECTOR_DISPOSITION for the action matrix.
   */
  async evaluatePiiPolicy(request: GatewayRequest): Promise<ContentPolicyVerdict> {
    // Explicit default posture: piiDetection defaults ON (DEFAULT_POLICY);
    // when an org's policy turns it off, the pass is a documented no-op.
    if (!this.config.piiDetection) {
      return { action: 'allow', allowed: true, findings: [] };
    }

    const classifier = getContentClassifier();
    const findings: PolicyFinding[] = [];
    let verdictAction: ContentPolicyAction = 'allow';
    const escalate = (action: ContentPolicyAction): void => {
      if (ACTION_RANK[action] > ACTION_RANK[verdictAction]) verdictAction = action;
    };

    const messages = request.messages || [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      // Honest degradation: attached binary documents (base64 PDFs, Files API
      // references) cannot be regex-classified here. Record the coverage gap
      // in the audit trail instead of silently pretending the scan was full.
      if (msg.contentBlocks?.some(b => b.type === 'document')) {
        findings.push({
          scope: 'pii',
          action: 'flag',
          messageIndex: i,
          role: msg.role,
          detector: 'unscannable_document_block',
        });
        escalate('flag');
      }

      for (const text of collectMessageTexts(msg)) {
        const result = await classifier.classify(text);
        for (const match of result.matches) {
          const action = piiDisposition(match);
          if (action === 'ignore') continue;
          findings.push({
            scope: 'pii',
            action,
            messageIndex: i,
            role: msg.role,
            detector: match.detector,
            contentClass: match.class,
            confidence: result.confidence,
            redactedSample: match.redactedSample,
          });
          escalate(action);
        }
      }
    }

    if (verdictAction === 'block') {
      const detectors = [
        ...new Set(findings.filter(f => f.action === 'block').map(f => f.detector)),
      ].join(', ');
      return {
        action: 'block',
        allowed: false,
        reason:
          `PII policy: protected identifiers detected in outbound content (${detectors}); ` +
          'blocked fail-closed — no governed redaction exists for these spans. ' +
          'De-identify the content or disable piiDetection for this policy.',
        findings,
      };
    }

    if (verdictAction === 'redact') {
      const redacted = redactMessagesCopy(messages);

      // Verification pass — fail closed if any redact-disposition span
      // survived the scrubber (detection and redaction corpuses are governed
      // separately, so never assume they agree).
      for (const msg of redacted) {
        for (const text of collectMessageTexts(msg)) {
          const check = await classifier.classify(text);
          const survivors = check.matches.filter(m => piiDisposition(m) === 'redact');
          if (survivors.length > 0) {
            return {
              action: 'block',
              allowed: false,
              reason:
                'PII policy: redaction verification failed ' +
                `(${[...new Set(survivors.map(m => m.detector))].join(', ')} still detected ` +
                'after redaction); blocked fail-closed.',
              findings,
            };
          }
        }
      }

      return { action: 'redact', allowed: true, findings, messages: redacted };
    }

    if (verdictAction === 'flag') {
      return { action: 'flag', allowed: true, findings };
    }

    return { action: 'allow', allowed: true, findings: [] };
  }

  /**
   * Record cost for daily budget tracking.
   */
  recordCost(orgId: string | undefined, cost: number): void {
    const key = orgId || '__global__';
    const today = new Date().toISOString().slice(0, 10);
    const bucket = this.dailyCost.get(key);
    if (bucket && bucket.date === today) {
      bucket.total += cost;
    } else {
      this.dailyCost.set(key, { date: today, total: cost });
    }
  }

  /**
   * Update policy configuration.
   */
  updateConfig(patch: Partial<PolicyConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  /**
   * Get current config (for admin/debug).
   */
  getConfig(): PolicyConfig {
    return { ...this.config };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Individual Policy Checks
  // ─────────────────────────────────────────────────────────────────────────

  private checkTokenBudget(request: GatewayRequest): PolicyResult {
    if (request.maxTokens && request.maxTokens > this.config.maxTokensPerRequest) {
      return {
        allowed: false,
        reason: `Requested maxTokens (${request.maxTokens}) exceeds policy limit (${this.config.maxTokensPerRequest})`,
      };
    }
    return { allowed: true };
  }

  /**
   * Whether non-user roles are scanned for indirect prompt injection.
   * Explicit config wins; otherwise the AI_GATEWAY_SCAN_ALL_ROLES env var
   * decides (default ON — set to 'false' to opt out). Default is ON because
   * hostile directives smuggled into ingested regulatory documents / RAG
   * chunks / tool outputs are this platform's primary realistic vector.
   */
  private scanAllRolesEnabled(): boolean {
    if (this.config.scanAllRoles !== undefined) return this.config.scanAllRoles;
    return process.env.AI_GATEWAY_SCAN_ALL_ROLES !== 'false';
  }

  /**
   * Role-aware prompt-injection scan.
   *
   * USER messages keep the original fail-closed posture: any detection
   * blocks (they are the classic direct-injection channel).
   *
   * NON-USER messages (system/assistant, plus runtime roles such as 'tool')
   * carry indirect content — RAG chunks, tool outputs, ingested document
   * text. They are scanned when scanAllRoles is on (default), with a
   * severity split to avoid false-positiving legitimate directives:
   *   - high-severity signatures (instruction override, system-prompt
   *     exfiltration, persona reassignment) block fail-closed;
   *   - medium-severity signatures (roleplay/pretend framing) are flagged
   *     into the findings for the gateway audit trail without blocking.
   *
   * System messages explicitly marked origin: 'app' — authored verbatim by
   * our own code, never assembled from ingested content — are exempt, so
   * legitimate shipped prompts can instruct the model freely.
   */
  private checkPromptInjection(request: GatewayRequest): PolicyResult {
    if (!this.config.contentFilters) return { allowed: true, findings: [] };

    const scanAllRoles = this.scanAllRolesEnabled();
    const findings: PolicyFinding[] = [];
    const messages = request.messages || [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const isUser = msg.role === 'user';

      if (!isUser) {
        if (!scanAllRoles) continue;
        // Trusted app-authored system prompts are exempt (see GatewayMessage.origin).
        if (msg.role === 'system' && msg.origin === 'app') continue;
      }

      for (const text of collectMessageTexts(msg)) {
        const hit = detectPromptInjection(text);
        if (!hit.detected) continue;

        const blocking = isUser || hit.severity === 'high';
        findings.push({
          scope: 'prompt_injection',
          action: blocking ? 'block' : 'flag',
          messageIndex: i,
          role: msg.role,
          detector: hit.category || 'unknown',
          severity: hit.severity,
        });

        if (blocking) {
          return {
            allowed: false,
            reason:
              `Content filter: potential prompt injection detected (${hit.category}` +
              `${isUser ? '' : ` in ${msg.role} content`})`,
            findings,
          };
        }
      }
    }

    return { allowed: true, findings };
  }

  private checkBlockedPatterns(request: GatewayRequest): PolicyResult {
    if (!this.config.blockedPatterns || this.config.blockedPatterns.length === 0) {
      return { allowed: true };
    }

    // Check all message content against blocked patterns
    const textsToCheck: string[] = [];

    if (request.messages) {
      for (const msg of request.messages) {
        if (typeof msg.content === 'string') {
          textsToCheck.push(msg.content);
        }
      }
    }

    for (const pattern of this.config.blockedPatterns) {
      const regex = new RegExp(pattern, 'i');
      for (const text of textsToCheck) {
        if (regex.test(text)) {
          return {
            allowed: false,
            reason: `Content matched blocked pattern: ${pattern}`,
          };
        }
      }
    }

    return { allowed: true };
  }

  private checkRateLimit(request: GatewayRequest): PolicyResult {
    const now = Date.now();
    const windowMs = 60_000; // 1 minute

    // --- Organization-level rate limit ---
    const orgKey = request.organizationId?.toString() || '__global__';
    let orgBucket = this.rateBuckets.get(orgKey);
    if (!orgBucket || now - orgBucket.windowStart > windowMs) {
      orgBucket = { count: 0, windowStart: now };
      this.rateBuckets.set(orgKey, orgBucket);
    }
    orgBucket.count++;

    if (orgBucket.count > this.config.maxRequestsPerMinutePerOrg) {
      return {
        allowed: false,
        reason: `Organization rate limit exceeded: ${orgBucket.count}/${this.config.maxRequestsPerMinutePerOrg} requests per minute`,
      };
    }

    // --- Per-user rate limit ---
    const userId = (request as any).userId;
    if (userId) {
      const userKey = `${orgKey}:user:${userId}`;
      let userBucket = this.rateBuckets.get(userKey);
      if (!userBucket || now - userBucket.windowStart > windowMs) {
        userBucket = { count: 0, windowStart: now };
        this.rateBuckets.set(userKey, userBucket);
      }
      userBucket.count++;

      const perUserLimit = this.config.maxRequestsPerMinutePerUser || 30;
      if (userBucket.count > perUserLimit) {
        return {
          allowed: false,
          reason: `User rate limit exceeded: ${userBucket.count}/${perUserLimit} requests per minute`,
        };
      }
    }

    return { allowed: true };
  }
}
