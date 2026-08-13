/**
 * Hocuspocus Server — Y.js CRDT WebSocket backend for real-time collaboration.
 *
 * Serves WebSocket upgrades at /collab. Provides conflict-free real-time
 * editing via Y.js, multi-cursor awareness, durable per-tenant document state,
 * and per-document authorization.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE USED TO CLAIM, AND WHAT WAS ACTUALLY TRUE
 *
 * The header claimed "Document persistence to PostgreSQL", "JWT-based
 * authentication" and "Room isolation per artifact". Read against the code:
 *
 *  1. TRANSPORT — `attachHocuspocusToServer` passed the raw `net.Socket` from
 *     the HTTP 'upgrade' event straight to `handleConnection`, which requires
 *     an already-handshaken `ws.WebSocket`. No 101 response was ever written,
 *     so no browser WebSocket ever opened; hocuspocus then called `.ping()`,
 *     `.readyState` and `removeListener('pong')` on an object with none of
 *     those semantics. **Not one connection had ever been established.** The
 *     break went unnoticed because nothing imports `@hocuspocus/provider` —
 *     the authoring surface uses the REST presence/locking service instead and
 *     says so.
 *
 *  2. PERSISTENCE — `onStoreDocument` wrote a log line and returned;
 *     `onLoadDocument` returned the in-memory Y.Doc it was handed. Nothing was
 *     written, nothing restored. Not "persistence not yet verified": no
 *     persistence existed.
 *
 *  3. AUTHORIZATION — `documentName` was accepted verbatim and never checked
 *     against anything. Any authenticated user could open any document.
 *
 *  4. TOKEN CLASS — the signature was verified but the token's class was not,
 *     so a refresh / MFA-challenge / MFA-partial token authenticated a
 *     collaborator. The HTTP path rejects those via `nonAccessTokenReason`;
 *     this path did not, which is exactly the MFA bypass that guard exists to
 *     prevent.
 *
 *  5. MEMBERSHIP — the org claim was trusted for the token's whole TTL. Worse
 *     here than on HTTP: a WebSocket is long-lived, so a revoked user kept
 *     write access for as long as the socket stayed open, not merely until the
 *     next request.
 *
 *  6. DEV IDENTITIES — a missing token produced an "Anonymous" user and, more
 *     dangerously, a token that FAILED verification fell through to a "Dev
 *     User" identity. Both were keyed on `NODE_ENV !== 'production'`, and
 *     staging runs `NODE_ENV=staging` (see ENV_SUFFIX_MAP in
 *     server/utils/jwtVerify.ts). Staging accepted anonymous collaborators and
 *     silently upgraded forged tokens to a working identity.
 *
 * All six are fixed below. `authenticateToken` set the precedent for the last
 * one: "Dev auto-auth removed. All requests must provide a valid JWT. To test
 * locally, create a user via POST /api/auth/signup then login normally."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FLAG
 *
 * Off by default behind ENABLE_COLLAB_CRDT. No client opens a /collab socket
 * today, and an unused WebSocket endpoint on the public HTTP server is
 * attack surface with no user. Flag off ⇒ not attached at all, so an upgrade
 * request is refused rather than half-served — the same posture as
 * ENABLE_CLINICAL_REGULATORY_GRAPH.
 */

import { Hocuspocus } from '@hocuspocus/server';
import type { IncomingMessage, Server as HttpServer } from 'http';
import type { Duplex } from 'stream';
import { WebSocketServer, type WebSocket } from 'ws';
import * as Y from 'yjs';
import { createScopedLogger } from '../utils/logger.js';
import { verifyJwtWithRotation } from '../utils/jwtVerify.js';
import { nonAccessTokenReason } from '../middleware/tokenType';
import { checkOrgMembership, parseFiniteInt } from '../middleware/orgMembership';
import { getTenantAccessPosture } from './tenant/tenant-lifecycle';
import {
  authoringDocIdOf,
  authorizeResource,
  parseDocumentName,
  type CollabResource,
} from './collab/collab-authorization';
import { loadCollabState, storeCollabState } from './collab/collab-state.store';

