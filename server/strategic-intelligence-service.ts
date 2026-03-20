/**
 * Strategic Intelligence Service
 *
 * This service provides advanced strategic insights for protocol optimization
 * and financial/regulatory alignment based on industry data and benchmarks.
 */
import { competitiveAnalysisService } from './competitive-analysis-service';

export interface StrategicUseCase {
  id: string;
  name: string;
  audience: string;
  industryChallenge: {
    problemDescription: string;
    legacyCost: number;
    timelineWeeks: number;
    limitations: string[];
  };
  trialSageSolution: {
    modules: string[];
    preFilledInputs: Record<string, any>;
    outcomes: {
      timeSavedWeeks: number;
      costSaved: number;
      riskMitigated: string;
      fasbCompliance: boolean;
      fasbJustification?: string;
    };
    deliverables: string[];
  };
  competitiveAnalysis?: {
    summary: string;
    advantages: string[];
    roiComparison: Record<string, any>;
    featureComparison: any;
  };
  sampleFiles?: {
    reportUrl?: string;
    sapUrl?: string;
    benchmarkTableUrl?: string;
  };
}

export interface IndustryBenchmark {
  category: string;
  metrics: Record<string, any>;
  source: string;
}

export interface FastFinancialInsight {
  activity: string;
  isFasbCompliant: boolean;
  justification: string;
  estimatedCostSavings: number;
  timelineSavings: number;
}

export class StrategicIntelligenceService {
  // Industry benchmarks for trial costs
  private industryBenchmarks: IndustryBenchmark[] = [
    {
      category: 'Cost Per Patient',
      metrics: {
        average: 41413,
      },
      source: 'Applied Clinical Trials',
    },
    {
      category: 'Daily Trial Costs',
      metrics: {
        'Phase 1': 7829,
        'Phase 2': 23737,
        'Phase 3': 55716,
      },
      source: 'Applied Clinical Trials',
    },
    {
      category: 'Consultant Fees',
      metrics: {
        'Protocol Design': 35000,
        'Full Trial Planning': 50000,
        'Statistical Support': 15000,
      },
      source: 'Industry Average',
    },
  ];

  // FASB compliance guidelines
  private fasbGuidelines: Record<string, string> = {
    protocol_design:
      'Protocols with specificity for a designated compound can qualify for capitalization under ASC 730',
    sap_generation:
      'Statistical Analysis Plans can be capitalized when they are tied to a specific protocol',
    dose_finding:
      'Dose-finding activities for a specific compound in development can qualify for capitalization',
    endpoint_validation:
      'Validation activities for novel endpoints may qualify for capitalization when specific to a product',
    regulatory_submissions:
      'Preparation of regulatory submissions generally qualifies for capitalization under ASC 730',
    general_research: 'General research activities without a specific application must be expensed',
  };

