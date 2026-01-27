/**
 * ═══════════════════════════════════════════════════════════════════════════
 *                    COGNITIVE ADVISORY SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The AI brain that remembers each project, understands regulatory patterns,
 * and provides proactive suggestions to prevent submission failures.
 *
 * MISSION: Be the defacto go-to intelligence center outside of the actual FDA.
 *
 * CAPABILITIES:
 * 1. Project Memory - Tracks all events, decisions, and learnings per project
 * 2. Rejection Pattern Recognition - Maps current state to known failure modes
 * 3. IND Pyramid Guidance - Level-specific advice from strategy to details
 * 4. 510(k) Dossier Analysis - Predicate selection, substantial equivalence
 * 5. Proactive Risk Alerts - Warns before problems occur
 * 6. Real-World Evidence - Integrates CSR, FDA, clinical trial intelligence
 *
 * @author TrialSage AI Team
 * @version 2.0.0 - Project Cortex
 */

import { Pool } from 'pg';
import OpenAI from 'openai';

// Initialize clients
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ═══════════════════════════════════════════════════════════════════════════
//                          TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

interface ProjectContext {
  id: string;
  name: string;
  submissionType: 'ind' | 'nda' | 'bla' | '510k' | 'pma' | 'de_novo';
  therapeuticArea: string;
  phase: string;
  indication: string;
  moleculeType?: string;
  currentStage: string;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  createdAt: Date;
  metadata?: Record<string, any>;
}

interface ProjectMemoryEvent {
  id: string;
  projectId: string;
  eventType:
    | 'milestone'
    | 'risk_identified'
    | 'suggestion_accepted'
    | 'document_uploaded'
    | 'review_completed'
    | 'regulatory_interaction'
    | 'protocol_change'
    | 'safety_signal'
    | 'submission_draft';
  description: string;
  learnings: string[];
  timestamp: Date;
  metadata?: Record<string, any>;
}

interface RejectionPattern {
  id: string;
  submissionType: string;
  category: string;
  reason: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  pyramidLevel: string;
  preventionGuidance: string;
  sourceDocument?: string;
}

interface ProactiveSuggestion {
  id: string;
  type: 'risk_alert' | 'improvement' | 'best_practice' | 'regulatory_update';
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  actionItems: string[];
  relatedRejectionPatterns?: string[];
  pyramidLevel?: string;
  dueDate?: Date;
  status: 'pending' | 'acknowledged' | 'resolved' | 'dismissed';
}

interface CortexQueryResult {
  atoms: Array<{
    id: string;
    atomType: string;
    title: string;
    content: string;
    structuredData: Record<string, any>;
    confidence: number;
    tags: string[];
  }>;
  edges: Array<{
    sourceId: string;
    targetId: string;
    relationshipType: string;
    confidence: number;
  }>;
}

interface AdvisoryResponse {
  context: ProjectContext;
  currentRisks: ProactiveSuggestion[];
  proactiveSuggestions: ProactiveSuggestion[];
  relatedPatterns: RejectionPattern[];
  nextSteps: string[];
  confidence: number;
  reasoning: string;
}

// ═══════════════════════════════════════════════════════════════════════════
//                          IND PYRAMID DEFINITION
// ═══════════════════════════════════════════════════════════════════════════

