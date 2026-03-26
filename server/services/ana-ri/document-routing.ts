/**
 * AnA RI — Document Routing
 *
 * Detects what document type the user wants and routes to the
 * correct generator (CTD section draft, safety narrative, CSR,
 * SAP, report engine, or artifact generator).
 *
 * Design: the user says "draft the clinical overview" and AnA
 * knows to use the 2.5 section prompt. No forms, no selection.
 *
 * @module server/services/ana-ri/document-routing
 */

// ─── Document type detection ─────────────────────────────────────────────────

export interface DetectedDocument {
  type: 'ctd_section' | 'safety_narrative' | 'csr_section' | 'sap' | 'report' | 'artifact';
  sectionCode?: string;
  subtype?: string;
  title: string;
  module?: string;
  description: string;
}

interface DocumentPattern {
  pattern: RegExp;
  result: DetectedDocument;
}

const DOCUMENT_PATTERNS: DocumentPattern[] = [
  // ── Module 1 ──
  { pattern: /\b(?:cover letter|form 1571|1\.1)\b/i, result: { type: 'ctd_section', sectionCode: '1.1', title: 'Cover Letter / Form 1571', module: 'M1', description: 'IND cover letter with sponsor info, drug name, phase, protocol list' } },
  { pattern: /\b(?:table of contents|toc|1\.2)\b/i, result: { type: 'ctd_section', sectionCode: '1.2', title: 'Table of Contents', module: 'M1', description: 'eCTD table of contents per ICH M4' } },
  { pattern: /\b(?:form 1572|statement of investigator|1\.3\.1)\b/i, result: { type: 'ctd_section', sectionCode: '1.3.1', title: 'Form 1572', module: 'M1', description: 'Statement of Investigator for each site PI' } },
  { pattern: /\b(?:investigator.?s? brochure|ib|1\.3\.3|1\.14)\b/i, result: { type: 'ctd_section', sectionCode: '1.3.3', title: 'Investigator\'s Brochure', module: 'M1', description: 'Comprehensive IB with all available nonclinical and clinical data' } },

  // ── Module 2 ──
  { pattern: /\b(?:ctd introduction|2\.2)\b/i, result: { type: 'ctd_section', sectionCode: '2.2', title: 'CTD Introduction', module: 'M2', description: 'Brief introduction to the pharmaceutical agent' } },
  { pattern: /\b(?:quality overall summary|qos|2\.3)\b/i, result: { type: 'ctd_section', sectionCode: '2.3', title: 'Quality Overall Summary', module: 'M2', description: 'CMC summary — drug substance, drug product, controls' } },
  { pattern: /\b(?:nonclinical overview|non.?clinical overview|2\.4)\b/i, result: { type: 'ctd_section', sectionCode: '2.4', title: 'Nonclinical Overview', module: 'M2', description: 'Integrated nonclinical evaluation' } },
  { pattern: /\b(?:clinical overview|2\.5)\b/i, result: { type: 'ctd_section', sectionCode: '2.5', title: 'Clinical Overview', module: 'M2', description: 'Integrated benefit-risk assessment across all clinical studies' } },
  { pattern: /\b(?:nonclinical (?:written )?summar|2\.6)\b/i, result: { type: 'ctd_section', sectionCode: '2.6', title: 'Nonclinical Summaries', module: 'M2', description: 'Pharmacology, PK, toxicology summaries' } },
  { pattern: /\b(?:clinical summary|clinical efficacy summary|2\.7)\b/i, result: { type: 'ctd_section', sectionCode: '2.7', title: 'Clinical Summary', module: 'M2', description: 'Efficacy + safety summary with biopharm evaluation' } },

  // ── Module 3 ──
  { pattern: /\b(?:drug substance|3\.2\.?s)\b/i, result: { type: 'ctd_section', sectionCode: '3.2.S', title: 'Drug Substance', module: 'M3', description: 'Nomenclature, manufacture, characterization, controls, stability' } },
  { pattern: /\b(?:drug product|3\.2\.?p)\b/i, result: { type: 'ctd_section', sectionCode: '3.2.P', title: 'Drug Product', module: 'M3', description: 'Description, development, manufacture, controls, stability' } },

  // ── Module 4 ──
  { pattern: /\b(?:pharmacology study|4\.2\.1)\b/i, result: { type: 'ctd_section', sectionCode: '4.2.1', title: 'Pharmacology Study Reports', module: 'M4', description: 'Primary and secondary pharmacology studies' } },
  { pattern: /\b(?:pharmacokinetic|pk study|4\.2\.2)\b/i, result: { type: 'ctd_section', sectionCode: '4.2.2', title: 'Pharmacokinetics Study Reports', module: 'M4', description: 'ADME and PK study reports' } },
  { pattern: /\b(?:toxicology|tox study|4\.2\.3)\b/i, result: { type: 'ctd_section', sectionCode: '4.2.3', title: 'Toxicology Study Reports', module: 'M4', description: 'Single-dose, repeat-dose, genotoxicity, carcinogenicity, reproductive tox' } },

  // ── Module 5 ──
  { pattern: /\b(?:tabulated summar|5\.2)\b/i, result: { type: 'ctd_section', sectionCode: '5.2', title: 'Tabulated Summary Data', module: 'M5', description: 'Tabulated study data and graphs' } },
  { pattern: /\b(?:efficacy study report|5\.3\.1)\b/i, result: { type: 'ctd_section', sectionCode: '5.3.1', title: 'Clinical Efficacy Study Reports', module: 'M5', description: 'Controlled and uncontrolled efficacy studies' } },
  { pattern: /\b(?:safety study report|5\.3\.3)\b/i, result: { type: 'ctd_section', sectionCode: '5.3.3', title: 'Clinical Safety Study Reports', module: 'M5', description: 'Safety database, AE summaries, lab data' } },
  { pattern: /\b(?:clinical pharmacology|human pk|5\.3\.5)\b/i, result: { type: 'ctd_section', sectionCode: '5.3.5', title: 'Clinical Pharmacology Study Reports', module: 'M5', description: 'BA/BE, PK/PD, dose-response studies' } },

  // ── Safety Narratives ──
  { pattern: /\b(?:safety narrative|teae narrative|adverse event narrative)\b/i, result: { type: 'safety_narrative', subtype: 'aggregate', title: 'Safety Narrative', description: 'Aggregate TEAE narrative for CSR/IB/CER/DSUR' } },
  { pattern: /\b(?:sae narrative|serious adverse|case narrative)\b/i, result: { type: 'safety_narrative', subtype: 'sae', title: 'SAE Case Narrative', description: 'Individual serious adverse event case narrative' } },
  { pattern: /\b(?:benefit.?risk|benefit risk)\b/i, result: { type: 'safety_narrative', subtype: 'benefit_risk', title: 'Benefit-Risk Summary', description: 'Integrated benefit-risk analysis for regulatory submission' } },
  { pattern: /\b(?:dsur|development safety update)\b/i, result: { type: 'safety_narrative', subtype: 'dsur', title: 'DSUR Content', description: 'Development Safety Update Report content' } },
  { pattern: /\b(?:cross.?study safety|pooled safety)\b/i, result: { type: 'safety_narrative', subtype: 'cross_study', title: 'Cross-Study Safety Summary', description: 'Pooled safety analysis across multiple studies' } },

  // ── CSR ──
  { pattern: /\b(?:csr|clinical study report)\b/i, result: { type: 'csr_section', subtype: 'full', title: 'Clinical Study Report', description: 'Full ICH E3 clinical study report' } },
  { pattern: /\b(?:csr synopsis|study synopsis)\b/i, result: { type: 'csr_section', subtype: 'synopsis', title: 'CSR Synopsis', description: 'Study synopsis per ICH E3 Section 2' } },
  { pattern: /\b(?:iss|integrated summary of safety)\b/i, result: { type: 'csr_section', subtype: 'iss', title: 'Integrated Summary of Safety', description: 'Pooled safety analysis across all studies' } },
  { pattern: /\b(?:ise|integrated summary of efficacy)\b/i, result: { type: 'csr_section', subtype: 'ise', title: 'Integrated Summary of Efficacy', description: 'Pooled efficacy analysis across pivotal studies' } },

  // ── SAP ──
  { pattern: /\b(?:statistical analysis plan|sap)\b/i, result: { type: 'sap', title: 'Statistical Analysis Plan', description: 'Complete SAP with all planned analyses, endpoints, and missing data strategy' } },

  // ── Reports ──
  { pattern: /\b(?:risk memo|risk assessment)\b/i, result: { type: 'artifact', subtype: 'risk_memo', title: 'Risk Assessment Memo', description: 'Severity-ranked regulatory risks with go/no-go recommendation' } },
  { pattern: /\b(?:deficiency memo|deficiency preemption)\b/i, result: { type: 'artifact', subtype: 'deficiency_preemption_memo', title: 'Deficiency Preemption Memo', description: 'Anticipated reviewer questions with prepared responses' } },
  { pattern: /\b(?:strategy note|regulatory strategy)\b/i, result: { type: 'artifact', subtype: 'strategy_note', title: 'Regulatory Strategy Note', description: 'Pathway analysis with argument hierarchy' } },
  { pattern: /\b(?:reviewer brief|reviewer question)\b/i, result: { type: 'artifact', subtype: 'reviewer_question_brief', title: 'Reviewer Question Brief', description: 'Anticipated questions with evidence-backed answers' } },
  { pattern: /\b(?:evidence memo|evidence assessment)\b/i, result: { type: 'artifact', subtype: 'evidence_memo', title: 'Evidence Assessment Memo', description: 'Evidence inventory with gap analysis' } },

  // ── EU-specific ──
  { pattern: /\b(?:smpc|summary of product characteristics)\b/i, result: { type: 'ctd_section', sectionCode: '1.3.1', title: 'SmPC', module: 'M1-EU', description: 'Summary of Product Characteristics per QRD template' } },
  { pattern: /\b(?:package leaflet|patient information|pil)\b/i, result: { type: 'ctd_section', sectionCode: '1.3.1', title: 'Package Leaflet', module: 'M1-EU', description: 'Patient-facing leaflet per QRD template' } },
  { pattern: /\b(?:risk management plan|rmp)\b/i, result: { type: 'ctd_section', sectionCode: '1.8.2', title: 'Risk Management Plan', module: 'M1-EU', description: 'EU RMP per EMA GVP Module V' } },

  // ── Device-specific ──
  { pattern: /\b(?:device description|intended use)\b/i, result: { type: 'ctd_section', title: 'Device Description', description: 'Intended use, indications, technical characteristics' } },
  { pattern: /\b(?:substantial equivalence|se comparison)\b/i, result: { type: 'artifact', subtype: 'revised_artifact', title: 'Substantial Equivalence Comparison', description: 'Side-by-side comparison table vs predicate device' } },
  { pattern: /\b(?:clinical evaluation report|cer)\b/i, result: { type: 'csr_section', subtype: 'cer', title: 'Clinical Evaluation Report', description: 'CER per MEDDEV 2.7/1 Rev 4 for EU MDR' } },

  // ── Labeling ──
  { pattern: /\b(?:uspi|prescribing information|package insert)\b/i, result: { type: 'ctd_section', sectionCode: '1.14', title: 'USPI / Prescribing Information', module: 'M1', description: 'Prescribing information per FDA Physician Labeling Rule' } },
  { pattern: /\b(?:medication guide)\b/i, result: { type: 'ctd_section', title: 'Medication Guide', module: 'M1', description: 'Patient medication guide' } },
];

/**
 * Detect what document type the user wants from their message.
 * Returns the best match or null if no document type detected.
 */
export function detectDocumentType(message: string): DetectedDocument | null {
  for (const { pattern, result } of DOCUMENT_PATTERNS) {
    if (pattern.test(message)) {
      return result;
    }
  }
  return null;
}

/**
 * Build a document-type-aware context block for the system prompt.
 * When a document type is detected, adds specific generation instructions.
 */
export function buildDocumentGenerationContext(doc: DetectedDocument): string {
  const parts: string[] = [
    `## Document Generation Request Detected`,
    `**Type:** ${doc.title}`,
    `**Category:** ${doc.type}`,
  ];

  if (doc.sectionCode) parts.push(`**CTD Section:** ${doc.sectionCode}`);
  if (doc.module) parts.push(`**Module:** ${doc.module}`);
  parts.push(`**Description:** ${doc.description}`);

  parts.push(`\nGenerate this document NOW. Write complete, submission-ready content — not an outline, not a summary, not placeholders. Use proper regulatory prose with ICH/FDA/EMA compliance. When done, include an \`\`\`ana-action block to auto-save as a governed artifact.`);

  return '\n\n' + parts.join('\n');
}
