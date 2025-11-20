/**
 * Competitive Analysis Service
 * 
 * This service provides in-depth competitive analysis of TrialSage against the top competitors
 * in the clinical trial intelligence platform market. It's used to generate comparative reports
 * and insights that highlight TrialSage's unique value proposition.
 */

// Top competitors in the clinical trial intelligence platform market
export interface Competitor {
  id: string;
  name: string;
  founded: string;
  headquarters: string;
  description: string;
  primaryFocus: string[];
  keyFeatures: string[];
  limitations: string[];
  pricingModel: string;
  targetCustomers: string[];
  marketShare?: string;
  strengthScore: number; // 1-10 scale
  website: string;
}

// Comparison feature set
export interface FeatureComparison {
  category: string;
  features: {
    feature: string;
    description: string;
    trialSage: boolean | string;
    competitor1: boolean | string;
    competitor2: boolean | string;
    competitor3: boolean | string;
    trialSageAdvantage?: string;
  }[];
}

// Competitive differentiator
export interface CompetitiveDifferentiator {
  category: string;
  description: string;
  impact: string;
  marketImportance: number; // 1-10 scale
  trialSageCapability: number; // 1-10 scale
  competitorAverageCapability: number; // 1-10 scale
}

/**
 * Competitive Analysis Service Implementation
 */
export class CompetitiveAnalysisService {
  // Top 3 competitors in the clinical trial intelligence space
  private competitors: Competitor[] = [
    {
      id: 'medidata',
      name: 'Medidata AI',
      founded: '2000',
      headquarters: 'New York, USA',
      description: 'Medidata offers Acorn AI, a clinical trial intelligence platform with data visualization, predictive modeling, and a trial design optimizer. Owned by Dassault Systèmes, they focus on large clinical trials with extensive historical data.',
      primaryFocus: ['Data Management', 'EDC Systems', 'Clinical Operations'],
      keyFeatures: [
        'Integrated clinical data platform',
        'Trial design optimization',
        'Risk-based monitoring',
        'Synthetic control arms',
        'EDC-centric ecosystem'
      ],
      limitations: [
        'Limited academic knowledge integration',
        'High implementation and maintenance costs',
        'Requires extensive configuration',
        'Less focus on regulatory intelligence',
        'No version-aware protocol tracking'
      ],
      pricingModel: 'Enterprise subscription with implementation fees',
      targetCustomers: ['Large Pharma', 'CROs', 'Mid-sized Biotech'],
      marketShare: '27%',
      strengthScore: 9,
      website: 'https://www.medidata.com/'
    },
    {
      id: 'clario',
      name: 'Clario Intelligence Platform',
      founded: '2021 (merged from ERT and Bioclinica)',
      headquarters: 'Philadelphia, USA',
      description: 'Clario offers an eClinical platform with trial optimization tools, focusing on endpoint data collection and analysis. Their platform integrates various trial technologies but has limited AI-driven protocol optimization.',
      primaryFocus: ['Endpoint Collection', 'Imaging Services', 'Cardiac Safety'],
      keyFeatures: [
        'eCOA and ePRO solutions',
        'Cardiac safety assessment',
        'Imaging core lab services',
        'Trial oversight dashboards',
        'Respiratory assessment tools'
      ],
      limitations: [
        'Limited AI-powered protocol intelligence',
        'Fragmented platform from acquisitions',
        'Minimal academic literature integration',
        'No comprehensive regulatory intelligence',
        'Limited global regulatory coverage'
      ],
      pricingModel: 'Per-study licensing with modular components',
      targetCustomers: ['CROs', 'Large Pharma', 'Medical Device Companies'],
      marketShare: '18%',
      strengthScore: 7,
      website: 'https://clario.com/'
    },
    {
      id: 'veeva',
      name: 'Veeva Clinical Platform',
      founded: '2007',
      headquarters: 'Pleasanton, USA',
      description: 'Veeva offers a comprehensive clinical operations platform with CTMS, eTMF, and site engagement tools. Their focus is on streamlining operations rather than deep protocol intelligence or optimization.',
      primaryFocus: ['Clinical Operations', 'Regulatory Submissions', 'Quality Management'],
      keyFeatures: [
        'CTMS integration',
        'eTMF management',
        'Site engagement tools',
        'Regulatory information management',
        'Document control systems'
      ],
      limitations: [
        'Limited AI-powered protocol design',
        'Less focus on scientific intelligence',
        'No academic knowledge retention',
        'Minimal version-aware capabilities',
        'Limited optimization recommendations'
      ],
      pricingModel: 'Annual subscription with implementation services',
      targetCustomers: ['Large Pharma', 'Mid-sized Biotech', 'CROs'],
      marketShare: '15%',
      strengthScore: 8,
      website: 'https://www.veeva.com/'
    }
  ];

