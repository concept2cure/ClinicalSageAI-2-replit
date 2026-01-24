/**
 * eCTD Document Management API Routes
 * Provides version control, lineage tracking, and content reuse for eCTD documents
 */

import express from 'express';
const router = express.Router();

// Mock data for eCTD documents with version control
const mockDocuments = [
  {
    id: '1',
    title: 'Module 2.5 Clinical Overview',
    module: 'module2',
    section: '2.5 Clinical Overview',
    version: 3,
    status: 'approved',
    author: 'Dr. Smith',
    description: 'Comprehensive clinical overview for IND submission',
    updatedAt: new Date('2025-01-15'),
    createdAt: new Date('2024-11-01'),
    hasLineage: true,
    tags: ['clinical', 'overview', 'module2'],
    content: 'Clinical trial data and analysis...',
  },
  {
    id: '2',
    title: 'Drug Substance Manufacturing Process',
    module: 'module3',
    section: '3.1 Drug Substance',
    version: 2,
    status: 'review',
    author: 'Manufacturing Team',
    description: 'Detailed manufacturing process documentation',
    updatedAt: new Date('2025-01-10'),
    createdAt: new Date('2024-10-15'),
    hasLineage: true,
    tags: ['manufacturing', 'CMC', 'drug substance'],
    content: 'Manufacturing process steps and controls...',
  },
  {
    id: '3',
    title: 'Nonclinical Toxicology Studies',
    module: 'module4',
    section: '4.3 Toxicology',
    version: 1,
    status: 'draft',
    author: 'Toxicology Lab',
    description: 'Comprehensive toxicology study reports',
    updatedAt: new Date('2025-01-20'),
    createdAt: new Date('2025-01-20'),
    hasLineage: false,
    tags: ['toxicology', 'nonclinical', 'safety'],
    content: 'Toxicology study results and analysis...',
  },
  {
    id: '4',
    title: 'Cover Letter for IND',
    module: 'module1',
    section: '1.0 Cover Letter',
    version: 4,
    status: 'finalized',
    author: 'Regulatory Affairs',
    description: 'Official cover letter for IND submission',
    updatedAt: new Date('2025-01-18'),
    createdAt: new Date('2024-09-01'),
    hasLineage: true,
    tags: ['administrative', 'cover letter', 'IND'],
    content: 'Dear FDA Reviewer...',
  },
  {
    id: '5',
    title: 'Clinical Study Protocol',
    module: 'module5',
    section: '5.2 Clinical Study Reports',
    version: 2,
    status: 'approved',
    author: 'Clinical Team',
    description: 'Phase 2 clinical study protocol',
    updatedAt: new Date('2025-01-12'),
    createdAt: new Date('2024-12-01'),
    hasLineage: true,
    tags: ['clinical', 'protocol', 'phase2'],
    content: 'Study protocol and design...',
  },
];

// Mock version history
const mockVersions = {
  '1': [
    {
      id: 'v1-3',
      documentId: '1',
      versionNumber: 3,
      changeDescription: 'Updated clinical endpoints based on FDA feedback',
      author: 'Dr. Smith',
      createdAt: new Date('2025-01-15'),
      isCurrent: true,
    },
    {
      id: 'v1-2',
      documentId: '1',
      versionNumber: 2,
      changeDescription: 'Added safety monitoring plan',
      author: 'Dr. Smith',
      createdAt: new Date('2025-01-10'),
      isCurrent: false,
    },
    {
      id: 'v1-1',
      documentId: '1',
      versionNumber: 1,
      changeDescription: 'Initial draft',
      author: 'Dr. Jones',
      createdAt: new Date('2024-11-01'),
      isCurrent: false,
    },
  ],
  '2': [
    {
      id: 'v2-2',
      documentId: '2',
      versionNumber: 2,
      changeDescription: 'Updated process parameters',
      author: 'Manufacturing Team',
      createdAt: new Date('2025-01-10'),
      isCurrent: true,
    },
    {
      id: 'v2-1',
      documentId: '2',
      versionNumber: 1,
      changeDescription: 'Initial manufacturing process',
      author: 'Manufacturing Team',
      createdAt: new Date('2024-10-15'),
      isCurrent: false,
    },
  ],
};

// Mock document lineage
const mockLineage = {
  '1': {
    parents: [
      { id: '2', title: 'Drug Substance Manufacturing Process', relationship: 'references' },
      { id: '5', title: 'Clinical Study Protocol', relationship: 'based-on' },
    ],
    children: [
      { id: '4', title: 'Cover Letter for IND', relationship: 'summarized-in' },
    ],
  },
  '2': {
    parents: [],
    children: [
      { id: '1', title: 'Module 2.5 Clinical Overview', relationship: 'referenced-by' },
    ],
  },
  '4': {
    parents: [
      { id: '1', title: 'Module 2.5 Clinical Overview', relationship: 'summarizes' },
      { id: '5', title: 'Clinical Study Protocol', relationship: 'references' },
    ],
    children: [],
  },
};

