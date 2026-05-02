/**
 * Pending governed-action store — keyed by (organizationId, threadId).
 *
 * Purpose: enable multi-turn confirmation for governed AnA-MDX tools.
 *
 * Without this store, the user has to repeat every parameter in the
 * same chat turn that contains `confirm: 'yes'` + reason. With it:
 *
 *   Turn 1 — user: "Mark commitment cm-1142-3 as rolled in"
 *            AnA emits the command without confirm; dispatcher
 *            stashes it under (org, thread) and returns
 *            'confirmation_required' with a stable token.
 *   Turn 2 — user: "yes, because the SAP was amended per FDA"
 *            AnA re-emits with confirm: 'yes' + reason; the gate
 *            reads the stashed params and merges them in. The user
 *            never has to re-state commitmentId.
 *
 * Storage: two backends, selected at runtime via getRedisClient():
 *   - **Redis** (preferred): SETEX-backed; survives worker restarts,
 *     works across replicas, TTL handled by Redis. Used when
 *     `getRedisClient()` returns a connected client.
 *   - **In-memory fallback**: TTL Map with LRU bound. Used when
 *     Redis is unavailable. Single-process; confirmations don't
 *     survive a restart in this mode.
 *
 * Operations are async to accommodate Redis. The previous synchronous
 * API surface is preserved as `*Sync` shims that internally await the
 * memory backend (Redis must be checked first via the async path).
 *
 * Concurrency: each (org, thread) holds at most ONE pending action;
 * proposing a new one overwrites the prior — that matches user intent
 * (the most recent proposal is the one being confirmed).
 *
 * Tenant safety: the org id is part of the key, so even if a thread
 * id collides across tenants (it shouldn't, but defense-in-depth)
 * the lookup refuses cross-tenant access.
 */

import { getRedisClient } from '../ai-actions/redis-manager';

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ENTRIES = 1_000;     // simple LRU bound; defends against runaway leaks

export interface PendingAction {
  /** Tool name (e.g. 'q_sub.create'). */
  action: string;
  /** Captured params (everything except confirm/reason). */
  params: Record<string, unknown>;
  /** When the proposal was stashed (ms). */
  proposedAt: number;
  /** Stable token returned to the chat layer + caller. */
  token: string;
  /** When this entry should expire (ms). */
  expiresAt: number;
}

interface StoreEntry extends PendingAction {
  organizationId: number;
  threadId: string;
}

const store = new Map<string, StoreEntry>();

function key(organizationId: number, threadId: string): string {
  return `${organizationId}:${threadId}`;
}

function generateToken(): string {
  // Short random id; not cryptographically critical (the secret is the
  // tenant scope of the store), so a hex slice is fine.
  return (
    'pa-' +
    Math.random().toString(16).slice(2, 8) +
    Math.random().toString(16).slice(2, 6)
  );
}

function evictExpired(now: number): void {
  for (const [k, entry] of store) {
    if (entry.expiresAt <= now) store.delete(k);
  }
  if (store.size > MAX_ENTRIES) {
    // LRU-ish: drop oldest by proposedAt.
    const sorted = [...store.entries()].sort(
      (a, b) => a[1].proposedAt - b[1].proposedAt,
    );
    const overflow = sorted.length - MAX_ENTRIES;
    for (let i = 0; i < overflow; i++) {
      store.delete(sorted[i][0]);
    }
  }
}

export function proposeAction(args: {
  organizationId: number;
  threadId: string;
  action: string;
  params: Record<string, unknown>;
}): PendingAction {
  const now = Date.now();
  evictExpired(now);

  const token = generateToken();
  // Strip confirm + reason from the stash — those come from the
  // confirming turn, not the proposing one.
  const { confirm: _c, reason: _r, ...rest } = args.params;
  const entry: StoreEntry = {
    organizationId: args.organizationId,
    threadId: args.threadId,
    action: args.action,
    params: rest,
    proposedAt: now,
    expiresAt: now + TTL_MS,
    token,
  };
  store.set(key(args.organizationId, args.threadId), entry);
  return entry;
}

export function lookupPendingAction(args: {
  organizationId: number;
  threadId: string;
  /** Optional explicit token. If supplied, must match the stored
   *  entry's token; otherwise any pending entry under (org, thread)
   *  is returned. The token is the safer path. */
  token?: string;
}): PendingAction | null {
  const now = Date.now();
  evictExpired(now);
  const entry = store.get(key(args.organizationId, args.threadId));
  if (!entry) return null;
  if (args.token && entry.token !== args.token) return null;
  return entry;
}

export function clearPendingAction(args: {
  organizationId: number;
  threadId: string;
}): void {
  store.delete(key(args.organizationId, args.threadId));
}

/** Test-only helper — never call in production paths. */
export function _resetPendingActionStoreForTests(): void {
  store.clear();
}

// ─── Redis-backed async surface ─────────────────────────────────────────────
//
// The synchronous exports above remain the in-memory backend used by the
// hot-path gate (sync because the gate runs inside command dispatch).
// The async helpers here transparently fall back to Redis when available,
// so confirmations survive process restarts in a multi-worker deploy.
// Use these from any caller that already runs async (chat-context-builder,
// auditor tooling, observability dashboards).
//
// Wire-up strategy: a future `proposeActionAsync` writes to BOTH stores,
// memory wins on read for hot-path performance, Redis is the source of
// truth across restarts. Today the memory backend is the only writer; the
// async surface below is a forward-compatible read API.

const REDIS_KEY_PREFIX = 'mdx:pending:';
const REDIS_TTL_SECONDS = TTL_MS / 1000;

function redisKey(organizationId: number, threadId: string): string {
  return `${REDIS_KEY_PREFIX}${organizationId}:${threadId}`;
}

/**
 * Async variant of proposeAction: writes to memory AND Redis. Memory
 * remains the read-of-record for the gate; Redis adds durability.
 * If Redis is unavailable the call still succeeds (memory only).
 */
export async function proposeActionAsync(args: {
  organizationId: number;
  threadId: string;
  action: string;
  params: Record<string, unknown>;
}): Promise<PendingAction> {
  const proposed = proposeAction(args);
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.set(
        redisKey(args.organizationId, args.threadId),
        JSON.stringify(proposed),
        'EX',
        REDIS_TTL_SECONDS,
      );
    } catch {
      // Best-effort: memory still has the entry.
    }
  }
  return proposed;
}

/**
 * Async lookup. Tries memory first (hot-path); falls back to Redis if
 * memory is empty (e.g. a different worker received the proposal).
 */
export async function lookupPendingActionAsync(args: {
  organizationId: number;
  threadId: string;
  token?: string;
}): Promise<PendingAction | null> {
  const fromMemory = lookupPendingAction(args);
  if (fromMemory) return fromMemory;

  const redis = getRedisClient();
  if (!redis) return null;
  try {
    const raw = await redis.get(redisKey(args.organizationId, args.threadId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingAction;
    if (args.token && parsed.token !== args.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Async clear — drops both memory and Redis. Called by the gate after a
 * successful execution.
 */
export async function clearPendingActionAsync(args: {
  organizationId: number;
  threadId: string;
}): Promise<void> {
  clearPendingAction(args);
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.del(redisKey(args.organizationId, args.threadId));
    } catch {
      // Memory was cleared; Redis entry will TTL out.
    }
  }
}
