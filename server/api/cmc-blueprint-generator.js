/**
 * API Handler for AI-CMC Blueprint Generator
 *
 * This module provides secure endpoints to process molecular structure data
 * and generate regulatory-ready CMC documents using OpenAI APIs.
 * It implements proper validation, rate limiting, and security measures.
 */

import { z } from 'zod';
import { getOpenAIClient } from '../services/openai-client';
import multer from 'multer';
import path from 'path';
import { promises as fs } from 'fs';
import { sanitizeInput, logApiUsage, handleApiError } from '../utils/api-security.js';
import {
  createDocx,
  createPDF,
  createECTD,
  createJSONExport,
} from '../utils/document-generator.js';

// Simple rate limiter implementation until express-rate-limit is properly installed
const createRateLimiter = options => {
  const requests = new Map();

  return (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    const windowStart = now - (options.windowMs || 3600000);

    // Clean old entries
    if (requests.has(ip)) {
      const requestTimes = requests.get(ip).filter(time => time > windowStart);
      requests.set(ip, requestTimes);

      if (requestTimes.length >= (options.max || 10)) {
        return res
          .status(429)
          .json(options.message || { error: 'Too many requests, please try again later.' });
      }

      requestTimes.push(now);
    } else {
      requests.set(ip, [now]);
    }

    next();
  };
};

// Ensure OpenAI API key is configured
if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is not configured. CMC Blueprint Generator will not work.');
}

// Initialize OpenAI client
const openai = getOpenAIClient();

// Rate limiter specific to blueprint generation (stricter limits due to high resource usage)
const blueprintRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 10, // 10 requests per hour
  message: { error: 'Too many blueprint generation requests. Please try again later.' },
});

// Rate limiter for file uploads (even stricter)
const uploadRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 20, // 20 uploads per hour
  message: { error: 'Too many file uploads. Please try again later.' },
});

// Configure file upload storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads');
    fs.mkdir(uploadDir, { recursive: true })
      .then(() => cb(null, uploadDir))
      .catch(err => cb(err));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  },
});

// File filter to only allow certain file types
const fileFilter = (req, file, cb) => {
  const allowedExtensions = ['.mol', '.sdf', '.pdb', '.cif', '.smi', '.png', '.jpg', '.jpeg'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type. Please upload a valid structure file or image.'), false);
  }
};

// Configure multer upload middleware
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB size limit
  },
}).single('file'); // 'file' is the field name for file upload

// Input validation schemas
const formulationSchema = z.object({
  dosageForm: z.string().min(1).max(100),
  routeOfAdministration: z.string().min(1).max(100),
  ingredients: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        function: z.string().min(1).max(200),
        amount: z.string().min(1).max(100),
      })
    )
    .optional(),
});

const molecularStructureSchema = z.object({
  moleculeName: z.string().min(2, {
    message: 'Molecule name must be at least 2 characters.',
  }),
  molecularFormula: z.string().min(2, {
    message: 'Molecular formula is required.',
  }),
  smiles: z.string().optional(),
  inchi: z.string().optional(),
  molecularWeight: z.string().optional(),
  synthesisPathway: z.string().optional(),
  analyticalMethods: z.array(z.string()).default([]),
  formulation: formulationSchema.optional(),
});

// Placeholder implementations of required functions
async function processChemistryFile(file) {
  // In a production environment, this would use chemistry parsing libraries
  return {
    moleculeName: file.originalname.split('.')[0],
    molecularFormula: 'C12H22O11', // Example formula
    estimatedMolecularWeight: '342.3 g/mol',
    detectedFunctionalGroups: ['Hydroxyl', 'Ether'],
    fileType: file.mimetype,
    fileName: file.originalname,
  };
}

async function processStructureImage(file) {
  // In a production environment, this would use OpenAI Vision API
  return {
    moleculeName: file.originalname.split('.')[0],
    molecularFormula: 'C12H22O11', // Example formula
    confidence: 0.92,
    fileType: file.mimetype,
    fileName: file.originalname,
  };
}

async function generateRegulatoryCitations(moleculeType, regulatoryRegion, sections) {
  // In production, this would use OpenAI to generate region-specific citations
  return sections.map(section => ({
    section,
    citations: [
      {
        reference: `${regulatoryRegion} Guideline on ${moleculeType} Development (2023)`,
        relevance: 'High',
        quote: 'Specifications should be set according to international standards.',
      },
    ],
  }));
}

