/**
 * EU MDCG guidance index corpus.
 *
 * The Medical Device Coordination Group (MDCG, Art. 103) issues non-binding but
 * highly influential guidance that notified bodies and competent authorities
 * follow in practice. This is a navigational index of the MDCG (and closely
 * related) documents most relevant to IVDs, each with scope and why it matters.
 * Several MDR-numbered documents are applied to IVDs by analogy where no IVDR-
 * specific equivalent exists.
 */

import type { KnowledgeEntry } from '../types';

export const MDCG_GUIDANCE_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: 'mdcg.overview',
    domain: 'regulatory',
    topic: 'mdcg-guidance',
    title: 'MDCG guidance — status, authority, and how to use it',
    jurisdictions: ['EU'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'MDCG documents are guidance, not law, issued by the Medical Device Coordination Group (IVDR Art. 103/105). They are not legally binding but are followed in practice by notified bodies and competent authorities, so aligning to them materially de-risks conformity assessment.',
    detail:
      'The Medical Device Coordination Group is composed of EU member-state experts and supports harmonised implementation of the MDR/IVDR. Its guidance documents (the "MDCG 20xx-nn" series) interpret the regulations on classification, technical documentation, performance evaluation, clinical/performance studies, vigilance, and notified-body operations. They carry no formal legal force, but because notified bodies and competent authorities apply them, conformance is the practical expectation. Where an IVDR-specific MDCG document does not yet exist, the corresponding MDR document is frequently applied by analogy (e.g., the significant-change guidance). Always confirm the latest revision, as the series is updated frequently.',
    keyPoints: [
      'MDCG = member-state expert group supporting MDR/IVDR (Art. 103).',
      'Guidance is non-binding but followed by NBs and competent authorities.',
      'MDR-numbered guidance is often applied to IVDs by analogy.',
      'Track revisions — the series updates frequently.',
    ],
    citations: [
      { label: 'IVDR Art. 103/105 (MDCG); EU Commission MDCG library', source: 'EU (MDCG)' },
    ],
    related: ['mdcg.2020-16-classification', 'mdcg.2022-2-performance-evaluation', 'eu.ivdr.overview'],
    tags: ['mdcg', 'guidance', 'eu', 'soft-law'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'mdcg.2020-16-classification',
    domain: 'regulatory',
    topic: 'mdcg-guidance',
    title: 'MDCG 2020-16 — Guidance on classification rules for IVDs under IVDR',
    jurisdictions: ['EU'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'The authoritative interpretation of Annex VIII classification rules, with worked examples mapping intended purposes to Classes A–D. Essential for resolving Rule 3 scope and the Rule 6 catch-all.',
    detail:
      'MDCG 2020-16 (revised) explains how to apply the seven Annex VIII rules, including detailed examples and the "implementing rules" (e.g., highest applicable class governs; intended purpose drives classification). It is the go-to reference for the recurring hard calls — whether an assay falls under Rule 3 (Class C, the broad sweep covering CDx, cancer, genetic, infectious-with-significant-risk, prenatal/newborn) versus the Rule 6 Class B catch-all, and the handling of self-test/near-patient (Rule 4/5) and controls (Rule 7).',
    keyPoints: [
      'Authoritative reading of Annex VIII with worked examples.',
      'Clarifies Rule 3 (Class C) vs Rule 6 (Class B) boundaries.',
      'Confirms "highest applicable class governs" and intended-purpose primacy.',
    ],
    citations: [
      { label: 'MDCG 2020-16 (IVD classification under IVDR)', source: 'EU (MDCG)' },
      { label: 'IVDR Annex VIII', source: 'EU' },
    ],
    related: ['eu.ivdr.classification-rules', 'mdcg.2022-2-performance-evaluation'],
    tags: ['mdcg-2020-16', 'classification', 'annex-viii'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'mdcg.2022-2-performance-evaluation',
    domain: 'regulatory',
    topic: 'mdcg-guidance',
    title: 'MDCG 2022-2 — Guidance on general principles of clinical evidence for IVDs',
    jurisdictions: ['EU'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'Explains the performance-evaluation evidence model — scientific validity, analytical performance, clinical performance — and how to build the Performance Evaluation Plan/Report, including how to evidence scientific validity (the most under-served pillar).',
    detail:
      'MDCG 2022-2 sets out the general principles of clinical evidence for IVDs under IVDR Annex XIII: the relationship between the three pillars, the contents of the Performance Evaluation Plan (PEP) and Performance Evaluation Report (PER), and the continuous-update expectation via PMPF. It is particularly valuable for the scientific-validity pillar — how to assemble and grade literature/consensus/own-data to establish the analyte–condition association — and for distinguishing the evidence levels expected by device class.',
    keyPoints: [
      'Maps the three performance-evaluation pillars and PEP/PER contents.',
      'Guidance on evidencing scientific validity (literature/consensus/own data).',
      'Reinforces PMPF-driven continuous update of the PER.',
    ],
    citations: [
      { label: 'MDCG 2022-2 (clinical evidence for IVDs)', source: 'EU (MDCG)' },
      { label: 'IVDR Annex XIII', source: 'EU' },
    ],
    related: ['eu.ivdr.performance-evaluation', 'sci.ivd.scientific-validity', 'mdcg.2022-2-pmpf'],
    tags: ['mdcg-2022-2', 'performance-evaluation', 'clinical-evidence', 'scientific-validity'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'mdcg.2022-2-pmpf',
    domain: 'regulatory',
    topic: 'mdcg-guidance',
    title: 'MDCG guidance on PMPF (post-market performance follow-up) plans & reports',
    jurisdictions: ['EU'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'MDCG templates/guidance for the PMPF plan and evaluation report (Annex XIII Part B) — the device-specific ongoing collection of performance data that keeps the PER current; where PMPF is not performed, a documented justification is required.',
    detail:
      'The MDCG has issued PMPF plan and PMPF evaluation-report templates/guidance (analogous to the MDR PMCF documents) operationalising Annex XIII Part B. They structure the proactive methods (e.g., real-world performance data, registries, literature surveillance, user feedback, additional studies), objectives, and milestones, and the loop back into the PER and risk file. A manufacturer choosing not to conduct PMPF must justify it in the PMS documentation.',
    keyPoints: [
      'PMPF plan + evaluation-report templates operationalise Annex XIII Part B.',
      'Defines proactive performance-data methods and the PER feedback loop.',
      'No-PMPF requires a documented justification.',
    ],
    citations: [
      { label: 'MDCG PMPF plan/report templates (Annex XIII Part B)', source: 'EU (MDCG)' },
    ],
    related: ['eu.ivdr.pms-pmpf', 'mdcg.2022-2-performance-evaluation'],
    tags: ['pmpf', 'post-market', 'mdcg', 'annex-xiii-part-b'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'mdcg.2022-9-ssp',
    domain: 'regulatory',
    topic: 'mdcg-guidance',
    title: 'MDCG 2022-9 — Summary of Safety and Performance (SSP) template',
    jurisdictions: ['EU'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'The template and guidance for the Summary of Safety and Performance required for Class C and D IVDs (Art. 29) — a public, notified-body-validated document published in EUDAMED summarising performance, residual risks, and clinical evidence.',
    detail:
      'MDCG 2022-9 provides the structure and content for the SSP that manufacturers of Class C and D IVDs must prepare. The SSP is validated by the notified body and made publicly available through EUDAMED; it summarises the device identification and intended purpose, the performance evaluation conclusions, residual risks and undesirable effects, and, where relevant, information for users/patients. It is the transparency counterpart to the technical documentation.',
    keyPoints: [
      'SSP required for Class C and D IVDs (Art. 29).',
      'NB-validated and published publicly via EUDAMED.',
      'Summarises intended purpose, performance, and residual risks.',
    ],
    citations: [
      { label: 'MDCG 2022-9 (SSP template for IVDs)', source: 'EU (MDCG)' },
      { label: 'IVDR Art. 29 (SSP)', source: 'EU' },
    ],
    related: ['eu.ivdr.technical-documentation', 'eu.ivdr.notified-bodies'],
    tags: ['mdcg-2022-9', 'ssp', 'eudamed', 'transparency'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'mdcg.2020-3-significant-change',
    domain: 'regulatory',
    topic: 'mdcg-guidance',
    title: 'MDCG 2020-3 — Significant changes under the transitional provisions',
    jurisdictions: ['EU'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'The criteria (written for MDR, applied to IVDR by analogy) for whether a change to a legacy device is "significant" — which, if met, forfeits transitional benefit and forces conformity assessment under the new regulation.',
    detail:
      'MDCG 2020-3 provides flowcharts to judge whether a change in design or intended purpose is "significant" for the purpose of the transitional provisions (relevant to IVDR Art. 110). Changes to intended purpose, design/performance outside the original specification, sterilisation method, or software beyond corrective/security updates can be significant. Because a misjudged "non-significant" change can invalidate a device\'s legacy/transition status, this guidance is central to lifecycle change management during the IVDR transition.',
    keyPoints: [
      'Criteria for "significant change" to legacy devices (MDR, applied to IVDR by analogy).',
      'Significant change forfeits transitional benefit → new-regulation conformity assessment.',
      'Covers intended purpose, design/performance, sterilisation, software.',
    ],
    citations: [
      { label: 'MDCG 2020-3 (significant changes)', source: 'EU (MDCG)' },
      { label: 'IVDR Art. 110 (transitional provisions)', source: 'EU' },
    ],
    related: ['legal.ivd.change-significant', 'eu.ivdr.transition-timeline'],
    tags: ['mdcg-2020-3', 'significant-change', 'transition', 'change-control'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'mdcg.2019-11-software',
    domain: 'regulatory',
    topic: 'mdcg-guidance',
    title: 'MDCG 2019-11 — Qualification and classification of software',
    jurisdictions: ['EU'],
    appliesTo: ['samd', 'ivd', 'cdx'],
    summary:
      'Guidance on whether software is a medical device/IVD ("qualification") and how to classify it, including the decision logic that determines when standalone software is regulated as an IVD and at what class.',
    detail:
      'MDCG 2019-11 (with subsequent updates) sets out how to decide whether software qualifies as a medical device or an in-vitro diagnostic device and, if so, how to classify it under MDR/IVDR. For IVD software (including algorithms that interpret IVD outputs or drive diagnosis), it clarifies when the software is itself an IVD and how Annex VIII applies. It is the EU counterpart to the IMDRF SaMD framework and FDA software-function guidance, and is essential for AI/ML-enabled diagnostics deciding their regulatory status.',
    keyPoints: [
      'Decides software qualification (is it an MD/IVD?) and classification.',
      'Clarifies when IVD/diagnostic algorithms are themselves regulated IVDs.',
      'EU counterpart to IMDRF SaMD and FDA software-function guidance.',
    ],
    citations: [
      { label: 'MDCG 2019-11 (software qualification/classification)', source: 'EU (MDCG)' },
    ],
    related: ['global.ivd.imdrf', 'std.iec-62304', 'eu.ivdr.classification-rules'],
    tags: ['mdcg-2019-11', 'software', 'samd', 'qualification', 'ai-ml'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'mdcg.eudamed-and-transition',
    domain: 'regulatory',
    topic: 'mdcg-guidance',
    title: 'MDCG guidance on EUDAMED rollout and the 2024/1860 transition measures',
    jurisdictions: ['EU'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'MDCG position papers and guidance on the phased mandatory rollout of EUDAMED modules and the practical application of the Regulation (EU) 2024/1860 transition extension and supply-interruption notification obligations.',
    detail:
      'Following Regulation (EU) 2024/1860, the MDCG has issued guidance/position papers on the phased mandatory use of EUDAMED modules (actor, UDI/device, certificates, vigilance, market surveillance, clinical/performance studies) and on the practical operation of the extended IVDR transition timeline and the new obligations to notify anticipated interruptions or discontinuation of supply of certain critical devices. These documents translate the amended Article 110/112 mechanics and EUDAMED go-live dates into operational steps for manufacturers and other economic operators.',
    keyPoints: [
      'Guidance on phased mandatory EUDAMED module go-live.',
      'Operationalises the 2024/1860 transition extension.',
      'Covers supply-interruption/discontinuation notifications for critical devices.',
    ],
    citations: [
      { label: 'MDCG guidance/position papers on EUDAMED & 2024/1860', source: 'EU (MDCG)' },
      { label: 'Regulation (EU) 2024/1860', source: 'EU' },
    ],
    related: ['eu.ivdr.transition-timeline', 'eu.ivdr.notified-bodies'],
    tags: ['mdcg', 'eudamed', '2024-1860', 'transition', 'supply'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'mdcg.2022-18-art97',
    domain: 'regulatory',
    topic: 'mdcg-guidance',
    title: 'MDCG 2022-18 — Article 97 mechanism for legacy/transition non-compliance',
    jurisdictions: ['EU'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'Guidance describing how competent authorities can apply the Article 97 mechanism to allow continued, time-limited availability of devices that miss a transition deadline without an unacceptable risk, avoiding supply disruption.',
    detail:
      'MDCG 2022-18 (issued in the MDR context and informing IVDR practice) describes a uniform approach for competent authorities to apply Article 97 — which lets an authority require a manufacturer to bring a non-compliant device into compliance within a defined period rather than immediately removing it — to manage cases where devices would otherwise fall out of the market at a transition deadline despite posing no unacceptable risk. It is part of the toolkit (alongside the 2023/2024 transition extensions) used to prevent device shortages during the MDR/IVDR transition.',
    keyPoints: [
      'Article 97 lets authorities permit time-limited continued supply of non-compliant-but-safe devices.',
      'Used to avoid shortages at transition deadlines.',
      'Complements the 2024/1860 extensions.',
    ],
    citations: [
      { label: 'MDCG 2022-18 (Article 97 mechanism)', source: 'EU (MDCG)' },
      { label: 'IVDR/MDR Art. 97', source: 'EU' },
    ],
    related: ['eu.ivdr.transition-timeline', 'mdcg.eudamed-and-transition'],
    tags: ['mdcg-2022-18', 'article-97', 'transition', 'shortage-prevention'],
    lastReviewed: '2026-06-09',
  },
];
