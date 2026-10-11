/**
 * The append-only audit stores in the runtime-role grant recipe and its audit
 * (scripts/db/provision-app-role.mjs), plan P0-8 grant half — security audit
 * 2026-09-24 DP-04 (High), rows D5/D6.
 *
 * Until 2026-10-01 the append-only ceiling (SELECT, INSERT) applied to the
 * `audit` schema only. audit_logs, audit_events, electronic_signatures and the
 * other append-only records live in `public`, where the blanket grant gave the
 * runtime role UPDATE and DELETE, and the deploy's grant audit did not look.
 * These pin: which stores; that the recipe withholds UPDATE/DELETE/TRUNCATE on
 * them AFTER the blanket grant (so every re-run withholds again); and that the
 * audit holds each store to the ceiling, with the revocation's columns as the
 * one carve-out. The same behaviour against PostgreSQL 16:
 * tests/db/append-only-store-grants.dbtest.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  APPEND_ONLY_TABLES,
  auditRuntimeRoleGrants,
  refreshRuntimeRoleGrants,
} from '../../../scripts/db/provision-app-role.mjs';
import { EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS } from '../../services/audit/audit-immutability-triggers';

type Store = { schema: string; name: string; updatableColumns?: readonly string[]; ceiling?: readonly string[] };
const names = (stores: readonly Store[]) => stores.map((t) => `${t.schema}.${t.name}`);
const SUPERSESSION = ['superseded_by', 'is_valid', 'verification_status', 'verification_date', 'updated_at'];

/** A recipe-shaped fake: the role exists, schemas `public` and `audit`, and `present` stores. */
function recipeDb(present: { schema: string; name: string; ref: string; cols: string[] }[]) {
  const statements: string[] = [];
  const db = {
    async query(sql: string, args?: unknown[]) {
      statements.push(sql);
      if (sql.includes('FROM pg_roles WHERE rolname')) {
        return { rows: [{ rolname: args![0], rolsuper: false, rolbypassrls: false, rolcanlogin: true }], rowCount: 1 };
      }
      if (sql.includes('quote_ident($1) AS role_ident')) return { rows: [{ role_ident: `"${args![0]}"` }], rowCount: 1 };
      if (sql.includes('quote_ident(current_database())')) return { rows: [{ db_ident: '"testdb"' }], rowCount: 1 };
      if (sql.startsWith('SELECT quote_ident($1) AS s')) return { rows: [{ s: `"${args![0]}"` }], rowCount: 1 };
      if (sql.includes('WITH ORDINALITY AS t(schema, name, cols, ord)')) return { rows: present, rowCount: present.length };
      if (sql.includes('FROM pg_namespace WHERE')) return { rows: [{ nspname: 'audit' }, { nspname: 'public' }], rowCount: 2 };
      return { rows: [], rowCount: 0 };
    },
  };
  return { db, statements };
}

type Rel = { schema: string; name: string; owned?: boolean; held?: string[] };
/** The audit's two catalog reads: one row per relation, and column-level UPDATE per store column. */
function auditDb(rels: Rel[], columns: Record<string, Record<string, boolean>> = {}) {
  return {
    async query(sql: string, args?: unknown[]) {
      if (sql.includes('FROM pg_roles WHERE rolname')) {
        return { rows: [{ rolname: args![0], rolsuper: false, rolbypassrls: false, rolcanlogin: true }], rowCount: 1 };
      }
      if (sql.includes('has_schema_privilege')) {
        const rows = rels.map((r) => {
          const held = new Set(r.held ?? ['SELECT', 'INSERT', 'UPDATE', 'DELETE']);
          const can = (p: string) => held.has(p);
          return {
            schema: r.schema, name: r.name, relkind: 'r', owned: Boolean(r.owned), schema_usage: true,
            can_select: can('SELECT'), can_insert: can('INSERT'), can_update: can('UPDATE'),
            can_delete: can('DELETE'), can_truncate: can('TRUNCATE'),
          };
        });
        return { rows, rowCount: rows.length };
      }
      if (sql.includes('has_column_privilege')) {
        const asked = new Set(args![1] as string[]);
        const rows = Object.entries(columns)
          .filter(([relation]) => asked.has(relation))
          .flatMap(([relation, cols]) => Object.entries(cols).map(([col, can_update]) => ({ relation, col, can_update })));
        return { rows, rowCount: rows.length };
      }
      throw new Error(`unexpected query: ${sql.slice(0, 60)}`);
    },
  };
}

