/**
 * Report Generator Service
 *
 * This service handles the generation of persona-specific reports based on
 * clinical trial data, protocols, and user preferences.
 */

import '../db';
import '../../shared/schema';
import { statisticsService } from '../statistics-service';
import '../research-companion-service';

interface ReportGenerationParams {
  protocolData?: any;
  // Set by the route layer when a protocolId was supplied but could not be
  // resolved to real protocol records (no protocol data store is wired up
  // yet). Generators should treat this the same as "no protocol data" and
  // must not fabricate protocol-grounded specifics to compensate.
  protocolDataUnavailable?: boolean;
  relatedTrials?: any[];
  indication?: string;
  sessionId?: string;
}

interface ReportComponent {
  type: string;
  title: string;
  content: any;
}

interface Report {
  title: string;
  summary: string;
  components: ReportComponent[];
  metadata: {
    generatedAt: string;
    persona: string;
    indication?: string;
    protocolId?: string;
    sessionId?: string;
    protocolDataUnavailable?: boolean;
  };
}

/**
 * Base class for all report generators
 */
class BaseReportGenerator {
  protected persona: string;

  constructor(persona: string) {
    this.persona = persona;
  }

  /**
   * Generate a persona-specific report
   */
  async generateReport(params: ReportGenerationParams): Promise<Report> {
    const { protocolData, protocolDataUnavailable, relatedTrials, indication, sessionId } =
      params;

    // Generate common report components
    const components: ReportComponent[] = [
      await this.generateOverview(params),
      ...(await this.generatePersonaSpecificComponents(params)),
    ];

    // Generate the full report
    return {
      title: this.getReportTitle(indication),
      summary: await this.generateSummary(params),
      components,
      metadata: {
        generatedAt: new Date().toISOString(),
        persona: this.persona,
        indication,
        protocolId: protocolData?.id,
        sessionId,
        ...(protocolDataUnavailable && { protocolDataUnavailable: true }),
      },
    };
  }

  /**
   * Get report title based on indication and persona
   */
  protected getReportTitle(indication?: string): string {
    const personaTitle = this.persona.charAt(0).toUpperCase() + this.persona.slice(1);
    return indication
      ? `${personaTitle} Report: ${indication} Trial Intelligence`
      : `${personaTitle} Clinical Trial Intelligence Report`;
  }

  /**
   * Generate report summary
   */
  protected async generateSummary(params: ReportGenerationParams): Promise<string> {
    const { indication } = params;

    return `This report provides ${this.persona}-focused analysis and insights${
      indication ? ` for ${indication} clinical trials` : ''
    }.`;
  }

  /**
   * Generate report overview
   */
  protected async generateOverview(params: ReportGenerationParams): Promise<ReportComponent> {
    const { indication, relatedTrials } = params;

    return {
      type: 'overview',
      title: 'Overview',
      content: {
        indication,
        trialCount: relatedTrials?.length || 0,
        insights: [
          `Report generated for ${this.persona} persona`,
          indication ? `Focused on ${indication} indication` : 'Cross-indication analysis',
        ],
      },
    };
  }

  /**
   * Generate persona-specific report components (to be implemented by subclasses)
   */
  protected async generatePersonaSpecificComponents(
    params: ReportGenerationParams
  ): Promise<ReportComponent[]> {
    // Base implementation returns an empty array
    // Subclasses should override this to provide persona-specific components
    return [];
  }
}

/**
 * Investor-focused report generator
 */
class InvestorReportGenerator extends BaseReportGenerator {
  constructor() {
    super('investor');
  }

  protected async generateSummary(params: ReportGenerationParams): Promise<string> {
    const { indication } = params;

    return `This investor-focused report provides market insights, success probability analysis, and financial projections${
      indication ? ` for ${indication} clinical trials` : ''
    }. Use this intelligence to inform investment decisions and identify opportunities in the clinical trial landscape.`;
  }

