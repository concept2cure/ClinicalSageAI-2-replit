/**
 * Technical-file packager — materializes an EU MDR/IVDR technical documentation
 * file as a real ZIP on disk (the device equivalent of `packageEctdSubmission`).
 *
 * Two layers, mirroring the eCTD core→packager split:
 *   1. `buildTechnicalFilePlan` (PURE): turns a `TechnicalFileManifest` + the
 *      canonical leaves into a file plan — each source leaf placed at its Annex
 *      II/III folder path, with the storage-specific `resolveFile` INJECTED so the
 *      plan stays unit-testable. Leaves with no resolvable file are skipped + reported.
 *      The plan's manifest is RECONCILED with what was placed (see below), and
 *      its `ready` is the ONE technical-file readiness rule.
 *   2. `materializeTechnicalFile` (fs + JSZip): writes the planned tree, the
 *      plan's reconciled `manifest.json` table-of-contents, and an MD5 checksum
 *      file into a ZIP, and returns a content-addressed bundle (sha256 + size).
 *
 * HONEST SCOPE: this is the technical-file PACKAGE (the dossier's folder tree +
 * manifest + checksums), not a EUDAMED registration payload and not a rendered
 * dossier. It places resolved source files and reports gaps; it never invents
 * content for a missing section.
 *
 * @module server/services/pathway-engines/mdr-ivdr/technical-file-packager
 */

import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import JSZip from 'jszip';
import type { TechnicalFileManifest, TechnicalFileManifestEntry } from '../technical-file-manifest';
import type { CoreLeaf, LeafFileResolver } from '../../ectd/core-to-packager';
import type { UnresolvedLeaf } from '../../ectd/leaf-source-resolver';
import { ANNEX_II_III_KEY, assembleTechDoc, euOutlineKey, type TechDocInputLeaf, type TechDocSlotStatus } from './tech-doc-assembler';

export interface TechnicalFilePlanFile {
  /** Path inside the ZIP, e.g. "03-annex-ii/device-description/desc.pdf". */
  targetPath: string;
  sourcePath: string;
  fileName: string;
  md5?: string;
  /** The manifest section id this file fills. */
  sectionId: string;
}

/** A leaf no slot of this regulation claims. */
export interface TechnicalFileUnmappedLeaf {
  source: string;
  /**
   * True when the leaf's key is in the rule packs' Annex II / Annex III tree
   * ('II', 'II.*', 'III', 'III.*'): it is technical documentation the ZIP does
   * not hold, and it makes the plan not ready. False for everything else (the
   * conformity / registration group IV.*, eCTD codes): reported only.
   */
  inTechnicalDocumentation: boolean;
  reason: string;
}

/*
 * ANNEX_II_III_KEY — the Annex II / III key trees of the eu-mdr-2017-745 / eu-ivdr-2017-746
 * outlines (migrations/20260810b_eu_mdr_ivdr_outlines.sql) — the same keys
 * tech-doc-assembler's annexKey matchers claim: the key itself or a dotted
 * descendant. 'IV' (conformity assessment and registration) is outside them.
 *
 * 2026-09-23 (W5/D7, residual repair) — the rule, stated: MDR / IVDR Annex II
 * (technical documentation) and Annex III (technical documentation on
 * post-market surveillance) are what this ZIP holds, so an unclaimed II/III
 * leaf is a gap in it and counts against `ready`. The outlines' mandatory IV.1
 * (EU declaration of conformity, Annex IV), IV.3 (EUDAMED registration) and
 * IV.5 (PRRC, Article 15) are required of the manufacturer but are not Annex
 * II/III content: they are reported as unmapped with inTechnicalDocumentation
 * false and never counted against `ready`.
 *
 * 2026-09-23 (W5/D7, residual repair — round 3): the regex is defined once, in
 * tech-doc-assembler.ts, and imported here; the assembler also places every
 * outline-keyed leaf by its key rather than its title.
 *
 * 2026-09-23 (W5/D7, final pass): the regex is tested against
 * euOutlineKey(sectionCode) — trimmed, annex numeral uppercased — here and in
 * every assembler key matcher, so the two agree on what is an outline key.
 */