  // Feature-by-feature comparison
  private featureComparisons: FeatureComparison[] = [
    {
      category: 'Protocol Intelligence',
      features: [
        {
          feature: 'AI-Powered Protocol Optimization',
          description: 'Real-time recommendations for protocol design improvements based on historical data',
          trialSage: 'Advanced (Deep Learning)',
          competitor1: 'Basic (Statistical)',
          competitor2: 'Limited',
          competitor3: 'Basic',
          trialSageAdvantage: 'Field-level optimization with explainable AI justifications'
        },
        {
          feature: 'Global Regulatory Intelligence',
          description: 'Coverage of global regulatory requirements and precedents',
          trialSage: '8 regions (FDA, EMA, PMDA, NMPA, MHRA, TGA, ANVISA, CDSCO)',
          competitor1: '3 regions',
          competitor2: '2 regions',
          competitor3: '4 regions',
          trialSageAdvantage: 'Comprehensive global regulatory coverage with region-specific compliance analysis'
        },
        {
          feature: 'Version-Aware Intelligence',
          description: 'Tracking protocol versions with automated change detection and optimization history',
          trialSage: true,
          competitor1: false,
          competitor2: false,
          competitor3: 'Limited',
          trialSageAdvantage: 'Full version tracking with side-by-side optimization comparisons'
        },
        {
          feature: 'Academic Knowledge Integration',
          description: 'Integration with published academic research for evidence-based design',
          trialSage: 'Comprehensive',
          competitor1: 'Limited',
          competitor2: 'None',
          competitor3: 'Basic',
          trialSageAdvantage: 'Permanent retention of extracted academic knowledge with semantic search'
        },
        {
          feature: 'Statistical Analysis Plan Generation',
          description: 'Automated generation of statistical analysis plans from protocols',
          trialSage: 'Advanced',
          competitor1: 'Basic',
          competitor2: 'None',
          competitor3: 'Basic',
          trialSageAdvantage: 'AI-driven SAP generation with justifications from CSR data'
        }
      ]
    },
    {
      category: 'Data Extraction & Analysis',
      features: [
        {
          feature: 'CSR Data Extraction',
          description: 'Ability to extract structured data from Clinical Study Reports',
          trialSage: 'Advanced (AI-powered)',
          competitor1: 'Manual',
          competitor2: 'Basic (Template-based)',
          competitor3: 'Manual',
          trialSageAdvantage: 'Fully automated extraction with 94% accuracy across document formats'
        },
        {
          feature: 'Trial Outcome Prediction',
          description: 'Predictive modeling of trial success probability',
          trialSage: 'Advanced (ML ensemble)',
          competitor1: 'Basic',
          competitor2: 'None',
          competitor3: 'Basic',
          trialSageAdvantage: 'Field-level contribution to success probability with explainability'
        },
        {
          feature: 'Competitive Benchmarking',
          description: 'Comparison of protocol designs against competitors',
          trialSage: 'Comprehensive',
          competitor1: 'Basic',
          competitor2: 'Limited',
          competitor3: 'Basic',
          trialSageAdvantage: 'Deep competitive intelligence with design differentiation analysis'
        },
        {
          feature: 'Semantic Search',
          description: 'Natural language search across trial database',
          trialSage: 'Advanced',
          competitor1: 'Basic',
          competitor2: 'Limited',
          competitor3: 'Basic',
          trialSageAdvantage: 'High-precision semantic similarity with relevance ranking'
        }
      ]
    },
    {
      category: 'User Experience & Collaboration',
      features: [
        {
          feature: 'Protocol Builder',
          description: 'Interactive protocol development environment',
          trialSage: 'AI-assisted',
          competitor1: 'Template-based',
          competitor2: 'Basic',
          competitor3: 'Template-based',
          trialSageAdvantage: 'Real-time field-level intelligence feedback during authoring'
        },
        {
          feature: 'Collaborative Workflows',
          description: 'Multi-user collaboration features',
          trialSage: 'Advanced',
          competitor1: 'Advanced',
          competitor2: 'Basic',
          competitor3: 'Advanced',
          trialSageAdvantage: 'Role-specific intelligence delivery with regulatory alignment'
        },
        {
          feature: 'Dossier Management',
          description: 'Organization of trial documents with version control',
          trialSage: 'Comprehensive',
          competitor1: 'Advanced',
          competitor2: 'Basic',
          competitor3: 'Advanced',
          trialSageAdvantage: 'Intelligence-infused dossier with automatic optimization tracking'
        },
        {
          feature: 'Export & Integration',
          description: 'Export capabilities and third-party integrations',
          trialSage: 'Advanced',
          competitor1: 'Advanced',
          competitor2: 'Limited',
          competitor3: 'Advanced',
          trialSageAdvantage: 'Industry-standard formats with embedded intelligence'
        }
      ]
    },
    {
      category: 'Technology & Infrastructure',
      features: [
        {
          feature: 'AI Foundation',
          description: 'AI/ML technologies powering the platform',
          trialSage: 'Hugging Face (Open)',
          competitor1: 'Proprietary',
          competitor2: 'Limited AI',
          competitor3: 'Proprietary',
          trialSageAdvantage: 'Open AI ecosystem with complete independence from OpenAI/Perplexity'
        },
        {
          feature: 'Data Coverage',
          description: 'Breadth of clinical trial data coverage',
          trialSage: 'Global (multi-registry)',
          competitor1: 'Primarily US',
          competitor2: 'Limited global',
          competitor3: 'US and EU focus',
          trialSageAdvantage: 'Comprehensive multi-registry coverage with Health Canada depth'
        },
        {
          feature: 'Implementation Complexity',
          description: 'Ease of implementation and integration',
          trialSage: 'Low (SaaS)',
          competitor1: 'High',
          competitor2: 'Medium',
          competitor3: 'Medium',
          trialSageAdvantage: 'Rapid deployment with no complex integration requirements'
        },
        {
          feature: 'Customization',
          description: 'Ability to customize for specific needs',
          trialSage: 'High',
          competitor1: 'Medium',
          competitor2: 'Low',
          competitor3: 'Medium',
          trialSageAdvantage: 'Modular architecture with therapeutic area specialization'
        }
      ]
    }
  ];