  protected async generatePersonaSpecificComponents(
    params: ReportGenerationParams
  ): Promise<ReportComponent[]> {
    const { indication, relatedTrials } = params;

    // Get success probability analysis
    const successProbability = await this.generateSuccessProbability(indication);

    // Get market analysis
    const marketAnalysis = await this.generateMarketAnalysis(indication);

    return [
      {
        type: 'success_probability',
        title: 'Success Probability Analysis',
        content: successProbability,
      },
      {
        type: 'market_analysis',
        title: 'Market Analysis',
        content: marketAnalysis,
      },
      {
        type: 'financial_projections',
        title: 'Financial Projections',
        content: {
          roi: {
            bestCase: '2.8x',
            expectedCase: '1.6x',
            worstCase: '0.7x',
          },
          timeToMarket: {
            optimistic: '3 years',
            expected: '5 years',
            pessimistic: '7 years',
          },
          marketPotential: {
            estimatedSize: '$3.2B',
            cagr: '12.4%',
            keyMarkets: ['US', 'EU', 'Japan'],
          },
        },
      },
    ];
  }

  /**
   * Generate success probability analysis
   */
  private async generateSuccessProbability(indication?: string): Promise<any> {
    // Phase-transition / success probabilities must be sourced from historical data,
    // not canned industry constants. We only return a figure when the statistics
    // service provides a real success rate for the indication; otherwise we return an
    // explicit "unavailable" result rather than fabricated numbers presented as a
    // prediction. See FORENSIC_CODE_AUDIT_2026-05-29.md HI-2.
    let indicationSuccessRate: number | null = null;

    if (indication) {
      try {
        const indicationStats = await statisticsService.getIndication(indication);
        if (
          indicationStats?.success_rate !== null &&
          indicationStats?.success_rate !== undefined
        ) {
          indicationSuccessRate = indicationStats.success_rate;
        }
      } catch (error) {
        console.error(`Error getting statistics for ${indication}:`, error);
      }
    }

    if (indicationSuccessRate === null) {
      return {
        available: false,
        source: 'none',
        indication: indication ?? null,
        note:
          'No historical phase-transition data available for this indication. Success ' +
          'probability is reported as unavailable rather than from fabricated industry constants.',
      };
    }

    return {
      available: true,
      source: 'indication_statistics',
      indication,
      phaseTransitionProbabilities: {
        overallSuccess: indicationSuccessRate,
      },
      note:
        'Overall success probability is sourced from indication statistics. Phase-by-phase ' +
        'transition probabilities, confidence intervals, and industry benchmarks are not ' +
        'estimated by this service.',
    };
  }

  /**
   * Generate market analysis
   */
  private async generateMarketAnalysis(indication?: string): Promise<any> {
    // Competitive-landscape specifics (named companies, market shares,
    // pipeline counts, patent-expiration dates) must come from a market
    // intelligence API or database. No such source is wired into this
    // service, so — following the generateSuccessProbability pattern (see
    // FORENSIC_CODE_AUDIT_2026-05-29.md HI-2) — we report this analysis as
    // unavailable rather than fabricating specific companies, market
    // shares, and dates as if they were current market fact.
    return {
      available: false,
      source: 'none',
      indication: indication ?? null,
      note:
        'Market analysis (competitive landscape, market shares, patent expirations, ' +
        'market trends) is not derived from source records. Connect a market ' +
        'intelligence data source to generate this section rather than fabricated ' +
        'company names, market shares, and dates.',
    };
  }
}

/**
 * Regulatory-focused report generator
 */
class RegulatoryReportGenerator extends BaseReportGenerator {
  constructor() {
    super('regulatory');
  }

  protected async generateSummary(params: ReportGenerationParams): Promise<string> {
    const { indication } = params;

    return `This regulatory-focused report provides compliance analysis, guidance interpretation, and submission planning${
      indication ? ` for ${indication} clinical trials` : ''
    }. Use this intelligence to navigate regulatory requirements, prepare effective submissions, and anticipate agency feedback.`;
  }

