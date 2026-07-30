/**
 * eCTD packager — leaf-ID generation.
 *
 * eCTD leaf IDs are XML ID-typed and must be unique within their backbone
 * document. Split out from the packager so both export paths (the regional
 * packager and /api/ectd/export) share one collision-free assigner.
 *
 * @module server/services/submission-gateways/ectd-packager/leaf-id
 */

/**
 * The minimal shape the assigner reads. Structurally satisfied by EctdLeaf and
 * by any generator's granule record — callers never need a cast.
 */
export interface LeafIdInput {
  /** CTD section code, e.g. '3.2.S.1'. */
  ctdSection: string;
  /** Leaf filename inside the package, e.g. 'drug-substance.pdf'. */
  fileName: string;
}

/** A valid XML ID fragment from a filename: drop extension, non-alnum → '-'. */
export function leafIdSlug(fileName: string): string {
  return (
    fileName
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'file'
  );
}

/**
 * Create a leaf-ID assigner scoped to a single backbone document.
 *
 * eCTD leaf IDs are XML ID-typed and must be unique within their document. The
 * CTD section alone is NOT unique — a section commonly holds several leaves
 * (e.g. multiple study reports in 5.3.5.1, multiple stability batches), and
 * `leaf-5-3-5-1` for all of them is invalid XML. Each ID is therefore based on
 * the section plus a filename slug, with a deterministic numeric suffix on the
 * (rare) remaining collision. One assigner per document, so IDs are unique
 * within — but may repeat across — separate backbones.
 */
export function createLeafIdAssigner(): (leaf: LeafIdInput) => string {
  const used = new Set<string>();
  return (leaf: LeafIdInput): string => {
    const base = `leaf-${leaf.ctdSection.replace(/\./g, '-')}-${leafIdSlug(leaf.fileName)}`;
    let id = base;
    let n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    return id;
  };
}