// Get all eCTD documents
router.get('/', (req, res) => {
  const { projectId, organizationId } = req.query;
  
  // In production, filter by projectId and organizationId
  // For now, return all mock documents
  res.json(mockDocuments);
});

// Get document versions
router.get('/:documentId/versions', (req, res) => {
  const { documentId } = req.params;
  const versions = mockVersions[documentId] || [];
  
  res.json(versions);
});

// Create new version
router.post('/:documentId/versions', (req, res) => {
  const { documentId } = req.params;
  const { versionNumber, changeDescription, author } = req.body;
  
  // Find the document
  const document = mockDocuments.find(d => d.id === documentId);
  if (!document) {
    return res.status(404).json({ error: 'Document not found' });
  }
  
  // Create new version
  const newVersion = {
    id: `v${documentId}-${versionNumber}`,
    documentId,
    versionNumber,
    changeDescription,
    author,
    createdAt: new Date(),
    isCurrent: true,
  };
  
  // Update mock data (in production, save to database)
  if (!mockVersions[documentId]) {
    mockVersions[documentId] = [];
  }
  
  // Mark all existing versions as not current
  mockVersions[documentId].forEach(v => v.isCurrent = false);
  
  // Add new version
  mockVersions[documentId].unshift(newVersion);
  
  // Update document version
  document.version = versionNumber;
  document.updatedAt = new Date();
  
  res.json({
    success: true,
    version: newVersion,
  });
});

// Get document lineage
router.get('/:documentId/lineage', (req, res) => {
  const { documentId } = req.params;
  const lineage = mockLineage[documentId] || { parents: [], children: [] };
  
  res.json(lineage);
});

// Link documents
router.post('/link', (req, res) => {
  const { parentId, childId, linkType } = req.body;
  
  // Find both documents
  const parentDoc = mockDocuments.find(d => d.id === parentId);
  const childDoc = mockDocuments.find(d => d.id === childId);
  
  if (!parentDoc || !childDoc) {
    return res.status(404).json({ error: 'Document(s) not found' });
  }
  
  // Update lineage (in production, save to database)
  if (!mockLineage[parentId]) {
    mockLineage[parentId] = { parents: [], children: [] };
  }
  if (!mockLineage[childId]) {
    mockLineage[childId] = { parents: [], children: [] };
  }
  
  // Add relationship
  mockLineage[parentId].children.push({
    id: childId,
    title: childDoc.title,
    relationship: linkType,
  });
  
  mockLineage[childId].parents.push({
    id: parentId,
    title: parentDoc.title,
    relationship: linkType,
  });
  
  // Mark documents as having lineage
  parentDoc.hasLineage = true;
  childDoc.hasLineage = true;
  
  res.json({
    success: true,
    message: 'Documents linked successfully',
  });
});

// Extract reusable content
router.post('/:documentId/extract', (req, res) => {
  const { documentId } = req.params;
  const { sectionPath } = req.body;
  
  // Find the document
  const document = mockDocuments.find(d => d.id === documentId);
  if (!document) {
    return res.status(404).json({ error: 'Document not found' });
  }
  
  // Extract content (in production, parse and extract actual section)
  const extractedContent = {
    id: `extract-${documentId}-${Date.now()}`,
    sourceDocument: {
      id: document.id,
      title: document.title,
      version: document.version,
    },
    sectionPath,
    content: document.content,
    extractedAt: new Date(),
    tags: document.tags,
    isReusable: true,
  };
  
  res.json({
    success: true,
    extraction: extractedContent,
  });
});

// Search documents
router.get('/search', (req, res) => {
  const { query, module, section, status } = req.query;
  
  let results = [...mockDocuments];
  
  // Filter by search query
  if (query) {
    const lowerQuery = query.toLowerCase();
    results = results.filter(doc => 
      doc.title.toLowerCase().includes(lowerQuery) ||
      doc.description.toLowerCase().includes(lowerQuery) ||
      doc.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }
  
  // Filter by module
  if (module && module !== 'all') {
    results = results.filter(doc => doc.module === module);
  }
  
  // Filter by section
  if (section) {
    results = results.filter(doc => doc.section === section);
  }
  
  // Filter by status
  if (status) {
    results = results.filter(doc => doc.status === status);
  }
  
  res.json(results);
});

// Get document statistics
router.get('/statistics', (req, res) => {
  const stats = {
    totalDocuments: mockDocuments.length,
    byModule: {},
    byStatus: {},
    recentActivity: [],
  };
  
  // Calculate statistics
  mockDocuments.forEach(doc => {
    // By module
    if (!stats.byModule[doc.module]) {
      stats.byModule[doc.module] = 0;
    }
    stats.byModule[doc.module]++;
    
    // By status
    if (!stats.byStatus[doc.status]) {
      stats.byStatus[doc.status] = 0;
    }
    stats.byStatus[doc.status]++;
  });
  
  // Recent activity
  stats.recentActivity = mockDocuments
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 5)
    .map(doc => ({
      id: doc.id,
      title: doc.title,
      action: doc.version > 1 ? 'Updated' : 'Created',
      timestamp: doc.updatedAt,
      author: doc.author,
    }));
  
  res.json(stats);
});

export default router;