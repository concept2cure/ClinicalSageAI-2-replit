/**
 * Vault filing — the ONE place a captured file is classified and given a
 * dossier placement.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * The platform captures durably (SHA-256, Part 11 audit chains, versions) but
 * routed nothing: real classifiers existed — detectCTDSection
 * (ctd-ingestion-service), the DIA TMF zone rules (etmf-logic), the device
 * 3-axis tagger — and none of them ran on the paths a customer actually uses
 * (`POST /api/vault/ingest`, `POST /api/chat/upload`). Every upload landed as
 * documentType='OTHER' with no folder, no module, no section, and the Vault
 * tree could not show it anywhere. This service composes those EXISTING
 * classifiers (it does not fork them) into one deterministic proposal, keyed
 * to the program's vault view from shared/constants/domain/vault-taxonomy.ts.
 *
 * ── The contract (honesty first) ────────────────────────────────────────────
 * The classifier PROPOSES; it never silently commits a regulatory judgment.
 * A proposal carries its confidence and a human-readable rationale, renders in
 * the Vault as "suggested" until a person confirms or moves it (a governed,
 * audited action), and a file the rules cannot place comes back with
 * `folderId: null` + `needsReview: true` — it lands in the visible Unfiled
 * queue, never in a guessed folder and never in a black hole. Fail closed.
 *
 * Pure classification logic is exported for direct unit testing; only
 * `resolveVaultView` touches the database.
 *
 * @module server/services/vault/vault-filing.service
 */

import { pool } from '../../db.js';
import type { RequestSqlClient } from '../../db/requestDb.js';
import { createScopedLogger } from '../../utils/logger.js';
import { productTypesToSegments } from '../report-os/segment.js';
import { validateSectionCode } from '../../../shared/regulatory/placement-vocabulary.js';
import {
  foldersForView,
  VAULT_DOC_KINDS,
  vaultIngestTypeLabel,
  type VaultViewId,
  type VaultDocKind,
} from '../../../shared/constants/domain/vault-taxonomy.js';
import { detectCTDSection } from '../ctd-ingestion-service.js';
import { soleModule1Placement, type ApplicationKind, type DocumentRole } from '../../../shared/regulatory/regional-module1';
import { canonicalRegionOf, type CanonicalRegion } from '../../../shared/regulatory/region-identity';
import { classifyArtifact as classifyTmfArtifact } from '../etmf/etmf-logic.js';
import { TMF_ZONE_REFS, tmfArtifactName } from '../../../shared/constants/domain/tmf-reference-model.js';

const logger = createScopedLogger('vault-filing');

// ─── Types ────────────────────────────────────────────────────────────────────

export type FilingConfidence = 'high' | 'medium' | 'none';
export type PlacementStatus = 'unfiled' | 'suggested' | 'confirmed';

/** The one cabinet placement rule: a retained folder alone does not file an Unfiled row. */
export function cabinetFolderOf(row: { folder_id?: unknown; placement_status?: unknown }): string | null {
  return typeof row.folder_id === 'string' && row.folder_id && (row.placement_status || 'unfiled') !== 'unfiled'
    ? row.folder_id : null;
}


export interface FilingInput {
  fileName: string;
  title?: string | null;
  mimeType?: string | null;
  /** Extracted document text; only the first few thousand characters are read. */
  extractedText?: string | null;
  view: VaultViewId;
  /** The type the uploader declared (VaultIngestDocumentType), when there was one.
   *  It informs the proposal; a conflict with the name is flagged, not overridden. */
  documentType?: string | null;
  /** The project's region, from its primary agency (resolveVaultFilingContext). Module 1 is regional:
   *  an EU or JP project is given its own heading, another region (or null, an agency that names none)
   *  is given none. Absent: the US heading, as before. */
  jurisdiction?: CanonicalRegion | null;
  /** The project's application kind (its program_type, lower case): it selects the headings that apply. */
  applicationKind?: string | null;
}

