/**
 * The specification register's history: the one register whose recorded
 * changes the product could not show.
 *
 * ## The defect
 *
 * `GET /api/cmc/specifications/:id/history` is as old as the register and had
 * NO caller anywhere in `client/src` — measured by a reachability sweep over
 * all 99 CMC routes against every client source file
 * (docs/evidence/D2-CLIENT-JOURNEY/2026-10-25/pass7/). So the register an
 * inspector asks about first — the limits a batch is released against — was
 * the only one whose changes could not be read in the product, while the other
 * sixteen gained the §11.10(e) panel on 2026-10-18.
 *
 * Specifications are deliberately NOT in `REGISTER_HISTORY_PATHS`: they keep
 * their own revision log (`specification_audit_log`), which holds each change
 * with both whole-row snapshots, and holding the register in two stores would
 * give a reader two different answers to one question. So the route is REACHED
 * rather than replaced, and it now answers the same envelope the chain route
 * answers — one history panel in the product, not two.
 *
 * ## What must stay true
 *
 * The two stores attest differently and the reader is entitled to know which
 * one answered. `sealed: false` means "predates the sealed ledger" in the
 * chain and "no row here is ever on the chain" in a revision log; a panel that
 * marked both the same way would be telling the reader something untrue about
 * half of them. Hence `store`, asserted here and read by the panel.
 */
import { describe, it, expect } from 'vitest';
import { MissingAuditStore, readSpecificationHistory, type HistoryQueryable } from '../register-history';

const params = { orgId: 7, specificationId: 'f7a1c0de-0000-4000-8000-000000000001' };

/**
 * A client that HONOURS the limit it is given, and records what it was asked.
 *
 * It used to ignore both. That made the read-cap case unfalsifiable: with the
 * mock returning 501 rows whatever the limit, changing `HISTORY_LIMIT + 1` to
 * `HISTORY_LIMIT` left every case green while `earlierActsNotShown` became
 * permanently false in production — the silent truncation the cap exists to
 * announce. Raised by an adversarial review of this file, and it was right.
 */
function clientOf(rows: Record<string, unknown>[]): HistoryQueryable & { calls: Array<{ text: string; params: unknown[] }> } {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  return {
    calls,
    async query(text: string, params: unknown[] = []) {
      calls.push({ text, params });
      /* The name lookup is a second, optional query over unnest(); it has no
         history rows to give. */
      if (/unnest/i.test(text)) return { rows: [] };
      /* The LIMIT is the LAST bound parameter. Taking the first numeric one
         took `orgId` (7) and sliced the history to seven rows — a mock that
         answers a different question than the code asked. */
      const limit = params[params.length - 1];
      return { rows: typeof limit === 'number' ? rows.slice(0, limit) : rows };
    },
  };
}

function throwing(code: string): HistoryQueryable {
  return {
    query: async () => {
      throw Object.assign(new Error('relation does not exist'), { code });
    },
  };
}

const CREATED = {
  action: 'created',
  changed_by: '3',
  previous_values: null,
  new_values: { id: 'spec-1', attribute: 'Assay', releaseLimit: '95.0–105.0%', updated_at: '2026-01-01T00:00:00Z' },
  created_at: '2026-01-01T00:00:00Z',
  actor_name: 'Dana Okafor',
  actor_email: 'dana@example.test',
};

const WIDENED = {
  action: 'updated',
  changed_by: '4',
  previous_values: { id: 'spec-1', attribute: 'Assay', releaseLimit: '95.0–105.0%', updated_at: '2026-01-01T00:00:00Z' },
  new_values: { id: 'spec-1', attribute: 'Assay', releaseLimit: '90.0–110.0%', updated_at: '2026-03-02T09:30:00Z' },
  created_at: '2026-03-02T09:30:00Z',
  actor_name: 'Priya Raman',
  actor_email: 'priya@example.test',
};