const log = createScopedLogger('hocuspocus');

let hocuspocusInstance: Hocuspocus | null = null;
let webSocketServer: WebSocketServer | null = null;

/** True when the collaboration socket is switched on for this process. */
export function isCollabEnabled(): boolean {
  return process.env.ENABLE_COLLAB_CRDT === 'true';
}

/**
 * The context every post-authentication hook receives. It is exactly what
 * `onAuthenticate` returns — hocuspocus merges the returned object into the
 * per-document hook payload's `context`.
 *
 * `tenantId` here is not the caller's claim: it is the tenant the document was
 * proven to belong to, established by the authorization query.
 */
interface CollabContext {
  user: { id: string; name: string; email: string; color: string };
  tenantId: number;
  resource: CollabResource;
}

/** Shape hocuspocus turns into a `permission-denied` message for the client. */
function denied(reason: string): Error & { reason: string } {
  return Object.assign(new Error(reason), { reason });
}

function readContext(raw: unknown): CollabContext | null {
  const ctx = raw as Partial<CollabContext> | undefined;
  if (!ctx || typeof ctx.tenantId !== 'number' || !ctx.resource) return null;
  return ctx as CollabContext;
}

interface CollabTokenClaims {
  userId?: string | number;
  sub?: string | number;
  id?: string | number;
  name?: string;
  username?: string;
  email?: string;
  organizationId?: string | number;
  orgId?: string | number;
  type?: string;
  role?: string | null;
  mfaPending?: boolean;
}

/**
 * Step 6 extracted: apply the tenant lifecycle posture to a collaboration
 * connection. Throws to refuse; mutates `connectionConfig.readOnly` to downgrade.
 *
 * Lives outside `authenticateCollabConnection` so that function stays within the
 * complexity budget — it is already a six-gate security boundary and each gate
 * deserves to stay readable.
 */
async function applyTenantPostureToSocket(
  organizationId: number,
  documentName: string,
  connectionConfig?: { readOnly: boolean }
): Promise<void> {
  const posture = await getTenantAccessPosture(organizationId);
  if (!posture) {
    log.warn('Refused collaboration — tenant posture unverifiable (fail-closed)', {
      documentName,
      organizationId,
    });
    throw denied('tenant-state-unverified');
  }
  if (posture.decision === 'deny') {
    log.warn('Refused collaboration — tenant lifecycle posture denies access', {
      documentName,
      organizationId,
      state: posture.state,
    });
    throw denied('tenant-suspended');
  }
  if (posture.decision !== 'read_only') return;

  if (!connectionConfig) {
    log.warn('Refused collaboration — read-only tenant and no way to downgrade the socket', {
      documentName,
      organizationId,
      state: posture.state,
    });
    throw denied('tenant-read-only');
  }
  connectionConfig.readOnly = true;
  log.info('Collaboration downgraded to read-only by tenant lifecycle posture', {
    documentName,
    organizationId,
    state: posture.state,
  });
}

/**
 * Authenticate one client for one document.
 *
 * Every rejection is a throw, because hocuspocus turns a thrown error into a
 * permission-denied message for that document and leaves the rest of the
 * connection alone. Reasons are coarse on purpose — a client learns that it
 * may not open the document, not whether the document exists.
 *
 * Exported for tests: this is the security boundary of the whole subsystem and
 * deserves direct coverage rather than coverage through a live socket.
 */
