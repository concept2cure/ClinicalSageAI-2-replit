import { db } from '../db';
import { csrReports } from 'shared/schema';
import { huggingFaceService, HFModel } from '../huggingface-service';
import { memoryService, type ChatMessage } from './memory-service';
import { clinicalIntelligenceService } from './clinical-intelligence-service';
import { academicKnowledgeService } from './academic-knowledge-service';
import { semanticSearchService } from './semantic-search-service';
import { RegulatoryIntelligenceService } from './regulatory-intelligence-service';
import { academicDocumentProcessor } from './academic-document-processor';
import { getIntelligencePrefix } from './lumen-context-builder.js';

// Create a singleton instance of the regulatory intelligence service
const regulatoryIntelligenceService = new RegulatoryIntelligenceService();

interface StudyDesignQuery {
  query: string;
  indication?: string;
  phase?: string;
}

interface AgentResponse {
  content: string;
  sources: {
    id: number;
    title: string;
    relevance: number;
  }[];
  confidence: number;
  metadata?: Record<string, any>;
}

/**
 * Sophisticated AI agent service for clinical trial study design
 */
export class StudyDesignAgentService {
  private initialized: boolean = false;
  private contentIndex: boolean = false;

  private getDb() {
    if (!db) {
      throw new Error('Database unavailable');
    }
    return db;
  }

  constructor() {}

  /**
   * Initialize services required by the agent
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }

    try {
      console.log('Initializing Study Design Agent service...');

      // Clinical intelligence service initializes on first use

      // Initialize academic knowledge service
      await academicKnowledgeService.initialize();

      // Initialize regulatory intelligence service
      await regulatoryIntelligenceService.initialize();

      // Create necessary directories for document processing
      const fs = require('fs');
      const requiredDirs = ['regulatory_data', 'academic_resources', 'academic_embeddings', 'temp'];

      for (const dir of requiredDirs) {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
          console.log(`Created directory: ${dir}`);
        }
      }

      this.initialized = true;
      console.log('Study Design Agent service initialized successfully');
      return true;
    } catch (error) {
      console.error('Error initializing Study Design Agent service:', error);
      return false;
    }
  }

  /**
   * Generate a response to a study design query
   */
  async generateResponse(
    queryData: StudyDesignQuery,
    conversationId: string
  ): Promise<AgentResponse> {
    // Ensure services are initialized
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Create the conversation if it doesn't exist
      let conversation = memoryService.getConversation(conversationId);
      if (!conversation) {
        // Inject client/project intelligence so study design agent reads SKILL/.MD context
        const intelligencePrefix = await getIntelligencePrefix().catch(() => '');
        conversationId = memoryService.createConversation(
          conversationId,
          `${intelligencePrefix}You are Concept2Cure's Study Design Agent, a specialized clinical trial advisor with deep expertise in protocol design and optimization.`,
          {
            indication: queryData.indication,
            phase: queryData.phase,
          }
        );
        conversation = memoryService.getConversation(conversationId);
      }

      // Add user message to conversation memory
      const userMessage: ChatMessage = {
        role: 'user',
        content: queryData.query,
        timestamp: new Date(),
      };
      memoryService.addMessage(conversationId, userMessage);

      // Get relevant reports through basic search
      console.log('Getting relevant CSR reports...');
      const dbInstance = this.getDb();
      const reports = await dbInstance.select().from(csrReports);

      // Basic filtering by indication and phase
      const filteredReports = reports.filter((report: (typeof reports)[number]) => {
        let match = true;
        if (queryData.indication) {
          const reportIndication = report.indication || '';
          match =
            match && reportIndication.toLowerCase().includes(queryData.indication.toLowerCase());
        }
        if (queryData.phase) match = match && report.phase === queryData.phase;
        return match;
      });

      // Add relevant report data
      const relevantReports = filteredReports.slice(0, 5);
      const reportNames = relevantReports.map((r: (typeof reports)[number]) => r.title).join(', ');
      console.log(`Found relevant CSR reports: ${reportNames}`);

      // Generate a response based on the query and relevant reports without using external AI
      console.log('Generating response based on local data...');

      // Determine query type and generate appropriate response
      const queryType = this.categorizeQuery(queryData.query);
      let responseContent = '';

      switch (queryType) {
        case 'endpoint_selection':
          responseContent = this.generateEndpointResponse(queryData, relevantReports);
          break;

        case 'sample_size':
          responseContent = this.generateSampleSizeResponse(queryData, relevantReports);
          break;

        case 'study_design':
          responseContent = this.generateStudyDesignResponse(queryData, relevantReports);
          break;

        case 'eligibility_criteria':
          responseContent = this.generateEligibilityResponse(queryData, relevantReports);
          break;

        case 'statistical_analysis':
          responseContent = this.generateStatisticalResponse(queryData, relevantReports);
          break;

        case 'regulatory':
          responseContent = this.generateRegulatoryResponse(queryData, relevantReports);
          break;

        default:
          responseContent = this.generateGeneralResponse(queryData, relevantReports);
      }

      // Create the final response
      const response: AgentResponse = {
        content: responseContent,
        sources: relevantReports.map((report: (typeof reports)[number]) => ({
          id: parseInt(report.id.toString()),
          title: report.title ?? 'Untitled CSR',
          relevance: 0.9,
        })),
        confidence: 0.85,
        metadata: {
          indication: queryData.indication,
          phase: queryData.phase,
          query_type: queryType,
        },
      };

      // Add assistant message to conversation memory
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: responseContent,
        timestamp: new Date(),
      };
      memoryService.addMessage(conversationId, assistantMessage);

