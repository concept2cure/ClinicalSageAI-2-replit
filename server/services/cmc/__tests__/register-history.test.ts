/**
 * The register history map must describe the registers that actually have one,
 * and the reader must say what happened without embellishing it.
 *
 * Two failure modes, both of which look like nothing in a diff:
 *
 * 1. **A register gains a PUT and not a map entry.** It would record its edits
 *    onto the chain and show none of them, and the only symptom is a history
 *    panel that stays empty on a record that was edited — which reads exactly
 *    like a record nobody has touched.
 * 2. **A map entry describes its table wrongly** — the wrong table, or
 *    `idKind: 'integer'` for a uuid-keyed register. `comparabilityAssessments`
 *    shipped with exactly that mistake in `SIGNED_REGISTERS` and every approval
 *    answered "an id is required" until it was found by running the ceremony.
 *    Here the same mistake answers 404 for every record of that register.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getTableColumns, getTableName, type Table } from 'drizzle-orm';
import {
  HISTORY_LIMIT,
  type RegisterHistoryTarget,
  MissingAuditStore,
  REGISTER_HISTORY_PATHS,
  REGISTER_HISTORY_PATH_NAMES,
  readRegisterHistory,
} from '../register-history';

const ROUTES = fs.readFileSync(path.join(process.cwd(), 'server/api/cmc/routes.ts'), 'utf8');

/**
 * The map by any path string. The map itself is keyed by the shared list's
 * union — which is what makes a missing target a compile error — so a test
 * asking about an ARBITRARY path (one read out of the route file, or one the
 * map must not claim) has to look it up through a widened view rather than
 * weaken the type that does the work.
 */
const byPath: Record<string, RegisterHistoryTarget | undefined> = REGISTER_HISTORY_PATHS;

