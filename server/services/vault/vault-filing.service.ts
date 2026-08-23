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
import { createScopedLogger } from '../../utils/logger.js';
import { productTypesToSegments } from '../report-os/segment.js';
import {
  foldersForView,
  type VaultViewId,
  type VaultDocKind,
} from '../../../shared/constants/domain/vault-taxonomy.js';
import { detectCTDSection } from '../ctd-ingestion-service.js';
import { classifyArtifact as classifyTmfArtifact } from '../etmf/etmf-logic.js';
import { TMF_ZONE_REFS } from '../../../shared/constants/domain/tmf-reference-model.js';

const logger = createScopedLogger('vault-filing');

// ─── Types ────────────────────────────────────────────────────────────────────

export type FilingConfidence = 'high' | 'medium' | 'none';
export type PlacementStatus = 'unfiled' | 'suggested' | 'confirmed';

export interface FilingInput {
  fileName: string;
  title?: string | null;
  mimeType?: string | null;
  /** Extracted document text; only the first few thousand characters are read. */
  extractedText?: string | null;
  view: VaultViewId;
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
  confidence?: 'high' | 'medium';
}

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
  {
    label: 'FDA administrative form',
    pattern: /\b(form.?)?fda.?(1571|1572|3674|3454|356h)\b/i,
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
const TEXT_RULES: Array<{ label: string; pattern: RegExp; kind: VaultDocKind; view: 'ctd' | 'device'; folder: string; ctdSection?: string }> = [
  { label: 'clinical study report body', pattern: /\bclinical study report\b/i, kind: 'csr', view: 'ctd', folder: 'module-5', ctdSection: '5.3.5' },
  { label: "investigator's brochure body", pattern: /\binvestigator.?s brochure\b/i, kind: 'clinical', view: 'ctd', folder: 'module-5', ctdSection: '5.3' },
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
          rationale: `Matched ${rule.label} — filed to ${folderId} for the ${view} view.`,
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
            rationale: `CTD pattern "${ctd.title}" → Module ${ctd.module} (${ctd.section}).`,
          };
        }
      }
    }

    // 3) Service (CRO/CDMO): the existing DIA TMF zone classifier. Its
    //    default-to-Zone-2 is a placeholder, not a finding — only a keyword
    //    MATCH files; the default falls through to unfiled.
    if (view === 'service') {
      const tmf = classifyTmfArtifact(normalized);
      if (tmf.confidence === 'matched') {
        const folderId = TMF_ZONE_ID.get(tmf.zone) ?? null;
        if (folderId) {
          return {
            evidenceKind: 'clinical',
            folderId,
            ctdSection: null,
            confidence: 'medium',
            needsReview: false,
            rationale: `TMF keyword match → Zone ${tmf.zone} (${tmf.zoneName}).`,
          };
        }
      }
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
        needsReview: false,
        rationale: `Document text contains "${rule.label.replace(' body', '')}" — filename alone was not classifiable.`,
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
export async function resolveVaultView(programId: string, orgId: number): Promise<VaultViewId> {
  try {
    const projRes = await pool.query(
      `SELECT product_type FROM regulatory_programs
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
        LIMIT 1`,
      [programId, orgId],
    );
    const productType: string | null = projRes.rows[0]?.product_type ?? null;
    const projSegs = productType ? productTypesToSegments([productType]) : [];
    if (projSegs.length > 0) return projSegs[0];
    return await resolveOrgVaultView(orgId);
  } catch (err) {
    // A missing regulatory_programs table (fresh env) degrades to the service
    // view — the classifier still runs, it just files against TMF folders.
    logger.warn('resolveVaultView degraded to service view', {
      err: err instanceof Error ? err.message : String(err),
    });
    return 'service';
  }
}

/** The org-level vault view (union of its programs' product types) — for
 *  captures that arrive without a program scope. */
export async function resolveOrgVaultView(orgId: number): Promise<VaultViewId> {
  try {
    const orgTypesRes = await pool.query(
      `SELECT DISTINCT product_type FROM regulatory_programs
        WHERE organization_id = $1 AND product_type IS NOT NULL`,
      [orgId],
    );
    const orgSegs = productTypesToSegments(
      orgTypesRes.rows.map((r: { product_type: string }) => r.product_type),
    );
    return orgSegs[0] ?? 'service';
  } catch (err) {
    logger.warn('resolveOrgVaultView degraded to service view', {
      err: err instanceof Error ? err.message : String(err),
    });
    return 'service';
  }
}
