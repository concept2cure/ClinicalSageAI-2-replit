/**
 * Strategic Intelligence Report Template
 *
 * This template defines the structure for generating comprehensive
 * strategic intelligence reports based on protocol data and CSR matches.
 * It can be used to generate dashboard views, PDFs, and executive summaries.
 */

const strategicReportTemplate = {
  /**
   * Report metadata and general information
   */
  metadata: {
    reportId: 'String - Unique identifier for the report',
    title: 'String - Protocol title or custom report name',
    generatedDate: 'Date - When the report was generated',
    version: 'String - Report version',
    protocolId: 'String - Associated protocol ID if applicable',
    indication: 'String - Primary medical indication',
    phase: 'String - Trial phase (e.g., Phase 1, Phase 2, Phase 3)',
    sponsor: 'String - Sponsoring organization',
    confidentialityLevel: 'String - Confidentiality classification',
  },

  /**
   * Executive summary with key findings and recommendations
   */
  executiveSummary: {
    overview: 'String - Brief overview of the protocol/study design',
    keyFindings: ['String[] - List of key insights and findings'],
    strategicRecommendations: ['String[] - High-level recommendations'],
    decisionMatrix: {
      riskAssessment: 'String - Overall risk assessment (Low/Medium/High)',
      timeToMarket: 'String - Estimated timeline assessment',
      competitivePosition: 'String - Market position assessment',
      regulatoryOutlook: 'String - Regulatory approval assessment',
    },
  },

  /**
   * Historical benchmarking based on CSR matches
   */
  historicalBenchmarking: {
    matchingCriteria: {
      indication: 'String - Matched indication',
      phase: 'String - Matched phase',
      additionalFilters: ['String[] - Any additional filters applied'],
    },
    relevantPrecedents: [
      {
        csrId: 'String - CSR identifier',
        title: 'String - Trial title',
        sponsor: 'String - Sponsoring organization',
        phase: 'String - Trial phase',
        year: 'Number - Study year',
        sampleSize: 'Number - Total participants',
        duration: "String - Trial duration (e.g., '24 weeks')",
        status: "String - Study status (e.g., 'Completed', 'Terminated')",
        outcome: "String - Overall outcome (e.g., 'Positive', 'Negative')",
        regulatoryStatus: 'String - Regulatory status if applicable',
      },
    ],
    benchmarkMetrics: {
      medianSampleSize: 'Number - Median sample size from precedents',
      sampleSizeRange: "String - Sample size range (e.g., '150-300')",
      medianDuration: 'String - Median study duration',
      durationRange: 'String - Duration range',
      successRate: 'Number - Success rate percentage',
      averageDropoutRate: 'Number - Average dropout rate percentage',
      commonRegulatoryChallenges: ['String[] - Common regulatory issues noted'],
    },
  },

  /**
   * Endpoint benchmarking and analysis
   */
  endpointBenchmarking: {
    primaryEndpoints: [
      {
        name: 'String - Endpoint name',
        frequencyScore: 'Number - How frequently used (0-100)',
        successRate: 'Number - Success rate percentage',
        timeToResult: 'String - Typical time to endpoint measurement',
        regulatoryAcceptance: 'String - Level of regulatory acceptance',
        predecessorUse: [
          {
            csrId: 'String - CSR identifier',
            specificDefinition: 'String - Exact endpoint definition used',
            outcome: 'String - Outcome for this endpoint',
          },
        ],
      },
    ],
    secondaryEndpoints: [
      {
        name: 'String - Endpoint name',
        frequencyScore: 'Number - How frequently used (0-100)',
        successRate: 'Number - Success rate percentage',
        correlationWithPrimary: 'String - Correlation level with primary endpoints',
        regulatoryValue: 'String - Value for regulatory submission',
        predecessorUse: [
          {
            csrId: 'String - CSR identifier',
            specificDefinition: 'String - Exact endpoint definition used',
            outcome: 'String - Outcome for this endpoint',
          },
        ],
      },
    ],
    endpointRecommendations: [
      {
        recommendation: 'String - Specific recommendation',
        confidence: 'String - Confidence level (High/Medium/Low)',
        rationale: 'String - Reasoning behind recommendation',
        supportingEvidence: 'String - Evidence supporting this recommendation',
      },
    ],
  },

  /**
   * Design risk prediction and analysis
   */
  designRiskPrediction: {
    overallRiskScore: 'Number - Overall risk score (0-100)',
    riskCategories: [
      {
        category: 'String - Risk category name',
        score: 'Number - Category risk score (0-100)',
        keyFactors: ['String[] - Factors influencing this risk'],
        mitigationStrategies: ['String[] - Suggested mitigation strategies'],
      },
    ],
    sensitivityAnalysis: {
      sampleSizeSensitivity: {
        recommendedSampleSize: 'Number - Recommended sample size',
        powerAnalysisDetails: {
          effect: 'Number - Expected effect size',
          power: 'Number - Statistical power at recommended sample size',
          alpha: 'Number - Alpha level used',
          adjustments: ['String[] - Any adjustments applied'],
        },
        scenarioAnalysis: [
          {
            scenario: 'String - Scenario description',
            sampleSize: 'Number - Sample size for this scenario',
            power: 'Number - Resulting statistical power',
            recommendation: 'String - Recommendation for this scenario',
          },
        ],
      },
      dropoutRiskAnalysis: {
        predictedDropoutRate: 'Number - Predicted dropout rate percentage',
        factors: ['String[] - Factors influencing dropout'],
        recommendations: ['String[] - Recommendations to address dropout'],
      },
    },
    virtualTrialSimulation: {
      summary: 'String - Simulation summary',
      simulationParameters: {
        baselineSampleSize: 'Number - Base sample size used',
        endpointsModeled: ['String[] - Endpoints included in simulation'],
        assumptionsApplied: ['String[] - Key assumptions made'],
      },
      outcomes: [
        {
          scenario: 'String - Scenario description',
          probabilityOfSuccess: 'Number - Success probability percentage',
          confidenceInterval: 'String - Confidence interval',
          keySensitivities: ['String[] - Key sensitivities in this scenario'],
        },
      ],
    },
  },

  /**
   * Competitive landscape analysis
   */
  competitiveLandscape: {
    marketOverview: 'String - Overview of the competitive landscape',
    keyCompetitors: [
      {
        name: 'String - Competitor name',
        phase: 'String - Current development phase',
        differentiators: ['String[] - Key differences from proposed trial'],
        timeToMarket: 'String - Estimated time to market',
        threatLevel: 'String - Competitive threat assessment',
      },
    ],
    comparativeAnalysis: {
      strengthsVsCompetitors: ['String[] - Relative strengths'],
      weaknessesVsCompetitors: ['String[] - Relative weaknesses'],
      opportunitiesVsCompetitors: ['String[] - Strategic opportunities'],
      threatsVsCompetitors: ['String[] - Competitive threats'],
    },
    strategicPositioning: {
      recommendedPositioning: 'String - Recommended market positioning',
      keyDifferentiators: ['String[] - Suggested differentiators to emphasize'],
      strategicAdvantages: ['String[] - Potential strategic advantages'],
    },
  },

  /**
   * AI-powered strategic recommendations
   */
  aiRecommendations: {
    designRecommendations: [
      {
        area: "String - Design area (e.g., 'Sample Size', 'Endpoints')",
        recommendation: 'String - Specific recommendation',
        confidence: 'String - Confidence level (High/Medium/Low)',
        impact: 'String - Expected impact of implementation',
        evidence: 'String - Supporting evidence/precedents',
        implementationNotes: 'String - Implementation guidance',
      },
    ],
    riskMitigationStrategy: {
      keyRisks: ['String[] - Key identified risks'],
      mitigationPlan: [
        {
          risk: 'String - Specific risk',
          mitigationStrategy: 'String - Strategy to mitigate',
          contingencyPlan: 'String - Contingency approach if risk materializes',
        },
      ],
    },
    regulatoryStrategy: {
      keyRegulatoryChallenges: ['String[] - Key regulatory challenges identified'],
      recommendedApproach: 'String - Recommended regulatory approach',
      precedentJustifications: ['String[] - Precedents that support the approach'],
    },
  },

  /**
   * Structured protocol design summary
   */
  protocolDesignSummary: {
    designStructure: {
      title: 'String - Study title',
      population: 'String - Study population description',
      objectives: {
        primary: 'String - Primary objective',
        secondary: ['String[] - Secondary objectives'],
      },
      endpoints: {
        primary: 'String - Primary endpoint',
        secondary: ['String[] - Secondary endpoints'],
      },
      studyDesign: 'String - Overall study design',
      arms: [
        {
          name: 'String - Arm name',
          description: 'String - Arm description',
          size: 'Number - Planned arm size',
        },
      ],
      duration: 'String - Study duration',
      keyProcedures: ['String[] - Key study procedures'],
    },
    statisticalApproach: {
      primaryAnalysis: 'String - Primary statistical analysis approach',
      powerCalculations: 'String - Power and sample size calculations',
      interimAnalyses: 'String - Interim analyses if applicable',
      multiplicityConcerns: 'String - Multiplicity issues and approaches',
    },
    operationalConsiderations: {
      expectedChallenges: ['String[] - Expected operational challenges'],
      mitigationStrategies: ['String[] - Strategies to address challenges'],
      timelineConsiderations: ['String[] - Timeline considerations'],
      budgetImplications: ['String[] - Budget implications'],
    },
  },

  /**
   * Appendices and supporting materials
   */
  appendices: {
    detailedCSRAnalyses: ['String[] - Links to detailed CSR analyses'],
    methodologyDetails: 'String - Details on methodology',
    glossaryOfTerms: 'Object - Key terms and definitions',
    referenceCitations: ['String[] - Reference citations'],
    dataSourcesUsed: ['String[] - Data sources used'],
    supplementaryMaterials: ['String[] - Links to supplementary materials'],
  },
};

module.exports = strategicReportTemplate;
