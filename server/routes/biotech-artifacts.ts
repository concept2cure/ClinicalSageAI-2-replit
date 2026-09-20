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
import { serverError } from '../lib/api-response';
import { createScopedLogger } from '../utils/logger';

const router = Router();

const logger = createScopedLogger('biotech-artifacts');

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

/* ── Required-field validation ───────────────────────────────────────────────
 * 2026-09-10. Every handler in this file used to fill missing input with a
 * default, 78 sites in all, and the defaults were not neutral — each judgement
 * field defaulted to the FAVOURABLE value:
 *
 *   pv/icsr                seriousness || 'non_serious'   causality || 'possible'
 *                          reporterType || 'physician'    product || 'Unknown Product'
 *   pv/psur                benefitRiskConclusion || 'The benefit-risk profile
 *                                                     remains favorable.'
 *                          totalCases/seriousCases/fatalCases ?? 0
 *   clinical/deviation     severity || 'Minor'
 *                          impactAssessment || 'No impact on subject safety or
 *                                               data integrity.'
 *   clinical/monitoring    overallAssessment || 'Site is performing within
 *                                                acceptable parameters.'
 *   ectd/cover-letter      applicationNumber || 'IND-000000'
 *
 * The ICSR default is the sharpest: biotech-artifact-generator.ts writes
 * `<serious>` as `seriousness === 'non_serious' ? '2' : '1'`, and E2B(R3) code 2
 * IS non-serious — so an omitted seriousness produced an XML addressed to
 * EudraVigilance classifying the case as non-serious, which is the field that
 * decides whether a 15-day expedited report is owed.
 *
 * These are regulated documents a user downloads and files. A missing clinical
 * fact is not a formatting gap to paper over; it is a reason not to produce the
 * document. Handlers now collect EVERY missing field and answer 400 naming all
 * of them, so a caller fixes one round-trip rather than ten.
 *
 * A field stays defaulted only where the value is genuinely system-assigned
 * (a generated deviation id) — never where it states a fact, a count, a
 * judgement, or an identifier of a real submission.
 */
/**
 * Accepted `seriousness` values for an E2B(R3) ICSR.
 *
 * The generator writes `<serious>` as
 *   data.seriousness === 'non_serious' ? '2' : '1'
 * — a binary on one exact string, where E2B code 1 is serious and 2 is
 * non-serious. So ANY unrecognised value silently means "serious", and the one
 * recognised value is the non-serious branch. That is too sharp an edge to
 * leave open to free text: the list is closed and an unknown value is a 400.
 */
const ICSR_SERIOUSNESS = [
  'non_serious',
  'death',
  'life_threatening',
  'hospitalization',
  'disability',
  'congenital_anomaly',
  'other_medically_important',
] as const;

class MissingFieldsError extends Error {
  constructor(readonly fields: string[]) {
    super(`Missing required field(s): ${fields.join(', ')}`);
    this.name = 'MissingFieldsError';
  }
}

/**
 * Return `data` narrowed to the required keys, or throw listing every absent
 * one. Absent means undefined, null, or an empty/whitespace string — but NOT
 * `0`, `false` or `[]`, each of which is a real answer a caller may intend
 * (zero fatal cases, an empty findings list).
 */
function requireFields<T extends Record<string, unknown>>(
  data: T,
  fields: readonly string[]
): T {
  const missing = fields.filter(f => {
    const v = data?.[f];
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  });
  if (missing.length > 0) throw new MissingFieldsError(missing);
  return data;
}

