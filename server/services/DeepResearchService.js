/**
 * Deep Research Intelligence Service
 *
 * Core backend service for CSR-backed intelligence, transforming basic chat
 * into evidence-based protocol strategist with real CSR data integration.
 */

import { pool } from '../db.js';
// Database query functions for CSR intelligence

export class DeepResearchService {
  constructor() {
    this.maxCsrMatches = 3;
    this.confidenceThreshold = 0.7;
  }

  /**
   * Generate comprehensive intelligence report based on user query
   * @param {string} query - User's research query
   * @param {string} indication - Target indication
   * @param {string} phase - Study phase
   * @param {string} tenantId - Tenant identifier for isolation
   * @returns {Object} Structured intelligence report
   */
  async generateIntelligenceReport(query, indication, phase, tenantId) {
    try {
      // Pull top CSR matches
      const csrMatches = await this.getCsrMatches(indication, phase, tenantId);

      // Extract data points and insights
      const precedentInsights = await this.extractPrecedentInsights(csrMatches);

      // Generate structured recommendations
      const recommendations = await this.generateRecommendations(csrMatches, query);

      // Compile comprehensive report
      const intelligenceReport = {
        query,
        timestamp: new Date().toISOString(),
        csrMatches: csrMatches.slice(0, this.maxCsrMatches),
        precedentInsights,
        structuredRecommendations: recommendations,
        metadata: {
          totalCsrReviewed: csrMatches.length,
          confidenceLevel: this.calculateConfidenceLevel(csrMatches),
          tenantId,
        },
      };

      return intelligenceReport;
    } catch (error) {
      console.error('Deep Research Intelligence Error:', error);
      throw new Error(`Failed to generate intelligence report: ${error.message}`);
    }
  }

  /**
   * Query CSR database for matching studies
   * @param {string} indication - Target indication
   * @param {string} phase - Study phase
   * @param {string} tenantId - Tenant identifier
   * @returns {Array} Array of matching CSR studies
   */
  async getCsrMatches(indication, phase, tenantId) {
    try {
      // Query the actual csr_reports table containing 3,021 CSR reports
      const csrResults = await pool.query(
        `
        SELECT 
          id as csr_id,
          title,
          indication,
          phase,
          sponsor,
          status,
          date,
          study_id,
          drug_name,
          region,
          summary,
          file_name,
          nctrial_id,
          last_updated
        FROM csr_reports 
        WHERE (
          LOWER(indication) LIKE LOWER($1) OR
          LOWER(title) LIKE LOWER($1) OR
          LOWER(sponsor) LIKE LOWER($1) OR
          LOWER(drug_name) LIKE LOWER($1)
        )
        AND (
          $2 = '' OR 
          LOWER(phase) LIKE LOWER($2) OR
          phase = $2
        )
        ORDER BY 
          CASE 
            WHEN LOWER(indication) = LOWER($1) THEN 1
            WHEN LOWER(indication) LIKE LOWER($1) THEN 2
            ELSE 3
          END,
          last_updated DESC,
          date DESC
        LIMIT 20
      `,
        [`%${indication}%`, phase || '']
      );

      // Transform results into CSR match format
      const csrMatches = csrResults.rows.map(result => ({
        csrId: result.csr_id,
        title: result.title,
        indication: result.indication,
        phase: result.phase,
        sponsor: result.sponsor,
        status: result.status,
        relevanceScore: this.calculateRelevance(result, indication, phase),
        endpoints: {
          primary: this.extractPrimaryEndpoint(result.summary),
          secondary: this.extractSecondaryEndpoints(result.summary),
        },
        sampleSize: this.extractSampleSize(result.summary),
        duration: this.extractDuration(result.summary),
        regulatoryStatus: result.status,
        highlights: this.extractHighlights(result.summary),
        lastUpdated: result.date,
        studyId: result.study_id,
        drugName: result.drug_name,
        region: result.region,
        summary: result.summary,
        fileName: result.file_name,
        nctrialId: result.nctrial_id,
        lastUpdatedTimestamp: result.last_updated,
      }));

      // Debug: Log the CSR matches
      console.log('CSR Query Results:', csrMatches.length, 'matches found');
      if (csrMatches.length > 0) {
        console.log('First match:', csrMatches[0]);
      }

      // Sort by relevance score
      return csrMatches.sort((a, b) => b.relevanceScore - a.relevanceScore);
    } catch (error) {
      console.error('CSR Query Error:', error);
      throw new Error(`Failed to query CSR database: ${error.message}`);
    }
  }

