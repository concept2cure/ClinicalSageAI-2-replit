// server/routes/analytics-routes.ts
import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import { assertUploadSafe, UploadSafetyError } from '../middleware/uploadSafety';
import path from 'path';
import { execFile } from 'child_process';
import util from 'util';
import { db } from '../db';
import { csrReports } from '../../shared/schema';
import { eq, and, like, count, sql, desc } from 'drizzle-orm';
import { protocolOptimizerService } from '../protocol-optimizer-service';
import { createScopedLogger } from '../utils/logger.js';
import { powerTwoSampleMeans } from '../services/stats/assurance';
import { csvRow } from '../utils/csv';
import { serverError } from '../lib/api-response';
import demoAnalysisRouter from './analytics-demo-analysis';

const log = createScopedLogger('analytics-routes');

// execFile does not invoke a shell, so arguments are passed verbatim with no
// shell parsing. Use this for any command that includes user-controlled input.
const execFilePromise = util.promisify(execFile);
const router = Router();

/**
 * Resolve the caller's organization id off the request. The auth/authBoundary
 * middleware populates one of these on every authenticated request; this mirrors
 * the org-scoping helper used by the org-scoped project routes
 * (e.g. design-controls.routes.ts). Returns null when there is no org context —
 * callers MUST then refuse to read tenant data (403) or scope to nothing, never
 * fall back to a cross-tenant query. csr_reports is org-scoped tenant data, so
 * every read of it in this module is scoped by this id.
 */
function getOrgId(req: import('express').Request): number | null {
  const r = req as unknown as {
    tenantId?: unknown;
    organizationId?: unknown;
    tenantContext?: { organizationId?: unknown };
    user?: { organizationId?: unknown };
  };
  const raw =
    r.tenantId ?? r.organizationId ?? r.tenantContext?.organizationId ?? r.user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

// Defensive cap on text passed to Python analyzers as a CLI argument.
const MAX_ANALYZER_TEXT_LENGTH = 1_000_000;

// Bounded options shared by analyzer subprocess calls (preserves prior defaults
// of a 10MB stdout buffer; adds a hard timeout to avoid hung processes).
const ANALYZER_EXEC_OPTIONS = { maxBuffer: 10 * 1024 * 1024, timeout: 120_000 };

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const extension = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + extension);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    // Accept only PDF and Word documents
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ];
    if (!allowedTypes.includes(file.mimetype)) {
      cb(new Error('Invalid file type. Only PDF and Word documents are allowed.'));
      return;
    }
    cb(null, true);
  },
});

