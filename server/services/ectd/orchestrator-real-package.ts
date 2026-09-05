/**
 * Real eCTD package assembly for the submission orchestrator.
 *
 * The orchestrator used to hand the hardened validator a DERIVED stand-in leaf
 * manifest (one leaf per composed section, MD5 over a JSON payload, no real
 * files, and validate() called with backboneXml=undefined so the DTD check never
 * ran). This module replaces that with a REAL package: it renders each Module 3
 * ComposedSection to a PDF leaf, runs the canonical packager to produce a real
 * ICH backbone (index.xml) + MD5 manifest, and hands back the generated
 * backbone XML and per-leaf bytes so the validator runs its DTD conformance and
 * true MD5 recompute against an actual package.
 *
 * Scope: this validates the CURRENT composition, so every leaf is `new`. It does
 * not compute cross-sequence lifecycle (replace/append/delete) — that is the
 * canonical core's job (submission_leaves carry a per-leaf lifecycle_op that
 * package-from-core maps into the packager). A backbone
 * that needs lifecycle operators is produced there, not here.
 *
 * Determinism: PDF/A normalization is SKIPPED here (skipPdfaConversion) so the
 * leaf bytes equal the deterministic renderLeafPdf output. The orchestrator's
 * sign-path drift check re-derives the assembly and compares
 * sha256(assembly.leaves); Ghostscript PDF/A conversion embeds timestamps and
 * would make that comparison false-positive. PDF/A compliance itself remains
 * gated separately (the packager's grade gate + the qualification harness). The
 * deliverable-producing export path still normalizes to PDF/A.
 *
 * @module server/services/ectd/orchestrator-real-package
 */

import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import JSZip from 'jszip';
import { renderLeafPdf } from './leaf-pdf-renderer';
import {
  packageEctdSubmission,
  type EctdLeaf,
  type FdaRegionalAdmin,
} from '../submission-gateways/regional-packager';
import type { ECTDLeaf } from './ectd4-validator';
import type { ComposedSection, GeneratedTable } from '../module3Composer';

/** RegionCode used across the orchestrator/module3 layer. The Move-7 widening
 *  accepts 2-letter ISO codes beyond the original four, so this is a string at
 *  runtime; the mapping below normalizes any of them to a packager region. */
export type OrchestratorRegion = string;

/**
 * Map an orchestrator region to a packager Region. US/EU/JP/CA carry agency
 * names (fda/ema/pmda/ca); every other widened 2-letter code lowercases to the
 * matching packager region (uk/ch/au/cn/br/in/kr/sg all resolve via
 * backboneByRegion). Returns the lowercased code even for an unknown region;
 * callers use {@link isPackagerBuildableRegion} to decide whether to package.
 */
export function toPackagerRegion(region: string): string {
  const agency: Record<string, string> = { US: 'fda', EU: 'ema', JP: 'pmda', CA: 'ca' };
  return agency[region.toUpperCase()] ?? region.toLowerCase();
}

/** Regions the canonical packager has a backbone builder for (mirrors
 *  regional-packager backboneByRegion). A region outside this set cannot be
 *  packaged, so the orchestrator falls back to a derived manifest for it. */
const PACKAGER_REGIONS = new Set(['fda', 'ema', 'pmda', 'ca', 'uk', 'ch', 'au', 'cn', 'br', 'in', 'kr', 'sg']);

/** Whether the canonical packager can build a real package for this orchestrator
 *  region. */
export function isPackagerBuildableRegion(region: string): boolean {
  return PACKAGER_REGIONS.has(toPackagerRegion(region));
}

export interface RealAssemblyContext {
  region: OrchestratorRegion;
  applicationNumber: string;
  sequenceNumber: string;
  submissionType: string;
  /** FDA Module 1 admin block. For region 'fda' the backbone must state an
   *  application type; see regional-packager.buildFdaBackbone. */
  fda?: FdaRegionalAdmin;
  /**
   * The applicant's own identifier — DUNS for FDA, the EMA organisation id, the
   * PMDA applicant id. It is NOT the application number: `sponsorId` was filled
   * with `applicationNumber`, so the backbone's <id> / <pmda-applicant-id> /
   * <company-id> carried the IND/NDA number as the applicant's identity.
   */
  applicantId?: string;
  sponsorName?: string;
  productName?: string;
}

export interface RealAssemblyResult {
  /** Validator leaves with REAL package hrefs (filePath) + real MD5 checksums. */
  leaves: ECTDLeaf[];
  /** The generated ICH backbone (index.xml) text — pass as backboneXml. */
  backboneXml: string;
  /** Per-leaf bytes keyed by package href (== each leaf's filePath) so the
   *  validator's enforceMd5Checksums recompute+compare actually runs. */
  leafBuffers: Record<string, Buffer>;
  /** Sum of shipped leaf byte lengths. */
  totalSizeBytes: number;
}

/** Serialize a table to delimited PLAIN TEXT (the renderer drops HTML cell
 *  boundaries, so an HTML table would collapse into run-on rows). */
export function serializeTable(t: GeneratedTable): string {
  const lines: string[] = [];
  if (t.title) lines.push(t.title);
  if (t.headers?.length) lines.push(t.headers.join('  |  '));
  for (const row of t.rows ?? []) lines.push(row.join('  |  '));
  return lines.join('\n');
}

/** Flatten a ComposedSection into a single content string for the leaf PDF. */
export function sectionToContent(section: ComposedSection): string {
  const parts = [section.narrativeDraft ?? '', ...(section.tables ?? []).map(serializeTable)];
  return parts.filter((p) => p && p.length).join('\n\n');
}