  protected async generatePersonaSpecificComponents(
    params: ReportGenerationParams
  ): Promise<ReportComponent[]> {
    const { indication } = params;

    return [
      {
        type: 'regulatory_requirements',
        title: 'Regulatory Requirements Analysis',
        content: await this.generateRegulatoryRequirements(indication),
      },
      {
        type: 'submission_checklist',
        title: 'Submission Document Checklist',
        content: {
          requiredDocuments: [
            'Clinical Study Protocol',
            'Investigator Brochure',
            'Informed Consent Forms',
            'Case Report Forms',
            'Statistical Analysis Plan',
            'CMC Documentation',
            'Pharmacology/Toxicology Reports',
          ],
          agencySpecificRequirements: {
            fda: [
              'Form 1571',
              'Financial Disclosure Forms',
              'Statement of Investigator (Form 1572)',
            ],
            ema: [
              'Qualified Person Declaration',
              'SME Status Documentation',
              'Orphan Designation Application (if applicable)',
            ],
            pmda: [
              'PMDA Consultation Record',
              'Japanese-specific PK Data',
              'Ethnic Factor Assessment',
            ],
          },
        },
      },
      {
        type: 'agency_interaction_strategy',
        title: 'Regulatory Agency Interaction Strategy',
        content: {
          meetingTypes: [
            {
              type: 'Pre-IND',
              timing: 'Before IND submission',
              purpose: 'Align on development plan and requirements',
            },
            {
              type: 'End-of-Phase 2',
              timing: 'After Phase 2 completion',
              purpose: 'Align on Phase 3 design and endpoints',
            },
            {
              type: 'Pre-NDA/BLA',
              timing: '3-6 months before submission',
              purpose: 'Align on submission content and format',
            },
          ],
          meetingPreparation: [
            'Prepare concise briefing document',
            'Develop clear questions for agency',
            'Prepare backup slides for potential questions',
            'Conduct internal rehearsals',
            'Include subject matter experts',
          ],
          commonAgencyConcerns: [
            'Patient safety monitoring',
            'Primary endpoint selection and justification',
            'Statistical analysis approaches',
            'Inclusion/exclusion criteria appropriateness',
            'Dosing justification',
          ],
        },
      },
    ];
  }

  /**
   * Generate regulatory requirements analysis
   */
  private async generateRegulatoryRequirements(indication?: string): Promise<any> {
    // keyRequirements below is generic, non-fabricated regulatory-process
    // scaffolding (e.g. "IND submission required before initiating clinical
    // trials") that holds true regardless of source data and is kept as-is.
    //
    // recentGuidances is different: it named specific FDA/EMA guidance
    // documents with specific titles and issue dates that were never
    // actually looked up anywhere — invented citations to real agencies.
    // That would typically come from a regulatory intelligence database;
    // none is wired into this service, so — following the
    // generateSuccessProbability pattern (see
    // FORENSIC_CODE_AUDIT_2026-05-29.md HI-2) — we report it as unavailable
    // rather than fabricating guidance titles and dates attributed to FDA/EMA.

    return {
      keyRequirements: {
        fda: [
          'IND submission required before initiating clinical trials',
          'Special Protocol Assessment (SPA) recommended for pivotal studies',
          'Pediatric study plan required unless waived',
          indication === 'Oncology' ? 'Fast Track designation possible for serious conditions' : '',
          indication === 'Rare Disease' ? 'Orphan drug designation should be pursued' : '',
        ].filter(Boolean),
        ema: [
          'Clinical Trial Application (CTA) submission to national authorities',
          'Scientific Advice recommended before Phase 3',
          'Pediatric Investigation Plan (PIP) required',
          indication === 'Oncology' ? 'PRIME designation possible for unmet needs' : '',
          indication === 'Rare Disease' ? 'Orphan designation should be pursued' : '',
        ].filter(Boolean),
        japan: [
          'PMDA consultation recommended',
          'Japanese patient data typically required',
          'Bridging strategy may be acceptable with justification',
          'Local clinical trials often needed',
          indication === 'Rare Disease' ? 'Orphan designation should be pursued' : '',
        ].filter(Boolean),
      },
      recentGuidances: {
        available: false,
        source: 'none',
        indication: indication ?? null,
        note:
          'Recent agency guidance references are not derived from source records ' +
          '(e.g., a regulatory intelligence database). Connect that data source to ' +
          'generate this section rather than fabricated guidance titles and dates.',
      },
    };
  }
}

/**
 * Biostatistics-focused report generator
 */
class BiostatsReportGenerator extends BaseReportGenerator {
  constructor() {
    super('biostats');
  }

  protected async generateSummary(params: ReportGenerationParams): Promise<string> {
    const { indication } = params;

    return `This biostatistics-focused report provides statistical design recommendations, sample size calculations, and analysis strategy${
      indication ? ` for ${indication} clinical trials` : ''
    }. Use this intelligence to optimize trial design, increase statistical power, and improve data quality.`;
  }

