import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { generateStructuredResponse } from '../openai-service';

const router = Router();

// Dropout forecast data models
interface DropoutForecastRequest {
  study_duration: number; // weeks
  num_arms: number; // how many treatment arms (1-4)
  dose_type: string; // oral, injection, infusion, etc.
  indication: string; // disease/condition
  phase: string; // Phase 1, 2, 3, 4
  population: string; // healthy, elderly, pediatric, etc.
  visit_frequency: number; // weeks between visits
  comparator_trials?: string[]; // NCT IDs of comparison trials
  molecule_type?: string; // small molecule, biologics, etc.
  session_id?: string; // for tracking and persistence
}

interface WeeklyDropout {
  week: number;
  dropout_percent: number;
  cumulative_percent: number;
  annotation?: string; // AI explanation for this timepoint
}

interface ComparisonPoint {
  trial_id: string;
  name: string;
  cumulative_dropout: number;
  week: number;
}

interface DropoutForecastResponse {
  weekly_data: WeeklyDropout[];
  summary: string; // AI-generated analysis
  risk_level: 'low' | 'moderate' | 'high' | 'very_high';
  comparison_points: ComparisonPoint[];
  insights: string[]; // Key insights about the dropout pattern
  mitigation_strategies: string[]; // Suggestions to reduce dropout
  expected_completion_rate: number; // Percentage expected to complete
}

