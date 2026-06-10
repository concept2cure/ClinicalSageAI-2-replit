/**
 * AI/ML governance corpus for diagnostics.
 *
 * Deep, citable entries on the regulation of AI/ML-enabled IVDs and diagnostic
 * software: the EU AI Act and its interplay with IVDR, FDA's AI/ML device
 * framework (Good Machine Learning Practice, PCCP, transparency, lifecycle
 * management), bias/equity expectations, and generative-AI considerations.
 */

import type { KnowledgeEntry } from '../types';

export const AI_GOVERNANCE_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: 'ai.eu-ai-act',
    domain: 'regulatory',
    topic: 'ai-governance',
    title: 'EU AI Act — high-risk classification of medical-device/IVD AI and IVDR interplay',
    jurisdictions: ['EU'],
    appliesTo: ['samd', 'ivd', 'cdx'],
    summary:
      'Regulation (EU) 2024/1689 (AI Act) classifies AI that is, or is a safety component of, an IVDR/MDR device requiring third-party conformity assessment as "high-risk," layering AI-specific obligations (risk management, data governance, transparency, human oversight, robustness) on top of IVDR — assessed, where possible, through the existing notified-body route.',
    detail:
      'The EU AI Act (Regulation (EU) 2024/1689) entered into force in 2024 with staggered application (prohibitions from early 2025; high-risk obligations phasing in through 2026–2027). Under Article 6(1) and Annex I, an AI system that is itself a device — or a safety component of a device — covered by EU harmonisation legislation such as the IVDR, and that requires third-party conformity assessment under that legislation, is classified high-risk. Because most AI-enabled IVDs are Class B/C/D (notified-body involved), they are high-risk AI systems. High-risk obligations (Chapter III) include: a risk-management system, data and data-governance requirements (training/validation/test data quality, bias examination), technical documentation, record-keeping/logging, transparency and provision of information to users, human oversight, and accuracy/robustness/cybersecurity. The Act seeks to integrate these into the existing IVDR conformity assessment (the notified body assessing AI Act requirements alongside IVDR where designated), avoiding a fully parallel process, and aligns documentation so a single technical file can address both. Manufacturers of AI-enabled IVDs must therefore extend their IVDR technical documentation and QMS to cover the AI Act high-risk requirements.',
    keyPoints: [
      'AI Act = Regulation (EU) 2024/1689; staggered application (prohibitions 2025; high-risk 2026–2027).',
      'AI that is, or is a safety component of, an IVDR device needing a notified body ⇒ high-risk.',
      'Adds data governance, transparency, human oversight, robustness, logging on top of IVDR.',
      'Designed to be assessed through the existing IVDR notified-body route where possible.',
    ],
    pitfalls: [
      'Treating the AI Act as separate from IVDR rather than an added layer on the same technical file.',
      'Under-documenting training/validation data governance and bias examination.',
    ],
    citations: [
      { label: 'Regulation (EU) 2024/1689 (AI Act), Art. 6 & Annex I', source: 'EU', url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689' },
      { label: 'AI Act Chapter III (high-risk obligations)', source: 'EU' },
    ],
    related: ['eu.ivdr.conformity-routes', 'mdcg.2019-11-software', 'ai.fda-aiml', 'std.iec-62304'],
    tags: ['ai-act', 'eu', 'high-risk', 'samd', 'data-governance', 'human-oversight'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'ai.fda-aiml',
    domain: 'regulatory',
    topic: 'ai-governance',
    title: 'FDA AI/ML device framework — lifecycle, PCCP, and transparency',
    jurisdictions: ['US'],
    appliesTo: ['samd', 'ivd', 'cdx'],
    summary:
      'FDA regulates AI/ML-enabled diagnostics as devices through the existing pathways, augmented by a total-product-lifecycle approach, the Predetermined Change Control Plan (PCCP) for authorized iterative updates, and 2024–2025 guidance on AI lifecycle management and transparency.',
    detail:
      'FDA does not have a separate AI statute; AI/ML-enabled diagnostics are cleared/authorized via 510(k), De Novo, or PMA. Its approach centers on the total product lifecycle: the 2021 AI/ML SaMD Action Plan, the Predetermined Change Control Plan (PCCP) authority (FD&C Act §515C, FDORA 2022) and 2024 final PCCP guidance enabling pre-authorized model updates within a defined Modification Protocol, the 2025 draft guidance on lifecycle management and marketing submissions for AI-enabled device software functions, and transparency expectations (model description, inputs/outputs, performance by subgroup, intended use and limitations in labeling). FDA maintains a public list of AI/ML-enabled devices. For diagnostics specifically, expectations include locked-vs-adaptive algorithm clarity, training/test data representativeness, performance monitoring, and a plan for real-world performance and drift management.',
    keyPoints: [
      'No separate AI law — cleared via 510(k)/De Novo/PMA with a lifecycle lens.',
      'PCCP (§515C) authorizes pre-specified model updates without a new submission.',
      '2025 draft guidance: AI lifecycle management + marketing-submission content.',
      'Transparency: model description, subgroup performance, limitations in labeling.',
    ],
    citations: [
      { label: 'FDA AI/ML-Based SaMD Action Plan (2021)', source: 'FDA' },
      { label: 'FDA PCCP final guidance (2024); FD&C Act §515C', source: 'FDA' },
      { label: 'FDA draft guidance: AI-Enabled Device Software Functions — Lifecycle & Marketing Submissions (2025)', source: 'FDA' },
    ],
    related: ['fda.ivd.expedited-programs', 'ai.gmlp', 'ai.eu-ai-act', 'std.iec-62304'],
    tags: ['fda', 'ai-ml', 'pccp', 'lifecycle', 'transparency', 'samd'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'ai.gmlp',
    domain: 'regulatory',
    topic: 'ai-governance',
    title: 'Good Machine Learning Practice (GMLP) — guiding principles',
    jurisdictions: ['US', 'UK', 'CA', 'global'],
    appliesTo: ['samd', 'ivd', 'cdx'],
    summary:
      'The 10 GMLP guiding principles (FDA, Health Canada, MHRA) frame development of safe, effective ML-enabled devices — multidisciplinary expertise, good software/data practices, representative datasets, independence of training/test sets, human-factors, and ongoing performance monitoring.',
    detail:
      'Good Machine Learning Practice for Medical Device Development: Guiding Principles, jointly issued by FDA, Health Canada, and the UK MHRA (2021, with subsequent transparency and PCCP companion principles), sets 10 principles: (1) leverage multidisciplinary expertise across the lifecycle; (2) implement good software engineering and security practices; (3) ensure clinical study participants and datasets are representative of the intended population; (4) keep training datasets independent of test sets; (5) use the best available methods for reference datasets (ground truth); (6) tailor the model design to the available data and intended use; (7) focus on the human-AI team performance; (8) test under clinically relevant conditions; (9) provide users clear, essential information; and (10) monitor deployed models for performance and manage re-training risks. These principles are the de-facto baseline regulators expect for AI-enabled diagnostics and map directly onto IVDR/AI Act data-governance and FDA lifecycle expectations.',
    keyPoints: [
      '10 GMLP principles (FDA/Health Canada/MHRA) baseline AI device development.',
      'Representative data; strict training/test independence; quality ground truth.',
      'Human-AI team performance and clinically relevant testing.',
      'Post-deployment monitoring and managed re-training.',
    ],
    citations: [
      { label: 'GMLP Guiding Principles (FDA/Health Canada/MHRA, 2021)', source: 'FDA/HC/MHRA' },
      { label: 'Transparency for ML-enabled devices — guiding principles', source: 'FDA/HC/MHRA' },
    ],
    related: ['ai.fda-aiml', 'ai.eu-ai-act', 'global.ivd.imdrf', 'ai.bias-equity'],
    tags: ['gmlp', 'ai-ml', 'data-governance', 'ground-truth', 'monitoring'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'ai.bias-equity',
    domain: 'regulatory',
    topic: 'ai-governance',
    title: 'Algorithmic bias, equity, and subgroup performance for diagnostic AI',
    jurisdictions: ['US', 'EU', 'global'],
    appliesTo: ['samd', 'ivd', 'cdx'],
    summary:
      'Regulators expect diagnostic AI to be evaluated for performance across demographic subgroups and for bias arising from unrepresentative training data; the EU AI Act mandates bias examination, and FDA/GMLP require representativeness and subgroup reporting.',
    detail:
      'Both frameworks treat fairness/representativeness as a safety-and-effectiveness issue, not just an ethical one. The EU AI Act requires high-risk systems to examine datasets for possible biases and to use data that are relevant, representative, and (to the extent possible) free of errors. FDA/GMLP require datasets representative of the intended population and encourage reporting performance by clinically relevant subgroups (e.g., age, sex, race/ethnicity, comorbidity), and FDA has highlighted the risk of well-documented diagnostic biases (a frequently cited example is pulse-oximetry accuracy differences by skin pigmentation). For an IVD developer, this translates into concrete deliverables: characterise the training/validation/test population, pre-specify subgroup analyses in clinical performance studies, quantify and disclose any performance disparities and their clinical impact, and state limitations in labeling. Unaddressed subgroup underperformance is both a regulatory deficiency and a product-liability and reputational risk.',
    keyPoints: [
      'Fairness/representativeness is treated as a safety/effectiveness issue.',
      'EU AI Act mandates dataset bias examination; FDA/GMLP require representativeness + subgroup reporting.',
      'Pre-specify subgroup analyses; quantify and disclose disparities + clinical impact.',
      'State limitations in labeling; unaddressed bias is a regulatory + liability risk.',
    ],
    citations: [
      { label: 'EU AI Act Art. 10 (data and data governance)', source: 'EU' },
      { label: 'FDA/GMLP representativeness + subgroup performance', source: 'FDA' },
    ],
    related: ['ai.gmlp', 'ai.eu-ai-act', 'sci.ivd.clinical-study-design', 'legal.ivd.product-liability'],
    tags: ['bias', 'equity', 'subgroup', 'fairness', 'data-governance'],
    lastReviewed: '2026-06-09',
  },
];
