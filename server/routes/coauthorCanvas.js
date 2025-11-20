import express from 'express';
const router = express.Router();

// Mock CTD sections database
let ctdSections = [
  {
    id: '1.1',
    title: 'Forms & Cover Letters',
    status: 'complete',
    x: 100,
    y: 100,
    connections: ['1.2'],
  },
  {
    id: '1.2',
    title: 'TOC & Indices',
    status: 'complete',
    x: 300,
    y: 100,
    connections: ['1.3', '2.1', '3.1'],
  },
  {
    id: '1.3',
    title: 'Administrative Info',
    status: 'pending',
    x: 500,
    y: 100,
    connections: ['2.1'],
  },
  {
    id: '2.1',
    title: 'CTD Overview',
    status: 'pending',
    x: 300,
    y: 200,
    connections: ['2.2', '2.3'],
  },
  {
    id: '2.2',
    title: 'Clinical Overview',
    status: 'critical',
    x: 500,
    y: 200,
    connections: ['2.3', '2.4', '2.5'],
  },
  {
    id: '2.3',
    title: 'Nonclinical Overview',
    status: 'pending',
    x: 700,
    y: 200,
    connections: ['2.4'],
  },
  {
    id: '2.4',
    title: 'Clinical Summaries',
    status: 'pending',
    x: 500,
    y: 300,
    connections: ['2.5'],
  },
  {
    id: '2.5',
    title: 'Nonclinical Summaries',
    status: 'pending',
    x: 700,
    y: 300,
  },
  {
    id: '3.1',
    title: 'Quality Reports',
    status: 'pending',
    x: 200,
    y: 400,
    connections: ['3.2', '3.3'],
  },
  {
    id: '3.2',
    title: 'Nonclinical Reports',
    status: 'pending',
    x: 400,
    y: 400,
    connections: ['3.3'],
  },
  {
    id: '3.3',
    title: 'Clinical Reports',
    status: 'critical',
    x: 600,
    y: 400,
  },
];

/**
 * GET /api/coauthor/sections
 * Returns all CTD sections with position and connection data
 */
router.get('/sections', (req, res) => {
  res.json(ctdSections);
});

/**
 * GET /api/coauthor/sections/:id
 * Returns a specific CTD section by ID
 */
router.get('/sections/:id', (req, res) => {
  const section = ctdSections.find(s => s.id === req.params.id);

  if (!section) {
    return res.status(404).json({ error: 'Section not found' });
  }

  res.json(section);
});

/**
 * POST /api/coauthor/layout/:id
 * Updates the position of a CTD section
 */
router.post('/layout/:id', (req, res) => {
  const { id } = req.params;
  const { x, y } = req.body;

  const sectionIndex = ctdSections.findIndex(s => s.id === id);

  if (sectionIndex === -1) {
    return res.status(404).json({ error: 'Section not found' });
  }

  // Update the section's position
  ctdSections[sectionIndex] = {
    ...ctdSections[sectionIndex],
    x,
    y,
  };

  res.json(ctdSections[sectionIndex]);
});

/**
 * GET /api/coauthor/risks
 * Returns risk connection data for the Canvas
 */
router.get('/risks', (req, res) => {
  // Mock risk connections
  const riskConnections = [
    { source: '2.2', target: '3.3', riskLevel: 'high' },
    { source: '1.3', target: '2.1', riskLevel: 'medium' },
    { source: '3.1', target: '3.2', riskLevel: 'low' },
  ];

  res.json(riskConnections);
});

/**
 * GET /api/coauthor/guidance/:id
 * Returns regulatory guidance for a specific section
 */
router.get('/guidance/:id', (req, res) => {
  const { id } = req.params;

  // In a real implementation, this would query a database of regulatory guidance
  const guidance = {
    text: `Regulatory guidance for section ${id} would be retrieved from the database.
This section requires comprehensive documentation according to ICH guidelines.
Include all relevant supporting information and cross-reference to other modules as needed.`,
    examples: [
      'Example 1 from FDA guidelines',
      'Example 2 from ICH guidelines',
      'Example 3 from EMA guidelines',
    ],
  };

  res.json(guidance);
});

export default router;
