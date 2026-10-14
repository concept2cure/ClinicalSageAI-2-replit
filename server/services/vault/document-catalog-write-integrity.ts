/** Exact source admission and persistence receipts for existing catalog writes. */
import { createHash } from 'node:crypto';
import { lockDocumentDispositionProgram } from '../document-data-disposition/program-lock.js';
import { vaultDataEligibleSql, vaultBinaryAvailableSql } from '../document-data-disposition/eligibility.js';
import { supersededSql } from './vault-version-family.js';
import { CatalogAdmissionError } from './document-catalog-admission.js';
type Client = import('pg').PoolClient;

export const HASH_RE = /^[0-9a-f]{64}$/i;
export const textDigest = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/** The explicit table order also fences arbitrary successor/extraction DML;
 * an individual predecessor lock does not block a successor INSERT. */
export async function reserveCatalogWrite(client: Client, organizationId: number, programId: string): Promise<void> {
  await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
  await client.query("SET LOCAL statement_timeout = '30s'");
  await lockDocumentDispositionProgram(client, organizationId, programId);
  await client.query('LOCK TABLE vault.document_catalog IN ROW EXCLUSIVE MODE');
  await client.query('LOCK TABLE vault.documents IN SHARE MODE');
}

export interface CatalogSourceRow extends Record<string, any> {
  id: string; program_id: string; organization_id: number; content_hash: string;
  extracted_text: string | null; catalog_content_hash: string | null;
}

export async function lockedCatalogSource(client: Client, args: { documentId: string; programId: string; organizationId: number }): Promise<CatalogSourceRow> {
  const { rows } = await client.query(
    `SELECT d.id, d.program_id, d.organization_id, d.document_title, d.content_hash, d.extracted_text,
            ${vaultDataEligibleSql('d')} AS data_eligible, ${vaultBinaryAvailableSql('d')} AS original_file_available,
            ${supersededSql('d')} AS superseded, c.content_hash AS catalog_content_hash,
            c.catalog_status, c.extraction_method, c.extraction_error
       FROM vault.documents d LEFT JOIN vault.document_catalog c ON c.document_id = d.id
      WHERE d.id = $1 AND d.program_id = $2 AND d.organization_id = $3 AND d.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM regulatory_programs rp WHERE rp.id = d.program_id
                    AND rp.organization_id = $3 AND rp.deleted_at IS NULL)
      FOR UPDATE OF d`,
    [args.documentId, args.programId, args.organizationId],
  );
  if (rows.length !== 1 || rows[0].id !== args.documentId || rows[0].program_id?.toLowerCase() !== args.programId.toLowerCase()
      || rows[0].organization_id !== args.organizationId) {
    throw new CatalogAdmissionError(404, 'DOCUMENT_NOT_FOUND', 'No such current document in this project. Nothing was saved.');
  }
  return rows[0];
}

export function sourceProblem(row: Record<string, any>, organizationId: number): string | null {
  if (row.data_eligible !== true) return 'SOURCE_DATA_WITHDRAWN';
  if (row.superseded !== false) return 'SOURCE_SUPERSEDED';
  if (row.organization_id !== organizationId || typeof row.content_hash !== 'string' || !HASH_RE.test(row.content_hash)) return 'SOURCE_IDENTITY_UNVERIFIED';
  if (row.catalog_content_hash !== row.content_hash) return 'SOURCE_VERSION_CHANGED';
  if (typeof row.extracted_text !== 'string' || !row.extracted_text.trim() || row.catalog_status === 'extraction_failed') return 'EXTRACTION_UNAVAILABLE';
  return null;
}

export function requireWritableSource(row: CatalogSourceRow, organizationId: number, expectedHash?: string, expectedText?: string): string {
  const problem = sourceProblem(row, organizationId) ?? (row.original_file_available !== true ? 'SOURCE_ORIGINAL_UNAVAILABLE' : null);
  if (problem) throw new CatalogAdmissionError(409, problem, 'This source is no longer eligible for catalog changes. Review its current source status. Nothing was saved.');
  if (expectedHash !== undefined && expectedHash !== row.content_hash) {
    throw new CatalogAdmissionError(409, 'CONFLICT', 'This document has a newer version than the one shown. Reload and review it. Nothing was saved.');
  }
  const digest = textDigest(row.extracted_text!);
  if (expectedText !== undefined && (!HASH_RE.test(expectedText) || expectedText.toLowerCase() !== digest)) {
    throw new CatalogAdmissionError(409, 'EXTRACTION_CHANGED', 'The extracted text changed after it was shown. Reload and review the current source. Nothing was saved.');
  }
  return digest;
}

export function requireUpdateReceipt(result: { rows: any[]; rowCount: number | null }, documentId: string, contentHash: string): void {
  if (result.rowCount !== 1 || result.rows.length !== 1 || result.rows[0].document_id !== documentId
      || result.rows[0].content_hash !== contentHash || typeof result.rows[0].revision !== 'string') {
    throw new CatalogAdmissionError(409, 'CATALOG_NOT_SAVED', 'The catalog write did not return one verified persistence receipt. Nothing was saved.');
  }
}

export function missingVectorOperation(err: unknown): boolean {
  const { code, message } = (err ?? {}) as { code?: unknown; message?: unknown };
  return typeof message === 'string' && (
    (code === '42703' && /column (?:"embedding"|'embedding'|embedding\b)/i.test(message))
    || (code === '42704' && /type ["']?vector["']? does not exist/i.test(message))
    || (code === '0A000' && /\bvector\b/i.test(message))
  );
}

