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
 * Storage: in-memory with TTL. Single-process for BETA; the GA
 * replacement is Redis-backed so confirmations survive worker
 * restarts. Concurrency: each (org, thread) holds at most ONE
 * pending action; proposing a new one overwrites the prior — that
 * matches user intent (the most recent proposal is the one being
 * confirmed).
 *
 * Tenant safety: the org id is part of the key, so even if a thread
 * id collides across tenants (it shouldn't, but defense-in-depth)
 * the lookup refuses cross-tenant access.
 */

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
