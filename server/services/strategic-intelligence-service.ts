import { db } from '../db';
import { eq, like, and, or, not, isNull } from 'drizzle-orm';
import { csrReports, csrDetails } from 'shared/schema';
import type { IntelligenceSummary, WeeklyBrief } from 'shared/types/intelligence';

type HuggingFaceService = {
  generateContentWithContext(prompt: string, context: string): Promise<string>;
};

/**
 * Strategic Intelligence Service
 * Generates intelligence insights and analysis using real CSR data
 */
export class StrategicIntelligenceService {
  private huggingfaceService: HuggingFaceService;

  private getDb() {
    if (!db) {
      throw new Error('Database unavailable');
    }
    return db;
  }

  constructor(huggingfaceService: HuggingFaceService) {
    this.huggingfaceService = huggingfaceService;
  }

  /**
   * Generate a weekly intelligence brief for a specific indication
   * @param indication The therapeutic indication to analyze
   * @returns Weekly intelligence brief with insights and recommendations
   */
  async generateWeeklyBrief(indication: string): Promise<WeeklyBrief> {
    try {
      // Get the intelligence summary data
      const summary = await this.getIntelligenceSummary(indication);

      // Format the data for the AI model
      const promptData = this.formatSummaryForBriefGeneration(summary);

      // Generate the weekly brief using the Hugging Face model
      const rawBrief = await this.huggingfaceService.generateContentWithContext(
        'Generate a concise weekly intelligence brief for clinical trials in the specified therapeutic area. ' +
          'Include key insights, emerging trends, and strategic recommendations based on the data provided.',
        promptData
      );

      // Parse and structure the brief
      return this.parseGeneratedBrief(rawBrief, summary.indication);
    } catch (error) {
      console.error('Error generating weekly intelligence brief:', error);
      throw new Error(
        `Failed to generate weekly brief: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get detailed intelligence summary for a specific indication
   * @param indication The therapeutic indication to analyze
   * @returns Structured intelligence summary
   */
  async getIntelligenceSummary(indication: string): Promise<IntelligenceSummary> {
    try {
      const dbInstance = this.getDb();
      // Get all reports for the indication
      const reports = await dbInstance
        .select()
        .from(csrReports)
        .where(
          and(
            like(csrReports.indication, `%${indication}%`),
            not(eq(csrReports.status, 'Withdrawn')),
            isNull(csrReports.deletedAt)
          )
        );

      if (reports.length === 0) {
        throw new Error(`No reports found for indication: ${indication}`);
      }

      // Get report IDs
      const reportIds = reports.map(report => report.id);

      // Get details for all reports
      const details = await dbInstance
        .select()
        .from(csrDetails)
        .where(or(...reportIds.map(id => eq(csrDetails.reportId, id))));

      // Aggregate data
      const adverseEvents: Record<string, any> = {};
      const endpoints: Record<string, any> = {};
      let totalDropoutRate = 0;
      let dropoutCount = 0;

      // Process details data
      details.forEach(detail => {
        // Process adverse events if available
        if (detail.adverseEvents) {
          const events =
            typeof detail.adverseEvents === 'string'
              ? JSON.parse(detail.adverseEvents)
              : detail.adverseEvents;

          if (Array.isArray(events)) {
            events.forEach((event: any) => {
              const eventName = event.name || event.term || 'Unknown';
              const frequency = event.frequency || event.incidence || 0;

              if (!adverseEvents[eventName]) {
                adverseEvents[eventName] = {
                  name: eventName,
                  occurrences: 0,
                  avgFrequency: 0,
                  frequencySum: 0,
                };
              }

              adverseEvents[eventName].occurrences += 1;
              adverseEvents[eventName].frequencySum += parseFloat(frequency) || 0;
              adverseEvents[eventName].avgFrequency =
                adverseEvents[eventName].frequencySum / adverseEvents[eventName].occurrences;
            });
          }
        }

        // Process endpoints
        if (detail.primaryEndpoint) {
          const endpointName = detail.primaryEndpoint;

          if (!endpoints[endpointName]) {
            endpoints[endpointName] = {
              name: endpointName,
              occurrences: 0,
              primaryUseCount: 0,
              secondaryUseCount: 0,
            };
          }

          endpoints[endpointName].occurrences += 1;
          endpoints[endpointName].primaryUseCount += 1;
        }

        if (detail.secondaryEndpoints) {
          const secondaryEps =
            typeof detail.secondaryEndpoints === 'string'
              ? JSON.parse(detail.secondaryEndpoints)
              : detail.secondaryEndpoints;

          if (Array.isArray(secondaryEps)) {
            secondaryEps.forEach((ep: string) => {
              if (!endpoints[ep]) {
                endpoints[ep] = {
                  name: ep,
                  occurrences: 0,
                  primaryUseCount: 0,
                  secondaryUseCount: 0,
                };
              }

              endpoints[ep].occurrences += 1;
              endpoints[ep].secondaryUseCount += 1;
            });
          }
        }

        // Process dropout rate
        if (detail.dropoutRate !== null && detail.dropoutRate !== undefined) {
          const dropoutRate = Number(detail.dropoutRate);
          if (!isNaN(dropoutRate)) {
            totalDropoutRate += dropoutRate;
            dropoutCount += 1;
          }
        }
      });

      // Calculate averages
      const avgDropoutRate = dropoutCount > 0 ? totalDropoutRate / dropoutCount : 0;

      // Sort adverse events and endpoints by occurrences (descending)
      const sortedAdverseEvents = Object.values(adverseEvents)
        .sort((a, b) => b.occurrences - a.occurrences)
        .slice(0, 20); // Top 20 adverse events

      const sortedEndpoints = Object.values(endpoints)
        .sort((a, b) => b.occurrences - a.occurrences)
        .slice(0, 20); // Top 20 endpoints

      // Count trials by phase
      const phaseCounts: Record<string, number> = {};
      reports.forEach(report => {
        const phase = report.phase ?? 'Unknown';
        phaseCounts[phase] = (phaseCounts[phase] || 0) + 1;
      });

      const phases = Object.entries(phaseCounts).map(([name, count]) => ({ name, count }));

      // Create summary
      return {
        indication,
        reportCount: reports.length,
        phases,
        averageDropoutRate: avgDropoutRate,
        topAdverseEvents: sortedAdverseEvents,
        endpointTrends: sortedEndpoints,
        analysisDate: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error generating intelligence summary:', error);
      throw new Error(
        `Failed to generate intelligence summary: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Format intelligence summary data for the AI model
   * @param summary The intelligence summary to format
   * @returns Formatted data as a string
   */
  private formatSummaryForBriefGeneration(summary: IntelligenceSummary): string {
    // Format the top adverse events
    const adverseEventsText = summary.topAdverseEvents
      .slice(0, 10)
      .map(
        (ae: (typeof summary.topAdverseEvents)[number]) =>
          `- ${ae.name}: ${(ae.avgFrequency * 100).toFixed(1)}% frequency, observed in ${ae.occurrences} trials`
      )
      .join('\n');

    // Format the endpoint trends
    const endpointsText = summary.endpointTrends
      .slice(0, 10)
      .map(
        (ep: (typeof summary.endpointTrends)[number]) =>
          `- ${ep.name}: Used in ${ep.occurrences} trials (${ep.primaryUseCount} primary, ${ep.secondaryUseCount} secondary)`
      )
      .join('\n');

    // Format the phase distribution
    const phasesText = summary.phases
      .map((p: (typeof summary.phases)[number]) => `- Phase ${p.name}: ${p.count} trials`)
      .join('\n');

    // Build the complete prompt
    return `
THERAPEUTIC AREA: ${summary.indication}
ANALYSIS DATE: ${new Date().toLocaleDateString()}
TOTAL TRIALS ANALYZED: ${summary.reportCount}

PHASE DISTRIBUTION:
${phasesText}

AVERAGE DROPOUT RATE: ${(summary.averageDropoutRate * 100).toFixed(1)}%

TOP ADVERSE EVENTS:
${adverseEventsText}

MOST COMMON ENDPOINTS:
${endpointsText}
    `;
  }

  /**
   * Parse the generated brief text into a structured format
   * @param rawBrief The raw text from the AI model
   * @param indication The indication being analyzed
   * @returns Structured weekly brief
   */
  private parseGeneratedBrief(rawBrief: string, indication: string): WeeklyBrief {
    // Split the content into sections based on headers
    const sections: Record<string, string[]> = {
      highlights: [],
      trends: [],
      recommendations: [],
    };

    let currentSection = 'highlights';
    const lines = rawBrief.split('\n');

    lines.forEach(line => {
      line = line.trim();
      if (!line) return;

      if (line.toLowerCase().includes('highlight') || line.toLowerCase().includes('key insight')) {
        currentSection = 'highlights';
        return;
      } else if (line.toLowerCase().includes('trend') || line.toLowerCase().includes('emerging')) {
        currentSection = 'trends';
        return;
      } else if (
        line.toLowerCase().includes('recommend') ||
        line.toLowerCase().includes('strategic')
      ) {
        currentSection = 'recommendations';
        return;
      }

      // If the line starts with a list marker (-, *, •, 1., etc.), it's a new item
      if (/^[-*•]|\d+\./.test(line)) {
        // Clean up the list marker
        const cleanedLine = line.replace(/^[-*•]|\d+\./, '').trim();
        if (cleanedLine) {
          sections[currentSection].push(cleanedLine);
        }
      } else if (sections[currentSection].length > 0) {
        // Append to the last item if it's a continuation
        sections[currentSection][sections[currentSection].length - 1] += ' ' + line;
      } else {
        // Add as a new item if there are no items yet
        sections[currentSection].push(line);
      }
    });

    // Create the structured brief
    return {
      generatedDate: new Date().toISOString(),
      highlights: sections.highlights,
      trendInsights: sections.trends,
      recommendations: sections.recommendations,
    };
  }
}