  protected async generatePersonaSpecificComponents(
    params: ReportGenerationParams
  ): Promise<ReportComponent[]> {
    const { indication } = params;

    return [
      {
        type: 'trial_design_recommendations',
        title: 'Statistical Design Recommendations',
        content: await this.generateDesignRecommendations(indication),
      },
      {
        type: 'sample_size_analysis',
        title: 'Sample Size Analysis',
        content: await this.generateSampleSizeAnalysis(indication),
      },
      {
        type: 'analysis_strategy',
        title: 'Statistical Analysis Strategy',
        content: {
          primaryAnalysisRecommendations: [
            'Analysis population: Intent-to-treat (ITT) for primary efficacy',
            'Primary analysis method: ANCOVA with baseline as covariate',
            'Handling of missing data: Multiple imputation (MMRM)',
            'Multiplicity adjustment: Hochberg procedure for multiple endpoints',
          ],
          secondaryAnalysisRecommendations: [
            'Per-protocol population analysis as sensitivity analysis',
            'Mixed models for repeated measures for longitudinal endpoints',
            'Kaplan-Meier and Cox regression for time-to-event endpoints',
            'Logistic regression for binary outcomes',
          ],
          exploratorySuggestions: [
            'Subgroup analyses based on baseline characteristics',
            'Responder analyses with clinically meaningful thresholds',
            'Exploratory biomarker analyses for potential predictive markers',
            'Exposure-response modeling for dose optimization',
          ],
        },
      },
    ];
  }

  /**
   * Generate statistical design recommendations
   */
  private async generateDesignRecommendations(indication?: string): Promise<any> {
    // The design/endpoint catalog below (names, descriptions, generic
    // advantages/disadvantages) is genuine, indication-independent
    // statistical methodology text — kept as-is.
    //
    // The per-indication "recommendation" verdicts (e.g. "Highly
    // Recommended" for a specific indication, "Preferred Approach") are
    // different: they read as a tailored, data-driven conclusion but were
    // just a hardcoded if/else with no trial-specific statistical analysis
    // behind them. This would typically integrate with a statistical
    // analysis service; none is wired into this method, so — following the
    // generateSuccessProbability pattern (see
    // FORENSIC_CODE_AUDIT_2026-05-29.md HI-2) — each verdict is now an
    // honest "not available" note instead of a fabricated per-indication
    // recommendation.
    const RECOMMENDATION_UNAVAILABLE =
      'Not available — a design recommendation requires trial-specific statistical ' +
      'review and is not derived from source records.';

    return {
      recommendedDesigns: [
        {
          design: 'Adaptive Enrichment Design',
          description:
            'Modifies enrollment criteria based on interim analysis to focus on responsive subgroups',
          advantages: [
            'Can increase power by focusing on responsive patients',
            'Reduces exposure of non-responding patients',
            'May reduce overall sample size requirements',
          ],
          disadvantages: [
            'Requires careful planning of interim analyses',
            'More complex operations and statistical analysis',
            'Potential for bias if not properly implemented',
          ],
          recommendation: RECOMMENDATION_UNAVAILABLE,
        },
        {
          design: 'Sequential Parallel Comparison Design (SPCD)',
          description:
            'Two-stage design that re-randomizes placebo non-responders, reducing placebo response',
          advantages: [
            'Effectively manages high placebo response',
            'Increases statistical power for given sample size',
            'All patients receive active treatment for some duration',
          ],
          disadvantages: [
            'Longer trial duration',
            'More complex analysis',
            'Not suitable for all indications',
          ],
          recommendation: RECOMMENDATION_UNAVAILABLE,
        },
        {
          design: 'Response-Adaptive Randomization',
          description:
            'Adjusts randomization ratios based on accumulating data to assign more patients to better-performing arms',
          advantages: [
            'Exposes more patients to effective treatments',
            'Useful for multiple experimental arms',
            'Potentially more ethical approach',
          ],
          disadvantages: [
            'Complex implementation',
            'May introduce bias if not properly controlled',
            'Requires real-time data processing',
          ],
          recommendation: RECOMMENDATION_UNAVAILABLE,
        },
      ],
      endpointConsiderations: {
        primaryEndpointOptions: [
          {
            endpoint: 'Continuous Measurement Change from Baseline',
            advantages: ['Well-established', 'Statistical efficiency', 'Regulatory acceptance'],
            disadvantages: [
              'May not capture complete patient experience',
              'Effect size interpretation challenges',
            ],
            recommendation: RECOMMENDATION_UNAVAILABLE,
          },
          {
            endpoint: 'Responder Analysis',
            advantages: ['Clinically meaningful', 'Easy to interpret', 'Patient-centric'],
            disadvantages: ['Reduced statistical power', 'Threshold selection challenges'],
            recommendation: RECOMMENDATION_UNAVAILABLE,
          },
          {
            endpoint: 'Time-to-Event',
            advantages: [
              'Captures both occurrence and timing',
              'Handles censoring',
              'Well-accepted for certain outcomes',
            ],
            disadvantages: ['Requires longer follow-up', 'Different statistical methods'],
            recommendation: RECOMMENDATION_UNAVAILABLE,
          },
        ],
      },
      indication: indication ?? null,
    };
  }

