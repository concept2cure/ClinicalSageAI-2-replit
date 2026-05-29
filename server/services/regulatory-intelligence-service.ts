import fs from 'fs';
import path from 'path';
import { HuggingFaceService } from '../huggingface-service';
import { getHuggingfaceModels } from '../config/huggingface-models';
import { createScopedLogger } from '../utils/logger.js';
const log = createScopedLogger('regulatory-intelligence');

interface RegulatoryRequirement {
  agency: string;
  guideline: string;
  requirement: string;
  applicable_phases: string[];
  compliance_level: 'mandatory' | 'recommended' | 'optional';
  document_reference: string;
  last_updated: string;
}

interface RegulatoryGuidance {
  title: string;
  agency: string;
  year: number;
  url?: string;
  summary: string;
  relevance_score: number;
  tags: string[];
}

interface RegulatorySummary {
  therapeutic_area: string;
  phase: string;
  key_requirements: RegulatoryRequirement[];
  relevant_guidance: RegulatoryGuidance[];
  special_considerations: string[];
}

export class RegulatoryIntelligenceService {
  private huggingFaceService: HuggingFaceService;
  private regulatoryKnowledgeBase: Map<string, any>;
  private regulatoryRequirements: RegulatoryRequirement[];
  private regulatoryGuidance: RegulatoryGuidance[];
  private models = getHuggingfaceModels();
  private initialized: boolean = false;

  constructor(hfApiKey?: string) {
    const resolvedKey = hfApiKey ?? process.env.HUGGINGFACE_API_KEY ?? '';
    this.huggingFaceService = new HuggingFaceService(resolvedKey);
    this.regulatoryKnowledgeBase = new Map();
    this.regulatoryRequirements = [];
    this.regulatoryGuidance = [];
    this.loadRegulatoryData();
  }

  /**
   * Initialize the regulatory intelligence service
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }

    try {
      log.debug('Initializing Regulatory Intelligence Service...');

      // Create necessary directories
      const fs = require('fs');
      const regulatoryDir = './regulatory_data';

      if (!fs.existsSync(regulatoryDir)) {
        fs.mkdirSync(regulatoryDir, { recursive: true });
        log.debug('Created regulatory data directory');

        // Initialize with default data since directory didn't exist
        this.initializeDefaultRegulatoryData();
      } else {
        // Load existing regulatory data
        this.loadRegulatoryData();
      }

      this.initialized = true;
      log.debug('Regulatory Intelligence Service initialized successfully');
      return true;
    } catch (error) {
      log.error('Error initializing Regulatory Intelligence Service:', error);
      return false;
    }
  }

  /**
   * Get stats about the regulatory intelligence service
   */
  getStats(): Record<string, any> {
    return {
      requirementsCount: this.regulatoryRequirements.length,
      guidanceCount: this.regulatoryGuidance.length,
      initialized: this.initialized,
      agencies: Array.from(new Set(this.regulatoryRequirements.map(r => r.agency))),
    };
  }

  private loadRegulatoryData() {
    // In a real implementation, we would load from a database
    // This is a simplified implementation for demonstration purposes
    const regulatoryDir = './regulatory_data';
    if (!fs.existsSync(regulatoryDir)) {
      fs.mkdirSync(regulatoryDir, { recursive: true });
      this.initializeDefaultRegulatoryData();
      return;
    }

    try {
      // Load requirements
      const requirementsPath = path.join(regulatoryDir, 'requirements.json');
      if (fs.existsSync(requirementsPath)) {
        const requirementsContent = fs.readFileSync(requirementsPath, 'utf8');
        this.regulatoryRequirements = JSON.parse(requirementsContent);
      } else {
        this.initializeDefaultRequirements();
      }

      // Load guidance
      const guidancePath = path.join(regulatoryDir, 'guidance.json');
      if (fs.existsSync(guidancePath)) {
        const guidanceContent = fs.readFileSync(guidancePath, 'utf8');
        this.regulatoryGuidance = JSON.parse(guidanceContent);
      } else {
        this.initializeDefaultGuidance();
      }

      log.debug(
        `Loaded ${this.regulatoryRequirements.length} regulatory requirements and ${this.regulatoryGuidance.length} guidance documents`
      );
    } catch (error) {
      log.error('Error loading regulatory data:', error);
      this.initializeDefaultRegulatoryData();
    }
  }

