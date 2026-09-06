/**
 * IND form fill service.
 *
 * ============================== INTEGRATION NOTES ==============================
 * This service IS wired: server/routes/ind-forms.routes.ts mounts it at
 * /api/ind-forms (see server/bootstrap/register-ind-lifecycle-routes.ts) with
 * authentication. Use generateIndForm(formId, metadata) for a single form,
 * generateAllForm1572(metadata) for one 1572 per investigator, and
 * generateAllForm3455(metadata) for one 3455 per disclosing investigator. The
 * wiring stays in the route layer — this file must never import a router.
 *
 * OFFICIAL ASSETS: the official FDA blank forms are bundled under
 * templates/forms/acroforms/<formId>.pdf with SHA-256 sidecar manifests
 * (IND_FORM_TEMPLATES_DIR overrides the dir). The gate in readTemplate promotes a
 * template only when its manifest carries a reviewed, non-empty canonical→AcroForm
 * fieldMap (plus reviewedBy/reviewedAt and an fda.gov sourceUrl); such an edition
 * fills officially (usedOfficialTemplate=true). Each form then renders as follows:
 *   - AcroForm fill (1572, 356h, 3454, 3455): a reviewed static edition fills the
 *     AcroForm layer (3454/3455 are static XFA whose AcroForm layer pdf-lib fills
 *     after stripping the XFA). Until a reviewed edition is installed, the labeled
 *     draft renders.
 *   - XFA fill (1571, 3674): these are pure Adobe LiveCycle DYNAMIC XFA. Their
 *     AcroForm layer is empty, so the AcroForm gate above never promotes them —
 *     which is why they long rendered a reconstruction. The fields are real, they
 *     just live in the XFA packets: 1571 declares 283 and 246 are fillable, 3674
 *     declares 190 and 178 are. They now fill through the XFA `datasets` packet
 *     (readXfaTemplate → fillOfficialXfaTemplate), producing the genuine FDA PDF.
 *     The reconstruction remains the fallback when that path cannot qualify.
 * ==============================================================================
 *
 * Behaviour:
 *  - If an official fillable AcroForm template exists for the form id, load it,
 *    fill text fields / checkboxes via pdf-lib, flatten, and return the bytes
 *    (usedOfficialTemplate = true).
 *  - Otherwise render a deterministic, labeled fallback PDF that mirrors the
 *    `leaf-pdf-renderer` pattern: fixed metadata, epoch dates, no object streams,
 *    so identical input yields byte-identical output.
 *
 * The data → field mapping lives in `./ind-form-data-builders` (pure functions).
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';

import {
  buildForm1571,
  buildForm1572,
  buildAllForm1572,
  buildForm3674,
  buildForm3454,
  buildForm3455,
  buildAllForm3455,
  buildForm356h,
  buildForm1574,
  labelsForForm,
  type BuiltForm,
  type FieldValue,
  type IndProjectMetadata,
  type InvestigatorInfo,
  FORM_1571,
  FORM_1572,
  FORM_3674,
  FORM_3454,
  FORM_3455,
  FORM_356H,
  FORM_1574,
} from './ind-form-data-builders';
import { hasReconstruction, reconstructForm } from './ind-form-reconstruct';
import { getOfficialXfaFieldMap } from './official-field-maps';
import {
  fillXfaDatasets,
  isDynamicXfaPdf,
  type OfficialPdfFieldMap,
} from '../forms/fill-official-pdf';

// ---------------------------------------------------------------------------
// Constants (mirror leaf-pdf-renderer for the deterministic fallback)
// ---------------------------------------------------------------------------

const PAGE_WIDTH = 612; // US Letter, points
const PAGE_HEIGHT = 792;
const MARGIN = 72; // 1 inch
const FONT_SIZE = 11;
const LABEL_SIZE = 11;
const LINE_HEIGHT = 15;
const EPOCH = new Date(0);

const PRODUCER = 'Concept2Cure IND form renderer';

export const SUPPORTED_FORM_IDS = [
  FORM_1571,
  FORM_1572,
  FORM_3674,
  FORM_3454,
  FORM_3455,
  FORM_356H,
  FORM_1574,
] as const;

export type SupportedFormId = (typeof SUPPORTED_FORM_IDS)[number];

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

export interface IndFormPdfResult {
  formId: string;
  pdfBytes: Uint8Array;
  /** True when the official fillable AcroForm template was used. */
  usedOfficialTemplate: boolean;
  /** Fraction (0..1) of built fields that were rendered/filled. */
  fieldCoverage: number;
  /** Required fields that were missing (from the builder). */
  missingRequired: string[];
  /** Built fields with no reviewed mapping, or whose widget is absent here. */
  unmappedFields?: string[];
  /** Built fields whose mapped widget rejected the value (wrong widget type). */
  unfilledFields?: string[];
  /**
   * True when the output is a faithful sectioned RECONSTRUCTION of the form
   * (drawn box structure), used for pure dynamic XFA forms (1571/3674) that have
   * no fillable AcroForm layer and no official page to overlay. Never the
   * official Adobe-rendered PDF; see ./ind-form-reconstruct.
   */
  reconstructed?: boolean;
}

