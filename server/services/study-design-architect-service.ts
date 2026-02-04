import { db } from '../db';
import { eq, and, like, inArray } from 'drizzle-orm';
import { csrReports, csrDetails } from 'shared/schema';
import { classifyTherapeuticArea } from '../../shared/utils/therapeutic-area-classifier';

/**
 * Study Design Architect Service
 *
 * This service provides capabilities for designing and configuring clinical trials
 * based on CSR data and statistical best practices. It supports:
 * - Multiple study designs (parallel-arm RCT, crossover, adaptive, dose-escalation)
 * - Configurable arms, endpoints, and statistical thresholds
 * - CSR-informed design element suggestions
 */
export class StudyDesignArchitectService {
  private getDb() {
    if (!db) {
      throw new Error('Database unavailable');
    }
    return db;
  }

  /**
   * Get available study design types with descriptions
   */
  async getDesignTypes() {
    return [
      {
        id: 'parallel-rct',
        name: 'Parallel-Group Randomized Controlled Trial',
        description:
          'Standard design where participants are randomly assigned to one of two or more parallel treatment groups.',
        recommendedUses: [
          'Phase 2-3 efficacy studies',
          'Direct comparative effectiveness',
          'Standard of care comparisons',
        ],
        statisticalConsiderations: [
          'Simplest to analyze',
          'Requires larger sample sizes',
          'No period or sequence effects',
        ],
      },
      {
        id: 'crossover',
        name: 'Crossover Design',
        description:
          'Each participant receives different treatments in sequence, serving as their own control.',
        recommendedUses: [
          'Chronic, stable conditions',
          'Treatments with temporary effects',
          'Smaller required sample size',
        ],
        statisticalConsiderations: [
          'Period and carryover effects',
          'Requires washout period',
          'Higher dropout risk',
        ],
      },
      {
        id: 'adaptive',
        name: 'Adaptive Design',
        description: 'Allows modifications to trial procedures based on interim data analysis.',
        recommendedUses: [
          'Dose-finding studies',
          'Uncertain effect sizes',
          'Multiple treatment options',
        ],
        statisticalConsiderations: [
          'Complex statistical methods',
          'Type I error control',
          'Special regulatory considerations',
        ],
      },
      {
        id: 'dose-escalation',
        name: 'Dose-Escalation Design',
        description:
          'Sequential testing of increasing dose levels to establish safety and optimal dosing.',
        recommendedUses: ['Phase 1 first-in-human', 'Oncology trials', 'Safety-focused studies'],
        statisticalConsiderations: [
          'Bayesian methods common',
          'Small cohorts',
          'Stopping rules critical',
        ],
      },
      {
        id: 'group-sequential',
        name: 'Group Sequential Design',
        description: 'Incorporates pre-planned interim analyses with option for early stopping.',
        recommendedUses: [
          'Phase 3 confirmatory trials',
          'Studies with mortality endpoints',
          'High-cost studies',
        ],
        statisticalConsiderations: [
          'Alpha spending functions',
          'Sample size re-estimation',
          'Early stopping rules',
        ],
      },
      {
        id: 'basket',
        name: 'Basket Trial Design',
        description: 'Tests one treatment across multiple diseases or disease subtypes.',
        recommendedUses: [
          'Precision medicine',
          'Rare disease variants',
          'Biomarker-driven treatments',
        ],
        statisticalConsiderations: [
          'Bayesian borrowing',
          'Multiple comparison adjustments',
          'Heterogeneity across baskets',
        ],
      },
      {
        id: 'umbrella',
        name: 'Umbrella Trial Design',
        description: 'Tests multiple treatments in one disease with different patient subgroups.',
        recommendedUses: [
          'Oncology with molecular subtypes',
          'Personalized medicine',
          'Multiple treatment options',
        ],
        statisticalConsiderations: ['Complex logistics', 'Master protocols', 'Subgroup powering'],
      },
    ];
  }

