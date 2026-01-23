/**
 * Label Impact Simulator API Routes
 * 
 * SPL document management, label change tracking, and impact scoring.
 */
import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

const router = Router();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/**
 * GET /api/labeling/documents
 * List SPL documents
 */
router.get('/documents', async (req: Request, res: Response) => {
  try {
    const { 
      programId, productId, status, documentType,
      limit = 50, offset = 0
    } = req.query;
    
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;
    
    if (programId) {
      whereClause += ` AND program_id = $${paramIndex++}`;
      params.push(programId);
    }
    if (productId) {
      whereClause += ` AND product_id = $${paramIndex++}`;
      params.push(productId);
    }
    if (status) {
      whereClause += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    if (documentType) {
      whereClause += ` AND document_type = $${paramIndex++}`;
      params.push(documentType);
    }
    
    params.push(limit, offset);
    
    const result = await pool.query(`
      SELECT *
      FROM labeling.spl_documents
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `, params);
    
    res.json({
      success: true,
      count: result.rowCount,
      documents: result.rows
    });
  } catch (error: any) {
    console.error('Error fetching SPL documents:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/labeling/documents
 * Create a new SPL document
 */
router.post('/documents', async (req: Request, res: Response) => {
  try {
    const { 
      programId, productId, documentType, setId,
      versionNumber, title, effectiveDate, splXml, createdBy
    } = req.body;
    
    if (!programId || !documentType || !title) {
      return res.status(400).json({
        success: false,
        error: 'programId, documentType, and title are required'
      });
    }
    
    const result = await pool.query(`
      INSERT INTO labeling.spl_documents (
        program_id, product_id, document_type, set_id,
        version_number, title, effective_date, spl_xml, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      programId, productId, documentType, setId,
      versionNumber || 1, title, effectiveDate, splXml, createdBy
    ]);
    
    res.status(201).json({
      success: true,
      document: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error creating SPL document:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/labeling/documents/:id
 * Get SPL document details with sections
 */
router.get('/documents/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { includeSections = 'true' } = req.query;
    
    const docResult = await pool.query(`
      SELECT * FROM labeling.spl_documents WHERE id = $1
    `, [id]);
    
    if (docResult.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }
    
    const document = docResult.rows[0];
    
    if (includeSections === 'true') {
      const sectionsResult = await pool.query(`
        SELECT * FROM labeling.spl_sections
        WHERE document_id = $1
        ORDER BY section_order
      `, [id]);
      document.sections = sectionsResult.rows;
    }
    
    res.json({ success: true, document });
  } catch (error: any) {
    console.error('Error fetching document:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/labeling/documents/:id/sections
 * Add sections to an SPL document
 */
router.post('/documents/:id/sections', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { sections } = req.body;
    
    if (!sections || !Array.isArray(sections)) {
      return res.status(400).json({ success: false, error: 'sections array is required' });
    }
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const insertedSections = [];
      for (const section of sections) {
        const result = await client.query(`
          INSERT INTO labeling.spl_sections (
            document_id, section_code, section_title, section_order,
            content_text, content_html, loinc_code
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `, [
          id, section.sectionCode, section.sectionTitle, section.sectionOrder,
          section.contentText, section.contentHtml, section.loincCode
        ]);
        insertedSections.push(result.rows[0]);
      }
      
      await client.query('COMMIT');
      
      res.status(201).json({
        success: true,
        sectionsCreated: insertedSections.length,
        sections: insertedSections
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Error adding sections:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/labeling/changes
 * Record a label change
 */
router.post('/changes', async (req: Request, res: Response) => {
  try {
    const { 
      documentId, sectionId, changeType, changeDescription,
      oldContent, newContent, changeReason, regulatoryTrigger,
      impactLevel, createdBy
    } = req.body;
    
    if (!documentId || !changeType || !changeDescription) {
      return res.status(400).json({
        success: false,
        error: 'documentId, changeType, and changeDescription are required'
      });
    }
    
    const result = await pool.query(`
      INSERT INTO labeling.label_changes (
        document_id, section_id, change_type, change_description,
        old_content, new_content, change_reason, regulatory_trigger,
        impact_level, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      documentId, sectionId, changeType, changeDescription,
      oldContent, newContent, changeReason, regulatoryTrigger,
      impactLevel || 'medium', createdBy
    ]);
    
    res.status(201).json({
      success: true,
      change: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error recording change:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/labeling/changes
 * List label changes
 */
router.get('/changes', async (req: Request, res: Response) => {
  try {
    const { documentId, status, impactLevel, limit = 50, offset = 0 } = req.query;
    
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;
    
    if (documentId) {
      whereClause += ` AND document_id = $${paramIndex++}`;
      params.push(documentId);
    }
    if (status) {
      whereClause += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    if (impactLevel) {
      whereClause += ` AND impact_level = $${paramIndex++}`;
      params.push(impactLevel);
    }
    
    params.push(limit, offset);
    
    const result = await pool.query(`
      SELECT 
        lc.*,
        sd.title as document_title,
        ss.section_title
      FROM labeling.label_changes lc
      JOIN labeling.spl_documents sd ON sd.id = lc.document_id
      LEFT JOIN labeling.spl_sections ss ON ss.id = lc.section_id
      ${whereClause}
      ORDER BY lc.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `, params);
    
    res.json({
      success: true,
      count: result.rowCount,
      changes: result.rows
    });
  } catch (error: any) {
    console.error('Error fetching changes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/labeling/simulations
 * Run an impact simulation
 */
router.post('/simulations', async (req: Request, res: Response) => {
  try {
    const { 
      documentId, simulationName, proposedChanges, createdBy
    } = req.body;
    
    if (!documentId || !simulationName || !proposedChanges) {
      return res.status(400).json({
        success: false,
        error: 'documentId, simulationName, and proposedChanges are required'
      });
    }
    
    // Calculate impact score using the database function
    const scoreResult = await pool.query(`
      SELECT labeling.calculate_impact_score($1::jsonb) as score
    `, [JSON.stringify(proposedChanges)]);
    
    const overallImpactScore = scoreResult.rows[0].score;
    
    const result = await pool.query(`
      INSERT INTO labeling.impact_simulations (
        document_id, simulation_name, proposed_changes,
        overall_impact_score, created_by
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [
      documentId, simulationName, JSON.stringify(proposedChanges),
      overallImpactScore, createdBy
    ]);
    
    res.status(201).json({
      success: true,
      simulation: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error running simulation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/labeling/simulations/:id
 * Get simulation details
 */
router.get('/simulations/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        s.*,
        d.title as document_title
      FROM labeling.impact_simulations s
      JOIN labeling.spl_documents d ON d.id = s.document_id
      WHERE s.id = $1
    `, [id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Simulation not found' });
    }
    
    res.json({
      success: true,
      simulation: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error fetching simulation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/labeling/documents/compare
 * Compare two document versions
 */
router.post('/documents/compare', async (req: Request, res: Response) => {
  try {
    const { documentId1, documentId2 } = req.body;
    
    if (!documentId1 || !documentId2) {
      return res.status(400).json({
        success: false,
        error: 'documentId1 and documentId2 are required'
      });
    }
    
    const result = await pool.query(`
      SELECT * FROM labeling.compare_documents($1::uuid, $2::uuid)
    `, [documentId1, documentId2]);
    
    res.json({
      success: true,
      comparison: result.rows
    });
  } catch (error: any) {
    console.error('Error comparing documents:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/labeling/stats
 * Get labeling statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const { programId } = req.query;
    
    let whereClause = '';
    const params: any[] = [];
    
    if (programId) {
      whereClause = 'WHERE program_id = $1';
      params.push(programId);
    }
    
    const result = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM labeling.spl_documents ${whereClause}) as total_documents,
        (SELECT COUNT(*) FROM labeling.spl_documents ${whereClause ? whereClause + ' AND' : 'WHERE'} status = 'current') as current_documents,
        (SELECT COUNT(*) FROM labeling.spl_sections) as total_sections,
        (SELECT COUNT(*) FROM labeling.label_changes WHERE status = 'pending') as pending_changes,
        (SELECT COUNT(*) FROM labeling.impact_simulations) as total_simulations,
        (SELECT AVG(overall_impact_score) FROM labeling.impact_simulations) as avg_impact_score
    `, params);
    
    res.json({
      success: true,
      stats: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
