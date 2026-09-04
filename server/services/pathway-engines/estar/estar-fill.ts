/**
 * eSTAR fill orchestration (Device eSTAR, B4) — produce the official FDA eSTAR PDF.
 *
 * Composes the three B-track pieces into the capstone:
 *   1. estar-template-registry — locate the official, version-pinned eSTAR template
 *   2. estar-field-map         — the canonical → template field mapping
 *   3. forms/fill-official-pdf — fill the official PDF (AcroForm or dynamic XFA)
 *
 * HONEST-BY-CONSTRUCTION: this returns a filled official eSTAR ONLY when BOTH the
 * official template is vendored AND a verified field map exists for it. Otherwise
 * it reports explicit blockers and `filled: false` — it NEVER fabricates a PDF or
 * claims a submittable eSTAR it cannot produce. CDRH ingests this official eSTAR
 * PDF; a loose ZIP of section PDFs is not a substitute (see 510k-estar-routes).
 *
 * Both the template and the field map are procurement/verification artifacts (the
 * licensed FDA PDF + its real, enumerated field locators), so until they are
 * dropped in this orchestration reports "not yet producible".
 *
 * TEMPLATE KIND: FDA's eSTAR is an Adobe LiveCycle *dynamic XFA* PDF — its
 * AcroForm `/Fields` array is empty and Acrobat renders the `/XFA` packets. So
 * this routes on what the vendored file actually is: dynamic XFA is filled by
 * writing the `datasets` packet through a PDF incremental update (the original
 * bytes are preserved, which is what keeps the output the real FDA form); a
 * static AcroForm is filled by field name. Assuming AcroForm would have silently
 * filled nothing.
 *
 * @module server/services/pathway-engines/estar/estar-fill
 */

import {
  descriptorFor,
  listVendoredTemplates,
  estarTemplateRequiredFromEnv,
  type EstarTemplateVariant,
  type EstarTemplateType,
  type EstarTemplateIntegrity,
} from './estar-template-registry';
import { getEstarFieldMap, isFieldMapPopulated } from './estar-field-map';
import {
  fillOfficialPdf,
  fillXfaDatasets,
  isDynamicXfaPdf,
  type OfficialPdfFieldMap,
} from '../../forms/fill-official-pdf';

export interface FillEstarInput {
  /** Any eSTAR program submission type (510(k)/De Novo/PMA, or Q-Sub/IDE/513(g)). */
  type: EstarTemplateType;
  variant: EstarTemplateVariant;
  /** Canonical field values to write into the official eSTAR template. */
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
  /**
   * Which layer of the official template was filled. The FDA eSTAR templates are
   * `dynamic-xfa` (their AcroForm layer is empty), so their values are written
   * into the XFA `datasets` packet via a PDF incremental update.
   */
  templateKind?: 'acroform' | 'dynamic-xfa';
}

async function resolveTemplateBytes(
  input: FillEstarInput,
  expectedFileName: string,
): Promise<{ bytes: Uint8Array | null; integrity: EstarTemplateIntegrity | null }> {
  // Injected bytes are the caller's own (tests, explicit override); the
  // drop-point's pins do not describe them.
  if (input.templateBytes) return { bytes: input.templateBytes, integrity: null };
  const vendored = await listVendoredTemplates();
  const hit = vendored.find((t) => t.fileName.toLowerCase() === expectedFileName.toLowerCase());
  return hit ? { bytes: hit.bytes, integrity: hit.integrity } : { bytes: null, integrity: null };
}

