import express from 'express';

const router = express.Router();

// Store active SSE connections per leafId
const sseConnections = new Map();

// Helper functions for leaf operations
const extractCtdPath = (leafId) => {
  // Extract CTD path from leaf ID (e.g., m23-drug-substance from m23-1234567)
  const match = leafId.match(/^m(\d+)/);
  if (match) {
    const moduleNum = match[1];
    const paths = {
      '1': 'm1-administrative',
      '2': 'm2-common-technical-document-summaries',
      '23': 'm2-3-quality-overall-summary',
      '3': 'm3-quality',
      '32': 'm3-2-body-of-data',
      '4': 'm4-nonclinical-study-reports',
      '5': 'm5-clinical-study-reports'
    };
    return paths[moduleNum] || `m${moduleNum}`;
  }
  return 'unknown';
};

const getHydratedContent = async (leafId) => {
  // For demo purposes, return sample hydrated content
  // In production, this would fetch from database
  const templates = {
    'm23': `<h1>2.3 Quality Overall Summary</h1>
<h2>Drug Substance</h2>
<p>The drug substance is manufactured according to cGMP guidelines with validated analytical methods.</p>
<h3>Manufacturing Process</h3>
<p>The synthesis involves a multi-step process with in-process controls at critical steps.</p>
<h3>Characterization</h3>
<p>Complete structural characterization has been performed using NMR, MS, IR, and X-ray crystallography.</p>`,
    'm32': `<h1>3.2 Body of Data</h1>
<h2>Drug Substance</h2>
<h3>3.2.S.1 General Information</h3>
<p>Nomenclature, structure, and general properties of the drug substance.</p>
<h3>3.2.S.2 Manufacture</h3>
<p>Detailed manufacturing process including flow diagrams and in-process controls.</p>`,
    'm4': `<h1>Module 4: Nonclinical Study Reports</h1>
<h2>4.2 Study Reports</h2>
<h3>4.2.1 Pharmacology</h3>
<p>Primary and secondary pharmacodynamics studies demonstrate target engagement and mechanism of action.</p>
<h3>4.2.2 Pharmacokinetics</h3>
<p>ADME studies show favorable absorption and distribution profile.</p>`,
    'm5': `<h1>Module 5: Clinical Study Reports</h1>
<h2>5.3 Study Reports</h2>
<h3>5.3.1 Reports of Biopharmaceutic Studies</h3>
<p>Bioavailability and bioequivalence studies support the proposed dosing regimen.</p>
<h3>5.3.5 Reports of Efficacy and Safety Studies</h3>
<p>Phase 1/2 studies demonstrate acceptable safety profile and preliminary efficacy signals.</p>`
  };
  
  // Return template based on leaf ID prefix
  for (const [prefix, content] of Object.entries(templates)) {
    if (leafId.startsWith(prefix)) {
      return content;
    }
  }
  
  // Default content
  return `<h1>Document Content</h1>
<p>This document contains hydrated content from the IND template application process.</p>
<p>Leaf ID: ${leafId}</p>`;
};

const getLeafFacts = async (leafId) => {
  // Return sample facts that feed this leaf
  return [
    {
      id: `fact_${leafId}_1`,
      type: 'drug_substance',
      source: 'CMC Data',
      content: 'Drug substance has 99.5% purity by HPLC',
      confidence: 0.95,
      citations: ['Analytical Report AR-2025-001']
    },
    {
      id: `fact_${leafId}_2`,
      type: 'stability',
      source: 'Stability Studies',
      content: '24-month stability data at 25°C/60% RH shows no degradation',
      confidence: 0.98,
      citations: ['Stability Protocol SP-2024-003']
    },
    {
      id: `fact_${leafId}_3`,
      type: 'manufacturing',
      source: 'Manufacturing Records',
      content: 'Three consecutive batches meet all release specifications',
      confidence: 1.0,
      citations: ['Batch Records BR-001, BR-002, BR-003']
    }
  ];
};