  // Collection of strategic use cases
  private strategicUseCases: StrategicUseCase[] = [
    {
      id: 'ind-readiness',
      name: 'First-In-Human IND Readiness',
      audience: 'Biotech Founders',
      industryChallenge: {
        problemDescription:
          'Founders spend $20K–$50K on consultants to design a Phase 1 study — mostly from templates — and still get challenged by FDA.',
        legacyCost: 35000,
        timelineWeeks: 6,
        limitations: [
          'Limited precedent data',
          'High risk of FDA protocol hold',
          'Minimal statistical justification',
        ],
      },
      trialSageSolution: {
        modules: ['CSR Benchmarking', 'Risk Predictor', 'SAP Generator', 'Dossier Builder'],
        preFilledInputs: {
          indication: 'Autoimmune',
          phase: 'Phase 1',
          sample_size: 45,
          duration_weeks: 6,
          primary_endpoint: 'Dose safety + PK',
        },
        outcomes: {
          timeSavedWeeks: 5,
          costSaved: 38000,
          riskMitigated: 'Reduced likelihood of FDA protocol hold',
          fasbCompliance: true,
          fasbJustification:
            'Protocol development costs can be capitalized under ASC 730 when tied to a specific compound and development plan',
        },
        deliverables: [
          'Comprehensive protocol design report',
          'Statistical Analysis Plan (SAP)',
          'CSR match table',
          'AI-based recommendation matrix',
          'Success probability scorecard',
        ],
      },
      competitiveAnalysis: {
        summary:
          'For First-in-Human IND Readiness, Concept2Cure outperforms competitors with its comprehensive regulatory intelligence covering 8 global regions (vs. 2-4 regions for competitors) and academic knowledge integration. While Medidata offers strong data management and Veeva provides robust document control, only Concept2Cure delivers AI-powered field-level protocol optimization with explainable recommendations tied directly to regulatory precedents and CSR outcomes. This results in 38% cost savings and 5-week timeline reduction compared to traditional approaches, with significantly lower implementation complexity.',
        advantages: [
          'Complete global regulatory coverage (8 regions vs. 2-4 for competitors)',
          'AI-driven field-level optimization with regulatory precedent justification',
          'Permanent knowledge retention from academic sources',
          '1-day implementation vs. 2-6 weeks for competitors',
          'Explainable AI recommendations improve FDA submission confidence',
        ],
        roiComparison: {
          timeSavings: {
            trialSage: '5 weeks',
            medidata: '2 weeks',
            clario: '1 week',
            veeva: '2 weeks',
          },
          costSavings: {
            trialSage: '$38,000',
            medidata: '$15,000',
            clario: '$8,000',
            veeva: '$12,000',
          },
          implementationTime: {
            trialSage: '1 day',
            medidata: '4-6 weeks',
            clario: '2-3 weeks',
            veeva: '3-4 weeks',
          },
        },
        featureComparison: [
          {
            feature: 'Global Regulatory Intelligence',
            trialSage: '8 regions',
            medidata: '3 regions',
            clario: '2 regions',
            veeva: '4 regions',
          },
          {
            feature: 'Protocol Optimization AI',
            trialSage: 'Advanced',
            medidata: 'Basic',
            clario: 'None',
            veeva: 'Basic',
          },
          {
            feature: 'Academic Knowledge Integration',
            trialSage: 'Full',
            medidata: 'Limited',
            clario: 'None',
            veeva: 'Minimal',
          },
        ],
      },
    },
    {
      id: 'adaptive-design',
      name: 'Adaptive Protocol Design',
      audience: 'Clinical Development VP',
      industryChallenge: {
        problemDescription:
          'VPs struggle to justify adaptive designs to boards/investors despite 30% efficiency gains due to lack of evidence and complex statistics.',
        legacyCost: 50000,
        timelineWeeks: 8,
        limitations: [
          'Requires specialized statistical consultants',
          'Difficult to explain to stakeholders',
          'Hard to estimate power calculations',
        ],
      },
      trialSageSolution: {
        modules: [
          'CSR Analytics',
          'Adaptive Design Simulator',
          'Endpoint Recommender',
          'Board Presentation Builder',
        ],
        preFilledInputs: {
          indication: 'Oncology',
          phase: 'Phase 2',
          sample_size: 80,
          duration_weeks: 48,
          primary_endpoint: 'Overall response rate',
        },
        outcomes: {
          timeSavedWeeks: 6,
          costSaved: 60000,
          riskMitigated: 'Improved probability of technical success by 22%',
          fasbCompliance: true,
          fasbJustification:
            'Adaptive design optimization for a specific compound qualifies for capitalization under ASC 730',
        },
        deliverables: [
          'Adaptive design protocol',
          'Statistical simulation report',
          'Decision criteria documentation',
          'Executive presentation with financial models',
          'Regulatory precedent table',
        ],
      },
      competitiveAnalysis: {
        summary:
          "In Adaptive Protocol Design, Concept2Cure's key advantage over competitors is its advanced statistical simulation capabilities combined with version-aware protocol tracking. While Medidata offers strong synthetic control arms and Clario provides endpoint expertise, only Concept2Cure delivers comprehensive academic knowledge integration and explainable AI recommendations for adaptive design parameters. The platform's permanent knowledge retention ensures that each adaptive design builds upon institutional learning, unlike competitors where insights aren't retained between sessions. This results in a 22% improvement in success probability and 60% cost reduction compared to specialized statistical consultants.",
        advantages: [
          'Advanced statistical simulation with transparent model documentation',
          'Version-aware protocol tracking not available in competitor platforms',
          'Comprehensive documentation for stakeholder presentations',
          'Knowledge retention across multiple adaptive designs',
          'Higher success probability with explainable recommendations',
        ],
        roiComparison: {
          timeSavings: {
            trialSage: '6 weeks',
            medidata: '3 weeks',
            clario: '1 week',
            veeva: '2 weeks',
          },
          costSavings: {
            trialSage: '$60,000',
            medidata: '$25,000',
            clario: '$10,000',
            veeva: '$20,000',
          },
          implementationTime: {
            trialSage: '1 day',
            medidata: '6-8 weeks',
            clario: '3-4 weeks',
            veeva: '4-6 weeks',
          },
        },
        featureComparison: [
          {
            feature: 'Adaptive Design Simulation',
            trialSage: 'Advanced',
            medidata: 'Basic',
            clario: 'None',
            veeva: 'Limited',
          },
          {
            feature: 'Executive Presentation Support',
            trialSage: 'Comprehensive',
            medidata: 'Limited',
            clario: 'None',
            veeva: 'Basic',
          },
          {
            feature: 'Board-Level Visualization',
            trialSage: 'Advanced',
            medidata: 'Basic',
            clario: 'None',
            veeva: 'Basic',
          },
        ],
      },
    },
    {
      id: 'endpoint-optimization',
      name: 'Endpoint Selection & Optimization',
      audience: 'Medical Directors',
      industryChallenge: {
        problemDescription:
          'Medical Directors spend weeks debating endpoints while missing competitive precedents, leading to weak statistical plans.',
        legacyCost: 25000,
        timelineWeeks: 4,
        limitations: [
          'Subjective endpoint selection',
          'Limited awareness of competitor choices',
          'Weak statistical justification',
        ],
      },
      trialSageSolution: {
        modules: [
          'Endpoint Intelligence Engine',
          'Competitor Analysis',
          'Protocol Optimizer',
          'SAP Generator',
        ],
        preFilledInputs: {
          indication: 'Type 2 Diabetes',
          phase: 'Phase 2b',
          sample_size: 120,
          duration_weeks: 24,
          primary_endpoint: 'HbA1c reduction',
        },
        outcomes: {
          timeSavedWeeks: 3,
          costSaved: 22000,
          riskMitigated: 'Increased alignment with regulatory precedent',
          fasbCompliance: true,
          fasbJustification:
            'Endpoint optimization and selection for a specific protocol qualifies for capitalization',
        },
        deliverables: [
          'Endpoint selection report',
          'Competitor benchmark analysis',
          'Statistical power justification',
          'Regulatory precedent analysis',
          'Timeline impact assessment',
        ],
      },
      competitiveAnalysis: {
        summary:
          "For Endpoint Selection & Optimization, Concept2Cure delivers unmatched competitive intelligence through its comprehensive CSR database with advanced semantic search capabilities. While competitors offer basic benchmarking, only Concept2Cure provides field-specific endpoint optimization with regulatory precedent matching across 8 global regions. The platform's Hugging Face integration enables deeper analysis of endpoint selection impact on trial success, with permanent knowledge retention to build organizational expertise. This delivers 3-week timeline acceleration and $22,000 cost savings compared to traditional approaches, with higher confidence in regulatory acceptance.",
        advantages: [
          'Comprehensive endpoint database from global regulatory sources',
          'Field-level analysis of endpoint selection on success probability',
          'Regulatory precedent matching across 8 global regions',
          'Semantic search capabilities for deeper competitive insights',
          'Permanent knowledge retention for therapeutic area specialization',
        ],
        roiComparison: {
          timeSavings: {
            trialSage: '3 weeks',
            medidata: '1 week',
            clario: '0.5 weeks',
            veeva: '1 week',
          },
          costSavings: {
            trialSage: '$22,000',
            medidata: '$10,000',
            clario: '$5,000',
            veeva: '$8,000',
          },
          implementationTime: {
            trialSage: '1 day',
            medidata: '3-5 weeks',
            clario: '2-3 weeks',
            veeva: '3-4 weeks',
          },
        },
        featureComparison: [
          {
            feature: 'Endpoint Success Correlation',
            trialSage: 'Advanced',
            medidata: 'Basic',
            clario: 'Basic',
            veeva: 'None',
          },
          {
            feature: 'Statistical Power Justification',
            trialSage: 'Comprehensive',
            medidata: 'Limited',
            clario: 'Basic',
            veeva: 'None',
          },
          {
            feature: 'Competitive Endpoint Analysis',
            trialSage: 'Deep',
            medidata: 'Basic',
            clario: 'Limited',
            veeva: 'Basic',
          },
        ],
      },
    },
  ];

