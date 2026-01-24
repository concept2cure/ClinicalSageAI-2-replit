/**
 * DOCUMENT-SPECIFIC AI SERVICE - SUB-PHASE 1.3 IMPLEMENTATION
 *
 * Enhanced AI service with document type-specific AI models and automated
 * commitment categorization for regulatory document processing.
 *
 * Features:
 * - Specialized AI prompts for each document type (IND, NDA, BLA, CSR)
 * - Automated commitment categorization with regulatory taxonomy
 * - Document-specific risk assessment and priority enhancement
 * - Advanced NLP pattern recognition for regulatory content
 * - Compliance scoring and regulatory framework integration
 */

export class DocumentSpecificAIService {
  constructor() {
    this.documentTypes = {
      IND: 'Investigational New Drug Application',
      NDA: 'New Drug Application',
      BLA: 'Biologics License Application',
      CSR: 'Clinical Study Report',
      GENERIC: 'Generic Regulatory Document',
    };

    this.regulatoryFrameworks = {
      IND: 'FDA 21 CFR 312',
      NDA: 'FDA 21 CFR 314',
      BLA: 'FDA 21 CFR 601',
      CSR: 'ICH E3 Guideline',
    };

    // SUB-PHASE 1.3: Enhanced categorization taxonomy
    this.regulatoryTaxonomy = {
      primary: ['Safety', 'Efficacy', 'Manufacturing', 'Quality', 'Post-Marketing'],
      secondary: {
        Safety: [
          'Adverse Event Reporting',
          'Safety Monitoring',
          'Risk Management',
          'Pharmacovigilance',
        ],
        Efficacy: [
          'Clinical Data',
          'Statistical Analysis',
          'Endpoint Analysis',
          'Biomarker Studies',
        ],
        Manufacturing: [
          'Facility Compliance',
          'Process Validation',
          'Supply Chain',
          'Quality Control',
        ],
        Quality: ['Data Integrity', 'Audit Compliance', 'GCP/GMP', 'Documentation'],
        PostMarketing: ['Phase 4 Studies', 'Real World Evidence', 'Market Surveillance', 'REMS'],
      },
    };

    // SUB-PHASE 1.3: Advanced AI model configurations
    this.modelConfigurations = {
      IND: {
        modelVersion: 'IND_v2.1_specialized',
        temperatureOptimal: 0.2,
        maxTokens: 2500,
        focusKeywords: ['safety', 'protocol', 'clinical', 'monitoring', 'adverse', 'FDA'],
        extractionPatterns: ['shall', 'will', 'must', 'required', 'committed', 'agreed'],
      },
      NDA: {
        modelVersion: 'NDA_v2.1_specialized',
        temperatureOptimal: 0.25,
        maxTokens: 3000,
        focusKeywords: ['post-market', 'REMS', 'labeling', 'surveillance', 'efficacy', 'approval'],
        extractionPatterns: [
          'post-approval',
          'commitment',
          'obligation',
          'requirement',
          'milestone',
        ],
      },
      BLA: {
        modelVersion: 'BLA_v2.1_specialized',
        temperatureOptimal: 0.2,
        maxTokens: 2800,
        focusKeywords: ['biologics', 'facility', 'lot release', 'comparability', 'immunogenicity'],
        extractionPatterns: ['validate', 'demonstrate', 'establish', 'maintain', 'monitor'],
      },
      CSR: {
        modelVersion: 'CSR_v2.1_specialized',
        temperatureOptimal: 0.15,
        maxTokens: 2200,
        focusKeywords: ['data integrity', 'audit', 'GCP', 'protocol', 'deviation', 'monitoring'],
        extractionPatterns: ['verified', 'documented', 'confirmed', 'validated', 'assessed'],
      },
    };
  }