describe('APPEND_ONLY_TABLES', () => {
  it('names every append-only audit store, and the one governed UPDATE (revocation) by its columns', () => {
    expect(names(APPEND_ONLY_TABLES)).toEqual([
      'audit.tamper_proof_log',
      'public.audit_logs',
      'public.audit_log_archives',
      'public.audit_events',
      'public.electronic_signatures',
      'public.ana_turn_records',
      'public.ana_record_blobs',
      'public.authoring_audit_trail',
      'public.doc_revisions',
      'public.concept2cure_signatures',
      'public.concept2cure_submission_snapshots',
      // DP-66 (2026-10-01): written by INSERT only on every path; a ceiling, no trigger.
      'public.proof_audit_logs',
      'public.coauthor_validation_history',
      'public.embedding_audit_log',
      'public.ai_provider_audit_log',
      'ai.gateway_audit_log',
      'public.credit_ledger',
      'public.document_audit_trail',
      'public.ectd_submission_status_history',
      'public.specification_audit_log',
      'public.stab_audit',
      'public.ivdr_validation_parameter_history',
      'public.ivdr_evidence_result_history',
      'public.ivdr_cdx_status_history',
      'regulatory_harmonization.export_job_audit_log',
      // P1-24's domain-history stores (DP-66, 2026-10-01).
      'public.workflow_history',
      'public.document_audit_logs',
      'public.regulatory_audit_logs',
      'public.c2c_ana_actions',
      'public.authoring_signatures',
      // DP-84 (2026-10-05): the Module 3 signed snapshots and provenance trail.
      'public.cmc_module3_section_versions',
      'public.cmc_provenance_events',
    ]);
    const carveOuts = APPEND_ONLY_TABLES.filter((t: Store) => t.updatableColumns);
    expect(carveOuts).toEqual([{ schema: 'public', name: 'electronic_signatures', updatableColumns: SUPERSESSION }]);
  });

  /**
   * P0-8 follow-up (2026-10-01). The archive ledger is written by one door,
   * audit_logs_archive_delete(), which runs as audit_archiver and holds INSERT
   * itself. The runtime role's own INSERT there let it forge ledger rows that
   * the anchor verifier had to defend against (DP-68). Its ceiling there is
   * SELECT: the anchor verifier reads the ledger, nothing else of the
   * runtime's writes it.
   */
  it('holds the archive ledger to SELECT: the door, not the runtime role, appends to it', () => {
    const narrowed = APPEND_ONLY_TABLES.filter((t: Store) => t.ceiling);
    expect(narrowed).toEqual([{ schema: 'public', name: 'audit_log_archives', ceiling: ['SELECT'] }]);
  });

  /**
   * The store list and the boot's trigger list (P0-9a) name the same stores, so
   * a store that gains an immutability trigger cannot keep the runtime role's
   * UPDATE/DELETE without a written reason here.
   */
  it('covers every store whose immutability trigger the production boot requires, or says why not', () => {
    const NOT_APPEND_ONLY: Record<string, string> = {
      'public.authoring_comments':
        'content-fixed, not append-only: resolving and threading a comment UPDATE it (20260730_authoring_comments_router_columns.sql)',
      'vault.documents':
        "a recorded version's identity is guarded, its workflow columns are not: check-in, metadata edit and lifecycle UPDATE it",
      'public.concept2cure_thread_comments':
        'words, author and placement are fixed, but a retraction sets deleted_at once and status moves: UPDATEs (20261001_review_comments_record.sql)',
      'public.cre_evidence_sources':
        'write-once and one-way columns, the rest (title, extraction and ingestion status) governed by its writer: UPDATEs (20261001_cre_evidence_sources_capture_immutability.sql)',
    };
    const DP66_CEILING_ONLY =
      'DP-66 (2026-10-01): the grant ceiling only. The census found it written by INSERT only on every path; it has no immutability trigger for the boot to require (docs/evidence/D6/2026-10-01-tranche-4/DP-66-store-ceiling/)';
    const P1_24_NOT_YET_BOOT_REQUIRED =
      'append-only by trigger (migrations/20261001_domain_history_append_only.sql, P1-24); the boot does not require that trigger yet (server/services/audit/audit-immutability-triggers.ts, handed on: another lane changed it inside 24 hours on 2026-10-01)';
    const NOT_BOOT_REQUIRED: Record<string, string> = {
      'public.workflow_history': P1_24_NOT_YET_BOOT_REQUIRED,
      'public.document_audit_logs': P1_24_NOT_YET_BOOT_REQUIRED,
      'public.regulatory_audit_logs': P1_24_NOT_YET_BOOT_REQUIRED,
      'public.c2c_ana_actions': P1_24_NOT_YET_BOOT_REQUIRED,
      'public.authoring_signatures': P1_24_NOT_YET_BOOT_REQUIRED,

      'public.audit_log_archives':
        "the archive door's own ledger, append-only by triggers from the same file as audit_logs' (20260617)",
      'public.proof_audit_logs': DP66_CEILING_ONLY,
      'public.coauthor_validation_history': DP66_CEILING_ONLY,
      'public.embedding_audit_log': DP66_CEILING_ONLY,
      'public.ai_provider_audit_log': DP66_CEILING_ONLY,
      'ai.gateway_audit_log': DP66_CEILING_ONLY,
      'public.credit_ledger': DP66_CEILING_ONLY,
      'public.document_audit_trail': DP66_CEILING_ONLY,
      'public.ectd_submission_status_history': DP66_CEILING_ONLY,
      'public.specification_audit_log': DP66_CEILING_ONLY,
      'public.stab_audit': DP66_CEILING_ONLY,
      'public.ivdr_validation_parameter_history': DP66_CEILING_ONLY,
      'public.ivdr_evidence_result_history': DP66_CEILING_ONLY,
      'public.ivdr_cdx_status_history': DP66_CEILING_ONLY,
      'regulatory_harmonization.export_job_audit_log': DP66_CEILING_ONLY,
    };
    const guarded = new Set(EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS.map((t) => `${t.schema}.${t.table}`));
    const stores = new Set(names(APPEND_ONLY_TABLES));
    expect([...guarded].filter((t) => !stores.has(t) && !NOT_APPEND_ONLY[t])).toEqual([]);
    expect([...stores].filter((t) => !guarded.has(t) && !NOT_BOOT_REQUIRED[t])).toEqual([]);
  });
});

