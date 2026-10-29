/**
 * The sponsor's own CSR appendices (§16.1.x and §16.3), supplied from the
 * project's Vault by exact version (2026-10-30, reach of slice 8).
 *
 * The assembler (csr-assembly.ts) already takes a supplied appendix only as a
 * PDF named by its SHA-256, and refuses anything else. This module is the one
 * place a Vault document becomes that input:
 *   - candidates: the current, data-eligible PDFs of the build's project whose
 *     bytes are stored, with their digests, for the board to offer;
 *   - materialize: the named document, read again at assembly time, held to the
 *     project, the current version and the digest the user chose; its bytes are
 *     read through the Vault's verified reader and written to the assembly's
 *     working folder. A document that changed since it was chosen is refused,
 *     never substituted.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Queryable } from '../authoring/authoring-evidence.js';
import { vaultBinaryAvailableSql, vaultDataEligibleSql } from '../document-data-disposition/eligibility.js';
import { supersededSql } from '../vault/vault-version-family.js';
import { CSR_SUPPLIED_APPENDICES, type CsrSuppliedAppendix } from './csr-assembly-plan.js';
import { CsrAssemblyError, type SuppliedAppendixDocument } from './csr-assembly.js';

export interface SuppliedChoice { documentId: string; sha256: string }
export type SuppliedChoices = Partial<Record<CsrSuppliedAppendix, SuppliedChoice>>;
export interface SupplyScope { organizationId: number; programId: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const CANDIDATE_LIMIT = 200;

export const isSuppliedAppendix = (number: string): number is CsrSuppliedAppendix =>
  Object.prototype.hasOwnProperty.call(CSR_SUPPLIED_APPENDICES, number);

/** The request's supplied documents, checked for shape; an unknown appendix or a malformed id is refused by name. */
export function parseSuppliedChoices(raw: unknown): SuppliedChoices {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new CsrAssemblyError('CSR_ASSEMBLY_SUPPLIED_INVALID', 'Supplied appendices are named as { "16.1.1": { documentId, sha256 } }.');
  const out: SuppliedChoices = {};
  for (const [number, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isSuppliedAppendix(number)) throw new CsrAssemblyError('CSR_ASSEMBLY_SUPPLIED_INVALID', `Appendix ${number} is not a document the sponsor supplies (16.1.x or 16.3).`);
    const { documentId, sha256 } = (value ?? {}) as Record<string, unknown>;
    if (typeof documentId !== 'string' || !UUID.test(documentId) || typeof sha256 !== 'string' || !SHA256.test(sha256)) {
      throw new CsrAssemblyError('CSR_ASSEMBLY_SUPPLIED_INVALID', `Appendix ${number} must name a Vault document and its SHA-256.`);
    }
    out[number] = { documentId, sha256 };
  }
  return out;
}

/** The current-PDF filter beyond tenant and project (which each query states itself, as d.organization_id = $1
 * AND d.program_id = $2): the Vault's own fixed fragments for supersession, data eligibility and stored bytes. */
const CURRENT_PDF = `d.deleted_at IS NULL AND lower(d.file_name) LIKE '%.pdf' AND d.mime_type = 'application/pdf'
  AND NOT ${supersededSql('d')} AND ${vaultDataEligibleSql('d')} AND ${vaultBinaryAvailableSql('d')}`;

/** The project's current Vault PDFs a user may supply as an appendix. */
export async function listSuppliedCandidates(q: Queryable, scope: SupplyScope) {
  const { rows } = await q.query(`SELECT d.id::text AS document_id, d.document_title, d.version, d.content_hash, d.file_name
    FROM vault.documents d WHERE d.organization_id = $1 AND d.program_id = $2 AND ${CURRENT_PDF}
    ORDER BY d.document_title, d.id LIMIT $3`,
  [scope.organizationId, scope.programId, CANDIDATE_LIMIT + 1]);
  const list = (rows as Array<Record<string, unknown>>).filter(r => typeof r.content_hash === 'string' && SHA256.test(r.content_hash));
  return {
    limitReached: rows.length > CANDIDATE_LIMIT,
    documents: list.slice(0, CANDIDATE_LIMIT).map(r => ({ documentId: String(r.document_id), title: String(r.document_title ?? r.file_name),
      version: String(r.version ?? ''), fileName: String(r.file_name), sha256: String(r.content_hash) })),
  };
}

type VaultRow = { id: string; content_hash: string; storage_version_id: string | null; storage_provider: string | null; s3_key: string | null };
export type ReadVaultBytes = (row: VaultRow, organizationId: number) => Promise<Buffer>;

async function defaultReadVaultBytes(row: VaultRow, organizationId: number): Promise<Buffer> {
  const { readVerifiedVaultBytes } = await import('../../routes/c2c/project-vault.js');
  const read = await readVerifiedVaultBytes({ organizationId, storageVersionId: row.storage_version_id, storageProvider: row.storage_provider,
    storageKey: row.s3_key }, row.content_hash, row.id);
  if (!read.ok) throw new CsrAssemblyError('CSR_ASSEMBLY_SUPPLIED_UNREADABLE', `The stored file of Vault document ${row.id} could not be read (${read.error}).`);
  return read.bytes;
}

/** Each chosen document, re-read now and written into `dir`, as the assembler's supplied input. */
export async function materializeSupplied(q: Queryable, scope: SupplyScope, choices: SuppliedChoices, dir: string,
  readBytes: ReadVaultBytes = defaultReadVaultBytes): Promise<Partial<Record<CsrSuppliedAppendix, SuppliedAppendixDocument>>> {
  const out: Partial<Record<CsrSuppliedAppendix, SuppliedAppendixDocument>> = {};
  const entries = Object.entries(choices) as Array<[CsrSuppliedAppendix, SuppliedChoice]>;
  if (entries.length) await fs.mkdir(dir, { recursive: true });
  for (const [number, choice] of entries) {
    const { rows } = await q.query(`SELECT d.id::text AS id, d.content_hash, d.storage_version_id, d.storage_provider, d.s3_key
      FROM vault.documents d WHERE d.id = $3 AND d.organization_id = $1 AND d.program_id = $2 AND ${CURRENT_PDF}`, [scope.organizationId, scope.programId, choice.documentId]);
    const row = rows[0] as VaultRow | undefined;
    if (!row) throw new CsrAssemblyError('CSR_ASSEMBLY_SUPPLIED_NOT_FOUND', `The document chosen for appendix ${number} is not a current PDF in this project's Vault.`);
    if (row.content_hash !== choice.sha256) throw new CsrAssemblyError('CSR_ASSEMBLY_SUPPLIED_DIGEST', `The document chosen for appendix ${number} has changed since it was chosen (SHA-256 differs). Choose it again.`);
    const file = path.join(dir, `${number.replace(/\./g, '-')}.pdf`);
    await fs.writeFile(file, await readBytes(row, scope.organizationId));
    out[number] = { path: file, sha256: choice.sha256 };
  }
  return out;
}
