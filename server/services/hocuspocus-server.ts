/**
 * Hocuspocus Server — Y.js CRDT WebSocket backend for real-time collaboration.
 *
 * Integrates with Express HTTP server to handle WebSocket upgrades at /collab.
 * Provides:
 * - Conflict-free real-time editing via Y.js
 * - Multi-cursor awareness (names, colors, positions)
 * - Durable document persistence to PostgreSQL (authoring_document_yjs_state)
 * - Access-token authentication AND per-document, per-tenant authorization
 * - Room isolation: a room IS an authoring_documents row, and that row's
 *   tenant_id must equal the tenant on the caller's verified token
 *
 * SECURITY (C2C-COLLAB-001). This endpoint used to treat *authentication* as if
 * it were *authorization*. `onAuthenticate` verified only the JWT signature:
 *
 *   - no token-class check, so a refresh / MFA-partial token authenticated;
 *   - no tenant binding, so the verified org claim was never read;
 *   - no document authorization — `documentName` was never resolved to a row —
 *     so ANY authenticated user in ANY organization could join and edit ANY
 *     document room simply by naming it;
 *   - two fail-OPEN fallbacks outside production: an "Anonymous" identity when
 *     no token was presented, and a "Dev User" identity AFTER signature
 *     verification FAILED — i.e. a forged token authenticated.
 *
 * The room is now authorized against the database before the connection is
 * established, using ONLY the verified principal. `documentName` is treated as
 * untrusted input: it is the *subject* of the authorization query, never a
 * source of identity or tenancy. Because `authoring_documents.id` is a primary
 * key, a given document id maps to exactly one tenant, so every connection that
 * passes this gate carries the same tenant — which is what makes the shared
 * per-room Y.Doc safe.
 *
 * DURABILITY (C2C-COLLAB-001 #3). `onStoreDocument` / `onLoadDocument` used to
 * only log, despite the header comment above claiming persistence: Y.js state
 * was never written to or read from PostgreSQL, so all collaborative content
 * was lost on document unload (debounce/timeout) or process restart. They now
 * read and write a checksummed, versioned snapshot in
 * `authoring_document_yjs_state`, scoped by the VERIFIED tenant carried in the
 * per-connection context — never by anything the client sent.
 *
 * @compliance 21 CFR Part 11 §11.10(d) limiting system access to authorized
 *             individuals; §11.10(c) protection of records throughout their
 *             retention period.
 */

import { Hocuspocus } from '@hocuspocus/server';
import type { IncomingMessage } from 'http';
import type { Server as HttpServer } from 'http';
import type { WebSocket } from 'ws';
import crypto from 'node:crypto';
import * as Y from 'yjs';
import { createScopedLogger } from '../utils/logger.js';
import { verifyJwtWithRotation } from '../utils/jwtVerify.js';
// Twin-safe imports. `../middleware/auth` has a stale compiled `auth.js`
// counterpart that some resolvers bind instead of `auth.ts`, silently dropping
// the security controls; `tokenType.ts` and `withTenantConnection.ts` have no
// such twin, so the controls below are provable under every resolver.
import { nonAccessTokenReason } from '../middleware/tokenType';
import { withTenantConnection } from '../db/withTenantConnection';

const log = createScopedLogger('hocuspocus');

let hocuspocusInstance: Hocuspocus | null = null;

/** A document room name must be a bare UUID — the `authoring_documents.id`. */
const DOCUMENT_NAME_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The claims this module reads off a verified access token. Structurally
 * compatible with `TokenClassClaims` so `nonAccessTokenReason` applies.
 */
interface CollabTokenClaims {
  type?: string;
  role?: string | null;
  mfaPending?: boolean;
  organizationId?: string | number;
  orgId?: string | number;
  userId?: string | number;
  sub?: string | number;
  id?: string | number;
  name?: string;
  username?: string;
  email?: string;
}

/** The verified principal + room binding carried into every later hook. */
export interface CollabConnectionContext {
  user: { id: string; name: string; email: string; color: string };
  /** Integer organization id taken from the VERIFIED token, never the client. */
  tenantId: number;
  /** The authorized `authoring_documents.id`. */
  docId: string;
}

