/**
 * IND form fill service.
 *
 * ============================== INTEGRATION NOTES ==============================
 * This service IS wired: server/routes/ind-forms.routes.ts mounts it at
 * /api/ind-forms (see server/bootstrap/register-ind-lifecycle-routes.ts) with
 * authentication. Use generateIndForm(formId, metadata) for a single form and
 * generateAllForm1572(metadata) for one 1572 per investigator.
 *
 * OFFICIAL ASSETS: the official FDA blank forms for 1571, 1572, 356h, 3674, and
 * 3454 are bundled under templates/forms/acroforms/<formId>.pdf with SHA-256
 * sidecar manifests (IND_FORM_TEMPLATES_DIR overrides the dir). These editions
 * are Adobe LiveCycle DYNAMIC XFA forms and expose no fillable AcroForm fields,
 * so their manifests carry an empty fieldMap and the service renders the
 * deterministic labeled data PDF (usedOfficialTemplate=false) — the feature works
 * end-to-end today. To enable exact official-form filling, install a static
 * (flattened AcroForm) edition with a reviewed canonical->AcroForm fieldMap and a
 * non-empty reviewedBy/reviewedAt; the readTemplate gate then promotes it.
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
}

// ---------------------------------------------------------------------------
// Builder dispatch
// ---------------------------------------------------------------------------

function buildFormById(formId: string, meta: IndProjectMetadata): BuiltForm {
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
  const mappingComplete = entries.every(([fieldId]) => fieldMap[fieldId] && availableFields.has(fieldMap[fieldId]));
  if (!mappingComplete) {
    throw new Error(`Verified FDA template mapping is incomplete for ${formId}`);
  }
  let filled = 0;

  for (const [fieldId, value] of entries) {
    const acroName = fieldMap[fieldId];
    try {
      if (typeof value === 'boolean') {
        const cb = form.getCheckBox(acroName);
        if (value) cb.check();
        else cb.uncheck();
        filled += 1;
      } else {
        const tf = form.getTextField(acroName);
        tf.setText(value);
        filled += 1;
      }
    } catch {
      // Field not present in this template (or wrong type) — leave uncovered.
    }
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
      return renderFallback(formId, built);
    }
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
  results.push(await generateIndForm(FORM_3455, meta));
  results.push(await generateIndForm(FORM_356H, meta));
  results.push(await generateIndForm(FORM_1574, meta));
  return results;
}
