import type { CompanyDocumentProfile, TemplateSpec } from './company-documents';
import type { CanonicalRegion } from './regulatory/region-identity';

/** A named presentation is selected explicitly; a missing scope never matches a restricted one. */
export interface CompanyDesignScope {
  programId: string | null;
  market: CanonicalRegion | null;
  language: string | null;
  subsidiary: string | null;
}
export interface CompanyDesignCandidate {
  companyName: string;
  address: string;
  contact: string;
  registrationDetails: string;
  letterhead: TemplateSpec;
  importedFrom: string | null;
  applyToReports: boolean;
  applyToSubmissionCorrespondence: boolean;
}
export type CompanyDesignState = 'draft' | 'reviewed' | 'published';
export interface CompanyDesignSummary {
  id: string;
  name: string;
  templateId: string;
  scope: CompanyDesignScope;
  state: CompanyDesignState;
  sha256: string;
  createdBy: number;
  createdAt: string;
  reviewedBy: number | null;
  reviewedAt: string | null;
  publishedBy: number | null;
  publishedAt: string | null;
  publishedRevision: number | null;
  publishedProfileHash: string | null;
}
export interface CompanyDesignDetail {
  design: CompanyDesignSummary;
  candidate: CompanyDesignCandidate;
  changedFields: Array<keyof CompanyDesignCandidate>;
  canReview: boolean;
  canPublish: boolean;
  reviewBlocker: string | null;
  publishBlocker: string | null;
  canActivateDefault: boolean;
  activationBlocker: string | null;
}
export interface CompanyDefaultDesignApproval {
  designId: string;
  designHash: string;
  publishedRevision: number;
  presentationHash: string;
  candidate: CompanyDesignCandidate;
}
export interface CompanyVariantContext {
  /** The authenticated actor, supplied by an already-admitted server workflow. */
  userId: number;
  programId?: string | null;
  market?: string | null;
  language?: string | null;
  subsidiary?: string | null;
}
export type CompanyVariantProfile = CompanyDocumentProfile;