async function generateProcessDiagram(molecularData) {
  // In production, this would use DALL-E or similar to create a diagram
  return {
    diagramUrl: '/placeholder-diagram.png',
    generatedAt: new Date().toISOString(),
    molecule: molecularData.moleculeName,
  };
}

async function performRiskAnalysis(molecularData, targetMarkets) {
  // In production, this would use OpenAI to analyze manufacturing risks
  return {
    overallRiskCategory: 'Medium',
    risksByMarket: targetMarkets.map(market => ({
      market,
      riskLevel: 'Medium',
      complianceGaps: ['Additional stability data may be required'],
    })),
    mitigationSuggestions: [
      'Implement additional in-process controls',
      'Consider alternative purification method',
    ],
  };
}

// Helper functions for generating detailed section prompts
function generateS1Prompt(molecularData) {
  return `Generate a comprehensive Section S.1 "General Information" for the ICH CTD Module 3 Quality documentation for ${molecularData.moleculeName} (${molecularData.molecularFormula}).`;
}

function generateS2Prompt(molecularData) {
  return `Generate a detailed Section S.2 "Manufacture" for the ICH CTD Module 3 Quality documentation for ${molecularData.moleculeName}.`;
}

function generateS3Prompt(molecularData) {
  return `Generate Section S.3 "Characterisation" for the ICH CTD Module 3 Quality documentation for ${molecularData.moleculeName}, including elucidation of structure and potential impurities.`;
}

function generateS4Prompt(molecularData) {
  return `Generate Section S.4 "Control of Drug Substance" for the ICH CTD Module 3 Quality documentation for ${molecularData.moleculeName}, including specifications, analytical procedures, and batch analyses.`;
}

function generateP1Prompt(molecularData) {
  const dosageForm = molecularData.formulation?.dosageForm || 'pharmaceutical form';
  return `Generate Section P.1 "Description and Composition" for the ICH CTD Module 3 Quality documentation for ${molecularData.moleculeName} ${dosageForm}.`;
}

function generateP2Prompt(molecularData) {
  const dosageForm = molecularData.formulation?.dosageForm || 'pharmaceutical form';
  return `Generate Section P.2 "Pharmaceutical Development" for the ICH CTD Module 3 Quality documentation for ${molecularData.moleculeName} ${dosageForm}.`;
}

/**
 * Generate complete CMC blueprint using OpenAI
 * @param {Object} molecularData - Validated molecular data
 * @returns {Promise<Object>} Generated CMC blueprint
 */
