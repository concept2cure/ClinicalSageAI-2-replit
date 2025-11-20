/**
 * AI Change Impact Simulator (AICIS)
 *
 * This module provides functionality to simulate the regulatory impact
 * of CMC changes across global markets, predict timelines, and generate
 * recommended bridging studies and justifications.
 */

import express from 'express';
import { checkForOpenAIKey } from '../../utils/api-security.js';
import { validateRequestBody } from '../../utils/validation.js';
import { changeImpactSchema } from './types.js';
import { rateLimit } from 'express-rate-limit';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

// Rate limiter for impact simulation (more permissive)
const impactSimulationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many impact simulation requests, please try again after a minute',
});

// Create router
const router = express.Router();

// Get OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Get current directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure output directory exists
const outputDir = path.join(process.cwd(), 'output');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

/**
 * Simulate the impact of a proposed CMC change across global markets
 * POST /api/cmc/change-impact-simulator/simulate
 */
router.post('/simulate', checkForOpenAIKey, impactSimulationLimiter, async (req, res) => {
  try {
    // Validate request body against schema
    const validationResult = changeImpactSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: validationResult.error.errors,
      });
    }

    const {
      changeType,
      description,
      affectedDocuments,
      affectedParameters,
      markets,
      currentState,
      proposedState,
    } = req.body;

    // Generate a unique simulation ID
    const simulationId = uuidv4();

    // Use OpenAI to analyze the impact
    const messages = [
      {
        role: 'system',
        content: `You are an expert regulatory affairs consultant specializing in Chemistry, Manufacturing, and Controls (CMC) submissions. 
        You need to analyze a proposed change and determine its regulatory impact across different global markets.
        
        For your analysis, focus on:
        1. The type of submission/filing required in each market (e.g., CBE-30, Type II Variation, etc.)
        2. The timeline impact on the overall regulatory strategy
        3. Required bridging studies, comparability protocols, or additional data needed
        4. Risk assessment and mitigation strategies
        5. Potential health authority questions or concerns
        
        Provide a structured, objective analysis that would help a pharmaceutical company make informed decisions.`,
      },
      {
        role: 'user',
        content: `Please analyze the following proposed CMC change:
        
        Change Type: ${changeType.replace(/_/g, ' ').toUpperCase()}
        
        Description: ${description}
        
        Current State: ${currentState || 'Not specified'}
        
        Proposed State: ${proposedState || 'Not specified'}
        
        Affected Documents: ${affectedDocuments ? affectedDocuments.join(', ') : 'Not specified'}
        
        Affected Parameters: ${affectedParameters ? affectedParameters.join(', ') : 'Not specified'}
        
        Markets to Analyze: ${markets.map(m => m.toUpperCase()).join(', ')}
        
        Please provide a comprehensive impact analysis according to the guidelines.`,
      },
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messages,
      temperature: 0.3,
      max_tokens: 2500,
    });

    // Get the response
    const impactAnalysis = response.choices[0].message.content;

    // Structure the results
    const impactResult = {
      simulationId,
      changeType,
      description,
      markets,
      impactAnalysis,
      generatedAt: new Date().toISOString(),
    };

    // Save the results to a JSON file for future reference
    const filePath = path.join(outputDir, `impact_${simulationId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(impactResult, null, 2));

    return res.status(200).json({
      success: true,
      simulationId,
      changeType,
      markets,
      impactAnalysis,
      downloadUrl: `/api/cmc/change-impact-simulator/download/${simulationId}`,
    });
  } catch (error) {
    console.error('Error in impact simulation:', error);
    return res.status(500).json({
      error: 'An error occurred while simulating change impact',
      details: error.message,
    });
  }
});

/**
 * Generate a detailed report for a specific market
 * POST /api/cmc/change-impact-simulator/market-report
 */
router.post('/market-report', checkForOpenAIKey, impactSimulationLimiter, async (req, res) => {
  try {
    const { simulationId, market } = req.body;

    // Basic validation
    if (!simulationId || !market) {
      return res.status(400).json({ error: 'Simulation ID and market are required' });
    }

    // Get the simulation results
    const filePath = path.join(outputDir, `impact_${simulationId}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Simulation not found' });
    }

    const simulationData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Use OpenAI to generate a detailed report for the specific market
    const messages = [
      {
        role: 'system',
        content: `You are an expert regulatory affairs consultant specializing in Chemistry, Manufacturing, and Controls (CMC) submissions. 
        Based on a previous impact analysis, you need to generate a detailed report for a specific market.
        
        For your report, focus on:
        1. The specific regulatory requirements for this market
        2. Required documentation and data
        3. Detailed timelines and submission strategy
        4. Common pitfalls and best practices
        5. Templates or examples of successful submissions
        
        Provide a comprehensive, market-specific report that would help a pharmaceutical company prepare their submission.`,
      },
      {
        role: 'user',
        content: `Based on the following impact analysis, please generate a detailed report for the ${market.toUpperCase()} market:
        
        Change Type: ${simulationData.changeType.replace(/_/g, ' ').toUpperCase()}
        
        Description: ${simulationData.description}
        
        Overall Impact Analysis: ${simulationData.impactAnalysis}
        
        Please provide a comprehensive, ${market.toUpperCase()}-specific report according to the guidelines.`,
      },
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messages,
      temperature: 0.3,
      max_tokens: 2500,
    });

    // Get the response
    const marketReport = response.choices[0].message.content;

    // Update the simulation results with the market report
    simulationData.marketReports = simulationData.marketReports || {};
    simulationData.marketReports[market] = {
      report: marketReport,
      generatedAt: new Date().toISOString(),
    };

    // Save the updated results
    fs.writeFileSync(filePath, JSON.stringify(simulationData, null, 2));

    return res.status(200).json({
      success: true,
      simulationId,
      market,
      marketReport,
      downloadUrl: `/api/cmc/change-impact-simulator/download/${simulationId}`,
    });
  } catch (error) {
    console.error('Error in market report generation:', error);
    return res.status(500).json({
      error: 'An error occurred while generating the market report',
      details: error.message,
    });
  }
});

