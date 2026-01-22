import express from 'express';

const router = express.Router();

const isDemoMode = () => process.env.DEMO_MODE === 'true';

router.use((req, res, next) => {
  if (!isDemoMode()) {
    return res.status(501).json({
      error: 'Document demo endpoints require DEMO_MODE=true',
    });
  }
  next();
});

// Sample documents for demo mode
const sampleDocs = [
  {
    objectId: 'doc-001',
    displayName: 'Protocol Summary.pdf',
    contentUrl: '#',
    type: 'Protocol',
    lastModified: '2025-08-08',
    status: 'Draft',
    author: 'Dr. Smith',
    module: 'ind-wizard',
    tags: ['Protocol', 'IND', 'Phase I'],
  },
  {
    objectId: 'doc-002',
    displayName: 'Investigator Brochure v2.1.docx',
    contentUrl: '#',
    type: 'IB Document',
    lastModified: '2025-08-07',
    status: 'Final',
    author: 'Medical Writing Team',
    module: 'ind-wizard',
    tags: ['IB', 'Safety', 'Completed'],
  },
  {
    objectId: 'doc-003',
    displayName: 'CMC Manufacturing Report.pdf',
    contentUrl: '#',
    type: 'CMC Document',
    lastModified: '2025-08-06',
    status: 'Under Review',
    author: 'CMC Team',
    module: 'cmc',
    tags: ['CMC', 'Manufacturing', 'Quality'],
  },
];

// List documents endpoint
router.get('/list', async (req, res) => {
  try {
    const { folder } = req.query;

    // Filter documents by folder/module if specified
    let filteredDocs = sampleDocs;
    if (folder) {
      filteredDocs = sampleDocs.filter(
        doc => doc.module === folder || doc.type.toLowerCase().includes(folder.toLowerCase())
      );
    }

    res.json(filteredDocs);
  } catch (error) {
    console.error('Error listing documents:', error);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

// Upload document endpoint
router.post('/upload', async (req, res) => {
  try {
    const { name, type, module } = req.body;

    const newDoc = {
      objectId: `doc-${Date.now()}`,
      displayName: name || 'Uploaded Document',
      contentUrl: '#',
      type: type || 'Document',
      lastModified: new Date().toISOString().split('T')[0],
      status: 'New',
      author: 'Current User',
      module: module || 'default',
      tags: [module || 'default', 'Uploaded'],
    };

    // In production, this would save to database
    sampleDocs.unshift(newDoc);

    res.status(201).json(newDoc);
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

export default router;
