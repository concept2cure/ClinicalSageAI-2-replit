/**
 * ═══════════════════════════════════════════════════════════════════════════
 *                    ICH GUIDELINES FARMER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Harvests International Council for Harmonisation (ICH) guidelines to populate
 * Lumen Cortex with globally harmonized pharmaceutical regulatory guidance.
 *
 * ICH GUIDELINE CATEGORIES:
 * - Q Guidelines: Quality (Q1-Q14)
 * - S Guidelines: Safety (S1-S12)
 * - E Guidelines: Efficacy (E1-E20)
 * - M Guidelines: Multidisciplinary (M1-M13)
 *
 * ATOMS GENERATED:
 * - ich_guideline (full guideline content)
 * - ich_principle (key principles)
 * - ich_requirement (specific requirements)
 *
 * @author TrialSage AI Team
 * @version 1.0.0
 * @license Proprietary - Concept2Cure Inc.
 */

import pg from 'pg';
import crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════
//                          TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

interface ICHGuideline {
  code: string;
  title: string;
  category: 'Q' | 'S' | 'E' | 'M';
  step: number; // 1-5 (Step 5 = final)
  effectiveDate?: string;
  content: string;
  keyPrinciples: string[];
  applicability: string[];
  relatedGuidelines?: string[];
}