/** 400 with every missing field named, or rethrow. */
function handleArtifactError(
  res: Response,
  err: unknown,
  what: string,
  documentType: string
) {
  if (err instanceof MissingFieldsError) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_REQUIRED_FIELDS',
        documentType,
        missingFields: err.fields,
        message:
          `Cannot generate a ${documentType}: ${err.fields.length} required field(s) were not ` +
          `supplied — ${err.fields.join(', ')}. These carry the document's factual content, and ` +
          `no default is substituted for them. No document was produced.`,
      },
    });
  }
  return serverError(res, logger, what, err);
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
    // applicationNumber defaulted to 'IND-000000' — a fabricated IND number in
    // a letter addressed to a regulator.
    const { applicant, product, applicationNumber, submissionType, sequence, region } =
      requireFields(req.body, [
        'applicant', 'product', 'applicationNumber', 'submissionType', 'sequence', 'region',
      ]);
    const buffer = await generateECTDCoverLetter({
      applicant, product, applicationNumber, submissionType, sequence, region,
    });
    sendDocx(res, buffer, `eCTD_Cover_Letter_${sequence}_${new Date().toISOString().split('T')[0]}.docx`);
  } catch (err: unknown) {
    return handleArtifactError(res, err, 'saving cover letter', 'eCTD cover letter');
  }
});

/** POST /api/biotech-artifacts/ectd/validation-report */
router.post('/ectd/validation-report', async (req: Request, res: Response) => {
  try {
    // `errors`/`warnings` are required rather than defaulted to []: an empty
    // list is the report's central claim ("this sequence validated clean"), and
    // a caller who means it must say so.
    const { sequence, submissionType, region, errors, warnings } =
      requireFields(req.body, ['sequence', 'submissionType', 'region', 'errors', 'warnings']);
    const buffer = await generateECTDValidationReport({
      sequence, submissionType, region, errors, warnings,
    });
    sendDocx(res, buffer, `eCTD_Validation_Report_${sequence}_${new Date().toISOString().split('T')[0]}.docx`);
  } catch (err: unknown) {
    return handleArtifactError(res, err, 'saving validation report', 'eCTD validation report');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHARMACOVIGILANCE ARTIFACT ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/** POST /api/biotech-artifacts/pv/icsr */
router.post('/pv/icsr', (req: Request, res: Response) => {
  try {
    // Every field below is E2B(R3) case content. `seriousness` in particular
    // drives <serious>, and therefore whether a 15-day expedited report is
    // owed; it must come from the reporter, never from this handler.
    // patientAge stays optional — E2B permits an unknown age.
    const data = requireFields(req.body, [
      'safetyReportId', 'product', 'event', 'seriousness', 'outcome',
      'causality', 'reporterType', 'country', 'narrativeText',
    ]);
    if (!ICSR_SERIOUSNESS.includes(data.seriousness)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_SERIOUSNESS',
          message:
            `seriousness must be one of ${ICSR_SERIOUSNESS.join(', ')}. The generator maps ` +
            `anything other than 'non_serious' to E2B <serious>1</serious> (serious), so an ` +
            `unrecognised value would silently classify the case.`,
        },
      });
    }
    const xml = generateICSR_E2BR3({
      safetyReportId: data.safetyReportId,
      product: data.product,
      event: data.event,
      seriousness: data.seriousness,
      outcome: data.outcome,
      causality: data.causality,
      reporterType: data.reporterType,
      country: data.country,
      patientAge: data.patientAge,
      narrativeText: data.narrativeText,
    });
    sendXml(res, xml, `ICSR_E2B_R3_${data.safetyReportId}.xml`);
  } catch (err: unknown) {
    return handleArtifactError(res, err, 'saving icsr', 'E2B(R3) ICSR');
  }
});

