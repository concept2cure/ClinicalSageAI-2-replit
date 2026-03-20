import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { analyzeText } from '../openai-service';
import PDFDocument from 'pdfkit';

const router = Router();

// Create exports directory if it doesn't exist
const EXPORTS_DIR = path.join(process.cwd(), 'exports');
if (!fs.existsSync(EXPORTS_DIR)) {
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
}

/**
 * Generate an IND summary based on protocol
 */
router.post('/generate-ind', async (req: Request, res: Response) => {
  try {
    const { protocol, sessionId, csrContext } = req.body;

    if (!protocol) {
      return res.status(400).json({
        success: false,
        error: 'Protocol text is required',
      });
    }

    // Extract key information from CSR context for enhanced generation
    const molecule = csrContext?.drugName || csrContext?.molecule || 'the investigational product';
    const moa = csrContext?.moa || csrContext?.semantic?.moa || 'its mechanism of action';
    const primaryEndpoint =
      csrContext?.primary_endpoint ||
      csrContext?.endpoints?.[0] ||
      csrContext?.efficacy?.primary?.[0] ||
      'the primary endpoint';
    const designRationale =
      csrContext?.design_rationale ||
      csrContext?.semantic?.design_rationale ||
      'the study design rationale';
    const statisticalModel =
      csrContext?.primary_model ||
      csrContext?.stats_traceability?.primary_model ||
      'the statistical approach';

    // Create prompt for generating IND summary with CSR context if available
    let prompt = `You are an expert clinical regulatory writer with experience drafting Investigational New Drug (IND) application summaries.
Based on the following protocol information, generate a comprehensive IND summary that follows regulatory expectations and includes:

1. Introduction and objectives
2. Investigational product overview
3. Preclinical summary (extrapolated from the protocol)
4. Clinical trial design and methodology
5. Patient population
6. Dosing regimen and administration
7. Safety monitoring and reporting
8. Statistical considerations
9. Risk-benefit assessment
10. References

Protocol Information:
${protocol}`;

    // Add CSR context for enhanced, precedent-based generation if available
    if (csrContext) {
      prompt += `\n\nThis trial protocol was developed based on CSR precedent involving ${molecule}, a ${moa}. The primary endpoint utilized is ${primaryEndpoint}, which aligns with regulatory precedent. The design rationale includes: ${designRationale}. Statistical modeling is based on ${statisticalModel}.`;
    }

    // Generate summary using OpenAI
    const systemPrompt =
      'You are an expert IND regulatory document writer. Create a comprehensive and well-structured IND summary based on protocol information.';
    let content: string;
    try {
      content = await analyzeText(prompt, systemPrompt);
    } catch (aiError: any) {
      console.error('[Planner] OpenAI unavailable for IND generation:', aiError?.message?.substring(0, 200));
      return res.status(503).json({
        success: false,
        error: 'AI service is currently unavailable. Please ensure a valid OpenAI API key is configured and try again.',
        code: 'AI_SERVICE_UNAVAILABLE',
      });
    }

    return res.json({
      success: true,
      content,
    });
  } catch (error: any) {
    console.error('Error generating IND summary:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'An error occurred during IND summary generation',
    });
  }
});

/**
 * Generate a SAP (Statistical Analysis Plan) based on protocol
 */
router.post('/generate-sap', async (req: Request, res: Response) => {
  try {
    const { protocol, sessionId, csrContext } = req.body;

    if (!protocol) {
      return res.status(400).json({
        success: false,
        error: 'Protocol text is required',
      });
    }

    // Create prompt for generating SAP
    let prompt = `You are an expert biostatistician with experience drafting Statistical Analysis Plans (SAPs) for clinical trials.
Based on the following protocol information, generate a comprehensive SAP that includes:

1. Introduction and objectives
2. Study design overview
3. Study endpoints (primary, secondary, exploratory)
4. Statistical methodology
   - Sample size calculation and power
   - Analysis populations
   - Statistical tests for primary and secondary endpoints
   - Handling of missing data
   - Interim analyses (if applicable)
5. Data presentation
6. Safety analysis approach
7. References

Protocol Information:
${protocol}`;

    // Add CSR context for enhanced generation if available
    if (csrContext) {
      const endpoints = csrContext.endpoints
        ? Array.isArray(csrContext.endpoints)
          ? csrContext.endpoints.join(', ')
          : csrContext.endpoints
        : 'the specified endpoints';

      prompt += `\n\nNote that this analysis plan should align with precedent from similar trials for ${csrContext.indication || 'this indication'} in ${csrContext.phase || 'this phase'}, particularly regarding statistical approaches for ${endpoints}.`;
    }

    // Generate SAP using OpenAI
    const systemPrompt =
      'You are an expert biostatistician specializing in clinical trial statistical analysis plans. Create a comprehensive and technically sound SAP based on protocol information.';
    let content: string;
    try {
      content = await analyzeText(prompt, systemPrompt);
    } catch (aiError: any) {
      console.error('[Planner] OpenAI unavailable for SAP generation:', aiError?.message?.substring(0, 200));
      return res.status(503).json({
        success: false,
        error: 'AI service is currently unavailable. Please ensure a valid OpenAI API key is configured and try again.',
        code: 'AI_SERVICE_UNAVAILABLE',
      });
    }
    return res.json({
      success: true,
      content,
    });
  } catch (error: any) {
    console.error('Error generating SAP:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'An error occurred during SAP generation',
    });
  }
});

/**
 * Generate a protocol summary based on protocol
 */