interface ICHAtom {
  title: string;
  content: string;
  atom_type: string;
  source: string;
  domain: string;
  confidence_score: number;
  metadata: Record<string, unknown>;
  tags: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
//                          ICH GUIDELINES DATA
// ═══════════════════════════════════════════════════════════════════════════

const ICH_GUIDELINES: ICHGuideline[] = [
  // Quality Guidelines (Q)
  {
    code: 'Q1A(R2)',
    title: 'Stability Testing of New Drug Substances and Products',
    category: 'Q',
    step: 5,
    effectiveDate: '2003-02-06',
    content: `
## ICH Q1A(R2): Stability Testing of New Drug Substances and Products

### Objective
This guideline provides recommendations on the design of stability studies for a new drug substance
and drug product that are sufficient to establish a retest period or shelf life.

### Scope
- New molecular entities and their associated products
- Applies to marketing authorization applications globally

### Key Requirements

#### Storage Conditions
| Study Type | Temperature | Humidity | Duration |
|------------|------------|----------|----------|
| Long-term | 25°C ± 2°C | 60% RH ± 5% | 12-24 months |
| Intermediate | 30°C ± 2°C | 65% RH ± 5% | 6 months |
| Accelerated | 40°C ± 2°C | 75% RH ± 5% | 6 months |

#### Testing Frequency
- **Long-term studies**: 0, 3, 6, 9, 12 months in the first year; every 6 months second year; annually thereafter
- **Accelerated studies**: 0, 3, 6 months
- **Intermediate studies**: 0, 6, 9, 12 months

### Significant Change Criteria
A significant change is defined as:
- 5% change in assay
- Any degradation product exceeding acceptance criterion
- Failure to meet pH specification
- Dissolution failures (12 dosage units)
- Failure to meet appearance and physical property specifications

### Data Evaluation
Statistical analysis of stability data should be conducted to determine whether a retest period
or shelf life can be established. Linear regression analysis may be appropriate.
`.trim(),
    keyPrinciples: [
      'Establish appropriate storage conditions',
      'Define testing intervals and duration',
      'Set acceptance criteria for stability',
      'Support retest period and shelf life claims',
    ],
    applicability: ['New drug substances', 'New drug products', 'Marketing authorization'],
    relatedGuidelines: ['Q1B', 'Q1C', 'Q1D', 'Q1E'],
  },
  {
    code: 'Q3A(R2)',
    title: 'Impurities in New Drug Substances',
    category: 'Q',
    step: 5,
    effectiveDate: '2006-10-25',
    content: `
## ICH Q3A(R2): Impurities in New Drug Substances

### Objective
Provide guidance on impurity classification, identification, qualification thresholds,
and reporting requirements for impurities in new drug substances.

### Scope
- New drug substances (synthetic chemical entities)
- Impurities from synthesis, degradation, or from starting materials

### Classification of Impurities
1. **Organic impurities**: Starting materials, by-products, intermediates, degradants
2. **Inorganic impurities**: Reagents, ligands, catalysts, heavy metals
3. **Residual solvents**: Covered by ICH Q3C

### Reporting, Identification, and Qualification Thresholds

| Maximum Daily Dose | Reporting | Identification | Qualification |
|-------------------|-----------|----------------|---------------|
| ≤2g/day | 0.05% | 0.10% or 1.0mg | 0.15% or 1.0mg |
| >2g/day | 0.03% | 0.05% | 0.05% |

### Documentation Requirements
- Impurity profiles
- Analytical methods for detection
- Qualification data for impurities above thresholds
- Rationale for proposed specification limits
`.trim(),
    keyPrinciples: [
      'Classification of organic, inorganic impurities',
      'Threshold-based reporting requirements',
      'Identification requirements above thresholds',
      'Qualification studies for safety',
    ],
    applicability: ['New drug substances', 'Synthesis process impurities', 'Specifications'],
  },
  {
    code: 'Q8(R2)',
    title: 'Pharmaceutical Development',
    category: 'Q',
    step: 5,
    effectiveDate: '2009-08-01',
    content: `
## ICH Q8(R2): Pharmaceutical Development

### Objective
Describe the recommended content for the Pharmaceutical Development section (3.2.P.2)
of a regulatory submission in the ICH M4 Common Technical Document format.

### Quality by Design (QbD) Concepts

#### Quality Target Product Profile (QTPP)
Prospective summary of quality characteristics of a drug product that ideally will be achieved
to ensure desired quality, safety, and efficacy.

#### Critical Quality Attributes (CQAs)
Physical, chemical, biological, or microbiological property that should be within an appropriate
limit, range, or distribution to ensure the desired product quality.

#### Design Space
Multidimensional combination of input variables and process parameters that have been demonstrated
to provide assurance of quality.

### Risk Assessment
- Identify variables that may affect CQAs
- Rank and prioritize risks
- Design experiments to understand relationships

### Control Strategy
A planned set of controls, derived from current product and process understanding, that ensures
process performance and product quality.

### Elements of Pharmaceutical Development
1. Drug substance properties
2. Formulation development
3. Manufacturing process development
4. Container closure system
5. Microbiological attributes
6. Compatibility
`.trim(),
    keyPrinciples: [
      'Quality by Design (QbD) approach',
      'Quality Target Product Profile',
      'Critical Quality Attributes identification',
      'Design Space establishment',
      'Risk-based control strategy',
    ],
    applicability: ['Drug product development', 'CTD submissions', 'Process development'],
    relatedGuidelines: ['Q9', 'Q10', 'Q11', 'Q12'],
  },
  {
    code: 'Q9(R1)',
    title: 'Quality Risk Management',
    category: 'Q',
    step: 5,
    effectiveDate: '2023-01-18',
    content: `
## ICH Q9(R1): Quality Risk Management

### Objective
Provide principles and tools for quality risk management to facilitate better
and more informed decisions in pharmaceutical manufacturing and regulation.

### Quality Risk Management Principles
1. **Evaluation of risk** should be based on scientific knowledge and linked to patient protection
2. **Level of effort, formality, and documentation** should be commensurate with level of risk
3. **Risk management** is a continuous process throughout the product lifecycle

### Risk Management Process

#### 1. Risk Assessment
- **Risk Identification**: What might go wrong?
- **Risk Analysis**: What is the likelihood and severity?
- **Risk Evaluation**: What level of risk is acceptable?

#### 2. Risk Control
- **Risk Reduction**: Implement controls to reduce risk
- **Risk Acceptance**: Accept residual risk with justification

#### 3. Risk Communication
- Share risk information with stakeholders
- Document decisions and rationale

#### 4. Risk Review
- Monitor effectiveness of controls
- Review when new information emerges

### Risk Assessment Tools
- FMEA (Failure Mode Effects Analysis)
- FTA (Fault Tree Analysis)
- HACCP (Hazard Analysis Critical Control Points)
- Risk Ranking and Filtering
- PHA (Preliminary Hazard Analysis)
`.trim(),
    keyPrinciples: [
      'Risk-based decision making',
      'Continuous risk management process',
      'Integration throughout product lifecycle',
      'Proportionate to risk level',
    ],
    applicability: ['Manufacturing', 'Development', 'Quality systems', 'Regulatory compliance'],
    relatedGuidelines: ['Q8', 'Q10', 'Q12'],
  },
  {
    code: 'Q12',
    title:
      'Technical and Regulatory Considerations for Pharmaceutical Product Lifecycle Management',
    category: 'Q',
    step: 5,
    effectiveDate: '2019-11-20',
    content: `
## ICH Q12: Pharmaceutical Product Lifecycle Management

### Objective
Provide a framework to facilitate management of post-approval CMC changes in a more
predictable and efficient manner while maintaining product quality.

### Key Concepts

#### Established Conditions (ECs)
Legally binding information in the dossier that are considered necessary to assure product quality.
- Identified in initial submission
- Changes require regulatory assessment

#### Post-Approval Change Management Protocol (PACMP)
Pre-approved protocol describing specific changes and conditions for implementation.
- Reduces regulatory burden for pre-defined changes
- Enables faster implementation

#### Product Lifecycle Management (PLCM) Document
Optional document summarizing product knowledge evolution.
- Links established conditions to supporting data
- Facilitates change evaluation

### Change Categories
1. **Prior approval changes**: Require regulatory approval before implementation
2. **Notification changes**: Implement after notification
3. **Annual report changes**: Report in annual product review

### Regulatory Flexibility
- Leverage enhanced product/process understanding
- Enable continuous improvement
- Maintain equivalent or improved quality
`.trim(),
    keyPrinciples: [
      'Established Conditions concept',
      'Post-Approval Change Management Protocols',
      'Lifecycle management approach',
      'Regulatory flexibility through knowledge',
    ],
    applicability: ['Post-approval changes', 'CMC variations', 'Continuous improvement'],
  },

  // Safety Guidelines (S)
  {
    code: 'S2(R1)',
    title: 'Guidance on Genotoxicity Testing and Data Interpretation',
    category: 'S',
    step: 5,
    effectiveDate: '2011-11-09',
    content: `
## ICH S2(R1): Genotoxicity Testing and Data Interpretation

### Objective
Provide guidance on genotoxicity testing approaches for detection of compounds
with potential to induce genetic damage.

### Standard Test Battery
Two options are acceptable:

#### Option 1
1. Bacterial reverse mutation assay (Ames test)
2. In vitro chromosomal aberration or in vitro micronucleus test
3. In vivo test for chromosomal damage (rodent bone marrow micronucleus)

#### Option 2
1. Bacterial reverse mutation assay (Ames test)
2. In vivo test with two tissues (typically rodent micronucleus + Comet assay)

### When Additional Tests Needed
- Equivocal or positive results in standard battery
- Chemical class concerns
- Specific mechanistic questions

### Data Interpretation
- Weight of evidence approach
- Consider mechanism of genotoxicity
- Relevance to human risk assessment

### Integration with Carcinogenicity
Positive genotoxicity findings inform carcinogenicity testing strategy.
`.trim(),
    keyPrinciples: [
      'Standard test battery approach',
      'In vitro and in vivo testing',
      'Weight of evidence interpretation',
      'Integration with carcinogenicity assessment',
    ],
    applicability: ['Non-clinical development', 'Carcinogenicity risk', 'Impurity qualification'],
  },
  {
    code: 'S9',
    title: 'Nonclinical Evaluation for Anticancer Pharmaceuticals',
    category: 'S',
    step: 5,
    effectiveDate: '2009-10-29',
    content: `
## ICH S9: Nonclinical Evaluation for Anticancer Pharmaceuticals

### Objective
Provide guidance on nonclinical evaluation specifically for small molecule
and biotechnology-derived anticancer pharmaceuticals.

### Scope
- Intended for patients with advanced cancer
- Life-threatening indications
- Not applicable to supportive care therapies

### Key Principles

#### General Toxicology
- Studies in one relevant species may be sufficient
- Duration: 3 months generally sufficient for marketing
- Recovery assessment not always required

#### Genotoxicity
- In vitro evaluation typically sufficient for initial trials
- Complete standard battery before Phase 2

#### Carcinogenicity
- Generally not required for advanced cancer indications
- May be needed for adjuvant therapy

#### Developmental and Reproductive Toxicology
- Embryo-fetal development study before Phase 3
- Fertility and pre/postnatal studies generally not required
- Risk communication approach

### Supportive Timing
| Study Type | Required Before |
|------------|-----------------|
| General toxicology | FIH trial |
| Safety pharmacology | FIH trial |
| Genotoxicity (full) | Phase 2 |
| EFD study | Phase 3 |
`.trim(),
    keyPrinciples: [
      'Flexible nonclinical development',
      'Indication-appropriate safety evaluation',
      'Benefit-risk considerations',
      'Reduced animal use where justified',
    ],
    applicability: ['Oncology drugs', 'Advanced cancer indications', 'First-in-human trials'],
  },

  // Efficacy Guidelines (E)
  {
    code: 'E6(R2)',
    title: 'Good Clinical Practice',
    category: 'E',
    step: 5,
    effectiveDate: '2016-11-09',
    content: `
## ICH E6(R2): Good Clinical Practice

### Objective
Provide a unified standard for clinical trials that is mutually acceptable to regulatory
authorities and protects the rights, safety, and well-being of trial subjects.

### Fundamental Principles
1. Clinical trials conducted in accordance with ethical principles (Declaration of Helsinki)
2. Rights, safety, and well-being of subjects are paramount
3. Scientific approach to trial design
4. Sound scientific methods for data collection and analysis
5. Qualified personnel conduct trials
6. Freely given informed consent obtained from each subject

### Responsibilities

#### Investigator Responsibilities
- Medical care of trial subjects
- Compliance with protocol
- Investigational product accountability
- Safety reporting
- Accurate data collection

#### Sponsor Responsibilities
- Quality systems implementation
- Risk-based monitoring
- Investigator selection and training
- Trial management and oversight
- Safety data management

### Essential Documents
- Protocol and amendments
- Informed consent forms
- Investigator's Brochure
- Case report forms
- Source documents
- Regulatory approvals

### Risk-Based Quality Management
- Proportionate to risks inherent in the trial
- Focus on processes that impact data quality and subject safety
- Systematic, risk-based approach to quality management
`.trim(),
    keyPrinciples: [
      'Subject protection paramount',
      'Scientific rigor in trial design',
      'Quality management system approach',
      'Risk-based monitoring and oversight',
    ],
    applicability: ['All clinical trials', 'Regulatory submissions', 'Subject protection'],
    relatedGuidelines: ['E8', 'E9', 'E10', 'E17'],
  },
  {
    code: 'E8(R1)',
    title: 'General Considerations for Clinical Studies',
    category: 'E',
    step: 5,
    effectiveDate: '2021-10-06',
    content: `
## ICH E8(R1): General Considerations for Clinical Studies

### Objective
Describe internationally accepted principles and practices for conducting
clinical studies that support medical product development.

### Quality by Design in Clinical Studies

#### Elements of Quality
- Critical to Quality Factors (CtQ)
- Risk identification and mitigation
- Fit-for-purpose data

#### Critical to Quality Factors
Data and processes essential to:
1. Subject protection
2. Reliability and interpretability of results
3. Decision making

### Study Design Considerations

#### Stakeholder Input
- Patient perspectives
- Healthcare provider input
- Caregiver considerations

#### Fit-for-Purpose Design
- Study objectives drive design
- Appropriate complexity for stage
- Innovative designs when appropriate

### Data Sources and Quality
- Prospectively collected data
- Real-world data
- Digital health technologies
- Decentralized trial elements

### Risk-Based Approach
- Identify risks to critical processes
- Implement proportionate controls
- Monitor and adapt throughout trial
`.trim(),
    keyPrinciples: [
      'Quality by Design in trials',
      'Critical to Quality Factors',
      'Stakeholder input',
      'Fit-for-purpose approach',
    ],
    applicability: ['Clinical development planning', 'Study design', 'Regulatory strategy'],
  },
  {
    code: 'E9(R1)',
    title: 'Statistical Principles for Clinical Trials - Estimands',
    category: 'E',
    step: 5,
    effectiveDate: '2019-11-20',
    content: `
## ICH E9(R1): Statistical Principles - Addendum on Estimands

### Objective
Provide a framework for defining precise treatment effects (estimands)
that align with clinical questions of interest.

### The Estimand Framework

#### Components of an Estimand
1. **Population**: Patients targeted by the clinical question
2. **Variable (endpoint)**: The outcome of interest
3. **Intercurrent events**: Events affecting interpretation
4. **Population-level summary**: Statistical measure (mean difference, hazard ratio)

#### Intercurrent Events
Events that occur after treatment initiation that affect:
- Interpretation of the outcome
- Existence or meaning of measurements

Examples:
- Treatment discontinuation
- Use of rescue medication
- Death
- Switching to different treatment

### Strategies for Intercurrent Events
1. **Treatment policy**: Include all data regardless of intercurrent event
2. **Composite**: Incorporate intercurrent event into endpoint
3. **Hypothetical**: Envision scenario without intercurrent event
4. **Principal stratum**: Focus on subjects without intercurrent event
5. **While on treatment**: Values prior to intercurrent event

### Regulatory Implications
- Clearly defined estimands in protocol
- Alignment between clinical question and analysis
- Sensitivity analyses to examine assumptions
`.trim(),
    keyPrinciples: [
      'Estimand framework for treatment effects',
      'Handling intercurrent events systematically',
      'Alignment between question and analysis',
      'Transparent sensitivity analyses',
    ],
    applicability: [
      'Clinical trial design',
      'Statistical analysis plans',
      'Regulatory submissions',
    ],
  },

  // Multidisciplinary Guidelines (M)
  {
    code: 'M4',
    title: 'Common Technical Document (CTD)',
    category: 'M',
    step: 5,
    effectiveDate: '2016-06-15',
    content: `
## ICH M4: The Common Technical Document

### Objective
Provide a harmonized format for applications for registration of pharmaceuticals
for human use across ICH regions.

### CTD Structure

#### Module 1: Administrative Information (Region-Specific)
- Application forms
- Prescribing information
- Patent certificates
- Expert declarations

#### Module 2: CTD Summaries
- 2.1 CTD Table of Contents
- 2.2 CTD Introduction
- 2.3 Quality Overall Summary
- 2.4 Nonclinical Overview
- 2.5 Clinical Overview
- 2.6 Nonclinical Written and Tabulated Summaries
- 2.7 Clinical Summary

#### Module 3: Quality
- 3.2.S Drug Substance
- 3.2.P Drug Product
- 3.2.A Appendices
- 3.2.R Regional Information

#### Module 4: Nonclinical Study Reports
- 4.2.1 Pharmacology
- 4.2.2 Pharmacokinetics
- 4.2.3 Toxicology

#### Module 5: Clinical Study Reports
- 5.2 Tabular Listing of All Clinical Studies
- 5.3 Clinical Study Reports
- 5.4 Literature References

### Electronic Submission (eCTD)
- Electronic format required in all ICH regions
- Standardized folder structure
- Lifecycle management capability
`.trim(),
    keyPrinciples: [
      'Harmonized dossier format',
      'Modular structure',
      'Electronic submission (eCTD)',
      'Lifecycle document management',
    ],
    applicability: ['Regulatory submissions', 'Marketing applications', 'Global development'],
  },
  {
    code: 'M7(R2)',
    title: 'Assessment and Control of DNA Reactive (Mutagenic) Impurities',
    category: 'M',
    step: 5,
    effectiveDate: '2023-08-31',
    content: `
## ICH M7(R2): Mutagenic Impurities in Pharmaceuticals

### Objective
Provide guidance for identification, categorization, qualification,
and control of mutagenic impurities to limit carcinogenic risk.

### Impurity Classification

| Class | Definition | Control |
|-------|------------|---------|
| 1 | Known mutagenic carcinogen | Control at or below compound-specific limit |
| 2 | Known mutagen, unknown carcinogenicity | Control at or below acceptable limit |
| 3 | Alerting structure, no mutagenicity data | Control at or below acceptable limit |
| 4 | Alerting structure, tested non-mutagenic | Treat as non-mutagenic impurity |
| 5 | No structural alerts | Treat as non-mutagenic impurity |

### Acceptable Intake (AI) Calculation
- Default Threshold of Toxicological Concern (TTC): 1.5 μg/day
- Less-than-lifetime exposure allows higher limits
- Staged TTC for development phases

### Exposure Duration Adjustments
| Duration | Daily Intake |
|----------|-------------|
| ≤1 month | 120 μg/day |
| >1-12 months | 20 μg/day |
| >1-10 years | 10 μg/day |
| >10 years to lifetime | 1.5 μg/day |

### Control Strategies
- Option 1: Test each batch
- Option 2: Periodic testing with process understanding
- Option 3: Control without testing (enhanced process understanding)
- Option 4: Purge factor calculations
`.trim(),
    keyPrinciples: [
      'Structure-based hazard assessment',
      'Risk-based acceptable limits',
      'Duration-adjusted exposures',
      'Flexible control strategies',
    ],
    applicability: ['Drug substance synthesis', 'Impurity control', 'Carcinogenic risk management'],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
//                          ICH GUIDELINES FARMER CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class ICHGuidelinesFarmer {
  private pool: pg.Pool;
  private harvestStats = {
    guidelinesProcessed: 0,
    atomsCreated: 0,
    edgesCreated: 0,
    errors: 0,
  };

  constructor(pool: pg.Pool) {
    this.pool = pool;
    logger.info('✅ ICH Guidelines Farmer initialized');
  }

  /**
   * Main harvest function
   */
  async harvest(): Promise<typeof this.harvestStats> {
    logger.info('🌾 Starting ICH Guidelines harvest...');

    try {
      // Process each guideline
      for (const guideline of ICH_GUIDELINES) {
        await this.processGuideline(guideline);
      }

      // Create cross-cutting ICH atoms
      await this.createICHOverviewAtoms();

      logger.info('✅ ICH Guidelines harvest complete');
      logger.info(`   📊 Guidelines processed: ${this.harvestStats.guidelinesProcessed}`);
      logger.info(`   🧬 Atoms created: ${this.harvestStats.atomsCreated}`);
      logger.info(`   🔗 Edges created: ${this.harvestStats.edgesCreated}`);
      logger.info(`   ❌ Errors: ${this.harvestStats.errors}`);
    } catch (error) {
      logger.error('❌ ICH Guidelines harvest error:', error);
      this.harvestStats.errors++;
    }

    return this.harvestStats;
  }

  /**
   * Process a single ICH guideline
   */
  private async processGuideline(guideline: ICHGuideline): Promise<void> {
    const atoms: ICHAtom[] = [];

    // Main guideline atom
    const mainAtom: ICHAtom = {
      title: `ICH ${guideline.code}: ${guideline.title}`,
      content: guideline.content,
      atom_type: 'ich_guideline',
      source: 'ICH Official Guidelines',
      domain: this.getCategoryDomain(guideline.category),
      confidence_score: 0.98,
      metadata: {
        ich_code: guideline.code,
        ich_category: guideline.category,
        ich_step: guideline.step,
        effective_date: guideline.effectiveDate,
        key_principles: guideline.keyPrinciples,
        applicability: guideline.applicability,
        related_guidelines: guideline.relatedGuidelines,
      },
      tags: this.generateTags(guideline),
    };
    atoms.push(mainAtom);

    // Create principle atoms
    for (const principle of guideline.keyPrinciples) {
      const principleAtom: ICHAtom = {
        title: `ICH Principle: ${principle} (${guideline.code})`,
        content: `
## Key Principle from ICH ${guideline.code}

**Guideline:** ${guideline.title}

### Principle
${principle}

### Context
This principle is derived from ICH ${guideline.code} and applies to ${guideline.applicability.join(', ')}.

### Regulatory Acceptance
This principle is accepted by all ICH regulatory authorities including FDA, EMA, PMDA, and Health Canada.
`.trim(),
        atom_type: 'ich_principle',
        source: `ICH ${guideline.code}`,
        domain: this.getCategoryDomain(guideline.category),
        confidence_score: 0.95,
        metadata: {
          ich_code: guideline.code,
          principle_text: principle,
        },
        tags: ['ICH', 'principle', guideline.category.toLowerCase()],
      };
      atoms.push(principleAtom);
    }

    // Store all atoms
    for (const atom of atoms) {
      await this.storeAtom(atom, guideline);
    }

    this.harvestStats.guidelinesProcessed++;
  }

  /**
   * Create ICH overview atoms
   */
  private async createICHOverviewAtoms(): Promise<void> {
    const overviewAtoms: ICHAtom[] = [
      {
        title: 'ICH Guidelines Overview',
        content: `
## International Council for Harmonisation (ICH) Guidelines

### What is ICH?
The International Council for Harmonisation of Technical Requirements for Pharmaceuticals
for Human Use (ICH) brings together regulatory authorities and the pharmaceutical industry
to discuss scientific and technical aspects of drug registration.

### ICH Guideline Categories

#### Q Guidelines - Quality
Focus on chemical and pharmaceutical quality assurance.
- Stability testing (Q1)
- Impurities (Q3)
- Pharmaceutical development (Q8)
- Quality risk management (Q9)

#### S Guidelines - Safety
Cover nonclinical studies required before and during clinical development.
- Carcinogenicity (S1)
- Genotoxicity (S2)
- Toxicokinetics (S3)
- General toxicology (S4)

#### E Guidelines - Efficacy
Address clinical studies and safety reporting.
- Clinical safety (E1)
- Statistical principles (E9)
- Good Clinical Practice (E6)
- Pediatric requirements (E11)

#### M Guidelines - Multidisciplinary
Cross-cutting topics spanning multiple disciplines.
- MedDRA terminology (M1)
- CTD format (M4)
- Mutagenic impurities (M7)
- Electronic submissions (M8)

### Regulatory Acceptance
ICH guidelines are adopted by:
- FDA (United States)
- EMA (European Union)
- PMDA (Japan)
- Health Canada
- Swissmedic
- And many other regulatory authorities
`.trim(),
        atom_type: 'guidance',
        source: 'ICH',
        domain: 'regulatory_harmonization',
        confidence_score: 0.98,
        metadata: {},
        tags: ['ICH', 'overview', 'regulatory-harmonization'],
      },
      {
        title: 'ICH Implementation and Step Process',
        content: `
## ICH Guideline Development Process

### The Five-Step Process

#### Step 1: Concept Paper
Expert Working Group (EWG) prepares concept paper identifying need for harmonization.

#### Step 2a: Technical Document
EWG develops draft technical document based on scientific consensus.

#### Step 2b: Regulatory Consultation
Draft guideline released for public consultation in ICH regions.

#### Step 3: Regulatory Discussion
Assembly (regulatory members) discusses consultation feedback.

#### Step 4: Adoption
ICH Assembly adopts final guideline by consensus.

#### Step 5: Implementation
Regional regulatory authorities implement in their jurisdictions.

### Implementation Timeline
- Varies by region (typically 6-24 months after Step 4)
- May include transitional provisions
- Check regional guidance for specific requirements

### Maintenance
- Guidelines periodically reviewed
- Revisions issued as needed (e.g., Q1A(R2) is revision 2)
- Q&A documents clarify interpretation
`.trim(),
        atom_type: 'guidance',
        source: 'ICH',
        domain: 'regulatory_process',
        confidence_score: 0.95,
        metadata: {},
        tags: ['ICH', 'implementation', 'regulatory-process'],
      },
    ];

    for (const atom of overviewAtoms) {
      await this.storeAtom(atom);
    }
  }

  /**
   * Get domain based on category
   */
  private getCategoryDomain(category: string): string {
    const domains: Record<string, string> = {
      Q: 'pharmaceutical_quality',
      S: 'nonclinical_safety',
      E: 'clinical_efficacy',
      M: 'regulatory_multidisciplinary',
    };
    return domains[category] || 'regulatory_guidance';
  }

  /**
   * Generate tags for guideline
   */
  private generateTags(guideline: ICHGuideline): string[] {
    const tags = ['ICH', guideline.code, `ICH-${guideline.category}`];

    const categoryTags: Record<string, string[]> = {
      Q: ['quality', 'CMC', 'manufacturing'],
      S: ['safety', 'nonclinical', 'toxicology'],
      E: ['efficacy', 'clinical', 'GCP'],
      M: ['multidisciplinary', 'CTD', 'harmonization'],
    };

    tags.push(...(categoryTags[guideline.category] || []));

    return tags;
  }

  /**
   * Store atom in database
   */
  private async storeAtom(atom: ICHAtom, guideline?: ICHGuideline): Promise<string> {
    const atomId = crypto.randomUUID();

    await this.pool.query(
      `
      INSERT INTO lumen_data_atoms (
        id, title, content, atom_type, source, domain,
        confidence_score, metadata, tags, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      ON CONFLICT DO NOTHING
    `,
      [
        atomId,
        atom.title,
        atom.content,
        atom.atom_type,
        atom.source,
        atom.domain,
        atom.confidence_score,
        JSON.stringify(atom.metadata),
        atom.tags,
      ]
    );

    this.harvestStats.atomsCreated++;

    // Create edges
    if (guideline?.relatedGuidelines) {
      for (const related of guideline.relatedGuidelines) {
        await this.createEdge(atomId, 'RELATED_TO', `ICH ${related}`, 0.85);
      }
    }

    return atomId;
  }

  /**
   * Create a single edge
   */
  private async createEdge(
    sourceId: string,
    relationship: string,
    targetLabel: string,
    strength: number
  ): Promise<void> {
    const edgeId = crypto.randomUUID();

    await this.pool.query(
      `
      INSERT INTO lumen_knowledge_edges (
        id, source_atom_id, relationship_type, target_label, strength, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT DO NOTHING
    `,
      [edgeId, sourceId, relationship, targetLabel, strength]
    );

    this.harvestStats.edgesCreated++;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//                          MAIN EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const farmer = new ICHGuidelinesFarmer(pool);
    const stats = await farmer.harvest();
    logger.info('\n📊 Final harvest statistics:', stats);
  } catch (error) {
    logger.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main();
}

export { ICHGuidelinesFarmer };