export interface FilingClassification {
  /** What the document IS (vault-taxonomy VaultDocKind), or null when unknown. */
  evidenceKind: VaultDocKind | null;
  /** Taxonomy folder for the view, or null = unfiled. Always a folder that
   *  exists in `foldersForView(view)` — the totality test enforces it. */
  folderId: string | null;
  /** Finer CTD placement when detected (e.g. '3.2.P.8'); pharma/biotech only. */
  ctdSection: string | null;
  confidence: FilingConfidence;
  /** True when the rules could not place the file — the visible review queue. */
  needsReview: boolean;
  /** Why — rendered in the UI and carried into the audit row. Never empty. */
  rationale: string;
}

// ─── Rule table ───────────────────────────────────────────────────────────────
//
// First match wins, most-specific first. `folders` maps each vault view to the
// preset folder the match files into; a view absent from the map means the rule
// does not place the file for that view (later rules / the fallback decide).
// Declared as data so the unit tests can enumerate every (rule × view) pair and
// prove each target folder actually exists in that view's preset.

interface FilingRule {
  label: string;
  pattern: RegExp;
  kind: VaultDocKind;
  folders: Partial<Record<VaultViewId, string>>;
  ctdSection?: string;
  /** What the document is in the regional Module 1 record, so a project outside the US is given its own
   *  region's heading. Absent on a Module 1 rule: a US document, which no other region is given a heading for. */
  module1Role?: DocumentRole;
  confidence?: 'high' | 'medium';
}

/**
 * The service view's folder for Form FDA 1572: the TMF classifier's zone for the form, read once. The classifier
 * reads a whole name, so a 1572 whose name also holds a TMF catalog name ("Form FDA 1572 Monitoring Plan") is two
 * zones to it and still this folder here; nothing narrower than that is known to differ.
 */
const FORM_1572_TMF_FOLDER = ((): string | undefined => {
  const c = classifyTmfArtifact('Form FDA 1572');
  return c.confidence === 'matched' ? TMF_ZONE_REFS.find((z) => z.zone === c.zone)?.id : undefined;
})();

const EVERY_VIEW: Record<VaultViewId, string> = {
  pharma: 'corresp', biotech: 'corresp', device: 'corresp', ivd: 'corresp', service: 'corresp',
};