  /**
   * Extract precedent insights from CSR matches
   * @param {Array} csrMatches - Array of CSR study matches
   * @returns {Object} Precedent insights summary
   */
  async extractPrecedentInsights(csrMatches) {
    const totalStudies = csrMatches.length;
    const successfulStudies = csrMatches.filter(
      csr => csr.regulatoryStatus && csr.regulatoryStatus.toLowerCase().includes('approved')
    ).length;

    const sampleSizes = csrMatches.filter(csr => csr.sampleSize).map(csr => csr.sampleSize);

    const durations = csrMatches
      .filter(csr => csr.duration)
      .map(csr => this.parseDuration(csr.duration));

    return {
      successRate:
        totalStudies > 0
          ? `${Math.round((successfulStudies / totalStudies) * 100)}% from ${totalStudies} studies`
          : 'Insufficient data',
      recommendedSampleSize:
        sampleSizes.length > 0
          ? `${Math.round(sampleSizes.reduce((a, b) => a + b) / sampleSizes.length)} per arm`
          : 'Data unavailable',
      typicalDuration:
        durations.length > 0
          ? `${Math.round(durations.reduce((a, b) => a + b) / durations.length)} months`
          : 'Variable',
      dropoutRisk: this.assessDropoutRisk(durations),
      regulatoryPrecedent: this.extractRegulatoryPrecedent(csrMatches),
      commonEndpoints: this.extractCommonEndpoints(csrMatches),
    };
  }

  /**
   * Generate structured recommendations based on CSR analysis
   * @param {Array} csrMatches - Array of CSR study matches
   * @param {string} query - Original user query
   * @returns {Object} Structured recommendations
   */
  async generateRecommendations(csrMatches, query) {
    const topMatch = csrMatches[0];
    const avgSampleSize = this.calculateAverageSampleSize(csrMatches);
    const mostCommonEndpoint = this.findMostCommonEndpoint(csrMatches);

    return {
      suggestedEndpoint: mostCommonEndpoint || 'Primary efficacy endpoint',
      studyDesign: this.recommendStudyDesign(csrMatches),
      recommendedSampleSize: avgSampleSize || 200,
      suggestedDuration: this.recommendDuration(csrMatches),
      confidenceLevel: this.calculateConfidenceLevel(csrMatches),
      riskAssessment: this.assessRisks(csrMatches),
      keyConsiderations: this.extractKeyConsiderations(csrMatches, query),
      nextSteps: this.generateNextSteps(csrMatches),
    };
  }

  /**
   * Extract primary endpoint from CSR summary
   */
  extractPrimaryEndpoint(summary) {
    if (!summary) return 'Not specified';
    const match = summary.match(/primary\s+endpoint[:\s]*([^.]*)/i);
    return match ? match[1].trim() : 'Not specified';
  }

  /**
   * Extract secondary endpoints from CSR summary
   */
  extractSecondaryEndpoints(summary) {
    if (!summary) return [];
    const match = summary.match(/secondary\s+endpoint[s]?[:\s]*([^.]*)/i);
    return match ? match[1].split(',').map(e => e.trim()) : [];
  }

  // Helper methods for data extraction and analysis
  extractIndication(text, targetIndication) {
    if (!text) return targetIndication;
    const content = typeof text === 'string' ? text : text.content || JSON.stringify(text);
    if (!content || typeof content !== 'string') return targetIndication;
    const indicationMatch = content.match(/indication[:\s]*([^.]+)/i);
    return indicationMatch ? indicationMatch[1].trim() : targetIndication;
  }