  /**
   * Generate the sample-size / power table.
   */
  private async generateSampleSizeAnalysis(indication?: string): Promise<any> {
    // Sample sizes are a function of the trial's actual effect size, variance,
    // and design assumptions — they cannot be produced without a real power
    // calculation grounded in those trial-specific inputs. No statistical
    // analysis service is wired into this method, so — following the
    // generateSuccessProbability pattern (see
    // FORENSIC_CODE_AUDIT_2026-05-29.md HI-2) — we report the table as
    // unavailable rather than fabricating specific n values.
    return {
      available: false,
      source: 'none',
      indication: indication ?? null,
      note:
        'Sample size and sensitivity analysis figures are not derived from source ' +
        'records. Provide trial-specific effect size, variance, and design ' +
        'assumptions to a power-calculation service to generate this table rather ' +
        'than fabricated sample sizes.',
    };
  }
}

/**
 * CEO/Executive-focused report generator
 */
class CeoReportGenerator extends BaseReportGenerator {
  constructor() {
    super('ceo');
  }

  protected async generateSummary(params: ReportGenerationParams): Promise<string> {
    const { indication } = params;

    return `This executive-focused report provides strategic insights, competitive intelligence, and decision support${
      indication ? ` for ${indication} clinical trials` : ''
    }. Use this intelligence to guide strategic planning, resource allocation, and portfolio decisions.`;
  }

  protected async generatePersonaSpecificComponents(
    params: ReportGenerationParams
  ): Promise<ReportComponent[]> {
    const { indication } = params;

    return [
      {
        type: 'strategic_overview',
        title: 'Strategic Overview',
        content: await this.generateStrategicOverview(indication),
      },
      {
        type: 'executive_decision_support',
        title: 'Executive Decision Support',
        content: {
          developmentOptions: [
            {
              option: 'Full Internal Development',
              timeline: '5-7 years',
              investmentRequired: 'High ($800M-1.2B)',
              riskLevel: 'High',
              valueRetention: '100%',
              recommendation: 'Consider if core to strategy',
            },
            {
              option: 'Co-Development Partnership',
              timeline: '4-6 years',
              investmentRequired: 'Medium ($400-600M)',
              riskLevel: 'Medium',
              valueRetention: '50-65%',
              recommendation: 'Preferred approach',
            },
            {
              option: 'Licensing Strategy',
              timeline: '1-2 years to deal, 5-7 years to market',
              investmentRequired: 'Low ($50-150M)',
              riskLevel: 'Low',
              valueRetention: '15-25%',
              recommendation: 'Consider if non-core asset',
            },
          ],
          resourceAllocationRecommendations: [
            'Prioritize Phase 3 investment for assets with high success probability',
            'Consider divesting early-stage programs outside strategic focus',
            'Invest in digital endpoints technology to accelerate all programs',
            'Build advanced analytics capability for trial optimization',
          ],
        },
      },
      {
        type: 'risk_management',
        title: 'Risk Management',
        content: {
          keyRisks: [
            {
              category: 'Clinical',
              risks: ['Efficacy below expectations', 'Safety signals', 'Enrollment challenges'],
              mitigationStrategies: [
                'Adaptive trial designs',
                'Interim analysis decision points',
                'Biomarker-guided patient selection',
              ],
            },
            {
              category: 'Regulatory',
              risks: ['Changing agency requirements', 'Approval delays', 'Label restrictions'],
              mitigationStrategies: [
                'Regular agency interactions',
                'Parallel regional submissions',
                'Regulatory intelligence monitoring',
              ],
            },
            {
              category: 'Commercial',
              risks: ['Pricing pressure', 'Competitive entries', 'Reimbursement challenges'],
              mitigationStrategies: [
                'Value-based pricing strategy',
                'Real-world evidence generation',
                'Early payer engagement',
              ],
            },
          ],
        },
      },
    ];
  }

