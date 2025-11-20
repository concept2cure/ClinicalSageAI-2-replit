import express from 'express';
import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';

const router = express.Router();

// Content atoms - reusable content blocks for eCTD documents
const contentAtoms = [
  {
    id: 'atom-1',
    type: 'narrative',
    title: 'Clinical Study Overview',
    content: 'This section provides a comprehensive overview of the clinical development program...',
    module: '2',
    section: '2.5',
    tags: ['clinical', 'overview', 'summary'],
    status: 'approved',
    validationStatus: 'approved',
    version: 1,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z'
  },
  {
    id: 'atom-2',
    type: 'table',
    title: 'Demographic Summary Table',
    content: 'Demographics of study population',
    data: {
      rows: [
        ['Parameter', 'Treatment Group', 'Placebo Group', 'Total'],
        ['N', '150', '148', '298'],
        ['Age (mean)', '54.3', '53.8', '54.1'],
        ['Male (%)', '45%', '48%', '46.5%'],
        ['Female (%)', '55%', '52%', '53.5%']
      ]
    },
    module: '5',
    section: '5.3',
    tags: ['demographics', 'table', 'clinical'],
    status: 'approved',
    validationStatus: 'approved',
    version: 1,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z'
  },
  {
    id: 'atom-3',
    type: 'figure',
    title: 'Efficacy Results Graph',
    content: 'Primary endpoint efficacy results',
    imageUrl: '/assets/efficacy-graph.png',
    module: '2',
    section: '2.7',
    tags: ['efficacy', 'graph', 'results'],
    status: 'draft',
    validationStatus: 'pending',
    version: 1,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z'
  }
];

/**
 * GET /api/atoms - Get all content atoms
 */
router.get('/', async (req, res) => {
  try {
    const { module, type, status, tags } = req.query;
    
    let filteredAtoms = [...contentAtoms];
    
    // Apply filters
    if (module) {
      filteredAtoms = filteredAtoms.filter(atom => atom.module === module);
    }
    
    if (type) {
      filteredAtoms = filteredAtoms.filter(atom => atom.type === type);
    }
    
    if (status) {
      filteredAtoms = filteredAtoms.filter(atom => atom.status === status);
    }
    
    if (tags) {
      const tagList = tags.split(',');
      filteredAtoms = filteredAtoms.filter(atom => 
        tagList.some(tag => atom.tags.includes(tag))
      );
    }
    
    res.json({
      success: true,
      atoms: filteredAtoms,
      total: filteredAtoms.length
    });
  } catch (error) {
    console.error('Error fetching atoms:', error);
    res.status(500).json({ 
      error: 'Failed to fetch content atoms',
      details: error.message 
    });
  }
});

/**
 * GET /api/atoms/:id - Get a specific content atom
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const atom = contentAtoms.find(a => a.id === id);
    
    if (!atom) {
      return res.status(404).json({ 
        error: 'Content atom not found' 
      });
    }
    
    res.json({
      success: true,
      atom
    });
  } catch (error) {
    console.error('Error fetching atom:', error);
    res.status(500).json({ 
      error: 'Failed to fetch content atom',
      details: error.message 
    });
  }
});

/**
 * POST /api/atoms - Create a new content atom
 */
router.post('/', async (req, res) => {
  try {
    const { type, title, content, module, section, tags, data, imageUrl } = req.body;
    
    if (!type || !title || !content || !module) {
      return res.status(400).json({ 
        error: 'Missing required fields: type, title, content, module' 
      });
    }
    
    const newAtom = {
      id: `atom-${Date.now()}`,
      type,
      title,
      content,
      module,
      section: section || `${module}.1`,
      tags: tags || [],
      data: data || null,
      imageUrl: imageUrl || null,
      status: 'draft',
      validationStatus: 'pending',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    contentAtoms.push(newAtom);
    
    res.status(201).json({
      success: true,
      message: 'Content atom created successfully',
      atom: newAtom
    });
  } catch (error) {
    console.error('Error creating atom:', error);
    res.status(500).json({ 
      error: 'Failed to create content atom',
      details: error.message 
    });
  }
});

/**
 * PUT /api/atoms/:id - Update a content atom
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const atomIndex = contentAtoms.findIndex(a => a.id === id);
    
    if (atomIndex === -1) {
      return res.status(404).json({ 
        error: 'Content atom not found' 
      });
    }
    
    const updatedAtom = {
      ...contentAtoms[atomIndex],
      ...req.body,
      id, // Preserve ID
      updatedAt: new Date().toISOString(),
      version: contentAtoms[atomIndex].version + 1
    };
    
    contentAtoms[atomIndex] = updatedAtom;
    
    res.json({
      success: true,
      message: 'Content atom updated successfully',
      atom: updatedAtom
    });
  } catch (error) {
    console.error('Error updating atom:', error);
    res.status(500).json({ 
      error: 'Failed to update content atom',
      details: error.message 
    });
  }
});

/**
 * DELETE /api/atoms/:id - Delete a content atom
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const atomIndex = contentAtoms.findIndex(a => a.id === id);
    
    if (atomIndex === -1) {
      return res.status(404).json({ 
        error: 'Content atom not found' 
      });
    }
    
    contentAtoms.splice(atomIndex, 1);
    
    res.json({
      success: true,
      message: 'Content atom deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting atom:', error);
    res.status(500).json({ 
      error: 'Failed to delete content atom',
      details: error.message 
    });
  }
});

export default router;