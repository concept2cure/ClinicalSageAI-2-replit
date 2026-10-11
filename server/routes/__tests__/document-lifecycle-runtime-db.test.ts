/**
 * The document-lifecycle router reaches the runtime db when it is built without
 * an injected handle, which is how production builds it.
 *
 * `getDb()` resolved the runtime db with `require('../db')`. The package is
 * `"type": "module"`, so `require` is not defined there: every handler that
 * called `getDb()` threw `ReferenceError: require is not defined` after the role
 * gate had already passed, and `wrap()` answered 500 INTERNAL_ERROR. That is why
 * "Send for review" (POST /api/regulatory/documents) failed for every role the
 * gate admits. The sibling suites all inject `db`, so none of them reached the
 * default path.
 *
 * Here the runtime db is a stand-in module and the store helpers are stubbed, so
 * the test asserts only that the handler receives the runtime db and answers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const runtimeDb = vi.hoisted(() => ({ __runtimeDb: true }));

vi.mock('../../db', () => ({ db: runtimeDb, pool: {}, getPool: () => ({}), getDb: () => runtimeDb }));
vi.mock('../../services/regulatory/canonicalDocumentStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/regulatory/canonicalDocumentStore')>()),
  createCanonicalDocument: vi.fn(async () => 'doc-runtime-1'),
  readOutline: vi.fn(async () => [{ id: 'sec-1' }]),
}));

import * as store from '../../services/regulatory/canonicalDocumentStore';
import { createDocumentLifecycleRouter } from '../document-lifecycle';

/** The roles a token carries after authenticateToken's expansion (middleware/auth.ts). */
function app(roles: string[]) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: 4, organizationId: 1, role: roles[0], roles };
    next();
  });
  // No injected db: the production construction.
  a.use('/api/regulatory/documents', createDocumentLifecycleRouter());
  return a;
}

const NEW_DOCUMENT = { title: 'Vorelinib DS specification', documentType: 'ind' };

describe('POST /api/regulatory/documents with the runtime db (no injected handle)', () => {
  beforeEach(() => {
    vi.mocked(store.createCanonicalDocument).mockClear();
    vi.mocked(store.readOutline).mockClear();
  });

  it('a member (regulatory-author) creates the record through the runtime db, not a 500', async () => {
    const r = await request(app(['member', 'regulatory-author'])).post('/api/regulatory/documents').send(NEW_DOCUMENT);
    expect(r.body).not.toMatchObject({ error: 'INTERNAL_ERROR' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ ok: true, canonicalId: 'doc-runtime-1', sectionCount: 1 });
    expect(store.createCanonicalDocument).toHaveBeenCalledWith(
      runtimeDb,
      expect.objectContaining({ organizationId: 1, createdBy: 4, title: NEW_DOCUMENT.title }),
    );
  });

  it('a manager (regulatory-author) reaches the runtime db the same way', async () => {
    const r = await request(app(['manager', 'regulatory-author'])).post('/api/regulatory/documents').send(NEW_DOCUMENT);
    expect(r.status).toBe(201);
    expect(store.createCanonicalDocument).toHaveBeenCalledWith(runtimeDb, expect.any(Object));
  });

  it('a viewer is still refused by the role gate before any store call', async () => {
    const r = await request(app(['viewer'])).post('/api/regulatory/documents').send(NEW_DOCUMENT);
    expect(r.status).toBe(403);
    expect(store.createCanonicalDocument).not.toHaveBeenCalled();
  });
});
