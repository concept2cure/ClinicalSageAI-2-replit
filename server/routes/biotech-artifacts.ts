/**
 * Biotech Document Artifact Routes
 *
 * Generates, downloads, and manages regulatory document artifacts.
 * Integrates with Vault DMS, inline editor, and project task management.
 *
 * Every artifact can be:
 *  1. Generated (DOCX/PDF/XML)
 *  2. Downloaded
 *  3. Saved to Vault
 *  4. Opened in inline document editor
 *  5. Linked to a project task
 */

import { Router, Request, Response } from 'express';
import {
  generateECTDCoverLetter,
  generateECTDValidationReport,
  generateICSR_E2BR3,
  generatePSURReport,
  generateCIOMS,
  generateExpeditedSafetyReport,
  generateProtocolSynopsis,
  generateMonitoringVisitReport,
  generateDeviationReport,
  generateEnrollmentReport,
} from '../services/biotech-artifact-generator';

const router = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

function sendDocx(res: Response, buffer: Buffer, filename: string) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  res.send(buffer);
}

function sendXml(res: Response, xml: string, filename: string) {
  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(xml);
}

function sendJson(res: Response, data: unknown) {
  res.json({ success: true, data });
}

// ─── Artifact Catalog ───────────────────────────────────────────────────────

/** GET /api/biotech-artifacts/catalog — list all available document types */
router.get('/catalog', (_req: Request, res: Response) => {
  sendJson(res, {
    categories: [
      {
        id: 'ectd',
        name: 'eCTD Submissions',
        icon: 'Package',
        documents: [
          { id: 'ectd-cover-letter', name: 'Cover Letter', format: 'docx', description: 'eCTD submission cover letter with module summary' },
          { id: 'ectd-validation-report', name: 'Validation Report', format: 'docx', description: 'Technical validation results with error/warning details' },
        ],
      },
      {
        id: 'pharmacovigilance',
        name: 'Pharmacovigilance',
        icon: 'ShieldAlert',
        documents: [
          { id: 'icsr-e2b-r3', name: 'ICSR (E2B R3)', format: 'xml', description: 'Individual Case Safety Report per ICH E2B(R3)' },
          { id: 'psur-pbrer', name: 'PSUR/PBRER', format: 'docx', description: 'Periodic Safety Update Report per ICH E2C(R2)' },
          { id: 'cioms-form', name: 'CIOMS I Form', format: 'docx', description: 'Council for International Organizations of Medical Sciences Form I' },
          { id: 'expedited-report', name: 'Expedited Safety Report', format: 'docx', description: '7-day or 15-day expedited safety report per ICH E2A' },
        ],
      },
      {
        id: 'clinical-operations',
        name: 'Clinical Operations',
        icon: 'Stethoscope',
        documents: [
          { id: 'protocol-synopsis', name: 'Protocol Synopsis', format: 'docx', description: 'Clinical study protocol summary with endpoints and design' },
          { id: 'monitoring-visit-report', name: 'Monitoring Visit Report', format: 'docx', description: 'CRA site monitoring visit findings and assessment' },
          { id: 'deviation-report', name: 'Protocol Deviation Report', format: 'docx', description: 'Deviation description with root cause and CAPA' },
          { id: 'enrollment-report', name: 'Enrollment Status Report', format: 'docx', description: 'Site-level enrollment tracking with projections' },
        ],
      },
    ],
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// eCTD ARTIFACT ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/** POST /api/biotech-artifacts/ectd/cover-letter */
router.post('/ectd/cover-letter', async (req: Request, res: Response) => {
  try {
    const { applicant, product, applicationNumber, submissionType, sequence, region } = req.body;
    const buffer = await generateECTDCoverLetter({
      applicant: applicant || 'Concept2Cure Inc.',
      product: product || 'Investigational Product',
      applicationNumber: applicationNumber || 'IND-000000',
      submissionType: submissionType || 'Initial',
      sequence: sequence || '0001',
      region: region || 'us',
    });
    sendDocx(res, buffer, `eCTD_Cover_Letter_${sequence || '0001'}_${new Date().toISOString().split('T')[0]}.docx`);
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: 'Failed to generate cover letter', detail: String(err) });
  }
});

/** POST /api/biotech-artifacts/ectd/validation-report */
router.post('/ectd/validation-report', async (req: Request, res: Response) => {
  try {
    const { sequence, submissionType, region, errors, warnings } = req.body;
    const buffer = await generateECTDValidationReport({
      sequence: sequence || '0001',
      submissionType: submissionType || 'Initial',
      region: region || 'us',
      errors: errors || [],
      warnings: warnings || [],
    });
    sendDocx(res, buffer, `eCTD_Validation_Report_${sequence || '0001'}_${new Date().toISOString().split('T')[0]}.docx`);
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: 'Failed to generate validation report', detail: String(err) });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHARMACOVIGILANCE ARTIFACT ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/** POST /api/biotech-artifacts/pv/icsr */
router.post('/pv/icsr', (req: Request, res: Response) => {
  try {
    const data = req.body;
    const xml = generateICSR_E2BR3({
      safetyReportId: data.safetyReportId || `ICSR-${Date.now()}`,
      product: data.product || 'Unknown Product',
      event: data.event || 'Adverse Event',
      seriousness: data.seriousness || 'non_serious',
      outcome: data.outcome || 'unknown',
      causality: data.causality || 'possible',
      reporterType: data.reporterType || 'physician',
      country: data.country || 'US',
      patientAge: data.patientAge,
      narrativeText: data.narrativeText || 'Case narrative pending.',
    });
    sendXml(res, xml, `ICSR_E2B_R3_${data.safetyReportId || Date.now()}.xml`);
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: 'Failed to generate ICSR', detail: String(err) });
  }
});

/** POST /api/biotech-artifacts/pv/psur */
router.post('/pv/psur', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const buffer = await generatePSURReport({
      product: data.product || 'Investigational Product',
      reportingPeriod: data.reportingPeriod || `${new Date().getFullYear() - 1} – ${new Date().getFullYear()}`,
      sponsor: data.sponsor || 'Concept2Cure Inc.',
      totalCases: data.totalCases ?? 0,
      seriousCases: data.seriousCases ?? 0,
      fatalCases: data.fatalCases ?? 0,
      signalsSummary: data.signalsSummary || [],
      benefitRiskConclusion: data.benefitRiskConclusion || 'The benefit-risk profile remains favorable.',
    });
    sendDocx(res, buffer, `PSUR_PBRER_${data.product || 'Product'}_${new Date().toISOString().split('T')[0]}.docx`);
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: 'Failed to generate PSUR', detail: String(err) });
  }
});