  /**
   * Get common endpoint types with descriptions
   */
  async getEndpointTypes() {
    return [
      {
        id: 'continuous',
        name: 'Continuous Endpoints',
        examples: [
          'Change in blood pressure (mmHg)',
          'Pain score reduction',
          'Change in tumor size (mm)',
        ],
        statisticalApproaches: ['t-tests', 'ANCOVA', 'Mixed models', 'GEE'],
        powerConsiderations: [
          'Effect size as mean difference',
          'Variability (SD) critical',
          'Transformation may be needed',
        ],
      },
      {
        id: 'binary',
        name: 'Binary Endpoints',
        examples: ['Response rate', 'Remission (yes/no)', 'Treatment failure'],
        statisticalApproaches: [
          'Chi-square tests',
          'Logistic regression',
          'Risk ratios',
          'Odds ratios',
        ],
        powerConsiderations: [
          'Effect size as proportion difference',
          'Baseline rate important',
          'Risk difference vs relative risk',
        ],
      },
      {
        id: 'time-to-event',
        name: 'Time-to-Event Endpoints',
        examples: ['Overall survival', 'Progression-free survival', 'Time to treatment failure'],
        statisticalApproaches: [
          'Log-rank test',
          'Cox proportional hazards',
          'Parametric survival models',
        ],
        powerConsiderations: [
          'Effect size as hazard ratio',
          'Event rate critical',
          'Competing risks',
          'Follow-up duration',
        ],
      },
      {
        id: 'count',
        name: 'Count Data Endpoints',
        examples: ['Number of exacerbations', 'Seizure frequency', 'Number of adverse events'],
        statisticalApproaches: [
          'Poisson regression',
          'Negative binomial models',
          'Zero-inflated models',
        ],
        powerConsiderations: [
          'Effect size as rate ratio',
          'Overdispersion assessment',
          'Exposure time',
        ],
      },
      {
        id: 'ordinal',
        name: 'Ordinal Endpoints',
        examples: ['Disease severity grades', 'Likert scales', 'RECIST categories'],
        statisticalApproaches: [
          'Mann-Whitney U test',
          'Proportional odds models',
          'Non-parametric methods',
        ],
        powerConsiderations: [
          'Effects across categories',
          'Proportional odds assumption',
          'Often lower power than continuous',
        ],
      },
    ];
  }

  /**
   * Get design recommendations for a specific indication and phase
   */
  async getDesignRecommendations(indication: string, phase: string) {
    try {
      const dbInstance = this.getDb();
      // Get historical CSR data for similar trials
      const similarTrials = await dbInstance
        .select({
          studyDesign: csrDetails.studyDesign,
          primaryObjective: csrDetails.primaryObjective,
          secondaryObjective: csrDetails.secondaryObjective,
          population: csrDetails.inclusionCriteria,
          phase: csrReports.phase,
          title: csrReports.title,
          id: csrReports.id,
        })
        .from(csrReports)
        .leftJoin(csrDetails, eq(csrReports.id, csrDetails.reportId))
        .where(and(like(csrReports.indication, `%${indication}%`), eq(csrReports.phase, phase)))
        .limit(20);

      // Count design types to find common approaches
      const designCounts: Record<string, number> = {};
      const studyDurations: number[] = [];
      const sampleSizes: number[] = [];
      const armCounts: Record<string, number> = {};

      for (const trial of similarTrials) {
        if (trial.studyDesign) {
          // Extract design type
          const designLower = trial.studyDesign.toLowerCase();
          let designType = 'parallel-rct'; // Default

          if (designLower.includes('crossover')) {
            designType = 'crossover';
          } else if (designLower.includes('adapt')) {
            designType = 'adaptive';
          } else if (
            designLower.includes('dose escalation') ||
            designLower.includes('dose-escalation')
          ) {
            designType = 'dose-escalation';
          } else if (designLower.includes('sequential')) {
            designType = 'group-sequential';
          } else if (designLower.includes('basket')) {
            designType = 'basket';
          } else if (designLower.includes('umbrella')) {
            designType = 'umbrella';
          }

          designCounts[designType] = (designCounts[designType] || 0) + 1;

          // Extract number of arms
          const armMatches = trial.studyDesign.match(/(\d+)[\s-]arm/i);
          if (armMatches && armMatches[1]) {
            const armCount = armMatches[1];
            armCounts[armCount] = (armCounts[armCount] || 0) + 1;
          }

          // Extract duration if available
          const durationMatches =
            trial.studyDesign.match(/(\d+)[\s-]week/i) ||
            trial.studyDesign.match(/(\d+)[\s-]month/i);
          if (durationMatches && durationMatches[1]) {
            let duration = parseInt(durationMatches[1], 10);
            // Convert months to weeks approximately
            if (trial.studyDesign.includes('month')) {
              duration *= 4.3;
            }
            studyDurations.push(duration);
          }

          // Extract sample size if available
          const sampleMatches =
            trial.studyDesign.match(/[nN][\s=]+(\d+)/) ||
            trial.studyDesign.match(/(\d+) patients/i) ||
            trial.studyDesign.match(/(\d+) subjects/i);
          if (sampleMatches && sampleMatches[1]) {
            sampleSizes.push(parseInt(sampleMatches[1], 10));
          }
        }
      }

      // Find most common design type
      let recommendedDesign = 'parallel-rct';
      let maxCount = 0;

      for (const [design, count] of Object.entries(designCounts)) {
        if (count > maxCount) {
          maxCount = count;
          recommendedDesign = design;
        }
      }

      // Calculate average duration and sample size
      const avgDuration =
        studyDurations.length > 0
          ? Math.round(studyDurations.reduce((a, b) => a + b, 0) / studyDurations.length)
          : null;

      const avgSampleSize =
        sampleSizes.length > 0
          ? Math.round(sampleSizes.reduce((a, b) => a + b, 0) / sampleSizes.length)
          : null;

      // Find most common arm count
      let recommendedArms = '2'; // Default to 2-arm
      maxCount = 0;

      for (const [arms, count] of Object.entries(armCounts)) {
        if (count > maxCount) {
          maxCount = count;
          recommendedArms = arms;
        }
      }

      // Form recommendations
      return {
        recommendedDesign,
        recommendedArms: parseInt(recommendedArms),
        avgDuration,
        avgSampleSize,
        designCounts,
        similarTrials: similarTrials.length,
        phaseSpecificConsiderations: this.getPhaseSpecificConsiderations(phase),
        indicationSpecificConsiderations:
          await this.getIndicationSpecificConsiderations(indication),
        exampleTrials: similarTrials.slice(0, 5).map(t => ({
          id: t.id,
          title: t.title,
          design: t.studyDesign,
          objective: t.primaryObjective,
        })),
      };
    } catch (error) {
      console.error('Error getting design recommendations:', error);
      return {
        recommendedDesign: 'parallel-rct',
        recommendedArms: 2,
        avgDuration: null,
        avgSampleSize: null,
        designCounts: {},
        similarTrials: 0,
        phaseSpecificConsiderations: this.getPhaseSpecificConsiderations(phase),
        indicationSpecificConsiderations: [],
        exampleTrials: [],
      };
    }
  }