  /**
   * Get document-specific system prompt for OpenAI processing
   * SUB-PHASE 1.3: Enhanced with automated categorization and advanced AI modeling
   * @param {string} submissionType - IND, NDA, BLA, or CSR
   * @param {string} regulatoryPhase - Phase of regulatory process
   * @returns {string} Specialized system prompt
   */
  getDocumentSpecificPrompt(submissionType, regulatoryPhase = '') {
    const modelConfig = this.modelConfigurations[submissionType] || this.modelConfigurations.IND;

    const basePrompt = `You are a specialized regulatory AI expert trained specifically for ${this.documentTypes[submissionType] || 'regulatory documents'} analysis.

AI MODEL CONFIGURATION: ${modelConfig.modelVersion}
REGULATORY FRAMEWORK: ${this.regulatoryFrameworks[submissionType] || 'General FDA/ICH Guidelines'}
DOCUMENT TYPE: ${submissionType}
${regulatoryPhase ? `REGULATORY PHASE: ${regulatoryPhase}` : ''}

SPECIALIZED FOCUS FOR ${submissionType}:
${this.getDocumentSpecificFocus(submissionType)}

ADVANCED EXTRACTION INSTRUCTIONS:
1. Analyze the provided document text using ${submissionType}-specific linguistic patterns
2. Apply NLP pattern recognition for keywords: ${modelConfig.focusKeywords.join(', ')}
3. Look for commitment patterns: ${modelConfig.extractionPatterns.join(', ')}
4. Extract ONLY genuine regulatory commitments with verifiable obligations
5. Apply automated categorization using regulatory taxonomy
6. Assess document-specific risk levels and compliance requirements

SUB-PHASE 1.3 AUTOMATED CATEGORIZATION:
For each commitment, automatically categorize using this hierarchy:
PRIMARY CATEGORIES: ${this.regulatoryTaxonomy.primary.join(', ')}

SECONDARY CATEGORIZATION:
${Object.entries(this.regulatoryTaxonomy.secondary)
  .map(([primary, secondary]) => `${primary}: ${secondary.join(', ')}`)
  .join('\n')}

DOCUMENT-SPECIFIC CATEGORIES FOR ${submissionType}:
${this.getDocumentSpecificCategories(submissionType)}

ENHANCED COMMITMENT STRUCTURE (SUB-PHASE 2.4 - ADVANCED INTELLIGENCE):
For each commitment, provide:
- description: Clear, specific description of the commitment
- type: Automated primary category from taxonomy (Safety, Efficacy, Manufacturing, Quality, Post-Marketing)
- subType: Automated secondary category for granular classification
- priority: Critical, High, Medium, or Low (based on ${submissionType} requirements)
- dueDate: If mentioned, extract date in YYYY-MM-DD format
- authority: Regulatory body (FDA, EMA, etc.) if mentioned
- status: Active, Pending, or Completed
- riskLevel: Assessment of compliance risk (High, Medium, Low)
- section: Document section where found
- confidence: Your confidence in extraction (0.0 to 1.0)
- regulatoryFramework: "${this.regulatoryFrameworks[submissionType] || 'General'}"
- extractionModel: "${modelConfig.modelVersion}"
- nlpPatterns: Array of detected linguistic patterns
- complianceScore: Numerical score (0-100) for regulatory compliance importance
- insight: Brief (1-2 sentences) analysis of commitment's importance or potential challenges
- nextSteps: Array of 1-2 actionable points for remediation or follow-up
- riskFactors: Array of specific risk factors that could impact this commitment
- dependencies: Array of other commitments or processes this depends on

RESPOND WITH VALID JSON ONLY:
{
  "commitments": [
    {
      "description": "specific commitment text",
      "type": "automated primary category",
      "subType": "automated secondary category",
      "priority": "level based on ${submissionType} requirements",
      "dueDate": "YYYY-MM-DD or null",
      "authority": "regulatory body or null",
      "status": "Active",
      "riskLevel": "Medium",
      "section": "document section",
      "confidence": 0.85,
      "regulatoryFramework": "${this.regulatoryFrameworks[submissionType] || 'General'}",
      "extractionModel": "${modelConfig.modelVersion}",
      "nlpPatterns": ["detected patterns"],
      "complianceScore": 85,
      "insight": "Brief analysis of commitment importance or potential challenges",
      "nextSteps": ["actionable remediation point 1", "actionable follow-up point 2"],
      "riskFactors": ["specific risk factor 1", "specific risk factor 2"],
      "dependencies": ["related commitment or process dependency"]
    }
  ],
  "documentAnalysis": {
    "submissionType": "${submissionType}",
    "regulatoryPhase": "${regulatoryPhase}",
    "totalCommitments": "number of commitments found",
    "riskAssessment": "overall risk level for ${submissionType}",
    "complianceNotes": "specific ${submissionType} compliance observations",
    "categorizationSummary": {
      "Safety": "count of safety commitments",
      "Efficacy": "count of efficacy commitments",
      "Manufacturing": "count of manufacturing commitments",
      "Quality": "count of quality commitments",
      "Post-Marketing": "count of post-marketing commitments"
    },
    "aiModelUsed": "${modelConfig.modelVersion}",
    "processingMetrics": {
      "averageConfidence": "average confidence score",
      "highRiskCommitments": "count of high-risk commitments",
      "categorizedCommitments": "count of successfully categorized commitments"
    }
  }
}`;

    return basePrompt;
  }