/**
 * Download impact simulation results
 * GET /api/cmc/change-impact-simulator/download/:simulationId
 */
router.get('/download/:simulationId', (req, res) => {
  try {
    const { simulationId } = req.params;
    const format = req.query.format || 'json';

    // Sanitize the simulation ID to prevent directory traversal
    const sanitizedId = simulationId.replace(/[^a-zA-Z0-9-]/g, '');

    // Build the file path
    const filePath = path.join(outputDir, `impact_${sanitizedId}.json`);

    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Simulation not found' });
    }

    // Read the simulation data
    const simulationData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Handle different formats
    if (format === 'pdf') {
      // In a real implementation, we would convert the data to PDF
      // For now, we'll just return the JSON
      return res.status(500).json({ error: 'PDF format not yet implemented' });
    } else if (format === 'html') {
      // In a real implementation, we would convert the data to HTML
      // For now, we'll just return the JSON
      return res.status(500).json({ error: 'HTML format not yet implemented' });
    } else {
      // Return JSON format
      return res.json(simulationData);
    }
  } catch (error) {
    console.error('Error in simulation download:', error);
    return res.status(500).json({
      error: 'An error occurred while downloading the simulation',
      details: error.message,
    });
  }
});

/**
 * Get a list of predefined change types with examples
 * GET /api/cmc/change-impact-simulator/change-types
 */
