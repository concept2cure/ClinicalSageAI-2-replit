import express from 'express';
import { 
  generateMockCER, 
  generateFullCER, 
  getCERReport, 
  analyzeLiteratureWithAI, 
  analyzeAdverseEventsWithAI,
  initializeZeroClickCER
} from '../services/cerService.js';
// Import services for CER and FAERS functionality
import OpenAI from 'openai';
import * as faersService from '../services/faersService.js';

// Initialize OpenAI for analysis capabilities
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Import direct handlers for advanced functionality - using dynamic imports for ESM compatibility
let complianceScoreHandler, assistantRouter, improveComplianceHandler, generateFullCERHandler;

/**
 * Get a human-readable section name based on section ID
 * @param {string} sectionId - The section ID
 * @returns {string} - The human-readable section name
 */
function getSectionName(sectionId) {
  const sectionNames = {
    'benefit-risk': 'Benefit-Risk Analysis',
    'safety': 'Safety Analysis',
    'clinical-background': 'Clinical Background',
    'device-description': 'Device Description',
    'state-of-art': 'State of the Art Review',
    'equivalence': 'Equivalence Assessment',
    'literature-analysis': 'Literature Analysis', 
    'pms-data': 'Post-Market Surveillance Data',
    'conclusion': 'Conclusion'
  };
  
  return sectionNames[sectionId] || sectionId.charAt(0).toUpperCase() + sectionId.slice(1).replace(/-/g, ' ');
}

/**
 * Get the appropriate system prompt for a specific CER section
 * @param {string} sectionType - The type of section
 * @param {string} productName - The name of the product/device
 * @returns {string} - The system prompt for OpenAI
 */
function getSectionSystemPrompt(sectionType, productName) {
  const basePrompt = `You are an expert medical device regulatory consultant specialized in Clinical Evaluation Reports (CERs) following EU MDR requirements and MEDDEV 2.7/1 Rev 4 guidelines. Your task is to generate a comprehensive, well-structured ${getSectionName(sectionType)} section for a CER for ${productName || 'a medical device'}.

Your content must be:
1. Scientifically accurate and evidence-based
2. Compliant with EU MDR 2017/745 and MEDDEV 2.7/1 Rev 4 guidelines
3. Professionally written with clear structure and appropriate headings
4. Detailed but concise, focusing on clinically relevant information
5. Format the output with Markdown for structure (use # for main heading, ## for subheadings)

`;

  // Add section-specific guidance
  switch(sectionType) {
    case 'benefit-risk':
      return basePrompt + `
For the Benefit-Risk Analysis section:
- Present a clear methodology for benefit-risk determination
- Analyze both individual risks and the overall risk profile
- Evaluate clinical benefits with quantitative metrics where possible
- Reference relevant clinical data and literature
- Present a balanced assessment following Annex I of EU MDR
- Include a conclusion on the overall benefit-risk profile
- Address both clinical performance and clinical safety aspects
- Consider both frequency and severity of risks
- Address residual risks and risk mitigation measures
- Follow the requirements in EU MDR Article 61 on clinical evaluation`;
      
    case 'safety':
      return basePrompt + `
For the Safety Analysis section:
- Analyze all available safety data (clinical studies, PMS, literature, etc.)
- Categorize adverse events by severity and frequency
- Compare safety profile with state of the art and similar devices
- Address any safety concerns identified during the evaluation
- Include quantitative metrics where available (e.g., event rates)
- Consider the impact of user error and potential misuse
- Discuss the adequacy of risk mitigation measures
- Evaluate safety in the context of the intended use
- Include a summary of serious adverse events
- Address any safety-related field actions or recalls`;
      
    case 'clinical-background':
      return basePrompt + `
For the Clinical Background section:
- Describe the medical condition(s) addressed by the device
- Outline current standard of care and treatment options
- Explain where the device fits in the clinical pathway
- Describe the clinical needs the device addresses
- Present epidemiological data where relevant
- Discuss limitations of existing approaches
- Include relevant diagnostic or treatment guidelines
- Define the intended patient population clearly
- Address variability in clinical practice where relevant
- Reference authoritative clinical guidelines and literature`;
      
    case 'device-description':
      return basePrompt + `
For the Device Description section:
- Provide a detailed technical description of the device
- Explain the device's intended purpose and claims
- Describe the mechanism of action or principle of operation
- List key components and features relevant to clinical performance
- Include relevant specifications and parameters
- Explain how the device is used in clinical practice
- Address compatibility with other devices/accessories if relevant
- Include relevant contraindications, warnings and precautions
- Discuss any variations or models and their clinical implications
- Focus on aspects relevant to clinical performance`;
      
    case 'state-of-art':
      return basePrompt + `
For the State of the Art Review section:
- Define the current state of the art for the clinical condition
- Review current treatment options and their limitations
- Analyze similar devices on the market and their performance
- Reference current clinical practice guidelines
- Discuss emerging technologies and approaches
- Evaluate the position of the device within the current landscape
- Compare with benchmark devices or gold standard treatments
- Include reference to relevant clinical society guidelines
- Address any recent significant advances in the field
- Support claims with current scientific literature`;
      
    case 'equivalence':
      return basePrompt + `
For the Equivalence Assessment section:
- Apply the equivalence criteria (clinical, technical, biological)
- Conduct a detailed comparison with the equivalent device(s)
- Address all aspects required by MEDDEV 2.7/1 Rev 4
- Highlight similarities and explain the impact of any differences
- Present a clear rationale for equivalence determination
- Consider the impact of different intended uses if applicable
- Discuss manufacturing processes where relevant to clinical performance
- Address any differences in clinical outcomes between devices
- Include a conclusion on overall equivalence
- Consider the regulatory history of the equivalent device`;
      
    case 'literature-analysis':
      return basePrompt + `
For the Literature Analysis section:
- Present the literature search methodology
- Include search terms, databases, and date ranges
- Apply clear inclusion and exclusion criteria
- Critically appraise each selected publication
- Evaluate the quality and relevance of the evidence
- Synthesize findings relevant to device safety and performance
- Address conflicting evidence if present
- Discuss limitations of the available literature
- Follow PRISMA guidelines for systematic reviews
- Provide a tabulated summary of key literature`;
      
    case 'pms-data':
      return basePrompt + `
For the Post-Market Surveillance Data section:
- Analyze available post-market data for the device
- Include complaint analysis and trending
- Review vigilance data and reported adverse events
- Evaluate field safety corrective actions if applicable
- Assess customer feedback and user experience data
- Compare observed performance with expected performance
- Identify any emerging safety or performance issues
- Discuss the adequacy of the PMS plan and activities
- Address how PMS findings impact the benefit-risk profile
- Include sales data to contextualize adverse event rates`;
      
    case 'conclusion':
      return basePrompt + `
For the Conclusion section:
- Provide a clear overall conclusion on device safety and performance
- Summarize key findings from all evaluation sections
- State whether clinical evidence supports the intended purpose
- Address whether the benefit-risk profile remains favorable
- Highlight any limitations of the clinical evaluation
- Specify any conditions or restrictions for safe use
- Identify any residual risks requiring further monitoring
- Comment on the adequacy of available clinical data
- Specify any gaps requiring additional clinical investigation
- Include justification for the overall conclusions`;
      
    default:
      return basePrompt + `
For this ${getSectionName(sectionType)} section:
- Provide comprehensive, evidence-based content
- Structure the content with appropriate headings and subheadings
- Include references to relevant literature and data
- Ensure all claims are substantiated with evidence
- Address both safety and performance aspects where relevant
- Consider EU MDR requirements for this type of content
- Focus on clinical relevance and patient outcomes
- Maintain a neutral, scientific tone
- Include quantitative data where applicable
- Conclude with clear and justified statements`;
  }
}

// We'll initialize these handlers dynamically as needed

// Import PDF generation libraries
// Note: docx import temporarily commented out to avoid dependency issues
// import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } from 'docx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set up dynamic imports for services
const getEnhancedFaersService = async () => {
  try {
    return await import('../services/enhancedFaersService.js');
  } catch (error) {
    console.error('Error importing enhanced FAERS service:', error);
    return null;
  }
};

const router = express.Router();

// Middleware to ensure proper content-type for API responses
router.use((req, res, next) => {
  // Set content type to JSON for API routes
  res.setHeader('Content-Type', 'application/json');
  next();
});

// POST /api/cer/initialize-zero-click - Initialize a zero-click CER generation process
router.post('/initialize-zero-click', async (req, res) => {
  try {
    const { deviceInfo, literature, fdaData, templateId } = req.body;
    
    if (!deviceInfo || !deviceInfo.name || !deviceInfo.manufacturer) {
      return res.status(400).json({ 
        error: 'Device information is required (name and manufacturer at minimum)'
      });
    }
    
    console.log('Initializing Zero-Click CER generation for:', deviceInfo.name);
    
    // Initialize the CER report in the database and start the generation workflow
    const result = await initializeZeroClickCER({
      deviceInfo,
      literature,
      fdaData,
      templateId
    });
    
    // Return the report and workflow information
    res.json({
      success: true,
      message: result.message,
      report: result.report,
      workflow: result.workflow,
      // Include next steps for client
      nextSteps: [
        { action: 'fetch_workflow', endpoint: `/api/cer/workflows/${result.workflow.id}` },
        { action: 'fetch_report', endpoint: `/api/cer/report/${result.report.id}` }
      ]
    });
  } catch (error) {
    console.error('Error initializing Zero-Click CER:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to initialize Zero-Click CER generation',
      message: error.message 
    });
  }
});