  /**
   * Provides guidance specific to trial phase
   */
  getPhaseSpecificConsiderations(phase: string) {
    switch (phase.toLowerCase()) {
      case 'phase 1':
        return {
          primaryFocus: 'Safety and Dosing',
          typicalDesigns: [
            'Dose-escalation',
            'Single ascending dose (SAD)',
            'Multiple ascending dose (MAD)',
          ],
          endpoints: ['Adverse events', 'Maximum tolerated dose', 'Pharmacokinetics'],
          statisticalApproaches: [
            'Bayesian methods',
            'CRM (Continual Reassessment Method)',
            '3+3 design',
          ],
          sampleSizeConsiderations:
            'Typically 20-80 subjects, depending on design and number of cohorts',
        };

      case 'phase 2':
        return {
          primaryFocus: 'Preliminary Efficacy and Safety',
          typicalDesigns: [
            'Randomized controlled',
            'Single-arm with historical control',
            'Adaptive designs',
          ],
          endpoints: [
            'Biomarkers',
            'Surrogate endpoints',
            'Early clinical efficacy',
            'Safety profile',
          ],
          statisticalApproaches: [
            'Futility analysis',
            'Simon two-stage design',
            'Adaptive randomization',
          ],
          sampleSizeConsiderations:
            'Typically 100-300 patients, balanced against feasibility and early signal detection',
        };

      case 'phase 3':
        return {
          primaryFocus: 'Confirmatory Efficacy',
          typicalDesigns: ['Large randomized controlled', 'Multi-center', 'Double-blind'],
          endpoints: [
            'Primary clinical outcomes',
            'Patient-reported outcomes',
            'Safety and tolerability',
          ],
          statisticalApproaches: [
            'ITT analysis',
            'Multiplicity adjustments',
            'Group sequential methods',
            'Non-inferiority designs',
          ],
          sampleSizeConsiderations:
            'Powered for primary outcome (often 300-3000+), accounts for dropouts and subgroup analyses',
        };

      case 'phase 4':
        return {
          primaryFocus: 'Post-Marketing Safety and Effectiveness',
          typicalDesigns: ['Large simple trials', 'Pragmatic designs', 'Registry-based studies'],
          endpoints: [
            'Real-world effectiveness',
            'Long-term safety',
            'Quality of life',
            'Health economics',
          ],
          statisticalApproaches: [
            'Propensity score methods',
            'Time series analyses',
            'Large database methods',
          ],
          sampleSizeConsiderations:
            'Often very large (1000+ patients) to detect rare events or subgroup effects',
        };

      default:
        return {
          primaryFocus: 'Study objectives depend on phase',
          typicalDesigns: ['Design should match study objectives'],
          endpoints: ['Select based on study phase and indication'],
          statisticalApproaches: ['Approach depends on study design and endpoints'],
          sampleSizeConsiderations: 'Depends on effect size, variability, and study goals',
        };
    }
  }