export const FILING_RULES: FilingRule[] = [
  // ── Agency correspondence — every view has a corresp folder ────────────────
  {
    label: 'agency correspondence',
    pattern: /\b(information request|deficiency|rta\b|refuse.?to.?accept|acknowledg(e?ment)?|clearance letter|approval letter|complete response|crl\b|day.?74|filing communication|agency (letter|query|response)|fda letter|ema letter|notified.?body (letter|report)|q-?sub|meeting (minutes|request)|pre.?sub(mission)?)\b/i,
    kind: 'resp',
    folders: { ...EVERY_VIEW },
  },
  // ── Official FDA forms ─────────────────────────────────────────────────────
  // Form FDA 1572 is first and on its own because a TMF files it where the TMF classifier does (Site
  // Management, zone 5), not with the application forms. Until 2026-11-10 the rule below held it too and
  // filed it under Regulatory (z03) when the name said "FDA 1572", while a name that said only "1572"
  // reached the classifier and went to z05: one form, two folders, by spelling.
  {
    label: 'Form FDA 1572',
    pattern: /\b(form.?)?fda.?1572\b/i,
    kind: 'cert',
    folders: { pharma: 'module-1', biotech: 'module-1', ...(FORM_1572_TMF_FOLDER ? { service: FORM_1572_TMF_FOLDER } : {}) },
    ctdSection: '1.1',
  },
  {
    label: 'FDA administrative form',
    pattern: /\b(form.?)?fda.?(1571|3674|3454|356h)\b/i,
    kind: 'cert',
    folders: { pharma: 'module-1', biotech: 'module-1', service: 'z03' },
    ctdSection: '1.1',
  },
  {
    label: 'FDA device form',
    pattern: /\b(form.?)?fda.?3514\b|\bcdrh premarket cover sheet\b/i,
    kind: 'cert',
    folders: { device: 'k510', ivd: 'k510' },
  },
  // ── eCTD sequence artifacts ────────────────────────────────────────────────
  {
    label: 'eCTD sequence artifact',
    pattern: /\b(index\.xml|(us|eu)-regional(\.xml)?|ectd.?sequence|sequence.?\d{4}|checksum\.md5)\b/i,
    kind: 'submission',
    folders: { pharma: 'sequences', biotech: 'sequences' },
  },
  // ── Templates / boilerplate — every view has a shared folder ───────────────
  {
    label: 'template / boilerplate',
    pattern: /\b(template|boilerplate|house (style|format)|blank form|style guide)\b/i,
    kind: 'template',
    folders: { pharma: 'shared', biotech: 'shared', device: 'shared', ivd: 'shared', service: 'shared' },
  },
  // ── Device / IVD specific ──────────────────────────────────────────────────
  {
    label: '510(k) / eSTAR submission artifact',
    pattern: /\b(510.?\(?k\)?|estar|substantial(ly)? equivalen(ce|t)|predicate)\b/i,
    kind: 'submission',
    folders: { device: 'k510', ivd: 'k510' },
  },
  {
    label: 'PMA artifact',
    pattern: /\bpma\b|\bpremarket approval\b|\bssed\b/i,
    kind: 'submission',
    folders: { device: 'pma', ivd: 'pma' },
  },
  {
    label: 'clinical evaluation / performance evaluation',
    pattern: /\b(cer\b|clinical evaluation|cep\b|pmcf|literature (search|review)|state of the art|performance evaluation|pep\b|sota\b)\b/i,
    kind: 'clinical',
    folders: { device: 'cer', ivd: 'cer' },
  },
  {
    label: 'engineering / DHF / risk file',
    pattern: /\b(dhf|rmf|design (history|control|input|output|review)|risk (management|analysis)( file| report)?|residual risk|iso.?14971|fmea|verification|validation report|biocompat(ibility)?|iso.?10993|steriliz(ation|ed)|shelf.?life|software (description|documentation)|sbom|cybersecurity|emc\b|iec.?60601|bench test)\b/i,
    kind: 'report',
    folders: { device: 'eng', ivd: 'eng' },
  },
  {
    label: 'labeling / IFU / UDI',
    pattern: /\b(ifu\b|instructions for use|package insert|labell?ing|label\b|udi\b|artwork)\b/i,
    kind: 'label',
    // Pharma labeling is CTD Module 1 content (USPI/SmPC live in the regional
    // administrative module), device labeling has its own folder.
    folders: { device: 'udi', ivd: 'udi', pharma: 'module-1', biotech: 'module-1' },
    ctdSection: '1.14',
    module1Role: 'product_information_draft',
  },
  {
    label: 'post-market vigilance record',
    pattern: /\b(mdr report|vigilance|complaint|adverse event report|maude|fsca|field safety|recall|capa\b|psur\b|pms (report|plan)|post.?market)\b/i,
    kind: 'capa',
    folders: { device: 'pv', ivd: 'pv' },
  },
  {
    label: 'quality-system record',
    pattern: /\b(sop\b|standard operating procedure|quality manual|management review|work instruction|training (log|record|curriculum)|internal audit|iso.?13485)\b/i,
    kind: 'qms',
    // Pharma/biotech vault presets have no QMS folder — quality-system records
    // belong to the Quality module, not the dossier. The rule still names the
    // KIND; folder resolution falls through to unfiled for those views, and the
    // rationale (below) says why.
    folders: { device: 'qms', ivd: 'qms' },
  },
];

// High-signal document-body phrases, consulted ONLY when filename + title match
// nothing. Bounded scan; a body phrase alone is a medium-confidence signal.
export const TEXT_RULES: Array<{ label: string; pattern: RegExp; kind: VaultDocKind; view: 'ctd' | 'device'; folder: string; ctdSection?: string; module1Role?: DocumentRole }> = [
  { label: 'clinical study report body', pattern: /\bclinical study report\b/i, kind: 'csr', view: 'ctd', folder: 'module-5', ctdSection: '5.3.5' },
  /* The IB is a Module 1 document in an FDA eCTD: 1.14.4.1 Investigator's Brochure, under
     1.14.4 Investigational Drug Labeling (21 CFR 312.23(a)(5)). It used to be filed at
     module-5 / 5.3, which is where the clinical study reports live — the registry's own comment
     on this error says "an M5 assignment puts it in the wrong backbone node and the sequence does
     not validate" (shared/regulatory/global-document-registry.ts). The code comes from the record,
     not from this line. */
  { label: "investigator's brochure body", pattern: /\binvestigator.?s brochure\b/i, kind: 'clinical', view: 'ctd', folder: 'module-1', ctdSection: soleModule1Placement('investigators_brochure', 'US', 'ind')?.code, module1Role: 'investigators_brochure' },
  { label: 'statistical analysis plan body', pattern: /\bstatistical analysis plan\b/i, kind: 'protocol', view: 'ctd', folder: 'module-5', ctdSection: '5.3.5' },
  { label: 'clinical evaluation report body', pattern: /\bclinical evaluation report\b/i, kind: 'clinical', view: 'device', folder: 'cer' },
  { label: 'instructions-for-use body', pattern: /\binstructions for use\b/i, kind: 'label', view: 'device', folder: 'udi' },
];

