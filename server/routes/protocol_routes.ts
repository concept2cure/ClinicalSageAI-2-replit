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
  generateSuggestions,
  enrichCsrsWithDetailedInsights,
} from './protocol_csr_insights.js';
import { serverError } from '../lib/api-response';
import {
  precedentBenchmarkReader,
  type ComparableTrial,
} from '../services/corpus/precedent-benchmark-reader';
import {
  buildSectionAnalysis,
  describeForNarration,
  frequencyLines,
  riskFactorsFrom,
  toCorpusPhase,
} from '../services/corpus/protocol-precedent-comparison';

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
 * The headings of the model's recommendation, as written. [] when there is no
 * recommendation or it has no headings.
 *
 * This used to fall back to five generic suggestions ("Optimize sample size
 * based on statistical power calculations…") presented as if they had been
 * extracted from the recommendation.
 */
function extractKeySuggestions(recommendation: string | null): string[] {
  if (!recommendation) return [];
  const headings = recommendation.match(/\*\*([^*]+)\*\*/g) || [];
  return headings
    .map(h => h.replace(/\*\*/g, '').trim())
    .filter(Boolean)
    .slice(0, 5);
}

/* ── 2026-10-01: what the optimize routes returned, and what they return now ──
   Both routes answered with a fixed analysis wearing the protocol's indication
   as a variable:
     - generateSectionAnalysis: five paragraphs ("standard randomization and
       blinding procedures", "Successful Phase 3 trials have utilized central
       randomization…", "Recent regulatory approvals … included comprehensive
       endpoint packages") with "alignment" scores of 85, 78, 82, 75 and 80 —
       the same for every protocol, read from neither the protocol nor a trial.
     - generateRiskFactors / generateEndpointSuggestions / generateArmSuggestions:
       keyword-keyed lists ("Risk of cardiovascular adverse events based on
       similar trials") citing trials nobody looked at.
     - four "alignment" scores: base constants (65, 65, 70) plus counts, so a
       protocol with no evidence at all scored 67 overall.
     - matched CSRs and academic references: read from a `reports` table that
       no migration creates, through `req.app.locals.db`, which nothing sets,
       then from relative-URL fetches to /api/reports, /api/academic-knowledge
       and /api/protocol-knowledge, which Node cannot issue and the last two of
       which do not exist. Every failure returned [], so every response said
       "no comparable trials" and the scores above were all that was left.
     - POST /upload-and-optimize defaulted a missing indication to 'Obesity'
       ("Default to obesity for demo"), so an upload that stated none was
       analysed as an obesity trial.

   Now: the protocol's own stated values (protocolAnalyzerService — fields the
   text does not state stay absent), the comparable trials and their benchmark
   from the trial corpus (precedentBenchmarkReader, one read), and a
   deterministic comparison of the two (protocol-precedent-comparison). A failed
   read is a 500, never "no comparable trials". The model, when one is
   configured, narrates that evidence and is told to add none; when none is, the
   response says so instead of returning a template. */

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

/** A corpus trial in the record shape the CSR-insight helpers read. The corpus
 *  records a registry status, not an efficacy outcome, so `outcome` is null —
 *  the helpers then say the outcome is not available instead of inferring one
 *  from "terminated" or "completed". */
function toCsrRecord(t: ComparableTrial) {
  return {
    id: t.id,
    title: t.title,
    sponsor: t.sponsor,
    nct_id: t.nctId,
    indication: t.indication,
    phase: t.phase,
    registry_status: t.registryStatus,
    design: t.studyDesign,
    sample_size: t.sampleSize,
    duration_weeks: t.durationWeeks,
    primary_endpoint: t.primaryEndpoint,
    outcome: null,
    efficacy_data: t.efficacyResults,
    safety_data: t.safetyResults,
    insight: null,
  };
}

type AnalysisResult = { status: 200 | 400; body: Record<string, unknown> };

/**
 * The shared body of POST /optimize and POST /upload-and-optimize. Throws on a
 * failed read; the routes turn that into a 500.
 */
async function analyseAgainstPrecedent(input: {
  text: string;
  indication?: unknown;
  phase?: unknown;
  studyType?: unknown;
  title?: unknown;
}): Promise<AnalysisResult> {
  const stated = input.text.trim() ? await protocolAnalyzerService.analyzeProtocol(input.text) : {};
  const indication = str(input.indication) ?? (stated as ProtocolData).indication;
  const phaseStated = str(input.phase) ?? (stated as ProtocolData).phase;
  const phase = toCorpusPhase(phaseStated);

  if (!indication || !phase) {
    return {
      status: 400,
      body: {
        success: false,
        error: {
          code: 'INDICATION_AND_PHASE_REQUIRED',
          message:
            'State the indication and the phase, in the request or in the protocol text. ' +
            'Comparable trials are matched on both, and the analysis is not run against an assumed one.',
        },
        stated: { indication: indication ?? null, phase: phaseStated ?? null },
      },
    };
  }

  const { benchmark, trials } = await precedentBenchmarkReader.compare(indication, phase);
  const enriched = await enrichCsrsWithDetailedInsights(trials.map(toCsrRecord), indication, phase);
  const comparableTrials = enriched.map(csr => ({
    ...csr,
    suggestions: generateSuggestions(csr, indication, phase),
  }));
  const sectionAnalysis = buildSectionAnalysis(stated as ProtocolData, benchmark);

  let recommendation: string | null = null;
  let recommendationUnavailable: string | undefined;
  try {
    recommendation = await protocolOptimizerService.generateTailoredRecommendations(
      input.text,
      { indication, phase, studyType: str(input.studyType), title: str(input.title) },
      comparableTrials,
      describeForNarration(benchmark, sectionAnalysis)
    );
    if (recommendation === null) {
      recommendationUnavailable =
        'No AI model is configured, so no narrative recommendation was written. ' +
        'The section analysis and comparable trials are computed without one.';
    }
  } catch (err) {
    log.error('Tailored protocol recommendation failed:', err);
    recommendationUnavailable =
      'The model call failed, so no narrative recommendation was written. ' +
      'The section analysis and comparable trials are computed without one.';
  }

  const s = stated as ProtocolData;
  return {
    status: 200,
    body: {
      success: true,
      indication,
      phase,
      stated: {
        design: s.design ?? null,
        arms: s.arms ?? null,
        sampleSize: s.sample_size ?? null,
        durationWeeks: s.duration_weeks ?? null,
        primaryEndpoint: s.primary_endpoint ?? null,
        fieldsNotStated: s.fields_not_stated ?? [],
      },
      recommendation,
      ...(recommendationUnavailable ? { recommendationUnavailable } : {}),
      keySuggestions: extractKeySuggestions(recommendation),
      sectionAnalysis,
      riskFactors: riskFactorsFrom(sectionAnalysis),
      suggestedEndpoints: frequencyLines(benchmark.commonEndpoints, benchmark.totalTrials),
      commonDesigns: frequencyLines(benchmark.commonDesigns, benchmark.totalTrials),
      precedentBenchmark: benchmark,
      matchedCsrInsights: comparableTrials,
    },
  };
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

    if (!['.txt', '.pdf', '.docx', '.doc'].includes(fileExtension)) {
      try { fs.unlinkSync(filePath); } catch { /* best-effort cleanup */ }
      return res.status(400).json({
        success: false,
        message: 'Unsupported file type. Please upload a .txt, .pdf, .doc, or .docx file',
      });
    }

    /* ── 2026-09-10: a PDF or DOCX upload used to be REPLACED, not read ───────
       This branch read, in full:

         } else if (ext === '.pdf' || ext === '.docx' || ext === '.doc') {
           // For PDF/DOCX/DOC files, we'd use appropriate extraction libraries
           // This is a simplified placeholder
           text = `Extracted text from ${name}. In a real implementation,
                   we would use proper libraries for extraction from ${ext} files.`;
         }

       ...and that sentence was then handed to analyzeProtocol(), which returns
       a complete, plausible protocol for any non-empty string. So a customer
       uploaded their real Phase 2 protocol and received an analysis — sample
       size, endpoints, arms, design, an FDA/EMA compliance verdict — of a
       placeholder about placeholders, with nothing in the response marking it.
       The .txt branch read the file properly, so the defect was invisible to
       anyone testing with a text file.

       The extraction is real now, and it uses THIS FILE'S OWN helpers —
       extractTextFromPdf / extractTextFromDocx at the bottom of the module,
       pdf-parse and mammoth respectively. Those already exist and are already
       used by POST /upload-and-optimize and POST /full-analysis in exactly this
       shape, including the 422 on failure. This route was simply missed when
       they were introduced: their own header note says "Previously this
       returned a hardcoded constant string, so every route that uploaded a PDF
       was analysing fake text regardless of the file." */
    let text = '';
    try {
      if (fileExtension === '.txt') {
        text = fs.readFileSync(filePath, 'utf8');
      } else if (fileExtension === '.pdf') {
        text = await extractTextFromPdf(fs.readFileSync(filePath));
      } else {
        text = await extractTextFromDocx(fs.readFileSync(filePath));
      }
    } catch (extractError) {
      log.error('Protocol file extraction error:', extractError);
      try { fs.unlinkSync(filePath); } catch { /* best-effort cleanup */ }
      return res.status(422).json({
        success: false,
        message: `Could not extract text from the ${fileExtension} file`,
      });
    }

    try { fs.unlinkSync(filePath); } catch { /* best-effort cleanup */ }

    // A parse that SUCCEEDS but yields nothing — a scanned PDF with no text
    // layer is the common case — must not fall through either. analyzeProtocol
    // throws on an empty string, but relying on that would make the error
    // message about the analyser rather than about the file.
    if (!text.trim()) {
      return res.status(422).json({
        success: false,
        error: {
          code: 'NO_TEXT_EXTRACTED',
          message:
            `No text could be extracted from ${req.file.originalname}. The file may be a scanned ` +
            `image with no text layer, or an unsupported legacy format. No analysis was ` +
            `performed — this is not a finding about the protocol.`,
        },
      });
    }

    // Analyze the protocol text
    const protocol = await protocolAnalyzerService.analyzeProtocol(text);

    return res.json({
      success: true,
      protocol,
      extraction: {
        filename: req.file.originalname,
        charactersExtracted: text.length,
      },
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
      } catch {
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

    const result = await analyseAgainstPrecedent({
      text: typeof protocolData.protocolSummary === 'string' ? protocolData.protocolSummary : '',
      indication: protocolData.indication,
      phase: protocolData.phase,
      studyType: protocolData.studyType,
      title: protocolData.title,
    });
    return res.status(result.status).json(result.body);
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

    // Clean up uploaded file
    try { fs.unlinkSync(filePath); } catch { /* best-effort cleanup */ }

    if (!text.trim()) {
      return res.status(422).json({
        success: false,
        error: {
          code: 'NO_TEXT_EXTRACTED',
          message:
            `No text could be extracted from ${req.file.originalname}. No analysis was performed — ` +
            `this is not a finding about the protocol.`,
        },
      });
    }

    const result = await analyseAgainstPrecedent({
      text,
      indication: req.body.indication,
      phase: req.body.phase,
      studyType: req.body.studyType,
      title: req.body.title,
    });
    return res
      .status(result.status)
      .json(result.status === 200 ? { ...result.body, extractedSummary: text } : result.body);
  } catch (error: any) {
    log.error('Error processing and optimizing protocol file:', error);
    return serverError(res, log, 'saving upload and optimize', error);
  }
});

// Deep optimize protocol
router.post('/optimize-deep', express.json(), async (_req, res) => {
  // DISABLED (501) on 2026-09-10, for the same reason POST /generate below was.
  //
  // This route produced three "optimization recommendations" by arithmetic on
  // whatever it was handed, or on a default when it was handed nothing:
  //   sample_size    (protocol.sample_size  || 100) * 1.15
  //   duration_weeks (protocol.duration_weeks || 24) + 4
  //   dropout_rate   max(0.1, (protocol.dropout_rate || 0.2) - 0.05)
  // Each carried a rationale asserting evidence that was never consulted —
  // "based on similar successful trials", "based on benchmark data" — and the
  // handler destructured `prediction` and `benchmarks` from the request body
  // and then referenced neither. It returned the result as `optimizedProtocol`
  // with `is_optimized: true`.
  //
  // So a caller supplying no sample size received a recommendation to enrol 115
  // participants, justified by trials nobody looked at. Multiplying an invented
  // number by 1.15 is not an optimisation.
  //
  // No client calls this route. POST /api/protocol/optimize is the real path:
  // it queries matched CSRs and academic references and routes through
  // protocolOptimizerService.
  return res.status(501).json({
    success: false,
    error: {
      code: 'not_implemented',
      message:
        'Deep optimization is not available. The prior implementation returned fixed ' +
        'arithmetic on default values, with rationales citing trial and benchmark ' +
        'evidence it never read. Use POST /api/protocol/optimize for real ' +
        'CSR-backed protocol analysis.',
    },
  });
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