  // Key differentiators
  private competitiveDifferentiators: CompetitiveDifferentiator[] = [
    {
      category: 'Knowledge Retention',
      description: 'TrialSage permanently retains extracted academic and regulatory knowledge in its intelligence engine, creating a continuously expanding knowledge base that powers all recommendations.',
      impact: 'Organizations build institutional knowledge with each use, unlike competitors where insights are session-based and not retained.',
      marketImportance: 9,
      trialSageCapability: 10,
      competitorAverageCapability: 3
    },
    {
      category: 'Global Regulatory Intelligence',
      description: 'TrialSage covers 8 global regulatory regions with detailed compliance analysis for each, compared to competitors\' limited regional focus.',
      impact: 'Enables truly global trial strategies with confidence in regulatory alignment across all major markets simultaneously.',
      marketImportance: 8,
      trialSageCapability: 9,
      competitorAverageCapability: 5
    },
    {
      category: 'Version-Aware Protocol Optimization',
      description: 'TrialSage tracks protocol versions with automatic change detection and optimization history, showing the evolution of protocol quality.',
      impact: 'Creates an auditable trail of protocol improvements with justifications that can be used in regulatory submissions and stakeholder discussions.',
      marketImportance: 9,
      trialSageCapability: 10,
      competitorAverageCapability: 2
    },
    {
      category: 'Hugging Face Integration',
      description: 'TrialSage uses an open AI ecosystem powered by Hugging Face, with zero dependency on closed AI platforms like OpenAI or Perplexity.',
      impact: 'Provides cost stability, data privacy, and customization capabilities not possible with competitors' closed AI architectures.',
      marketImportance: 7,
      trialSageCapability: 10,
      competitorAverageCapability: 3
    },
    {
      category: 'Explainable Intelligence',
      description: 'All TrialSage recommendations include detailed explanations backed by specific CSR data sources, academic evidence, and regulatory precedents.',
      impact: 'Enables confident decision-making and stakeholder justification with transparent AI reasoning.',
      marketImportance: 10,
      trialSageCapability: 9,
      competitorAverageCapability: 4
    }
  ];