  private initializeDefaultRegulatoryData() {
    this.initializeDefaultRequirements();
    this.initializeDefaultGuidance();
    this.saveRegulatoryData();
  }

  private initializeDefaultRequirements() {
    // Sample data for demonstration purposes
    this.regulatoryRequirements = [
      // FDA/US Requirements
      {
        agency: 'FDA',
        guideline: 'ICH E6(R2)',
        requirement:
          'Ensure adequate informed consent procedures are in place and properly documented.',
        applicable_phases: ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'],
        compliance_level: 'mandatory',
        document_reference: 'ICH E6(R2) Section 4.8',
        last_updated: '2023-01-15',
      },
      {
        agency: 'FDA',
        guideline: 'ICH E8(R1)',
        requirement: 'Implement quality by design principles in the study design phase.',
        applicable_phases: ['Phase 1', 'Phase 2', 'Phase 3'],
        compliance_level: 'recommended',
        document_reference: 'ICH E8(R1) Section 3.2',
        last_updated: '2023-02-20',
      },
      {
        agency: 'FDA',
        guideline: '21 CFR Part 50',
        requirement: 'Obtain IRB approval before initiating a clinical trial.',
        applicable_phases: ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'],
        compliance_level: 'mandatory',
        document_reference: '21 CFR 50.20',
        last_updated: '2022-11-05',
      },
      {
        agency: 'FDA',
        guideline: 'ICH E9',
        requirement: 'Define primary and secondary endpoints clearly in the protocol.',
        applicable_phases: ['Phase 2', 'Phase 3'],
        compliance_level: 'mandatory',
        document_reference: 'ICH E9 Statistical Principles',
        last_updated: '2022-09-18',
      },
      {
        agency: 'FDA',
        guideline: 'FDORA 2022',
        requirement: 'Include plans for ensuring diverse trial populations in the protocol.',
        applicable_phases: ['Phase 2', 'Phase 3'],
        compliance_level: 'mandatory',
        document_reference: 'FDORA Section 5',
        last_updated: '2023-04-01',
      },

      // EMA/Europe Requirements
      {
        agency: 'EMA',
        guideline: 'GDPR Compliance',
        requirement:
          'Ensure data protection impact assessment is conducted for processing health data.',
        applicable_phases: ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'],
        compliance_level: 'mandatory',
        document_reference: 'GDPR Article 35',
        last_updated: '2023-03-10',
      },
      {
        agency: 'EMA',
        guideline: 'Clinical Trial Regulation (EU) No 536/2014',
        requirement:
          'Register all clinical trials in the EU Clinical Trials Information System (CTIS) before initiation.',
        applicable_phases: ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'],
        compliance_level: 'mandatory',
        document_reference: 'EU CTR Article 4',
        last_updated: '2023-05-15',
      },
      {
        agency: 'EMA',
        guideline: 'EMA/CHMP/ICH/135/1995',
        requirement:
          'Implementation of the estimand framework in the analysis of clinical trials in Europe.',
        applicable_phases: ['Phase 2', 'Phase 3'],
        compliance_level: 'mandatory',
        document_reference: 'ICH E9(R1) Addendum',
        last_updated: '2023-02-10',
      },
      {
        agency: 'EMA',
        guideline: 'EMA/CHMP/292464/2014',
        requirement:
          'Follow the EMA guideline on the evaluation of anticancer medicinal products in humans.',
        applicable_phases: ['Phase 1', 'Phase 2', 'Phase 3'],
        compliance_level: 'mandatory',
        document_reference: 'EMA Oncology Guideline Section 4',
        last_updated: '2022-12-05',
      },

      // PMDA/Japan Requirements
      {
        agency: 'PMDA',
        guideline: 'Japanese GCP Ordinance',
        requirement:
          'Obtain approval from the heads of all medical institutions participating in the trial.',
        applicable_phases: ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'],
        compliance_level: 'mandatory',
        document_reference: 'JGCP Article 5',
        last_updated: '2023-01-20',
      },
      {
        agency: 'PMDA',
        guideline: 'Basic Principles on Global Clinical Trials',
        requirement:
          'Consider ethnic factors that might affect efficacy and safety for Japanese patients in global trials.',
        applicable_phases: ['Phase 2', 'Phase 3'],
        compliance_level: 'mandatory',
        document_reference: 'PMDA Global CT Guidance Section 2.2',
        last_updated: '2023-06-12',
      },

      // NMPA/China Requirements
      {
        agency: 'NMPA',
        guideline: 'Drug Registration Regulation',
        requirement:
          'Obtain Ethics Committee approval and NMPA Clinical Trial Authorization (CTA) before starting trials in China.',
        applicable_phases: ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'],
        compliance_level: 'mandatory',
        document_reference: 'DRR Article 19',
        last_updated: '2023-07-01',
      },
      {
        agency: 'NMPA',
        guideline: 'Technical Guidelines for Clinical Trials',
        requirement:
          'For registration in China, include a minimum number of Chinese subjects in pivotal trials proportional to the Chinese population.',
        applicable_phases: ['Phase 3'],
        compliance_level: 'mandatory',
        document_reference: 'NMPA Technical Guidelines Section 3.4',
        last_updated: '2023-03-18',
      },

      // Academic/Scientific Requirements
      {
        agency: 'Academic',
        guideline: 'CONSORT Statement',
        requirement:
          'Follow CONSORT guidelines for reporting randomized clinical trials in academic publications.',
        applicable_phases: ['Phase 2', 'Phase 3', 'Phase 4'],
        compliance_level: 'recommended',
        document_reference: 'CONSORT 2024 Checklist',
        last_updated: '2024-01-10',
      },
      {
        agency: 'Academic',
        guideline: 'SPIRIT Statement',
        requirement: 'Follow SPIRIT guidelines for complete protocol documentation.',
        applicable_phases: ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'],
        compliance_level: 'recommended',
        document_reference: 'SPIRIT 2022 Checklist',
        last_updated: '2022-08-24',
      },
    ];
  }