/** POST /api/biotech-artifacts/pv/cioms */
router.post('/pv/cioms', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const buffer = await generateCIOMS({
      product: data.product || 'Unknown Product',
      event: data.event || 'Adverse Event',
      patient: data.patient || { age: 'Unknown', sex: 'Unknown' },
      seriousness: data.seriousness || 'non_serious',
      outcome: data.outcome || 'unknown',
      narrative: data.narrative || 'Case narrative pending.',
      reporter: data.reporter || 'Healthcare Professional',
    });
    sendDocx(res, buffer, `CIOMS_I_${data.product || 'Product'}_${new Date().toISOString().split('T')[0]}.docx`);
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: 'Failed to generate CIOMS form', detail: String(err) });
  }
});

/** POST /api/biotech-artifacts/pv/expedited-report */
router.post('/pv/expedited-report', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const buffer = await generateExpeditedSafetyReport({
      product: data.product || 'Unknown Product',
      event: data.event || 'Serious Adverse Event',
      seriousness: data.seriousness || 'hospitalization',
      reportingDeadline: data.reportingDeadline || new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
      daysRemaining: data.daysRemaining ?? 15,
      narrative: data.narrative || 'Expedited report narrative pending.',
      causality: data.causality || 'possible',
    });
    sendDocx(res, buffer, `Expedited_Safety_Report_${new Date().toISOString().split('T')[0]}.docx`);
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: 'Failed to generate expedited report', detail: String(err) });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CLINICAL OPERATIONS ARTIFACT ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/** POST /api/biotech-artifacts/clinical/protocol-synopsis */
router.post('/clinical/protocol-synopsis', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const buffer = await generateProtocolSynopsis({
      protocolId: data.protocolId || 'PROTOCOL-001',
      title: data.title || 'Clinical Study Protocol',
      phase: data.phase || 'Phase II',
      sponsor: data.sponsor || 'Concept2Cure Inc.',
      therapeuticArea: data.therapeuticArea || 'Oncology',
      indication: data.indication || 'Treatment indication',
      primaryEndpoint: data.primaryEndpoint || 'Overall Response Rate (ORR)',
      secondaryEndpoints: data.secondaryEndpoints || ['Progression-Free Survival (PFS)', 'Overall Survival (OS)', 'Duration of Response (DoR)'],
      targetEnrollment: data.targetEnrollment ?? 200,
      sites: data.sites ?? 15,
      duration: data.duration || '24 months',
      studyDesign: data.studyDesign || 'Randomized, double-blind, placebo-controlled, parallel-group study.',
      population: data.population || 'Adult patients (≥18 years) with confirmed diagnosis.',
    });
    sendDocx(res, buffer, `Protocol_Synopsis_${data.protocolId || 'PROTOCOL-001'}_${new Date().toISOString().split('T')[0]}.docx`);
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: 'Failed to generate protocol synopsis', detail: String(err) });
  }
});