describe('the specification revision log is read into the one history shape', () => {
  it('names the store, so a reader is never left to infer which one answered', async () => {
    const history = await readSpecificationHistory(clientOf([CREATED]), params);
    expect(history.store).toBe('specification_revision_log');
  });

  it('shows a widened limit as a change, with both values', async () => {
    /* The question this panel exists to answer: an acceptance limit was moved
       — by whom, when, and from what. All three were recorded and none could
       be read in the product. */
    const { entries } = await readSpecificationHistory(clientOf([WIDENED]), params);
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe('Specification edited');
    expect(entries[0].changedFields).toEqual(['releaseLimit']);
    expect(entries[0].changed.releaseLimit).toEqual({ from: '95.0–105.0%', to: '90.0–110.0%' });
  });

  it('does not report the row’s own timestamps as changes', async () => {
    /* `updated_at` moves on every edit. A diff that reported it would put a
       changed field on every row and bury the one the reader is looking for. */
    const moved = {
      ...WIDENED,
      new_values: { ...WIDENED.previous_values, updated_at: '2026-04-04T00:00:00Z' },
    };
    const { entries } = await readSpecificationHistory(clientOf([moved]), params);
    expect(entries[0].changedFields).toEqual([]);
  });

  it('reports no changed field for the create, as the chain reader does', async () => {
    /* A create has no previous values: the values ARE the record, not a change
       to it, and the chain's own history says the same for a create. */
    const { entries } = await readSpecificationHistory(clientOf([CREATED]), params);
    expect(entries[0].label).toBe('Specification recorded');
    expect(entries[0].changedFields).toEqual([]);
  });

  it('names the person and the account that acted', async () => {
    /* `CREATED` carries actor_name on the row, which is the shape a caller that
       joined the name hands in; the separate lookup covers the other path. */
    const { entries } = await readSpecificationHistory(clientOf([CREATED]), params);
    expect(entries[0].actor).toBe('Dana Okafor');
    expect(entries[0].actorId).toBe(3);
    expect(entries[0].actorRef).toBe('user:3');
  });

  it('shows what the row actually records when `changed_by` is not a user id', async () => {
    /* The column is TEXT. A row written by an importer or an older writer may
       hold something that is not an id, and tidying it away would hide what
       the record says. */
    const odd = { ...CREATED, changed_by: 'migration:2025-11', actor_name: null, actor_email: null };
    const { entries } = await readSpecificationHistory(clientOf([odd]), params);
    expect(entries[0].actorId).toBeNull();
    expect(entries[0].actorRef).toBe('migration:2025-11');
    expect(entries[0].actor).toBeNull();
  });

  it('claims no reason, because this store holds none', async () => {
    /* The reason an approval was given IS recorded — on the chain row and the
       signature beside it. Carrying it here would be inventing it. */
    const { entries } = await readSpecificationHistory(clientOf([WIDENED]), params);
    expect(entries[0].reason).toBeNull();
  });

  it('marks every row as carrying no chain position', async () => {
    /* True of this store: the sealed attestation of an approval is its
       signature, not a row here. The panel says so in this store's own terms
       rather than calling the row "unsealed", which would assert a date. */
    const { entries } = await readSpecificationHistory(clientOf([CREATED, WIDENED]), params);
    for (const e of entries) {
      expect(e.sealed).toBe(false);
      expect(e.seq).toBeNull();
      expect(e.signatureRef).toBeNull();
    }
  });

  it('presents the changes oldest first, however the read ordered them', async () => {
    /* The query reads newest-first so a capped read keeps the LATEST changes;
       a history is read in the order it happened. */
    const { entries } = await readSpecificationHistory(clientOf([WIDENED, CREATED]), params);
    expect(entries.map((e) => e.act)).toEqual(['created', 'updated']);
  });

  it('labels an action it does not know rather than dropping the row', async () => {
    const { entries } = await readSpecificationHistory(clientOf([{ ...CREATED, action: 'reindexed' }]), params);
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe('reindexed');
  });

  it('never throws on an unparseable timestamp', async () => {
    const { entries } = await readSpecificationHistory(clientOf([{ ...CREATED, created_at: 'not a date' }]), params);
    expect(entries[0].at).toBe('unknown');
  });

  it('reads a snapshot stored as JSON text as well as as an object', async () => {
    const asText = {
      ...WIDENED,
      previous_values: JSON.stringify(WIDENED.previous_values),
      new_values: JSON.stringify(WIDENED.new_values),
    };
    const { entries } = await readSpecificationHistory(clientOf([asText]), params);
    expect(entries[0].changedFields).toEqual(['releaseLimit']);
  });
});

