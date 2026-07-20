/**
 * regulatoryAIServicePhase3 — Minimal stub + tenant-scoped dead-letter queue
 *
 * Provides the interface expected by phase3-routes.js and semanticEmbeddingService.js.
 * AI methods return safe empty/defaults so the server boots without errors.
 *
 * The dead-letter queue is a real (bounded, in-memory) store for failed AI
 * operations. SECURITY: every entry is tagged with the owning organizationId
 * at enqueue so reads and clears can be tenant-scoped — the pre-fix global
 * queue let any authenticated tenant read (and wipe) every other tenant's
 * failed-AI payloads via /ai/dead-letter-queue. Scoping is fail-closed:
 * callers that do not pass an explicit scope get nothing back.
 */

import crypto from 'crypto';

/** Bound on retained entries — oldest entries are evicted first. */
const MAX_DEAD_LETTER_ENTRIES = 500;

/** Bound on the serialized payload snapshot kept per entry. */
const MAX_PAYLOAD_CHARS = 4000;

/**
 * In-memory dead-letter queue. Entries: { id, operation, error,
 * organizationId, timestamp, payload? }. `organizationId` is `null` for
 * legacy/untagged entries, which are visible only to platform admins
 * (enforced by the route layer via the scopes below).
 */
const deadLetterQueue = [];

/** Coerce an org id to a finite number, or null (untagged). */
function normalizeOrgId(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Truncate a payload snapshot so a burst of failures cannot balloon memory. */
function boundedPayload(payload) {
  if (payload == null) return undefined;
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  if (typeof text !== 'string') return undefined;
  return text.length > MAX_PAYLOAD_CHARS ? `${text.slice(0, MAX_PAYLOAD_CHARS)}…[truncated]` : text;
}

/**
 * Resolve the entries visible under a scope.
 *   - `{ all: true }`            → every entry (platform-admin path).
 *   - `{ organizationId }`       → that org's entries only.
 *   - `{}` / missing org         → nothing (fail-closed).
 */
function visibleEntries(scope = {}) {
  if (scope.all === true) return deadLetterQueue.slice();
  const orgId = normalizeOrgId(scope.organizationId);
  if (orgId == null) return [];
  return deadLetterQueue.filter(entry => entry.organizationId === orgId);
}

const regulatoryAIPhase3 = {
  getFeatureFlags() {
    return {
      namedEntityRecognition: false,
      semanticEmbeddings: false,
      complianceChecking: false,
      advancedAnalytics: false,
    };
  },

  async extractNamedEntities(_text, _context) {
    return { entities: [], confidence: 0 };
  },

  async generateEmbedding(_text) {
    return { embedding: [], dimensions: 0 };
  },

  async checkCompliance(_text, _framework, _options) {
    return { compliant: true, findings: [], score: 1.0 };
  },

  getTokenBudgetStatus() {
    return { used: 0, limit: 0, remaining: 0 };
  },

  /**
   * Enqueue a failed operation. Tags the entry with the caller's
   * organizationId (normalized to a number, `null` when absent) so the
   * queue can be read/cleared per-tenant. Returns the stored entry.
   */
  addToDeadLetterQueue(entry = {}) {
    const record = {
      id: crypto.randomUUID(),
      operation: entry.operation || 'unknown',
      error: entry.error || null,
      organizationId: normalizeOrgId(entry.organizationId),
      timestamp: entry.timestamp || new Date().toISOString(),
      payload: boundedPayload(entry.payload),
    };
    deadLetterQueue.push(record);
    if (deadLetterQueue.length > MAX_DEAD_LETTER_ENTRIES) {
      deadLetterQueue.splice(0, deadLetterQueue.length - MAX_DEAD_LETTER_ENTRIES);
    }
    return record;
  },

  /**
   * Read the queue under a tenant scope (see visibleEntries). Calling with
   * no scope returns [] — routes must pass `{ organizationId }` for tenant
   * reads or `{ all: true }` for the platform-admin view.
   */
  getDeadLetterQueue(scope) {
    return visibleEntries(scope);
  },

  /**
   * Clear entries the caller can see. `indices` index into the SAME array
   * `getDeadLetterQueue(scope)` returns (so a tenant's index 0 is their own
   * first entry, never another tenant's). Omitting `indices` clears every
   * visible entry. Returns the number of entries removed.
   */
  clearDeadLetterQueue(indices, scope) {
    const visible = visibleEntries(scope);
    const targets = Array.isArray(indices)
      ? new Set(indices.map(i => visible[i]).filter(Boolean))
      : new Set(visible);
    if (targets.size === 0) return 0;

    let removed = 0;
    for (let i = deadLetterQueue.length - 1; i >= 0; i--) {
      if (targets.has(deadLetterQueue[i])) {
        deadLetterQueue.splice(i, 1);
        removed += 1;
      }
    }
    return removed;
  },
};

export default regulatoryAIPhase3;
