import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Sample mock documents for demonstration
const mockDocuments = [
  {
    id: 'DOC20250412001',
    title: 'CardioMonitor Pro 3000 - EU MDR Clinical Evaluation',
    documentType: 'Clinical Evaluation Report',
    module: 'cer',
    section: 'Executive Summary',
    status: 'final',
    deviceName: 'CardioMonitor Pro 3000',
    deviceType: 'Patient Monitoring Device',
    manufacturer: 'MedTech Innovations, Inc.',
    templateUsed: 'EU MDR 2017/745 Full Template',
    generatedAt: '2025-03-27T14:23:45Z',
    lastModified: '2025-04-12T09:15:22Z',
    owner: 'Dr. Sarah Johnson',
    pageCount: 78,
    wordCount: 28506,
    sections: 14,
    projectId: 'PR-CV-2025',
    downloadUrl: '/static/cer-generated/CER12345678.pdf',
  },
  {
    id: 'DOC20250405002',
    title: 'NeuroPulse Implant - MEDDEV Clinical Evaluation',
    documentType: 'Clinical Evaluation Report',
    module: 'cer',
    section: 'Device Description',
    status: 'review',
    deviceName: 'NeuroPulse Implant',
    deviceType: 'Implantable Medical Device',
    manufacturer: 'Neural Systems Ltd.',
    templateUsed: 'MEDDEV 2.7/1 Rev 4 Template',
    generatedAt: '2025-03-12T10:08:31Z',
    lastModified: '2025-04-05T14:22:45Z',
    owner: 'Dr. Michael Chen',
    pageCount: 64,
    wordCount: 22145,
    sections: 12,
    projectId: 'PR-IM-2025',
    downloadUrl: '/static/cer-generated/CER12345678.pdf',
  },
  {
    id: 'DOC20250402003',
    title: 'LaserScan X500 - FDA 510(k) Clinical Evaluation',
    documentType: 'Clinical Evaluation Report',
    module: 'cer',
    section: 'Clinical Data',
    status: 'approved',
    deviceName: 'LaserScan X500',
    deviceType: 'Diagnostic Equipment',
    manufacturer: 'OptiMed Devices, Inc.',
    templateUsed: 'FDA 510(k) Template',
    generatedAt: '2025-02-20T16:42:19Z',
    lastModified: '2025-04-02T11:33:57Z',
    owner: 'Dr. Lisa Rodriguez',
    pageCount: 52,
    wordCount: 18230,
    sections: 10,
    projectId: 'PR-DG-2025',
    downloadUrl: '/static/cer-generated/CER12345678.pdf',
  },
  {
    id: 'DOC20250401004',
    title: 'ThermoRegulator 5000 Protocol',
    documentType: 'Protocol',
    module: 'protocol',
    section: 'Study Design',
    status: 'draft',
    deviceName: 'ThermoRegulator 5000',
    deviceType: 'Therapeutic Device',
    manufacturer: 'ThermalMed Technologies',
    templateUsed: 'Standard Protocol Template',
    generatedAt: '2025-04-01T08:15:30Z',
    lastModified: '2025-04-01T08:15:30Z',
    owner: 'Dr. Robert Williams',
    pageCount: 35,
    wordCount: 12850,
    sections: 8,
    projectId: 'PR-TH-2025',
    downloadUrl: '/static/protocol/PROTOCOL12345678.pdf',
  },
  {
    id: 'DOC20250329005',
    title: 'BioPatch Mark IV - Chemistry Methods Summary',
    documentType: 'Chemistry, Manufacturing & Controls',
    module: 'cmc',
    section: 'Manufacturing Process',
    status: 'review',
    deviceName: 'BioPatch Mark IV',
    deviceType: 'Biologic Delivery Device',
    manufacturer: 'BioMed Innovations, LLC',
    templateUsed: 'CMC Full Template',
    generatedAt: '2025-03-28T14:22:10Z',
    lastModified: '2025-03-29T09:45:12Z',
    owner: 'Dr. James Thompson',
    pageCount: 48,
    wordCount: 18750,
    sections: 9,
    projectId: 'PR-BD-2025',
    downloadUrl: '/static/cmc/CMC12345678.pdf',
  },
  {
    id: 'DOC20250325006',
    title: 'GlucoSense Ultra - IND Application',
    documentType: 'Investigational New Drug',
    module: 'ind',
    section: 'Pharmacology/Toxicology',
    status: 'approved',
    deviceName: 'GlucoSense Ultra',
    deviceType: 'Diagnostic Device',
    manufacturer: 'Diabetes Management Systems, Inc.',
    templateUsed: 'IND Full Template',
    generatedAt: '2025-03-15T11:30:45Z',
    lastModified: '2025-03-25T16:20:18Z',
    owner: 'Dr. Emily Parker',
    pageCount: 86,
    wordCount: 32450,
    sections: 15,
    projectId: 'PR-DD-2025',
    downloadUrl: '/static/ind/IND12345678.pdf',
  },
  {
    id: 'DOC20250320007',
    title: 'CogniTest Evaluator - Clinical Study Report',
    documentType: 'Clinical Study Report',
    module: 'csr',
    section: 'Efficacy Evaluation',
    status: 'final',
    deviceName: 'CogniTest Evaluator',
    deviceType: 'Neurological Assessment Tool',
    manufacturer: 'Cognitive Health Systems',
    templateUsed: 'CSR ICH E3 Template',
    generatedAt: '2025-02-28T09:45:22Z',
    lastModified: '2025-03-20T14:12:55Z',
    owner: 'Dr. Thomas Wilson',
    pageCount: 72,
    wordCount: 28750,
    sections: 16,
    projectId: 'PR-NT-2025',
    downloadUrl: '/static/csr/CSR12345678.pdf',
  },
];