// Route to handle protocol uploads
router.post('/upload-protocol', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    // SECURITY: magic-byte signature + AV scan (fail-closed in prod) before use.
    try {
      await assertUploadSafe(req.file.path, req.file.mimetype, req.file.originalname);
    } catch (err) {
      if (err instanceof UploadSafetyError) {
        try { fs.unlinkSync(req.file.path); } catch { /* best-effort cleanup */ }
        return res.status(err.status).json({ success: false, ...err.body });
      }
      throw err;
    }

    // Log file information for troubleshooting
    log.debug(
      `Processing protocol upload: ${req.file.originalname} (${req.file.mimetype}, ${req.file.size} bytes)`
    );

    const filePath = req.file.path;

    // Validate file size again as a double-check
    const stats = fs.statSync(filePath);
    if (stats.size > 10 * 1024 * 1024) {
      // 10MB limit
      fs.unlinkSync(filePath); // Clean up
      return res.status(400).json({
        success: false,
        message: 'File size exceeds the 10MB limit',
      });
    }

    // Extract text from the uploaded file
    let extractedText = '';

    if (req.file.mimetype === 'application/pdf') {
      // For PDF files, use the python script
      const scriptPath = path.join(process.cwd(), 'trialsage', 'extract_protocol.py');

      try {
        const { stdout } = await execFilePromise(
          'python3',
          [scriptPath, filePath],
          ANALYZER_EXEC_OPTIONS
        );
        extractedText = stdout;

        // Validate we got meaningful text
        if (extractedText.trim().length < 50) {
          throw new Error('Insufficient text extracted from PDF');
        }
      } catch (error) {
        log.error('PDF extraction error:', error);
        return serverError(res, log, 'uploading protocol', error);
      }
    } else if (
      [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
      ].includes(req.file.mimetype)
    ) {
      // For Word documents, use a more informative placeholder
      // In a full implementation, this would use a proper Word document parser
      extractedText = `Content extracted from Word document: ${req.file.originalname}. 
This is a placeholder for demonstration purposes. 
In a production environment, we would implement full Word document text extraction.
For best results, please use PDF format.`;
    } else {
      fs.unlinkSync(filePath); // Clean up
      return res.status(400).json({
        success: false,
        message: 'Unsupported file type. Only PDF and Word documents are allowed.',
      });
    }

    // Call the deep CSR analyzer
    const analyzerScriptPath = path.join(process.cwd(), 'trialsage', 'deep_csr_analyzer.py');
    let analysisOutput;

    try {
      // Pass extracted text as an argv element (no shell) to prevent command
      // injection. Truncate to a sane limit to avoid oversized argv.
      const analyzerText = extractedText.slice(0, MAX_ANALYZER_TEXT_LENGTH);
      const result = await execFilePromise(
        'python3',
        [analyzerScriptPath, analyzerText],
        ANALYZER_EXEC_OPTIONS
      );
      analysisOutput = result.stdout;
    } catch (error) {
      log.error('Analysis execution error:', error);
      return serverError(res, log, 'uploading protocol', error);
    }

    // Score the protocol confidence
    const confidenceScorerPath = path.join(process.cwd(), 'trialsage', 'confidence_scorer.py');
    let confidenceOutput;

    try {
      // Create a clean version of the text for confidence scoring
      const tempScoreFile = path.join(process.cwd(), 'temp', `score-${Date.now()}.txt`);
      fs.writeFileSync(tempScoreFile, extractedText);

      // Run a fixed inline program (no user input interpolated into source) and
      // pass the temp file path as an argv element read via sys.argv[1].
      const confidenceScript =
        'from trialsage.confidence_scorer import score_protocol; import json; import sys; print(json.dumps(score_protocol(open(sys.argv[1], "r").read())))';
      const scoreResult = await execFilePromise(
        'python3',
        ['-c', confidenceScript, tempScoreFile],
        ANALYZER_EXEC_OPTIONS
      );
      confidenceOutput = scoreResult.stdout;

      // Clean up temp file
      try {
        if (fs.existsSync(tempScoreFile)) {
          fs.unlinkSync(tempScoreFile);
        }
      } catch (e) {
        log.error('Error cleaning up temp file:', e);
      }
    } catch (error) {
      log.error('Confidence scoring error:', error);
      confidenceOutput = JSON.stringify({
        confidence_score: 0,
        issues: ['Error calculating confidence score'],
        verdict: 'Unable to assess protocol design',
      });
    }

    let analysisResult: ProtocolAnalysisResult;
    try {
      analysisResult = JSON.parse(analysisOutput);

      // Validate expected fields
      const requiredFields = [
        'risk_factors',
        'indication',
        'phase',
        'sample_size',
        'duration_weeks',
      ];
      const missingFields = requiredFields.filter(field => analysisResult[field] === undefined);

      if (missingFields.length > 0) {
        log.warn(`Analysis missing fields: ${missingFields.join(', ')}`);
      }
    } catch (error) {
      log.error('Error parsing analysis output:', error);
      analysisResult = {
        risk_factors: [],
        indication: '',
        phase: '',
        sample_size: 0,
        duration_weeks: 0,
        title: 'Untitled Protocol',
      };
    }

    // Find similar CSRs in the database
    const matchingCsrs = await findSimilarCsrs(
      analysisResult.indication || '',
      analysisResult.phase || '',
      getOrgId(req)
    );

    // Build the response
    const result = {
      success: true,
      title: analysisResult.title || 'Untitled Protocol',
      indication: analysisResult.indication || 'Unknown',
      phase: analysisResult.phase || 'Unknown',
      sample_size: analysisResult.sample_size || 0,
      duration_weeks: analysisResult.duration_weeks || 0,
      arms: analysisResult.arms || 0,
      primary_endpoint: analysisResult.primary_endpoint || '',
      risk_factors: analysisResult.risk_factors || [],
      matching_csrs: matchingCsrs,
      recommendations: generateRecommendations(analysisResult, matchingCsrs),
      statistical_insights: generateStatisticalInsights(analysisResult),
    };

    res.json(result);
  } catch (error) {
    log.error('Error processing protocol:', error);
    return serverError(res, log, 'uploading protocol', error);
  }
});

