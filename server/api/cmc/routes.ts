import express from 'express';
import { z } from 'zod';
import { db } from '../../db';
import { getPool } from '../../db';
import {
  writeThroughDrugSubstance,
  writeThroughDrugProduct,
  writeThroughAnalyticalMethod,
  writeThroughStabilityStudy,
  writeThroughProcessValidation,
  writeThroughChangeControl,
  writeThroughComparability,
} from '../../services/cmc-write-through';
import {
  analyticalMethods,
  processValidation,
  stabilityStudies,
  qcTesting,
  cmcChangeControl,
  drugSubstances,
  drugProducts,
  insertAnalyticalMethodSchema,
  insertProcessValidationSchema,
  insertStabilityStudySchema,
  insertQcTestingSchema,
  insertCmcChangeControlSchema,
  insertDrugSubstanceSchema,
  insertDrugProductSchema,
} from '../../../shared/schema';
import { eq, and } from 'drizzle-orm';

const router = express.Router();

// Helper to read organization ID from authenticated context
function getOrgId(req: express.Request): number {
  const orgId = parseInt(
    (req as any).tenantId ||
    (req as any).tenantContext?.organizationId ||
    ''
  );
  if (isNaN(orgId) || orgId <= 0) {
    throw new Error('Organization context required');
  }
  return orgId;
}

// Analytical Methods Routes
router.get('/analytical-methods', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const methods = await db
      .select({
        id: analyticalMethods.id,
        projectId: analyticalMethods.projectId,
        methodName: analyticalMethods.methodName,
        methodType: analyticalMethods.methodType,
        purpose: analyticalMethods.purpose,
        procedure: analyticalMethods.procedure,
        validationStatus: analyticalMethods.validationStatus,
        organizationId: analyticalMethods.organizationId,
        createdAt: analyticalMethods.createdAt,
        updatedAt: analyticalMethods.updatedAt,
      })
      .from(analyticalMethods)
      .where(eq(analyticalMethods.organizationId, orgId));
    res.json({ success: true, data: methods });
  } catch (error) {
    console.error('Error fetching analytical methods:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch analytical methods' });
  }
});

router.post('/analytical-methods', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const validatedData = insertAnalyticalMethodSchema.parse(req.body);
    const [method] = await db.insert(analyticalMethods).values({ ...validatedData, organizationId: orgId }).returning();
    // Write-through: upsert canonical source object for Module 3
    if (method.projectId) {
      writeThroughAnalyticalMethod(orgId, method.projectId, String(method.id), method).catch(() => {});
    }
    res.json({ success: true, data: method });
  } catch (error) {
    console.error('Error creating analytical method:', error);
    res.status(500).json({ success: false, error: 'Failed to create analytical method' });
  }
});

router.put('/analytical-methods/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const orgId = getOrgId(req);
    const validatedData = insertAnalyticalMethodSchema.partial().parse(req.body);
    const { organizationId: _discard, ...safeData } = validatedData;
    const [method] = await db
      .update(analyticalMethods)
      .set({ ...safeData, updatedAt: new Date() })
      .where(and(eq(analyticalMethods.id, id), eq(analyticalMethods.organizationId, orgId)))
      .returning();
    // Write-through: upsert canonical source object for Module 3
    if (method?.projectId) {
      writeThroughAnalyticalMethod(orgId, method.projectId, String(method.id), method).catch(() => {});
    }
    res.json({ success: true, data: method });
  } catch (error) {
    console.error('Error updating analytical method:', error);
    res.status(500).json({ success: false, error: 'Failed to update analytical method' });
  }
});

// Process Validation Routes
router.get('/process-validation', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const validation = await db
      .select()
      .from(processValidation)
      .where(eq(processValidation.organizationId, orgId));
    res.json({ success: true, data: validation });
  } catch (error) {
    console.error('Error fetching process validation:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch process validation' });
  }
});

