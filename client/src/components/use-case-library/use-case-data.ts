import { UseCase } from './UseCaseLibrary';

export const useCaseData: UseCase[] = [
  {
    id: 'deep-csr-intelligence',
    title: 'Deep CSR Intelligence for Protocol Design',
    audience: 'Biotech Leaders & Clinical Strategic Teams',
    challenge:
      'Your team needs to design an optimal protocol for a new therapeutic in a competitive indication. You need to leverage global CSR data to inform study design decisions and maximize success probability.',
    background:
      'CSRs contain rich historical data on study design, endpoints, outcomes, and regulatory success. Analyzing patterns across large CSR databases can provide unprecedented strategic insights.',
    traditionalApproach: {
      cost: '$120,000',
      timeline: '12 weeks',
      challenges:
        'Limited access to global CSR data, inability to process thousands of documents, subjective analysis methods',
    },
    trialSageSolution: {
      modules: [
        'Global CSR Analysis Engine',
        'Deep Intelligence Protocol Designer',
        'Multi-parameter Success Modeling',
        'Competitive Intelligence Scanner',
        'Strategic Protocol Optimizer',
      ],
      inputs: {
        indication: 'Any indication',
        phase: 'All phases',
        sampleSize: 0, // Dynamic
        duration: 'Variable',
        primaryEndpoint: 'Multiple endpoint analysis',
      },
      outcomes: {
        timeSaved: '10 weeks',
        costAvoided: '$95,000',
        regulatoryAlignment: '98% alignment with successful historical protocols',
        riskMitigation: '85% increase in protocol design confidence based on > 2,500 CSRs',
      },
    },
    deliverables: [
      'Deep CSR analysis report across your indication',
      'Parameter-by-parameter design recommendations',
      'Competitive intelligence summary',
      'Strategic protocol template with evidence-based design choices',
      'Regulatory submission strategy based on successful precedents',
    ],
    interactiveDemo: {
      sampleChartData: {},
      sampleProtocolSection:
        '// Endpoint Selection Based on CSR Intelligence\nOur analysis of 2,479 Health Canada CSRs and 70 ClinicalTrials.gov studies revealed that for Phase 2 trials in this indication, the most successful primary endpoints combined both [biomarker change] and [functional improvement]. Based on CSR pattern recognition, we recommend a dual primary endpoint approach with:\n\n1. Reduction in [biomarker X] of ≥30% from baseline at Week 12\n2. Improvement in [functional measure Y] of ≥2 points on the validated scale\n\nThis approach aligns with 87% of successfully approved products in this therapeutic area over the past decade.',
    },
  },
  {
    id: 'first-in-human',
    title: 'First-In-Human IND Readiness',
    audience: 'Biotech Founders & Clinical VP',
    challenge:
      'Your team is preparing a Phase 1 protocol with a novel antibody therapy. FDA precedent is limited. Investors are skeptical. You need to prove this design works.',
    background:
      'Phase 1 trials are critical for establishing safety profiles. The FDA has increasingly focused on robust protocol design even at this early stage.',
    traditionalApproach: {
      cost: '$35,000',
      timeline: '6 weeks',
      challenges: 'Limited precedent data, high risk of FDA protocol hold, investor skepticism',
    },
    trialSageSolution: {
      modules: [
        'CSR Benchmarking',
        'Risk Predictor',
        'SAP Generator',
        'Dossier Builder',
        'Regulatory Alignment Checker',
      ],
      inputs: {
        indication: 'Autoimmune',
        phase: 'Phase 1',
        sampleSize: 45,
        duration: '6 weeks',
        primaryEndpoint: 'Dose safety + PK',
      },
      outcomes: {
        timeSaved: '5 weeks',
        costAvoided: '$38,000',
        regulatoryAlignment: 'Supports capitalization of protocol development costs',
        riskMitigation: 'Reduces likelihood of FDA protocol hold by 32%',
      },
    },
    deliverables: [
      'Comprehensive protocol design report',
      'Statistical Analysis Plan (SAP)',
      'CSR match table with 23 similar trials',
      'AI-based recommendation matrix',
      'Success probability scorecard',
    ],
    interactiveDemo: {
      sampleProtocolSection:
        '// Primary Endpoint Definition\nThe primary endpoint of this Phase 1 study will be the incidence of treatment-emergent adverse events (TEAEs) as a measure of safety and tolerability of escalating doses of LMN-0801.\n\n// Dose Escalation Schedule\nThe study will follow a modified 3+3 design with four planned dose cohorts (10, 30, 100, and 300 mg). Dose escalation decisions will be made after all subjects in a cohort have completed the Day 14 assessments.',
    },
  },
  {
    id: 'novel-endpoint',
    title: 'Novel Endpoint Validation',
    audience: 'CRO Scientific Director & Biotech CSO',
    challenge:
      'Your Phase 2 obesity trial proposes a novel composite endpoint combining weight loss and metabolic markers. Regulators have never approved a drug based on this exact endpoint.',
    background:
      'Novel endpoints require substantial justification. Historical precedents with similar designs can strengthen your regulatory case.',
    traditionalApproach: {
      cost: '$58,000',
      timeline: '8 weeks',
      challenges:
        'Uncertain regulatory acceptance, low historical success rates, potential for late-stage redesign',
    },
    trialSageSolution: {
      modules: [
        'CSR Endpoint Analysis',
        'Protocol Optimizer',
        'Success Predictor',
        'Regulatory Precedent Matcher',
        'Dossier Export',
      ],
      inputs: {
        indication: 'Obesity',
        phase: 'Phase 2',
        sampleSize: 120,
        duration: '26 weeks',
        primaryEndpoint: 'Composite: ≥5% weight loss + HbA1c reduction',
      },
      outcomes: {
        timeSaved: '6 weeks',
        costAvoided: '$42,000',
        regulatoryAlignment: '87% precedent match with previously approved endpoints',
        riskMitigation: 'Historical success pattern identified from 176 obesity trials',
      },
    },
    deliverables: [
      'Endpoint validation report with statistical power analysis',
      'Composite endpoint selection justification document',
      'Regulatory precedent analysis from 176 similar trials',
      'Statistical Analysis Plan with composite endpoint calculations',
      'Protocol optimization report',
    ],
  },
  {
    id: 'regulatory-submission',
    title: 'Regulatory Submission Strategy',
    audience: 'Regulatory Affairs Team & CMO',
    challenge:
      'Your Phase 3 protocol for a breakthrough oncology drug needs to align with both FDA and EMA standards. Previous submissions had conflicting feedback.',
    background:
      'Harmonizing protocols for multiple regulatory agencies is complex but essential for global development strategies.',
    traditionalApproach: {
      cost: '$85,000',
      timeline: '12 weeks',
      challenges:
        'Conflicting regulatory feedback, different regional standards, high revision risk',
    },
    trialSageSolution: {
      modules: [
        'Regulatory Intelligence Engine',
        'Multi-region Protocol Optimizer',
        'CSR Benchmarking',
        'Strategic Protocol Builder',
        'Submission Package Generator',
      ],
      inputs: {
        indication: 'Breast Cancer',
        phase: 'Phase 3',
        sampleSize: 440,
        duration: '36 months',
        primaryEndpoint: 'Progression-free survival (PFS)',
      },
      outcomes: {
        timeSaved: '8 weeks',
        costAvoided: '$67,000',
        regulatoryAlignment: 'Dual-aligned protocol meeting FDA and EMA requirements',
        riskMitigation: '91% reduction in cross-regional protocol inconsistencies',
      },
    },
    deliverables: [
      'FDA/EMA alignment report',
      'Regulatory precedent analysis from 93 approved oncology protocols',
      'Region-specific protocol adaptations',
      'Pre-submission strategy document',
      'Regulatory feedback anticipation guide',
    ],
  },
  {
    id: 'portfolio-optimization',
    title: 'Clinical Portfolio Optimization',
    audience: 'VC Due Diligence Team & Biotech CEO',
    challenge:
      "You're evaluating a biotech with 5 early-stage assets for potential investment. You need to assess which programs have the highest probability of success.",
    background:
      'Portfolio decisions dramatically impact company valuation and funding requirements. Evidence-based selection is critical.',
    traditionalApproach: {
      cost: '$125,000',
      timeline: '4-6 weeks',
      challenges: 'Subjective assessments, inconsistent methodology, limited historical data',
    },
    trialSageSolution: {
      modules: [
        'Portfolio Risk Analyzer',
        'Success Prediction Engine',
        'Comparative Protocol Assessment',
        'Investment Risk Model',
        'Strategic Pipeline Optimizer',
      ],
      inputs: {
        indication: 'Multiple (CNS, Metabolic, Oncology)',
        phase: 'Preclinical to Phase 2',
        sampleSize: 0, // N/A represented as 0
        duration: '10-year development window',
        primaryEndpoint: 'ROI and success probability',
      },
      outcomes: {
        timeSaved: '3 weeks',
        costAvoided: '$92,000',
        regulatoryAlignment: 'Program-specific regulatory risk identification',
        riskMitigation: 'Quantitative success probability metrics across all assets',
      },
    },
    deliverables: [
      'Portfolio risk assessment dashboard',
      'Asset-by-asset success probability report',
      'Protocol design recommendations for top candidates',
      'Competitive landscape analysis',
      'Development timeline optimization strategy',
    ],
    interactiveDemo: {
      sampleChartData: {},
    },
  },
  {
    id: 'pediatric-extension',
    title: 'Pediatric Study Design',
    audience: 'Clinical Development Team & Medical Director',
    challenge:
      'Your successful adult drug needs a pediatric extension study. You need to design an age-appropriate protocol that will satisfy regulatory requirements while ensuring patient safety.',
    background:
      'Pediatric studies have unique ethical and scientific considerations. Historical precedents are essential for designing approvable protocols.',
    traditionalApproach: {
      cost: '$72,000',
      timeline: '10 weeks',
      challenges:
        'Limited pediatric precedents, complex ethical considerations, stringent regulatory oversight',
    },
    trialSageSolution: {
      modules: [
        'Pediatric Protocol Builder',
        'Ethical Design Analyzer',
        'Age-Appropriate Endpoint Selector',
        'Dosing Calculator',
        'Regulatory Submission Assistant',
      ],
      inputs: {
        indication: 'Pediatric Asthma',
        phase: 'Phase 2/3',
        sampleSize: 160,
        duration: '24 weeks',
        primaryEndpoint: 'FEV1 improvement with age-stratified analysis',
      },
      outcomes: {
        timeSaved: '7 weeks',
        costAvoided: '$48,000',
        regulatoryAlignment: '95% alignment with FDA pediatric study requirements',
        riskMitigation: 'Ethically optimized design based on 42 successful pediatric protocols',
      },
    },
    deliverables: [
      'Age-appropriate protocol design',
      'Ethical considerations documentation',
      'Pediatric dosing justification',
      'Parent/guardian consent materials',
      'Regulatory strategy for pediatric exclusivity',
    ],
  },
];
