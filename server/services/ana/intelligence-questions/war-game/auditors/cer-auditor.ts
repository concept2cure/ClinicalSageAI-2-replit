/**
 * CER War Game Auditor
 *
 * Simulates a Notified Body / EU MDR reviewer scrutinising a
 * Clinical Evaluation Report.  Every rule is phrased as a question
 * a Notified Body assessor would ask during a technical documentation
 * review under EU MDR 2017/745.
 *
 * @module server/services/ana/intelligence-questions/war-game/auditors/cer-auditor
 */

import type { WarGameAuditor, AuditRule, WarGameFinding, AuditDimension } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const rid = (suffix: string) => 'cer_' + suffix;

/** Truthy-but-empty guard -- treats whitespace-only strings as missing. */
function isBlank(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

/** Safe string coercion. */
function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Safe number coercion, returns NaN for non-numeric. */
function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  return NaN;
}

/* ------------------------------------------------------------------ */
/*  Rules                                                             */
/* ------------------------------------------------------------------ */

const rules: AuditRule[] = [
  /* 1 -- Device identification */
  {
    id: rid('device_identification'),
    dimension: 'completeness',
    title: 'Device identification & description',
    question:
      'Per Annex XIV Part A Section 1 of EU MDR 2017/745, the CER shall include a description of the device and its intended purpose. Can the manufacturer confirm that the device name, description, and intended purpose are fully specified?',
    check(answers) {
      if (isBlank(answers.device_name) || isBlank(answers.device_description) || isBlank(answers.intended_purpose)) {
        return {
          id: this.id,
          dimension: this.dimension,
          severity: 'critical',
          title: this.title,
          question: this.question,
          observation:
            'One or more of the following are missing or incomplete: device name, device description, intended purpose.',
          requirement:
            'EU MDR Annex XIV Part A Section 1 requires clear identification of the device, including trade name, model/size variants, and a precise statement of intended purpose.',
          reference: 'EU MDR 2017/745 Annex XIV Part A, Section 1; MEDDEV 2.7/1 Rev 4 Section 7',
          recommendation:
            'Provide the full device description covering design, materials, and functional principles, and state the intended purpose verbatim as declared in the technical documentation.',
          relatedFields: ['device_name', 'device_description', 'intended_purpose'],
        };
      }
      return null;
    },
  },

  /* 2 -- MDR device classification */
  {
    id: rid('device_classification'),
    dimension: 'regulatory_alignment',
    title: 'MDR risk class declaration',
    question:
      'Under Annex VIII of EU MDR 2017/745, has the manufacturer declared the device risk class and confirmed the applicable classification rule(s)?',
    check(answers) {
      const cls = str(answers.device_class_mdr).toLowerCase().replace(/\s/g, '');
      if (isBlank(cls) || !['i', 'iia', 'iib', 'iii'].includes(cls)) {
        return {
          id: this.id,
          dimension: this.dimension,
          severity: 'critical',
          title: this.title,
          question: this.question,
          observation:
            `Device class "${str(answers.device_class_mdr) || '(not provided)'}" does not correspond to a valid EU MDR Annex VIII classification (I, IIa, IIb, III).`,
          requirement:
            'The CER must state the device classification under MDR Annex VIII and identify the applicable classification rule(s). MEDDEV 2.7/1 Rev 4 Section 7 requires this.',
          reference: 'EU MDR 2017/745 Annex VIII; MEDDEV 2.7/1 Rev 4 Section 7',
          recommendation:
            'State the classification rule number (e.g., Rule 11) and resulting class. For up-classified devices, justify the classification rationale.',
          relatedFields: ['device_class_mdr'],
        };
      }
      return null;
    },
  },

  /* 3 -- Clinical claims */
  {
    id: rid('clinical_claims'),
    dimension: 'scientific_rigor',
    title: 'Clinical claims substantiation',
    question:
      'MEDDEV 2.7/1 Rev 4 Section 9 requires that all clinical claims be identified and evaluated. Has the manufacturer listed every clinical claim made for the device and indicated the corresponding clinical evidence?',
    check(answers) {
      if (isBlank(answers.clinical_claims)) {
        return {
          id: this.id,
          dimension: this.dimension,
          severity: 'critical',
          title: this.title,
          question: this.question,
          observation: 'No clinical claims have been provided.',
          requirement:
            'The CER must explicitly list all clinical claims (safety, performance, clinical benefit) and map each claim to the supporting clinical evidence per MEDDEV 2.7/1 Rev 4 Section 9.',
          reference: 'MEDDEV 2.7/1 Rev 4 Section 9; EU MDR Article 61(1)',
          recommendation:
            'Tabulate every clinical claim together with the type and strength of evidence supporting it. Include any claims implied in the IFU or promotional material.',
          relatedFields: ['clinical_claims'],
        };
      }
      return null;
    },
  },

  /* 4 -- Equivalence device identification */
  {
    id: rid('equivalence_device'),
    dimension: 'regulatory_alignment',
    title: 'Equivalent device identification',
    question:
      'If claiming equivalence under EU MDR Article 61(5) and Annex XIV Part A Section 3, has the manufacturer identified the equivalent device and provided sufficient detail for assessment?',
    check(answers) {
      const eqDevice = str(answers.equivalent_device);
      // Trigger if they name an equivalent device but provide no demonstration
      if (!isBlank(answers.equivalent_device) && isBlank(answers.equivalence_demonstration)) {
        return {
          id: this.id,
          dimension: this.dimension,
          severity: 'critical',
          title: this.title,
          question: this.question,
          observation:
            `An equivalent device ("${eqDevice}") is named but the equivalence demonstration is absent or inadequate.`,
          requirement:
            'EU MDR Annex XIV Part A Section 3 requires demonstration of equivalence across three pillars: technical, biological, and clinical characteristics. For Class III and implantable devices, Article 61(5) further requires a contract with the equivalent device manufacturer granting access to technical documentation.',
          reference: 'EU MDR 2017/745 Article 61(5); Annex XIV Part A Section 3; MDCG 2020-5',
          recommendation:
            'Provide a detailed three-column equivalence comparison (technical, biological, clinical) per MDCG 2020-5 guidance. If the equivalent device is from another manufacturer, include evidence of a contractual agreement or justify why direct clinical data is sufficient.',
          relatedFields: ['equivalent_device', 'equivalence_demonstration'],
        };
      }
      // If higher-risk device but no equivalence and no clinical investigations
      const cls = str(answers.device_class_mdr).toLowerCase().replace(/\s/g, '');
      if ((cls === 'iii' || cls === 'iib') && isBlank(eqDevice) && isBlank(answers.clinical_investigations)) {
        return {
          id: this.id,
          dimension: this.dimension,
          severity: 'warning',
          title: this.title,
          question: this.question,
          observation:
            'No equivalent device is identified and no clinical investigation data is referenced for a higher-risk device.',
          requirement:
            'For Class III and implantable devices, EU MDR Article 61(4) requires clinical investigations unless reliance on equivalence or other clinical data can be duly justified per Article 61(10).',
          reference: 'EU MDR 2017/745 Article 61(4)(10); MDCG 2020-6',
          recommendation:
            'Either identify an equivalent device with full three-pillar demonstration, provide clinical investigation data, or document a robust justification under Article 61(10) referencing MDCG 2020-6.',
          relatedFields: ['equivalent_device', 'clinical_investigations', 'device_class_mdr'],
        };
      }
      return null;
    },
  },

  /* 5 -- Equivalence three-pillar demonstration */
  {
    id: rid('equivalence_three_pillars'),
    dimension: 'scientific_rigor',
    title: 'Three-pillar equivalence demonstration',
    question:
      'Per MDCG 2020-5 and Annex XIV Part A Section 3, has the manufacturer demonstrated equivalence across technical, biological, and clinical characteristics with sufficient granularity?',
    check(answers) {
      const demo = str(answers.equivalence_demonstration).toLowerCase();
      if (isBlank(answers.equivalent_device) || isBlank(demo)) return null;
      const hasTechnical = /technical/i.test(demo);
      const hasBiological = /biolog/i.test(demo);
      const hasClinical = /clinical/i.test(demo);
      if (!hasTechnical || !hasBiological || !hasClinical) {
        const missing: string[] = [];
        if (!hasTechnical) missing.push('technical');
        if (!hasBiological) missing.push('biological');
        if (!hasClinical) missing.push('clinical');
        return {
          id: this.id,
          dimension: this.dimension,
          severity: 'critical',
          title: this.title,
          question: this.question,
          observation:
            `The equivalence demonstration appears to be missing the following pillar(s): ${missing.join(', ')}.`,
          requirement:
            'MDCG 2020-5 requires a side-by-side comparison across all three pillars. Technical characteristics include design, specifications, physicochemical properties; biological characteristics cover biocompatibility; clinical characteristics cover clinical condition, site, population, and clinical performance.',
          reference: 'EU MDR 2017/745 Annex XIV Part A Section 3; MDCG 2020-5',
          recommendation:
            'Complete the equivalence table addressing each pillar. For each difference identified, justify why it does not affect safety and clinical performance.',
          relatedFields: ['equivalence_demonstration', 'equivalent_device'],
        };
      }
      return null;
    },
  },

  /* 6 -- Literature search protocol */
  {
    id: rid('lit_search_protocol'),
    dimension: 'scientific_rigor',
    title: 'Systematic literature search protocol',
    question:
      'MEDDEV 2.7/1 Rev 4 Section 8 requires a defined literature search protocol. Has the manufacturer documented the search strategy, including databases, search terms, and inclusion/exclusion criteria?',
    check(answers) {
      if (isBlank(answers.literature_search_protocol)) {
        return {
          id: this.id,
          dimension: this.dimension,
          severity: 'critical',
          title: this.title,
          question: this.question,
          observation: 'No literature search protocol has been provided or referenced.',
          requirement:
            'A systematic, reproducible literature search protocol is mandated by MEDDEV 2.7/1 Rev 4 Section 8. It must define databases searched, search strings, date ranges, and inclusion/exclusion criteria.',
          reference: 'MEDDEV 2.7/1 Rev 4 Sections 8 & Appendix A9',
          recommendation:
            'Provide a standalone literature search protocol or reference one within the CER. Include a PRISMA-style flow diagram showing the screening and selection process.',
          relatedFields: ['literature_search_protocol'],
        };
      }
      return null;
    },
  },

  /* 7 -- Literature databases */
  {
    id: rid('lit_databases'),
    dimension: 'completeness',
    title: 'Literature database coverage',
    question:
      'Per MEDDEV 2.7/1 Rev 4, the literature search shall cover relevant databases such as PubMed/MEDLINE, Embase, and the Cochrane Library. Which databases were searched?',
    check(answers) {
      const dbs = str(answers.literature_databases).toLowerCase();
      if (isBlank(dbs)) {
        return {
          id: this.id,
          dimension: this.dimension,
          severity: 'warning',
          title: this.title,
          question: this.question,
          observation: 'No databases have been specified for the literature search.',
          requirement:
            'MEDDEV 2.7/1 Rev 4 Section 8 expects multiple databases to be searched to ensure comprehensive coverage. At minimum PubMed/MEDLINE is expected; Embase and Cochrane are strongly recommended.',
          reference: 'MEDDEV 2.7/1 Rev 4 Section 8.3',
          recommendation:
            'Specify all databases searched. If fewer than two major databases were used, justify why the search is still considered comprehensive.',
          relatedFields: ['literature_databases'],
        };
      }
      const hasPubmed = /pubmed|medline/i.test(dbs);
      if (!hasPubmed) {
        return {
          id: this.id,
          dimension: this.dimension,
          severity: 'warning',
          title: this.title,
          question: this.question,
          observation: 'PubMed/MEDLINE does not appear among the databases searched.',
          requirement:
            'PubMed/MEDLINE is the primary biomedical literature database and its omission would be questioned by a Notified Body reviewer.',
          reference: 'MEDDEV 2.7/1 Rev 4 Section 8.3',
          recommendation:
            'Include PubMed/MEDLINE in the literature search. If intentionally excluded, provide a documented justification.',
          relatedFields: ['literature_databases'],
        };
      }
      return null;
    },
  },

  /* 8 -- Search date range */
  {
    id: rid('search_date_range'),
    dimension: 'completeness',
    title: 'Literature search date range',
    question:
      'What date range does the literature search cover, and is it current enough to satisfy the requirement for up-to-date clinical evidence per MEDDEV 2.7/1 Rev 4?',
    check(answers) {
      if (isBlank(answers.search_date_range)) {
        return {
          id: this.id,
          dimension: this.dimension,
          severity: 'warning',
          title: this.title,
          question: this.question,
          observation: 'The date range for the literature search has not been specified.',
          requirement:
            'MEDDEV 2.7/1 Rev 4 Section 8 requires the date range to be stated. The search should be current -- typically within the last 12 months of CER finalisation.',
          reference: 'MEDDEV 2.7/1 Rev 4 Section 8',
          recommendation:
            'State the start and end dates of the literature search. If the search is older than 12 months, perform an update search or justify currency.',
          relatedFields: ['search_date_range'],
        };
      }
      return null;
    },
  },

  /* 9 -- Article appraisal pipeline */
  {
    id: rid('article_appraisal'),
    dimension: 'scientific_rigor',
    title: 'Literature appraisal and selection transparency',
    question:
      'Per MEDDEV 2.7/1 Rev 4 Section 8.4, have all identified articles been appraised for methodological quality and relevance? Can the manufacturer account for the screening funnel (found -> appraised -> included)?',
    check(answers) {
      const found = num(answers.total_articles_found);
      const appraised = num(answers.articles_appraised);
      const included = num(answers.articles_included);

      if (isNaN(found) || isNaN(appraised) || isNaN(included)) {
        return {
          id: this.id,
          dimension: this.dimension,
          severity: 'warning',
          title: this.title,
          question: this.question,
          observation:
            'The article counts (found / appraised / included) are incomplete or not provided, preventing verification of the screening funnel.',
          requirement:
            'A transparent appraisal process with article counts at each stage is required per MEDDEV 2.7/1 Rev 4 Section 8.4. A PRISMA-style diagram is recommended.',
          reference: 'MEDDEV 2.7/1 Rev 4 Sections 8.4 and Appendix A9',
          recommendation:
            'Provide total counts at each stage: articles identified, screened, appraised for quality, and included in the evaluation. Include reasons for exclusion.',
          relatedFields: ['total_articles_found', 'articles_appraised', 'articles_included'],
        };
      }

      if (included > appraised || appraised > found) {
        return {
          id: this.id,
          dimension: this.dimension,
          severity: 'critical',
          title: this.title,
          question: this.question,
          observation:
            `The article funnel is inconsistent: found=${found}, appraised=${appraised}, included=${included}. Included articles cannot exceed appraised, and appraised cannot exceed found.`,
          requirement:
            'The screening funnel must be logically consistent per MEDDEV 2.7/1 Rev 4 Section 8.4.',
          reference: 'MEDDEV 2.7/1 Rev 4 Section 8.4',
          recommendation:
            'Review and correct the article counts. Ensure the PRISMA flow diagram is consistent with the numbers reported in the CER.',
          relatedFields: ['total_articles_found', 'articles_appraised', 'articles_included'],
        };
      }

      if (found > 0 && included / found < 0.01) {
        return {
          id: this.id,
          dimension: this.dimension,
          severity: 'info',
          title: this.title,
          question: this.question,
          observation:
            `Only ${included} of ${found} articles were included (<1%). While a low inclusion rate may be justified, a Notified Body may question whether relevant evidence has been excluded.`,
          requirement:
            'MEDDEV 2.7/1 Rev 4 Section 8.4 requires justification of exclusion criteria and assurance that relevant data was not systematically excluded.',
          reference: 'MEDDEV 2.7/1 Rev 4 Section 8.4',
          recommendation:
            'Verify that exclusion criteria are not overly restrictive. Provide a rationale for articles excluded at each stage.',
          relatedFields: ['total_articles_found', 'articles_included'],
        };
      }

      return null;
    },
  },

  /* 10 -- Clinical investigation data */
  {
    id: rid('clinical_investigation_data'),
    dimension: 'completeness',
    title: 'Clinical investigation data',
    question:
      'EU MDR Article 61(3) requires that clinical investigations are considered as a source of clinical data. Has the manufacturer included data from clinical investigations conducted with the device under evaluation?',
    check(answers) {
      const cls = str(answers.device_class_mdr).toLowerCase().replace(/\s/g, '');
      if ((cls === 'iii' || cls === 'iib') && isBlank(answers.clinical_investigations) && isBlank(answers.equivalent_device)) {
        return {
          id: this.id,
          dimension: this.dimension,
          severity: 'critical',
          title: this.title,
          question: this.question,
          observation:
            'No clinical investigation data is provided for a higher-risk device (Class IIb/III), and no equivalence route is pursued.',
          requirement:
            'For Class III and implantable devices, EU MDR Article 61(4) requires clinical investigations unless equivalence per Article 61(5) is demonstrated or a justified exception under Article 61(10) applies.',
          reference: 'EU MDR 2017/745 Article 61(3)(4)(10); MDCG 2020-6',
          recommendation:
            'Include clinical investigation data, pursue a fully documented equivalence route, or provide a detailed justification under Article 61(10) with reference to MDCG 2020-6.',
          relatedFields: ['clinical_investigations', 'device_class_mdr', 'equivalent_device'],
        };
      }
      return null;
    },
  },

  /* 11 -- Post-market data sources */
  {
    id: rid('pms_data_sources'),
    dimension: 'completeness',
    title: 'Post-market surveillance data integration',
    question:
      'MEDDEV 2.7/1 Rev 4 Section 8.5 requires integration of post-market surveillance (PMS) data into the CER. Has the manufacturer identified and incorporated relevant PMS data sources?',
    check(answers) {
      if (isBlank(answers.post_market_data_sources)) {
        return {
          id: this.id,
          dimension: this.dimension,
          severity: 'warning',
          title: this.title,
          question: this.question,
          observation: 'No post-market data sources have been identified.',
          requirement:
            'The CER must integrate available PMS data including complaint records, vigilance reports, PMS reports, PMCF data, and field safety corrective actions per MEDDEV 2.7/1 Rev 4 Section 8.5 and EU MDR Article 83.',
          reference: 'MEDDEV 2.7/1 Rev 4 Section 8.5; EU MDR Article 83-86',
          recommendation:
            'List all PMS data sources consulted (e.g., complaint database, vigilance database, PMCF study results, customer feedback). Summarise the key findings and their impact on the benefit-risk assessment.',
          relatedFields: ['post_market_data_sources'],
        };
      }
      return null;
    },
  },

  /* 12 -- PMCF plan */
  {
    id: rid('pmcf_plan'),
    dimension: 'regulatory_alignment',
    title: 'PMCF plan reference and adequacy',
    question:
      'EU MDR Annex XIV Part B mandates a Post-Market Clinical Follow-up (PMCF) plan. Does the CER reference a PMCF plan, and does it adequately address residual risks and long-term safety?',
    check(answers) {
      if (isBlank(answers.pmcf_plan_reference)) {
        return {
          id: this.id,
          dimension: this.dimension,
          severity: 'critical',
          title: this.title,
          question: this.question,
          observation: 'No PMCF plan is referenced in the CER.',
          requirement:
            'EU MDR Annex XIV Part B requires a PMCF plan as part of the clinical evaluation. The plan must specify methods, objectives, milestones, and evaluation criteria. MDCG 2020-7 and MDCG 2020-8 provide further guidance.',
          reference: 'EU MDR 2017/745 Annex XIV Part B; MDCG 2020-7; MDCG 2020-8',
          recommendation:
            'Reference or include a PMCF plan that addresses: objectives, study design/methodology, sample size rationale, milestones, analysis plan, and how PMCF data will feed back into the CER update cycle.',
          relatedFields: ['pmcf_plan_reference'],
        };
      }
      return null;
    },
  },

  /* 13 -- Vigilance data */
  {
    id: rid('vigilance_data'),
    dimension: 'risk_identification',
    title: 'Vigilance data summary',
    question:
      'Has the manufacturer reviewed relevant vigilance data (e.g., EUDAMED, MAUDE, BfArM, MHRA) for the device and similar devices, and summarised findings in the CER as required by MEDDEV 2.7/1 Rev 4 Section 8.5?',
    check(answers) {
      if (isBlank(answers.vigilance_data_summary)) {
        return {
          id: this.id,
          dimension: this.dimension,
          severity: 'warning',
          title: this.title,
          question: this.question,
          observation: 'No vigilance data summary has been provided.',
          requirement:
            'The CER shall include a review of available vigilance data for the subject device and equivalent/similar devices. This includes serious incidents, field safety corrective actions, and trends per MEDDEV 2.7/1 Rev 4 Section 8.5.',
          reference: 'MEDDEV 2.7/1 Rev 4 Section 8.5; EU MDR Articles 87-92',
          recommendation:
            'Search relevant vigilance databases (EUDAMED when available, FDA MAUDE, BfArM, MHRA). Summarise incident types, frequencies, and any trends. Discuss their impact on the benefit-risk determination.',
          relatedFields: ['vigilance_data_summary'],
        };
      }
      return null;
    },
  },

  /* 14 -- Risk analysis cross-reference */
  {
    id: rid('risk_analysis_ref'),
    dimension: 'consistency',
    title: 'Risk management file cross-reference',
    question:
      'MEDDEV 2.7/1 Rev 4 Section 10 requires that the CER be consistent with the risk management file (ISO 14971). Is the risk analysis referenced, and are residual risks addressed in the clinical evaluation?',
    check(answers) {
      if (isBlank(answers.risk_analysis_reference)) {
        return {
          id: this.id,
          dimension: this.dimension,
          severity: 'warning',
          title: this.title,
          question: this.question,
          observation: 'No reference to the risk analysis or risk management file has been provided.',
          requirement:
            'The CER must cross-reference the risk management file and confirm that residual risks identified in the risk analysis are acceptable in light of the clinical evidence. This is required by MEDDEV 2.7/1 Rev 4 Section 10 and EU MDR Annex I GSPR 1-8.',
          reference: 'MEDDEV 2.7/1 Rev 4 Section 10; ISO 14971:2019; EU MDR Annex I',
          recommendation:
            'Reference the risk management file (document ID and version). Discuss how clinical evidence supports the acceptability of residual risks identified therein.',
          relatedFields: ['risk_analysis_reference'],
        };
      }
      return null;
    },
  },

  /* 15 -- GSPR mapping */
  {
    id: rid('gspr_mapping'),
    dimension: 'regulatory_alignment',
    title: 'General Safety and Performance Requirements (GSPR) mapping',
    question:
      'EU MDR Annex I defines the General Safety and Performance Requirements. Has the CER mapped clinical evidence to the applicable GSPRs, demonstrating that each is fulfilled?',
    check(answers) {
      if (isBlank(answers.gspr_mapping)) {
        return {
          id: this.id,
          dimension: this.dimension,
          severity: 'critical',
          title: this.title,
          question: this.question,
          observation: 'No GSPR mapping or checklist has been provided.',
          requirement:
            'EU MDR Annex II Section 4(a) requires that the technical documentation include a GSPR checklist mapping each requirement to the relevant evidence. The CER should reference this mapping and provide the clinical evidence component.',
          reference: 'EU MDR 2017/745 Annex I, Annex II Section 4(a); MDCG 2021-24',
          recommendation:
            'Provide a GSPR checklist mapping relevant requirements (especially GSPRs 1, 2, 3, 5, 6, 7, 8, 14, 22, 23) to the clinical evidence presented in the CER. Follow MDCG 2021-24 format.',
          relatedFields: ['gspr_mapping'],
        };
      }
      return null;
    },
  },

  /* 16 -- Benefit-risk conclusion */
  {
    id: rid('benefit_risk'),
    dimension: 'scientific_rigor',
    title: 'Benefit-risk determination',
    question:
      'EU MDR Article 61(1) requires that the clinical evaluation demonstrate conformity with the relevant GSPRs, confirming that the benefits outweigh the residual risks. Has the manufacturer provided a clear benefit-risk conclusion?',
    check(answers) {
      if (isBlank(answers.benefit_risk_conclusion)) {
        return {
          id: this.id,
          dimension: this.dimension,
          severity: 'critical',
          title: this.title,
          question: this.question,
          observation: 'No benefit-risk conclusion has been documented.',
          requirement:
            'The CER must conclude with an explicit benefit-risk determination per EU MDR Article 61(1) and MEDDEV 2.7/1 Rev 4 Section 10. The analysis must weigh the clinical benefits against residual risks in the context of the state of the art.',
          reference: 'EU MDR 2017/745 Article 61(1); MEDDEV 2.7/1 Rev 4 Section 10',
          recommendation:
            'Provide a structured benefit-risk analysis that explicitly lists benefits, residual risks, risk mitigation measures, and concludes whether the benefit-risk profile is acceptable in the context of the state of the art.',
          relatedFields: ['benefit_risk_conclusion'],
        };
      }
      return null;
    },
  },

  /* 17 -- Residual risks */
  {
    id: rid('residual_risks'),
    dimension: 'risk_identification',
    title: 'Residual risk disclosure',
    question:
      'Per EU MDR Annex I GSPR 2, residual risks must be acceptable and communicated in the IFU. Has the manufacturer listed residual risks and confirmed they are acceptable in light of clinical evidence?',
    check(answers) {
      if (isBlank(answers.residual_risks)) {
        return {
          id: this.id,
          dimension: this.dimension,
          severity: 'warning',
          title: this.title,
          question: this.question,
          observation: 'Residual risks have not been listed or discussed in the CER.',
          requirement:
            'EU MDR Annex I GSPR 2 requires that residual risks be deemed acceptable when weighed against clinical benefits and that they are communicated to users. MEDDEV 2.7/1 Rev 4 Section 10 requires the CER to address residual risks.',
          reference: 'EU MDR Annex I GSPR 2; MEDDEV 2.7/1 Rev 4 Section 10; ISO 14971:2019',
          recommendation:
            'List all identified residual risks, their clinical significance, and confirm their acceptability with reference to clinical evidence. Ensure alignment with the risk management file.',
          relatedFields: ['residual_risks', 'risk_analysis_reference'],
        };
      }
      return null;
    },
  },

  /* 18 -- State of the art */
  {
    id: rid('state_of_art'),
    dimension: 'scientific_rigor',
    title: 'State-of-the-art comparison',
    question:
      'MEDDEV 2.7/1 Rev 4 Section 9 requires a summary of the current knowledge and state of the art for the medical condition and available treatments. Has this been provided?',
    check(answers) {
      if (isBlank(answers.state_of_art_summary)) {
        return {
          id: this.id,
          dimension: this.dimension,
          severity: 'warning',
          title: this.title,
          question: this.question,
          observation: 'No state-of-the-art summary has been provided.',
          requirement:
            'The CER must include a critical evaluation of the current knowledge/state of the art relevant to the device, including alternative treatments, benchmark performance data, and clinical guidelines per MEDDEV 2.7/1 Rev 4 Section 9.',
          reference: 'MEDDEV 2.7/1 Rev 4 Section 9; EU MDR Article 61(1)',
          recommendation:
            'Provide a state-of-the-art review covering: the medical condition or purpose, existing treatment options, accepted clinical benchmarks, and relevant clinical guidelines. Position the device within this landscape.',
          relatedFields: ['state_of_art_summary'],
        };
      }
      return null;
    },
  },

  /* 19 -- CER update frequency */
  {
    id: rid('update_frequency'),
    dimension: 'regulatory_alignment',
    title: 'CER update schedule',
    question:
      'EU MDR Article 61(11) requires that the clinical evaluation and its documentation be updated throughout the device lifecycle. Has the manufacturer defined an update frequency for the CER?',
    check(answers) {
      if (isBlank(answers.cer_update_frequency)) {
        return {
          id: this.id,
          dimension: this.dimension,
          severity: 'warning',
          title: this.title,
          question: this.question,
          observation: 'No CER update frequency has been specified.',
          requirement:
            'EU MDR Article 61(11) mandates that the clinical evaluation and CER be updated throughout the device lifecycle. For Class III and implantable devices, MDCG 2020-13 recommends at least annual updates; for lower classes, the interval should be justified.',
          reference: 'EU MDR 2017/745 Article 61(11); MDCG 2020-13',
          recommendation:
            'State the planned CER update frequency. For Class III/implantable devices, commit to annual updates. For Class I/IIa/IIb, justify the chosen interval (typically not exceeding 2-5 years depending on risk class and novelty).',
          relatedFields: ['cer_update_frequency', 'device_class_mdr'],
        };
      }
      return null;
    },
  },

  /* 20 -- Clinical evidence level */
  {
    id: rid('evidence_level'),
    dimension: 'scientific_rigor',
    title: 'Level of clinical evidence',
    question:
      'Has the manufacturer characterised the level of clinical evidence (e.g., per the evidence hierarchy in MEDDEV 2.7/1 Rev 4 Appendix A3) and assessed whether it is sufficient for the device risk class?',
    check(answers) {
      if (isBlank(answers.clinical_evidence_level)) {
        return {
          id: this.id,
          dimension: this.dimension,
          severity: 'warning',
          title: this.title,
          question: this.question,
          observation: 'The level of clinical evidence has not been characterised.',
          requirement:
            'MEDDEV 2.7/1 Rev 4 Appendix A3 provides a hierarchy of evidence. The CER should grade the available evidence and assess sufficiency relative to the device risk class and intended claims.',
          reference: 'MEDDEV 2.7/1 Rev 4 Appendix A3; EU MDR Article 61',
          recommendation:
            'Classify the available clinical evidence using a recognised hierarchy (e.g., RCTs, cohort studies, case series). For higher-risk devices, higher-quality evidence is expected. If only lower-level evidence is available, justify its sufficiency.',
          relatedFields: ['clinical_evidence_level', 'device_class_mdr'],
        };
      }
      return null;
    },
  },

  /* 21 -- Unmet clinical needs */
  {
    id: rid('unmet_clinical_needs'),
    dimension: 'practical_feasibility',
    title: 'Unmet clinical needs and device positioning',
    question:
      'Has the manufacturer described any unmet clinical needs that the device addresses, and how these relate to the benefit-risk profile?',
    check(answers) {
      if (isBlank(answers.unmet_clinical_needs)) {
        return {
          id: this.id,
          dimension: this.dimension,
          severity: 'info',
          title: this.title,
          question: this.question,
          observation: 'No discussion of unmet clinical needs has been provided.',
          requirement:
            'While not explicitly mandated, MEDDEV 2.7/1 Rev 4 and Notified Body expectations include a discussion of the clinical context, including unmet needs that justify the device. This strengthens the benefit-risk determination.',
          reference: 'MEDDEV 2.7/1 Rev 4 Section 9; EU MDR Recital 1',
          recommendation:
            'Describe the unmet clinical need or gap in current treatment that the device is intended to address. This contextualises the benefit-risk assessment and strengthens the clinical rationale.',
          relatedFields: ['unmet_clinical_needs'],
        };
      }
      return null;
    },
  },

  /* 22 -- Benefit-risk vs residual risks consistency */
  {
    id: rid('benefit_risk_vs_residual_risks'),
    dimension: 'consistency',
    title: 'Benefit-risk and residual risk alignment',
    question:
      'Does the benefit-risk conclusion explicitly address the residual risks identified in the risk management file? A Notified Body reviewer would expect cross-referencing between these sections.',
    check(answers) {
      if (!isBlank(answers.benefit_risk_conclusion) && isBlank(answers.residual_risks)) {
        return {
          id: this.id,
          dimension: this.dimension,
          severity: 'warning',
          title: this.title,
          question: this.question,
          observation:
            'A benefit-risk conclusion is provided but residual risks are not separately listed, raising questions about whether all residual risks have been considered in the benefit-risk determination.',
          requirement:
            'MEDDEV 2.7/1 Rev 4 Section 10 requires that the benefit-risk analysis explicitly consider all residual risks. The CER should demonstrate traceability between the risk management file and the clinical evaluation.',
          reference: 'MEDDEV 2.7/1 Rev 4 Section 10; ISO 14971:2019 Section 8',
          recommendation:
            'List the residual risks separately and address each within the benefit-risk conclusion. Show that clinical evidence supports the acceptability of each residual risk.',
          relatedFields: ['benefit_risk_conclusion', 'residual_risks', 'risk_analysis_reference'],
        };
      }
      return null;
    },
  },

  /* 23 -- MEDDEV 2.7/1 Rev 4 structural completeness */
  {
    id: rid('meddev_structure'),
    dimension: 'documentation',
    title: 'MEDDEV 2.7/1 Rev 4 structural compliance',
    question:
      'Does the CER follow the structure outlined in MEDDEV 2.7/1 Rev 4 (Sections 7-12)? A Notified Body reviewer will verify that all mandated sections are present and adequately addressed.',
    check(answers) {
      const requiredFields: Array<{ field: string; label: string }> = [
        { field: 'device_description', label: 'Device description (Section 7)' },
        { field: 'clinical_claims', label: 'Clinical claims (Section 9)' },
        { field: 'literature_search_protocol', label: 'Literature search protocol (Section 8)' },
        { field: 'state_of_art_summary', label: 'State of the art (Section 9)' },
        { field: 'benefit_risk_conclusion', label: 'Benefit-risk conclusion (Section 10)' },
      ];
      const missing = requiredFields.filter(f => isBlank(answers[f.field]));
      if (missing.length >= 3) {
        return {
          id: this.id,
          dimension: this.dimension,
          severity: 'critical',
          title: this.title,
          question: this.question,
          observation:
            `The following key CER sections appear to be missing or inadequate: ${missing.map(m => m.label).join('; ')}.`,
          requirement:
            'MEDDEV 2.7/1 Rev 4 requires the CER to contain: scope (Section 7), clinical background and state of the art (Section 9), literature search methodology (Section 8), clinical data appraisal (Section 8), analysis of clinical data (Section 9), and conclusions including benefit-risk (Section 10).',
          reference: 'MEDDEV 2.7/1 Rev 4 Sections 7-12',
          recommendation:
            'Restructure the CER to follow MEDDEV 2.7/1 Rev 4 explicitly. Address each missing section. Consider using the MEDDEV template as a framework.',
          relatedFields: missing.map(m => m.field),
        };
      }
      return null;
    },
  },

  /* 24 -- PMCF and CER update cycle linkage */
  {
    id: rid('pmcf_cer_linkage'),
    dimension: 'consistency',
    title: 'PMCF-CER feedback loop',
    question:
      'Per MDCG 2020-7 and EU MDR Annex XIV Part B, the PMCF plan should specify how its results feed back into the CER update. Is this linkage documented?',
    check(answers) {
      if (!isBlank(answers.pmcf_plan_reference) && isBlank(answers.cer_update_frequency)) {
        return {
          id: this.id,
          dimension: this.dimension,
          severity: 'warning',
          title: this.title,
          question: this.question,
          observation:
            'A PMCF plan is referenced but no CER update frequency is stated. A Notified Body reviewer would question how PMCF findings trigger CER revision.',
          requirement:
            'EU MDR Article 61(11) and Annex XIV Part B require a documented feedback loop between PMCF activities and the CER. MDCG 2020-7 expects the PMCF plan to specify CER update triggers.',
          reference: 'EU MDR Annex XIV Part B; MDCG 2020-7; MDCG 2020-8',
          recommendation:
            'Define the CER update frequency and specify trigger criteria (e.g., new PMCF data, safety signal, significant literature findings) that would prompt an unscheduled CER update.',
          relatedFields: ['pmcf_plan_reference', 'cer_update_frequency'],
        };
      }
      return null;
    },
  },

  /* 25 -- Clinical evidence sufficiency for class III */
  {
    id: rid('class_iii_evidence_sufficiency'),
    dimension: 'regulatory_alignment',
    title: 'Clinical evidence sufficiency for high-risk devices',
    question:
      'For Class III and implantable devices, EU MDR Article 61(4) sets a higher bar for clinical evidence. Is the quantum of evidence proportionate to the device risk class?',
    check(answers) {
      const cls = str(answers.device_class_mdr).toLowerCase().replace(/\s/g, '');
      if (cls !== 'iii') return null;

      const hasInvestigations = !isBlank(answers.clinical_investigations);
      const hasEquivalence = !isBlank(answers.equivalent_device) && !isBlank(answers.equivalence_demonstration);
      const evidenceLevel = str(answers.clinical_evidence_level).toLowerCase();
      const hasHighEvidence = /rct|randomis|randomiz|controlled trial|cohort/i.test(evidenceLevel);

      if (!hasInvestigations && !hasEquivalence && !hasHighEvidence) {
        return {
          id: this.id,
          dimension: this.dimension,
          severity: 'critical',
          title: this.title,
          question: this.question,
          observation:
            'Class III device with no clinical investigation data, no equivalence demonstration, and no indication of high-level clinical evidence. This is unlikely to satisfy Article 61(4) requirements.',
          requirement:
            'EU MDR Article 61(4) requires Class III and implantable devices to undergo clinical investigations, except where reliance on existing clinical data from equivalence or other robust sources is duly justified per Article 61(5) or 61(10).',
          reference: 'EU MDR 2017/745 Article 61(4)(5)(10); MDCG 2020-6',
          recommendation:
            'Conduct a clinical investigation, establish device equivalence with full three-pillar demonstration, or provide a thorough justification under Article 61(10) supported by high-quality clinical evidence.',
          relatedFields: ['clinical_investigations', 'equivalent_device', 'equivalence_demonstration', 'clinical_evidence_level', 'device_class_mdr'],
        };
      }
      return null;
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Factory                                                           */
/* ------------------------------------------------------------------ */

export function createCerAuditor(): WarGameAuditor {
  return {
    category: 'cer',
    name: 'EU MDR Clinical Evaluation Report Auditor',
    description:
      'Simulates a Notified Body reviewer scrutinising a Clinical Evaluation Report under EU MDR 2017/745, MEDDEV 2.7/1 Rev 4, Annex XIV, and relevant MDCG guidance documents.',
    rules,
  };
}
