/** Server-derived filing identity retained with correspondence and legal handoffs. */
export interface CompanyCorrespondenceOrigin {
  version: 1;
  organizationId: number;
  programId: string;
  projectId: number;
  submissionId: number;
  sequenceId: number;
  sequenceNumber: string;
  submissionTitle: string;
  applicationType: string;
  applicationNumber: string | null;
  applicantName: string | null;
  country: string;
  agency: string;
  recipient: { authority: string; basis: 'recorded_filing_market' };
  companyDocumentRevision: number;
  companyProfileHash: string;
  companyBrandingApplied: boolean;
  /** Explicit published stationery selection; absent uses the organization profile. */
  variantId?: string;
  explicitSelection?: true;
}

/** Exact version snapshot, independent of a later registry edit or agency outcome. */
export interface CompanyLegalCommunicationLink {
  registryId: string;
  programId: string;
  vaultDocumentId: string;
  version: string;
  contentHash: string;
  linkedAt: string;
  linkedBy: number;
  outcome: 'referenced' | 'acknowledged' | 'questioned' | 'replacement_requested' | 'rejected';
  reason: string;
}
