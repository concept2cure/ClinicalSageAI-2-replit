/**
 * The documents generate_document does not write (CLAUDE.md Rule 2; Rule 2
 * audit S6b, 2026-11-01; ONE_DESIGN_PLAN S4).
 *
 * generate_document builds a DOCX from section text, or template replacements,
 * that the model writes. For these documents that text is the regulated
 * content itself: study results, quality data, nonclinical findings, a
 * clinical evaluation, device data. So each is answered with the record path
 * that produces it, in the one editor or the work area that owns it, and
 * nothing is built. An eCTD backbone and an ICSR were refused here already,
 * but only when no sections were given; sections went straight past it.
 *
 * Split out of the generate_document handler in AnaToolExecutor.ts, which
 * still writes a protocol, a statistical analysis plan and a Module 1
 * document. A PMA is withheld until a PMA record path exists (P-55, R-7).
 *
 * @module server/services/ana/generate-document-refusals
 */

const RECORD_PATHS: Readonly<Record<string, string>> = {
  csr:
    "A Clinical Study Report is drafted section by section from a retained Submission Center run: get_csr_section_evidence returns the section's engine tables, and draft_authoring_document drafts the section in the project's CSR document in the editor.",
  ctd_module5:
    "Module 5 holds the study reports and datasets. Each CSR is drafted section by section from a retained run (get_csr_section_evidence, then draft_authoring_document), and the module is assembled from the project's documents in Submission Center.",
  ctd_module3:
    "Module 3 is compiled from the program's CMC records in CMC / Module 3 (POST /api/cmc/module3-os/compile/:projectId), each section is approved, and the sections are placed into the submission (POST /api/cmc/module3-os/place-into-submission/:projectId). Its summary, Module 2.3, is draft_quality_overall_summary_m2_3.",
  ctd_module2:
    "Module 2 is composed from the project's records, one summary at a time: draft_quality_overall_summary_m2_3, draft_nonclinical_overview_m2_4, draft_clinical_overview_m2_5, draft_nonclinical_summaries_m2_6 and draft_clinical_summary_m2_7.",
  ctd_module4:
    'Module 4 holds the nonclinical study reports the testing facilities issued. They are filed in Vault and placed as leaves in Submission Center; nothing drafts them.',
  cer: "A Clinical Evaluation Report is written section by section in the device's CER workspace (write_kit_section, section keys cer-main and cer-pmcf), where a person reviews it; assess_stored_cer reads a stored CER.",
  '510k': "A 510(k) is the project's eSTAR, written section by section with write_kit_section; its 510(k) Summary is compose_510k_summary.",
  pma:
    "A PMA is not drafted here: generating one is withheld until a PMA record path exists (founder decision P-55, R-7). Write the PMA modules into the device kit with write_kit_section, where a person reviews them, and check filing readiness with advise_pma_readiness.",
  ib: "An Investigator's Brochure is the project's document in the editor, on its canonical outline; draft_authoring_document drafts a section of it from the project's sources.",
  ectd_backbone:
    'An eCTD backbone is produced by assembling a submission sequence, not drafted as a document. Use the submission assembly tools.',
  icsr: 'An ICSR is composed from a recorded safety report, not drafted as a document. Use the IND safety-report tools.',
};

/** The refusal for a document type generate_document does not write, or null when it writes it. */
export function recordDocumentRefusal(documentType: string): string | null {
  const path = RECORD_PATHS[documentType];
  if (!path) return null;
  return JSON.stringify({
    success: false,
    refused: true,
    documentType,
    message: `generate_document does not write this document from text given in the call. ${path}`,
  });
}