// ---------------------------------------------------------------------------
// Builder dispatch
// ---------------------------------------------------------------------------

export function buildFormById(formId: string, meta: IndProjectMetadata): BuiltForm {
  switch (formId) {
    case FORM_1571:
      return buildForm1571(meta);
    case FORM_3674:
      return buildForm3674(meta);
    case FORM_3454:
      return buildForm3454(meta);
    case FORM_3455:
      return buildForm3455(meta);
    case FORM_356H:
      return buildForm356h(meta);
    case FORM_1574:
      return buildForm1574(meta);
    case FORM_1572: {
      // 1572 is per-investigator; for the single-form entry point use the first
      // investigator (or an empty one so missingRequired is populated).
      const first: InvestigatorInfo = (meta.investigators ?? [])[0] ?? {};
      return buildForm1572(first, meta);
    }
    default:
      throw new Error(`Unsupported IND form id: ${formId}`);
  }
}

// ---------------------------------------------------------------------------
// Template resolution
// ---------------------------------------------------------------------------

export function templatesDir(): string {
  return process.env.IND_FORM_TEMPLATES_DIR || path.join('templates', 'forms', 'acroforms');
}

export function templatePathFor(formId: string): string {
  return path.join(templatesDir(), `${formId}.pdf`);
}

interface VerifiedTemplate {
  bytes: Buffer;
  fieldMap: Record<string, string>;
}