// Route to analyze pasted protocol text
router.post('/analyze-protocol-text', async (req, res) => {
  try {
    const { text } = req.body;

    // Validate the input
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ success: false, message: 'No text provided' });
    }

    if (text.trim().length < 50) {
      return res.status(400).json({
        success: false,
        message:
          'Text is too short for meaningful analysis. Please provide more detailed protocol text.',
      });
    }

    if (text.length > 100000) {
      // ~100KB limit for text input
      return res.status(400).json({
        success: false,
        message: 'Text exceeds maximum length limit. Please provide a more focused excerpt.',
      });
    }

    log.debug(`Processing protocol text analysis (${text.length} characters)`);

    // Save the text to a temporary file for processing
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempId = Date.now();
    const tempFilePath = path.join(tempDir, `protocol-${tempId}.txt`);

    try {
      fs.writeFileSync(tempFilePath, text);
    } catch (error) {
      log.error('Error saving temporary file:', error);
      return serverError(res, log, 'analysing protocol text', error);
    }

    // Call the deep CSR analyzer
    const analyzerScriptPath = path.join(process.cwd(), 'trialsage', 'deep_csr_analyzer.py');
    let analysisOutput;

    try {
      const result = await execFilePromise(
        'python3',
        [analyzerScriptPath, tempFilePath],
        ANALYZER_EXEC_OPTIONS
      );
      analysisOutput = result.stdout;
    } catch (error) {
      // Clean up temporary file
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch (e) {
        log.error('Error cleaning up temp file:', e);
      }

      log.error('Analysis execution error:', error);
      return serverError(res, log, 'analysing protocol text', error);
    }

    // Score the protocol confidence
    let confidenceOutput;
    try {
      const confidenceScript =
        'from trialsage.confidence_scorer import score_protocol; import json; import sys; print(json.dumps(score_protocol(open(sys.argv[1], "r").read())))';
      const scoreResult = await execFilePromise(
        'python3',
        ['-c', confidenceScript, tempFilePath],
        ANALYZER_EXEC_OPTIONS
      );
      confidenceOutput = scoreResult.stdout;
    } catch (error) {
      log.error('Confidence scoring error:', error);
      confidenceOutput = JSON.stringify({
        confidence_score: 0,
        issues: ['Error calculating confidence score'],
        verdict: 'Unable to assess protocol design',
      });
    }

    // Clean up temporary file
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    } catch (e) {
      log.error('Error cleaning up temp file:', e);
    }

    let analysisResult: ProtocolAnalysisResult;
    try {
      analysisResult = JSON.parse(analysisOutput);

      // Validate expected fields
      const requiredFields = [
        'risk_factors',
        'indication',
        'phase',
        'sample_size',
        'duration_weeks',
      ];
      const missingFields = requiredFields.filter(field => analysisResult[field] === undefined);

      if (missingFields.length > 0) {
        log.warn(`Analysis missing fields: ${missingFields.join(', ')}`);
      }
    } catch (error) {
      log.error('Error parsing analysis output:', error);
      analysisResult = {
        risk_factors: [],
        indication: '',
        phase: '',
        sample_size: 0,
        duration_weeks: 0,
        title: 'Untitled Protocol',
      };
    }

    // Find similar CSRs in the database
    const matchingCsrs = await findSimilarCsrs(
      analysisResult.indication || '',
      analysisResult.phase || '',
      getOrgId(req)
    );

    // Build the response
    const result = {
      success: true,
      title: analysisResult.title || 'Untitled Protocol',
      indication: analysisResult.indication || 'Unknown',
      phase: analysisResult.phase || 'Unknown',
      sample_size: analysisResult.sample_size || 0,
      duration_weeks: analysisResult.duration_weeks || 0,
      arms: analysisResult.arms || 0,
      primary_endpoint: analysisResult.primary_endpoint || '',
      risk_factors: analysisResult.risk_factors || [],
      matching_csrs: matchingCsrs,
      recommendations: generateRecommendations(analysisResult, matchingCsrs),
      statistical_insights: generateStatisticalInsights(analysisResult),
    };

    res.json(result);
  } catch (error) {
    log.error('Error analyzing protocol text:', error);
    return serverError(res, log, 'analysing protocol text', error);
  }
});

// Helper function to find similar CSRs
async function findSimilarCsrs(indication: string, phase: string, orgId: number | null) {
  try {
    // No org context → no tenant data. Never run an unscoped cross-tenant LIKE.
    if (!indication || orgId == null) return [];

    // Query the database for CSRs with similar indication and phase — STRICTLY
    // scoped to the caller's organization (csr_reports is tenant data).
    const reports = await db
      .select()
      .from(csrReports)
      .where(and(eq(csrReports.organizationId, orgId), like(csrReports.indication, `%${indication}%`)))
      .limit(5);

    // Only real, schema-backed fields are returned. The CSR index stores no
    // sample size, primary endpoint, study duration, or outcome for these rows,
    // so those are NOT fabricated here (previously hardcoded to 200 / 'Primary
    // endpoint' / 24 / success:true) — the recommendation and reference-study
    // sections downstream render only what we actually know. Likewise no
    // similarity score is asserted: this is a LIKE match on indication, not a
    // semantic-similarity engine (previously a `Math.random()` rank).
    return reports.map(report => ({
      id: `CSR_${report.id}`,
      title: report.title ?? '',
      sponsor: report.sponsor ?? '',
      indication: report.indication ?? '',
      phase: report.phase ?? '',
      similarity: null,
    }));
  } catch (error) {
    log.error('Error finding similar CSRs:', error);
    return [];
  }
}

// Define type for analysis result
interface ProtocolAnalysisResult {
  title?: string;
  indication?: string;
  phase?: string;
  sample_size?: number;
  duration_weeks?: number;
  arms?: number;
  primary_endpoint?: string;
  risk_factors?: Array<{
    description: string;
    severity: string;
    mitigation?: string;
  }>;
  [key: string]: any; // Allow for additional properties
}

// Define type for similar CSR
interface SimilarCSR {
  id: string;
  title: string | null;
  sponsor: string | null;
  indication: string | null;
  phase: string | null;
  // The CSR index stores no sample size, primary endpoint, duration, or outcome
  // for these rows, so those fields are intentionally absent rather than
  // fabricated. Similarity is null unless a real ranking engine sets it.
  similarity: number | null;
  [key: string]: any; // Allow for additional properties
}

