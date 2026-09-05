/**
 * Part 11 + tenant contract test — document attachments.
 *
 * ── The defect ───────────────────────────────────────────────────────────
 * ModuleIntegrationService.addDocumentAttachment and removeDocumentAttachment
 * wrote `attachment_added` / `attachment_removed` into document_audit_logs and
 * never touched document_attachments. The insert and the delete were comments:
 *
 *     async addDocumentAttachment(documentId, attachmentData, userId) {
 *       return this.db.transaction(async (tx) => {
 *         // Add the attachment          <-- no insert
 *         await tx.insert(documentAuditLogs).values({ action: 'attachment_added', ... });
 *       });
 *     }
 *
 * Anything reading that trail — a reviewer, an inspector, an export — would be
 * told a file was attached to a regulated document when no row existed. The
 * table had no writer anywhere in the codebase, and no reader either, which is
 * why the writerless-stores ratchet (which scans tables that ARE read) did not
 * surface it.
 *
 * Both methods also took no organization. document_attachments carries no
 * organization_id of its own — it reaches a tenant only through
 * document_id -> unified_documents.organizationId — and neither table is
 * RLS-protected, so that walk is the only tenant boundary available.
 *
 * ── What is asserted ───────────────────────────────────────────────────
 * That the audit trail and the world agree. Every case below either proves an
 * audit row is accompanied by the act it claims, or proves that when the act
 * does not happen, no audit row is written.
 *
 * The fake database honours the WHERE it is handed and mutates its own rows, so
 * "was it really deleted" is a question this test can actually ask.
 */

import { describe, it, expect, beforeEach } from 'vitest';

const DRIZZLE_NAME = Symbol.for('drizzle:Name');
const tableName = (table: unknown): string => (table as any)?.[DRIZZLE_NAME] ?? '';

const DOCUMENTS = 'unified_documents';
const ATTACHMENTS = 'document_attachments';
const AUDIT = 'document_audit_logs';

const ORG_A = 7;
const ORG_B = 991;
const DOC_A = 100;
const DOC_B = 200;
const ATTACHMENT_ID = 900;
const OLDER_ATTACHMENT_ID = 899;
const FOREIGN_ATTACHMENT_ID = 950;

/** Storage-provider version ids (randomUUIDs), as put() would return them. */
const VERSION_NEW = '7d5a2c1e-4f6b-4a8d-9c3e-1b2a3c4d5e6f';
const VERSION_EXISTING = '0a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d';
const VERSION_OLDER = '11111111-2222-4333-8444-555555555555';
const VERSION_FOREIGN = '99999999-8888-4777-8666-555555555555';

/** A valid attachment payload; individual tests spread and override. */
const validAttachment = () => ({
  fileName: 'stability-summary.pdf',
  fileType: 'application/pdf',
  fileSize: 20_480,
  filePath: VERSION_NEW,
  description: 'ICH Q1A stability summary',
});

/** Column -> drizzle field, for the predicates this fake models. */
const COLUMN_TO_FIELD: Record<string, string> = {
  id: 'id',
  organization_id: 'organizationId',
  document_id: 'documentId',
  uploaded_at: 'uploadedAt',
};

type SortKey = { field: string; dir: 'asc' | 'desc' };

/**
 * Column + direction for each drizzle ORDER BY clause. `desc(col)` walks to
 * [StringChunk(''), col, StringChunk(' desc')] — verified against drizzle
 * directly — so the direction lives in a StringChunk's `value` array.
 */
function readOrderBy(clauses: any[]): SortKey[] {
  return clauses.flatMap(clause => {
    let column: string | undefined;
    let dir: 'asc' | 'desc' = 'asc';
    const walk = (node: any) => {
      if (!node || typeof node !== 'object') return;
      if (typeof node.name === 'string' && node.table) column ??= node.name;
      if (Array.isArray(node.value) && node.value.some((v: unknown) => /\bdesc\b/i.test(String(v)))) {
        dir = 'desc';
      }
      for (const chunk of node.queryChunks ?? []) walk(chunk);
    };
    walk(clause);
    const field = column ? COLUMN_TO_FIELD[column] : undefined;
    return field ? [{ field, dir }] : [];
  });
}

/** Ordered (column, param) pairs from a drizzle condition; see the sibling
 *  workflow-templates contract test for why pairing is positional-adjacent. */