export async function authenticateCollabConnection({
  token,
  documentName,
  connectionConfig,
}: {
  token: string;
  documentName: string;
  /**
   * Hocuspocus's per-connection config. Setting `readOnly` here downgrades the
   * socket to view-only instead of refusing it outright — see step 6.
   * Optional so the existing direct-call tests need no fixture change.
   */
  connectionConfig?: { readOnly: boolean };
}): Promise<CollabContext> {
  // 1. The requested resource must be one we know how to authorize. Parsing
  //    first means an unknown or malformed name never reaches Postgres.
  const resource = parseDocumentName(documentName);
  if (!resource) {
    log.warn('Refused collaboration for an unrecognised documentName', { documentName });
    throw denied('unknown-document');
  }

  if (!token) throw denied('authentication-required');

  // 2. Signature and expiry. No fallback identity on failure, in any
  //    environment: an unverifiable token is not a user.
  let payload: CollabTokenClaims;
  try {
    payload = verifyJwtWithRotation<CollabTokenClaims>(token);
  } catch {
    throw denied('invalid-token');
  }

  // 3. Token class. Refresh / MFA-challenge / MFA-partial tokens are signed
  //    with the same secret as access tokens and must never open a session.
  const nonAccess = nonAccessTokenReason(payload);
  if (nonAccess) {
    log.warn('Refused collaboration for a non-access token', { documentName, nonAccess });
    throw denied('invalid-token-class');
  }

  const subject = String(payload.userId ?? payload.sub ?? payload.id ?? '');
  if (!subject) throw denied('invalid-token');

  // 4. Tenant. A collaboration socket is inherently tenant-scoped — there is
  //    no "platform-level" document to open — so unlike the HTTP path a token
  //    without a usable org claim is refused rather than passed through.
  const organizationId = parseFiniteInt(payload.organizationId ?? payload.orgId);
  const userId = parseFiniteInt(subject);
  if (organizationId === null) throw denied('no-tenant');

  // 5. Live membership. A socket outlives the request that opened it, so the
  //    claim minted at login is re-checked against the same cache the HTTP
  //    middleware uses — a user removed from the org cannot ride an old token
  //    into a long-lived editing session.
  //
  //    'indeterminate' (database unreachable) is NOT waved through here the
  //    way it is on HTTP. It does not need to be: step 6 needs the same
  //    database and fails closed, so a database outage already means no new
  //    collaboration. Refusing here just makes that explicit.
  if (userId !== null) {
    const membership = await checkOrgMembership(userId, organizationId);
    if (membership !== 'member') {
      log.warn('Refused collaboration — organization membership not confirmed', {
        documentName,
        userId,
        organizationId,
        membership,
      });
      throw denied('membership-revoked');
    }
  }

  // 6. Tenant lifecycle. The socket is a separate TRANSPORT, so the HTTP
  //    lifecycle guard (middleware/tenantLifecycleGuard.ts) never runs for it —
  //    and this is a pure WRITE channel: real-time document editing. Without
  //    this check a suspended organization's users kept editing documents in
  //    real time while every HTTP route refused them, which is the worst
  //    possible split for a control whose whole job is to stop a suspended
  //    tenant working.
  //
  //    `read_only` DOWNGRADES rather than refuses. A past-due tenant retains
  //    read access to its own regulatory record on HTTP by design; refusing the
  //    socket outright would make documents that are readable over one transport
  //    unreadable over the other, for no benefit. Hocuspocus enforces
  //    `connectionConfig.readOnly` for us. Where the caller supplies no
  //    connectionConfig (the direct-call tests), a read-only posture refuses —
  //    failing closed rather than silently granting write access.
  await applyTenantPostureToSocket(organizationId, documentName, connectionConfig);

  // 7. The document itself. Fails closed on anything unverifiable.
  const authorization = await authorizeResource(resource, organizationId);
  if (authorization !== 'authorized') {
    log.warn('Refused collaboration — document not authorized for this tenant', {
      documentName,
      organizationId,
      authorization,
    });
    throw denied('forbidden-document');
  }

  return {
    user: {
      id: subject,
      name: payload.name || payload.username || 'User',
      email: payload.email || '',
      color: getColorForUser(subject),
    },
    tenantId: organizationId,
    resource,
  };
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

    onAuthenticate: authenticateCollabConnection,

    async onConnect({ documentName }: { documentName: string }) {
      log.debug(`[Hocuspocus] User connected to document: ${documentName}`);
    },

    async onDisconnect({ documentName }: { documentName: string }) {
      log.debug(`[Hocuspocus] User disconnected from document: ${documentName}`);
    },

    /**
     * Restore persisted state onto the fresh Y.Doc hocuspocus created.
     *
     * Returning the document unchanged — the previous behaviour — is what a
     * brand-new document looks like, so a failure to load was indistinguishable
     * from "nobody has edited this yet". A load error therefore throws: a
     * client that cannot be given the document's real state must be refused,
     * not handed a blank one it will then happily overwrite.
     */
    async onLoadDocument({ documentName, document, context }: any) {
      const ctx = readContext(context);
      if (!ctx) throw denied('unauthenticated-load');

      const result = await loadCollabState(ctx.tenantId, documentName);
      if (result.status === 'missing') {
        throw denied('collab-store-unavailable');
      }
      if (result.status === 'found') {
        Y.applyUpdate(document, new Uint8Array(result.document.state));
        log.debug('[Hocuspocus] Restored persisted state', {
          documentName,
          sizeBytes: result.document.sizeBytes,
        });
      }
      return document;
    },

    /**
     * Persist the document. Hocuspocus debounces this (2s, 10s max) and calls
     * it once more when the last client disconnects, so the store sees edit
     * bursts as a handful of writes rather than one per keystroke.
     */
    async onStoreDocument({ documentName, document, context }: any) {
      const ctx = readContext(context);
      if (!ctx) {
        log.error('[Hocuspocus] Refusing to store a document with no authenticated context', {
          documentName,
        });
        return;
      }

      const state = Buffer.from(Y.encodeStateAsUpdate(document));
      const stateVector = Buffer.from(Y.encodeStateVector(document));
      const result = await storeCollabState({
        tenantId: ctx.tenantId,
        documentName,
        state,
        stateVector,
        authoringDocId: authoringDocIdOf(ctx.resource),
        updatedBy: ctx.user.id,
      });

      if (result.status === 'stored') {
        log.debug('[Hocuspocus] Stored document state', {
          documentName,
          sizeBytes: state.byteLength,
        });
      }
    },
  });

  return hocuspocusInstance;
}

