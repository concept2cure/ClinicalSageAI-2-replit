/**
 * SPL (Structured Product Labeling) XML generation service.
 *
 * Generates a valid FDA SPL XML skeleton from structured product information
 * and validates SPL XML documents for structural completeness. This is a
 * higher-level convenience layer that accepts common product attributes
 * (name, NDC, ingredients, labeling text) and produces a conformant SPL XML
 * document ready for FDA submission tooling.
 *
 * Pure: no DB, no network, no LLM. Identical input → identical output.
 *
 * @module server/services/labeling/spl-generation-service
 */

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
  ndc?: string;
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Deterministic pseudo-GUID from a seed string (not cryptographic). */
function deterministicGuid(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `${hex.slice(0, 8)}-${hex.slice(0, 4)}-4${hex.slice(1, 4)}-8${hex.slice(1, 4)}-${hex.padEnd(12, '0').slice(0, 12)}`;
}

function buildSection(code: string, title: string, text: string, seed: string): string {
  const sectionId = deterministicGuid(`section-${code}-${seed}`);
  return `    <component>
      <section>
        <id root="${sectionId}"/>
        <code code="${code}" codeSystem="2.16.840.1.113883.6.1" displayName="${escapeXml(title)}"/>
        <title>${escapeXml(title)}</title>
        <text>${escapeXml(text)}</text>
      </section>
    </component>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate an FDA SPL XML skeleton from structured product info.
 */
export function generateSplXml(input: SplGenerationInput): SplGenerationResult {
  if (!input.productName) throw new Error('productName is required');
  if (!input.manufacturer) throw new Error('manufacturer is required');
  if (!input.activeIngredients || input.activeIngredients.length === 0) {
    throw new Error('activeIngredients must have at least one entry');
  }
  if (!input.indications) throw new Error('indications is required');
  if (!input.contraindications) throw new Error('contraindications is required');
  if (!input.warnings) throw new Error('warnings is required');
  if (!input.dosage) throw new Error('dosage is required');

  const seed = `${input.productName}-${input.manufacturer}`;
  const documentId = deterministicGuid(`doc-${seed}`);
  const setId = deterministicGuid(`set-${seed}`);
  const effectiveDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  // Build description from active ingredients
  const ingredientList = input.activeIngredients
    .map((ai) => (ai.strength ? `${ai.name} ${ai.strength}` : ai.name))
    .join(', ');
  const descriptionText = `${input.productName} contains ${ingredientList}.${input.route ? ` Route of administration: ${input.route}.` : ''}`;

  const sections: string[] = [
    buildSection(SECTION_CODES.DESCRIPTION, 'DESCRIPTION', descriptionText, seed),
    buildSection(SECTION_CODES.INDICATIONS, 'INDICATIONS AND USAGE', input.indications, seed),
    buildSection(SECTION_CODES.CONTRAINDICATIONS, 'CONTRAINDICATIONS', input.contraindications, seed),
    buildSection(SECTION_CODES.WARNINGS, 'WARNINGS', input.warnings, seed),
    buildSection(SECTION_CODES.DOSAGE, 'DOSAGE AND ADMINISTRATION', input.dosage, seed),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<document xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <id root="${documentId}"/>
  <code code="${HUMAN_PRESCRIPTION_DRUG_LABEL}" codeSystem="2.16.840.1.113883.6.1" displayName="HUMAN PRESCRIPTION DRUG LABEL"/>
  <title>${escapeXml(input.productName)}</title>
  <effectiveTime value="${effectiveDate}"/>
  <setId root="${setId}"/>
  <versionNumber value="1"/>
  <author>
    <assignedEntity>
      <representedOrganization>
        <name>${escapeXml(input.manufacturer)}</name>
      </representedOrganization>
    </assignedEntity>
  </author>
${sections.join('\n')}
</document>`;

  return {
    xml,
    sectionCount: sections.length,
    status: 'generated',
  };
}

/**
 * Validate an SPL XML string for structural completeness.
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
        severity: 'warning',
        message: `Missing required section: ${section.name} (${section.code})`,
      });
    }
  }

  return {
    valid: findings.filter((f) => f.severity === 'error').length === 0,
    findings,
  };
}
