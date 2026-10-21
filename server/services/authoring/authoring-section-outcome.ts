/** Recovery locates the attempted section write without claiming its outcome. */
export interface AuthoringSectionRecovery {
  organizationId: number;
  documentId: string;
  sectionId: string;
  draftId?: string;
}
export class AuthoringSectionWriteOutcomeError extends Error {
  readonly code: 'AUTHORING_SECTION_CREATE_COMMIT_UNCONFIRMED' | 'AUTHORING_AI_ACCEPT_COMMIT_UNCONFIRMED';
  readonly recovery: Readonly<AuthoringSectionRecovery>;
  readonly writeOutcome = 'unconfirmed' as const;
  constructor(operation: 'section-create' | 'ai-accept', recovery: AuthoringSectionRecovery) {
    super(operation === 'section-create'
      ? 'The section creation outcome could not be confirmed. Check this exact section in its original document before creating another section. Do not retry creation.'
      : 'The AI draft acceptance outcome could not be confirmed. Check this exact section and draft in its original document before continuing. Do not accept again or regenerate the draft.');
    this.name = 'AuthoringSectionWriteOutcomeError';
    this.code = operation === 'section-create' ? 'AUTHORING_SECTION_CREATE_COMMIT_UNCONFIRMED' : 'AUTHORING_AI_ACCEPT_COMMIT_UNCONFIRMED';
    this.recovery = Object.freeze({ ...recovery });
  }
}

export function authoringSectionRecoveryPayload(error: AuthoringSectionWriteOutcomeError) {
  return { success: false as const, ok: false as const, code: error.code,
    error: { code: error.code, message: error.message }, writeOutcome: error.writeOutcome,
    retryAllowed: false as const, recovery: error.recovery };
}
