/**
 * @fileoverview M3 narrative composer extensions — 3.2.A.*, 3.2.R.*, cross-references
 * @module server/services/module3-extensions
 *
 * Extends `module3Composer.ts` with the appendix (3.2.A.*) and regional (3.2.R.*)
 * subsections, plus a cross-reference injection helper that adds inline pointers
 * like "(see 3.2.S.7 Stability)" wherever a section depends on another section's
 * data.
 *
 * Why a separate file:
 *  - module3Composer.ts is 750 lines already; extending in-place creates a monolith
 *  - Appendices and Regional are submission-type-specific (US vs EU vs JP vs CA),
 *    so they need their own dispatcher
 */

import {
  composeModule3FromCanonicalSources,
  type CanonicalSource,
  type ComposedSection,
  type GeneratedTable,
  type CmcSourceType,
} from './module3Composer.js';

export type RegionCode = 'US' | 'EU' | 'JP' | 'CA';

// ── 3.2.A.* — Appendices ────────────────────────────────────────────────────

interface AppendixRule {
  sectionKey: string;
  title: string;
  requiredSourceTypes: CmcSourceType[];
  optional: boolean;
  generator: (matched: CanonicalSource[]) => { narrative: string; tables: GeneratedTable[] };
}

const APPENDIX_RULES: AppendixRule[] = [
  {
    sectionKey: '3.2.A.1',
    title: 'Facilities and Equipment',
    requiredSourceTypes: ['manufacturing_process'],
    optional: false,
    generator: (matched) => {
      const sites = matched
        .map(m => String(m.sourcePayload?.manufacturingSite || m.sourcePayload?.site || ''))
        .filter(s => s);
      const equipment = matched
        .flatMap(m => Array.isArray(m.sourcePayload?.equipment) ? m.sourcePayload.equipment : [])
        .filter(e => e);
      const tables: GeneratedTable[] = [];
      if (sites.length > 0) {
        tables.push({
          title: 'Manufacturing Facilities',
          headers: ['Site', 'Function'],
          rows: sites.map(s => [s, 'Drug substance / drug product manufacturing']),
        });
      }
      if (equipment.length > 0) {
        tables.push({
          title: 'Critical Equipment',
          headers: ['Equipment', 'Operation'],
          rows: equipment.map((e: any) => [String(e.name || e), String(e.operation || '—')]),
        });
      }
      return {
        narrative: `This section describes facilities and equipment used in the manufacture of the drug substance and drug product. ` +
          (sites.length > 0 ? `Manufacturing is performed at ${sites.length} site(s): ${sites.join(', ')}. ` : '') +
          `All facilities operate under current Good Manufacturing Practice (cGMP) per 21 CFR 210/211 and EU GMP Annex 1.`,
        tables,
      };
    },
  },
  {
    sectionKey: '3.2.A.2',
    title: 'Adventitious Agents Safety Evaluation',
    requiredSourceTypes: ['drug_substance', 'characterization'],
    optional: true,
    generator: (matched) => {
      const ds = matched.find(m => m.sourceType === 'drug_substance');
      const isBiologic = ds?.sourcePayload?.modality === 'biologic' ||
        ds?.sourcePayload?.molecularType === 'biologic' ||
        ds?.sourcePayload?.cellLine !== undefined;
      if (!isBiologic) {
        return {
          narrative: `Section 3.2.A.2 is not applicable for this product as it is a small-molecule chemical entity not derived from animal/human source material. No adventitious agents safety evaluation is required.`,
          tables: [],
        };
      }
      const cellLine = String(ds?.sourcePayload?.cellLine || '[not specified]');
      const sourceMaterial = String(ds?.sourcePayload?.sourceMaterial || '[not specified]');
      return {
        narrative: `Adventitious agents safety evaluation is provided for the biologic drug substance derived from ${cellLine} cell line. ` +
          `Source materials: ${sourceMaterial}. The viral safety strategy follows ICH Q5A(R2) and includes (1) selection and testing of cell lines, ` +
          `(2) testing of unprocessed bulk for viral contaminants, and (3) viral clearance studies on the manufacturing process.`,
        tables: [{
          title: 'Adventitious Agents Safety Strategy (ICH Q5A)',
          headers: ['Stage', 'Test Type', 'Outcome'],
          rows: [
            ['Cell Line', 'In vitro / in vivo testing', 'Cleared per ICH Q5A'],
            ['Unprocessed Bulk', 'Viral testing per 9 CFR 113', '[results]'],
            ['Process Clearance', 'Spike-and-recover viral clearance', '[log10 reduction]'],
          ],
        }],
      };
    },
  },
  {
    sectionKey: '3.2.A.3',
    title: 'Excipients',
    requiredSourceTypes: ['excipient'],
    optional: true,
    generator: (matched) => {
      const excipients = matched.filter(m => m.sourceType === 'excipient');
      const novelExcipients = excipients.filter(e => e.sourcePayload?.novel === true);
      if (novelExcipients.length === 0) {
        return {
          narrative: `Section 3.2.A.3 is not applicable; all excipients used in the drug product are compendial and have established safety profiles.`,
          tables: [],
        };
      }
      return {
        narrative: `${novelExcipients.length} novel excipient(s) are used in the drug product formulation. ` +
          `Safety qualification data per ICH Q3C / FDA Guidance for Industry — Nonclinical Studies for Novel Excipients is provided below.`,
        tables: [{
          title: 'Novel Excipients — Safety Qualification',
          headers: ['Excipient', 'Function', 'Concentration', 'Safety Studies'],
          rows: novelExcipients.map(e => [
            String(e.sourcePayload?.materialName || 'Unknown'),
            String(e.sourcePayload?.function || '—'),
            String(e.sourcePayload?.concentration || '—'),
            String(e.sourcePayload?.safetyStudies || 'See M4'),
          ]),
        }],
      };
    },
  },
];