function readEqualities(condition: any): Record<string, unknown> {
  const tokens: Array<{ kind: 'col' | 'param'; value: unknown }> = [];
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.name === 'string' && node.table) tokens.push({ kind: 'col', value: node.name });
    else if ('value' in node && node.encoder) tokens.push({ kind: 'param', value: node.value });
    for (const chunk of node.queryChunks ?? []) walk(chunk);
  };
  walk(condition);
  const out: Record<string, unknown> = {};
  for (let i = 0; i < tokens.length - 1; i += 1) {
    if (tokens[i].kind === 'col' && tokens[i + 1].kind === 'param') {
      out[tokens[i].value as string] = tokens[i + 1].value;
    }
  }
  return out;
}

const matches = (row: any, filter: Record<string, unknown>) =>
  Object.entries(filter).every(([col, value]) => {
    const field = COLUMN_TO_FIELD[col];
    return field ? row[field] === value : true;
  });

/** Apply the ORDER BY the service emitted, so "newest first" is a behavioural
 *  assertion rather than a comment. Dates compare by epoch. */
function sortRows(rows: any[], order: SortKey[]): any[] {
  const key = (v: any) => (v instanceof Date ? v.getTime() : v);
  return rows.sort((a, b) => {
    for (const { field, dir } of order) {
      const av = key(a[field]);
      const bv = key(b[field]);
      if (av === bv) continue;
      return (av < bv ? -1 : 1) * (dir === 'desc' ? -1 : 1);
    }
    return 0;
  });
}

/**
 * Two documents in two different tenancies; two attachments on DOC_A (the
 * OLDER one listed first, so newest-first ordering is load-bearing) and one on
 * DOC_B.
 */
function fixtureRows(): Record<string, any[]> {
  return {
    [DOCUMENTS]: [
      { id: DOC_A, organizationId: ORG_A, title: 'ACME-401 IB', latestVersion: 1 },
      { id: DOC_B, organizationId: ORG_B, title: 'Sponsor B protocol', latestVersion: 1 },
    ],
    [ATTACHMENTS]: [
      {
        id: OLDER_ATTACHMENT_ID,
        documentId: DOC_A,
        fileName: 'older.pdf',
        fileType: 'application/pdf',
        fileSize: 5,
        filePath: VERSION_OLDER,
        uploadedBy: 'user-a',
        uploadedAt: new Date('2026-08-01T10:00:00Z'),
      },
      {
        id: ATTACHMENT_ID,
        documentId: DOC_A,
        fileName: 'existing.pdf',
        fileType: 'application/pdf',
        fileSize: 10,
        filePath: VERSION_EXISTING,
        uploadedBy: 'user-a',
        uploadedAt: new Date('2026-08-02T10:00:00Z'),
      },
      {
        id: FOREIGN_ATTACHMENT_ID,
        documentId: DOC_B,
        fileName: 'sponsor-b-secret.pdf',
        fileType: 'application/pdf',
        fileSize: 7,
        filePath: VERSION_FOREIGN,
        uploadedBy: 'user-b',
        uploadedAt: new Date('2026-08-03T10:00:00Z'),
      },
    ],
    [AUDIT]: [],
  };
}

interface Store {
  rows: Record<string, any[]>;
  nextId: () => number;
}

/** A thenable select that honours WHERE and ORDER BY against the store. */
function selectBuilder(store: Store) {
  let table = '';
  let filter: Record<string, unknown> = {};
  let order: SortKey[] = [];
  const q: any = {
    from(t: unknown) { table = tableName(t); return q; },
    where(c: any) { filter = readEqualities(c); return q; },
    limit() { return q; },
    orderBy(...clauses: any[]) { order = readOrderBy(clauses); return q; },
    then(res: any, rej: any) {
      const out = (store.rows[table] ?? []).filter(r => matches(r, filter));
      return Promise.resolve(sortRows(out, order)).then(res, rej);
    },
  };
  return q;
}

/** An insert that really appends to the store and returns the new row. */
function insertBuilder(store: Store, t: unknown) {
  const table = tableName(t);
  let values: any;
  const settle = () => {
    const row = { id: store.nextId(), ...(values ?? {}) };
    (store.rows[table] ??= []).push(row);
    return [row];
  };
  const q: any = {
    values(v: any) { values = v; return q; },
    returning() { return Promise.resolve(settle()); },
    then(res: any, rej: any) { return Promise.resolve(settle()).then(res, rej); },
  };
  return q;
}