/** A manifest entry after the plan: `sources` are the ones placed in the ZIP. */
export interface ReconciledTechnicalFileManifestEntry extends TechnicalFileManifestEntry {
  /** Sources the entry named whose file could not be placed (absent when none). */
  unresolvedSources?: string[];
  /**
   * 2026-09-23 (W5/D7, final pass): placed sources the slot matched by title
   * alone (tech-doc-assembler `titleOnlyLeafIndices`; absent when none).
   */
  matchedByTitleOnly?: string[];
}

/**
 * The manifest as the ZIP holds it — the one written to manifest.json and the
 * one callers return. `ready` is the post-plan readiness.
 */
export interface ReconciledTechnicalFileManifest extends TechnicalFileManifest {
  entries: ReconciledTechnicalFileManifestEntry[];
  /** Leaves no slot claims; an Annex II/III one (`inTechnicalDocumentation`) makes the plan not ready. */
  unmappedLeaves: TechnicalFileUnmappedLeaf[];
  /** Leaf sources the caller could not materialize (`unresolvedLeaves`), counted into `ready`. */
  unresolvedLeafCount: number;
  /**
   * 2026-09-23 (W5/D7, final pass): every placed source a slot matched by its
   * title alone — no outline key, no document type, no code prefix of the
   * slot's. It does not change `ready`: a Vault-built sequence (CTD codes, no
   * document type, file-name titles) has no other signal, and refusing it
   * would refuse that flow. It says which slot's presence — a required CER
   * or PER included — rests on a title the platform did not verify, so a
   * reviewer sees it in manifest.json, the response and the audit row.
   */
  matchedByTitleOnly: Array<{ sectionId: string; source: string }>;
}

export interface TechnicalFilePlan {
  manifest: ReconciledTechnicalFileManifest;
  files: TechnicalFilePlanFile[];
  /**
   * Every source left out: a slot's source that did not resolve (sectionId =
   * the slot) and every leaf no slot claims (sectionId = 'unmapped', also in
   * `unmappedLeaves`).
   */
  skipped: Array<{ sectionId: string; source: string; reason: string }>;
  /** The 'unmapped' subset of `skipped`; an Annex II/III one makes the plan not ready. */
  unmappedLeaves: TechnicalFileUnmappedLeaf[];
}

/**
 * The ONE CoreLeaf → tech-doc projection input. packageTechnicalFile builds
 * its manifest from `assembleTechDoc(techDocInputLeaves(leaves))` and
 * buildTechnicalFilePlan projects the same leaves the same way, so the slot a
 * manifest entry names and the leaves the plan places for it are one match.
 */
export function techDocInputLeaves(leaves: ReadonlyArray<CoreLeaf>): TechDocInputLeaf[] {
  return leaves.map((l) => ({ sectionCode: l.sectionCode, title: l.title, documentType: l.documentType ?? undefined }));
}

const NOT_THIS_SLOTS_LEAVES =
  "the manifest entry's sources are not the leaves this slot matches in the leaves given to the plan; nothing is placed for it by section code";

