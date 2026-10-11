/**
 * CER Conformance Validator
 *
 * Deterministic structural conformance of a stored EU clinical / performance
 * evaluation report, executed against the ACTUAL stored content (report columns
 * AND cer_sections rows), never a fabricated verdict.
 *
 * It owns no checklist of its own beyond two identification checks (framework
 * declared; device name and class present). The section checks are the
 * canonical structures:
 *   - MDR / UK MDR / Swiss MedDO -> server/services/market-specs/cer-structure.ts
 *     (CER_SECTIONS, assessCerStructure);
 *   - IVDR -> server/services/market-specs/per-structure.ts
 *     (PER_SECTIONS, assessPerStructure);
 * reached through server/services/market-specs/stored-cer-assessment.ts, which
 * maps populated columns, and section rows whose HEADING names a section in the
 * framework's heading vocabulary, onto those sections. A section no heading
 * names is not found, and the report is not valid.
 *
 * (Until 2026-10-05 this file ran a private 10-column checklist over cer_reports.
 * Scope, appraisal, evaluator qualification, PMCF and references exist only as
 * cer_sections rows, so a CER missing all of them was `valid: true`, and an IVDR
 * report was checked as a CER with no analytical-performance pillar.)
 *
 * Scope (honest): a structural/completeness check. It does NOT assess the
 * scientific adequacy of the evidence or the benefit-risk determination — those
 * need expert clinical judgement. `valid: true` means every MANDATORY section of
 * the canonical structure is present with content, not that the report would
 * pass a Notified Body review. The structures' regulatory citations are recall
 * (not yet checked against regulator text) and are labelled so. The CER basis
 * is per framework: UK MDR 2002 cites the MDD's Annex X, not EU MDR Annex XIV.
 */

import { CER_SECTIONS, assessCerStructure, type CerSection } from '../market-specs/cer-structure';
import { PER_SECTIONS, assessPerStructure, type PerSection } from '../market-specs/per-structure';
import {
  mapStoredCerToCanonicalSections,
  mapStoredPerToCanonicalSections,
  populated,
  type StoredCerMapping,
  type StoredCerReportFields,
  type StoredCerSectionRow,
} from '../market-specs/stored-cer-assessment';

export type CerRegulatoryFramework =
  | 'MDR_2017_745'
  | 'IVDR_2017_746'
  | 'UK_MDR_2002'
  | 'Swiss_MedDO';

export interface CerConformanceCheck {
  id: string;
  requirement: string;
  reference: string;
  severity: 'mandatory' | 'recommended';
  status: 'pass' | 'fail';
  detail: string;
}

export interface CerConformanceResult {
  valid: boolean;
  framework: string;
  checkedAt: string;
  checks: CerConformanceCheck[];
  summary: { total: number; passed: number; failed: number; mandatoryFailed: number };
}

/** A stored report — the columns the validator and the canonical mapping read. */
export interface CerReportLike extends StoredCerReportFields {
  regulatoryFramework?: string | null;
  deviceName?: string | null;
  deviceClass?: string | null;
}

export interface CerConformanceOptions {
  /**
   * Whether equivalence to another device is claimed. Not stored on cer_reports,
   * so the caller supplies it when known. When it is not known and no
   * equivalence heading is stored, the equivalence check fails at `recommended`
   * severity and says the claim is not recorded.
   */
  equivalenceClaimed?: boolean;
}

const IS_IVDR = (fw?: string | null): boolean => fw === 'IVDR_2017_746';

/** The frameworks this validator knows the structure for. Anything else fails closed. */
const KNOWN_FRAMEWORKS: ReadonlySet<string> = new Set<CerRegulatoryFramework>([
  'MDR_2017_745',
  'IVDR_2017_746',
  'UK_MDR_2002',
  'Swiss_MedDO',
]);

const RECALL = '(recall — not checked against regulator text)';
const PER_BASIS = `IVDR 2017/746 Annex XIII Part A ${RECALL}`;

/**
 * The instrument a CER is checked against, per framework. UK MDR 2002
 * transposes the Medical Devices Directive, whose clinical evaluation is
 * Annex X, not EU MDR Annex XIV. Swiss MedDO follows EU MDR. All recall.
 */
function cerBasis(fw: string): string {
  if (fw === 'UK_MDR_2002') {
    return `UK MDR 2002 (SI 2002/618), clinical evaluation per Directive 93/42/EEC Annex X; MEDDEV 2.7/1 Rev 4 ${RECALL}`;
  }
  if (fw === 'Swiss_MedDO') {
    return `Swiss MedDO (SR 812.213), clinical evaluation per MDR 2017/745 Annex XIV Part A; MEDDEV 2.7/1 Rev 4 ${RECALL}`;
  }
  return `MDR 2017/745 Annex XIV Part A; MEDDEV 2.7/1 Rev 4 ${RECALL}`;
}

/** The validator's own checks: framework declared, device identified. */
function identificationChecks(cer: CerReportLike, fw: string, basis: string): CerConformanceCheck[] {
  return [
    {
      id: 'framework',
      requirement: 'Regulatory framework is declared',
      reference: `${basis} — framework declaration`,
      severity: 'mandatory',
      status: KNOWN_FRAMEWORKS.has(fw) ? 'pass' : 'fail',
      detail: KNOWN_FRAMEWORKS.has(fw)
        ? 'The applicable regulatory framework is recorded; it decides whether the report is checked as a CER or a PER.'
        : `The regulatory framework "${fw}" is not one this check knows (${[...KNOWN_FRAMEWORKS].join(', ')}); the report cannot be called conformant to an unknown framework.`,
    },
    {
      id: 'device_identification',
      requirement: 'Device is identified (name and class)',
      reference: `${basis} — device identification`,
      severity: 'mandatory',
      status: populated(cer.deviceName) && populated(cer.deviceClass) ? 'pass' : 'fail',
      detail: 'Device name and risk class must be present.',
    },
  ];
}