/** A delete that really removes from the store, so a second delete finds nothing. */
function deleteBuilder(store: Store, t: unknown) {
  const table = tableName(t);
  let filter: Record<string, unknown> = {};
  const settle = () => {
    const target = store.rows[table] ?? [];
    const removed = target.filter(r => matches(r, filter));
    store.rows[table] = target.filter(r => !matches(r, filter));
    return removed;
  };
  const q: any = {
    where(c: any) { filter = readEqualities(c); return q; },
    returning() { return Promise.resolve(settle()); },
    then(res: any, rej: any) { return Promise.resolve(settle()).then(res, rej); },
  };
  return q;
}

function makeFakeDb() {
  let nextId = 5000;
  const store: Store = { rows: fixtureRows(), nextId: () => (nextId += 1) };

  const handle: any = {
    select: () => selectBuilder(store),
    insert: (t: unknown) => insertBuilder(store, t),
    update: () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }),
    delete: (t: unknown) => deleteBuilder(store, t),
    transaction: (fn: any) => fn(handle),
  };

  return {
    db: handle,
    attachments: () => store.rows[ATTACHMENTS],
    auditRows: () => store.rows[AUDIT],
    auditActions: () => store.rows[AUDIT].map(r => r.action),
  };
}

let ModuleIntegrationService: any;
let DocumentAttachmentService: any;

beforeEach(async () => {
  const mod = await import('../../services/ModuleIntegrationService');
  ModuleIntegrationService = mod.ModuleIntegrationService;
  DocumentAttachmentService = (
    await import('../../services/module-integration/attachment-service')
  ).DocumentAttachmentService;
});

describe('Attachments — the audit trail matches what happened', () => {
  it('actually stores the attachment it audits', async () => {
    const fake = makeFakeDb();
    const service = new DocumentAttachmentService(fake.db);

    const before = fake.attachments().length;
    const stored = await service.add(DOC_A, validAttachment(), 'user-a', ORG_A);

    // The decisive assertion: a row exists, not merely an audit entry saying so.
    expect(fake.attachments().length).toBe(before + 1);
    expect(stored.fileName).toBe('stability-summary.pdf');
    expect(stored.documentId).toBe(DOC_A);
    expect(stored.uploadedBy).toBe('user-a');

    expect(fake.auditActions()).toEqual(['attachment_added']);
    // The audit carries the id the insert produced, not one that was requested.
    expect(fake.auditRows()[0].details.attachmentId).toBe(stored.id);
  });

  it('actually removes the attachment it audits', async () => {
    const fake = makeFakeDb();
    const service = new DocumentAttachmentService(fake.db);

    const removed = await service.remove(
      DOC_A, ATTACHMENT_ID, 'user-a', ORG_A,
    );

    expect(removed.id).toBe(ATTACHMENT_ID);
    expect(fake.attachments().find((a: any) => a.id === ATTACHMENT_ID)).toBeUndefined();
    expect(fake.auditActions()).toEqual(['attachment_removed']);
  });

  it('does not record a removal when nothing was removed', async () => {
    const fake = makeFakeDb();
    const service = new DocumentAttachmentService(fake.db);

    await expect(
      service.remove(DOC_A, 123456, 'user-a', ORG_A),
    ).rejects.toThrow(/not found/i);

    expect(fake.auditActions()).toEqual([]);
  });

  it('will not remove an attachment through a document it does not belong to', async () => {
    const fake = makeFakeDb();
    const service = new DocumentAttachmentService(fake.db);

    // ATTACHMENT_ID hangs off DOC_A. Ask for it via DOC_B — which ORG_B owns,
    // so the ownership check passes and only the id/document pairing stops it.
    await expect(
      service.remove(DOC_B, ATTACHMENT_ID, 'user-b', ORG_B),
    ).rejects.toThrow(/not found/i);

    expect(fake.attachments().find((a: any) => a.id === ATTACHMENT_ID)).toBeDefined();
    expect(fake.auditActions()).toEqual([]);
  });
});

