/** The typed refusal for CSR source reads. Its own module (2026-10-30, CDISC
 * pilot defect D14) so that the pure ADaM derivation and narrative modules do
 * not import source-access.ts, whose program authorization reaches the
 * database pool on import. source-access.ts re-exports it. */
export class CsrSourceInputError extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409 | 413 | 422 | 503, readonly code: string, message: string,
    readonly issues?: Array<{ path: string; message: string }>) { super(message); this.name = 'CsrSourceInputError'; }
}