  extractPhase(aiAnalysis, targetPhase) {
    if (!aiAnalysis) return targetPhase;
    const phaseMatch = JSON.stringify(aiAnalysis).match(/phase\s*(i{1,3}|[123])/i);
    return phaseMatch ? `Phase ${phaseMatch[1].toUpperCase()}` : targetPhase;
  }

  extractEndpoints(moduleData) {
    if (!moduleData) return { primary: 'Not specified', secondary: [] };

    try {
      const data = typeof moduleData === 'string' ? JSON.parse(moduleData) : moduleData;
      return {
        primary: data.primary_endpoint || 'Not specified',
        secondary: data.secondary_endpoints || [],
      };
    } catch {
      return { primary: 'Not specified', secondary: [] };
    }
  }

  extractSampleSize(text) {
    if (!text) return null;
    const content = typeof text === 'string' ? text : text.content || JSON.stringify(text);
    if (!content || typeof content !== 'string') return null;
    const sampleMatch = content.match(/(?:sample size|n\s*=|enrolled)\s*:?\s*(\d+)/i);
    return sampleMatch ? parseInt(sampleMatch[1]) : null;
  }

  extractDuration(text) {
    if (!text) return null;
    const content = typeof text === 'string' ? text : text.content || JSON.stringify(text);
    if (!content || typeof content !== 'string') return null;
    const durationMatch = content.match(
      /(?:duration|follow.?up|treatment period)\s*:?\s*(\d+)\s*(week|month|year)s?/i
    );
    return durationMatch ? `${durationMatch[1]} ${durationMatch[2]}s` : null;
  }

  extractRegulatoryStatus(aiAnalysis) {
    if (!aiAnalysis) return 'Status unknown';
    const statusText = JSON.stringify(aiAnalysis).toLowerCase();
    if (statusText.includes('approved')) return 'Approved';
    if (statusText.includes('pending')) return 'Pending approval';
    if (statusText.includes('rejected')) return 'Rejected';
    return 'Under review';
  }

  calculateRelevance(result, indication, phase) {
    let score = 0.5; // Base score

    const processedText =
      typeof result.processed_text === 'string'
        ? result.processed_text
        : JSON.stringify(result.processed_text || '');
    if (processedText.toLowerCase().includes(indication.toLowerCase())) score += 0.3;

    if (
      result.ai_analysis &&
      JSON.stringify(result.ai_analysis).toLowerCase().includes(phase.toLowerCase())
    )
      score += 0.2;

    return Math.min(score, 1.0);
  }

  calculateConfidenceLevel(csrMatches) {
    if (csrMatches.length === 0) return 'Low';
    if (csrMatches.length >= 3) return 'High';
    return 'Medium';
  }

  // Fallback data for when database queries fail
  getFallbackCsrData(indication, phase) {
    return [
      {
        csrId: 'FALLBACK_001',
        title: `${phase} Study in ${indication}`,
        indication,
        phase,
        relevanceScore: 0.8,
        endpoints: { primary: 'Primary efficacy endpoint', secondary: ['Safety', 'Tolerability'] },
        sampleSize: 200,
        duration: '24 weeks',
        regulatoryStatus: 'Under review',
        highlights: ['Standard protocol design', 'Regulatory guidance alignment'],
        lastUpdated: new Date().toISOString(),
      },
    ];
  }

  // Additional helper methods
  parseDuration(duration) {
    if (!duration) return 12;
    const match = duration.match(/(\d+)/);
    return match ? parseInt(match[1]) : 12;
  }

  assessDropoutRisk(durations) {
    if (!durations || durations.length === 0) return 'Medium';
    const avgDuration = durations.reduce((a, b) => a + b) / durations.length;
    if (avgDuration <= 12) return 'Low';
    if (avgDuration <= 24) return 'Medium';
    return 'High';
  }