const TEXT_SCAN_LIMIT = 4000;

// CTD module number → pharma/biotech preset folder id.
const CTD_MODULE_FOLDER: Record<number, string> = {
  1: 'module-1', 2: 'module-2', 3: 'module-3', 4: 'module-4', 5: 'module-5',
};

// detectCTDSection documentType → VaultDocKind (both vocabularies already exist).
const CTD_DOC_TYPE_KIND: Record<string, VaultDocKind> = {
  study_report: 'report',
  specification: 'spec',
  summary: 'report',
  risk_management: 'clinical',
  general: 'report',
};

const TMF_ZONE_ID = new Map(TMF_ZONE_REFS.map(z => [z.zone, z.id]));

// ─── The classifier ───────────────────────────────────────────────────────────

/**
 * Classify a captured file into the program's vault folder taxonomy.
 * Deterministic, pure, fail-closed: an input the rules cannot place returns
 * `{ folderId: null, needsReview: true, confidence: 'none' }`.
 */
export function classifyForFiling(input: FilingInput): FilingClassification {
  const byName = inProjectRegion(classifyByName(input), input);
  const type = input.documentType ?? '';
  if (!Object.prototype.hasOwnProperty.call(DECLARED_TYPE, type)) return byName;
  return reconcileDeclaredType(byName, DECLARED_TYPE[type], type, input.view);
}

/**
 * What an uploader's declared type says (VR-04): the kind it names, and the
 * CTD module it belongs in for a dossier view. A module type names no kind;
 * OTHER says nothing and is absent.
 */
const DECLARED_TYPE: Readonly<Record<string, { kind: VaultDocKind | null; module?: number }>> = {
  CSR: { kind: 'csr', module: 5 },
  PROTOCOL: { kind: 'protocol', module: 5 },
  SAP: { kind: 'protocol', module: 5 },
  SAR: { kind: 'report', module: 5 },
  CER: { kind: 'clinical' },
  IB: { kind: 'clinical' },
  DSUR: { kind: 'report' },
  PSUR: { kind: 'capa' },
  MODULE_2: { kind: null, module: 2 },
  MODULE_3: { kind: null, module: 3 },
  MODULE_4: { kind: null, module: 4 },
  MODULE_5: { kind: null, module: 5 },
  SOP: { kind: 'qms' },
  REPORT: { kind: 'report' },
  CORRESPONDENCE: { kind: 'resp' },
};

/** Kinds too broad to contradict a declared one: the CTD classifier names every study document a report. */
const GENERIC_KINDS: ReadonlySet<VaultDocKind> = new Set(['report']);

function moduleOfFolder(folderId: string | null): number | null {
  const m = folderId ? /^module-(\d)$/.exec(folderId) : null;
  return m ? Number(m[1]) : null;
}

/**
 * What the name says, when it contradicts the declared type: a different CTD
 * module in a dossier view, or a different specific kind. Null when they agree
 * or the name said nothing.
 */
function nameContradiction(
  byName: FilingClassification,
  declared: { kind: VaultDocKind | null; module?: number },
  view: VaultViewId,
): string | null {
  const nameModule = view === 'pharma' || view === 'biotech' ? moduleOfFolder(byName.folderId) : null;
  const moduleConflict = declared.module != null && nameModule != null && nameModule !== declared.module;
  const nameKind = byName.evidenceKind;
  const kindConflict = declared.kind != null && nameKind != null && nameKind !== declared.kind && !GENERIC_KINDS.has(nameKind);
  if (!moduleConflict && !kindConflict) return null;
  if (!byName.folderId) return `a ${nameKind} document`;
  return `${folderLabel(view, byName.folderId)}${byName.ctdSection ? ` (${byName.ctdSection})` : ''}`;
}

