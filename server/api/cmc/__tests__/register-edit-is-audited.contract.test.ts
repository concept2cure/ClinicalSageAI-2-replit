/**
 * Every CMC register edit reaches an audited, transactional door (§11.10(e)).
 *
 * ## The finding
 *
 * `PUT /api/cmc/batch-records/:id` wrote a batch record — a manufacturing
 * record under 21 CFR 211.188 — with a bare `pool.query`. No transaction, and
 * **no audit row**. The only trace was a `console.log`. Its own CREATE had gone
 * through `createOnConnection` since the register-audit work; the edit had been
 * left behind, and it was the only one of the eighteen CMC register edits with
 * no trail at all.
 *
 * Shown live in `docs/evidence/S7/2026-11-09-batch-edit-had-no-audit-row/`: the
 * batch number of a real record was changed through the API, the response said
 * `success: true`, and the audit row count did not move. The restoring edit
 * then recorded `batch_number: from "C2C101-DS-2412-R2"` — a value no row in the
 * trail ever records the record arriving at. That is what an inspector sees.
 *
 * ## What this case holds
 *
 * Each handler body must name at least one of the audited doors. All of them
 * write the row and its audit row on ONE transaction, which is the point:
 * `services/cmc/register-audit.ts` explains why the audit row cannot simply
 * follow the write (the chain position is taken under `pg_advisory_xact_lock`
 * and announced in a transaction-local GUC the `audit_logs` trigger reads), and
 * the regulated reason is the same — a write that committed before its audit row
 * leaves exactly the unattributable record the module exists to prevent.
 *
 * Read from the route sources, so a stub cannot satisfy it, and so a NEW
 * register edit has to pick a door before it can pass.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// @ts-expect-error — the shared, string-aware comment stripper the CI gates use.
import { stripComments } from '../../../../scripts/ci/lib/strip-comments.mjs';

const API = path.join(__dirname, '..');

/**
 * Comments stripped before anything is looked for.
 *
 * Without this, PROSE about a door satisfies the contract: the first version of
 * this file passed the batch-record mutation because the comment explaining why
 * `updateOnConnection` is the right door still contained the word. That is the
 * same lesson `scripts/ci/check-commonjs-require.mjs` carries — "a gate that
 * flags its own documentation trains people to ignore it", and a gate SATISFIED
 * by its own documentation is worse. The shared stripper is string-aware and
 * blanks in place, so offsets and line numbers are unchanged.
 */
const code = (source: string): string => stripComments(source) as string;

/**
 * The doors. Each writes the register row and its audit row on one
 * transaction; `inRefusableTransaction` only counts beside an explicit
 * `writeChainedAuditRow`, which is how the specification edit is written.
 */
const AUDITED_DOORS = [
  'updateRegisterRow',
  'updateOnConnection',
  'qualifyRegisterRecord',
  'retireSignedRecord',
  'writeChainedAuditRow',
  'recordGovernedAction',
] as const;

/**
 * Handlers that take a door one level down, in the service they delegate the
 * whole write to. The service is NAMED and then READ: a declared delegate that
 * stopped auditing fails here too, so this admits the shape without excusing
 * the obligation.
 */
const DELEGATES: Record<string, string> = {
  resolveContradiction: '../../../services/cmc/contradiction-lifecycle.ts',
};

interface Handler {
  file: string;
  route: string;
  body: string;
}

/** Every `router.put` / `router.patch` handler in the CMC API, with its body. */
function editHandlers(): Handler[] {
  const out: Handler[] = [];
  for (const file of readdirSync(API).filter((f) => f.endsWith('.ts')).sort()) {
    const source = code(readFileSync(path.join(API, file), 'utf8'));
    const opener = /router\.(put|patch)\(\s*'([^']+)'/g;
    for (const m of source.matchAll(opener)) {
      const from = source.indexOf('{', m.index! + m[0].length);
      if (from < 0) continue;
      let depth = 0;
      let to = from;
      for (; to < source.length; to++) {
        if (source[to] === '{') depth++;
        else if (source[to] === '}' && --depth === 0) break;
      }
      out.push({ file, route: `${m[1].toUpperCase()} ${m[2]}`, body: source.slice(from, to) });
    }
  }
  return out;
}

describe('a CMC register edit is written on one transaction with its audit row', () => {
  const handlers = editHandlers();

  it('finds every edit handler, so an empty sweep cannot pass', () => {
    // 16 in routes.ts, the batch record, the specification, the contradiction
    // resolve in the Module 3 operating system.
    expect(handlers.length).toBeGreaterThanOrEqual(19);
    expect(handlers.map((h) => h.route)).toContain('PUT /:id');
    expect(new Set(handlers.map((h) => h.file)).size).toBeGreaterThanOrEqual(4);
  });

  it('extracts whole handler bodies, not fragments', () => {
    for (const h of handlers) {
      expect(h.body.length, `${h.file} ${h.route}`).toBeGreaterThan(200);
      expect(h.body.trimEnd().endsWith('}'), `${h.file} ${h.route}`).toBe(true);
    }
  });

  for (const h of editHandlers()) {
    it(`${h.file} — ${h.route} reaches an audited door`, () => {
      const own = AUDITED_DOORS.filter((d) => h.body.includes(d));
      if (own.length > 0) return;
      /* Or it hands the whole write to a service that takes one. The service is
         read here, not merely named, so a delegate that stopped auditing fails. */
      const delegate = Object.keys(DELEGATES).find((fn) => h.body.includes(`${fn}(`));
      expect(delegate, `${h.file} ${h.route} writes a register row with no audit row on its transaction, and delegates to nothing declared here`)
        .toBeTruthy();
      const service = code(readFileSync(path.join(__dirname, DELEGATES[delegate!]), 'utf8'));
      const inService = AUDITED_DOORS.filter((d) => service.includes(d));
      expect(inService, `${delegate} no longer writes an audit row`).not.toEqual([]);
    });
  }

  /* Named, so the batch record's own regression fails on the record rather
     than on a count. The route is `PUT /:id` on its own router. */
  it('the batch record edit takes the pinned-connection door, as its create does', () => {
    const batch = code(readFileSync(path.join(API, 'batchRecordRoutes.ts'), 'utf8'));
    expect(batch).toContain('updateOnConnection');
    expect(batch).toContain("register: 'batch_record'");
    // And its edit no longer writes the row outside a transaction.
    expect(batch).not.toContain('await pool.query(updateQuery, values)');
  });
});
