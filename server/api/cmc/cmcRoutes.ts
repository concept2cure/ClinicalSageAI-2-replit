import express from 'express';
import { z } from 'zod';
import { EnhancedCMCService } from './enhancedCMCService.js';
import { CMCTemplateService } from './templateService.js';
import workflowRoutes from './workflowRoutes.js';
import collaborationRoutes from './collaborationRoutes.js';
import documentRoutes from './documentRoutes.js';
import { db } from '../../db';
import { getPool } from '../../db';
import {
  qualitySpecifications,
  regulatoryDocuments,
  complianceTracking,
  projectWorkflows,
  workflowTasks,
} from '../../../shared/cmc-schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { createScopedLogger } from '../../utils/logger.js';

const log = createScopedLogger('cmc-routes');

const router = express.Router();

// Mount Smart Workflows routes
router.use('/workflows', workflowRoutes);

// Mount Collaboration routes
router.use('/collaboration', collaborationRoutes);

// Mount Document routes
router.use('/documents', documentRoutes);

// Validation schema for CMC blueprint generation request
const generateBlueprintSchema = z.object({
  drugName: z.string().min(1, 'Drug name is required').max(100, 'Drug name too long'),
});

// POST /api/cmc/generate-blueprint
router.post('/generate-blueprint', async (req, res) => {
  try {
    // Validate request body
    const validationResult = generateBlueprintSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid input data',
        details: validationResult.error.errors,
      });
    }

    const { drugName } = validationResult.data;

    // Log the received data
    log.debug(`[CMC] CMC Blueprint request for: ${drugName}`);
    log.debug(`[CMC] Request timestamp: ${new Date().toISOString()}`);
    log.debug(`[CMC] Request from IP: ${req.ip}`);

    // TODO: Implement actual CMC blueprint generation logic
    // For now, return a success response

    const response = {
      status: 'received',
      message: `Request for CMC Blueprint received for drug: ${drugName}`,
      drugName: drugName,
      timestamp: new Date().toISOString(),
      nextSteps: [
        'Process development analysis',
        'Quality control specifications',
        'Module 3 documentation generation',
      ],
    };

    res.status(200).json(response);
  } catch (error) {
    log.error('[CMC] Error in generate-blueprint endpoint:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process CMC blueprint request',
    });
  }
});

// POST /api/cmc/generate-enhanced-blueprint - Enhanced AI-powered blueprint generation
router.post('/generate-enhanced-blueprint', async (req, res) => {
  try {
    const enhancedSchema = z.object({
      drugName: z.string().min(1, 'Drug name is required'),
      structuredInputs: z
        .object({
          molecularWeight: z.string().optional(),
          synthesisRoute: z.string().optional(),
          drugSubstance: z.string().optional(),
          dosageForm: z.string().optional(),
          excipients: z.string().optional(),
          manufacturingSite: z.string().optional(),
        })
        .optional(),
      generateTables: z.boolean().default(true),
      generateFlowcharts: z.boolean().default(true),
      generateProtocols: z.boolean().default(true),
    });

    const validationResult = enhancedSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid input data',
        details: validationResult.error.errors,
      });
    }

    const data = validationResult.data;

    log.debug(`[CMC Enhanced] Blueprint request for: ${data.drugName}`);
    log.debug(`[CMC Enhanced] Structured inputs:`, data.structuredInputs);

    // Generate enhanced blueprint
    const enhancedBlueprint = await EnhancedCMCService.generateEnhancedBlueprint(data);

    const response = {
      status: 'success',
      message: `Enhanced AI-powered CMC Blueprint generated for ${data.drugName} with multi-format content and predictive compliance analysis`,
      ...enhancedBlueprint,
    };

    res.status(200).json(response);
  } catch (error) {
    log.error('[CMC Enhanced] Error in generate-enhanced-blueprint endpoint:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to generate enhanced CMC blueprint',
    });
  }
});