// Actual forecast algorithm with CSR database integration
async function generateDropoutForecast(
  request: DropoutForecastRequest
): Promise<DropoutForecastResponse> {
  try {
    // 1. Get real CSR data for similar trials if available
    let comparableCsrData: any[] = [];

    try {
      // Query the database for comparable trials
      const queryResult = await db.execute(sql`
        SELECT 
          r.trial_id, 
          r.title,
          d.dropout_rate,
          d.study_duration
        FROM csr_reports r
        JOIN csr_details d ON r.id = d.report_id
        WHERE 
          d.indication = ${request.indication} 
          AND d.phase = ${request.phase}
          AND d.dropout_rate IS NOT NULL
        LIMIT 10
      `);

      comparableCsrData = queryResult;
    } catch (error) {
      console.error('Error fetching comparable CSR data:', error);
      // Continue with simulation even if CSR data is unavailable
    }

    // 2. Base dropout model (based on empirical patterns from literature)
    const weeklyData: WeeklyDropout[] = [];
    const baseDropoutRates: Record<string, number> = {
      'Phase 1': 0.05,
      'Phase 2': 0.15,
      'Phase 3': 0.18,
      'Phase 4': 0.22,
    };

    // Base rate from phase or default to 0.15
    const baseRate = baseDropoutRates[request.phase] || 0.15;

    // Modifiers based on study parameters
    const doseTypeModifiers: Record<string, number> = {
      oral: 1.0,
      injection: 1.3,
      infusion: 1.5,
      topical: 0.8,
      implant: 1.2,
    };

    const populationModifiers: Record<string, number> = {
      healthy: 0.7,
      elderly: 1.4,
      pediatric: 1.1,
      critical: 1.6,
      chronic: 1.3,
    };

    // Apply modifiers
    const doseModifier = doseTypeModifiers[request.dose_type.toLowerCase()] || 1.0;
    const populationModifier = populationModifiers[request.population.toLowerCase()] || 1.0;
    const armsModifier = 1 + (request.num_arms - 1) * 0.05; // More arms = slightly higher dropout

    // Visit frequency impact (more frequent = more dropout)
    const visitFrequencyModifier =
      request.visit_frequency <= 2 ? 1.2 : request.visit_frequency <= 4 ? 1.0 : 0.9;

    // Calculate adjusted base rate
    const adjustedBaseRate =
      baseRate * doseModifier * populationModifier * armsModifier * visitFrequencyModifier;

    // 3. Generate week-by-week dropout pattern with specific known patterns
    let cumulativeDropout = 0;

    // Create dropout curve with common patterns:
    // - Higher dropout in early weeks (screening failures)
    // - Plateau in middle weeks
    // - Possible increase near end (participant fatigue)

    for (let week = 1; week <= request.study_duration; week++) {
      // Calculate dropout for this specific week
      let weeklyRate;

      if (week === 1) {
        // First visit has highest dropout (screening failures)
        weeklyRate = adjustedBaseRate * 1.5;
      } else if (week < 4) {
        // Early visits still have higher dropout
        weeklyRate = adjustedBaseRate * 1.2;
      } else if (week > request.study_duration * 0.8) {
        // Last 20% of study has increased dropout due to fatigue
        weeklyRate = adjustedBaseRate * 1.1;
      } else {
        // Middle of study more stable
        weeklyRate = adjustedBaseRate * 0.8;
      }

      // Add specific pattern spikes
      if (week % 12 === 0) {
        // Quarterly assessments often have higher dropout
        weeklyRate *= 1.3;
      }

      // Adjust based on real-world CSR data if available
      if (comparableCsrData.length > 0) {
        const similarTrialData = comparableCsrData.filter(csr => csr.study_duration >= week);

        if (similarTrialData.length > 0) {
          // Use real-world data to influence the model
          const avgRealWorldRate =
            similarTrialData.reduce((sum, csr) => sum + csr.dropout_rate / csr.study_duration, 0) /
            similarTrialData.length;

          // Blend model with real-world data (70% model, 30% real-world)
          weeklyRate = weeklyRate * 0.7 + avgRealWorldRate * 0.3;
        }
      }

      // Calculate this week's dropout
      const thisWeekDropout = Math.min(weeklyRate, 0.15); // Cap single week dropout
      cumulativeDropout += thisWeekDropout;

      // Generate annotation for important points
      let annotation;
      if (week === 1) {
        annotation = 'Screening failures and early discontinuations typically peak here';
      } else if (week % 12 === 0) {
        annotation =
          'Quarterly assessment point often shows increased dropout due to procedure burden';
      } else if (week === Math.floor(request.study_duration * 0.8)) {
        annotation = 'Study fatigue typically begins to impact retention at this point';
      }

      weeklyData.push({
        week,
        dropout_percent: Number((thisWeekDropout * 100).toFixed(2)),
        cumulative_percent: Number((cumulativeDropout * 100).toFixed(2)),
        annotation,
      });
    }

    // 4. Process comparable trials for comparison points
    const comparisonPoints: ComparisonPoint[] = [];

    if (comparableCsrData.length > 0) {
      comparableCsrData.forEach((csr, index) => {
        if (index < 5 && csr.dropout_rate) {
          // Limit to 5 comparison points
          comparisonPoints.push({
            trial_id: csr.trial_id || `Comparable-${index + 1}`,
            name: csr.title?.substring(0, 30) || `Similar ${request.indication} trial`,
            cumulative_dropout: Number((csr.dropout_rate * 100).toFixed(2)),
            week: csr.study_duration || request.study_duration,
          });
        }
      });
    }

    // 5. Risk classification
    const finalDropoutRate = weeklyData[weeklyData.length - 1].cumulative_percent;
    let riskLevel: 'low' | 'moderate' | 'high' | 'very_high';

    if (finalDropoutRate < 15) {
      riskLevel = 'low';
    } else if (finalDropoutRate < 25) {
      riskLevel = 'moderate';
    } else if (finalDropoutRate < 35) {
      riskLevel = 'high';
    } else {
      riskLevel = 'very_high';
    }

    // 6. Generate insights and mitigation strategies using AI
    let aiSummary = '';
    let insights: string[] = [];
    let mitigationStrategies: string[] = [];

    try {
      const aiPrompt = `
      Analyze this clinical trial dropout forecast:
      - ${request.phase} study for ${request.indication}
      - ${request.num_arms} treatment arms
      - ${request.dose_type} administration
      - ${request.population} population
      - ${request.study_duration} week duration
      - Predicted dropout rate: ${finalDropoutRate.toFixed(1)}%
      - Risk level: ${riskLevel}
      
      Provide a brief summary of the dropout risk, 3-4 specific insights about the dropout pattern, and 3-4 evidence-based strategies to mitigate dropout risk.
      Format as JSON with fields: summary, insights (array), and mitigationStrategies (array).
      `;

      const aiResponse = await generateStructuredResponse(aiPrompt, {
        model: 'gpt-4o',
        structure: {
          summary: 'string',
          insights: ['string'],
          mitigationStrategies: ['string'],
        },
      });

      // Use the AI-generated insights
      aiSummary = aiResponse.summary || '';
      insights = aiResponse.insights || [];
      mitigationStrategies = aiResponse.mitigationStrategies || [];
    } catch (error) {
      console.error('Error generating AI insights for dropout forecast:', error);

      // Fallback insights if AI generation fails
      aiSummary = `This ${request.phase} study for ${request.indication} has a projected dropout rate of ${finalDropoutRate.toFixed(1)}%, categorized as ${riskLevel} risk.`;
      insights = [
        `Peak dropout periods identified at week 1 and after the 80% study duration mark`,
        `${request.dose_type} administration contributes to the overall dropout pattern`,
        `${request.population} population shows characteristic retention challenges`,
      ];
      mitigationStrategies = [
        'Implement participant engagement strategy focused on critical timepoints',
        'Consider visit schedule optimization to reduce burden on participants',
        'Evaluate site training for retention best practices',
      ];
    }

    // 7. Build and return the comprehensive forecast
    return {
      weekly_data: weeklyData,
      summary: aiSummary,
      risk_level: riskLevel,
      comparison_points: comparisonPoints,
      insights: insights,
      mitigation_strategies: mitigationStrategies,
      expected_completion_rate: 100 - finalDropoutRate,
    };
  } catch (error) {
    console.error('Error in dropout forecast generation:', error);
    throw new Error('Failed to generate dropout forecast');
  }
}

