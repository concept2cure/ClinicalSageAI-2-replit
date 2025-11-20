/**
 * Regulatory Intelligence Service
 *
 * Phase 1, Step 3: Comprehensive document intelligence system that leverages
 * the enhanced vector database for intelligent regulatory document analysis,
 * compliance scoring, and submission optimization.
 */

import { Pool } from 'pg';
import OpenAI from 'openai';
import {
  ECTD_SECTION_MAPPINGS,
  DOC_TYPE_CLASSIFICATION_PATTERNS,
  REGION_CLASSIFICATION_PATTERNS,
  extractEctdSectionFromContent,
  classifyDocumentType,
  extractRegionTags,
} from '../config/regulatory_config.js';

export class RegulatoryIntelligenceService {
  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }

  /**
   * Comprehensive regulatory document analysis
   */
  async analyzeDocument(docId) {
    const client = await this.pool.connect();

    try {
      // Get all chunks for the document
      const result = await client.query(
        'SELECT * FROM document_chunks WHERE doc_id = $1 ORDER BY chunk_index',
        [docId]
      );

      if (result.rows.length === 0) {
        throw new Error('Document not found');
      }

      const chunks = result.rows;
      const fullContent = chunks.map(c => c.content).join(' ');

      // Perform comprehensive analysis
      const analysis = {
        document_id: docId,
        total_chunks: chunks.length,
        metadata_analysis: this.analyzeMetadata(chunks),
        content_analysis: await this.analyzeContent(fullContent, chunks[0]),
        compliance_analysis: await this.analyzeCompliance(chunks),
        regulatory_recommendations: await this.generateRegulatoryRecommendations(
          chunks,
          fullContent
        ),
        submission_readiness: await this.assessSubmissionReadiness(chunks, fullContent),
        quality_metrics: await this.calculateQualityMetrics(chunks, fullContent),
      };

      return analysis;
    } finally {
      client.release();
    }
  }

  /**
   * Analyze document metadata completeness and accuracy
   */
  analyzeMetadata(chunks) {
    const analysis = {
      completeness_score: 0,
      ectd_sections: new Set(),
      document_types: new Set(),
      regions: new Set(),
      gaps: [],
      inconsistencies: [],
    };

    let completeChunks = 0;

    for (const chunk of chunks) {
      let fieldCount = 0;

      if (chunk.ectd_section) {
        analysis.ectd_sections.add(chunk.ectd_section);
        fieldCount++;
      } else {
        analysis.gaps.push(`Chunk ${chunk.chunk_index}: Missing eCTD section`);
      }

      if (chunk.doc_type) {
        analysis.document_types.add(chunk.doc_type);
        fieldCount++;
      } else {
        analysis.gaps.push(`Chunk ${chunk.chunk_index}: Missing document type`);
      }

      if (chunk.region_tag && chunk.region_tag.length > 0) {
        chunk.region_tag.forEach(r => analysis.regions.add(r));
        fieldCount++;
      } else {
        analysis.gaps.push(`Chunk ${chunk.chunk_index}: Missing region tags`);
      }

      if (fieldCount >= 2) completeChunks++;
    }

    analysis.completeness_score = Math.round((completeChunks / chunks.length) * 100);
    analysis.ectd_sections = Array.from(analysis.ectd_sections);
    analysis.document_types = Array.from(analysis.document_types);
    analysis.regions = Array.from(analysis.regions);

    // Check for inconsistencies
    if (analysis.document_types.length > 1) {
      analysis.inconsistencies.push(
        'Multiple document types detected - may indicate mixed content'
      );
    }

    return analysis;
  }

  /**
   * Analyze document content quality and structure
   */
  async analyzeContent(fullContent, firstChunk) {
    try {
      const prompt = `Analyze this regulatory document for quality, structure, and completeness. 
      Provide assessment in JSON format with scores 0-100 for:
      - clarity: How clear and understandable is the content
      - completeness: How complete does the document appear
      - technical_rigor: Scientific/technical quality
      - regulatory_alignment: Alignment with regulatory standards
      
      Content: ${fullContent.substring(0, 3000)}
      
      Response format: {"clarity": score, "completeness": score, "technical_rigor": score, "regulatory_alignment": score, "summary": "brief analysis"}`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      });

      const analysis = JSON.parse(response.choices[0].message.content);

      return {
        ...analysis,
        word_count: fullContent.split(/\s+/).length,
        estimated_pages: Math.ceil(fullContent.length / 2000),
        document_structure: this.analyzeDocumentStructure(fullContent),
      };
    } catch (error) {
      console.error('Content analysis error:', error);
      return {
        clarity: 75,
        completeness: 75,
        technical_rigor: 75,
        regulatory_alignment: 75,
        summary: 'Analysis unavailable due to processing error',
        word_count: fullContent.split(/\s+/).length,
        estimated_pages: Math.ceil(fullContent.length / 2000),
      };
    }
  }

  /**
   * Analyze document structure and organization
   */
  analyzeDocumentStructure(content) {
    const structure = {
      has_sections: false,
      has_tables: false,
      has_references: false,
      section_count: 0,
      table_count: 0,
      reference_count: 0,
    };

    // Check for section headings
    const sectionMatches = content.match(/^\s*\d+(\.\d+)*\s+[A-Z]/gm);
    if (sectionMatches) {
      structure.has_sections = true;
      structure.section_count = sectionMatches.length;
    }

    // Check for tables
    const tableMatches = content.match(/table\s+\d+/gi);
    if (tableMatches) {
      structure.has_tables = true;
      structure.table_count = tableMatches.length;
    }

    // Check for references
    const referenceMatches = content.match(/\[\d+\]|reference/gi);
    if (referenceMatches) {
      structure.has_references = true;
      structure.reference_count = referenceMatches.length;
    }

    return structure;
  }

  /**
   * Analyze regulatory compliance across multiple dimensions
   */
  async analyzeCompliance(chunks) {
    const compliance = {
      overall_score: 0,
      ectd_compliance: 0,
      regional_compliance: {},
      missing_requirements: [],
      recommendations: [],
    };

    // eCTD compliance analysis
    const ectdSections = chunks.map(c => c.ectd_section).filter(Boolean);
    const uniqueSections = new Set(ectdSections);

    if (uniqueSections.size > 0) {
      compliance.ectd_compliance = Math.min(100, uniqueSections.size * 20);
    }

    // Regional compliance analysis
    const regions = new Set(chunks.flatMap(c => c.region_tag || []));
    for (const region of regions) {
      compliance.regional_compliance[region] = await this.assessRegionalCompliance(chunks, region);
    }

    // Calculate overall score
    const scores = [compliance.ectd_compliance, ...Object.values(compliance.regional_compliance)];
    compliance.overall_score = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    return compliance;
  }

  /**
   * Assess compliance for specific regulatory region
   */
  async assessRegionalCompliance(chunks, region) {
    let score = 100;
    const requirements = this.getRegionalRequirements(region);

    for (const requirement of requirements) {
      const hasRequirement = chunks.some(chunk =>
        chunk.content.toLowerCase().includes(requirement.toLowerCase())
      );
      if (!hasRequirement) {
        score -= 20;
      }
    }

    return Math.max(0, score);
  }

  /**
   * Get regional-specific requirements
   */
  getRegionalRequirements(region) {
    const requirements = {
      FDA: ['good clinical practice', 'fda guidance', 'cfr'],
      EMA: ['ich guidelines', 'european medicines agency', 'chmp'],
      PMDA: ['pmda guidance', 'japanese regulations'],
      Health_Canada: ['health canada guidance', 'canadian regulations'],
      ICH: ['ich harmonised', 'international harmonisation'],
    };

    return requirements[region] || [];
  }

  /**
   * Generate intelligent regulatory recommendations
   */
  async generateRegulatoryRecommendations(chunks, fullContent) {
    const recommendations = [];

    // Content-based recommendations
    const docTypes = new Set(chunks.map(c => c.doc_type).filter(Boolean));
    const ectdSections = new Set(chunks.map(c => c.ectd_section).filter(Boolean));
    const regions = new Set(chunks.flatMap(c => c.region_tag || []));

    // Missing document type recommendations
    if (docTypes.has('CSR') && !docTypes.has('Protocol')) {
      recommendations.push({
        type: 'missing_document',
        priority: 'medium',
        title: 'Consider adding Protocol document',
        description:
          'CSR documents typically reference protocols for complete regulatory submission',
      });
    }

    // eCTD section recommendations
    if (ectdSections.has('5.3') && !ectdSections.has('5.2')) {
      recommendations.push({
        type: 'missing_section',
        priority: 'high',
        title: 'Missing eCTD Section 5.2',
        description: 'Clinical study listings (5.2) should accompany clinical study reports (5.3)',
      });
    }

    // Regional harmonization recommendations
    if (regions.size > 1) {
      recommendations.push({
        type: 'harmonization',
        priority: 'medium',
        title: 'Multi-regional harmonization opportunity',
        description: `Document spans ${regions.size} regions. Consider harmonized approach for efficiency.`,
      });
    }

    // AI-powered content recommendations
    try {
      const aiRecommendations = await this.generateAIRecommendations(fullContent);
      recommendations.push(...aiRecommendations);
    } catch (error) {
      console.error('AI recommendation error:', error);
    }

    return recommendations;
  }

  /**
   * Generate AI-powered content recommendations
   */
  async generateAIRecommendations(content) {
    try {
      const prompt = `Analyze this regulatory document content and identify 2-3 specific recommendations for improvement. Focus on:
      - Content gaps that could strengthen the submission
      - Regulatory compliance improvements
      - Structure or clarity enhancements
      
      Content: ${content.substring(0, 2000)}
      
      Respond with JSON array: [{"type": "content", "priority": "high/medium/low", "title": "brief title", "description": "specific recommendation"}]`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      });

      const result = JSON.parse(response.choices[0].message.content);
      return result.recommendations || [];
    } catch (error) {
      console.error('AI recommendation generation error:', error);
      return [];
    }
  }

  /**
   * Assess submission readiness across regulatory regions
   */
  async assessSubmissionReadiness(chunks, fullContent) {
    const readiness = {
      overall_readiness: 0,
      fda_readiness: 0,
      ema_readiness: 0,
      pmda_readiness: 0,
      readiness_factors: {},
      blocking_issues: [],
      recommended_actions: [],
    };

    // Document completeness factor
    const completeness = chunks.length > 0 ? 80 : 0;
    readiness.readiness_factors.document_completeness = completeness;

    // Metadata completeness factor
    const metadataComplete = chunks.filter(
      c => c.ectd_section && c.doc_type && c.region_tag
    ).length;
    const metadataScore = Math.round((metadataComplete / chunks.length) * 100);
    readiness.readiness_factors.metadata_completeness = metadataScore;

    // Content quality factor
    const contentQuality = await this.assessContentQuality(fullContent);
    readiness.readiness_factors.content_quality = contentQuality;

    // Regional-specific readiness
    const regions = new Set(chunks.flatMap(c => c.region_tag || []));

    if (regions.has('FDA')) {
      readiness.fda_readiness = await this.assessFDAReadiness(chunks, fullContent);
    }

    if (regions.has('EMA')) {
      readiness.ema_readiness = await this.assessEMAReadiness(chunks, fullContent);
    }

    if (regions.has('PMDA')) {
      readiness.pmda_readiness = await this.assessPMDAReadiness(chunks, fullContent);
    }

    // Calculate overall readiness
    const factors = Object.values(readiness.readiness_factors);
    readiness.overall_readiness = Math.round(factors.reduce((a, b) => a + b, 0) / factors.length);

    // Identify blocking issues
    if (readiness.overall_readiness < 60) {
      readiness.blocking_issues.push('Document requires significant improvement before submission');
    }

    if (metadataScore < 80) {
      readiness.blocking_issues.push(
        'Incomplete regulatory metadata - ensure all chunks have eCTD sections and document types'
      );
    }

    return readiness;
  }

  /**
   * Assess content quality using multiple criteria
   */
  async assessContentQuality(content) {
    // Basic quality metrics
    const wordCount = content.split(/\s+/).length;
    const sentenceCount = content.split(/[.!?]+/).length;
    const avgWordsPerSentence = wordCount / sentenceCount;

    let qualityScore = 75; // Base score

    // Adjust based on content length
    if (wordCount < 500) qualityScore -= 20;
    else if (wordCount > 2000) qualityScore += 10;

    // Adjust based on sentence structure
    if (avgWordsPerSentence < 10) qualityScore -= 10;
    else if (avgWordsPerSentence > 30) qualityScore -= 15;

    // Check for technical content indicators
    const technicalTerms = ['study', 'analysis', 'clinical', 'safety', 'efficacy', 'data'];
    const technicalMatches = technicalTerms.filter(term =>
      content.toLowerCase().includes(term)
    ).length;

    qualityScore += Math.min(15, technicalMatches * 3);

    return Math.max(0, Math.min(100, qualityScore));
  }

  /**
   * Assess FDA-specific submission readiness
   */
  async assessFDAReadiness(chunks, content) {
    let score = 100;

    // Check for FDA-specific requirements
    const fdaRequirements = [
      'good clinical practice',
      'fda guidance',
      'code of federal regulations',
      'investigational new drug',
    ];

    for (const requirement of fdaRequirements) {
      if (!content.toLowerCase().includes(requirement)) {
        score -= 15;
      }
    }

    // Check for appropriate eCTD sections
    const ectdSections = chunks.map(c => c.ectd_section).filter(Boolean);
    const hasModules = ectdSections.some(s => s.startsWith('5.'));

    if (!hasModules && chunks.some(c => c.doc_type === 'CSR')) {
      score -= 25;
    }

    return Math.max(0, score);
  }

  /**
   * Assess EMA-specific submission readiness
   */
  async assessEMAReadiness(chunks, content) {
    let score = 100;

    // Check for EMA-specific requirements
    const emaRequirements = [
      'ich guidelines',
      'european medicines agency',
      'chmp guideline',
      'marketing authorisation',
    ];

    for (const requirement of emaRequirements) {
      if (!content.toLowerCase().includes(requirement)) {
        score -= 15;
      }
    }

    return Math.max(0, score);
  }

  /**
   * Assess PMDA-specific submission readiness
   */
  async assessPMDAReadiness(chunks, content) {
    let score = 100;

    // Check for PMDA-specific requirements
    const pmdaRequirements = ['pmda', 'japanese regulation', 'pharmaceuticals and medical devices'];

    for (const requirement of pmdaRequirements) {
      if (!content.toLowerCase().includes(requirement)) {
        score -= 20;
      }
    }

    return Math.max(0, score);
  }

  /**
   * Calculate comprehensive quality metrics
   */
  async calculateQualityMetrics(chunks, fullContent) {
    const metrics = {
      technical_accuracy: 0,
      regulatory_completeness: 0,
      content_coherence: 0,
      metadata_consistency: 0,
      overall_quality: 0,
    };

    // Technical accuracy (based on content analysis)
    metrics.technical_accuracy = await this.assessTechnicalAccuracy(fullContent);

    // Regulatory completeness (based on required sections)
    metrics.regulatory_completeness = this.assessRegulatoryCompleteness(chunks);

    // Content coherence (based on structure and flow)
    metrics.content_coherence = this.assessContentCoherence(fullContent);

    // Metadata consistency (based on metadata completeness)
    metrics.metadata_consistency = this.assessMetadataConsistency(chunks);

    // Overall quality (weighted average)
    metrics.overall_quality = Math.round(
      metrics.technical_accuracy * 0.3 +
        metrics.regulatory_completeness * 0.25 +
        metrics.content_coherence * 0.25 +
        metrics.metadata_consistency * 0.2
    );

    return metrics;
  }

  /**
   * Assess technical accuracy of content
   */
  async assessTechnicalAccuracy(content) {
    // Check for scientific terminology and structure
    const scientificTerms = [
      'statistical analysis',
      'confidence interval',
      'p-value',
      'endpoint',
      'adverse event',
      'pharmacokinetic',
      'clinical trial',
      'randomized',
      'double-blind',
    ];

    const foundTerms = scientificTerms.filter(term => content.toLowerCase().includes(term)).length;

    return Math.min(100, (foundTerms / scientificTerms.length) * 100 + 30);
  }

  /**
   * Assess regulatory completeness
   */
  assessRegulatoryCompleteness(chunks) {
    const requiredElements = {
      hasEctdSection: chunks.some(c => c.ectd_section),
      hasDocType: chunks.some(c => c.doc_type),
      hasRegionTag: chunks.some(c => c.region_tag && c.region_tag.length > 0),
      hasMultipleSections: new Set(chunks.map(c => c.ectd_section)).size > 1,
    };

    const completedElements = Object.values(requiredElements).filter(Boolean).length;
    return Math.round((completedElements / Object.keys(requiredElements).length) * 100);
  }

  /**
   * Assess content coherence and flow
   */
  assessContentCoherence(content) {
    let score = 75; // Base score

    // Check for logical structure
    const hasIntroduction = /introduction|background|objective/i.test(content);
    const hasMethodology = /method|design|procedure/i.test(content);
    const hasResults = /result|finding|outcome/i.test(content);
    const hasConclusion = /conclusion|summary|discussion/i.test(content);

    const structureElements = [hasIntroduction, hasMethodology, hasResults, hasConclusion];
    const structureScore = structureElements.filter(Boolean).length;

    score += (structureScore / 4) * 25;

    return Math.min(100, score);
  }

  /**
   * Assess metadata consistency across chunks
   */
  assessMetadataConsistency(chunks) {
    if (chunks.length === 0) return 0;

    const docTypes = new Set(chunks.map(c => c.doc_type).filter(Boolean));
    const ectdModules = new Set(chunks.map(c => c.ectd_section?.split('.')[0]).filter(Boolean));

    // Consistency checks
    let consistencyScore = 100;

    // Too many different document types indicates inconsistency
    if (docTypes.size > 2) {
      consistencyScore -= 20;
    }

    // Too many different eCTD modules indicates inconsistency
    if (ectdModules.size > 2) {
      consistencyScore -= 15;
    }

    // Missing metadata reduces consistency
    const completeChunks = chunks.filter(c => c.ectd_section && c.doc_type && c.region_tag);
    const completenessRatio = completeChunks.length / chunks.length;
    consistencyScore *= completenessRatio;

    return Math.max(0, Math.round(consistencyScore));
  }

  /**
   * Generate comprehensive regulatory intelligence report
   */
  async generateIntelligenceReport(docId) {
    const analysis = await this.analyzeDocument(docId);

    const report = {
      report_id: `REGINT_${Date.now()}`,
      document_id: docId,
      generated_at: new Date().toISOString(),
      executive_summary: await this.generateExecutiveSummary(analysis),
      detailed_analysis: analysis,
      action_items: this.generateActionItems(analysis),
      compliance_roadmap: this.generateComplianceRoadmap(analysis),
      risk_assessment: this.generateRiskAssessment(analysis),
    };

    return report;
  }

  /**
   * Generate executive summary of analysis
   */
  async generateExecutiveSummary(analysis) {
    try {
      const prompt = `Generate a concise executive summary for this regulatory document analysis:
      
      Overall Quality: ${analysis.quality_metrics?.overall_quality || 'N/A'}%
      Submission Readiness: ${analysis.submission_readiness?.overall_readiness || 'N/A'}%
      Compliance Score: ${analysis.compliance_analysis?.overall_score || 'N/A'}%
      
      Key Issues: ${
        analysis.regulatory_recommendations
          ?.slice(0, 3)
          .map(r => r.title)
          .join(', ') || 'None identified'
      }
      
      Provide a 2-3 sentence executive summary focusing on readiness and key actions needed.`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error('Executive summary generation error:', error);
      return 'Regulatory intelligence analysis completed. Detailed metrics and recommendations available in full report.';
    }
  }

  /**
   * Generate prioritized action items
   */
  generateActionItems(analysis) {
    const actionItems = [];

    // High priority actions from compliance analysis
    if (analysis.compliance_analysis?.overall_score < 70) {
      actionItems.push({
        priority: 'high',
        category: 'compliance',
        action: 'Address regulatory compliance gaps identified in analysis',
        estimated_effort: 'high',
      });
    }

    // Medium priority actions from metadata analysis
    if (analysis.metadata_analysis?.completeness_score < 80) {
      actionItems.push({
        priority: 'medium',
        category: 'metadata',
        action: 'Complete missing regulatory metadata fields',
        estimated_effort: 'medium',
      });
    }

    // Actions from recommendations
    analysis.regulatory_recommendations?.slice(0, 5).forEach(rec => {
      actionItems.push({
        priority: rec.priority || 'medium',
        category: rec.type || 'general',
        action: rec.description || rec.title,
        estimated_effort: 'medium',
      });
    });

    return actionItems;
  }

  /**
   * Generate compliance roadmap
   */
  generateComplianceRoadmap(analysis) {
    const roadmap = {
      current_state: analysis.compliance_analysis?.overall_score || 0,
      target_state: 95,
      milestones: [],
    };

    // Add milestones based on current gaps
    if (roadmap.current_state < 60) {
      roadmap.milestones.push({
        milestone: 'Basic Compliance Achievement',
        target_score: 70,
        estimated_timeline: '2-3 weeks',
        key_activities: ['Complete metadata', 'Address content gaps', 'Validate eCTD sections'],
      });
    }

    if (roadmap.current_state < 80) {
      roadmap.milestones.push({
        milestone: 'Regulatory Alignment',
        target_score: 85,
        estimated_timeline: '3-4 weeks',
        key_activities: [
          'Regional compliance review',
          'Content quality enhancement',
          'Technical accuracy validation',
        ],
      });
    }

    roadmap.milestones.push({
      milestone: 'Submission Ready',
      target_score: 95,
      estimated_timeline: '1-2 weeks',
      key_activities: [
        'Final quality review',
        'Compliance validation',
        'Submission package preparation',
      ],
    });

    return roadmap;
  }

  /**
   * Generate risk assessment
   */
  generateRiskAssessment(analysis) {
    const risks = [];

    // High risk conditions
    if (analysis.submission_readiness?.overall_readiness < 60) {
      risks.push({
        risk_level: 'high',
        category: 'submission_delay',
        description: 'Document not ready for submission - significant delays likely',
        mitigation: 'Immediate focus on compliance gaps and content quality',
      });
    }

    // Medium risk conditions
    if (analysis.metadata_analysis?.completeness_score < 70) {
      risks.push({
        risk_level: 'medium',
        category: 'regulatory_rejection',
        description: 'Incomplete metadata may cause regulatory questions',
        mitigation: 'Complete all required regulatory metadata fields',
      });
    }

    // Low risk conditions
    if (analysis.quality_metrics?.overall_quality < 80) {
      risks.push({
        risk_level: 'low',
        category: 'quality_concerns',
        description: 'Content quality could be enhanced for stronger submission',
        mitigation: 'Review and enhance content clarity and technical rigor',
      });
    }

    return risks;
  }
}

export default RegulatoryIntelligenceService;