// Helper function to generate recommendations based on analysis and similar CSRs
function generateRecommendations(
  analysis: ProtocolAnalysisResult,
  similarCsrs: SimilarCSR[]
): string {
  // Get timestamp for the analysis
  const timestamp = new Date().toISOString();

  // Count risk factors
  const riskCount = analysis.risk_factors?.length || 0;
  const highRiskCount =
    analysis.risk_factors?.filter(r => r.severity.toLowerCase() === 'high').length || 0;
  const mediumRiskCount =
    analysis.risk_factors?.filter(r => r.severity.toLowerCase() === 'medium').length || 0;

  // Begin building recommendations
  let recommendations = `# Protocol Design Recommendations\n`;
  recommendations += `Generated: ${new Date().toLocaleString()}\n\n`;
  recommendations += `Based on our analysis of your protocol "${analysis.title || 'Untitled'}" `;
  recommendations += `for ${analysis.indication || 'unspecified indication'} and comparison with `;
  recommendations += `${similarCsrs.length} similar studies, we offer the following evidence-based recommendations:\n\n`;

  // SECTION: Study Design
  recommendations += `## Study Design\n\n`;

  // Sample size recommendations. The CSR index does not store per-study sample
  // sizes, so we do NOT compare against a fabricated average (previously every
  // matched study was stamped with 200 participants). We report the proposed
  // size and point to the real, computed power breakdown in Statistical Insights.
  if (analysis.sample_size) {
    recommendations += `- **Sample Size:** Your protocol proposes ${analysis.sample_size} participants. `;
    recommendations += `See the Statistical Insights section for the power this yields against small, medium, and large effect sizes at α=0.05, and confirm the target with a formal power analysis for your primary endpoint.\n\n`;
  } else {
    recommendations += `- **Sample Size:** No sample size was specified in your protocol. We recommend conducting a formal power analysis.\n\n`;
  }

  // Duration recommendations. No per-study duration is stored for the matched
  // CSRs, so we do not invent an average to compare against (previously every
  // study was stamped with 24 weeks). Report the proposed duration and prompt a
  // clinical review of its adequacy.
  if (analysis.duration_weeks) {
    recommendations += `- **Study Duration:** Your protocol proposes ${analysis.duration_weeks} weeks. `;
    recommendations += `Confirm this allows enough time for the intervention to demonstrate its effect on the primary endpoint, accounting for onset of action and any required follow-up.\n\n`;
  } else {
    recommendations += `- **Study Duration:** No study duration was specified in your protocol. This is a critical parameter for planning and should be defined explicitly.\n\n`;
  }

  // SECTION: Risk Mitigation
  if (riskCount > 0) {
    recommendations += `## Risk Mitigation\n\n`;
    recommendations += `Your protocol has ${riskCount} identified risk factors (${highRiskCount} high, ${mediumRiskCount} medium severity).\n\n`;

    // List high risk items first
    const highRisks = analysis.risk_factors?.filter(r => r.severity.toLowerCase() === 'high') || [];
    if (highRisks.length > 0) {
      recommendations += `### High Priority\n`;
      highRisks.forEach((risk, index) => {
        recommendations += `${index + 1}. **${risk.description}**`;
        if (risk.mitigation) {
          recommendations += ` — Suggested mitigation: ${risk.mitigation}`;
        }
        recommendations += `\n`;
      });
      recommendations += `\n`;
    }

    // Then medium risks
    const mediumRisks =
      analysis.risk_factors?.filter(r => r.severity.toLowerCase() === 'medium') || [];
    if (mediumRisks.length > 0) {
      recommendations += `### Medium Priority\n`;
      mediumRisks.forEach((risk, index) => {
        recommendations += `${index + 1}. **${risk.description}**`;
        if (risk.mitigation) {
          recommendations += ` — Suggested mitigation: ${risk.mitigation}`;
        }
        recommendations += `\n`;
      });
      recommendations += `\n`;
    }
  }

  // SECTION: General Best Practices
  recommendations += `## General Best Practices\n\n`;
  recommendations += `- **Documentation:** Ensure clear documentation of inclusion/exclusion criteria with objective measures where possible.\n`;
  recommendations += `- **Adaptive Design:** Consider incorporating adaptive design elements to enhance efficiency and flexibility.\n`;
  recommendations += `- **Monitoring:** Implement robust data monitoring procedures with predefined stopping rules.\n`;
  recommendations += `- **Blinding:** Where applicable, maintain adequate blinding procedures to reduce bias.\n`;
  recommendations += `- **Endpoint Selection:** Ensure endpoints are validated, clinically meaningful, and measurable with precision.\n\n`;

  // SECTION: Similar Studies
  if (similarCsrs.length > 0) {
    recommendations += `## Reference Studies\n\n`;
    recommendations += `The following similar studies informed these recommendations:\n\n`;

    similarCsrs.slice(0, 3).forEach((study, index) => {
      recommendations += `${index + 1}. **${study.title}** (${study.id})\n`;
      if (study.sponsor) recommendations += `   - Sponsor: ${study.sponsor}\n`;
      recommendations += `   - Indication: ${study.indication}\n`;
      recommendations += `   - Phase: ${study.phase}\n`;
      // Sample size / duration are intentionally omitted: the CSR index does not
      // store them for these rows, and a fabricated value would misinform.
      if (study.similarity != null) {
        recommendations += `   - Similarity Score: ${(study.similarity * 100).toFixed(1)}%\n`;
      }
      recommendations += `\n`;
    });
  }

  // Add disclaimer
  recommendations += `---\n`;
  recommendations += `*These recommendations are generated based on historical clinical study data and should be reviewed by qualified clinical research professionals.*\n`;

  return recommendations;
}