// ── 3.2.R.* — Regional ──────────────────────────────────────────────────────

interface RegionalSubsection {
  sectionKey: string;
  title: string;
  region: RegionCode;
  generator: (matched: CanonicalSource[]) => { narrative: string; tables: GeneratedTable[] };
}

const REGIONAL_SUBSECTIONS: RegionalSubsection[] = [
  {
    sectionKey: '3.2.R.1.US',
    title: 'Executed Batch Records (US)',
    region: 'US',
    generator: (matched) => {
      const batches = matched.filter(m => m.sourceType === 'batch');
      return {
        narrative: `This US-specific section provides executed batch records for the drug substance and drug product. ` +
          `${batches.length} batch record(s) are referenced. Per FDA Guidance for Industry — Submission of Documentation in Drug Applications for Manufacturing Changes (SUPAC), ` +
          `batch records support the proposed commercial manufacturing process.`,
        tables: batches.length > 0 ? [{
          title: 'Executed Batch Records',
          headers: ['Batch Number', 'Date', 'Disposition', 'Yield'],
          rows: batches.map(b => [
            String(b.sourcePayload?.batchNumber || '—'),
            String(b.sourcePayload?.manufactureDate || '—'),
            String(b.sourcePayload?.disposition || '—'),
            String(b.sourcePayload?.yield || '—'),
          ]),
        }] : [],
      };
    },
  },
  {
    sectionKey: '3.2.R.2.US',
    title: 'Comparability Protocols (US)',
    region: 'US',
    generator: (matched) => {
      const comparability = matched.filter(m => m.sourceType === 'comparability');
      return {
        narrative: comparability.length > 0
          ? `Comparability protocols submitted under 21 CFR 314.70 / 314.71 to support post-approval changes. ${comparability.length} protocol(s) are referenced.`
          : `No comparability protocols are submitted with this application. Future post-approval CMC changes will be submitted via supplement per 21 CFR 314.70.`,
        tables: comparability.length > 0 ? [{
          title: 'Comparability Protocols',
          headers: ['Protocol ID', 'Scope', 'Acceptance Criteria'],
          rows: comparability.map(c => [
            String(c.sourcePayload?.protocolId || '—'),
            String(c.sourcePayload?.scope || '—'),
            String(c.sourcePayload?.acceptanceCriteria || '—'),
          ]),
        }] : [],
      };
    },
  },
  {
    sectionKey: '3.2.R.3.EU',
    title: 'Medical Device Information (EU)',
    region: 'EU',
    generator: (matched) => {
      const dp = matched.find(m => m.sourceType === 'drug_product');
      const isCombination = dp?.sourcePayload?.deliveryDevice !== undefined;
      return {
        narrative: isCombination
          ? `This drug product is a combination product incorporating ${String(dp?.sourcePayload?.deliveryDevice)} delivery device. ` +
            `CE-marking documentation and Notified Body opinion are provided per Article 117 of EU MDR 2017/745.`
          : `Section 3.2.R.3 is not applicable; the drug product does not incorporate a medical device.`,
        tables: [],
      };
    },
  },
  {
    sectionKey: '3.2.R.4.JP',
    title: 'Master File Information (JP)',
    region: 'JP',
    generator: () => ({
      narrative: `Drug Master File (DMF) information for active substance, intermediates, and packaging components is provided per PMDA Notification 0628.`,
      tables: [],
    }),
  },
  {
    sectionKey: '3.2.R.5.CA',
    title: 'Yearly Biologic Product Reports (CA)',
    region: 'CA',
    generator: () => ({
      narrative: `Yearly Biologic Product Report (YBPR) commitment per Health Canada Guidance Document — Submission of Biologic Drug Substance and Product Information.`,
      tables: [],
    }),
  },
];

// ── Cross-reference injection ───────────────────────────────────────────────

/**
 * Map of sections that should reference other sections inline. The composer
 * doesn't know "stability data is in 3.2.S.7" without being told.
 */