router.post('/process-validation', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const validatedData = insertProcessValidationSchema.parse(req.body);
    const [validation] = await db.insert(processValidation).values({ ...validatedData, organizationId: orgId }).returning();
    // Write-through: upsert canonical source object for Module 3
    if (validation.projectId) {
      writeThroughProcessValidation(orgId, validation.projectId, String(validation.id), validation).catch(() => {});
    }
    res.json({ success: true, data: validation });
  } catch (error) {
    console.error('Error creating process validation:', error);
    res.status(500).json({ success: false, error: 'Failed to create process validation' });
  }
});

// Stability Studies Routes
router.get('/stability-studies', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const studies = await db
      .select({
        id: stabilityStudies.id,
        projectId: stabilityStudies.projectId,
        studyName: stabilityStudies.studyName,
        studyType: stabilityStudies.studyType,
        storageCondition: stabilityStudies.storageCondition,
        duration: stabilityStudies.duration,
        status: stabilityStudies.status,
        organizationId: stabilityStudies.organizationId,
        createdAt: stabilityStudies.createdAt,
        updatedAt: stabilityStudies.updatedAt,
      })
      .from(stabilityStudies)
      .where(eq(stabilityStudies.organizationId, orgId));
    res.json({ success: true, data: studies });
  } catch (error) {
    console.error('Error fetching stability studies:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stability studies' });
  }
});

router.post('/stability-studies', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const validatedData = insertStabilityStudySchema.parse(req.body);
    const [study] = await db.insert(stabilityStudies).values({ ...validatedData, organizationId: orgId }).returning();
    // Write-through: upsert canonical source object for Module 3
    if (study.projectId) {
      writeThroughStabilityStudy(orgId, study.projectId, String(study.id), study).catch(() => {});
    }
    res.json({ success: true, data: study });
  } catch (error) {
    console.error('Error creating stability study:', error);
    res.status(500).json({ success: false, error: 'Failed to create stability study' });
  }
});

// QC Testing Routes
router.get('/qc-testing', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const testing = await db.select().from(qcTesting).where(eq(qcTesting.organizationId, orgId));
    res.json({ success: true, data: testing });
  } catch (error) {
    console.error('Error fetching QC testing:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch QC testing' });
  }
});

router.post('/qc-testing', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const validatedData = insertQcTestingSchema.parse(req.body);
    const [test] = await db.insert(qcTesting).values({ ...validatedData, organizationId: orgId }).returning();
    res.json({ success: true, data: test });
  } catch (error) {
    console.error('Error creating QC test:', error);
    res.status(500).json({ success: false, error: 'Failed to create QC test' });
  }
});

// Change Control Routes
router.get('/change-control', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const changes = await db
      .select()
      .from(cmcChangeControl)
      .where(eq(cmcChangeControl.organizationId, orgId));
    res.json({ success: true, data: changes });
  } catch (error) {
    console.error('Error fetching change control:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch change control' });
  }
});

router.post('/change-control', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const validatedData = insertCmcChangeControlSchema.parse(req.body);
    const [change] = await db.insert(cmcChangeControl).values({ ...validatedData, organizationId: orgId }).returning();
    // Write-through: upsert canonical source object for Module 3
    if (change.projectId) {
      writeThroughChangeControl(orgId, change.projectId, String(change.id), change).catch(() => {});
    }
    res.json({ success: true, data: change });
  } catch (error) {
    console.error('Error creating change control:', error);
    res.status(500).json({ success: false, error: 'Failed to create change control' });
  }
});

// Drug Substances Routes
router.get('/drug-substances', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const substances = await db
      .select({
        id: drugSubstances.id,
        projectId: drugSubstances.projectId,
        substanceName: drugSubstances.substanceName,
        casNumber: drugSubstances.casNumber,
        molecularFormula: drugSubstances.molecularFormula,
        molecularWeight: drugSubstances.molecularWeight,
        manufacturingRoute: drugSubstances.manufacturingRoute,
        organizationId: drugSubstances.organizationId,
        createdAt: drugSubstances.createdAt,
        updatedAt: drugSubstances.updatedAt,
      })
      .from(drugSubstances)
      .where(eq(drugSubstances.organizationId, orgId));
    res.json({ success: true, data: substances });
  } catch (error) {
    console.error('Error fetching drug substances:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch drug substances' });
  }
});

