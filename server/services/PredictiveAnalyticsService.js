/**
 * PREDICTIVE ANALYTICS SERVICE - SUB-PHASE 3.1
 *
 * Provides AI-powered predictive analytics for commitment fulfillment likelihood and risk.
 * Leverages OpenAI GPT-4o for nuanced prediction and historical platform data.
 */

import pkg from 'pg';
const { Pool } = pkg;

class PredictiveAnalyticsService {
  constructor() {
    console.log('✨ Initializing PredictiveAnalyticsService...');

    // Initialize database connection
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
  }

  /**
   * Predicts the likelihood of fulfilling a commitment within its deadline.
   * Integrates AI-assisted prediction leveraging historical platform data.
   */
  async predictFulfillmentLikelihood(commitment, tenantId = 'demo-tenant', userId = 'demo-user') {
    try {
      const now = new Date();
      const dueDate = commitment.due_date ? new Date(commitment.due_date) : null;
      const daysRemaining = dueDate
        ? Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : Infinity;
      const complexity = commitment.complexity_score || 0.5; // Default if not AI-assessed

      let likelihoodScore = 0.5; // Default likelihood (0-1 scale)
      let explanation = 'Prediction based on general heuristics and historical patterns.';
      let predictedDate = null;

      // Rule-based prediction (initial estimate/fallback)
      if (commitment.status === 'Completed') {
        likelihoodScore = 1.0;
        explanation = 'Commitment is already completed.';
        predictedDate = commitment.actual_completion_date
          ? new Date(commitment.actual_completion_date).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0];
      } else if (commitment.status === 'Overdue') {
        likelihoodScore = 0.1;
        explanation = 'Commitment is overdue and requires immediate attention.';
        predictedDate = dueDate ? dueDate.toISOString().split('T')[0] : null;
      } else if (
        daysRemaining <= 30 &&
        ['Active', 'In Progress', 'Under Review'].includes(commitment.status)
      ) {
        likelihoodScore = 0.3;
        explanation = 'Commitment is nearing its deadline and requires urgent action.';
      } else if (
        daysRemaining > 30 &&
        ['Active', 'In Progress', 'Under Review'].includes(commitment.status)
      ) {
        likelihoodScore = 0.7;
        explanation = 'Commitment is active and has sufficient time remaining.';
      }

      // AI-assisted prediction enhancement
      try {
        if (process.env.OPENAI_API_KEY) {
          const historicalContext = await this._getHistoricalContext(
            commitment.commitment_type || commitment.type,
            tenantId
          );

          const aiPrompt = `As a senior data scientist and regulatory project manager, you are analyzing commitment fulfillment likelihood based on historical data. Predict the likelihood (0-100%) of timely fulfillment for the given commitment.

Focus on statistical factors from the historical context (e.g., past completion rates, common delay reasons for similar commitments, correlation with complexity/days remaining).

Provide a detailed explanation (2-3 sentences) of the *key drivers* for your prediction, referencing the historical data patterns.
Provide a predicted completion date (YYYY-MM-DD).

Commitment: "${commitment.description}"
Type: ${commitment.commitment_type || commitment.type || 'Regulatory'}
Due Date: ${commitment.due_date}
Complexity (0-1): ${complexity}
Status: ${commitment.status}

Historical Context (similar commitments in your organization, up to 10 examples):
${historicalContext}

Prediction: (JSON format: {"likelihood": number, "explanation": "string", "predictedDate": "YYYY-MM-DD", "keyDrivers": ["string"], "statisticalFactors": ["string"], "riskIndicators": ["string"], "confidenceMetrics": {"dataQuality": number, "historicalRelevance": number, "predictiveAccuracy": number}})`;

          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4o',
              messages: [{ role: 'user', content: aiPrompt }],
              response_format: { type: 'json_object' },
              temperature: 0.1, // Lower temperature for more factual, less creative output
              max_tokens: 800, // Increased tokens for more detailed explanation
            }),
          });

          if (response.ok) {
            const result = await response.json();
            const aiPrediction = JSON.parse(result.choices[0].message.content);

            if (aiPrediction.likelihood !== undefined && aiPrediction.explanation) {
              const rawScore = parseFloat(aiPrediction.likelihood);
              likelihoodScore = isNaN(rawScore) ? 0.5 : Math.max(0, Math.min(100, rawScore)) / 100;
              explanation = `AI-driven insight: ${aiPrediction.explanation}`;
              predictedDate = aiPrediction.predictedDate || predictedDate;

              // Store enhanced prediction details for later use
              this.enhancedPredictionDetails = {
                keyDrivers: aiPrediction.keyDrivers || [],
                statisticalFactors: aiPrediction.statisticalFactors || [],
                riskIndicators: aiPrediction.riskIndicators || [],
                confidenceMetrics: aiPrediction.confidenceMetrics || {
                  dataQuality: 0.7,
                  historicalRelevance: 0.6,
                  predictiveAccuracy: 0.8,
                },
              };
            }
          }
        }
      } catch (aiError) {
        console.error(
          `AI prediction enhancement failed for commitment ${commitment.id || 'new'}:`,
          aiError.message
        );
        // Continue with rule-based prediction
      }

      // Ensure likelihoodScore is a valid number
      const finalScore = isNaN(likelihoodScore) ? 0.5 : likelihoodScore;

      return {
        score: parseFloat(Math.min(1.0, Math.max(0.0, finalScore)).toFixed(4)),
        explanation: explanation,
        predictedDate: predictedDate,
        confidence: this._calculateConfidence(commitment, daysRemaining),
        riskFactors: this._identifyRiskFactors(commitment, daysRemaining),
        recommendations: this._generateRecommendations(commitment, finalScore, daysRemaining),
        // Enhanced ML-driven fields
        keyDrivers: this.enhancedPredictionDetails?.keyDrivers || [],
        statisticalFactors: this.enhancedPredictionDetails?.statisticalFactors || [],
        riskIndicators: this.enhancedPredictionDetails?.riskIndicators || [],
        confidenceMetrics: this.enhancedPredictionDetails?.confidenceMetrics || {
          dataQuality: 0.7,
          historicalRelevance: 0.6,
          predictiveAccuracy: 0.8,
        },
      };
    } catch (error) {
      console.error('Predictive analytics error:', error);
      return {
        score: 0.5,
        explanation: 'Unable to generate prediction due to system error.',
        predictedDate: null,
        confidence: 0.3,
        riskFactors: ['System prediction unavailable'],
        recommendations: ['Review commitment manually'],
      };
    }
  }

  /**
   * Retrieves historical context for similar commitments from the database.
   */
  async _getHistoricalContext(commitmentType, tenantId) {
    try {
      // Handle demo tenant ID - convert to proper UUID format
      const resolvedTenantId =
        tenantId === 'demo-tenant' ? '550e8400-e29b-41d4-a716-446655440000' : tenantId;

      const client = await this.pool.connect();
      try {
        const query = `
          SELECT 
            status,
            due_date,
            actual_completion_date,
            description,
            complexity_score,
            prediction_score,
            prediction_details,
            priority,
            assigned_to_role,
            risk_level
          FROM regulatory_commitments 
          WHERE tenant_id = $1 
            AND (commitment_type = $2 OR commitment_type IS NULL)
            AND status IN ('Completed', 'Overdue', 'Active', 'In Progress')
          ORDER BY created_at DESC 
          LIMIT 10
        `;

        const result = await client.query(query, [resolvedTenantId, commitmentType]);

        if (result.rows.length === 0) {
          return "No similar historical commitments found in your organization's history.";
        }

        return result.rows
          .map(
            c =>
              `Description: "${c.description}", Status: ${c.status}, Due: ${c.due_date ? new Date(c.due_date).toISOString().split('T')[0] : 'N/A'}, ` +
              `Actual Completion: ${c.actual_completion_date ? new Date(c.actual_completion_date).toISOString().split('T')[0] : 'N/A'}, ` +
              `Complexity: ${c.complexity_score || 'N/A'}, Past Prediction: ${c.prediction_score ? (c.prediction_score * 100).toFixed(0) + '%' : 'N/A'}, ` +
              `Priority: ${c.priority || 'N/A'}, Role: ${c.assigned_to_role || 'N/A'}, Risk: ${c.risk_level || 'N/A'}, ` +
              `Details: ${c.prediction_details?.explanation || 'N/A'}`
          )
          .join('\n');
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Historical context retrieval error:', error);
      return 'Historical context unavailable due to database error.';
    }
  }

  /**
   * Calculates confidence level for the prediction
   */
  _calculateConfidence(commitment, daysRemaining) {
    let confidence = 0.5;

    // Higher confidence for completed/overdue (known states)
    if (['Completed', 'Overdue'].includes(commitment.status)) {
      confidence = 0.95;
    }
    // Lower confidence for very far future commitments
    else if (daysRemaining > 365) {
      confidence = 0.3;
    }
    // Higher confidence for near-term commitments
    else if (daysRemaining <= 90) {
      confidence = 0.8;
    }
    // Medium confidence for standard timeframes
    else {
      confidence = 0.6;
    }

    return parseFloat(confidence.toFixed(2));
  }

  /**
   * Identifies risk factors affecting commitment fulfillment
   */
  _identifyRiskFactors(commitment, daysRemaining) {
    const risks = [];

    if (daysRemaining <= 7) risks.push('Due within 1 week');
    if (daysRemaining <= 30) risks.push('Due within 1 month');
    if (commitment.priority === 'Critical') risks.push('Critical priority level');
    if (commitment.status === 'At Risk') risks.push('Currently marked at risk');
    if (!commitment.assignee) risks.push('No assignee specified');
    if (commitment.complexity_score > 0.7) risks.push('High complexity rating');

    return risks.length > 0 ? risks : ['No significant risk factors identified'];
  }

  /**
   * Generates actionable recommendations based on prediction
   */
  _generateRecommendations(commitment, likelihoodScore, daysRemaining) {
    const recommendations = [];

    if (likelihoodScore < 0.3) {
      recommendations.push('Immediate escalation required');
      recommendations.push('Consider resource reallocation');
      recommendations.push('Review and update timeline');
    } else if (likelihoodScore < 0.6) {
      recommendations.push('Monitor progress closely');
      recommendations.push('Consider additional resources');
      recommendations.push('Update stakeholders on status');
    } else {
      recommendations.push('Continue current approach');
      recommendations.push('Regular status updates');
      recommendations.push('Prepare for next milestones');
    }

    if (daysRemaining <= 30) {
      recommendations.push('Focus on critical path items');
      recommendations.push('Daily progress reviews');
    }

    return recommendations;
  }

  /**
   * Generates comprehensive dashboard analytics with enhanced predictive insights
   */
  async generateDashboardAnalytics(tenantId = 'demo-tenant') {
    try {
      // Handle demo tenant ID - convert to proper UUID format
      const resolvedTenantId =
        tenantId === 'demo-tenant' ? '550e8400-e29b-41d4-a716-446655440000' : tenantId;

      const client = await this.pool.connect();
      try {
        // Get all active commitments for analysis
        const commitmentsQuery = `
          SELECT 
            id, description, status, priority, commitment_type, due_date, 
            created_at, complexity_score, prediction_score, 
            assigned_to_user_id, assigned_to_role
          FROM regulatory_commitments 
          WHERE tenant_id = $1 AND status NOT IN ('Cancelled', 'Completed')
        `;

        const commitmentsResult = await client.query(commitmentsQuery, [resolvedTenantId]);
        const commitments = commitmentsResult.rows;

        // Generate predictions for all commitments
        const bulkPredictions = await this.predictBulkCommitments(commitments, resolvedTenantId);

        // Calculate aggregated analytics
        const analytics = {
          overview: this._calculateOverviewMetrics(commitments, bulkPredictions),
          riskDistribution: this._calculateRiskDistribution(bulkPredictions),
          timelineAnalysis: this._calculateTimelineAnalysis(commitments, bulkPredictions),
          bottleneckAnalysis: await this._identifySystemBottlenecks(commitments, resolvedTenantId),
          priorityMatrix: this._calculatePriorityMatrix(commitments, bulkPredictions),
          departmentAnalysis: this._analyzeDepartmentPerformance(commitments, bulkPredictions),
          trendAnalysis: await this._calculateTrendAnalysis(resolvedTenantId),
          predictiveInsights: this._generatePredictiveInsights(bulkPredictions),
          actionableRecommendations: this._generateDashboardRecommendations(
            commitments,
            bulkPredictions
          ),
          alertSystem: this._generateAlerts(commitments, bulkPredictions),
          lastUpdated: new Date().toISOString(),
        };

        return analytics;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Dashboard analytics generation error:', error);
      throw new Error(`Failed to generate dashboard analytics: ${error.message}`);
    }
  }

  /**
   * Performs bulk prediction for multiple commitments
   */
  async predictBulkCommitments(commitments, tenantId = 'demo-tenant', userId = 'demo-user') {
    const predictions = [];

    for (const commitment of commitments) {
      try {
        const prediction = await this.predictFulfillmentLikelihood(commitment, tenantId, userId);
        predictions.push({
          commitmentId: commitment.id,
          ...prediction,
        });
      } catch (error) {
        console.error(`Bulk prediction failed for commitment ${commitment.id}:`, error);
        predictions.push({
          commitmentId: commitment.id,
          score: 0.5,
          explanation: 'Prediction failed',
          predictedDate: null,
          confidence: 0.3,
          riskFactors: ['Prediction error'],
          recommendations: ['Review manually'],
        });
      }
    }

    return predictions;
  }

  /**
   * Updates commitment with prediction results
   */
  async updateCommitmentPrediction(commitmentId, prediction, tenantId = 'demo-tenant') {
    try {
      const client = await this.pool.connect();
      try {
        const query = `
          UPDATE regulatory_commitments 
          SET 
            prediction_score = $1,
            complexity_score = COALESCE(complexity_score, $2),
            prediction_details = $3,
            updated_at = NOW()
          WHERE id = $4 AND tenant_id = $5
          RETURNING id, prediction_score, prediction_details
        `;

        const predictionDetails = {
          explanation: prediction.explanation,
          predicted_date: prediction.predictedDate,
          confidence: prediction.confidence,
          risk_factors: prediction.riskFactors,
          recommendations: prediction.recommendations,
          last_predicted_at: new Date().toISOString(),
          prediction_version: '3.1',
        };

        const result = await client.query(query, [
          prediction.score,
          0.5, // Default complexity if not set
          JSON.stringify(predictionDetails),
          commitmentId,
          tenantId,
        ]);

        return result.rows[0] || null;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Update commitment prediction error:', error);
      throw error;
    }
  }

  // ============================================================================
  // ENHANCED ANALYTICS HELPER METHODS
  // ============================================================================

  /**
   * Calculates overview metrics for dashboard
   */
  _calculateOverviewMetrics(commitments, predictions) {
    const total = commitments.length;
    const criticalCount = commitments.filter(c => c.priority === 'Critical').length;
    const highRiskCount = predictions.filter(p => p.score < 0.3).length;
    const mediumRiskCount = predictions.filter(p => p.score >= 0.3 && p.score < 0.7).length;
    const lowRiskCount = predictions.filter(p => p.score >= 0.7).length;

    const avgScore =
      predictions.length > 0
        ? predictions.reduce((sum, p) => sum + p.score, 0) / predictions.length
        : 0;

    return {
      totalCommitments: total,
      criticalPriority: criticalCount,
      averagePredictionScore: Math.round(avgScore * 100) / 100,
      riskBreakdown: {
        high: highRiskCount,
        medium: mediumRiskCount,
        low: lowRiskCount,
      },
      complianceHealth: this._calculateComplianceHealth(avgScore),
      emergencyAlerts: this._countEmergencyAlerts(commitments, predictions),
    };
  }

  /**
   * Calculates risk distribution across commitments
   */
  _calculateRiskDistribution(predictions) {
    const distribution = {
      critical: 0, // < 0.2
      high: 0, // 0.2 - 0.4
      medium: 0, // 0.4 - 0.7
      low: 0, // 0.7 - 0.9
      minimal: 0, // > 0.9
    };

    predictions.forEach(p => {
      if (p.score < 0.2) distribution.critical++;
      else if (p.score < 0.4) distribution.high++;
      else if (p.score < 0.7) distribution.medium++;
      else if (p.score < 0.9) distribution.low++;
      else distribution.minimal++;
    });

    return {
      ...distribution,
      total: predictions.length,
      percentages: {
        critical: Math.round((distribution.critical / predictions.length) * 100) || 0,
        high: Math.round((distribution.high / predictions.length) * 100) || 0,
        medium: Math.round((distribution.medium / predictions.length) * 100) || 0,
        low: Math.round((distribution.low / predictions.length) * 100) || 0,
        minimal: Math.round((distribution.minimal / predictions.length) * 100) || 0,
      },
    };
  }

  /**
   * Analyzes timeline patterns and predictions
   */
  _calculateTimelineAnalysis(commitments, predictions) {
    const now = new Date();
    const timelineBuckets = {
      overdue: [],
      next7Days: [],
      next30Days: [],
      next90Days: [],
      beyond90Days: [],
    };

    commitments.forEach((commitment, index) => {
      const prediction = predictions[index];
      const dueDate = commitment.due_date ? new Date(commitment.due_date) : null;

      if (!dueDate) {
        timelineBuckets.beyond90Days.push({ commitment, prediction });
        return;
      }

      const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntilDue < 0) {
        timelineBuckets.overdue.push({ commitment, prediction });
      } else if (daysUntilDue <= 7) {
        timelineBuckets.next7Days.push({ commitment, prediction });
      } else if (daysUntilDue <= 30) {
        timelineBuckets.next30Days.push({ commitment, prediction });
      } else if (daysUntilDue <= 90) {
        timelineBuckets.next90Days.push({ commitment, prediction });
      } else {
        timelineBuckets.beyond90Days.push({ commitment, prediction });
      }
    });

    return {
      ...timelineBuckets,
      summary: {
        overdueCount: timelineBuckets.overdue.length,
        urgentCount: timelineBuckets.next7Days.length,
        nearTermCount: timelineBuckets.next30Days.length,
        quarterlyCount: timelineBuckets.next90Days.length,
        longTermCount: timelineBuckets.beyond90Days.length,
      },
      riskAnalysis: {
        overdueRisk: this._calculateBucketRisk(timelineBuckets.overdue),
        urgentRisk: this._calculateBucketRisk(timelineBuckets.next7Days),
        nearTermRisk: this._calculateBucketRisk(timelineBuckets.next30Days),
      },
    };
  }

  /**
   * Identifies system-wide bottlenecks
   */
  async _identifySystemBottlenecks(commitments, tenantId) {
    const bottlenecks = [];

    // Department/Role bottlenecks
    const roleAnalysis = {};
    commitments.forEach(c => {
      const role = c.assigned_to_role || 'Unassigned';
      if (!roleAnalysis[role]) {
        roleAnalysis[role] = { count: 0, criticalCount: 0 };
      }
      roleAnalysis[role].count++;
      if (c.priority === 'Critical') roleAnalysis[role].criticalCount++;
    });

    Object.entries(roleAnalysis).forEach(([role, data]) => {
      if (data.count > 5 && data.criticalCount > 2) {
        bottlenecks.push({
          type: 'resource_overload',
          department: role,
          severity: 'high',
          details: `${role} has ${data.count} commitments with ${data.criticalCount} critical items`,
          recommendation: `Consider redistributing workload or adding resources to ${role}`,
        });
      }
    });

    // Type-based bottlenecks
    const typeAnalysis = {};
    commitments.forEach(c => {
      const type = c.commitment_type || 'General';
      if (!typeAnalysis[type]) typeAnalysis[type] = 0;
      typeAnalysis[type]++;
    });

    Object.entries(typeAnalysis).forEach(([type, count]) => {
      if (count > 10) {
        bottlenecks.push({
          type: 'process_bottleneck',
          category: type,
          severity: 'medium',
          details: `${count} commitments of type ${type} may indicate process inefficiency`,
          recommendation: `Review and optimize ${type} processes`,
        });
      }
    });

    return bottlenecks;
  }

  /**
   * Calculates priority matrix analysis
   */
  _calculatePriorityMatrix(commitments, predictions) {
    const matrix = {
      criticalHigh: [],
      criticalMed: [],
      criticalLow: [],
      highHigh: [],
      highMed: [],
      highLow: [],
      mediumHigh: [],
      mediumMed: [],
      mediumLow: [],
      lowHigh: [],
      lowMed: [],
      lowLow: [],
    };

    commitments.forEach((commitment, index) => {
      const prediction = predictions[index];
      const priority = commitment.priority || 'Medium';
      const risk = prediction.score < 0.3 ? 'High' : prediction.score < 0.7 ? 'Med' : 'Low';

      const key = `${priority.toLowerCase()}${risk}`;
      if (matrix[key]) {
        matrix[key].push({ commitment, prediction });
      }
    });

    return {
      matrix,
      actionItems: {
        immediate: [...matrix.criticalHigh, ...matrix.highHigh],
        urgent: [...matrix.criticalMed, ...matrix.highMed, ...matrix.mediumHigh],
        monitor: [...matrix.criticalLow, ...matrix.highLow, ...matrix.mediumMed],
        maintain: [...matrix.mediumLow, ...matrix.lowHigh, ...matrix.lowMed, ...matrix.lowLow],
      },
    };
  }

  /**
   * Analyzes performance by department/role
   */
  _analyzeDepartmentPerformance(commitments, predictions) {
    const departments = {};

    commitments.forEach((commitment, index) => {
      const dept = commitment.assigned_to_role || 'Unassigned';
      const prediction = predictions[index];

      if (!departments[dept]) {
        departments[dept] = {
          totalCommitments: 0,
          avgPredictionScore: 0,
          criticalCount: 0,
          highRiskCount: 0,
          predictions: [],
        };
      }

      departments[dept].totalCommitments++;
      departments[dept].predictions.push(prediction.score);
      if (commitment.priority === 'Critical') departments[dept].criticalCount++;
      if (prediction.score < 0.3) departments[dept].highRiskCount++;
    });

    // Calculate averages
    Object.keys(departments).forEach(dept => {
      const data = departments[dept];
      data.avgPredictionScore =
        data.predictions.reduce((sum, score) => sum + score, 0) / data.predictions.length;
      data.riskRatio = data.highRiskCount / data.totalCommitments;
      data.performance =
        data.avgPredictionScore > 0.7
          ? 'excellent'
          : data.avgPredictionScore > 0.5
            ? 'good'
            : data.avgPredictionScore > 0.3
              ? 'needs_improvement'
              : 'critical';
    });

    return departments;
  }

  /**
   * Calculates trend analysis from historical data
   */
  async _calculateTrendAnalysis(tenantId) {
    try {
      // Handle demo tenant ID - convert to proper UUID format
      const resolvedTenantId =
        tenantId === 'demo-tenant' ? '550e8400-e29b-41d4-a716-446655440000' : tenantId;

      const client = await this.pool.connect();
      try {
        const query = `
          SELECT 
            DATE_TRUNC('week', created_at) as week,
            COUNT(*) as new_commitments,
            COUNT(*) FILTER (WHERE status = 'Completed') as completed,
            AVG(prediction_score) as avg_prediction_score
          FROM regulatory_commitments 
          WHERE tenant_id = $1 
            AND created_at >= NOW() - INTERVAL '12 weeks'
          GROUP BY week 
          ORDER BY week DESC
        `;

        const result = await client.query(query, [resolvedTenantId]);

        return {
          weeklyTrends: result.rows,
          trends: {
            newCommitments: this._calculateTrend(result.rows.map(r => r.new_commitments)),
            completionRate: this._calculateTrend(result.rows.map(r => r.completed)),
            predictionAccuracy: this._calculateTrend(result.rows.map(r => r.avg_prediction_score)),
          },
        };
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Trend analysis error:', error);
      return { weeklyTrends: [], trends: {} };
    }
  }

  /**
   * Generates predictive insights for the dashboard
   */
  _generatePredictiveInsights(predictions) {
    const insights = [];

    if (predictions.length === 0) {
      insights.push({
        type: 'info',
        severity: 'low',
        message: 'No active commitments available for analysis.',
        recommendation: 'Consider adding new regulatory commitments to track.',
      });
      return insights;
    }

    const avgScore = predictions.reduce((sum, p) => sum + p.score, 0) / predictions.length;
    const highRiskCount = predictions.filter(p => p.score < 0.3).length;
    const mediumRiskCount = predictions.filter(p => p.score >= 0.3 && p.score < 0.7).length;
    const lowRiskCount = predictions.filter(p => p.score >= 0.7).length;
    const confidenceSum =
      predictions.reduce((sum, p) => sum + (p.confidence || 0.5), 0) / predictions.length;

    // High-risk scenarios
    if (avgScore < 0.4) {
      insights.push({
        type: 'alert',
        severity: 'high',
        message: 'Overall fulfillment likelihood is below 40%. Immediate action required.',
        recommendation: 'Review resource allocation and consider timeline adjustments.',
      });
    }

    // Medium-risk scenarios
    if (highRiskCount > predictions.length * 0.2) {
      insights.push({
        type: 'warning',
        severity: 'medium',
        message: `${highRiskCount} commitments (${Math.round((highRiskCount / predictions.length) * 100)}%) are at high risk.`,
        recommendation: 'Focus on high-risk commitments and implement mitigation strategies.',
      });
    } else if (mediumRiskCount > predictions.length * 0.4) {
      insights.push({
        type: 'warning',
        severity: 'medium',
        message: `${mediumRiskCount} commitments (${Math.round((mediumRiskCount / predictions.length) * 100)}%) need attention.`,
        recommendation: 'Monitor medium-risk commitments closely to prevent escalation.',
      });
    }

    // Positive scenarios
    if (avgScore >= 0.7 && highRiskCount === 0) {
      insights.push({
        type: 'success',
        severity: 'low',
        message: `Strong performance: ${Math.round(avgScore * 100)}% average fulfillment likelihood with no high-risk items.`,
        recommendation: 'Maintain current approach and consider optimizing resource allocation.',
      });
    }

    // Performance analysis
    if (lowRiskCount > predictions.length * 0.6) {
      insights.push({
        type: 'insight',
        severity: 'low',
        message: `${lowRiskCount} commitments (${Math.round((lowRiskCount / predictions.length) * 100)}%) are performing well.`,
        recommendation: 'Use successful patterns from these commitments for others.',
      });
    }

    // Confidence analysis
    if (confidenceSum > 0.8) {
      insights.push({
        type: 'info',
        severity: 'low',
        message: `High prediction confidence (${Math.round(confidenceSum * 100)}%) indicates reliable forecasts.`,
        recommendation: 'Continue current monitoring and prediction strategies.',
      });
    } else if (confidenceSum < 0.5) {
      insights.push({
        type: 'warning',
        severity: 'medium',
        message: `Low prediction confidence (${Math.round(confidenceSum * 100)}%) suggests data quality issues.`,
        recommendation: 'Improve data collection and commitment tracking processes.',
      });
    }

    // Ensure we always have at least one insight
    if (insights.length === 0) {
      insights.push({
        type: 'info',
        severity: 'low',
        message: `Portfolio analysis: ${predictions.length} commitments with ${Math.round(avgScore * 100)}% average likelihood.`,
        recommendation: 'Continue monitoring and maintain current performance levels.',
      });
    }

    return insights;
  }

  /**
   * Generates actionable recommendations for the dashboard
   */
  _generateDashboardRecommendations(commitments, predictions) {
    const recommendations = [];

    const urgentCommitments = commitments.filter(c => {
      const dueDate = c.due_date ? new Date(c.due_date) : null;
      if (!dueDate) return false;
      const daysUntilDue = Math.ceil(
        (dueDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );
      return daysUntilDue <= 7;
    });

    if (urgentCommitments.length > 0) {
      recommendations.push({
        priority: 'immediate',
        title: 'Urgent Deadline Review',
        description: `${urgentCommitments.length} commitments due within 7 days require immediate attention.`,
        action: 'Review and prioritize upcoming deadlines',
        commitmentIds: urgentCommitments.map(c => c.id),
      });
    }

    const unassignedCommitments = commitments.filter(
      c => !c.assigned_to_user_id && !c.assigned_to_role
    );
    if (unassignedCommitments.length > 0) {
      recommendations.push({
        priority: 'high',
        title: 'Assignment Required',
        description: `${unassignedCommitments.length} commitments need assignment to team members.`,
        action: 'Assign responsible parties to unassigned commitments',
        commitmentIds: unassignedCommitments.map(c => c.id),
      });
    }

    const lowConfidencePredictions = predictions.filter(p => p.confidence < 0.5);
    if (lowConfidencePredictions.length > predictions.length * 0.3) {
      recommendations.push({
        priority: 'medium',
        title: 'Improve Data Quality',
        description: 'Many predictions have low confidence. Additional data may improve accuracy.',
        action: 'Review and update commitment details for better predictions',
        commitmentIds: lowConfidencePredictions.map(p => p.commitmentId),
      });
    }

    return recommendations;
  }

  /**
   * Generates alert system for critical issues
   */
  _generateAlerts(commitments, predictions) {
    const alerts = [];

    // Critical overdue items
    const overdueCommitments = commitments.filter(c => {
      const dueDate = c.due_date ? new Date(c.due_date) : null;
      if (!dueDate) return false;
      return dueDate < new Date() && c.status !== 'Completed';
    });

    if (overdueCommitments.length > 0) {
      alerts.push({
        type: 'critical',
        title: 'Overdue Commitments',
        message: `${overdueCommitments.length} commitments are past their due dates.`,
        action: 'immediate_review',
        affectedCommitments: overdueCommitments.length,
      });
    }

    // High-risk predictions
    const criticalRiskPredictions = predictions.filter(p => p.score < 0.2);
    if (criticalRiskPredictions.length > 0) {
      alerts.push({
        type: 'warning',
        title: 'Critical Risk Predictions',
        message: `${criticalRiskPredictions.length} commitments have very low fulfillment likelihood.`,
        action: 'escalation_required',
        affectedCommitments: criticalRiskPredictions.length,
      });
    }

    return alerts;
  }

  // ============================================================================
  // UTILITY HELPER METHODS
  // ============================================================================

  _calculateComplianceHealth(avgScore) {
    if (avgScore >= 0.8) return 'excellent';
    if (avgScore >= 0.6) return 'good';
    if (avgScore >= 0.4) return 'fair';
    return 'poor';
  }

  _countEmergencyAlerts(commitments, predictions) {
    let count = 0;

    // Count overdue
    count += commitments.filter(c => {
      const dueDate = c.due_date ? new Date(c.due_date) : null;
      return dueDate && dueDate < new Date() && c.status !== 'Completed';
    }).length;

    // Count critical risk predictions
    count += predictions.filter(p => p.score < 0.2).length;

    return count;
  }

  _calculateBucketRisk(bucket) {
    if (bucket.length === 0) return 0;
    const avgScore = bucket.reduce((sum, item) => sum + item.prediction.score, 0) / bucket.length;
    return 1 - avgScore; // Invert score to represent risk
  }

  _calculateTrend(values) {
    if (values.length < 2) return 'stable';
    const recent = values.slice(0, Math.floor(values.length / 2));
    const older = values.slice(Math.floor(values.length / 2));

    const recentAvg = recent.reduce((sum, val) => sum + val, 0) / recent.length;
    const olderAvg = older.reduce((sum, val) => sum + val, 0) / older.length;

    const change = ((recentAvg - olderAvg) / olderAvg) * 100;

    if (change > 10) return 'improving';
    if (change < -10) return 'declining';
    return 'stable';
  }
}

export default PredictiveAnalyticsService;
