/**
 * Legacy archive detector + mapper.
 *
 * Sniffs a zip / folder to detect its format (FDA eCTD / EMA eCTD /
 * PMDA eCTD / FDA eSTAR / raw 510(k) folder / raw PMA module / mixed /
 * unknown) and produces one canonical ImportFile per leaf with a
 * proposed mapping into the kit's section vocabulary.
 *
 * Detection signals (cheap → expensive):
 *   1. Backbone presence:
 *        m1/us/us-regional.xml  → fda_ectd
 *        m1/eu/eu-regional.xml  → ema_ectd
 *        m1/jp/jp-regional.xml  → pmda_ectd
 *        eSTAR-*.xml at root    → fda_estar
 *   2. Folder shape: m1/m2/m3/m4/m5 layout → eCTD; flat folder of PDFs
 *      with eSTAR section keys → fda_510k_folder; mixed → 'mixed'
 *   3. Filename heuristics (cover letter, IFU, SE, etc.) for raw folders.
 *
 * Mapping basis (`mappingSource`, and the `reviewStatus` it is stored with):
 *   backbone_xml       — the archive's regional backbone declares the leaf → 'mapped'
 *   filename_heuristic — a filename/path pattern (named by `mappingRuleId`)
 *                        suggests a placement → 'suggested' until a person confirms it
 *   fallback           — nothing matched: attachment bucket → 'skipped'
 *
 * 2026-10-15: this was a "confidence" table — 1.00 backbone, 0.70–0.85 hard-coded
 * per filename regex, 0.30 fallback — and the import route stored every leaf at
 * >= 0.5 as 'mapped', so protocol_deviation_log.xlsx was imported as CTD 5.3.5.1
 * "at 0.80". Those figures were rule weights nobody measured.
 */

import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import * as path from 'path';
import JSZip from 'jszip';

export type DetectedFormat =
  | 'fda_ectd' | 'ema_ectd' | 'pmda_ectd'
  | 'fda_estar' | 'fda_510k_folder' | 'pma_module'
  | 'mixed' | 'unknown';

export type DetectedRegion = 'fda' | 'ema' | 'pmda' | null;

export interface DetectedArchive {
  format:             DetectedFormat;
  region:             DetectedRegion;
  applicationId:      string | null;
  sequence:           string | null;
  sponsor:            string | null;
  files:              DetectedFile[];
  findings:           DetectedFinding[];
}

export interface DetectedFile {
  relativePath:       string;
  fileName:           string;
  sizeBytes:          number;
  sha256:             string;
  detectedKind:       'leaf' | 'backbone_xml' | 'stylesheet' | 'index' | 'attachment';
  mappedCtdSection:   string | null;
  mappedSectionKey:   string | null;
  mappedArtifactKind: string | null;
  /**
   * 1 when the archive itself declares this placement (mappingSource
   * 'backbone_xml'), 0 when nothing in it does. A flag, not a probability: no
   * confidence is measured for a filename-pattern suggestion, so callers persist
   * NULL there. No caller reads it since AnA's start_legacy_import moved to
   * `reviewStatus` (2026-10-15); only this module's own test still pins it, and
   * the field goes with that pin.
   */
  mappingConfidence:  0 | 1;
  mappingSource:      'backbone_xml' | 'filename_heuristic' | 'fallback';
  /** The pattern that suggested the placement ('filename.protocol', …); null unless mappingSource is 'filename_heuristic'. */
  mappingRuleId:      string | null;
  /**
   * The import_job_files status to store: 'mapped' only for a leaf the backbone
   * declares; a filename-pattern placement is 'suggested' until a person
   * confirms it; structure and unmatched files are 'skipped'.
   */
  reviewStatus:       'mapped' | 'suggested' | 'skipped';
}

export interface DetectedFinding {
  severity: 'error' | 'warning' | 'info';
  code:     string;
  message:  string;
  filePath?: string;
}

/* ─── Filename-heuristic table ──────────────────────────────────────── */

interface HeuristicRule {
  pattern: RegExp;
  ctdSection: string | null;
  sectionKey: string | null;
  artifactKind: string;
  /** Names the rule on the stored suggestion. 2026-10-15: was a per-rule "confidence" (0.70–0.85). */
  ruleId: string;
}

