/**
 * Academic and Regulatory Intelligence Routes
 *
 * These routes handle the integration of academic knowledge and global regulatory
 * intelligence into the Concept2Cure platform.
 */

import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { HuggingFaceService, huggingFaceService, RegulatoryRegion } from '../huggingface-service';
import { processAcademicResource } from '../academic-resource-upload';
import { academicKnowledgeTracker } from '../academic-knowledge-tracker';

// Configure storage for academic file uploads
const academicStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'academic_resources');

    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Create unique filename with original extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  },
});

const academicUpload = multer({
  storage: academicStorage,
  fileFilter: (req, file, cb) => {
    // Accept PDFs, DOCs, DOCXs, and other academic file types
    const acceptedTypes = ['.pdf', '.doc', '.docx', '.txt', '.csv', '.xls', '.xlsx'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (acceptedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOC, DOCX, TXT, CSV, XLS, and XLSX files are allowed'));
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

// Create router
const router = Router();

/**
 * Get a list of all academic resources
 */
router.get('/academic/resources', async (req, res) => {
  try {
    const resources = academicKnowledgeTracker.getTrackedResources();
    res.json({
      success: true,
      count: resources.length,
      resources,
    });
  } catch (error: any) {
    console.error('Error fetching academic resources:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch academic resources',
      error: error.message,
    });
  }
});

/**
 * Upload a new academic resource
 */
router.post('/academic/upload', academicUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    // Extract metadata
    const { title, source, category, year } = req.body;

    // Process the academic resource (extract text, embeddings, etc.)
    const result = await processAcademicResource(req.file.path, {
      title: title || req.file.originalname,
      source: source || 'Manual upload',
      category: category || 'General',
      year: year ? parseInt(year) : new Date().getFullYear(),
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to process academic resource',
        error: result.error,
      });
    }

    res.json({
      success: true,
      message: 'Academic resource uploaded and processed successfully',
      resourceId: result.resourceId,
      extractedData: {
        pageCount: result.pageCount,
        entities: result.entities?.slice(0, 10), // Just return a sample
        keyInsights: result.keyInsights?.slice(0, 5), // Just return a sample
      },
    });
  } catch (error: any) {
    console.error('Error processing academic upload:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process academic upload',
      error: error.message,
    });
  }
});

/**
 * Query academic knowledge
 */
router.post('/academic/query', async (req, res) => {
  try {
    const { query, limit = 10 } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Query text is required',
      });
    }

    // Generate query embedding and search academic knowledge
    const results = await academicKnowledgeTracker.searchKnowledge(query, limit);

    res.json({
      success: true,
      query,
      count: results.length,
      results,
    });
  } catch (error: any) {
    console.error('Error querying academic knowledge:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to query academic knowledge',
      error: error.message,
    });
  }
});

/**
 * Get regulatory intelligence for a specific region
 */
router.post('/regulatory/analyze', async (req, res) => {
  try {
    const { protocolText, regions } = req.body;

    if (!protocolText) {
      return res.status(400).json({
        success: false,
        message: 'Protocol text is required',
      });
    }

    // Default to all regions if none specified
    const regulatoryRegions = regions
      ? regions.map((r: any) => r.toUpperCase())
      : Object.values(RegulatoryRegion);

    // Analyze global compliance
    const complianceResults = await huggingFaceService.analyzeGlobalCompliance(
      protocolText,
      regulatoryRegions
    );

    res.json({
      success: true,
      regions: regulatoryRegions,
      results: complianceResults,
    });
  } catch (error: any) {
    console.error('Error analyzing regulatory compliance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to analyze regulatory compliance',
      error: error.message,
    });
  }
});

/**
 * Get supported regulatory regions
 */
router.get('/regulatory/regions', (req, res) => {
  try {
    const regions = Object.values(RegulatoryRegion);

    res.json({
      success: true,
      count: regions.length,
      regions: regions.map(region => ({
        id: region,
        name: getRegulatoryRegionName(region),
        description: getRegulatoryRegionDescription(region),
      })),
    });
  } catch (error: any) {
    console.error('Error fetching regulatory regions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch regulatory regions',
      error: error.message,
    });
  }
});

/**
 * Get a human-readable name for a regulatory region
 */
function getRegulatoryRegionName(region: string): string {
  switch (region) {
    case RegulatoryRegion.FDA:
      return 'US Food and Drug Administration (FDA)';
    case RegulatoryRegion.EMA:
      return 'European Medicines Agency (EMA)';
    case RegulatoryRegion.PMDA:
      return 'Pharmaceuticals and Medical Devices Agency (PMDA, Japan)';
    case RegulatoryRegion.NMPA:
      return 'National Medical Products Administration (NMPA, China)';
    case RegulatoryRegion.MHRA:
      return 'Medicines and Healthcare products Regulatory Agency (MHRA, UK)';
    case RegulatoryRegion.TGA:
      return 'Therapeutic Goods Administration (TGA, Australia)';
    case RegulatoryRegion.ANVISA:
      return 'Brazilian Health Regulatory Agency (ANVISA)';
    case RegulatoryRegion.CDSCO:
      return 'Central Drugs Standard Control Organization (CDSCO, India)';
    default:
      return region;
  }
}

/**
 * Get a description for a regulatory region
 */
function getRegulatoryRegionDescription(region: string): string {
  switch (region) {
    case RegulatoryRegion.FDA:
      return 'The primary regulatory agency for pharmaceuticals and medical devices in the United States. Key regulations include 21 CFR Part 312 for INDs and the FDORA 2022 for diversity requirements in clinical trials.';
    case RegulatoryRegion.EMA:
      return 'The regulatory agency overseeing medicines in the European Union. Key regulations include the EU Clinical Trial Regulation (EU) No 536/2014 and GDPR requirements for data protection.';
    case RegulatoryRegion.PMDA:
      return "Japan's regulatory agency for pharmaceuticals and medical devices. Requires special consideration for ethnic factors that may affect efficacy and safety in Japanese populations.";
    case RegulatoryRegion.NMPA:
      return "China's regulatory agency for pharmaceuticals and medical devices. Requires specific considerations for Chinese patient representation and Human Genetic Resources approval for genetic material collection.";
    case RegulatoryRegion.MHRA:
      return "The UK's regulatory agency for medicines and medical devices. Following Brexit, the UK has established independent regulatory processes while maintaining alignment with international standards.";
    case RegulatoryRegion.TGA:
      return "Australia's regulatory agency for therapeutic goods including medicines and medical devices. Known for its risk-based approach to regulation.";
    case RegulatoryRegion.ANVISA:
      return "Brazil's regulatory agency for health products. Requires specific considerations for Brazilian populations and local ethics committee approvals.";
    case RegulatoryRegion.CDSCO:
      return "India's regulatory agency for pharmaceuticals and medical devices. Requires specific considerations for Indian populations and local ethics committee approvals.";
    default:
      return 'Regulatory agency responsible for ensuring the safety, efficacy, and quality of medical products.';
  }
}

export { router as academicRegulatoryRouter };