  /**
   * Get indication-specific considerations for trial design
   */
  async getIndicationSpecificConsiderations(indication: string) {
    // Common regulatory or clinical considerations by therapeutic area
    const therapeuticAreas: Record<string, any> = {
      oncology: {
        endpointConsiderations: [
          'Overall survival (OS) is gold standard but progression-free survival (PFS) often used as surrogate',
          'Response rate criteria should follow RECIST or similar standard',
          'Consider patient-reported outcomes for symptoms and quality of life',
        ],
        designConsiderations: [
          'Single-arm trials may be acceptable for accelerated approval in certain contexts',
          'Adaptive designs increasingly accepted for dose-finding and expansion cohorts',
          'Consider crossover impact on OS analysis and methods to adjust for it',
        ],
        regulatoryGuidance: [
          'FDA: Clinical Trial Endpoints for the Approval of Cancer Drugs and Biologics',
          'EMA: Guideline on the evaluation of anticancer medicinal products in man',
        ],
      },

      diabetes: {
        endpointConsiderations: [
          'HbA1c change is standard primary endpoint for glycemic control',
          'Consider cardiovascular outcomes for certain drug classes',
          'Hypoglycemia rates and time-in-range are important secondary endpoints',
        ],
        designConsiderations: [
          'Placebo-controlled designs may be limited in duration for ethical reasons',
          'Non-inferiority designs common for established drug classes',
          'Consider long-term cardiovascular safety per FDA guidance',
        ],
        regulatoryGuidance: [
          'FDA: Diabetes Mellitus — Evaluating Cardiovascular Risk in New Antidiabetic Therapies',
          'EMA: Guideline on clinical investigation of medicinal products in the treatment of diabetes mellitus',
        ],
      },

      cardiovascular: {
        endpointConsiderations: [
          'Major adverse cardiovascular events (MACE) common composite endpoint',
          'Consider components like cardiovascular death, MI, stroke, hospitalization',
          'Surrogate endpoints (like blood pressure, lipids) acceptable for certain contexts',
        ],
        designConsiderations: [
          'Event-driven trials common for outcomes studies',
          'Consider enrichment strategies for higher-risk populations',
          'Data monitoring committees essential for safety oversight',
        ],
        regulatoryGuidance: [
          'FDA: Cardiovascular Outcomes Trials for Diabetes - Guidance',
          'EMA: Guideline on clinical investigation of medicinal products in the treatment of hypertension',
        ],
      },

      // Add more therapeutic areas based on common indications
    };

    // Get the therapeutic area classification
    const classificationResult = classifyTherapeuticArea(indication);
    const therapeuticArea = classificationResult.toLowerCase();

    // If we have a match in our therapeutic areas dictionary, return it
    if (therapeuticAreas[therapeuticArea]) {
      return {
        therapeuticArea: therapeuticArea.charAt(0).toUpperCase() + therapeuticArea.slice(1), // Capitalize
        ...therapeuticAreas[therapeuticArea],
        confidenceScore: undefined,
        matchedKeywords: undefined,
      };
    }

    // Log if we got a classification but don't have specific guidance for it
    if (classificationResult !== 'Other') {
      console.log(
        `StudyDesignArchitect: Classified as "${classificationResult}" but no specific considerations available`
      );
    }

    // Return empty array if no match
    return [];
  }