  private initializeDefaultGuidance() {
    // Sample data for demonstration purposes
    this.regulatoryGuidance = [
      // FDA Guidance (US)
      {
        title: 'Guidance for Industry: E6(R2) Good Clinical Practice',
        agency: 'FDA',
        year: 2023,
        url: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents/e6r2-good-clinical-practice-integrated-addendum-ich-e6r1',
        summary:
          'This guidance provides updated standards for the conduct of clinical trials of medical products.',
        relevance_score: 0.95,
        tags: ['GCP', 'clinical trials', 'quality', 'ethics'],
      },
      {
        title: 'Enhancing the Diversity of Clinical Trial Populations',
        agency: 'FDA',
        year: 2023,
        url: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents/enhancing-diversity-clinical-trial-populations-eligibility-criteria-enrollment-practices-and-trial',
        summary:
          'This guidance provides recommendations to sponsors on approaches to increasing diversity in clinical trial populations.',
        relevance_score: 0.9,
        tags: ['diversity', 'inclusion', 'clinical trials', 'enrollment'],
      },
      {
        title: 'Adaptive Designs for Clinical Trials of Drugs and Biologics',
        agency: 'FDA',
        year: 2022,
        url: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents/adaptive-design-clinical-trials-drugs-and-biologics-guidance-industry',
        summary:
          'This guidance describes adaptive design principles for clinical trials and provides recommendations for their implementation.',
        relevance_score: 0.85,
        tags: ['adaptive design', 'clinical trials', 'statistical methods'],
      },

      // EMA Guidance (Europe)
      {
        title:
          'Guideline on strategies to identify and mitigate risks for first-in-human and early clinical trials with investigational medicinal products',
        agency: 'EMA',
        year: 2023,
        url: 'https://www.ema.europa.eu/en/documents/scientific-guideline/guideline-strategies-identify-mitigate-risks-first-human-early-clinical-trials-investigational_en.pdf',
        summary:
          'This guideline provides strategies to calculate the first dose in humans, dose escalation, and risk mitigation for early phase trials.',
        relevance_score: 0.93,
        tags: ['Phase 1', 'first-in-human', 'dose escalation', 'risk mitigation', 'safety'],
      },
      {
        title: 'ICH E9 (R1) addendum on estimands and sensitivity analysis in clinical trials',
        agency: 'EMA',
        year: 2022,
        url: 'https://www.ema.europa.eu/en/ich-e9-statistical-principles-clinical-trials',
        summary:
          'This guideline provides a framework to align clinical trial planning, design, conduct, analysis, and interpretation.',
        relevance_score: 0.9,
        tags: ['estimands', 'statistical analysis', 'clinical trials', 'ICH'],
      },
      {
        title: 'Guideline on the evaluation of anticancer medicinal products in man',
        agency: 'EMA',
        year: 2023,
        url: 'https://www.ema.europa.eu/en/evaluation-anticancer-medicinal-products-man',
        summary:
          'This guideline addresses methodological considerations for the development of anticancer medicinal products.',
        relevance_score: 0.87,
        tags: ['oncology', 'anticancer', 'clinical development', 'efficacy endpoints'],
      },
      {
        title:
          'Guideline on clinical investigation of medicinal products for the treatment of Multiple Sclerosis',
        agency: 'EMA',
        year: 2022,
        url: 'https://www.ema.europa.eu/en/clinical-investigation-medicinal-products-treatment-multiple-sclerosis',
        summary:
          'This guideline provides specific considerations for clinical trials in multiple sclerosis.',
        relevance_score: 0.82,
        tags: ['multiple sclerosis', 'neurology', 'clinical trials', 'endpoint selection'],
      },

      // PMDA Guidance (Japan/Asia)
      {
        title: 'Basic Principles on Global Clinical Trials',
        agency: 'PMDA',
        year: 2023,
        url: 'https://www.pmda.go.jp/files/000156939.pdf',
        summary:
          'This document outlines considerations for conducting global clinical trials including Japanese subjects.',
        relevance_score: 0.88,
        tags: ['global clinical trials', 'multiregional', 'Japan', 'ethnicity factors'],
      },
      {
        title: 'Points to Consider for Drug Master Files',
        agency: 'PMDA',
        year: 2022,
        url: 'https://www.pmda.go.jp/english/review-services/regulations-standards/0009.html',
        summary:
          'This document provides guidance on preparation and submission of Drug Master Files in Japan.',
        relevance_score: 0.75,
        tags: ['drug master file', 'chemistry manufacturing controls', 'Japan', 'quality'],
      },

      // NMPA Guidance (China/Asia)
      {
        title: 'Technical Guidelines for Clinical Trials of Drugs in China',
        agency: 'NMPA',
        year: 2023,
        url: 'https://english.nmpa.gov.cn/',
        summary:
          'These guidelines provide technical requirements for conducting clinical trials in China.',
        relevance_score: 0.85,
        tags: ['China', 'clinical trials', 'NMPA', 'regulatory requirements'],
      },
      {
        title: 'Guidelines for Acceptance of Overseas Clinical Trial Data',
        agency: 'NMPA',
        year: 2022,
        url: 'https://english.nmpa.gov.cn/',
        summary:
          'This document provides guidance on the acceptance of foreign clinical trial data for drug registration in China.',
        relevance_score: 0.83,
        tags: ['China', 'foreign data', 'clinical trials', 'drug registration'],
      },

      // Academic Guidance
      {
        title: 'CONSORT 2024 Statement: Updated Guidelines for Reporting Randomized Trials',
        agency: 'Academic',
        year: 2024,
        url: 'https://www.consort-statement.org/',
        summary:
          'These updated guidelines provide best practices for reporting randomized controlled trials to ensure transparency and reproducibility.',
        relevance_score: 0.92,
        tags: [
          'reporting guidelines',
          'randomized trials',
          'transparency',
          'academic',
          'publication',
        ],
      },
      {
        title: 'SPIRIT 2022 Statement: Standard Protocol Items for Clinical Trials',
        agency: 'Academic',
        year: 2022,
        url: 'https://www.spirit-statement.org/',
        summary:
          'This academic guidance provides recommendations for minimum protocol items to include when designing clinical trials.',
        relevance_score: 0.9,
        tags: ['protocol design', 'academic', 'methodology', 'clinical trial standards'],
      },
      {
        title:
          'Clinical Trials 2.0: A Vision for More Efficient, Informative, and Ethical Clinical Trials',
        agency: 'Academic',
        year: 2023,
        url: 'https://www.nejm.org/',
        summary:
          'This academic paper outlines a vision for next-generation clinical trials that are more efficient, participant-centered, and generate higher quality evidence.',
        relevance_score: 0.87,
        tags: [
          'clinical trial design',
          'innovation',
          'efficiency',
          'patient-centricity',
          'academic',
        ],
      },
    ];
  }

