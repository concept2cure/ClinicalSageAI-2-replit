/** Fixed integrity reasons may be recorded; arbitrary SDK/DB messages may not. */
export class EvaluationIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvaluationIntegrityError';
  }
}

export function safeEvaluationError(error: unknown, fallback: string): string {
  return error instanceof EvaluationIntegrityError ? error.message : fallback;
}