/* Patterns are ordered most-specific first. The mapper picks the first
   match against the basename + relative path. */
const HEURISTICS: HeuristicRule[] = [
  /* eSTAR + 510(k) device sections */
  { pattern: /cover[-_ ]?letter/i,             ctdSection: '1',   sectionKey: 'cover-letter',             artifactKind: 'cover_letter',     ruleId: 'filename.cover-letter' },
  { pattern: /indications?[-_ ]?for[-_ ]?use|^ifu\b|form[-_ ]?3881/i,
                                                ctdSection: null,  sectionKey: 'indications-for-use',      artifactKind: 'ifu_statement',    ruleId: 'filename.indications-for-use' },
  { pattern: /510[-_ ]?k[-_ ]?summary|five[-_ ]?ten[-_ ]?summary/i,
                                                ctdSection: null,  sectionKey: '510k-summary',             artifactKind: '510k_summary',     ruleId: 'filename.510k-summary' },
  { pattern: /truth\w*[-_ ]?accuracy/i,         ctdSection: null,  sectionKey: 'truthful-accuracy',        artifactKind: 'truthful_acc',     ruleId: 'filename.truthful-accuracy' },
  { pattern: /declaration[-_ ]?of[-_ ]?conformity|conformity[-_ ]?dec/i,
                                                ctdSection: null,  sectionKey: 'declarations-conformity',  artifactKind: 'declaration',      ruleId: 'filename.declaration-of-conformity' },
  { pattern: /device[-_ ]?description/i,        ctdSection: null,  sectionKey: 'device-description',       artifactKind: 'device_desc',      ruleId: 'filename.device-description' },
  { pattern: /substantial[-_ ]?equivalence|\bse[-_ ]?discussion\b/i,
                                                ctdSection: null,  sectionKey: 'substantial-equivalence',  artifactKind: 'se_discussion',    ruleId: 'filename.substantial-equivalence' },
  { pattern: /sterili[sz]ation|shelf[-_ ]?life/i, ctdSection: null, sectionKey: 'sterilization',           artifactKind: 'sterilization',    ruleId: 'filename.sterilization' },
  { pattern: /biocompat/i,                      ctdSection: null,  sectionKey: 'biocompatibility',         artifactKind: 'biocompat',        ruleId: 'filename.biocompatibility' },
  { pattern: /software|iec[-_ ]?62304/i,        ctdSection: null,  sectionKey: 'software',                 artifactKind: 'software_doc',     ruleId: 'filename.software' },
  { pattern: /cybersecurity|sbom|threat[-_ ]?model|pentest/i,
                                                ctdSection: null,  sectionKey: 'cybersecurity',            artifactKind: 'cybersecurity',    ruleId: 'filename.cybersecurity' },
  { pattern: /emc|electromagnetic|iec[-_ ]?60601/i,
                                                ctdSection: null,  sectionKey: 'electromagnetic',          artifactKind: 'emc',              ruleId: 'filename.emc' },
  { pattern: /performance[-_ ]?bench|bench[-_ ]?testing/i,
                                                ctdSection: null,  sectionKey: 'performance-bench',        artifactKind: 'bench_test',       ruleId: 'filename.performance-bench' },
  { pattern: /performance[-_ ]?clinical|clinical[-_ ]?study[-_ ]?report|\bcsr\b/i,
                                                ctdSection: '5.3.5', sectionKey: 'performance-clinical',   artifactKind: 'clinical_report',  ruleId: 'filename.clinical-study-report' },
  { pattern: /labeling|labelling|package[-_ ]?insert/i,
                                                ctdSection: '1.14', sectionKey: 'labeling',                artifactKind: 'labeling',         ruleId: 'filename.labeling' },

  /* Pharma eCTD module hints */
  { pattern: /^m1[/_-]|module[-_ ]?1\b/i,       ctdSection: '1',     sectionKey: null, artifactKind: 'admin',         ruleId: 'filename.module-1' },
  { pattern: /^m2[/_-]|clinical[-_ ]?overview/i, ctdSection: '2.5',   sectionKey: null, artifactKind: 'clinical_ovw',  ruleId: 'filename.clinical-overview' },
  { pattern: /clinical[-_ ]?summary/i,           ctdSection: '2.7',   sectionKey: null, artifactKind: 'clinical_sum',  ruleId: 'filename.clinical-summary' },
  { pattern: /^m3[/_-]|module[-_ ]?3\b|quality[-_ ]?overall/i,
                                                ctdSection: '3',     sectionKey: null, artifactKind: 'cmc',           ruleId: 'filename.module-3' },
  { pattern: /^m4[/_-]|module[-_ ]?4\b|nonclinical/i,
                                                ctdSection: '4',     sectionKey: null, artifactKind: 'nonclinical',   ruleId: 'filename.module-4' },
  { pattern: /^m5[/_-]|module[-_ ]?5\b/i,       ctdSection: '5',     sectionKey: null, artifactKind: 'clinical',      ruleId: 'filename.module-5' },

  /* Trial documents */
  { pattern: /protocol/i,                        ctdSection: '5.3.5.1', sectionKey: null, artifactKind: 'protocol',     ruleId: 'filename.protocol' },
  { pattern: /\bsap\b|statistical[-_ ]?analysis/i,
                                                ctdSection: '5.3.5',   sectionKey: null, artifactKind: 'sap',          ruleId: 'filename.statistical-analysis-plan' },
  { pattern: /\bib\b|investigator[-_ ]?brochure/i,
                                                ctdSection: '1.15',    sectionKey: null, artifactKind: 'ib',           ruleId: 'filename.investigator-brochure' },
];