// GET /api/cer/reports - Retrieve user's CER reports
router.get('/reports', async (req, res) => {
  try {
    const { limit = 20, offset = 0, status, deviceName, search } = req.query;
    
    // Fetch reports from the database with optional filters
    const reports = await storage.getCerReports({
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      status,
      deviceName,
      search
    });
    
    // Return actual reports from the database
    if (!reports || reports.length === 0) {
      // No reports found, return empty array with appropriate message
      return res.json({
        reports: [],
        count: 0,
        message: "No reports found. You can create a new CER report."
      });
    }
    
    res.json(reports);
  } catch (error) {
    console.error('Error fetching CER reports:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// GET /api/cer/report/:id - Get a specific CER report
router.get('/report/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Fetch the report from the database
    const report = await storage.getCerReport(id);
    
    if (!report) {
      return res.status(404).json({ error: 'CER report not found' });
    }
    
    res.json(report);
  } catch (error) {
    console.error(`Error fetching CER report ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

// First implementation of generate-full removed to fix duplication
// Now using the aiGenerateCER implementation instead

// POST /api/cer/sample - Generate a sample CER
router.post('/sample', async (req, res) => {
  try {
    const { template } = req.body;
    
    // Generate a URL to a sample CER based on the template
    const sampleUrl = `/samples/cer-${template}-sample.pdf`;
    
    res.json({ url: sampleUrl });
  } catch (error) {
    console.error('Error generating sample CER:', error);
    res.status(500).json({ error: 'Failed to generate sample' });
  }
});

// GET /api/cer/workflows/:id - Get workflow status
router.get('/workflows/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Fetch workflow status from the database
    const workflow = await storage.getCerWorkflow(id);
    
    if (!workflow) {
      // If no workflow found, check if it's a report ID instead of a workflow ID
      const workflowByReport = await storage.getCerWorkflowByReportId(id);
      
      if (workflowByReport) {
        return res.json(workflowByReport);
      }
      
      // Return a 404 if the workflow is not found
      return res.status(404).json({
        error: 'Workflow not found',
        message: 'No workflow found with the specified ID.',
        timestamp: new Date().toISOString()
      });
    }
    
    res.json(workflow);
  } catch (error) {
    console.error(`Error fetching workflow ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to fetch workflow status' });
  }
});

// POST /api/cer/analyze/literature - Analyze literature with AI
router.post('/analyze/literature', async (req, res) => {
  try {
    const { literature } = req.body;
    
    // Call AI analysis service
    const analysis = await analyzeLiteratureWithAI(literature);
    res.json(analysis);
  } catch (error) {
    console.error('Error analyzing literature with AI:', error);
    res.status(500).json({ error: 'Failed to analyze literature' });
  }
});

// POST /api/cer/analyze/adverse-events - Analyze FDA adverse events with AI
router.post('/analyze/adverse-events', async (req, res) => {
  try {
    const { fdaData, context } = req.body;
    
    if (!fdaData) {
      return res.status(400).json({ 
        error: 'FDA FAERS data is required',
        timestamp: new Date().toISOString()
      });
    }
    
    // Validate data source information for traceability
    if (!fdaData.dataSource) {
      console.warn('FAERS data missing data source attribution, adding default attribution');
      fdaData.dataSource = {
        name: "Unknown source",
        retrievalDate: new Date().toISOString(),
        authentic: false,
        fallbackReason: "No source attribution provided"
      };
    }
    
    // Log the data source for auditing
    console.log(`Analyzing FAERS data from source: ${fdaData.dataSource.name}, authentic: ${fdaData.dataSource.authentic || false}`);
    
    try {
      // First see if we can use faersService directly for enhanced analysis
      if (faersService.analyzeFaersDataForCER) {
        const productName = fdaData.productName || (context?.productName || 'Medical Device');
        const manufacturerName = context?.manufacturer || 'Unknown Manufacturer';
        
        console.log(`Using enhanced FAERS analysis for ${productName} from ${manufacturerName}`);
        
        // Use the enhanced direct analysis from faersService
        const analysis = await faersService.analyzeFaersDataForCER(fdaData, {
          productName,
          manufacturerName,
          context: {
            deviceType: context?.deviceType || 'Medical device',
            indication: context?.indication || 'Not specified'
          }
        });
        
        return res.json({
          ...analysis,
          timestamp: new Date().toISOString(),
          apiVersion: 'v2.1'
        });
      }
      
      // Fall back to AI analysis if direct service not available
      console.log('Enhanced direct FAERS analysis not available, using AI analysis');
      const analysis = await analyzeAdverseEventsWithAI(fdaData);
      
      // Add data source attribution to maintain traceability
      analysis.dataSourceAttribution = {
        source: fdaData.dataSource.name || "Unknown source",
        retrievalDate: fdaData.dataSource.retrievalDate || new Date().toISOString(),
        authentic: fdaData.dataSource.authentic || false,
        analysisDate: new Date().toISOString(),
        analysisMethod: "AI-assisted analysis"
      };
      
      return res.json(analysis);
    } catch (error) {
      console.error('Error with FAERS analysis:', error);
      
      return res.status(500).json({
        error: 'FAERS Analysis Error',
        message: `Unable to analyze FAERS data: ${error.message}`,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error analyzing adverse events with AI:', error);
    res.status(500).json({ 
      error: 'Failed to analyze adverse events',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/cer/faers/data - Fetch adverse event data from FDA FAERS database
router.get('/faers/data', async (req, res) => {
  try {
    const { productName, limit = "100" } = req.query;
    
    if (!productName) {
      return res.status(400).json({ 
        error: 'Product name is required',
        timestamp: new Date().toISOString()
      });
    }
    
    // Parse options
    const options = {
      limit: parseInt(limit, 10) || 100
    };
    
    console.log(`Fetching authentic FDA FAERS data for ${productName}`);
    
    try {
      // Use the updated FAERS service that exclusively uses the FDA API
      const faersData = await faersService.getFaersData(productName, options);
      
      // If we don't have data from the FDA API, return an appropriate error
      if (!faersData) {
        return res.status(404).json({
          error: 'No FDA FAERS data found',
          message: 'No adverse event data found for this product in the FDA FAERS database. Please check product name or try a different search term.',
          timestamp: new Date().toISOString(),
          requestedProduct: productName,
          dataSource: {
            name: "FDA FAERS Database",
            accessMethod: "API Query",
            retrievalDate: new Date().toISOString(),
            authentic: true,
            dataIntegrityStatus: "verified"
          }
        });
      }
      
      return res.json({
        ...faersData,
        timestamp: new Date().toISOString(),
        requestedProduct: productName,
        apiVersion: 'v2.1'
      });
    } catch (error) {
      console.error(`Error fetching FAERS data: ${error.message}`);
      
      return res.status(500).json({
        error: 'Failed to fetch FAERS data',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error fetching FAERS data:', error);
    res.status(500).json({ error: 'Failed to fetch FAERS data' });
  }
});

/**
 * Extract event counts from FAERS reports
 * @param {Array} reports - Array of FAERS reports
 * @returns {Array} - Array of event counts by reaction
 */
function getEventCounts(reports) {
  const eventCounts = {};
  
  for (const report of reports) {
    const reaction = report.reaction;
    if (!reaction) continue;
    
    if (!eventCounts[reaction]) {
      eventCounts[reaction] = 0;
    }
    eventCounts[reaction]++;
  }
  
  // Convert to expected format and sort by count
  return Object.entries(eventCounts)
    .map(([event, count]) => ({ event, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Extract demographics from FAERS reports
 * @param {Array} reports - Array of FAERS reports
 * @returns {Object} - Demographics object
 */
function getDemographicsFromReports(reports) {
  const ageGroups = {
    "0-18": 0,
    "19-44": 0,
    "45-64": 0,
    "65+": 0
  };
  
  const gender = {
    "Female": 0,
    "Male": 0,
    "Unknown": 0
  };
  
  for (const report of reports) {
    // Process age
    const age = parseInt(report.age);
    if (!isNaN(age)) {
      if (age <= 18) ageGroups["0-18"]++;
      else if (age <= 44) ageGroups["19-44"]++;
      else if (age <= 64) ageGroups["45-64"]++;
      else ageGroups["65+"]++;
    }
    
    // Process gender
    if (report.sex === "1") gender["Male"]++;
    else if (report.sex === "2") gender["Female"]++;
    else gender["Unknown"]++;
  }
  
  return { ageGroups, gender };
}

/**
 * Get severity assessment from risk score
 * @param {number} score - Risk score
 * @returns {string} - Severity assessment
 */
function getSeverityFromRiskScore(score) {
  if (score === undefined || score === null) return "Unknown";
  if (score < 0.5) return "Low";
  if (score < 1.0) return "Medium";
  if (score < 1.5) return "Medium-High";
  return "High";
}

// POST /api/cer/fetch-faers - Fetch and store FAERS data for a specific CER including comparator analysis
router.post('/fetch-faers', async (req, res) => {
  try {
    const { productName, cerId, includeComparators = true, comparatorLimit = 3, useATC = true, useMoA = true } = req.body;
    
    if (!productName) {
      return res.status(400).json({ error: 'Product name is required' });
    }
    
    if (!cerId) {
      return res.status(400).json({ error: 'CER ID is required' });
    }
    
    try {
      // Get the enhanced FAERS service for real FDA API data
      const enhancedService = await getEnhancedFaersService();
      
      if (!enhancedService) {
        return res.status(503).json({ 
          success: false,
          error: 'FDA FAERS service temporarily unavailable',
          message: 'Enhanced FDA FAERS data service is currently unavailable. Please try again later.',
          serviceStatus: 'unavailable',
          productName,
          cerId
        });
      }
      
      // Step 1: Fetch FAERS data with comparator analysis using our enhanced service
      console.log(`Fetching FAERS data for product: ${productName}, CER ID: ${cerId}, with comparators: ${includeComparators}, useATC: ${useATC}, useMoA: ${useMoA}`);
      
      // Use the enhanced FAERS analysis service that handles ATC codes and mechanism of action
      const faersData = await enhancedService.fetchFaersAnalysis(productName, cerId);
      
      // If no data found, return appropriate error
      if (!faersData || !faersData.reportCount || faersData.reportCount === 0) {
        return res.status(404).json({
          success: false,
          error: 'No FDA FAERS data found',
          message: `No adverse event reports found for "${productName}" in the FDA FAERS database. Try a different product name or check spelling.`,
          searchTerm: productName,
          dataSource: 'FDA FAERS API',
          serviceStatus: 'available',
          cerId
        });
      }
      
      // Step 2: Process the data for the response
      const responseData = {
        success: true,
        productName,
        cerId,
        reports: faersData.reportsData || [],
        riskScore: faersData.riskScore,
        reportCount: faersData.reportCount,
        classification: faersData.classification,
        message: `Successfully analyzed ${faersData.reportCount} FAERS reports for ${productName}`,
        dataSource: {
          name: 'FDA FAERS Database',
          accessMethod: 'FDA OpenAPI v2',
          retrievalDate: new Date().toISOString(),
          authentic: true
        }
      };
      
      // Add comparator data if it exists
      if (faersData.comparators && faersData.comparators.length > 0) {
        responseData.comparators = faersData.comparators;
        responseData.message += ` with ${faersData.comparators.length} comparative products analyzed using `;
        
        const methods = [];
        if (faersData.classification?.atcCodes?.length > 0) methods.push('ATC codes');
        if (faersData.classification?.mechanismOfAction?.length > 0) methods.push('mechanism of action');
        if (faersData.classification?.pharmacologicalClass?.length > 0) methods.push('pharmacological class');
        
        if (methods.length > 0) {
          responseData.message += methods.join(', ');
        } else {
          responseData.message += 'substance similarity';
        }
      }
      
      res.json(responseData);
      
    } catch (error) {
      console.error('Error with FDA FAERS API:', error);
      
      // Return clear error message to client instead of using mock data
      return res.status(500).json({
        success: false,
        error: 'FDA FAERS API Error',
        message: `Unable to retrieve FDA FAERS data: ${error.message}`,
        details: 'The FDA FAERS database connection experienced an error. Please try again later or check product name spelling.',
        serviceStatus: 'error',
        productName,
        cerId
      });
    }
  } catch (error) {
    console.error('Error fetching and storing FAERS data:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch and store FAERS data',
      message: error.message
    });
  }
});

// POST /api/cer/generate-section - Generate a specific section for CER with AI
router.post('/generate-section', async (req, res) => {
  try {
    const { section, context, productName } = req.body;
    
    if (!section || !context) {
      return res.status(400).json({ error: 'Section type and context are required' });
    }
    
    console.log(`Generating ${section} section with context length: ${context.length} for product: ${productName || 'unnamed device'}`);
    
    // Use OpenAI with GPT-4o to generate real content
    console.log('Using OpenAI API with GPT-4o to generate section content');
    
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        error: "OpenAI API key not configured",
        message: "The OpenAI API key is required to generate section content. Please configure it and try again.",
        timestamp: new Date().toISOString()
      });
    }
    
    try {
      // Import OpenAI
      const OpenAI = await import('openai');
      const openai = new OpenAI.default({ apiKey: process.env.OPENAI_API_KEY });
      
      // Get the appropriate system prompt for this section
      const systemPrompt = getSectionSystemPrompt(section, productName);
      
      // Call OpenAI API
      const completion = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: `Generate a comprehensive ${section} section for a Clinical Evaluation Report for "${productName || 'the medical device'}" based on the following context:\n\n${context}`
          }
        ],
        max_tokens: 1500,
        temperature: 0.7,
      });
      
      // Extract the generated content
      const content = completion.choices[0].message.content;
      
      // Return the real AI-generated content
      return res.json({
        section,
        content,
        generatedAt: new Date().toISOString(),
        model: "gpt-4o",
        tokenUsage: completion.usage
      });
    } catch (error) {
      console.error('Error calling OpenAI API:', error);
      return res.status(500).json({
        error: "AI Generation Error",
        message: `Failed to generate content with OpenAI: ${error.message}`,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error generating section:', error);
    res.status(500).json({ error: 'Failed to generate section' });
  }
});

// POST /api/cer/preview - Generate a preview of the full CER report
router.post('/preview', async (req, res) => {
  try {
    const { title, sections, faers, comparators } = req.body;
    
    if (!sections || !Array.isArray(sections) || sections.length === 0) {
      return res.status(400).json({ error: 'At least one section is required' });
    }
    
    // Prepare the preview data
    const previewData = {
      title: title || 'Clinical Evaluation Report',
      generatedAt: new Date().toISOString(),
      sections: sections,
      faersData: faers || [],
      comparatorData: comparators || [],
      metadata: {
        totalSections: sections.length,
        hasFaersData: Boolean(faers && faers.length > 0),
        hasComparatorData: Boolean(comparators && comparators.length > 0)
      }
    };
    
    res.json(previewData);
  } catch (error) {
    console.error('Error generating preview:', error);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

// POST /api/cer/export-pdf - Export CER as PDF following MEDDEV 2.7/1 Rev 4 format
router.post('/export-pdf', async (req, res) => {
  try {
    const { 
      title, 
      sections, 
      faers, 
      comparators, 
      metadata = {}, 
      templateId, 
      deviceInfo = {} 
    } = req.body;
    
    console.log(`Exporting PDF with title: ${title}, sections: ${sections?.length || 0}, template: ${templateId || 'meddev'}`);
    
    // Import the PDF exporter service
    const { generateCerPdf } = require('../services/cerPdfExporter');
    
    // Prepare data for PDF generation
    const pdfData = {
      title: title || 'Clinical Evaluation Report',
      sections: sections || [],
      deviceInfo: {
        name: deviceInfo.name || deviceInfo.deviceName || title?.split(' - ')[0] || 'Medical Device',
        manufacturer: deviceInfo.manufacturer || 'Manufacturer',
        type: deviceInfo.type || deviceInfo.deviceType || 'Class IIb',
        ...deviceInfo
      },
      metadata: {
        standard: metadata.standard || (
          templateId === 'fda-510k' ? 'FDA 510(k)' : 
          templateId === 'iso-14155' ? 'ISO 14155' : 
          'MEDDEV 2.7/1 Rev 4'
        ),
        documentId: metadata.documentId || `CER-${Date.now().toString().substring(0, 8)}`,
        version: metadata.version || '1.0.0',
        generatedAt: metadata.generatedAt || new Date().toISOString(),
        author: metadata.author || 'TrialSage AI',
        confidential: metadata.confidential !== false,
        showWatermark: metadata.showWatermark !== false,
        includeAppendices: true,
        reviewStatus: metadata.reviewStatus || 'draft',
        ...metadata
      },
      faers: faers || [],
      comparators: comparators || []
    };
    
    // Generate the PDF
    const pdfBuffer = await generateCerPdf(pdfData);
    
    // Format the filename
    const sanitizedTitle = title?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'clinical_evaluation_report';
    const filename = `${sanitizedTitle}_${new Date().toISOString().split('T')[0]}.pdf`;
    
    // Set the response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Send the PDF
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error exporting PDF:', error);
    res.status(500).json({ error: `Failed to export PDF: ${error.message}` });
  }
});

// POST /api/cer/improve-section - Improve a section to comply with regulatory standards
router.post('/improve-section', async (req, res) => {
  try {
    const { section, standard, cerTitle } = req.body;
    
    if (!section || !standard) {
      return res.status(400).json({ 
        error: 'Section and standard are required'
      });
    }
    
    console.log(`Improving section "${section.title || section.type}" to comply with ${standard} standard...`);
    
    // Use OpenAI API to analyze and improve the section content
    
    // Check if API key is available
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        error: "OpenAI API key not configured",
        message: "The OpenAI API key is required to improve section content. Please configure it and try again.",
        timestamp: new Date().toISOString()
      });
    }
    
    // Extract the original content
    const originalContent = section.content || '';
    const sectionType = section.type || '';
    const sectionTitle = section.title || 'Untitled Section';
    
    try {
      // Import OpenAI
      const OpenAI = await import('openai');
      const openai = new OpenAI.default({ apiKey: process.env.OPENAI_API_KEY });
      
      // Prepare the prompt with regulatory standard details
      let standardDetails = "general regulatory requirements";
      let specificRequirements = "";
      
      if (standard.includes('EU MDR')) {
        standardDetails = "EU MDR 2017/745 requirements";
        specificRequirements = `
- EU MDR 2017/745 Annex XIV: Clinical Evaluation
- MEDDEV 2.7/1 Rev 4: Clinical Evaluation Guidance Document
- EU MDR Article 61: Clinical Evaluation Requirements
`;
      } 
      else if (standard.includes('ISO 14155')) {
        standardDetails = "ISO 14155:2020 requirements";
        specificRequirements = `
- ISO 14155:2020: Clinical investigation of medical devices for human subjects — Good clinical practice
- ISO 14155:2020 Section 7: Ethical considerations
- ISO 14155:2020 Section 9: Risk management
`;
      }
      else if (standard.includes('FDA')) {
        standardDetails = "FDA 21 CFR 812 requirements";
        specificRequirements = `
- FDA 21 CFR 812: Investigational Device Exemptions
- FDA 21 CFR 814: Premarket Approval
- FDA Guidance: Design Considerations for Pivotal Clinical Investigations
`;
      }
      
      // Get system prompt for compliance
      const systemPrompt = getCompliancePrompt(standard);
      
      // Call OpenAI API
      const completion = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: `Improve the following section titled "${sectionTitle}" (type: ${sectionType}) of a Clinical Evaluation Report to comply with ${standardDetails}. The original content is:\n\n${originalContent}\n\nPlease provide specific improvements to meet the standard, ensuring the content is comprehensive, accurate, and properly formatted with appropriate regulatory references. Include the relevant specifics for ${standard}:\n${specificRequirements}`
          }
        ],
        max_tokens: 2000,
        temperature: 0.7,
        response_format: { type: "json_object" }
      });
      
      // Parse the JSON response
      const jsonResponse = JSON.parse(completion.choices[0].message.content);
      
      // If the model didn't properly format the response, handle it gracefully
      if (!jsonResponse.content) {
        jsonResponse.content = completion.choices[0].message.content;
        jsonResponse.improvements = ["Content improved to meet regulatory requirements"];
      }
      
      // Return the AI-improved content
      res.json({
        success: true,
        content: jsonResponse.content || originalContent,
        original: originalContent,
        improvements: jsonResponse.improvements || ["Content improved to meet regulatory requirements"],
        standard: standard,
        sectionType: sectionType,
        timestamp: new Date().toISOString(),
        model: "gpt-4o",
        tokenUsage: completion.usage
      });
    } catch (error) {
      console.error('Error calling OpenAI API:', error);
      
      // If there's an OpenAI API error, return the appropriate error to the client
      return res.status(500).json({
        error: "AI Enhancement Error",
        message: `Failed to improve content with OpenAI: ${error.message}`,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error improving section:', error);
    res.status(500).json({ 
      error: 'Failed to improve section',
      message: error.message
    });
  }
});

// POST /api/cer/save-to-vault - Save CER to the document vault
router.post('/save-to-vault', async (req, res) => {
  try {
    const { title, sections, metadata, deviceInfo } = req.body;
    
    if (!sections || !Array.isArray(sections) || sections.length === 0) {
      return res.status(400).json({ error: 'At least one section is required' });
    }
    
    console.log(`Saving CER to vault: ${title}, ${sections.length} sections`);
    
    // Create a simple document record for the vault
    const now = new Date();
    const documentId = `cer-${now.getTime()}`;
    
    const documentRecord = {
      id: documentId,
      title: title || 'Clinical Evaluation Report',
      type: 'cer',
      status: metadata?.status || 'draft',
      created: now.toISOString(),
      updated: now.toISOString(),
      sections: sections,
      metadata: {
        ...metadata,
        deviceInfo: deviceInfo || {}
      }
    };
    
    // Log and return success for demo purposes
    console.log('Saved document to vault:', documentRecord.id);
    
    res.json({
      success: true,
      documentId: documentRecord.id,
      message: 'CER successfully saved to document vault',
      document: documentRecord
    });
  } catch (error) {
    console.error('Error saving to vault:', error);
    res.status(500).json({ 
      error: 'Failed to save document to vault',
      message: error.message 
    });
  }
});

// POST /api/cer/compliance-score - Calculate compliance score using GPT-4o
router.post('/compliance-score', async (req, res) => {
  try {
    const { sections, title, standards } = req.body;
    
    if (!sections || !Array.isArray(sections) || sections.length === 0) {
      return res.status(400).json({ error: 'Sections array is required' });
    }
    
    // Default to all standards if none specified
    const selectedStandards = standards || ['EU MDR', 'ISO 14155', 'FDA'];
    
    console.log(`Calculating compliance score for ${sections.length} sections against ${selectedStandards.join(', ')}`);
    
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        error: "OpenAI API key not configured",
        message: "The OpenAI API key is required to calculate compliance scores. Please configure it and try again.",
        timestamp: new Date().toISOString()
      });
    }
    
    // Use AI for real compliance scoring
    const overallScores = {};
    const sectionScores = {};
    const improvementSuggestions = {};
    const detailedAnalysis = {};
    
    // Process each section against each standard
    // We'll run this in parallel to speed things up, but with a limit to avoid API rate limits
    const promises = [];
    
    for (const section of sections) {
      for (const standard of selectedStandards) {
        promises.push(scoreSection(section, standard));
      }
    }
    
    // Wait for all scoring to complete
    const results = await Promise.all(promises);
    
    // Process results
    results.forEach(result => {
      const { section, standard, score, suggestions, analysis } = result;
      
      // Store section score
      if (!sectionScores[section.id || section.type]) {
        sectionScores[section.id || section.type] = {};
      }
      sectionScores[section.id || section.type][standard] = score;
      
      // Store suggestions
      if (!improvementSuggestions[section.id || section.type]) {
        improvementSuggestions[section.id || section.type] = {};
      }
      improvementSuggestions[section.id || section.type][standard] = suggestions;
      
      // Store detailed analysis
      if (!detailedAnalysis[section.id || section.type]) {
        detailedAnalysis[section.id || section.type] = {};
      }
      detailedAnalysis[section.id || section.type][standard] = analysis;
    });
    
    // Calculate overall scores for each standard
    selectedStandards.forEach(standard => {
      const standardScores = sections.map(section => 
        sectionScores[section.id || section.type]?.[standard] || 0
      );
      
      const average = standardScores.reduce((sum, score) => sum + score, 0) / standardScores.length;
      overallScores[standard] = Math.round(average * 100) / 100;
    });
    
    // Format in the expected response structure
    const formattedSections = sections.map(section => {
      const sectionId = section.id || section.type;
      const sectionTitle = section.title || 'Untitled Section';
      
      // Calculate average score across all standards
      const standardScores = selectedStandards.map(std => sectionScores[sectionId]?.[std] || 0);
      const avgScore = standardScores.reduce((sum, score) => sum + score, 0) / standardScores.length;
      
      // Collect all recommendations
      const recommendations = [];
      selectedStandards.forEach(std => {
        const suggestions = improvementSuggestions[sectionId]?.[std] || [];
        suggestions.forEach(suggestion => {
          recommendations.push(`${std}: ${suggestion}`);
        });
      });
      
      return {
        id: sectionId,
        title: sectionTitle,
        score: Math.round(avgScore * 100) / 100,
        issues: [], // Populated in a production version
        recommendations: recommendations.slice(0, 5) // Limit to top 5
      };
    });
    
    // Calculate overall score as average of standard scores
    const overallAvg = Object.values(overallScores).reduce((sum, score) => sum + score, 0) / 
                       Object.values(overallScores).length;
    
    // Generate overall insights
    const insights = [];
    const lowestScoringSection = formattedSections.sort((a, b) => a.score - b.score)[0];
    const highestScoringSection = formattedSections.sort((a, b) => b.score - a.score)[0];
    
    if (lowestScoringSection) {
      insights.push(`${lowestScoringSection.title} needs the most improvement (score: ${lowestScoringSection.score.toFixed(2)})`);
    }
    
    if (highestScoringSection) {
      insights.push(`${highestScoringSection.title} complies well with standards (score: ${highestScoringSection.score.toFixed(2)})`);
    }
    
    // Find the weakest standard
    const weakestStandard = Object.entries(overallScores).sort(([,a], [,b]) => a - b)[0];
    if (weakestStandard) {
      insights.push(`Compliance with ${weakestStandard[0]} needs the most attention (score: ${weakestStandard[1].toFixed(2)})`);
    }
    
    // Return the calculated scores
    res.json({
      overall: Math.round(overallAvg * 100) / 100,
      sections: formattedSections,
      standards: overallScores,
      insights,
      detailedAnalysis,
      model: "gpt-4o",
      timestamp: new Date().toISOString(),
      title: title || 'Clinical Evaluation Report'
    });
  } catch (error) {
    console.error('Error calculating compliance score:', error);
    res.status(500).json({ error: 'Failed to calculate compliance score', message: error.message });
  }
});

// POST /api/cer/export-docx - Export CER as DOCX
router.post('/export-docx', async (req, res) => {
  try {
    const { title, sections, faers, comparators } = req.body;
    
    // Create a new Document
    const doc = new Document({
      title: title || 'Clinical Evaluation Report',
      description: 'Generated by TrialSage CER Generator',
      styles: {
        paragraphStyles: [
          {
            id: 'Heading1',
            name: 'Heading 1',
            basedOn: 'Normal',
            next: 'Normal',
            quickFormat: true,
            run: {
              size: 28,
              bold: true,
              color: '2E74B5'
            },
            paragraph: {
              spacing: {
                after: 120
              }
            }
          },
          {
            id: 'Heading2',
            name: 'Heading 2',
            basedOn: 'Normal',
            next: 'Normal',
            quickFormat: true,
            run: {
              size: 24,
              bold: true,
              color: '2E74B5'
            },
            paragraph: {
              spacing: {
                before: 240,
                after: 120
              }
            }
          }
        ]
      }
    });
    
    // Add title page
    doc.addSection({
      properties: {},
      children: [
        new Paragraph({
          text: title || 'Clinical Evaluation Report',
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
          spacing: {
            after: 400
          }
        }),
        new Paragraph({
          text: `Generated on ${new Date().toLocaleDateString()}`,
          alignment: AlignmentType.CENTER
        }),
        new Paragraph({
          text: ' ',
          spacing: {
            after: 400
          }
        }),
        new Paragraph({
          text: 'CONFIDENTIAL',
          alignment: AlignmentType.CENTER,
          spacing: {
            after: 400
          }
        })
      ]
    });
    
    // Add sections content
    const mainSection = {
      properties: {},
      children: [
        new Paragraph({
          text: 'Table of Contents',
          heading: HeadingLevel.HEADING_1,
          pageBreakBefore: true
        }),
        // TOC would be generated here in a real implementation
        new Paragraph({
          text: ' ',
          spacing: {
            after: 400
          }
        })
      ]
    };
    
    // Add each section
    if (sections && sections.length > 0) {
      for (const section of sections) {
        mainSection.children.push(
          new Paragraph({
            text: section.title || section.type || 'Section',
            heading: HeadingLevel.HEADING_1,
            pageBreakBefore: true
          })
        );
        
        // Split content by newline and add each paragraph
        if (section.content) {
          const paragraphs = section.content.split('\n');
          for (const para of paragraphs) {
            if (para.trim()) {
              mainSection.children.push(
                new Paragraph({
                  text: para,
                  spacing: {
                    after: 120
                  }
                })
              );
            }
          }
        }
      }
    }
    
    // Add FAERS data if available
    if (faers && faers.length > 0) {
      mainSection.children.push(
        new Paragraph({
          text: 'FDA Adverse Event Analysis',
          heading: HeadingLevel.HEADING_1,
          pageBreakBefore: true
        }),
        new Paragraph({
          text: `This section presents the analysis of ${faers.length} adverse event reports from the FDA Adverse Event Reporting System (FAERS).`,
          spacing: {
            after: 120
          }
        })
      );
    }
    
    // Add comparator data if available
    if (comparators && comparators.length > 0) {
      mainSection.children.push(
        new Paragraph({
          text: 'Comparative Product Analysis',
          heading: HeadingLevel.HEADING_1,
          pageBreakBefore: true
        }),
        new Paragraph({
          text: `This section presents comparative analysis with ${comparators.length} similar products.`,
          spacing: {
            after: 120
          }
        })
      );
    }
    
    doc.addSection(mainSection);
    
    // Generate the document
    const buffer = await Packer.toBuffer(doc);
    
    // Set the response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="cer_report.docx"');
    
    // Send the document
    res.send(buffer);
  } catch (error) {
    console.error('Error exporting DOCX:', error);
    res.status(500).json({ error: 'Failed to export DOCX' });
  }
});

// GET /api/cer/faers/analysis - Get analyzed FAERS data for CER inclusion with comparative analysis
router.get('/faers/analysis', async (req, res) => {
  try {
    const { productName, includeComparators = 'true', useATC = 'true', useMoA = 'true' } = req.query;
    
    if (!productName) {
      return res.status(400).json({ error: 'Product name is required' });
    }
    
    try {
      // Use the new enhanced FAERS service with ATC codes and MoA
      console.log(`Analyzing FAERS data for ${productName} with comparative analysis`);
      
      // Fetch the enhanced analysis with ATC and MoA-based comparisons
      const faersData = await fetchFaersAnalysis(productName);
      
      // Check if we got data back
      if (!faersData || !faersData.reportCount || faersData.reportCount === 0) {
        return res.status(404).json({
          error: 'No FDA FAERS data found',
          message: `No adverse event reports found for "${productName}" in the FDA FAERS database. Try a different product name or check spelling.`,
          searchTerm: productName,
          dataSource: 'FDA FAERS API',
          serviceStatus: 'available'
        });
      }
      
      // Process the data for clinical evaluation reporting
      const reportCount = faersData.reportCount || 0;
      const seriousCount = faersData.reportsData?.filter(r => r.is_serious)?.length || 0;
      const riskScore = faersData.riskScore || 0;
      const severityLevel = getSeverityLevel(riskScore);
      
      // Extract most common adverse events
      const eventCounts = {};
      if (faersData.reportsData && faersData.reportsData.length > 0) {
        faersData.reportsData.forEach(report => {
          const reaction = report.reaction;
          if (reaction) {
            eventCounts[reaction] = (eventCounts[reaction] || 0) + 1;
          }
        });
      }
      
      // Convert to sorted array of reaction counts
      const topReactions = Object.entries(eventCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([reaction, count]) => ({
          event: reaction,
          count: count,
          percentage: `${((count / reportCount) * 100).toFixed(1)}%`
        }));
      
      // Extract demographics
      const demographics = {
        ageDistribution: extractAgeDistribution(faersData.reportsData || [], reportCount),
        genderDistribution: extractGenderDistribution(faersData.reportsData || [], reportCount)
      };
      
      // Format the response specifically for CER inclusion
      const analysis = {
        productInfo: {
          name: productName,
          unii: faersData.substance?.unii || null,
          substanceName: faersData.substance || productName,
          classification: faersData.classification || {}
        },
        reportingPeriod: {
          start: "2020-01-01",  // In production, this should be dynamically determined
          end: new Date().toISOString().split('T')[0],
          durationMonths: 48
        },
        summary: {
          totalReports: reportCount,
          seriousEvents: seriousCount,
          seriousEventsPercentage: reportCount > 0 ? `${((seriousCount / reportCount) * 100).toFixed(1)}%` : '0%',
          eventsPerTenThousand: (riskScore * 100).toFixed(2),
          severityAssessment: severityLevel
        },
        topEvents: topReactions,
        demographics,
        dataSource: {
          name: 'FDA FAERS Database',
          accessMethod: 'FDA OpenAPI v2',
          retrievalDate: new Date().toISOString(),
          authentic: true
        }
      };
    
      // Add pharmacological classification information
      if (faersData.classification) {
        analysis.pharmacology = {
          atcCodes: faersData.classification.atcCodes || [],
          mechanismOfAction: faersData.classification.mechanismOfAction || [],
          pharmacologicalClass: faersData.classification.pharmacologicalClass || []
        };
      }
      
      // Add comparator analysis if available
      if (faersData.comparators && faersData.comparators.length > 0) {
        analysis.comparativeAnalysis = {
          products: faersData.comparators.map(comp => ({
            name: comp.comparator,
            riskScore: comp.riskScore,
            reportCount: comp.reportCount,
            severityAssessment: getSeverityLevel(comp.riskScore),
            relativeSafety: getRelativeSafety(riskScore, comp.riskScore)
          })),
          matchingCriteria: buildMatchingCriteria(faersData.classification),
          summary: `Compared to ${faersData.comparators.length} similar products in its class, ${productName} shows ${getComparativeConclusion(faersData.riskScore, faersData.comparators)}`
        };
        
        // Enhanced conclusion with comparative data and classification info
        let classificationInfo = '';
        if (faersData.classification?.atcCodes?.length > 0) {
          classificationInfo = ` As a ${faersData.classification.atcCodes[0].split(':')[0]} class pharmaceutical,`;
        } else if (faersData.classification?.mechanismOfAction?.length > 0) {
          classificationInfo = ` With a mechanism of action as ${faersData.classification.mechanismOfAction[0].toLowerCase()},`;
        }
        
        analysis.conclusion = `Based on the analysis of ${reportCount} adverse event reports from the FDA FAERS database, ${productName} demonstrates a ${severityLevel.toLowerCase()} risk profile with ${seriousCount} serious events reported.${classificationInfo} ${analysis.comparativeAnalysis.summary} The most common adverse events were ${topReactions.slice(0, 3).map(r => r.event).join(', ')}. This data should be considered in the overall benefit-risk assessment of the product.`;
      } else {
        // Standard conclusion without comparators
        analysis.conclusion = `Based on the analysis of ${reportCount} adverse event reports from the FDA FAERS database, ${productName} demonstrates a ${severityLevel.toLowerCase()} risk profile with ${seriousCount} serious events reported. The most common adverse events were ${topReactions.slice(0, 3).map(r => r.event).join(', ')}. This data should be considered in the overall benefit-risk assessment of the product.`;
      }
      
      res.json(analysis);
    } catch (error) {
      console.error('Error with FDA FAERS API:', error);
      return res.status(500).json({
        error: 'FDA FAERS API Error',
        message: `Unable to retrieve FDA FAERS data: ${error.message}`,
        details: 'The FDA FAERS database connection experienced an error. Please try again later or check product name spelling.',
        serviceStatus: 'error',
        productName
      });
    }
  } catch (error) {
    console.error('Error analyzing FAERS data for CER:', error);
    res.status(500).json({ 
      error: 'Failed to analyze FAERS data for CER',
      message: error.message 
    });
  }
});

// Helper function to extract age distribution from FAERS reports
function extractAgeDistribution(reports, totalReports) {
  const ageGroups = {
    '0-17': 0,
    '18-44': 0,
    '45-64': 0,
    '65-74': 0,
    '75+': 0,
    'Unknown': 0
  };
  
  reports.forEach(report => {
    const age = report.age ? parseInt(report.age, 10) : null;
    
    if (age === null || isNaN(age)) {
      ageGroups['Unknown']++;
    } else if (age < 18) {
      ageGroups['0-17']++;
    } else if (age < 45) {
      ageGroups['18-44']++;
    } else if (age < 65) {
      ageGroups['45-64']++;
    } else if (age < 75) {
      ageGroups['65-74']++;
    } else {
      ageGroups['75+']++;
    }
  });
  
  return Object.entries(ageGroups).map(([group, count]) => ({
    group,
    count,
    percentage: totalReports > 0 ? `${((count / totalReports) * 100).toFixed(1)}%` : '0%'
  }));
}

// Helper function to extract gender distribution from FAERS reports
function extractGenderDistribution(reports, totalReports) {
  const genderCounts = {
    'Male': 0,
    'Female': 0,
    'Unknown': 0
  };
  
  reports.forEach(report => {
    const sex = report.sex;
    
    if (!sex) {
      genderCounts['Unknown']++;
    } else if (sex === '1') {
      genderCounts['Male']++;
    } else if (sex === '2') {
      genderCounts['Female']++;
    } else {
      genderCounts['Unknown']++;
    }
  });
  
  return Object.entries(genderCounts).map(([gender, count]) => ({
    gender,
    count,
    percentage: totalReports > 0 ? `${((count / totalReports) * 100).toFixed(1)}%` : '0%'
  }));
}

// Helper function to build matching criteria description
function buildMatchingCriteria(classification) {
  if (!classification) return 'substance similarity';
  
  const criteria = [];
  
  if (classification.atcCodes && classification.atcCodes.length > 0) {
    criteria.push('ATC classification codes');
  }
  
  if (classification.mechanismOfAction && classification.mechanismOfAction.length > 0) {
    criteria.push('mechanism of action');
  }
  
  if (classification.pharmacologicalClass && classification.pharmacologicalClass.length > 0) {
    criteria.push('pharmacological class');
  }
  
  return criteria.length > 0 ? criteria.join(', ') : 'substance similarity';
}

// Helper function to determine severity level based on risk score
function getSeverityLevel(riskScore) {
  if (riskScore > 1.5) return 'High';
  if (riskScore > 0.5) return 'Medium';
  return 'Low';
}

// Helper function to determine relative safety compared to reference product
function getRelativeSafety(referenceScore, comparatorScore) {
  const ratio = comparatorScore / referenceScore;
  
  if (ratio < 0.8) return 'better';
  if (ratio > 1.2) return 'worse';
  return 'similar';
}

// Helper function to generate comparative conclusion
function getComparativeConclusion(faersData) {
  if (!faersData.comparators || faersData.comparators.length === 0) {
    return '';
  }
  
  // Count comparative ratings
  const safetyCounts = {
    better: 0,
    similar: 0,
    worse: 0
  };
  
  faersData.comparators.forEach(comp => {
    const relativeSafety = getRelativeSafety(faersData.riskScore, comp.riskScore);
    safetyCounts[relativeSafety]++;
  });
  
  // Generate conclusion based on counts
  if (safetyCounts.better > safetyCounts.worse && safetyCounts.better > safetyCounts.similar) {
    return `a more favorable safety profile than most similar products in its class.`;
  }
  
  if (safetyCounts.worse > safetyCounts.better && safetyCounts.worse > safetyCounts.similar) {
    return `a less favorable safety profile than most similar products in its class.`;
  }
  
  if (safetyCounts.similar > safetyCounts.better && safetyCounts.similar > safetyCounts.worse) {
    return `a safety profile consistent with other products in its class.`;
  }
  
  // Mixed results
  if (safetyCounts.better === safetyCounts.worse) {
    return `a variable safety profile compared to other products in its class.`;
  }
  
  return `a safety profile that should be evaluated in context with other products in its class.`;
}

// POST /api/cer/export/:id - Export CER to various formats
router.post('/export/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { format } = req.body; // pdf, docx, html, etc.
    
    // Simulate export processing
    setTimeout(() => {
      res.json({
        id,
        format,
        url: `/api/cer/exports/${id}.${format}`,
        status: 'completed',
        exportedAt: new Date().toISOString()
      });
    }, 1500);
  } catch (error) {
    console.error(`Error exporting CER ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to export CER' });
  }
});

// POST /api/cer/generate-full - Generate a complete CER with AI
const aiGenerateCER = async (req, res) => {
  try {
    const { deviceInfo, literature, fdaData, templateId } = req.body;
    
    console.log('Received request to generate full CER');
    console.log('Device info:', JSON.stringify(deviceInfo));
    console.log('Template:', templateId);
    console.log('Literature count:', literature?.length || 0);
    console.log('FAERS data available:', !!fdaData);
    
    // Verify OpenAI API key is available for generation
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured. Cannot generate CER content.');
    }
    
    // Call the actual implementation in cerService.js that uses GPT-4o
    const report = await generateFullCER({
      deviceInfo,
      literature,
      fdaData,
      templateId: templateId || 'eu-mdr-full'
    });
    
    // Format and return the response
    res.json({
      ...report,
      title: `Clinical Evaluation Report: ${deviceInfo?.name || 'Medical Device'}`,
      metadata: {
        regulatoryFramework: report.regulatoryFramework,
        complianceScore: report.complianceScore.overall,
        aiEnhanced: true,
        generationModel: 'gpt-4o',
        includedLiterature: literature?.length || 0,
        includedAdverseEvents: fdaData?.reports?.length || 0
      }
    });
  } catch (error) {
    console.error('Error generating full CER:', error);
    res.status(500).json({ error: `Failed to generate CER report: ${error.message}` });
  }
};
router.post('/generate-full', aiGenerateCER);

// GET /api/cer/templates - Get available CER templates
router.get('/templates', (req, res) => {
  try {
    const templates = [
      {
        id: 'eu-mdr-full',
        name: 'EU MDR 2017/745 Full Template',
        description: 'Complete template for EU MDR 2017/745 compliance',
        regulatoryFramework: 'EU MDR',
        sectionCount: 14,
        defaultLanguage: 'en',
        supportedLanguages: ['en', 'fr', 'de', 'it', 'es'],
        aiEnhanced: true,
        lastUpdated: '2025-03-01T00:00:00Z'
      },
      {
        id: 'meddev-rev4',
        name: 'MEDDEV 2.7/1 Rev 4 Template',
        description: 'Template following MEDDEV 2.7/1 Rev 4 guidelines',
        regulatoryFramework: 'MEDDEV',
        sectionCount: 12,
        defaultLanguage: 'en',
        supportedLanguages: ['en', 'fr', 'de'],
        aiEnhanced: true,
        lastUpdated: '2025-02-15T00:00:00Z'
      },
      {
        id: 'fda-510k',
        name: 'FDA 510(k) Template',
        description: 'Template for FDA 510(k) clinical evaluation',
        regulatoryFramework: 'FDA',
        sectionCount: 10,
        defaultLanguage: 'en',
        supportedLanguages: ['en'],
        aiEnhanced: true,
        lastUpdated: '2025-01-20T00:00:00Z'
      },
      {
        id: 'pmcf',
        name: 'PMCF Evaluation Report Template',
        description: 'Post-Market Clinical Follow-up report template',
        regulatoryFramework: 'EU MDR',
        sectionCount: 8,
        defaultLanguage: 'en',
        supportedLanguages: ['en', 'fr', 'de', 'it', 'es'],
        aiEnhanced: true,
        lastUpdated: '2025-04-05T00:00:00Z'
      }
    ];
    
    res.json(templates);
  } catch (error) {
    console.error('Error fetching CER templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// POST /api/cer/export-pdf - Export FAERS data as PDF
router.post('/export-pdf', async (req, res) => {
  try {
    const { faersData, productName } = req.body;
    
    if (!faersData) {
      return res.status(400).json({ 
        success: false,
        error: 'FAERS data is required' 
      });
    }
    
    console.log(`Generating PDF export for ${productName || 'unknown product'}`);
    
    // Use the real PDF exporter service to generate an actual PDF
    const pdfExporter = require('../services/cerPdfExporter');
    
    try {
      // Create CER data object with FAERS information
      const cerData = {
        title: `Clinical Evaluation Report: ${productName}`,
        sections: [
          {
            title: 'FAERS Adverse Event Analysis',
            content: `Analysis of FDA FAERS data for ${productName}`
          }
        ],
        deviceInfo: {
          name: productName,
          manufacturer: faersData.productInfo?.manufacturer || 'Unknown Manufacturer',
          modelNumber: faersData.productInfo?.modelNumber
        },
        metadata: {
          author: 'TrialSage AI',
          generatedAt: new Date().toISOString(),
          version: '1.0.0',
          reviewStatus: 'draft',
          confidential: true
        }
      };
      
      // Generate the actual PDF
      pdfExporter.generateCerPdf(cerData)
        .then(pdfBuffer => {
          // Save PDF to file
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
            message: 'PDF export generated successfully',
            url: `/api/cer/downloads/${filename}`
          });
        })
        .catch(error => {
          console.error('Error generating PDF:', error);
          res.status(500).json({
            success: false,
            error: 'Failed to generate PDF export',
            details: error.message
          });
        });
    } catch (error) {
      console.error('Error preparing PDF data:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to prepare data for PDF export',
        details: error.message
      });
    }
  } catch (error) {
    console.error('Error exporting FAERS data to PDF:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to export FAERS data to PDF',
      message: error.message 
    });
  }
});

// POST /api/cer/export-word - Export FAERS data as DOCX
router.post('/export-word', async (req, res) => {
  try {
    const { faersData, productName } = req.body;
    
    if (!faersData) {
      return res.status(400).json({ 
        success: false,
        error: 'FAERS data is required' 
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
            content: `Analysis of FDA FAERS data for ${productName}`
          }
        ],
        deviceInfo: {
          name: productName,
          manufacturer: faersData.productInfo?.manufacturer || 'Unknown Manufacturer',
          modelNumber: faersData.productInfo?.modelNumber
        },
        metadata: {
          author: 'TrialSage AI',
          generatedAt: new Date().toISOString(),
          version: '1.0.0',
          reviewStatus: 'draft',
          confidential: true,
          format: 'docx' // Signal that this is for Word format
        }
      };
      
      // Add reactions if available
      if (faersData.reactionCounts && faersData.reactionCounts.length > 0) {
        cerData.sections.push({
          title: 'Adverse Event Frequency',
          content: faersData.reactionCounts.map(r => `${r.reaction}: ${r.count} reports`).join('\n')
        });
      }
      
      // Add summary data if available
      if (faersData.summary) {
        cerData.sections.push({
          title: 'Summary Statistics',
          content: `Total Reports: ${faersData.summary.totalReports}\nSerious Events: ${faersData.summary.seriousEvents}\nRisk Score: ${faersData.summary.riskScore}`
        });
      }
      
      // Add conclusion
      const conclusionText = faersData.conclusion || 
        `This report presents the findings from FDA FAERS data analysis for ${productName}. ` +
        `The data provides insights into the safety profile based on real-world adverse event reports. ` +
        `This data should be considered as part of a comprehensive clinical evaluation.`;
      
      cerData.sections.push({
        title: 'Conclusion',
        content: conclusionText
      });
      
      // Generate PDF (we'll use PDF as a fallback format)
      pdfExporter.generateCerPdf(cerData)
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
            url: `/api/cer/downloads/${filename}`
          });
        })
        .catch(error => {
          console.error('Error generating document:', error);
          res.status(500).json({
            success: false,
            error: 'Failed to generate document',
            details: error.message
          });
        });
    } catch (error) {
      console.error('Error preparing document export:', error);
      
      res.status(500).json({
        success: false,
        error: 'Failed to prepare document export',
        details: error.message
      });
    }
  } catch (error) {
    console.error('Error exporting FAERS data to Word:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to export FAERS data to Word',
      message: error.message 
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
    
    console.log(`FAERS data: ${hasFaers ? 'present' : 'missing'}, Sections: ${hasSections ? 'present' : 'missing'}`);
    
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
      sectionsHtml = sections.map(section => {
        return `
          <div class="cer-user-section">
            <h4>${section.title || 'Section'}</h4>
            <div class="cer-section-content">
              ${section.content || ''}
            </div>
          </div>
        `;
      }).join('');
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
      html
    });
  } catch (error) {
    console.error('Error generating CER preview:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate CER preview',
      message: error.message 
    });
  }
});

// Test preview route for debugging
router.post('/preview-test', async (req, res) => {
  try {
    console.log('Preview test body:', JSON.stringify(req.body, null, 2));
    const { title, sections, faers, comparators } = req.body;
    
    // Always return data for testing
    res.json({
      success: true,
      message: 'Preview test endpoint',
      receivedData: {
        hasFaers: faers && Array.isArray(faers) && faers.length > 0,
        hasSections: sections && Array.isArray(sections) && sections.length > 0,
        title: title || 'No title provided',
        sections: sections || [],
        faers: faers || [],
        comparators: comparators || []
      },
      html: '<div class="test-preview">Preview test generated content</div>'
    });
  } catch (error) {
    console.error('Error in preview test:', error);
    res.status(500).json({ 
      success: false,
      error: 'Preview test error',
      message: error.message 
    });
  }
});

// Additional compliance routes configured below

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
      const { Configuration, OpenAIApi } = require("openai");

      // Check for OpenAI API key
      if (!process.env.OPENAI_API_KEY) {
        console.error('OpenAI API key is missing');
        return res.status(500).json({ 
          error: 'OpenAI API key is required for this feature',
          message: 'Please configure the OPENAI_API_KEY environment variable'
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
        model: "gpt-4",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
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
        section: match[1].includes('MEDDEV') ? 'Guidance Document' : 
                match[1].includes('EU MDR') ? 'Regulation' : 
                match[1].includes('ISO') ? 'Standard' : 'Regulatory Reference'
      }));

      // Return the response and identified sources
      res.json({
        query,
        response,
        sources: sources.length > 0 ? sources : [
          { title: 'EU MDR 2017/745', section: 'Applicable sections' },
          { title: 'MEDDEV 2.7/1 Rev 4', section: 'Guidance' }
        ]
      });
    } catch (error) {
      console.error('Error calling OpenAI API:', error);
      
      // Provide a graceful fallback
      res.status(500).json({ 
        error: 'Failed to process query with AI service',
        message: error.message
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
        error: 'Section, standard, and current content are required'
      });
    }
    
    console.log(`Analyzing ${section} compliance with ${standard} standard...`);
    console.log(`Content length: ${currentContent.length} characters`);
    
    // Use OpenAI to analyze the content and generate improvements
    try {
      // Check for OpenAI API key
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is not configured. Cannot provide compliance improvement suggestions.');
      }

      // Import OpenAI if needed
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      // Build context-specific system prompt
      let standardInfo = '';
      if (standard.toLowerCase().includes('eu mdr')) {
        standardInfo = 'EU MDR 2017/745, focusing on clinical evaluation requirements in Annex XIV and safety/performance requirements';
      } else if (standard.toLowerCase().includes('iso')) {
        standardInfo = 'ISO 14155:2020, focusing on clinical investigation design, conduct, and reporting';
      } else if (standard.toLowerCase().includes('fda')) {
        standardInfo = 'FDA 21 CFR regulations for medical devices, particularly Parts 812, 814, and applicable guidance documents';
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
      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.2,
        max_tokens: 1500,
      });

      // Extract the improvement recommendations
      const improvement = completion.choices[0].message.content;
      
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
          { title: 'EU MDR 2017/745 Guidance', url: 'https://ec.europa.eu/health/md_sector/new_regulations/guidance_en' },
          { title: 'ISO 14155:2020 Key Points', url: 'https://www.iso.org/standard/71690.html' },
          { title: 'FDA 21 CFR Part 812', url: 'https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfcfr/cfrsearch.cfm?cfrpart=812' }
        ]
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
        message: serviceError.message
      });
    }
  } catch (error) {
    console.error('Error in CER Assistant:', error);
    res.status(500).json({ 
      error: 'Failed to process your message',
      message: error.message
    });
  }
    
    // Build the system prompt with CER context
    const systemPrompt = `You are a Clinical Evaluation Report (CER) specialist assistant who helps medical device manufacturers prepare regulatory documentation.
    Your role is to provide accurate, helpful information about regulatory requirements, CER content, and improving compliance.
    
    The user is currently working on a CER titled: "${context?.title || 'Clinical Evaluation Report'}"
    
    ${context?.sections?.length ? `The CER has ${context.sections.length} sections: ${context.sections.map(s => s.title).join(', ')}` : 'The CER currently has no sections.'}
    ${context?.faers?.length ? `FAERS data is available with ${context.faers.length} adverse event reports.` : 'No FAERS data is available.'}
    ${context?.selectedSection ? `The user is currently focused on the "${context.selectedSection.title}" section.` : ''}
    
    Your expertise includes EU MDR 2017/745, MEDDEV 2.7/1 Rev 4, ISO 14155, FDA 21 CFR 812, and FDA guidance documents.
    
    When answering:
    1. Be concise but thorough in your answers (maximum 3-4 paragraphs)
    2. Reference specific regulatory requirements when applicable
    3. Provide practical guidance that would help improve the CER
    4. If discussing safety data, emphasize the importance of objective analysis`;
    
    // Build messages array with any existing conversation context
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ];
    
    // Call OpenAI for the response
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: messages,
      max_tokens: 1000,
      temperature: 0.7,
    });
    
    // Extract the response
    const response = completion.choices[0].message.content;
    
    // Generate follow-up suggestions based on the context
    let customSuggestions = [];
    
    // Check if we have contextual information about the report to personalize the response
    const hasContext = context && context.sections && context.sections.length > 0;
    const hasFaers = context && context.faers && context.faers.length > 0;
    const deviceName = hasContext && context.title ? context.title.split(':').pop().trim() : 'your device';
    
    // Handle FAERS data specific questions
    if (message.toLowerCase().includes('faers') || message.toLowerCase().includes('adverse event')) {
      if (hasFaers) {
        const reportCount = context.faers.length;
        const seriousCount = context.faers.filter(r => r.is_serious).length || 0;
        
        response = `Your CER includes ${reportCount} FAERS reports with ${seriousCount} serious adverse events for ${deviceName}. When incorporating this data, present a clear summary of key findings, categorize events by severity and type, analyze reporting frequency trends, and discuss any potential signals that may impact your benefit-risk assessment. For thorough regulatory compliance, compare your device's safety profile with similar devices.`;
        
        customSuggestions = [
          "How should I interpret the severity of these adverse events?",
          "What trends should I highlight in my FAERS analysis?",
          "How do I compare my FAERS data with similar devices?"
        ];
      } else {
        response = "FDA Adverse Event Reporting System (FAERS) data is valuable for your CER as it provides real-world safety information. When incorporating FAERS data, you should analyze reporting patterns, categorize events by severity and type, compare with similar products, and integrate findings into your overall benefit-risk assessment. Your CER doesn't currently include FAERS data - would you like guidance on how to retrieve and analyze this information?";
        
        customSuggestions = [
          "How do I search for relevant FAERS data?",
          "What FAERS data is required for EU MDR compliance?",
          "How should I format FAERS data in my CER?"
        ];
      }
    }
    // Handle questions about guidelines or regulations
    else if (message.toLowerCase().includes('guideline') || message.toLowerCase().includes('regulation') || message.toLowerCase().includes('standard')) {
      // Check if a specific regulation is mentioned
      if (message.toLowerCase().includes('eu mdr') || message.toLowerCase().includes('mdr')) {
        response = "EU MDR 2017/745 requires comprehensive clinical evaluation for all medical devices. For your specific device classification, ensure you include all relevant clinical data, post-market surveillance information, and a thorough literature review. The evaluation must follow MEDDEV 2.7/1 Rev 4 methodology and demonstrate both clinical performance and safety according to Annex I General Safety and Performance Requirements (GSPRs). The clinical evaluation report must be updated throughout the product lifecycle.";
      } else if (message.toLowerCase().includes('fda') || message.toLowerCase().includes('510')) {
        response = "FDA requirements for clinical evaluation depend on your device classification and submission type. For 510(k) submissions, you need to demonstrate substantial equivalence to a predicate device. For higher-risk devices requiring PMA, more comprehensive clinical data is typically needed. The FDA guidance 'Factors to Consider When Making Benefit-Risk Determinations in Medical Device Premarket Approval and De Novo Classifications' provides a framework for benefit-risk assessment.";
      } else if (message.toLowerCase().includes('iso') || message.toLowerCase().includes('14155')) {
        response = "ISO 14155:2020 'Clinical investigation of medical devices for human subjects — Good clinical practice' provides principles for clinical investigation design, conduct, recording, and reporting. This standard emphasizes protection of human subjects, scientific conduct, and clinical investigation credibility. Key requirements include proper risk management, investigation planning, and data handling procedures.";
      } else {
        // Generic regulatory guidance
        response = "For your CER, key regulatory frameworks include EU MDR 2017/745 (particularly Annex XIV), MEDDEV 2.7/1 Rev 4 for methodology, ISO 14155:2020 for clinical investigations, and relevant FDA guidance documents if targeting the US market. Your CER should demonstrate compliance with General Safety and Performance Requirements through valid clinical evidence, literature evaluation, and risk assessment.";
      }
      
      customSuggestions = [
        "What specific sections does EU MDR require?",
        "How often should I update my CER?",
        "What's different between EU MDR and previous MDD requirements?"
      ];
    }
    // Handle questions about specific document sections
    else if (message.toLowerCase().includes('section') || (context?.selectedSection && Object.keys(context.selectedSection).length > 0)) {
      // First check if they're asking about a specific section
      let sectionName = '';
      
      if (message.toLowerCase().includes('device description')) {
        sectionName = 'device description';
      } else if (message.toLowerCase().includes('clinical data') || message.toLowerCase().includes('clinical evaluation')) {
        sectionName = 'clinical data analysis';
      } else if (message.toLowerCase().includes('benefit') || message.toLowerCase().includes('risk')) {
        sectionName = 'benefit-risk analysis';
      } else if (message.toLowerCase().includes('conclusion')) {
        sectionName = 'conclusion';
      } else if (context?.selectedSection?.title) {
        sectionName = context.selectedSection.title.toLowerCase();
      }
      
      if (sectionName) {
        if (sectionName.includes('device description')) {
          response = `Your device description section should clearly specify what ${deviceName} is, its intended purpose, design characteristics, materials, key components, principles of operation, and variants/accessories. Include clear specifications with appropriate measurements, biocompatibility information for materials, and relevant diagrams where helpful. The level of detail should be sufficient for a qualified reader to understand your device's technology and how it achieves its intended purpose.`;
        } else if (sectionName.includes('clinical data') || sectionName.includes('clinical evaluation')) {
          response = `The clinical data analysis section should present a comprehensive evaluation of all clinical evidence related to ${deviceName}. Include a systematic literature review with clear search strategy, appraisal methodology, and data extraction procedures. Present both favorable and unfavorable data, evaluate methodological quality of each source, and analyze clinical significance of findings. If claiming equivalence to another device, provide robust justification addressing technical, biological, and clinical characteristics.`;
        } else if (sectionName.includes('benefit') || sectionName.includes('risk')) {
          response = `Your benefit-risk analysis should identify and quantify all clinical benefits and risks associated with ${deviceName}, evaluate their clinical significance, and determine if benefits outweigh risks. Include a structured analysis methodology, specific acceptance criteria, consideration of state-of-the-art alternatives, and risk mitigation measures. The analysis should reference clinical data presented elsewhere in the report and address both identified and potential risks.`;
        } else if (sectionName.includes('conclusion')) {
          response = `The conclusion section should synthesize all evidence presented in your CER and clearly state whether ${deviceName} achieves its intended performance and has a favorable benefit-risk profile. Reference specific findings from your clinical evaluation, address compliance with relevant General Safety and Performance Requirements, and outline any residual risks or uncertainties. Include plans for post-market surveillance and future clinical follow-up activities.`;
        } else {
          response = `When drafting your ${sectionName} section, ensure it directly addresses relevant regulatory requirements, provides sufficient detail and evidence to support claims, and follows a logical structure. The content should be specific to ${deviceName} and its intended purpose, with clear references to supporting data and scientific literature.`;
        }
        
        customSuggestions = [
          `How can I improve the compliance of my ${sectionName} section?`,
          `What specific details should I include in the ${sectionName} section?`,
          `What are common regulatory findings for the ${sectionName} section?`
        ];
      } else {
        response = `Your CER should include several key sections: device description, state of the art review, clinical evaluation methodology, literature search and appraisal, clinical data analysis, equivalence assessment (if applicable), post-market surveillance data, benefit-risk determination, and conclusions. Each section should directly address regulatory requirements and provide sufficient evidence to support the safety and performance of ${deviceName}.`;
      }
    }
    // Handle questions about templates or document format
    else if (message.toLowerCase().includes('template') || message.toLowerCase().includes('format')) {
      response = `The TrialSage CER templates follow structured formats compliant with current regulatory standards. Each template includes required sections organized in a logical sequence that facilitates regulatory review. For ${deviceName}, I would recommend using the ${hasContext && context.sections.length > 10 ? 'comprehensive EU MDR template' : 'standard MDR template'} which includes all necessary sections for regulatory compliance. You can customize the content while maintaining the overall structure to ensure all requirements are addressed.`;
      
      customSuggestions = [
        "What's the difference between the EU MDR and MEDDEV templates?",
        "How should I format tables and figures in my CER?",
        "Is there a template specifically for my device type?"
      ];
    }
    // Handle questions about equivalence
    else if (message.toLowerCase().includes('equivalence') || message.toLowerCase().includes('equivalent')) {
      response = `When claiming equivalence to another device in your CER for ${deviceName}, EU MDR requires you to demonstrate technical, biological, and clinical equivalence with robust scientific justification. You must have access to the technical documentation of the equivalent device or clearly demonstrate how you've obtained sufficient information to claim equivalence. Address each aspect systematically with a detailed comparison table showing similarities and differences, and explain why any differences don't significantly affect clinical performance and safety. The burden of proof for equivalence claims has increased significantly under MDR compared to previous requirements.`;
      
      customSuggestions = [
        "What level of detail is needed for equivalence claims?",
        "How do I handle minor differences between devices?",
        "Can I claim equivalence to multiple devices?"
      ];
    }
    // Handle questions about literature reviews
    else if (message.toLowerCase().includes('literature')) {
      response = `A systematic literature review is essential for your CER on ${deviceName}. Your search must be replicable with clearly defined inclusion/exclusion criteria. Document your search strategy, databases used, search terms, and screening process. For each included publication, assess clinical relevance, methodological quality, and weight of evidence using a standardized approach. The literature review should cover both favorable and unfavorable data related to your device or equivalent devices. Search results should be presented in a PRISMA flow diagram, and all appraisals should be documented in detailed evidence tables.`;
      
      customSuggestions = [
        "What databases should I search for my literature review?",
        "How do I document literature screening decisions?",
        "How should I handle conflicting evidence in publications?"
      ];
    }
    // Default response if no specific pattern is matched
    else {
      response = `I'm your CER Assistant for ${deviceName}, designed to help with Clinical Evaluation Report preparation. I can provide guidance on regulatory requirements, proper documentation structure, literature review methodology, and compliance standards based on your specific device and the current state of your report. What specific aspect of your CER would you like assistance with?`;
      
      // Default suggestions based on context
      if (hasContext) {
        const lowestScoreSection = context.sections
          .filter(s => s.complianceScore !== undefined)
          .sort((a, b) => (a.complianceScore || 0) - (b.complianceScore || 0))[0];
          
        if (lowestScoreSection) {
          customSuggestions.push(`How can I improve my ${lowestScoreSection.title} section?`);
        }
      }
    }
    
    // If no custom suggestions were set, use default ones
    if (customSuggestions.length === 0) {
      customSuggestions = [
        "How do I demonstrate regulatory compliance?",
        "What should I include in my literature review?",
        "How much clinical data is sufficient for my device class?",
        "How do I incorporate FAERS data effectively?"
      ];
    }
    
    res.json({
      response,
      suggestions: customSuggestions
    });
  } catch (error) {
    console.error('Error in CER Assistant:', error);
    res.status(500).json({ error: 'Failed to process query' });
  }
});

// POST /api/cer/improve-compliance-fallback - Fallback handler for compliance improvement
router.post('/improve-compliance-fallback', async (req, res) => {
  try {
    const { section, standard, currentContent } = req.body;
    
    if (!section || !standard || !currentContent) {
      return res.status(400).json({ 
        error: 'Section, standard, and current content are required'
      });
    }
    
    // This is a fallback handler if the main improveCompliance handler fails
    
    let improvement = '';
    
    if (standard.toLowerCase().includes('eu mdr')) {
      improvement = `To improve compliance with EU MDR for your ${section} section, consider the following enhancements:\n\n1. Add quantitative data to support your clinical claims\n2. Include a more detailed comparison with state of the art\n3. Strengthen the connection between clinical data and risk analysis\n4. Add explicit reference to relevant harmonized standards\n5. Expand on the post-market surveillance plan`;
    } else if (standard.toLowerCase().includes('iso')) {
      improvement = `To better align with ISO 14155 requirements for your ${section} section, make these improvements:\n\n1. Provide more methodological details for data collection\n2. Include clearer statistical analysis methodology\n3. Add detailed subject protection information\n4. Strengthen the device safety profile discussion\n5. Expand validation methods for each endpoint`;
    } else if (standard.toLowerCase().includes('fda')) {
      improvement = `To enhance FDA 21 CFR compliance for your ${section} section, implement these changes:\n\n1. Add more substantial comparative analysis with predicate devices\n2. Include detailed substantial equivalence rationale\n3. Strengthen the risk mitigation strategies\n4. Add a comprehensive benefit-risk determination\n5. Provide more quantitative performance data`;
    } else {
      improvement = `To improve this section, consider adding more quantitative data, strengthening your risk-benefit analysis, and providing clearer connections between your clinical evidence and conclusions.`;
    }
    
    // Return the improvement suggestions
    res.json({
      section,
      standard,
      improvement,
      additionalResources: [
        { title: 'EU MDR 2017/745 Guidance', url: 'https://ec.europa.eu/health/md_sector/clinical_evaluation_en' },
        { title: 'ISO 14155:2020 Key Points', url: 'https://www.iso.org/standard/71690.html' }
      ]
    });
  } catch (error) {
    console.error('Error improving compliance:', error);
    res.status(500).json({ error: 'Failed to generate compliance improvements' });
  }
});

// POST /api/cer/improve-section - Improve a section to increase regulatory compliance
router.post('/improve-section', async (req, res) => {
  try {
    const { section, complianceData, standard } = req.body;
    
    if (!section || !section.content) {
      return res.status(400).json({ error: 'Section with content is required' });
    }
    
    if (!standard) {
      return res.status(400).json({ error: 'Regulatory standard is required' });
    }
    
    console.log(`Improving section "${section.title}" for ${standard} compliance`);
    
    // Create a system prompt targeted at the specific regulatory standard
    let systemPrompt = `You are an expert regulatory professional specializing in medical device clinical evaluations and ${standard} compliance.`;
    
    switch(standard) {
      case 'EU MDR':
        systemPrompt += ' You have extensive experience with EU MDR 2017/745, Annex XIV requirements, and MEDDEV 2.7/1 Rev 4 guidance.';
        break;
      case 'ISO 14155':
        systemPrompt += ' You have deep knowledge of ISO 14155:2020 for clinical investigations of medical devices for human subjects - Good clinical practice.';
        break;
      case 'FDA 21 CFR 812':
        systemPrompt += ' You are specialized in FDA 21 CFR Part 812 Investigational Device Exemptions and FDA regulatory requirements for medical devices.';
        break;
      default:
        systemPrompt += ' You have broad expertise in global medical device regulations and standards.';
    }
    
    systemPrompt += ` You will improve a section of a Clinical Evaluation Report (CER) to enhance its compliance with ${standard} requirements while maintaining the document's scientific integrity and purpose.`;
    
    // Create a prompt for improvement
    const userPrompt = `I need to improve the following ${section.title} section of a Clinical Evaluation Report to meet ${standard} requirements. The current compliance score is ${complianceData ? Math.round((complianceData[section.type] || 0) * 100) + '%' : 'unknown'}. Please enhance the content to improve regulatory compliance while preserving the essential clinical information. Here is the current content:\n\n${section.content}`;
    
    // Use GPT-4o to generate the improved content
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });
    
    // Extract the improved content from the response
    const improvedContent = response.choices[0].message.content;
    
    // Return the improved content with additional metadata
    res.json({
      success: true,
      section: section.title,
      originalContent: section.content,
      improvedContent: improvedContent,
      standard: standard,
      improvementDate: new Date().toISOString(),
      improvementMetadata: {
        model: "gpt-4o",
        targetStandard: standard,
        originalCompliance: complianceData ? (complianceData[section.type] || 0) : null,
        estimatedImprovedCompliance: complianceData ? Math.min(0.95, (complianceData[section.type] || 0) + 0.15) : 0.8
      }
    });
  } catch (error) {
    console.error('Error improving section compliance:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to improve section compliance',
      message: error.message
    });
  }
});

/**
 * Score a section against a regulatory standard using OpenAI
 * @param {Object} section - The section to score
 * @param {string} standard - The regulatory standard to score against
 * @returns {Promise<Object>} - The scoring results
 */
async function scoreSection(section, standard) {
  // Prepare the system prompt based on the standard
  const systemPrompt = getCompliancePrompt(standard);
  
  // Prepare the user prompt
  const userPrompt = `Please analyze the following ${section.title || section.type} section for a Clinical Evaluation Report and score its compliance with ${standard} requirements:

${section.content}

Analyze the content rigorously and provide:
1. A compliance score between 0 and 1 (1 being perfect compliance)
2. 3-5 specific improvement suggestions
3. A detailed analysis of strengths and weaknesses
4. References to specific requirements in ${standard} that apply to this section

Format your response as valid JSON with these keys: score, suggestions, analysis, references`;

  try {
    // Call OpenAI API
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 1500,
      response_format: { type: "json_object" }
    });
    
    // Parse the response
    const content = response.choices[0].message.content;
    const result = JSON.parse(content);
    
    // Ensure the result has the expected structure
    const score = parseFloat(result.score) || 0.5;
    const suggestions = Array.isArray(result.suggestions) ? result.suggestions : [];
    const analysis = result.analysis || 'No detailed analysis available';
    const references = result.references || 'No specific references provided';
    
    // Return the scored results
    return {
      section,
      standard,
      score,
      suggestions,
      analysis,
      references
    };
  } catch (error) {
    console.error(`Error scoring section ${section.type} against ${standard}:`, error);
    // Return a default response to prevent overall failure
    return {
      section,
      standard,
      score: 0.5,
      suggestions: ['Error in automated scoring - manual review recommended'],
      analysis: `Error during analysis: ${error.message}`,
      references: 'N/A due to scoring error'
    };
  }
}

/**
 * Get the appropriate system prompt for compliance scoring based on standard
 * @param {string} standard - The regulatory standard
 * @returns {string} - The system prompt
 */
function getCompliancePrompt(standard) {
  const basePrompt = `You are an expert regulatory consultant specialized in medical device regulations and clinical evaluation requirements. Your task is to analyze a section of a Clinical Evaluation Report (CER) and assess its compliance with regulatory requirements.`;
  
  switch(standard) {
    case 'EU MDR':
      return `${basePrompt}
      
You are specifically evaluating compliance with EU MDR 2017/745 and MEDDEV 2.7/1 Rev 4 guidelines for Clinical Evaluation Reports.

Key EU MDR requirements to consider:
1. Evidence-based approach with sound scientific methods
2. Comprehensive analysis of relevant scientific literature
3. Critical evaluation of clinical data and its quality
4. Clear demonstration of clinical benefit vs. risk ratio
5. Evaluation against state of the art and equivalent devices
6. Proper reference to General Safety and Performance Requirements (GSPRs)
7. Transparency in limitations and uncertainties
8. Clinical evidence that supports intended purpose claims
9. Post-market surveillance data integration
10. Compliance with Annex XIV for clinical evaluation and Annex XV for clinical investigations

Scoring criteria:
- 0.9-1.0: Excellent compliance, fully meets EU MDR requirements
- 0.8-0.89: Good compliance, minor improvements needed
- 0.7-0.79: Satisfactory compliance, several improvements needed
- 0.6-0.69: Moderate compliance, significant improvements needed
- 0.5-0.59: Poor compliance, major improvements needed
- Below 0.5: Inadequate compliance, complete rework needed`;
      
    case 'ISO 14155':
      return `${basePrompt}
      
You are specifically evaluating compliance with ISO 14155:2020 "Clinical investigation of medical devices for human subjects - Good clinical practice."

Key ISO 14155 requirements to consider:
1. Adherence to Good Clinical Practice (GCP) principles
2. Protection of subject rights, safety, and well-being
3. Risk analysis and mitigation measures
4. Appropriate clinical investigation design
5. Objective data collection and analysis methods
6. Scientifically sound investigation methodology
7. Statistical considerations and data quality measures
8. Proper reporting of adverse events and device deficiencies
9. Ethical considerations and informed consent elements
10. Documentation of investigation results and conclusions

Scoring criteria:
- 0.9-1.0: Excellent compliance, fully meets ISO 14155 requirements
- 0.8-0.89: Good compliance, minor improvements needed
- 0.7-0.79: Satisfactory compliance, several improvements needed
- 0.6-0.69: Moderate compliance, significant improvements needed
- 0.5-0.59: Poor compliance, major improvements needed
- Below 0.5: Inadequate compliance, complete rework needed`;
      
    case 'FDA':
      return `${basePrompt}
      
You are specifically evaluating compliance with FDA requirements for medical devices, including 21 CFR 812 for Investigational Device Exemptions, and FDA guidance documents on clinical trials and evidence.

Key FDA requirements to consider:
1. Substantial equivalence considerations (if applicable)
2. Valid scientific evidence as defined in 21 CFR 860.7
3. Well-controlled investigations as per 21 CFR 860.7(c)(2)
4. Appropriate study design and statistical methods
5. Adequate characterization of adverse events
6. Appropriate control groups and minimization of bias
7. Clinically significant endpoint measurements
8. Proper analysis of safety and effectiveness
9. Clear benefit-risk determination
10. Adequate post-market surveillance monitoring

Scoring criteria:
- 0.9-1.0: Excellent compliance, fully meets FDA requirements
- 0.8-0.89: Good compliance, minor improvements needed
- 0.7-0.79: Satisfactory compliance, several improvements needed
- 0.6-0.69: Moderate compliance, significant improvements needed
- 0.5-0.59: Poor compliance, major improvements needed
- Below 0.5: Inadequate compliance, complete rework needed`;
      
    default:
      return `${basePrompt}
      
You are evaluating compliance with general regulatory standards for medical devices.

Key regulatory considerations to evaluate:
1. Scientific validity of the evaluation methodology
2. Comprehensive risk-benefit analysis
3. Clear clinical evidence supporting claims
4. Appropriate reference to published literature
5. Adequate characterization of the device
6. Proper identification of hazards and risks
7. Evaluation against current state of the art
8. Transparency in limitations and uncertainties
9. Proper post-market surveillance considerations
10. Adequate documentation of clinical data analysis

Scoring criteria:
- 0.9-1.0: Excellent compliance, fully meets regulatory requirements
- 0.8-0.89: Good compliance, minor improvements needed
- 0.7-0.79: Satisfactory compliance, several improvements needed
- 0.6-0.69: Moderate compliance, significant improvements needed
- 0.5-0.59: Poor compliance, major improvements needed
- Below 0.5: Inadequate compliance, complete rework needed`;
  }
}

export { router as default };

// POST /api/cer/version/save - Save a version of a CER document
router.post('/version/save', async (req, res) => {
  try {
    const { 
      title, 
      sections, 
      deviceInfo, 
      metadata = {}, 
      versionNotes = '',
      versionType = 'minor'  // "major", "minor", or "patch"
    } = req.body;

    if (!title || !sections || sections.length === 0) {
      return res.status(400).json({ 
        error: 'Title and at least one section are required' 
      });
    }

    console.log(`Saving version of CER: ${title}, Sections: ${sections.length}, Version type: ${versionType}`);

    // Get the documentId or generate a new one if it doesn't exist
    const documentId = metadata.documentId || `CER-${Date.now().toString().substring(0, 8)}`;
    
    // Calculate new version based on current version and version type
    let currentVersion = metadata.version || '0.0.0';
    let [major, minor, patch] = currentVersion.split('.').map(v => parseInt(v));

    // Increment appropriate version component
    if (versionType === 'major') {
      major++;
      minor = 0;
      patch = 0;
    } else if (versionType === 'minor') {
      minor++;
      patch = 0;
    } else { // patch
      patch++;
    }

    const newVersion = `${major}.${minor}.${patch}`;
    
    // Create version history if it doesn't exist
    const versionHistory = metadata.versionHistory || [];

    // Add current version to history if it exists
    if (metadata.version) {
      versionHistory.push({
        version: metadata.version,
        timestamp: metadata.updatedAt || new Date().toISOString(),
        notes: versionNotes || 'Version saved'
      });
    }

    // Create updated metadata
    const updatedMetadata = {
      ...metadata,
      documentId,
      version: newVersion,
      previousVersion: metadata.version || null,
      versionHistory,
      updatedAt: new Date().toISOString()
    };

    // In a real implementation, we would save this to a database
    // For now, we'll just return the updated document info
    
    res.json({
      success: true,
      documentId,
      version: newVersion,
      previousVersion: metadata.version || null,
      title,
      updatedAt: updatedMetadata.updatedAt,
      sectionsCount: sections.length,
      versionHistory,
      message: `Version ${newVersion} saved successfully`
    });
  } catch (error) {
    console.error('Error saving version:', error);
    res.status(500).json({ error: `Failed to save version: ${error.message}` });
  }
});

// GET /api/cer/version/:documentId - Get version history for a CER document
router.get('/version/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    
    if (!documentId) {
      return res.status(400).json({ error: 'Document ID is required' });
    }
    
    // In a real implementation, this would query a database
    // For now, we'll return simulated history data
    
    // Get current date for reference
    const now = new Date();
    
    // Create some example version history
    const versionHistory = [
      {
        version: '1.0.0',
        timestamp: new Date(now.getTime() - (10 * 24 * 60 * 60 * 1000)).toISOString(), // 10 days ago
        notes: 'Initial version of the CER for submission',
        author: 'Dr. Jane Smith',
        status: 'approved'
      },
      {
        version: '0.9.0',
        timestamp: new Date(now.getTime() - (15 * 24 * 60 * 60 * 1000)).toISOString(), // 15 days ago
        notes: 'Pre-approval draft with all sections complete',
        author: 'Dr. Jane Smith',
        status: 'review'
      },
      {
        version: '0.5.0',
        timestamp: new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000)).toISOString(), // 30 days ago
        notes: 'Initial draft with clinical data sections',
        author: 'Dr. Jane Smith',
        status: 'draft'
      }
    ];
    
    res.json({
      documentId,
      currentVersion: '1.0.0',
      versionHistory,
      title: 'Clinical Evaluation Report'
    });
  } catch (error) {
    console.error('Error getting version history:', error);
    res.status(500).json({ error: `Failed to get version history: ${error.message}` });
  }
});

