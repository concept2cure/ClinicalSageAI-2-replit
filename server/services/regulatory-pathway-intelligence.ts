/**
 * Concept2Cure Regulatory Pathway Intelligence Engine
 *
 * Proprietary service that provides deep regulatory intelligence across 30+ global
 * agencies, 65+ ICH guidelines, and comprehensive document requirement mapping.
 *
 * This engine powers AnA's ability to advise on:
 * - Optimal regulatory strategy across jurisdictions
 * - Required documents for any submission type at any agency
 * - ICH guideline applicability to specific CTD sections
 * - Cross-agency comparison and timeline estimation
 * - Expedited pathway eligibility assessment
 * - Regional requirement differences and bridging needs
 *
 * Copyright (c) Concept2Cure Inc. Proprietary and Confidential.
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface RegulatoryAuthority {
  fullName: string;
  country: string;
  region: string;
  submissionFormat?: string;
  language?: string[];
  submissionTypes?: Record<string, any>;
  expeditedPrograms?: Record<string, any>;
  uniqueRequirements?: Record<string, string>;
  pharmacovigilance?: Record<string, any>;
  [key: string]: any;
}

export interface ICHGuideline {
  title: string;
  status: string;
  ctdSection?: string;
  scope?: string;
  keyRequirements?: string[];
  criticalForSubmission?: boolean;
  [key: string]: any;
}

export interface DocumentRequirement {
  submissionType: string;
  agency: string;
  requiredDocuments: Record<string, any>;
  [key: string]: any;
}

export interface PathwayRecommendation {
  agency: string;
  submissionType: string;
  estimatedTimeline: string;
  expeditedOptions: ExpeditedOption[];
  requiredDocuments: string[];
  criticalICHGuidelines: string[];
  regionalConsiderations: string[];
  riskFactors: string[];
}

export interface ExpeditedOption {
  name: string;
  eligibilityCriteria: string;
  benefits: string[];
  timelineSaving: string;
}

export interface CrossAgencyStrategy {
  primaryAgency: string;
  parallelSubmissions: string[];
  sequentialSubmissions: string[];
  relyProcedures: string[];
  estimatedGlobalTimeline: string;
  bridgingRequirements: string[];
  languageRequirements: Record<string, string[]>;
}

export interface CTDSectionGuidance {
  section: string;
  title: string;
  applicableICHGuidelines: string[];
  keyRequirements: string[];
  commonDeficiencies: string[];
  agencySpecificNotes: Record<string, string>;
}

// ─── Service ────────────────────────────────────────────────────────────────────

export class RegulatoryPathwayIntelligenceEngine {
  private authorities: Record<string, RegulatoryAuthority> = {};
  private ichGuidelines: Record<string, Record<string, ICHGuideline>> = {};
  private documentMatrix: any = {};
  private initialized = false;

  constructor() {
    this.loadKnowledgeBases();
  }

  // ─── Data Loading ───────────────────────────────────────────────────────────

  private loadKnowledgeBases(): void {
    try {
      const dataDir = path.join(__dirname, '..', 'data');

      // Load global regulatory authorities
      const authPath = path.join(dataDir, 'global-regulatory-authorities.json');
      if (fs.existsSync(authPath)) {
        const authData = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
        this.authorities = authData.authorities || {};
        console.log(`[RPI Engine] Loaded ${Object.keys(this.authorities).length} regulatory authorities`);
      }

      // Load comprehensive ICH guidelines
      const ichPath = path.join(dataDir, 'ich-guidelines-comprehensive.json');
      if (fs.existsSync(ichPath)) {
        const ichData = JSON.parse(fs.readFileSync(ichPath, 'utf-8'));
        this.ichGuidelines = ichData.guidelines || {};
        const totalGuidelines = Object.values(this.ichGuidelines)
          .reduce((sum: number, cat: any) => sum + Object.keys(cat).length, 0);
        console.log(`[RPI Engine] Loaded ${totalGuidelines} ICH guidelines across ${Object.keys(this.ichGuidelines).length} categories`);
      }

      // Load document requirements matrix
      const docPath = path.join(dataDir, 'regulatory-document-requirements-matrix.json');
      if (fs.existsSync(docPath)) {
        const docData = JSON.parse(fs.readFileSync(docPath, 'utf-8'));
        this.documentMatrix = docData;
        console.log(`[RPI Engine] Loaded document requirements matrix`);
      }

      this.initialized = true;
      console.log('[RPI Engine] Regulatory Pathway Intelligence Engine initialized successfully');
    } catch (error) {
      console.error('[RPI Engine] Failed to load knowledge bases:', error);
    }
  }

  // ─── Authority Intelligence ─────────────────────────────────────────────────

  /**
   * Get detailed information about a specific regulatory authority
   */
  getAuthority(agencyCode: string): RegulatoryAuthority | null {
    return this.authorities[agencyCode] || null;
  }

  /**
   * List all supported regulatory authorities
   */
  listAuthorities(): Array<{ code: string; name: string; country: string; region: string }> {
    return Object.entries(this.authorities)
      .filter(([_, auth]) => auth.fullName) // filter out placeholder entries
      .map(([code, auth]) => ({
        code,
        name: auth.fullName,
        country: auth.country,
        region: auth.region,
      }));
  }

  /**
   * Get all authorities in a specific region
   */
  getAuthoritiesByRegion(region: string): Array<{ code: string; authority: RegulatoryAuthority }> {
    return Object.entries(this.authorities)
      .filter(([_, auth]) => auth.region?.toLowerCase().includes(region.toLowerCase()))
      .map(([code, authority]) => ({ code, authority }));
  }

  /**
   * Get submission types supported by an agency
   */
  getSubmissionTypes(agencyCode: string): Record<string, any> | null {
    const auth = this.authorities[agencyCode];
    if (!auth) return null;
    return auth.submissionTypes || null;
  }

  /**
   * Get expedited programs available at an agency
   */
  getExpeditedPrograms(agencyCode: string): Record<string, any> | null {
    const auth = this.authorities[agencyCode];
    if (!auth) return null;
    return auth.expeditedPrograms || null;
  }

  // ─── ICH Guideline Intelligence ────────────────────────────────────────────

  /**
   * Get a specific ICH guideline by ID (e.g., "Q1A_R2", "E6_R2_R3")
   */
  getICHGuideline(guidelineId: string): ICHGuideline | null {
    for (const category of Object.values(this.ichGuidelines)) {
      if (category[guidelineId]) {
        return category[guidelineId];
      }
    }
    return null;
  }

  /**
   * Get all ICH guidelines for a specific CTD section
   */
  getGuidelinesForCTDSection(ctdSection: string): Array<{ id: string; guideline: ICHGuideline }> {
    const results: Array<{ id: string; guideline: ICHGuideline }> = [];
    for (const category of Object.values(this.ichGuidelines)) {
      for (const [id, guideline] of Object.entries(category)) {
        if (guideline.ctdSection && guideline.ctdSection.includes(ctdSection)) {
          results.push({ id, guideline });
        }
      }
    }
    return results;
  }

  /**
   * Get all critical-for-submission ICH guidelines
   */
  getCriticalGuidelines(): Array<{ id: string; guideline: ICHGuideline }> {
    const results: Array<{ id: string; guideline: ICHGuideline }> = [];
    for (const category of Object.values(this.ichGuidelines)) {
      for (const [id, guideline] of Object.entries(category)) {
        if (guideline.criticalForSubmission) {
          results.push({ id, guideline });
        }
      }
    }
    return results;
  }

  /**
   * Get ICH guidelines by category (Q_Quality, S_Safety, E_Efficacy, M_Multidisciplinary)
   */
  getGuidelinesByCategory(category: 'Q_Quality' | 'S_Safety' | 'E_Efficacy' | 'M_Multidisciplinary'): Record<string, ICHGuideline> {
    return this.ichGuidelines[category] || {};
  }

  /**
   * Search ICH guidelines by keyword
   */
  searchGuidelines(keyword: string): Array<{ id: string; guideline: ICHGuideline; matchedIn: string }> {
    const results: Array<{ id: string; guideline: ICHGuideline; matchedIn: string }> = [];
    const kw = keyword.toLowerCase();

    for (const category of Object.values(this.ichGuidelines)) {
      for (const [id, guideline] of Object.entries(category)) {
        if (guideline.title?.toLowerCase().includes(kw)) {
          results.push({ id, guideline, matchedIn: 'title' });
        } else if (guideline.scope?.toLowerCase().includes(kw)) {
          results.push({ id, guideline, matchedIn: 'scope' });
        } else if (guideline.keyRequirements?.some((r: string) => r.toLowerCase().includes(kw))) {
          results.push({ id, guideline, matchedIn: 'keyRequirements' });
        }
      }
    }
    return results;
  }

  // ─── Document Requirements ──────────────────────────────────────────────────

  /**
   * Get required documents for a specific submission type
   */
  getDocumentRequirements(submissionTypeKey: string): DocumentRequirement | null {
    const reqs = this.documentMatrix?.submissionTypeDocumentRequirements;
    if (!reqs) return null;
    return reqs[submissionTypeKey] || null;
  }

  /**
   * Get CTD module structure
   */
  getCTDModuleStructure(): Record<string, any> {
    return this.documentMatrix?.ctdModuleStructure || {};
  }

  /**
   * Get cross-agency equivalent submission types
   */
  getCrossAgencyEquivalents(submissionCategory: string): Record<string, string> | null {
    const matrix = this.documentMatrix?.crossAgencyComparisonMatrix;
    if (!matrix) return null;
    return matrix[submissionCategory] || null;
  }

  /**
   * Get global review timelines comparison
   */
  getGlobalReviewTimelines(): Record<string, any> {
    return this.documentMatrix?.crossAgencyComparisonMatrix?.reviewTimelines_months || {};
  }

  // ─── Pathway Analysis ──────────────────────────────────────────────────────

  /**
   * Recommend optimal regulatory pathway for a given product profile
   */
  recommendPathway(params: {
    productType: 'drug' | 'biologic' | 'device' | 'biosimilar' | 'generic' | 'combination';
    indication: string;
    targetAgencies: string[];
    isFirstInClass?: boolean;
    isOrphan?: boolean;
    hasUnmetNeed?: boolean;
    currentPhase?: string;
  }): PathwayRecommendation[] {
    const recommendations: PathwayRecommendation[] = [];

    for (const agencyCode of params.targetAgencies) {
      const authority = this.authorities[agencyCode];
      if (!authority) continue;

      const recommendation: PathwayRecommendation = {
        agency: agencyCode,
        submissionType: this.determineSubmissionType(agencyCode, params.productType),
        estimatedTimeline: this.estimateTimeline(agencyCode, params),
        expeditedOptions: this.assessExpeditedEligibility(agencyCode, params),
        requiredDocuments: this.getRequiredDocumentsList(agencyCode, params.productType),
        criticalICHGuidelines: this.getCriticalGuidelinesForProduct(params.productType),
        regionalConsiderations: this.getRegionalConsiderations(agencyCode, params),
        riskFactors: this.assessRiskFactors(agencyCode, params),
      };

      recommendations.push(recommendation);
    }

    return recommendations;
  }

  /**
   * Design a global regulatory strategy across multiple agencies
   */
  designGlobalStrategy(params: {
    productType: 'drug' | 'biologic' | 'device' | 'biosimilar' | 'generic';
    targetAgencies: string[];
    primaryAgency: string;
    isFirstInClass?: boolean;
    hasUnmetNeed?: boolean;
  }): CrossAgencyStrategy {
    const primary = params.primaryAgency;
    const others = params.targetAgencies.filter(a => a !== primary);

    // Determine which agencies can run parallel vs need sequential
    const parallel: string[] = [];
    const sequential: string[] = [];
    const rely: string[] = [];
    const bridging: string[] = [];
    const languages: Record<string, string[]> = {};

    for (const agencyCode of others) {
      const auth = this.authorities[agencyCode];
      if (!auth) continue;

      // Agencies with reliance/recognition procedures
      if (auth.uniqueFeatures?.relyProcedure || auth.uniqueFeatures?.referenceAgencyReliance) {
        rely.push(`${agencyCode}: Can leverage ${primary} decision via reliance procedure`);
      }

      // Agencies needing bridging studies (primarily Asian agencies)
      if (auth.uniqueRequirements?.bridgingStudy || auth.uniqueRequirements?.localClinicalTrials) {
        sequential.push(agencyCode);
        bridging.push(`${agencyCode}: ${auth.uniqueRequirements?.bridgingStudy || auth.uniqueRequirements?.localClinicalTrials}`);
      } else {
        parallel.push(agencyCode);
      }

      // Language requirements
      if (auth.language) {
        languages[agencyCode] = auth.language;
      }
    }

    return {
      primaryAgency: primary,
      parallelSubmissions: parallel,
      sequentialSubmissions: sequential,
      relyProcedures: rely,
      estimatedGlobalTimeline: this.estimateGlobalTimeline(primary, parallel, sequential),
      bridgingRequirements: bridging,
      languageRequirements: languages,
    };
  }

  /**
   * Get CTD section guidance with applicable guidelines and common deficiencies
   */
  getCTDSectionGuidance(section: string): CTDSectionGuidance {
    const guidelines = this.getGuidelinesForCTDSection(section);

    const commonDeficiencies = this.getCommonDeficiencies(section);
    const agencyNotes = this.getAgencySpecificNotes(section);

    return {
      section,
      title: this.getCTDSectionTitle(section),
      applicableICHGuidelines: guidelines.map(g => `${g.id}: ${g.guideline.title}`),
      keyRequirements: guidelines.flatMap(g => g.guideline.keyRequirements || []),
      commonDeficiencies,
      agencySpecificNotes: agencyNotes,
    };
  }

  // ─── Internal Helpers ──────────────────────────────────────────────────────

  private determineSubmissionType(agencyCode: string, productType: string): string {
    const typeMap: Record<string, Record<string, string>> = {
      drug: { FDA: 'NDA', EMA: 'MAA', PMDA: 'JNDA', HealthCanada: 'NDS', TGA: 'Category 1', MHRA: 'MAA', NMPA: 'NDA', MFDS: 'NDA', CDSCO: 'NDA', HSA: 'NDA', Swissmedic: 'MAA', ANVISA: 'New Drug Registration' },
      biologic: { FDA: 'BLA', EMA: 'MAA (Centralised)', PMDA: 'JNDA', HealthCanada: 'NDS', TGA: 'Category 1', MHRA: 'MAA', NMPA: 'BLA', MFDS: 'BLA' },
      device: { FDA: '510(k) or PMA', EMA: 'MDR Conformity', PMDA: 'Device Approval', HealthCanada: 'MDL', TGA: 'ARTG Registration', MHRA: 'UKCA Marking' },
      biosimilar: { FDA: '351(k)', EMA: 'MAA (Art.10.4 Biosimilar)', PMDA: 'Biosimilar Application', HealthCanada: 'NDS (Biosimilar)', MFDS: 'Biosimilar Application' },
      generic: { FDA: 'ANDA', EMA: 'MAA (Art.10.1 Generic)', PMDA: 'Kohatsu', HealthCanada: 'ANDS', TGA: 'Category 3', MFDS: 'Generic Approval', CDSCO: 'ANDA' },
    };
    return typeMap[productType]?.[agencyCode] || 'Standard Application';
  }

  private estimateTimeline(agencyCode: string, params: any): string {
    const timelines: Record<string, { standard: number; priority: number }> = {
      FDA: { standard: 10, priority: 6 },
      EMA: { standard: 12, priority: 8 },
      PMDA: { standard: 12, priority: 6 },
      HealthCanada: { standard: 10, priority: 6 },
      TGA: { standard: 11, priority: 8 },
      MHRA: { standard: 10, priority: 8 },
      NMPA: { standard: 10, priority: 6 },
      MFDS: { standard: 6, priority: 5 },
      HSA: { standard: 9, priority: 2 },
      Swissmedic: { standard: 11, priority: 5 },
      CDSCO: { standard: 9, priority: 6 },
      ANVISA: { standard: 12, priority: 4 },
    };
    const t = timelines[agencyCode];
    if (!t) return 'Timeline varies — consult agency guidance';
    const isPriority = params.hasUnmetNeed || params.isFirstInClass || params.isOrphan;
    return isPriority ? `~${t.priority} months (expedited)` : `~${t.standard} months (standard)`;
  }

  private assessExpeditedEligibility(agencyCode: string, params: any): ExpeditedOption[] {
    const options: ExpeditedOption[] = [];
    const auth = this.authorities[agencyCode];
    if (!auth?.expeditedPrograms) return options;

    for (const [name, program] of Object.entries(auth.expeditedPrograms) as [string, any][]) {
      const eligible = this.checkExpeditedEligibility(program, params);
      if (eligible) {
        options.push({
          name,
          eligibilityCriteria: program.criteria || 'See agency guidance',
          benefits: program.benefits || [],
          timelineSaving: program.reviewTimeline || 'Varies',
        });
      }
    }
    return options;
  }

  private checkExpeditedEligibility(program: any, params: any): boolean {
    if (!program.criteria) return false;
    const criteria = program.criteria.toLowerCase();
    if (params.hasUnmetNeed && criteria.includes('unmet')) return true;
    if (params.isFirstInClass && (criteria.includes('first') || criteria.includes('breakthrough') || criteria.includes('innovation'))) return true;
    if (params.isOrphan && criteria.includes('rare')) return true;
    if (params.hasUnmetNeed && criteria.includes('serious')) return true;
    return false;
  }

  private getRequiredDocumentsList(agencyCode: string, productType: string): string[] {
    const docKey = productType === 'drug' ? 'NDA_FDA' : productType === 'biologic' ? 'BLA_FDA' : '510k_FDA';
    const reqs = this.documentMatrix?.submissionTypeDocumentRequirements?.[docKey];
    if (!reqs?.requiredDocuments) return ['See document requirements matrix'];

    const docs: string[] = [];
    for (const [module, items] of Object.entries(reqs.requiredDocuments)) {
      if (Array.isArray(items)) {
        docs.push(`${module}: ${(items as string[]).join(', ')}`);
      }
    }
    return docs;
  }

  private getCriticalGuidelinesForProduct(productType: string): string[] {
    const critical = this.getCriticalGuidelines();
    const productSpecific: string[] = [];

    for (const { id, guideline } of critical) {
      // Filter based on product type relevance
      if (productType === 'biologic' && (id.startsWith('Q5') || id.startsWith('Q6B') || id.startsWith('S6'))) {
        productSpecific.push(`${id}: ${guideline.title}`);
      } else if (productType !== 'biologic' && !id.startsWith('Q5') && !id.startsWith('Q6B') && !id.startsWith('S6')) {
        productSpecific.push(`${id}: ${guideline.title}`);
      }
    }
    return productSpecific.length > 0 ? productSpecific : critical.map(c => `${c.id}: ${c.guideline.title}`);
  }

  private getRegionalConsiderations(agencyCode: string, params: any): string[] {
    const considerations: string[] = [];
    const auth = this.authorities[agencyCode];
    if (!auth) return considerations;

    if (auth.uniqueRequirements) {
      for (const [key, value] of Object.entries(auth.uniqueRequirements)) {
        considerations.push(`${key}: ${value}`);
      }
    }

    if (auth.languageNote) {
      considerations.push(`Language: ${auth.languageNote}`);
    }

    if (auth.pharmacovigilance?.QPPV) {
      considerations.push(`Pharmacovigilance: ${auth.pharmacovigilance.QPPV}`);
    }

    return considerations;
  }

  private assessRiskFactors(agencyCode: string, params: any): string[] {
    const risks: string[] = [];
    const auth = this.authorities[agencyCode];
    if (!auth) return risks;

    // Language risks
    if (auth.language && !auth.language.includes('en')) {
      risks.push(`All documents must be translated to ${auth.language.join(', ')}`);
    }

    // Local clinical data risks
    if (auth.uniqueRequirements?.localClinicalTrials || auth.uniqueRequirements?.chinesePatientData || auth.uniqueRequirements?.japanesePatientData) {
      risks.push('Local clinical trial data in local patients may be required');
    }

    // GMP inspection risks
    if (auth.uniqueRequirements?.foreignInspection || auth.uniqueRequirements?.GMP_Certification) {
      risks.push('Foreign facility GMP inspection by this agency may be required');
    }

    return risks;
  }

  private estimateGlobalTimeline(primary: string, parallel: string[], sequential: string[]): string {
    const primaryMonths = primary === 'FDA' ? 10 : primary === 'EMA' ? 12 : 10;
    const parallelExtra = parallel.length > 0 ? 2 : 0; // parallel adds ~2 months coordination
    const sequentialExtra = sequential.length * 6; // each sequential adds ~6 months
    const total = primaryMonths + parallelExtra + sequentialExtra;
    return `~${total} months for full global coverage (${primary} primary + ${parallel.length} parallel + ${sequential.length} sequential)`;
  }

  private getCommonDeficiencies(section: string): string[] {
    const deficiencyMap: Record<string, string[]> = {
      '3.2.S': [
        'Incomplete impurity characterization (ICH Q3A)',
        'Insufficient starting material justification (ICH Q11)',
        'Missing or inadequate forced degradation studies',
        'Incomplete genotoxic impurity assessment (ICH M7)',
        'Inadequate control strategy for critical quality attributes',
      ],
      '3.2.P': [
        'Incomplete pharmaceutical development narrative (ICH Q8)',
        'Missing dissolution method validation',
        'Inadequate container closure integrity justification',
        'Insufficient stability data at time of submission (ICH Q1A)',
        'Missing or inadequate extractables/leachables assessment',
      ],
      '2.5': [
        'Benefit-risk assessment not adequately substantiated',
        'Missing discussion of dose-response relationship',
        'Inadequate comparison with existing therapies',
        'Missing or incomplete subgroup analyses',
      ],
      '2.7.4': [
        'Incomplete safety database (ICH E1 exposure requirements not met)',
        'Missing analysis of deaths and serious adverse events',
        'Inadequate discussion of drug-drug interactions',
        'Missing or incomplete hepatotoxicity assessment (Hy\'s Law evaluation)',
      ],
      '4.2.3': [
        'Insufficient toxicology study duration relative to clinical program',
        'Missing reproductive toxicity data for WOCBP indication',
        'Inadequate justification for species selection',
        'Missing or incomplete carcinogenicity assessment',
      ],
    };

    // Return deficiencies for the closest matching section
    for (const [key, deficiencies] of Object.entries(deficiencyMap)) {
      if (section.startsWith(key)) return deficiencies;
    }
    return ['Consult agency-specific guidance for common deficiencies in this section'];
  }

  private getAgencySpecificNotes(section: string): Record<string, string> {
    const notes: Record<string, string> = {};

    if (section.startsWith('3.2')) {
      notes['FDA'] = 'DMF cross-references allowed; note FDA-specific regional information in 3.2.R';
      notes['EMA'] = 'CEP (Certificate of Suitability) may replace full 3.2.S for Ph.Eur. monograph substances; ASMF (EU DMF) procedures apply';
      notes['PMDA'] = 'Japanese Pharmacopoeia compliance required; JP-specific annex sections may be needed';
      notes['NMPA'] = 'Chinese Pharmacopoeia (ChP) standards apply; all documents require Chinese translation';
    }

    if (section.startsWith('5.3') || section.startsWith('2.7')) {
      notes['FDA'] = 'ISS/ISE (Integrated Summary of Safety/Effectiveness) required as part of NDA';
      notes['EMA'] = 'PSUR/PBRER requirements per EURD list; product information in 24 EU languages';
      notes['PMDA'] = 'Bridging study data required if foreign clinical data extrapolation not justified (ICH E5); Japanese patient PK/PD data expected';
      notes['NMPA'] = 'Phase III data in Chinese patients generally required; minimum proportion varies by indication';
      notes['MFDS'] = 'Korean bridging PK study may be required per ICH E5';
    }

    return notes;
  }

  private getCTDSectionTitle(section: string): string {
    const titles: Record<string, string> = {
      '2.3': 'Quality Overall Summary',
      '2.4': 'Nonclinical Overview',
      '2.5': 'Clinical Overview',
      '2.6': 'Nonclinical Written and Tabulated Summaries',
      '2.7': 'Clinical Summary',
      '2.7.1': 'Summary of Biopharmaceutic Studies',
      '2.7.2': 'Summary of Clinical Pharmacology',
      '2.7.3': 'Summary of Clinical Efficacy',
      '2.7.4': 'Summary of Clinical Safety',
      '3.2.S': 'Drug Substance',
      '3.2.P': 'Drug Product',
      '3.2.A': 'Appendices',
      '4.2.1': 'Pharmacology',
      '4.2.2': 'Pharmacokinetics',
      '4.2.3': 'Toxicology',
      '5.3.1': 'Biopharmaceutic Studies',
      '5.3.3': 'PK and PD Studies',
      '5.3.5': 'Efficacy and Safety Studies',
    };
    return titles[section] || section;
  }

  // ─── Aggregate Intelligence ─────────────────────────────────────────────────

  /**
   * Generate a comprehensive regulatory intelligence briefing for AnA
   */
  generateIntelligenceBriefing(params: {
    therapeuticArea?: string;
    phase?: string;
    targetAgencies?: string[];
    productType?: string;
  }): {
    totalAuthorities: number;
    totalICHGuidelines: number;
    totalDocumentTemplates: number;
    relevantGuidelines: Array<{ id: string; title: string }>;
    targetAgencyDetails: Array<{ code: string; name: string; submissionType: string }>;
    criticalRequirements: string[];
  } {
    const allGuidelineCount = Object.values(this.ichGuidelines)
      .reduce((sum: number, cat: any) => sum + Object.keys(cat).length, 0);

    const docTemplateCount = Object.keys(
      this.documentMatrix?.submissionTypeDocumentRequirements || {}
    ).length;

    // Find relevant guidelines
    const relevant: Array<{ id: string; title: string }> = [];
    if (params.therapeuticArea) {
      const searchResults = this.searchGuidelines(params.therapeuticArea);
      relevant.push(...searchResults.map(r => ({ id: r.id, title: r.guideline.title })));
    }

    // Critical guidelines always relevant
    const critical = this.getCriticalGuidelines();
    const criticalReqs = critical.flatMap(c =>
      (c.guideline.keyRequirements || []).slice(0, 2).map(r => `[${c.id}] ${r}`)
    );

    // Target agency details
    const agencyDetails = (params.targetAgencies || ['FDA', 'EMA']).map(code => {
      const auth = this.authorities[code];
      return {
        code,
        name: auth?.fullName || code,
        submissionType: this.determineSubmissionType(code, params.productType || 'drug'),
      };
    });

    return {
      totalAuthorities: Object.keys(this.authorities).length,
      totalICHGuidelines: allGuidelineCount,
      totalDocumentTemplates: docTemplateCount,
      relevantGuidelines: relevant.length > 0 ? relevant : critical.map(c => ({ id: c.id, title: c.guideline.title })),
      targetAgencyDetails: agencyDetails,
      criticalRequirements: criticalReqs.slice(0, 20),
    };
  }

  /**
   * Check if the engine is initialized and ready
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Get engine statistics
   */
  getStats(): { authorities: number; ichGuidelines: number; documentTemplates: number } {
    return {
      authorities: Object.keys(this.authorities).filter(k => !k.includes('_Note') && !k.includes('_Bridge')).length,
      ichGuidelines: Object.values(this.ichGuidelines)
        .reduce((sum: number, cat: any) => sum + Object.keys(cat).length, 0),
      documentTemplates: Object.keys(this.documentMatrix?.submissionTypeDocumentRequirements || {}).length,
    };
  }
}

// Singleton instance
let instance: RegulatoryPathwayIntelligenceEngine | null = null;

export function getRegulatoryPathwayIntelligence(): RegulatoryPathwayIntelligenceEngine {
  if (!instance) {
    instance = new RegulatoryPathwayIntelligenceEngine();
  }
  return instance;
}
