/**
 * §11.70 content digest of a QMS controlled document — RE-IMPLEMENTED here,
 * not imported: the product's `computeQmsDocumentContentDigest`
 * (server/services/qms/document-approval-signature.ts) is TypeScript and the
 * runners are plain `node`. The recipe is copied verbatim so an inspector can
 * recompute the digest from the stored row with no product code in the loop:
 *
 *   sha256(canonicalJson({ kind:'qms-document-version-content', id,
 *     organizationId, docNumber, version, title, docType, category,
 *     artifactId, nextReviewDate (YYYY-MM-DD), metadata minus metadata.approval }))
 *
 * canonicalJson (server/services/part11/signature-persistence.ts): keys sorted
 * recursively, undefined → null, Date → ISO string, then JSON.stringify.
 * If the product's recipe changes, this file must change with it — the
 * mismatch is exactly what OQ-QMS-05b would then report.
 *
 * The RETIREMENT digest (P1-29 / DP-32; `computeQmsDocumentRetirementDigest` in
 * the same product module) is the same recipe with `metadata.retired` removed
 * as well — the block the retirement writes and stores the digest in. The
 * approval recipe is unchanged. OQ-QMS-10 recomputes it from the stored row.
 */
import { createHash } from 'node:crypto';

export function canonicalJson(value) {
  const normalize = (v) => {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map(normalize);
    if (typeof v === 'object') {
      const out = {};
      for (const k of Object.keys(v).sort()) out[k] = normalize(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(normalize(value));
}

export const sha256CanonicalJson = (value) => createHash('sha256').update(canonicalJson(value)).digest('hex');

/** The same input the product signs, built from a `qms_documents` row as the API returns it. */
export function qmsDocumentDigestInput(row) {
  const metadata = { ...(row.metadata ?? {}) };
  delete metadata.approval;
  const toDateString = (v) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
  return {
    kind: 'qms-document-version-content',
    id: row.id,
    organizationId: row.organization_id,
    docNumber: row.doc_number,
    version: row.version,
    title: row.title,
    docType: row.doc_type,
    category: row.category ?? null,
    artifactId: row.artifact_id ?? null,
    nextReviewDate: toDateString(row.next_review_date),
    metadata,
  };
}

export function computeQmsDocumentContentDigest(row) {
  return sha256CanonicalJson(qmsDocumentDigestInput(row));
}

/** The retirement's input: the approval input over the row with `metadata.retired` removed. */
export function qmsDocumentRetirementDigestInput(row) {
  const metadata = { ...(row.metadata ?? {}) };
  delete metadata.retired;
  return qmsDocumentDigestInput({ ...row, metadata });
}

export function computeQmsDocumentRetirementDigest(row) {
  return sha256CanonicalJson(qmsDocumentRetirementDigestInput(row));
}
