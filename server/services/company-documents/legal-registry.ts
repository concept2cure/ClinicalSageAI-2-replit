import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { COMPANY_LEGAL_KINDS, type CompanyLegalDocument } from '../../../shared/company-documents';
import { CompanyDocumentsError } from './validation';

interface RegistryQuery {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const documentSchema = z.object({
  id: z.string().min(1), title: z.string().min(1), kind: z.enum(COMPANY_LEGAL_KINDS),
  programId: z.string().uuid(), vaultDocumentId: z.string().uuid(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i), version: z.string().min(1),
  agencies: z.array(z.string()), countries: z.array(z.string()), submissionTypes: z.array(z.string()),
  language: z.string().min(1), effectiveOn: date, expiresOn: date, active: z.boolean(),
  registeredAt: z.string().min(1), registeredBy: z.string().min(1),
  sourceOriginal: z.object({ registryId: z.string().min(1), vaultDocumentId: z.string().uuid(), programId: z.string().uuid(),
    version: z.string().min(1), contentHash: z.string().regex(/^[a-f0-9]{64}$/i) }).strict().optional(),
  workflow: z.object({}).passthrough().optional(),
}).passthrough();

function documentFromRow(row: { id?: unknown; document?: unknown }): CompanyLegalDocument {
  const parsed = documentSchema.safeParse(row.document);
  if (!parsed.success || row.id !== parsed.data.id) {
    throw new CompanyDocumentsError(409, 'LEGAL_REGISTRY_UNVERIFIED', 'The company legal registry contains an invalid record. No document can be assumed usable.');
  }
  return parsed.data as CompanyLegalDocument;
}

export function companyLegalRegistryDocuments(value: unknown): CompanyLegalDocument[] {
  if (!Array.isArray(value)) throw new CompanyDocumentsError(409, 'LEGAL_REGISTRY_UNVERIFIED', 'The company legal registry could not be verified.');
  return value.map(document => documentFromRow({ id: document?.id, document }));
}

/** Registry records are canonical after migration. Never fall back to settings,
 * and retain archived records for original-byte provenance and revocation. */
export async function readCompanyLegalRegistry(q: RegistryQuery, organizationId: number): Promise<CompanyLegalDocument[]> {
  const { rows } = await q.query(`SELECT id,document FROM public.company_legal_registry
    WHERE organization_id=$1 ORDER BY document->>'registeredAt',id`, [organizationId]);
  return rows.map(documentFromRow);
}

export async function readCompanyLegalRegistryForVault(q: RegistryQuery, organizationId: number,
  vaultDocumentId: string): Promise<CompanyLegalDocument[]> {
  const { rows } = await q.query(`SELECT id,document FROM public.company_legal_registry
    WHERE organization_id=$1 AND lower(document->>'vaultDocumentId')=lower($2)
    ORDER BY document->>'registeredAt',id`, [organizationId, vaultDocumentId]);
  return rows.map(documentFromRow);
}

/** Metadata-only admission for omitted inventory DTOs; no source approval
 * queries and no disclosure of inaccessible registry references. */
export async function readAccessibleCompanyLegalIds(q: RegistryQuery, organizationId: number, programIds: string[]): Promise<Set<string>> {
  const { rows } = await q.query(`SELECT id FROM public.company_legal_registry
    WHERE organization_id=$1 AND document->>'programId'=ANY($2::text[])`, [organizationId, programIds]);
  return new Set(rows.map(row => String(row.id)));
}

const IMMUTABLE = ['id', 'programId', 'vaultDocumentId', 'contentHash', 'version', 'registeredAt', 'registeredBy'] as const;
function validateChange(before: CompanyLegalDocument[], after: CompanyLegalDocument[]) {
  const previous = new Map(before.map(document => [document.id, document]));
  const next = new Map(after.map(document => [document.id, document]));
  if (next.size !== after.length || [...previous.keys()].some(id => !next.has(id))) {
    throw new CompanyDocumentsError(409, 'LEGAL_REGISTRY_RETENTION', 'Retain registered originals by archiving them rather than deleting their registry records.');
  }
  return after.flatMap(document => {
    documentFromRow({ id: document.id, document });
    const old = previous.get(document.id);
    if (old && (IMMUTABLE.some(key => old[key] !== document[key]) || !isDeepStrictEqual(old.sourceOriginal, document.sourceOriginal))) {
      throw new CompanyDocumentsError(409, 'LEGAL_REGISTRY_IDENTITY_CHANGED', 'A registered original’s Vault version and provenance cannot be changed. Register its replacement separately.');
    }
    return isDeepStrictEqual(old, document) ? [] : [{ old, document }];
  });
}

/** Caller holds the organization settings row lock and commits this delta with
 * revision, audit and lifecycle projections in the same transaction. A stale
 * row or a failed projection aborts the entire operation. */
export async function syncCompanyLegalRegistry(q: RegistryQuery, organizationId: number,
  before: CompanyLegalDocument[], after: CompanyLegalDocument[]): Promise<void> {
  for (const { old, document } of validateChange(before, after)) {
    const stored = { ...document };
    delete stored.transmitRefusal;
    const { rows } = old
      ? await q.query(`UPDATE public.company_legal_registry SET document=$3::jsonb
          WHERE organization_id=$1 AND id=$2 AND document=$4::jsonb RETURNING id`,
        [organizationId, document.id, JSON.stringify(stored), JSON.stringify(old)])
      : await q.query(`INSERT INTO public.company_legal_registry (organization_id,id,document)
          VALUES ($1,$2,$3::jsonb) ON CONFLICT (organization_id,id) DO NOTHING RETURNING id`,
        [organizationId, document.id, JSON.stringify(stored)]);
    if (rows.length !== 1) throw new CompanyDocumentsError(409, 'LEGAL_REGISTRY_CHANGED', 'The company legal registry changed. Reload before saving.');
  }
}