      return response;
    } catch (error) {
      console.error('Error generating study design agent response:', error);

      // Return an error response
      return {
        content: `I apologize, but I encountered an error while processing your query: "${queryData.query}". Please try again with a more specific question about clinical trial design.`,
        sources: [],
        confidence: 0.1,
      };
    }
  }

  /**
   * Generate a response for endpoint selection queries
   */
  private generateEndpointResponse(queryData: StudyDesignQuery, relevantReports: any[]): string {
    const { indication, phase } = queryData;

    // Extract common endpoints from relevant reports
    const endpointMap = new Map<string, number>();

    relevantReports.forEach(report => {
      if (report.endpoints) {
        for (const endpoint of report.endpoints) {
          const count = endpointMap.get(endpoint) || 0;
          endpointMap.set(endpoint, count + 1);
        }
      }
    });

    // Sort endpoints by frequency
    const sortedEndpoints = Array.from(endpointMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Construct response
    let response = `# Endpoint Recommendations for ${indication || 'Your Trial'} (${phase || 'All Phases'})\n\n`;

    response += `## Common Primary Endpoints\n`;

    if (sortedEndpoints.length > 0) {
      sortedEndpoints.forEach(([endpoint, count]) => {
        response += `- **${endpoint}**: Used in ${count} similar trials\n`;
      });
    } else {
      // Fallback for specific indications if no endpoints were found
      if (indication?.toLowerCase().includes('diabetes')) {
        response += `- **HbA1c Change**: Reduction in glycated hemoglobin from baseline\n`;
        response += `- **Fasting Plasma Glucose**: Change from baseline\n`;
        response += `- **Time in Range**: Percentage of time within target glucose range\n`;
      } else if (indication?.toLowerCase().includes('cancer')) {
        response += `- **Overall Survival (OS)**: Time from randomization to death from any cause\n`;
        response += `- **Progression-Free Survival (PFS)**: Time from randomization to disease progression or death\n`;
        response += `- **Objective Response Rate (ORR)**: Percentage of patients with tumor reduction\n`;
      } else if (indication?.toLowerCase().includes('alzheimer')) {
        response += `- **ADAS-Cog Change**: Change in cognitive function measured by Alzheimer's Disease Assessment Scale\n`;
        response += `- **CDR-SB**: Clinical Dementia Rating Scale Sum of Boxes\n`;
      } else {
        response += `- **Change from Baseline**: Improvement in key disease activity scores\n`;
        response += `- **Time to Event**: Duration until a predefined clinical event\n`;
        response += `- **Response Rate**: Percentage of patients achieving a defined response threshold\n`;
      }
    }

    response += `\n## Recommendations for Endpoint Selection\n`;
    response += `- **Regulatory Acceptance**: Choose endpoints with established regulatory precedent\n`;
    response += `- **Clinical Relevance**: Ensure endpoints reflect meaningful patient outcomes\n`;
    response += `- **Statistical Power**: Select endpoints with appropriate sensitivity to detect treatment effects\n`;
    response += `- **Measurement Precision**: Consider reliability and reproducibility of measurements\n`;

    // Add references to relevant trials
    response += `\n## Reference Trials\n`;
    relevantReports.slice(0, 3).forEach(report => {
      response += `- **${report.title}** (${report.sponsor}, ${report.phase}): ${report.indication}\n`;
    });

    return response;
  }

  /**
   * Generate a response for sample size queries
   */
  private generateSampleSizeResponse(queryData: StudyDesignQuery, relevantReports: any[]): string {
    const { indication, phase } = queryData;

    // Extract sample sizes from relevant reports
    const sampleSizes = relevantReports
      .map(report => parseInt(report.sample_size) || 0)
      .filter(size => size > 0);

    // Calculate statistics
    const avgSampleSize =
      sampleSizes.length > 0
        ? Math.round(sampleSizes.reduce((sum, size) => sum + size, 0) / sampleSizes.length)
        : 0;

    const medianSampleSize =
      sampleSizes.length > 0
        ? sampleSizes.sort((a, b) => a - b)[Math.floor(sampleSizes.length / 2)]
        : 0;

    // Construct response
    let response = `# Sample Size Recommendations for ${indication || 'Your Trial'} (${phase || 'All Phases'})\n\n`;

    response += `## Sample Size Analysis\n`;

    if (sampleSizes.length > 0) {
      response += `Based on ${sampleSizes.length} similar trials in our database:\n\n`;
      response += `- **Average Sample Size**: ${avgSampleSize} participants\n`;
      response += `- **Median Sample Size**: ${medianSampleSize} participants\n`;
      response += `- **Range**: ${Math.min(...sampleSizes)} to ${Math.max(...sampleSizes)} participants\n`;
    } else {
      // Fallback recommendations by phase
      if (phase?.includes('1')) {
        response += `For typical Phase 1 studies in ${indication || 'this indication'}:\n\n`;
        response += `- **Recommended Range**: 20-80 participants\n`;
        response += `- **First-in-Human**: Start with 20-30 participants\n`;
      } else if (phase?.includes('2')) {
        response += `For typical Phase 2 studies in ${indication || 'this indication'}:\n\n`;
        response += `- **Recommended Range**: 100-300 participants\n`;
        response += `- **Proof-of-Concept**: 100-150 participants\n`;
        response += `- **Dose-Finding**: 200-300 participants\n`;
      } else if (phase?.includes('3')) {
        response += `For typical Phase 3 studies in ${indication || 'this indication'}:\n\n`;
        response += `- **Recommended Range**: 300-1000 participants\n`;
        response += `- **Pivotal Trials**: 500+ participants\n`;
      } else {
        response += `General sample size recommendations:\n\n`;
        response += `- **Phase 1**: 20-80 participants\n`;
        response += `- **Phase 2**: 100-300 participants\n`;
        response += `- **Phase 3**: 300-1000 participants\n`;
      }
    }

    response += `\n## Sample Size Considerations\n`;
    response += `- **Statistical Power**: Aim for 80-90% power to detect clinically meaningful differences\n`;
    response += `- **Effect Size**: Consider expected treatment effect magnitude based on previous studies\n`;
    response += `- **Variability**: Account for endpoint variability in the patient population\n`;
    response += `- **Dropout Rate**: Plan for 10-20% participant dropout\n`;
    response += `- **Subgroup Analyses**: Increase sample size if key subgroup analyses are planned\n`;

    // Add references to relevant trials
    response += `\n## Reference Trials\n`;
    relevantReports.slice(0, 3).forEach(report => {
      const sampleSizeInfo = report.sample_size ? `Sample size: ${report.sample_size}` : '';
      response += `- **${report.title}** (${report.sponsor}, ${report.phase}): ${sampleSizeInfo}\n`;
    });

    return response;
  }

  /**
   * Generate a response for study design queries
   */
  private generateStudyDesignResponse(queryData: StudyDesignQuery, relevantReports: any[]): string {
    const { indication, phase } = queryData;

    // Construct response
    let response = `# Study Design Recommendations for ${indication || 'Your Trial'} (${phase || 'All Phases'})\n\n`;

    response += `## Recommended Study Design Elements\n`;

    // Add indication-specific design recommendations
    if (indication?.toLowerCase().includes('cancer')) {
      response += `For oncology trials in ${indication}:\n\n`;
      response += `- **Design Type**: Randomized, controlled, parallel-group study\n`;
      response += `- **Control Arm**: Standard of care or placebo (if ethically appropriate)\n`;
      response += `- **Allocation Ratio**: 1:1 or 2:1 (treatment:control)\n`;
      response += `- **Stratification Factors**: Disease stage, ECOG status, prior treatments\n`;
      response += `- **Blinding**: Double-blind preferred, open-label if necessary for safety monitoring\n`;
    } else if (indication?.toLowerCase().includes('diabetes')) {
      response += `For diabetes trials in ${indication}:\n\n`;
      response += `- **Design Type**: Randomized, double-blind, parallel-group study\n`;
      response += `- **Control Arm**: Placebo and/or active comparator\n`;
      response += `- **Allocation Ratio**: 1:1 (treatment:control)\n`;
      response += `- **Stratification Factors**: Baseline HbA1c, prior medication usage\n`;
      response += `- **Blinding**: Double-blind with matched placebo\n`;
    } else {
      response += `General study design recommendations:\n\n`;
      response += `- **Design Type**: Randomized, controlled trial\n`;
      response += `- **Control Arm**: Placebo or active comparator\n`;
      response += `- **Allocation Ratio**: 1:1 (balanced) or adaptive design\n`;
      response += `- **Stratification**: Key prognostic factors\n`;
      response += `- **Blinding**: Double-blind where feasible\n`;
    }

    // Phase-specific recommendations
    response += `\n## Phase-Specific Considerations for ${phase || 'All Phases'}\n`;

    if (phase?.includes('1')) {
      response += `- **Primary Objective**: Safety and tolerability\n`;
      response += `- **Design**: Single or multiple ascending dose, food effect\n`;
      response += `- **Cohorts**: Sequential cohorts with safety review between each\n`;
      response += `- **Duration**: 1-4 weeks typical exposure per participant\n`;
    } else if (phase?.includes('2')) {
      response += `- **Primary Objective**: Proof of concept, dose-response relationship\n`;
      response += `- **Design**: Multiple dose arms, randomized, controlled\n`;
      response += `- **Endpoints**: Biomarkers, surrogate endpoints, safety\n`;
      response += `- **Duration**: 3-6 months typical treatment duration\n`;
    } else if (phase?.includes('3')) {
      response += `- **Primary Objective**: Confirmation of efficacy and safety\n`;
      response += `- **Design**: Randomized, controlled, double-blind, multicenter\n`;
      response += `- **Endpoints**: Clinical outcomes, quality of life, safety\n`;
      response += `- **Duration**: 6+ months typical treatment duration\n`;
    } else {
      response += `- **Phase 1**: Focus on safety, PK/PD, MTD determination\n`;
      response += `- **Phase 2**: Focus on efficacy signals, dose selection, safety\n`;
      response += `- **Phase 3**: Focus on definitive efficacy, safety, risk-benefit\n`;
    }

    // Add references to relevant trials
    response += `\n## Reference Trials\n`;
    relevantReports.slice(0, 3).forEach(report => {
      response += `- **${report.title}** (${report.sponsor}, ${report.phase}): ${report.indication}\n`;
    });

    return response;
  }

  /**
   * Generate a response for eligibility criteria queries
   */
  private generateEligibilityResponse(queryData: StudyDesignQuery, relevantReports: any[]): string {
    const { indication, phase } = queryData;

    // Construct response
    let response = `# Eligibility Criteria Recommendations for ${indication || 'Your Trial'} (${phase || 'All Phases'})\n\n`;

    // Add indication-specific inclusion criteria
    response += `## Key Inclusion Criteria\n`;

    if (indication?.toLowerCase().includes('diabetes')) {
      response += `- Adult patients (typically 18-75 years)\n`;
      response += `- Confirmed diagnosis of diabetes according to ADA criteria\n`;
      response += `- HbA1c between 7.0% and 10.0%\n`;
      response += `- Stable dose of anti-diabetic medications for ≥3 months (if applicable)\n`;
      response += `- BMI between 25-40 kg/m²\n`;
    } else if (indication?.toLowerCase().includes('cancer')) {
      response += `- Adult patients (typically 18+ years)\n`;
      response += `- Histologically confirmed diagnosis\n`;
      response += `- Measurable disease per RECIST criteria\n`;
      response += `- ECOG performance status 0-1\n`;
      response += `- Adequate organ function\n`;
      response += `- Life expectancy ≥3 months\n`;
    } else {
      response += `- Adult patients (age appropriate for indication)\n`;
      response += `- Confirmed diagnosis of target condition\n`;
      response += `- Disease severity appropriate for intervention\n`;
      response += `- Adequate wash-out from prior treatments\n`;
      response += `- Ability to comply with study procedures\n`;
    }

    // Add indication-specific exclusion criteria
    response += `\n## Key Exclusion Criteria\n`;

    if (indication?.toLowerCase().includes('diabetes')) {
      response += `- Type 1 diabetes (if study is for Type 2)\n`;
      response += `- History of severe hypoglycemia within past 6 months\n`;
      response += `- Significant renal impairment (eGFR <45 mL/min/1.73m²)\n`;
      response += `- History of diabetic ketoacidosis\n`;
      response += `- Planned surgery during study period\n`;
      response += `- Pregnant or breastfeeding women\n`;
    } else if (indication?.toLowerCase().includes('cancer')) {
      response += `- Prior treatment with investigational agents (within defined window)\n`;
      response += `- Brain metastases (unless treated and stable)\n`;
      response += `- Other malignancy within past 3-5 years\n`;
      response += `- Significant cardiovascular disease\n`;
      response += `- Known hypersensitivity to study drug or excipients\n`;
      response += `- Pregnant or breastfeeding women\n`;
    } else {
      response += `- Significant comorbidities that may interfere with assessment\n`;
      response += `- Use of prohibited medications\n`;
      response += `- Participation in another investigational study (within defined window)\n`;
      response += `- Hypersensitivity to study drug or excipients\n`;
      response += `- Pregnant or breastfeeding women\n`;
    }

    // Add general recommendations
    response += `\n## Recommendations for Eligibility Criteria Development\n`;
    response += `- **Balance**: Ensure criteria are not overly restrictive while maintaining study integrity\n`;
    response += `- **Precision**: Define criteria with clear, objective measurements\n`;
    response += `- **Generalizability**: Consider impact on external validity and real-world applicability\n`;
    response += `- **Diversity**: Align with FDA diversity guidelines and FDORA 2022\n`;
    response += `- **Feasibility**: Consider recruitment implications of restrictive criteria\n`;

    // Add references to relevant trials
    response += `\n## Reference Trials\n`;
    relevantReports.slice(0, 3).forEach(report => {
      response += `- **${report.title}** (${report.sponsor}, ${report.phase}): ${report.indication}\n`;
    });

    return response;
  }

  /**
   * Generate a response for statistical analysis queries
   */
  private generateStatisticalResponse(queryData: StudyDesignQuery, relevantReports: any[]): string {
    const { indication, phase } = queryData;

    // Construct response
    let response = `# Statistical Analysis Recommendations for ${indication || 'Your Trial'} (${phase || 'All Phases'})\n\n`;

    // Add general statistical approach
    response += `## Key Statistical Considerations\n`;
    response += `- **Primary Analysis Population**: Modified Intention-to-Treat (mITT) is most common\n`;
    response += `- **Missing Data Handling**: Multiple imputation or mixed models preferred over LOCF\n`;
    response += `- **Multiplicity Adjustment**: Control familywise error rate for multiple endpoints/timepoints\n`;
    response += `- **Interim Analyses**: Consider group sequential design with alpha spending function\n`;
    response += `- **Subgroup Analyses**: Pre-specify key subgroups and interaction tests\n`;

    // Add indication-specific analysis recommendations
    response += `\n## Recommended Analysis Methods\n`;

    if (indication?.toLowerCase().includes('diabetes')) {
      response += `For diabetes trials:\n\n`;
      response += `- **Primary Endpoint (HbA1c)**: MMRM or ANCOVA with baseline as covariate\n`;
      response += `- **Secondary Endpoints**: Hierarchical testing procedure for multiple endpoints\n`;
      response += `- **Time-to-Event Endpoints**: Kaplan-Meier with log-rank test\n`;
      response += `- **Safety Analysis**: Descriptive statistics with adverse event rates\n`;
    } else if (indication?.toLowerCase().includes('cancer')) {
      response += `For oncology trials:\n\n`;
      response += `- **Survival Endpoints**: Log-rank test and Cox proportional hazards model\n`;
      response += `- **Response Rates**: Chi-square or Fisher's exact test\n`;
      response += `- **Time to Progression**: Competing risks framework consideration\n`;
      response += `- **Quality of Life**: Mixed models for repeated measures\n`;
    } else {
      response += `General statistical methods:\n\n`;
      response += `- **Continuous Endpoints**: MMRM, ANCOVA, or mixed-effects models\n`;
      response += `- **Binary Endpoints**: Logistic regression with baseline covariates\n`;
      response += `- **Time-to-Event**: Kaplan-Meier and Cox regression\n`;
      response += `- **Ordinal Data**: Proportional odds model or non-parametric methods\n`;
    }

    // Add recommendations for SAP development
    response += `\n## Statistical Analysis Plan (SAP) Development\n`;
    response += `- Finalize SAP before database lock and unblinding\n`;
    response += `- Include clear specification of analysis populations\n`;
    response += `- Define handling of intercurrent events using estimand framework\n`;
    response += `- Specify sensitivity analyses to evaluate robustness of results\n`;
    response += `- Document all pre-specified analyses in detail\n`;

    // Add references to relevant trials
    response += `\n## Reference Trials\n`;
    relevantReports.slice(0, 3).forEach(report => {
      response += `- **${report.title}** (${report.sponsor}, ${report.phase}): ${report.indication}\n`;
    });

    return response;
  }

  /**
   * Generate a response for regulatory queries
   */
  private generateRegulatoryResponse(queryData: StudyDesignQuery, relevantReports: any[]): string {
    const { indication, phase } = queryData;

    // Construct response
    let response = `# Regulatory Considerations for ${indication || 'Your Trial'} (${phase || 'All Phases'})\n\n`;

    // Add general regulatory guidance
    response += `## Key Regulatory Considerations\n`;
    response += `- **Protocol Design**: Align with ICH E6(R2) GCP guidelines and ICH E8(R1) principles\n`;
    response += `- **Endpoints**: Select endpoints with regulatory precedent and clinical relevance\n`;
    response += `- **Safety Monitoring**: Implement robust DSMB and safety reporting procedures\n`;
    response += `- **Trial Registration**: Register on ClinicalTrials.gov prior to first patient enrollment\n`;
    response += `- **Documentation**: Maintain comprehensive regulatory documentation\n`;

    // Region-specific considerations
    response += `\n## Region-Specific Considerations\n`;

    response += `**FDA (United States):**\n`;
    response += `- FDORA 2022 requires diversity action plans for clinical trials\n`;
    response += `- End-of-Phase 2 meetings recommended before initiating Phase 3\n`;
    response += `- Special Protocol Assessment (SPA) available for pivotal trials\n`;

    response += `\n**EMA (European Union):**\n`;
    response += `- EU Clinical Trial Regulation (CTR) 536/2014 compliance required\n`;
    response += `- Pediatric Investigation Plan (PIP) requirements for all new products\n`;
    response += `- Scientific Advice procedure available for protocol feedback\n`;

    // Phase-specific regulatory considerations
    response += `\n## Phase-Specific Regulatory Considerations\n`;

    if (phase?.includes('1')) {
      response += `For Phase 1 studies:\n`;
      response += `- First-in-Human trials require specific risk mitigation strategies\n`;
      response += `- Consider MABEL (Minimum Anticipated Biological Effect Level) approach for dose selection\n`;
      response += `- Comprehensive toxicology data required before human exposure\n`;
    } else if (phase?.includes('2')) {
      response += `For Phase 2 studies:\n`;
      response += `- Consider adaptive designs with regulatory input\n`;
      response += `- Dose-finding and proof-of-concept studies critical for Phase 3 planning\n`;
      response += `- Seek scientific advice/end-of-Phase 2 meeting before Phase 3\n`;
    } else if (phase?.includes('3')) {
      response += `For Phase 3 studies:\n`;
      response += `- Pivotal trial designs require prior regulatory alignment\n`;
      response += `- Primary endpoints must support intended labeling claims\n`;
      response += `- Consider real-world evidence collection in parallel\n`;
    }

    // Add indication-specific considerations
    if (indication) {
      response += `\n## ${indication}-Specific Regulatory Insights\n`;

      if (indication.toLowerCase().includes('diabetes')) {
        response += `- Primary endpoint of HbA1c reduction is well-established\n`;
        response += `- Cardiovascular outcome trials (CVOTs) may be required\n`;
        response += `- Hypoglycemia definitions should follow ADA consensus\n`;
      } else if (indication.toLowerCase().includes('cancer')) {
        response += `- Accelerated approval pathways available with surrogate endpoints\n`;
        response += `- Overall survival remains gold standard endpoint for full approval\n`;
        response += `- Real-time oncology review program available at FDA\n`;
      }
    }

    // Add references to relevant trials
    response += `\n## Reference Trials\n`;
    relevantReports.slice(0, 3).forEach(report => {
      response += `- **${report.title}** (${report.sponsor}, ${report.phase}): ${report.indication}\n`;
    });

    return response;
  }

  /**
   * Generate a general response for other query types
   */
  private generateGeneralResponse(queryData: StudyDesignQuery, relevantReports: any[]): string {
    const { indication, phase, query } = queryData;

    // Construct response
    let response = `# Clinical Trial Design Insights for ${indication || 'Your Query'} (${phase || 'All Phases'})\n\n`;

    response += `## Key Considerations for Your Query\n`;
    response += `Based on your question about "${query}", here are key insights:\n\n`;

    // Extract common themes from the query
    if (
      query.toLowerCase().includes('best practice') ||
      query.toLowerCase().includes('recommend')
    ) {
      response += `### Best Practices for Clinical Trials in ${indication || 'This Area'}\n`;
      response += `- **Protocol Design**: Develop a clear, scientifically rigorous protocol\n`;
      response += `- **Endpoint Selection**: Choose clinically meaningful and statistically sensitive endpoints\n`;
      response += `- **Patient Population**: Define inclusion/exclusion criteria to target appropriate patients\n`;
      response += `- **Statistical Plan**: Establish robust analysis methods with adequate power\n`;
      response += `- **Operational Excellence**: Implement effective site selection and monitoring\n`;
    }

    if (query.toLowerCase().includes('success') || query.toLowerCase().includes('fail')) {
      response += `### Success Factors in Clinical Trials\n`;
      response += `- **Clear Objectives**: Well-defined, achievable study objectives\n`;
      response += `- **Realistic Timelines**: Adequate timelines for recruitment and follow-up\n`;
      response += `- **Patient-Centric Design**: Protocols that minimize burden on participants\n`;
      response += `- **Experienced Sites**: Selection of sites with proven track record\n`;
      response += `- **Data Quality**: Rigorous data collection and management processes\n`;
    }

    // Add general clinical trial insights
    response += `\n## General Clinical Trial Design Insights\n`;
    response += `- **Study Objectives**: Clearly define primary and secondary objectives\n`;
    response += `- **Patient Population**: Carefully balance inclusion/exclusion criteria\n`;
    response += `- **Control Group**: Select appropriate comparator (placebo, active, standard of care)\n`;
    response += `- **Endpoints**: Choose endpoints that are clinically meaningful and sensitive to change\n`;
    response += `- **Sample Size**: Ensure adequate statistical power while maintaining feasibility\n`;

    // Add indication-specific insights if available
    if (indication) {
      response += `\n## ${indication}-Specific Design Insights\n`;
      relevantReports.forEach(report => {
        if (report.summary) {
          const summary =
            report.summary.substring(0, 150) + (report.summary.length > 150 ? '...' : '');
          response += `- From study ${report.id}: ${summary}\n`;
        }
      });
    }

    // Add references to relevant trials
    response += `\n## Reference Trials\n`;
    relevantReports.slice(0, 3).forEach(report => {
      response += `- **${report.title}** (${report.sponsor}, ${report.phase}): ${report.indication}\n`;
    });

    return response;
  }

  /**
   * Categorize the query type
   */
  private categorizeQuery(query: string): string {
    const lowerQuery = query.toLowerCase();

    if (lowerQuery.includes('endpoint') || lowerQuery.includes('outcome measure')) {
      return 'endpoint_selection';
    } else if (lowerQuery.includes('sample size') || lowerQuery.includes('participants')) {
      return 'sample_size';
    } else if (lowerQuery.includes('design') || lowerQuery.includes('methodology')) {
      return 'study_design';
    } else if (
      lowerQuery.includes('inclusion') ||
      lowerQuery.includes('exclusion') ||
      lowerQuery.includes('criteria')
    ) {
      return 'eligibility_criteria';
    } else if (
      lowerQuery.includes('statistical') ||
      lowerQuery.includes('analysis') ||
      lowerQuery.includes('power')
    ) {
      return 'statistical_analysis';
    } else if (
      lowerQuery.includes('regulatory') ||
      lowerQuery.includes('fda') ||
      lowerQuery.includes('ema')
    ) {
      return 'regulatory';
    } else {
      return 'general';
    }
  }

  /**
   * Get agent service status
   */
  getStatus(): Record<string, any> {
    return {
      initialized: this.initialized,
      clinicalIntelligence: null,
      academicKnowledge: academicKnowledgeService.getStats(),
      regulatoryIntelligence: regulatoryIntelligenceService.getStats(),
      recentlyProcessedDocuments: academicDocumentProcessor.getRecentlyProcessedDocuments(5),
    };
  }
}

// Export a singleton instance for convenience
export const studyDesignAgentService = new StudyDesignAgentService();