router.post('/drug-substances', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const validatedData = insertDrugSubstanceSchema.parse(req.body);
    const [substance] = await db.insert(drugSubstances).values({ ...validatedData, organizationId: orgId }).returning();
    // Write-through: upsert canonical source object for Module 3
    if (substance.projectId) {
      writeThroughDrugSubstance(orgId, substance.projectId, String(substance.id), substance).catch(() => {});
    }
    res.json({ success: true, data: substance });
  } catch (error) {
    console.error('Error creating drug substance:', error);
    res.status(500).json({ success: false, error: 'Failed to create drug substance' });
  }
});

// Drug Products Routes
router.get('/drug-products', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const products = await db
      .select({
        id: drugProducts.id,
        projectId: drugProducts.projectId,
        productName: drugProducts.productName,
        dosageForm: drugProducts.dosageForm,
        strength: drugProducts.strength,
        routeOfAdministration: drugProducts.routeOfAdministration,
        manufacturingProcess: drugProducts.manufacturingProcess,
        organizationId: drugProducts.organizationId,
        createdAt: drugProducts.createdAt,
        updatedAt: drugProducts.updatedAt,
      })
      .from(drugProducts)
      .where(eq(drugProducts.organizationId, orgId));
    res.json({ success: true, data: products });
  } catch (error) {
    console.error('Error fetching drug products:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch drug products' });
  }
});

router.post('/drug-products', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const validatedData = insertDrugProductSchema.parse(req.body);
    const [product] = await db.insert(drugProducts).values({ ...validatedData, organizationId: orgId }).returning();
    // Write-through: upsert canonical source object for Module 3
    if (product.projectId) {
      writeThroughDrugProduct(orgId, product.projectId, String(product.id), product).catch(() => {});
    }
    res.json({ success: true, data: product });
  } catch (error) {
    console.error('Error creating drug product:', error);
    res.status(500).json({ success: false, error: 'Failed to create drug product' });
  }
});

// POST /api/cmc/insights/take-action - Take action on AI insights (DB-backed)
router.post('/insights/take-action', async (req, res) => {
  try {
    const actionSchema = z.object({
      insightId: z.string().min(1, 'Insight ID is required'),
      action: z.string().min(1, 'Action is required'),
      type: z.string().min(1, 'Type is required'),
    });

    const validationResult = actionSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid input data',
        details: validationResult.error.errors,
      });
    }

    const { insightId, action, type } = validationResult.data;
    const orgId = getOrgId(req);

    // Persist task to project_workflows table
    let taskResult: any;
    try {
      const pool = getPool();

      const priority = type === 'compliance' ? 'high' : 'medium';
      const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const result = await pool.query(
        `INSERT INTO project_workflows (organization_id, workflow_name, workflow_data, status, progress, assigned_to, start_date, end_date)
         VALUES ($1, $2, $3, 'active', 0, $4, NOW(), $5)
         RETURNING *`,
        [
          orgId,
          `Insight Action: ${action}`,
          JSON.stringify({ insightId, action, type, priority, source: 'cmc-insights' }),
          'CMC Team Lead',
          dueDate,
        ]
      );

      const row = result.rows[0];
      taskResult = {
        taskId: row.id,
        action,
        status: row.status,
        assignedTo: row.assigned_to,
        priority,
        dueDate: row.end_date,
        createdAt: row.created_at,
      };
    } catch (e) {
      console.error('[CMC] Could not persist to project_workflows:', e);
      return res.status(500).json({ success: false, error: 'Failed to persist workflow task' });
    }

    res.status(200).json({
      status: 'success',
      message: 'Action taken successfully',
      task: taskResult,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CMC] Error taking action on insight:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to take action on insight',
    });
  }
});

