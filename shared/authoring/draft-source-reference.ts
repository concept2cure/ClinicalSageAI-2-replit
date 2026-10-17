/** Exact extracted-text coordinates retained by selected-source drafting. */
export interface DraftSourceSpan {
  start: number;
  end: number;
  totalChars: number;
}

/** Content identity, not a signature, approval or proof of model delivery. */
export interface DraftSourceTextIdentityV2 {
  version: 2;
  extractedTextSha256: string;
  spanSha256: string;
}

export interface DraftSourceReferenceV2 extends DraftSourceTextIdentityV2 {
  documentId: string;
  contentHash: string;
  span: DraftSourceSpan;
}

/** Historical persisted references retain their original weaker semantics. */
export interface LegacyDraftSourceReference {
  documentId: string;
  contentHash: string;
  span: DraftSourceSpan;
}

export type StoredDraftSourceReference = DraftSourceReferenceV2 | LegacyDraftSourceReference;