/** POST /api/biotech-artifacts/pv/psur */
router.post('/pv/psur', async (req: Request, res: Response) => {
  try {
    // benefitRiskConclusion is the PSUR's conclusion. It defaulted to "The
    // benefit-risk profile remains favorable." — the report's most consequential
    // sentence, asserted by omission. The three case counts defaulted to 0,
    // which reads as "no cases in the period" rather than "not supplied".
    const data = requireFields(req.body, [
      'product', 'reportingPeriod', 'sponsor', 'totalCases', 'seriousCases',
      'fatalCases', 'signalsSummary', 'benefitRiskConclusion',
    ]);
    const buffer = await generatePSURReport({
      product: data.product,
      reportingPeriod: data.reportingPeriod,
      sponsor: data.sponsor,
      totalCases: data.totalCases,
      seriousCases: data.seriousCases,
      fatalCases: data.fatalCases,
      signalsSummary: data.signalsSummary,
      benefitRiskConclusion: data.benefitRiskConclusion,
    });
    sendDocx(res, buffer, `PSUR_PBRER_${data.product}_${new Date().toISOString().split('T')[0]}.docx`);
  } catch (err: unknown) {
    return handleArtifactError(res, err, 'saving PSUR', 'PSUR/PBRER');
  }
});

/** POST /api/biotech-artifacts/pv/cioms */
router.post('/pv/cioms', async (req: Request, res: Response) => {
  try {
    const data = requireFields(req.body, [
      'product', 'event', 'patient', 'seriousness', 'outcome', 'narrative', 'reporter',
    ]);
    const buffer = await generateCIOMS({
      product: data.product,
      event: data.event,
      patient: data.patient,
      seriousness: data.seriousness,
      outcome: data.outcome,
      narrative: data.narrative,
      reporter: data.reporter,
    });
    sendDocx(res, buffer, `CIOMS_I_${data.product}_${new Date().toISOString().split('T')[0]}.docx`);
  } catch (err: unknown) {
    return handleArtifactError(res, err, 'saving cioms', 'CIOMS I form');
  }
});