  /**
   * Generate a detailed study design based on input parameters
   */
  async generateStudyDesign(params: StudyDesignParams) {
    const {
      designType,
      indication,
      phase,
      arms,
      primaryEndpoint,
      secondaryEndpoints,
      populationCriteria,
      treatmentDuration,
      sampleSize,
    } = params;

    let designTemplate = '';

    // Get text templates by design type
    switch (designType) {
      case 'parallel-rct':
        designTemplate = this.generateParallelRCTDesign(params);
        break;
      case 'crossover':
        designTemplate = this.generateCrossoverDesign(params);
        break;
      case 'adaptive':
        designTemplate = this.generateAdaptiveDesign(params);
        break;
      case 'dose-escalation':
        designTemplate = this.generateDoseEscalationDesign(params);
        break;
      default:
        designTemplate = this.generateParallelRCTDesign(params);
    }

    // Generate statistical considerations section
    const statisticalConsiderations = this.generateStatisticalConsiderations(params);

    // Return complete design
    return {
      title: `A ${phase} Study of ${this.getInterventionName(params)} in ${indication}`,
      designSummary: designTemplate,
      statisticalConsiderations,
      eligibilityCriteria: this.formatEligibilityCriteria(populationCriteria),
      suggestedEndpoints: {
        primary: primaryEndpoint,
        secondary: secondaryEndpoints,
      },
      suggestedVisitSchedule: this.generateVisitSchedule(params),
    };
  }

  /**
   * Generate a parallel RCT design description
   */
  private generateParallelRCTDesign(params: StudyDesignParams) {
    const { arms, indication, phase, treatmentDuration, sampleSize } = params;

    const armNames = this.generateArmNames(params);
    const allocation = `Subjects will be randomized in a ${this.getAllocationRatio(arms)} ratio`;

    return `This is a ${phase.toLowerCase()}, randomized, ${arms > 2 ? `${arms}-arm, ` : ''}${this.getBlindingText(params)}, parallel-group study to evaluate the efficacy and safety of ${this.getInterventionName(params)} in patients with ${indication}.

${sampleSize ? `Approximately ${sampleSize} patients` : 'Patients'} will be enrolled. ${allocation} to ${this.formatArmsList(armNames)}.

The study will consist of a screening period of up to 28 days, followed by a treatment period of ${treatmentDuration || '12'} weeks, and a follow-up period of 4 weeks after the last dose of study treatment.

The primary objective is to evaluate the efficacy of ${this.getInterventionName(params)} compared to ${arms > 2 ? 'control arms' : 'placebo'} in patients with ${indication}.`;
  }

  /**
   * Generate a crossover design description
   */
  private generateCrossoverDesign(params: StudyDesignParams) {
    const { arms, indication, phase, treatmentDuration, sampleSize } = params;

    const sequences = arms; // Number of sequences equals number of treatments
    const periodLength = treatmentDuration ? Math.floor(parseInt(treatmentDuration) / 2) : 6; // Split total duration between periods
    const washout = Math.max(2, Math.floor(periodLength / 4)); // Washout period

    return `This is a ${phase.toLowerCase()}, randomized, ${this.getBlindingText(params)}, ${sequences}×${sequences} crossover study to evaluate the efficacy and safety of ${this.getInterventionName(params)} in patients with ${indication}.

${sampleSize ? `Approximately ${sampleSize} patients` : 'Patients'} will be enrolled and randomized to one of ${sequences} treatment sequences. Each patient will receive each treatment in sequence, separated by a washout period of ${washout} weeks.

Each treatment period will last ${periodLength} weeks. The total study duration for each patient will be approximately ${2 * periodLength + washout} weeks, including a screening period of up to 28 days and a follow-up period of 4 weeks after the last dose of study treatment.

The primary objective is to evaluate the efficacy of ${this.getInterventionName(params)} compared to ${arms > 2 ? 'control treatments' : 'placebo'} in patients with ${indication}, while controlling for potential period and sequence effects.`;
  }