  /**
   * Get a list of available strategic use cases
   */
  getStrategicUseCases(): StrategicUseCase[] {
    return this.strategicUseCases;
  }

  /**
   * Get detailed information about a specific use case
   */
  getUseCaseById(id: string): StrategicUseCase | undefined {
    return this.strategicUseCases.find(useCase => useCase.id === id);
  }

  /**
   * Get industry benchmarks for financial analysis
   */
  getIndustryBenchmarks(): IndustryBenchmark[] {
    return this.industryBenchmarks;
  }

  /**
   * Get FASB compliance information for a specified activity
   */
  getFasbCompliance(activity: string): string {
    const activityKey = activity.toLowerCase().replace(/\s+/g, '_');
    return (
      this.fasbGuidelines[activityKey] ||
      'General R&D costs must be expensed as incurred under ASC 730 unless they have an alternative future use.'
    );
  }

  /**
   * Generate strategic insights for a protocol
   */
  generateStrategicInsights(protocolData: any): any {
    // Extract key protocol parameters
    const { indication, phase, sample_size, duration_weeks } = protocolData;

    // Calculate estimated costs based on industry benchmarks
    const traditionalApproach = this.estimateTraditionalCosts(phase, sample_size, duration_weeks);

    // Find relevant use case to align insights
    const relevantUseCase = this.findRelevantUseCase(indication, phase);

    // Generate financial and strategic insights
    const financialInsights = this.generateFinancialInsights(
      phase,
      sample_size,
      duration_weeks,
      traditionalApproach
    );

    // Generate FASB compliance insights
    const fasbInsights = this.generateFasbInsights(protocolData);

    return {
      traditionalApproach,
      financialInsights,
      fasbInsights,
      relevantUseCase: relevantUseCase
        ? {
            name: relevantUseCase.name,
            audience: relevantUseCase.audience,
            savings: relevantUseCase.trialSageSolution.outcomes,
          }
        : null,
    };
  }

