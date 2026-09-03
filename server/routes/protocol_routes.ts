import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { assertUploadSafe, UploadSafetyError } from '../middleware/uploadSafety';
import { randomUUID } from 'crypto';
import { protocolAnalyzerService, type ProtocolData } from '../protocol-analyzer-service';
import { protocolOptimizerService } from '../protocol-optimizer-service';
import { huggingFaceService } from '../huggingface-service';
import { createScopedLogger } from '../utils/logger.js';
import {
  getSimilarCsrs,
  calculateMatchScore,
  generateSuggestions,
  enrichCsrsWithDetailedInsights,
} from './protocol_csr_insights.js';
import { serverError } from '../lib/api-response';

// The CSR matching and insight-enrichment helpers were extracted verbatim to
// ./protocol_csr_insights.ts. Re-export the public names so the import surface
// of this module is unchanged for tests and any external callers.
export {
  classifyOutcome,
  describeField,
  generateSuggestions,
  enrichCsrsWithDetailedInsights,
} from './protocol_csr_insights.js';

const log = createScopedLogger('protocol-routes');

const router = express.Router();

/**
 * Extracts key suggestions from the tailored recommendation text
 */
function extractKeySuggestions(recommendation: string) {
  // Extract specific recommendations from the AI-generated text
  // by parsing key headings and other structured content

  // Extract headings from markdown ** format
  const headings = recommendation.match(/\*\*([^*]+)\*\*/g) || [];
  const cleanHeadings = headings.map(h => h.replace(/\*\*/g, '').trim());

  // If we found headings, return them as key suggestions
  if (cleanHeadings.length > 0) {
    return cleanHeadings.slice(0, 5);
  }

  // Fallback to some generic suggestions
  return [
    'Optimize sample size based on statistical power calculations for primary endpoint',
    'Consider adding objective and validated secondary endpoints',
    'Review inclusion/exclusion criteria for appropriate study population',
    'Ensure safety monitoring procedures align with regulatory guidance',
    'Consider implementing strategies to minimize dropout rate',
  ];
}

/**
 * Generates risk factors based on indication and phase
 */
function generateRiskFactors(indication: string, phase: string) {
  // Common risk factors for clinical trials
  const commonRisks = [
    'Potential for higher than expected dropout rates',
    'Possible challenges in patient recruitment',
    'Risk of unblinding due to recognizable treatment effects',
  ];

  // Add indication-specific risks
  const indicationLower = indication.toLowerCase();
  if (indicationLower.includes('obesity') || indicationLower.includes('diabetes')) {
    commonRisks.push('Risk of cardiovascular adverse events based on similar trials');
    commonRisks.push('Potential for participant weight fluctuations impacting assessments');
  } else if (indicationLower.includes('cancer') || indicationLower.includes('oncology')) {
    commonRisks.push('Risk of disease progression affecting study completion');
    commonRisks.push('Potential complications from concomitant medications');
  } else if (indicationLower.includes('neuro') || indicationLower.includes('alzheimer')) {
    commonRisks.push('Higher risk of cognitive adverse events requiring monitoring');
    commonRisks.push('Potential challenges in accurate endpoint assessments');
  }

  // Add phase-specific risks
  if (phase.includes('1')) {
    commonRisks.push('First-in-human risks requiring careful safety monitoring');
    commonRisks.push('Potential for unexpected adverse events not seen in preclinical studies');
  } else if (phase.includes('3')) {
    commonRisks.push('Risk of not meeting the primary endpoint due to variability');
    commonRisks.push(
      'Potential regulatory concerns about study design alignment with precedent trials'
    );
  }

  return commonRisks;
}

/**
 * Generates endpoint suggestions for the indication and phase
 */
