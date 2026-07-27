/**
 * Security contract (C2C-COLLAB-002 + C2C-COLLAB-003): the Socket.IO server
 * must derive WHO and WHAT from the authenticated socket, and must never
 * publish tenant data outside the sender's organization.
 *
 * Every case below FAILS on the parent commit:
 *
 *  - join-document accepted a client-supplied `user` object as the collaborator
 *    identity and joined `doc_<anything>` with no access check, so any token
 *    holder could impersonate any user on any document id.
 *  - every later event routed on the client-supplied `data.documentId` rather
 *    than the document the socket actually joined.
 *  - unlock-section compared `lock.userId === data.userId` (both client data),
 *    so any socket could release another user's 21 CFR Part 11 section lock.
 *  - a free-form `join-room` handler joined ANY room the caller named, which
 *    defeated join-document authorization entirely.
 *  - eleven task/notification/compliance/timer handlers re-published with the
 *    namespace-global broadcast, reaching every socket in every organization.
 *
 * @compliance 21 CFR Part 11 §11.10(d) — limiting system access to authorized
 *             individuals; §11.10(e) — attributable audit records.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { SignJWT } from 'jose';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { createJourneyDb, type JourneyDb } from './golden-journeys/harness';

// >= 32 chars: server/config/environment.ts enforces a minimum secret length.
const JWT_SECRET = 'socket-tenant-isolation-secret-0727';
process.env.JWT_SECRET = JWT_SECRET;
// Canonical verifyJwtWithRotation reads JWT_SECRET_DEV ?? JWT_SECRET in test env.
process.env.JWT_SECRET_DEV = JWT_SECRET;
// Read at initializeSocketServer() time; an empty allow-list is fine for a
// node client (no Origin header) but be explicit.
process.env.ALLOWED_ORIGINS = 'http://localhost';

const T = 30_000;

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../server/db', () => ({
  get db() {
    return h.db;
  },
  get pool() {
    return h.pool;
  },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));

const ORG_A = 1;
const ORG_B = 2;
const DOC_A1 = 100; // org A
const DOC_A2 = 101; // org A
const DOC_B1 = 200; // org B

const PREREQ = `
  CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
  CREATE TABLE coauthor_documents (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL,
    title TEXT
  );
  INSERT INTO organizations (id, name) VALUES (${ORG_A}, 'org-a'), (${ORG_B}, 'org-b');
  INSERT INTO coauthor_documents (id, organization_id, title) VALUES
    (${DOC_A1}, ${ORG_A}, 'a-one'),
    (${DOC_A2}, ${ORG_A}, 'a-two'),
    (${DOC_B1}, ${ORG_B}, 'b-one');
`;

let jdb: JourneyDb;
let httpServer: HttpServer;
let url: string;
let closeSocketServer: () => void;

async function tokenFor(
  userId: number,
  orgId: number,
  extra: Record<string, unknown> = {},
): Promise<string> {
  return new SignJWT({ userId, id: userId, organizationId: orgId, ...extra })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(JWT_SECRET));
}

const open: ClientSocket[] = [];

function connect(token: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const c = ioClient(url, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      timeout: 5000,
    });
    open.push(c);
    c.on('connect', () => resolve(c));
    c.on('connect_error', err => reject(err));
  });
}

/** Resolve on the first matching event, reject on timeout. */
function waitFor<T = any>(
  c: ClientSocket,
  event: string,
  predicate: (p: T) => boolean = () => true,
  ms = 3000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      c.off(event, handler);
      reject(new Error(`timed out waiting for "${event}"`));
    }, ms);
    const handler = (payload: T) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      c.off(event, handler);
      resolve(payload);
    };
    c.on(event, handler);
  });
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Join a document the way a pre-fix client did — carrying a `user` object. The
 * fixed server ignores it entirely; sending it keeps these cases meaningful
 * against the parent commit, where the join SUCCEEDS under that identity and
 * the assertions then expose the actual vulnerability rather than a payload
 * shape mismatch.
 */