  /**
   * Generate an adaptive design description
   */
  private generateAdaptiveDesign(params: StudyDesignParams) {
    const { arms, indication, phase, treatmentDuration, sampleSize } = params;

    const initialPerArm = sampleSize ? Math.floor(sampleSize / (2 * arms)) : 15; // Initial sample size per arm
    const totalInitial = initialPerArm * arms;
    const totalFinal = sampleSize || totalInitial * 2;

    return `This is a ${phase.toLowerCase()}, adaptive, ${this.getBlindingText(params)} study to evaluate the efficacy and safety of ${this.getInterventionName(params)} in patients with ${indication}.

The study will utilize a two-stage adaptive design. In Stage 1, approximately ${totalInitial} patients will be randomized equally to ${arms} treatment arms. An interim analysis will be conducted after all Stage 1 patients have completed ${Math.floor(parseInt(treatmentDuration || '12') / 2)} weeks of treatment.

Based on the interim analysis, the study may adapt by:
1. Sample size re-estimation for the most promising arm(s)
2. Dropping ineffective or unsafe treatment arms
3. Modifying the randomization ratio to favor more effective treatments

In Stage 2, additional patients will be enrolled to reach a total of approximately ${totalFinal} patients across all continuing arms. The total treatment duration will be ${treatmentDuration || '12'} weeks per patient.

The primary objective is to efficiently identify the most effective and safe dose(s) of ${this.getInterventionName(params)} in patients with ${indication}.`;
  }

  /**
   * Generate a dose-escalation design description
   */
  private generateDoseEscalationDesign(params: StudyDesignParams) {
    const { arms, indication, phase, sampleSize } = params;

    const doses = arms;
    const patientsPerCohort = 3; // Standard 3+3 design
    const estimatedTotal = patientsPerCohort * doses * 2; // Approximate for dose escalation
    const finalSampleSize = sampleSize || estimatedTotal;

    return `This is a ${phase.toLowerCase()}, open-label, dose-escalation study to evaluate the safety, tolerability, and preliminary efficacy of ${this.getInterventionName(params)} in patients with ${indication}.

The study will utilize a standard 3+3 dose-escalation design with ${doses} planned dose levels. Each cohort will initially enroll 3 patients. If no dose-limiting toxicities (DLTs) are observed during the first 28 days, escalation to the next dose level will occur. If 1 of 3 patients experiences a DLT, the cohort will be expanded to 6 patients. Escalation will proceed if no more than 1 of 6 patients experiences a DLT.

The Maximum Tolerated Dose (MTD) will be defined as the highest dose level at which fewer than 2 of 6 patients experience a DLT. Once the MTD or recommended Phase 2 dose (RP2D) is determined, an expansion cohort of approximately ${Math.max(10, finalSampleSize - estimatedTotal)} additional patients will be enrolled at this dose level.

Approximately ${finalSampleSize} patients are expected to be enrolled across the dose-escalation and expansion phases. The study will include a screening period of up to 28 days, a treatment period until disease progression or unacceptable toxicity, and a follow-up period of 30 days after the last dose.

The primary objectives are to determine the MTD or RP2D of ${this.getInterventionName(params)} and characterize its safety profile in patients with ${indication}.`;
  }