describe('Attachments — tenant scoping', () => {
  it('refuses to attach to another organization\'s document, and writes nothing', async () => {
    const fake = makeFakeDb();
    const service = new DocumentAttachmentService(fake.db);

    await expect(
      service.add(DOC_A, validAttachment(), 'user-b', ORG_B),
    ).rejects.toThrow(/not found/i);

    expect(fake.attachments().map((a: any) => a.id).sort()).toEqual(
      [OLDER_ATTACHMENT_ID, ATTACHMENT_ID, FOREIGN_ATTACHMENT_ID].sort(),
    );
    expect(fake.auditActions()).toEqual([]);
  });

  it('refuses to remove from another organization\'s document, and writes nothing', async () => {
    const fake = makeFakeDb();
    const service = new DocumentAttachmentService(fake.db);

    await expect(
      service.remove(DOC_A, ATTACHMENT_ID, 'user-b', ORG_B),
    ).rejects.toThrow(/not found/i);

    expect(fake.attachments().find((a: any) => a.id === ATTACHMENT_ID)).toBeDefined();
    expect(fake.auditActions()).toEqual([]);
  });

  it('fails closed when the caller has no organization', async () => {
    const fake = makeFakeDb();
    const service = new DocumentAttachmentService(fake.db);

    for (const org of [null, undefined, '', 'not-a-number', 0, -1]) {
      await expect(
        service.add(DOC_A, validAttachment(), 'user-a', org),
      ).rejects.toThrow(/organization context/i);
      await expect(
        service.remove(DOC_A, ATTACHMENT_ID, 'user-a', org),
      ).rejects.toThrow(/organization context/i);
    }
    expect(fake.auditActions()).toEqual([]);
  });
});

describe('Attachments — the record is validated at the boundary', () => {
  const cases: Array<[string, Record<string, unknown>, RegExp]> = [
    ['a missing fileName', { fileName: undefined }, /fileName is required/i],
    ['a fileName that is really a path', { fileName: '../../etc/passwd' }, /file name, not a path/i],
    ['a fileName with a separator', { fileName: 'nested/report.pdf' }, /file name, not a path/i],
    ['a missing fileType', { fileType: '' }, /fileType is required/i],
    ['a filesystem path as filePath', { filePath: 'uploads/org-7/file.pdf' }, /storage version id/i],
    ['a traversal path as filePath', { filePath: '../../etc/passwd' }, /storage version id/i],
    ['a non-UUID token as filePath', { filePath: 'not-a-version-id' }, /storage version id/i],
    ['a negative fileSize', { fileSize: -1 }, /non-negative integer/i],
    ['a non-integer fileSize', { fileSize: 1.5 }, /non-negative integer/i],
    ['a fileSize past the column width', { fileSize: 2_147_483_648 }, /exceeds the maximum/i],
    ['an executable', { fileName: 'payload.exe', fileType: 'application/octet-stream' }, /unsupported file type/i],
  ];

  for (const [label, override, expected] of cases) {
    it(`rejects ${label} without writing anything`, async () => {
      const fake = makeFakeDb();
      const service = new DocumentAttachmentService(fake.db);

      await expect(
        service.add(DOC_A, { ...validAttachment(), ...override }, 'user-a', ORG_A),
      ).rejects.toThrow(expected);

      expect(fake.attachments()).toHaveLength(3); // fixture untouched
      expect(fake.auditActions()).toEqual([]);
    });
  }

  it('rejects a missing payload entirely', async () => {
    const fake = makeFakeDb();
    const service = new DocumentAttachmentService(fake.db);

    await expect(
      service.add(DOC_A, null, 'user-a', ORG_A),
    ).rejects.toThrow(/attachment data is required/i);
    expect(fake.auditActions()).toEqual([]);
  });

  it('accepts an allowed non-PDF and defaults the optional columns', async () => {
    const fake = makeFakeDb();
    const service = new DocumentAttachmentService(fake.db);

    const stored = await service.add(
      DOC_A,
      { fileName: 'dataset.csv', fileType: 'text/csv', fileSize: 12, filePath: VERSION_NEW },
      'user-a',
      ORG_A,
    );

    expect(stored.fileName).toBe('dataset.csv');
    expect(stored.description).toBeNull();
    expect(stored.metadata).toEqual({});
  });
});

