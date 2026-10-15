import { db } from './db';
import { csrReports, csrDetails } from 'shared/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';

/**
 * CSR descriptive statistics for the report generators.
 *
 * This service serves descriptive aggregates over the CSR library — per
 * indication, per phase, combined, per endpoint, and a competitive landscape —
 * to server/services/report-generator-service.ts and
 * server/strategic-report-generator.ts. Those getters are its only callers.
 *
 * 2026-10-05: the inferential methods that used to live here (power and sample
 * size, non-inferiority sizing, adaptive / survival / virtual-trial simulation,
 * log-rank and hazard ratio, Bayesian predictive probability, pairwise and
 * network meta-analysis, prediction-model evaluation, and the module-level
 * wrapper functions) were removed. None had a production caller, and several
 * were numerically wrong (e.g. the Schoenfeld event count used a factor of 2
 * instead of 4, halving the required events). The canonical statistics engine
 * is server/services/stats/*; do not re-add inferential statistics here.
 */
export class StatisticsService {
  /**
   * Get statistics for a specific indication
   */
  async getIndication(indication: string): Promise<any> {
    try {
      const dbInstance = db;
      if (!dbInstance) {
        return {
          indication,
          count: 0,
          phases: {},
          success_rate: null,
          error: 'Database unavailable',
        };
      }

      const reports = await dbInstance
        .select({
          id: csrReports.id,
          title: csrReports.title,
          phase: csrReports.phase,
          status: csrReports.status,
        })
        .from(csrReports)
        .where(eq(csrReports.indication, indication));

      if (reports.length === 0) {
        return {
          indication,
          count: 0,
          phases: {},
          success_rate: null,
        };
      }

      const reportIds = reports.map(r => r.id);

      // Get details for all reports of this indication
      const details = (await dbInstance
        .select()
        .from(csrDetails)
        .where(inArray(csrDetails.reportId, reportIds))) as any[];

      // Count studies by phase
      const phaseCount: Record<string, number> = {};
      reports.forEach(report => {
        const phaseKey = report.phase ?? 'Unknown';
        phaseCount[phaseKey] = (phaseCount[phaseKey] || 0) + 1;
      });

      // Calculate success rate
      const successfulTrials = reports.filter(
        r => r.status.toLowerCase() === 'completed' || r.status.toLowerCase() === 'successful'
      ).length;

      const successRate = reports.length > 0 ? successfulTrials / reports.length : 0;

      // Calculate average sample size
      const sampleSizes = details
        .filter(
          (d): d is typeof d & { sampleSize: number } => d.sampleSize !== null && d.sampleSize > 0
        )
        .map(d => d.sampleSize);

      const avgSampleSize =
        sampleSizes.length > 0
          ? sampleSizes.reduce((sum, size) => sum + size, 0) / sampleSizes.length
          : null;

      return {
        indication,
        count: reports.length,
        phases: phaseCount,
        success_rate: successRate,
        avg_sample_size: avgSampleSize,
        reports: reports.map(r => ({ id: r.id, title: r.title, phase: r.phase })),
      };
    } catch (error) {
      console.error(`Error getting indication stats for ${indication}:`, error);
      return {
        indication,
        count: 0,
        phases: {},
        success_rate: null,
        error: 'Failed to retrieve statistics',
      };
    }
  }

