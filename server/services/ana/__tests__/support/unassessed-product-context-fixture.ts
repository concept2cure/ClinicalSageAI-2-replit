import type { RecordedDraftProductRead } from '../../draft-product-context';

/** Isolate existing source-authority/leaf tests from the independent product
 * admission boundary. This fixture claims NO recorded product authority and
 * performs no SQL. Actual product ownership, actor policy, anchor, filing,
 * snapshot and stream currentness are exercised by the separate real-PGlite
 * recorded-product-drafting-service suite, without this mock. The consuming
 * source tests still use the actual issuer and source identity checkpoints. */
export async function unassessedProductContextFixture(): Promise<RecordedDraftProductRead> {
  return { context: Object.freeze({ state: 'unassessed', projectId: null, programId: null,
    therapeuticArea: null, phase: null, population: null, productType: null, modality: null,
    indication: null, charterState: 'missing', charter: null, snapshot: null }),
  assertCurrent: async () => undefined };
}