  private saveRegulatoryData() {
    const regulatoryDir = './regulatory_data';
    if (!fs.existsSync(regulatoryDir)) {
      fs.mkdirSync(regulatoryDir, { recursive: true });
    }

    // Save requirements
    const requirementsPath = path.join(regulatoryDir, 'requirements.json');
    fs.writeFileSync(requirementsPath, JSON.stringify(this.regulatoryRequirements, null, 2));

    // Save guidance
    const guidancePath = path.join(regulatoryDir, 'guidance.json');
    fs.writeFileSync(guidancePath, JSON.stringify(this.regulatoryGuidance, null, 2));
  }

  async getRegulatoryIntelligence(phase: string, indication?: string): Promise<RegulatorySummary> {
    // Filter requirements by phase
    const filteredRequirements = this.regulatoryRequirements.filter(req =>
      req.applicable_phases.includes(phase)
    );

    // Sort guidance by relevance for the given phase and indication
    const sortedGuidance = [...this.regulatoryGuidance].sort((a, b) => {
      // Adjust relevance score based on phase and indication
      let scoreA = a.relevance_score;
      let scoreB = b.relevance_score;

      // Boost score if tags include the phase or indication
      if (indication) {
        const normalizedIndication = indication.toLowerCase();

        if (a.tags.some(tag => tag.toLowerCase().includes(normalizedIndication))) {
          scoreA += 0.1;
        }

        if (b.tags.some(tag => tag.toLowerCase().includes(normalizedIndication))) {
          scoreB += 0.1;
        }
      }

      return scoreB - scoreA;
    });

    // Get the top guidance documents
    const relevantGuidance = sortedGuidance.slice(0, 5);

    // Generate special considerations based on phase and indication
    const specialConsiderations = await this.generateSpecialConsiderations(phase, indication);

    return {
      therapeutic_area: indication || 'All Therapeutic Areas',
      phase,
      key_requirements: filteredRequirements,
      relevant_guidance: relevantGuidance,
      special_considerations: specialConsiderations,
    };
  }