  /**
   * Get statistics for a specific phase across all indications
   */
  async getPhaseStatistics(phase: string): Promise<any> {
    try {
      const dbInstance = db;
      if (!dbInstance) {
        return {
          phase,
          count: 0,
          indications: {},
          success_rate: null,
          error: 'Database unavailable',
        };
      }

      const reports = await dbInstance
        .select({
          id: csrReports.id,
          indication: csrReports.indication,
          status: csrReports.status,
          durationWeeks: csrReports.durationWeeks,
        })
        .from(csrReports)
        .where(eq(csrReports.phase, phase));

      if (reports.length === 0) {
        return {
          phase,
          count: 0,
          indications: {},
          success_rate: null,
        };
      }

      const reportIds = reports.map(r => r.id);

      // Get details for all reports of this phase
      const details = (await dbInstance
        .select()
        .from(csrDetails)
        .where(inArray(csrDetails.reportId, reportIds))) as any[];

      // Count studies by indication
      const indicationCount: Record<string, number> = {};
      reports.forEach(report => {
        const indicationKey = report.indication ?? 'Unknown';
        indicationCount[indicationKey] = (indicationCount[indicationKey] || 0) + 1;
      });

      // Calculate success rate
      const successfulTrials = reports.filter(
        r => r.status.toLowerCase() === 'completed' || r.status.toLowerCase() === 'successful'
      ).length;

      const successRate = reports.length > 0 ? successfulTrials / reports.length : 0;

      // Calculate average sample size
      const sampleSizes = details
        .filter(
          (d): d is typeof d & { sampleSize: number } => d.sampleSize !== null && d.sampleSize > 0
        )
        .map(d => d.sampleSize);

      const avgSampleSize =
        sampleSizes.length > 0
          ? sampleSizes.reduce((sum, size) => sum + size, 0) / sampleSizes.length
          : null;

      // Calculate median duration
      const durations = reports
        .filter(
          (report): report is typeof report & { durationWeeks: number } =>
            report.durationWeeks !== null && report.durationWeeks > 0
        )
        .map(report => report.durationWeeks);

      const medianDuration = durations.length > 0 ? this.calculateMedian(durations) : null;

      return {
        phase,
        count: reports.length,
        indications: indicationCount,
        success_rate: successRate,
        avg_sample_size: avgSampleSize,
        median_duration_weeks: medianDuration,
      };
    } catch (error) {
      console.error(`Error getting phase stats for ${phase}:`, error);
      return {
        phase,
        count: 0,
        indications: {},
        success_rate: null,
        error: 'Failed to retrieve statistics',
      };
    }
  }

  /**
   * Get combined statistics for a specific indication and phase
   */
  async getCombinedStatistics(params: { indication: string; phase: string }): Promise<any> {
    try {
      const { indication, phase } = params;

      const dbInstance = db;
      if (!dbInstance) {
        return {
          indication,
          phase,
          totalTrials: 0,
          successRate: null,
          sampleSizeMean: null,
          sampleSizeMedian: null,
          sampleSizeRange: null,
          durationMean: null,
          durationMedian: null,
          durationRange: null,
          dropoutRateMean: null,
          dropoutRateMedian: null,
          dropoutRateRange: null,
          commonDesigns: [],
          error: 'Database unavailable',
        };
      }

      const reports = await dbInstance
        .select({
          id: csrReports.id,
          title: csrReports.title,
          status: csrReports.status,
          durationWeeks: csrReports.durationWeeks,
        })
        .from(csrReports)
        .where(and(eq(csrReports.indication, indication), eq(csrReports.phase, phase)));

      if (reports.length === 0) {
        return {
          indication,
          phase,
          totalTrials: 0,
          successRate: null,
          sampleSizeMean: null,
          sampleSizeMedian: null,
          sampleSizeRange: null,
          durationMean: null,
          durationMedian: null,
          durationRange: null,
          dropoutRateMean: null,
          dropoutRateMedian: null,
          dropoutRateRange: null,
          commonDesigns: [],
        };
      }

      const reportIds = reports.map(r => r.id);

      // Get details for all reports
      const details = await dbInstance
        .select()
        .from(csrDetails)
        .where(inArray(csrDetails.reportId, reportIds));

      // Calculate success rate
      const successfulTrials = reports.filter(
        r => r.status.toLowerCase() === 'completed' || r.status.toLowerCase() === 'successful'
      ).length;

      const successRate = reports.length > 0 ? successfulTrials / reports.length : 0;

      // Sample size statistics
      const sampleSizes = details
        .filter(
          (d): d is typeof d & { sampleSize: number } => d.sampleSize !== null && d.sampleSize > 0
        )
        .map(d => d.sampleSize);

      const sampleSizeMean =
        sampleSizes.length > 0
          ? sampleSizes.reduce((sum, size) => sum + size, 0) / sampleSizes.length
          : null;

      const sampleSizeMedian = sampleSizes.length > 0 ? this.calculateMedian(sampleSizes) : null;

      const sampleSizeRange =
        sampleSizes.length > 0 ? [Math.min(...sampleSizes), Math.max(...sampleSizes)] : null;

      // Duration statistics
      const durations = reports
        .filter(
          (report): report is typeof report & { durationWeeks: number } =>
            report.durationWeeks !== null && report.durationWeeks > 0
        )
        .map(report => report.durationWeeks);

      const durationMean =
        durations.length > 0
          ? durations.reduce((sum, dur) => sum + dur, 0) / durations.length
          : null;

      const durationMedian = durations.length > 0 ? this.calculateMedian(durations) : null;

      const durationRange =
        durations.length > 0 ? [Math.min(...durations), Math.max(...durations)] : null;

      // Dropout rate statistics
      const dropoutRates = details
        .map(detail => {
          const completionRate = this.extractCompletionRate(detail);
          return completionRate === null ? null : 1 - completionRate / 100;
        })
        .filter((rate): rate is number => rate !== null);

      const dropoutRateMean =
        dropoutRates.length > 0
          ? dropoutRates.reduce((sum, rate) => sum + rate, 0) / dropoutRates.length
          : null;

      const dropoutRateMedian = dropoutRates.length > 0 ? this.calculateMedian(dropoutRates) : null;

      const dropoutRateRange =
        dropoutRates.length > 0 ? [Math.min(...dropoutRates), Math.max(...dropoutRates)] : null;

      // Common study designs
      const designCounts: Record<string, number> = {};
      details.forEach(detail => {
        if (detail.studyDesign) {
          const design = detail.studyDesign;
          designCounts[design] = (designCounts[design] || 0) + 1;
        }
      });

      const commonDesigns = Object.entries(designCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([design, count]) => ({
          design,
          count,
          percentage: (count / details.length) * 100,
        }));

      return {
        indication,
        phase,
        totalTrials: reports.length,
        successRate,
        sampleSizeMean,
        sampleSizeMedian,
        sampleSizeRange,
        durationMean,
        durationMedian,
        durationRange,
        dropoutRateMean,
        dropoutRateMedian,
        dropoutRateRange,
        commonDesigns,
      };
    } catch (error) {
      console.error(
        `Error getting combined stats for ${params.indication} Phase ${params.phase}:`,
        error
      );
      return {
        indication: params.indication,
        phase: params.phase,
        totalTrials: 0,
        successRate: null,
        error: 'Failed to retrieve statistics',
      };
    }
  }