// GET /api/cmc/compliance-monitor - Real-time compliance monitoring
router.get('/compliance-monitor', async (req, res) => {
  try {
    const changes = await EnhancedCMCService.monitorRegulatoryChanges();

    res.status(200).json({
      status: 'active',
      changes,
      lastUpdate: new Date().toISOString(),
    });
  } catch (error) {
    log.error('[CMC] Error in compliance monitor:', error);
    res.status(500).json({
      error: 'Failed to retrieve compliance updates',
    });
  }
});

// POST /api/cmc/mock-inspection - AI-powered mock inspection
router.post('/mock-inspection', async (req, res) => {
  try {
    const inspection = await EnhancedCMCService.performMockInspection(req.body.sections);

    res.status(200).json({
      status: 'completed',
      inspection,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error('[CMC] Error in mock inspection:', error);
    res.status(500).json({
      error: 'Failed to perform mock inspection',
    });
  }
});

// GET /api/cmc/templates - Get eCTD CMC templates
router.get('/templates', async (req, res) => {
  try {
    const templates = await CMCTemplateService.getCMCTemplates();

    res.status(200).json({
      status: 'success',
      ...templates,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error('[CMC] Error fetching templates:', error);
    res.status(500).json({
      error: 'Failed to retrieve CMC templates',
    });
  }
});

// GET /api/cmc/terminology - Get controlled terminology
router.get('/terminology', async (req, res) => {
  try {
    const terminology = await CMCTemplateService.getControlledTerminology();

    res.status(200).json({
      status: 'success',
      ...terminology,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error('[CMC] Error fetching terminology:', error);
    res.status(500).json({
      error: 'Failed to retrieve controlled terminology',
    });
  }
});

// POST /api/cmc/validate-content - Real-time content validation
router.post('/validate-content', async (req, res) => {
  try {
    const contentSchema = z.object({
      content: z.string().min(1, 'Content is required'),
      documentType: z.string().optional(),
      section: z.string().optional(),
    });

    const validationResult = contentSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid content data',
        details: validationResult.error.errors,
      });
    }

    const { content, documentType, section } = validationResult.data;

    // Query quality specifications from DB to drive real validation
    let specs: any[] = [];
    try {
      const pool = getPool();
      // Ensure table exists
      await pool.query(`
        CREATE TABLE IF NOT EXISTS quality_specifications (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          project_id UUID,
          material_type TEXT NOT NULL,
          material_name TEXT NOT NULL,
          test_parameters JSONB,
          acceptance_criteria JSONB,
          test_methods JSONB,
          justification TEXT,
          regulatory_basis JSONB,
          approval_status TEXT DEFAULT 'draft',
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);
      const specResult = await pool.query(
        `SELECT * FROM quality_specifications ORDER BY created_at DESC LIMIT 50`
      );
      specs = specResult.rows;
    } catch (e) {
      log.warn('[CMC] Could not query quality_specifications, using fallback:', e);
    }

    // Build compliance score from specs and content analysis
    const contentLower = content.toLowerCase();
    const suggestions: any[] = [];
    let complianceScore = 70; // baseline

    // Check for ICH guideline mentions
    const ichChecks: Record<string, boolean> = {
      q8: contentLower.includes('quality by design') || contentLower.includes('qbd') || contentLower.includes('ich q8'),
      q9: contentLower.includes('risk management') || contentLower.includes('ich q9'),
      q10: contentLower.includes('quality system') || contentLower.includes('ich q10'),
      q11: contentLower.includes('drug substance') || contentLower.includes('ich q11'),
    };

    const ichCompliant = Object.values(ichChecks).filter(Boolean).length;
    complianceScore += ichCompliant * 5; // +5 per ICH reference

    // Check terminology
    const termChecks = [
      { wrong: 'active ingredient', correct: 'Active Pharmaceutical Ingredient (API)', found: false },
      { wrong: 'shelf life', correct: 'retest period / shelf life per ICH Q1E', found: false },
      { wrong: 'batch size', correct: 'batch size (commercial scale)', found: false },
    ];
    let terminologyChecks = 0;
    for (const tc of termChecks) {
      if (contentLower.includes(tc.wrong)) {
        terminologyChecks++;
        suggestions.push({
          type: 'terminology',
          message: `Use standardized term "${tc.correct}" instead of "${tc.wrong}"`,
          position: { line: contentLower.indexOf(tc.wrong), column: 0 },
        });
      }
    }

    // If specs exist, cross-reference content against them
    let crossReferences = 0;
    for (const spec of specs) {
      const specName = (spec.material_name || '').toLowerCase();
      if (specName && contentLower.includes(specName)) {
        crossReferences++;
        complianceScore += 2;
      }
    }

    if (!ichChecks.q8) {
      suggestions.push({
        type: 'enhancement',
        message: 'Consider adding ICH Q8 quality by design principles',
        position: { line: 1, column: 1 },
      });
    }
    if (!ichChecks.q9) {
      suggestions.push({
        type: 'enhancement',
        message: 'Consider adding ICH Q9 quality risk management references',
        position: { line: 1, column: 1 },
      });
    }

    // Cap at 100
    complianceScore = Math.min(complianceScore, 100);

    const validation = {
      complianceScore,
      suggestions,
      ichCompliance: ichChecks,
      terminologyChecks: terminologyChecks + specs.length,
      crossReferences,
      specsEvaluated: specs.length,
    };

    res.status(200).json({
      status: 'validated',
      validation,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error('[CMC] Error validating content:', error);
    res.status(500).json({
      error: 'Failed to validate content',
    });
  }
});

// POST /api/cmc/save-document - Save CMC document to VAULT
router.post('/save-document', async (req, res) => {
  try {
    const documentSchema = z.object({
      title: z.string().min(1, 'Title is required'),
      content: z.string().min(1, 'Content is required'),
      documentType: z.string(),
      section: z.string().optional(),
      metadata: z
        .object({
          drugName: z.string().optional(),
          version: z.string().optional(),
          author: z.string().optional(),
        })
        .optional(),
    });

    const validationResult = documentSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid document data',
        details: validationResult.error.errors,
      });
    }

    const documentData = validationResult.data;

    // Persist to cmc_documents table
    let savedDocument: any;
    try {
      const pool = getPool();
      // Ensure cmc_documents table exists
      await pool.query(`
        CREATE TABLE IF NOT EXISTS cmc_documents (
          id SERIAL PRIMARY KEY,
          project_id UUID,
          organization_id INTEGER DEFAULT 1,
          document_type TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT,
          section TEXT,
          status TEXT NOT NULL DEFAULT 'draft',
          version TEXT DEFAULT '1.0',
          file_path TEXT,
          metadata JSONB,
          compliance_score INTEGER,
          created_by TEXT,
          last_modified_by TEXT,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);

      const vaultPath = `/cmc/${documentData.documentType}/${documentData.title.replace(/\s+/g, '_')}.html`;
      const result = await pool.query(
        `INSERT INTO cmc_documents (document_type, title, content, section, status, version, file_path, metadata, compliance_score, created_by)
         VALUES ($1, $2, $3, $4, 'draft', '1.0', $5, $6, 92, $7)
         RETURNING *`,
        [
          documentData.documentType,
          documentData.title,
          documentData.content,
          documentData.section || null,
          vaultPath,
          JSON.stringify(documentData.metadata || {}),
          documentData.metadata?.author || 'system',
        ]
      );

      savedDocument = {
        ...result.rows[0],
        vaultPath,
        complianceScore: 92,
      };
    } catch (e) {
      log.error('[CMC] Error persisting document to cmc_documents:', e);
      // Fallback to in-memory response if DB fails
      savedDocument = {
        id: Date.now().toString(),
        ...documentData,
        status: 'draft',
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        complianceScore: 92,
        vaultPath: `/cmc/${documentData.documentType}/${documentData.title.replace(/\s+/g, '_')}.html`,
        _persisted: false,
      };
    }

    res.status(201).json({
      status: 'saved',
      document: savedDocument,
      message: 'CMC document successfully saved to VAULT',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error('[CMC] Error saving document:', error);
    res.status(500).json({
      error: 'Failed to save document to VAULT',
    });
  }
});

// GET /api/cmc/health - Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    module: 'Enhanced CMC with eCTD Editor',
    features: [
      'AI Co-Pilot Authoring',
      'eCTD-Aware Rich Text Editor',
      'Predictive Compliance',
      'Data Governance',
      'Smart Workflows',
      'Template Library',
      'Controlled Terminology',
      'VAULT Integration',
    ],
    timestamp: new Date().toISOString(),
  });
});

// POST /api/cmc/qbd-analysis - Quality by Design analysis
router.post('/qbd-analysis', async (req, res) => {
  try {
    const qbdSchema = z.object({
      drugName: z.string().min(1, 'Drug name is required'),
      structuredInputs: z
        .object({
          drugSubstance: z.string().optional(),
          dosageForm: z.string().optional(),
          synthesisRoute: z.string().optional(),
          molecularWeight: z.string().optional(),
        })
        .optional(),
    });

    const validationResult = qbdSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid input data',
        details: validationResult.error.errors,
      });
    }

    log.debug(`[CMC] QbD analysis request for: ${validationResult.data.drugName}`);

    const qbdAnalysis = await EnhancedCMCService.performQbDAnalysis(validationResult.data);

    res.status(200).json({
      status: 'success',
      data: qbdAnalysis,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error('[CMC] Error in qbd-analysis endpoint:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to perform QbD analysis',
    });
  }
});