/**
 * Fill the official FDA eSTAR PDF for any eSTAR program submission — 510(k), De
 * Novo, PMA (device or IVD), or a PreSTAR request (Q-Sub / IDE / 513(g)). Honest
 * fail-closed: returns `filled: false` with blockers when the template or a
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

  const { bytes: templateBytes, integrity } = await resolveTemplateBytes(
    input,
    descriptor.expectedFileName,
  );
  // A file with the right NAME is not the official template. checksums.txt
  // pins these bytes precisely because the field map was enumerated from them;
  // a swapped or edited file writes our values wherever ITS paths point.
  const integrityFailed = integrity === 'mismatch';
  base.templateAvailable = !!templateBytes && !integrityFailed;
  if (integrityFailed) {
    base.blockers.push(
      `Cannot produce a submittable eSTAR: "${descriptor.expectedFileName}" is present but does not match the ` +
        `SHA-256 pinned for it in the drop-point's checksums.txt. The canonical field map was enumerated from the ` +
        `pinned bytes, so filling a different file would write values into the wrong boxes. Restore the pinned ` +
        `template, or re-verify the field map against the new edition and update checksums.txt.`,
    );
  }
  if (integrity === 'unpinned') {
    base.warnings.push(
      `"${descriptor.expectedFileName}" is not pinned in the drop-point's checksums.txt, so its identity as the ` +
        `official FDA edition was not verified.`,
    );
  }

  const fieldMap = input.fieldMap ?? getEstarFieldMap(descriptor.id);
  const mapPopulated = input.fieldMap
    ? Object.keys(input.fieldMap).length > 0
    : isFieldMapPopulated(descriptor.id);
  base.fieldMapPopulated = mapPopulated;

  if (!templateBytes && !integrityFailed) {
    base.blockers.push(
      `Cannot produce a submittable eSTAR: the official template "${descriptor.expectedFileName}" is not vendored. ` +
        `Place it in assets/estar-templates/ (or set ESTAR_TEMPLATE_DIR). See assets/estar-templates/README.md.` +
        (estarTemplateRequiredFromEnv() ? ' ESTAR_REQUIRE_TEMPLATE is set — this blocks production dispatch.' : ''),
    );
  }
  if (!fieldMap || !mapPopulated) {
    base.blockers.push(
      `Cannot produce a submittable eSTAR: the canonical→template field map for "${descriptor.id}" is not populated/verified ` +
        `against the vendored template. Enumerate the template's fields (listXfaFields for a dynamic XFA form such as ` +
        `the FDA eSTAR, listAcroFields for a static AcroForm) and fill estar-field-map.ts.`,
    );
  }

  if (base.blockers.length > 0) return base;

  // Both present → fill the official template. Which layer depends on the file:
  // FDA's eSTAR is a dynamic Adobe LiveCycle XFA form whose AcroForm `/Fields`
  // array is EMPTY, so an AcroForm fill would silently populate nothing. Route on
  // what the template actually is rather than assuming. Neither path throws on a
  // missing field (skip+warn), so the output stays honest about what was and
  // wasn't populated.
  const dynamicXfa = isDynamicXfaPdf(templateBytes!);
  base.templateKind = dynamicXfa ? 'dynamic-xfa' : 'acroform';
  const result = dynamicXfa
    ? await fillXfaDatasets(templateBytes!, fieldMap!, input.data, {
        flatten: input.flatten ?? false,
        missingFieldPolicy: 'skip',
      })
    : await fillOfficialPdf(templateBytes!, fieldMap!, input.data, {
        flatten: input.flatten ?? false,
        missingFieldPolicy: 'skip',
      });

  base.filledFields = result.filled;
  base.skippedFields = result.skipped;
  base.warnings = result.warnings;

  // `filled` is documented as "True only when a real filled official eSTAR PDF
  // was produced", but it was set unconditionally the moment the fill RAN. A
  // caller passing `data: {}` — which POST /official accepts, its schema
  // defaulting `data` to an empty object — got every mapped key skipped, the
  // untouched template bytes back, `filled: true`, no blockers, and a 200
  // carrying `officialEstarPdf: true` with the placement "Module 1 / official
  // FDA eSTAR (submittable)". That is a blank official FDA form registered as a
  // submittable artifact.
  //
  // A fill that wrote nothing produced no filled form. Fail closed and say why,
  // rather than hand back the blank template dressed as a submission.
  if (result.filled.length === 0) {
    base.blockers.push(
      `Cannot produce a submittable eSTAR: the fill wrote no values into "${descriptor.id}". ` +
        `The platform held no value for any of the ${Object.keys(fieldMap!).length} mapped administrative fields, ` +
        `so the output would be the blank official template.`,
    );
    return base;
  }

  base.filled = true;
  base.pdfBytes = result.bytes;
  return base;
}

export default { fillEstarSubmission };