// GET /api/docs - List all documents with optional filtering
router.get('/', async (req, res) => {
  try {
    const {
      module,
      section,
      status,
      owner,
      search,
      dateFrom,
      dateTo,
      page = 1,
      limit = 10,
    } = req.query;

    // Apply filters
    let filteredDocs = [...mockDocuments];

    if (module) {
      filteredDocs = filteredDocs.filter(doc => doc.module.toLowerCase() === module.toLowerCase());
    }

    if (section) {
      filteredDocs = filteredDocs.filter(doc =>
        doc.section.toLowerCase().includes(section.toLowerCase())
      );
    }

    if (status) {
      filteredDocs = filteredDocs.filter(doc => doc.status.toLowerCase() === status.toLowerCase());
    }

    if (owner) {
      filteredDocs = filteredDocs.filter(doc =>
        doc.owner.toLowerCase().includes(owner.toLowerCase())
      );
    }

    if (search) {
      const searchLower = search.toLowerCase();
      filteredDocs = filteredDocs.filter(
        doc =>
          doc.title.toLowerCase().includes(searchLower) ||
          doc.deviceName.toLowerCase().includes(searchLower) ||
          doc.documentType.toLowerCase().includes(searchLower)
      );
    }

    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      filteredDocs = filteredDocs.filter(doc => new Date(doc.lastModified) >= fromDate);
    }

    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999); // End of day
      filteredDocs = filteredDocs.filter(doc => new Date(doc.lastModified) <= toDate);
    }

    // Sort by lastModified date (newest first)
    filteredDocs.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

    // Calculate pagination
    const totalDocs = filteredDocs.length;
    const totalPages = Math.ceil(totalDocs / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedDocs = filteredDocs.slice(startIndex, endIndex);

    res.json({
      documents: paginatedDocs,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        totalDocs,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// GET /api/docs/:id - Get a specific document by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const document = mockDocuments.find(doc => doc.id === id);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(document);
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// POST /api/docs/:id/approve - Approve a document
router.post('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const documentIndex = mockDocuments.findIndex(doc => doc.id === id);

    if (documentIndex === -1) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Update the document status
    mockDocuments[documentIndex] = {
      ...mockDocuments[documentIndex],
      status: 'approved',
      lastModified: new Date().toISOString(),
    };

    res.json({
      success: true,
      document: mockDocuments[documentIndex],
    });
  } catch (error) {
    console.error('Error approving document:', error);
    res.status(500).json({ error: 'Failed to approve document' });
  }
});

// POST /api/docs/:id/review - Submit document for review
router.post('/:id/review', async (req, res) => {
  try {
    const { id } = req.params;
    const { comments } = req.body;
    const documentIndex = mockDocuments.findIndex(doc => doc.id === id);

    if (documentIndex === -1) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Update the document status
    mockDocuments[documentIndex] = {
      ...mockDocuments[documentIndex],
      status: 'review',
      reviewComments: comments,
      lastModified: new Date().toISOString(),
    };

    res.json({
      success: true,
      document: mockDocuments[documentIndex],
    });
  } catch (error) {
    console.error('Error submitting document for review:', error);
    res.status(500).json({ error: 'Failed to submit document for review' });
  }
});

export default router;