  /**
   * Generate statistical considerations
   */
  private generateStatisticalConsiderations(params: StudyDesignParams) {
    const { designType, arms, primaryEndpoint, sampleSize } = params;

    let analysis = 'The primary analysis will use';
    let sampleSizeJustification = '';

    // Determine statistical approach based on endpoint type and design
    if (
      primaryEndpoint.toLowerCase().includes('rate') ||
      primaryEndpoint.toLowerCase().includes('proportion') ||
      primaryEndpoint.toLowerCase().includes('responder')
    ) {
      analysis +=
        ' logistic regression to compare the primary endpoint between treatment arms, adjusting for stratification factors.';

      if (sampleSize) {
        sampleSizeJustification = `The sample size of ${sampleSize} provides approximately 80% power to detect a difference of 15% in response rates between treatment groups, assuming a control rate of 30%, using a two-sided alpha of 0.05.`;
      }
    } else if (
      primaryEndpoint.toLowerCase().includes('survival') ||
      primaryEndpoint.toLowerCase().includes('time to')
    ) {
      analysis +=
        ' the log-rank test for the primary comparison of time-to-event endpoints between treatment arms. Hazard ratios and 95% confidence intervals will be estimated using Cox proportional hazards models.';

      if (sampleSize) {
        sampleSizeJustification = `The sample size of ${sampleSize} provides approximately 80% power to detect a hazard ratio of 0.70, assuming a median time-to-event of 10 months in the control arm, with an accrual period of 18 months and minimum follow-up of 12 months.`;
      }
    } else {
      analysis +=
        ' mixed models for repeated measures (MMRM) to analyze continuous endpoints, with treatment, visit, treatment-by-visit interaction, and stratification factors as fixed effects, and baseline value as a covariate.';

      if (sampleSize) {
        sampleSizeJustification = `The sample size of ${sampleSize} provides approximately 80% power to detect a treatment difference of 0.4 standard deviations in the primary endpoint, assuming a two-sided alpha of 0.05 and a 15% dropout rate.`;
      }
    }

    // Add design-specific considerations
    let designSpecific = '';

    switch (designType) {
      case 'crossover':
        designSpecific =
          'The analysis will account for potential period and sequence effects. A washout period is included to minimize carryover effects.';
        break;
      case 'adaptive':
        designSpecific =
          'The interim analysis will be conducted by an independent data monitoring committee. The overall type I error rate will be controlled at 0.05 using a group sequential approach with appropriate alpha spending function.';
        break;
      case 'dose-escalation':
        designSpecific =
          'Dose escalation decisions will be based on observed DLTs during the first 28 days of treatment. A Bayesian logistic regression model may be used to estimate the dose-toxicity relationship.';
        break;
    }

    // Multiple testing considerations for multiple arms or endpoints
    let multipleTesting = '';
    if (arms > 2) {
      multipleTesting =
        'To account for multiple comparisons, a hierarchical testing strategy will be employed to control the overall type I error rate.';
    }

    return `${analysis}

${sampleSizeJustification}

${designSpecific}

${multipleTesting}

Missing data will be handled using multiple imputation methods under the missing-at-random assumption. Sensitivity analyses will be conducted to assess the robustness of results to missing data assumptions.

Safety analyses will be descriptive and include all patients who receive at least one dose of study treatment.`;
  }

  /**
   * Format eligibility criteria
   */
  private formatEligibilityCriteria(criteria: { inclusion: string[]; exclusion: string[] }) {
    const { inclusion, exclusion } = criteria;

    const formattedInclusion =
      inclusion && inclusion.length > 0
        ? inclusion.map((criterion, index) => `${index + 1}. ${criterion}`).join('\n')
        : '1. Males or females, age ≥18 years\n2. Diagnosed with [indication]\n3. [Additional criteria specific to indication]';

    const formattedExclusion =
      exclusion && exclusion.length > 0
        ? exclusion.map((criterion, index) => `${index + 1}. ${criterion}`).join('\n')
        : '1. Participation in another interventional study\n2. History of severe reaction to similar treatments\n3. [Additional criteria specific to indication]';

    return {
      inclusion: formattedInclusion,
      exclusion: formattedExclusion,
    };
  }