/**
 * Attach Hocuspocus to an existing HTTP server for WebSocket upgrades at
 * /collab. No-op unless ENABLE_COLLAB_CRDT is on.
 *
 * The upgrade must be completed by a real WebSocket server before hocuspocus
 * sees it. `handleConnection` takes a handshaken `ws.WebSocket` — it calls
 * `.ping()`, reads `.readyState` against ws's numeric constants, and subscribes
 * to 'message' and 'pong'. Handing it the raw `net.Socket` from the 'upgrade'
 * event (the previous behaviour) skipped the handshake entirely: the client
 * never received its 101 and the connection could not exist. `noServer: true`
 * plus an explicit `handleUpgrade` is the composition ws documents for sharing
 * one HTTP server across several upgrade paths, which this server does —
 * Socket.io owns its own.
 */
export function attachHocuspocusToServer(httpServer: HttpServer): void {
  if (!isCollabEnabled()) {
    log.debug('[Hocuspocus] CRDT collaboration disabled (ENABLE_COLLAB_CRDT is not "true")');
    return;
  }

  const hocuspocus = createHocuspocusServer();
  const wss = new WebSocketServer({ noServer: true });
  webSocketServer = wss;

  wss.on('connection', (socket: WebSocket, request: IncomingMessage) => {
    // ws throws on an unhandled 'error' and would take the process with it.
    socket.on('error', err => {
      log.warn('[Hocuspocus] WebSocket error', { error: err.message });
    });
    hocuspocus.handleConnection(socket, request, {});
  });

  httpServer.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    // Only /collab is ours. Every other path belongs to another upgrade
    // handler on the same server, so it must be left untouched rather than
    // destroyed — destroying it here would break Socket.io.
    if (!(request.url || '').startsWith('/collab')) return;

    wss.handleUpgrade(request, socket, head, ws => {
      wss.emit('connection', ws, request);
    });
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

export { hocuspocusInstance, webSocketServer };