async function readTemplate(formId: string): Promise<VerifiedTemplate | null> {
  try {
    const templatePath = templatePathFor(formId);
    const [bytes, rawManifest] = await Promise.all([
      fs.readFile(templatePath),
      fs.readFile(`${templatePath}.manifest.json`, 'utf8'),
    ]);
    const manifest = JSON.parse(rawManifest) as Record<string, unknown>;
    const sourceUrl = new URL(String(manifest.sourceUrl ?? ''));
    const sourceIsFda = sourceUrl.protocol === 'https:' && (sourceUrl.hostname === 'fda.gov' || sourceUrl.hostname.endsWith('.fda.gov'));
    const actualSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const reviewedAt = Date.parse(String(manifest.reviewedAt ?? ''));
    const fieldMap = manifest.fieldMap && typeof manifest.fieldMap === 'object' && !Array.isArray(manifest.fieldMap)
      ? manifest.fieldMap as Record<string, string> : {};
    const verified = manifest.formId === formId
      && typeof manifest.version === 'string' && manifest.version.length > 0
      && typeof manifest.reviewedBy === 'string' && manifest.reviewedBy.length > 0
      && Number.isFinite(reviewedAt)
      && sourceIsFda
      && manifest.sha256 === actualSha256
      && Object.keys(fieldMap).length > 0
      && Object.values(fieldMap).every((value) => typeof value === 'string' && value.length > 0);
    return verified ? { bytes, fieldMap } : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Value formatting
// ---------------------------------------------------------------------------

function valueToText(v: FieldValue): string {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return v;
}

// ---------------------------------------------------------------------------
// Official-template fill path
// ---------------------------------------------------------------------------

async function fillOfficialTemplate(
  formId: string,
  templateBytes: Buffer,
  built: BuiltForm,
  fieldMap: Record<string, string>,
): Promise<IndFormPdfResult> {
  // Official FDA form PDFs are permission-encrypted ("secured"); ignoreEncryption
  // lets pdf-lib open them. (Dynamic XFA editions expose no fillable AcroForm
  // fields, so the mapping-completeness check below fails and we fall back.)
  const doc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });

  // Deterministic metadata so re-fills are byte-stable.
  doc.setProducer(PRODUCER);
  doc.setCreator(PRODUCER);
  doc.setTitle(formId);
  doc.setCreationDate(EPOCH);
  doc.setModificationDate(EPOCH);

  const form = doc.getForm();
  const entries = Object.entries(built.fields);
  const availableFields = new Set(form.getFields().map((field) => field.getName()));

  // Fill every built field that has a reviewed mapping AND a matching widget in
  // the template. Two honest outcomes are recorded rather than swallowed:
  //   - unmapped: no manifest mapping, or the mapped widget is absent here;
  //   - unfilled: the widget exists but rejected the value (wrong widget type,
  //     e.g. a radio/dropdown named where we expected text/checkbox).
  // A field the official form carries as an attachment or derived content (e.g.
  // the 1572 "CV attached" checkbox, or a study_title with no inline widget)
  // legitimately has no text mapping — that must NOT force a fallback, so the
  // qualification gate below is on REQUIRED fields only, not every built field.
  const requiredIds = new Set(built.requiredFields);
  const unmapped: string[] = [];
  const unfilled: string[] = [];
  let filled = 0;

  for (const [fieldId, value] of entries) {
    const acroName = fieldMap[fieldId];
    if (!acroName || !availableFields.has(acroName)) {
      unmapped.push(fieldId);
      continue;
    }
    try {
      if (typeof value === 'boolean') {
        const cb = form.getCheckBox(acroName);
        if (value) cb.check();
        else cb.uncheck();
      } else {
        form.getTextField(acroName).setText(value);
      }
      filled += 1;
    } catch {
      // Present but a different widget than expected — record it; never
      // silently claim success on a field we did not actually write.
      unfilled.push(fieldId);
    }
  }

  // Fail closed: an official fill may not claim success if a REQUIRED field
  // could not be placed or written. Such a template is unqualified for this
  // form, and renderBuiltForm falls back to the deterministic labeled draft.
  const requiredUnplaced = [...requiredIds].filter(
    (id) => unmapped.includes(id) || unfilled.includes(id),
  );
  if (requiredUnplaced.length > 0) {
    throw new Error(
      `Official ${formId}: required field(s) unfillable (${requiredUnplaced.join(', ')})`,
    );
  }

  // Flatten so the values are baked into the page content (read-only output).
  try {
    form.flatten();
  } catch {
    // Some templates may have fields that resist flattening; bytes are still valid.
  }

  const pdfBytes = await doc.save({ useObjectStreams: false });
  const total = entries.length || 1;

  return {
    formId,
    pdfBytes,
    usedOfficialTemplate: true,
    fieldCoverage: filled / total,
    missingRequired: built.missingRequired,
    unmappedFields: unmapped.length > 0 ? unmapped : undefined,
    unfilledFields: unfilled.length > 0 ? unfilled : undefined,
  };
}

// ---------------------------------------------------------------------------
// Official dynamic-XFA fill path (FDA 1571, 3674)
// ---------------------------------------------------------------------------

interface VerifiedXfaTemplate {
  bytes: Buffer;
  fieldMap: OfficialPdfFieldMap;
}

/**
 * Load a vendored template for the XFA fill path.
 *
 * The trust contract differs from readTemplate's on one point, deliberately. The
 * AcroForm path fills from a field map carried IN THE MANIFEST, so the manifest
 * needs a named reviewer to vouch for that data. The XFA path fills from
 * OFFICIAL_XFA_FIELD_MAPS — a code-reviewed module, enumerated from these exact
 * bytes — and every path in it is re-checked against the template's own datasets
 * skeleton at fill time, so a stale entry yields a blank box rather than a wrong
 * one. That is the same contract the device eSTAR fill already ships on
 * (estar-field-map.ts + assets/estar-templates/checksums.txt).
 *
 * What is still required here, and fails closed: the manifest names this form,
 * its sha256 matches the bytes on disk, its sourceUrl is fda.gov, and the file
 * really is a dynamic XFA form.
 */