const getImpactedLeaves = async (leafId) => {
  // Return other leaves affected by changes to this leaf's facts
  const impactMap = {
    'm23': ['m32-body-data', 'm2-quality-summary', 'ind-cover-letter'],
    'm32': ['m23-quality-summary', 'm2-overall-summary'],
    'm4': ['m24-nonclinical-summary', 'm2-overall-summary'],
    'm5': ['m25-clinical-summary', 'm2-overall-summary', 'protocol-synopsis']
  };
  
  for (const [prefix, impacts] of Object.entries(impactMap)) {
    if (leafId.startsWith(prefix)) {
      return impacts.map(id => ({
        leafId: id,
        impactType: 'content_dependency',
        description: `Changes to ${leafId} may affect content in ${id}`,
        severity: 'medium'
      }));
    }
  }
  
  return [];
};

const getValidatorHints = async (leafId) => {
  // Return eCTD v4.0 / US M1 validation hints
  const hints = [
    {
      id: 'hint_1',
      category: 'structure',
      hint: 'Ensure all required subsections are present per ICH M4 guidelines',
      reference: 'ICH M4Q Section 2.3',
      severity: 'important'
    },
    {
      id: 'hint_2',
      category: 'formatting',
      hint: 'Use consistent heading hierarchy (H1 for module, H2 for sections)',
      reference: 'FDA eCTD Technical Standards',
      severity: 'recommended'
    },
    {
      id: 'hint_3',
      category: 'content',
      hint: 'Include cross-references to supporting data in Module 3',
      reference: 'FDA Guidance for Industry',
      severity: 'recommended'
    },
    {
      id: 'hint_4',
      category: 'compliance',
      hint: 'Verify all stability data meets ICH Q1A(R2) requirements',
      reference: 'ICH Q1A(R2)',
      severity: 'critical'
    }
  ];
  
  return hints;
};

const applyPatch = async (leafId, patchId) => {
  // Apply a specific patch to the leaf
  // In production, this would update the database
  return {
    leafId,
    patchId,
    status: 'applied',
    timestamp: new Date().toISOString(),
    changes: {
      additions: 15,
      deletions: 3,
      modifications: 7
    }
  };
};

