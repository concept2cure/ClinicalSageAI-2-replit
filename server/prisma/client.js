/**
 * Prisma-compatible wrapper over Drizzle ORM
 *
 * Maps Prisma-style API calls (create, findMany, findFirst, update, delete, upsert)
 * to the real Drizzle database via raw SQL through the pg pool.
 *
 * Tables: audit_logs, documents, electronic_signatures
 *
 * Tenant isolation (added 2026-05-07):
 *   findMany / findUnique calls on tenant-scoped tables (audit_log,
 *   document, signature) MUST pass an org/tenant/document/signer filter
 *   in `where`. Calls without one throw at runtime instead of silently
 *   returning cross-tenant rows. This converts the worst class of
 *   tenant-bleed bug into a loud error.
 *
 * Active consumers:
 *   server/services/semanticSearch.js → study_document.upsert (no-op stub).
 *   server/pipelines/bulk_import.js   → study_document.upsert (no-op stub).
 *   The non-stub methods (audit_log/document/signature) currently have no
 *   live consumers, but the guards above are in place for when they do.
 */

import { pool } from '../db.js';

// ---------------------------------------------------------------------------
// Safe default result cap (performance / GA hardening)
//
//   findMany calls where `take` is optional could previously load an entire
//   table into memory if a caller forgot a limit. We apply a sane default
//   maximum so an unbounded query can never page the whole table. When a
//   caller passes an explicit `take`, that value is respected unchanged.
//
//   Override via PRISMA_FIND_MANY_DEFAULT_LIMIT if a deployment legitimately
//   needs a larger default (e.g. a large export job that pages through a
//   tenant's full audit trail). Large exports should still prefer passing an
//   explicit `take` so the cap is a deliberate choice, not an accident.
// ---------------------------------------------------------------------------
const DEFAULT_FIND_MANY_LIMIT = (() => {
  const raw = Number.parseInt(process.env.PRISMA_FIND_MANY_DEFAULT_LIMIT ?? '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 1000;
})();

// Resolve the effective LIMIT for a findMany call: honor an explicit `take`,
// otherwise fall back to the safe default cap.
function resolveTake(take) {
  return take !== undefined && take !== null ? take : DEFAULT_FIND_MANY_LIMIT;
}

// ---------------------------------------------------------------------------
// Helper: execute a raw query against the pg pool (returns rows)
// ---------------------------------------------------------------------------
async function rawQuery(text, params = []) {
  if (!pool) {
    throw new Error('[prisma/client] Database pool is not available');
  }
  const result = await pool.query(text, params);
  return result.rows;
}

// ---------------------------------------------------------------------------
// audit_log  →  maps to the `audit_logs` table in the Drizzle schema
// ---------------------------------------------------------------------------
const audit_log = {
  async create({ data } = {}) {
    const d = data ?? {};
    const rows = await rawQuery(
      `INSERT INTO audit_logs (tenant_id, user_id, action, table_name, record_id, old_values, new_values, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        d.tenantId ?? d.tenant_id ?? 0,
        d.userId ?? d.user_id ?? null,
        d.action ?? 'unknown',
        d.tableName ?? d.table_name ?? 'unknown',
        d.recordId ?? d.record_id ?? '',
        d.oldValues ?? d.old_values ? JSON.stringify(d.oldValues ?? d.old_values) : null,
        d.newValues ?? d.new_values ? JSON.stringify(d.newValues ?? d.new_values) : null,
        d.ipAddress ?? d.ip_address ?? null,
        d.userAgent ?? d.user_agent ?? null,
      ]
    );
    return rows[0];
  },

  async findMany({ where, orderBy, take } = {}) {
    // Tenant-isolation guard: audit_logs.tenant_id is required. Reading
    // every tenant's audit log from one query would be a §11.10(d) breach
    // (data segregation) and a §11.10(e) breach (audit-trail integrity).
    // Convert the silent failure mode (forgot the filter) into a loud one.
    if (!where || (where.tenantId === undefined && where.tenant_id === undefined)) {
      throw new Error(
        '[prisma/client] audit_log.findMany requires where.tenantId — ' +
          'cross-tenant audit reads are forbidden. If you genuinely need a ' +
          'cross-tenant view (admin / chain-integrity check), use the ' +
          'audit-archive service directly with an explicit operator audit event.'
      );
    }

    let sql = 'SELECT * FROM audit_logs';
    const params = [];
    const clauses = [];

    for (const [key, val] of Object.entries(where)) {
      if (val !== undefined) {
        params.push(val);
        clauses.push(`${key} = $${params.length}`);
      }
    }
    if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
    sql += ' ORDER BY created_at DESC';
    // Always apply a LIMIT: explicit `take` when provided, else the safe
    // default cap so an unbounded read can't load the whole table.
    params.push(resolveTake(take));
    sql += ` LIMIT $${params.length}`;
    return rawQuery(sql, params);
  },
};

// ---------------------------------------------------------------------------
// document  →  maps to the `documents` table in the Drizzle schema
// ---------------------------------------------------------------------------
const document = {
  async create({ data } = {}) {
    const d = data ?? {};
    const rows = await rawQuery(
      `INSERT INTO documents (organization_id, client_workspace_id, document_code, title, document_type, status, owner_id, created_by_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        d.organizationId ?? d.organization_id ?? 0,
        d.clientWorkspaceId ?? d.client_workspace_id ?? 0,
        d.documentCode ?? d.document_code ?? `DOC-${Date.now()}`,
        d.title ?? 'Untitled',
        d.documentType ?? d.document_type ?? 'General',
        d.status ?? 'draft',
        d.ownerId ?? d.owner_id ?? 0,
        d.createdById ?? d.created_by_id ?? 0,
      ]
    );
    return rows[0];
  },

  async findMany({ where, orderBy, take } = {}) {
    // Tenant-isolation guard: documents.organization_id is required. A
    // findMany without an org filter would page through every tenant's
    // documents and is the worst class of cross-tenant bug.
    if (
      !where ||
      (where.organizationId === undefined &&
        where.organization_id === undefined &&
        where.clientWorkspaceId === undefined &&
        where.client_workspace_id === undefined)
    ) {
      throw new Error(
        '[prisma/client] document.findMany requires where.organizationId or ' +
          'where.clientWorkspaceId — cross-tenant document reads are forbidden.'
      );
    }

    let sql = 'SELECT * FROM documents';
    const params = [];
    const clauses = [];

    for (const [key, val] of Object.entries(where)) {
      if (val !== undefined) {
        params.push(val);
        clauses.push(`${key} = $${params.length}`);
      }
    }
    if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
    sql += ' ORDER BY created_at DESC';
    // Always apply a LIMIT: explicit `take` when provided, else the safe
    // default cap so an unbounded read can't load the whole table.
    params.push(resolveTake(take));
    sql += ` LIMIT $${params.length}`;
    return rawQuery(sql, params);
  },

  async findUnique({ where } = {}) {
    // Tenant-isolation guard: even PK lookups must scope by org, because a
    // tenant who knows another tenant's document UUID can otherwise read it.
    if (!where || !where.id) return null;
    if (where.organizationId === undefined && where.organization_id === undefined) {
      throw new Error(
        '[prisma/client] document.findUnique requires where.organizationId in ' +
          'addition to where.id — UUID-only lookups can leak across tenants.'
      );
    }
    const orgId = where.organizationId ?? where.organization_id;
    const rows = await rawQuery(
      'SELECT * FROM documents WHERE id = $1 AND organization_id = $2 LIMIT 1',
      [where.id, orgId]
    );
    return rows[0] ?? null;
  },

  async findFirst({ where } = {}) {
    return this.findUnique({ where });
  },

  async update({ where, data } = {}) {
    if (!where?.id) throw new Error('update requires where.id');
    const setClauses = [];
    const params = [];
    for (const [key, val] of Object.entries(data ?? {})) {
      params.push(val);
      setClauses.push(`${key} = $${params.length}`);
    }
    if (!setClauses.length) return this.findUnique({ where });
    params.push(where.id);
    const rows = await rawQuery(
      `UPDATE documents SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
      params
    );
    return rows[0];
  },

  async delete({ where } = {}) {
    if (!where?.id) throw new Error('delete requires where.id');
    const rows = await rawQuery('DELETE FROM documents WHERE id = $1 RETURNING *', [where.id]);
    return rows[0];
  },
};

// ---------------------------------------------------------------------------
// signature  →  maps to the `electronic_signatures` table
// ---------------------------------------------------------------------------
const signature = {
  // `create` deleted (ledger L137). It inserted into electronic_signatures with
  // document_id defaulting to 0 and signer_name, signer_email and
  // signature_hash defaulting to '' — a 21 CFR 11.50 printed name and a §11.200
  // attribution hash written as empty strings, which are indistinguishable from
  // real values once stored. It had no caller, which is why this is a deletion
  // rather than an incident, and it bypassed persistElectronicSignature, so
  // reviving it would have reopened the single-writer property L37 established.
  // A signature written here belongs in server/services/part11.

  async findMany({ where, orderBy, take } = {}) {
    // Tenant-isolation guard: electronic_signatures must be scoped to a
    // specific document or signer. Returning every signature in the
    // database from a no-where call is a §11.50 breach.
    if (
      !where ||
      (where.documentId === undefined &&
        where.document_id === undefined &&
        where.signerId === undefined &&
        where.signer_id === undefined)
    ) {
      throw new Error(
        '[prisma/client] signature.findMany requires where.documentId or ' +
          'where.signerId — unscoped signature reads are forbidden.'
      );
    }

    let sql = 'SELECT * FROM electronic_signatures';
    const params = [];
    const clauses = [];

    for (const [key, val] of Object.entries(where)) {
      if (val !== undefined) {
        params.push(val);
        clauses.push(`${key} = $${params.length}`);
      }
    }
    if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
    sql += ' ORDER BY signed_at DESC';
    // Always apply a LIMIT: explicit `take` when provided, else the safe
    // default cap so an unbounded read can't load the whole table.
    params.push(resolveTake(take));
    sql += ` LIMIT $${params.length}`;
    return rawQuery(sql, params);
  },
};

// ---------------------------------------------------------------------------
// study_document  →  table does NOT exist in schema.
//   Previously consumed by semanticSearch.js / bulk_import.js (deleted in
//   Phase 2 retrieval convergence, 2026-04-22). Kept as warning-logging
//   no-ops so any surviving caller surfaces loudly rather than silently.
// ---------------------------------------------------------------------------
const study_document = {
  async create({ data } = {}) {
    console.warn('[prisma/client] study_document table not yet in schema — create is a no-op');
    return null;
  },

  async findMany() {
    console.warn('[prisma/client] study_document table not yet in schema — findMany is a no-op');
    return [];
  },

  async upsert({ where, update, create } = {}) {
    console.warn('[prisma/client] study_document table not yet in schema — upsert is a no-op');
    return null;
  },
};

// ---------------------------------------------------------------------------
// $queryRaw — previously used by semanticSearch.js (deleted in Phase 2).
//   Kept as a generic tagged-template passthrough in case another Prisma-
//   style caller appears; has no active consumers today.
// ---------------------------------------------------------------------------
async function $queryRaw(strings, ...values) {
  if (!pool) {
    throw new Error('[prisma/client] Database pool is not available');
  }
  // Tagged template → parameterised SQL
  let sql = '';
  const params = [];
  for (let i = 0; i < strings.length; i++) {
    sql += strings[i];
    if (i < values.length) {
      params.push(values[i]);
      sql += `$${params.length}`;
    }
  }
  const result = await pool.query(sql, params);
  return result.rows;
}

// ---------------------------------------------------------------------------
// Export as default (matches original `import prisma from '../prisma/client.js'`)
// ---------------------------------------------------------------------------
const prisma = {
  audit_log,
  document,
  signature,
  study_document,
  $queryRaw,
};

export default prisma;