  /**
   * Get endpoint statistics for a specific indication and phase
   */
  async getEndpointStatistics(params: { indication: string; phase: string }): Promise<any> {
    try {
      const { indication, phase } = params;

      const dbInstance = db;
      if (!dbInstance) {
        return {
          indication,
          phase,
          totalTrials: 0,
          commonEndpoints: [],
          endpointSuccessFactors: [],
          error: 'Database unavailable',
        };
      }

      const reports = await dbInstance
        .select({
          id: csrReports.id,
          status: csrReports.status,
        })
        .from(csrReports)
        .where(and(eq(csrReports.indication, indication), eq(csrReports.phase, phase)));

      if (reports.length === 0) {
        return {
          indication,
          phase,
          totalTrials: 0,
          commonEndpoints: [],
          endpointSuccessFactors: [],
        };
      }

      const reportIds = reports.map(r => r.id);

      // Get details for all reports
      const details = await dbInstance
        .select()
        .from(csrDetails)
        .where(inArray(csrDetails.reportId, reportIds));

      // Extract endpoints from details
      const endpointMap = new Map<
        string,
        {
          count: number;
          successCount: number;
          trialIds: number[];
        }
      >();

      details.forEach(detail => {
        try {
          // First try to parse endpoints as JSON
          let endpoints: any[] = [];

          if (detail.endpoints) {
            if (typeof detail.endpoints === 'string') {
              try {
                endpoints = JSON.parse(detail.endpoints);
              } catch (e) {
                // Not valid JSON, try to extract from text
                const endpointText = detail.endpoints;
                // Simple extraction of potential endpoints from text
                const lines = endpointText
                  .split('\n')
                  .filter(
                    line =>
                      line.includes('endpoint') ||
                      line.includes('outcome') ||
                      line.includes('measure')
                  );

                endpoints = lines.map(line => ({ name: line.trim() }));
              }
            } else if (Array.isArray(detail.endpoints)) {
              endpoints = detail.endpoints;
            } else if (typeof detail.endpoints === 'object') {
              // Try to extract from object structure
              const endpointObj = detail.endpoints as any;

              if (endpointObj.primary) {
                if (Array.isArray(endpointObj.primary)) {
                  endpoints = [...endpoints, ...endpointObj.primary];
                } else {
                  endpoints.push({ name: endpointObj.primary });
                }
              }

              if (endpointObj.secondary) {
                if (Array.isArray(endpointObj.secondary)) {
                  endpoints = [...endpoints, ...endpointObj.secondary];
                } else {
                  endpoints.push({ name: endpointObj.secondary });
                }
              }
            }
          }

          // Process each endpoint
          endpoints.forEach(endpoint => {
            let endpointName = '';

            if (typeof endpoint === 'string') {
              endpointName = endpoint;
            } else if (endpoint && endpoint.name) {
              endpointName = endpoint.name;
            } else if (endpoint && endpoint.description) {
              endpointName = endpoint.description;
            }

            if (endpointName) {
              // Normalize endpoint name
              endpointName = endpointName
                .replace(/primary endpoint:?/i, '')
                .replace(/secondary endpoint:?/i, '')
                .trim();

              // Update endpoint statistics
              if (!endpointMap.has(endpointName)) {
                endpointMap.set(endpointName, {
                  count: 0,
                  successCount: 0,
                  trialIds: [],
                });
              }

              const stats = endpointMap.get(endpointName)!;
              stats.count++;
              stats.trialIds.push(detail.reportId);

              // Check if trial was successful
              const report = reports.find(r => r.id === detail.reportId);
              if (
                report &&
                (report.status.toLowerCase() === 'completed' ||
                  report.status.toLowerCase() === 'successful')
              ) {
                stats.successCount++;
              }
            }
          });
        } catch (e) {
          console.error('Error processing endpoints:', e);
        }
      });

      // Convert to array and sort by frequency
      const commonEndpoints = Array.from(endpointMap.entries())
        .map(([name, stats]) => ({
          name,
          frequency: stats.count,
          percentage: (stats.count / details.length) * 100,
          successRate: stats.count > 0 ? stats.successCount / stats.count : 0,
        }))
        .sort((a, b) => b.frequency - a.frequency);

      // Analyze factors that correlate with endpoint success
      const endpointSuccessFactors = this.analyzeEndpointSuccessFactors(details, reports);

      return {
        indication,
        phase,
        totalTrials: reports.length,
        commonEndpoints,
        endpointSuccessFactors,
      };
    } catch (error) {
      console.error(
        `Error getting endpoint stats for ${params.indication} Phase ${params.phase}:`,
        error
      );
      return {
        indication: params.indication,
        phase: params.phase,
        totalTrials: 0,
        commonEndpoints: [],
        endpointSuccessFactors: [],
      };
    }
  }