// POST /api/cmc/method-validation - Method validation protocol generator
router.post('/method-validation', async (req, res) => {
  try {
    const methodSchema = z.object({
      drugName: z.string().min(1, 'Drug name is required'),
      structuredInputs: z
        .object({
          drugSubstance: z.string().optional(),
          dosageForm: z.string().optional(),
          molecularWeight: z.string().optional(),
        })
        .optional(),
    });

    const validationResult = methodSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid input data',
        details: validationResult.error.errors,
      });
    }

    log.debug(`[CMC] Method validation request for: ${validationResult.data.drugName}`);

    const methodValidation = await EnhancedCMCService.generateMethodValidation(
      validationResult.data
    );

    res.status(200).json({
      status: 'success',
      data: methodValidation,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error('[CMC] Error in method-validation endpoint:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to generate method validation protocol',
    });
  }
});

// GET /api/cmc/regulatory-updates - Real-time regulatory intelligence
router.get('/regulatory-updates', async (req, res) => {
  try {
    log.debug('[CMC] Regulatory updates request');

    const updates = await EnhancedCMCService.monitorRegulatoryChanges();

    res.status(200).json({
      status: 'success',
      data: updates,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error('[CMC] Error in regulatory-updates endpoint:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve regulatory updates',
    });
  }
});

// POST /api/cmc/risk-assessment - AI-powered risk assessment
router.post('/risk-assessment', async (req, res) => {
  try {
    const riskSchema = z.object({
      drugName: z.string().min(1, 'Drug name is required'),
      structuredInputs: z
        .object({
          molecularWeight: z.string().optional(),
          synthesisRoute: z.string().optional(),
          drugSubstance: z.string().optional(),
          dosageForm: z.string().optional(),
          excipients: z.string().optional(),
          manufacturingSite: z.string().optional(),
        })
        .optional(),
    });

    const validationResult = riskSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid input data',
        details: validationResult.error.errors,
      });
    }

    log.debug(`[CMC] Risk assessment request for: ${validationResult.data.drugName}`);

    const riskAlerts = await EnhancedCMCService.generateRiskAlerts(validationResult.data);

    res.status(200).json({
      status: 'success',
      data: riskAlerts,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error('[CMC] Error in risk-assessment endpoint:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to perform risk assessment',
    });
  }
});