  /**
   * Get document-specific focus areas for specialized analysis
   * @param {string} submissionType
   * @returns {string} Focus areas text
   */
  getDocumentSpecificFocus(submissionType) {
    const focusAreas = {
      IND: `- Safety monitoring plans and adverse event reporting requirements
- Clinical trial protocol commitments and milestones
- Manufacturing and quality control commitments
- Pre-clinical data completion requirements
- FDA correspondence and meeting commitments
- Risk evaluation and mitigation strategies (REMS)
- Good Clinical Practice (GCP) compliance commitments`,

      NDA: `- Post-marketing surveillance and safety reporting
- Efficacy data collection and analysis commitments
- Manufacturing scale-up and facility inspection readiness
- Risk evaluation and mitigation strategies (REMS)
- Labeling and promotional material commitments
- Post-market studies and Phase 4 commitments
- Pharmacovigilance and adverse event reporting`,

      BLA: `- Biologics-specific manufacturing and quality commitments
- Facility inspection and compliance readiness
- Lot release and batch record commitments
- Biologics-specific safety monitoring
- Post-market surveillance for biological products
- Comparability studies and analytical method validation
- Container closure system qualification`,

      CSR: `- Data integrity and audit trail commitments
- Adverse event reporting and safety analysis
- Statistical analysis plan adherence
- Good Clinical Practice (GCP) compliance verification
- Source data verification and monitoring
- Protocol deviation reporting and resolution
- Regulatory authority notification requirements`,
    };

    return (
      focusAreas[submissionType] ||
      `- General regulatory compliance requirements
- Safety and efficacy data commitments
- Quality assurance and audit trail requirements
- Regulatory authority correspondence and reporting`
    );
  }

  /**
   * Get document-specific commitment categories
   * @param {string} submissionType
   * @returns {string} Categories text
   */
  getDocumentSpecificCategories(submissionType) {
    const categories = {
      IND: `- Safety_Monitoring: Adverse event reporting, safety reviews, DSMB commitments
- Clinical_Protocol: Trial design, endpoint commitments, patient enrollment
- Manufacturing: CMC commitments, facility readiness, quality control
- Regulatory_Correspondence: FDA meetings, submissions, responses
- Data_Management: Case report forms, database lock, data integrity
- Quality_Assurance: GCP compliance, audit readiness, monitoring`,

      NDA: `- Post_Marketing: Phase 4 studies, post-market surveillance, REMS
- Efficacy_Data: Primary endpoint analysis, subgroup analyses, long-term studies
- Manufacturing: Commercial scale production, facility inspection readiness
- Labeling: Package insert, medication guide, professional labeling
- Pharmacovigilance: Adverse event reporting, periodic safety updates
- Regulatory_Submission: Supplement submissions, annual reports`,

      BLA: `- Biologics_Manufacturing: Cell line characterization, viral clearance studies
- Facility_Compliance: Inspection readiness, environmental monitoring
- Lot_Release: Batch testing, release criteria, stability studies
- Comparability: Analytical method validation, reference standards
- Safety_Monitoring: Biologics-specific adverse events, immunogenicity
- Post_Market_Surveillance: Long-term safety studies, effectiveness monitoring`,

      CSR: `- Data_Integrity: Source data verification, audit trail completeness
- Safety_Analysis: Adverse event coding, causality assessment, safety narratives
- Statistical_Analysis: SAP adherence, interim analyses, final analysis
- Protocol_Compliance: Deviation reporting, corrective actions, monitoring
- Regulatory_Reporting: Authority notifications, safety reports, study reports
- Quality_Control: Data review, medical review, statistical review`,
    };

    return (
      categories[submissionType] ||
      `- Safety: Safety monitoring and adverse event reporting
- Efficacy: Effectiveness data and analysis commitments
- Manufacturing: Production and quality control requirements
- Quality: Quality assurance and audit trail commitments
- Post_Marketing: Post-approval studies and surveillance
- Regulatory: Authority correspondence and reporting requirements`
    );
  }