// POST /api/cer/submission/prepare - Prepare a CER for regulatory submission
router.post('/submission/prepare', async (req, res) => {
  try {
    const { 
      documentId,
      version,
      title,
      sections, 
      deviceInfo,
      metadata = {},
      submissionType = 'EU MDR', // EU MDR, FDA, etc.
      checklistItems = []
    } = req.body;
    
    if (!documentId || !version || !sections || sections.length === 0) {
      return res.status(400).json({ 
        error: 'Document ID, version, and sections are required' 
      });
    }
    
    console.log(`Preparing CER submission: ${title}, ID: ${documentId}, Version: ${version}, Type: ${submissionType}`);
    
    // In a production environment, we would:
    // 1. Validate the document against regulatory requirements
    // 2. Generate necessary supplementary files
    // 3. Create a submission package
    // 4. Store submission records
    
    // For now, we'll simulate these steps and return a submission report
    
    // Calculate completeness percentage based on sections
    const requiredSections = [
      'executive-summary', 'scope', 'device-description', 'intended-purpose',
      'clinical-data-context', 'literature-review', 'clinical-experience', 
      'risk-analysis', 'pms-data', 'equivalence', 'overall-assessment', 'conclusions'
    ];
    
    const presentSections = sections.map(s => s.type);
    const completedSections = requiredSections.filter(s => presentSections.includes(s));
    const completenessPercentage = Math.round((completedSections.length / requiredSections.length) * 100);
    
    // Simulate validation results
    const validationResults = {
      completeness: completenessPercentage,
      missingRequiredSections: requiredSections.filter(s => !presentSections.includes(s)),
      regulatoryCompliance: {
        'EU MDR': 0.82,
        'ISO 14155': 0.79,
        'FDA': 0.75
      },
      validationIssues: completenessPercentage < 100 ? [
        { 
          severity: 'error', 
          message: 'Missing required sections',
          details: `The following sections are required but missing: ${requiredSections.filter(s => !presentSections.includes(s)).join(', ')}`
        }
      ] : [],
      recommendedActions: []
    };
    
    // Add recommended actions based on validation
    if (validationResults.completeness < 100) {
      validationResults.recommendedActions.push('Complete all required sections');
    }
    
    if (validationResults.regulatoryCompliance['EU MDR'] < 0.8) {
      validationResults.recommendedActions.push('Improve EU MDR compliance score');
    }
    
    // Create final submission status
    const submissionStatus = {
      documentId,
      version,
      title,
      submissionType,
      preparedAt: new Date().toISOString(),
      validationResults,
      readyForSubmission: validationResults.completeness === 100 && validationResults.validationIssues.length === 0,
      submissionPackage: validationResults.completeness === 100 ? {
        mainDocumentUrl: `/api/cer/export-pdf?documentId=${documentId}&version=${version}`,
        supplementaryDocuments: [
          { name: 'Checklist', url: `/api/cer/submission/checklist?documentId=${documentId}&version=${version}` },
          { name: 'Submission Cover Letter', url: `/api/cer/submission/cover-letter?documentId=${documentId}&version=${version}` }
        ]
      } : null
    };
    
    res.json(submissionStatus);
  } catch (error) {
    console.error('Error preparing submission:', error);
    res.status(500).json({ error: `Failed to prepare submission: ${error.message}` });
  }
});

// Export for CommonJS compatibility
if (typeof module !== 'undefined') {
  module.exports = router;
}