  private async generateSpecialConsiderations(
    phase: string,
    indication?: string
  ): Promise<string[]> {
    // In a real implementation, this would use the Hugging Face service
    // to generate considerations based on the context

    // For now, return some sample considerations
    if (phase === 'Phase 1') {
      if (indication && indication.toLowerCase().includes('oncology')) {
        return [
          'First-in-human oncology trials may require specialized monitoring for cytokine release syndrome',
          'Consider implementation of accelerated titration designs to minimize exposure of patients to sub-therapeutic doses',
          'Ensure robust PK/PD modeling to support dose selection',
        ];
      } else {
        return [
          'Ensure robust safety monitoring plans are included in the protocol',
          'Consider adaptive designs for early signal detection',
        ];
      }
    } else if (phase === 'Phase 2') {
      if (indication && indication.toLowerCase().includes('rare')) {
        return [
          'Consider innovative trial designs such as basket or platform trials',
          'Engage with FDA for early feedback on endpoints and sample size',
        ];
      } else {
        return [
          'Ensure appropriate endpoint selection to support phase 3 planning',
          'Consider implementation of biomarker strategies',
        ];
      }
    } else if (phase === 'Phase 3') {
      return [
        'Ensure trial diversity meets FDORA 2022 requirements',
        'Consider implementation of decentralized elements to enhance recruitment and retention',
        'Develop a robust statistical analysis plan aligned with ICH E9(R1) estimand framework',
      ];
    } else {
      return [
        'Ensure post-approval study plans align with risk management plans',
        'Consider real-world evidence collection strategies',
      ];
    }
  }

