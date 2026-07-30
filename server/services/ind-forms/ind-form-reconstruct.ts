/**
 * IND form RECONSTRUCTION renderer.
 *
 * ------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ------------------------------------------------------------------------------
 * FDA Forms 1571 (IND application) and 3674 (ClinicalTrials.gov certification)
 * ship as PURE DYNAMIC XFA. Unlike the static-XFA forms (3454/3455) they carry
 * NO fillable AcroForm layer that pdf-lib can populate, and their pages render
 * only inside Adobe (the "please wait / your PDF viewer may not support this
 * form" placeholder is all a non-Adobe renderer sees). There is therefore no
 * official template we can fill and no official page we can overlay.
 *
 * Rather than emit the bare labeled-list fallback for these two high-value forms,
 * this module draws a FAITHFUL, sectioned reconstruction of the real form's box
 * structure — numbered/titled sections, bordered field boxes, rendered check
 * boxes, and an intentionally blank signature block — populated from the same
 * pure builder field maps used everywhere else.
 *
 * HONESTY: the output is CLEARLY LABELED a reconstruction, not the official
 * Adobe-rendered PDF. It is suitable for internal review, QC, and record, and it
 * must be verified against the official form before submission. Dates and
 * signatures are NEVER fabricated — the signature block renders blank and all PDF
 * metadata dates are epoch-fixed so identical input yields byte-identical output.
 *
 * This file must never import a router and performs no I/O beyond producing bytes.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

import {
  FORM_1571,
  FORM_3674,
  labelsForForm,
  type BuiltForm,
  type FieldValue,
} from './ind-form-data-builders';
import type { IndFormPdfResult } from './ind-form-fill-service';

// ---------------------------------------------------------------------------
// Deterministic constants (shared style with the fill service's fallback)
// ---------------------------------------------------------------------------

const PAGE_WIDTH = 612; // US Letter, points
const PAGE_HEIGHT = 792;
const MARGIN_X = 48;
const MARGIN_TOP = 44;
const MARGIN_BOTTOM = 54;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN_X;
const EPOCH = new Date(0);
const PRODUCER = 'Concept2Cure IND form renderer';

const BLACK = rgb(0, 0, 0);
const GRAY = rgb(0.35, 0.35, 0.35);
const BORDER = rgb(0.45, 0.45, 0.45);
const SECTION_BG = rgb(0.88, 0.9, 0.93);
const BANNER_BG = rgb(0.12, 0.22, 0.38);
const BANNER_FG = rgb(1, 1, 1);
const DISCLAIMER_BG = rgb(0.99, 0.95, 0.8);
const DISCLAIMER_BORDER = rgb(0.75, 0.6, 0.1);

// ---------------------------------------------------------------------------
// Layout model
// ---------------------------------------------------------------------------

interface ReconField {
  id: string;
  label: string;
  /** Fraction (0..1) of the content width this box occupies in its row. */
  width?: number;
}

interface ReconCheckbox {
  id: string;
  label: string;
}

type ReconBlock =
  | { kind: 'section'; title: string }
  | { kind: 'boxes'; fields: ReconField[] }
  | { kind: 'checkboxes'; title?: string; items: ReconCheckbox[] }
  | { kind: 'note'; text: string }
  | { kind: 'signature'; label: string; dateLabel?: string; note?: string };

interface ReconLayout {
  formNumber: string;
  title: string;
  subtitle?: string;
  omb: string;
  agency: string;
  blocks: ReconBlock[];
  /** Ids satisfied by the layout without a dedicated box (meta/QC gates). */
  consume?: string[];
}

// ---------------------------------------------------------------------------
// Layout specs — faithful to the real form's box structure
// ---------------------------------------------------------------------------

