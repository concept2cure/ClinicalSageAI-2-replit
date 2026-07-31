/**
 * Turn a full-dossier granule set into a sequence DELTA against a prior sequence.
 *
 * The DB-driven exporter (ectdExportService) builds the whole current dossier
 * and marks every leaf `new` -- correct for a first sequence (0000) or a
 * snapshot, but NOT for a follow-up sequence, where a valid eCTD contains only
 * the delta: changed leaves as `replace`/`append`, dropped leaves as `delete`,
 * and unchanged leaves omitted entirely (they stay referenced from the prior
 * sequence). This module performs that transform, in place, using the shared
 * lifecycle operator so the diff logic has one implementation.
 *
 * Opt-in: the exporter only calls this when asked to produce a delta AND a prior
 * sequence exists. Pure apart from mutating the passed-in granule map; the
 * caller removes `removedFiles` from the ZIP + checksum manifest.
 *
 * @module server/services/ectd/export-lifecycle
 */

import { computeLifecycleOperations, type PriorLeaf } from './lifecycle-operator';

/** The exporter's per-leaf granule record (a structural subset). */
export interface ExportGranule {
  granuleId: string; // CTD section, e.g. '3.2.P.1'
  granuleName: string;
  filePath: string; // package-relative href
  checksum: string; // md5
  operation: string; // set to the computed lifecycle op
  modifiedFile?: string; // set for replace/append/delete
}

export interface ExportModule {
  moduleNumber: string;
  moduleName: string;
  granules: ExportGranule[];
}

export interface DeltaSummary {
  new: number;
  replace: number;
  append: number;
  delete: number;
  unchangedOmitted: number;
}

export interface DeltaResult {
  /** Package-relative paths of unchanged leaves the caller must remove from the
   *  ZIP + checksum manifest (they are not re-shipped in a delta sequence). */
  removedFiles: string[];
  summary: DeltaSummary;
}

/** Cross-sequence identity key: section + filename, pipe-delimited. */
const keyOf = (ctdSection: string, fileName: string): string => `${ctdSection}|${fileName}`;
const baseName = (p: string): string => {
  const i = p.lastIndexOf('/');
  return i >= 0 ? p.slice(i + 1) : p;
};

/**
 * Rewrite `modulesByNumber` in place into a delta against `prior`:
 *   - unchanged leaves (same md5)     -> removed from the map (and reported in
 *     removedFiles so the caller drops their bytes + checksum line)
 *   - changed leaves                  -> operation set to replace/append + modified-file
 *   - new leaves                      -> operation 'new' (no modified-file)
 *   - dropped leaves (in prior only)  -> appended as backbone-only `delete`
 *     granules whose filePath IS the modified-file pointer at the prior file
 *
 * @param prefix relative traversal to the prior sequence root, e.g. '../0000/'
 */
export function applyLifecycleDelta(
  modulesByNumber: Map<string, ExportModule>,
  prior: PriorLeaf[],
  prefix: string,
): DeltaResult {
  // Flatten current granules into desired leaves for the operator.
  const desired = [];
  for (const module of modulesByNumber.values()) {
    for (const granule of module.granules) {
      desired.push({
        ctdSection: granule.granuleId,
        fileName: baseName(granule.filePath),
        md5: granule.checksum,
        title: granule.granuleName,
        sourcePath: granule.filePath,
      });
    }
  }

  const life = computeLifecycleOperations(prior, desired, { priorSequencePrefix: prefix });

  // Index the operator's output by the same key.
  const opByKey = new Map<string, { operation: string; modifiedFile?: string }>();
  for (const leaf of life.leaves) {
    opByKey.set(keyOf(leaf.ctdSection, leaf.fileName), {
      operation: leaf.operation,
      modifiedFile: leaf.modifiedFile,
    });
  }

  const removedFiles: string[] = [];

  // Apply to surviving granules; omit the unchanged ones.
  for (const module of modulesByNumber.values()) {
    const kept: ExportGranule[] = [];
    for (const granule of module.granules) {
      const op = opByKey.get(keyOf(granule.granuleId, baseName(granule.filePath)));
      if (!op) {
        // Not in the operator output -> unchanged -> not re-shipped.
        removedFiles.push(granule.filePath);
        continue;
      }
      granule.operation = op.operation;
      if (op.modifiedFile) granule.modifiedFile = op.modifiedFile;
      kept.push(granule);
    }
    module.granules = kept;
  }

  // Append backbone-only delete granules for leaves dropped since the prior.
  for (const leaf of life.leaves) {
    if (leaf.operation !== 'delete') continue;
    const moduleNum = leaf.ctdSection.split('.')[0];
    const module = modulesByNumber.get(moduleNum);
    if (!module) continue; // a delete for a module the exporter doesn't model
    module.granules.push({
      granuleId: leaf.ctdSection,
      granuleName: leaf.title ?? leaf.fileName,
      // filePath doubles as the xlink:href; for a delete it points at the prior
      // file (same as modified-file). No new bytes ship.
      filePath: leaf.modifiedFile ?? leaf.fileName,
      // md5 is optional on EctdLeaf; a delete ships no new bytes, so an absent
      // prior checksum falls back to '' (same convention as regional-packager).
      checksum: leaf.md5 ?? '',
      operation: 'delete',
      modifiedFile: leaf.modifiedFile,
    });
  }

  return {
    removedFiles,
    summary: {
      new: life.summary.new,
      replace: life.summary.replace,
      append: life.summary.append,
      delete: life.summary.delete,
      unchangedOmitted: removedFiles.length,
    },
  };
}