describe('the read asks the database the right question', () => {
  it('scopes the history to the caller’s tenant, in SQL', async () => {
    /* The predicate that makes another organisation's specification invisible.
       Asserted on the statement, because every behavioural case here runs
       against a mock: delete the JOIN and its tenant test and all of them stay
       green while the route serves any tenant's history to any caller. */
    const client = clientOf([CREATED]);
    await readSpecificationHistory(client, params);
    const sql = client.calls[0].text;
    expect(sql).toMatch(/JOIN quality_specifications qs ON qs\.id = sal\.specification_id/);
    expect(sql).toMatch(/qs\.tenant_id = \$2/);
    expect(sql).toMatch(/sal\.specification_id = \$1/);
  });

  it('binds the specification, the tenant and the cap, in that order', async () => {
    const client = clientOf([CREATED]);
    await readSpecificationHistory(client, params);
    expect(client.calls[0].params).toEqual([params.specificationId, params.orgId, 501]);
  });

  it('orders by time and breaks ties deterministically', async () => {
    /* Rows written in one transaction can share a timestamp to the microsecond.
       With `created_at` alone, which row the cap drops changes between reads. */
    const client = clientOf([CREATED]);
    await readSpecificationHistory(client, params);
    expect(client.calls[0].text).toMatch(/ORDER BY sal\.created_at DESC, sal\.id DESC/);
  });

  it('asks for one more row than it shows, so a longer history is known to be longer', async () => {
    /* The mutation this catches: `HISTORY_LIMIT` instead of `HISTORY_LIMIT + 1`
       leaves `earlierActsNotShown` permanently false. */
    const client = clientOf([CREATED]);
    await readSpecificationHistory(client, params);
    expect(client.calls[0].params[2]).toBe(501);
  });

  it('does not make the history depend on the actor-name helper', async () => {
    /* `public.actor_name` is a display nicety. Calling it inside the history
       statement made a missing helper a 503 on the whole read — which the
       tenant-scope contract test caught as the owning tenant getting nothing. */
    const client = clientOf([CREATED]);
    await readSpecificationHistory(client, params);
    expect(client.calls[0].text).not.toMatch(/actor_name/);
    expect(client.calls.some((c) => /actor_name/.test(c.text))).toBe(true);
  });

  it('still answers when the name lookup fails entirely', async () => {
    /* A row as the history query now returns it: no name on it, because the
       statement no longer joins one. */
    const unnamed = { ...CREATED, actor_name: null, actor_email: null };
    const failing: HistoryQueryable = {
      async query(text: string) {
        if (/unnest/i.test(text)) throw Object.assign(new Error('no function'), { code: '42883' });
        return { rows: [unnamed] };
      },
    };
    const { entries } = await readSpecificationHistory(failing, params);
    expect(entries).toHaveLength(1);
    /* Unnamed, never invented — and the account is still traceable. */
    expect(entries[0].actor).toBeNull();
    expect(entries[0].actorRef).toBe('user:3');
  });
});

describe('the specification history fails closed', () => {
  for (const code of ['42P01', '42703', '42883']) {
    it(`carries a ${code} schema failure up rather than answering "no changes"`, async () => {
      /* An empty revision log and a log that could not be read are
         indistinguishable to an inspector, and only one of them is a claim
         this module may make. */
      await expect(readSpecificationHistory(throwing(code), params)).rejects.toBeInstanceOf(MissingAuditStore);
    });
  }

  it('does not swallow a failure it cannot explain', async () => {
    await expect(readSpecificationHistory(throwing('08006'), params)).rejects.not.toBeInstanceOf(MissingAuditStore);
  });
});

describe('the read is capped, and says when it capped', () => {
  it('reports that earlier changes exist rather than showing a history that begins in the middle', async () => {
    const many = Array.from({ length: 501 }, (_, i) => ({ ...WIDENED, changed_by: String(i) }));
    const history = await readSpecificationHistory(clientOf(many), params);
    expect(history.entries).toHaveLength(500);
    expect(history.earlierActsNotShown).toBe(true);
  });

  it('claims no truncation when the read returned everything', async () => {
    const history = await readSpecificationHistory(clientOf([CREATED, WIDENED]), params);
    expect(history.earlierActsNotShown).toBe(false);
  });
});