function reconcileDeclaredType(
  byName: FilingClassification,
  declared: { kind: VaultDocKind | null; module?: number },
  type: string,
  view: VaultViewId,
): FilingClassification {
  const label = vaultIngestTypeLabel(type);
  const kind = declared.kind ?? byName.evidenceKind;
  const nameSays = nameContradiction(byName, declared, view);
  if (nameSays) {
    return {
      evidenceKind: kind,
      folderId: null,
      ctdSection: null,
      confidence: 'none',
      needsReview: true,
      rationale: `Uploaded as ${label}${declared.module ? ` (Module ${declared.module})` : ''}, but the name suggests ${nameSays}. Review where it belongs.`,
    };
  }
  if (byName.folderId) return { ...byName, evidenceKind: kind, rationale: `${byName.rationale} Uploaded as ${label}.` };
  // The name placed nothing, so the declared type is the only signal.
  const dossier = view === 'pharma' || view === 'biotech';
  const folderId = dossier && declared.module ? `module-${declared.module}` : null;
  if (folderId && isFolderInView(view, folderId)) {
    return {
      evidenceKind: declared.kind,
      folderId,
      ctdSection: null,
      confidence: 'medium',
      needsReview: false,
      rationale: `Uploaded as ${label}, so Module ${declared.module}; the name did not identify a section.`,
    };
  }
  return { ...byName, evidenceKind: kind, rationale: `Uploaded as ${label}. ${byName.rationale}` };
}

type TmfMatch = Extract<ReturnType<typeof classifyTmfArtifact>, { confidence: 'matched' }>;

/**
 * The TMF classifier's answer for a document. Its file name and its title are read apart: ingest always passes
 * a title and the Data Room passes the file name as the title, and together ("Monitoring-Plan-v2.pdf Monitoring
 * Plan v2") they are no artifact's name. An answer that names the artifact is preferred to one that names only
 * the zone. A name that points to two zones, or a name and a title that point to different ones, is 'two zones':
 * a clean title does not settle a name that disagrees with itself.
 */
function classifyTmfDocument(name: string, title: string): TmfMatch | 'two zones' | null {
  const read = [...new Set([name, title].filter(Boolean))].map((text) => classifyTmfArtifact(text.replace(/[-_]+/g, ' ')));
  if (read.some((c) => c.confidence === 'unclassified' && c.conflict)) return 'two zones';
  const matched = read.filter((c): c is TmfMatch => c.confidence === 'matched');
  if (new Set(matched.map((c) => c.zone)).size > 1) return 'two zones';
  return matched.find((c) => c.code) ?? matched[0] ?? null;
}

/** The service view's proposal from the TMF classifier, or null when the name and title say nothing of a zone. */
function fileByTmfZone(name: string, title: string): FilingClassification | null {
  const tmf = classifyTmfDocument(name, title);
  if (tmf === 'two zones') {
    return {
      evidenceKind: 'clinical',
      folderId: null,
      ctdSection: null,
      confidence: 'none',
      needsReview: true,
      rationale: 'The name and title point to more than one TMF zone. Review where it belongs.',
    };
  }
  const folderId = tmf ? TMF_ZONE_ID.get(tmf.zone) ?? null : null;
  if (!tmf || !folderId) return null;
  return {
    evidenceKind: 'clinical',
    folderId,
    ctdSection: null,
    confidence: 'medium',
    needsReview: false,
    // A name that is a catalog artifact was called a keyword match too (until 2026-11-10).
    rationale: tmf.code
      ? `Named as the TMF artifact "${tmfArtifactName(tmf.code)}" → Zone ${tmf.zone} (${tmf.zoneName}).`
      : `A TMF artifact name or keyword in the name → Zone ${tmf.zone} (${tmf.zoneName}).`,
  };
}

/** A proposal from the name, with what the matched rule says the document is in Module 1. */
type NameProposal = FilingClassification & { module1Role?: DocumentRole };