// POST /api/cmc/compliance/check-rules - Check compliance rules (DB-backed)
router.post('/compliance/check-rules', async (req, res) => {
  try {
    const rulesSchema = z.object({
      insightId: z.string().min(1, 'Insight ID is required'),
      type: z.string().min(1, 'Type is required'),
      section: z.string().optional(),
    });

    const validationResult = rulesSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid input data',
        details: validationResult.error.errors,
      });
    }

    const { insightId, type, section } = validationResult.data;

    console.log(
      `[CMC] Checking compliance rules for insight ${insightId} (type: ${type}, section: ${section})`
    );

    // Query complianceTracking table for real violations
    let rules: any[] = [];
    let complianceScore = 100;
    let recommendedActions: string[] = [];

    try {
      const pool = getPool();

      const orgId = getOrgId(req);
      const result = await pool.query(
        `SELECT * FROM compliance_tracking WHERE organization_id = $1 OR organization_id IS NULL ORDER BY created_at DESC LIMIT 50`,
        [orgId]
      );

      const trackingRows = result.rows;

      if (trackingRows.length > 0) {
        for (const row of trackingRows) {
          const ruleStatus = row.status === 'compliant' ? 'compliant' : 'violation';
          rules.push({
            rule: row.guideline,
            status: ruleStatus,
            severity: row.risk_level || 'medium',
            description: row.requirement,
            trackingId: row.id,
          });
          if (ruleStatus === 'violation') {
            complianceScore -= 8;
            if (row.mitigation) {
              recommendedActions.push(row.mitigation);
            }
          }
        }
      } else {
        // No compliance tracking records exist yet — return clean state
        rules = [];
        complianceScore = 100;
        recommendedActions = [];
      }
    } catch (e) {
      console.error('[CMC] Could not query compliance_tracking:', e);
      return res.status(500).json({ success: false, error: 'Failed to check compliance rules' });
    }

    complianceScore = Math.max(complianceScore, 0);
    const violations = rules.filter((r: any) => r.status === 'violation').length;

    const complianceCheck = {
      insightId,
      violations,
      rules,
      complianceScore,
      recommendedActions,
      checkedAt: new Date().toISOString(),
    };

    res.status(200).json({
      status: 'success',
      message: 'Compliance rules checked successfully',
      violations: complianceCheck.violations,
      complianceCheck,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CMC] Error checking compliance rules:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to check compliance rules',
    });
  }
});

// =====================================================
// Comparability Studies Routes (canonical DB-backed persistence)
// =====================================================

router.get('/comparability-studies', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, assessment_name as title, changed_element as product, change_type as type, status,
              created_at as "createdAt", updated_at as "updatedAt", affected_process_parameters as methods,
              justification as outcome, reviewed_by as owner
       FROM cmc_comparability_assessments
       WHERE organization_id = $1
       ORDER BY created_at DESC`,
      [orgId]
    );
    const studies = rows.map((r: any) => ({ ...r, methods: r.methods || [] }));
    res.json({ success: true, data: studies });
  } catch (error) {
    console.error('Error fetching comparability studies:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch comparability studies' });
  }
});

router.post('/comparability-studies', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO cmc_comparability_assessments (
         organization_id, project_id, assessment_name, change_type, changed_element,
         affected_process_parameters, justification, reviewed_by, status, tenant_id
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)
       RETURNING id, project_id, assessment_name as title, changed_element as product, change_type as type, status,
                 created_at as "createdAt", updated_at as "updatedAt", affected_process_parameters as methods,
                 justification as outcome, reviewed_by as owner`,
      [
        orgId,
        req.body.projectId,
        req.body.title || '',
        req.body.type || '',
        req.body.product || '',
        JSON.stringify(req.body.methods || []),
        req.body.outcome || null,
        req.body.owner || null,
        req.body.status || 'draft',
        String(orgId),
      ]
    );
    // Write-through: read projectId from DB return, not request body
    if (rows[0]?.project_id) {
      writeThroughComparability(orgId, rows[0].project_id, String(rows[0].id), rows[0]).catch(() => {});
    }
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error creating comparability study:', error);
    res.status(500).json({ success: false, error: 'Failed to create comparability study' });
  }
});