  /**
   * Get regulatory timeline requirements for document type
   * @param {string} submissionType
   * @returns {Object} Timeline requirements
   */
  getRegulatoryTimelines(submissionType) {
    const timelines = {
      IND: {
        safetyReporting: '15 days for serious adverse events',
        annualReports: '60 days after anniversary date',
        protocolAmendments: '30 days before implementation',
        meetingRequests: '2 months before desired meeting date',
      },
      NDA: {
        safetyReporting: '15 days for serious adverse events',
        annualReports: 'Within 60 days of anniversary date',
        postMarketStudies: 'Per approved timeline',
        labelingSupplements: '30 days for minor changes',
      },
      BLA: {
        safetyReporting: '15 days for serious adverse events',
        lotRelease: 'Per approved batch release protocol',
        facilityChanges: '30 days prior notice for major changes',
        comparabilityStudies: 'Before any manufacturing changes',
      },
      CSR: {
        safetyReporting: '24 hours for serious adverse events',
        finalReport: 'Within 1 year of study completion',
        integratedSummary: 'With regulatory submission',
        dataLock: 'Per protocol-specified timeline',
      },
    };

    return timelines[submissionType] || {};
  }

  /**
   * Get confidence scoring criteria for document type
   * @param {string} submissionType
   * @returns {Object} Confidence criteria
   */
  getConfidenceCriteria(submissionType) {
    return {
      high: 0.85, // Clear regulatory requirement with specific deadline
      medium: 0.7, // Regulatory requirement with general timeline
      low: 0.55, // Potential commitment requiring verification
      threshold: 0.5, // Minimum confidence to include commitment
    };
  }

  /**
   * Validate and enhance extracted commitments with document-specific logic
   * SUB-PHASE 1.3: Enhanced with automated categorization and advanced processing
   * @param {Array} commitments - Raw extracted commitments
   * @param {string} submissionType - Document type
   * @returns {Array} Enhanced commitments
   */
  enhanceCommitments(commitments, submissionType) {
    const timelines = this.getRegulatoryTimelines(submissionType);
    const confidenceCriteria = this.getConfidenceCriteria(submissionType);
    const modelConfig = this.modelConfigurations[submissionType] || this.modelConfigurations.IND;

    console.log(
      `🔧 SUB-PHASE 1.3: Enhancing ${commitments.length} commitments with automated categorization`
    );

    return commitments
      .map(commitment => {
        // SUB-PHASE 1.3: Enhanced with automated categorization
        const enhanced = {
          ...commitment,
          submissionType,
          regulatoryFramework: this.regulatoryFrameworks[submissionType],
          extractionModel: modelConfig.modelVersion,
        };

        // Apply automated categorization validation
        enhanced.type = this.validateAndEnhanceCategory(commitment.type, submissionType);
        enhanced.subType = this.validateAndEnhanceSubCategory(commitment.subType, enhanced.type);

        // Apply document-specific risk assessment
        enhanced.riskLevel = this.assessDocumentSpecificRisk(commitment, submissionType);

        // Enhance priority based on document type and automated categorization
        enhanced.priority = this.enhancePriority(commitment, submissionType);

        // Add regulatory timeline context
        enhanced.regulatoryContext = this.addRegulatoryContext(
          commitment,
          submissionType,
          timelines
        );

        // SUB-PHASE 1.3: Add compliance scoring
        enhanced.complianceScore = this.calculateComplianceScore(commitment, submissionType);

        // SUB-PHASE 1.3: Validate NLP patterns
        enhanced.nlpPatterns = this.validateNLPPatterns(commitment.nlpPatterns || [], modelConfig);

        // SUB-PHASE 1.3: Add categorization metadata
        enhanced.categorizationMetadata = {
          primaryCategory: enhanced.type,
          secondaryCategory: enhanced.subType,
          taxonomyVersion: '1.3',
          automatedCategorization: true,
          modelVersion: modelConfig.modelVersion,
          confidenceScore: enhanced.confidence,
          complianceScore: enhanced.complianceScore,
        };

        console.log(
          `📊 SUB-PHASE 1.3: Enhanced commitment - Type: ${enhanced.type}, SubType: ${enhanced.subType}, Compliance: ${enhanced.complianceScore}`
        );

        return enhanced;
      })
      .filter(commitment => commitment.confidence >= confidenceCriteria.threshold);
  }

