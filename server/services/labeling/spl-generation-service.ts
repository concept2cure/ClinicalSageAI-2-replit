/**
 * SPL (Structured Product Labeling) XML generation service.
 *
 * A higher-level convenience layer over the canonical generator: it accepts
 * common product attributes (name, NDC, ingredients, labeling text), maps them
 * onto an `SplSpec`, and hands assembly to `spl-generator`.
 *
 * ── Why it delegates rather than building XML itself ─────────────────────────
 * It used to assemble its own document, and the two implementations disagreed
 * in ways that mattered:
 *
 *   • Sections were emitted as direct children of <document>. SPL nests them
 *     document/component/structuredBody/component/section, so every file this
 *     produced was schema-invalid — while the surface reported "It passes the
 *     structural check", because the check only looked for a <component> tag
 *     and the section wrappers are <component>.
 *   • Ids came from a 32-bit string hash smeared into UUID shape. setId is the
 *     identity FDA uses to decide that two submissions are versions of the same
 *     labeling; a 32-bit space shared across every tenant is a collision
 *     waiting to be someone else's label.
 *   • The NDC and route were accepted and then dropped: the surface collects an
 *     NDC, the route passes it here, and it appeared nowhere in the download.
 *
 * One assembly, one id derivation, one place a defect gets fixed.
 *
 * Pure: no DB, no network, no LLM. Identical input → identical output.
 *
 * @module server/services/labeling/spl-generation-service
 */
import { generateSpl, splDeterministicGuid, type SplSpec } from './spl-generator';

// ── SPL LOINC Section Codes (NLM standard) ──────────────────────────────────
const SECTION_CODES = {
  DESCRIPTION: '34089-3',
  INDICATIONS: '34067-9',
  CONTRAINDICATIONS: '34070-3',
  WARNINGS: '34071-1',
  DOSAGE: '34068-7',
} as const;

const HUMAN_PRESCRIPTION_DRUG_LABEL = '34391-3';

// ── Input / Output types ─────────────────────────────────────────────────────

export interface SplGenerationInput {
  productName: string;
  /** NDC product or package code as recorded. Carried into the document. */
  ndc?: string;
  /**
   * Version of THIS labeling under its setId. FDA requires it to advance with
   * each new version of the same label; the document id is derived from
   * setId+version, so a version that never moves is a document id that never
   * moves. Defaults to 1 for callers that do not track one yet.
   */
  version?: number;
  activeIngredients: Array<{ name: string; strength?: string }>;
  indications: string;
  contraindications: string;
  warnings: string;
  dosage: string;
  route?: string;
  manufacturer: string;
}

export interface SplGenerationResult {
  xml: string;
  sectionCount: number;
  status: 'generated';
}

