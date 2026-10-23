/** Only a definite refusal can justify saying that a write did not occur. */
export function mutationUnconfirmed(status?: number, code?: string): boolean {
  if (code === 'OUTCOME_UNKNOWN') return true;
  return typeof status !== 'number' || ![400, 401, 403, 404, 409, 422, 429].includes(status);
}