async function readXfaTemplate(formId: string): Promise<VerifiedXfaTemplate | null> {
  const fieldMap = getOfficialXfaFieldMap(formId);
  if (!fieldMap || Object.keys(fieldMap).length === 0) return null;
  try {
    const templatePath = templatePathFor(formId);
    const [bytes, rawManifest] = await Promise.all([
      fs.readFile(templatePath),
      fs.readFile(`${templatePath}.manifest.json`, 'utf8'),
    ]);
    const manifest = JSON.parse(rawManifest) as Record<string, unknown>;
    const sourceUrl = new URL(String(manifest.sourceUrl ?? ''));
    const sourceIsFda =
      sourceUrl.protocol === 'https:' &&
      (sourceUrl.hostname === 'fda.gov' || sourceUrl.hostname.endsWith('.fda.gov'));
    const actualSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    if (manifest.formId !== formId) return null;
    if (manifest.sha256 !== actualSha256) return null;
    if (!sourceIsFda) return null;
    if (!isDynamicXfaPdf(bytes)) return null;
    return { bytes, fieldMap };
  } catch {
    return null;
  }
}

/**
 * Fill the official dynamic-XFA form through its `datasets` packet.
 *
 * The output IS the FDA file: fillXfaDatasets appends a PDF incremental update,
 * so every original byte is preserved and Acrobat renders the real form with our
 * values in it.
 *
 * WHY THIS DOES NOT FAIL CLOSED ON AN UNPLACED REQUIRED FIELD, when the AcroForm
 * path does: that path flattens its output, so a required field it could not
 * place is permanently absent from a read-only PDF, and claiming "official" would
 * be claiming a complete form. XFA output is never flattened — it stays the live,
 * editable official form the sponsor opens, completes and signs. An unfilled box
 * there is a box the sponsor fills, exactly as if they had downloaded the blank
 * form. So the honest report is which fields we wrote and which we did not, in
 * `unmappedFields` and `missingRequired`, not a silent downgrade to a drawing.
 */
async function fillOfficialXfaTemplate(
  formId: string,
  templateBytes: Buffer,
  built: BuiltForm,
  fieldMap: OfficialPdfFieldMap,
): Promise<IndFormPdfResult> {
  const entries = Object.entries(built.fields);
  const data: Record<string, unknown> = {};
  for (const [fieldId, value] of entries) {
    data[fieldId] = typeof value === 'boolean' ? value : valueToText(value);
  }

  const result = await fillXfaDatasets(templateBytes, fieldMap, data, {
    missingFieldPolicy: 'skip',
  });

  // Never claim an official fill that wrote nothing: with no value placed the
  // output is byte-for-byte the blank form, and the reconstruction at least
  // carries the project's data.
  if (result.filled.length === 0) {
    throw new Error(`Official ${formId}: the XFA fill placed no values`);
  }

  const filledSet = new Set(result.filled);
  const unmapped = entries.map(([id]) => id).filter((id) => !filledSet.has(id));

  return {
    formId,
    pdfBytes: result.bytes,
    usedOfficialTemplate: true,
    fieldCoverage: result.filled.length / (entries.length || 1),
    missingRequired: built.missingRequired,
    unmappedFields: unmapped.length > 0 ? unmapped : undefined,
  };
}

// ---------------------------------------------------------------------------
// Deterministic fallback path (mirrors leaf-pdf-renderer)
// ---------------------------------------------------------------------------