describe('Attachments — the reader', () => {
  it('lists an owned document\'s attachments, newest first', async () => {
    const fake = makeFakeDb();
    const service = new DocumentAttachmentService(fake.db);

    const listed = await service.list(DOC_A, ORG_A);

    expect(listed.map((a: any) => a.id)).toEqual([ATTACHMENT_ID, OLDER_ATTACHMENT_ID]);
    // Nothing from DOC_B, which belongs to ORG_B.
    expect(listed.find((a: any) => a.id === FOREIGN_ATTACHMENT_ID)).toBeUndefined();
  });

  it('surfaces attachments on the existing document read', async () => {
    const fake = makeFakeDb();
    const documents = new ModuleIntegrationService(fake.db);

    // GET /api/module-integration/document/:id already exists and is already
    // org-scoped; this is how a caller actually reaches the reader.
    const doc = await documents.getDocument(DOC_A, ORG_A);

    expect(doc.id).toBe(DOC_A);
    expect(doc.attachments.map((a: any) => a.id)).toEqual([ATTACHMENT_ID, OLDER_ATTACHMENT_ID]);
  });

  it('does not list another organization\'s attachments', async () => {
    const fake = makeFakeDb();
    const service = new DocumentAttachmentService(fake.db);

    // DOC_B is ORG_B's. Asking as ORG_A must not reveal that it has an
    // attachment — same "not found" as a document that does not exist.
    await expect(service.list(DOC_B, ORG_A)).rejects.toThrow(/not found/i);
    await expect(
      new ModuleIntegrationService(fake.db).getDocument(DOC_B, ORG_A),
    ).rejects.toThrow(/not found/i);
  });

  it('fails closed when the caller has no organization', async () => {
    const fake = makeFakeDb();
    const service = new DocumentAttachmentService(fake.db);

    for (const org of [null, undefined, '', 'x', 0]) {
      await expect(service.list(DOC_A, org)).rejects.toThrow(
        /organization context/i,
      );
    }
  });

  it('agrees with the writers: an added attachment appears, a removed one disappears', async () => {
    const fake = makeFakeDb();
    const service = new DocumentAttachmentService(fake.db);

    const stored = await service.add(
      DOC_A,
      { ...validAttachment(), fileName: 'newest.pdf' },
      'user-a',
      ORG_A,
    );
    let listed = await service.list(DOC_A, ORG_A);
    expect(listed.map((a: any) => a.id)).toContain(stored.id);

    await service.remove(DOC_A, ATTACHMENT_ID, 'user-a', ORG_A);
    listed = await service.list(DOC_A, ORG_A);
    expect(listed.map((a: any) => a.id)).not.toContain(ATTACHMENT_ID);
    expect(listed.map((a: any) => a.id)).toContain(stored.id);
  });
});

describe('Attachments — the single-row reader a download needs', () => {
  it('returns an owned attachment by document and id', async () => {
    const fake = makeFakeDb();
    const service = new DocumentAttachmentService(fake.db);

    const row = await service.get(DOC_A, ATTACHMENT_ID, ORG_A);
    expect(row.id).toBe(ATTACHMENT_ID);
    expect(row.filePath).toBe(VERSION_EXISTING);
  });

  it('cannot reach an attachment through a document it does not belong to', async () => {
    const fake = makeFakeDb();
    const service = new DocumentAttachmentService(fake.db);

    // ATTACHMENT_ID hangs off DOC_A. ORG_B owns DOC_B, so the ownership check
    // passes and only the id/document pairing stands between B and A's bytes.
    await expect(
      service.get(DOC_B, ATTACHMENT_ID, ORG_B),
    ).rejects.toThrow(/not found/i);
  });

  it('reports another organization\'s attachment as not found, never forbidden', async () => {
    const fake = makeFakeDb();
    const service = new DocumentAttachmentService(fake.db);

    await expect(
      service.get(DOC_B, FOREIGN_ATTACHMENT_ID, ORG_A),
    ).rejects.toThrow(/not found/i);
    await expect(
      service.get(DOC_A, 424242, ORG_A),
    ).rejects.toThrow(/not found/i);
  });

  it('fails closed when the caller has no organization', async () => {
    const fake = makeFakeDb();
    const service = new DocumentAttachmentService(fake.db);

    await expect(
      service.get(DOC_A, ATTACHMENT_ID, null),
    ).rejects.toThrow(/organization context/i);
  });
});