// API endpoint to generate a dropout forecast
router.post('/dropout-forecast', async (req, res) => {
  try {
    const dropoutRequest: DropoutForecastRequest = req.body;

    // Handle the simplified version for the upgraded component
    if (dropoutRequest.duration_weeks && !dropoutRequest.study_duration) {
      // Map the simplified API to the full API
      dropoutRequest.study_duration = dropoutRequest.duration_weeks;
      dropoutRequest.num_arms = dropoutRequest.arms || 2;

      // Set phase to Phase 3 by default if not provided
      if (!dropoutRequest.phase) {
        dropoutRequest.phase = 'Phase 3';
      }

      // Set indication to a default if not provided
      if (!dropoutRequest.indication) {
        dropoutRequest.indication = 'General';
      }

      // Map dose frequency to visit frequency
      if (dropoutRequest.dose_frequency) {
        const doseFreqMapping: Record<string, number> = {
          daily: 1,
          weekly: 4,
          monthly: 12,
        };
        dropoutRequest.visit_frequency = doseFreqMapping[dropoutRequest.dose_frequency] || 4;
      }

      // Map control type to dose type if needed
      if (dropoutRequest.control && !dropoutRequest.dose_type) {
        dropoutRequest.dose_type = 'oral'; // default to oral
      }
    }

    // Validate required fields
    if (!dropoutRequest.study_duration) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameter: study_duration or duration_weeks',
      });
    }

    // Set defaults for optional parameters
    dropoutRequest.num_arms = dropoutRequest.num_arms || 2;
    dropoutRequest.dose_type = dropoutRequest.dose_type || 'oral';
    dropoutRequest.population = dropoutRequest.population || 'adult';
    dropoutRequest.visit_frequency = dropoutRequest.visit_frequency || 4;
    dropoutRequest.indication = dropoutRequest.indication || 'General';
    dropoutRequest.phase = dropoutRequest.phase || 'Phase 3';

    const forecast = await generateDropoutForecast(dropoutRequest);

    // Save to session memory if session_id is provided
    const session_id = dropoutRequest.session_id;
    if (session_id) {
      try {
        // 1. First, save to the database for analytics
        await db.execute(sql`
          INSERT INTO analytics_forecasts (
            session_id, 
            forecast_type, 
            request_params, 
            forecast_result, 
            created_at
          ) VALUES (
            ${session_id},
            'dropout',
            ${JSON.stringify(dropoutRequest)},
            ${JSON.stringify(forecast)},
            NOW()
          )
        `);

        // 2. Then, save to session memory filesystem
        const fs = require('fs');
        const path = require('path');

        // Create the sessions directory if it doesn't exist
        const sessionsDir = path.join(process.cwd(), 'sessions');
        if (!fs.existsSync(sessionsDir)) {
          fs.mkdirSync(sessionsDir, { recursive: true });
        }

        // Create the session-specific directory if it doesn't exist
        const sessionDir = path.join(sessionsDir, session_id);
        if (!fs.existsSync(sessionDir)) {
          fs.mkdirSync(sessionDir, { recursive: true });
        }

        // Format the data for simplified component
        const simplifiedForecast = forecast.weekly_data.map(week => ({
          week: week.week,
          predicted_dropout: week.cumulative_percent / 100, // Convert back to decimal
        }));

        // Save standard forecast data to session memory
        const forecastPath = path.join(sessionDir, 'dropout_forecast.json');
        fs.writeFileSync(
          forecastPath,
          JSON.stringify(
            {
              timestamp: new Date().toISOString(),
              parameters: dropoutRequest,
              forecast: simplifiedForecast,
              summary: forecast.summary,
              risk_level: forecast.risk_level,
              expected_completion_rate: forecast.expected_completion_rate,
              insights: forecast.insights,
              mitigation_strategies: forecast.mitigation_strategies,
            },
            null,
            2
          )
        );

        console.log(`Saved dropout forecast to session memory: ${forecastPath}`);
      } catch (error) {
        console.warn('Error saving dropout forecast to session memory:', error);
        // Continue - saving to session memory is non-critical
      }
    }

    // Format the response for simplified component
    if (dropoutRequest.duration_weeks) {
      // Simple response format for upgraded component
      const simpleForecast = forecast.weekly_data.map(week => ({
        week: week.week,
        predicted_dropout: week.cumulative_percent / 100, // Convert back to decimal
      }));

      return res.json({
        success: true,
        forecast: simpleForecast,
        summary: forecast.summary,
      });
    }

    // Standard response format
    res.json({
      success: true,
      forecast,
    });
  } catch (error) {
    console.error('Error in dropout-forecast endpoint:', error);
    res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : 'An error occurred generating the dropout forecast',
    });
  }
});

// Get historical forecasts for a session
router.get('/dropout-forecast/history/:session_id', async (req, res) => {
  try {
    const { session_id } = req.params;

    if (!session_id) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required',
      });
    }

    const history = await db.execute(sql`
      SELECT id, session_id, forecast_type, request_params, forecast_result, created_at
      FROM analytics_forecasts
      WHERE session_id = ${session_id} AND forecast_type = 'dropout'
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      history,
    });
  } catch (error) {
    console.error('Error retrieving dropout forecast history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve forecast history',
    });
  }
});

export default router;
