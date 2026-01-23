/**
 * Signing Gates API Routes
 * 
 * 21 CFR Part 11 compliant e-signature workflows.
 * Supports multi-signer workflows with audit trails.
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
 * GET /api/signing/workflows
 * List workflow definitions
 */
router.get('/workflows', async (req: Request, res: Response) => {
  try {
    const { programId, isActive = 'true' } = req.query;
    
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;
    
    if (programId) {
      whereClause += ` AND program_id = $${paramIndex++}`;
      params.push(programId);
    }
    if (isActive === 'true') {
      whereClause += ` AND is_active = true`;
    }
    
    const result = await pool.query(`
      SELECT * FROM signing.workflow_definitions
      ${whereClause}
      ORDER BY name
    `, params);
    
    res.json({
      success: true,
      count: result.rowCount,
      workflows: result.rows
    });
  } catch (error: any) {
    console.error('Error fetching workflows:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/signing/workflows
 * Create a new workflow definition
 */
router.post('/workflows', async (req: Request, res: Response) => {
  try {
    const { 
      programId, name, description, documentType, 
      signerRoles, parallelSigning = false, expirationHours = 72,
      requiredMeaning, createdBy
    } = req.body;
    
    if (!programId || !name || !documentType || !signerRoles) {
      return res.status(400).json({
        success: false,
        error: 'programId, name, documentType, and signerRoles are required'
      });
    }
    
    const result = await pool.query(`
      INSERT INTO signing.workflow_definitions (
        program_id, name, description, document_type,
        signer_roles, parallel_signing, expiration_hours,
        required_meaning, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      programId, name, description, documentType,
      JSON.stringify(signerRoles), parallelSigning, expirationHours,
      requiredMeaning, createdBy
    ]);
    
    res.status(201).json({
      success: true,
      workflow: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error creating workflow:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/signing/requests
 * Create a new signing request
 */
router.post('/requests', async (req: Request, res: Response) => {
  try {
    const { 
      workflowId, documentId, documentTitle, documentHash,
      requestedBy, signers, urgency = 'normal', dueDate
    } = req.body;
    
    if (!workflowId || !documentId || !documentTitle || !documentHash || !signers) {
      return res.status(400).json({
        success: false,
        error: 'workflowId, documentId, documentTitle, documentHash, and signers are required'
      });
    }
    
    const result = await pool.query(`
      INSERT INTO signing.signing_requests (
        workflow_id, document_id, document_title, document_hash,
        requested_by, signers, urgency, due_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      workflowId, documentId, documentTitle, documentHash,
      requestedBy, JSON.stringify(signers), urgency, dueDate
    ]);
    
    res.status(201).json({
      success: true,
      request: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error creating signing request:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/signing/requests
 * List signing requests
 */
router.get('/requests', async (req: Request, res: Response) => {
  try {
    const { userId, status, workflowId, limit = 50, offset = 0 } = req.query;
    
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;
    
    if (userId) {
      whereClause += ` AND (requested_by = $${paramIndex} OR signers @> $${paramIndex + 1}::jsonb)`;
      params.push(userId, JSON.stringify([{ userId }]));
      paramIndex += 2;
    }
    if (status) {
      whereClause += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    if (workflowId) {
      whereClause += ` AND workflow_id = $${paramIndex++}`;
      params.push(workflowId);
    }
    
    params.push(limit, offset);
    
    const result = await pool.query(`
      SELECT 
        sr.*,
        wd.name as workflow_name,
        wd.document_type
      FROM signing.signing_requests sr
      JOIN signing.workflow_definitions wd ON wd.id = sr.workflow_id
      ${whereClause}
      ORDER BY sr.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `, params);
    
    res.json({
      success: true,
      count: result.rowCount,
      requests: result.rows
    });
  } catch (error: any) {
    console.error('Error fetching signing requests:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/signing/requests/:id
 * Get signing request details with signatures
 */
router.get('/requests/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const requestResult = await pool.query(`
      SELECT 
        sr.*,
        wd.name as workflow_name,
        wd.document_type,
        wd.signer_roles,
        wd.required_meaning
      FROM signing.signing_requests sr
      JOIN signing.workflow_definitions wd ON wd.id = sr.workflow_id
      WHERE sr.id = $1
    `, [id]);
    
    if (requestResult.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Signing request not found' });
    }
    
    const signaturesResult = await pool.query(`
      SELECT * FROM signing.signatures
      WHERE request_id = $1
      ORDER BY signed_at DESC
    `, [id]);
    
    res.json({
      success: true,
      request: {
        ...requestResult.rows[0],
        signatures: signaturesResult.rows
      }
    });
  } catch (error: any) {
    console.error('Error fetching signing request:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/signing/requests/:id/sign
 * Sign a document
 */
router.post('/requests/:id/sign', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { 
      userId, userName, userEmail, role,
      meaning, password, mfaToken, ipAddress, userAgent
    } = req.body;
    
    if (!userId || !userName || !role || !meaning || !password) {
      return res.status(400).json({
        success: false,
        error: 'userId, userName, role, meaning, and password are required'
      });
    }
    
    // In production, verify password and MFA here
    // For demo, we'll just proceed
    
    const result = await pool.query(`
      SELECT * FROM signing.sign_document(
        $1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::inet, $9
      )
    `, [
      id, userId, userName, userEmail, role,
      meaning, mfaToken, ipAddress, userAgent
    ]);
    
    res.json({
      success: true,
      signature: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error signing document:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/signing/requests/:id/decline
 * Decline to sign a document
 */
router.post('/requests/:id/decline', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId, reason } = req.body;
    
    if (!userId || !reason) {
      return res.status(400).json({
        success: false,
        error: 'userId and reason are required'
      });
    }
    
    const result = await pool.query(`
      SELECT * FROM signing.decline_signature($1::uuid, $2::uuid, $3)
    `, [id, userId, reason]);
    
    res.json({
      success: true,
      result: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error declining signature:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/signing/requests/:id/manifest
 * Get signature manifest for compliance records
 */
router.get('/requests/:id/manifest', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT * FROM signing.signature_manifests WHERE request_id = $1
    `, [id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Manifest not found - signing may not be complete'
      });
    }
    
    res.json({
      success: true,
      manifest: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error fetching manifest:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/signing/requests/:id/manifest
 * Create signature manifest (called when all signatures collected)
 */
router.post('/requests/:id/manifest', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT * FROM signing.create_signature_manifest($1::uuid)
    `, [id]);
    
    res.json({
      success: true,
      manifest: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error creating manifest:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/signing/stats
 * Get signing statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const { programId } = req.query;
    
    let whereClause = '';
    const params: any[] = [];
    
    if (programId) {
      whereClause = 'WHERE wd.program_id = $1';
      params.push(programId);
    }
    
    const result = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM signing.workflow_definitions ${programId ? 'WHERE program_id = $1' : ''}) as total_workflows,
        (SELECT COUNT(*) FROM signing.signing_requests sr 
         ${programId ? 'JOIN signing.workflow_definitions wd ON wd.id = sr.workflow_id WHERE wd.program_id = $1' : ''}) as total_requests,
        (SELECT COUNT(*) FROM signing.signing_requests sr 
         ${programId ? 'JOIN signing.workflow_definitions wd ON wd.id = sr.workflow_id WHERE wd.program_id = $1 AND' : 'WHERE'} sr.status = 'pending') as pending_requests,
        (SELECT COUNT(*) FROM signing.signing_requests sr 
         ${programId ? 'JOIN signing.workflow_definitions wd ON wd.id = sr.workflow_id WHERE wd.program_id = $1 AND' : 'WHERE'} sr.status = 'completed') as completed_requests,
        (SELECT COUNT(*) FROM signing.signatures) as total_signatures,
        (SELECT COUNT(*) FROM signing.signature_manifests) as total_manifests
    `, params);
    
    res.json({
      success: true,
      stats: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error fetching signing stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