/** The proposal from the name, title and text alone. */
function classifyByName(input: FilingInput): NameProposal {
  const view = input.view;
  const name = (input.fileName || '').trim();
  const title = (input.title || '').trim();
  const haystack = `${name} ${title}`.trim();
  // Filenames separate words with hyphens/underscores; the rule phrases use
  // spaces. Match against both spellings — dots are kept so extension-anchored
  // patterns (index.xml, checksum.md5) still see them.
  const normalized = haystack.replace(/[-_]+/g, ' ');
  const matches = (re: RegExp): boolean => re.test(haystack) || re.test(normalized);

  if (haystack.length > 0) {
    // 1) The shared rule table, most-specific first.
    for (const rule of FILING_RULES) {
      if (!matches(rule.pattern)) continue;
      const folderId = rule.folders[view] ?? null;
      if (folderId) {
        return {
          evidenceKind: rule.kind,
          folderId,
          ctdSection: view === 'pharma' || view === 'biotech' ? rule.ctdSection ?? null : null,
          confidence: rule.confidence ?? 'high',
          needsReview: false,
          // The folder a person sees, not its id or the view (J2 human test, 2026-11-06).
          rationale: `Matched ${rule.label} — filed to ${folderLabel(view, folderId) || folderId}.`,
          module1Role: rule.module1Role,
        };
      }
      // The rule names what the file IS but this view has no folder for it
      // (e.g. an SOP in a pharma dossier vault). Honest partial answer.
      return {
        evidenceKind: rule.kind,
        folderId: null,
        ctdSection: null,
        confidence: 'none',
        needsReview: true,
        rationale: `Matched ${rule.label}, but the ${view} vault has no folder for that kind — review where it belongs (quality-system records live in the Quality module, not the dossier).`,
      };
    }

    // 2) Pharma / biotech: the existing CTD filename classifier.
    if (view === 'pharma' || view === 'biotech') {
      const ctd = detectCTDSection(normalized);
      if (ctd) {
        const folderId = CTD_MODULE_FOLDER[ctd.module] ?? null;
        if (folderId) {
          return {
            evidenceKind: CTD_DOC_TYPE_KIND[ctd.documentType] ?? 'report',
            folderId,
            ctdSection: ctd.section,
            confidence: ctd.confidence >= 0.8 ? 'high' : 'medium',
            needsReview: false,
            rationale: ctd.section
              ? `CTD pattern "${ctd.title}" → Module ${ctd.module} (${ctd.section}).`
              : `The name names Module ${ctd.module} but no section; confirm where in the module it belongs.`,
            // Its US heading above; another region's is read for this role (inProjectRegion).
            module1Role: ctd.role,
          };
        }
      }
    }

    // 3) Service (CRO/CDMO): the existing DIA TMF zone classifier. Only a
    //    MATCH files (a catalog artifact's name, or a keyword); a name it
    //    returns as 'unclassified' (no zone, or two zones) falls through to
    //    unfiled. (Before 2026-10-15 it defaulted to Zone 2.)
    if (view === 'service') {
      const filed = fileByTmfZone(name, title);
      if (filed) return filed;
    }
  }

  // 4) Document-body phrases, only when the name told us nothing.
  const text = (input.extractedText || '').slice(0, TEXT_SCAN_LIMIT);
  if (text) {
    for (const rule of TEXT_RULES) {
      if (!rule.pattern.test(text)) continue;
      const applies =
        rule.view === 'ctd' ? view === 'pharma' || view === 'biotech'
        : view === 'device' || view === 'ivd';
      if (!applies) continue;
      return {
        evidenceKind: rule.kind,
        folderId: rule.folder,
        ctdSection: rule.view === 'ctd' ? rule.ctdSection ?? null : null,
        confidence: 'medium',
        /* A body phrase is this file's own MEDIUM-confidence signal (see the TEXT_RULES header):
           the filename and title matched nothing and a sentence in the text decided the placement.
           It returned needsReview:false, so the rationale read as a settled fact and no human was
           asked. Medium confidence and "no review needed" cannot both be true. */
        needsReview: true,
        rationale: `Document text contains "${rule.label.replace(' body', '')}" — filename alone was not classifiable, so this placement is from the body text and is worth confirming.`,
        module1Role: rule.module1Role,
      };
    }
  }

  // 5) Fail closed. No guess, no default folder — the visible Unfiled queue.
  return {
    evidenceKind: null,
    folderId: null,
    ctdSection: null,
    confidence: 'none',
    needsReview: true,
    rationale: 'No filing rule matched the name, title, or document text — needs a person to file it.',
  };
}

