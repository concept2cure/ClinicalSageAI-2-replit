/** Historical correspondence stationery, read by the canonical Authoring exporter. */
import type { CompanyDocumentProfile } from '../../../shared/company-documents';
import type { RequestSqlClient } from '../../db/requestDb';
import { readCompanyPresentationRevision } from './history';
import { companyProfileHash, CompanyDocumentsError } from './profile';
import { z } from 'zod';

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const presentationOrigin = z.object({ version: z.literal(1), organizationId: z.number().int().positive(), programId: z.string().uuid(),
  companyDocumentRevision: z.number().int().nonnegative(), companyProfileHash: z.string().regex(/^[a-f0-9]{64}$/),
  companyBrandingApplied: z.boolean(), variantId: z.string().uuid().optional(), explicitSelection: z.literal(true).optional() })
  .refine(value => !value.explicitSelection || Boolean(value.variantId && value.companyBrandingApplied));

export async function readCorrespondencePresentation(q: RequestSqlClient, organizationId: number,
  doc: { client_program_id?: string | null; provenance?: unknown }): Promise<CompanyDocumentProfile | null> {
  const raw = record(doc.provenance).companyCorrespondence;
  if (raw === undefined) return null;
  const parsed = presentationOrigin.safeParse(raw);
  if (!parsed.success || parsed.data.organizationId !== organizationId || parsed.data.programId !== doc.client_program_id) {
    throw new CompanyDocumentsError(409, 'CORRESPONDENCE_PRESENTATION_UNVERIFIED', 'The correspondence presentation reference could not be verified. Nothing was rendered.');
  }
  const origin = parsed.data;
  const profile = origin.variantId ? await readCompanyPresentationRevision(q, organizationId, Number(origin.companyDocumentRevision), String(origin.variantId))
    : await readCompanyPresentationRevision(q, organizationId, Number(origin.companyDocumentRevision));
  if (profile.variantId !== origin.variantId || companyProfileHash(profile) !== origin.companyProfileHash
    || (!origin.explicitSelection && profile.applyToSubmissionCorrespondence !== origin.companyBrandingApplied)) {
    throw new CompanyDocumentsError(409, 'CORRESPONDENCE_PRESENTATION_CHANGED', 'The retained presentation does not match this correspondence draft. Nothing was rendered.');
  }
  return origin.companyBrandingApplied ? profile : null;
}

export function correspondenceTemplate(profile: CompanyDocumentProfile) {
  return { ...profile.letterhead, brand: { ...profile.letterhead.brand, organizationName: profile.companyName },
    header: { ...profile.letterhead.header, alignment: profile.letterhead.header?.alignment ?? 'left',
      text: [profile.address, profile.contact, profile.registrationDetails, profile.letterhead.header?.text].filter(Boolean).join('\n') } };
}