const generatePatchHash = () => {
  // Generate a hash for patch tracking
  return `hash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const acceptAllPatches = async (leafId, signature) => {
  // Accept all pending patches with e-signature
  return {
    leafId,
    patchesAccepted: 5,
    signature: {
      ...signature,
      hash: generatePatchHash(),
      timestamp: new Date().toISOString()
    },
    status: 'all_patches_accepted'
  };
};

const saveLeafContent = async (leafId, content, patch) => {
  // Save leaf content as a semantic patch
  // In production, this would persist to database
  return {
    leafId,
    saved: true,
    version: Date.now(),
    patch: patch || {
      id: `patch_${Date.now()}`,
      type: 'content_update',
      timestamp: new Date().toISOString()
    }
  };
};

// API Routes

// GET /api/leaves/:leafId - full leaf content
router.get('/:leafId', async (req, res) => {
  try {
    const { leafId } = req.params;
    
    const leafData = {
      id: leafId,
      ctd_path: extractCtdPath(leafId),
      content: await getHydratedContent(leafId),
      status: 'draft',
      blocks: [
        {
          id: 'block_1',
          type: 'section',
          content: 'Drug Substance Information',
          tracked: true,
          author: 'System',
          timestamp: new Date().toISOString()
        },
        {
          id: 'block_2',
          type: 'data',
          content: 'Analytical method validation results',
          tracked: true,
          author: 'CMC Team',
          timestamp: new Date().toISOString()
        }
      ],
      citations: [
        {
          id: 'cit_1',
          source: 'Analytical Report AR-2025-001',
          page: '15-18',
          relevance: 'high'
        }
      ],
      metadata: {
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        version: '1.0',
        template: 'FDA_IND_Template'
      }
    };
    
    res.json(leafData);
  } catch (error) {
    console.error('Error fetching leaf:', error);
    res.status(500).json({ error: 'Failed to fetch leaf data' });
  }
});

// GET /api/leaves/:leafId/facts - source facts
router.get('/:leafId/facts', async (req, res) => {
  try {
    const { leafId } = req.params;
    const facts = await getLeafFacts(leafId);
    res.json(facts);
  } catch (error) {
    console.error('Error fetching facts:', error);
    res.status(500).json({ error: 'Failed to fetch leaf facts' });
  }
});

// GET /api/leaves/:leafId/impacts - impacted leaves
router.get('/:leafId/impacts', async (req, res) => {
  try {
    const { leafId } = req.params;
    const impacts = await getImpactedLeaves(leafId);
    res.json(impacts);
  } catch (error) {
    console.error('Error fetching impacts:', error);
    res.status(500).json({ error: 'Failed to fetch impacted leaves' });
  }
});

// GET /api/leaves/:leafId/validator-hints - validation hints
router.get('/:leafId/validator-hints', async (req, res) => {
  try {
    const { leafId } = req.params;
    const hints = await getValidatorHints(leafId);
    res.json(hints);
  } catch (error) {
    console.error('Error fetching validator hints:', error);
    res.status(500).json({ error: 'Failed to fetch validator hints' });
  }
});

// POST /api/leaves/:leafId/patches/apply - apply one patch
router.post('/:leafId/patches/apply', async (req, res) => {
  try {
    const { leafId } = req.params;
    const { patchId } = req.body;
    
    if (!patchId) {
      return res.status(400).json({ error: 'patchId is required' });
    }
    
    const result = await applyPatch(leafId, patchId);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error applying patch:', error);
    res.status(500).json({ error: 'Failed to apply patch' });
  }
});

// POST /api/leaves/:leafId/patches/accept-all - bulk accept with e-sign
router.post('/:leafId/patches/accept-all', async (req, res) => {
  try {
    const { leafId } = req.params;
    
    // Record signature artifact
    const signature = {
      user_id: req.user?.id || 'demo_user',
      timestamp: new Date(),
      leaf_id: leafId,
      patch_hash: generatePatchHash(),
      ip_address: req.ip,
      user_agent: req.get('user-agent')
    };
    
    const result = await acceptAllPatches(leafId, signature);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error accepting patches:', error);
    res.status(500).json({ error: 'Failed to accept patches' });
  }
});

// POST /api/leaves/:leafId/save - save content
router.post('/:leafId/save', async (req, res) => {
  try {
    const { leafId } = req.params;
    const { content, patch } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }
    
    const result = await saveLeafContent(leafId, content, patch);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error saving leaf:', error);
    res.status(500).json({ error: 'Failed to save leaf content' });
  }
});

// SSE endpoint for real-time patches
router.get('/:leafId/patches/stream', async (req, res) => {
  const { leafId } = req.params;
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  // Store this connection
  if (!sseConnections.has(leafId)) {
    sseConnections.set(leafId, new Set());
  }
  sseConnections.get(leafId).add(res);
  
  // Send initial ping
  res.write(`data: ${JSON.stringify({ type: 'ping', leafId })}\n\n`);
  
  req.on('close', () => {
    // Remove connection on close
    const connections = sseConnections.get(leafId);
    if (connections) {
      connections.delete(res);
      if (connections.size === 0) {
        sseConnections.delete(leafId);
      }
    }
  });
});

// Function to broadcast patches to connected clients
export function broadcastPatch(leafId, patch) {
  const connections = sseConnections.get(leafId);
  if (connections) {
    const data = JSON.stringify({ type: 'patch', patch });
    connections.forEach(res => {
      res.write(`data: ${data}\n\n`);
    });
  }
}

export default router;