async function generateCMCBlueprint(molecularData) {
  // Map of section IDs to their detailed prompts
  const sectionPrompts = {
    's.1': generateS1Prompt(molecularData),
    's.2': generateS2Prompt(molecularData),
    's.3': generateS3Prompt(molecularData),
    's.4': generateS4Prompt(molecularData),
    'p.1': generateP1Prompt(molecularData),
    'p.2': generateP2Prompt(molecularData),
  };

  // Result object to store all generated content
  const results = {
    drugSubstance: {},
    drugProduct: {},
    diagrams: {},
    metadata: {
      generatedAt: new Date().toISOString(),
      molecule: {
        name: molecularData.moleculeName,
        formula: molecularData.molecularFormula,
      },
    },
  };

  // Check for OpenAI API key
  if (!process.env.OPENAI_API_KEY) {
    return {
      error: 'OpenAI API key not configured',
      message: 'Please configure OPENAI_API_KEY to use this functionality',
      metadata: results.metadata,
    };
  }

  // Generate section content function
  async function generateSectionContent(sectionId, prompt) {
    // For demonstration purposes only - in production this would use OpenAI API
    // But we'll return structured placeholder data
    const title = {
      's.1': 'General Information',
      's.2': 'Manufacture',
      's.3': 'Characterisation',
      's.4': 'Control of Drug Substance',
      'p.1': 'Description and Composition',
      'p.2': 'Pharmaceutical Development',
    }[sectionId];

    // Generate placeholder content based on section ID
    let content;
    if (sectionId === 's.1') {
      content = {
        title,
        content: `${molecularData.moleculeName} (${molecularData.molecularFormula}) is a synthetic compound...`,
        regulatoryConsiderations: ['ICH Q6A', 'ICH Q3A'],
        nomenclature: {
          chemicalName: `${molecularData.moleculeName}`,
          cas: '12345-67-8', // Placeholder CAS number
        },
      };
    } else if (sectionId === 's.2') {
      content = {
        title,
        content: `The manufacturing process for ${molecularData.moleculeName} consists of the following steps...`,
        criticalSteps: ['Stereoselective synthesis', 'Purification'],
        processControls: [
          {
            step: 'Initial Reaction',
            parameters: ['Temperature: 25-30°C', 'Time: 4 hours'],
          },
          {
            step: 'Purification',
            parameters: ['Column chromatography', 'HPLC purity >99%'],
          },
        ],
      };
    } else if (sectionId === 's.3') {
      content = {
        title,
        content: `The structure of ${molecularData.moleculeName} has been confirmed using the following techniques...`,
        techniques: ['NMR', 'Mass Spectrometry', 'IR Spectroscopy'],
        impurities: [
          {
            name: 'Process Impurity A',
            origin: 'By-product of synthesis step 2',
            limit: 'NMT 0.2%',
          },
          {
            name: 'Degradation Product B',
            origin: 'Hydrolysis under alkaline conditions',
            limit: 'NMT 0.5%',
          },
        ],
      };
    } else if (sectionId === 's.4') {
      content = {
        title,
        content: `Quality control of ${molecularData.moleculeName} includes the following specifications...`,
        specifications: [
          {
            test: 'Appearance',
            method: 'Visual inspection',
            acceptance: 'White to off-white crystalline powder',
          },
          {
            test: 'Identity',
            method: 'IR spectrum',
            acceptance: 'Matches reference standard',
          },
          {
            test: 'Assay',
            method: 'HPLC',
            acceptance: '98.0-102.0%',
          },
        ],
      };
    } else if (sectionId === 'p.1') {
      const dosageForm = molecularData.formulation?.dosageForm || 'tablet';
      content = {
        title,
        content: `${molecularData.moleculeName} is formulated as a ${dosageForm}...`,
        composition: molecularData.formulation?.ingredients?.map(ing => ({
          component: ing.name,
          function: ing.function,
          amount: ing.amount,
          quality: 'Pharmaceutical grade',
        })) || [
          {
            component: 'API',
            function: 'Active ingredient',
            amount: '50 mg',
            quality: 'As per drug substance specifications',
          },
          {
            component: 'Excipient',
            function: 'Filler',
            amount: '100 mg',
            quality: 'Ph.Eur./USP',
          },
        ],
      };
    } else if (sectionId === 'p.2') {
      const dosageForm = molecularData.formulation?.dosageForm || 'tablet';
      content = {
        title,
        content: `The development of ${molecularData.moleculeName} ${dosageForm} focused on the following key aspects...`,
        formulation: {
          developmentRationale:
            'The formulation was developed to ensure stability and appropriate release profile',
          criticalAttributes: ['Dissolution rate', 'Physical stability', 'Content uniformity'],
        },
        manufacturing: {
          processDescription: `The manufacturing process for ${molecularData.moleculeName} ${dosageForm} involves the following steps...`,
          steps: [
            'Blending of API with excipients',
            'Granulation',
            'Compression',
            'Coating (if applicable)',
          ],
        },
      };
    }

    return content;
  }

  // Process sections in small batches to limit concurrent requests
  const maxConcurrent = 2;
  const sections = Object.keys(sectionPrompts);

  for (let i = 0; i < sections.length; i += maxConcurrent) {
    const batch = sections.slice(i, i + maxConcurrent);
    const promises = batch.map(async sectionId => {
      const content = await generateSectionContent(sectionId, sectionPrompts[sectionId]);

      // Store in appropriate category
      if (sectionId.startsWith('s.')) {
        results.drugSubstance[sectionId] = content;
      } else if (sectionId.startsWith('p.')) {
        results.drugProduct[sectionId] = content;
      }

      return { sectionId, content };
    });

    // Wait for current batch to complete before starting next batch
    await Promise.all(promises);
  }

  // Add additional diagrams or charts as needed
  if (molecularData.synthesisPathway) {
    results.diagrams.synthesisPath = {
      title: 'Synthesis Pathway',
      description: 'Schematic representation of the synthesis route',
      url: '/placeholder/synthesis-diagram.png',
    };
  }

  return results;
}

