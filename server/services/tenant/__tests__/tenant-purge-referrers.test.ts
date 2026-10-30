/**
 * The referrer block and the tables the purge does not erase (D6, 2026-10-29;
 * docs/evidence/D6-TENANT-PURGE-BLOCKING-KEYS/2026-10-29/).
 *
 * purge-referrers.ts holds the 149 tables that name a project, a workspace, a
 * document or a program with no delete action, spread into PURGE_CHILD_TABLES
 * before `projects`. Since P-58 (2026-10-29;
 * docs/evidence/D6-OFFBOARDING-CUSTODY/2026-10-29/) it also holds the tables
 * that were held out of the purge (signatures, audit trails, sealed reports,
 * ledgers, the IVDR histories, reg_questions, review routes), each before the
 * rows it names, and PURGE_REFERRERS_NOT_ERASED is empty. The platform's own
 * record of a purge (PURGE_PLATFORM_RECORDS) is never erased: no injected list
 * may name it, and the purge refuses one that does before any query.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import {
  purgeTenant, PURGE_CHILD_TABLES, PURGE_DOORS, PURGE_PLATFORM_RECORDS, PURGE_REFERRERS_NOT_ERASED, PURGE_RETAINED_RECORDS,
} from '../tenant-offboarding';
import { PURGE_REFERRER_TABLES } from '../purge-referrers';
import { HELD_RECORD_STORES } from '../held-records';

vi.mock('../../../middleware/orgMembership', () => ({ invalidateOrgMembershipCache: vi.fn() }));

describe('the referrer block', () => {
  it('is spread into the purge list in its own order, before projects', () => {
    const at = PURGE_CHILD_TABLES.indexOf(PURGE_REFERRER_TABLES[0]);
    expect(at).toBeGreaterThan(-1);
    expect(PURGE_CHILD_TABLES.slice(at, at + PURGE_REFERRER_TABLES.length)).toEqual([...PURGE_REFERRER_TABLES]);
    expect(at + PURGE_REFERRER_TABLES.length).toBeLessThanOrEqual(PURGE_CHILD_TABLES.indexOf('projects'));
    expect(new Set(PURGE_CHILD_TABLES).size).toBe(PURGE_CHILD_TABLES.length);
  });

  it('names documents before projects and client_workspaces, which each document names with no cascade', () => {
    const at = (t: string) => PURGE_CHILD_TABLES.indexOf(t);
    expect(at('documents')).toBeGreaterThan(-1);
    expect(at('documents')).toBeLessThan(at('projects'));
    expect(at('documents')).toBeLessThan(at('client_workspaces'));
  });
});

describe('the held records (P-58, 2026-10-29)', () => {
  const at = (t: string) => PURGE_CHILD_TABLES.indexOf(t);

  it('none is held out of the purge any more: every held store is on the list', () => {
    expect(PURGE_REFERRERS_NOT_ERASED).toEqual({});
    expect(Object.isFrozen(PURGE_REFERRERS_NOT_ERASED)).toBe(true);
    for (const s of HELD_RECORD_STORES) expect(at(s.table), s.table).toBeGreaterThan(-1);
  });

  it.each([
    ['compliance_review_records', 'electronic_signatures'],
    ['electronic_signatures', 'document_versions'],
    ['document_audit_trail', 'document_versions'],
    ['task_dependencies', 'unified_tasks'],
    ['unified_tasks', 'review_routes'],
    ['report_seal_events', 'immutable_report_records'],
    ['indemnification_attestations', 'immutable_report_records'],
    ['report_atom_provenance', 'immutable_report_records'],
    ['immutable_report_records', 'projects'],
    ['governance_boundary_transitions', 'projects'],
    ['data_lineage_records', 'projects'],
    ['account_events', 'account_canon_items'],
    ['cer_approvals', 'project_documents'],
    ['reg_messages', 'reg_questions'],
    ['reg_responses', 'reg_questions'],
    ['reg_questions', 'reg_attachments'],
    ['gate_approvals', 'stage_gates'],
    ['ivdr_validation_parameter_history', 'ivdr_analytical_validations'],
    ['ivdr_evidence_result_history', 'ivdr_clinical_evidence'],
    ['ivdr_cdx_status_history', 'ivdr_cdx_workflows'],
  ])('%s is erased before %s, which it names', (child, parent) => {
    expect(at(child)).toBeGreaterThan(-1);
    expect(at(child)).toBeLessThan(at(parent));
  });

  it('each table that refuses a plain DELETE has exactly one door, and each door table is on the list', () => {
    const doorTables = PURGE_DOORS.flatMap((d) => [...d.tables]);
    expect(new Set(doorTables).size).toBe(doorTables.length);
    for (const t of ['electronic_signatures', 'compliance_review_records', 'document_audit_trail', 'data_lineage_records',
      'evidence_chain_records', 'ivdr_validation_parameter_history', 'ivdr_evidence_result_history', 'ivdr_cdx_status_history',
      'reg_questions', 'unified_tasks', 'review_routes']) {
      expect(doorTables, t).toContain(t);
      expect(at(t), t).toBeGreaterThan(-1);
    }
  });
});

describe("the platform's record of a purge", () => {
  it('is never on the list, nor retained or held twice', () => {
    for (const [table, reason] of Object.entries(PURGE_PLATFORM_RECORDS)) {
      expect(reason.trim().length, table).toBeGreaterThan(40);
      expect(PURGE_CHILD_TABLES, table).not.toContain(table);
      expect(Object.keys(PURGE_RETAINED_RECORDS), table).not.toContain(table);
      expect(Object.keys(PURGE_REFERRERS_NOT_ERASED), table).not.toContain(table);
    }
    expect(Object.keys(PURGE_PLATFORM_RECORDS)).toEqual(['tenant_export_receipts', 'tenant_offboarding_certificates']);
  });

  it.each(Object.keys(PURGE_PLATFORM_RECORDS))('%s on an injected list is refused before any query', async (table) => {
    const query = vi.fn();
    const pool = { query, connect: vi.fn() } as unknown as Pool;
    await expect(purgeTenant(pool, {
      organizationId: 11, purgedByUserId: 7, preconditions: { finalExportDigest: 'x' }, childTables: ['projects', table],
    })).rejects.toMatchObject({ code: 'PURGE_RETAINED_RECORD' });
    expect(query).not.toHaveBeenCalled();
  });
});