function joinDocument(c: ClientSocket, documentId: number, user: Record<string, unknown>) {
  c.emit('join-document', { documentId: String(documentId), user });
}

/** Collect every collab-error a socket receives. */
function collectErrors(c: ClientSocket): Array<{ event: string; code: string }> {
  const errors: Array<{ event: string; code: string }> = [];
  c.on('collab-error', (e: { event: string; code: string }) => errors.push(e));
  return errors;
}

beforeAll(async () => {
  jdb = await createJourneyDb({ prereqSql: PREREQ, migrations: [] });
  h.db = jdb.db;
  h.pool = jdb.pool;

  const { initializeSocketServer, getSocketServer } = await import('../server/socketServer');

  httpServer = createServer();
  await new Promise<void>(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const addr = httpServer.address() as AddressInfo;
  url = `http://127.0.0.1:${addr.port}`;
  initializeSocketServer(httpServer);
  closeSocketServer = () => getSocketServer()?.close();
}, T);

afterEach(async () => {
  while (open.length) open.pop()!.disconnect();
  // Let the server run its disconnect cleanup (collaborator + lock removal)
  // before the next case seeds new state into the same module-level maps.
  await sleep(60);
});

afterAll(async () => {
  closeSocketServer?.();
  await new Promise<void>(resolve => httpServer?.close(() => resolve()));
  await jdb?.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// C2C-COLLAB-003 — cross-tenant broadcast
// ─────────────────────────────────────────────────────────────────────────────

const TASK_EVENTS: Array<[emit: string, receive: string, payload: unknown]> = [
  ['task-created', 'task-created', { id: 't1', title: 'org-a secret task' }],
  ['task-updated', 'task-updated', { id: 't1', title: 'org-a secret task v2' }],
  ['task-deleted', 'task-deleted', 't1'],
  ['task-escalated', 'task-escalated', { id: 't1', priority: 'critical' }],
  ['batch-update', 'batch-update', { taskIds: ['t1', 't2'], updates: { status: 'done' } }],
  ['user-active', 'user-active', { id: '10', name: 'org-a user', status: 'active' }],
  ['notification-sent', 'notification-received', { id: 'n1', body: 'org-a notification' }],
  ['recurring-task-created', 'recurring-task-created', { id: 'r1', title: 'org-a recurring' }],
  ['compliance-check', 'compliance-update', { finding: 'org-a compliance finding' }],
  ['timer-started', 'timer-started', { taskId: 't1', userId: '10' }],
  ['timer-stopped', 'timer-stopped', { taskId: 't1', userId: '10', duration: 42 }],
];

describe('C2C-COLLAB-003: task/notification/compliance/timer events never cross tenants', () => {
  it('two organizations connected => ZERO cross-tenant receipt across all 11 events, intra-tenant delivery preserved', async () => {
    const a1 = await connect(await tokenFor(10, ORG_A));
    const a2 = await connect(await tokenFor(11, ORG_A));
    const b1 = await connect(await tokenFor(20, ORG_B));

    const crossTenant: string[] = [];
    const intraTenant: string[] = [];
    for (const [, receive] of TASK_EVENTS) {
      b1.on(receive, () => crossTenant.push(receive));
      a2.on(receive, () => intraTenant.push(receive));
    }

    await sleep(50);
    for (const [emit, , payload] of TASK_EVENTS) a1.emit(emit, payload);
    await sleep(400);

    expect(crossTenant).toEqual([]);
    expect(new Set(intraTenant)).toEqual(new Set(TASK_EVENTS.map(([, r]) => r)));
  }, T);
});

// ─────────────────────────────────────────────────────────────────────────────
// C2C-COLLAB-002 — actor spoofing, object binding, lock theft, room smuggling
// ─────────────────────────────────────────────────────────────────────────────

describe('C2C-COLLAB-002: collaboration identity and object binding', () => {
  it('rejects actor spoofing: the collaborator and the edit are attributed to the authenticated user', async () => {
    const observer = await connect(await tokenFor(11, ORG_A));
    joinDocument(observer, DOC_A1, { id: '11', name: 'observer' });
    await waitFor(observer, 'document-state');

    const joined = waitFor<any>(observer, 'collaborator-joined');
    const attacker = await connect(await tokenFor(10, ORG_A));
    joinDocument(attacker, DOC_A1, { id: '999', name: 'CEO', email: 'ceo@victim.example' });

    const joinPayload = await joined;
    expect(joinPayload.collaborator.id).toBe('10');
    expect(joinPayload.collaborator.id).not.toBe('999');
    expect(joinPayload.collaborator.name).not.toBe('CEO');
    expect(joinPayload.activity.userId).toBe('10');

    const updated = waitFor<any>(observer, 'document-updated');
    attacker.emit('document-change', {
      documentId: String(DOC_A1),
      userId: '999',
      userName: 'CEO',
      section: '2.5',
      content: 'forged',
      operation: 'replace',
    });
    const change = await updated;
    expect(change.activity.userId).toBe('10');
    expect(change.activity.userName).not.toBe('CEO');
    expect(change.change.userId).toBe('10');
    expect(change.change.userName).not.toBe('CEO');
  }, T);

  it('rejects lock theft: a non-holder cannot release another user\'s section lock', async () => {
    const holder = await connect(await tokenFor(10, ORG_A));
    joinDocument(holder, DOC_A1, { id: '10', name: 'holder' });
    await waitFor(holder, 'document-state');

    const thief = await connect(await tokenFor(11, ORG_A));
    const thiefErrors = collectErrors(thief);
    joinDocument(thief, DOC_A1, { id: '11', name: 'thief' });
    await waitFor(thief, 'document-state');

    const locked = waitFor<any>(holder, 'section-locked');
    holder.emit('lock-section', {
      documentId: String(DOC_A1),
      sectionId: 'lock-theft-section',
      userId: '10',
      userName: 'holder',
    });
    const lock = await locked;
    expect(lock.lock.userId).toBe('10');

    // The thief supplies the HOLDER's userId — the pre-fix bypass, which
    // compared lock.userId against this client-supplied value.
    let holderSawUnlock = false;
    holder.on('section-unlocked', () => {
      holderSawUnlock = true;
    });
    thief.emit('unlock-section', {
      documentId: String(DOC_A1),
      sectionId: 'lock-theft-section',
      userId: '10',
      userName: 'holder',
    });
    await sleep(250);

    expect(holderSawUnlock).toBe(false);
    expect(thiefErrors.map(e => e.code)).toContain('NOT_LOCK_OWNER');

    // The lock is still held, so the thief cannot take it either.
    const denied = waitFor<any>(thief, 'lock-denied');
    thief.emit('lock-section', {
      documentId: String(DOC_A1),
      sectionId: 'lock-theft-section',
      userId: '11',
      userName: 'thief',
    });
    expect((await denied).sectionId).toBe('lock-theft-section');

    // The real holder can still release its own lock (not a blanket deny).
    const unlocked = waitFor<any>(holder, 'section-unlocked');
    holder.emit('unlock-section', {
      documentId: String(DOC_A1),
      sectionId: 'lock-theft-section',
      userId: '10',
      userName: 'holder',
    });
    expect((await unlocked).sectionId).toBe('lock-theft-section');
  }, T);

  it('rejects events aimed at a document the socket did not join', async () => {
    const victim = await connect(await tokenFor(11, ORG_A));
    joinDocument(victim, DOC_A2, { id: '11', name: 'victim' });
    await waitFor(victim, 'document-state');

    const attacker = await connect(await tokenFor(10, ORG_A));
    const attackerErrors = collectErrors(attacker);
    joinDocument(attacker, DOC_A1, { id: '10', name: 'attacker' });
    await waitFor(attacker, 'document-state');

    let victimSaw = 0;
    victim.on('document-updated', () => {
      victimSaw += 1;
    });
    victim.on('cursor-update', () => {
      victimSaw += 1;
    });

    attacker.emit('document-change', {
      documentId: String(DOC_A2),
      userId: '10',
      userName: 'attacker',
      section: '1.1',
      content: 'cross-document write',
      operation: 'replace',
    });
    attacker.emit('cursor-move', {
      documentId: String(DOC_A2),
      position: { userId: '10', userName: 'attacker', x: 1, y: 2, color: '#fff' },
    });
    await sleep(300);

    expect(victimSaw).toBe(0);
    expect(attackerErrors.map(e => e.code)).toContain('WRONG_DOCUMENT');
  }, T);

  it('rejects joining a document owned by another organization, and an id that does not exist', async () => {
    const attacker = await connect(await tokenFor(10, ORG_A));
    const errors = collectErrors(attacker);
    let stateEvents = 0;
    attacker.on('document-state', () => {
      stateEvents += 1;
    });

    joinDocument(attacker, DOC_B1, { id: '10', name: 'attacker' });
    joinDocument(attacker, 999999, { id: '10', name: 'attacker' });
    await sleep(400);

    expect(stateEvents).toBe(0);
    expect(errors.filter(e => e.code === 'FORBIDDEN')).toHaveLength(2);

    // A document the caller's own organization owns is still permitted.
    joinDocument(attacker, DOC_A1, { id: '10', name: 'attacker' });
    await waitFor(attacker, 'document-state');
    expect(stateEvents).toBe(1);
  }, T);

  it('rejects join-room smuggling into a document room the caller was never authorized for', async () => {
    const member = await connect(await tokenFor(11, ORG_A));
    joinDocument(member, DOC_A2, { id: '11', name: 'member' });
    await waitFor(member, 'document-state');

    const smuggler = await connect(await tokenFor(10, ORG_A));
    const errors = collectErrors(smuggler);
    let roomJoined = false;
    smuggler.on('room-joined', () => {
      roomJoined = true;
    });
    let leaked = 0;
    smuggler.on('document-updated', () => {
      leaked += 1;
    });

    smuggler.emit('join-room', { room: `doc_${DOC_A2}` });
    await sleep(150);

    member.emit('document-change', {
      documentId: String(DOC_A2),
      userId: '11',
      userName: 'member',
      section: '3.1',
      content: 'private content',
      operation: 'insert',
    });
    await sleep(300);

    expect(roomJoined).toBe(false);
    expect(leaked).toBe(0);
    expect(errors.map(e => e.code)).toContain('DISABLED');
  }, T);

  it('refuses collaboration events from a socket that never joined a document', async () => {
    const member = await connect(await tokenFor(11, ORG_A));
    joinDocument(member, DOC_A1, { id: '11', name: 'member' });
    await waitFor(member, 'document-state');
    let commentsSeen = 0;
    member.on('comment-added', () => {
      commentsSeen += 1;
    });

    const stranger = await connect(await tokenFor(10, ORG_A));
    const errors = collectErrors(stranger);
    stranger.emit('add-comment', {
      documentId: String(DOC_A1),
      comment: { documentId: String(DOC_A1), userId: '999', userName: 'CEO', content: 'forged' },
    });
    await sleep(300);

    expect(commentsSeen).toBe(0);
    expect(errors.map(e => e.code)).toContain('NOT_JOINED');
  }, T);
});

describe('handshake fails closed', () => {
  it('rejects a connection with no token', async () => {
    await expect(connect('')).rejects.toBeTruthy();
  }, T);

  it('rejects a token with no organization claim', async () => {
    const noOrg = await new SignJWT({ userId: 10, id: 10 })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(JWT_SECRET));
    await expect(connect(noOrg)).rejects.toBeTruthy();
  }, T);

  it('rejects a refresh token (non-access token class)', async () => {
    await expect(connect(await tokenFor(10, ORG_A, { type: 'refresh' }))).rejects.toBeTruthy();
  }, T);

  it('rejects an MFA-partial token', async () => {
    await expect(connect(await tokenFor(10, ORG_A, { mfaPending: true }))).rejects.toBeTruthy();
  }, T);
});
