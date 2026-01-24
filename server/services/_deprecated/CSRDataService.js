/**
 * CSR Data Service - Production-grade data access layer
 * Handles all CSR-related database operations with comprehensive business logic
 */

import databaseManager from '../database/DatabaseManager.js';

class CSRDataService {
  constructor() {
    this.dbManager = databaseManager;
    console.log('📊 CSRDataService: Initializing production data service...');
  }

  async initialize() {
    try {
      await this.dbManager.initialize();
      console.log('✅ CSRDataService: Database connection established');
      return true;
    } catch (error) {
      console.error('❌ CSRDataService: Failed to initialize:', error.message);
      return false;
    }
  }

  // Comprehensive CSR Analytics
  async getCSRAnalytics(filters = {}) {
    try {
      const baseQuery = `
        SELECT 
          therapeutic_area,
          study_phase,
          regulatory_outcome,
          COUNT(*) as total_studies,
          AVG(CASE WHEN primary_efficacy_met THEN 1 ELSE 0 END) * 100 as success_rate,
          AVG(sample_size) as avg_sample_size,
          AVG(study_duration_months) as avg_duration,
          AVG(development_cost_millions) as avg_cost,
          AVG(CASE WHEN peak_sales_millions IS NOT NULL THEN peak_sales_millions ELSE 0 END) as avg_peak_sales,
          AVG(quality_score) as avg_quality_score,
          AVG(completeness_score) as avg_completeness_score,
          AVG(consistency_score) as avg_consistency_score,
          AVG(timeliness_score) as avg_timeliness_score,
          COUNT(CASE WHEN biomarker_strategy IS NOT NULL THEN 1 END) as biomarker_studies,
          COUNT(CASE WHEN companion_diagnostic THEN 1 END) as companion_diagnostic_studies,
          COUNT(CASE WHEN adaptive_design THEN 1 END) as adaptive_design_studies,
          COUNT(CASE WHEN ai_enhanced_analysis THEN 1 END) as ai_enhanced_studies
        FROM csr_reports 
        WHERE 1=1
      `;

      let params = [];
      let whereConditions = [];
      let paramIndex = 1;

      if (filters.therapeuticArea) {
        whereConditions.push(`therapeutic_area = $${paramIndex}`);
        params.push(filters.therapeuticArea);
        paramIndex++;
      }

      if (filters.studyPhase) {
        whereConditions.push(`study_phase = $${paramIndex}`);
        params.push(filters.studyPhase);
        paramIndex++;
      }

      if (filters.regulatoryOutcome) {
        whereConditions.push(`regulatory_outcome = $${paramIndex}`);
        params.push(filters.regulatoryOutcome);
        paramIndex++;
      }

      const whereClause = whereConditions.length > 0 ? ` AND ${whereConditions.join(' AND ')}` : '';
      const finalQuery =
        baseQuery +
        whereClause +
        ' GROUP BY therapeutic_area, study_phase, regulatory_outcome ORDER BY total_studies DESC';

      const result = await this.dbManager.query(finalQuery, params);

      // Calculate comprehensive analytics
      const analytics = this.calculateComprehensiveAnalytics(result.rows);

      return {
        success: true,
        data: analytics,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('❌ CSRDataService: Failed to get analytics:', error.message);
      throw error;
    }
  }

  calculateComprehensiveAnalytics(rawData) {
    const totalStudies = rawData.reduce((sum, row) => sum + parseInt(row.total_studies), 0);
    const avgSuccessRate =
      rawData.reduce((sum, row) => sum + parseFloat(row.success_rate), 0) / rawData.length;

    const therapeuticAreaAnalysis = {};
    const phaseAnalysis = {};
    const outcomeAnalysis = {};

    rawData.forEach(row => {
      // Therapeutic area analysis
      if (!therapeuticAreaAnalysis[row.therapeutic_area]) {
        therapeuticAreaAnalysis[row.therapeutic_area] = {
          totalStudies: 0,
          successRate: 0,
          avgCost: 0,
          avgPeakSales: 0,
          qualityScore: 0,
          biomarkerUtilization: 0,
          adaptiveDesignUsage: 0,
          aiEnhancementRate: 0,
        };
      }

      const area = therapeuticAreaAnalysis[row.therapeutic_area];
      area.totalStudies += parseInt(row.total_studies);
      area.successRate += parseFloat(row.success_rate);
      area.avgCost += parseFloat(row.avg_cost) || 0;
      area.avgPeakSales += parseFloat(row.avg_peak_sales) || 0;
      area.qualityScore += parseFloat(row.avg_quality_score) || 0;
      area.biomarkerUtilization += parseInt(row.biomarker_studies);
      area.adaptiveDesignUsage += parseInt(row.adaptive_design_studies);
      area.aiEnhancementRate += parseInt(row.ai_enhanced_studies);

      // Phase analysis
      if (!phaseAnalysis[row.study_phase]) {
        phaseAnalysis[row.study_phase] = {
          totalStudies: 0,
          successRate: 0,
          avgDuration: 0,
          avgSampleSize: 0,
          avgCost: 0,
        };
      }

      const phase = phaseAnalysis[row.study_phase];
      phase.totalStudies += parseInt(row.total_studies);
      phase.successRate += parseFloat(row.success_rate);
      phase.avgDuration += parseFloat(row.avg_duration) || 0;
      phase.avgSampleSize += parseFloat(row.avg_sample_size) || 0;
      phase.avgCost += parseFloat(row.avg_cost) || 0;

      // Outcome analysis
      if (!outcomeAnalysis[row.regulatory_outcome]) {
        outcomeAnalysis[row.regulatory_outcome] = {
          count: 0,
          percentage: 0,
        };
      }
      outcomeAnalysis[row.regulatory_outcome].count += parseInt(row.total_studies);
    });

    // Calculate percentages and averages
    Object.keys(outcomeAnalysis).forEach(outcome => {
      outcomeAnalysis[outcome].percentage = (outcomeAnalysis[outcome].count / totalStudies) * 100;
    });

    // Quality metrics
    const qualityMetrics = {
      dataCompleteness:
        rawData.reduce((sum, row) => sum + parseFloat(row.avg_completeness_score), 0) /
        rawData.length,
      dataConsistency:
        rawData.reduce((sum, row) => sum + parseFloat(row.avg_consistency_score), 0) /
        rawData.length,
      dataAccuracy:
        rawData.reduce((sum, row) => sum + parseFloat(row.avg_quality_score), 0) / rawData.length,
      dataTimeliness:
        rawData.reduce((sum, row) => sum + parseFloat(row.avg_timeliness_score), 0) /
        rawData.length,
    };

    // Technology adoption metrics
    const technologyMetrics = {
      biomarkerUtilization:
        (rawData.reduce((sum, row) => sum + parseInt(row.biomarker_studies), 0) / totalStudies) *
        100,
      companionDiagnosticUsage:
        (rawData.reduce((sum, row) => sum + parseInt(row.companion_diagnostic_studies), 0) /
          totalStudies) *
        100,
      adaptiveDesignAdoption:
        (rawData.reduce((sum, row) => sum + parseInt(row.adaptive_design_studies), 0) /
          totalStudies) *
        100,
      aiEnhancementRate:
        (rawData.reduce((sum, row) => sum + parseInt(row.ai_enhanced_studies), 0) / totalStudies) *
        100,
    };

    return {
      overview: {
        totalStudies,
        averageSuccessRate: Math.round(avgSuccessRate * 100) / 100,
        totalTherapeuticAreas: Object.keys(therapeuticAreaAnalysis).length,
        totalPhases: Object.keys(phaseAnalysis).length,
        analysisTimestamp: new Date().toISOString(),
      },
      therapeuticAreaAnalysis,
      phaseAnalysis,
      outcomeAnalysis,
      qualityMetrics,
      technologyMetrics,
      trends: {
        emergingTechnologies: [
          { name: 'AI-Enhanced Analysis', adoption: technologyMetrics.aiEnhancementRate },
          { name: 'Adaptive Design', adoption: technologyMetrics.adaptiveDesignAdoption },
          { name: 'Biomarker Strategy', adoption: technologyMetrics.biomarkerUtilization },
          { name: 'Companion Diagnostics', adoption: technologyMetrics.companionDiagnosticUsage },
        ],
        topPerformingAreas: Object.entries(therapeuticAreaAnalysis)
          .sort((a, b) => b[1].successRate - a[1].successRate)
          .slice(0, 5)
          .map(([area, data]) => ({ area, successRate: data.successRate })),
      },
    };
  }

  // Predictive Analytics
  async getPredictiveAnalytics(studyId = null) {
    try {
      let query;
      let params = [];

      if (studyId) {
        query = `
          SELECT 
            csr.*,
            bi.business_impact_millions,
            bi.timeline_savings_months,
            bi.confidence_score,
            bi.success_probability,
            bi.roi_projection,
            sp.prediction_type,
            sp.success_probability as model_success_probability,
            sp.key_success_factors,
            sp.risk_factors,
            sp.mitigation_strategies,
            sp.predicted_timeline_months,
            sp.predicted_cost_millions,
            sp.regulatory_approval_probability,
            sp.market_success_probability,
            sp.competitive_positioning_score,
            sp.commercial_viability_score
          FROM csr_reports csr
          LEFT JOIN csr_business_insights bi ON csr.id = bi.csr_report_id
          LEFT JOIN csr_success_predictions sp ON csr.id = sp.csr_report_id
          WHERE csr.study_id = $1
        `;
        params = [studyId];
      } else {
        query = `
          SELECT 
            csr.therapeutic_area,
            csr.study_phase,
            AVG(CASE WHEN csr.primary_efficacy_met THEN 1 ELSE 0 END) * 100 as historical_success_rate,
            AVG(bi.business_impact_millions) as avg_business_impact,
            AVG(bi.timeline_savings_months) as avg_timeline_savings,
            AVG(bi.confidence_score) as avg_confidence_score,
            AVG(sp.success_probability) as avg_predicted_success,
            AVG(sp.regulatory_approval_probability) as avg_regulatory_probability,
            AVG(sp.market_success_probability) as avg_market_probability,
            AVG(sp.competitive_positioning_score) as avg_competitive_score,
            COUNT(csr.id) as total_studies,
            COUNT(CASE WHEN csr.regulatory_outcome = 'Approved' THEN 1 END) as approved_studies
          FROM csr_reports csr
          LEFT JOIN csr_business_insights bi ON csr.id = bi.csr_report_id
          LEFT JOIN csr_success_predictions sp ON csr.id = sp.csr_report_id
          GROUP BY csr.therapeutic_area, csr.study_phase
          ORDER BY avg_predicted_success DESC
        `;
      }

      const result = await this.dbManager.query(query, params);

      if (studyId) {
        return this.formatIndividualPrediction(result.rows[0]);
      } else {
        return this.formatPredictiveAnalytics(result.rows);
      }
    } catch (error) {
      console.error('❌ CSRDataService: Failed to get predictive analytics:', error.message);
      throw error;
    }
  }

  formatIndividualPrediction(data) {
    if (!data) return null;

    return {
      studyId: data.study_id,
      studyTitle: data.study_title,
      therapeuticArea: data.therapeutic_area,
      studyPhase: data.study_phase,
      predictions: {
        successProbability: data.model_success_probability || 0,
        regulatoryApprovalProbability: data.regulatory_approval_probability || 0,
        marketSuccessProbability: data.market_success_probability || 0,
        competitivePositioningScore: data.competitive_positioning_score || 0,
        commercialViabilityScore: data.commercial_viability_score || 0,
      },
      businessImpact: {
        potentialSavings: data.business_impact_millions || 0,
        timelineSavings: data.timeline_savings_months || 0,
        roiProjection: data.roi_projection || 0,
        confidenceScore: data.confidence_score || 0,
      },
      riskAssessment: {
        keySuccessFactors: data.key_success_factors || [],
        riskFactors: data.risk_factors || [],
        mitigationStrategies: data.mitigation_strategies || [],
      },
      timeline: {
        predictedDuration: data.predicted_timeline_months || 0,
        predictedCost: data.predicted_cost_millions || 0,
      },
      analysisTimestamp: new Date().toISOString(),
    };
  }

  formatPredictiveAnalytics(data) {
    return {
      overview: {
        totalAnalyzedStudies: data.reduce((sum, row) => sum + parseInt(row.total_studies), 0),
        averageSuccessRate:
          data.reduce((sum, row) => sum + parseFloat(row.avg_predicted_success), 0) / data.length,
        averageBusinessImpact:
          data.reduce((sum, row) => sum + parseFloat(row.avg_business_impact || 0), 0) /
          data.length,
        averageTimelineSavings:
          data.reduce((sum, row) => sum + parseFloat(row.avg_timeline_savings || 0), 0) /
          data.length,
      },
      therapeuticAreaPredictions: data.map(row => ({
        therapeuticArea: row.therapeutic_area,
        studyPhase: row.study_phase,
        historicalSuccessRate: parseFloat(row.historical_success_rate) || 0,
        predictedSuccessRate: parseFloat(row.avg_predicted_success) || 0,
        regulatoryApprovalProbability: parseFloat(row.avg_regulatory_probability) || 0,
        marketSuccessProbability: parseFloat(row.avg_market_probability) || 0,
        competitivePositioning: parseFloat(row.avg_competitive_score) || 0,
        businessImpact: parseFloat(row.avg_business_impact) || 0,
        timelineSavings: parseFloat(row.avg_timeline_savings) || 0,
        totalStudies: parseInt(row.total_studies),
        approvedStudies: parseInt(row.approved_studies),
      })),
      topOpportunities: data
        .filter(row => parseFloat(row.avg_predicted_success) > 70)
        .sort((a, b) => parseFloat(b.avg_business_impact) - parseFloat(a.avg_business_impact))
        .slice(0, 5)
        .map(row => ({
          therapeuticArea: row.therapeutic_area,
          studyPhase: row.study_phase,
          businessImpact: parseFloat(row.avg_business_impact) || 0,
          successProbability: parseFloat(row.avg_predicted_success) || 0,
        })),
      analysisTimestamp: new Date().toISOString(),
    };
  }

  // Advanced Search with Analytics
  async searchWithAnalytics(query, filters = {}) {
    try {
      const searchQuery = `
        SELECT 
          csr.*,
          bi.business_impact_millions,
          bi.timeline_savings_months,
          bi.confidence_score,
          sp.success_probability,
          sp.regulatory_approval_probability,
          ci.competitor_count,
          ci.market_positioning,
          rsi.regulatory_success_probability,
          rsi.approval_timeline_months
        FROM csr_reports csr
        LEFT JOIN csr_business_insights bi ON csr.id = bi.csr_report_id
        LEFT JOIN csr_success_predictions sp ON csr.id = sp.csr_report_id
        LEFT JOIN (
          SELECT 
            therapeutic_area,
            indication,
            COUNT(*) as competitor_count,
            array_agg(DISTINCT market_positioning) as market_positioning
          FROM competitive_intelligence 
          GROUP BY therapeutic_area, indication
        ) ci ON csr.therapeutic_area = ci.therapeutic_area AND csr.indication = ci.indication
        LEFT JOIN regulatory_strategy_intelligence rsi ON csr.id = rsi.csr_report_id
        WHERE 1=1
      `;

      let params = [];
      let whereConditions = [];
      let paramIndex = 1;

      if (query) {
        whereConditions.push(`(
          csr.study_title ILIKE $${paramIndex} OR 
          csr.indication ILIKE $${paramIndex} OR 
          csr.sponsor ILIKE $${paramIndex}
        )`);
        params.push(`%${query}%`);
        paramIndex++;
      }

      if (filters.therapeuticArea) {
        whereConditions.push(`csr.therapeutic_area = $${paramIndex}`);
        params.push(filters.therapeuticArea);
        paramIndex++;
      }

      if (filters.studyPhase) {
        whereConditions.push(`csr.study_phase = $${paramIndex}`);
        params.push(filters.studyPhase);
        paramIndex++;
      }

      const whereClause = whereConditions.length > 0 ? ` AND ${whereConditions.join(' AND ')}` : '';
      const finalQuery =
        searchQuery + whereClause + ' ORDER BY csr.created_at DESC LIMIT $' + paramIndex;
      params.push(filters.limit || 20);

      const result = await this.dbManager.query(finalQuery, params);

      return {
        success: true,
        data: {
          results: result.rows.map(row => this.formatSearchResult(row)),
          totalResults: result.rows.length,
          searchQuery: query,
          appliedFilters: filters,
          analytics: this.calculateSearchAnalytics(result.rows),
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('❌ CSRDataService: Failed to search with analytics:', error.message);
      throw error;
    }
  }

  formatSearchResult(row) {
    return {
      studyId: row.study_id,
      protocolNumber: row.protocol_number,
      studyTitle: row.study_title,
      sponsor: row.sponsor,
      therapeuticArea: row.therapeutic_area,
      indication: row.indication,
      studyPhase: row.study_phase,
      regulatoryOutcome: row.regulatory_outcome,
      businessInsights: {
        businessImpact: row.business_impact_millions || 0,
        timelineSavings: row.timeline_savings_months || 0,
        confidenceScore: row.confidence_score || 0,
      },
      predictiveAnalytics: {
        successProbability: row.success_probability || 0,
        regulatoryApprovalProbability: row.regulatory_approval_probability || 0,
      },
      competitiveIntelligence: {
        competitorCount: row.competitor_count || 0,
        marketPositioning: row.market_positioning || [],
      },
      regulatoryStrategy: {
        regulatorySuccessProbability: row.regulatory_success_probability || 0,
        approvalTimeline: row.approval_timeline_months || 0,
      },
      qualityMetrics: {
        qualityScore: row.quality_score || 0,
        completenessScore: row.completeness_score || 0,
        consistencyScore: row.consistency_score || 0,
        timelinessScore: row.timeliness_score || 0,
      },
    };
  }

  calculateSearchAnalytics(results) {
    if (results.length === 0) return {};

    const totalResults = results.length;

    return {
      totalResults,
      averageSuccessRate:
        results.reduce((sum, row) => sum + (row.success_probability || 0), 0) / totalResults,
      averageBusinessImpact:
        results.reduce((sum, row) => sum + (row.business_impact_millions || 0), 0) / totalResults,
      averageTimelineSavings:
        results.reduce((sum, row) => sum + (row.timeline_savings_months || 0), 0) / totalResults,
      therapeuticAreaDistribution: this.getDistribution(results, 'therapeutic_area'),
      studyPhaseDistribution: this.getDistribution(results, 'study_phase'),
      regulatoryOutcomeDistribution: this.getDistribution(results, 'regulatory_outcome'),
      keyInsights: this.generateKeyInsights(results),
      recommendedActions: this.generateRecommendedActions(results),
    };
  }

  getDistribution(results, field) {
    const distribution = {};
    results.forEach(row => {
      const value = row[field] || 'Unknown';
      distribution[value] = (distribution[value] || 0) + 1;
    });
    return distribution;
  }

  generateKeyInsights(results) {
    const insights = [];

    const avgSuccessRate =
      results.reduce((sum, row) => sum + (row.success_probability || 0), 0) / results.length;
    if (avgSuccessRate > 70) {
      insights.push(
        `High success probability detected: ${avgSuccessRate.toFixed(1)}% average success rate`
      );
    }

    const avgBusinessImpact =
      results.reduce((sum, row) => sum + (row.business_impact_millions || 0), 0) / results.length;
    if (avgBusinessImpact > 2) {
      insights.push(
        `Significant business impact potential: $${avgBusinessImpact.toFixed(1)}M average impact`
      );
    }

    const competitiveStudies = results.filter(row => (row.competitor_count || 0) > 3);
    if (competitiveStudies.length > 0) {
      insights.push(`${competitiveStudies.length} studies in highly competitive markets`);
    }

    return insights;
  }

  generateRecommendedActions(results) {
    const actions = [];

    const highImpactStudies = results.filter(row => (row.business_impact_millions || 0) > 2);
    if (highImpactStudies.length > 0) {
      actions.push('Prioritize high-impact studies for detailed analysis');
    }

    const lowSuccessStudies = results.filter(row => (row.success_probability || 0) < 50);
    if (lowSuccessStudies.length > 0) {
      actions.push('Review risk mitigation strategies for low-success probability studies');
    }

    const fastTrackOpportunities = results.filter(
      row => (row.regulatory_success_probability || 0) > 80
    );
    if (fastTrackOpportunities.length > 0) {
      actions.push('Explore fast-track regulatory pathways for high-probability studies');
    }

    return actions;
  }

  // Health check
  async getHealthStatus() {
    return await this.dbManager.getHealthStatus();
  }
}

// Create singleton instance
const csrDataService = new CSRDataService();

export default csrDataService;