const CROSS_REFERENCE_MAP: Record<string, Array<{ target: string; phrase: string }>> = {
  '3.2.S.4': [{ target: '3.2.S.7', phrase: 'see Stability' }],
  '3.2.P.5': [
    { target: '3.2.P.8', phrase: 'see Stability' },
    { target: '3.2.S.4', phrase: 'see Drug Substance Specification' },
  ],
  '3.2.P.8': [{ target: '3.2.S.7', phrase: 'see Drug Substance Stability' }],
  '3.2.P.2': [
    { target: '3.2.P.1', phrase: 'see Description and Composition' },
    { target: '3.2.P.5', phrase: 'see Drug Product Specification' },
  ],
  '3.2.P.3': [{ target: '3.2.P.5', phrase: 'see Specification' }],
  '2.3.S': [{ target: '3.2.S', phrase: 'see Module 3.2.S' }],
  '2.3.P': [{ target: '3.2.P', phrase: 'see Module 3.2.P' }],
  '2.4': [{ target: '4.2', phrase: 'see Module 4.2 study reports' }],
  '2.7.1': [{ target: '5.3.1', phrase: 'see Module 5.3.1' }],
  '2.7.3': [{ target: '5.3.5', phrase: 'see Module 5.3.5' }],
  '2.7.4': [{ target: '5.3.5', phrase: 'see Module 5.3.5' }],
};

/**
 * Inject cross-reference pointers into a composed section's narrative.
 * Returns a new ComposedSection — does not mutate the input.
 */
export function injectCrossReferences(
  section: ComposedSection,
  presentSectionKeys: Set<string>
): ComposedSection {
  const refs = CROSS_REFERENCE_MAP[section.sectionKey] || [];
  if (refs.length === 0) return section;

  const validRefs = refs.filter(r =>
    Array.from(presentSectionKeys).some(k => k.startsWith(r.target))
  );
  if (validRefs.length === 0) return section;

  const refPhrases = validRefs.map(r => `${r.phrase} (${r.target})`).join('; ');
  const augmented = `${section.narrativeDraft}\n\nCross-references: ${refPhrases}.`;

  return { ...section, narrativeDraft: augmented };
}

/**
 * Inject cross-references across an entire composition pass.
 */
export function injectAllCrossReferences(sections: ComposedSection[]): ComposedSection[] {
  const presentKeys = new Set(sections.map(s => s.sectionKey));
  return sections.map(s => injectCrossReferences(s, presentKeys));
}

// ── Top-level composer ──────────────────────────────────────────────────────

/**
 * Compose appendix (3.2.A.*) sections from canonical sources.
 */
export function composeAppendices(sourceObjects: CanonicalSource[]): ComposedSection[] {
  return APPENDIX_RULES.map(rule => {
    const matched = sourceObjects.filter(s => rule.requiredSourceTypes.includes(s.sourceType));
    const completeness = matched.length === 0
      ? (rule.optional ? 100 : 0)
      : 100;
    const generated = rule.generator(matched);
    return {
      sectionKey: rule.sectionKey,
      sectionPath: rule.sectionKey,
      structuredPayload: {
        sectionKey: rule.sectionKey,
        title: rule.title,
        sourceTypes: rule.requiredSourceTypes,
        optional: rule.optional,
        sourceObjects: matched.map(m => ({ type: m.sourceType, payload: m.sourcePayload })),
      },
      narrativeDraft: generated.narrative,
      tables: generated.tables,
      completeness,
      missingInputs: matched.length === 0 && !rule.optional ? rule.requiredSourceTypes : [],
      lineage: matched.map(m => ({
        sourceObjectId: m.id,
        sourceHashAtCompile: m.sourceHash || '',
      })),
    };
  });
}

/**
 * Compose regional (3.2.R.*) subsections for a target region.
 */
export function composeRegional(sourceObjects: CanonicalSource[], region: RegionCode): ComposedSection[] {
  const applicable = REGIONAL_SUBSECTIONS.filter(rs => rs.region === region);
  return applicable.map(rs => {
    const generated = rs.generator(sourceObjects);
    return {
      sectionKey: rs.sectionKey,
      sectionPath: rs.sectionKey,
      structuredPayload: {
        sectionKey: rs.sectionKey,
        title: rs.title,
        region: rs.region,
      },
      narrativeDraft: generated.narrative,
      tables: generated.tables,
      completeness: 100,
      missingInputs: [],
      lineage: sourceObjects.map(s => ({
        sourceObjectId: s.id,
        sourceHashAtCompile: s.sourceHash || '',
      })),
    };
  });
}

/**
 * Compose the complete Module 3 (S, P, A, R + cross-refs) for a target region.
 */
export function composeFullModule3(
  sourceObjects: CanonicalSource[],
  region: RegionCode
): ComposedSection[] {
  const core = composeModule3FromCanonicalSources(sourceObjects);
  const appendices = composeAppendices(sourceObjects);
  const regional = composeRegional(sourceObjects, region);
  return injectAllCrossReferences([...core, ...appendices, ...regional]);
}
