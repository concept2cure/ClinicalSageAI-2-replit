/**
 * IND lifecycle document → submission-ready PDF.
 *
 * Bridges the structured document models produced by the RA lifecycle services
 * (IND Safety Report, IND Annual Report) to real, navigable PDF bytes via the
 * deterministic structured leaf renderer — so the output is an actual eCTD leaf
 * (valid PDF, page-accurate bookmarks) rather than just an in-memory model.
 *
 * Deterministic: identical models render to byte-identical PDFs (the md5
 * contract), so a re-render does not perturb a sequence's index-md5.
 *
 * INTEGRATION NOTES (human): exposed at POST /api/ind-lifecycle/safety-report/pdf
 * and /annual-report/pdf. To file the result, write the bytes to a leaf source
 * path and register it via submission-service (sequence type 'amendment' for a
 * safety report, 'annual' for the annual report) per each service's header.
 */

import { renderStructuredLeafPdf, type LeafSection } from '../ectd/leaf-pdf-renderer';
import type {
  IndSafetyReportDocument,
  IndSafetyReportSection,
} from './ind-safety-report-service';
import type { IndAnnualReportModel } from './ind-annual-report-service';

/** Map a (possibly nested) safety-report section to a renderer LeafSection, numbering it. */
function safetySectionToLeaf(
  section: IndSafetyReportSection,
  index: number,
  prefix: string,
): LeafSection {
  const code = prefix ? `${prefix}.${index}` : String(index);
  return {
    heading: section.heading,
    sectionCode: code,
    body: section.body,
    children: section.children?.map((child, i) => safetySectionToLeaf(child, i + 1, code)),
  };
}

/** Render a structured IND Safety Report (21 CFR 312.32) to a PDF leaf. */
export async function renderIndSafetyReportPdf(doc: IndSafetyReportDocument): Promise<Buffer> {
  const sections = doc.sections.map((s, i) => safetySectionToLeaf(s, i + 1, ''));
  return renderStructuredLeafPdf(sections, {
    title: `IND Safety Report (${doc.obligation})`,
    sectionCode: 'm5.3.5',
  });
}

/** Render an IND Annual Report / DSUR (21 CFR 312.33) to a PDF leaf. */
export async function renderIndAnnualReportPdf(model: IndAnnualReportModel): Promise<Buffer> {
  const sections: LeafSection[] = model.sections.map((s, i) => ({
    heading: s.heading,
    sectionCode: String(i + 1),
    body: s.body && s.body.length > 0 ? s.body : '[To be completed by the sponsor.]',
  }));
  return renderStructuredLeafPdf(sections, {
    title: `IND Annual Report — ${model.productName} (IND ${model.indNumber})`,
    sectionCode: 'm1.13',
  });
}