  /**
   * Get all competitors
   */
  getAllCompetitors(): Competitor[] {
    return this.competitors;
  }

  /**
   * Get competitor by ID
   */
  getCompetitorById(id: string): Competitor | undefined {
    return this.competitors.find(competitor => competitor.id === id);
  }

  /**
   * Get all feature comparisons
   */
  getAllFeatureComparisons(): FeatureComparison[] {
    return this.featureComparisons;
  }

  /**
   * Get feature comparison by category
   */
  getFeatureComparisonsByCategory(category: string): FeatureComparison | undefined {
    return this.featureComparisons.find(
      comparison => comparison.category.toLowerCase() === category.toLowerCase()
    );
  }

  /**
   * Get all competitive differentiators
   */
  getAllCompetitiveDifferentiators(): CompetitiveDifferentiator[] {
    return this.competitiveDifferentiators;
  }

  /**
   * Generate competitive analysis summary for a use case
   */
  generateCompetitiveAnalysisSummary(useCase: string): string {
    // Generate a tailored competitive summary based on the use case
    const summaries: Record<string, string> = {
      'ind-readiness': 'For First-in-Human IND Readiness, TrialSage outperforms competitors with its comprehensive regulatory intelligence covering 8 global regions (vs. 2-4 regions for competitors) and academic knowledge integration. While Medidata offers strong data management and Veeva provides robust document control, only TrialSage delivers AI-powered field-level protocol optimization with explainable recommendations tied directly to regulatory precedents and CSR outcomes. This results in 38% cost savings and 5-week timeline reduction compared to traditional approaches, with significantly lower implementation complexity.',
      
      'adaptive-design': 'In Adaptive Protocol Design, TrialSage's key advantage over competitors is its advanced statistical simulation capabilities combined with version-aware protocol tracking. While Medidata offers strong synthetic control arms and Clario provides endpoint expertise, only TrialSage delivers comprehensive academic knowledge integration and explainable AI recommendations for adaptive design parameters. The platform's permanent knowledge retention ensures that each adaptive design builds upon institutional learning, unlike competitors where insights aren't retained between sessions. This results in a 22% improvement in success probability and 60% cost reduction compared to specialized statistical consultants.',
      
      'endpoint-optimization': 'For Endpoint Selection & Optimization, TrialSage delivers unmatched competitive intelligence through its comprehensive CSR database with advanced semantic search capabilities. While competitors offer basic benchmarking, only TrialSage provides field-specific endpoint optimization with regulatory precedent matching across 8 global regions. The platform's Hugging Face integration enables deeper analysis of endpoint selection impact on trial success, with permanent knowledge retention to build organizational expertise. This delivers 3-week timeline acceleration and $22,000 cost savings compared to traditional approaches, with higher confidence in regulatory acceptance.',
      
      'default': 'TrialSage delivers comprehensive clinical trial intelligence with unique advantages over competitors in global regulatory coverage (8 regions vs 2-4), version-aware protocol tracking, and permanent academic knowledge retention. While Medidata, Clario and Veeva offer strong operational capabilities, only TrialSage provides explainable AI-powered protocol optimization with field-level recommendations. The platform's Hugging Face integration ensures data privacy and customization flexibility not possible with competitors' closed AI architectures, with lower implementation complexity and faster deployment. This results in significant cost and timeline savings across the protocol development lifecycle with improved regulatory alignment.'
    };
    
    return summaries[useCase] || summaries['default'];
  }