export function registerCMCBlueprintRoutes(app) {
  /**
   * Upload and process molecular structure files
   */
  app.post('/api/cmc-blueprint-generator/upload', uploadRateLimiter, (req, res) => {
    upload(req, res, async err => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }

      try {
        // Check if file upload middleware is configured
        if (!req.file) {
          return res.status(400).json({ error: 'No files were uploaded.' });
        }

        const file = req.file;
        const fileExtension = file.originalname.split('.').pop().toLowerCase();

        // Process different file types
        let extractedData = {};

        if (['mol', 'sdf', 'pdb', 'cif', 'smi'].includes(fileExtension)) {
          // Chemistry file formats
          extractedData = await processChemistryFile(file);
        } else if (['png', 'jpg', 'jpeg'].includes(fileExtension)) {
          // Image files - use OpenAI Vision to extract chemical structure
          extractedData = await processStructureImage(file);
        } else {
          return res.status(400).json({
            error:
              'Unsupported file format. Please upload .mol, .sdf, .pdb, .cif, .smi, .png, .jpg, or .jpeg files.',
          });
        }

        // Log successful upload
        logApiUsage(req, 'cmc-blueprint-generator-upload', true, { fileType: fileExtension });

        // Return the extracted data
        return res.json({
          success: true,
          message: 'File processed successfully',
          extractedData,
        });
      } catch (error) {
        return handleApiError(error, res, 'Failed to process uploaded file');
      }
    });
  });

  /**
   * Generate CMC blueprint from molecular structure
   */
  app.post('/api/cmc-blueprint-generator', blueprintRateLimiter, async (req, res) => {
    try {
      // Sanitize and validate input
      const sanitizedInput = sanitizeInput(req.body);
      const validation = molecularStructureSchema.safeParse(sanitizedInput);

      if (!validation.success) {
        return res.status(400).json({
          error: 'Invalid molecular structure data',
          details: validation.error.errors,
        });
      }

      const {
        moleculeName,
        molecularFormula,
        smiles,
        inchi,
        molecularWeight,
        synthesisPathway,
        formulation,
      } = validation.data;

      // Log the API request (audit trail)
      logApiUsage(req, 'cmc-blueprint-generator', true, {
        moleculeName,
        molecularFormula,
      });

      // Generate the CMC sections using OpenAI
      const results = await generateCMCBlueprint(validation.data);

      // Return the generated content
      res.json(results);
    } catch (error) {
      handleApiError(req, res, error, 'cmc-blueprint-generator');
    }
  });

  /**
   * Generate regulatory citations for CMC sections
   */
  app.post('/api/cmc-blueprint-generator/citations', blueprintRateLimiter, async (req, res) => {
    try {
      // Sanitize and validate input
      const sanitizedInput = sanitizeInput(req.body);
      const { moleculeType, regulatoryRegion, sections } = sanitizedInput;

      if (!moleculeType || !regulatoryRegion || !sections || !Array.isArray(sections)) {
        return res.status(400).json({
          error: 'Invalid request data',
          details: 'moleculeType, regulatoryRegion, and sections array are required',
        });
      }

      // Log the API request
      logApiUsage(req, 'cmc-blueprint-citations', true, {
        moleculeType,
        regulatoryRegion,
        sectionCount: sections.length,
      });

      // Generate citations using OpenAI
      const citations = await generateRegulatoryCitations(moleculeType, regulatoryRegion, sections);

      // Return the citations
      res.json({
        citations,
        metadata: {
          generatedAt: new Date().toISOString(),
          moleculeType,
          regulatoryRegion,
        },
      });
    } catch (error) {
      handleApiError(req, res, error, 'cmc-blueprint-citations');
    }
  });

  /**
   * Generate manufacturing process diagram from synthesis pathway
   */
  app.post('/api/cmc-blueprint-generator/diagram', blueprintRateLimiter, async (req, res) => {
    try {
      // Sanitize and validate input
      const sanitizedInput = sanitizeInput(req.body);
      const { moleculeName, molecularFormula, synthesisPathway } = sanitizedInput;

      if (!moleculeName || !molecularFormula || !synthesisPathway) {
        return res.status(400).json({
          error: 'Missing required data',
          details: 'moleculeName, molecularFormula, and synthesisPathway are required',
        });
      }

      // Log the API request
      logApiUsage(req, 'cmc-blueprint-diagram', true, {
        moleculeName,
        molecularFormula,
      });

      // Generate the process diagram
      const diagram = await generateProcessDiagram({
        moleculeName,
        molecularFormula,
        synthesisPathway,
      });

      // Return the generated diagram URL
      res.json(diagram);
    } catch (error) {
      handleApiError(req, res, error, 'cmc-blueprint-diagram');
    }
  });

  /**
   * Perform risk analysis for manufacturing process
   */
  app.post('/api/cmc-blueprint-generator/risk-analysis', blueprintRateLimiter, async (req, res) => {
    try {
      // Sanitize and validate input
      const sanitizedInput = sanitizeInput(req.body);
      const { molecularData, targetMarkets } = sanitizedInput;

      if (!molecularData || !targetMarkets || !Array.isArray(targetMarkets)) {
        return res.status(400).json({
          error: 'Invalid request data',
          details: 'molecularData object and targetMarkets array are required',
        });
      }

      // Log the API request
      logApiUsage(req, 'cmc-blueprint-risk-analysis', true, {
        moleculeName: molecularData.moleculeName,
        targetMarkets: targetMarkets.join(','),
      });

      // Perform risk analysis
      const riskAnalysis = await performRiskAnalysis(molecularData, targetMarkets);

      // Return the risk analysis results
      res.json(riskAnalysis);
    } catch (error) {
      handleApiError(req, res, error, 'cmc-blueprint-risk-analysis');
    }
  });

  /**
   * Export CMC blueprint to formatted document
   */
  app.post('/api/cmc-blueprint-generator/export', blueprintRateLimiter, async (req, res) => {
    try {
      // Sanitize and validate input
      const sanitizedInput = sanitizeInput(req.body);
      const { format, template, moleculeName, blueprintId } = sanitizedInput;

      if (!format || !template || !moleculeName || !blueprintId) {
        return res.status(400).json({
          error: 'Missing required export parameters',
          details: 'format, template, moleculeName, and blueprintId are required',
        });
      }

      // Log the API request
      logApiUsage(req, 'cmc-blueprint-export', true, {
        format,
        template,
        moleculeName,
      });

      // Generate the document based on format
      let documentData;
      let contentType;

      switch (format) {
        case 'word':
          documentData = await createDocx(template, moleculeName, blueprintId);
          contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          break;
        case 'pdf':
          documentData = await createPDF(template, moleculeName, blueprintId);
          contentType = 'application/pdf';
          break;
        case 'ectd':
          documentData = await createECTD(template, moleculeName, blueprintId);
          contentType = 'application/zip';
          break;
        case 'json':
          documentData = await createJSONExport(template, moleculeName, blueprintId);
          contentType = 'application/json';
          break;
        default:
          return res.status(400).json({ error: 'Unsupported export format' });
      }

      // Set the appropriate headers for the response
      res.setHeader('Content-Type', contentType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${moleculeName}-CMC-Module3.${format}"`
      );

      // Send the document data
      res.send(documentData);
    } catch (error) {
      handleApiError(req, res, error, 'cmc-blueprint-export');
    }
  });

  /**
   * Fetch molecular property information from external databases
   */
  app.post(
    '/api/cmc-blueprint-generator/molecular-properties',
    blueprintRateLimiter,
    async (req, res) => {
      try {
        // Sanitize and validate input
        const sanitizedInput = sanitizeInput(req.body);

        // Extract the identifier
        const { identifier, identifierType } = sanitizedInput;

        if (!identifier || !identifierType) {
          return res.status(400).json({
            error: 'Missing identifier information',
            details: 'Both identifier and identifierType are required',
          });
        }

        // Log the API request (audit trail)
        logApiUsage(req, 'molecular-properties', true, {
          identifierType,
          identifier: identifierType === 'name' ? identifier : '[REDACTED]', // Don't log SMILES or InChI for privacy
        });

        // In production, this would fetch data from PubChem, ChEMBL, or similar services
        const properties = {
          properties: {
            molecularWeight: '342.30 g/mol',
            logP: -3.24,
            hydrogenBondDonors: 8,
            hydrogenBondAcceptors: 11,
            rotableBonds: 5,
            polarSurfaceArea: 139.06,
            solubility: 'Freely soluble in water',
          },
          source: 'API Simulation',
          identifier,
          identifierType,
        };

        // Return the properties
        res.json(properties);
      } catch (error) {
        handleApiError(req, res, error, 'molecular-properties');
      }
    }
  );
}