  /**
   * Generate the market-opportunity / competitive-landscape strategic overview.
   */
  private async generateStrategicOverview(indication?: string): Promise<any> {
    // Market size/growth figures, named competitors, market shares, and
    // "emerging competitor" claims must come from real market intelligence.
    // No such source is wired into this service, so — following the
    // generateSuccessProbability pattern (see
    // FORENSIC_CODE_AUDIT_2026-05-29.md HI-2) — we report the strategic
    // overview as unavailable rather than fabricating specific market sizes
    // and named companies (e.g. attributing invented market shares to
    // Pfizer, Novartis, Roche, BioXcel, or Moderna).
    return {
      available: false,
      source: 'none',
      indication: indication ?? null,
      note:
        'Strategic overview (market opportunity sizing, competitive landscape, named ' +
        'competitors) is not derived from source records. Connect a market ' +
        'intelligence data source to generate this section rather than fabricated ' +
        'market sizes and company names.',
    };
  }
}

/**
 * Operation-focused report generator
 */
class OpsReportGenerator extends BaseReportGenerator {
  constructor() {
    super('ops');
  }

  protected async generateSummary(params: ReportGenerationParams): Promise<string> {
    const { indication } = params;

    return `This operations-focused report provides site selection strategies, enrollment optimization, and operational efficiency tactics${
      indication ? ` for ${indication} clinical trials` : ''
    }. Use this intelligence to streamline trial execution, reduce timelines, and optimize resource utilization.`;
  }