/** POST /api/biotech-artifacts/pv/expedited-report */
router.post('/pv/expedited-report', async (req: Request, res: Response) => {
  try {
    // seriousness defaulted to 'hospitalization' — inventing WHICH ICH E2A
    // seriousness criterion the case met — and reportingDeadline defaulted to
    // today + 15 days, inventing a regulatory clock from the moment the button
    // was pressed rather than from the sponsor's awareness date.
    const data = requireFields(req.body, [
      'product', 'event', 'seriousness', 'reportingDeadline',
      'daysRemaining', 'narrative', 'causality',
    ]);
    const buffer = await generateExpeditedSafetyReport({
      product: data.product,
      event: data.event,
      seriousness: data.seriousness,
      reportingDeadline: data.reportingDeadline,
      daysRemaining: data.daysRemaining,
      narrative: data.narrative,
      causality: data.causality,
    });
    sendDocx(res, buffer, `Expedited_Safety_Report_${new Date().toISOString().split('T')[0]}.docx`);
  } catch (err: unknown) {
    return handleArtifactError(res, err, 'saving expedited report', 'expedited safety report');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CLINICAL OPERATIONS ARTIFACT ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/** POST /api/biotech-artifacts/clinical/protocol-synopsis */
router.post('/clinical/protocol-synopsis', async (req: Request, res: Response) => {
  try {
    // Thirteen defaults made a complete oncology protocol — Phase II, 200
    // patients, 15 sites, ORR primary with PFS/OS/DoR secondaries, randomized
    // double-blind placebo-controlled — for a caller who supplied nothing.
    const data = requireFields(req.body, [
      'protocolId', 'title', 'phase', 'sponsor', 'therapeuticArea', 'indication',
      'primaryEndpoint', 'secondaryEndpoints', 'targetEnrollment', 'sites',
      'duration', 'studyDesign', 'population',
    ]);
    const buffer = await generateProtocolSynopsis({
      protocolId: data.protocolId,
      title: data.title,
      phase: data.phase,
      sponsor: data.sponsor,
      therapeuticArea: data.therapeuticArea,
      indication: data.indication,
      primaryEndpoint: data.primaryEndpoint,
      secondaryEndpoints: data.secondaryEndpoints,
      targetEnrollment: data.targetEnrollment,
      sites: data.sites,
      duration: data.duration,
      studyDesign: data.studyDesign,
      population: data.population,
    });
    sendDocx(res, buffer, `Protocol_Synopsis_${data.protocolId}_${new Date().toISOString().split('T')[0]}.docx`);
  } catch (err: unknown) {
    return handleArtifactError(res, err, 'saving protocol synopsis', 'protocol synopsis');
  }
});

/** POST /api/biotech-artifacts/clinical/monitoring-report */
router.post('/clinical/monitoring-report', async (req: Request, res: Response) => {
  try {
    // overallAssessment defaulted to "Site is performing within acceptable
    // parameters." — a monitor's conclusion, written by the absence of one.
    // monitorName defaulted to the literal 'CRA Name', attributing a GCP
    // monitoring record to nobody.
    const data = requireFields(req.body, [
      'protocolId', 'siteId', 'siteName', 'visitType', 'visitDate',
      'monitorName', 'findings', 'enrollmentStatus', 'overallAssessment',
    ]);
    const buffer = await generateMonitoringVisitReport({
      protocolId: data.protocolId,
      siteId: data.siteId,
      siteName: data.siteName,
      visitType: data.visitType,
      visitDate: data.visitDate,
      monitorName: data.monitorName,
      findings: data.findings,
      enrollmentStatus: data.enrollmentStatus,
      overallAssessment: data.overallAssessment,
    });
    sendDocx(res, buffer, `Monitoring_Visit_Report_${data.siteId}_${new Date().toISOString().split('T')[0]}.docx`);
  } catch (err: unknown) {
    return handleArtifactError(res, err, 'saving monitoring report', 'monitoring visit report');
  }
});

/** POST /api/biotech-artifacts/clinical/deviation-report */
router.post('/clinical/deviation-report', async (req: Request, res: Response) => {
  try {
    // severity defaulted to 'Minor' and impactAssessment to "No impact on
    // subject safety or data integrity." Those two fields are the whole point
    // of a GCP deviation record, and both defaulted to the benign answer.
    // deviationId keeps its default: an identifier this system legitimately
    // assigns is not a claim about the deviation.
    const data = requireFields(req.body, [
      'protocolId', 'category', 'severity', 'description', 'rootCause',
      'correctiveAction', 'preventiveAction', 'impactAssessment',
      'reportedBy', 'reportedDate',
    ]);
    const deviationId = data.deviationId || `DEV-${Date.now()}`;
    const buffer = await generateDeviationReport({
      protocolId: data.protocolId,
      deviationId,
      category: data.category,
      severity: data.severity,
      description: data.description,
      rootCause: data.rootCause,
      correctiveAction: data.correctiveAction,
      preventiveAction: data.preventiveAction,
      impactAssessment: data.impactAssessment,
      reportedBy: data.reportedBy,
      reportedDate: data.reportedDate,
    });
    sendDocx(res, buffer, `Deviation_Report_${deviationId}_${new Date().toISOString().split('T')[0]}.docx`);
  } catch (err: unknown) {
    return handleArtifactError(res, err, 'saving deviation report', 'protocol deviation report');
  }
});

/** POST /api/biotech-artifacts/clinical/enrollment-report */
router.post('/clinical/enrollment-report', async (req: Request, res: Response) => {
  try {
    const data = requireFields(req.body, [
      'protocolId', 'title', 'phase', 'sites', 'totalEnrolled',
      'totalTarget', 'projectedCompletion',
    ]);
    const buffer = await generateEnrollmentReport({
      protocolId: data.protocolId,
      title: data.title,
      phase: data.phase,
      sites: data.sites,
      totalEnrolled: data.totalEnrolled,
      totalTarget: data.totalTarget,
      projectedCompletion: data.projectedCompletion,
    });
    sendDocx(res, buffer, `Enrollment_Report_${data.protocolId}_${new Date().toISOString().split('T')[0]}.docx`);
  } catch (err: unknown) {
    return handleArtifactError(res, err, 'saving enrollment report', 'enrollment status report');
  }
});

export default router;