const IND_PYRAMID_LEVELS = {
  foundation: {
    name: 'Scientific Rationale & Strategy',
    level: 1,
    weight: 30, // Critical - foundation affects everything
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

// ═══════════════════════════════════════════════════════════════════════════
//                        510(k) STRUCTURE DEFINITION
// ═══════════════════════════════════════════════════════════════════════════

const DEVICE_510K_SECTIONS = {
  predicate: {
    name: 'Predicate Device Selection',
    weight: 35, // Most critical for 510(k)
    checkpoints: [
      'Predicate legally marketed and not withdrawn',
      'Same intended use as subject device',
      'Same technological characteristics OR different but same questions of safety/effectiveness',
      'Predicate comparison table complete',
      'Rationale for multiple predicates (if applicable)',
    ],
    riskIndicators: [
      {
        indicator: 'inappropriate_predicate',
        severity: 'critical',
        message: 'Predicate may not be appropriate - different intended use',
      },
      {
        indicator: 'recalled_predicate',
        severity: 'critical',
        message: 'Predicate device has been recalled',
      },
      {
        indicator: 'new_tech_characteristics',
        severity: 'high',
        message: 'New technological characteristics may raise new questions',
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
      'Electrical safety per IEC 60601',
      'Sterilization validation',
      'Shelf life/packaging testing',
    ],
    riskIndicators: [
      {
        indicator: 'incomplete_biocompat',
        severity: 'high',
        message: 'Biocompatibility testing may be incomplete',
      },
      {
        indicator: 'missing_software_docs',
        severity: 'high',
        message: 'Software documentation incomplete',
      },
      {
        indicator: 'no_sterilization_validation',
        severity: 'high',
        message: 'Sterilization validation not completed',
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
      'Usability testing results acceptable',
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
      'Contraindications listed',
    ],
    riskIndicators: [
      {
        indicator: 'incomplete_labeling',
        severity: 'medium',
        message: 'Labeling may be incomplete',
      },
      {
        indicator: 'unclear_ifu',
        severity: 'medium',
        message: 'Instructions for use may not be user-friendly',
      },
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════
//                      DATABASE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get project context and history
 */
async function getProjectContext(projectId: string): Promise<ProjectContext | null> {
  try {
    const result = await pool.query(
      `
      SELECT p.*,
             COUNT(d.id) as document_count,
             MAX(d.created_at) as last_activity
      FROM projects p
      LEFT JOIN documents d ON d.project_id = p.id
      WHERE p.id = $1
      GROUP BY p.id
    `,
      [projectId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      submissionType: row.submission_type || 'ind',
      therapeuticArea: row.therapeutic_area || 'unknown',
      phase: row.phase || 'preclinical',
      indication: row.indication || '',
      moleculeType: row.molecule_type,
      currentStage: row.current_stage || 'planning',
      riskLevel: row.risk_level,
      createdAt: row.created_at,
      metadata: row.metadata || {},
    };
  } catch (error) {
    console.error('Error getting project context:', error);
    return null;
  }
}

/**
 * Get project memory events
 */
async function getProjectMemory(projectId: string, limit = 50): Promise<ProjectMemoryEvent[]> {
  try {
    const result = await pool.query(
      `
      SELECT * FROM lumen_data_atoms
      WHERE source_type = 'project_memory'
        AND source_id LIKE $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
      [`PROJ:${projectId}:%`, limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      projectId,
      eventType: row.atom_type,
      description: row.content,
      learnings: row.structured_data?.learnings || [],
      timestamp: row.created_at,
      metadata: row.structured_data?.metadata || {},
    }));
  } catch (error) {
    console.error('Error getting project memory:', error);
    return [];
  }
}

/**
 * Query Cortex for relevant knowledge
 */
async function queryCortex(
  submissionType: string,
  categories: string[],
  limit = 20
): Promise<CortexQueryResult> {
  try {
    // Query for rejection patterns
    const patternsResult = await pool.query(
      `
      SELECT * FROM lumen_data_atoms
      WHERE atom_type = 'rejection_pattern'
        AND (tags @> $1::text[] OR tags @> $2::text[])
      ORDER BY confidence DESC
      LIMIT $3
    `,
      [[submissionType], categories, limit]
    );

    // Query for guidance
    const guidanceResult = await pool.query(
      `
      SELECT * FROM lumen_data_atoms
      WHERE atom_type = 'proactive_guidance'
        AND (tags @> $1::text[] OR tags @> $2::text[])
      ORDER BY confidence DESC
      LIMIT $3
    `,
      [[submissionType], categories, limit]
    );

    // Get knowledge graph edges
    const edgesResult = await pool.query(
      `
      SELECT * FROM rag_knowledge_graph
      WHERE entity_type IN ('rejection_pattern', 'proactive_guidance')
      LIMIT $1
    `,
      [limit * 2]
    );

    const atoms = [...patternsResult.rows, ...guidanceResult.rows].map(row => ({
      id: row.id,
      atomType: row.atom_type,
      title: row.title,
      content: row.content,
      structuredData: row.structured_data || {},
      confidence: row.confidence,
      tags: row.tags || [],
    }));

    const edges = edgesResult.rows.map(row => ({
      sourceId: row.entity_id,
      targetId: row.related_entity_id,
      relationshipType: row.relationship_type,
      confidence: row.confidence,
    }));

    return { atoms, edges };
  } catch (error) {
    console.error('Error querying Cortex:', error);
    return { atoms: [], edges: [] };
  }
}

/**
 * Record project event in memory
 */
async function recordProjectEvent(
  projectId: string,
  eventType: ProjectMemoryEvent['eventType'],
  description: string,
  learnings: string[] = [],
  metadata: Record<string, any> = {}
): Promise<void> {
  try {
    await pool.query(
      `
      INSERT INTO lumen_data_atoms
      (id, organization_id, source_type, source_id, atom_type, title, content,
       structured_data, tags, confidence, status, created_at, updated_at)
      VALUES (gen_random_uuid(), 1, 'project_memory', $1, $2, $3, $4, $5, $6, 0.85, 'active', NOW(), NOW())
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
  } catch (error) {
    console.error('Error recording project event:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//                      COGNITIVE ANALYSIS ENGINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Analyze project against IND Pyramid
 */
async function analyzeINDPyramid(
  context: ProjectContext,
  memory: ProjectMemoryEvent[],
  cortexData: CortexQueryResult
): Promise<{ score: number; risks: ProactiveSuggestion[]; suggestions: ProactiveSuggestion[] }> {
  const risks: ProactiveSuggestion[] = [];
  const suggestions: ProactiveSuggestion[] = [];
  let totalScore = 0;
  let maxScore = 0;

  for (const [levelKey, level] of Object.entries(IND_PYRAMID_LEVELS)) {
    maxScore += level.weight;
    let levelScore = level.weight;

    // Check risk indicators
    for (const indicator of level.riskIndicators) {
      // Look for evidence in memory events or metadata
      const hasRisk =
        memory.some(
          event =>
            event.description.toLowerCase().includes(indicator.indicator.replace(/_/g, ' ')) ||
            event.learnings.some(l =>
              l.toLowerCase().includes(indicator.indicator.replace(/_/g, ' '))
            )
        ) || context.metadata?.[indicator.indicator];

      if (hasRisk) {
        levelScore -=
          level.weight *
          (indicator.severity === 'critical' ? 0.5 : indicator.severity === 'high' ? 0.3 : 0.15);

        risks.push({
          id: `risk-${levelKey}-${indicator.indicator}`,
          type: 'risk_alert',
          priority: indicator.severity as any,
          title: indicator.message,
          description: `Issue identified at ${level.name} level`,
          actionItems: [
            `Review ${levelKey} documentation`,
            `Address ${indicator.message.toLowerCase()}`,
          ],
          pyramidLevel: levelKey,
          status: 'pending',
        });
      }
    }

    // Look for relevant rejection patterns in Cortex
    const relevantPatterns = cortexData.atoms.filter(
      atom => atom.structuredData?.pyramid_level === levelKey || atom.tags.includes(levelKey)
    );

    for (const pattern of relevantPatterns.slice(0, 3)) {
      if (pattern.atomType === 'rejection_pattern') {
        suggestions.push({
          id: `suggestion-${pattern.id}`,
          type: 'best_practice',
          priority: (pattern.structuredData?.severity || 'medium') as any,
          title: `Prevention: ${pattern.title}`,
          description: pattern.content.substring(0, 200),
          actionItems: pattern.structuredData?.guidance ? [pattern.structuredData.guidance] : [],
          relatedRejectionPatterns: [pattern.id],
          pyramidLevel: levelKey,
          status: 'pending',
        });
      }
    }

    totalScore += Math.max(0, levelScore);
  }

  return {
    score: Math.round((totalScore / maxScore) * 100),
    risks,
    suggestions,
  };
}

/**
 * Analyze project against 510(k) structure
 */
async function analyze510kDossier(
  context: ProjectContext,
  memory: ProjectMemoryEvent[],
  cortexData: CortexQueryResult
): Promise<{ score: number; risks: ProactiveSuggestion[]; suggestions: ProactiveSuggestion[] }> {
  const risks: ProactiveSuggestion[] = [];
  const suggestions: ProactiveSuggestion[] = [];
  let totalScore = 0;
  let maxScore = 0;

  for (const [sectionKey, section] of Object.entries(DEVICE_510K_SECTIONS)) {
    maxScore += section.weight;
    let sectionScore = section.weight;

    for (const indicator of section.riskIndicators) {
      const hasRisk =
        memory.some(event =>
          event.description.toLowerCase().includes(indicator.indicator.replace(/_/g, ' '))
        ) || context.metadata?.[indicator.indicator];

      if (hasRisk) {
        sectionScore -=
          section.weight *
          (indicator.severity === 'critical' ? 0.5 : indicator.severity === 'high' ? 0.3 : 0.15);

        risks.push({
          id: `risk-510k-${sectionKey}-${indicator.indicator}`,
          type: 'risk_alert',
          priority: indicator.severity as any,
          title: indicator.message,
          description: `Issue in ${section.name} section`,
          actionItems: [
            `Review ${sectionKey} documentation`,
            `Address: ${indicator.message.toLowerCase()}`,
          ],
          pyramidLevel: sectionKey,
          status: 'pending',
        });
      }
    }

    // Look for NSE patterns in Cortex
    const nsePatterns = cortexData.atoms.filter(
      atom =>
        atom.atomType === 'rejection_pattern' &&
        (atom.structuredData?.submission_type === 'device_510k' ||
          atom.tags.includes('510k') ||
          atom.tags.includes('nse'))
    );

    for (const pattern of nsePatterns.slice(0, 2)) {
      suggestions.push({
        id: `suggestion-510k-${pattern.id}`,
        type: 'best_practice',
        priority: 'high',
        title: `510(k) Prevention: ${pattern.title?.substring(0, 50)}`,
        description: pattern.content.substring(0, 200),
        actionItems: ['Review predicate selection', 'Verify substantial equivalence argument'],
        relatedRejectionPatterns: [pattern.id],
        pyramidLevel: sectionKey,
        status: 'pending',
      });
    }

    totalScore += Math.max(0, sectionScore);
  }

  return {
    score: Math.round((totalScore / maxScore) * 100),
    risks,
    suggestions,
  };
}

/**
 * Generate AI-powered proactive suggestions using GPT-4
 */
async function generateAISuggestions(
  context: ProjectContext,
  memory: ProjectMemoryEvent[],
  cortexData: CortexQueryResult,
  analysisResults: {
    score: number;
    risks: ProactiveSuggestion[];
    suggestions: ProactiveSuggestion[];
  }
): Promise<ProactiveSuggestion[]> {
  if (!process.env.OPENAI_API_KEY) {
    return [];
  }

  try {
    const systemPrompt = `You are a senior regulatory affairs expert with 20+ years of FDA experience.
You specialize in ${context.submissionType.toUpperCase()} submissions for ${context.therapeuticArea}.
Your role is to provide proactive, actionable guidance to prevent regulatory rejections.

Analysis context:
- Submission Type: ${context.submissionType}
- Phase: ${context.phase}
- Current Readiness Score: ${analysisResults.score}%
- Known Risks: ${analysisResults.risks.map(r => r.title).join('; ')}

Relevant rejection patterns from our intelligence database:
${cortexData.atoms
  .slice(0, 5)
  .map(a => `- ${a.title}: ${a.content?.substring(0, 100)}`)
  .join('\n')}

Recent project events:
${memory
  .slice(0, 5)
  .map(m => `- ${m.eventType}: ${m.description?.substring(0, 100)}`)
  .join('\n')}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Based on the project context and our regulatory intelligence, provide 3 specific, actionable recommendations to improve this ${context.submissionType} submission's success probability. For each recommendation, specify:
1. The specific risk being addressed
2. Concrete action items
3. Priority level (critical/high/medium)
4. Which section of the dossier it affects

Format as JSON array with fields: title, description, actionItems (array), priority, pyramidLevel`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return [];

    const parsed = JSON.parse(content);
    const aiSuggestions = parsed.recommendations || parsed.suggestions || [];

    return aiSuggestions.map((s: any, i: number) => ({
      id: `ai-suggestion-${Date.now()}-${i}`,
      type: 'improvement' as const,
      priority: s.priority || 'medium',
      title: s.title,
      description: s.description,
      actionItems: s.actionItems || [],
      pyramidLevel: s.pyramidLevel,
      status: 'pending' as const,
    }));
  } catch (error) {
    console.error('Error generating AI suggestions:', error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//                      PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Main advisory function - analyzes project and returns comprehensive guidance
 */
export async function getProjectAdvisory(projectId: string): Promise<AdvisoryResponse | null> {
  // Get project context
  const context = await getProjectContext(projectId);
  if (!context) {
    return null;
  }

  // Get project memory
  const memory = await getProjectMemory(projectId);

  // Determine relevant categories for Cortex query
  const categories = [context.submissionType, context.therapeuticArea, context.phase];

  // Query Cortex for relevant intelligence
  const cortexData = await queryCortex(context.submissionType, categories);

  // Run appropriate analysis based on submission type
  let analysisResults;
  if (
    context.submissionType === '510k' ||
    context.submissionType === 'pma' ||
    context.submissionType === 'de_novo'
  ) {
    analysisResults = await analyze510kDossier(context, memory, cortexData);
  } else {
    analysisResults = await analyzeINDPyramid(context, memory, cortexData);
  }

  // Generate AI-powered suggestions
  const aiSuggestions = await generateAISuggestions(context, memory, cortexData, analysisResults);

  // Combine all suggestions
  const allSuggestions = [...analysisResults.suggestions, ...aiSuggestions]
    .sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    })
    .slice(0, 10);

  // Extract related rejection patterns
  const relatedPatterns: RejectionPattern[] = cortexData.atoms
    .filter(a => a.atomType === 'rejection_pattern')
    .slice(0, 5)
    .map(a => ({
      id: a.id,
      submissionType: a.structuredData?.submission_type || context.submissionType,
      category: a.structuredData?.category || 'general',
      reason: a.content,
      severity: a.structuredData?.severity || 'medium',
      pyramidLevel: a.structuredData?.pyramid_level || 'unknown',
      preventionGuidance: a.structuredData?.guidance || '',
      sourceDocument: a.structuredData?.source_document,
    }));

  // Generate next steps
  const nextSteps = generateNextSteps(context, analysisResults);

  // Record this advisory session in project memory
  await recordProjectEvent(
    projectId,
    'review_completed',
    `Advisory analysis completed. Score: ${analysisResults.score}%. ${analysisResults.risks.length} risks identified.`,
    [
      `Current readiness: ${analysisResults.score}%`,
      `${analysisResults.risks.length} active risks`,
    ],
    { score: analysisResults.score, riskCount: analysisResults.risks.length }
  );

  return {
    context,
    currentRisks: analysisResults.risks,
    proactiveSuggestions: allSuggestions,
    relatedPatterns,
    nextSteps,
    confidence: Math.min(95, analysisResults.score + 10),
    reasoning: `Analysis based on ${cortexData.atoms.length} regulatory intelligence atoms and ${memory.length} project events.`,
  };
}

/**
 * Generate context-aware next steps
 */
function generateNextSteps(
  context: ProjectContext,
  analysis: { score: number; risks: ProactiveSuggestion[] }
): string[] {
  const steps: string[] = [];

  if (analysis.score < 50) {
    steps.push('🚨 PRIORITY: Address critical gaps before proceeding');
  }

  if (analysis.risks.some(r => r.priority === 'critical')) {
    steps.push('Resolve critical risks immediately - these are blocking issues');
  }

  if (context.submissionType === 'ind') {
    if (context.phase === 'preclinical') {
      steps.push('Verify GLP toxicology studies meet duration requirements');
      steps.push('Confirm hERG/cardiovascular safety assessment complete');
    }
    if (!context.metadata?.pre_ind_meeting) {
      steps.push('Consider requesting Type B Pre-IND meeting with FDA');
    }
    steps.push('Review IND Pyramid checklist for current phase');
  }

  if (context.submissionType === '510k') {
    steps.push('Validate predicate device selection against FDA database');
    steps.push('Complete substantial equivalence comparison table');
    steps.push('Verify all testing per FDA-recognized consensus standards');
  }

  // Add general steps
  steps.push(`Upload any new documents for ${context.submissionType.toUpperCase()} review`);
  steps.push('Review regulatory intelligence for similar submissions');

  return steps.slice(0, 5);
}

/**
 * Get real-time risk assessment for a specific action
 */
export async function assessAction(
  projectId: string,
  actionType: string,
  actionDetails: Record<string, any>
): Promise<{
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  concerns: string[];
  recommendations: string[];
}> {
  const context = await getProjectContext(projectId);
  if (!context) {
    return { riskLevel: 'medium', concerns: ['Project not found'], recommendations: [] };
  }

  const categories = [context.submissionType, actionType];
  const cortexData = await queryCortex(context.submissionType, categories);

  const concerns: string[] = [];
  const recommendations: string[] = [];
  let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

  // Analyze action against rejection patterns
  for (const atom of cortexData.atoms) {
    if (atom.atomType === 'rejection_pattern') {
      const actionString = JSON.stringify(actionDetails).toLowerCase();
      const patternContent = atom.content.toLowerCase();

      // Check for relevant patterns
      if (
        patternContent.includes(actionType.toLowerCase()) ||
        Object.values(actionDetails).some(
          v => typeof v === 'string' && patternContent.includes(v.toLowerCase())
        )
      ) {
        const severity = atom.structuredData?.severity || 'medium';
        if (severity === 'critical') riskLevel = 'critical';
        else if (severity === 'high' && riskLevel !== 'critical') riskLevel = 'high';
        else if (severity === 'medium' && riskLevel === 'low') riskLevel = 'medium';

        concerns.push(atom.title);
        if (atom.structuredData?.guidance) {
          recommendations.push(atom.structuredData.guidance);
        }
      }
    }
  }

  // Record this assessment
  await recordProjectEvent(
    projectId,
    'risk_identified',
    `Action assessment: ${actionType}. Risk level: ${riskLevel}`,
    concerns,
    { actionType, actionDetails, riskLevel }
  );

  return {
    riskLevel,
    concerns: concerns.slice(0, 5),
    recommendations: recommendations.slice(0, 3),
  };
}

/**
 * Get historical learnings for similar projects
 */
export async function getSimilarProjectLearnings(
  submissionType: string,
  therapeuticArea: string
): Promise<Array<{ projectId: string; learning: string; outcome: string }>> {
  try {
    const result = await pool.query(
      `
      SELECT DISTINCT ON (source_id)
        source_id, content, structured_data
      FROM lumen_data_atoms
      WHERE source_type = 'project_memory'
        AND tags @> $1::text[]
      ORDER BY source_id, created_at DESC
      LIMIT 10
    `,
      [[submissionType, therapeuticArea]]
    );

    return result.rows.map(row => ({
      projectId: row.source_id.split(':')[1],
      learning: row.content,
      outcome: row.structured_data?.outcome || 'unknown',
    }));
  } catch (error) {
    console.error('Error getting similar project learnings:', error);
    return [];
  }
}

// Export additional utilities
export { IND_PYRAMID_LEVELS, DEVICE_510K_SECTIONS, recordProjectEvent, queryCortex };
