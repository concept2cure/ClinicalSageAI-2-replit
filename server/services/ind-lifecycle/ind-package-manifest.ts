/**
 * IND submission package manifest.
 *
 * Produces the human-readable QC manifest reviewers check before dispatch: every
 * leaf in a sequence grouped by CTD module, with its section code, title,
 * lifecycle operation and checksum. Pure / deterministic. Render it to a PDF
 * with renderPackageManifestPdf (ind-document-renderer).
 */

export interface ManifestLeafLike {
  sectionCode: string;
  title: string;
  lifecycleOp?: string | null;
  checksum?: string | null;
}

export interface ManifestLeaf {
  sectionCode: string;
  title: string;
  lifecycleOp: string;
  checksum: string | null;
}

export interface ManifestModule {
  module: string; // 'M1'..'M5' or 'OTHER'
  label: string;
  leaves: ManifestLeaf[];
}

export interface PackageManifest {
  sequenceNumber: string;
  applicationNumber: string | null;
  submissionType: string | null;
  modules: ManifestModule[];
  totalLeaves: number;
  /** Leaves with no checksum (rendered bytes not yet attached) — a QC flag. */
  missingChecksums: number;
}

const MODULE_LABEL: Record<string, string> = {
  M1: 'Module 1 — Administrative',
  M2: 'Module 2 — CTD Summaries',
  M3: 'Module 3 — Quality / CMC',
  M4: 'Module 4 — Nonclinical',
  M5: 'Module 5 — Clinical',
  OTHER: 'Other',
};
const MODULE_ORDER = ['M1', 'M2', 'M3', 'M4', 'M5', 'OTHER'];

/** Derive the CTD module ('M1'..'M5'|'OTHER') from a leaf section code. */
export function moduleOf(sectionCode: string): string {
  const c = sectionCode.trim().toLowerCase();
  const normalized = c.startsWith('m') ? c.slice(1) : c;
  const first = normalized.charAt(0);
  return first >= '1' && first <= '5' ? `M${first}` : 'OTHER';
}

/**
 * Build the package manifest. Leaves are grouped by module (canonical M1→M5
 * order) and, within a module, sorted by section code.
 */
export function buildPackageManifest(input: {
  sequenceNumber: string;
  applicationNumber?: string | null;
  submissionType?: string | null;
  leaves: ManifestLeafLike[];
}): PackageManifest {
  const byModule = new Map<string, ManifestLeaf[]>();
  let missingChecksums = 0;

  for (const leaf of input.leaves) {
    const mod = moduleOf(leaf.sectionCode);
    const entry: ManifestLeaf = {
      sectionCode: leaf.sectionCode,
      title: leaf.title,
      lifecycleOp: leaf.lifecycleOp ?? 'new',
      checksum: leaf.checksum ?? null,
    };
    if (!entry.checksum) missingChecksums += 1;
    const list = byModule.get(mod) ?? [];
    list.push(entry);
    byModule.set(mod, list);
  }

  const modules: ManifestModule[] = MODULE_ORDER.filter((m) => byModule.has(m)).map((m) => ({
    module: m,
    label: MODULE_LABEL[m],
    leaves: (byModule.get(m) as ManifestLeaf[]).slice().sort((a, b) => (a.sectionCode < b.sectionCode ? -1 : a.sectionCode > b.sectionCode ? 1 : 0)),
  }));

  return {
    sequenceNumber: input.sequenceNumber,
    applicationNumber: input.applicationNumber ?? null,
    submissionType: input.submissionType ?? null,
    modules,
    totalLeaves: input.leaves.length,
    missingChecksums,
  };
}
