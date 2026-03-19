/**
 * Biotech Document Artifact Generator
 *
 * Produces actual document artifacts (PDF, DOCX, XML) for all biotech
 * workflows: eCTD, Pharmacovigilance, Clinical Operations, CMC, Regulatory.
 *
 * Uses existing docxFactory, PDFKit, and xmlbuilder2 infrastructure.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  Header,
  Footer,
  PageNumber,
  NumberFormat,
  convertInchesToTwip,
} from 'docx';
import { create } from 'xmlbuilder2';
import PDFDocument from 'pdfkit';

// ─── Constants ──────────────────────────────────────────────────────────────

const PAGE_MARGINS = {
  top: convertInchesToTwip(1),
  bottom: convertInchesToTwip(1),
  left: convertInchesToTwip(1.25),
  right: convertInchesToTwip(1),
};

const FONTS = { body: 'Times New Roman', heading: 'Arial' } as const;

function ts() { return new Date().toISOString().split('T')[0]; }

function makeHeader(title: string): Header {
  return new Header({
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: title, font: FONTS.heading, size: 16, color: '8A8880' }),
          new TextRun({ text: `    |    ${ts()}`, font: FONTS.heading, size: 16, color: 'B0AEA5' }),
        ],
        alignment: AlignmentType.RIGHT,
      }),
    ],
  });
}

function makeFooter(confidential = true): Footer {
  return new Footer({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: confidential ? 'CONFIDENTIAL — ' : '',
            font: FONTS.heading, size: 16, color: 'D97757', bold: true,
          }),
          new TextRun({ text: 'Page ', font: FONTS.heading, size: 16, color: '8A8880' }),
          new TextRun({ children: [PageNumber.CURRENT], font: FONTS.heading, size: 16 }),
          new TextRun({ text: ' of ', font: FONTS.heading, size: 16, color: '8A8880' }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONTS.heading, size: 16 }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    ],
  });
}

function coverPage(title: string, subtitle: string, meta: Record<string, string>): Paragraph[] {
  const paras: Paragraph[] = [
    new Paragraph({ spacing: { before: 3000 } }),
    new Paragraph({
      children: [new TextRun({ text: title, font: FONTS.heading, size: 48, bold: true, color: '141413' })],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      children: [new TextRun({ text: subtitle, font: FONTS.heading, size: 28, color: '6B6962' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
    }),
    new Paragraph({ spacing: { after: 400 } }),
  ];
  for (const [key, value] of Object.entries(meta)) {
    paras.push(new Paragraph({
      children: [
        new TextRun({ text: `${key}: `, font: FONTS.body, size: 24, bold: true, color: '4D4B45' }),
        new TextRun({ text: value, font: FONTS.body, size: 24, color: '141413' }),
      ],
      alignment: AlignmentType.CENTER,
    }));
  }
  paras.push(new Paragraph({
    children: [new TextRun({ text: `Generated: ${ts()}`, font: FONTS.body, size: 20, color: '8A8880' })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 600 },
  }));
  return paras;
}

function sectionHeading(text: string, level: typeof HeadingLevel[keyof typeof HeadingLevel] = HeadingLevel.HEADING_1): Paragraph {
  return new Paragraph({ text, heading: level, spacing: { before: 400, after: 200 } });
}

function bodyPara(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, font: FONTS.body, size: 24 })],
    spacing: { after: 120 },
  });
}

function simpleTable(headers: string[], rows: string[][]): Table {
  const headerRow = new TableRow({
    children: headers.map(h => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, font: FONTS.heading, size: 20, color: 'FFFFFF' })] })],
      shading: { type: ShadingType.SOLID, color: 'D97757' },
      width: { size: Math.floor(100 / headers.length), type: WidthType.PERCENTAGE },
    })),
    tableHeader: true,
  });
  const dataRows = rows.map((row, i) => new TableRow({
    children: row.map(cell => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: cell, font: FONTS.body, size: 20 })] })],
      shading: i % 2 === 1 ? { type: ShadingType.SOLID, color: 'FAF9F5' } : undefined,
    })),
  }));
  return new Table({
    rows: [headerRow, ...dataRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

async function packDoc(doc: Document): Promise<Buffer> {
  return Buffer.from(await Packer.toBuffer(doc));
}

// ═══════════════════════════════════════════════════════════════════════════════
// eCTD DOCUMENT ARTIFACTS
// ═══════════════════════════════════════════════════════════════════════════════

export async function generateECTDCoverLetter(data: {
  applicant: string; product: string; applicationNumber: string;
  submissionType: string; sequence: string; region: string;
}): Promise<Buffer> {
  const doc = new Document({
    sections: [{
      properties: { page: { margin: PAGE_MARGINS } },
      headers: { default: makeHeader('eCTD Cover Letter') },
      footers: { default: makeFooter() },
      children: [
        ...coverPage('eCTD Submission Cover Letter', `${data.submissionType} — Sequence ${data.sequence}`, {
          Applicant: data.applicant, Product: data.product,
          'Application Number': data.applicationNumber, Region: data.region.toUpperCase(),
        }),
        new Paragraph({ children: [], pageBreakBefore: true }),
        sectionHeading('1. Purpose'),
        bodyPara(`This cover letter accompanies the ${data.submissionType} submission (Sequence ${data.sequence}) for ${data.product} under application number ${data.applicationNumber}, submitted to the ${data.region.toUpperCase()} regulatory authority.`),
        sectionHeading('2. Submission Contents'),
        bodyPara('This electronic Common Technical Document (eCTD) submission contains the following modules:'),
        simpleTable(['Module', 'Description', 'Status'], [
          ['Module 1', 'Administrative Information and Prescribing Information', 'Included'],
          ['Module 2', 'Common Technical Document Summaries', 'Included'],
          ['Module 3', 'Quality (CMC)', 'Included'],
          ['Module 4', 'Nonclinical Study Reports', 'Included'],
          ['Module 5', 'Clinical Study Reports', 'Included'],
        ]),
        sectionHeading('3. Contact Information'),
        bodyPara(`For questions regarding this submission, please contact the regulatory affairs department of ${data.applicant}.`),
        sectionHeading('4. Declaration'),
        bodyPara('The undersigned certifies that all information contained in this submission is accurate and complete to the best of their knowledge.'),
        new Paragraph({ spacing: { before: 600 } }),
        bodyPara('Authorized Representative: ____________________________'),
        bodyPara('Signature: ____________________________'),
        bodyPara(`Date: ${ts()}`),
      ],
    }],
  });
  return packDoc(doc);
}

export async function generateECTDValidationReport(data: {
  sequence: string; submissionType: string; region: string;
  errors: { rule: string; message: string; file?: string }[];
  warnings: { rule: string; message: string; file?: string }[];
}): Promise<Buffer> {
  const doc = new Document({
    sections: [{
      properties: { page: { margin: PAGE_MARGINS } },
      headers: { default: makeHeader('eCTD Validation Report') },
      footers: { default: makeFooter() },
      children: [
        ...coverPage('eCTD Validation Report', `Sequence ${data.sequence}`, {
          Type: data.submissionType, Region: data.region.toUpperCase(),
          Errors: String(data.errors.length), Warnings: String(data.warnings.length),
          Result: data.errors.length === 0 ? 'PASSED' : 'FAILED',
        }),
        new Paragraph({ children: [], pageBreakBefore: true }),
        sectionHeading('1. Validation Summary'),
        bodyPara(`This report summarizes the eCTD technical validation results for Sequence ${data.sequence}. The submission ${data.errors.length === 0 ? 'passed' : 'failed'} validation with ${data.errors.length} error(s) and ${data.warnings.length} warning(s).`),
        ...(data.errors.length > 0 ? [
          sectionHeading('2. Errors', HeadingLevel.HEADING_2),
          simpleTable(['Rule', 'Message', 'File'], data.errors.map(e => [e.rule, e.message, e.file ?? 'N/A'])),
        ] : [bodyPara('No errors found.')]),
        ...(data.warnings.length > 0 ? [
          sectionHeading('3. Warnings', HeadingLevel.HEADING_2),
          simpleTable(['Rule', 'Message', 'File'], data.warnings.map(w => [w.rule, w.message, w.file ?? 'N/A'])),
        ] : [bodyPara('No warnings found.')]),
        sectionHeading('4. Validation Rules Applied'),
        simpleTable(['Category', 'Rules Checked'], [
          ['File Naming Convention', 'ICH M8 file naming rules'],
          ['Module Completeness', 'Required modules per submission type'],
          ['PDF/A Compliance', 'PDF/A-1b or PDF/A-2b format'],
          ['Checksum Integrity', 'MD5 hash verification'],
          ['XML Schema', 'eCTD v4.0 DTD validation'],
          ['Lifecycle Operations', 'Consistency of new/replace/append/delete'],
        ]),
      ],
    }],
  });
  return packDoc(doc);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHARMACOVIGILANCE DOCUMENT ARTIFACTS
// ═══════════════════════════════════════════════════════════════════════════════

export function generateICSR_E2BR3(data: {
  safetyReportId: string; product: string; event: string;
  seriousness: string; outcome: string; causality: string;
  reporterType: string; country: string; patientAge?: string;
  narrativeText: string;
}): string {
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('ichicsr', { lang: 'en' })
      .ele('ichicsrmessageheader')
        .ele('messagetype').txt('ichicsr').up()
        .ele('messageformatversion').txt('2.1').up()
        .ele('messageformatrelease').txt('R3').up()
        .ele('messagenumb').txt(data.safetyReportId).up()
        .ele('messagesenderidentifier').txt('Concept2Cure.RI').up()
        .ele('messagereceiveridentifier').txt('EudraVigilance').up()
        .ele('messagedateformat').txt('204').up()
        .ele('messagedate').txt(ts().replace(/-/g, '')).up()
      .up()
      .ele('safetyreport')
        .ele('safetyreportversion').txt('1').up()
        .ele('safetyreportid').txt(data.safetyReportId).up()
        .ele('primarysourcecountry').txt(data.country).up()
        .ele('occurcountry').txt(data.country).up()
        .ele('reporttype').txt('1').up()
        .ele('serious').txt(data.seriousness === 'non_serious' ? '2' : '1').up()
        .ele('seriousnessdeath').txt(data.seriousness === 'death' ? '1' : '2').up()
        .ele('seriousnesslifethreatening').txt(data.seriousness === 'life_threatening' ? '1' : '2').up()
        .ele('seriousnesshospitalization').txt(data.seriousness === 'hospitalization' ? '1' : '2').up()
        .ele('primarysource')
          .ele('reportergivename').txt('Redacted').up()
          .ele('qualification').txt(data.reporterType === 'physician' ? '1' : '5').up()
        .up()
        .ele('patient')
          .ele('patientonsetage').txt(data.patientAge ?? 'Unknown').up()
          .ele('reaction')
            .ele('primarysourcereaction').txt(data.event).up()
            .ele('reactionoutcome').txt(
              data.outcome === 'recovered' ? '1' : data.outcome === 'recovering' ? '2' :
              data.outcome === 'not_recovered' ? '3' : data.outcome === 'fatal' ? '5' : '0'
            ).up()
          .up()
          .ele('drug')
            .ele('drugcharacterization').txt('1').up()
            .ele('medicinalproduct').txt(data.product).up()
            .ele('drugadditional').txt(data.causality).up()
          .up()
          .ele('summary')
            .ele('narrativeincludeclinical').txt(data.narrativeText).up()
          .up()
        .up()
      .up()
    .up();
  return root.end({ prettyPrint: true });
}

export async function generatePSURReport(data: {
  product: string; reportingPeriod: string; sponsor: string;
  totalCases: number; seriousCases: number; fatalCases: number;
  signalsSummary: { signal: string; status: string; action: string }[];
  benefitRiskConclusion: string;
}): Promise<Buffer> {
  const doc = new Document({
    sections: [{
      properties: { page: { margin: PAGE_MARGINS } },
      headers: { default: makeHeader('PSUR/PBRER') },
      footers: { default: makeFooter() },
      children: [
        ...coverPage('Periodic Safety Update Report (PSUR)', `PBRER per ICH E2C(R2)`, {
          Product: data.product, Sponsor: data.sponsor,
          'Reporting Period': data.reportingPeriod,
          'Report Date': ts(),
        }),
        new Paragraph({ children: [], pageBreakBefore: true }),
        sectionHeading('1. Introduction'),
        bodyPara(`This Periodic Safety Update Report (PSUR) covers the reporting period ${data.reportingPeriod} for ${data.product}, prepared in accordance with ICH E2C(R2) guidelines.`),
        sectionHeading('2. Worldwide Marketing Authorization Status'),
        bodyPara(`${data.product} is currently authorized in multiple jurisdictions. Refer to Annex I for the complete list of marketing authorizations.`),
        sectionHeading('3. Estimated Exposure'),
        bodyPara(`Cumulative patient exposure data is summarized in Annex II. During this reporting period, exposure estimates were derived from sales data and clinical trial enrollment.`),
        sectionHeading('4. Summary of Safety Data'),
        simpleTable(['Metric', 'Count'], [
          ['Total Cases Received', String(data.totalCases)],
          ['Serious Cases', String(data.seriousCases)],
          ['Fatal Cases', String(data.fatalCases)],
          ['Non-Serious Cases', String(data.totalCases - data.seriousCases)],
        ]),
        sectionHeading('5. Signal Evaluation'),
        bodyPara('The following signals were evaluated during this reporting period:'),
        simpleTable(['Signal', 'Evaluation Status', 'Action Taken'],
          data.signalsSummary.map(s => [s.signal, s.status, s.action])
        ),
        sectionHeading('6. Benefit-Risk Evaluation'),
        bodyPara(data.benefitRiskConclusion),
        sectionHeading('7. Conclusion'),
        bodyPara(`Based on the cumulative review of safety data during the reporting period ${data.reportingPeriod}, the benefit-risk profile of ${data.product} remains favorable. No new safety signals were identified that would alter the current prescribing information.`),
        sectionHeading('8. Appendices'),
        bodyPara('Appendix A: Line listings of individual case safety reports'),
        bodyPara('Appendix B: Summary tabulations'),
        bodyPara('Appendix C: Clinical trial exposure data'),
        bodyPara('Appendix D: Literature search strategy and results'),
      ],
    }],
  });
  return packDoc(doc);
}

export async function generateCIOMS(data: {
  product: string; event: string; patient: { age: string; sex: string; weight?: string };
  seriousness: string; outcome: string; narrative: string; reporter: string;
}): Promise<Buffer> {
  const doc = new Document({
    sections: [{
      properties: { page: { margin: PAGE_MARGINS } },
      headers: { default: makeHeader('CIOMS I Form') },
      footers: { default: makeFooter() },
      children: [
        sectionHeading('CIOMS I — International Reporting Form'),
        simpleTable(['Field', 'Value'], [
          ['1. Patient Initials', 'XX'],
          ['1a. Country', 'US'],
          ['2. Date of Birth / Age', data.patient.age],
          ['3. Sex', data.patient.sex],
          ['4. Reaction Onset Date', ts()],
          ['5. Reaction Description', data.event],
          ['6. Seriousness', data.seriousness],
          ['7. Outcome', data.outcome],
          ['8. Suspect Drug', data.product],
          ['9. Daily Dose', 'As prescribed'],
          ['10. Route of Administration', 'Oral'],
          ['11. Therapy Dates', 'See narrative'],
          ['12. Indication', 'See narrative'],
          ['13. Dechallenge', 'N/A'],
          ['14. Rechallenge', 'N/A'],
          ['15. Concomitant Drugs', 'None reported'],
          ['16. Other Relevant History', 'See narrative'],
          ['17. Reporter', data.reporter],
        ]),
        sectionHeading('Narrative'),
        bodyPara(data.narrative),
        new Paragraph({ spacing: { before: 400 } }),
        bodyPara(`Date of this report: ${ts()}`),
        bodyPara('Sent to: EudraVigilance / FAERS'),
      ],
    }],
  });
  return packDoc(doc);
}

export async function generateExpeditedSafetyReport(data: {
  product: string; event: string; seriousness: string;
  reportingDeadline: string; daysRemaining: number;
  narrative: string; causality: string;
}): Promise<Buffer> {
  const doc = new Document({
    sections: [{
      properties: { page: { margin: PAGE_MARGINS } },
      headers: { default: makeHeader('Expedited Safety Report') },
      footers: { default: makeFooter() },
      children: [
        ...coverPage('Expedited Safety Report', `${data.seriousness === 'fatal' || data.seriousness === 'life_threatening' ? '7-Day' : '15-Day'} Report`, {
          Product: data.product, Event: data.event,
          Seriousness: data.seriousness, Causality: data.causality,
          'Reporting Deadline': data.reportingDeadline,
          'Days Remaining': String(data.daysRemaining),
        }),
        new Paragraph({ children: [], pageBreakBefore: true }),
        sectionHeading('1. Event Description'),
        bodyPara(data.narrative),
        sectionHeading('2. Seriousness Assessment'),
        bodyPara(`This event is classified as "${data.seriousness}" based on ICH E2A seriousness criteria.`),
        sectionHeading('3. Causality Assessment'),
        bodyPara(`Causality assessment per WHO-UMC criteria: ${data.causality}.`),
        sectionHeading('4. Regulatory Action Required'),
        bodyPara(`This report must be submitted within ${data.seriousness === 'fatal' || data.seriousness === 'life_threatening' ? '7 calendar days' : '15 calendar days'} of initial receipt per ICH E2A and regional regulations.`),
        bodyPara(`Reporting deadline: ${data.reportingDeadline}. Days remaining: ${data.daysRemaining}.`),
      ],
    }],
  });
  return packDoc(doc);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLINICAL OPERATIONS DOCUMENT ARTIFACTS
// ═══════════════════════════════════════════════════════════════════════════════

export async function generateProtocolSynopsis(data: {
  protocolId: string; title: string; phase: string; sponsor: string;
  therapeuticArea: string; indication: string;
  primaryEndpoint: string; secondaryEndpoints: string[];
  targetEnrollment: number; sites: number; duration: string;
  studyDesign: string; population: string;
}): Promise<Buffer> {
  const doc = new Document({
    sections: [{
      properties: { page: { margin: PAGE_MARGINS } },
      headers: { default: makeHeader('Protocol Synopsis') },
      footers: { default: makeFooter() },
      children: [
        ...coverPage('Clinical Study Protocol Synopsis', data.protocolId, {
          Sponsor: data.sponsor, Phase: data.phase,
          'Therapeutic Area': data.therapeuticArea,
        }),
        new Paragraph({ children: [], pageBreakBefore: true }),
        sectionHeading('Protocol Synopsis'),
        simpleTable(['Element', 'Description'], [
          ['Protocol Number', data.protocolId],
          ['Study Title', data.title],
          ['Phase', data.phase],
          ['Sponsor', data.sponsor],
          ['Indication', data.indication],
          ['Study Design', data.studyDesign],
          ['Study Population', data.population],
          ['Target Enrollment', `${data.targetEnrollment} subjects across ${data.sites} sites`],
          ['Study Duration', data.duration],
          ['Primary Endpoint', data.primaryEndpoint],
          ['Secondary Endpoints', data.secondaryEndpoints.join('; ')],
        ]),
        sectionHeading('Study Objectives'),
        bodyPara(`Primary: To evaluate the ${data.primaryEndpoint} in patients with ${data.indication}.`),
        bodyPara(`Secondary: ${data.secondaryEndpoints.map((e, i) => `(${i + 1}) ${e}`).join('. ')}.`),
        sectionHeading('Study Design'),
        bodyPara(data.studyDesign),
        sectionHeading('Statistical Considerations'),
        bodyPara(`A sample size of ${data.targetEnrollment} subjects is planned to provide adequate statistical power for the primary endpoint analysis.`),
      ],
    }],
  });
  return packDoc(doc);
}

export async function generateMonitoringVisitReport(data: {
  protocolId: string; siteId: string; siteName: string;
  visitType: string; visitDate: string; monitorName: string;
  findings: { category: string; finding: string; severity: string; action: string }[];
  enrollmentStatus: { enrolled: number; target: number; screenFailures: number };
  overallAssessment: string;
}): Promise<Buffer> {
  const doc = new Document({
    sections: [{
      properties: { page: { margin: PAGE_MARGINS } },
      headers: { default: makeHeader('Monitoring Visit Report') },
      footers: { default: makeFooter() },
      children: [
        ...coverPage('Monitoring Visit Report', `${data.visitType} Visit`, {
          Protocol: data.protocolId, Site: `${data.siteId} — ${data.siteName}`,
          'Visit Date': data.visitDate, Monitor: data.monitorName,
        }),
        new Paragraph({ children: [], pageBreakBefore: true }),
        sectionHeading('1. Visit Summary'),
        simpleTable(['Item', 'Detail'], [
          ['Visit Type', data.visitType],
          ['Visit Date', data.visitDate],
          ['Monitor', data.monitorName],
          ['Site', `${data.siteId} — ${data.siteName}`],
        ]),
        sectionHeading('2. Enrollment Status'),
        simpleTable(['Metric', 'Count'], [
          ['Enrolled', String(data.enrollmentStatus.enrolled)],
          ['Target', String(data.enrollmentStatus.target)],
          ['Screen Failures', String(data.enrollmentStatus.screenFailures)],
          ['Enrollment Rate', `${Math.round((data.enrollmentStatus.enrolled / data.enrollmentStatus.target) * 100)}%`],
        ]),
        sectionHeading('3. Findings'),
        ...(data.findings.length > 0 ? [
          simpleTable(['Category', 'Finding', 'Severity', 'Action Required'],
            data.findings.map(f => [f.category, f.finding, f.severity, f.action])
          ),
        ] : [bodyPara('No findings identified during this visit.')]),
        sectionHeading('4. Overall Site Assessment'),
        bodyPara(data.overallAssessment),
        sectionHeading('5. Next Visit'),
        bodyPara('Next monitoring visit to be scheduled per monitoring plan. Follow-up on any open action items.'),
      ],
    }],
  });
  return packDoc(doc);
}

export async function generateDeviationReport(data: {
  protocolId: string; deviationId: string; category: string;
  severity: string; description: string; rootCause: string;
  correctiveAction: string; preventiveAction: string;
  impactAssessment: string; reportedBy: string; reportedDate: string;
}): Promise<Buffer> {
  const doc = new Document({
    sections: [{
      properties: { page: { margin: PAGE_MARGINS } },
      headers: { default: makeHeader('Protocol Deviation Report') },
      footers: { default: makeFooter() },
      children: [
        ...coverPage('Protocol Deviation Report', `Deviation ${data.deviationId}`, {
          Protocol: data.protocolId, Category: data.category,
          Severity: data.severity, 'Reported Date': data.reportedDate,
        }),
        new Paragraph({ children: [], pageBreakBefore: true }),
        sectionHeading('1. Deviation Details'),
        simpleTable(['Field', 'Value'], [
          ['Deviation ID', data.deviationId],
          ['Protocol', data.protocolId],
          ['Category', data.category],
          ['Severity', data.severity],
          ['Reported By', data.reportedBy],
          ['Date Reported', data.reportedDate],
        ]),
        sectionHeading('2. Description'),
        bodyPara(data.description),
        sectionHeading('3. Root Cause Analysis'),
        bodyPara(data.rootCause),
        sectionHeading('4. Impact Assessment'),
        bodyPara(data.impactAssessment),
        sectionHeading('5. Corrective Action (CA)'),
        bodyPara(data.correctiveAction),
        sectionHeading('6. Preventive Action (PA)'),
        bodyPara(data.preventiveAction),
        sectionHeading('7. Approval'),
        bodyPara('PI Signature: ____________________________'),
        bodyPara('Sponsor Acknowledgment: ____________________________'),
        bodyPara(`Date: ${ts()}`),
      ],
    }],
  });
  return packDoc(doc);
}

export async function generateEnrollmentReport(data: {
  protocolId: string; title: string; phase: string;
  sites: { id: string; name: string; enrolled: number; target: number; screenFailures: number; status: string }[];
  totalEnrolled: number; totalTarget: number; projectedCompletion: string;
}): Promise<Buffer> {
  const doc = new Document({
    sections: [{
      properties: { page: { margin: PAGE_MARGINS } },
      headers: { default: makeHeader('Enrollment Report') },
      footers: { default: makeFooter() },
      children: [
        ...coverPage('Enrollment Status Report', data.protocolId, {
          Study: data.title, Phase: data.phase,
          'Total Enrolled': `${data.totalEnrolled} / ${data.totalTarget} (${Math.round((data.totalEnrolled / data.totalTarget) * 100)}%)`,
          'Projected Completion': data.projectedCompletion,
        }),
        new Paragraph({ children: [], pageBreakBefore: true }),
        sectionHeading('1. Overall Enrollment Summary'),
        simpleTable(['Metric', 'Value'], [
          ['Total Enrolled', String(data.totalEnrolled)],
          ['Total Target', String(data.totalTarget)],
          ['Enrollment Rate', `${Math.round((data.totalEnrolled / data.totalTarget) * 100)}%`],
          ['Active Sites', String(data.sites.filter(s => s.status === 'active').length)],
          ['Projected Completion', data.projectedCompletion],
        ]),
        sectionHeading('2. Site-Level Enrollment'),
        simpleTable(
          ['Site ID', 'Site Name', 'Enrolled', 'Target', 'Rate', 'Screen Failures', 'Status'],
          data.sites.map(s => [
            s.id, s.name, String(s.enrolled), String(s.target),
            `${Math.round((s.enrolled / s.target) * 100)}%`,
            String(s.screenFailures), s.status,
          ])
        ),
        sectionHeading('3. Recommendations'),
        bodyPara('Sites performing below 50% enrollment rate should receive enhanced recruitment support. Consider additional site activation for sites in the pipeline.'),
      ],
    }],
  });
  return packDoc(doc);
}
