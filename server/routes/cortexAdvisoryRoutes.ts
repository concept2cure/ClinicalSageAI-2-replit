/**
 * ═══════════════════════════════════════════════════════════════════════════
 *                    COGNITIVE ADVISORY API ROUTES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Express routes exposing the Cognitive Advisory Service
 * Enables AI-powered project guidance and proactive suggestions
 *
 * @author TrialSage AI Team
 * @version 2.0.0 - Project Cortex
 */

import express from 'express';
import { pool } from '../db';
import { asyncHandler } from '../middleware/errorHandler';

const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════════
//                          IND PYRAMID DEFINITION
// ═══════════════════════════════════════════════════════════════════════════

const IND_PYRAMID_LEVELS = {
  foundation: {
    name: 'Scientific Rationale & Strategy',
    level: 1,
    weight: 30,
    checkpoints: [
      'Target Product Profile (TPP) defined',
      'Mechanism of action established',
      'Competitive differentiation clear',
      'Unmet medical need documented',
      'Development strategy aligned with TPP',
    ],
    riskIndicators: [
      { indicator: 'no_tpp', severity: 'critical', message: 'No Target Product Profile defined' },
      { indicator: 'unclear_moa', severity: 'high', message: 'Mechanism of action unclear' },
      {
        indicator: 'weak_differentiation',
        severity: 'medium',
        message: 'Weak competitive differentiation',
      },
    ],
  },
  preclinical: {
    name: 'Nonclinical Development',
    level: 2,
    weight: 25,
    checkpoints: [
      'Primary pharmacology completed',
      'Safety pharmacology (CV, CNS, respiratory) completed',
      'PK/ADME studies completed',
      'GLP toxicology of appropriate duration',
      'Reproductive toxicity (if applicable)',
      'Carcinogenicity (if applicable)',
      'NOAEL established with margins',
    ],
    riskIndicators: [
      {
        indicator: 'no_glp_tox',
        severity: 'critical',
        message: 'GLP toxicology studies not completed',
      },
      {
        indicator: 'insufficient_duration',
        severity: 'high',
        message: 'Toxicology duration insufficient for proposed clinical trial',
      },
      {
        indicator: 'low_exposure_margin',
        severity: 'high',
        message: 'Exposure margins below 10x at NOAEL',
      },
      {
        indicator: 'missing_safety_pharm',
        severity: 'high',
        message: 'hERG/cardiac safety studies incomplete',
      },
    ],
  },
  cmc: {
    name: 'Chemistry, Manufacturing & Controls',
    level: 3,
    weight: 20,
    checkpoints: [
      'Drug substance fully characterized',
      'Manufacturing process defined',
      'Analytical methods validated',
      'Specifications established',
      'Stability data supports clinical use',
      'Container closure qualified',
      'Impurities identified and qualified',
    ],
    riskIndicators: [
      {
        indicator: 'incomplete_characterization',
        severity: 'high',
        message: 'Drug substance characterization incomplete',
      },
      {
        indicator: 'insufficient_stability',
        severity: 'high',
        message: 'Stability data insufficient for proposed shelf life',
      },
      {
        indicator: 'unqualified_impurities',
        severity: 'medium',
        message: 'Impurities not fully qualified per ICH',
      },
    ],
  },
  clinical: {
    name: 'Clinical Development & Protocol',
    level: 4,
    weight: 15,
    checkpoints: [
      'Protocol has clear objectives',
      'Primary endpoint clinically meaningful',
      'Sample size adequately justified',
      'Inclusion/exclusion criteria appropriate',
      'Safety monitoring plan robust',
      'Stopping rules defined',
      'Statistical analysis plan pre-specified',
    ],
    riskIndicators: [
      {
        indicator: 'weak_endpoint',
        severity: 'high',
        message: 'Primary endpoint may not be clinically meaningful',
      },
      {
        indicator: 'underpowered',
        severity: 'medium',
        message: 'Study may be underpowered for primary analysis',
      },
      {
        indicator: 'no_stopping_rules',
        severity: 'medium',
        message: 'Stopping rules not clearly defined',
      },
    ],
  },
  administrative: {
    name: 'Administrative & Compliance',
    level: 5,
    weight: 10,
    checkpoints: [
      'Form 1571 complete and accurate',
      'Form 1572 from all investigators',
      'Investigator Brochure current',
      'Informed consent compliant',
      'Financial disclosures collected',
      'IRB/EC approvals obtained',
    ],
    riskIndicators: [
      {
        indicator: 'outdated_ib',
        severity: 'medium',
        message: 'Investigator Brochure needs update',
      },
      {
        indicator: 'missing_disclosures',
        severity: 'medium',
        message: 'Financial disclosures incomplete',
      },
    ],
  },
};