/** Same sources, same order. */
function sameSources(a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** A leaf no manifest section claimed, marked by whether it is Annex II/III technical documentation. */
function unmappedLeafOf(leaf: CoreLeaf): TechnicalFileUnmappedLeaf {
  // 2026-09-23 (W5/D7, final pass): read through euOutlineKey, as the slot
  // matchers do — ' ii.9' is Annex II documentation, not an unkeyed code.
  const inTechnicalDocumentation = ANNEX_II_III_KEY.test(euOutlineKey(leaf.sectionCode));
  const label = `${leaf.sectionCode || leaf.title}: ${leaf.title}`;
  return {
    source: leaf.sectionCode || leaf.title,
    inTechnicalDocumentation,
    reason: inTechnicalDocumentation
      ? `no technical-file section matched this leaf (${label}); it is Annex II/III technical documentation the ZIP does not hold`
      : `no technical-file section matched this leaf (${label})`,
  };
}

/**
 * Place ONE manifest entry: exactly the leaves its slot matched in `leaves`
 * (the slot's `leafIndices`), never a leaf re-found by its section code. An
 * entry whose sources are not the slot's sources places nothing (`mismatch`).
 * Appends to the shared files / skipped / claimed accumulators.
 */
function planEntry(
  entry: TechnicalFileManifestEntry,
  slot: TechDocSlotStatus | undefined,
  acc: {
    leaves: ReadonlyArray<CoreLeaf>;
    resolveFile: LeafFileResolver;
    seenPaths: Set<string>;
    files: TechnicalFilePlanFile[];
    skipped: TechnicalFilePlan['skipped'];
    claimed: Set<number>;
  },
): { placed: string[]; lost: string[]; titleOnly: string[]; mismatch: boolean } {
  const placed: string[] = [];
  const lost: string[] = [];
  const titleOnly: string[] = [];
  const slotSources = slot?.sources ?? [];
  if (!sameSources(slotSources, entry.sources)) {
    // The entry does not describe these leaves: place nothing for it.
    for (const source of entry.sources) {
      acc.skipped.push({ sectionId: entry.id, source, reason: NOT_THIS_SLOTS_LEAVES });
      lost.push(source);
    }
    return { placed, lost, titleOnly, mismatch: true };
  }
  for (const [k, index] of (slot?.leafIndices ?? []).entries()) {
    const source = slotSources[k];
    acc.claimed.add(index);
    const resolved = acc.resolveFile(acc.leaves[index]);
    if (!resolved) {
      acc.skipped.push({ sectionId: entry.id, source, reason: 'no resolvable source file for the leaf document' });
      lost.push(source);
      continue;
    }
    acc.files.push({
      targetPath: dedupePath(`${entry.path}/${resolved.fileName}`, acc.seenPaths),
      sourcePath: resolved.sourcePath,
      fileName: resolved.fileName,
      md5: resolved.md5,
      sectionId: entry.id,
    });
    placed.push(source);
    if (slot?.titleOnlyLeafIndices.includes(index)) titleOnly.push(source);
  }
  return { placed, lost, titleOnly, mismatch: false };
}

/** The entry as placed: its placed sources, the ones lost, and the ones placed by title alone. */
function reconciledEntry(
  entry: TechnicalFileManifestEntry,
  r: { placed: string[]; lost: string[]; titleOnly: string[] },
): ReconciledTechnicalFileManifestEntry {
  const status: TechnicalFileManifestEntry['status'] =
    r.placed.length > 0 ? 'present' : entry.required ? 'missing' : 'optional-absent';
  return {
    ...entry,
    status,
    sources: r.placed,
    ...(r.lost.length > 0 ? { unresolvedSources: r.lost } : {}),
    ...(r.titleOnly.length > 0 ? { matchedByTitleOnly: r.titleOnly } : {}),
  };
}

/** Insert a `-N` suffix before the extension to de-collide a duplicate path. */
function dedupePath(target: string, seen: Set<string>): string {
  if (!seen.has(target)) {
    seen.add(target);
    return target;
  }
  const ext = path.extname(target);
  const base = target.slice(0, target.length - ext.length);
  let n = 2;
  let candidate = `${base}-${n}${ext}`;
  while (seen.has(candidate)) {
    n += 1;
    candidate = `${base}-${n}${ext}`;
  }
  seen.add(candidate);
  return candidate;
}

/**
 * Build the technical-file plan from a manifest + the canonical leaves. Each
 * section is filled with the leaves its slot MATCHED (tech-doc-assembler's
 * `leafIndices` over these leaves), each resolved to an on-disk file via the
 * injected resolver. Pure + deterministic.
 *
 * 2026-09-23 (W5/D7, round-2 skeptic): the plan RECONCILES the manifest. The
 * input manifest's status/ready is slot presence decided from the leaves before
 * any was resolved; it was written to manifest.json unchanged, so a ZIP without
 * the CER said ready: true and listed the CER 'present'. And the assembler then
 * judged ready as `manifest.ready && skipped.length === 0`, where skipped also
 * holds leaves no slot claims — so a complete MDR file whose program also holds
 * the outline's mandatory IV.* sections was never ready. Now, in ONE place:
 *   - an entry's `sources` are the ones placed; the rest are `unresolvedSources`;
 *     an entry with none placed is 'missing' (required) / 'optional-absent';
 *   - `ready` = the input's slot presence AND no required slot lost a source AND
 *     no leaf source went unmaterialized (`unresolvedLeaves`, from the caller)
 *     AND no Annex II/III leaf went unmapped;
 *   - leaves no slot claims are `unmappedLeaves`, each marked
 *     `inTechnicalDocumentation`. IV.* (conformity / registration) is reported
 *     and does not count; an Annex II/III key does.
 * The input manifest is not mutated.
 *
 * 2026-09-23 (W5/D7, round-2 skeptic, second pass): two leaves left the ZIP
 * while the plan said ready.
 *   1. A slot's sources are section codes, one per matching leaf, and each was
 *      looked up with `find`, so two II.3.b documents in one slot placed the
 *      FIRST twice and the second never — then called it 'unmapped'. Each
 *      source now takes the next leaf this entry has not used yet: the leaves
 *      match one-to-one, in order.
 *   2. Once unmapped leaves stopped counting, an authored Annex II section no
 *      slot of this regulation takes (the IVDR outline's mandatory II.6.3
 *      stability group) was left out and the plan said ready. An unmapped leaf
 *      in the Annex II/III key tree now counts against ready; IV.* still does not.
 *
 * 2026-09-23 (W5/D7, residual repair): SUPERSEDES the lookup in point 1 above.
 * Each source was still re-found from its section-code string (the next
 * same-code leaf this entry had not used). The slots match by document type
 * and title too, so when two leaves share a code and DIFFERENT slots claim
 * them, a slot took whichever came first: with a bench report and the CER both
 * at II.6.1.b the Annex XIV folder held the bench report, and with an IFU and
 * the CER both at 1.11 the IFU was filed as the CER and the CER left the ZIP —
 * each time with ready true. The plan now projects `leaves` through the one
 * slot registry (assembleTechDoc) and places, for each entry, exactly the
 * leaves its slot matched (`leafIndices`); no leaf is looked up by string. An
 * entry whose `sources` are not that slot's sources (a manifest built from
 * other leaves) places nothing, reports each source lost, and the plan is not
 * ready.
 */
export function buildTechnicalFilePlan(args: {
  manifest: TechnicalFileManifest;
  leaves: CoreLeaf[];
  resolveFile: LeafFileResolver;
  /** Leaf sources the caller's materializer could not produce; any makes the plan not ready. */
  unresolvedLeaves?: ReadonlyArray<UnresolvedLeaf>;
}): TechnicalFilePlan {
  const files: TechnicalFilePlanFile[] = [];
  const skipped: TechnicalFilePlan['skipped'] = [];
  const seenPaths = new Set<string>();
  /** Indices of the leaves some manifest section claimed (placed OR reported unresolvable). */
  const claimed = new Set<number>();

  // The slot projection of THESE leaves: which leaf each slot matched.
  const projection = assembleTechDoc({ regulation: args.manifest.regulation, leaves: techDocInputLeaves(args.leaves) });
  const slotById = new Map<string, TechDocSlotStatus>(projection.sections.map((s) => [s.id, s]));

  const entries: ReconciledTechnicalFileManifestEntry[] = [];
  let requiredSourceLost = false;
  let entryMismatch = false;
  const matchedByTitleOnly: ReconciledTechnicalFileManifest['matchedByTitleOnly'] = [];

  for (const entry of args.manifest.entries) {
    const r = planEntry(entry, slotById.get(entry.id), { leaves: args.leaves, resolveFile: args.resolveFile, seenPaths, files, skipped, claimed });
    if (r.mismatch) entryMismatch = true;
    if (entry.required && r.lost.length > 0) requiredSourceLost = true;
    entries.push(reconciledEntry(entry, r));
    for (const source of r.titleOnly) matchedByTitleOnly.push({ sectionId: entry.id, source });
  }

  // Every input leaf that NO section claimed is reported, never dropped: an
  // authored section whose key matches no slot of this regulation would
  // otherwise vanish from the package with no trace in the plan.
  const unmappedLeaves: TechnicalFileUnmappedLeaf[] = [];
  for (const [index, leaf] of args.leaves.entries()) {
    if (claimed.has(index)) continue;
    const unmapped = unmappedLeafOf(leaf);
    skipped.push({ sectionId: 'unmapped', source: unmapped.source, reason: unmapped.reason });
    unmappedLeaves.push(unmapped);
  }

  const unresolvedLeafCount = args.unresolvedLeaves?.length ?? 0;
  const requiredPresent = entries.filter((e) => e.required && e.status === 'present').length;
  const requiredMissing = entries.filter((e) => e.required && e.status === 'missing').length;
  const manifest: ReconciledTechnicalFileManifest = {
    ...args.manifest,
    ready:
      args.manifest.ready &&
      requiredMissing === 0 &&
      !requiredSourceLost &&
      !entryMismatch &&
      unresolvedLeafCount === 0 &&
      !unmappedLeaves.some((u) => u.inTechnicalDocumentation),
    totals: { ...args.manifest.totals, requiredPresent, requiredMissing },
    entries,
    unmappedLeaves,
    unresolvedLeafCount,
    matchedByTitleOnly,
  };

  return { manifest, files, skipped, unmappedLeaves };
}

export interface TechnicalFileBundle {
  path: string;
  sha256: string;
  sizeBytes: number;
  fileCount: number;
  skippedCount: number;
  displayName: string;
}

/** One MD5 per file, sorted by path (deterministic checksum manifest). */
function buildMd5Index(entries: Array<{ relPath: string; md5: string }>): string {
  return (
    entries
      .slice()
      .sort((a, b) => a.relPath.localeCompare(b.relPath))
      .map((e) => `${e.md5}  ${e.relPath}`)
      .join('\n') + '\n'
  );
}

/**
 * Materialize the plan into a ZIP on disk: the Annex II/III folder tree, a
 * `manifest.json` table-of-contents, and `checksums.md5.txt`. Returns a
 * content-addressed bundle (sha256 over the zip bytes). manifest.json is the
 * plan's RECONCILED manifest (2026-09-23, W5/D7 round-2 skeptic): it says what
 * the ZIP holds and carries the post-plan `ready`.
 */
export async function materializeTechnicalFile(
  plan: TechnicalFilePlan,
  opts: { outputDir: string; applicationId: string }
): Promise<TechnicalFileBundle> {
  const zip = new JSZip();
  const checksums: Array<{ relPath: string; md5: string }> = [];

  // INTEGRITY: pin every entry's timestamp so the archive is genuinely
  // content-addressed — identical input must yield identical bytes and thus an
  // identical sha256. JSZip otherwise stamps each entry with `new Date()`,
  // which makes the ZIP non-deterministic across runs (and defeats the
  // content-addressing guarantee this packager promises for regulated,
  // reproducible submissions). JSZip derives the DOS date/time from this Date in
  // LOCAL time, so use NOON UTC on 1980-01-01: it stays on 1980-01-01 in every
  // timezone (a midnight-UTC epoch underflows below the 1980 DOS floor at
  // negative UTC offsets).
  const ZIP_EPOCH = new Date(Date.UTC(1980, 0, 1, 12, 0, 0));

  const manifestJson = JSON.stringify(plan.manifest, null, 2);
  zip.file('manifest.json', manifestJson, { date: ZIP_EPOCH });
  checksums.push({ relPath: 'manifest.json', md5: createHash('md5').update(manifestJson).digest('hex') });

  for (const f of plan.files) {
    const buf = await fs.readFile(f.sourcePath);
    zip.file(f.targetPath, buf, { date: ZIP_EPOCH });
    checksums.push({ relPath: f.targetPath, md5: f.md5 ?? createHash('md5').update(buf).digest('hex') });
  }

  zip.file('checksums.md5.txt', buildMd5Index(checksums), { date: ZIP_EPOCH });

  // Pin IMPLICIT parent-folder entries too. JSZip stamps the directory entries
  // it auto-creates for nested paths (e.g. `03-annex-ii/device-description/`)
  // with `new Date()`, not the per-file `date` we passed — which reintroduces
  // non-determinism and occasionally flips the sha256 when two runs straddle the
  // DOS 2-second timestamp boundary (defeating the content-addressing guarantee
  // and flaking the determinism test). Force EVERY entry (files + folders) onto
  // ZIP_EPOCH so identical input yields byte-identical output.
  for (const entry of Object.values(zip.files)) {
    entry.date = ZIP_EPOCH;
  }

  await fs.mkdir(opts.outputDir, { recursive: true });
  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const filename = `${opts.applicationId}-technical-file-${plan.manifest.regulation}.zip`;
  const outPath = path.join(opts.outputDir, filename);
  await fs.writeFile(outPath, buffer);

  return {
    path: outPath,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    sizeBytes: buffer.length,
    fileCount: plan.files.length,
    skippedCount: plan.skipped.length,
    displayName: `${plan.manifest.productName ?? opts.applicationId} · ${plan.manifest.regulation.toUpperCase()} technical file`,
  };
}

export default { buildTechnicalFilePlan, materializeTechnicalFile };
