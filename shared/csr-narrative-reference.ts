/**
 * §14.3.3 in an Authoring import (2026-10-30, docs/evidence/D2-CSR/2026-10-30-cdisc-pilot-e2e,
 * "§14.3.3 imported by reference"): the patient narratives are engine output
 * (E3 drafting mode "manual" for §14), so the import does not copy them into
 * the editor as one inline text. The Authoring section holds the landed
 * opening; the section's origin holds this reference to the build's narrative
 * store. The import fingerprint covers it (workflow-source-import.ts), so a
 * narrative edited in the store after import changes the fingerprint and the
 * import no longer verifies.
 *
 * Built only by server/services/csr/csr-narrative-landed.ts readCsrNarrativeReference,
 * after every stored narrative was matched, in order, to the landed text.
 */
export const CSR_NARRATIVE_REFERENCE_SCHEMA = 'c2c.csr-narrative-reference.v1' as const;

export interface CsrNarrativeReference {
  schema: typeof CSR_NARRATIVE_REFERENCE_SCHEMA;
  jobId: number;
  sectionNumber: '14.3.3';
  /** Narratives the landed section holds, each matched to its stored row. */
  narratives: number;
  /**
   * SHA-256 over every stored row of the build as the database read it:
   * subject, sequence, status, recorded hash, the SHA-256 of the text itself,
   * facts digest and QC record. Any edit of any row changes it.
   */
  storeDigest: string;
  /** csr_section_outputs.content_hash of the landed §14.3.3, checked by the database against the text. */
  landedSha256: string;
  /** Characters in the landed §14.3.3. */
  landedLength: number;
  /** SHA-256 of the opening (the selection basis), the only text the Authoring section holds. */
  openingSha256: string;
}

const HASH = /^[0-9a-f]{64}$/;
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

/** A stored reference, validated field by field; anything malformed is null. */
export function parseCsrNarrativeReference(value: unknown): CsrNarrativeReference | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.schema !== CSR_NARRATIVE_REFERENCE_SCHEMA || v.sectionNumber !== '14.3.3' || !count(v.jobId) || v.jobId === 0
    || !count(v.narratives) || !count(v.landedLength)) return null;
  for (const key of ['storeDigest', 'landedSha256', 'openingSha256'] as const) if (typeof v[key] !== 'string' || !HASH.test(v[key] as string)) return null;
  return { schema: CSR_NARRATIVE_REFERENCE_SCHEMA, jobId: v.jobId as number, sectionNumber: '14.3.3', narratives: v.narratives as number,
    storeDigest: v.storeDigest as string, landedSha256: v.landedSha256 as string, landedLength: v.landedLength as number, openingSha256: v.openingSha256 as string };
}
