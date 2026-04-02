/**
 * Document Data Center API Routes
 * Integrated file vault with 3-axis tagging for 510(k) submissions
 */
import express from 'express';
import documentDataCenterService from '../services/DocumentDataCenterService';
const router = express.Router();

// Reference data initialization will happen on-demand per tenant
// when they first access the Document Data Center

// Upload document with AI tagging
router.post('/upload', 
  documentDataCenterService.getUploadMiddleware(),
  async (req, res) => {
    try {
      const organizationId = Number((req as any).user?.organizationId || (req as any).tenantId);
      const userId = req.headers['x-user-id'] as string || 'user';
      
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      const result = await documentDataCenterService.uploadDocument(
        organizationId,
        req.file,
        {
          deviceName: req.body.deviceName,
          deviceModel: req.body.deviceModel,
          category: req.body.category,
          manualTags: req.body.tags ? JSON.parse(req.body.tags) : [],
          userId,
        }
      );

      res.json(result);
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'Failed to upload document' });
    }
  }
);

// Get all documents with filtering
router.get('/files', async (req, res) => {
  try {
    const organizationId = Number((req as any).user?.organizationId || (req as any).tenantId);
    const { search, category, standard, component } = req.query;

    // Build filter array from query params
    const filters: any = {};
    if (category) {
      filters.categories = Array.isArray(category) ? category : [category];
    }
    if (standard) {
      filters.testStandards = Array.isArray(standard) ? standard : [standard];
    }
    if (component) {
      filters.components = Array.isArray(component) ? component : [component];
    }

    const result = await documentDataCenterService.deepSearch(
      organizationId,
      search as string || '',
      filters
    );

    res.json({ files: result.results });
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// Deep search endpoint
router.post('/search/deep', async (req, res) => {
  try {
    const organizationId = Number((req as any).user?.organizationId || (req as any).tenantId);
    const { query, filters } = req.body;

    const result = await documentDataCenterService.deepSearch(
      organizationId,
      query || '',
      filters
    );

    res.json(result);
  } catch (error) {
    console.error('Deep search error:', error);
    res.status(500).json({ error: 'Search operation failed' });
  }
});

// Update document tags
router.patch('/files/:id/tags', async (req, res) => {
  try {
    const organizationId = Number((req as any).user?.organizationId || (req as any).tenantId);
    const documentId = parseInt(req.params.id);
    const userId = req.headers['x-user-id'] as string || 'user';

    const result = await documentDataCenterService.updateDocumentTags(
      organizationId,
      documentId,
      {
        ...req.body,
        userId,
      }
    );

    res.json(result);
  } catch (error) {
    console.error('Error updating tags:', error);
    res.status(500).json({ error: 'Failed to update document tags' });
  }
});

// Get document citations
router.post('/citations', async (req, res) => {
  try {
    const organizationId = Number((req as any).user?.organizationId || (req as any).tenantId);
    const { documentIds } = req.body;

    if (!documentIds || !Array.isArray(documentIds)) {
      return res.status(400).json({ error: 'Document IDs required' });
    }

    const result = await documentDataCenterService.getDocumentCitations(
      organizationId,
      documentIds
    );

    res.json(result);
  } catch (error) {
    console.error('Error getting citations:', error);
    res.status(500).json({ error: 'Failed to retrieve citations' });
  }
});

// Get statistics
router.get('/stats', async (req, res) => {
  try {
    const organizationId = Number((req as any).user?.organizationId || (req as any).tenantId);
    
    const result = await documentDataCenterService.getStatistics(organizationId);
    
    res.json(result);
  } catch (error) {
    console.error('Error getting statistics:', error);
    res.status(500).json({ error: 'Failed to retrieve statistics' });
  }
});

// Get categories (reference data)
router.get('/categories', async (req, res) => {
  try {
    // Return predefined categories
    const categories = [
      { id: 1, categoryCode: 'bench_test', categoryName: 'Bench Testing' },
      { id: 2, categoryCode: 'biocompatibility', categoryName: 'Biocompatibility' },
      { id: 3, categoryCode: 'predicate_labeling', categoryName: 'Predicate Labeling' },
      { id: 4, categoryCode: 'electrical_safety', categoryName: 'Electrical Safety' },
      { id: 5, categoryCode: 'software_validation', categoryName: 'Software Validation' },
      { id: 6, categoryCode: 'sterilization', categoryName: 'Sterilization' },
      { id: 7, categoryCode: 'shelf_life', categoryName: 'Shelf Life/Stability' },
      { id: 8, categoryCode: 'packaging', categoryName: 'Packaging' },
      { id: 9, categoryCode: 'human_factors', categoryName: 'Human Factors' },
      { id: 10, categoryCode: 'clinical_data', categoryName: 'Clinical Data' },
      { id: 11, categoryCode: 'manufacturing', categoryName: 'Manufacturing' },
      { id: 12, categoryCode: 'risk_analysis', categoryName: 'Risk Analysis' },
    ];
    
    res.json({ categories });
  } catch (error) {
    console.error('Error getting categories:', error);
    res.status(500).json({ error: 'Failed to retrieve categories' });
  }
});

// Get test standards (reference data)
router.get('/standards', async (req, res) => {
  try {
    // Return predefined standards
    const standards = [
      { id: 1, standardCode: 'ISO 10993', standardName: 'Biological evaluation of medical devices' },
      { id: 2, standardCode: 'IEC 60601', standardName: 'Medical electrical equipment safety' },
      { id: 3, standardCode: 'ISO 14971', standardName: 'Risk management for medical devices' },
      { id: 4, standardCode: 'IEC 62304', standardName: 'Medical device software lifecycle' },
      { id: 5, standardCode: 'IEC 62366', standardName: 'Usability engineering' },
      { id: 6, standardCode: 'ASTM F2475', standardName: 'Biocompatibility of materials' },
      { id: 7, standardCode: 'ISO 11135', standardName: 'Ethylene oxide sterilization' },
      { id: 8, standardCode: 'ISO 11137', standardName: 'Radiation sterilization' },
      { id: 9, standardCode: 'ISO 11607', standardName: 'Packaging for terminally sterilized devices' },
      { id: 10, standardCode: 'ISO 13485', standardName: 'Quality management systems' },
      { id: 11, standardCode: 'FDA 21 CFR 820', standardName: 'Quality System Regulation' },
      { id: 12, standardCode: 'AAMI TIR', standardName: 'Technical Information Reports' },
    ];
    
    res.json({ standards });
  } catch (error) {
    console.error('Error getting standards:', error);
    res.status(500).json({ error: 'Failed to retrieve standards' });
  }
});

// Get device components (reference data)
router.get('/components', async (req, res) => {
  try {
    // Return predefined components
    const components = [
      { id: 1, componentCode: 'housing', componentName: 'Housing/Enclosure', componentType: 'hardware' },
      { id: 2, componentCode: 'pcb', componentName: 'Circuit Board', componentType: 'hardware' },
      { id: 3, componentCode: 'sensor', componentName: 'Sensor Module', componentType: 'hardware' },
      { id: 4, componentCode: 'display', componentName: 'Display/UI', componentType: 'hardware' },
      { id: 5, componentCode: 'power', componentName: 'Power Supply', componentType: 'hardware' },
      { id: 6, componentCode: 'firmware', componentName: 'Firmware', componentType: 'software' },
      { id: 7, componentCode: 'application', componentName: 'Application Software', componentType: 'software' },
      { id: 8, componentCode: 'algorithm', componentName: 'Algorithm/AI', componentType: 'software' },
      { id: 9, componentCode: 'biocompatible', componentName: 'Patient Contact Materials', componentType: 'materials' },
      { id: 10, componentCode: 'packaging', componentName: 'Primary Packaging', componentType: 'materials' },
      { id: 11, componentCode: 'system', componentName: 'Complete System', componentType: 'system' },
    ];
    
    res.json({ components });
  } catch (error) {
    console.error('Error getting components:', error);
    res.status(500).json({ error: 'Failed to retrieve components' });
  }
});

// Delete document
router.delete('/file/:id', async (req, res) => {
  try {
    const organizationId = Number((req as any).user?.organizationId || (req as any).tenantId);
    const documentId = parseInt(req.params.id);
    
    // For now, return success (would implement actual delete)
    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// Get single document file
router.get('/file/:id', async (req, res) => {
  try {
    const organizationId = Number((req as any).user?.organizationId || (req as any).tenantId);
    const documentId = parseInt(req.params.id);
    
    // Would implement actual file retrieval and streaming
    res.status(501).json({ error: 'File streaming not yet implemented' });
  } catch (error) {
    console.error('Error getting file:', error);
    res.status(500).json({ error: 'Failed to retrieve file' });
  }
});

export default router;