/**
 * eSTAR fill orchestration (Device eSTAR, B4) — produce the official FDA eSTAR PDF.
 *
 * Composes the three B-track pieces into the capstone:
 *   1. estar-template-registry — locate the official, version-pinned eSTAR template
 *   2. estar-field-map         — the canonical → AcroForm field mapping
 *   3. forms/fill-official-pdf — fill the official AcroForm PDF (the proven IND machinery)
 *
 * HONEST-BY-CONSTRUCTION: this returns a filled official eSTAR ONLY when BOTH the
 * official template is vendored AND a verified field map exists for it. Otherwise
 * it reports explicit blockers and `filled: false` — it NEVER fabricates a PDF or
 * claims a submittable eSTAR it cannot produce. CDRH ingests this official eSTAR
 * PDF; a loose ZIP of section PDFs is not a substitute (see 510k-estar-routes).
 *
 * Both the template and the field map are procurement/verification artifacts (the
 * licensed FDA PDF + its real AcroForm field names), so until they are dropped in
 * this orchestration is wired and tested but reports "not yet producible".
 *
 * @module server/services/pathway-engines/estar/estar-fill
 */

import {
  descriptorFor,
  listVendoredTemplates,
  estarTemplateRequiredFromEnv,
  type EstarTemplateVariant,
} from './estar-template-registry';
import { getEstarFieldMap, isFieldMapPopulated } from './estar-field-map';
import { fillOfficialPdf, type OfficialPdfFieldMap } from '../../forms/fill-official-pdf';
import type { EstarType } from './estar-mapper';

export interface FillEstarInput {
  type: EstarType;
  variant: EstarTemplateVariant;
  /** Canonical field values to write into the official eSTAR AcroForm. */
  data: Record<string, unknown>;
  /** Inject template bytes directly (tests / explicit); else loaded from the drop-point. */
  templateBytes?: Uint8Array | Buffer;
  /** Inject a field map (tests / override); else the registered map for the descriptor. */
  fieldMap?: OfficialPdfFieldMap;
  /** Flatten the filled form to read-only output. Default false. */
  flatten?: boolean;
}

export interface FillEstarResult {
  descriptorId: string | null;
  /** The official template is available (vendored or injected). */
  templateAvailable: boolean;
  /** A verified field map exists for the descriptor. */
  fieldMapPopulated: boolean;
  /** True only when a real filled official eSTAR PDF was produced. */
  filled: boolean;
  /** The filled official eSTAR PDF bytes (present only when filled). */
  pdfBytes?: Uint8Array;
  filledFields: string[];
  skippedFields: string[];
  warnings: string[];
  /** Why a submittable eSTAR could not be produced (empty when filled). */
  blockers: string[];
}

async function resolveTemplateBytes(
  input: FillEstarInput,
  expectedFileName: string,
): Promise<Uint8Array | null> {
  if (input.templateBytes) return input.templateBytes;
  const vendored = await listVendoredTemplates();
  const hit = vendored.find((t) => t.fileName.toLowerCase() === expectedFileName.toLowerCase());
  return hit ? hit.bytes : null;
}

/**
 * Fill the official FDA eSTAR PDF for a 510(k)/De Novo (device or IVD) submission.
 * Honest fail-closed: returns `filled: false` with blockers when the template or a
 * verified field map is missing — never a fabricated artifact.
 */
export async function fillEstarSubmission(input: FillEstarInput): Promise<FillEstarResult> {
  const descriptor = descriptorFor(input.type, input.variant);
  const base: FillEstarResult = {
    descriptorId: descriptor?.id ?? null,
    templateAvailable: false,
    fieldMapPopulated: false,
    filled: false,
    filledFields: [],
    skippedFields: [],
    warnings: [],
    blockers: [],
  };

  if (!descriptor) {
    base.blockers.push(`No eSTAR template descriptor for ${input.type}/${input.variant}.`);
    return base;
  }

  const templateBytes = await resolveTemplateBytes(input, descriptor.expectedFileName);
  base.templateAvailable = !!templateBytes;

  const fieldMap = input.fieldMap ?? getEstarFieldMap(descriptor.id);
  const mapPopulated = !!input.fieldMap
    ? Object.keys(input.fieldMap).length > 0
    : isFieldMapPopulated(descriptor.id);
  base.fieldMapPopulated = mapPopulated;

  if (!templateBytes) {
    base.blockers.push(
      `Cannot produce a submittable eSTAR: the official template "${descriptor.expectedFileName}" is not vendored. ` +
        `Place it in assets/estar-templates/ (or set ESTAR_TEMPLATE_DIR). See assets/estar-templates/README.md.` +
        (estarTemplateRequiredFromEnv() ? ' ESTAR_REQUIRE_TEMPLATE is set — this blocks production dispatch.' : ''),
    );
  }
  if (!fieldMap || !mapPopulated) {
    base.blockers.push(
      `Cannot produce a submittable eSTAR: the canonical→AcroForm field map for "${descriptor.id}" is not populated/verified ` +
        `against the vendored template. Enumerate the template's fields (listAcroFields) and fill estar-field-map.ts.`,
    );
  }

  if (base.blockers.length > 0) return base;

  // Both present → fill the official AcroForm. Never throws on a missing field
  // (skip+warn), so the output is honest about what was and wasn't populated.
  const result = await fillOfficialPdf(templateBytes!, fieldMap!, input.data, {
    flatten: input.flatten ?? false,
    missingFieldPolicy: 'skip',
  });

  base.filled = true;
  base.pdfBytes = result.bytes;
  base.filledFields = result.filled;
  base.skippedFields = result.skipped;
  base.warnings = result.warnings;
  return base;
}

export default { fillEstarSubmission };