/** A leaf filename derived deterministically from a section key. */
function leafFileName(sectionKey: string): string {
  const slug = sectionKey.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug || 'section'}.pdf`;
}

/** A ZIP entry that is a real leaf file (not a backbone or util artifact). */
function isLeafEntry(href: string): boolean {
  if (href === 'index.xml') return false;
  if (href.startsWith('util/')) return false;
  if (/^m1\/[^/]+\/[^/]+-regional\.xml$/.test(href)) return false; // regional backbone
  return true;
}

/**
 * Render the composed sections, package them through the canonical packager, and
 * recover the real backbone XML + per-leaf bytes for hardened validation.
 * Cleans up its temp working directory before returning.
 */
export async function assembleRealPackage(
  sections: ComposedSection[],
  ctx: RealAssemblyContext,
): Promise<RealAssemblyResult> {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'ectd-orch-'));
  try {
    const leavesDir = path.join(work, 'leaves');
    await fs.mkdir(leavesDir, { recursive: true });

    // 1. Render each section to a deterministic PDF leaf on disk.
    const packagerLeaves: EctdLeaf[] = [];
    const bySection = new Map<string, ComposedSection>(); // fileName -> section
    const usedNames = new Set<string>();
    for (const section of sections) {
      // Deterministic, collision-free filename: if two section keys slug to the
      // same name, disambiguate with a numeric suffix so neither the on-disk
      // write nor the ZIP entry overwrites the other (basename is the recovery
      // key). Order is stable, so the suffixing is deterministic.
      let fileName = leafFileName(section.sectionKey);
      if (usedNames.has(fileName)) {
        const base = fileName.replace(/\.pdf$/, '');
        let n = 2;
        while (usedNames.has(`${base}-${n}.pdf`)) n++;
        fileName = `${base}-${n}.pdf`;
      }
      usedNames.add(fileName);
      const buf = await renderLeafPdf(sectionToContent(section), {
        title: section.sectionKey,
        sectionCode: section.sectionKey,
      });
      const abs = path.join(leavesDir, fileName);
      await fs.writeFile(abs, buf);
      packagerLeaves.push({
        ctdSection: section.sectionKey,
        operation: 'new',
        sourcePath: abs,
        fileName,
        title: section.sectionKey,
      });
      bySection.set(fileName, section);
    }

    // 2. Package (deterministic: PDF/A conversion skipped; staging never blocks).
    const bundle = await packageEctdSubmission({
      region: toPackagerRegion(ctx.region) as Parameters<typeof packageEctdSubmission>[0]['region'],
      applicationId: ctx.applicationNumber,
      sequence: ctx.sequenceNumber,
      submissionType: ctx.submissionType,
      /* `ctx.submissionType` on this path holds an APPLICATION type ('IND',
         'NDA', '510k'), not a submission type — the packager's field means the
         latter. Passing it in the right slot is what stopped an original IND
         from being coded fdast9 ("IND Safety Reports") by a lookup in the wrong
         vocabulary. An explicit block always wins. */
      fda: ctx.fda ?? { applicationType: ctx.submissionType },
      // An absent identity says it is absent. 'Sponsor' and 'Product' read as
      // real values in the backbone; regulatory-identifiers.ts' rule is that a
      // missing identifier must SAY it is unassigned.
      sponsorId: ctx.applicantId ?? 'UNASSIGNED-APPLICANT',
      sponsorName: ctx.sponsorName ?? 'UNASSIGNED (applicant)',
      productName: ctx.productName ?? 'UNASSIGNED (product)',
      outputDir: path.join(work, 'out'),
      environment: 'staging',
      skipPdfaConversion: true,
      leaves: packagerLeaves,
    });

    // 3. Recover the backbone + per-leaf bytes from the produced ZIP. The entry
    //    keys ARE the authoritative package hrefs, so no path reconstruction.
    const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
    const backboneXml = (await zip.file('index.xml')?.async('string')) ?? '';

    const leaves: ECTDLeaf[] = [];
    const leafBuffers: Record<string, Buffer> = {};
    let totalSizeBytes = 0;
    for (const [href, entry] of Object.entries(zip.files)) {
      if (entry.dir || !isLeafEntry(href)) continue;
      const bytes = await entry.async('nodebuffer');
      const section = bySection.get(href.split('/').pop() ?? '');
      if (!section) continue; // not one of our rendered leaves
      const checksum = createHash('md5').update(bytes).digest('hex');
      leafBuffers[href] = bytes; // keyed by href == filePath (validator's lookup key)
      totalSizeBytes += bytes.length;
      leaves.push({
        sectionCode: `m${section.sectionKey}`,
        title: section.sectionKey,
        checksum,
        checksumType: 'md5',
        operation: 'new',
        filePath: href,
        mimeType: 'application/pdf',
        fileSize: bytes.length,
      });
    }

    return { leaves, backboneXml, leafBuffers, totalSizeBytes };
  } finally {
    // Best-effort cleanup. Guard it: if the try body threw (renderLeafPdf /
    // packageEctdSubmission / JSZip) AND fs.rm also rejects (EPERM/EBUSY — not
    // ENOENT, which force:true already swallows), an unguarded rm rejection
    // would REPLACE the primary error and obscure the real root cause.
    try {
      await fs.rm(work, { recursive: true, force: true });
    } catch {
      // Temp dir left behind (the OS reaps it); never mask the assembly result.
    }
  }
}