// Helper function to generate statistical insights
function generateStatisticalInsights(analysis: ProtocolAnalysisResult): string {
  // Get timestamp for the analysis
  const timestamp = new Date().toISOString();

  let insights = `# Statistical Analysis Insights\n`;
  insights += `Generated: ${new Date().toLocaleString()}\n\n`;

  // Sample Size and Power
  if (analysis.sample_size) {
    insights += `## Sample Size and Power\n\n`;

    // Different effect sizes for more comprehensive guidance
    const effectSizes = [
      { size: 0.2, desc: 'small' },
      { size: 0.5, desc: 'medium' },
      { size: 0.8, desc: 'large' },
    ];

    insights += `### Power Analysis\n`;
    insights += `Estimated power for a two-group comparison of means at your proposed total sample size of ${analysis.sample_size} (assumed split evenly between arms), two-sided α=0.05, by standardized effect size (Cohen's d):\n\n`;

    // Real two-sample power (replaces a fabricated formula, previously
    // `Math.min(0.99, 0.4 + n*d/100)`). Delegates to the shared, tested stats
    // helper — total N split evenly → nPerArm = N/2, two-sided α=0.05.
    const nPerArm = (analysis.sample_size || 0) / 2;
    effectSizes.forEach(effect => {
      const power = powerTwoSampleMeans(effect.size, nPerArm, 0.05, false);
      insights += `- **${effect.desc.charAt(0).toUpperCase() + effect.desc.slice(1)} effect (d=${effect.size})**: ~${(power * 100).toFixed(1)}% power at α=0.05 (two-sided)\n`;
    });

    insights += `\n`;

    // Dropout considerations
    const estimatedDropout = Math.round((analysis.sample_size || 0) * 0.15); // Assume 15% dropout
    insights += `### Dropout Considerations\n`;
    insights += `- Based on typical dropout rates in ${analysis.indication || 'clinical'} studies, we recommend accounting for approximately 15% participant attrition.\n`;
    insights += `- Consider enrolling an additional ${estimatedDropout} participants (total: ${(analysis.sample_size || 0) + estimatedDropout}) to maintain statistical power after dropouts.\n\n`;
  }

  // Study Design Considerations
  insights += `## Study Design Considerations\n\n`;

  // Randomization
  insights += `### Randomization Strategy\n`;
  insights += `- For your ${analysis.phase ? `Phase ${analysis.phase}` : ''} study in ${analysis.indication || 'this indication'}, consider stratified randomization to balance important prognostic factors.\n`;
  insights += `- Key stratification variables might include: age groups, disease severity, and baseline biomarkers.\n\n`;

  // Interim Analysis
  insights += `### Interim Analysis\n`;
  insights += `- We recommend implementing interim analyses at 30% and 60% enrollment to assess safety and conditional power.\n`;
  insights += `- Consider using O'Brien-Fleming boundaries to control Type I error rate across multiple looks at the data.\n`;

  // Covariates and Adjustments
  insights += `### Statistical Model Considerations\n`;
  insights += `- Consider including the following covariates in your primary analysis: age, sex, disease duration, and baseline scores.\n`;
  insights += `- For time-to-event outcomes, ensure appropriate censoring mechanisms are defined.\n`;
  insights += `- For repeated measures, consider mixed-effects models to account for within-subject correlation.\n\n`;

  // Add disclaimer
  insights += `---\n`;
  insights += `*These statistical insights are general recommendations and should be reviewed by a qualified biostatistician.*\n`;

  return insights;
}

// The protocol-analysis demo endpoint lives in its own module: it is
// development-only (gated to non-production, ledger L167) and does not belong
// beside the analytics this file serves to production. Mounted here so the
// path it answers on is unchanged: POST /api/analytics/demo-analysis.
router.use(demoAnalysisRouter);