// ─── Module 1 follows the project's region ───────────────────────────────────

/**
 * Module 1 is the CTD's one regional module (ICH M4), and the rule tables above state the US heading.
 * Labeling was proposed at 1.14 and the IB at 1.14.4.1 for every CTD project, so an EMA project's SmPC
 * was proposed at a US heading (S6, 2026-11-05). An EU or JP project is now given its own heading from
 * the regional Module 1 record, by what the document is; any other region, or an agency that names
 * none, keeps Module 1 and is given no section. A caller that states no region gets the US heading.
 * The module and Modules 2 to 5 do not change: ICH harmonises them.
 */
function inProjectRegion(named: NameProposal, input: FilingInput): FilingClassification {
  const { module1Role, ...proposal } = named;
  if (input.jurisdiction === undefined || input.jurisdiction === 'US') return proposal;
  if (proposal.folderId !== 'module-1' || (!proposal.ctdSection && !module1Role)) return proposal;
  const regional = regionalModule1(module1Role, input.jurisdiction, input.applicationKind ?? null);
  // A document the US record gives no heading (an RMP) is not said to have "no section" when its region gives one.
  const base = proposal.ctdSection ? proposal.rationale : 'The file name names a Module 1 document.';
  const rationale = `${base} ${regional.sentence}`;
  if (regional.code) return { ...proposal, ctdSection: regional.code, rationale };
  return { ...proposal, ctdSection: null, confidence: 'medium', needsReview: true, rationale };
}

/** The region's heading for a document with this role, or null and why. Never a nearest match. */
function regionalModule1(
  role: DocumentRole | undefined,
  jurisdiction: CanonicalRegion | null,
  kind: string | null,
): { code: string | null; sentence: string } {
  const unplaced = 'so no section is proposed. A person places it.';
  if (jurisdiction !== 'EU' && jurisdiction !== 'JP') {
    return {
      code: null,
      sentence: jurisdiction
        ? `Module 1 is regional, and the ${jurisdiction} Module 1 is not modelled here, ${unplaced}`
        : `Module 1 is regional, and the project's agency names no region whose Module 1 is modelled here, ${unplaced}`,
    };
  }
  if (!role) return { code: null, sentence: `The rule that matched gives the US Module 1 heading and no ${jurisdiction} one, ${unplaced}` };
  const placed = soleModule1Placement(role, jurisdiction, (kind ?? undefined) as ApplicationKind | undefined);
  if (!placed) {
    const application = kind ? ` in this application (${kind.toUpperCase()})` : '';
    return { code: null, sentence: `The ${jurisdiction} Module 1 holds no single heading for this document${application}, ${unplaced}` };
  }
  return { code: placed.code, sentence: `Module 1 follows the project's region: ${jurisdiction} ${placed.code}, ${placed.title}.` };
}

// ─── The vocabulary a filing decision is held to ──────────────────────────────

export type FilingVocabularyRefusal = { code: 'INVALID_EVIDENCE_KIND' | 'INVALID_CTD_SECTION'; message: string };

/**
 * Refuse a filing whose evidence kind or CTD section is outside the vocabulary
 * (VR-04, row D4). Both writers of a filing decision, the governed ingest and
 * the placement service, call this before they write anything, so a value like
 * 'banana' never enters the record or the chained audit row as a person's
 * decision. An absent (or blank) value is not checked: saying nothing is
 * allowed; saying something outside the list is not.
 *
 * The section is judged as upsertLeaf judges one (validateSectionCode 'ctd'):
 * a CTD code with a dot, since a bare module is a container. That validator
 * accepts 'N.0' by shape; the classifier no longer proposes it
 * (detectCTDSection), and tightening the shared validator for modules 2-5
 * would move leaf placement, so it is handed to the D7 lanes.
 */
