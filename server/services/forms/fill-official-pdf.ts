/**
 * Generic "fill official PDF AcroForm" utility.
 *
 * A reusable, template-agnostic foundation for filling official fillable PDF
 * forms (e.g. FDA's eSTAR PDF, FDA 1571/1572/3674/…) with pdf-lib. It generalizes
 * the proven IND form-fill path in
 * `server/services/ind-forms/ind-form-fill-service.ts` WITHOUT modifying it:
 *
 *   - You supply an explicit field map (canonical key → official AcroForm field
 *     name + type) plus a flat data object keyed by the canonical keys.
 *   - This module looks up each AcroField by its official name, sets the value
 *     according to its declared type, and records exactly which fields were
 *     filled vs skipped. It NEVER invents fields: if the template has no such
 *     AcroField, or the data has no value for a key, the field is skipped (with a
 *     warning) — or, under `missingFieldPolicy: 'error'`, the call throws.
 *
 * Field lookup, the text/checkbox/dropdown handling, the flatten step and the
 * defensive try/catch around per-field operations all mirror the IND service's
 * conventions (`form.getTextField` / `getCheckBox` / `getDropdown`, then
 * `form.flatten()`), extended here with radio-group support and structured
 * reporting.
 *
 * TypeScript + ESM. Depends only on `pdf-lib` (already installed).
 */

import { PDFDocument } from 'pdf-lib';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Supported AcroForm widget kinds. */
export type OfficialPdfFieldType = 'text' | 'checkbox' | 'dropdown' | 'radio';

/**
 * Maps our canonical (caller-facing) keys to the official AcroForm field names
 * embedded in the template PDF, plus the widget type to drive value handling.
 *
 *   { sponsorName: { acroField: 'form1[0].#subform[0].SponsorName[0]', type: 'text' } }
 */
export interface OfficialPdfFieldMap {
  [canonicalKey: string]: {
    /** Exact AcroForm field name as it appears in the template PDF. */
    acroField: string;
    type: OfficialPdfFieldType;
  };
}

export interface FillOptions {
  /**
   * Flatten the form after filling so values are baked into the page content
   * (read-only output). Default: false.
   */
  flatten?: boolean;
  /**
   * What to do when a mapped AcroField is absent from the template (or of the
   * wrong type for the declared `type`):
   *   - 'skip'  : record a warning and continue (default)
   *   - 'error' : throw
   *
   * Note: a canonical key that simply has no value in `data` is always skipped
   * (recorded in `skipped`) regardless of this policy — there is nothing to fill.
   */
  missingFieldPolicy?: 'skip' | 'error';
}

export interface FillResult {
  /** The filled (and optionally flattened) PDF bytes. */
  bytes: Uint8Array;
  /** Canonical keys whose value was written into an AcroField. */
  filled: string[];
  /**
   * Canonical keys that were not written: either no value supplied in `data`,
   * or the AcroField was missing/wrong-type (under `missingFieldPolicy: 'skip'`).
   */
  skipped: string[];
  /** Human-readable diagnostics (missing fields, type mismatches, empties). */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Value coercion helpers
// ---------------------------------------------------------------------------

/**
 * Whether a value should be treated as "no data supplied" for this key. We treat
 * `undefined`, `null`, and empty/whitespace-only strings as absent. For
 * booleans/numbers we always have data (false / 0 are meaningful).
 */
function hasData(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

/** Coerce an arbitrary value to the text that goes into a text/dropdown field. */
function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  return String(value);
}

/**
 * Coerce a value to a boolean for checkbox handling. Accepts real booleans and
 * common truthy/falsy string spellings ('true'/'false', 'yes'/'no', 'on'/'off',
 * '1'/'0', 'checked'). Anything else falls back to JS truthiness.
 */
function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (['true', 'yes', 'on', '1', 'checked', 'x'].includes(v)) return true;
    if (['false', 'no', 'off', '0', 'unchecked', ''].includes(v)) return false;
  }
  return Boolean(value);
}

// ---------------------------------------------------------------------------
// Core: fillOfficialPdf
// ---------------------------------------------------------------------------

/**
 * Fill an official fillable PDF (AcroForm) by mapping canonical data keys to the
 * template's official field names.
 *
 * Honest behaviour:
 *  - Only fields that exist in BOTH the field map and the template are filled.
 *  - A canonical key with no data is skipped (warned), never invented.
 *  - A mapped field missing from the template is skipped+warned, or — when
 *    `missingFieldPolicy: 'error'` — throws.
 *
 * @param templateBytes The official template PDF (Uint8Array or Buffer).
 * @param fieldMap      canonical key → { acroField, type }.
 * @param data          canonical key → value.
 * @param opts          flatten / missingFieldPolicy.
 */