const DEVICE_510K_SECTIONS = {
  predicate: {
    name: 'Predicate Device Selection',
    weight: 35,
    checkpoints: [
      'Predicate legally marketed and not withdrawn',
      'Same intended use as subject device',
      'Same technological characteristics OR different but same questions',
      'Predicate comparison table complete',
    ],
    riskIndicators: [
      {
        indicator: 'inappropriate_predicate',
        severity: 'critical',
        message: 'Predicate may not be appropriate',
      },
      {
        indicator: 'recalled_predicate',
        severity: 'critical',
        message: 'Predicate device has been recalled',
      },
    ],
  },
  performance: {
    name: 'Performance Testing',
    weight: 30,
    checkpoints: [
      'Bench testing per FDA guidance/standards',
      'Biocompatibility testing per ISO 10993',
      'Software verification per IEC 62304',
      'Sterilization validation',
    ],
    riskIndicators: [
      {
        indicator: 'incomplete_biocompat',
        severity: 'high',
        message: 'Biocompatibility testing incomplete',
      },
      {
        indicator: 'missing_software_docs',
        severity: 'high',
        message: 'Software documentation incomplete',
      },
    ],
  },
  clinical: {
    name: 'Clinical & Human Factors',
    weight: 20,
    checkpoints: [
      'Clinical data adequate (if required)',
      'Human factors study completed',
      'Risk analysis per ISO 14971',
    ],
    riskIndicators: [
      {
        indicator: 'clinical_data_needed',
        severity: 'high',
        message: 'Clinical data may be required',
      },
      {
        indicator: 'no_human_factors',
        severity: 'medium',
        message: 'Human factors study not completed',
      },
    ],
  },
  labeling: {
    name: 'Labeling & IFU',
    weight: 15,
    checkpoints: [
      'All required labeling elements present',
      'Instructions for use clear and complete',
      'Warnings and precautions adequate',
    ],
    riskIndicators: [
      {
        indicator: 'incomplete_labeling',
        severity: 'medium',
        message: 'Labeling may be incomplete',
      },
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════
//                        API ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/cortex/advisory/:projectId
 * Get comprehensive advisory analysis for a project
 */
router.get('/advisory/:projectId', asyncHandler(async (req, res) => {
  const { projectId } = req.params;

    // Get project context
    const projectResult = await pool.query(
      `
      SELECT id, name, submission_type, therapeutic_area, phase, current_stage, metadata
      FROM projects WHERE id = $1
    `,
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = projectResult.rows[0];
    const submissionType = project.submission_type || 'ind';

    // Get project memory
    const memoryResult = await pool.query(
      `
      SELECT id, atom_type, content, created_at
      FROM lumen_data_atoms
      WHERE source_type = 'project_memory'
        AND source_id LIKE $1
      ORDER BY created_at DESC
      LIMIT 20
    `,
      [`PROJ:${projectId}:%`]
    );

    // Query Cortex for relevant patterns
    const patternsResult = await pool.query(
      `
      SELECT id, atom_type, title, content, structured_data, confidence
      FROM lumen_data_atoms
      WHERE atom_type IN ('rejection_pattern', 'proactive_guidance')
        AND (tags @> $1::text[] OR tags @> $2::text[])
      ORDER BY confidence DESC
      LIMIT 20
    `,
      [[submissionType], [project.therapeutic_area || 'general']]
    );

    // Determine structure to analyze
    const structure = submissionType === '510k' ? DEVICE_510K_SECTIONS : IND_PYRAMID_LEVELS;

    // Calculate readiness score
    let totalScore = 0;
    let maxScore = 0;
    const risks = [];
    const suggestions = [];

    for (const [levelKey, level] of Object.entries(structure)) {
      maxScore += level.weight;
      let levelScore = level.weight;

      for (const indicator of level.riskIndicators) {
        const hasRisk =
          project.metadata?.[indicator.indicator] ||
          memoryResult.rows.some(m =>
            m.content?.toLowerCase().includes(indicator.indicator.replace(/_/g, ' '))
          );

        if (hasRisk) {
          levelScore -=
            level.weight *
            (indicator.severity === 'critical' ? 0.5 : indicator.severity === 'high' ? 0.3 : 0.15);
          risks.push({
            id: `risk-${levelKey}-${indicator.indicator}`,
            type: 'risk_alert',
            priority: indicator.severity,
            title: indicator.message,
            description: `Issue at ${level.name} level`,
            pyramidLevel: levelKey,
            status: 'pending',
          });
        }
      }

      totalScore += Math.max(0, levelScore);
    }

    // Add suggestions from patterns
    for (const pattern of patternsResult.rows.filter(p => p.atom_type === 'proactive_guidance')) {
      suggestions.push({
        id: pattern.id,
        type: 'best_practice',
        priority: 'medium',
        title: pattern.title,
        description: pattern.content?.substring(0, 200),
        actionItems: pattern.structured_data?.prevention_steps || [],
        pyramidLevel: pattern.structured_data?.pyramid_level,
        status: 'pending',
      });
    }

    // Related rejection patterns
    const relatedPatterns = patternsResult.rows
      .filter(p => p.atom_type === 'rejection_pattern')
      .slice(0, 5)
      .map(p => ({
        id: p.id,
        submissionType: p.structured_data?.submission_type,
        category: p.structured_data?.category,
        reason: p.content?.substring(0, 200),
        severity: p.structured_data?.severity,
        pyramidLevel: p.structured_data?.pyramid_level,
      }));

    // Generate next steps
    const nextSteps = [
      `Review ${submissionType.toUpperCase()} requirements for current stage`,
      `Upload any missing documentation`,
      `Address ${risks.length} identified risks`,
    ];

    if (submissionType === 'ind' && !project.metadata?.pre_ind_meeting) {
      nextSteps.push('Consider requesting Pre-IND meeting with FDA');
    }

    if (submissionType === '510k') {
      nextSteps.push('Validate predicate device selection');
      nextSteps.push('Complete substantial equivalence comparison');
    }

    res.json({
      context: {
        id: project.id,
        name: project.name,
        submissionType,
        therapeuticArea: project.therapeutic_area,
        phase: project.phase,
        currentStage: project.current_stage,
      },
      readinessScore: Math.round((totalScore / maxScore) * 100),
      currentRisks: risks,
      proactiveSuggestions: suggestions.slice(0, 10),
      relatedPatterns,
      nextSteps,
      projectMemory: memoryResult.rows.slice(0, 10).map(m => ({
        id: m.id,
        eventType: m.atom_type,
        description: m.content,
        timestamp: m.created_at,
      })),
      confidence: 85,
    });
}));

/**
 * GET /api/cortex/pyramid/:submissionType
 * Get the structure definitions for a submission type
 */
router.get('/pyramid/:submissionType', async (req, res) => {
  const { submissionType } = req.params;

  if (submissionType === '510k' || submissionType === 'pma' || submissionType === 'de_novo') {
    res.json({
      type: 'device',
      structure: DEVICE_510K_SECTIONS,
    });
  } else {
    res.json({
      type: 'drug',
      structure: IND_PYRAMID_LEVELS,
    });
  }
});

/**
 * GET /api/cortex/patterns
 * Get rejection patterns from the knowledge base
 */
router.get('/patterns', asyncHandler(async (req, res) => {
  const { submissionType, category, limit = 50 } = req.query;

  let query = `
    SELECT id, title, content, structured_data, confidence
    FROM lumen_data_atoms
    WHERE atom_type = 'rejection_pattern'
  `;
  const params = [];
  let paramIndex = 1;

  if (submissionType) {
    query += ` AND tags @> $${paramIndex}::text[]`;
    params.push([submissionType]);
    paramIndex++;
  }

  if (category) {
    query += ` AND structured_data->>'category' = $${paramIndex}`;
    params.push(category);
    paramIndex++;
  }

  query += ` ORDER BY confidence DESC LIMIT $${paramIndex}`;
  params.push(parseInt(limit as string, 10));

  const result = await pool.query(query, params);

  res.json({
    patterns: result.rows.map(r => ({
      id: r.id,
      submissionType: r.structured_data?.submission_type,
      category: r.structured_data?.category,
      reason: r.content,
      severity: r.structured_data?.severity,
      pyramidLevel: r.structured_data?.pyramid_level,
      guidance: r.structured_data?.guidance,
      sourceDocument: r.structured_data?.source_document,
      confidence: r.confidence,
    })),
    total: result.rows.length,
  });
}));

/**
 * GET /api/cortex/guidance
 * Get proactive guidance from the knowledge base
 */
router.get('/guidance', asyncHandler(async (req, res) => {
  const { submissionType, pyramidLevel, limit = 20 } = req.query;

  let query = `
    SELECT id, title, content, structured_data, confidence
    FROM lumen_data_atoms
    WHERE atom_type = 'proactive_guidance'
  `;
  const params = [];
  let paramIndex = 1;

  if (submissionType) {
    query += ` AND tags @> $${paramIndex}::text[]`;
    params.push([submissionType]);
    paramIndex++;
  }

  if (pyramidLevel) {
    query += ` AND tags @> $${paramIndex}::text[]`;
    params.push([pyramidLevel]);
    paramIndex++;
  }

  query += ` ORDER BY confidence DESC LIMIT $${paramIndex}`;
  params.push(parseInt(limit as string, 10));

  const result = await pool.query(query, params);

  res.json({
    guidance: result.rows.map(r => ({
      id: r.id,
      title: r.title,
      content: r.content,
      submissionType: r.structured_data?.submission_type,
      pyramidLevel: r.structured_data?.pyramid_level,
      preventionSteps: r.structured_data?.prevention_steps,
      references: r.structured_data?.references,
      confidence: r.confidence,
    })),
    total: result.rows.length,
  });
}));

/**
 * POST /api/cortex/assess
 * Assess a specific action for regulatory risks
 */
router.post('/assess', asyncHandler(async (req, res) => {
  const { projectId, actionType, actionDetails } = req.body;

    // Query for relevant rejection patterns
    const patternsResult = await pool.query(
      `
      SELECT id, title, content, structured_data, confidence
      FROM lumen_data_atoms
      WHERE atom_type = 'rejection_pattern'
        AND (
          content ILIKE $1 OR
          title ILIKE $1
        )
      ORDER BY confidence DESC
      LIMIT 10
    `,
      [`%${actionType}%`]
    );

    const concerns = [];
    const recommendations = [];
    let riskLevel = 'low';

    for (const pattern of patternsResult.rows) {
      const severity = pattern.structured_data?.severity || 'medium';

      if (severity === 'critical') riskLevel = 'critical';
      else if (severity === 'high' && riskLevel !== 'critical') riskLevel = 'high';
      else if (severity === 'medium' && riskLevel === 'low') riskLevel = 'medium';

      concerns.push(pattern.title);
      if (pattern.structured_data?.guidance) {
        recommendations.push(pattern.structured_data.guidance);
      }
    }

    // Record assessment in project memory if projectId provided
    if (projectId) {
      await pool.query(
        `
        INSERT INTO lumen_data_atoms
        (id, organization_id, source_type, source_id, atom_type, title, content,
         structured_data, tags, confidence, status, created_at, updated_at)
        VALUES (gen_random_uuid(), 1, 'project_memory', $1, 'risk_identified', $2, $3, $4, $5, 0.85, 'active', NOW(), NOW())
      `,
        [
          `PROJ:${projectId}:${Date.now()}`,
          `Action Assessment: ${actionType}`,
          `Risk level: ${riskLevel}. Concerns: ${concerns.join('; ')}`,
          JSON.stringify({ actionType, actionDetails, riskLevel }),
          ['project_memory', 'assessment'],
        ]
      );
    }

    res.json({
      riskLevel,
      concerns: concerns.slice(0, 5),
      recommendations: recommendations.slice(0, 3),
    });
}));

/**
 * POST /api/cortex/memory
 * Record a project event in memory
 */
router.post('/memory', asyncHandler(async (req, res) => {
  const { projectId, eventType, description, learnings = [], metadata = {} } = req.body;

  if (!projectId || !eventType || !description) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const result = await pool.query(
    `
    INSERT INTO lumen_data_atoms
    (id, organization_id, source_type, source_id, atom_type, title, content,
     structured_data, tags, confidence, status, created_at, updated_at)
    VALUES (gen_random_uuid(), 1, 'project_memory', $1, $2, $3, $4, $5, $6, 0.85, 'active', NOW(), NOW())
    RETURNING id
  `,
    [
      `PROJ:${projectId}:${Date.now()}`,
      eventType,
      `${eventType}: ${description.substring(0, 100)}`,
      description,
      JSON.stringify({ learnings, metadata }),
      ['project_memory', eventType],
    ]
  );

  res.json({
    success: true,
    memoryId: result.rows[0].id,
  });
}));

/**
 * GET /api/cortex/stats
 * Get Cortex intelligence statistics
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const stats = await Promise.all([
    pool.query(`SELECT COUNT(*) as count FROM lumen_data_atoms`),
    pool.query(
      `SELECT COUNT(*) as count FROM lumen_data_atoms WHERE atom_type = 'rejection_pattern'`
    ),
    pool.query(
      `SELECT COUNT(*) as count FROM lumen_data_atoms WHERE atom_type = 'proactive_guidance'`
    ),
    pool.query(
      `SELECT COUNT(*) as count FROM lumen_data_atoms WHERE source_type = 'project_memory'`
    ),
    pool.query(`SELECT COUNT(*) as count FROM rag_knowledge_graph`),
    pool.query(
      `SELECT atom_type, COUNT(*) as count FROM lumen_data_atoms GROUP BY atom_type ORDER BY count DESC LIMIT 10`
    ),
  ]);

  res.json({
    totalAtoms: parseInt(stats[0].rows[0].count),
    rejectionPatterns: parseInt(stats[1].rows[0].count),
    guidanceAtoms: parseInt(stats[2].rows[0].count),
    projectMemoryEvents: parseInt(stats[3].rows[0].count),
    knowledgeEdges: parseInt(stats[4].rows[0].count),
    atomTypeDistribution: stats[5].rows,
  });
}));

/**
 * GET /api/cortex/similar-learnings
 * Get learnings from similar projects
 */
router.get('/similar-learnings', asyncHandler(async (req, res) => {
  const { submissionType, therapeuticArea } = req.query;

  const result = await pool.query(
    `
    SELECT DISTINCT ON (source_id)
      source_id, content, structured_data, created_at
    FROM lumen_data_atoms
    WHERE source_type = 'project_memory'
      AND (tags @> $1::text[] OR tags @> $2::text[])
    ORDER BY source_id, created_at DESC
    LIMIT 20
  `,
    [[submissionType || 'ind'], [therapeuticArea || 'oncology']]
  );

  res.json({
    learnings: result.rows.map(r => ({
      projectId: r.source_id.split(':')[1],
      learning: r.content,
      outcome: r.structured_data?.outcome || 'unknown',
      timestamp: r.created_at,
    })),
  });
}));

export default router;