  /**
   * Assess risk level specific to document type
   * @param {Object} commitment
   * @param {string} submissionType
   * @returns {string} Risk level
   */
  assessDocumentSpecificRisk(commitment, submissionType) {
    const riskKeywords = {
      IND: ['safety', 'adverse', 'toxicity', 'dose limiting', 'DSMB'],
      NDA: ['post-market', 'REMS', 'black box', 'contraindication'],
      BLA: ['immunogenicity', 'viral clearance', 'sterility', 'biologics'],
      CSR: ['data integrity', 'audit', 'GCP violation', 'protocol deviation'],
    };

    const keywords = riskKeywords[submissionType] || [];
    const description = commitment.description.toLowerCase();

    const hasHighRiskKeywords = keywords.some(keyword =>
      description.includes(keyword.toLowerCase())
    );

    if (hasHighRiskKeywords || commitment.priority === 'Critical') {
      return 'High';
    }

    return commitment.riskLevel || 'Medium';
  }

  /**
   * Enhance priority based on document-specific requirements
   * @param {Object} commitment
   * @param {string} submissionType
   * @returns {string} Enhanced priority
   */
  enhancePriority(commitment, submissionType) {
    const criticalKeywords = {
      IND: ['safety reporting', 'adverse event', 'FDA meeting', 'clinical hold'],
      NDA: ['REMS', 'post-market study', 'labeling', 'facility inspection'],
      BLA: ['lot release', 'facility inspection', 'comparability', 'viral clearance'],
      CSR: ['data lock', 'final report', 'safety analysis', 'audit trail'],
    };

    const keywords = criticalKeywords[submissionType] || [];
    const description = commitment.description.toLowerCase();

    const hasCriticalKeywords = keywords.some(keyword =>
      description.includes(keyword.toLowerCase())
    );

    if (hasCriticalKeywords) {
      return 'Critical';
    }

    return commitment.priority || 'Medium';
  }

  /**
   * Add regulatory context to commitment
   * @param {Object} commitment
   * @param {string} submissionType
   * @param {Object} timelines
   * @returns {Object} Regulatory context
   */
  addRegulatoryContext(commitment, submissionType, timelines) {
    return {
      documentType: submissionType,
      regulatoryFramework: this.regulatoryFrameworks[submissionType],
      applicableTimelines: timelines,
      complianceRequirements: this.getComplianceRequirements(submissionType),
      riskFactors: this.getRiskFactors(commitment, submissionType),
    };
  }

  /**
   * Get compliance requirements for document type
   * @param {string} submissionType
   * @returns {Array} Compliance requirements
   */
  getComplianceRequirements(submissionType) {
    const requirements = {
      IND: ['GCP compliance', 'Safety reporting', 'Protocol adherence'],
      NDA: ['GMP compliance', 'Pharmacovigilance', 'Labeling accuracy'],
      BLA: ['Biologics-specific GMP', 'Facility inspection readiness', 'Lot release protocols'],
      CSR: ['Data integrity', 'Statistical analysis plan adherence', 'Audit trail completeness'],
    };

    return requirements[submissionType] || ['General regulatory compliance'];
  }

  /**
   * Get risk factors for commitment
   * @param {Object} commitment
   * @param {string} submissionType
   * @returns {Array} Risk factors
   */
  getRiskFactors(commitment, submissionType) {
    const factors = [];

    if (commitment.dueDate) {
      const dueDate = new Date(commitment.dueDate);
      const now = new Date();
      const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

      if (daysUntilDue <= 30) {
        factors.push('Approaching deadline');
      }
    }

    if (commitment.priority === 'Critical') {
      factors.push('Critical regulatory impact');
    }

    if (commitment.confidence < 0.7) {
      factors.push('Requires verification');
    }

    return factors;
  }