function generateEndpointSuggestions(indication: string, phase: string) {
  const indicationLower = indication.toLowerCase();
  const endpoints = [];

  // Indication-specific endpoints
  if (indicationLower.includes('obesity')) {
    endpoints.push('Percent change in body weight from baseline');
    endpoints.push('Proportion of participants achieving ≥5% weight loss');
    endpoints.push('Change in waist circumference');
    endpoints.push('Changes in cardiometabolic risk factors');
  } else if (indicationLower.includes('diabetes')) {
    endpoints.push('Change in HbA1c from baseline');
    endpoints.push('Proportion of patients achieving HbA1c <7.0%');
    endpoints.push('Change in fasting plasma glucose');
    endpoints.push('Time in glycemic range measured by CGM');
  } else if (indicationLower.includes('cancer') || indicationLower.includes('oncology')) {
    endpoints.push('Overall Survival (OS)');
    endpoints.push('Progression-Free Survival (PFS)');
    endpoints.push('Objective Response Rate (ORR)');
    endpoints.push('Duration of Response (DoR)');
  } else {
    // Generic endpoints for other indications
    endpoints.push('Change from baseline in disease activity score');
    endpoints.push('Time to clinical improvement');
    endpoints.push('Proportion of patients achieving disease remission');
    endpoints.push('Quality of life improvement using validated instruments');
  }

  return endpoints;
}

/**
 * Generates suggested treatment arms based on indication, phase and study type
 */
function generateArmSuggestions(indication: string, phase: string, studyType: string) {
  const arms = [];

  if (studyType === 'rct') {
    arms.push('Test treatment - active drug at optimal dose');
    arms.push('Control arm - placebo or standard of care');

    if (phase.includes('2')) {
      arms.push('Multiple dose arms to establish dose-response relationship');
      arms.push('Consider adaptive design with interim analysis for dose selection');
    } else if (phase.includes('3')) {
      arms.push('Consider active comparator arm with current standard of care');
      arms.push('Potential sub-study for specific patient populations');
    }
  } else {
    arms.push('Primary treatment arm with active intervention');
    arms.push('Consider historical control comparison if randomization is not feasible');
    arms.push('Open-label extension for long-term safety data');
  }

  return arms;
}

/**
 * Generates section-by-section analysis of the protocol
 */
function generateSectionAnalysis(indication: string, phase: string, protocolSummary: string) {
  return {
    studyDesign: {
      current: `The current study design for this ${indication} trial includes standard randomization and blinding procedures.`,
      suggestions: [
        `Consider implementing adaptive design elements to optimize the ${indication} study efficiency`,
        `Review blinding procedures to ensure they're appropriate for ${indication} trials where treatment effects may be noticeable`,
      ],
      alignment: 85,
      academicGuidance: `Recent academic literature supports the use of adaptive designs for ${indication} studies to improve efficiency.`,
      csrLearnings: [
        `Successful ${phase.replace('phase', 'Phase ')} ${indication} trials have utilized central randomization with stratification by key prognostic factors`,
        `Studies with similar endpoints demonstrated improved outcomes with stringent blinding procedures`,
      ],
    },
    eligibilityCriteria: {
      current: `Current inclusion/exclusion criteria appear standard for ${indication} trials in ${phase.replace('phase', 'Phase ')}.`,
      suggestions: [
        `Consider narrowing eligibility criteria to focus on a more homogeneous patient population`,
        `Add specific biomarker criteria based on recent ${indication} research findings`,
      ],
      alignment: 78,
      academicGuidance: `Emerging research supports patient selection based on biomarker profiles in ${indication}.`,
      csrLearnings: [
        `Recent successful trials in ${indication} used more targeted eligibility criteria`,
        `Stricter exclusion criteria for comorbidities reduced confounding factors in analysis`,
      ],
    },
    endpoints: {
      current: `The primary endpoint focuses on clinical improvement in ${indication}-related symptoms and outcomes.`,
      suggestions: [
        `Consider adding validated patient-reported outcomes specific to ${indication}`,
        `Include digital biomarker measurements for more objective data collection`,
      ],
      alignment: 82,
      academicGuidance: `Latest research supports inclusion of both clinician-reported and patient-reported outcomes in ${indication} trials.`,
      csrLearnings: [
        `Recent regulatory approvals for ${indication} therapies included comprehensive endpoint packages`,
        `Digital assessment tools have strengthened endpoint data in similar trials`,
      ],
    },
    statisticalAnalysis: {
      current: `Standard statistical approach with primary analysis on intent-to-treat population.`,
      suggestions: [
        `Consider more robust handling of missing data with multiple imputation methods`,
        `Add sensitivity analyses to test assumption violations`,
      ],
      alignment: 75,
      academicGuidance: `Current statistical best practices for ${indication} trials emphasize transparent handling of missing data.`,
      csrLearnings: [
        `Successful ${indication} trials included pre-specified subgroup analyses`,
        `Regulators have increasingly focused on robust statistical methodologies in ${phase.replace('phase', 'Phase ')} submissions`,
      ],
    },
    safetyMonitoring: {
      current: `Standard adverse event collection with periodic safety reviews.`,
      suggestions: [
        `Implement more frequent safety monitoring based on known risks for ${indication} population`,
        `Add specific monitoring for events of special interest`,
      ],
      alignment: 80,
      academicGuidance: `Recent safety findings in ${indication} trials suggest enhanced monitoring for specific organ systems.`,
      csrLearnings: [
        `Enhanced safety monitoring protocols were implemented in similar ${indication} trials`,
        `Proactive safety monitoring reduced serious adverse event rates in comparable studies`,
      ],
    },
  };
}