router.put('/comparability-studies/:id', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const pool = getPool();
    const { rows } = await pool.query(
      `UPDATE cmc_comparability_assessments
       SET assessment_name = COALESCE($1, assessment_name),
           changed_element = COALESCE($2, changed_element),
           change_type = COALESCE($3, change_type),
           affected_process_parameters = COALESCE($4::jsonb, affected_process_parameters),
           justification = COALESCE($5, justification),
           reviewed_by = COALESCE($6, reviewed_by),
           status = COALESCE($7, status),
           updated_at = NOW()
       WHERE id = $8 AND organization_id = $9
       RETURNING id, project_id, assessment_name as title, changed_element as product, change_type as type, status,
                 created_at as "createdAt", updated_at as "updatedAt", affected_process_parameters as methods,
                 justification as outcome, reviewed_by as owner`,
      [
        req.body.title,
        req.body.product,
        req.body.type,
        req.body.methods ? JSON.stringify(req.body.methods) : null,
        req.body.outcome,
        req.body.owner,
        req.body.status,
        req.params.id,
        orgId,
      ]
    );
    if (!rows[0]) {
      return res.status(404).json({ success: false, error: 'Study not found' });
    }
    // Write-through: read projectId from DB, not request body
    if (rows[0].project_id) {
      writeThroughComparability(orgId, rows[0].project_id, String(req.params.id), rows[0]).catch(() => {});
    }
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error updating comparability study:', error);
    res.status(500).json({ success: false, error: 'Failed to update comparability study' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ENHANCED BLUEPRINT GENERATION (CMCHub)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/cmc/generate-enhanced-blueprint
 * Generate ICH Q-series compliant Module 3.2.S/P section content
 */
router.post('/generate-enhanced-blueprint', async (req: express.Request, res: express.Response) => {
  try {
    const { projectId, section, drugSubstance, drugProduct, submissionType } = req.body;

    if (!section) {
      return res.status(400).json({ success: false, error: 'section is required' });
    }

    // Build prompt context from drug substance/product form data
    const dsInfo = drugSubstance
      ? `Drug Substance: ${drugSubstance.name || 'N/A'}, INN: ${drugSubstance.inn || 'N/A'}, Route: ${drugSubstance.route || 'N/A'}, Dosage Form: ${drugSubstance.dosageForm || 'N/A'}`
      : 'Drug substance information not provided.';
    const dpInfo = drugProduct
      ? `Drug Product: ${drugProduct.name || 'N/A'}, Strength: ${drugProduct.strength || 'N/A'}, Container: ${drugProduct.container || 'N/A'}`
      : 'Drug product information not provided.';

    const { ai: aiClient } = await import('../../lib/unified-ai-client.js');

    const result = await aiClient.chat(
      [
        {
          role: 'system',
          content: `You are a CMC regulatory writer generating Module 3 content for an ${submissionType || 'IND'} submission following ICH Q1-Q14 guidelines. Generate a compliant draft for section ${section} with regulatory-grade technical language. Include relevant specifications, acceptance criteria, and cross-references to ICH guidelines where applicable.`,
        },
        {
          role: 'user',
          content: `Generate section ${section} content.

${dsInfo}
${dpInfo}
Submission Type: ${submissionType || 'IND'}
Project ID: ${projectId || 'N/A'}

Write a comprehensive draft for this CMC section following ICH guidelines.`,
        },
      ],
      { taskType: 'regulatory_review', temperature: 0.3, maxTokens: 3000, callerModule: 'cmc-blueprint-generator' }
    );

    res.json({
      success: true,
      data: {
        section,
        content: result.content || '',
        wordCount: (result.content || '').split(/\s+/).length,
        submissionType: submissionType || 'IND',
      },
    });
  } catch (error) {
    console.error('CMC blueprint generation error:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Generation failed' });
  }
});

export default router;