  /**
   * Generate a visit schedule based on study parameters
   */
  private generateVisitSchedule(params: StudyDesignParams) {
    const { designType, treatmentDuration = '12' } = params;
    const duration = parseInt(treatmentDuration);

    const schedule = [
      {
        visit: 'Screening',
        timing: 'Day -28 to Day -1',
        procedures: [
          'Informed consent',
          'Demographics',
          'Medical history',
          'Inclusion/exclusion criteria',
          'Vital signs',
          'Physical examination',
          'Clinical laboratory tests',
          'Pregnancy test (if applicable)',
          'Disease assessment',
        ],
      },
      {
        visit: 'Baseline/Randomization',
        timing: 'Day 1',
        procedures: [
          'Randomization',
          'Study drug dispensation',
          'Vital signs',
          'Adverse event assessment',
          'Concomitant medication review',
          'Primary endpoint baseline assessment',
        ],
      },
    ];

    // Add treatment visits
    if (duration <= 4) {
      // Weekly visits for short studies
      for (let week = 1; week <= duration; week++) {
        schedule.push({
          visit: `Week ${week}`,
          timing: `Day ${week * 7}`,
          procedures: [
            'Vital signs',
            'Study drug compliance',
            'Adverse event assessment',
            'Concomitant medication review',
            week === duration ? 'Primary endpoint assessment' : 'Safety assessment',
          ],
        });
      }
    } else if (duration <= 12) {
      // Biweekly visits for medium studies
      for (let week = 2; week <= duration; week += 2) {
        schedule.push({
          visit: `Week ${week}`,
          timing: `Day ${week * 7}`,
          procedures: [
            'Vital signs',
            'Study drug compliance',
            'Adverse event assessment',
            'Concomitant medication review',
            week === duration ? 'Primary endpoint assessment' : 'Safety assessment',
          ],
        });
      }
    } else {
      // Monthly visits for longer studies
      for (let week = 4; week <= duration; week += 4) {
        schedule.push({
          visit: `Week ${week}`,
          timing: `Day ${week * 7}`,
          procedures: [
            'Vital signs',
            'Study drug compliance',
            'Adverse event assessment',
            'Concomitant medication review',
            week === duration ? 'Primary endpoint assessment' : 'Safety assessment',
          ],
        });
      }
    }

    // Add end of treatment and follow-up
    schedule.push(
      {
        visit: 'End of Treatment',
        timing: `Day ${duration * 7} or Early Termination`,
        procedures: [
          'Vital signs',
          'Physical examination',
          'Clinical laboratory tests',
          'Primary and secondary endpoint assessments',
          'Adverse event assessment',
          'Concomitant medication review',
        ],
      },
      {
        visit: 'Follow-up',
        timing: `4 weeks after last dose`,
        procedures: [
          'Vital signs',
          'Adverse event assessment',
          'Concomitant medication review',
          'Disease assessment',
        ],
      }
    );

    // Add crossover specific visits
    if (designType === 'crossover') {
      const periodLength = Math.floor(duration / 2);
      const washout = Math.max(2, Math.floor(periodLength / 4));

      // Insert washout period and second treatment period
      schedule.splice(
        schedule.length - 2,
        0,
        {
          visit: 'End of Period 1',
          timing: `Day ${periodLength * 7}`,
          procedures: [
            'Vital signs',
            'Clinical laboratory tests',
            'Period 1 endpoint assessments',
            'Adverse event assessment',
          ],
        },
        {
          visit: 'Washout Period',
          timing: `${washout} weeks`,
          procedures: ['Safety monitoring as needed'],
        },
        {
          visit: 'Start of Period 2',
          timing: `Day ${(periodLength + washout) * 7}`,
          procedures: [
            'Vital signs',
            'Study drug dispensation',
            'Adverse event assessment',
            'Concomitant medication review',
          ],
        }
      );
    }

    return schedule;
  }

  /**
   * Helper to get intervention name
   */
  private getInterventionName(params: StudyDesignParams) {
    return params.interventionName || 'the study drug';
  }

  /**
   * Helper to get blinding description
   */
  private getBlindingText(params: StudyDesignParams) {
    const { blinding } = params;

    if (!blinding || blinding === 'open-label') {
      return 'open-label';
    } else if (blinding === 'single-blind') {
      return 'single-blind';
    } else {
      return 'double-blind, placebo-controlled';
    }
  }

  /**
   * Generate arm names based on parameters
   */
  private generateArmNames(params: StudyDesignParams) {
    const { arms, interventionName } = params;
    const armNames = [];

    if (arms === 2) {
      armNames.push(interventionName || 'Treatment');
      armNames.push('Placebo');
    } else {
      // For multi-arm studies
      for (let i = 1; i < arms; i++) {
        armNames.push(`${interventionName || 'Treatment'} ${String.fromCharCode(64 + i)}`);
      }
      armNames.push('Placebo');
    }

    return armNames;
  }

  /**
   * Get allocation ratio text
   */
  private getAllocationRatio(arms: number) {
    if (arms === 2) {
      return '1:1';
    } else if (arms === 3) {
      return '1:1:1';
    } else if (arms === 4) {
      return '1:1:1:1';
    } else {
      return '1:1:...:1';
    }
  }

  /**
   * Format arms list for text
   */
  private formatArmsList(arms: string[]) {
    if (arms.length === 2) {
      return `${arms[0]} or ${arms[1]}`;
    } else {
      const last = arms.pop();
      return `${arms.join(', ')}, or ${last}`;
    }
  }
}

/**
 * Study design parameter interface
 */
export interface StudyDesignParams {
  designType:
    | 'parallel-rct'
    | 'crossover'
    | 'adaptive'
    | 'dose-escalation'
    | 'group-sequential'
    | 'basket'
    | 'umbrella';
  indication: string;
  phase: string;
  arms: number;
  primaryEndpoint: string;
  secondaryEndpoints: string[];
  populationCriteria: {
    inclusion: string[];
    exclusion: string[];
  };
  treatmentDuration?: string;
  sampleSize?: number;
  interventionName?: string;
  blinding?: 'open-label' | 'single-blind' | 'double-blind';
}