export async function fillOfficialPdf(
  templateBytes: Uint8Array | Buffer,
  fieldMap: OfficialPdfFieldMap,
  data: Record<string, unknown>,
  opts: FillOptions = {},
): Promise<FillResult> {
  const flatten = opts.flatten ?? false;
  const missingFieldPolicy = opts.missingFieldPolicy ?? 'skip';

  const filled: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];

  const doc = await PDFDocument.load(templateBytes);
  const form = doc.getForm();

  for (const [canonicalKey, spec] of Object.entries(fieldMap)) {
    const { acroField, type } = spec;
    const value = data[canonicalKey];

    // 1) No data supplied for this key → skip (never invent values).
    if (!hasData(value)) {
      skipped.push(canonicalKey);
      warnings.push(
        `No data supplied for "${canonicalKey}" (AcroField "${acroField}"); skipped.`,
      );
      continue;
    }

    // 2) Attempt to locate + set the field by its declared type.
    try {
      switch (type) {
        case 'text': {
          form.getTextField(acroField).setText(toText(value));
          break;
        }
        case 'dropdown': {
          const dropdown = form.getDropdown(acroField);
          const text = toText(value);
          const options = dropdown.getOptions();
          if (!options.includes(text)) {
            // The pdf-lib dropdown requires the value be a valid option unless
            // it is explicitly added. Be honest: warn rather than silently
            // injecting an out-of-range option that a real form may reject.
            dropdown.addOptions([text]);
            warnings.push(
              `Dropdown "${acroField}" had no option "${text}" for key ` +
                `"${canonicalKey}"; option was added before selecting.`,
            );
          }
          dropdown.select(text);
          break;
        }
        case 'checkbox': {
          const checkbox = form.getCheckBox(acroField);
          if (toBoolean(value)) checkbox.check();
          else checkbox.uncheck();
          break;
        }
        case 'radio': {
          const radio = form.getRadioGroup(acroField);
          const text = toText(value);
          const options = radio.getOptions();
          if (!options.includes(text)) {
            // Radio groups cannot have options added on the fly; an unknown
            // selection is unfillable. Treat like a missing field.
            throw new Error(
              `radio option "${text}" not in [${options.join(', ')}]`,
            );
          }
          radio.select(text);
          break;
        }
        default: {
          // Exhaustiveness guard — unknown declared type.
          throw new Error(`unsupported field type "${String(type)}"`);
        }
      }
      filled.push(canonicalKey);
    } catch (err) {
      // The template has no such field, the field is a different widget type
      // than declared, or a radio/dropdown selection was invalid.
      const reason = err instanceof Error ? err.message : String(err);
      const msg =
        `Field "${acroField}" (key "${canonicalKey}", type "${type}") could ` +
        `not be filled: ${reason}`;
      if (missingFieldPolicy === 'error') {
        throw new Error(msg);
      }
      skipped.push(canonicalKey);
      warnings.push(msg);
    }
  }

  // Flatten last, so values are baked into page content (read-only output).
  if (flatten) {
    try {
      form.flatten();
    } catch (err) {
      // Some templates have fields that resist flattening; bytes are still
      // valid, so warn rather than fail the whole fill.
      const reason = err instanceof Error ? err.message : String(err);
      warnings.push(`Form flatten failed (output left interactive): ${reason}`);
    }
  }

  const bytes = await doc.save({ useObjectStreams: false });
  return { bytes, filled, skipped, warnings };
}

// ---------------------------------------------------------------------------
// Introspection: listAcroFields
// ---------------------------------------------------------------------------

/**
 * Enumerate the AcroForm fields in a template — their official names and widget
 * types. Useful for building an {@link OfficialPdfFieldMap} against an unfamiliar
 * official PDF.
 *
 * Type strings mirror this module's vocabulary where possible
 * ('text' | 'checkbox' | 'dropdown' | 'radio'), plus 'optionlist' and
 * 'button'/'signature' for field kinds we do not fill, and 'unknown' as a last
 * resort. The pdf-lib constructor name is used so we never misreport a type.
 */
export async function listAcroFields(
  templateBytes: Uint8Array | Buffer,
): Promise<{ name: string; type: string }[]> {
  const doc = await PDFDocument.load(templateBytes);
  const form = doc.getForm();
  return form.getFields().map((field) => ({
    name: field.getName(),
    type: classifyFieldType(field.constructor?.name),
  }));
}

/** Map a pdf-lib field class name to a friendly type string. */
function classifyFieldType(ctorName: string | undefined): string {
  switch (ctorName) {
    case 'PDFTextField':
      return 'text';
    case 'PDFCheckBox':
      return 'checkbox';
    case 'PDFDropdown':
      return 'dropdown';
    case 'PDFRadioGroup':
      return 'radio';
    case 'PDFOptionList':
      return 'optionlist';
    case 'PDFButton':
      return 'button';
    case 'PDFSignature':
      return 'signature';
    default:
      return 'unknown';
  }
}
