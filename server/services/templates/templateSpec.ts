/**
 * Template Spec — the canonical client-formatting contract.
 *
 * A `TemplateSpec` is the single, renderer-neutral description of how a
 * client's documents look: page geometry, typography, brand colours, logo,
 * running header/footer, table styling, and any detected form fields.
 *
 * It is produced by the extractor (reads an uploaded `.docx`/`.pdf` and
 * recreates its formatting), edited conversationally through AnA, stored as
 * `c2c_template_specs.spec` (jsonb), and consumed by the render adapter which
 * feeds it into the EXISTING generators (`docxFactory`, `documentExportService`)
 * — it does not introduce a parallel generator.
 *
 * Units are deliberately human-friendly and renderer-neutral:
 *   - lengths on the page  → inches
 *   - font / spacing sizes → points
 *   - colours              → 6-digit hex, no leading '#'
 * The adapter converts to each renderer's native units (twips + half-points
 * for docx; points for pdfkit).
 *
 * @module server/services/templates/templateSpec
 */

export type PageSizeName = 'letter' | 'a4' | 'legal';
export type Orientation = 'portrait' | 'landscape';
export type Alignment = 'left' | 'center' | 'right';

export interface TemplateMargins {
  /** inches */
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface TemplatePage {
  size: PageSizeName;
  orientation: Orientation;
  marginsInches: TemplateMargins;
}

export interface TemplateTypography {
  bodyFont: string;
  headingFont: string;
  monoFont: string;
  /** points */
  bodySizePt: number;
  heading1SizePt: number;
  heading2SizePt: number;
  heading3SizePt: number;
  /** line-height multiple, e.g. 1.15 */
  lineSpacing: number;
  /** points of space after each body paragraph */
  paragraphSpaceAfterPt: number;
}

export interface TemplateColors {
  /** all 6-digit hex, no leading '#' */
  text: string;
  muted: string;
  accent: string;
  tableHeaderBg: string;
  tableBorder: string;
}

export interface TemplateLogo {
  /** raw image bytes, base64-encoded (no `data:` prefix) */
  dataBase64: string;
  /** image/png | image/jpeg | image/gif */
  mimeType: string;
  /** original render dimensions in EMUs if recovered from the source drawing */
  widthEmu?: number;
  heightEmu?: number;
  /** where the logo is placed when rendering */
  placement: 'cover' | 'header';
}

export interface TemplateBrand {
  organizationName?: string;
  logo?: TemplateLogo;
  /** e.g. "CONFIDENTIAL — For Regulatory Use Only" */
  confidentialityNotice?: string;
}

export interface TemplateHeader {
  text?: string;
  showLogo?: boolean;
  alignment?: Alignment;
}

export interface TemplateFooter {
  text?: string;
  showPageNumbers?: boolean;
  /** template string; `{PAGE}` and `{PAGES}` are substituted at render time */
  pageNumberFormat?: string;
}

export interface TemplateTableStyle {
  headerBold: boolean;
  /** points */
  borderSizePt: number;
}

export type FormFieldType = 'text' | 'date' | 'checkbox' | 'table' | 'signature';

export interface TemplateFormField {
  key: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
}

/**
 * A named paragraph/character style recovered from the source document's
 * `styles.xml`. Informational — it lets AnA explain "your H2 is Arial 14pt
 * bold" and lets a future renderer map section headings to client styles.
 */
export interface TemplateNamedStyle {
  styleId: string;
  name?: string;
  basedOn?: string;
  font?: string;
  sizePt?: number;
  bold?: boolean;
  italic?: boolean;
  /** hex, no '#' */
  color?: string;
}

export interface TemplateSpec {
  /** bumped when the shape changes incompatibly */
  specVersion: 1;
  page: TemplatePage;
  typography: TemplateTypography;
  colors: TemplateColors;
  brand: TemplateBrand;
  header?: TemplateHeader;
  footer?: TemplateFooter;
  table: TemplateTableStyle;
  formFields?: TemplateFormField[];
  namedStyles?: TemplateNamedStyle[];
}

/**
 * The platform default — mirrors the hard-coded constants that
 * `docxFactory.ts` shipped with (Times New Roman 12pt body, Arial headings,
 * 1" margins with a 1.25" left gutter). Used as the merge base so a partially
 * extracted or partially edited spec is always complete.
 */
export const DEFAULT_TEMPLATE_SPEC: TemplateSpec = {
  specVersion: 1,
  page: {
    size: 'letter',
    orientation: 'portrait',
    marginsInches: { top: 1, bottom: 1, left: 1.25, right: 1 },
  },
  typography: {
    bodyFont: 'Times New Roman',
    headingFont: 'Arial',
    monoFont: 'Courier New',
    bodySizePt: 12,
    heading1SizePt: 16,
    heading2SizePt: 14,
    heading3SizePt: 12,
    lineSpacing: 1.15,
    paragraphSpaceAfterPt: 6,
  },
  colors: {
    text: '1A1A1A',
    muted: '666666',
    accent: 'D97757',
    tableHeaderBg: 'E2E8F0',
    tableBorder: 'BBBBBB',
  },
  brand: {
    confidentialityNotice: 'CONFIDENTIAL — For Regulatory Use Only',
  },
  footer: {
    showPageNumbers: true,
    pageNumberFormat: 'Page {PAGE} of {PAGES}',
  },
  table: {
    headerBold: true,
    borderSizePt: 0.5,
  },
};

// ── helpers ────────────────────────────────────────────────────────────────

const HEX6 = /^[0-9a-fA-F]{6}$/;

function normalizeHex(input: unknown, fallback: string): string {
  if (typeof input !== 'string') return fallback;
  const v = input.trim().replace(/^#/, '');
  return HEX6.test(v) ? v.toUpperCase() : fallback;
}

function clampNumber(input: unknown, fallback: number, min: number, max: number): number {
  const n = typeof input === 'number' ? input : Number(input);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function pickString(input: unknown, fallback: string): string {
  return typeof input === 'string' && input.trim().length > 0 ? input.trim() : fallback;
}

/**
 * Deep-merge a partial / untrusted spec onto {@link DEFAULT_TEMPLATE_SPEC},
 * coercing and clamping every field so the result is always a complete, sane
 * `TemplateSpec`. This is the single sanitiser used on read (jsonb → spec),
 * on extraction, and on conversational edits from AnA.
 */
export function normalizeTemplateSpec(partial: unknown): TemplateSpec {
  const p = (partial && typeof partial === 'object' ? partial : {}) as Record<string, any>;
  const d = DEFAULT_TEMPLATE_SPEC;

  const page = (p.page ?? {}) as Record<string, any>;
  const margins = (page.marginsInches ?? {}) as Record<string, any>;
  const typo = (p.typography ?? {}) as Record<string, any>;
  const colors = (p.colors ?? {}) as Record<string, any>;
  const brand = (p.brand ?? {}) as Record<string, any>;
  const table = (p.table ?? {}) as Record<string, any>;

  const sizeName: PageSizeName = ['letter', 'a4', 'legal'].includes(page.size)
    ? page.size
    : d.page.size;
  const orientation: Orientation = page.orientation === 'landscape' ? 'landscape' : 'portrait';

  const spec: TemplateSpec = {
    specVersion: 1,
    page: {
      size: sizeName,
      orientation,
      marginsInches: {
        top: clampNumber(margins.top, d.page.marginsInches.top, 0, 4),
        bottom: clampNumber(margins.bottom, d.page.marginsInches.bottom, 0, 4),
        left: clampNumber(margins.left, d.page.marginsInches.left, 0, 4),
        right: clampNumber(margins.right, d.page.marginsInches.right, 0, 4),
      },
    },
    typography: {
      bodyFont: pickString(typo.bodyFont, d.typography.bodyFont),
      headingFont: pickString(typo.headingFont, d.typography.headingFont),
      monoFont: pickString(typo.monoFont, d.typography.monoFont),
      bodySizePt: clampNumber(typo.bodySizePt, d.typography.bodySizePt, 6, 72),
      heading1SizePt: clampNumber(typo.heading1SizePt, d.typography.heading1SizePt, 6, 96),
      heading2SizePt: clampNumber(typo.heading2SizePt, d.typography.heading2SizePt, 6, 96),
      heading3SizePt: clampNumber(typo.heading3SizePt, d.typography.heading3SizePt, 6, 96),
      lineSpacing: clampNumber(typo.lineSpacing, d.typography.lineSpacing, 1, 3),
      paragraphSpaceAfterPt: clampNumber(
        typo.paragraphSpaceAfterPt,
        d.typography.paragraphSpaceAfterPt,
        0,
        48,
      ),
    },
    colors: {
      text: normalizeHex(colors.text, d.colors.text),
      muted: normalizeHex(colors.muted, d.colors.muted),
      accent: normalizeHex(colors.accent, d.colors.accent),
      tableHeaderBg: normalizeHex(colors.tableHeaderBg, d.colors.tableHeaderBg),
      tableBorder: normalizeHex(colors.tableBorder, d.colors.tableBorder),
    },
    brand: {
      organizationName: brand.organizationName
        ? pickString(brand.organizationName, '')
        : undefined,
      confidentialityNotice: pickString(
        brand.confidentialityNotice,
        d.brand.confidentialityNotice as string,
      ),
      logo: normalizeLogo(brand.logo),
    },
    table: {
      headerBold: typeof table.headerBold === 'boolean' ? table.headerBold : d.table.headerBold,
      borderSizePt: clampNumber(table.borderSizePt, d.table.borderSizePt, 0, 6),
    },
  };

  if (p.header && typeof p.header === 'object') {
    const h = p.header as Record<string, any>;
    spec.header = {
      text: h.text ? pickString(h.text, '') : undefined,
      showLogo: !!h.showLogo,
      alignment: (['left', 'center', 'right'] as const).includes(h.alignment)
        ? h.alignment
        : 'right',
    };
  }

  const f = (p.footer ?? d.footer) as Record<string, any>;
  spec.footer = {
    text: f.text ? pickString(f.text, '') : undefined,
    showPageNumbers: f.showPageNumbers !== false,
    pageNumberFormat: pickString(f.pageNumberFormat, d.footer!.pageNumberFormat as string),
  };

  if (Array.isArray(p.formFields)) {
    spec.formFields = p.formFields
      .filter((x: any) => x && typeof x.key === 'string')
      .map((x: any) => ({
        key: String(x.key),
        label: pickString(x.label, String(x.key)),
        type: (['text', 'date', 'checkbox', 'table', 'signature'] as const).includes(x.type)
          ? x.type
          : 'text',
        required: !!x.required,
      }));
  }

  if (Array.isArray(p.namedStyles)) {
    spec.namedStyles = p.namedStyles
      .filter((x: any) => x && typeof x.styleId === 'string')
      .map((x: any) => ({
        styleId: String(x.styleId),
        name: x.name ? String(x.name) : undefined,
        basedOn: x.basedOn ? String(x.basedOn) : undefined,
        font: x.font ? String(x.font) : undefined,
        sizePt: Number.isFinite(Number(x.sizePt)) ? Number(x.sizePt) : undefined,
        bold: x.bold === undefined ? undefined : !!x.bold,
        italic: x.italic === undefined ? undefined : !!x.italic,
        color: x.color ? normalizeHex(x.color, '000000') : undefined,
      }));
  }

  return spec;
}

function normalizeLogo(input: unknown): TemplateLogo | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const l = input as Record<string, any>;
  if (typeof l.dataBase64 !== 'string' || l.dataBase64.length === 0) return undefined;
  return {
    dataBase64: l.dataBase64,
    mimeType: pickString(l.mimeType, 'image/png'),
    widthEmu: Number.isFinite(Number(l.widthEmu)) ? Number(l.widthEmu) : undefined,
    heightEmu: Number.isFinite(Number(l.heightEmu)) ? Number(l.heightEmu) : undefined,
    placement: l.placement === 'header' ? 'header' : 'cover',
  };
}

/** Convenience: produce a spec that is the default with `patch` merged on top. */
export function specFromPatch(patch: Partial<TemplateSpec>): TemplateSpec {
  return normalizeTemplateSpec({ ...DEFAULT_TEMPLATE_SPEC, ...patch });
}
