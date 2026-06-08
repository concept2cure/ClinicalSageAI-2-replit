import { db } from './db';
import { like } from 'drizzle-orm';
import { reports } from 'shared/schema';
// Legacy import — module not present in current tree.
// Stub class kept so call sites typecheck; runtime usage no-ops.
class CSRSearchEngine {
  search(_q: string, _opts?: any): any[] { return []; }
  combined_search(
    _summary: string,
    _indication?: string,
    _phase?: string,
    _arg4?: any,
    _arg5?: any,
    _limit?: number
  ): any[] { return []; }
}
import fs from 'fs';
import path from 'path';

interface ProtocolInfo {
  protocolId: string;
  summary: string;
  indication?: string;
  phase?: string;
  sponsor?: string;
}

export interface StrategicReportSection {
  title: string;
  content?: string;
  table?: Array<Record<string, string | number>>;
  bullets?: string[];
  /**
   * 'available'       — every figure/claim is derived from real matched data.
   * 'not_implemented' — the underlying analysis is not yet computed; the section
   *                     reports only what is real and explicitly omits the rest
   *                     rather than presenting illustrative/estimated values.
   * Consumers (UI/markdown) can surface a clear badge so a not-yet-computed
   * section is never mistaken for a substantive finding.
   */
  status?: 'available' | 'not_implemented';
}

export interface StrategicReport {
  protocol_id: string;
  generated_on: string;
  sections: StrategicReportSection[];
}

/**
 * Service for generating Strategic Intelligence Reports
 */
export class IntelligenceService {
  private searchEngine: CSRSearchEngine;

  constructor() {
    this.searchEngine = new CSRSearchEngine();
  }

  /**
   * Generate a strategic intelligence report for a given protocol
   */
  async generateReport(protocolInfo: ProtocolInfo): Promise<StrategicReport> {
    const { protocolId, summary, indication, phase, sponsor } = protocolInfo;

    // Find similar trial reports in our database
    const similarCSRs = await this.findSimilarTrials(summary, indication, phase);

    // Find Concept2Cure trials for the same indication/phase
    const competitorTrials = await this.findCompetitorTrials(indication, phase);

    // Generate historical benchmarking section
    const historicalBenchmarking = await this.generateHistoricalBenchmarking(
      similarCSRs,
      competitorTrials,
      indication,
      phase
    );

    // Generate endpoint benchmarking section
    const endpointBenchmarking = await this.generateEndpointBenchmarking(
      similarCSRs,
      competitorTrials
    );

    // Generate design risk prediction
    const designRiskPrediction = await this.generateDesignRiskPrediction(similarCSRs, summary);

    // Generate regulatory alignment
    const regulatoryAlignment = await this.generateRegulatoryAlignment(
      similarCSRs,
      competitorTrials,
      indication,
      phase
    );

    // Generate strategic positioning
    const strategicPositioning = await this.generateStrategicPositioning(
      similarCSRs,
      competitorTrials,
      sponsor
    );

    // Generate AI recommendations
    const recommendations = await this.generateRecommendations(
      summary,
      similarCSRs,
      competitorTrials,
      indication,
      phase
    );

    // Compile the report
    const report: StrategicReport = {
      protocol_id: protocolId,
      generated_on: new Date().toISOString(),
      sections: [
        historicalBenchmarking,
        endpointBenchmarking,
        designRiskPrediction,
        regulatoryAlignment,
        strategicPositioning,
        recommendations,
      ],
    };

    return report;
  }

  /**
   * Find similar trials based on vector similarity and metadata
   */
  private async findSimilarTrials(summary: string, indication?: string, phase?: string) {
    try {
      // Get similar trials from CSR database
      const searchResult = await this.searchEngine.combined_search(
        summary,
        indication,
        phase,
        null,
        null,
        15 // Increased limit to get better statistical data
      );

      return searchResult;
    } catch (error) {
      console.error('Error finding similar trials:', error);
      return [];
    }
  }

  /**
   * Find competitor trials for the same indication/phase
   */
  private async findCompetitorTrials(indication?: string, phase?: string) {
    try {
      // Find trials in our database with matching indication/phase
      let query: any = db.select().from(reports);

      if (indication) {
        query = query.where(like((reports as any).indication, `%${indication}%`));
      }

      if (phase) {
        query = query.where(like((reports as any).phase, `%${phase}%`));
      }

      // Limit to 15 results
      const results = await query.limit(15);
      return results;
    } catch (error) {
      console.error('Error finding competitor trials:', error);
      return [];
    }
  }

  /**
   * Generate historical benchmarking section
   */
  private async generateHistoricalBenchmarking(
    similarCSRs: any[],
    competitorTrials: any[],
    indication?: string,
    phase?: string
  ): Promise<StrategicReportSection> {
    // Count successful vs. failed trials
    const allTrials = [...similarCSRs, ...competitorTrials];
    const successfulTrials = allTrials.filter(
      trial =>
        trial.outcome === 'Successful' ||
        trial.status === 'Completed' ||
        trial.status === 'Approved'
    );

    // Design-level alignment scoring against the successful cohort requires
    // protocol-feature comparison we do not yet compute. Earlier this surface
    // fabricated that count with Math.random(); we now report only figures
    // derived from the matched data and explicitly omit the alignment score
    // rather than present an invented one in a regulated-facing report.
    const failedTrials = allTrials.length - successfulTrials.length;

    return {
      title: 'Historical Trial Benchmarking',
      status: 'available',
      content: `Matched ${allTrials.length} trials from CSRs and CTGov with similar ${indication || 'indication'} and ${phase || 'phase'}. Of these, ${successfulTrials.length} reached a successful or approved outcome and ${failedTrials} did not. A design-level alignment score against the successful cohort is not yet computed and is intentionally omitted rather than estimated.`,
    };
  }