export function filingVocabularyRefusal(input: {
  evidenceKind?: string | null;
  ctdSection?: string | null;
}): FilingVocabularyRefusal | null {
  const kind = input.evidenceKind?.trim();
  if (kind && !VAULT_DOC_KINDS.some(k => k.value === kind)) {
    return {
      code: 'INVALID_EVIDENCE_KIND',
      message: `"${kind}" is not an evidence kind the Vault records. Use one of: ${VAULT_DOC_KINDS.map(k => k.value).join(', ')}. Nothing was saved.`,
    };
  }
  const section = input.ctdSection?.trim();
  if (section) {
    const verdict = validateSectionCode(section, 'ctd');
    if (!verdict.ok) return { code: 'INVALID_CTD_SECTION', message: `${verdict.message} Nothing was saved.` };
  }
  return null;
}

// ─── View + folder helpers ────────────────────────────────────────────────────

/** Is `folderId` a real folder in this view's preset taxonomy? */
export function isFolderInView(view: VaultViewId, folderId: string): boolean {
  return foldersForView(view).some(f => f.id === folderId);
}

/** Label for a preset folder id in a view ('' when absent — never invented). */
export function folderLabel(view: VaultViewId, folderId: string | null): string {
  if (!folderId) return '';
  return foldersForView(view).find(f => f.id === folderId)?.label ?? '';
}

/**
 * The vault view for a program: its own product_type → segment, else the union
 * across the org's programs, else the cross-sponsor service view. This is the
 * SAME derivation the project-vault read-model shipped with — moved here so the
 * ingest path and the read path cannot drift.
 */
export async function resolveVaultView(programId: string, orgId: number, executor: RequestSqlClient = pool): Promise<VaultViewId> {
  return (await resolveVaultFilingContext(programId, orgId, executor)).view;
}

/** What a program's settings select for filing: its vault view, and the region and application of its Module 1. */
export interface VaultFilingContext {
  view: VaultViewId;
  /** canonicalRegionOf(primary_agency): 'FDA' → 'US', 'HEALTH_CANADA' → 'CA'; null when it names no region. */
  jurisdiction: CanonicalRegion | null;
  /** program_type, lower case; null when none is recorded. */
  applicationKind: string | null;
}

/** The view resolveVaultView gives, with the region and application read in the same query (S6, 2026-11-05). */
export async function resolveVaultFilingContext(
  programId: string,
  orgId: number,
  executor: RequestSqlClient = pool,
): Promise<VaultFilingContext> {
  try {
    const projRes = await executor.query(
      `SELECT product_type, primary_agency, program_type FROM regulatory_programs
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
        LIMIT 1`,
      [programId, orgId],
    );
    const row = projRes.rows[0];
    const productType = typeof row?.product_type === 'string' ? row.product_type : null;
    const region = {
      jurisdiction: canonicalRegionOf(textColumn(row?.primary_agency)) ?? null,
      applicationKind: textColumn(row?.program_type)?.toLowerCase() ?? null,
    };
    const projSegs = productType ? productTypesToSegments([productType]) : [];
    if (projSegs.length > 0) return { view: projSegs[0], ...region };
    return { view: await resolveOrgVaultView(orgId, executor), ...region };
  } catch (err) {
    // A missing regulatory_programs table (fresh env) degrades to the service
    // view — the classifier still runs, it just files against TMF folders.
    // Nothing else does (VR-04): a transient failure used to file a pharma
    // program's document against the TMF folders, silently.
    if (!isMissingTable(err)) throw err;
    logger.warn('resolveVaultView degraded to service view', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { view: 'service', jurisdiction: null, applicationKind: null };
  }
}

/** A non-blank text column, trimmed; null otherwise. */
function textColumn(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** The org-level vault view (union of its programs' product types) — for
 *  captures that arrive without a program scope. */
export async function resolveOrgVaultView(orgId: number, executor: RequestSqlClient = pool): Promise<VaultViewId> {
  try {
    const orgTypesRes = await executor.query(
      `SELECT DISTINCT product_type FROM regulatory_programs
        WHERE organization_id = $1 AND product_type IS NOT NULL`,
      [orgId],
    );
    const orgSegs = productTypesToSegments(
      orgTypesRes.rows.map(r => r.product_type).filter((value): value is string => typeof value === 'string'),
    );
    return orgSegs[0] ?? 'service';
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    logger.warn('resolveOrgVaultView degraded to service view', {
      err: err instanceof Error ? err.message : String(err),
    });
    return 'service';
  }
}

/** 42P01: the table does not exist in this deployment. */
function isMissingTable(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === '42P01';
}