function applyHeuristic(relPath: string, fileName: string): HeuristicRule | null {
  const haystack = `${relPath} ${fileName}`.toLowerCase();
  for (const rule of HEURISTICS) {
    if (rule.pattern.test(haystack)) return rule;
  }
  return null;
}

/* ─── Backbone-XML leaf extractor ────────────────────────────────────── */

interface BackboneLeaf {
  href:    string;        // 'm1/us/1-1/cover-letter.pdf'
  section: string;        // '1-1' (mapped to '1.1')
  title:   string | null;
  operation: string | null;
}

function parseBackboneLeaves(xml: string): BackboneLeaf[] {
  /* Light-weight regex parse — works for us-regional.xml, eu-regional.xml,
     and jp-regional.xml (all share the <leaf xlink:href=... ID=...>
     structure). For pathological XML we just return [] and the caller
     falls back to filename heuristics. */
  const leaves: BackboneLeaf[] = [];
  const re = /<leaf\s+([^>]*?)\/?>([\s\S]*?)<\/leaf>|<leaf\s+([^>]*?)\/>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const attrBlob = (m[1] ?? m[3] ?? '');
    const hrefMatch = attrBlob.match(/xlink:href\s*=\s*"([^"]+)"/);
    const opMatch   = attrBlob.match(/operation\s*=\s*"([^"]+)"/);
    if (!hrefMatch) continue;
    const href = hrefMatch[1];
    const sectionMatch = href.match(/(?:m1\/(?:us|eu|jp)\/)?([0-9-]+)\//);
    const titleMatch = (m[2] ?? '').match(/<title>([\s\S]*?)<\/title>/);
    leaves.push({
      href,
      section: (sectionMatch?.[1] ?? '').replace(/-/g, '.'),
      title:   titleMatch?.[1].trim() ?? null,
      operation: opMatch?.[1] ?? null,
    });
  }
  return leaves;
}

/* ─── Top-level detector ─────────────────────────────────────────────── */

