import express from 'express';
import { z } from 'zod';
import { db } from '../../db';
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

// Analytical Methods Routes
router.get('/analytical-methods', async (req, res) => {
  try {
    const orgId = parseInt(req.query.organizationId as string);
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
    const validatedData = insertAnalyticalMethodSchema.parse(req.body);
    const [method] = await db.insert(analyticalMethods).values(validatedData).returning();
    res.json({ success: true, data: method });
  } catch (error) {
    console.error('Error creating analytical method:', error);
    res.status(500).json({ success: false, error: 'Failed to create analytical method' });
  }
});

router.put('/analytical-methods/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const validatedData = insertAnalyticalMethodSchema.partial().parse(req.body);
    const [method] = await db
      .update(analyticalMethods)
      .set({ ...validatedData, updatedAt: new Date() })
      .where(eq(analyticalMethods.id, id))
      .returning();
    res.json({ success: true, data: method });
  } catch (error) {
    console.error('Error updating analytical method:', error);
    res.status(500).json({ success: false, error: 'Failed to update analytical method' });
  }
});

// Process Validation Routes
router.get('/process-validation', async (req, res) => {
  try {
    const orgId = parseInt(req.query.organizationId as string);
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
    const validatedData = insertProcessValidationSchema.parse(req.body);
    const [validation] = await db.insert(processValidation).values(validatedData).returning();
    res.json({ success: true, data: validation });
  } catch (error) {
    console.error('Error creating process validation:', error);
    res.status(500).json({ success: false, error: 'Failed to create process validation' });
  }
});

// Stability Studies Routes
router.get('/stability-studies', async (req, res) => {
  try {
    const orgId = parseInt(req.query.organizationId as string);
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
    const validatedData = insertStabilityStudySchema.parse(req.body);
    const [study] = await db.insert(stabilityStudies).values(validatedData).returning();
    res.json({ success: true, data: study });
  } catch (error) {
    console.error('Error creating stability study:', error);
    res.status(500).json({ success: false, error: 'Failed to create stability study' });
  }
});

// QC Testing Routes
router.get('/qc-testing', async (req, res) => {
  try {
    const orgId = parseInt(req.query.organizationId as string);
    const testing = await db.select().from(qcTesting).where(eq(qcTesting.organizationId, orgId));
    res.json({ success: true, data: testing });
  } catch (error) {
    console.error('Error fetching QC testing:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch QC testing' });
  }
});

router.post('/qc-testing', async (req, res) => {
  try {
    const validatedData = insertQcTestingSchema.parse(req.body);
    const [test] = await db.insert(qcTesting).values(validatedData).returning();
    res.json({ success: true, data: test });
  } catch (error) {
    console.error('Error creating QC test:', error);
    res.status(500).json({ success: false, error: 'Failed to create QC test' });
  }
});

// Change Control Routes
router.get('/change-control', async (req, res) => {
  try {
    const orgId = parseInt(req.query.organizationId as string);
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
    const validatedData = insertCmcChangeControlSchema.parse(req.body);
    const [change] = await db.insert(cmcChangeControl).values(validatedData).returning();
    res.json({ success: true, data: change });
  } catch (error) {
    console.error('Error creating change control:', error);
    res.status(500).json({ success: false, error: 'Failed to create change control' });
  }
});

// Drug Substances Routes
router.get('/drug-substances', async (req, res) => {
  try {
    const orgId = parseInt(req.query.organizationId as string);
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
    const validatedData = insertDrugSubstanceSchema.parse(req.body);
    const [substance] = await db.insert(drugSubstances).values(validatedData).returning();
    res.json({ success: true, data: substance });
  } catch (error) {
    console.error('Error creating drug substance:', error);
    res.status(500).json({ success: false, error: 'Failed to create drug substance' });
  }
});

// Drug Products Routes
router.get('/drug-products', async (req, res) => {
  try {
    const orgId = parseInt(req.query.organizationId as string);
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
    const validatedData = insertDrugProductSchema.parse(req.body);
    const [product] = await db.insert(drugProducts).values(validatedData).returning();
    res.json({ success: true, data: product });
  } catch (error) {
    console.error('Error creating drug product:', error);
    res.status(500).json({ success: false, error: 'Failed to create drug product' });
  }
});

// POST /api/cmc/insights/take-action - Take action on AI insights
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

    console.log(`[CMC] Taking action on insight ${insightId}: ${action}`);

    // Simulate task creation and assignment
    const taskResult = {
      taskId: `task_${Date.now()}`,
      action: action,
      status: 'created',
      assignedTo: 'CMC Team Lead',
      priority: type === 'compliance' ? 'high' : 'medium',
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
      createdAt: new Date().toISOString(),
    };

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

// POST /api/cmc/compliance/check-rules - Check compliance rules
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

    // Simulate compliance rule checking
    const complianceCheck = {
      insightId: insightId,
      violations: Math.floor(Math.random() * 5) + 1, // 1-5 violations
      rules: [
        {
          rule: 'ICH Q8 Quality by Design',
          status: 'violation',
          severity: 'medium',
          description: 'Missing design space justification in process development section',
        },
        {
          rule: 'ICH Q9 Quality Risk Management',
          status: 'compliant',
          severity: 'low',
          description: 'Risk assessment documentation is adequate',
        },
        {
          rule: 'FDA 21 CFR 211.84',
          status: 'violation',
          severity: 'high',
          description: 'Incomplete validation documentation for cleaning procedures',
        },
      ],
      complianceScore: 75,
      recommendedActions: [
        'Complete design space documentation with DOE studies',
        'Update cleaning validation protocols',
        'Review risk assessment for manufacturing process',
      ],
      checkedAt: new Date().toISOString(),
    };

    res.status(200).json({
      status: 'success',
      message: 'Compliance rules checked successfully',
      violations: complianceCheck.violations,
      complianceCheck: complianceCheck,
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

export default router;
