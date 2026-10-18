/** Immutable source references and exact shipped-byte proof; no private legal prose. */
export interface RegisteredLegalOriginalRef {
  registryId: string;
  programId: string;
  version: string;
  contentHash: string;
}

export interface LeafSourceIntegrity {
  sourceSha256: string;
  vaultDocumentId: string;
  /** Includes archived registrations: retirement never licenses rewriting an original. */
  registeredLegalOriginals: RegisteredLegalOriginalRef[];
}

/** Tenant-admitted materializer query projection, including the private registry only for classification. */
export interface VaultOriginalPdfSourceRow {
  storage_version_id: string | null;
  storage_provider: string | null;
  content_hash: string | null;
  file_name: string | null;
  program_id: string;
}

export interface OriginalPdfProof {
  version: 1;
  reasons: Array<'registered-legal' | 'embedded-signature'>;
  sourceSha256: string;
  shippedSha256: string;
  vaultDocumentId?: string;
  registeredLegalOriginals: RegisteredLegalOriginalRef[];
  /** Structural detection protects bytes; it does not establish signer identity or trust. */
  embeddedSignature: 'present' | 'absent';
  cryptographicSignatureValidation: 'not-performed';
  pdfAValidation: { valid: boolean; reason: string };
}