/** POST /api/biotech-artifacts/clinical/monitoring-report */
router.post('/clinical/monitoring-report', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const buffer = await generateMonitoringVisitReport({
      protocolId: data.protocolId || 'PROTOCOL-001',
      siteId: data.siteId || 'SITE-001',
      siteName: data.siteName || 'Clinical Research Center',
      visitType: data.visitType || 'Interim Monitoring Visit',
      visitDate: data.visitDate || new Date().toISOString().split('T')[0],
      monitorName: data.monitorName || 'CRA Name',
      findings: data.findings || [],
      enrollmentStatus: data.enrollmentStatus || { enrolled: 0, target: 20, screenFailures: 0 },
      overallAssessment: data.overallAssessment || 'Site is performing within acceptable parameters.',
    });
    sendDocx(res, buffer, `Monitoring_Visit_Report_${data.siteId || 'SITE'}_${new Date().toISOString().split('T')[0]}.docx`);
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: 'Failed to generate monitoring report', detail: String(err) });
  }
});

/** POST /api/biotech-artifacts/clinical/deviation-report */
router.post('/clinical/deviation-report', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const buffer = await generateDeviationReport({
      protocolId: data.protocolId || 'PROTOCOL-001',
      deviationId: data.deviationId || `DEV-${Date.now()}`,
      category: data.category || 'Procedural',
      severity: data.severity || 'Minor',
      description: data.description || 'Protocol deviation description.',
      rootCause: data.rootCause || 'Root cause analysis pending.',
      correctiveAction: data.correctiveAction || 'Corrective action details.',
      preventiveAction: data.preventiveAction || 'Preventive action details.',
      impactAssessment: data.impactAssessment || 'No impact on subject safety or data integrity.',
      reportedBy: data.reportedBy || 'Site Staff',
      reportedDate: data.reportedDate || new Date().toISOString().split('T')[0],
    });
    sendDocx(res, buffer, `Deviation_Report_${data.deviationId || 'DEV'}_${new Date().toISOString().split('T')[0]}.docx`);
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: 'Failed to generate deviation report', detail: String(err) });
  }
});

/** POST /api/biotech-artifacts/clinical/enrollment-report */
router.post('/clinical/enrollment-report', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const buffer = await generateEnrollmentReport({
      protocolId: data.protocolId || 'PROTOCOL-001',
      title: data.title || 'Clinical Study',
      phase: data.phase || 'Phase II',
      sites: data.sites || [],
      totalEnrolled: data.totalEnrolled ?? 0,
      totalTarget: data.totalTarget ?? 100,
      projectedCompletion: data.projectedCompletion || 'TBD',
    });
    sendDocx(res, buffer, `Enrollment_Report_${data.protocolId || 'PROTOCOL'}_${new Date().toISOString().split('T')[0]}.docx`);
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: 'Failed to generate enrollment report', detail: String(err) });
  }
});

export default router;