/**
 * Authorization error. Hocuspocus turns a thrown error into a
 * `permission-denied` message and refuses the connection, so every failure
 * path here is fail-closed.
 */
export class CollabAuthorizationError extends Error {
  readonly reason: string;
  constructor(reason: string, message?: string) {
    super(message ?? reason);
    this.name = 'CollabAuthorizationError';
    this.reason = reason;
  }
}

/**
 * Resolve a collaboration connection to a verified principal and an authorized
 * document, or throw.
 *
 * Mirrors the canonical HTTP access path in `server/middleware/auth.ts`
 * (`authenticateToken`): verify signature with rotation → reject non-access
 * token classes → require a subject claim → derive the org from the verified
 * claim. It then adds the piece the HTTP path gets from its route handlers and
 * this endpoint never had: authorization of the requested resource.
 *
 * Exported so the negative cases (cross-tenant, forged, non-access, anonymous)
 * are directly testable without standing up a WebSocket server.
 */
export async function authorizeCollabConnection(
  token: string | undefined | null,
  documentName: string,
): Promise<CollabConnectionContext> {
  // 1. A credential is REQUIRED in every environment. There is deliberately no
  //    non-production anonymous path: this process shape is the same one that
  //    runs in staging/pilot, and a fail-open that depends on NODE_ENV is one
  //    misconfigured env var away from being production behaviour.
  if (!token) {
    throw new CollabAuthorizationError('authentication-required', 'Authentication required');
  }

  // 2. Signature verification (with rotation). A failure is terminal — there is
  //    no "dev user" fallback, so a FORGED token can never authenticate.
  let payload: CollabTokenClaims;
  try {
    payload = verifyJwtWithRotation<CollabTokenClaims>(token);
  } catch {
    throw new CollabAuthorizationError('invalid-token', 'Invalid authentication token');
  }

  // 3. Token class. Refresh / MFA-challenge / MFA-partial tokens are signed
  //    with the same secret as access tokens; accepting one here would let a
  //    half-authenticated session edit regulated content and bypass MFA.
  const nonAccess = nonAccessTokenReason(payload);
  if (nonAccess) {
    throw new CollabAuthorizationError('invalid-token', `Token is not an access token (${nonAccess})`);
  }

  // 4. Subject, from the verified claims only.
  const subjectClaim = payload.userId ?? payload.sub ?? payload.id;
  const subject =
    subjectClaim === undefined || subjectClaim === null ? '' : String(subjectClaim).trim();
  if (!subject || subject === '0') {
    throw new CollabAuthorizationError('invalid-token', 'Token missing required subject claim');
  }

  // 5. Tenant, from the verified claims only. NEVER defaulted — an access token
  //    with no organization claim cannot prove which tenant's documents it may
  //    open, so it is refused rather than silently attached to some org.
  const orgClaim = payload.organizationId ?? payload.orgId;
  const tenantId = Number(orgClaim);
  if (orgClaim === undefined || orgClaim === null || orgClaim === '' || !Number.isInteger(tenantId)) {
    throw new CollabAuthorizationError('forbidden', 'Token missing required organization claim');
  }

  // 6. The room name is untrusted input. Reject anything that is not a bare
  //    document UUID before it reaches the query.
  if (typeof documentName !== 'string' || !DOCUMENT_NAME_RE.test(documentName)) {
    throw new CollabAuthorizationError('forbidden', 'Unknown document');
  }

  // 7. AUTHORIZATION. Resolve the room to a real row scoped by the VERIFIED
  //    tenant. Zero rows means either "no such document" or "belongs to another
  //    organization" — both are refused, and the caller cannot tell them apart.
  //    withTenantConnection sets app.current_tenant_id on the connection so the
  //    tenant_isolation_policy (FORCE RLS) recognises the scope; the explicit
  //    tenant_id predicate holds even with RLS in shadow mode.
  let authorized = false;
  try {
    authorized = await withTenantConnection(
      { tenantId, caller: 'hocuspocus.onAuthenticate' },
      async client => {
        const result = await client.query(
          'SELECT 1 FROM authoring_documents WHERE id = $1 AND tenant_id = $2',
          [documentName, tenantId],
        );
        return (result.rowCount ?? 0) > 0;
      },
    );
  } catch (err) {
    // Fail CLOSED: an unreachable or erroring database must never be read as
    // "authorized".
    log.error('[Hocuspocus] Document authorization lookup failed — refusing connection', {
      documentName,
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new CollabAuthorizationError('forbidden', 'Document authorization unavailable');
  }

  if (!authorized) {
    log.warn('[Hocuspocus] Refused collaboration join: document not in caller organization', {
      documentName,
      tenantId,
      userId: subject,
    });
    throw new CollabAuthorizationError('forbidden', 'Document not found or access denied');
  }

  return {
    user: {
      id: subject,
      name: payload.name || payload.username || 'User',
      email: payload.email || '',
      color: getColorForUser(subject),
    },
    tenantId,
    docId: documentName,
  };
}

/**
 * Re-derive the verified room binding inside a later hook.
 *
 * `onAuthenticate`'s return value is merged into the per-connection context
 * Hocuspocus hands to `onLoadDocument` (via `createDocument`) and to
 * `onStoreDocument` (captured at update time by the store debouncer, so the
 * verified tenant is still present for the final flush after the socket closes).
 * Anything missing from it means the hook ran without a proven principal, which
 * must never result in a read or a write.
 */
function requireCollabContext(context: unknown, documentName: string): { tenantId: number; docId: string; actor: string } {
  const ctx = (context ?? {}) as Partial<CollabConnectionContext>;
  const tenantId = typeof ctx.tenantId === 'number' ? ctx.tenantId : NaN;
  const docId = typeof ctx.docId === 'string' ? ctx.docId : '';
  if (!Number.isInteger(tenantId) || !docId) {
    throw new CollabAuthorizationError('forbidden', 'Collaboration context is not authorized');
  }
  // Defence in depth: the persisted row is keyed by the AUTHORIZED doc id, so a
  // context that does not describe the document being loaded/stored is refused
  // rather than allowed to read or overwrite the wrong row.
  if (documentName && documentName !== docId) {
    throw new CollabAuthorizationError('forbidden', 'Collaboration context does not match document');
  }
  return { tenantId, docId, actor: ctx.user?.id ?? '' };
}

/**
 * Load the durable Y.js snapshot for an authorized room.
 *
 * Throws on database failure. Hocuspocus responds to a rejected
 * `onLoadDocument` by closing the connections and unloading the document —
 * which is the correct outcome: serving an EMPTY doc after a failed read would
 * let the next `onStoreDocument` overwrite good persisted state with nothing.
 */
export async function loadCollabDocumentState(
  context: unknown,
  documentName: string,
): Promise<Y.Doc | null> {
  const { tenantId, docId } = requireCollabContext(context, documentName);

  const row = await withTenantConnection(
    { tenantId, caller: 'hocuspocus.onLoadDocument' },
    async client => {
      const result = await client.query(
        'SELECT state, checksum, version FROM authoring_document_yjs_state WHERE doc_id = $1 AND tenant_id = $2',
        [docId, tenantId],
      );
      return (result.rows[0] ?? null) as { state: unknown; checksum: string; version: number } | null;
    },
  );

  if (!row) return null;

  const state = toBuffer(row.state);
  const checksum = crypto.createHash('sha256').update(state).digest('hex');
  if (row.checksum && checksum !== row.checksum) {
    // Do NOT silently deserialize a snapshot that does not match its recorded
    // digest — that is corruption of a regulated record, not a warning.
    throw new Error(
      `[Hocuspocus] Stored Y.js state failed checksum verification for document ${docId}`,
    );
  }

  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(state));
  log.debug('[Hocuspocus] Loaded persisted document state', {
    docId,
    tenantId,
    version: row.version,
    bytes: state.length,
  });
  return doc;
}

/** Persist the Y.js snapshot for an authorized room. */
export async function storeCollabDocumentState(
  context: unknown,
  documentName: string,
  document: Y.Doc,
): Promise<void> {
  const { tenantId, docId, actor } = requireCollabContext(context, documentName);

  const state = Buffer.from(Y.encodeStateAsUpdate(document));
  const checksum = crypto.createHash('sha256').update(state).digest('hex');

  await withTenantConnection(
    { tenantId, caller: 'hocuspocus.onStoreDocument' },
    async client => {
      await client.query(
        `INSERT INTO authoring_document_yjs_state
           (doc_id, tenant_id, state, version, checksum, updated_by, updated_at)
         VALUES ($1, $2, $3, 1, $4, $5, NOW())
         ON CONFLICT (doc_id, tenant_id) DO UPDATE SET
           state = EXCLUDED.state,
           checksum = EXCLUDED.checksum,
           version = authoring_document_yjs_state.version + 1,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
        [docId, tenantId, state, checksum, actor || null],
      );
    },
  );

  log.debug('[Hocuspocus] Persisted document state', { docId, tenantId, bytes: state.length });
}

/** Normalise a BYTEA column value (Buffer / Uint8Array / hex string) to a Buffer. */
function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === 'string') {
    return value.startsWith('\\x')
      ? Buffer.from(value.slice(2), 'hex')
      : Buffer.from(value, 'binary');
  }
  throw new Error('[Hocuspocus] Unsupported BYTEA representation for stored Y.js state');
}

/**
 * Configure and return the Hocuspocus server instance.
 * Called once during server startup.
 */
export function createHocuspocusServer(): Hocuspocus {
  if (hocuspocusInstance) return hocuspocusInstance;

  hocuspocusInstance = new Hocuspocus({
    name: 'concept2cure-collab',
    timeout: 30000,
    debounce: 2000,
    maxDebounce: 10000,
    quiet: process.env.NODE_ENV === 'production',

    async onAuthenticate({ token, documentName }: { token: string; documentName: string }) {
      // Everything returned here is merged into the per-connection context that
      // onLoadDocument / onStoreDocument receive — that is how the VERIFIED
      // tenant reaches persistence without ever round-tripping through the
      // client.
      return authorizeCollabConnection(token, documentName);
    },

    async onConnect({ documentName }: { documentName: string }) {
      // NOTE: Hocuspocus fires onConnect BEFORE onAuthenticate, so no verified
      // identity exists yet. Nothing may be authorized from here.
      log.debug(`[Hocuspocus] Connection opened for document: ${documentName}`);
    },

    async onDisconnect({ documentName }: { documentName: string }) {
      log.debug(`[Hocuspocus] User disconnected from document: ${documentName}`);
    },

    async onStoreDocument({ documentName, document, context }: any) {
      await storeCollabDocumentState(context, documentName, document);
    },

    async onLoadDocument({ documentName, document, context }: any) {
      const loaded = await loadCollabDocumentState(context, documentName);
      // Returning null leaves the freshly-created (empty) document in place —
      // the correct state for a room that has never been edited.
      return loaded ?? document;
    },
  });

  return hocuspocusInstance;
}

/**
 * Attach Hocuspocus to an existing HTTP server for WebSocket upgrades.
 * Handles upgrade requests at the /collab path.
 */
export function attachHocuspocusToServer(httpServer: HttpServer): void {
  const hocuspocus = createHocuspocusServer();

  httpServer.on('upgrade', (request: IncomingMessage, socket: any, head: Buffer) => {
    const url = request.url || '';

    // Only handle /collab WebSocket upgrades. The socket carries no privileges
    // until onAuthenticate above authorizes it against a real document row.
    if (url.startsWith('/collab')) {
      hocuspocus.handleConnection(socket as WebSocket, request, {});
    }
    // Let other upgrade handlers (Socket.io, etc.) handle their own paths
  });

  log.debug('[Hocuspocus] CRDT collaboration server attached at /collab');
}

/** Deterministic color assignment per user ID */
const COLLAB_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#6366F1', '#14B8A6',
];

function getColorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return COLLAB_COLORS[Math.abs(hash) % COLLAB_COLORS.length];
}

export { hocuspocusInstance };