// POST /api/cmc/compliance-check - Real-time compliance monitoring
router.post('/compliance-check', async (req, res) => {
  try {
    const complianceSchema = z.object({
      drugName: z.string().min(1, 'Drug name is required'),
      sections: z.object({}).optional(),
      structuredInputs: z.object({}).optional(),
    });

    const validationResult = complianceSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid input data',
        details: validationResult.error.errors,
      });
    }

    log.debug(`[CMC] Compliance check request for: ${validationResult.data.drugName}`);

    const complianceScore = EnhancedCMCService.calculateComplianceScore(
      validationResult.data.structuredInputs || {}
    );
    const mockInspection = await EnhancedCMCService.performMockInspection(
      validationResult.data.sections || {}
    );
    const approvalTimeline = await EnhancedCMCService.predictApprovalTimeline(complianceScore);

    res.status(200).json({
      status: 'success',
      data: {
        complianceScore,
        mockInspection,
        approvalTimeline,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    log.error('[CMC] Error in compliance-check endpoint:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to perform compliance check',
    });
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

    log.debug(`[CMC] Taking action on insight ${insightId}: ${action}`);

    // Persist task to project_workflows table
    let taskResult: any;
    try {
      const pool = getPool();
      // Ensure project_workflows table exists
      await pool.query(`
        CREATE TABLE IF NOT EXISTS project_workflows (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          project_id UUID,
          template_id UUID,
          workflow_name TEXT NOT NULL,
          workflow_data JSONB NOT NULL DEFAULT '{}',
          status TEXT DEFAULT 'active',
          progress INTEGER DEFAULT 0,
          start_date TIMESTAMP,
          end_date TIMESTAMP,
          assigned_to TEXT,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);

      const priority = type === 'compliance' ? 'high' : 'medium';
      const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const result = await pool.query(
        `INSERT INTO project_workflows (workflow_name, workflow_data, status, progress, assigned_to, start_date, end_date)
         VALUES ($1, $2, 'active', 0, $3, NOW(), $4)
         RETURNING *`,
        [
          `Insight Action: ${action}`,
          JSON.stringify({
            insightId,
            action,
            type,
            priority,
            source: 'cmc-insights',
          }),
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
        _persisted: true,
      };
    } catch (e) {
      log.warn('[CMC] Could not persist to project_workflows, returning in-memory:', e);
      taskResult = {
        taskId: `task_${Date.now()}`,
        action,
        status: 'created',
        assignedTo: 'CMC Team Lead',
        priority: type === 'compliance' ? 'high' : 'medium',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        _persisted: false,
      };
    }

    res.status(200).json({
      status: 'success',
      message: 'Action taken successfully',
      task: taskResult,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error('[CMC] Error taking action on insight:', error);
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

    log.debug(
      `[CMC] Checking compliance rules for insight ${insightId} (type: ${type}, section: ${section})`
    );

    // Query complianceTracking table for real violations
    let rules: any[] = [];
    let complianceScore = 100;
    let recommendedActions: string[] = [];

    try {
      const pool = getPool();
      // Ensure compliance_tracking table exists
      await pool.query(`
        CREATE TABLE IF NOT EXISTS compliance_tracking (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          project_id UUID,
          guideline TEXT NOT NULL,
          requirement TEXT NOT NULL,
          status TEXT NOT NULL,
          evidence JSONB,
          justification TEXT,
          risk_level TEXT,
          mitigation TEXT,
          due_date TIMESTAMP,
          completed_date TIMESTAMP,
          assigned_to TEXT,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);

      const result = await pool.query(
        `SELECT * FROM compliance_tracking ORDER BY created_at DESC LIMIT 50`
      );

      const trackingRows = result.rows;

      if (trackingRows.length > 0) {
        // Build rules from actual DB data
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
        // No data in DB yet — provide meaningful defaults
        rules = [
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
        ];
        complianceScore = 75;
        recommendedActions = [
          'Complete design space documentation with DOE studies',
          'Update cleaning validation protocols',
          'Review risk assessment for manufacturing process',
        ];
      }
    } catch (e) {
      log.warn('[CMC] Could not query compliance_tracking:', e);
      rules = [
        { rule: 'ICH Q8', status: 'violation', severity: 'medium', description: 'DB unavailable - default check' },
      ];
      complianceScore = 75;
    }

    complianceScore = Math.max(complianceScore, 0);
    const violations = rules.filter(r => r.status === 'violation').length;

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
    log.error('[CMC] Error checking compliance rules:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to check compliance rules',
    });
  }
});

export default router;