/**
 * Retrieves academic references from knowledge databases
 */
/**
 * Retrieves academic references from the academic knowledge system
 */
async function generateAcademicReferences(indication: string, phase: string) {
  try {
    // Try to fetch from Academic Knowledge Service
    const academicServiceResponse = await fetch(
      `/api/academic-knowledge/search?query=${encodeURIComponent(`${indication} clinical trial ${phase}`)}&limit=10`
    );

    if (academicServiceResponse.ok) {
      const academicData = await academicServiceResponse.json();
      log.debug(
        `Found ${academicData.length || 0} academic references from Academic Knowledge Service`
      );

      if (academicData && academicData.length > 0) {
        return academicData.map((ref: any) => ({
          id: ref.id,
          title: ref.title,
          author: ref.authors || ref.author,
          publication: ref.journal || ref.publication,
          year: ref.year,
          relevance: ref.key_finding || ref.abstract || ref.relevance,
        }));
      }
    }

    // If Academic Knowledge Service failed, try Protocol Knowledge Service
    const protocolKnowledgeResponse = await fetch('/api/protocol-knowledge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        indication,
        phase: phase.replace('phase', '').trim(),
        count: 10,
      }),
    });

    if (protocolKnowledgeResponse.ok) {
      const protocolKnowledge = await protocolKnowledgeResponse.json();

      if (
        protocolKnowledge &&
        protocolKnowledge.academic_sources &&
        protocolKnowledge.academic_sources.length > 0
      ) {
        log.debug(
          `Found ${protocolKnowledge.academic_sources.length} academic sources from Protocol Knowledge Service`
        );
        return protocolKnowledge.academic_sources;
      }
    }

    log.debug('No academic references found from knowledge services');
    return [];
  } catch (error) {
    log.error('Error retrieving academic references:', error);
    return [];
  }
}

/**
 * Regulatory alignment heuristic — deterministic function of the real
 * supporting evidence retrieved (matched CSR precedents + academic
 * references). Previously `Math.floor(70 + Math.random() * 25)`, a random
 * value that ignored its inputs and varied per request. There is no
 * trained regulatory-scoring model, so this is an explicit
 * evidence-coverage heuristic, not a model prediction.
 */
function calculateRegScore(matchedCsrCount: number, academicCount: number) {
  return Math.min(95, 65 + matchedCsrCount * 4 + academicCount * 2);
}

/**
 * Calculates CSR alignment score
 */
function calculateCsrScore(csrInsights: any[]) {
  if (csrInsights.length === 0) return 65;

  // Base score plus bonus for number of insights
  return Math.min(95, 70 + csrInsights.length * 5);
}