  /**
   * Estimate traditional consultant costs for protocol development
   */
  private estimateTraditionalCosts(
    phase: string,
    sampleSize: number,
    durationWeeks: number
  ): Record<string, any> {
    // Base consultant cost from industry benchmarks
    let consultantCost = 35000; // Default

    // Adjust based on phase
    if (phase.includes('1')) {
      consultantCost = 30000;
    } else if (phase.includes('2')) {
      consultantCost = 45000;
    } else if (phase.includes('3')) {
      consultantCost = 65000;
    }

    // Adjust based on complexity (sample size and duration)
    const complexityFactor = Math.sqrt(sampleSize / 100) * Math.sqrt(durationWeeks / 24);
    consultantCost *= complexityFactor;

    // Calculate timeline
    const traditionalTimelineWeeks = 4 + (phase.includes('3') ? 8 : phase.includes('2') ? 6 : 4);

    // Calculate daily costs based on phase
    let dailyCost = 7829; // Default Phase 1
    if (phase.includes('2')) {
      dailyCost = 23737;
    } else if (phase.includes('3')) {
      dailyCost = 55716;
    }

    // Calculate potential operational costs
    const operationalCostPerDay = dailyCost;
    const potentialDelayDays = 30; // Assume 30 days of potential delay
    const potentialDelayCost = operationalCostPerDay * potentialDelayDays;

    return {
      consultantCost: Math.round(consultantCost),
      timelineWeeks: traditionalTimelineWeeks,
      potentialDelayCost: Math.round(potentialDelayCost),
      dailyOperationalCost: dailyCost,
    };
  }