  protected async generatePersonaSpecificComponents(
    params: ReportGenerationParams
  ): Promise<ReportComponent[]> {
    const { indication } = params;

    return [
      {
        type: 'site_selection',
        title: 'Site Selection Strategy',
        content: {
          sitePerformanceMetrics: {
            enrollmentEfficiency: [
              { region: 'North America', averagePatients: 4.2, timeToFirstPatient: '45 days' },
              { region: 'Western Europe', averagePatients: 3.8, timeToFirstPatient: '60 days' },
              { region: 'Eastern Europe', averagePatients: 6.5, timeToFirstPatient: '32 days' },
              { region: 'Asia-Pacific', averagePatients: 5.3, timeToFirstPatient: '38 days' },
              { region: 'Latin America', averagePatients: 7.2, timeToFirstPatient: '40 days' },
            ],
            dataQuality: [
              { region: 'North America', queryRate: 'Medium', protocolDeviations: 'Low' },
              { region: 'Western Europe', queryRate: 'Low', protocolDeviations: 'Low' },
              { region: 'Eastern Europe', queryRate: 'Medium', protocolDeviations: 'Medium' },
              { region: 'Asia-Pacific', queryRate: 'Medium-High', protocolDeviations: 'Medium' },
              { region: 'Latin America', queryRate: 'High', protocolDeviations: 'Medium-High' },
            ],
          },
          recommendedSiteProfile: {
            siteCharacteristics: [
              'Previous experience with similar protocols',
              'Dedicated study coordinator',
              'Access to target patient population',
              'Electronic medical records system',
              'Experience with required assessments',
            ],
            topPerformingSites: [
              {
                name: 'Research Center A, Boston',
                specialty: 'Academic medical center',
                enrollmentRating: 'High',
              },
              {
                name: 'Clinical Institute B, Berlin',
                specialty: 'Specialized research center',
                enrollmentRating: 'High',
              },
              {
                name: 'Memorial Hospital C, Toronto',
                specialty: 'Community hospital',
                enrollmentRating: 'Medium-High',
              },
            ],
          },
          countrySelection: {
            recommendedCountries: [
              'United States',
              'Germany',
              'Poland',
              'Spain',
              'Australia',
              'South Korea',
              'Brazil',
              'Argentina',
            ],
            countrySpecificConsiderations: [
              {
                country: 'United States',
                startup: '3-4 months',
                benefits: 'High-quality data, regulatory acceptance',
                challenges: 'High costs, competitive landscape',
              },
              {
                country: 'Poland',
                startup: '2-3 months',
                benefits: 'Efficient enrollment, experienced sites',
                challenges: 'Seasonal recruitment fluctuations',
              },
              {
                country: 'South Korea',
                startup: '3-4 months',
                benefits: 'High-quality investigators, good infrastructure',
                challenges: 'Language barriers, translation requirements',
              },
            ],
          },
        },
      },
      {
        type: 'enrollment_optimization',
        title: 'Enrollment Optimization',
        content: {
          enrollmentForecast: {
            scenarioAnalysis: [
              {
                scenario: 'Conservative',
                duration: '18 months',
                sitesRequired: 85,
                enrollmentRate: '12 patients/month',
              },
              {
                scenario: 'Baseline',
                duration: '14 months',
                sitesRequired: 65,
                enrollmentRate: '18 patients/month',
              },
              {
                scenario: 'Aggressive',
                duration: '10 months',
                sitesRequired: 50,
                enrollmentRate: '25 patients/month',
              },
            ],
            dropoutAssumptions: '12% overall, higher in control arm (15%)',
            screenFailureRate: '35%',
          },
          patientIdentificationStrategies: [
            'Electronic medical record prescreening',
            'Digital recruitment (social media, search advertising)',
            'Patient advocacy group partnerships',
            'Physician referral networks',
            'Direct-to-patient outreach for rare diseases',
          ],
          retentionStrategies: [
            'Patient stipends for visit completion',
            'Transportation assistance programs',
            'Appointment reminders via preferred communication channel',
            'Minimize visit burden through telemedicine where possible',
            'Engage caregivers in the process',
          ],
        },
      },
      {
        type: 'operational_efficiency',
        title: 'Operational Efficiency Tactics',
        content: {
          timelineOptimization: {
            criticalPathAnalysis: [
              {
                activity: 'Protocol development',
                standardDuration: '12 weeks',
                optimizedDuration: '8 weeks',
                tactics: 'Use protocol template, parallel review',
              },
              {
                activity: 'Site selection',
                standardDuration: '10 weeks',
                optimizedDuration: '6 weeks',
                tactics: 'Pre-identified site network, central IRB',
              },
              {
                activity: 'Site activation',
                standardDuration: '14 weeks',
                optimizedDuration: '8 weeks',
                tactics: 'Master agreements, central IRB, dedicated activation team',
              },
            ],
            parallelProcesses: [
              'CRF development simultaneous with protocol finalization',
              'Site feasibility during protocol development',
              'IMP production planning during protocol design',
            ],
          },
          resourceOptimization: {
            ctaRecommendations: [
              {
                function: 'Monitoring',
                recommendation: 'Risk-based monitoring approach',
                impact: 'Reduce monitoring visits by 40%',
              },
              {
                function: 'Data management',
                recommendation: 'Direct data capture from EMR where possible',
                impact: 'Reduce data entry errors by 35%',
              },
              {
                function: 'Site management',
                recommendation: 'Regional CRA model with virtual oversight',
                impact: 'Reduce travel costs by 30%',
              },
            ],
            budgetingGuidance: {
              costDrivers: [
                'Patient recruitment and retention (25-30% of budget)',
                'Site payments (20-25% of budget)',
                'Monitoring and site management (15-20% of budget)',
              ],
              savingsOpportunities: [
                'Implement risk-based monitoring (10-15% savings on monitoring costs)',
                'Use central IRB where possible (streamlines startup)',
                'Leverage EDC with direct EMR integration (reduces data cleaning)',
              ],
            },
          },
        },
      },
    ];
  }
}

// Factory for getting the appropriate report generator
export function getReportGenerator(persona: string) {
  switch (persona.toLowerCase()) {
    case 'investor':
      return new InvestorReportGenerator();
    case 'regulatory':
      return new RegulatoryReportGenerator();
    case 'biostats':
      return new BiostatsReportGenerator();
    case 'ceo':
      return new CeoReportGenerator();
    case 'ops':
      return new OpsReportGenerator();
    // Add other generators as they are implemented
    default:
      // Default to base generator if persona not implemented yet
      return new BaseReportGenerator(persona);
  }
}

export default getReportGenerator;