describe('the grant recipe withholds UPDATE, DELETE and TRUNCATE on each store', () => {
  it('after the blanket grants, from PUBLIC and the role, giving the revocation its columns back', async () => {
    const { db, statements } = recipeDb([
      { schema: 'public', name: 'audit_logs', ref: 'audit_logs', cols: [] },
      { schema: 'public', name: 'electronic_signatures', ref: 'electronic_signatures', cols: ['superseded_by', 'is_valid'] },
    ]);
    await refreshRuntimeRoleGrants(db as never, { role: 'c2c' });
    const lastBlanket = statements.map((s) => /ON ALL TABLES IN SCHEMA/.test(s)).lastIndexOf(true);
    const revokeAudit = statements.indexOf('REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_logs FROM PUBLIC, "c2c"');
    const revokeEsig = statements.indexOf('REVOKE UPDATE, DELETE, TRUNCATE ON TABLE electronic_signatures FROM PUBLIC, "c2c"');
    const columnGrant = statements.indexOf('GRANT UPDATE (superseded_by, is_valid) ON TABLE electronic_signatures TO "c2c"');
    expect(lastBlanket).toBeGreaterThan(-1);
    expect(revokeAudit).toBeGreaterThan(lastBlanket);
    expect(revokeEsig).toBeGreaterThan(lastBlanket);
    expect(columnGrant).toBeGreaterThan(revokeEsig);
    expect(statements.indexOf('COMMIT')).toBeGreaterThan(columnGrant);
    expect(statements.some((s) => /GRANT UPDATE \(.*ON TABLE audit_logs/.test(s))).toBe(false);
  });

  it('withholds INSERT as well on a store whose ceiling is SELECT (the archive ledger)', async () => {
    const { db, statements } = recipeDb([
      { schema: 'public', name: 'audit_log_archives', ref: 'audit_log_archives', cols: [] },
      { schema: 'public', name: 'audit_logs', ref: 'audit_logs', cols: [] },
    ]);
    await refreshRuntimeRoleGrants(db as never, { role: 'c2c' });
    const lastBlanket = statements.map((s) => /ON ALL TABLES IN SCHEMA/.test(s)).lastIndexOf(true);
    const revokeLedger = statements.indexOf('REVOKE UPDATE, DELETE, TRUNCATE, INSERT ON TABLE audit_log_archives FROM PUBLIC, "c2c"');
    expect(revokeLedger).toBeGreaterThan(lastBlanket);
    // audit_logs keeps its append: only the ledger's ceiling is narrower.
    expect(statements).toContain('REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_logs FROM PUBLIC, "c2c"');
    expect(statements.some((s) => /GRANT .* ON TABLE audit_log_archives/.test(s))).toBe(false);
  });

  it('asks for every store with its carve-out, and withholds nothing on a store this edition lacks', async () => {
    const { db, statements } = recipeDb([]);
    await refreshRuntimeRoleGrants(db as never, { role: 'c2c' });
    expect(statements.some((s) => /^REVOKE .* ON TABLE /.test(s))).toBe(false);
    const lookup = statements.find((s) => s.includes('WITH ORDINALITY AS t(schema, name, cols, ord)'));
    expect(lookup).toBeTruthy();
  });
});

describe('the grant audit holds each store to SELECT, INSERT', () => {
  it('UPDATE, DELETE and TRUNCATE on a public store are EXCESS, not required', async () => {
    const a = await auditRuntimeRoleGrants(
      auditDb([
        { schema: 'public', name: 'audit_logs', held: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] },
        { schema: 'public', name: 'audit_events', held: ['SELECT', 'INSERT', 'TRUNCATE'] },
        { schema: 'public', name: 'doc_revisions', held: ['SELECT', 'INSERT'] },
        { schema: 'public', name: 'organizations' },
      ]) as never,
      'app_service',
    );
    expect(a.excess).toEqual([
      { relation: 'public.audit_logs', held: ['UPDATE', 'DELETE'] },
      { relation: 'public.audit_events', held: ['TRUNCATE'] },
    ]);
    expect(a.denied).toEqual([]);
  });

  it('INSERT on the archive ledger is EXCESS; SELECT alone is the recipe posture, not a denial', async () => {
    const widened = await auditRuntimeRoleGrants(
      auditDb([{ schema: 'public', name: 'audit_log_archives', held: ['SELECT', 'INSERT'] }]) as never,
      'app_service',
    );
    expect(widened.excess).toEqual([{ relation: 'public.audit_log_archives', held: ['INSERT'] }]);
    expect(widened.denied).toEqual([]);

    const clean = await auditRuntimeRoleGrants(
      auditDb([{ schema: 'public', name: 'audit_log_archives', held: ['SELECT'] }]) as never,
      'app_service',
    );
    expect([clean.excess, clean.denied]).toEqual([[], []]);

    const unreadable = await auditRuntimeRoleGrants(
      auditDb([{ schema: 'public', name: 'audit_log_archives', held: [] }]) as never,
      'app_service',
    );
    expect(unreadable.denied).toEqual([{ relation: 'public.audit_log_archives', missing: ['SELECT'] }]);
  });

  it('a store the role cannot append to is denied (from the grant-half commit 06152498)', async () => {
    const a = await auditRuntimeRoleGrants(auditDb([{ schema: 'public', name: 'audit_logs', held: ['SELECT'] }]) as never, 'app_service');
    expect(a.denied).toEqual([{ relation: 'public.audit_logs', missing: ['INSERT'] }]);
  });

  it('TRUNCATE on an audit-schema relation is EXCESS too', async () => {
    const a = await auditRuntimeRoleGrants(
      auditDb([{ schema: 'audit', name: 'tamper_proof_log', held: ['SELECT', 'INSERT', 'TRUNCATE'] }]) as never,
      'app_service',
    );
    expect(a.excess).toEqual([{ relation: 'audit.tamper_proof_log', held: ['TRUNCATE'] }]);
  });

  it('a public store the runtime role OWNS is a failure (ownership confers every privilege)', async () => {
    const a = await auditRuntimeRoleGrants(auditDb([{ schema: 'public', name: 'audit_logs', owned: true }]) as never, 'app_service');
    expect(a.ownedAppendOnly).toEqual(['public.audit_logs']);
    expect(a.excess).toEqual([]);
  });

  it('electronic_signatures: the supersession columns are required, any other updatable column is EXCESS', async () => {
    const supersession = Object.fromEntries(SUPERSESSION.map((c) => [c, true]));
    const esig = (held: string[] | undefined, cols: Record<string, boolean>) =>
      auditRuntimeRoleGrants(
        auditDb([{ schema: 'public', name: 'electronic_signatures', held }], { 'public.electronic_signatures': cols }) as never,
        'app_service',
      );

    const clean = await esig(['SELECT', 'INSERT'], { ...supersession, signer_id: false, signature_hash: false });
    expect([clean.excess, clean.denied]).toEqual([[], []]);

    const widened = await esig(['SELECT', 'INSERT'], { ...supersession, verification_date: false, signature_hash: true });
    expect(widened.excess).toEqual([{ relation: 'public.electronic_signatures', held: ['UPDATE(signature_hash)'] }]);
    expect(widened.denied).toEqual([{ relation: 'public.electronic_signatures', missing: ['UPDATE(verification_date)'] }]);

    // Table-level UPDATE is reported once, as UPDATE — not column by column.
    const tableWide = await esig(undefined, { ...supersession, signature_hash: true });
    expect(tableWide.excess).toEqual([{ relation: 'public.electronic_signatures', held: ['UPDATE', 'DELETE'] }]);
  });
});
