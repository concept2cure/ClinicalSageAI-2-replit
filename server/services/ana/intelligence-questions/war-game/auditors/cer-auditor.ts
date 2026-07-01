/**
 * CER (Clinical Evaluation Report) War Game Auditor
 *
 * Simulates Notified Body and EU MDR reviewer scrutiny of a Clinical
 * Evaluation Report. Examines equivalence assessment, literature search
 * methodology, clinical data analysis, GSPR mapping, PMCF planning,
 * and evaluator qualifications per EU MDR and MEDDEV 2.7/1 Rev 4.
 *
 * @module server/services/ana/intelligence-questions/war-game/auditors/cer-auditor
 */
import type { WarGameAuditor, AuditRule, WarGameFinding } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function isEmpty(val: unknown): boolean {
  if (val == null) return true;
  if (typeof val === 'string') return val.trim() === '';
  if (Array.isArray(val)) return val.length === 0;
  return false;
}

function includes(val: unknown, search: string): boolean {
  if (typeof val === 'string') return val.toLowerCase().includes(search.toLowerCase());
  if (Array.isArray(val)) return val.includes(search);
  return false;
}

/* ------------------------------------------------------------------ */
/*  Rules                                                             */
/* ------------------------------------------------------------------ */

function buildRules(): AuditRule[] {
  return [
    /* ── Equivalence Assessment (1-6) ──────────────────────────── */
    {
      id: 'cer_001',
      dimension: 'scientific_rigor',
      title: 'No equivalent device identified',
      question:
        'If you are claiming equivalence, how can the CER proceed without identifying the equivalent device?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.equivalent_device)) {
          return {
            id: 'cer_001',
            dimension: 'scientific_rigor',
            severity: 'critical',
            title: 'No equivalent device identified',
            question:
              'If you are claiming equivalence, how can the CER proceed without identifying the equivalent device?',
            observation:
              'No equivalent device has been identified for the equivalence route.',
            requirement:
              'When claiming equivalence, the CER must identify and fully describe the equivalent device, including its regulatory status.',
            reference: 'EU MDR Annex XIV, MEDDEV 2.7/1 Section 5',
            recommendation:
              'Identify the equivalent device and provide its name, manufacturer, regulatory status, and intended purpose. If not claiming equivalence, ensure sufficient clinical data from the subject device.',
            relatedFields: [
              'equivalent_device',
              'equivalence_justification',
              'clinical_technical_biological_equivalence',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'cer_002',
      dimension: 'scientific_rigor',
      title: 'Equivalence justification inadequate',
      question:
        'How does a brief equivalence justification adequately demonstrate clinical, technical, and biological equivalence?',
      check(answers): WarGameFinding | null {
        const justification = answers.equivalence_justification;
        if (
          typeof justification === 'string' &&
          justification.trim().length > 0 &&
          justification.trim().length < 100
        ) {
          return {
            id: 'cer_002',
            dimension: 'scientific_rigor',
            severity: 'warning',
            title: 'Equivalence justification inadequate',
            question:
              'How does a brief equivalence justification adequately demonstrate clinical, technical, and biological equivalence?',
            observation:
              'The equivalence justification is too short to adequately support the equivalence claim.',
            requirement:
              'The equivalence justification must provide a detailed comparison of clinical, technical, and biological characteristics.',
            reference: 'MEDDEV 2.7/1 Rev 4 Section 5.3',
            recommendation:
              'Expand the equivalence justification to include a detailed comparison of clinical, technical, and biological characteristics, with explicit rationale for any differences.',
            relatedFields: [
              'equivalence_justification',
              'equivalent_device',
              'clinical_technical_biological_equivalence',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'cer_003',
      dimension: 'consistency',
      title: 'Clinical/technical/biological equivalence not all addressed',
      question:
        'EU MDR requires demonstration of clinical, technical, AND biological equivalence. Have all three pillars been addressed?',
      check(answers): WarGameFinding | null {
        if (
          !isEmpty(answers.equivalent_device) &&
          isEmpty(answers.clinical_technical_biological_equivalence)
        ) {
          return {
            id: 'cer_003',
            dimension: 'consistency',
            severity: 'critical',
            title:
              'Clinical/technical/biological equivalence not all addressed',
            question:
              'EU MDR requires demonstration of clinical, technical, AND biological equivalence. Have all three pillars been addressed?',
            observation:
              'An equivalent device is identified but the three pillars of equivalence (clinical, technical, biological) have not been fully addressed.',
            requirement:
              'All three pillars of equivalence must be individually demonstrated and documented.',
            reference: 'EU MDR Article 61(5)',
            recommendation:
              'Document each pillar of equivalence separately: clinical equivalence (intended purpose, clinical condition, severity), technical equivalence (design, specifications, materials, surfaces), and biological equivalence (biocompatibility, tissue contact).',
            relatedFields: [
              'clinical_technical_biological_equivalence',
              'equivalent_device',
              'equivalence_justification',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'cer_004',
      dimension: 'regulatory_alignment',
      title: 'Equivalence with competitor device without contract',
      question:
        'Under EU MDR, you must demonstrate access to the competitor\'s technical documentation to claim equivalence. Can you provide evidence of such access?',
      check(answers): WarGameFinding | null {
        if (
          !isEmpty(answers.equivalent_device) &&
          !isEmpty(answers.manufacturer_name) &&
          !includes(answers.equivalent_device, String(answers.manufacturer_name))
        ) {
          return {
            id: 'cer_004',
            dimension: 'regulatory_alignment',
            severity: 'critical',
            title: 'Equivalence with competitor device without contract',
            question:
              'Under EU MDR, you must demonstrate access to the competitor\'s technical documentation to claim equivalence. Can you provide evidence of such access?',
            observation:
              'The equivalent device appears to be from a different manufacturer, which under EU MDR requires a contract granting access to technical documentation.',
            requirement:
              'Under EU MDR Article 61(5), claiming equivalence with a competitor device requires a contract with that manufacturer to access their technical documentation.',
            reference: 'EU MDR Article 61(5)',
            recommendation:
              'Either establish a contractual agreement with the equivalent device manufacturer for access to technical documentation, or select an equivalent device from your own portfolio, or generate sufficient clinical data from the subject device.',
            relatedFields: [
              'equivalent_device',
              'manufacturer_name',
              'equivalence_justification',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'cer_005',
      dimension: 'documentation',
      title: 'No state of the art analysis',
      question:
        'How can the CER evaluate benefit-risk without an analysis of the current state of the art?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.state_of_the_art_analysis)) {
          return {
            id: 'cer_005',
            dimension: 'documentation',
            severity: 'warning',
            title: 'No state of the art analysis',
            question:
              'How can the CER evaluate benefit-risk without an analysis of the current state of the art?',
            observation:
              'No state of the art analysis has been provided.',
            requirement:
              'The CER must include an analysis of the current state of the art to contextualize the device benefits and risks.',
            reference: 'MEDDEV 2.7/1 Section 7',
            recommendation:
              'Provide a state of the art analysis covering alternative treatments, current clinical practice, available technologies, and relevant standards and guidelines.',
            relatedFields: [
              'state_of_the_art_analysis',
              'benefit_risk_determination',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'cer_006',
      dimension: 'completeness',
      title: 'Device description inadequate',
      question:
        'Is the device description sufficient for the Notified Body to understand the device scope, design, and intended purpose?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.device_description)) {
          return {
            id: 'cer_006',
            dimension: 'completeness',
            severity: 'critical',
            title: 'Device description inadequate',
            question:
              'Is the device description sufficient for the Notified Body to understand the device scope, design, and intended purpose?',
            observation:
              'The device description is missing or inadequate.',
            requirement:
              'The CER must include a comprehensive device description covering design, materials, intended purpose, and principles of operation.',
            reference: 'EU MDR Annex II',
            recommendation:
              'Provide a detailed device description including device name, intended purpose, design, materials, dimensions, accessories, variants, and principles of operation.',
            relatedFields: [
              'device_description',
              'device_name',
              'intended_purpose',
            ],
          };
        }
        return null;
      },
    },

    /* ── Literature Search (7-13) ──────────────────────────────── */
    {
      id: 'cer_007',
      dimension: 'scientific_rigor',
      title: 'No literature search strategy defined',
      question:
        'Without a defined literature search strategy, how can the CER demonstrate a systematic and reproducible approach to evidence identification?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.literature_search_strategy)) {
          return {
            id: 'cer_007',
            dimension: 'scientific_rigor',
            severity: 'critical',
            title: 'No literature search strategy defined',
            question:
              'Without a defined literature search strategy, how can the CER demonstrate a systematic and reproducible approach to evidence identification?',
            observation:
              'No literature search strategy has been defined.',
            requirement:
              'The CER must include a documented, systematic literature search strategy that is reproducible and comprehensive.',
            reference: 'MEDDEV 2.7/1 Section 8',
            recommendation:
              'Define a literature search strategy including search terms, Boolean operators, databases, date ranges, language filters, and inclusion/exclusion criteria. The strategy should be documented as a protocol before execution.',
            relatedFields: [
              'literature_search_strategy',
              'literature_databases',
              'inclusion_exclusion_criteria',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'cer_008',
      dimension: 'completeness',
      title: 'Insufficient databases searched',
      question:
        'MEDDEV 2.7/1 recommends searching MEDLINE, Embase, and the Cochrane Library at minimum. Have sufficient databases been searched?',
      check(answers): WarGameFinding | null {
        const dbs = answers.literature_databases;
        if (isEmpty(dbs)) {
          return {
            id: 'cer_008',
            dimension: 'completeness',
            severity: 'warning',
            title: 'Insufficient databases searched',
            question:
              'MEDDEV 2.7/1 recommends searching MEDLINE, Embase, and the Cochrane Library at minimum. Have sufficient databases been searched?',
            observation:
              'The literature databases searched have not been specified.',
            requirement:
              'At minimum, MEDLINE, Embase, and the Cochrane Library should be searched. Additional specialty databases may be required depending on the device type.',
            reference: 'MEDDEV 2.7/1 Section 8.3',
            recommendation:
              'Search at minimum MEDLINE (via PubMed), Embase, and the Cochrane Library. Consider additional databases such as CINAHL, Web of Science, or specialty databases relevant to the device area.',
            relatedFields: [
              'literature_databases',
              'literature_search_strategy',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'cer_009',
      dimension: 'documentation',
      title: 'No inclusion/exclusion criteria for literature',
      question:
        'Without defined inclusion and exclusion criteria, how can the literature selection be justified as objective and reproducible?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.inclusion_exclusion_criteria)) {
          return {
            id: 'cer_009',
            dimension: 'documentation',
            severity: 'warning',
            title: 'No inclusion/exclusion criteria for literature',
            question:
              'Without defined inclusion and exclusion criteria, how can the literature selection be justified as objective and reproducible?',
            observation:
              'No inclusion and exclusion criteria for literature selection have been defined.',
            requirement:
              'Pre-defined inclusion and exclusion criteria are required for systematic, reproducible literature selection.',
            reference: 'MEDDEV 2.7/1 Section 8.4',
            recommendation:
              'Define clear inclusion and exclusion criteria covering study type, population, language, date range, endpoint relevance, and quality thresholds. Apply these criteria consistently and document the selection process.',
            relatedFields: [
              'inclusion_exclusion_criteria',
              'literature_search_strategy',
              'appraisal_methodology',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'cer_010',
      dimension: 'scientific_rigor',
      title: 'Literature search date range too narrow',
      question:
        'A search window of fewer than 5 years may miss important clinical evidence. Is this sufficient?',
      check(answers): WarGameFinding | null {
        const range = answers.search_date_range;
        if (typeof range === 'string' && range.trim().length > 0) {
          const years = range.match(/\d{4}/g);
          if (years && years.length >= 2) {
            const span = parseInt(years[years.length - 1], 10) - parseInt(years[0], 10);
            if (span < 5) {
              return {
                id: 'cer_010',
                dimension: 'scientific_rigor',
                severity: 'warning',
                title: 'Literature search date range too narrow',
                question:
                  'A search window of fewer than 5 years may miss important clinical evidence. Is this sufficient?',
                observation: `The search date range spans approximately ${span} years, which may be insufficient.`,
                requirement:
                  'The literature search should cover a sufficient time period to capture all relevant clinical evidence, typically at least 5-10 years.',
                reference: 'MEDDEV 2.7/1 Section 8.2',
                recommendation:
                  'Expand the search date range to at least 5-10 years, or provide justification for the narrower range based on the technology lifecycle or recent market introduction.',
                relatedFields: [
                  'search_date_range',
                  'literature_search_strategy',
                ],
              };
            }
          }
        }
        return null;
      },
    },
    {
      id: 'cer_011',
      dimension: 'consistency',
      title: 'Very few articles appraised relative to articles identified',
      question:
        'A very low appraisal rate suggests overly aggressive exclusion. Can you justify why fewer than 10% of identified articles were appraised?',
      check(answers): WarGameFinding | null {
        const total = Number(answers.total_articles_identified);
        const appraised = Number(answers.articles_appraised);
        if (
          total > 0 &&
          appraised > 0 &&
          appraised / total < 0.1
        ) {
          return {
            id: 'cer_011',
            dimension: 'consistency',
            severity: 'warning',
            title:
              'Very few articles appraised relative to articles identified',
            question:
              'A very low appraisal rate suggests overly aggressive exclusion. Can you justify why fewer than 10% of identified articles were appraised?',
            observation: `Only ${appraised} of ${total} identified articles (${Math.round((appraised / total) * 100)}%) were appraised, suggesting potentially aggressive exclusion.`,
            requirement:
              'The selection and exclusion process must be transparent, justified, and not biased toward favorable outcomes.',
            reference: 'MEDDEV 2.7/1 Section 9',
            recommendation:
              'Review the exclusion rationale and ensure it is documented and justified. If the rate is appropriate, provide a clear PRISMA-style flow diagram showing the screening and exclusion process.',
            relatedFields: [
              'articles_appraised',
              'total_articles_identified',
              'inclusion_exclusion_criteria',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'cer_012',
      dimension: 'documentation',
      title: 'No appraisal methodology defined',
      question:
        'Without a defined appraisal methodology, how can the quality and relevance of the appraised literature be evaluated?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.appraisal_methodology)) {
          return {
            id: 'cer_012',
            dimension: 'documentation',
            severity: 'warning',
            title: 'No appraisal methodology defined',
            question:
              'Without a defined appraisal methodology, how can the quality and relevance of the appraised literature be evaluated?',
            observation:
              'No literature appraisal methodology has been defined.',
            requirement:
              'A defined appraisal methodology is required to systematically assess the methodological quality, relevance, and contribution of each appraised article.',
            reference: 'MEDDEV 2.7/1 Section 9.1',
            recommendation:
              'Define and document the appraisal methodology, including quality scoring criteria, relevance assessment, and weighting of evidence. Consider using validated tools such as the Oxford CEBM levels of evidence.',
            relatedFields: [
              'appraisal_methodology',
              'articles_appraised',
              'clinical_data_summary',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'cer_013',
      dimension: 'completeness',
      title: 'No total articles count',
      question:
        'Without reporting the total number of articles identified, the comprehensiveness of the search cannot be assessed.',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.total_articles_identified)) {
          return {
            id: 'cer_013',
            dimension: 'completeness',
            severity: 'info',
            title: 'No total articles count',
            question:
              'Without reporting the total number of articles identified, the comprehensiveness of the search cannot be assessed.',
            observation:
              'The total number of articles identified in the literature search has not been reported.',
            requirement:
              'The literature search results must include the total number of articles identified at each stage of the screening process.',
            reference: 'MEDDEV 2.7/1 Appendix',
            recommendation:
              'Document the total number of articles identified by each database, after deduplication, and at each stage of screening. Present using a PRISMA flow diagram.',
            relatedFields: [
              'total_articles_identified',
              'articles_appraised',
              'literature_search_strategy',
            ],
          };
        }
        return null;
      },
    },

    /* ── Clinical Data & GSPR (14-20) ──────────────────────────── */
    {
      id: 'cer_014',
      dimension: 'completeness',
      title: 'Clinical data summary missing',
      question:
        'Without a clinical data summary, how can the CER draw conclusions about the safety and performance of the device?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.clinical_data_summary)) {
          return {
            id: 'cer_014',
            dimension: 'completeness',
            severity: 'critical',
            title: 'Clinical data summary missing',
            question:
              'Without a clinical data summary, how can the CER draw conclusions about the safety and performance of the device?',
            observation:
              'No clinical data summary has been provided.',
            requirement:
              'The CER must include a comprehensive summary of all clinical data, including data from the subject device, equivalent devices, and the literature.',
            reference: 'MEDDEV 2.7/1 Section 10',
            recommendation:
              'Provide a clinical data summary that synthesizes findings from all data sources, evaluates the totality of evidence, and draws conclusions about safety and performance.',
            relatedFields: [
              'clinical_data_summary',
              'articles_appraised',
              'benefit_risk_determination',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'cer_015',
      dimension: 'regulatory_alignment',
      title: 'GSPR list not defined',
      question:
        'Without a GSPR list, how can the CER demonstrate that all applicable general safety and performance requirements have been addressed?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.gspr_list)) {
          return {
            id: 'cer_015',
            dimension: 'regulatory_alignment',
            severity: 'critical',
            title: 'GSPR list not defined',
            question:
              'Without a GSPR list, how can the CER demonstrate that all applicable general safety and performance requirements have been addressed?',
            observation:
              'No GSPR (General Safety and Performance Requirements) list has been defined.',
            requirement:
              'The CER must identify all applicable GSPRs from EU MDR Annex I and demonstrate conformity with each.',
            reference: 'EU MDR Annex I',
            recommendation:
              'Create a GSPR checklist identifying all applicable requirements from EU MDR Annex I, and for each requirement specify how conformity is demonstrated (by clinical evidence, testing, standards, etc.).',
            relatedFields: [
              'gspr_list',
              'gspr_clinical_evidence_mapping',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'cer_016',
      dimension: 'regulatory_alignment',
      title: 'GSPR not mapped to clinical evidence',
      question:
        'The GSPRs that require clinical evidence have not been mapped. How will you demonstrate that clinical evidence supports each applicable requirement?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.gspr_clinical_evidence_mapping)) {
          return {
            id: 'cer_016',
            dimension: 'regulatory_alignment',
            severity: 'critical',
            title: 'GSPR not mapped to clinical evidence',
            question:
              'The GSPRs that require clinical evidence have not been mapped. How will you demonstrate that clinical evidence supports each applicable requirement?',
            observation:
              'GSPRs have not been mapped to the clinical evidence that supports conformity.',
            requirement:
              'Each GSPR that requires clinical evidence must be mapped to the specific clinical data that demonstrates conformity.',
            reference: 'EU MDR Article 61(1)',
            recommendation:
              'Create a mapping table linking each clinically relevant GSPR to the specific clinical evidence (literature, clinical investigation, PMS data) that demonstrates conformity.',
            relatedFields: [
              'gspr_clinical_evidence_mapping',
              'gspr_list',
              'clinical_data_summary',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'cer_017',
      dimension: 'scientific_rigor',
      title: 'Benefit-risk determination missing',
      question:
        'The CER must conclude with a benefit-risk determination. Without it, how can the overall acceptability of the device be assessed?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.benefit_risk_determination)) {
          return {
            id: 'cer_017',
            dimension: 'scientific_rigor',
            severity: 'critical',
            title: 'Benefit-risk determination missing',
            question:
              'The CER must conclude with a benefit-risk determination. Without it, how can the overall acceptability of the device be assessed?',
            observation:
              'No benefit-risk determination has been provided.',
            requirement:
              'The CER must include a benefit-risk determination that weighs the clinical benefits against the residual risks in the context of the state of the art.',
            reference: 'EU MDR Annex I Section 1, MEDDEV 2.7/1 Section 11',
            recommendation:
              'Provide a structured benefit-risk analysis that identifies and quantifies benefits, identifies and characterizes risks, compares against the state of the art, and reaches a clear conclusion on acceptability.',
            relatedFields: [
              'benefit_risk_determination',
              'residual_risk_acceptability',
              'state_of_the_art_analysis',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'cer_018',
      dimension: 'risk_identification',
      title: 'Residual risk acceptability not addressed',
      question:
        'Have residual risks been evaluated against the benefit-risk criteria? The acceptability of residual risks must be explicitly stated.',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.residual_risk_acceptability)) {
          return {
            id: 'cer_018',
            dimension: 'risk_identification',
            severity: 'warning',
            title: 'Residual risk acceptability not addressed',
            question:
              'Have residual risks been evaluated against the benefit-risk criteria? The acceptability of residual risks must be explicitly stated.',
            observation:
              'The acceptability of residual risks has not been addressed.',
            requirement:
              'Residual risks must be evaluated against defined acceptability criteria and their acceptability explicitly documented.',
            reference: 'ISO 14971, EU MDR Annex I',
            recommendation:
              'Document the evaluation of each residual risk against the acceptability criteria defined in the risk management plan, and provide an explicit statement of overall residual risk acceptability.',
            relatedFields: [
              'residual_risk_acceptability',
              'benefit_risk_determination',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'cer_019',
      dimension: 'completeness',
      title: 'No intended purpose stated',
      question:
        'The intended purpose is fundamental to the CER scope. How can the evaluation proceed without it?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.intended_purpose)) {
          return {
            id: 'cer_019',
            dimension: 'completeness',
            severity: 'critical',
            title: 'No intended purpose stated',
            question:
              'The intended purpose is fundamental to the CER scope. How can the evaluation proceed without it?',
            observation:
              'No intended purpose has been stated for the device.',
            requirement:
              'The intended purpose must be clearly defined as it determines the scope of the clinical evaluation and the applicable GSPRs.',
            reference: 'EU MDR Article 2(12)',
            recommendation:
              'Define the intended purpose clearly, including the medical condition, target patient population, intended user, clinical benefit, and use environment.',
            relatedFields: [
              'intended_purpose',
              'device_description',
              'indications_for_use',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'cer_020',
      dimension: 'documentation',
      title: 'No UDI-DI assigned',
      question:
        'Has a UDI-DI been assigned to the device? This is a regulatory requirement under EU MDR.',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.udi_di)) {
          return {
            id: 'cer_020',
            dimension: 'documentation',
            severity: 'warning',
            title: 'No UDI-DI assigned',
            question:
              'Has a UDI-DI been assigned to the device? This is a regulatory requirement under EU MDR.',
            observation:
              'No UDI-DI (Unique Device Identifier - Device Identifier) has been assigned.',
            requirement:
              'EU MDR requires all devices to have a UDI-DI assigned by an authorized issuing entity and registered in EUDAMED.',
            reference: 'EU MDR Article 27',
            recommendation:
              'Obtain a UDI-DI from an authorized issuing entity (GS1, HIBCC, ICCBBA, or IFA) and ensure it is included in EUDAMED registration.',
            relatedFields: ['udi_di', 'device_name'],
          };
        }
        return null;
      },
    },

    /* ── PMCF Planning (21-25) ─────────────────────────────────── */
    {
      id: 'cer_021',
      dimension: 'regulatory_alignment',
      title: 'No PMCF plan',
      question:
        'EU MDR requires a Post-Market Clinical Follow-up plan for all devices. Where is the PMCF plan?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.pmcf_plan)) {
          return {
            id: 'cer_021',
            dimension: 'regulatory_alignment',
            severity: 'critical',
            title: 'No PMCF plan',
            question:
              'EU MDR requires a Post-Market Clinical Follow-up plan for all devices. Where is the PMCF plan?',
            observation:
              'No Post-Market Clinical Follow-up (PMCF) plan has been provided.',
            requirement:
              'EU MDR requires a PMCF plan for all devices. The plan must be part of the clinical evaluation and PMS system.',
            reference: 'EU MDR Article 61(11), Annex XIV Part B',
            recommendation:
              'Develop a PMCF plan that specifies the objectives, methods (studies, registries, surveys), endpoints, timelines, and how results will feed back into the CER and risk management.',
            relatedFields: [
              'pmcf_plan',
              'pmcf_study_types',
              'pmcf_endpoints',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'cer_022',
      dimension: 'completeness',
      title: 'PMCF study types not defined',
      question:
        'What types of PMCF activities are planned? Without defined study types, the PMCF plan lacks specificity.',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.pmcf_study_types)) {
          return {
            id: 'cer_022',
            dimension: 'completeness',
            severity: 'warning',
            title: 'PMCF study types not defined',
            question:
              'What types of PMCF activities are planned? Without defined study types, the PMCF plan lacks specificity.',
            observation:
              'The types of PMCF studies or activities have not been specified.',
            requirement:
              'The PMCF plan must specify the types of activities planned, such as clinical investigations, registries, surveys, or literature reviews.',
            reference: 'MEDDEV 2.12/2 Rev 2',
            recommendation:
              'Define the PMCF study types (e.g., PMCF study per Article 74, registry, structured literature review, complaint analysis, survey) and justify the selection based on identified gaps in clinical evidence.',
            relatedFields: [
              'pmcf_study_types',
              'pmcf_plan',
              'pmcf_endpoints',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'cer_023',
      dimension: 'scientific_rigor',
      title: 'PMCF endpoints not defined',
      question:
        'Without defined endpoints, how will PMCF activities generate meaningful data to update the clinical evaluation?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.pmcf_endpoints)) {
          return {
            id: 'cer_023',
            dimension: 'scientific_rigor',
            severity: 'warning',
            title: 'PMCF endpoints not defined',
            question:
              'Without defined endpoints, how will PMCF activities generate meaningful data to update the clinical evaluation?',
            observation:
              'No PMCF endpoints have been defined.',
            requirement:
              'PMCF endpoints must be clearly defined to ensure the post-market activities generate actionable data.',
            reference: 'EU MDR Annex XIV Part B',
            recommendation:
              'Define specific, measurable PMCF endpoints including safety endpoints (adverse events, complications), performance endpoints (clinical outcomes, device reliability), and any endpoints addressing residual uncertainties identified in the CER.',
            relatedFields: [
              'pmcf_endpoints',
              'pmcf_plan',
              'pmcf_study_types',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'cer_024',
      dimension: 'consistency',
      title: 'No update frequency for CER',
      question:
        'EU MDR requires at least annual CER updates for Class III and implantable devices. Has the update frequency been defined?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.update_frequency)) {
          return {
            id: 'cer_024',
            dimension: 'consistency',
            severity: 'warning',
            title: 'No update frequency for CER',
            question:
              'EU MDR requires at least annual CER updates for Class III and implantable devices. Has the update frequency been defined?',
            observation:
              'The CER update frequency has not been defined.',
            requirement:
              'EU MDR requires the CER to be updated regularly. Class III and implantable devices require at least annual updates; other devices at least every 2-5 years.',
            reference: 'EU MDR Article 61(11)',
            recommendation:
              'Define the CER update frequency based on the device classification: at least annually for Class III and implantable devices, and at an appropriate interval for other device classes. Document triggers for ad-hoc updates.',
            relatedFields: [
              'update_frequency',
              'device_classification',
              'pmcf_plan',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'cer_025',
      dimension: 'documentation',
      title: 'No reference to previous CER',
      question:
        'Is this the first CER for this device? If not, where is the reference to the previous version and a summary of changes?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.previous_cer_reference)) {
          return {
            id: 'cer_025',
            dimension: 'documentation',
            severity: 'info',
            title: 'No reference to previous CER',
            question:
              'Is this the first CER for this device? If not, where is the reference to the previous version and a summary of changes?',
            observation:
              'No reference to a previous CER has been provided.',
            requirement:
              'If the device has been on the market, the CER should reference prior versions and summarize changes, new data, and conclusions since the last evaluation.',
            reference: 'MEDDEV 2.7/1 Section 6',
            recommendation:
              'If this is an update, reference the previous CER version and provide a summary of new clinical data, changes in the state of the art, and any updated conclusions. If this is the first CER, explicitly state so.',
            relatedFields: [
              'previous_cer_reference',
              'update_frequency',
            ],
          };
        }
        return null;
      },
    },

    /* ── Evaluator & Documentation (26-30) ─────────────────────── */
    {
      id: 'cer_026',
      dimension: 'regulatory_alignment',
      title: 'Evaluator qualifications not specified',
      question:
        'EU MDR requires CER evaluators to have documented qualifications. Who performed this evaluation and what are their qualifications?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.evaluator_qualifications)) {
          return {
            id: 'cer_026',
            dimension: 'regulatory_alignment',
            severity: 'critical',
            title: 'Evaluator qualifications not specified',
            question:
              'EU MDR requires CER evaluators to have documented qualifications. Who performed this evaluation and what are their qualifications?',
            observation:
              'The CER evaluator qualifications have not been specified.',
            requirement:
              'The CER evaluator must have documented qualifications including relevant medical/scientific degree and at least 5 years of professional experience in the relevant device field.',
            reference: 'EU MDR Article 61(3), MEDDEV 2.7/1 Section 6.4',
            recommendation:
              'Document the evaluator qualifications including education, professional experience, publications, and specific expertise relevant to the device under evaluation. Attach the evaluator CV.',
            relatedFields: [
              'evaluator_qualifications',
              'evaluator_name',
              'evaluator_cv_available',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'cer_027',
      dimension: 'documentation',
      title: 'Evaluator CV not available',
      question:
        'The evaluator CV is required to verify qualifications. Is it available for Notified Body review?',
      check(answers): WarGameFinding | null {
        if (!answers.evaluator_cv_available) {
          return {
            id: 'cer_027',
            dimension: 'documentation',
            severity: 'warning',
            title: 'Evaluator CV not available',
            question:
              'The evaluator CV is required to verify qualifications. Is it available for Notified Body review?',
            observation:
              'The evaluator CV has not been made available.',
            requirement:
              'The evaluator CV must be available as part of the technical documentation for Notified Body review.',
            reference: 'EU MDR Article 61(3)',
            recommendation:
              'Ensure the evaluator CV is included in or referenced from the CER, documenting relevant education, training, professional experience, and publications.',
            relatedFields: [
              'evaluator_cv_available',
              'evaluator_name',
              'evaluator_qualifications',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'cer_028',
      dimension: 'completeness',
      title: 'Manufacturer name missing',
      question:
        'The manufacturer name is a fundamental element of the technical documentation. Why is it missing?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.manufacturer_name)) {
          return {
            id: 'cer_028',
            dimension: 'completeness',
            severity: 'warning',
            title: 'Manufacturer name missing',
            question:
              'The manufacturer name is a fundamental element of the technical documentation. Why is it missing?',
            observation:
              'The manufacturer name has not been specified.',
            requirement:
              'The technical documentation, including the CER, must identify the legal manufacturer.',
            reference: 'EU MDR Annex II',
            recommendation:
              'Include the full legal manufacturer name, address, and Single Registration Number (SRN) if available.',
            relatedFields: ['manufacturer_name', 'device_name'],
          };
        }
        return null;
      },
    },
    {
      id: 'cer_029',
      dimension: 'regulatory_alignment',
      title: 'Notified Body not identified',
      question:
        'For Class IIa and above devices, a Notified Body must be involved. Has the Notified Body been identified?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.notified_body)) {
          return {
            id: 'cer_029',
            dimension: 'regulatory_alignment',
            severity: 'warning',
            title: 'Notified Body not identified',
            question:
              'For Class IIa and above devices, a Notified Body must be involved. Has the Notified Body been identified?',
            observation:
              'No Notified Body has been identified.',
            requirement:
              'Devices classified as Class IIa, IIb, or III under EU MDR require conformity assessment by a designated Notified Body.',
            reference: 'EU MDR Article 52',
            recommendation:
              'Identify the Notified Body, including their name and EU identification number. If the device is Class I, confirm that no Notified Body involvement is required.',
            relatedFields: [
              'notified_body',
              'device_classification',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'cer_030',
      dimension: 'regulatory_alignment',
      title: 'Device classification not specified',
      question:
        'Without a device classification, the applicable regulatory requirements cannot be determined. What is the device classification?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.device_classification)) {
          return {
            id: 'cer_030',
            dimension: 'regulatory_alignment',
            severity: 'critical',
            title: 'Device classification not specified',
            question:
              'Without a device classification, the applicable regulatory requirements cannot be determined. What is the device classification?',
            observation:
              'The device classification under EU MDR has not been specified.',
            requirement:
              'The device must be classified according to EU MDR Annex VIII classification rules to determine the applicable conformity assessment route.',
            reference: 'EU MDR Article 51, Annex VIII',
            recommendation:
              'Classify the device according to EU MDR Annex VIII classification rules and document the applicable rule(s), resulting classification (I, IIa, IIb, III), and rationale.',
            relatedFields: [
              'device_classification',
              'notified_body',
              'intended_purpose',
            ],
          };
        }
        return null;
      },
    },
  ];
}

/* ------------------------------------------------------------------ */
/*  Factory                                                           */
/* ------------------------------------------------------------------ */

export function createCerAuditor(): WarGameAuditor {
  return {
    category: 'cer',
    name: 'Clinical Evaluation Report Auditor',
    description:
      'Simulates Notified Body and EU MDR reviewer scrutiny of a Clinical Evaluation Report, examining equivalence assessment, literature search methodology, clinical data analysis, GSPR mapping, PMCF planning, and evaluator qualifications per EU MDR and MEDDEV 2.7/1 Rev 4.',
    rules: buildRules(),
  };
}
