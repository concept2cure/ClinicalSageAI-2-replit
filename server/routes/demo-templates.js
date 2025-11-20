const express = require('express');
const router = express.Router();

// Demo templates for client presentation
const demoTemplates = [
  {
    id: 'template-1',
    name: 'Clinical Overview (Module 2.5)',
    description: 'ICH M4 compliant clinical overview template with benefit-risk assessment',
    category: 'Module 2',
    lastUpdated: '1 week ago',
    regions: [
      { id: 201, name: 'FDA Module 2.5', region: 'US FDA', lastUpdated: '1 week ago' },
      { id: 202, name: 'EMA Module 2.5', region: 'EU EMA', lastUpdated: '1 week ago' },
    ],
    contentBlocks: ['table-2-5-1', 'narrative-2-5-benefit-risk', 'figure-2-7-3-forest-plot'],
    atomsComposition: true,
    complianceScore: 92,
    estimatedTime: '45 minutes',
  },
  {
    id: 'template-2',
    name: 'Quality Summary (Module 2.3)',
    description: 'Comprehensive quality overall summary for pharmaceutical products',
    category: 'Module 2',
    lastUpdated: '3 days ago',
    regions: [
      { id: 203, name: 'FDA Module 2.3', region: 'US FDA', lastUpdated: '3 days ago' },
      { id: 204, name: 'EMA Module 2.3', region: 'EU EMA', lastUpdated: '3 days ago' },
    ],
    contentBlocks: ['table-3-2-1', 'narrative-quality-summary'],
    atomsComposition: true,
    complianceScore: 88,
    estimatedTime: '30 minutes',
  },
  {
    id: 'template-3',
    name: "Investigator's Brochure",
    description: 'Comprehensive IB template with safety updates and risk assessment',
    category: 'Clinical',
    lastUpdated: '2 weeks ago',
    regions: [
      { id: 205, name: 'Global IB Template', region: 'Global', lastUpdated: '2 weeks ago' },
    ],
    contentBlocks: ['narrative-ib-safety', 'table-ib-dose-escalation'],
    atomsComposition: true,
    complianceScore: 95,
    estimatedTime: '60 minutes',
  },
  {
    id: 'template-4',
    name: 'Clinical Study Report',
    description: 'ICH E3 compliant CSR template with statistical analysis',
    category: 'Module 5',
    lastUpdated: '5 days ago',
    regions: [{ id: 206, name: 'ICH E3 CSR', region: 'Global', lastUpdated: '5 days ago' }],
    contentBlocks: ['table-csr-efficacy', 'figure-csr-flow', 'narrative-csr-conclusions'],
    atomsComposition: true,
    complianceScore: 91,
    estimatedTime: '90 minutes',
  },
  {
    id: 'template-5',
    name: 'Nonclinical Overview (Module 2.4)',
    description: 'Comprehensive nonclinical data overview with safety pharmacology',
    category: 'Module 2',
    lastUpdated: '1 month ago',
    regions: [
      { id: 207, name: 'FDA Module 2.4', region: 'US FDA', lastUpdated: '1 month ago' },
      { id: 208, name: 'EMA Module 2.4', region: 'EU EMA', lastUpdated: '1 month ago' },
    ],
    contentBlocks: ['table-nonclinical-summary', 'narrative-safety-pharmacology'],
    atomsComposition: true,
    complianceScore: 87,
    estimatedTime: '40 minutes',
  },
];

// GET /api/demo/templates - Get all demo templates
router.get('/templates', (req, res) => {
  try {
    res.json(demoTemplates);
  } catch (error) {
    console.error('Error fetching demo templates:', error);
    res.status(500).json({ error: 'Failed to fetch demo templates' });
  }
});

// GET /api/demo/templates/:id - Get specific template
router.get('/templates/:id', (req, res) => {
  try {
    const template = demoTemplates.find(t => t.id === req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(template);
  } catch (error) {
    console.error('Error fetching demo template:', error);
    res.status(500).json({ error: 'Failed to fetch demo template' });
  }
});

// POST /api/demo/create-document - Create document from template
router.post('/create-document', async (req, res) => {
  try {
    const { templateId, documentTitle, ectdModule } = req.body;

    const template = demoTemplates.find(t => t.id === templateId);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Generate a task ID for the document creation
    const taskId = `demo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Simulate document generation process
    setTimeout(() => {
      console.log(`Demo document created: ${documentTitle} using template: ${template.name}`);
    }, 1000);

    res.json({
      success: true,
      task_id: taskId,
      message: `Document "${documentTitle}" creation started using template "${template.name}"`,
      template: template.name,
      estimatedTime: template.estimatedTime,
    });
  } catch (error) {
    console.error('Error creating demo document:', error);
    res.status(500).json({ error: 'Failed to create demo document' });
  }
});

module.exports = router;