  /**
   * SUB-PHASE 1.3: Validate and enhance automated category
   * @param {string} category - AI-generated category
   * @param {string} submissionType - Document type
   * @returns {string} Validated category
   */
  validateAndEnhanceCategory(category, submissionType) {
    if (!category || !this.regulatoryTaxonomy.primary.includes(category)) {
      // Default fallback based on submission type
      const defaultCategories = {
        IND: 'Safety',
        NDA: 'Post-Marketing',
        BLA: 'Manufacturing',
        CSR: 'Quality',
      };

      console.log(
        `⚠️ SUB-PHASE 1.3: Category validation failed for "${category}", using default: ${defaultCategories[submissionType]}`
      );
      return defaultCategories[submissionType] || 'Safety';
    }

    return category;
  }

  /**
   * SUB-PHASE 1.3: Validate and enhance automated sub-category
   * @param {string} subCategory - AI-generated sub-category
   * @param {string} primaryCategory - Validated primary category
   * @returns {string} Validated sub-category
   */
  validateAndEnhanceSubCategory(subCategory, primaryCategory) {
    const validSubCategories = this.regulatoryTaxonomy.secondary[primaryCategory] || [];

    if (!subCategory || !validSubCategories.includes(subCategory)) {
      // Return first valid sub-category as fallback
      const fallback = validSubCategories[0] || 'General';
      console.log(
        `⚠️ SUB-PHASE 1.3: Sub-category validation failed for "${subCategory}", using fallback: ${fallback}`
      );
      return fallback;
    }

    return subCategory;
  }

  /**
   * SUB-PHASE 1.3: Calculate compliance score based on commitment analysis
   * @param {Object} commitment - Commitment object
   * @param {string} submissionType - Document type
   * @returns {number} Compliance score (0-100)
   */
  calculateComplianceScore(commitment, submissionType) {
    let score = 50; // Base score

    // Confidence contribution (0-30 points)
    score += Math.round((commitment.confidence || 0.5) * 30);

    // Priority contribution (0-20 points)
    const priorityScores = { Critical: 20, High: 15, Medium: 10, Low: 5 };
    score += priorityScores[commitment.priority] || 10;

    // Risk level contribution (0-15 points)
    const riskScores = { High: 15, Medium: 10, Low: 5 };
    score += riskScores[commitment.riskLevel] || 10;

    // Document type specific adjustments (0-15 points)
    const typeAdjustments = {
      IND: { Safety: 15, Clinical_Protocol: 12, Manufacturing: 8 },
      NDA: { Post_Marketing: 15, Efficacy_Data: 12, Manufacturing: 10 },
      BLA: { Biologics_Manufacturing: 15, Facility_Compliance: 12, Safety_Monitoring: 10 },
      CSR: { Data_Integrity: 15, Safety_Analysis: 12, Statistical_Analysis: 10 },
    };

    const typeBonus = typeAdjustments[submissionType]?.[commitment.type] || 10;
    score += typeBonus;

    // NLP pattern validation bonus (0-10 points)
    if (commitment.nlpPatterns && commitment.nlpPatterns.length > 0) {
      score += Math.min(commitment.nlpPatterns.length * 2, 10);
    }

    return Math.min(Math.max(score, 0), 100);
  }

  /**
   * SUB-PHASE 1.3: Validate NLP patterns against model configuration
   * @param {Array} patterns - Detected NLP patterns
   * @param {Object} modelConfig - Model configuration
   * @returns {Array} Validated patterns
   */
  validateNLPPatterns(patterns, modelConfig) {
    if (!Array.isArray(patterns)) {
      return [];
    }

    // Validate against known extraction patterns
    const validPatterns = patterns.filter(pattern => {
      return modelConfig.extractionPatterns.some(validPattern =>
        pattern.toLowerCase().includes(validPattern.toLowerCase())
      );
    });

    // Add focus keyword matches
    patterns.forEach(pattern => {
      modelConfig.focusKeywords.forEach(keyword => {
        if (pattern.toLowerCase().includes(keyword.toLowerCase())) {
          validPatterns.push(`keyword_match:${keyword}`);
        }
      });
    });

    return [...new Set(validPatterns)]; // Remove duplicates
  }
}

export default DocumentSpecificAIService;