  /**
   * Find the most relevant use case for the protocol
   */
  private findRelevantUseCase(indication: string, phase: string): StrategicUseCase | undefined {
    // Find a use case that matches the indication and phase
    return this.strategicUseCases.find(useCase => {
      const useCaseIndication = useCase.trialSageSolution.preFilledInputs.indication.toLowerCase();
      const useCasePhase = useCase.trialSageSolution.preFilledInputs.phase.toLowerCase();

      return (
        useCasePhase.includes(phase.toLowerCase()) ||
        useCaseIndication.includes(indication.toLowerCase())
      );
    });
  }

  /**
   * Generate financial insights for the protocol
   */
  private generateFinancialInsights(
    phase: string,
    sampleSize: number,
    durationWeeks: number,
    traditionalApproach: Record<string, any>
  ): FastFinancialInsight[] {
    const insights: FastFinancialInsight[] = [];

    // Protocol design savings
    insights.push({
      activity: 'Protocol Design Optimization',
      isFasbCompliant: true,
      justification:
        'Optimized protocol design for a specific compound qualifies for capitalization under ASC 730',
      estimatedCostSavings: Math.round(traditionalApproach.consultantCost * 0.7),
      timelineSavings: Math.round(traditionalApproach.timelineWeeks * 0.6),
    });

    // Statistical planning savings
    insights.push({
      activity: 'Statistical Analysis Planning',
      isFasbCompliant: true,
      justification: 'SAP development for a specific protocol can be capitalized under ASC 730',
      estimatedCostSavings: 15000,
      timelineSavings: 2,
    });

    // Operational efficiency
    insights.push({
      activity: 'Operational Efficiency',
      isFasbCompliant: false,
      justification: 'General operational savings must be expensed as incurred under ASC 730',
      estimatedCostSavings: Math.round(traditionalApproach.potentialDelayCost * 0.5),
      timelineSavings: Math.round(durationWeeks * 0.1),
    });

    // Risk mitigation
    insights.push({
      activity: 'Risk Mitigation & Compliance',
      isFasbCompliant: true,
      justification: 'Risk mitigation specific to a development program can be capitalized',
      estimatedCostSavings: Math.round(traditionalApproach.consultantCost * 0.3),
      timelineSavings: 1,
    });

    return insights;
  }

  /**
   * Generate FASB compliance insights for the protocol
   */
  private generateFasbInsights(protocolData: any): Record<string, any> {
    // Determine if the protocol has specificity for capitalization
    const hasSpecificity = !!protocolData.compound_name || !!protocolData.product_id;

    // Get relevant guidelines
    const relevantGuidelines = [
      this.fasbGuidelines.protocol_design,
      this.fasbGuidelines.sap_generation,
    ];

    // Determine capitalization percentage
    const capitalizationPct = hasSpecificity ? 85 : 30;

    return {
      canCapitalize: capitalizationPct > 50,
      capitalizationPct,
      relevantGuidelines,
      taxImplications:
        'Under the Tax Cuts and Jobs Act, R&D costs must be capitalized and amortized over 5 years, affecting cash flow and financial statements',
      recommendation: hasSpecificity
        ? 'Document protocol specificity to maximize capitalization eligibility'
        : 'Add compound-specific details to protocol to improve capitalization eligibility',
    };
  }
}

export const strategicIntelligenceService = new StrategicIntelligenceService();
