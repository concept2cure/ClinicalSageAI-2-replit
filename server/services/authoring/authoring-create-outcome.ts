import type { Queryable } from './authoring-evidence';

/** Creation recovery identifies the attempted record; it never grants access or retries a write. */
export interface AuthoringCreationRecovery {
  organizationId: number;
  programId: string | null;
  documentId: string;
}

export class AuthoringCreateOutcomeError extends Error {
  readonly code: 'AUTHORING_CREATE_COMMIT_UNCONFIRMED' | 'AUTHORING_CREATE_HANDOFF_UNAVAILABLE';
  readonly recovery: Readonly<AuthoringCreationRecovery>;
  constructor(readonly creationOutcome: 'unconfirmed' | 'committed', recovery: AuthoringCreationRecovery) {
    super(creationOutcome === 'unconfirmed'
      ? 'The document creation outcome could not be confirmed. Check the identified document in its original project before creating another copy. Do not retry creation.'
      : 'The document was created, but its current access or saved content could not be confirmed. Reload the identified document in its original project before continuing. Do not create another copy.');
    this.name = 'AuthoringCreateOutcomeError';
    this.code = creationOutcome === 'unconfirmed' ? 'AUTHORING_CREATE_COMMIT_UNCONFIRMED' : 'AUTHORING_CREATE_HANDOFF_UNAVAILABLE';
    this.recovery = Object.freeze({ ...recovery });
  }
}

/** Privacy-safe HTTP/tool projection: no title, source text, sections or permissions. */
export function authoringCreationRecoveryPayload(error: AuthoringCreateOutcomeError) {
  return {
    success: false as const, ok: false as const, code: error.code, error: error.message,
    creationOutcome: error.creationOutcome, retryAllowed: false as const,
    recovery: error.recovery,
    ...(error.creationOutcome === 'committed' ? { saved: true as const } : {}),
  };
}

/** One transaction failure lifecycle for document and section writers. */
export interface AuthoringTransactionState {
  began: boolean;
  commitAttempted: boolean;
  discardConnection?: Error;
}
export type AuthoringCreateTransactionState = AuthoringTransactionState;

export async function rollbackAuthoringTransaction(client: Queryable, state: AuthoringTransactionState): Promise<void> {
  if (!state.began) return;
  state.began = false;
  await client.query('ROLLBACK').catch(() => { state.discardConnection = new Error('Authoring transaction rollback failed'); });
}

export async function settleAuthoringTransactionFailure(client: Queryable, state: AuthoringTransactionState,
  error: unknown, unconfirmed: Error): Promise<unknown> {
  if (state.commitAttempted) {
    state.discardConnection = unconfirmed;
    return unconfirmed;
  }
  await rollbackAuthoringTransaction(client, state);
  return error;
}

export async function rejectAuthoringCreateTransaction(client: Queryable, state: AuthoringCreateTransactionState,
  error: unknown, recovery: AuthoringCreationRecovery): Promise<never> {
  throw await settleAuthoringTransactionFailure(client, state, error, new AuthoringCreateOutcomeError('unconfirmed', recovery));
}

/** Both AnA creation forms carry one truthful result when the create/handoff fails. */
export function authoringDraftCreationFailure(error: unknown, tool: string,
  logger: { error(message: string, context: Record<string, unknown>): void }) {
  if (error instanceof AuthoringCreateOutcomeError) return authoringCreationRecoveryPayload(error);
  logger.error(`${tool} failed`, { err: error instanceof Error ? error.message : String(error) });
  return { error: `${tool} failed: the document could not be written. Nothing was saved.` };
}

/** Retain recovery across turns without giving the canvas a saved-document receipt. */
export function authoringCreationTrace(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const outcome = row.creationOutcome;
  const code = outcome === 'unconfirmed' ? 'AUTHORING_CREATE_COMMIT_UNCONFIRMED'
    : outcome === 'committed' ? 'AUTHORING_CREATE_HANDOFF_UNAVAILABLE' : null;
  if (!code || row.code !== code || row.ok !== false || row.retryAllowed !== false) return null;
  if (!verifiedRecoveryIdentity(row.recovery)) return null;
  const recovery = row.recovery;
  return JSON.stringify({ code, creationOutcome: outcome, retryAllowed: false, recovery: {
    organizationId: recovery.organizationId, documentId: recovery.documentId, programId: recovery.programId,
  } });
}

function verifiedRecoveryIdentity(value: unknown): value is AuthoringCreationRecovery {
  if (!value || typeof value !== 'object') return false;
  const recovery = value as Record<string, unknown>;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return Number.isSafeInteger(recovery.organizationId) && Number(recovery.organizationId) > 0
    && typeof recovery.documentId === 'string' && uuid.test(recovery.documentId)
    && (recovery.programId === null || (typeof recovery.programId === 'string' && uuid.test(recovery.programId)));
}