const LAYOUT_1571: ReconLayout = {
  formNumber: '1571',
  title: 'INVESTIGATIONAL NEW DRUG APPLICATION (IND)',
  subtitle: '(Title 21, Code of Federal Regulations (CFR) Part 312)',
  omb: 'Form Approved: OMB No. 0910-0014',
  agency: 'DEPARTMENT OF HEALTH AND HUMAN SERVICES  —  FOOD AND DRUG ADMINISTRATION',
  blocks: [
    { kind: 'section', title: '1. Sponsor' },
    { kind: 'boxes', fields: [{ id: 'sponsor_name', label: 'Name of Sponsor' }] },
    { kind: 'boxes', fields: [{ id: 'sponsor_address', label: 'Address (Number, Street, City, State and Zip Code)' }] },
    {
      kind: 'boxes',
      fields: [
        { id: 'sponsor_contact_name', label: 'Person Responsible for Monitoring', width: 0.5 },
        { id: 'sponsor_contact_phone', label: 'Telephone Number', width: 0.5 },
      ],
    },
    { kind: 'boxes', fields: [{ id: 'sponsor_contact_email', label: 'Email Address' }] },

    { kind: 'section', title: '2. U.S. Agent (if the sponsor is outside the United States)' },
    { kind: 'boxes', fields: [{ id: 'us_agent_name', label: 'Name of U.S. Agent' }] },
    {
      kind: 'boxes',
      fields: [
        { id: 'us_agent_address', label: 'Address of U.S. Agent', width: 0.62 },
        { id: 'us_agent_phone', label: 'Telephone Number', width: 0.38 },
      ],
    },

    { kind: 'section', title: '3. Drug and Application' },
    { kind: 'boxes', fields: [{ id: 'drug_name', label: 'Name(s) of Drug (Trade, Generic, Chemical, or Code)' }] },
    { kind: 'boxes', fields: [{ id: 'indication', label: 'Indication(s) (Covered by this submission)' }] },
    {
      kind: 'boxes',
      fields: [
        { id: 'ind_number', label: 'IND Number (if previously assigned)', width: 0.5 },
        { id: 'serial_number', label: 'Serial Number', width: 0.5 },
      ],
    },
    {
      kind: 'boxes',
      fields: [
        { id: 'ind_type', label: 'IND Type', width: 0.5 },
        { id: 'phase_of_study', label: 'Phase(s) of Clinical Investigation', width: 0.5 },
      ],
    },

    { kind: 'section', title: '4. Certification and Authorized Representative' },
    {
      kind: 'note',
      text:
        'I agree not to begin clinical investigations until 30 days after FDA’s receipt of the IND unless I '
        + 'receive earlier notification by FDA that the studies may begin. I also agree not to begin or continue '
        + 'clinical investigations covered by the IND if those studies are placed on clinical hold. I agree that an '
        + 'Institutional Review Board (IRB) that complies with 21 CFR Part 56 will be responsible for the initial and '
        + 'continuing review and approval of each study in the proposed clinical investigation. I agree to conduct the '
        + 'investigation in accordance with all other applicable regulatory requirements (21 CFR 312.23, 312.40).',
    },
    {
      kind: 'boxes',
      fields: [
        { id: 'authorized_rep_name', label: 'Name of Sponsor or Sponsor’s Authorized Representative', width: 0.6 },
        { id: 'authorized_rep_title', label: 'Title', width: 0.4 },
      ],
    },
    {
      kind: 'signature',
      label: 'Signature of Sponsor or Sponsor’s Authorized Representative',
      dateLabel: 'Date',
      note:
        'Signature and date are captured at the governed electronic-signing event under 21 CFR Part 11 and are '
        + 'intentionally left blank in this reconstruction.',
    },
  ],
};

const LAYOUT_3674: ReconLayout = {
  formNumber: '3674',
  title: 'CERTIFICATION OF COMPLIANCE WITH REQUIREMENTS OF ClinicalTrials.gov DATA BANK',
  subtitle: '(42 U.S.C. § 282(j), Section 402(j) of the Public Health Service Act)',
  omb: 'Form Approved: OMB No. 0910-0616',
  agency: 'DEPARTMENT OF HEALTH AND HUMAN SERVICES  —  FOOD AND DRUG ADMINISTRATION',
  // certification_selected is the QC gate expressed by the check boxes below, not
  // a form field of its own — consume it so it is not shown as a leftover box.
  consume: ['certification_selected'],
  blocks: [
    { kind: 'section', title: '1. Applicant / Sponsor and Product' },
    { kind: 'boxes', fields: [{ id: 'sponsor_name', label: 'Name of Sponsor / Applicant' }] },
    {
      kind: 'boxes',
      fields: [
        { id: 'drug_name', label: 'Product Name', width: 0.6 },
        { id: 'nct_number', label: 'ClinicalTrials.gov Identifier (NCT Number)', width: 0.4 },
      ],
    },

    { kind: 'section', title: '2. Certification of Compliance (check the one that applies)' },
    {
      kind: 'checkboxes',
      items: [
        {
          id: 'cert_not_applicable',
          label:
            'I certify that the requirements of 42 U.S.C. § 282(j), Section 402(j) of the Public Health Service '
            + 'Act, do NOT apply because the application/submission does not reference any applicable clinical trial.',
        },
        {
          id: 'cert_requirements_met',
          label:
            'I certify that the requirements of 42 U.S.C. § 282(j) apply to one or more of the referenced clinical '
            + 'trials and that these requirements have been met.',
        },
        {
          id: 'cert_submitted_no_data',
          label:
            'I certify that the requirements of 42 U.S.C. § 282(j) apply and that the required registration has '
            + 'been submitted, but the deadline for submission of clinical trial results information has not yet been '
            + 'reached (results are not yet required).',
        },
      ],
    },

    { kind: 'section', title: '3. Signature' },
    {
      kind: 'signature',
      label: 'Signature of Sponsor / Applicant or Authorized Representative',
      dateLabel: 'Date',
      note:
        'Signature and date are captured at the governed electronic-signing event under 21 CFR Part 11 and are '
        + 'intentionally left blank in this reconstruction.',
    },
  ],
};