  /**
   * Generate endpoint benchmarking section
   */
  private async generateEndpointBenchmarking(
    similarCSRs: any[],
    competitorTrials: any[]
  ): Promise<StrategicReportSection> {
    // Endpoint frequency/success-rate benchmarking requires parsing endpoints
    // out of each matched trial record, which is not yet implemented. This
    // surface previously returned a hardcoded illustrative table (BMI/HbA1c
    // with invented success rates); it now reports only the real match count
    // and omits the benchmark rather than presenting demonstration figures.
    const matched = [...similarCSRs, ...competitorTrials].length;
    return {
      title: 'Endpoint Benchmarking',
      status: 'not_implemented',
      content: `Endpoint frequency and success-rate benchmarking requires parsing endpoints from the ${matched} matched trial record(s); this analysis is not yet implemented. No benchmark figures are shown rather than presenting illustrative values.`,
    };
  }

  /**
   * Generate design risk prediction
   */
  private async generateDesignRiskPrediction(
    _similarCSRs: any[],
    summary: string
  ): Promise<StrategicReportSection> {
    // The planned dropout is read directly from the protocol summary (real
    // input). A *projected* dropout from comparable trials was previously
    // hardcoded to 18% and used to assert the sample size "may be too low";
    // that projection is not computed (the similar-trial corpus is not wired
    // in this build), so no projection or sample-size verdict is asserted.
    const dropoutMatch = summary.match(/(\d+)%\s*dropout/i);
    const plannedDropout = dropoutMatch ? parseInt(dropoutMatch[1], 10) : null;
    const plannedText =
      plannedDropout !== null
        ? `The protocol states a planned dropout of ${plannedDropout}%.`
        : 'No planned dropout rate was found in the protocol summary.';

    return {
      title: 'Design Risk Prediction',
      status: 'not_implemented',
      content: `${plannedText} A projected dropout derived from comparable trials is not yet computed, so no dropout projection or sample-size adequacy verdict is asserted here.`,
    };
  }

  /**
   * Generate regulatory alignment section
   */
  private async generateRegulatoryAlignment(
    _similarCSRs: any[],
    _competitorTrials: any[],
    indication?: string,
    phase?: string
  ): Promise<StrategicReportSection> {
    // Previously asserted invented approval precedent ("included in 3
    // EMA-approved studies", "matches 3 recently approved drugs") regardless
    // of the inputs. Approval-history analysis is not implemented, so no
    // precedent or risk verdict is asserted.
    return {
      title: 'Regulatory Alignment',
      status: 'not_implemented',
      content: `Regulatory alignment analysis — approval history and guidance precedent for comparable ${indication || 'indication'} / ${phase || 'phase'} programs — is not yet implemented. No approval-precedent or acceptable-risk claims are asserted here.`,
    };
  }

  /**
   * Generate strategic positioning section
   */
  private async generateStrategicPositioning(
    _similarCSRs: any[],
    _competitorTrials: any[],
    _sponsor?: string
  ): Promise<StrategicReportSection> {
    // Previously asserted "faster timeline and fewer visits than the top 5
    // comparators" with no comparator analysis behind it. Competitive
    // positioning is not implemented, so no comparative-advantage claim is made.
    return {
      title: 'Strategic Positioning',
      status: 'not_implemented',
      content: `Competitive positioning analysis — timeline and visit-burden comparison against comparator programs — is not yet implemented. No comparative-advantage claims are asserted here.`,
    };
  }

  /**
   * Generate AI recommendations
   */
  private async generateRecommendations(
    _summary: string,
    _similarCSRs: any[],
    _competitorTrials: any[],
    _indication?: string,
    _phase?: string
  ): Promise<StrategicReportSection> {
    // Previously returned a fixed list of canned recommendations (BMI endpoint,
    // +20% sample size, etc.) regardless of the protocol. Recommendations
    // depend on the similar-trial analysis above, which is not yet computed, so
    // no recommendations are presented in place of real ones.
    return {
      title: 'AI-Powered Recommendations',
      status: 'not_implemented',
      content: `Protocol-specific recommendations are derived from the trial-analysis sections above, which are not yet computed in this build. No recommendations are presented rather than showing generic placeholders.`,
    };
  }

  /**
   * Save a strategic report to a dossier
   */
  async saveReportToDossier(report: StrategicReport, dossierId: string): Promise<boolean> {
    try {
      const dossierDir = path.join(process.cwd(), 'data', 'dossiers');

      // Ensure directory exists
      if (!fs.existsSync(dossierDir)) {
        fs.mkdirSync(dossierDir, { recursive: true });
      }

      const dossierPath = path.join(dossierDir, `${dossierId}_strategy.json`);

      // Check if dossier already exists
      let dossierData: any[] = [];
      if (fs.existsSync(dossierPath)) {
        const dossierContent = fs.readFileSync(dossierPath, 'utf8');
        dossierData = JSON.parse(dossierContent);
      }

      // Add the new report
      dossierData.push({
        ...report,
        added_on: new Date().toISOString(),
      });

      // Save the updated dossier
      fs.writeFileSync(dossierPath, JSON.stringify(dossierData, null, 2));

      return true;
    } catch (error) {
      console.error('Error saving report to dossier:', error);
      return false;
    }
  }
}

// Export a singleton instance
export const intelligenceService = new IntelligenceService();