  async analyzeProtocolCompliance(
    protocolText: string,
    phase: string,
    indication?: string
  ): Promise<string> {
    try {
      // In a real implementation, this would use a more sophisticated approach
      // with the Hugging Face service to analyze the protocol

      // Get regulatory requirements for the phase
      const regulatorySummary = await this.getRegulatoryIntelligence(phase, indication);

      // Analyze protocol for compliance with key requirements
      const complianceResults = [];

      // Check for key requirements in the protocol text
      for (const requirement of regulatorySummary.key_requirements) {
        // Simple keyword-based check (in a real implementation, this would be more sophisticated)
        const keyPhrases = this.extractKeyPhrases(requirement.requirement);
        const found = keyPhrases.some(phrase =>
          protocolText.toLowerCase().includes(phrase.toLowerCase())
        );

        complianceResults.push({
          requirement: requirement,
          compliant: found,
          reason: found
            ? 'Requirement appears to be addressed in the protocol'
            : 'Requirement may not be adequately addressed in the protocol',
        });
      }

      // Generate the analysis text
      let analysisText = `Regulatory Requirement Screen for ${phase} Protocol`;
      if (indication) {
        analysisText += ` in ${indication}`;
      }
      analysisText += '\n\n';
      analysisText +=
        'METHOD: This is a heuristic keyword screen, not a validated compliance score. ' +
        'It checks whether language associated with each regulatory requirement appears in ' +
        'the protocol text. Absence of matching language does not confirm non-compliance, and ' +
        'presence of matching language does not confirm a requirement is adequately addressed. ' +
        'Treat the results below as a drafting aid for expert review, not as a compliance determination.\n\n';

      const mandatoryIssues = complianceResults
        .filter(r => !r.compliant && r.requirement.compliance_level === 'mandatory')
        .map(r => r.requirement);

      const recommendedIssues = complianceResults
        .filter(r => !r.compliant && r.requirement.compliance_level === 'recommended')
        .map(r => r.requirement);

      if (mandatoryIssues.length > 0) {
        analysisText += 'CRITICAL ISSUES REQUIRING IMMEDIATE ATTENTION:\n\n';
        mandatoryIssues.forEach(issue => {
          analysisText += `- ${issue.agency} ${issue.guideline}: ${issue.requirement}\n`;
          analysisText += `  Reference: ${issue.document_reference}\n\n`;
        });
      }

      if (recommendedIssues.length > 0) {
        analysisText += 'RECOMMENDED IMPROVEMENTS:\n\n';
        recommendedIssues.forEach(issue => {
          analysisText += `- ${issue.agency} ${issue.guideline}: ${issue.requirement}\n`;
          analysisText += `  Reference: ${issue.document_reference}\n\n`;
        });
      }

      // Add special considerations
      if (regulatorySummary.special_considerations.length > 0) {
        analysisText += 'SPECIAL CONSIDERATIONS FOR THIS PROTOCOL:\n\n';
        regulatorySummary.special_considerations.forEach(consideration => {
          analysisText += `- ${consideration}\n`;
        });
        analysisText += '\n';
      }

      // Add screen summary. We deliberately do NOT emit a "compliance percentage":
      // a keyword-match ratio is not a validated compliance score and stating it as a
      // percentage implies a precision this heuristic does not have.
      // See FORENSIC_CODE_AUDIT_2026-05-29.md HI-3.
      const matchedCount = complianceResults.filter(r => r.compliant).length;
      const totalCount = complianceResults.length;
      const unmatchedCount = totalCount - matchedCount;

      analysisText += 'SCREEN SUMMARY:\n';
      analysisText += `- Requirements checked: ${totalCount}\n`;
      analysisText += `- Requirements with matching language detected: ${matchedCount}\n`;
      analysisText += `- Requirements with no matching language (require manual review): ${unmatchedCount}\n`;
      analysisText +=
        'This summary reports text-match counts only and is not a compliance score.\n\n';

      // Add recommended guidance
      analysisText += 'RECOMMENDED GUIDANCE DOCUMENTS:\n\n';
      regulatorySummary.relevant_guidance.slice(0, 3).forEach(guidance => {
        analysisText += `- ${guidance.title} (${guidance.agency}, ${guidance.year})\n`;
        analysisText += `  ${guidance.summary}\n\n`;
      });

      return analysisText;
    } catch (error) {
      log.error('Error analyzing protocol compliance:', error);
      throw error;
    }
  }

  private extractKeyPhrases(text: string): string[] {
    // Simple implementation to extract key phrases from a requirement
    // In a real implementation, this would use more sophisticated NLP techniques
    const words = text.toLowerCase().split(/\s+/);
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'in',
      'on',
      'at',
      'to',
      'for',
      'with',
      'by',
      'of',
      'is',
      'are',
    ]);

    const filteredWords = words.filter(word => !stopWords.has(word) && word.length > 3);

    // Create phrases from consecutive meaningful words
    const phrases = [];
    let currentPhrase = [];

    for (const word of filteredWords) {
      currentPhrase.push(word);

      if (currentPhrase.length === 3) {
        phrases.push(currentPhrase.join(' '));
        currentPhrase.shift(); // Remove the first word to slide the window
      }
    }

    // Add any remaining phrases
    if (currentPhrase.length > 1) {
      phrases.push(currentPhrase.join(' '));
    }

    // Also add individual important words
    filteredWords.forEach(word => {
      if (word.length > 5) {
        phrases.push(word);
      }
    });

    return phrases;
  }
}
