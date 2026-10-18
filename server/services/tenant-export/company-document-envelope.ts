import { createHash } from 'node:crypto';
import { canonicalize } from './canonical-json';
import type { Pool, PoolClient } from 'pg';

export const COMPANY_DOCUMENT_EXPORT_TABLES = ['company_document_revisions', 'company_document_grants',
  'company_document_identity_reviews', 'company_document_designs', 'company_legal_registry'] as const;
type CompanyTables = Record<string, Record<string, unknown>[]>;

function orderedRows(rows: Array<{ row: Record<string, unknown> }>) {
  return rows.map(value => value.row).sort((a, b) => {
    const left = canonicalize(a); const right = canonicalize(b);
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

async function includeReferencedDesignTemplates(client: Pool | PoolClient, organizationId: number, tables: CompanyTables) {
  if (!Object.hasOwn(tables, 'company_document_designs')) return;
  const { rows } = await client.query<{ row: Record<string, unknown> }>(`SELECT to_jsonb(t) AS row
    FROM public.c2c_template_specs t WHERE t.org_id=$1
      AND EXISTS(SELECT 1 FROM public.company_document_designs d WHERE d.organization_id=$1 AND d.template_id=t.id)
    FOR SHARE OF t`, [organizationId]);
  tables.c2c_template_specs = orderedRows(rows);
  const returned = new Set(rows.map(value => value.row.id));
  if (tables.company_document_designs.some(design => !returned.has(design.template_id))) {
    throw new Error('A referenced company presentation template could not be returned for this organization.');
  }
}

export interface CompanyDocumentsExportDescriptor {
  schemaVersion: 1;
  present: boolean;
  sha256: string;
}
export interface CompanyDocumentsExportEnvelope extends CompanyDocumentsExportDescriptor {
  organizationId: number;
  /** Exactly the company section, including retained legal metadata; no other settings. */
  data: unknown;
  profilePresent: boolean;
  /** Canonical company metadata, including variants and legal registry rows.
   * Original Vault binary delivery remains the existing source-data return. */
  tables: CompanyTables;
}
export interface CompanyDocumentsExportRow {
  company_documents_present: boolean;
  company_documents: unknown;
}

/** Explicit projection: unrelated organization settings and credentials never enter the return. */
export const COMPANY_DOCUMENT_EXPORT_COLUMNS = `
  COALESCE(jsonb_typeof(to_jsonb(o.settings))='object' AND to_jsonb(o.settings) ? 'companyDocuments', false) AS company_documents_present,
  to_jsonb(o.settings)->'companyDocuments' AS company_documents`;

export function companyDocumentsExportEnvelope(organizationId: number, row: CompanyDocumentsExportRow, tables: CompanyTables = {}): CompanyDocumentsExportEnvelope {
  if (typeof row.company_documents_present !== 'boolean') throw new Error('Company document export completeness could not be verified.');
  const value = { schemaVersion: 1 as const, organizationId,
    present: row.company_documents_present || Object.values(tables).some(rows => rows.length > 0),
    profilePresent: row.company_documents_present,
    data: row.company_documents_present ? row.company_documents : null, tables };
  if (value.profilePresent && value.data === undefined) throw new Error('Company document export data could not be verified.');
  return { ...value, sha256: createHash('sha256').update(canonicalize(value)).digest('hex') };
}

/** Call inside the export's held organization snapshot, or the purge's locked
 * transaction. Missing tables are represented by catalog absence; a table that
 * exists but cannot be read aborts completeness rather than becoming empty. */
export async function readCompanyDocumentsExportEnvelope(client: Pool | PoolClient, organizationId: number,
  row: CompanyDocumentsExportRow): Promise<CompanyDocumentsExportEnvelope> {
  const discovered = await client.query<{ company_table: string }>(`SELECT c.relname AS company_table
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname=ANY($1::text[])
      AND EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attname='organization_id' AND NOT a.attisdropped)
    ORDER BY c.relname`, [[...COMPANY_DOCUMENT_EXPORT_TABLES]]);
  const tables: CompanyTables = {};
  for (const { company_table: table } of discovered.rows) {
    if (!(COMPANY_DOCUMENT_EXPORT_TABLES as readonly string[]).includes(table) || Object.hasOwn(tables, table)) {
      throw new Error('Company document export catalog completeness could not be verified.');
    }
    const { rows } = await client.query<{ row: Record<string, unknown> }>(
      `SELECT to_jsonb(t) AS row FROM public."${table}" t WHERE organization_id=$1`, [organizationId]);
    tables[table] = orderedRows(rows);
  }
  await includeReferencedDesignTemplates(client, organizationId, tables);
  return companyDocumentsExportEnvelope(organizationId, row, tables);
}

/** Safe for the receipt and audit ledger; the private preimage remains in the customer export. */
export function companyDocumentsExportDescriptor(envelope: CompanyDocumentsExportEnvelope): CompanyDocumentsExportDescriptor {
  return { schemaVersion: envelope.schemaVersion, present: envelope.present, sha256: envelope.sha256 };
}

export function validCompanyDocumentsExportDescriptor(value: unknown): value is CompanyDocumentsExportDescriptor {
  const d = value as Partial<CompanyDocumentsExportDescriptor> | null;
  return d?.schemaVersion === 1 && typeof d.present === 'boolean' && typeof d.sha256 === 'string' && /^[a-f0-9]{64}$/.test(d.sha256);
}