/**
 * Calculates academic alignment score
 */
function calculateAcademicScore(academicReferences: any[]) {
  if (academicReferences.length === 0) return 70;

  // Base score plus bonus for number of references
  return Math.min(95, 75 + academicReferences.length * 4);
}

/**
 * Overall quality score — deterministic mean of the three evidence-based
 * alignment heuristics. Previously added `Math.random() * 10 - 5` jitter.
 */
function calculateOverallScore(regScore: number, csrScore: number, academicScore: number) {
  return Math.round((regScore + csrScore + academicScore) / 3);
}
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB max
    files: 1,
  },
  fileFilter: (_req: any, file: any, cb: any) => {
    const allowed = ['.pdf', '.docx', '.doc', '.xlsx', '.csv', '.txt', '.xml', '.json'];
    const ext = '.' + file.originalname.split('.').pop()?.toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not allowed. Accepted: ${allowed.join(', ')}`));
    }
  },
});

// Upload and analyze protocol file
router.post('/analyze-file', upload.single('file'), async (req, res) => {
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

    const filePath = req.file.path;
    const fileExtension = path.extname(req.file.originalname).toLowerCase();

    // Extract text based on file type
    let text = '';

    if (fileExtension === '.txt') {
      text = fs.readFileSync(filePath, 'utf8');
    } else if (fileExtension === '.pdf' || fileExtension === '.docx' || fileExtension === '.doc') {
      // For PDF/DOCX/DOC files, we'd use appropriate extraction libraries
      // This is a simplified placeholder
      text = `Extracted text from ${req.file.originalname}. In a real implementation, 
              we would use proper libraries for extraction from ${fileExtension} files.`;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Unsupported file type. Please upload a .txt, .pdf, .doc, or .docx file',
      });
    }

    // Analyze the protocol text
    const protocol = await protocolAnalyzerService.analyzeProtocol(text);

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    return res.json({
      success: true,
      protocol,
    });
  } catch (error: any) {
    log.error('Error processing protocol file:', error);
    return serverError(res, log, 'saving analyze file', error);
  }
});

router.post('/parse-file', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
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

    // Since we're using disk storage, read the file from disk
    const filePath = req.file.path;
    const fileExtension = path.extname(req.file.originalname).toLowerCase();

    let extractedText = '';

    if (fileExtension === '.txt') {
      extractedText = fs.readFileSync(filePath, 'utf8');
    } else if (fileExtension === '.pdf') {
      try {
        // Use real PDF extraction
        const pdfBuffer = fs.readFileSync(filePath);
        extractedText = await extractTextFromPdf(pdfBuffer);
      } catch (pdfError) {
        log.error('PDF extraction error:', pdfError);
        return res.status(422).json({
          success: false,
          message: 'Could not extract text from the PDF file',
        });
      }
    } else if (fileExtension === '.docx' || fileExtension === '.doc') {
      try {
        const docBuffer = fs.readFileSync(filePath);
        extractedText = await extractTextFromDocx(docBuffer);
      } catch (docError) {
        log.error('Document extraction error:', docError);
        return res.status(422).json({
          success: false,
          message: `Could not extract text from the ${fileExtension} file`,
        });
      }
    } else {
      // For other file types, use appropriate extraction methods
      try {
        extractedText = fs.readFileSync(filePath, 'utf8');
      } catch (readError) {
        return res.status(422).json({
          success: false,
          message: 'Could not read file content',
        });
      }
    }

    if (!extractedText || extractedText.trim().length === 0) {
      return res.status(422).json({
        success: false,
        message: 'Could not extract text from the provided file',
      });
    }

    const protocolData = await analyzeProtocolText(extractedText);

    // Clean up the file after processing
    fs.unlinkSync(filePath);

    // Log the activity with more details for debugging
    log.debug(
      `Protocol file parsed successfully: ${req.file.originalname} (${req.file.size} bytes)`
    );

    res.json(protocolData);
  } catch (error) {
    log.error('Error parsing protocol file:', error);
    return serverError(res, log, 'saving parse file', error);
  }
});

router.post('/parse-text', express.json(), async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No text provided or text is empty',
      });
    }

    const protocolData = await analyzeProtocolText(text);

    // Log successful text parsing
    log.debug(`Protocol text parsed successfully: ${text.substring(0, 50)}...`);

    res.json(protocolData);
  } catch (error) {
    log.error('Error analyzing protocol text:', error);
    return serverError(res, log, 'saving parse text', error);
  }
});

router.post('/deep-analyze', express.json(), async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No text provided or text is empty',
      });
    }

    // Get basic analysis first
    const basicAnalysis = await analyzeProtocolText(text);

    // Check if HuggingFace API key is available
    if (!huggingFaceService.isApiKeyAvailable()) {
      log.warn('HuggingFace API key is not available, returning basic analysis only');
      return res.json(basicAnalysis);
    }

    try {
      // analyzeProtocolText returns a best-effort regex extraction whose fields
      // may be null where ProtocolData expects values; the enhancer treats it as
      // a starting point, so bridge the loose extraction shape at this boundary.
      const enhancedAnalysis = await huggingFaceService.enhanceProtocolAnalysis(
        text,
        basicAnalysis as unknown as ProtocolData
      );
      log.debug('Deep AI analysis completed successfully');
      res.json(enhancedAnalysis);
    } catch (aiError) {
      log.error('Error in AI enhancement:', aiError);
      // Fall back to basic analysis if AI enhancement fails
      res.json(basicAnalysis);
    }
  } catch (error) {
    log.error('Error performing deep analysis:', error);
    return serverError(res, log, 'saving deep analyze', error);
  }
});

// Optimize protocol
router.post('/optimize', express.json(), async (req, res) => {
  try {
    const protocolData = req.body;

    if (!protocolData || typeof protocolData !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Valid protocol data is required',
      });
    }

    // Fetch similar CSRs from database matching therapeutic area and phase
    const { indication, phase, protocolSummary, studyType } = protocolData;

    // Query database for matching CSRs
    const db = req.app.locals.db;
    const matchedCsrs = await getSimilarCsrs(db, indication, phase);

    // Get academic references from the knowledge services
    const academicReferences = await generateAcademicReferences(indication, phase);

    // Enrich CSRs with detailed learnings and insights
    const enrichedCsrs = await enrichCsrsWithDetailedInsights(matchedCsrs, indication, phase);

    // Generate tailored recommendations with comprehensive insights
    const tailoredRecommendation = await protocolOptimizerService.generateTailoredRecommendations(
      protocolSummary,
      { indication, phase, studyType, title: protocolData.title },
      enrichedCsrs,
      academicReferences
    );

    // Get basic optimization recommendations for structured improvements
    const optimizationResult = await protocolOptimizerService.optimizeProtocol(protocolData);

    // Enhanced CSR insights with more detailed information
    const enhancedCsrInsights = enrichedCsrs.map(csr => {
      return {
        ...csr,
        match_score: calculateMatchScore(csr, indication, phase, studyType),
        suggestions: generateSuggestions(csr, indication, phase),
      };
    });

    return res.json({
      success: true,
      recommendation: tailoredRecommendation,
      keySuggestions: extractKeySuggestions(tailoredRecommendation),
      riskFactors: generateRiskFactors(indication, phase),
      matchedCsrInsights: enhancedCsrInsights,
      suggestedEndpoints: generateEndpointSuggestions(indication, phase),
      suggestedArms: generateArmSuggestions(indication, phase, studyType),
      sectionAnalysis: generateSectionAnalysis(indication, phase, protocolSummary),
      academicReferences,
      ...(() => {
        const regulatoryAlignmentScore = calculateRegScore(
          enhancedCsrInsights.length,
          academicReferences.length
        );
        const csrAlignmentScore = calculateCsrScore(enhancedCsrInsights);
        const academicAlignmentScore = calculateAcademicScore(academicReferences);
        return {
          regulatoryAlignmentScore,
          csrAlignmentScore,
          academicAlignmentScore,
          overallQualityScore: calculateOverallScore(
            regulatoryAlignmentScore,
            csrAlignmentScore,
            academicAlignmentScore
          ),
        };
      })(),
    });
  } catch (error: any) {
    log.error('Error optimizing protocol:', error);
    return serverError(res, log, 'optimising', error);
  }
});

// Upload and optimize protocol file
router.post('/upload-and-optimize', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    // SECURITY: magic-byte signature + AV scan (fail-closed in prod) before use.
    // This route read and parsed the upload without either check while its two
    // siblings in this file (POST /analyze-file, POST /parse-file) ran both.
    try {
      await assertUploadSafe(req.file.path, req.file.mimetype, req.file.originalname);
    } catch (err) {
      if (err instanceof UploadSafetyError) {
        try { fs.unlinkSync(req.file.path); } catch { /* best-effort cleanup */ }
        return res.status(err.status).json({ success: false, ...err.body });
      }
      throw err;
    }

    const filePath = req.file.path;
    const fileExtension = path.extname(req.file.originalname).toLowerCase();

    // Extract text based on file type
    let text = '';

    if (fileExtension === '.txt') {
      text = fs.readFileSync(filePath, 'utf8');
    } else if (fileExtension === '.pdf') {
      try {
        // Use real PDF extraction
        const pdfBuffer = fs.readFileSync(filePath);
        text = await extractTextFromPdf(pdfBuffer);
      } catch (pdfError) {
        log.error('PDF extraction error:', pdfError);
        return res.status(422).json({
          success: false,
          message: 'Could not extract text from the PDF file',
        });
      }
    } else if (fileExtension === '.docx' || fileExtension === '.doc') {
      try {
        const docBuffer = fs.readFileSync(filePath);
        text = await extractTextFromDocx(docBuffer);
      } catch (docError) {
        log.error('Document extraction error:', docError);
        return res.status(422).json({
          success: false,
          message: `Could not extract text from the ${fileExtension} file`,
        });
      }
    } else {
      fs.unlinkSync(filePath); // Clean up the uploaded file
      return res.status(400).json({
        success: false,
        message: 'Unsupported file type. Please upload a .txt, .pdf, .doc, or .docx file',
      });
    }

    // Get protocol data from the request body
    const protocolMeta = {
      indication: req.body.indication || 'Obesity', // Default to obesity for demo
      phase: req.body.phase || 'phase3',
      studyType: req.body.studyType || 'rct',
      title: req.body.title || `${req.body.indication || 'Clinical'} Protocol`,
    };

    // Query database for matching CSRs
    const db = req.app.locals.db;
    const matchedCsrs = await getSimilarCsrs(db, protocolMeta.indication, protocolMeta.phase);

    // Get academic references from knowledge services
    const academicReferences = await generateAcademicReferences(
      protocolMeta.indication,
      protocolMeta.phase
    );

    // Enrich CSRs with detailed learnings and insights
    const enrichedCsrs = await enrichCsrsWithDetailedInsights(
      matchedCsrs,
      protocolMeta.indication,
      protocolMeta.phase
    );

    // Generate tailored recommendations using the uploaded protocol text
    const tailoredRecommendation = await protocolOptimizerService.generateTailoredRecommendations(
      text,
      protocolMeta,
      enrichedCsrs,
      academicReferences
    );

    // Use the enriched CSRs for insights
    const enhancedCsrInsights = enrichedCsrs.map(csr => {
      return {
        ...csr,
        match_score: calculateMatchScore(
          csr,
          protocolMeta.indication,
          protocolMeta.phase,
          protocolMeta.studyType
        ),
        suggestions: generateSuggestions(csr, protocolMeta.indication, protocolMeta.phase),
      };
    });

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    return res.json({
      success: true,
      extractedSummary: text,
      recommendation: tailoredRecommendation,
      keySuggestions: extractKeySuggestions(tailoredRecommendation),
      riskFactors: generateRiskFactors(protocolMeta.indication, protocolMeta.phase),
      matchedCsrInsights: enhancedCsrInsights,
      suggestedEndpoints: generateEndpointSuggestions(protocolMeta.indication, protocolMeta.phase),
      suggestedArms: generateArmSuggestions(
        protocolMeta.indication,
        protocolMeta.phase,
        protocolMeta.studyType
      ),
      sectionAnalysis: generateSectionAnalysis(protocolMeta.indication, protocolMeta.phase, text),
      academicReferences,
      ...(() => {
        const regulatoryAlignmentScore = calculateRegScore(
          enhancedCsrInsights.length,
          academicReferences.length
        );
        const csrAlignmentScore = calculateCsrScore(enhancedCsrInsights);
        const academicAlignmentScore = calculateAcademicScore(academicReferences);
        return {
          regulatoryAlignmentScore,
          csrAlignmentScore,
          academicAlignmentScore,
          overallQualityScore: calculateOverallScore(
            regulatoryAlignmentScore,
            csrAlignmentScore,
            academicAlignmentScore
          ),
        };
      })(),
    });
  } catch (error: any) {
    log.error('Error processing and optimizing protocol file:', error);
    return serverError(res, log, 'saving upload and optimize', error);
  }
});

// Deep optimize protocol
router.post('/optimize-deep', express.json(), async (req, res) => {
  try {
    const { protocol, prediction, benchmarks } = req.body;

    if (!protocol || typeof protocol !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Valid protocol data is required',
      });
    }

    // Generate optimization recommendations
    const recommendations = [
      {
        field: 'sample_size',
        current: protocol.sample_size || 100,
        suggested: (protocol.sample_size || 100) * 1.15,
        rationale:
          'Increasing sample size to improve statistical power based on similar successful trials.',
        impact: 'high',
      },
      {
        field: 'duration_weeks',
        current: protocol.duration_weeks || 24,
        suggested: (protocol.duration_weeks || 24) + 4,
        rationale: 'Extended study duration allows for better assessment of sustained effects.',
        impact: 'medium',
      },
      {
        field: 'dropout_rate',
        current: protocol.dropout_rate || 0.2,
        suggested: Math.max(0.1, (protocol.dropout_rate || 0.2) - 0.05),
        rationale: 'Implementing improved retention strategies based on benchmark data.',
        impact: 'high',
      },
    ];

    // Create optimized protocol
    const optimizedProtocol = {
      ...protocol,
      sample_size:
        recommendations.find(r => r.field === 'sample_size')?.suggested || protocol.sample_size,
      duration_weeks:
        recommendations.find(r => r.field === 'duration_weeks')?.suggested ||
        protocol.duration_weeks,
      dropout_rate:
        recommendations.find(r => r.field === 'dropout_rate')?.suggested || protocol.dropout_rate,
      is_optimized: true,
      optimization_date: new Date().toISOString(),
    };

    return res.json({
      optimizedProtocol,
      recommendations,
    });
  } catch (error: any) {
    log.error('Error in deep optimization:', error);
    return serverError(res, log, 'saving optimize deep', error);
  }
});

// Generate full protocol
router.post('/generate', express.json(), async (_req, res) => {
  // DISABLED (501). This route fabricated an entire "generated protocol"
  // analysis with no real data source: random competitor drug names
  // (`Drug-${random}`) carrying invented "p<0.001" phase-3 results, a fixed
  // regulatoryAlignment score (87), invented precedent counts ("12 successful
  // Phase X trials"), and hardcoded evidence-strength numbers. None of it was
  // backed by a real competitor/precedent database or model, and no client
  // consumes this endpoint. Real CSR-backed protocol analysis is available at
  // POST /api/protocol/optimize, which queries matched CSRs + academic
  // references and routes through protocolOptimizerService.
  return res.status(501).json({
    success: false,
    error: {
      code: 'not_implemented',
      message:
        'Protocol generation is not available. The prior implementation returned ' +
        'fabricated competitor, precedent, and alignment data. Use POST ' +
        '/api/protocol/optimize for real CSR-backed protocol analysis.',
    },
  });
});

export { router as protocolRoutes };

// Placeholder function - Generates a realistic protocol structure
/**
 * Extracts structured fields from raw protocol text via pattern matching.
 *
 * Honesty contract: every field is derived from the supplied text. Fields
 * that are not present return null (scalars) or [] (lists) — we do NOT
 * fabricate them. The prior implementation invented a random indication /
 * phase / sample size / duration / endpoint when extraction failed, and
 * returned hardcoded inclusion/exclusion criteria, arms, randomization,
 * blinding, statistical methods, and a random dropout_rate as if they had
 * been read from the protocol. None of that was real.
 */
async function analyzeProtocolText(text: string) {
  const protocolId = `TS-${randomUUID()}`;

  const indicationMatch = text.match(
    /(?:indication|disease|condition|disorder)s?:?\s*([A-Za-z\s\-]+)/i
  );
  const indication = indicationMatch ? indicationMatch[1].trim() : null;

  const phaseMatch = text.match(/phase\s*([1-4]|I{1,3}V?)/i);
  const phase = phaseMatch
    ? phaseMatch[1].toString().replace(/I{1,3}V?/i, m => {
        return { I: '1', II: '2', III: '3', IV: '4' }[m] || m;
      })
    : null;

  const sampleSizeMatch = text.match(
    /(?:sample size|n\s*=|subjects|patients)(?:\s*(?:of|=|:))?\s*(\d+)/i
  );
  const sampleSize = sampleSizeMatch ? parseInt(sampleSizeMatch[1]) : null;

  const durationMatch = text.match(
    /(?:duration|period|length|weeks)(?:\s*(?:of|=|:))?\s*(\d+)\s*(?:weeks|wks|w)/i
  );
  const durationWeeks = durationMatch ? parseInt(durationMatch[1]) : null;

  const endpointMatch = text.match(
    /(?:primary\s*endpoint|primary\s*outcome)(?:\s*(?:is|=|:))?\s*([^.;]+)/i
  );
  const primaryEndpoint = endpointMatch ? endpointMatch[1].trim() : null;

  const blindingMatch = text.match(/\b(double-blind|single-blind|open-label|unblinded)\b/i);
  const randomizationMatch = text.match(/\b(\d\s*:\s*\d(?:\s*:\s*\d)?)\b\s*randomi[sz]ation/i);

  return {
    protocol_id: protocolId,
    title: indication && phase ? `Study of ${indication} — Phase ${phase}` : null,
    indication,
    phase,
    sample_size: sampleSize,
    duration_weeks: durationWeeks,
    primary_endpoint: primaryEndpoint,
    endpoint_primary: primaryEndpoint, // backward-compatible alias
    // The following are not extracted by the current parser; they are left
    // empty/null rather than fabricated. A richer parser (or the real
    // protocolAnalyzerService) populates them when available.
    secondary_endpoints: [] as string[],
    inclusion_criteria: [] as string[],
    exclusion_criteria: [] as string[],
    arms: [] as string[],
    randomization: randomizationMatch ? randomizationMatch[1].replace(/\s+/g, '') : null,
    blinding: blindingMatch ? blindingMatch[1] : null,
    statistical_methods: null as string | null,
    dropout_rate: null as number | null,
  };
}

// Helper functions

/**
 * Real PDF text extraction via pdf-parse (the same library used by
 * DocumentDataCenterService and client-intelligence-memory). Previously this
 * returned a hardcoded constant string, so every route that uploaded a PDF
 * was analysing fake text regardless of the file.
 */
async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const pdfParse = (await import('pdf-parse')).default;
  const result = await pdfParse(buffer);
  return result.text || '';
}

/**
 * Real DOCX text extraction via mammoth.
 */
async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const mammoth = (await import('mammoth')).default;
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
}