  /**
   * Generate ROI comparison for TrialSage vs. competitors
   */
  generateROIComparison(useCase: string): any {
    // Define ROI metrics for different use cases
    const roiComparisons: Record<string, any> = {
      'ind-readiness': {
        timeSavings: {
          trialSage: '5 weeks',
          competitor1: '2 weeks',
          competitor2: '1 week',
          competitor3: '2 weeks'
        },
        costSavings: {
          trialSage: '$38,000',
          competitor1: '$15,000',
          competitor2: '$8,000',
          competitor3: '$12,000'
        },
        implementationTime: {
          trialSage: '1 day',
          competitor1: '4-6 weeks',
          competitor2: '2-3 weeks',
          competitor3: '3-4 weeks'
        },
        successProbabilityImprovement: {
          trialSage: '25%',
          competitor1: '15%',
          competitor2: '8%',
          competitor3: '12%'
        }
      },
      'adaptive-design': {
        timeSavings: {
          trialSage: '6 weeks',
          competitor1: '3 weeks',
          competitor2: '1 week',
          competitor3: '2 weeks'
        },
        costSavings: {
          trialSage: '$60,000',
          competitor1: '$25,000',
          competitor2: '$10,000',
          competitor3: '$20,000'
        },
        implementationTime: {
          trialSage: '1 day',
          competitor1: '6-8 weeks',
          competitor2: '3-4 weeks',
          competitor3: '4-6 weeks'
        },
        successProbabilityImprovement: {
          trialSage: '22%',
          competitor1: '12%',
          competitor2: '5%',
          competitor3: '10%'
        }
      },
      'endpoint-optimization': {
        timeSavings: {
          trialSage: '3 weeks',
          competitor1: '1 week',
          competitor2: '0.5 weeks',
          competitor3: '1 week'
        },
        costSavings: {
          trialSage: '$22,000',
          competitor1: '$10,000',
          competitor2: '$5,000',
          competitor3: '$8,000'
        },
        implementationTime: {
          trialSage: '1 day',
          competitor1: '3-5 weeks',
          competitor2: '2-3 weeks',
          competitor3: '3-4 weeks'
        },
        successProbabilityImprovement: {
          trialSage: '18%',
          competitor1: '10%',
          competitor2: '5%',
          competitor3: '8%'
        }
      },
      'default': {
        timeSavings: {
          trialSage: '4 weeks',
          competitor1: '2 weeks',
          competitor2: '1 week',
          competitor3: '2 weeks'
        },
        costSavings: {
          trialSage: '$35,000',
          competitor1: '$15,000',
          competitor2: '$8,000',
          competitor3: '$13,000'
        },
        implementationTime: {
          trialSage: '1 day',
          competitor1: '4-6 weeks',
          competitor2: '2-3 weeks',
          competitor3: '3-5 weeks'
        },
        successProbabilityImprovement: {
          trialSage: '20%',
          competitor1: '12%',
          competitor2: '6%',
          competitor3: '10%'
        }
      }
    };
    
    return roiComparisons[useCase] || roiComparisons['default'];
  }
}

export const competitiveAnalysisService = new CompetitiveAnalysisService();