  /**
   * Analyze what factors correlate with endpoint success
   */
  private analyzeEndpointSuccessFactors(details: any[], reports: any[]): any[] {
    const factors = [];

    // Map report IDs to success status
    const reportSuccessMap = new Map<number, boolean>();
    reports.forEach(report => {
      reportSuccessMap.set(
        report.id,
        report.status.toLowerCase() === 'completed' || report.status.toLowerCase() === 'successful'
      );
    });

    // Sample size correlation
    const successSampleSizes = details
      .filter(d => d.sampleSize && reportSuccessMap.get(d.reportId))
      .map(d => d.sampleSize);

    const failureSampleSizes = details
      .filter(d => d.sampleSize && !reportSuccessMap.get(d.reportId))
      .map(d => d.sampleSize);

    if (successSampleSizes.length > 0 && failureSampleSizes.length > 0) {
      const avgSuccessSampleSize =
        successSampleSizes.reduce((sum, size) => sum + size, 0) / successSampleSizes.length;

      const avgFailureSampleSize =
        failureSampleSizes.reduce((sum, size) => sum + size, 0) / failureSampleSizes.length;

      const sampleSizeDiff = avgSuccessSampleSize - avgFailureSampleSize;

      if (Math.abs(sampleSizeDiff) > 10) {
        factors.push({
          factor: 'Sample Size',
          description:
            sampleSizeDiff > 0
              ? `Successful trials had larger sample sizes (avg: ${Math.round(avgSuccessSampleSize)} vs ${Math.round(avgFailureSampleSize)})`
              : `Successful trials had smaller sample sizes (avg: ${Math.round(avgSuccessSampleSize)} vs ${Math.round(avgFailureSampleSize)})`,
          confidence: Math.min(0.9, 0.5 + Math.abs(sampleSizeDiff) / 200),
        });
      }
    }

    // Study design correlation
    const designSuccessMap = new Map<string, { success: number; total: number }>();

    details.forEach(detail => {
      if (detail.studyDesign) {
        const design = detail.studyDesign;

        if (!designSuccessMap.has(design)) {
          designSuccessMap.set(design, { success: 0, total: 0 });
        }

        const stats = designSuccessMap.get(design)!;
        stats.total++;

        if (reportSuccessMap.get(detail.reportId)) {
          stats.success++;
        }
      }
    });

    // Find designs with significantly higher success rates
    const overallSuccessRate =
      reports.filter(r => reportSuccessMap.get(r.id)).length / reports.length;

    designSuccessMap.forEach((stats, design) => {
      if (stats.total >= 3) {
        // Only consider designs used in at least 3 trials
        const designSuccessRate = stats.success / stats.total;
        const successRateDiff = designSuccessRate - overallSuccessRate;

        if (successRateDiff > 0.1) {
          // At least 10% better success rate
          factors.push({
            factor: 'Study Design',
            description: `"${design}" design shows higher success rate (${Math.round(designSuccessRate * 100)}% vs ${Math.round(overallSuccessRate * 100)}%)`,
            confidence: Math.min(0.9, 0.5 + stats.total / 10), // More confidence with more trials
          });
        }
      }
    });

    // Add general guidance based on literature if we don't have enough factors
    if (factors.length < 2) {
      factors.push({
        factor: 'Endpoint Specificity',
        description:
          'More specific and objectively measurable endpoints tend to show higher success rates',
        confidence: 0.7,
      });

      factors.push({
        factor: 'Endpoint Selection',
        description:
          'Endpoints with established precedent in regulatory approvals have higher success rates',
        confidence: 0.8,
      });
    }

    return factors;
  }

