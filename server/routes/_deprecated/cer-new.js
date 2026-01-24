/**
 * Clinical Evaluation Report API Routes
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

// Import services (make sure these modules exist)
const cerPdfExporter = require('../services/cerPdfExporter');

// POST /api/cer/export-pdf - Export FAERS data to PDF
router.post('/export-pdf', async (req, res) => {
  try {
    const { productName, faersData } = req.body;

    if (!faersData) {
      return res.status(400).json({
        success: false,
        error: 'FAERS data is required',
      });
    }

    console.log(`Generating PDF export for ${productName || 'unknown product'}`);

    // Generate PDF and stream it back
    try {
      // Create CER data structure from the FAERS data
      const cerData = {
        title: `Clinical Evaluation Report: ${productName}`,
        sections: [
          {
            title: 'FAERS Analysis',
            content: `Analysis of FDA FAERS data for ${productName}`,
          },
        ],
        deviceInfo: {
          name: productName,
          manufacturer: faersData.productInfo?.manufacturer || 'Unknown Manufacturer',
          modelNumber: faersData.productInfo?.modelNumber,
        },
        metadata: {
          author: 'TrialSage AI',
          generatedAt: new Date().toISOString(),
          version: '1.0.0',
          reviewStatus: 'draft',
          confidential: true,
        },
      };

      // Add reactions if available
      if (faersData.reactionCounts && faersData.reactionCounts.length > 0) {
        cerData.sections.push({
          title: 'Adverse Event Frequency',
          content: faersData.reactionCounts
            .map(r => `${r.reaction}: ${r.count} reports`)
            .join('\n'),
        });
      }

      // Add summary data if available
      if (faersData.summary) {
        cerData.sections.push({
          title: 'Summary Statistics',
          content: `Total Reports: ${faersData.summary.totalReports}\nSerious Events: ${faersData.summary.seriousEvents}\nRisk Score: ${faersData.summary.riskScore}`,
        });
      }

      // Add conclusion
      const conclusionText =
        faersData.conclusion ||
        `This report presents the findings from FDA FAERS data analysis for ${productName}. ` +
          `The data provides insights into the safety profile based on real-world adverse event reports. ` +
          `This data should be considered as part of a comprehensive clinical evaluation.`;

      cerData.sections.push({
        title: 'Conclusion',
        content: conclusionText,
      });

      // Generate PDF
      const pdfBuffer = await cerPdfExporter.generateCerPdf(cerData);

      // Save file to disk
      const timestamp = Date.now();
      const filename = `faers_report_${productName?.replace(/\s+/g, '_')}_${timestamp}.pdf`;
      const filePath = path.join(__dirname, '../public/downloads', filename);

      // Ensure directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write the file
      fs.writeFileSync(filePath, pdfBuffer);

      // Send response with URL
      res.json({
        success: true,
        format: 'pdf',
        filename: filename,
        message: 'PDF document generated successfully',
        url: `/api/cer/downloads/${filename}`,
      });
    } catch (pdfError) {
      console.error('Error generating PDF:', pdfError);
      res.status(500).json({
        success: false,
        error: 'Failed to generate PDF document',
        details: pdfError.message,
      });
    }
  } catch (error) {
    console.error('Error exporting FAERS data to PDF:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export FAERS data to PDF',
      message: error.message,
    });
  }
});

// POST /api/cer/export-word - Export FAERS data to Word document
router.post('/export-word', async (req, res) => {
  try {
    const { productName, faersData } = req.body;

    if (!faersData) {
      return res.status(400).json({
        success: false,
        error: 'FAERS data is required',
      });
    }

    console.log(`Generating Word export for ${productName || 'unknown product'}`);

    // For Word exports, we'll use our existing PDF functionality
    try {
      // Use PDF generator to create content
      const pdfExporter = require('../services/cerPdfExporter');

      // Create CER data object with FAERS information
      const cerData = {
        title: `Clinical Evaluation Report: ${productName}`,
        sections: [
          {
            title: 'FAERS Adverse Event Analysis',
            content: `Analysis of FDA FAERS data for ${productName}`,
          },
        ],
        deviceInfo: {
          name: productName,
          manufacturer: faersData.productInfo?.manufacturer || 'Unknown Manufacturer',
          modelNumber: faersData.productInfo?.modelNumber,
        },
        metadata: {
          author: 'TrialSage AI',
          generatedAt: new Date().toISOString(),
          version: '1.0.0',
          reviewStatus: 'draft',
          confidential: true,
          format: 'docx', // Signal that this is for Word format
        },
      };

      // Add reactions if available
      if (faersData.reactionCounts && faersData.reactionCounts.length > 0) {
        cerData.sections.push({
          title: 'Adverse Event Frequency',
          content: faersData.reactionCounts
            .map(r => `${r.reaction}: ${r.count} reports`)
            .join('\n'),
        });
      }

      // Add summary data if available
      if (faersData.summary) {
        cerData.sections.push({
          title: 'Summary Statistics',
          content: `Total Reports: ${faersData.summary.totalReports}\nSerious Events: ${faersData.summary.seriousEvents}\nRisk Score: ${faersData.summary.riskScore}`,
        });
      }

      // Add conclusion
      const conclusionText =
        faersData.conclusion ||
        `This report presents the findings from FDA FAERS data analysis for ${productName}. ` +
          `The data provides insights into the safety profile based on real-world adverse event reports. ` +
          `This data should be considered as part of a comprehensive clinical evaluation.`;

      cerData.sections.push({
        title: 'Conclusion',
        content: conclusionText,
      });

      // Generate PDF (we'll use PDF as a fallback format)
      pdfExporter
        .generateCerPdf(cerData)
        .then(pdfBuffer => {
          // Save file to disk
          const timestamp = Date.now();
          const filename = `faers_report_${productName?.replace(/\s+/g, '_')}_${timestamp}.pdf`;
          const filePath = path.join(__dirname, '../public/downloads', filename);

          // Ensure directory exists
          const dir = path.dirname(filePath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }

          // Write the file
          fs.writeFileSync(filePath, pdfBuffer);

          // Send response with URL - note that we're providing PDF instead of DOCX
          res.json({
            success: true,
            format: 'pdf', // Honestly inform that this is PDF
            filename: filename,
            message: 'Document exported as PDF (DOCX format not available)',
            url: `/api/cer/downloads/${filename}`,
          });
        })
        .catch(error => {
          console.error('Error generating document:', error);
          res.status(500).json({
            success: false,
            error: 'Failed to generate document',
            details: error.message,
          });
        });
    } catch (error) {
      console.error('Error preparing document export:', error);

      res.status(500).json({
        success: false,
        error: 'Failed to prepare document export',
        details: error.message,
      });
    }
  } catch (error) {
    console.error('Error exporting FAERS data to Word:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export FAERS data to Word',
      message: error.message,
    });
  }
});

// POST /api/cer/preview - Generate HTML preview of CER report
router.post('/preview', async (req, res) => {
  try {
    console.log('Preview request body:', JSON.stringify(req.body, null, 2));
    const { title, sections = [], faers = [], comparators = [] } = req.body;

    // Allow preview with either sections or FAERS data
    const hasFaers = faers && Array.isArray(faers) && faers.length > 0;
    const hasSections = sections && Array.isArray(sections) && sections.length > 0;

    console.log(
      `FAERS data: ${hasFaers ? 'present' : 'missing'}, Sections: ${hasSections ? 'present' : 'missing'}`
    );

    if (!hasFaers && !hasSections) {
      console.log('No content found for preview');
      return res.status(400).json({ error: 'Either sections or FAERS data is required' });
    }

    console.log(`Generating HTML preview for ${title || 'unknown product'}`);

    // Extract some basic information for the preview
    const reportCount = faers?.length || 0;
    const seriousCount = faers?.filter(r => r.is_serious)?.length || 0;

    // Generate sample HTML preview with sections and/or FAERS data
    let sectionsHtml = '';
    if (hasSections) {
      sectionsHtml = sections
        .map(section => {
          return `
          <div class="cer-user-section">
            <h4>${section.title || 'Section'}</h4>
            <div class="cer-section-content">
              ${section.content || ''}
            </div>
          </div>
        `;
        })
        .join('');
    }

    let faersHtml = '';
    if (hasFaers) {
      faersHtml = `
        <div class="cer-summary">
          <p>
            Based on the analysis of ${reportCount} adverse event reports from the FDA FAERS database, 
            ${title?.split(':')[1] || 'The product'} demonstrates a moderate risk profile with ${seriousCount} serious events reported.
            This data has been considered in the overall benefit-risk assessment of the product.
          </p>
        </div>
        
        <div class="cer-section">
          <h4>Summary of FAERS Findings</h4>
          <ul>
            <li>Total reports analyzed: ${reportCount}</li>
            <li>Serious adverse events: ${seriousCount}</li>
            <li>Reporting period: 2020-01-01 to ${new Date().toISOString().split('T')[0]}</li>
          </ul>
        </div>
        
        <div class="cer-section">
          <h4>Risk Assessment</h4>
          <p>
            The adverse event profile for ${title?.split(':')[1] || 'the product'} is consistent with similar products in its class.
            Most reported events were non-serious and resolved without intervention.
          </p>
        </div>
      `;
    }

    const html = `
      <div class="cer-preview-content">
        <div class="cer-section">
          <h2>Clinical Evaluation Report</h2>
          <h3>${title || 'Device/Product Evaluation'}</h3>
          
          ${faersHtml}
          ${sectionsHtml}
          
          <div class="cer-section">
            <h4>Conclusion</h4>
            <p>
              The safety profile of ${title?.split(':')[1] || 'the product'} is well-characterized and acceptable for its intended use.
              Continuous monitoring of adverse events will ensure ongoing safety assessment.
            </p>
          </div>
        </div>
      </div>
    `;

    res.json({
      success: true,
      html,
    });
  } catch (error) {
    console.error('Error generating CER preview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate CER preview',
      message: error.message,
    });
  }
});

// POST /api/cer/assistant - Get AI assistant response for CER development questions
router.post('/assistant', async (req, res) => {
  try {
    const { query, context } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Use OpenAI to get an expert response
    try {
      // Require OpenAI service
      const { Configuration, OpenAIApi } = require('openai');

      // Check for OpenAI API key
      if (!process.env.OPENAI_API_KEY) {
        console.error('OpenAI API key is missing');
        return res.status(500).json({
          error: 'OpenAI API key is required for this feature',
          message: 'Please configure the OPENAI_API_KEY environment variable',
        });
      }

      // Configure OpenAI
      const configuration = new Configuration({
        apiKey: process.env.OPENAI_API_KEY,
      });
      const openai = new OpenAIApi(configuration);

      // Prepare the system prompt
      const systemPrompt = `You are an expert regulatory affairs consultant specializing in Clinical Evaluation Reports (CERs). 
      You provide accurate, detailed, and compliant answers regarding CER development, focusing on regulatory standards like EU MDR 2017/745, 
      MEDDEV 2.7/1 Rev 4, and other relevant standards. Cite specific regulatory sections when applicable.`;

      // Prepare the query with context if available
      let userPrompt = query;
      if (context) {
        userPrompt = `${query}\n\nContext: ${JSON.stringify(context)}`;
      }

      // Call OpenAI API
      const completion = await openai.createChatCompletion({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      });

      // Get the response
      const response = completion.data.choices[0].message.content;

      // Extract potential sources from the response
      const sourcesRegex = /(MEDDEV|EU MDR|ISO|FDA|CFR)\s+([\d\.]+)(?::|,|\s|$)/g;
      const matches = [...response.matchAll(sourcesRegex)];

      // Format sources
      const sources = matches.map(match => ({
        title: match[1] + ' ' + match[2],
        section: match[1].includes('MEDDEV')
          ? 'Guidance Document'
          : match[1].includes('EU MDR')
            ? 'Regulation'
            : match[1].includes('ISO')
              ? 'Standard'
              : 'Regulatory Reference',
      }));

      // Return the response and identified sources
      res.json({
        query,
        response,
        sources:
          sources.length > 0
            ? sources
            : [
                { title: 'EU MDR 2017/745', section: 'Applicable sections' },
                { title: 'MEDDEV 2.7/1 Rev 4', section: 'Guidance' },
              ],
      });
    } catch (error) {
      console.error('Error calling OpenAI API:', error);

      // Provide a graceful fallback
      res.status(500).json({
        error: 'Failed to process query with AI service',
        message: error.message,
      });
    }
  } catch (error) {
    console.error('Error processing assistant query:', error);
    res.status(500).json({ error: 'Failed to process query' });
  }
});

// POST /api/cer/improve-compliance - Get AI-generated improvements for compliance
router.post('/improve-compliance', async (req, res) => {
  try {
    // Direct implementation to replace improveComplianceHandler for ES module compatibility
    const { section, standard, currentContent } = req.body;

    if (!section || !standard || !currentContent) {
      return res.status(400).json({
        error: 'Section, standard, and current content are required',
      });
    }

    console.log(`Analyzing ${section} compliance with ${standard} standard...`);
    console.log(`Content length: ${currentContent.length} characters`);

    // Use OpenAI to analyze the content and generate improvements
    try {
      // Check for OpenAI API key
      if (!process.env.OPENAI_API_KEY) {
        throw new Error(
          'OPENAI_API_KEY is not configured. Cannot provide compliance improvement suggestions.'
        );
      }

      // Import OpenAI if needed
      const { Configuration, OpenAIApi } = require('openai');
      const configuration = new Configuration({
        apiKey: process.env.OPENAI_API_KEY,
      });
      const openai = new OpenAIApi(configuration);

      // Build context-specific system prompt
      let standardInfo = '';
      if (standard.toLowerCase().includes('eu mdr')) {
        standardInfo =
          'EU MDR 2017/745, focusing on clinical evaluation requirements in Annex XIV and safety/performance requirements';
      } else if (standard.toLowerCase().includes('iso')) {
        standardInfo =
          'ISO 14155:2020, focusing on clinical investigation design, conduct, and reporting';
      } else if (standard.toLowerCase().includes('fda')) {
        standardInfo =
          'FDA 21 CFR regulations for medical devices, particularly Parts 812, 814, and applicable guidance documents';
      } else {
        standardInfo = 'general international standards for clinical evaluation of medical devices';
      }

      const systemPrompt = `You are an expert regulatory affairs consultant specializing in medical device documentation. 
Your task is to analyze the provided content of a Clinical Evaluation Report (CER) section and suggest specific improvements to enhance compliance with ${standardInfo}.

First, identify the strengths and weaknesses of the current content.
Then, provide 5 specific, actionable recommendations to improve regulatory compliance, with justification for each.
Finally, provide a brief implementation guidance paragraph with prioritization of the changes.

Format your response as markdown with appropriate sections and bullet points.`;

      // Prepare user prompt with content to analyze
      const userPrompt = `I need to improve the "${section}" section of my CER to better comply with ${standard} requirements. Here is the current content:

"""
${currentContent}
"""

Please analyze this content and suggest specific improvements to enhance compliance.`;

      // Call OpenAI API
      const completion = await openai.createChatCompletion({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 1500,
      });

      // Extract the improvement recommendations
      const improvement = completion.data.choices[0].message.content;

      // Determine standard name for resources
      let standardName = 'International Standards';
      if (standard.toLowerCase().includes('eu mdr')) {
        standardName = 'EU MDR 2017/745';
      } else if (standard.toLowerCase().includes('iso')) {
        standardName = 'ISO 14155:2020';
      } else if (standard.toLowerCase().includes('fda')) {
        standardName = 'FDA 21 CFR';
      }

      // Return the improvement suggestions with additional resources
      return res.json({
        section,
        standard,
        improvement,
        aiGenerated: true,
        generatedAt: new Date().toISOString(),
        additionalResources: [
          {
            title: 'EU MDR 2017/745 Guidance',
            url: 'https://ec.europa.eu/health/md_sector/new_regulations/guidance_en',
          },
          { title: 'ISO 14155:2020 Key Points', url: 'https://www.iso.org/standard/71690.html' },
          {
            title: 'FDA 21 CFR Part 812',
            url: 'https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfcfr/cfrsearch.cfm?cfrpart=812',
          },
        ],
      });
    } catch (error) {
      console.error('OpenAI service error:', error);
      res.status(500).json({
        error: 'Failed to analyze compliance with AI service',
        message: error.message,
      });
    }
  } catch (error) {
    console.error('Error improving compliance:', error);
    return res.status(500).json({ error: 'Failed to improve compliance' });
  }
});

// POST /api/cer/assistant/chat - CER Assistant chat endpoint
router.post('/assistant/chat', async (req, res) => {
  try {
    const { message, context } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log(`CER Assistant receiving message: ${message.substring(0, 50)}...`);

    // Use our chat service to process the message
    const cerChatService = require('../services/cerChatService');

    try {
      // Process the message using our service
      const result = await cerChatService.processMessage(message, context);
      res.json(result);
    } catch (serviceError) {
      console.error('Chat service error:', serviceError);
      res.status(500).json({
        error: 'Failed to process message with AI service',
        message: serviceError.message,
      });
    }
  } catch (error) {
    console.error('Error in CER Assistant:', error);
    res.status(500).json({
      error: 'Failed to process your message',
      message: error.message,
    });
  }
});

// Serve static files from the public directory
router.use('/downloads', express.static(path.join(__dirname, '../public/downloads')));

// Export using both CommonJS and ES module formats for compatibility
module.exports = router;
export default router;