router.post('/generate-summary', async (req: Request, res: Response) => {
  try {
    const { protocol, sessionId, csrContext } = req.body;

    if (!protocol) {
      return res.status(400).json({
        success: false,
        error: 'Protocol text is required',
      });
    }

    // Create prompt for generating protocol summary
    let prompt = `You are an expert clinical researcher with experience creating protocol summaries.
Based on the following protocol information, generate a concise but comprehensive summary that includes:

1. Study title and identifier
2. Objectives and rationale
3. Study design and methodology
4. Patient population and key inclusion/exclusion criteria
5. Treatment regimen and dosing
6. Primary and secondary endpoints
7. Statistical considerations
8. Safety monitoring approach
9. Conclusions

Protocol Information:
${protocol}`;

    // Add CSR context for enhanced generation if available
    if (csrContext) {
      prompt += `\n\nThis summary should reflect key learnings from similar trials for ${csrContext.indication || 'this indication'} in ${csrContext.phase || 'this phase'}, particularly regarding endpoint selection and statistical approaches.`;
    }

    // Generate summary using OpenAI
    const systemPrompt =
      'You are an expert clinical researcher specializing in protocol development and review. Create a comprehensive and well-structured protocol summary.';
    let content: string;
    try {
      content = await analyzeText(prompt, systemPrompt);
    } catch (aiError: any) {
      console.error('[Planner] OpenAI unavailable for summary generation:', aiError?.message?.substring(0, 200));
      return res.status(503).json({
        success: false,
        error: 'AI service is currently unavailable. Please ensure a valid OpenAI API key is configured and try again.',
        code: 'AI_SERVICE_UNAVAILABLE',
      });
    }
    return res.json({
      success: true,
      content,
    });
  } catch (error: any) {
    console.error('Error generating protocol summary:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'An error occurred during protocol summary generation',
    });
  }
});

/**
 * Export generated document to PDF
 */
router.post('/export-sap', async (req: Request, res: Response) => {
  await exportToPDF(req, res, 'SAP');
});

router.post('/export-ind', async (req: Request, res: Response) => {
  await exportToPDF(req, res, 'IND');
});

router.post('/export-summary', async (req: Request, res: Response) => {
  await exportToPDF(req, res, 'Protocol-Summary');
});

/**
 * Helper function to export content to PDF
 */
async function exportToPDF(req: Request, res: Response, type: string) {
  try {
    const { content, sessionId, metadata } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'Content is required for PDF export',
      });
    }

    // Create filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${type.toLowerCase()}_${sessionId || 'export'}_${timestamp}.pdf`;
    const filePath = path.join(EXPORTS_DIR, filename);

    // Create PDF document
    const doc = new PDFDocument({
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
      info: {
        Title: `${type} - ${sessionId}`,
        Author: 'Concept2Cure',
        Subject: `${type} for Clinical Trial Protocol`,
        Keywords: 'clinical trial, protocol, SAP, IND, summary',
        CreationDate: new Date(),
      },
    });

    // Create write stream
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Add header
    doc.fontSize(24).font('Helvetica-Bold').text(`${type}`, { align: 'center' });
    doc.moveDown();

    // Add metadata if available
    if (metadata) {
      doc.fontSize(12).font('Helvetica-Bold').text('Document Information:', { underline: true });
      doc.fontSize(10).font('Helvetica');

      if (metadata.title) doc.text(`Study Title: ${metadata.title}`);
      if (metadata.sponsor) doc.text(`Sponsor: ${metadata.sponsor}`);
      if (metadata.indication) doc.text(`Indication: ${metadata.indication}`);
      if (metadata.phase) doc.text(`Phase: ${metadata.phase}`);
      if (metadata.molecule) doc.text(`Study Drug: ${metadata.molecule}`);
      if (metadata.csrId) doc.text(`Source CSR ID: ${metadata.csrId}`);

      doc.text(`Generated: ${new Date().toISOString().split('T')[0]}`);
      doc.moveDown(2);
    }

    // Add content
    doc.fontSize(12).font('Helvetica');

    // Handle content formatting - split by newlines and process paragraphs
    const paragraphs = content.split('\n\n');
    for (const paragraph of paragraphs) {
      // Check if this is a header (starts with #)
      if (paragraph.trimStart().startsWith('#')) {
        const level = paragraph.trimStart().match(/^(#+)/)[0].length;
        const text = paragraph.replace(/^#+ /, '');

        // Style based on header level
        if (level === 1) {
          doc.moveDown().fontSize(18).font('Helvetica-Bold').text(text);
        } else if (level === 2) {
          doc.moveDown().fontSize(16).font('Helvetica-Bold').text(text);
        } else if (level === 3) {
          doc.moveDown().fontSize(14).font('Helvetica-Bold').text(text);
        } else {
          doc.moveDown().fontSize(12).font('Helvetica-Bold').text(text);
        }

        doc.fontSize(12).font('Helvetica');
      }
      // Check if this is a list item
      else if (
        paragraph.trimStart().startsWith('- ') ||
        paragraph.trimStart().startsWith('* ') ||
        paragraph.trimStart().match(/^\d+\./)
      ) {
        // Keep list items close together
        doc.moveDown(0.5).text(paragraph);
      }
      // Regular paragraph
      else {
        doc.moveDown().text(paragraph);
      }
    }

    // Add page numbers
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc
        .fontSize(8)
        .text(`Page ${i + 1} of ${pageCount}`, doc.page.margins.left, doc.page.height - 50, {
          align: 'center',
        });
    }

    // Finalize PDF
    doc.end();

    // Wait for stream to finish
    stream.on('finish', () => {
      // Set response headers for PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Return file
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    });
  } catch (error: any) {
    console.error(`Error exporting ${type} to PDF:`, error);
    return res.status(500).json({
      success: false,
      error: error.message || `An error occurred during ${type} PDF export`,
    });
  }
}

export default router;