const LAYOUTS: Record<string, ReconLayout> = {
  [FORM_1571]: LAYOUT_1571,
  [FORM_3674]: LAYOUT_3674,
};

/** True when a faithful sectioned reconstruction layout exists for the form id. */
export function hasReconstruction(formId: string): boolean {
  return Object.prototype.hasOwnProperty.call(LAYOUTS, formId);
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

function valueToText(v: FieldValue | undefined): string {
  if (v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return v;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (text === '') return [''];
  const out: string[] = [];
  for (const logical of text.split('\n')) {
    const words = logical.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) {
      out.push('');
      continue;
    }
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        if (current) out.push(current);
        if (font.widthOfTextAtSize(word, size) > maxWidth) {
          // Hard-break a token longer than the line.
          let chunk = '';
          for (const ch of word) {
            if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
              out.push(chunk);
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
    if (current) out.push(current);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

const LABEL_SIZE = 6.5;
const VALUE_SIZE = 10;
const VALUE_LEADING = 12;
const BOX_PAD_X = 4;
const BOX_LABEL_H = 12; // space reserved above the value for the box label
const BOX_MIN_H = 30;
const NOTE_SIZE = 8;
const NOTE_LEADING = 10.5;
const CHECK_SIZE = 11;
const CHECK_LEADING = 12.5;
const CHECK_BOX = 10;
const SECTION_H = 17;
const GAP = 8;

/**
 * Render a faithful sectioned reconstruction of an FDA form from its built field
 * map. Every built field is rendered (curated boxes/checkboxes plus an
 * "Additional information" section for any field the layout does not place), so
 * field coverage is complete and nothing is silently dropped.
 */
export async function reconstructForm(
  formId: string,
  built: BuiltForm,
): Promise<IndFormPdfResult> {
  const layout = LAYOUTS[formId];
  if (!layout) {
    throw new Error(`No reconstruction layout for form id: ${formId}`);
  }

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  doc.setTitle(`FDA Form ${layout.formNumber} (reconstruction — not the official Adobe-rendered form)`);
  doc.setProducer(PRODUCER);
  doc.setCreator(PRODUCER);
  doc.setCreationDate(EPOCH);
  doc.setModificationDate(EPOCH);

  let page: PDFPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN_TOP;

  const newPage = () => {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN_TOP;
  };
  const ensure = (needed: number) => {
    if (y - needed < MARGIN_BOTTOM) newPage();
  };

  // ---- Header banner --------------------------------------------------------
  const drawHeader = () => {
    const bannerH = 40;
    page.drawRectangle({ x: MARGIN_X, y: y - bannerH, width: CONTENT_WIDTH, height: bannerH, color: BANNER_BG });
    page.drawText(layout.agency, { x: MARGIN_X + 8, y: y - 13, size: 6.5, font: bold, color: BANNER_FG });
    const titleLines = wrapText(layout.title, bold, 10, CONTENT_WIDTH - 120);
    let ty = y - 25;
    for (const line of titleLines.slice(0, 2)) {
      page.drawText(line, { x: MARGIN_X + 8, y: ty, size: 10, font: bold, color: BANNER_FG });
      ty -= 11;
    }
    // Right-aligned form number + OMB.
    const fdaTag = `FORM FDA ${layout.formNumber}`;
    page.drawText(fdaTag, {
      x: MARGIN_X + CONTENT_WIDTH - 8 - bold.widthOfTextAtSize(fdaTag, 11),
      y: y - 15,
      size: 11,
      font: bold,
      color: BANNER_FG,
    });
    page.drawText(layout.omb, {
      x: MARGIN_X + CONTENT_WIDTH - 8 - font.widthOfTextAtSize(layout.omb, 6),
      y: y - 28,
      size: 6,
      font,
      color: BANNER_FG,
    });
    y -= bannerH + 3;
    if (layout.subtitle) {
      page.drawText(layout.subtitle, { x: MARGIN_X, y: y - 7, size: 7, font: italic, color: GRAY });
      y -= 12;
    }
  };

  // ---- Reconstruction disclaimer band --------------------------------------
  const drawDisclaimer = () => {
    const msg =
      'RECONSTRUCTION — This is a field-level reconstruction generated by Concept2Cure, NOT the official '
      + `Adobe-rendered FDA Form ${layout.formNumber}. Verify against the official FDA form before any submission.`;
    const lines = wrapText(msg, bold, 7.5, CONTENT_WIDTH - 16);
    const h = 8 + lines.length * 10;
    page.drawRectangle({
      x: MARGIN_X,
      y: y - h,
      width: CONTENT_WIDTH,
      height: h,
      color: DISCLAIMER_BG,
      borderColor: DISCLAIMER_BORDER,
      borderWidth: 1,
    });
    let ty = y - 12;
    for (const line of lines) {
      page.drawText(line, { x: MARGIN_X + 8, y: ty, size: 7.5, font: bold, color: rgb(0.4, 0.3, 0) });
      ty -= 10;
    }
    y -= h + GAP;
  };

  // ---- Block renderers ------------------------------------------------------
  const drawSection = (title: string) => {
    ensure(SECTION_H + GAP);
    page.drawRectangle({ x: MARGIN_X, y: y - SECTION_H, width: CONTENT_WIDTH, height: SECTION_H, color: SECTION_BG });
    page.drawText(title, { x: MARGIN_X + 6, y: y - 12, size: 9, font: bold, color: rgb(0.1, 0.15, 0.25) });
    y -= SECTION_H + 4;
  };

  const drawBoxesRow = (fields: ReconField[]) => {
    // Compute each box's wrapped value + height, then draw at the row's max height.
    const prepared = fields.map((f) => {
      const w = Math.max(0.05, f.width ?? 1) * CONTENT_WIDTH;
      const value = valueToText(built.fields[f.id]);
      const valueLines = wrapText(value, font, VALUE_SIZE, w - 2 * BOX_PAD_X);
      const h = Math.max(BOX_MIN_H, BOX_LABEL_H + valueLines.length * VALUE_LEADING + 6);
      return { f, w, valueLines, h };
    });
    const rowH = prepared.reduce((m, p) => Math.max(m, p.h), BOX_MIN_H);
    ensure(rowH + 4);
    let x = MARGIN_X;
    for (const p of prepared) {
      page.drawRectangle({ x, y: y - rowH, width: p.w, height: rowH, borderColor: BORDER, borderWidth: 0.75 });
      page.drawText(p.f.label.toUpperCase(), { x: x + BOX_PAD_X, y: y - 9, size: LABEL_SIZE, font: bold, color: GRAY });
      let ty = y - BOX_LABEL_H - 8;
      for (const line of p.valueLines) {
        page.drawText(line, { x: x + BOX_PAD_X, y: ty, size: VALUE_SIZE, font, color: BLACK });
        ty -= VALUE_LEADING;
      }
      x += p.w;
    }
    y -= rowH + 4;
  };

  const drawCheckboxes = (items: ReconCheckbox[], title?: string) => {
    if (title) {
      ensure(14);
      page.drawText(title, { x: MARGIN_X, y: y - 9, size: 8, font: bold, color: BLACK });
      y -= 14;
    }
    for (const item of items) {
      const labelX = MARGIN_X + CHECK_BOX + 8;
      const labelW = CONTENT_WIDTH - (CHECK_BOX + 8) - 4;
      const lines = wrapText(item.label, font, CHECK_SIZE - 1.5, labelW);
      const rowH = Math.max(CHECK_BOX + 4, lines.length * CHECK_LEADING);
      ensure(rowH + 3);
      const checked = built.fields[item.id] === true;
      const boxY = y - CHECK_BOX;
      page.drawRectangle({ x: MARGIN_X, y: boxY, width: CHECK_BOX, height: CHECK_BOX, borderColor: BLACK, borderWidth: 1 });
      if (checked) {
        // Draw an X inside the box (no glyph dependency).
        page.drawLine({ start: { x: MARGIN_X + 1.5, y: boxY + 1.5 }, end: { x: MARGIN_X + CHECK_BOX - 1.5, y: boxY + CHECK_BOX - 1.5 }, thickness: 1.2, color: BLACK });
        page.drawLine({ start: { x: MARGIN_X + 1.5, y: boxY + CHECK_BOX - 1.5 }, end: { x: MARGIN_X + CHECK_BOX - 1.5, y: boxY + 1.5 }, thickness: 1.2, color: BLACK });
      }
      let ty = y - 8;
      for (const line of lines) {
        page.drawText(line, { x: labelX, y: ty, size: CHECK_SIZE - 1.5, font, color: BLACK });
        ty -= CHECK_LEADING;
      }
      y -= rowH + 3;
    }
  };

  const drawNote = (text: string) => {
    const lines = wrapText(text, italic, NOTE_SIZE, CONTENT_WIDTH - 4);
    ensure(lines.length * NOTE_LEADING + 4);
    let ty = y - 8;
    for (const line of lines) {
      page.drawText(line, { x: MARGIN_X + 2, y: ty, size: NOTE_SIZE, font: italic, color: GRAY });
      ty -= NOTE_LEADING;
    }
    y -= lines.length * NOTE_LEADING + 4;
  };

  const drawSignature = (label: string, dateLabel: string | undefined, note: string | undefined) => {
    const h = 34;
    ensure(h + (note ? 20 : 0) + 4);
    const sigW = dateLabel ? CONTENT_WIDTH * 0.66 : CONTENT_WIDTH;
    page.drawRectangle({ x: MARGIN_X, y: y - h, width: sigW, height: h, borderColor: BORDER, borderWidth: 0.75 });
    page.drawText(label.toUpperCase(), { x: MARGIN_X + BOX_PAD_X, y: y - 9, size: LABEL_SIZE, font: bold, color: GRAY });
    if (dateLabel) {
      const dateX = MARGIN_X + sigW;
      const dateW = CONTENT_WIDTH - sigW;
      page.drawRectangle({ x: dateX, y: y - h, width: dateW, height: h, borderColor: BORDER, borderWidth: 0.75 });
      page.drawText(dateLabel.toUpperCase(), { x: dateX + BOX_PAD_X, y: y - 9, size: LABEL_SIZE, font: bold, color: GRAY });
    }
    y -= h + 3;
    if (note) drawNote(note);
  };

  // ---- Walk the layout ------------------------------------------------------
  drawHeader();
  drawDisclaimer();

  const referenced = new Set<string>(layout.consume ?? []);
  for (const block of layout.blocks) {
    switch (block.kind) {
      case 'section':
        drawSection(block.title);
        break;
      case 'boxes':
        block.fields.forEach((f) => referenced.add(f.id));
        drawBoxesRow(block.fields);
        break;
      case 'checkboxes':
        block.items.forEach((i) => referenced.add(i.id));
        drawCheckboxes(block.items, block.title);
        break;
      case 'note':
        drawNote(block.text);
        break;
      case 'signature':
        drawSignature(block.label, block.dateLabel, block.note);
        break;
    }
  }

  // ---- Leftover fields (never silently dropped) -----------------------------
  const labels = labelsForForm(formId);
  const leftover = Object.keys(built.fields).filter((id) => !referenced.has(id));
  if (leftover.length > 0) {
    drawSection('Additional information');
    for (const id of leftover) {
      drawBoxesRow([{ id, label: labels[id] ?? id }]);
    }
  }

  // ---- QC footnote: missing required fields ---------------------------------
  if (built.missingRequired.length > 0) {
    y -= GAP;
    const names = built.missingRequired.map((id) => labels[id] ?? id).join('; ');
    drawNote(`QC — required fields still missing: ${names}`);
  }

  const pdfBytes = await doc.save({ useObjectStreams: false });
  const total = Object.keys(built.fields).length || 1;
  // Every built field is rendered (curated + leftover), so coverage is complete.
  return {
    formId,
    pdfBytes,
    usedOfficialTemplate: false,
    reconstructed: true,
    fieldCoverage: Object.keys(built.fields).length === 0 ? 1 : 1,
    missingRequired: built.missingRequired,
  };
}