// Analytics dashboard endpoint
router.get('/dashboard', async (req, res) => {
  try {
    const { timeFrame, indication, phase } = req.query;

    // Tenant isolation: the dashboard aggregates csr_reports (org-scoped tenant
    // data), so every query below is scoped to the caller's org. No org context
    // → refuse rather than aggregate across tenants.
    const orgId = getOrgId(req);
    if (orgId === null) {
      return res.status(403).json({ error: 'Organization context required', code: 'ORG_REQUIRED' });
    }
    const orgScope = eq(csrReports.organizationId, orgId);

    // Query the database for analytics data based on filters
    const cohortData = await db
      .select({
        count: count(),
        indication: csrReports.indication,
        phase: csrReports.phase,
      })
      .from(csrReports)
      .where(orgScope)
      .groupBy(csrReports.indication, csrReports.phase);

    // Process the data for the dashboard
    const totalReports = cohortData.reduce((sum, item) => sum + Number(item.count), 0);

    // Build indications and phases for filters
    const indications = Array.from(
      new Set(cohortData.map(item => item.indication).filter(Boolean))
    );
    const phases = Array.from(new Set(cohortData.map(item => item.phase).filter(Boolean)));

    // Count reports by indication
    const reportsByIndication: Record<string, number> = {};
    cohortData.forEach(item => {
      if (item.indication) {
        reportsByIndication[item.indication] =
          (reportsByIndication[item.indication] || 0) + Number(item.count);
      }
    });

    // Count reports by phase
    const reportsByPhase: Record<string, number> = {};
    cohortData.forEach(item => {
      if (item.phase) {
        reportsByPhase[item.phase] = (reportsByPhase[item.phase] || 0) + Number(item.count);
      }
    });

    const uniqueIndications = indications.length;

    // Sponsor distribution from real data
    const sponsorRows = await db
      .select({
        name: csrReports.sponsor,
        count: count(),
      })
      .from(csrReports)
      .where(and(orgScope, sql`${csrReports.sponsor} IS NOT NULL`))
      .groupBy(csrReports.sponsor)
      .orderBy(desc(count()))
      .limit(10);
    const sponsorDistribution = sponsorRows.map(r => ({
      name: r.name!,
      count: Number(r.count),
    }));

    // Monthly trends from created_at timestamps
    const trendRows = await db
      .select({
        month: sql<string>`to_char(date_trunc('month', ${csrReports.createdAt}), 'Mon')`,
        count: count(),
      })
      .from(csrReports)
      .where(orgScope)
      .groupBy(sql`date_trunc('month', ${csrReports.createdAt})`)
      .orderBy(sql`date_trunc('month', ${csrReports.createdAt})`);
    const monthlyTrends = trendRows.map(r => ({
      month: r.month,
      count: Number(r.count),
    }));

    // Most common primary endpoints from real data
    const endpointRows = await db
      .select({
        name: csrReports.primaryEndpoint,
        count: count(),
      })
      .from(csrReports)
      .where(and(orgScope, sql`${csrReports.primaryEndpoint} IS NOT NULL`))
      .groupBy(csrReports.primaryEndpoint)
      .orderBy(desc(count()))
      .limit(8);
    const mostCommonEndpoints = endpointRows.map(r => ({
      name: r.name!,
      count: Number(r.count),
      successRate: 0,
    }));

    // Completion rates by phase — computed from status field
    const statusByPhaseRows = await db
      .select({
        phase: csrReports.phase,
        status: csrReports.status,
        count: count(),
      })
      .from(csrReports)
      .where(and(orgScope, sql`${csrReports.phase} IS NOT NULL`))
      .groupBy(csrReports.phase, csrReports.status);

    const phaseTotals: Record<string, { total: number; completed: number }> = {};
    for (const row of statusByPhaseRows) {
      const p = row.phase!;
      if (!phaseTotals[p]) phaseTotals[p] = { total: 0, completed: 0 };
      phaseTotals[p].total += Number(row.count);
      if (row.status === 'approved' || row.status === 'submitted') {
        phaseTotals[p].completed += Number(row.count);
      }
    }
    const completionRates = Object.entries(phaseTotals).map(([phase, data]) => ({
      phase,
      rate: data.total > 0 ? Math.round((data.completed / data.total) * 100) / 100 : 0,
    }));

    const averageCompletionRate =
      completionRates.length > 0
        ? Math.round(
            (completionRates.reduce((s, c) => s + c.rate, 0) / completionRates.length) * 100
          ) / 100
        : 0;

    // Recent additions: reports created in the last 30 days
    const recentRows = await db
      .select({ count: count() })
      .from(csrReports)
      .where(and(orgScope, sql`${csrReports.createdAt} >= now() - interval '30 days'`));
    const recentAdditions = Number(recentRows[0]?.count ?? 0);

    // No fabricated predictive insights — return empty until real model exists
    const predictiveInsights: any[] = [];

    const averageEndpoints = mostCommonEndpoints.length > 0
      ? Math.round((mostCommonEndpoints.reduce((s, e) => s + e.count, 0) / totalReports) * 10) / 10
      : 0;

    res.json({
      totalReports,
      recentAdditions,
      uniqueIndications,
      averageEndpoints,
      averageCompletionRate,
      reportsByIndication,
      reportsByPhase,
      sponsorDistribution,
      monthlyTrends,
      mostCommonEndpoints,
      completionRates,
      predictiveInsights,
      filters: {
        indications,
        phases,
      },
    });
  } catch (error) {
    log.error('Error generating analytics dashboard:', error);
    return serverError(res, log, 'loading dashboard', error);
  }
});