  /**
   * Get competitive analysis for a specific indication and phase
   */
  async getCompetitiveAnalysis(params: { indication: string; phase: string }): Promise<any> {
    try {
      const { indication, phase } = params;

      const dbInstance = db;
      if (!dbInstance) {
        return {
          indication,
          phase,
          topSponsors: [],
          recentTrials: [],
          trendingEndpoints: [],
          emergingDesigns: [],
          marketInsights: [],
          error: 'Database unavailable',
        };
      }

      // Get all trials for this indication, not just the specific phase
      const indicationReports = await dbInstance
        .select({
          id: csrReports.id,
          title: csrReports.title,
          phase: csrReports.phase,
          sponsor: csrReports.sponsor,
          uploadDate: csrReports.uploadDate,
          status: csrReports.status,
          date: csrReports.reportDate,
        })
        .from(csrReports)
        .where(eq(csrReports.indication, indication))
        .orderBy(desc(csrReports.uploadDate));

      if (indicationReports.length === 0) {
        return {
          indication,
          phase,
          topSponsors: [],
          recentTrials: [],
          trendingEndpoints: [],
          emergingDesigns: [],
          marketInsights: [],
        };
      }

      // Get reports for the specific phase
      const phaseReports = indicationReports.filter(r => r.phase === phase);

      // Calculate top sponsors by trial count
      const sponsorCounts: Record<string, number> = {};
      indicationReports.forEach(report => {
        const sponsorKey = report.sponsor ?? 'Unknown';
        sponsorCounts[sponsorKey] = (sponsorCounts[sponsorKey] || 0) + 1;
      });

      const topSponsors = Object.entries(sponsorCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([sponsor, count]) => ({
          sponsor,
          trialCount: count,
          percentage: (count / indicationReports.length) * 100,
        }));

      // Get recent trials for the specific phase
      const recentTrials = phaseReports.slice(0, 5).map(report => ({
        id: report.id,
        title: report.title,
        sponsor: report.sponsor,
        date: report.date || 'Unknown date',
        status: report.status,
      }));

      // Find trending endpoints and emerging designs
      const allReportIds = indicationReports.map(r => r.id);

      // Get details for all reports
      const details = await dbInstance
        .select()
        .from(csrDetails)
        .where(inArray(csrDetails.reportId, allReportIds));

      // Find trending endpoints
      const trendingEndpoints = this.findTrendingEndpoints(details, indicationReports);

      // Find emerging designs
      const emergingDesigns = this.findEmergingDesigns(details, indicationReports);

      // Generate market insights
      const marketInsights = this.generateMarketInsights(indicationReports, phaseReports, details);

      return {
        indication,
        phase,
        topSponsors,
        recentTrials,
        trendingEndpoints,
        emergingDesigns,
        marketInsights,
      };
    } catch (error) {
      console.error(
        `Error getting competitive analysis for ${params.indication} Phase ${params.phase}:`,
        error
      );
      return {
        indication: params.indication,
        phase: params.phase,
        topSponsors: [],
        recentTrials: [],
        trendingEndpoints: [],
        emergingDesigns: [],
        marketInsights: [],
      };
    }
  }