/** Every `router.put('/<path>/:id'` in the register router, in file order. */
function editablePaths(source: string): string[] {
  return [...source.matchAll(/router\.put\('\/([a-z0-9-]+)\/:id'/g)].map((m) => m[1]);
}

/** The register and Drizzle table each PUT hands to the edit-audit door. */
function putTargets(source: string): Array<{ path: string; register: string | null; table: string | null }> {
  const puts = [...source.matchAll(/router\.put\('\/([a-z0-9-]+)\/:id'/g)];
  return puts.map((m, i) => {
    const body = source.slice(m.index, puts[i + 1]?.index ?? source.length);
    return {
      path: m[1],
      register: /register: '([a-z_]+)'/.exec(body)?.[1] ?? null,
      table: /table: ([A-Za-z]+),/.exec(body)?.[1] ?? null,
    };
  });
}

describe('REGISTER_HISTORY_PATHS covers the registers that can be edited', () => {
  it('has an entry for every register path with a PUT', () => {
    const missing = editablePaths(ROUTES).filter((p) => !byPath[p]);
    expect(missing, 'a register with an edit door and no history entry records changes it can never show').toEqual([]);
  });

  it('claims no path that has no register behind it', () => {
    const editable = new Set(editablePaths(ROUTES));
    expect(REGISTER_HISTORY_PATH_NAMES.filter((p) => !editable.has(p))).toEqual([]);
  });

  it('names the same register the PUT records its edits under', () => {
    for (const put of putTargets(ROUTES)) {
      const entry = byPath[put.path];
      if (!entry || !put.register) continue;
      expect(entry.register, `${put.path}: the history map and the edit door disagree`).toBe(put.register);
    }
  });

  it('serves every register in the map from one namespaced route', () => {
    /* One route, resolving the register through the map — so a register in the
       map is served, and a path that is not in it is refused by name rather
       than shadowing another router's route. */
    expect(ROUTES).toContain("router.get('/register-history/:register/:id'");
    expect(ROUTES).toContain('REGISTER_HISTORY_PATHS as Record<string,');
  });

  /* Specifications has its own history, over its own store. Two routes
     answering one question with different content is the duplication the repo
     forbids, so the generic map must not claim it. */
  it('leaves specifications to the history route it already has', () => {
    expect(byPath['specifications']).toBeUndefined();
    const specs = fs.readFileSync(path.join(process.cwd(), 'server/api/cmc/specificationRoutes.ts'), 'utf8');
    expect(specs).toContain("router.get('/:id/history'");
  });
});

describe('each entry describes its own table', () => {
  for (const [registerPath, target] of Object.entries(REGISTER_HISTORY_PATHS)) {
    describe(registerPath, () => {
      const columns = Object.values(getTableColumns(target.table as unknown as Table)) as Array<{
        name: string;
        columnType: string;
      }>;
      const byName = new Map(columns.map((c) => [c.name, c]));

      it('names a table that carries organization_id', () => {
        expect(byName.has('organization_id'), `${getTableName(target.table as unknown as Table)} has no organization_id`).toBe(true);
      });

      it('states the id shape the table actually has', () => {
        const id = byName.get('id');
        const kind = id?.columnType === 'PgUUID' ? 'uuid' : 'integer';
        expect(target.idKind, `${registerPath}: id is ${id?.columnType}`).toBe(kind);
      });

      it('points its ownership columns at that same table', () => {
        /* A column from another table would silently scope the check to the
           wrong register — the predicate would still compile. */
        const table = getTableName(target.table as unknown as Table);
        expect(getTableName((target.id as unknown as { table: Table }).table)).toBe(table);
        expect(getTableName((target.organizationId as unknown as { table: Table }).table)).toBe(table);
      });
    });
  }
});

/** A pg client that answers one fixed result, or throws one fixed error. */
function clientOf(rows: Array<Record<string, unknown>>) {
  return { query: async () => ({ rows }) };
}
function throwingClient(code: string) {
  return {
    query: async () => {
      throw Object.assign(new Error('relation does not exist'), { code });
    },
  };
}

const ROW = {
  id: '11111111-1111-1111-1111-111111111111',
  action: 'cmc.register.update',
  actor_id: 3,
  reason: null,
  new_values: { register: 'analytical_method', changed: { title: { from: 'A', to: 'B' } } },
  occurred_at: '2026-10-18T22:00:00.000Z',
  sha256_chain: 'deadbeef',
  chain_seq: 42,
  actor_name: 'JM Smith',
  actor_email: 'jm@example.com',
  signature_id: null,
  signature_meaning: null,
};

describe('readRegisterHistory', () => {
  const params = { orgId: 1, tableName: 'analytical_methods', recordId: '109' };

  it('names the fields that moved, with both values', async () => {
    const [entry] = (await readRegisterHistory(clientOf([ROW]), params)).entries;
    expect(entry.changed).toEqual({ title: { from: 'A', to: 'B' } });
    expect(entry.changedFields).toEqual(['title']);
  });

  it('labels the act for a reader and keeps the action as recorded', async () => {
    const [entry] = (await readRegisterHistory(clientOf([ROW]), params)).entries;
    expect(entry.label).toBe('Changed');
    expect(entry.act).toBe('cmc.register.update');
  });

  it('shows an unlabelled action as the chain recorded it, not as something friendlier', async () => {
    const [entry] = (await readRegisterHistory(clientOf([{ ...ROW, action: 'cmc.register.unheard_of' }]), params)).entries;
    expect(entry.label).toBe('cmc.register.unheard_of');
  });

  it('names the actor and keeps the reference an inspector traces by', async () => {
    const [entry] = (await readRegisterHistory(clientOf([ROW]), params)).entries;
    expect(entry.actor).toBe('JM Smith');
    expect(entry.actorRef).toBe('user:3');
  });

  it('falls back to the email when the actor has no name', async () => {
    const [entry] = (await readRegisterHistory(clientOf([{ ...ROW, actor_name: null }]), params)).entries;
    expect(entry.actor).toBe('jm@example.com');
  });

  it('reports an actorless row as having no actor rather than inventing one', async () => {
    const [entry] = (await readRegisterHistory(clientOf([{ ...ROW, actor_id: null, actor_name: null, actor_email: null }]), params)).entries;
    expect(entry.actor).toBeNull();
    expect(entry.actorRef).toBeNull();
  });

  it('reads the diff when the driver hands back json as text', async () => {
    const [entry] = (await readRegisterHistory(clientOf([{ ...ROW, new_values: JSON.stringify(ROW.new_values) }]), params)).entries;
    expect(entry.changed).toEqual({ title: { from: 'A', to: 'B' } });
  });

  it('reports no change rather than throwing on a details shape it cannot read', async () => {
    for (const details of [null, 'not json', '{', { changed: 'a string' }, { changed: ['a', 'list'] }, { changed: { title: 'bare' } }]) {
      const [entry] = (await readRegisterHistory(clientOf([{ ...ROW, new_values: details }]), params)).entries;
      expect(entry.changed).toEqual({});
      expect(entry.changedFields).toEqual([]);
    }
  });

  it('keeps a create, which moved no fields, as an act with no diff', async () => {
    const [entry] = (
      await readRegisterHistory(
        clientOf([{ ...ROW, action: 'cmc.register.create', new_values: { register: 'analytical_method' } }]),
        params,
      )
    ).entries;
    expect(entry.label).toBe('Recorded');
    expect(entry.changedFields).toEqual([]);
  });

  it('marks an unsealed row as unsealed instead of hiding it', async () => {
    /* A legacy row with no chain position is part of what happened to the
       record. A history that drops it reads as a record never touched. */
    const [entry] = (await readRegisterHistory(clientOf([{ ...ROW, sha256_chain: null, chain_seq: null }]), params)).entries;
    expect(entry.sealed).toBe(false);
    expect(entry.seq).toBeNull();
  });

  it('carries the §11.50 signature the act is bound to', async () => {
    const [entry] = (
      await readRegisterHistory(
        clientOf([{ ...ROW, action: 'c2c.work.sign', signature_id: '77', signature_meaning: 'approval' }]),
        params,
      )
    ).entries;
    expect(entry.label).toBe('Signed');
    expect(entry.signatureRef).toBe('electronic_signatures:77');
    expect(entry.signatureMeaning).toBe('approval');
  });

  it('is empty for a record with no chained act, and says nothing more', async () => {
    /* `store` is part of "says nothing more": a payload names which store
       answered, so a reader is never left to infer from a per-row marker
       whether an unsealed row predates the chain or was never on it. */
    expect(await readRegisterHistory(clientOf([]), params)).toEqual({
      store: 'audit_chain',
      entries: [],
      earlierActsNotShown: false,
    });
  });

  it('presents the acts oldest first, however the read ordered them', async () => {
    /* The query reads newest-first so that a capped read keeps the LATEST acts;
       a history is read in the order it happened. */
    const older = { ...ROW, id: 'a', occurred_at: '2026-10-18T22:00:00.000Z', chain_seq: 1 };
    const newer = { ...ROW, id: 'b', occurred_at: '2026-10-18T23:00:00.000Z', chain_seq: 2 };
    const { entries } = await readRegisterHistory(clientOf([newer, older]), params);
    expect(entries.map((e) => e.seq)).toEqual([1, 2]);
  });

  it('says so when a record has more acts than one read returns', async () => {
    /* Silent truncation here cuts the record's BEGINNING, so a history missing
       its create would read as a record that was never recorded. */
    const many = Array.from({ length: HISTORY_LIMIT + 1 }, (_, i) => ({ ...ROW, id: `r${i}`, chain_seq: i }));
    const read = await readRegisterHistory(clientOf(many), params);
    expect(read.entries.length).toBe(HISTORY_LIMIT);
    expect(read.earlierActsNotShown).toBe(true);
  });

  it('does not claim truncation on a read that returned everything', async () => {
    const exactly = Array.from({ length: HISTORY_LIMIT }, (_, i) => ({ ...ROW, id: `r${i}`, chain_seq: i }));
    const read = await readRegisterHistory(clientOf(exactly), params);
    expect(read.entries.length).toBe(HISTORY_LIMIT);
    expect(read.earlierActsNotShown).toBe(false);
  });

  it('asks for one more row than it shows, so the cap is known and not guessed', async () => {
    let asked: unknown[] = [];
    await readRegisterHistory({ query: async (_t: string, p?: unknown[]) => { asked = p ?? []; return { rows: [] }; } }, params);
    expect(asked).toEqual([params.orgId, params.tableName, params.recordId, HISTORY_LIMIT + 1]);
  });

});

describe('readRegisterHistory fails closed', () => {
  const params = { orgId: 1, tableName: 'analytical_methods', recordId: '109' };

  for (const code of ['42P01', '42703', '42883']) {
    it(`fails closed on ${code} rather than reporting an empty history`, async () => {
      await expect(readRegisterHistory(throwingClient(code), params)).rejects.toBeInstanceOf(MissingAuditStore);
    });
  }

  it('lets an unrecognised failure through, so it is never read as an empty trail either', async () => {
    await expect(readRegisterHistory(throwingClient('57014'), params)).rejects.not.toBeInstanceOf(MissingAuditStore);
  });
});