function wrapLine(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (text === '') return [''];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        let chunk = '';
        for (const ch of word) {
          if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        current = chunk;
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function renderFallback(formId: string, built: BuiltForm): Promise<IndFormPdfResult> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Deterministic metadata — no wall-clock dates, no random producer string.
  doc.setTitle(`${formId} (draft — official template not installed)`);
  doc.setProducer(PRODUCER);
  doc.setCreator(PRODUCER);
  doc.setCreationDate(EPOCH);
  doc.setModificationDate(EPOCH);

  const maxWidth = PAGE_WIDTH - 2 * MARGIN;
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const newPage = () => {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  };
  const drawLine = (text: string, f: PDFFont, size: number) => {
    if (y < MARGIN) newPage();
    page.drawText(text, { x: MARGIN, y, size, font: f, color: rgb(0, 0, 0) });
    y -= LINE_HEIGHT;
  };

  // Header.
  drawLine(`FDA Form ${formId.replace(/^FDA_/, '')}`, bold, 14);
  drawLine('DRAFT — official fillable template not installed', bold, 9);
  y -= LINE_HEIGHT / 2;

  const labels = labelsForForm(formId);
  const entries = Object.entries(built.fields);

  for (const [fieldId, value] of entries) {
    const label = labels[fieldId] ?? fieldId;
    drawLine(`${label}:`, bold, LABEL_SIZE);
    const valueText = valueToText(value) || '—';
    for (const logical of valueText.split('\n')) {
      for (const wrapped of wrapLine(logical, font, FONT_SIZE, maxWidth)) {
        drawLine(`  ${wrapped}`, font, FONT_SIZE);
      }
    }
    y -= LINE_HEIGHT / 3;
  }

  if (built.missingRequired.length > 0) {
    y -= LINE_HEIGHT / 2;
    drawLine('Missing required fields:', bold, LABEL_SIZE);
    for (const id of built.missingRequired) {
      const label = labels[id] ?? id;
      drawLine(`  - ${label}`, font, FONT_SIZE);
    }
  }

  const pdfBytes = await doc.save({ useObjectStreams: false });

  return {
    formId,
    pdfBytes,
    usedOfficialTemplate: false,
    // The fallback renders every built field, so coverage is complete.
    fieldCoverage: entries.length === 0 ? 1 : 1,
    missingRequired: built.missingRequired,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a single IND form PDF from project metadata. For FDA_1572 this fills
 * the FIRST investigator; use `generateAllForm1572` for one PDF per investigator.
 */
export async function generateIndForm(
  formId: string,
  meta: IndProjectMetadata,
): Promise<IndFormPdfResult> {
  const built = buildFormById(formId, meta);
  return renderBuiltForm(formId, built);
}

/** Generate one 1572 PDF per investigator in the project metadata. */
export async function generateAllForm1572(
  meta: IndProjectMetadata,
): Promise<IndFormPdfResult[]> {
  const builts = buildAllForm1572(meta);
  return Promise.all(builts.map((b) => renderBuiltForm(FORM_1572, b)));
}

/**
 * Generate one 3455 disclosure PDF per DISCLOSING investigator. The 3455 is a
 * per-investigator form (a single `invesname` / interest-type checkbox set), so
 * a project with N disclosing investigators produces N forms. Returns an empty
 * array when no investigator has a disclosable interest (in which case the
 * sponsor certifies "none" on Form 3454 instead).
 */
export async function generateAllForm3455(
  meta: IndProjectMetadata,
): Promise<IndFormPdfResult[]> {
  const builts = buildAllForm3455(meta);
  return Promise.all(builts.map((b) => renderBuiltForm(FORM_3455, b)));
}

/** Render a pre-built form map to a PDF (official template if present, else fallback). */
export async function renderBuiltForm(
  formId: string,
  built: BuiltForm,
): Promise<IndFormPdfResult> {
  const template = await readTemplate(formId);
  if (template) {
    try {
      return await fillOfficialTemplate(formId, template.bytes, built, template.fieldMap);
    } catch {
      // A reviewed asset with an incomplete/outdated field map is never used.
      // Fall through to a reconstruction if the form has one, else the draft.
    }
  }
  // Dynamic XFA forms (1571/3674) expose no AcroForm widgets, so the gate above
  // never promotes them. Their fields are in the XFA packets: fill those and the
  // output is the genuine FDA form, not a drawing of one.
  const xfa = await readXfaTemplate(formId);
  if (xfa) {
    try {
      return await fillOfficialXfaTemplate(formId, xfa.bytes, built, xfa.fieldMap);
    } catch {
      // A map that no longer matches the vendored edition is never used.
    }
  }
  // Nothing official could be produced — render a faithful sectioned
  // reconstruction rather than the bare labeled draft. Clearly labeled as NOT
  // the official form.
  if (hasReconstruction(formId)) {
    return reconstructForm(formId, built);
  }
  return renderFallback(formId, built);
}

/** Generate every supported IND form for a project (1572 expanded per investigator). */
export async function generateAllIndForms(
  meta: IndProjectMetadata,
): Promise<IndFormPdfResult[]> {
  const results: IndFormPdfResult[] = [];
  results.push(await generateIndForm(FORM_1571, meta));
  results.push(...(await generateAllForm1572(meta)));
  results.push(await generateIndForm(FORM_3674, meta));
  results.push(await generateIndForm(FORM_3454, meta));
  // 3455 is per-investigator: one form per DISCLOSING investigator (none → zero
  // forms, since the sponsor then certifies "none" on the 3454 instead).
  results.push(...(await generateAllForm3455(meta)));
  results.push(await generateIndForm(FORM_356H, meta));
  results.push(await generateIndForm(FORM_1574, meta));
  return results;
}