  /**
   * Find trending endpoints based on recent trial data
   */
  private findTrendingEndpoints(details: any[], reports: any[]): any[] {
    // Sort reports by date (newest first)
    const sortedReports = [...reports].sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      return dateB - dateA;
    });

    // Split into recent (newest 30%) and older trials
    const splitPoint = Math.max(2, Math.floor(sortedReports.length * 0.3));
    const recentReports = sortedReports.slice(0, splitPoint);
    const olderReports = sortedReports.slice(splitPoint);

    const recentReportIds = new Set(recentReports.map(r => r.id));

    // Extract endpoints from recent and older trials
    const recentEndpoints = new Map<string, number>();
    const olderEndpoints = new Map<string, number>();

    details.forEach(detail => {
      try {
        const isRecent = recentReportIds.has(detail.reportId);
        const endpointTarget = isRecent ? recentEndpoints : olderEndpoints;

        // Extract endpoints from this trial
        let endpoints: string[] = [];

        if (detail.endpoints) {
          if (typeof detail.endpoints === 'string') {
            try {
              const parsedEndpoints = JSON.parse(detail.endpoints);
              if (Array.isArray(parsedEndpoints)) {
                endpoints = parsedEndpoints.map(e =>
                  typeof e === 'string' ? e : e.name || e.description || ''
                );
              } else {
                // Extract from text
                const lines = detail.endpoints
                  .split('\n')
                  .filter(
                    (line: string) =>
                      line.includes('endpoint') ||
                      line.includes('outcome') ||
                      line.includes('measure')
                  );
                endpoints = lines.map((line: string) => line.trim());
              }
            } catch (e) {
              // Not valid JSON, use as text
              endpoints = [detail.endpoints];
            }
          } else if (Array.isArray(detail.endpoints)) {
            endpoints = detail.endpoints.map((e: any) =>
              typeof e === 'string' ? e : e.name || e.description || ''
            );
          } else if (typeof detail.endpoints === 'object') {
            // Try to extract from object structure
            const endpointObj = detail.endpoints as any;

            if (endpointObj.primary) {
              if (Array.isArray(endpointObj.primary)) {
                endpoints = [
                  ...endpoints,
                  ...endpointObj.primary.map((e: any) =>
                    typeof e === 'string' ? e : e.name || e.description || ''
                  ),
                ];
              } else {
                endpoints.push(
                  typeof endpointObj.primary === 'string' ? endpointObj.primary : 'Primary endpoint'
                );
              }
            }

            if (endpointObj.secondary) {
              if (Array.isArray(endpointObj.secondary)) {
                endpoints = [
                  ...endpoints,
                  ...endpointObj.secondary.map((e: any) =>
                    typeof e === 'string' ? e : e.name || e.description || ''
                  ),
                ];
              } else {
                endpoints.push(
                  typeof endpointObj.secondary === 'string'
                    ? endpointObj.secondary
                    : 'Secondary endpoint'
                );
              }
            }
          }
        }

        // Count each endpoint
        endpoints.forEach(endpoint => {
          if (endpoint && typeof endpoint === 'string') {
            const normalizedEndpoint = endpoint
              .replace(/primary endpoint:?/i, '')
              .replace(/secondary endpoint:?/i, '')
              .trim();

            if (normalizedEndpoint) {
              endpointTarget.set(
                normalizedEndpoint,
                (endpointTarget.get(normalizedEndpoint) || 0) + 1
              );
            }
          }
        });
      } catch (e) {
        console.error('Error extracting endpoints:', e);
      }
    });

    // Calculate growth rate for each endpoint
    const endpointGrowth: {
      endpoint: string;
      recentFrequency: number;
      olderFrequency: number;
      growthRate: number;
    }[] = [];

    recentEndpoints.forEach((recentCount, endpoint) => {
      const olderCount = olderEndpoints.get(endpoint) || 0;

      // Adjust count to per-trial basis for fair comparison
      const recentFrequency = recentCount / Math.max(1, recentReports.length);
      const olderFrequency = olderCount / Math.max(1, olderReports.length);

      // Calculate growth rate
      // Add small value to avoid division by 0
      const growthRate = (recentFrequency - olderFrequency) / (olderFrequency + 0.01);

      endpointGrowth.push({
        endpoint,
        recentFrequency,
        olderFrequency,
        growthRate,
      });
    });

    // Also consider new endpoints that weren't in older trials
    recentEndpoints.forEach((recentCount, endpoint) => {
      if (!olderEndpoints.has(endpoint)) {
        const recentFrequency = recentCount / Math.max(1, recentReports.length);

        endpointGrowth.push({
          endpoint,
          recentFrequency,
          olderFrequency: 0,
          growthRate: 1.0, // 100% growth since it's new
        });
      }
    });

    // Sort by growth rate and select top trending endpoints
    return endpointGrowth
      .filter(item => item.recentFrequency >= 0.2) // Must appear in at least 20% of recent trials
      .sort((a, b) => b.growthRate - a.growthRate)
      .slice(0, 5)
      .map(item => ({
        endpoint: item.endpoint,
        growthRate: item.growthRate,
        trend:
          item.growthRate > 0.5
            ? 'Strongly increasing'
            : item.growthRate > 0.1
              ? 'Increasing'
              : item.growthRate > -0.1
                ? 'Stable'
                : 'Decreasing',
      }));
  }

  /**
   * Find emerging study designs based on recent trial data
   */
  private findEmergingDesigns(details: any[], reports: any[]): string[] {
    // Sort reports by date (newest first)
    const sortedReports = [...reports].sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      return dateB - dateA;
    });

    // Split into recent (newest 30%) and older trials
    const splitPoint = Math.max(2, Math.floor(sortedReports.length * 0.3));
    const recentReports = sortedReports.slice(0, splitPoint);

    const recentReportIds = new Set(recentReports.map(r => r.id));

    // Extract designs from recent trials
    const recentDesignCounts = new Map<string, number>();

    details.forEach(detail => {
      if (detail.studyDesign && recentReportIds.has(detail.reportId)) {
        const design = detail.studyDesign;
        recentDesignCounts.set(design, (recentDesignCounts.get(design) || 0) + 1);
      }
    });

    // Convert to array, sort by frequency, and select top designs
    return Array.from(recentDesignCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([design]) => design);
  }

  /**
   * Generate market insights based on trial data
   */
  private generateMarketInsights(allReports: any[], phaseReports: any[], details: any[]): string[] {
    const insights: string[] = [];

    // Only proceed if we have enough data
    if (allReports.length < 3) {
      return ['Insufficient data to generate reliable market insights'];
    }

    // Calculate phase distribution
    const phaseCounts: Record<string, number> = {};
    allReports.forEach(report => {
      const phase = report.phase;
      phaseCounts[phase] = (phaseCounts[phase] || 0) + 1;
    });

    const totalReports = allReports.length;
    const phaseDistribution = Object.entries(phaseCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([phase, count]) => ({
        phase,
        count,
        percentage: (count / totalReports) * 100,
      }));

    // Get top phase
    const topPhase = phaseDistribution[0];
    if (topPhase) {
      insights.push(
        `${Math.round(topPhase.percentage)}% of trials for this indication are in ${topPhase.phase}, indicating current research focus`
      );
    }

    // Calculate sponsor concentration
    const sponsorCounts: Record<string, number> = {};
    allReports.forEach(report => {
      const sponsor = report.sponsor;
      sponsorCounts[sponsor] = (sponsorCounts[sponsor] || 0) + 1;
    });

    const sponsorCount = Object.keys(sponsorCounts).length;
    const topSponsorTrials = Math.max(...Object.values(sponsorCounts));
    const sponsorConcentration = topSponsorTrials / totalReports;

    if (sponsorCount > 5 && sponsorConcentration < 0.3) {
      insights.push(
        `Highly competitive landscape with ${sponsorCount} different sponsors and no dominant player (top sponsor has only ${Math.round(sponsorConcentration * 100)}% market share)`
      );
    } else if (sponsorConcentration > 0.5) {
      const topSponsor = Object.entries(sponsorCounts).sort((a, b) => b[1] - a[1])[0][0];

      insights.push(
        `Market dominated by ${topSponsor} with ${Math.round(sponsorConcentration * 100)}% of trials in this indication`
      );
    }

    // Analyze trial success rates if we have sufficient data
    const completedTrials = allReports.filter(
      r => r.status.toLowerCase() === 'completed' || r.status.toLowerCase() === 'successful'
    );

    if (completedTrials.length >= 5) {
      const successRate = completedTrials.length / allReports.length;

      if (successRate < 0.3) {
        insights.push(
          `Low historical success rate (${Math.round(successRate * 100)}%) suggests high risk for this indication`
        );
      } else if (successRate > 0.6) {
        insights.push(
          `High historical success rate (${Math.round(successRate * 100)}%) suggests favorable development outlook`
        );
      }
    }

    // Look for trends in study designs
    const designCounts: Record<string, number> = {};
    details.forEach(detail => {
      if (detail.studyDesign) {
        const design = detail.studyDesign;
        designCounts[design] = (designCounts[design] || 0) + 1;
      }
    });

    const topDesign = Object.entries(designCounts).sort((a, b) => b[1] - a[1])[0];

    if (topDesign && topDesign[1] > 3) {
      insights.push(
        `"${topDesign[0]}" is the predominant study design, used in ${topDesign[1]} trials for this indication`
      );
    }

    // Add an insight about trial recency if relevant
    const recentTrialsCount = allReports.filter(r => {
      if (!r.date) return false;
      const trialDate = new Date(r.date);
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      return trialDate >= twoYearsAgo;
    }).length;

    const recentTrialPercentage = recentTrialsCount / allReports.length;

    if (recentTrialPercentage > 0.4) {
      insights.push(
        `High recent trial activity (${Math.round(recentTrialPercentage * 100)}% of trials initiated in past 2 years) indicates strong current interest`
      );
    } else if (recentTrialPercentage < 0.1 && allReports.length > 10) {
      insights.push(
        `Low recent trial activity may indicate decreasing interest or research challenges in this space`
      );
    }

    return insights;
  }

  /**
   * Calculate median of an array of numbers
   */
  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      return (sorted[middle - 1] + sorted[middle]) / 2;
    } else {
      return sorted[middle];
    }
  }

  private extractCompletionRate(detail: {
    completionRate?: number | string | null;
    metadata?: unknown;
  }): number | null {
    const direct = detail.completionRate;
    if (direct !== null && direct !== undefined) {
      const parsed = typeof direct === 'number' ? direct : parseFloat(String(direct));
      return Number.isFinite(parsed) ? parsed : null;
    }

    const metadata = detail.metadata;
    if (metadata && typeof metadata === 'object' && 'completionRate' in metadata) {
      const value = (metadata as { completionRate?: unknown }).completionRate;
      if (value !== null && value !== undefined) {
        const parsed = typeof value === 'number' ? value : parseFloat(String(value));
        return Number.isFinite(parsed) ? parsed : null;
      }
    }

    return null;
  }
}

export const statisticsService = new StatisticsService();
