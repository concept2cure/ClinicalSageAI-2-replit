/**
 * P0-8, the grant half (rows D5/D6, 2026-10-01): the runtime role may read and
 * append to every Part 11 record table, never rewrite one.
 *
 * Until this change APPEND_ONLY_TABLES named audit.tamper_proof_log alone, and
 * the recipe left the runtime role UPDATE and DELETE on every public record
 * table (audit_logs, the AnA turn records, the authoring trail, the signature
 * ledgers): only their triggers refused a rewrite. The recipe now withdraws
 * UPDATE, DELETE and TRUNCATE on each, and the audit the deploy verifies with
 * holds each to SELECT/INSERT and fails on anything beyond. The same property
 * on a real database: tests/db/turn-record-purge-door.dbtest.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  auditRuntimeRoleGrants,
  withdrawAppendOnlyWrites,
  APPEND_ONLY_TABLES,
} from '../../../scripts/db/provision-app-role.mjs';

type Rel = { schema: string; name: string; owned?: boolean; held?: string[] };

/** The catalog the audit reads, for the given relations. */
function catalog(rels: Rel[]) {
  return {
    async query(sql: string, args?: unknown[]) {
      if (sql.includes('FROM pg_roles WHERE rolname')) {
        return { rows: [{ rolname: args![0], rolsuper: false, rolbypassrls: false, rolcanlogin: true }], rowCount: 1 };
      }
      const rows = rels.map((r) => {
        const held = new Set(r.held ?? ['SELECT', 'INSERT', 'UPDATE', 'DELETE']);
        return {
          schema: r.schema,
          name: r.name,
          relkind: 'r',
          owned: Boolean(r.owned),
          schema_usage: true,
          can_select: held.has('SELECT'),
          can_insert: held.has('INSERT'),
          can_update: held.has('UPDATE'),
          can_delete: held.has('DELETE'),
          can_truncate: held.has('TRUNCATE'),
        };
      });
      return { rows, rowCount: rows.length };
    },
  };
}

describe('APPEND_ONLY_TABLES', () => {
  it('names the audit store and every public record table a trigger keeps append-only', () => {
    expect(APPEND_ONLY_TABLES.map((t) => `${t.schema}.${t.name}`)).toEqual([
      'audit.tamper_proof_log',
      'public.audit_logs',
      'public.audit_log_archives',
      'public.audit_events',
      'public.ana_turn_records',
      'public.ana_record_blobs',
      'public.authoring_audit_trail',
      'public.doc_revisions',
      'public.concept2cure_signatures',
      'public.concept2cure_submission_snapshots',
    ]);
  });
});

describe('auditRuntimeRoleGrants holds a record table to SELECT/INSERT in any schema', () => {
  it('reports UPDATE, DELETE or TRUNCATE on a public record table as EXCESS, and nothing as denied', async () => {
    const a = await auditRuntimeRoleGrants(
      catalog([
        { schema: 'public', name: 'audit_logs', held: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] },
        { schema: 'public', name: 'ana_turn_records', held: ['SELECT', 'INSERT', 'TRUNCATE'] },
        { schema: 'public', name: 'authoring_audit_trail', held: ['SELECT', 'INSERT'] },
        { schema: 'public', name: 'organizations' },
      ]) as never,
      'app_service',
    );
    expect(a.excess).toEqual([
      { relation: 'public.audit_logs', held: ['UPDATE', 'DELETE'] },
      { relation: 'public.ana_turn_records', held: ['TRUNCATE'] },
    ]);
    expect(a.denied).toEqual([]);
  });

  it('fails a runtime role that owns a public record table', async () => {
    const a = await auditRuntimeRoleGrants(
      catalog([{ schema: 'public', name: 'doc_revisions', owned: true }]) as never,
      'app_service',
    );
    expect(a.ownedAppendOnly).toEqual(['public.doc_revisions']);
  });

  it('reports a record table the role cannot append to as denied', async () => {
    const a = await auditRuntimeRoleGrants(
      catalog([{ schema: 'public', name: 'audit_logs', held: ['SELECT'] }]) as never,
      'app_service',
    );
    expect(a.denied).toEqual([{ relation: 'public.audit_logs', missing: ['INSERT'] }]);
  });

  it('reports TRUNCATE on the audit store as EXCESS', async () => {
    const a = await auditRuntimeRoleGrants(
      catalog([{ schema: 'audit', name: 'tamper_proof_log', held: ['SELECT', 'INSERT', 'TRUNCATE'] }]) as never,
      'c2c',
    );
    expect(a.excess).toEqual([{ relation: 'audit.tamper_proof_log', held: ['TRUNCATE'] }]);
  });
});

describe('withdrawAppendOnlyWrites', () => {
  it('revokes UPDATE, DELETE and TRUNCATE from PUBLIC and the role on every record table present, and skips one absent', async () => {
    const statements: string[] = [];
    const db = {
      async query(sql: string, args?: unknown[]) {
        statements.push(sql);
        if (sql.includes('to_regclass')) {
          const [schema, name] = args as string[];
          return { rows: [{ present: name !== 'doc_revisions', ref: `${schema}.${name}` }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
    };
    const withdrawn = await withdrawAppendOnlyWrites(db as never, '"app_service"');
    expect(withdrawn).toHaveLength(APPEND_ONLY_TABLES.length - 1);
    expect(withdrawn).not.toContain('public.doc_revisions');
    const revokes = statements.filter((s) => s.startsWith('REVOKE'));
    expect(revokes).toContain('REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM PUBLIC, "app_service"');
    expect(revokes).toContain('REVOKE UPDATE, DELETE, TRUNCATE ON public.ana_turn_records FROM PUBLIC, "app_service"');
    expect(revokes).toHaveLength(APPEND_ONLY_TABLES.length - 1);
  });
});