  extractRegulatoryPrecedent(csrMatches) {
    if (!csrMatches || csrMatches.length === 0) {
      return 'Limited regulatory precedent data available';
    }

    const approvedStudies = csrMatches.filter(
      csr => csr.regulatoryStatus && csr.regulatoryStatus.toLowerCase().includes('approved')
    );

    if (approvedStudies.length === 0) return 'No recent approvals found';

    const recent = approvedStudies[0];
    return `Similar study approved - ${recent.title}`;
  }

  extractCommonEndpoints(csrMatches) {
    if (!csrMatches || csrMatches.length === 0) {
      return ['Overall Response Rate', 'Progression-Free Survival', 'Overall Survival'];
    }

    const endpoints = csrMatches
      .map(csr => csr.endpoints.primary)
      .filter(endpoint => endpoint && endpoint !== 'Not specified');

    return endpoints.length > 0
      ? [...new Set(endpoints)].slice(0, 3)
      : ['Overall Response Rate', 'Progression-Free Survival'];
  }

  calculateAverageSampleSize(csrMatches) {
    if (!csrMatches || csrMatches.length === 0) {
      return 200; // Default fallback
    }

    const sizes = csrMatches.filter(csr => csr.sampleSize).map(csr => csr.sampleSize);
    return sizes.length > 0 ? Math.round(sizes.reduce((a, b) => a + b) / sizes.length) : 200;
  }

  findMostCommonEndpoint(csrMatches) {
    if (!csrMatches || csrMatches.length === 0) {
      return 'Overall Response Rate';
    }

    const endpoints = csrMatches.map(csr => csr.endpoints.primary).filter(Boolean);
    if (endpoints.length === 0) {
      return 'Overall Response Rate';
    }

    const frequency = {};
    endpoints.forEach(endpoint => {
      frequency[endpoint] = (frequency[endpoint] || 0) + 1;
    });

    const keys = Object.keys(frequency);
    if (keys.length === 0) {
      return 'Overall Response Rate';
    }

    return keys.reduce((a, b) => (frequency[a] > frequency[b] ? a : b));
  }

  recommendStudyDesign(csrMatches) {
    if (!csrMatches || csrMatches.length === 0) {
      return 'Randomized controlled trial';
    }
    const designs = csrMatches.map(csr => csr.studyDesign || 'Randomized controlled trial');
    return designs[0] || 'Randomized controlled trial';
  }

  recommendDuration(csrMatches) {
    if (!csrMatches || csrMatches.length === 0) {
      return '24 weeks';
    }
    const durations = csrMatches.filter(csr => csr.duration).map(csr => csr.duration);
    return durations[0] || '24 weeks';
  }

  assessRisks(csrMatches) {
    const matchCount = csrMatches ? csrMatches.length : 0;
    return {
      recruitment: matchCount < 3 ? 'High' : 'Medium',
      regulatory: 'Medium',
      timeline: 'Medium',
    };
  }

  extractKeyConsiderations(csrMatches, query) {
    return [
      'Consider regulatory guidance alignment',
      'Ensure adequate sample size for statistical power',
      'Plan for potential dropout rates',
      'Align endpoints with regulatory expectations',
    ];
  }

  generateNextSteps(csrMatches) {
    return [
      'Review detailed CSR protocols',
      'Consult regulatory affairs team',
      'Conduct power analysis',
      'Prepare protocol outline',
    ];
  }

  extractHighlights(text) {
    if (!text) return [];

    const content = typeof text === 'string' ? text : text.content || JSON.stringify(text);
    if (!content || typeof content !== 'string') return ['Standard protocol design'];

    const highlights = [];
    if (content.includes('biomarker')) highlights.push('Biomarker-driven approach');
    if (content.includes('randomized')) highlights.push('Randomized design');
    if (content.includes('placebo')) highlights.push('Placebo-controlled');
    if (content.includes('double-blind')) highlights.push('Double-blind');

    return highlights.length > 0 ? highlights : ['Standard protocol design'];
  }
}

export const deepResearchService = new DeepResearchService();
