import { Router } from 'express';
import { supabase } from '../lib/supabaseClient.js';
import { verifyJwt } from '../middleware/auth.js';
import { suggestMissing } from '../services/ai.js';

const router = Router();

// In-memory storage for eCTD documents and metadata
const ectdStorage = new Map();
const documentStatus = new Map();
const regulatoryComments = new Map();
const assayTrackers = new Map();

// POST /api/ectd – create a new dossier skeleton
router.post('/', verifyJwt, async (req, res) => {
  const { tenantId, id: userId } = req.user;
  const { product, region, dossierType } = req.body; // e.g. NDA, MAA
  const { data, error } = await supabase
    .from('submissions')
    .insert({
      tenant_id: tenantId,
      product,
      region,
      dossier_type: dossierType,
      status: 'Planning',
      created_by: userId,
    })
    .select('*')
    .single();
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

// GET /api/ectd/:id/outline – returns outline + readiness info
router.get('/:id/outline', verifyJwt, async (req, res) => {
  const { tenantId } = req.user;
  const { id } = req.params;
  const { data: sub, error: subErr } = await supabase
    .from('submissions')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();
  if (subErr) return res.status(404).json({ message: 'Submission not found' });

  // Example static outline – could be driven by region
  const outline = [
    { section: 'Module 1', name: 'Regional Admin', docs: [] },
    { section: 'Module 2', name: 'Summary', docs: [] },
    { section: 'Module 3', name: 'Quality (CMC)', docs: [] },
    { section: 'Module 4', name: 'Non‑clinical', docs: [] },
    { section: 'Module 5', name: 'Clinical', docs: [] },
  ];
  // fetch existing docs linked to this submission
  const { data: docs } = await supabase
    .from('documents')
    .select('*')
    .contains('tags', [`submission:${id}`]);
  // map docs to outline
  outline.forEach(o => {
    o.docs = docs.filter(d => d.tags?.includes(o.section));
  });

  // AI suggestion for missing sections
  const missing = outline.filter(o => o.docs.length === 0).map(o => o.section);
  const aiHint = missing.length ? await suggestMissing(missing, sub.region) : null;

  res.json({ outline, missing, aiHint });
});

// GET /api/ectd/unified/tree/:projectId - Get unified eCTD tree structure
router.get('/unified/tree/:projectId', async (req, res) => {
  const { projectId } = req.params;
  
  // Return the complete eCTD structure with document status
  const treeData = {
    projectId,
    modules: [
      {
        id: 'module1',
        name: 'Module 1: Administrative Information',
        status: documentStatus.get(`${projectId}_module1`) || 'not_started',
        children: [
          { id: '1.0', name: 'Cover Letter', status: 'completed', required: true },
          { id: '1.2', name: 'FDA Form 1571', status: 'in_progress', required: true },
          { id: '1.3', name: 'FDA Form 1572', status: 'not_started', required: true },
        ]
      },
      {
        id: 'module2',
        name: 'Module 2: Summaries',
        status: documentStatus.get(`${projectId}_module2`) || 'in_progress',
        children: [
          { id: '2.2', name: 'Introduction to Summary', status: 'completed', required: true },
          { 
            id: '2.3', 
            name: 'Quality Overall Summary', 
            status: 'in_progress',
            required: true,
            children: [
              { id: '2.3.S', name: 'Drug Substance', status: 'in_progress' },
              { id: '2.3.P', name: 'Drug Product', status: 'not_started' }
            ]
          },
          { id: '2.5', name: 'Clinical Overview', status: 'completed', required: true }
        ]
      },
      {
        id: 'module3',
        name: 'Module 3: Quality',
        status: documentStatus.get(`${projectId}_module3`) || 'not_started',
        children: [
          { id: '3.2.S', name: 'Drug Substance', status: 'not_started', required: true },
          { id: '3.2.P', name: 'Drug Product', status: 'not_started', required: true }
        ]
      },
      {
        id: 'module4',
        name: 'Module 4: Nonclinical Study Reports',
        status: documentStatus.get(`${projectId}_module4`) || 'not_started',
        children: [
          { id: '4.2.1', name: 'Pharmacology', status: 'not_started', required: true },
          { id: '4.2.2', name: 'Pharmacokinetics', status: 'not_started', required: true },
          { id: '4.2.3', name: 'Toxicology', status: 'not_started', required: true }
        ]
      },
      {
        id: 'module5',
        name: 'Module 5: Clinical Study Reports',
        status: documentStatus.get(`${projectId}_module5`) || 'not_started',
        children: [
          { id: '5.3.5', name: 'Reports of Efficacy and Safety Studies', status: 'not_started', required: true }
        ]
      }
    ]
  };
  
  res.json({ success: true, tree: treeData });
});

// GET /api/ectd/unified/document/:nodeId - Get document details
router.get('/unified/document/:nodeId', async (req, res) => {
  const { nodeId } = req.params;
  
  const document = ectdStorage.get(nodeId) || {
    id: nodeId,
    title: `Document ${nodeId}`,
    content: 'This is a sample eCTD document content. Edit to add your regulatory content here.',
    status: documentStatus.get(nodeId) || 'not_started',
    version: 1,
    lastModified: new Date(),
    owner: 'Current User'
  };
  
  res.json({ success: true, document });
});

// POST /api/ectd/unified/document - Save document
router.post('/unified/document', async (req, res) => {
  const { nodeId, content, status, title } = req.body;
  
  const document = {
    id: nodeId,
    title: title || `Document ${nodeId}`,
    content,
    status: status || 'in_progress',
    version: (ectdStorage.get(nodeId)?.version || 0) + 1,
    lastModified: new Date(),
    owner: 'Current User'
  };
  
  ectdStorage.set(nodeId, document);
  documentStatus.set(nodeId, status);
  
  res.json({ 
    success: true, 
    document,
    message: 'Document saved successfully'
  });
});

// POST /api/ectd/unified/comment - Add regulatory comment
router.post('/unified/comment', async (req, res) => {
  const { nodeId, text, type = 'regulatory' } = req.body;
  
  const comment = {
    id: Date.now(),
    nodeId,
    text,
    type,
    author: 'Current User',
    timestamp: new Date(),
    resolved: false
  };
  
  const comments = regulatoryComments.get(nodeId) || [];
  comments.push(comment);
  regulatoryComments.set(nodeId, comments);
  
  res.json({ 
    success: true, 
    comment,
    message: 'Comment added successfully'
  });
});

// GET /api/ectd/unified/comments/:nodeId - Get comments for a node
router.get('/unified/comments/:nodeId', async (req, res) => {
  const { nodeId } = req.params;
  const comments = regulatoryComments.get(nodeId) || [];
  
  res.json({ 
    success: true, 
    comments 
  });
});

// POST /api/ectd/unified/assay - Track assay
router.post('/unified/assay', async (req, res) => {
  const { name, type, status, validationDate, projectId } = req.body;
  
  const assay = {
    id: Date.now(),
    name,
    type,
    status: status || 'qualifying',
    validationDate,
    projectId,
    createdAt: new Date()
  };
  
  const projectAssays = assayTrackers.get(projectId) || [];
  projectAssays.push(assay);
  assayTrackers.set(projectId, projectAssays);
  
  res.json({ 
    success: true, 
    assay,
    message: 'Assay tracked successfully'
  });
});

// GET /api/ectd/unified/assays/:projectId - Get assays for project
router.get('/unified/assays/:projectId', async (req, res) => {
  const { projectId } = req.params;
  const assays = assayTrackers.get(projectId) || [];
  
  res.json({ 
    success: true, 
    assays 
  });
});

// POST /api/ectd/unified/compliance-report - Generate compliance report
router.post('/unified/compliance-report', async (req, res) => {
  const { projectId, jurisdiction = 'FDA' } = req.body;
  
  // Generate mock compliance report
  const report = {
    projectId,
    jurisdiction,
    generatedAt: new Date(),
    overallScore: 92,
    documentCompleteness: {
      module1: 75,
      module2: 85,
      module3: 60,
      module4: 45,
      module5: 30
    },
    requiredDocuments: {
      total: 25,
      completed: 18,
      inProgress: 5,
      notStarted: 2
    },
    criticalFindings: [
      {
        severity: 'high',
        module: 'Module 3',
        message: 'Missing stability data for drug substance'
      }
    ],
    warnings: [
      {
        severity: 'medium',
        module: 'Module 2',
        message: 'Clinical overview needs additional safety data'
      }
    ],
    recommendations: [
      'Complete all Module 3 CMC documentation before proceeding',
      'Add recent clinical trial data to Module 5',
      'Review and update Module 1 administrative forms'
    ],
    aiInsights: {
      predictedApprovalProbability: 0.78,
      estimatedTimeToCompletion: '4-6 weeks',
      suggestedPriorities: [
        'Focus on Module 3 completion',
        'Address stability data gaps',
        'Finalize clinical study reports'
      ]
    }
  };
  
  res.json({ 
    success: true, 
    report 
  });
});

// GET /api/ectd/unified/library/:projectId - Get document library
router.get('/unified/library/:projectId', async (req, res) => {
  const { projectId } = req.params;
  
  // Return mock library documents
  const documents = [
    {
      id: 1,
      name: 'Protocol_v1.2.pdf',
      type: 'PDF',
      size: '2.3 MB',
      lastModified: '2024-01-15',
      category: 'Protocol'
    },
    {
      id: 2,
      name: 'IB_Draft.docx',
      type: 'DOCX',
      size: '1.8 MB',
      lastModified: '2024-01-10',
      category: 'Investigator Brochure'
    },
    {
      id: 3,
      name: 'CMC_Data.xlsx',
      type: 'XLSX',
      size: '4.5 MB',
      lastModified: '2024-01-08',
      category: 'CMC'
    }
  ];
  
  res.json({ 
    success: true, 
    documents 
  });
});

// POST /api/ectd/unified/upload - Upload document to library
router.post('/unified/upload', async (req, res) => {
  const { name, type, size, category, projectId } = req.body;
  
  const document = {
    id: Date.now(),
    name,
    type,
    size,
    category,
    lastModified: new Date(),
    projectId
  };
  
  res.json({ 
    success: true, 
    document,
    message: 'Document uploaded successfully'
  });
});

// GET /api/ectd/unified/jurisdictions - Get available jurisdictions
router.get('/unified/jurisdictions', async (req, res) => {
  const jurisdictions = [
    {
      code: 'FDA',
      name: 'FDA (United States)',
      icon: '🇺🇸',
      requirements: ['FDA Form 1571', 'FDA Form 1572', '21 CFR Part 312']
    },
    {
      code: 'EMA',
      name: 'EMA (Europe)',
      icon: '🇪🇺',
      requirements: ['IMPD', 'EudraCT Number', 'Directive 2001/20/EC']
    },
    {
      code: 'PMDA',
      name: 'PMDA (Japan)',
      icon: '🇯🇵',
      requirements: ['J-CTD', 'Japanese Label', 'PAL/GVP Compliance']
    },
    {
      code: 'HC',
      name: 'Health Canada',
      icon: '🇨🇦',
      requirements: ['CTA', 'Canadian Label', 'Division 5 Compliance']
    }
  ];
  
  res.json({ 
    success: true, 
    jurisdictions 
  });
});

export default router;