router.get('/change-types', (req, res) => {
  const changeTypes = [
    {
      id: 'api_supplier_change',
      name: 'API Supplier Change',
      description: 'Change of supplier for the active pharmaceutical ingredient',
      examples: [
        'Switching from Supplier A to Supplier B for the same API',
        'Adding a second supplier for API while maintaining the first supplier',
      ],
    },
    {
      id: 'process_scale_up',
      name: 'Process Scale-Up',
      description: 'Increasing the scale of manufacturing process',
      examples: [
        'Scaling up from 100kg to 500kg batch size',
        'Moving from pilot scale to commercial scale manufacturing',
      ],
    },
    {
      id: 'excipient_replacement',
      name: 'Excipient Replacement',
      description: 'Replacing one excipient with another in the formulation',
      examples: [
        'Replacing lactose with mannitol in a tablet formulation',
        'Changing the source of a colorant in the coating',
      ],
    },
    {
      id: 'analytical_method_change',
      name: 'Analytical Method Change',
      description: 'Changes to analytical methods used for testing',
      examples: [
        'Switching from HPLC to UPLC for assay testing',
        'Implementing a new dissolution method',
      ],
    },
    {
      id: 'facility_change',
      name: 'Facility Change',
      description: 'Moving production to a different manufacturing facility',
      examples: [
        'Transferring manufacturing from Site A to Site B',
        'Adding a second manufacturing site',
      ],
    },
    {
      id: 'equipment_change',
      name: 'Equipment Change',
      description: 'Changes to manufacturing equipment',
      examples: ['Replacing a granulator with a newer model', 'Using a different type of blender'],
    },
    {
      id: 'process_parameter_change',
      name: 'Process Parameter Change',
      description: 'Changes to critical or non-critical process parameters',
      examples: [
        'Adjusting mixing time from 30 to 45 minutes',
        'Changing compression force for tablets',
      ],
    },
    {
      id: 'specification_change',
      name: 'Specification Change',
      description: 'Changes to product or material specifications',
      examples: ['Tightening a dissolution specification', 'Adding a new impurity test'],
    },
    {
      id: 'packaging_change',
      name: 'Packaging Change',
      description: 'Changes to packaging materials or configuration',
      examples: [
        'Switching from glass to PET bottles',
        'Changing the supplier of primary packaging materials',
      ],
    },
    {
      id: 'stability_protocol_change',
      name: 'Stability Protocol Change',
      description: 'Changes to stability testing protocols',
      examples: [
        'Adding new stability time points',
        'Implementing a reduced stability testing program',
      ],
    },
  ];

  return res.status(200).json({ changeTypes });
});

/**
 * Get a list of regulatory markets with basic information
 * GET /api/cmc/change-impact-simulator/markets
 */
router.get('/markets', (req, res) => {
  const markets = [
    {
      id: 'fda',
      name: 'FDA',
      fullName: 'U.S. Food and Drug Administration',
      country: 'United States',
      changeCategories: ['CBE-0', 'CBE-30', 'PAS', 'Annual Report'],
    },
    {
      id: 'ema',
      name: 'EMA',
      fullName: 'European Medicines Agency',
      country: 'European Union',
      changeCategories: ['Type IA', 'Type IB', 'Type II'],
    },
    {
      id: 'pmda',
      name: 'PMDA',
      fullName: 'Pharmaceuticals and Medical Devices Agency',
      country: 'Japan',
      changeCategories: ['Minor Change', 'Partial Change Approval'],
    },
    {
      id: 'nmpa',
      name: 'NMPA',
      fullName: 'National Medical Products Administration',
      country: 'China',
      changeCategories: ['Minor', 'Moderate', 'Major'],
    },
    {
      id: 'anvisa',
      name: 'ANVISA',
      fullName: 'Brazilian Health Regulatory Agency',
      country: 'Brazil',
      changeCategories: ['Historic', 'Moderate', 'Major'],
    },
    {
      id: 'health_canada',
      name: 'Health Canada',
      fullName: 'Health Canada',
      country: 'Canada',
      changeCategories: ['Level I', 'Level II', 'Level III', 'Level IV'],
    },
    {
      id: 'uk_mhra',
      name: 'UK MHRA',
      fullName: 'Medicines and Healthcare products Regulatory Agency',
      country: 'United Kingdom',
      changeCategories: ['Type IA', 'Type IB', 'Type II'],
    },
    {
      id: 'who',
      name: 'WHO',
      fullName: 'World Health Organization',
      country: 'Global',
      changeCategories: ['Minor', 'Moderate', 'Major'],
    },
  ];

  return res.status(200).json({ markets });
});

export default router;