export interface SplValidationFinding {
  rule: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface SplValidationResult {
  valid: boolean;
  findings: SplValidationFinding[];
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Section order and titles this layer emits, in document order. */
const LAYER_SECTIONS: Array<{ code: string; title: string; field: keyof SplGenerationInput | 'description' }> = [
  { code: SECTION_CODES.DESCRIPTION, title: 'DESCRIPTION', field: 'description' },
  { code: SECTION_CODES.INDICATIONS, title: 'INDICATIONS AND USAGE', field: 'indications' },
  { code: SECTION_CODES.CONTRAINDICATIONS, title: 'CONTRAINDICATIONS', field: 'contraindications' },
  { code: SECTION_CODES.WARNINGS, title: 'WARNINGS', field: 'warnings' },
  { code: SECTION_CODES.DOSAGE, title: 'DOSAGE AND ADMINISTRATION', field: 'dosage' },
];

/** Every field this layer requires before it will build anything. */
function requireInput(input: SplGenerationInput): void {
  if (!input.productName) throw new Error('productName is required');
  if (!input.manufacturer) throw new Error('manufacturer is required');
  if (!input.activeIngredients || input.activeIngredients.length === 0) {
    throw new Error('activeIngredients must have at least one entry');
  }
  if (!input.indications) throw new Error('indications is required');
  if (!input.contraindications) throw new Error('contraindications is required');
  if (!input.warnings) throw new Error('warnings is required');
  if (!input.dosage) throw new Error('dosage is required');
}

/**
 * Generate an FDA SPL XML document from structured product info.
 */
export function generateSplXml(input: SplGenerationInput): SplGenerationResult {
  requireInput(input);

  const seed = `${input.productName}-${input.manufacturer}`;
  const version = Number.isInteger(input.version) && (input.version as number) >= 1 ? (input.version as number) : 1;
  const ingredientList = input.activeIngredients
    .map((ai) => (ai.strength ? `${ai.name} ${ai.strength}` : ai.name))
    .join(', ');
  const descriptionText = `${input.productName} contains ${ingredientList}.${input.route ? ` Route of administration: ${input.route}.` : ''}`;
  const text: Record<string, string> = {
    description: descriptionText,
    indications: input.indications,
    contraindications: input.contraindications,
    warnings: input.warnings,
    dosage: input.dosage,
  };

  const spec: SplSpec = {
    documentTypeCode: HUMAN_PRESCRIPTION_DRUG_LABEL,
    documentTypeDisplayName: 'HUMAN PRESCRIPTION DRUG LABEL',
    title: input.productName,
    setId: splDeterministicGuid(`set:${seed}`),
    versionNumber: version,
    effectiveDate: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
    organizationName: input.manufacturer,
    product: {
      name: input.productName,
      ndcCode: input.ndc,
      ingredients: input.activeIngredients,
      route: input.route,
    },
    sections: LAYER_SECTIONS.map((sec) => ({
      code: sec.code,
      title: sec.title,
      displayName: sec.title,
      text: text[sec.field as string],
    })),
  };

  const built = generateSpl(spec);
  return { xml: built.xml, sectionCount: spec.sections.length, status: 'generated' };
}

/**
 * Validate an SPL XML string for structural completeness.
 *
 * Two rules changed shape here, both because the surface renders `valid` as
 * "It passes the structural check":
 *
 *   • A section this function itself calls REQUIRED was reported as a warning,
 *     so a document with no Indications and no Dosage passed. Either they are
 *     required or they are not; the message said required, so the severity now
 *     agrees with it.
 *   • Nothing checked that sections sit inside component/structuredBody, which
 *     is where SPL puts them — and the `<component>` probe matches the section
 *     wrappers, so a flat document satisfied it. A file that will not load into
 *     FDA's tooling cannot be reported as passing.
 *
 * Still not FDA's schematron: this is structural, and a clean result here is
 * not an acceptance prediction.
 */
export function validateSplStructure(xml: string): SplValidationResult {
  if (!xml || typeof xml !== 'string') {
    throw new Error('xml is required');
  }

  const findings: SplValidationFinding[] = [];

  // Check root element
  if (!/<document[\s>]/i.test(xml)) {
    findings.push({
      rule: 'root-element',
      severity: 'error',
      message: 'Missing <document> root element',
    });
  }

  // Check id element
  if (!/<id[\s][^>]*root="/i.test(xml)) {
    findings.push({
      rule: 'document-id',
      severity: 'error',
      message: 'Missing <id> element with root attribute',
    });
  }

  // Check for at least one component/section
  if (!/<component>/i.test(xml)) {
    findings.push({
      rule: 'component-present',
      severity: 'error',
      message: 'No <component> sections found in document',
    });
  }

  // …and that they are where SPL puts them.
  if (/<section[\s>]/i.test(xml) && !/<structuredBody>/i.test(xml)) {
    findings.push({
      rule: 'structured-body',
      severity: 'error',
      message:
        'Sections are not inside <component><structuredBody> — SPL nests them document/component/structuredBody/component/section',
    });
  }

  // Check required section codes
  const requiredSections: Array<{ code: string; name: string }> = [
    { code: SECTION_CODES.INDICATIONS, name: 'Indications and Usage' },
    { code: SECTION_CODES.CONTRAINDICATIONS, name: 'Contraindications' },
    { code: SECTION_CODES.WARNINGS, name: 'Warnings' },
    { code: SECTION_CODES.DOSAGE, name: 'Dosage and Administration' },
    { code: SECTION_CODES.DESCRIPTION, name: 'Description' },
  ];

  for (const section of requiredSections) {
    const pattern = new RegExp(`code\\s*=\\s*"${section.code}"`, 'i');
    if (!pattern.test(xml)) {
      findings.push({
        rule: `section-${section.code}`,
        severity: 'error',
        message: `Missing required section: ${section.name} (${section.code})`,
      });
    }
  }

  return {
    valid: findings.filter((f) => f.severity === 'error').length === 0,
    findings,
  };
}