function foundIn(mapping: StoredCerMapping, id: string): string {
  const src = mapping.sources[id];
  return src && src.length > 0 ? ` Found in: ${src.join(', ')}.` : '';
}

/** Why a section was not found, naming the stored headings that matched nothing. */
function notFound(mapping: StoredCerMapping, framework: string): string {
  const unmatched = mapping.unmatchedHeadings.filter(h => h.length > 0);
  const named =
    unmatched.length > 0
      ? ` Stored headings that name no ${framework} section: ${unmatched.map(h => `"${h}"`).join(', ')}.`
      : '';
  return `Not found: no report column covers it and no stored section row has a heading that names it.${named}`;
}

/** What every section check of one report reads. */
interface SectionCheckContext {
  kind: 'CER' | 'PER';
  /** The citation the structure is checked against, already labelled recall. */
  basis: string;
  mapping: StoredCerMapping;
  /** Required section ids the canonical assessment found missing. */
  missing: Set<string>;
}

function referenceFor(ctx: SectionCheckContext, s: CerSection | PerSection): string {
  return `Canonical ${ctx.kind} structure §${s.number} — ${ctx.basis}`;
}

/** One mandatory section check. */
function sectionCheck(ctx: SectionCheckContext, s: CerSection | PerSection, note = ''): CerConformanceCheck {
  const { kind, mapping } = ctx;
  const ok = !ctx.missing.has(s.id);
  return {
    id: s.id,
    requirement: `${kind} §${s.number} ${s.title} is present${note}`,
    reference: referenceFor(ctx, s),
    severity: 'mandatory',
    status: ok ? 'pass' : 'fail',
    detail: ok ? `${s.purpose}${foundIn(mapping, s.id)}` : `${notFound(mapping, kind)} ${s.purpose}`,
  };
}

/** IVDR: the mandatory sections of the canonical PER structure. */
function perSectionChecks(cer: CerReportLike, sections: StoredCerSectionRow[]): CerConformanceCheck[] {
  const mapping = mapStoredPerToCanonicalSections(cer, sections);
  const missing = new Set(assessPerStructure(mapping.present).missingRequiredSections);
  const ctx: SectionCheckContext = { kind: 'PER', basis: PER_BASIS, mapping, missing };
  return PER_SECTIONS.filter(s => s.required).map(s => sectionCheck(ctx, s));
}

/**
 * The equivalence section: mandatory when equivalence is claimed (by the caller
 * or by a stored equivalence heading); absent when the caller says it is not
 * claimed; a `recommended` failure when the claim is not recorded either way.
 */
function equivalenceCheck(
  ctx: SectionCheckContext,
  s: CerSection,
  claimed: boolean,
  opts: CerConformanceOptions
): CerConformanceCheck | null {
  if (claimed) return sectionCheck(ctx, s, ' (equivalence is claimed)');
  if (opts.equivalenceClaimed === false) return null;
  return {
    id: s.id,
    requirement: `CER §${s.number} ${s.title} — required only when equivalence is claimed`,
    reference: referenceFor(ctx, s),
    severity: 'recommended',
    status: 'fail',
    detail:
      'Whether equivalence to another device is claimed is not recorded on the report, and no stored heading names an equivalence section. If equivalence is claimed, this section is required and the report is not complete.',
  };
}

/** MDR / UK MDR / Swiss MedDO: the canonical CER structure. */
function cerSectionChecks(
  cer: CerReportLike,
  sections: StoredCerSectionRow[],
  opts: CerConformanceOptions,
  basis: string
): CerConformanceCheck[] {
  const mapping = mapStoredCerToCanonicalSections(cer, sections);
  const claimed = opts.equivalenceClaimed === true || mapping.present.includes('equivalence');
  const missing = new Set(
    assessCerStructure(mapping.present, { equivalenceClaimed: claimed }).missingRequiredSections
  );

  const ctx: SectionCheckContext = { kind: 'CER', basis, mapping, missing };
  const checks: CerConformanceCheck[] = [];
  for (const s of CER_SECTIONS) {
    if (s.equivalenceOnly) {
      const check = equivalenceCheck(ctx, s, claimed, opts);
      if (check) checks.push(check);
    } else if (s.required) {
      checks.push(sectionCheck(ctx, s));
    }
  }
  return checks;
}

/**
 * Check a stored CER/PER against its canonical structure.
 *
 * @param cer      the cer_reports row (columns)
 * @param sections the report's cer_sections rows; pass `content` so empty
 *                 placeholder rows do not count
 */
export function validateCerConformance(
  cer: CerReportLike,
  sections: StoredCerSectionRow[] = [],
  opts: CerConformanceOptions = {}
): CerConformanceResult {
  const fw = cer.regulatoryFramework ?? 'unknown';
  const ivdr = IS_IVDR(fw);
  const basis = ivdr ? PER_BASIS : cerBasis(fw);

  const checks: CerConformanceCheck[] = [
    ...identificationChecks(cer, fw, basis),
    ...(ivdr ? perSectionChecks(cer, sections) : cerSectionChecks(cer, sections, opts, basis)),
  ];

  const failed = checks.filter(c => c.status === 'fail');
  const mandatoryFailed = failed.filter(c => c.severity === 'mandatory').length;

  return {
    valid: mandatoryFailed === 0,
    framework: fw,
    checkedAt: new Date().toISOString(),
    checks,
    summary: {
      total: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length,
      mandatoryFailed,
    },
  };
}