export async function detectArchive(archivePath: string): Promise<DetectedArchive> {
  const stat = await fs.stat(archivePath);
  if (!stat.isFile()) {
    return { format: 'unknown', region: null, applicationId: null, sequence: null, sponsor: null, files: [], findings: [
      { severity: 'error', code: 'not_a_file', message: `Source path is not a file: ${archivePath}` },
    ]};
  }
  const buffer = await fs.readFile(archivePath);

  /* Only zip / docx (zip) supported in v1. Tar / rar route through a
     follow-up unpack step that lives in import-runner — kept out of this
     detector to keep dependencies minimal. */
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (err) {
    return {
      format: 'unknown', region: null, applicationId: null, sequence: null, sponsor: null, files: [],
      findings: [{ severity: 'error', code: 'unreadable_zip', message: `Could not read zip: ${err instanceof Error ? err.message : String(err)}` }],
    };
  }

  const entries = Object.values(zip.files).filter((f) => !f.dir);
  const findings: DetectedFinding[] = [];

  /* Detect format via backbone presence. */
  const hasUs   = entries.some((e) => /m1\/us\/us-regional\.xml$/i.test(e.name));
  const hasEu   = entries.some((e) => /m1\/eu\/eu-regional\.xml$/i.test(e.name));
  const hasJp   = entries.some((e) => /m1\/jp\/jp-regional\.xml$/i.test(e.name));
  const hasEstar = entries.some((e) => /estar[-_]?[a-z0-9]*\.xml$/i.test(e.name) || /forms\/estar/i.test(e.name));

  let format: DetectedFormat = 'unknown';
  let region: DetectedRegion = null;
  let backboneXml: string | null = null;
  let backbonePath = '';
  if (hasUs)        { format = 'fda_ectd'; region = 'fda';
    const ent = entries.find((e) => /m1\/us\/us-regional\.xml$/i.test(e.name))!;
    backboneXml = await ent.async('text'); backbonePath = ent.name;
  } else if (hasEu) { format = 'ema_ectd'; region = 'ema';
    const ent = entries.find((e) => /m1\/eu\/eu-regional\.xml$/i.test(e.name))!;
    backboneXml = await ent.async('text'); backbonePath = ent.name;
  } else if (hasJp) { format = 'pmda_ectd'; region = 'pmda';
    const ent = entries.find((e) => /m1\/jp\/jp-regional\.xml$/i.test(e.name))!;
    backboneXml = await ent.async('text'); backbonePath = ent.name;
  } else if (hasEstar) {
    format = 'fda_estar'; region = 'fda';
  } else {
    /* No backbone — fall back to shape detection. */
    const hasModules = entries.some((e) => /^m[1-5]\//i.test(e.name));
    if (hasModules) format = 'mixed';
    else format = 'fda_510k_folder';
  }

  /* Parse backbone for explicit leaf list when available. */
  const backboneLeaves = backboneXml ? parseBackboneLeaves(backboneXml) : [];
  const byHref = new Map(backboneLeaves.map((l) => [l.href, l]));

  /* Extract sponsor / application id from backbone where possible. */
  let applicationId: string | null = null;
  let sequence: string | null = null;
  let sponsor: string | null = null;
  if (backboneXml) {
    applicationId = backboneXml.match(/<(?:application|procedure)-number>\s*([^<\s]+)\s*</)?.[1] ?? null;
    sequence      = backboneXml.match(/<(?:submission|sequence)(?:-id)?(?:-number)?>\s*([^<\s]+)\s*</)?.[1] ?? null;
    sponsor       = backboneXml.match(/<(?:applicant|sponsor)[^>]*>\s*[\s\S]*?<name>\s*([^<]+?)\s*<\/name>/)?.[1] ?? null;
  }

  /* Build per-file mapping. */
  const files: DetectedFile[] = [];
  let unmappedWarn = 0;
  let suggested = 0;
  for (const ent of entries) {
    /* Backbone + util files are not "leaves" — they're structure. */
    if (ent.name === backbonePath) {
      files.push(await fileEntry(ent, 'backbone_xml', null, null, null, 'backbone_xml'));
      continue;
    }
    if (/(^|\/)util\/index-md5\.txt$/i.test(ent.name)) {
      files.push(await fileEntry(ent, 'index', null, null, 'md5_index', 'backbone_xml'));
      continue;
    }
    if (/(^|\/)index\.xml$/i.test(ent.name)) {
      files.push(await fileEntry(ent, 'index', null, null, 'ich_index', 'backbone_xml'));
      continue;
    }
    if (/util\/(dtd|style)\//i.test(ent.name)) {
      files.push(await fileEntry(ent, 'stylesheet', null, null, 'stylesheet', 'backbone_xml'));
      continue;
    }

    /* First: see if this leaf is in the backbone. */
    const inBackbone = byHref.get(ent.name);
    if (inBackbone) {
      files.push(await fileEntry(ent, 'leaf',
        inBackbone.section || null,
        null, inBackbone.title ? guessArtifactKind(inBackbone.title) : null,
        'backbone_xml',
      ));
      continue;
    }

    /* Second: filename heuristic — a suggestion, named by its rule. */
    const heur = applyHeuristic(ent.name, path.basename(ent.name));
    if (heur) {
      files.push(await fileEntry(ent, 'leaf',
        heur.ctdSection, heur.sectionKey, heur.artifactKind,
        'filename_heuristic', heur.ruleId,
      ));
      suggested++;
      continue;
    }

    /* Fallback bucket. */
    files.push(await fileEntry(ent, 'attachment', null, null, 'attachment', 'fallback'));
    unmappedWarn++;
  }

  if (suggested > 0) {
    findings.push({
      severity: 'warning', code: 'filename_suggestions_unconfirmed',
      message: `${suggested} file(s) were placed by filename pattern alone; nothing in the archive declares their section. They are stored as suggestions and are not imported on approval until a person confirms each placement.`,
    });
  }
  if (unmappedWarn > 0) {
    findings.push({
      severity: 'warning', code: 'unmatched_files',
      message: `${unmappedWarn} file(s) matched no backbone entry and no filename pattern, and were placed in the attachment bucket. Review them before approving the import.`,
    });
  }

  /* Backbone vs. file-count consistency check. */
  if (backboneLeaves.length > 0) {
    const referenced = new Set(backboneLeaves.map((l) => l.href));
    const missing = backboneLeaves.filter((l) => !entries.some((e) => e.name === l.href));
    for (const m of missing) {
      findings.push({
        severity: 'error', code: 'missing_required_leaf',
        message: `Backbone references "${m.href}" but the file is missing from the archive.`,
        filePath: m.href,
      });
    }
    /* Extras in archive not referenced by backbone — info only. */
    const extras = entries.filter((e) => !referenced.has(e.name) && !/(util|index\.xml|us-regional|eu-regional|jp-regional)/i.test(e.name));
    if (extras.length > 0) {
      findings.push({
        severity: 'info', code: 'extra_files_not_in_backbone',
        message: `${extras.length} file(s) are in the archive but not referenced by the regional backbone XML.`,
      });
    }
  }

  return { format, region, applicationId, sequence, sponsor, files, findings };
}

/** 'mapped' only where the archive declares a leaf's placement; a pattern match is a suggestion. */
function reviewStatusFor(kind: DetectedFile['detectedKind'], declared: boolean): DetectedFile['reviewStatus'] {
  if (kind !== 'leaf') return 'skipped';
  return declared ? 'mapped' : 'suggested';
}

async function fileEntry(
  ent: JSZip.JSZipObject, kind: DetectedFile['detectedKind'],
  ctdSection: string | null, sectionKey: string | null,
  artifactKind: string | null,
  mappingSource: DetectedFile['mappingSource'], mappingRuleId: string | null = null,
): Promise<DetectedFile> {
  const buf = await ent.async('nodebuffer');
  const declared = mappingSource === 'backbone_xml';
  return {
    relativePath: ent.name,
    fileName:     path.basename(ent.name),
    sizeBytes:    buf.length,
    sha256:       createHash('sha256').update(buf).digest('hex'),
    detectedKind: kind,
    mappedCtdSection: ctdSection,
    mappedSectionKey: sectionKey,
    mappedArtifactKind: artifactKind,
    mappingConfidence: declared ? 1 : 0,
    mappingSource,
    mappingRuleId,
    reviewStatus: reviewStatusFor(kind, declared),
  };
}

function guessArtifactKind(title: string): string {
  const t = title.toLowerCase();
  if (/cover.letter/.test(t))  return 'cover_letter';
  if (/protocol/.test(t))      return 'protocol';
  if (/clinical.study.report|csr/.test(t)) return 'clinical_report';
  if (/ifu|indications/.test(t)) return 'ifu_statement';
  if (/labeling/.test(t))      return 'labeling';
  return 'document';
}