// Analytics export endpoint
router.get('/export', async (req, res) => {
  try {
    const { format, type, indication, sponsor, phase, timeFrame } = req.query;

    // Tenant isolation: the export aggregates csr_reports (org-scoped tenant
    // data). No org context → refuse rather than export across tenants.
    const orgId = getOrgId(req);
    if (orgId === null) {
      return res.status(403).json({ error: 'Organization context required', code: 'ORG_REQUIRED' });
    }
    const orgScope = eq(csrReports.organizationId, orgId);

    // Determine what data to include based on type
    let reportData: any = {};

    if (type === 'summary') {
      // Get summary analytics data — all aggregated from real csrReports rows.
      const cohortData = await db
        .select({
          count: count(),
          indication: csrReports.indication,
          phase: csrReports.phase,
        })
        .from(csrReports)
        .where(orgScope)
        .groupBy(csrReports.indication, csrReports.phase);

      const totalReports = cohortData.reduce((sum, item) => sum + Number(item.count), 0);

      // Real breakdowns from the grouped rows (previously hardcoded).
      const reportsByIndication: Record<string, number> = {};
      const reportsByPhase: Record<string, number> = {};
      for (const row of cohortData) {
        const ind = row.indication || 'Unspecified';
        const ph = row.phase || 'Unspecified';
        reportsByIndication[ind] = (reportsByIndication[ind] || 0) + Number(row.count);
        reportsByPhase[ph] = (reportsByPhase[ph] || 0) + Number(row.count);
      }

      // Real success rate = approved reports / total (csrReports.status).
      // Previously hardcoded 94.5.
      const statusRows = await db
        .select({ count: count(), status: csrReports.status })
        .from(csrReports)
        .where(orgScope)
        .groupBy(csrReports.status);
      const approved = statusRows
        .filter(r => r.status === 'approved')
        .reduce((s, r) => s + Number(r.count), 0);
      const successRate = totalReports > 0 ? Number(((approved / totalReports) * 100).toFixed(1)) : null;

      reportData = {
        totalReports,
        // averageEndpoints + mostCommonEndpoints require per-report endpoint
        // data that isn't modeled on csrReports; omitted rather than
        // fabricated. They return when an endpoints table is wired.
        successRate,
        reportsByIndication,
        reportsByPhase,
        reportsByStatus: Object.fromEntries(
          statusRows.map(r => [r.status || 'unknown', Number(r.count)])
        ),
      };
    } else if (type === 'predictive') {
      // Generate predictive analysis data
      reportData = {
        predictedEndpoints: [
          {
            endpointName: 'Overall Survival',
            predictedEffectSize: 0.42,
            confidenceInterval: [0.35, 0.49],
            reliability: 'High',
          },
          {
            endpointName: 'Progression-Free Survival',
            predictedEffectSize: 0.37,
            confidenceInterval: [0.29, 0.45],
            reliability: 'Moderate',
          },
        ],
        trialDesignRecommendations: [
          {
            factor: 'Sample Size',
            recommendation:
              'Based on historical power calculations, we recommend a minimum sample size of 150 participants per arm for adequate statistical power.',
            impactLevel: 'High',
          },
          {
            factor: 'Endpoint Selection',
            recommendation:
              'Consider using composite endpoints that combine clinical outcomes with biomarker data for increased sensitivity.',
            impactLevel: 'Medium',
          },
        ],
        marketTrends: [
          { indication: 'Breast Cancer', trend: 'Increasing', numberOfTrials: 87 },
          { indication: 'Lung Cancer', trend: 'Stable', numberOfTrials: 76 },
          { indication: 'Colorectal Cancer', trend: 'Increasing', numberOfTrials: 65 },
        ],
      };
    }

    if (format === 'json') {
      // Return data as JSON
      res.json(reportData);
    } else if (format === 'csv') {
      // Convert data to CSV
      let csvContent = '';

      // Implement CSV conversion based on the type of data
      if (type === 'summary') {
        csvContent = 'Metric,Value\n';
        csvContent += `Total Reports,${reportData.totalReports}\n`;
        csvContent += `Average Endpoints,${reportData.averageEndpoints}\n`;
        csvContent += `Success Rate,${reportData.successRate}%\n\n`;

        /* Indication names are built by ctgov-normalizer with
           `conditions.join(', ')`, so every multi-condition study emitted three
           fields under a two-column header and pushed the count into a phantom
           column — HTTP 200, plausible-looking file, wrong data. */
        csvContent += 'Indication,Count\n';
        Object.entries(reportData.reportsByIndication).forEach(([indication, count]) => {
          csvContent += csvRow([indication, count]) + '\n';
        });

        csvContent += '\nPhase,Count\n';
        Object.entries(reportData.reportsByPhase).forEach(([phase, count]) => {
          csvContent += csvRow([phase, count]) + '\n';
        });
      } else if (type === 'predictive') {
        csvContent = 'Endpoint,Predicted Effect Size,Confidence Interval,Reliability\n';
        reportData.predictedEndpoints.forEach((endpoint: any) => {
          csvContent += `${endpoint.endpointName},${endpoint.predictedEffectSize},${endpoint.confidenceInterval.join('-')},${endpoint.reliability}\n`;
        });

        csvContent += '\nFactor,Recommendation,Impact Level\n';
        reportData.trialDesignRecommendations.forEach((rec: any) => {
          csvContent += `${rec.factor},"${rec.recommendation}",${rec.impactLevel}\n`;
        });
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=lumen_analytics_${type}_${new Date().toISOString().slice(0, 10)}.csv`
      );
      res.send(csvContent);
    } else if (format === 'pdf') {
      // Generate PDF using pdfkit
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument();

      // Setup response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=lumen_analytics_${type}_${new Date().toISOString().slice(0, 10)}.pdf`
      );

      // Pipe the PDF to the response
      doc.pipe(res);

      // Add content to the PDF based on type
      doc.fontSize(25).text('ClinicalSage Analytics Report', 100, 80);
      doc.fontSize(16).text(`Generated on: ${new Date().toLocaleString()}`, 100, 120);

      doc.fontSize(14).text('Report Type:', 100, 160);
      doc
        .fontSize(12)
        .text(`${type?.toString().charAt(0).toUpperCase()}${type?.toString().slice(1)}`, 200, 160);

      // Add filters if present
      doc.fontSize(14).text('Filters:', 100, 190);
      let yPos = 190;
      if (indication) {
        yPos += 20;
        doc.fontSize(12).text(`Indication: ${indication}`, 200, yPos);
      }
      if (sponsor) {
        yPos += 20;
        doc.fontSize(12).text(`Sponsor: ${sponsor}`, 200, yPos);
      }
      if (phase) {
        yPos += 20;
        doc.fontSize(12).text(`Phase: ${phase}`, 200, yPos);
      }
      if (timeFrame) {
        yPos += 20;
        doc.fontSize(12).text(`Time Period: ${timeFrame}`, 200, yPos);
      }

      yPos += 40;

      // Add specific content based on report type
      if (type === 'summary') {
        doc.fontSize(18).text('Analytics Summary', 100, yPos);
        yPos += 30;

        doc.fontSize(14).text('Key Metrics:', 100, yPos);
        yPos += 20;
        doc.fontSize(12).text(`Total CSR Reports: ${reportData.totalReports}`, 120, yPos);
        yPos += 20;
        doc.fontSize(12).text(`Average Endpoints: ${reportData.averageEndpoints}`, 120, yPos);
        yPos += 20;
        doc.fontSize(12).text(`Success Rate: ${reportData.successRate}%`, 120, yPos);

        yPos += 40;
        doc.fontSize(14).text('Top Indications:', 100, yPos);
        yPos += 20;

        Object.entries(reportData.reportsByIndication).forEach(([indication, count]) => {
          doc.fontSize(12).text(`${indication}: ${count} reports`, 120, yPos);
          yPos += 20;
        });

        yPos += 20;
        doc.fontSize(14).text('Phase Distribution:', 100, yPos);
        yPos += 20;

        Object.entries(reportData.reportsByPhase).forEach(([phase, count]) => {
          doc.fontSize(12).text(`Phase ${phase}: ${count} reports`, 120, yPos);
          yPos += 20;
        });
      } else if (type === 'predictive') {
        doc.fontSize(18).text('Predictive Analytics Report', 100, yPos);
        yPos += 30;

        doc.fontSize(14).text('Predicted Endpoints:', 100, yPos);
        yPos += 20;

        reportData.predictedEndpoints.forEach((endpoint: any) => {
          doc.fontSize(12).text(`${endpoint.endpointName}:`, 120, yPos);
          yPos += 20;
          doc
            .fontSize(12)
            .text(
              `Effect Size: ${endpoint.predictedEffectSize} (${endpoint.confidenceInterval[0]}-${endpoint.confidenceInterval[1]})`,
              140,
              yPos
            );
          yPos += 20;
          doc.fontSize(12).text(`Reliability: ${endpoint.reliability}`, 140, yPos);
          yPos += 30;
        });

        yPos += 10;
        doc.fontSize(14).text('Trial Design Recommendations:', 100, yPos);
        yPos += 20;

        reportData.trialDesignRecommendations.forEach((rec: any) => {
          doc.fontSize(12).text(`${rec.factor} (${rec.impactLevel} Impact):`, 120, yPos);
          yPos += 20;
          // Use text wrapping for long recommendations
          const text = doc.fontSize(12).text(rec.recommendation, 140, yPos, {
            width: 400,
            align: 'left',
          });
          yPos += text.heightOfString(rec.recommendation, { width: 400 }) + 20;
        });
      }

      // Add footer
      doc.fontSize(10).text('© 2025 Concept2Cure - Confidential & Proprietary', 100, 700);

      // Finalize the PDF
      doc.end();
    } else {
      res.status(400).json({ error: 'Unsupported export format. Use json, csv, or pdf.' });
    }
  } catch (error) {
    log.error('Error exporting analytics report:', error);
    return serverError(res, log, 'exporting', error);
  }
});
export default router;
