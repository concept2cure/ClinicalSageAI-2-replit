/**
 * Health-technology-assessment (HTA) and global market-access corpus.
 *
 * Beyond US reimbursement (legal.ivd.reimbursement): the evidence and processes
 * that determine value-based access in major ex-US systems — the EU Joint HTA
 * Regulation, England's NICE, Germany's G-BA/IQWiG, and the clinical-utility
 * evidence that payers (vs regulators) demand.
 */

import type { KnowledgeEntry } from '../types';

export const HTA_MARKET_ACCESS_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: 'legal.ivd.clinical-utility',
    domain: 'legal',
    topic: 'market-access',
    title: 'Clinical utility — the payer evidence bar beyond regulatory approval',
    jurisdictions: ['US', 'EU', 'global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'Payers and HTA bodies require clinical utility — evidence that using the test changes management and improves outcomes — which is a higher and different bar than the analytical + clinical validity that regulators require for marketing.',
    detail:
      'Regulatory approval establishes analytical validity (does it measure correctly) and clinical validity (does the result correlate with the condition). Coverage and value-based access additionally require clinical utility: evidence that acting on the test result changes clinical decisions and improves net health outcomes (and often cost-effectiveness). The ACCE framework (Analytic validity, Clinical validity, Clinical utility, Ethical/legal/social implications) formalizes this hierarchy. Clinical utility is frequently demonstrated through outcomes studies, randomized "test-and-treat" trials, decision-impact studies, or modeling — evidence types regulators may not require but payers demand. This gap is the single most common reason a cleared/approved IVD fails to achieve reimbursement, and it must be planned into the evidence strategy from the start (often via parallel regulatory + payer evidence generation).',
    keyPoints: [
      'Clinical utility = using the test changes management and improves outcomes.',
      'Higher/different bar than regulatory analytical + clinical validity.',
      'ACCE framework: Analytic validity, Clinical validity, Clinical utility, ELSI.',
      'The utility gap is the top reason approved IVDs fail to get reimbursed.',
    ],
    pitfalls: [
      'Planning only for regulatory evidence and discovering the payer gap post-launch.',
    ],
    citations: [
      { label: 'ACCE evaluation framework (CDC/genomics)', source: 'CDC' },
      { label: 'Payer/HTA clinical-utility evidence expectations', source: 'HTA bodies' },
    ],
    related: ['legal.ivd.reimbursement', 'legal.ivd.eu-hta', 'sci.ivd.clinical-study-design'],
    tags: ['clinical-utility', 'acce', 'payer-evidence', 'market-access'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'legal.ivd.eu-hta',
    domain: 'legal',
    topic: 'market-access',
    title: 'EU Health Technology Assessment Regulation (HTAR 2021/2282)',
    jurisdictions: ['EU'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'The EU HTA Regulation introduces Joint Clinical Assessments (JCA) and Joint Scientific Consultations across member states; applicable to medical devices/IVDs on a phased basis (notably certain high-risk and companion-diagnostic-relevant technologies), centralizing the clinical-evidence assessment that feeds national pricing/reimbursement.',
    detail:
      'Regulation (EU) 2021/2282 on Health Technology Assessment, applicable from January 2025 with phased scope, creates EU-level cooperation: Joint Clinical Assessments (JCA) of a technology\'s relative clinical effectiveness/safety (replacing duplicative national clinical assessments) and Joint Scientific Consultations (early advice). For medicines it starts with new oncology/ATMPs; for medical devices and IVDs it applies on a more selective, phased basis (certain high-risk devices/IVDs, with relevance to companion diagnostics tied to assessed medicines). Crucially, the JCA covers the clinical dimension only — pricing and reimbursement decisions remain national — but a JCA report strongly shapes downstream national HTA. For IVD/CDx developers this means aligning the clinical-evidence package (comparators, endpoints, PICO) to JCA expectations and using Joint Scientific Consultation early.',
    keyPoints: [
      'HTAR (EU) 2021/2282: Joint Clinical Assessments + Joint Scientific Consultations.',
      'Applicable from Jan 2025, phased; devices/IVDs on a selective basis (CDx-relevant).',
      'JCA covers clinical assessment only; pricing/reimbursement stays national.',
      'Align the evidence package (PICO/comparators/endpoints) to JCA; use early advice.',
    ],
    citations: [
      { label: 'Regulation (EU) 2021/2282 (HTA Regulation)', source: 'EU', url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32021R2282' },
    ],
    related: ['legal.ivd.clinical-utility', 'eu.ivdr.performance-evaluation', 'legal.ivd.nice-gba'],
    tags: ['eu-hta', 'htar', 'jca', 'joint-clinical-assessment', 'market-access'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'legal.ivd.nice-gba',
    domain: 'legal',
    topic: 'market-access',
    title: 'National HTA exemplars — England (NICE) and Germany (G-BA/IQWiG)',
    jurisdictions: ['UK', 'EU'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'National HTA bodies translate clinical evidence into access: England\'s NICE runs diagnostics-specific programs (DAP/MTEP/EVA) emphasizing cost-effectiveness (QALYs), while Germany\'s G-BA (advised by IQWiG) assesses benefit and can mandate evidence-generation studies for novel methods.',
    detail:
      'NICE (England) evaluates diagnostics through dedicated routes — the Diagnostics Assessment Programme (DAP), the Medtech & in-vitro diagnostics innovation/Early Value Assessment (EVA) pathways — assessing both clinical effectiveness and cost-effectiveness (incremental cost per QALY against a threshold), often using decision-analytic modeling; a positive recommendation strongly influences NHS adoption. Germany\'s G-BA (Federal Joint Committee), advised by IQWiG, assesses the benefit of new examination/treatment methods; for IVD-driven methods it can require evidence generation (e.g., Erprobung trials) before broad statutory reimbursement, and CDx access is tied to the associated drug\'s benefit assessment (AMNOG). These exemplify the broader truth: each national system has its own evidence requirements and decision criteria, so a single global value dossier must be adaptable to country-specific HTA.',
    keyPoints: [
      'NICE (England): DAP/MTEP/EVA, cost-per-QALY against a threshold; drives NHS adoption.',
      'Germany G-BA/IQWiG: benefit assessment; can mandate evidence-generation (Erprobung).',
      'CDx access tied to the associated drug\'s benefit assessment (AMNOG in Germany).',
      'A global value dossier must adapt to each national HTA\'s criteria.',
    ],
    citations: [
      { label: 'NICE Diagnostics Assessment Programme / EVA methods', source: 'NICE' },
      { label: 'G-BA method assessment; IQWiG methods', source: 'G-BA / IQWiG' },
    ],
    related: ['legal.ivd.eu-hta', 'legal.ivd.clinical-utility', 'legal.ivd.reimbursement'],
    tags: ['nice', 'g-ba', 'iqwig', 'qaly', 'hta', 'amnog'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'legal.ivd.value-dossier',
    domain: 'legal',
    topic: 'market-access',
    title: 'Global value dossier and evidence-generation planning for diagnostics',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'A global value dossier consolidates the clinical, economic, and outcomes evidence for an IVD into a payer-facing narrative; planning evidence generation in parallel with the regulatory program is essential because payer/HTA timelines and evidence needs differ from (and exceed) regulatory ones.',
    detail:
      'The global value dossier (GVD) is the master evidence and messaging document that supports market access across payers/HTA bodies: it assembles the analytical/clinical validity, the clinical-utility and outcomes evidence, the health-economic model (cost-effectiveness/budget impact), the comparator and care-pathway positioning, and the unmet-need narrative. Because payer evidence requirements (clinical utility, comparative effectiveness, economic modeling) exceed and differ from regulatory requirements, and because HTA timelines run on their own clock, leading developers run integrated evidence-generation planning — mapping each market\'s evidence needs early, designing pivotal studies to serve both regulatory and payer ends where possible (e.g., capturing management-change/outcome endpoints), and sequencing market entry by access feasibility. This is the commercial counterpart to the regulatory lifecycle and a frequent determinant of whether a technically excellent IVD succeeds.',
    keyPoints: [
      'GVD consolidates clinical + utility + economic + positioning evidence for payers.',
      'Payer/HTA evidence needs exceed and differ from regulatory ones.',
      'Plan evidence generation in parallel; design studies to serve both ends.',
      'Sequence market entry by access feasibility.',
    ],
    citations: [
      { label: 'ISPOR good practices for value dossiers / HEOR', source: 'ISPOR' },
    ],
    related: ['legal.ivd.clinical-utility', 'legal.ivd.eu-hta', 'legal.ivd.nice-gba', 'legal.ivd.reimbursement'],
    tags: ['value-dossier', 'heor', 'evidence-generation', 'market-access', 'ispor'],
    lastReviewed: '2026-06-09',
  },
];
