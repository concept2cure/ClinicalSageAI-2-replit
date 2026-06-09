/**
 * EU IVDR (Regulation (EU) 2017/746) intelligence corpus.
 *
 * Deep, citable entries on the European in-vitro diagnostic framework:
 * classification (Annex VIII, Rules 1–7 → Classes A–D), GSPRs (Annex I),
 * conformity-assessment routes, performance evaluation (Annex XIII),
 * post-market performance follow-up (Annex XIV Part B), notified-body / EUDAMED /
 * SRN obligations, companion diagnostics, and the heavily amended transitional
 * timeline (2022/112 and 2024/1860).
 */

import type { KnowledgeEntry } from '../types';

export const EU_IVDR_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: 'eu.ivdr.overview',
    domain: 'regulatory',
    topic: 'framework',
    title: 'IVDR 2017/746 — scope, actors, and the shift from IVDD',
    jurisdictions: ['EU'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'IVDR replaced the IVDD (98/79/EC) with a risk-based, lifecycle regime. Its defining change is that ~80–90% of IVDs now require notified-body involvement (vs. ~10–20% under the IVDD), plus mandatory performance evaluation, UDI, EUDAMED, and stronger post-market obligations.',
    detail:
      'Regulation (EU) 2017/746 applied from 26 May 2022, replacing Directive 98/79/EC. The most consequential change is the move from a list-based system (Annexes II List A/B + self-declaration for the rest) to a rule-based, risk-tiered classification (Annex VIII) under which the large majority of IVDs require a notified body. It imposes: performance evaluation with scientific validity, analytical performance, and clinical performance (Annex XIII); a Unique Device Identification (UDI) system and Basic UDI-DI; registration of devices and actors in EUDAMED; a person responsible for regulatory compliance (PRRC, Art. 15); systematic post-market surveillance and post-market performance follow-up (PMPF); and, for higher classes, a Summary of Safety and Performance (SSP) and periodic safety update report (PSUR).\n\nEconomic operators (manufacturer, authorised representative, importer, distributor) each carry defined obligations (Arts. 10–14). Non-EU manufacturers must designate an EU Authorised Representative. The General Safety and Performance Requirements (GSPRs, Annex I) are the essential-requirements analogue and must be addressed in the technical documentation (Annexes II and III).',
    keyPoints: [
      'Applied 26 May 2022; replaced IVDD 98/79/EC.',
      'Rule-based classification (Annex VIII) pulls most IVDs into notified-body review.',
      'Mandatory performance evaluation (scientific validity + analytical + clinical).',
      'UDI, EUDAMED, PRRC, PMS/PMPF, SSP/PSUR are core new obligations.',
    ],
    citations: [
      { label: 'Regulation (EU) 2017/746 (IVDR)', source: 'EU', url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32017R0746' },
      { label: 'IVDR Art. 15 (PRRC)', source: 'EU' },
      { label: 'IVDR Annex I (GSPRs)', source: 'EU' },
    ],
    related: ['eu.ivdr.classification-rules', 'eu.ivdr.performance-evaluation', 'eu.ivdr.transition-timeline'],
    tags: ['ivdr', 'gspr', 'eudamed', 'prrc', 'udi'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'eu.ivdr.classification-rules',
    domain: 'regulatory',
    topic: 'classification',
    title: 'Annex VIII classification — Rules 1–7 and Classes A–D',
    jurisdictions: ['EU'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'IVDR Annex VIII assigns every IVD to Class A (lowest risk) through Class D (highest) via seven rules based on individual + public-health risk. Class A (non-sterile) self-certifies; Classes B, C, and D require a notified body, with the most stringent oversight (and EU reference labs/expert panels) for Class D.',
    detail:
      'Classification follows the intended purpose and the seven rules of Annex VIII; if several rules apply, the highest resulting class governs. The rules:\n\n• Rule 1 (Class D): tests to detect transmissible agents in blood/tissue/organ/cell donations or transfusion/transplantation, or that detect a transmissible agent causing a life-threatening disease with high/suspected high risk of propagation (e.g., HIV, HBV/HCV, blood-screening).\n• Rule 2 (Class C, or D): blood grouping/tissue typing to ensure immunological compatibility — Class C generally, but Class D for high-risk systems (ABO, Rh, Kell, Kidd, Duffy).\n• Rule 3 (Class C): a broad rule capturing, among others, detection of sexually transmitted agents, agents in cerebrospinal fluid/blood with limited propagation risk, infectious agents where an erroneous result causes significant patient risk, companion diagnostics, disease staging, screening/diagnosis of cancer, human genetic testing, management of life-threatening disease/monitoring, screening for congenital disorders in the embryo/fetus, and congenital disorder screening in newborns.\n• Rule 4 (Class B or A): self-testing is generally Class C except where the result is not determinant of a critical condition (then lower); clinical chemistry self-tests and blood-gas/glucose nuances — Rule 4(a) self-test devices Class C (with exceptions to B), Rule 4(b) near-patient/blood-gas/glucose specifics.\n• Rule 5 (Class A): low-risk devices — products of general laboratory use with no critical characteristics (general reagents, buffers, washing solutions), instruments intended by the manufacturer specifically for IVD procedures, and specimen receptacles.\n• Rule 6 (Class B): the default/“catch-all” — devices not covered by other rules are Class B.\n• Rule 7 (Class C): controls without a quantitative or qualitative assigned value.\n\nClass A (non-sterile) is self-declared; Class A sterile, B, C, and D require notified-body conformity assessment of escalating rigor. Class D additionally involves EU reference laboratories (batch verification/performance testing) and, for novel CDx and certain Class D devices, expert-panel scrutiny.',
    keyPoints: [
      'Seven rules; the highest applicable class wins. A < B < C < D.',
      'Rule 1 = highest-risk transmissible-agent/blood-screening (Class D).',
      'Rule 3 sweeps in CDx, cancer, genetic, infectious, prenatal/newborn — mostly Class C.',
      'Rule 6 is the Class B catch-all; Rule 5 captures Class A low-risk/instruments/receptacles.',
      'Only non-sterile Class A self-certifies; B/C/D need a notified body; D adds EU reference labs.',
    ],
    pitfalls: [
      'Defaulting novel assays to Rule 6 (B) when Rule 3 (C) actually applies.',
      'Missing that a CDx is explicitly Class C under Rule 3.',
    ],
    citations: [
      { label: 'IVDR Annex VIII (classification rules)', source: 'EU' },
      { label: 'MDCG 2020-16 (IVDR classification guidance)', source: 'EU (MDCG)' },
    ],
    related: ['eu.ivdr.conformity-routes', 'eu.ivdr.companion-diagnostics', 'fda.ivd.classification'],
    tags: ['annex-viii', 'classification', 'class-d', 'rule-3', 'mdcg-2020-16'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'eu.ivdr.gspr',
    domain: 'regulatory',
    topic: 'requirements',
    title: 'General Safety and Performance Requirements (Annex I)',
    jurisdictions: ['EU'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'Annex I sets the GSPRs an IVD must meet: a risk-management chapter (Ch. I), performance/safety requirements including analytical and clinical performance and metrological traceability (Ch. II), and requirements for information supplied with the device — labelling and instructions for use (Ch. III).',
    detail:
      'The GSPRs are the IVDR\'s essential requirements. Chapter I (general requirements) demands that devices achieve their intended performance and are designed/manufactured so that risks are acceptable when weighed against benefit, with a documented, iterative risk-management system (operationalised through ISO 14971). Chapter II (performance, design and manufacture) covers the heart of IVD-specific obligations: analytical performance (sensitivity, specificity, trueness, precision, accuracy, limit of detection/quantitation, measuring range, etc.), clinical performance, scientific validity, metrological traceability of calibrators and control materials to reference materials/procedures (Section 9, aligning with ISO 17511), stability, robustness against interference and carry-over, software requirements, and protection against risks for self-testing/near-patient devices. Chapter III governs the information supplied with the device — label and instructions for use content and language.\n\nManufacturers demonstrate conformity through a GSPR checklist in the technical documentation (Annexes II/III) mapping each requirement to the applied solution and the supporting evidence (standard, test report, risk control). Use of harmonised standards or Common Specifications (CS) confers presumption of conformity.',
    keyPoints: [
      'Annex I = the essential requirements (GSPRs) every IVD must satisfy.',
      'Ch. II includes analytical + clinical performance, scientific validity, and ISO 17511 traceability (§9).',
      'Risk management (Ch. I) is the ISO 14971 backbone.',
      'Conformity is shown via a GSPR checklist mapping requirement → solution → evidence.',
    ],
    citations: [
      { label: 'IVDR Annex I (GSPRs)', source: 'EU' },
      { label: 'IVDR Art. 9 / Common Specifications', source: 'EU' },
      { label: 'IVDR Annex I §9 (metrological traceability)', source: 'EU' },
    ],
    related: ['std.iso-14971', 'std.iso-17511', 'eu.ivdr.performance-evaluation', 'eu.ivdr.technical-documentation'],
    tags: ['gspr', 'annex-i', 'traceability', 'common-specifications'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'eu.ivdr.performance-evaluation',
    domain: 'regulatory',
    topic: 'performance-evaluation',
    title: 'Performance evaluation: scientific validity, analytical & clinical performance (Annex XIII)',
    jurisdictions: ['EU'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'IVDR requires a Performance Evaluation built on three pillars — scientific validity (the analyte–condition association), analytical performance, and clinical performance — documented in a Performance Evaluation Plan and Report (PEP/PER) and maintained across the lifecycle via PMPF.',
    detail:
      'Article 56 and Annex XIII require manufacturers to plan, conduct, and document a performance evaluation demonstrating the device achieves its intended clinical benefit and meets the GSPRs. The three pillars:\n\n1. Scientific validity — the association of the analyte/marker with the clinical condition/physiological state, established from literature, consensus/guidelines, proof-of-concept studies, or the manufacturer\'s own data. This is the pillar most often under-evidenced (treated as a checkbox).\n2. Analytical performance — the ability to correctly detect/measure the analyte: trueness, precision, accuracy, analytical sensitivity (LoD/LoQ), analytical specificity (interference, cross-reactivity), measuring range, cut-off, specimen stability.\n3. Clinical performance — the ability to yield results correlated with a clinical condition/physiological state in the target population: diagnostic sensitivity/specificity, predictive values, likelihood ratios, expected values.\n\nThese are captured in the Performance Evaluation Plan (PEP) and the Performance Evaluation Report (PER), continuously updated through post-market performance follow-up (PMPF, Annex XIII Part B). Clinical performance studies are regulated under Articles 57–77 and Annex XIII Part A §2 / Annex XIV, including specific rules where left-over samples or interventional study designs are used. Common Specifications and ISO 20916 (clinical performance studies) provide the methodological backbone.',
    keyPoints: [
      'Three pillars: scientific validity + analytical performance + clinical performance.',
      'Documented in the PEP and PER; living documents updated via PMPF.',
      'Scientific validity is a substantive evidence requirement, not a checkbox.',
      'Clinical performance studies follow Arts. 57–77 / Annex XIII–XIV and ISO 20916.',
    ],
    pitfalls: [
      'Under-evidencing scientific validity (literature/consensus not assembled).',
      'No PMPF plan to keep the PER current post-CE.',
    ],
    citations: [
      { label: 'IVDR Art. 56 & Annex XIII (performance evaluation)', source: 'EU' },
      { label: 'IVDR Annex XIII Part B (PMPF)', source: 'EU' },
      { label: 'ISO 20916:2019 (IVD clinical performance studies)', source: 'ISO' },
      { label: 'MDCG 2022-2 (performance evaluation / scientific validity)', source: 'EU (MDCG)' },
    ],
    related: ['sci.ivd.analytical-performance-overview', 'sci.ivd.clinical-performance-metrics', 'eu.ivdr.gspr', 'std.iso-17511'],
    tags: ['performance-evaluation', 'per', 'pep', 'scientific-validity', 'annex-xiii'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'eu.ivdr.conformity-routes',
    domain: 'regulatory',
    topic: 'conformity-assessment',
    title: 'Conformity-assessment routes, technical documentation, and CE marking',
    jurisdictions: ['EU'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'The conformity route scales with class: Class A self-declares; Class B/C/D require a notified body, via QMS + technical-documentation assessment (Annex IX) or, for B/C, type-examination + production QA (Annexes X/XI). Class D adds EU reference-lab batch verification.',
    detail:
      'After classification, the manufacturer selects a conformity-assessment route. Class A (non-sterile) is self-declared with an EU Declaration of Conformity (Annex IV) and CE mark, no notified body. For Class A sterile, the notified body assesses only the sterility aspects. Class B, C, and D require a notified body and one of:\n\n• Annex IX — full quality management system + assessment of technical documentation. The notified body audits the QMS and reviews the technical documentation (per device for Class D, on a representative/sampling basis for B/C), issuing QMS and (for C/D) technical-documentation certificates.\n• Annexes X + XI — EU type-examination (Annex X) of a representative sample combined with conformity based on production quality assurance (Annex XI). Available for Class B and C (not D).\n\nThe technical documentation (Annex II) and the technical documentation on post-market surveillance (Annex III) must be assembled regardless of route. For Class D, EU reference laboratories verify performance and, where applicable, batch test; for certain novel Class D and CDx, expert panels and competent-authority/EMA consultation apply. The CE mark plus the four-digit notified-body number is affixed on conformity, and the Declaration of Conformity is issued; the device and Basic UDI-DI/UDI-DI are then registered in EUDAMED.',
    keyPoints: [
      'Class A self-declares (DoC + CE); A-sterile = NB for sterility only.',
      'Class B/C/D: notified body via Annex IX (QMS + tech-doc) or Annex X+XI (type-exam + production QA, B/C only).',
      'Class D adds EU reference-lab performance/batch verification; CDx + novel D add expert panels.',
      'Technical documentation = Annex II + Annex III (PMS); DoC = Annex IV.',
    ],
    citations: [
      { label: 'IVDR Arts. 48–50 & Annexes IX/X/XI (conformity assessment)', source: 'EU' },
      { label: 'IVDR Annex II & III (technical documentation)', source: 'EU' },
      { label: 'IVDR Annex IV (EU Declaration of Conformity)', source: 'EU' },
    ],
    related: ['eu.ivdr.classification-rules', 'eu.ivdr.technical-documentation', 'eu.ivdr.notified-bodies'],
    tags: ['conformity-assessment', 'annex-ix', 'ce-mark', 'declaration-of-conformity', 'eu-reference-lab'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'eu.ivdr.technical-documentation',
    domain: 'regulatory',
    topic: 'technical-documentation',
    title: 'Technical documentation (Annex II/III) and the Summary of Safety and Performance (SSP)',
    jurisdictions: ['EU'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'Annex II/III define the technical file: device description, GSPR conformity, design/manufacturing information, benefit-risk and risk management, performance evaluation, and post-market surveillance. Class C and D devices also require a public Summary of Safety and Performance (SSP).',
    detail:
      'The technical documentation (Annex II) must include: device description and specification (incl. variants/accessories, intended purpose, intended user/patient, Basic UDI-DI); information supplied by the manufacturer (labels, IFU); design and manufacturing information; the GSPR conformity demonstration (the GSPR checklist); benefit-risk analysis and risk management (Annex I §1, §8); product verification and validation including the performance evaluation report and stability/analytical/clinical performance; and, where applicable, specific requirements (e.g., devices incorporating a medicinal substance, devices using human/animal tissues, CDx consultation). Annex III is the technical documentation on post-market surveillance: the PMS plan, PSUR (for C/D) or PMS report (for A/B), and PMPF plan/evaluation report.\n\nFor Class C and D devices, the manufacturer prepares a Summary of Safety and Performance (SSP, Art. 29) — a public-facing document, validated by the notified body and published via EUDAMED, summarising intended purpose, performance, residual risks, and the clinical evidence. The technical documentation must be kept current throughout the lifecycle and made available to the competent authority on request for at least 10 years after the last device is placed on the market.',
    keyPoints: [
      'Annex II = full technical file (description, GSPR, design/manufacture, benefit-risk, performance).',
      'Annex III = PMS technical documentation (PMS plan, PSUR/PMS report, PMPF).',
      'Class C/D require a public, NB-validated SSP published in EUDAMED.',
      'Retain technical documentation ≥10 years after last device placed on market.',
    ],
    citations: [
      { label: 'IVDR Annex II (technical documentation)', source: 'EU' },
      { label: 'IVDR Annex III (PMS technical documentation)', source: 'EU' },
      { label: 'IVDR Art. 29 & MDCG 2022-9 (SSP)', source: 'EU (MDCG)' },
    ],
    related: ['eu.ivdr.gspr', 'eu.ivdr.conformity-routes', 'eu.ivdr.pms-pmpf'],
    tags: ['technical-documentation', 'annex-ii', 'ssp', 'pms'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'eu.ivdr.pms-pmpf',
    domain: 'regulatory',
    topic: 'post-market',
    title: 'Post-market surveillance, PMPF, vigilance, PSUR, and trend reporting',
    jurisdictions: ['EU'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'IVDR mandates a proactive PMS system (Art. 78), post-market performance follow-up (PMPF, Annex XIII Part B), serious-incident and FSCA vigilance reporting (Arts. 82–84) with 2/10/15-day clocks, trend reporting, and a PSUR for Class C/D devices.',
    detail:
      'Manufacturers must plan and operate a PMS system proportionate to risk (Art. 78, Annex III): actively gather and analyse production and post-production data, feed it back into risk management and the PER, and update the technical documentation. PMPF (Annex XIII Part B) is the device-specific continuous update of clinical/performance evidence; where PMPF is not performed, a justification is required.\n\nVigilance (Arts. 82–84): manufacturers report serious incidents and field safety corrective actions (FSCAs) to competent authorities via the Manufacturer Incident Report (MIR), on tiered clocks — no later than 2 days for a serious public-health threat, 10 days for death or unanticipated serious deterioration in health, and 15 days for other serious incidents. Field Safety Notices (FSNs) communicate FSCAs to users. Trend reporting (Art. 83) requires reporting statistically significant increases in non-serious incidents or expected errors that could affect benefit-risk. For Class C and D devices the manufacturer prepares and updates a Periodic Safety Update Report (PSUR, Art. 81) summarising PMS findings, sales/usage, and benefit-risk; for Class D it is submitted through EUDAMED and assessed by the notified body. Class A/B devices maintain a PMS report instead.',
    keyPoints: [
      'Proactive, risk-proportionate PMS feeding the PER and risk file (Art. 78).',
      'PMPF = device-specific ongoing performance evidence (justify if not done).',
      'Vigilance clocks: 2 days (public-health threat), 10 (death/serious deterioration), 15 (other serious).',
      'PSUR for Class C/D; PMS report for A/B; trend reporting under Art. 83.',
    ],
    citations: [
      { label: 'IVDR Arts. 78–81 (PMS, PSUR)', source: 'EU' },
      { label: 'IVDR Arts. 82–84 (vigilance, serious incidents, FSCA)', source: 'EU' },
      { label: 'IVDR Annex XIII Part B (PMPF)', source: 'EU' },
    ],
    related: ['eu.ivdr.performance-evaluation', 'eu.ivdr.technical-documentation', 'std.iso-14971'],
    tags: ['pms', 'pmpf', 'vigilance', 'psur', 'fsca', 'trend-reporting'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'eu.ivdr.companion-diagnostics',
    domain: 'regulatory',
    topic: 'companion-diagnostics',
    title: 'Companion diagnostics under IVDR and the medicines-agency consultation',
    jurisdictions: ['EU'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'IVDR explicitly defines companion diagnostics (Art. 2(7)), classifies them Class C (Annex VIII Rule 3), and requires the notified body to consult a medicines competent authority or the EMA before certifying — a consultation step with no IVDD precedent.',
    detail:
      'A companion diagnostic is defined in Article 2(7) as a device essential for the safe and effective use of a corresponding medicinal product to identify, before/during treatment, patients most likely to benefit or at risk of serious adverse reactions, and/or to monitor response for dosing. Under Annex VIII Rule 3(j) CDx are Class C, requiring notified-body conformity assessment.\n\nUniquely, the conformity-assessment process for a CDx requires the notified body to seek a scientific opinion from a national medicines competent authority (the one that authorised the associated medicinal product) or from the EMA where the product was centrally authorised (Annex IX §5.2 / Annex X §3(k)). The medicines authority/EMA assesses the suitability of the device in relation to the medicinal product within 60 days (extendable). This cross-consultation parallels FDA\'s contemporaneous drug-Dx review but is operationalised through the notified body rather than co-review by one agency. Sponsors must therefore plan device and drug timelines together and ensure the CDx\'s intended purpose, biomarker, and clinical performance align with the medicinal product\'s SmPC.',
    keyPoints: [
      'CDx defined in Art. 2(7); classified Class C under Annex VIII Rule 3(j).',
      'Notified body must consult the relevant medicines authority or EMA (60-day opinion).',
      'Consultation has no IVDD precedent — a genuinely new step.',
      'Align CDx intended purpose/biomarker/performance with the medicinal product SmPC.',
    ],
    citations: [
      { label: 'IVDR Art. 2(7) (CDx definition)', source: 'EU' },
      { label: 'IVDR Annex VIII Rule 3(j) (CDx = Class C)', source: 'EU' },
      { label: 'IVDR Annex IX §5.2 (medicines-authority/EMA consultation)', source: 'EU' },
    ],
    related: ['fda.ivd.cdx', 'eu.ivdr.classification-rules', 'eu.ivdr.conformity-routes'],
    tags: ['companion-diagnostic', 'cdx', 'ema-consultation', 'rule-3'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'eu.ivdr.transition-timeline',
    domain: 'regulatory',
    topic: 'transition',
    title: 'IVDR transitional timeline — Regulations 2022/112 and 2024/1860',
    jurisdictions: ['EU'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'Because notified-body capacity could not absorb the new caseload, the IVDR transition was extended twice. 2022/112 staggered deadlines by class; 2024/1860 extended them further (Class D to Dec 2027, C to Dec 2028, B and A-sterile to Dec 2029) and phased in mandatory EUDAMED plus supply-interruption notifications.',
    detail:
      'IVDR applied on 26 May 2022, but the Annex VIII reclassification meant the vast majority of IVDs newly needed a notified body while too few notified bodies were designated. Regulation (EU) 2022/112 introduced progressive "legacy device" transitional deadlines for devices with no notified-body involvement under the IVDD but now requiring one, conditioned on continued compliance with the IVDD, no significant changes in design/intended purpose, and (from 26 May 2025) compliance with IVDR post-market/vigilance/registration obligations.\n\nRegulation (EU) 2024/1860 further extended the transition and added measures to prevent shortages: under the amended Article 110, the transitional deadlines for placing on the market or putting into service became — Class D devices until 31 December 2027; Class C until 31 December 2028; Class B and Class A sterile until 31 December 2029. The same regulation made the relevant EUDAMED modules mandatory on a phased schedule (with a 2026 starting point for several modules) and introduced obligations for manufacturers (and, where relevant, others) to give advance notice of interruption or discontinuation of supply of certain critical devices to competent authorities and health institutions. Conditions for benefiting from the transition include a signed agreement with a notified body by defined dates and continued conformity with the applicable prior rules. Newly developed (non-legacy) devices and devices with significant changes do not benefit and must comply with IVDR in full.',
    keyPoints: [
      'Two extensions: 2022/112 (staggered) then 2024/1860 (longer + EUDAMED/supply rules).',
      'Amended Art. 110 deadlines: Class D 31 Dec 2027, C 31 Dec 2028, B & A-sterile 31 Dec 2029.',
      'EUDAMED becomes mandatory on a phased schedule; supply-interruption notice introduced.',
      'Transition needs a notified-body agreement by set dates and no significant change.',
    ],
    pitfalls: [
      'Assuming the original 2022/2025 dates still apply (they were superseded by 2024/1860).',
      'Losing transitional benefit by making a "significant change" to a legacy device.',
    ],
    citations: [
      { label: 'Regulation (EU) 2022/112 (first IVDR extension)', source: 'EU', url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R0112' },
      { label: 'Regulation (EU) 2024/1860 (extension + EUDAMED + supply)', source: 'EU', url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1860' },
      { label: 'IVDR Art. 110 (transitional provisions, as amended)', source: 'EU' },
    ],
    related: ['legal.ivd.change-significant', 'eu.ivdr.overview', 'eu.ivdr.notified-bodies'],
    tags: ['transition', 'article-110', '2024-1860', 'eudamed', 'legacy-device'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'eu.ivdr.notified-bodies',
    domain: 'regulatory',
    topic: 'actors',
    title: 'Notified bodies, EUDAMED, UDI, SRN, and the PRRC',
    jurisdictions: ['EU'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'Operationalising IVDR requires designated notified bodies (capacity-constrained), registration of actors (SRN) and devices in EUDAMED, a UDI system with Basic UDI-DI, and a qualified Person Responsible for Regulatory Compliance (PRRC) within the manufacturer.',
    detail:
      'Notified bodies are designated under IVDR (Art. 38) and listed in NANDO; their limited number and capacity is the binding constraint behind the transition extensions. A manufacturer must hold (or have a signed agreement with) a designated notified body for any Class A-sterile/B/C/D device.\n\nEUDAMED (the European database on medical devices) comprises modules for actor registration, UDI/device registration, notified bodies and certificates, clinical investigations/performance studies, vigilance, and market surveillance. Before placing a device on the market, the manufacturer obtains a Single Registration Number (SRN) via the actor module and registers the device and its Basic UDI-DI. The UDI system (Art. 24, Annex VI) requires a Basic UDI-DI (the key identifier grouping a device model for documentation/certificates/EUDAMED) and UDI-DI/UDI-PI carriers on labels per a class-based timeline. Article 15 requires manufacturers (and authorised representatives) to have a Person Responsible for Regulatory Compliance (PRRC) with defined qualifications, responsible for conformity, technical documentation, PMS, vigilance reporting, and (for investigational devices) the relevant statements.',
    keyPoints: [
      'Notified-body capacity is the rate-limiter; a signed NB agreement is needed for B/C/D and A-sterile.',
      'EUDAMED: actor (SRN), UDI/device, certificates, studies, vigilance, market surveillance modules.',
      'UDI requires a Basic UDI-DI plus UDI-DI/UDI-PI carriers on a class-based timeline.',
      'PRRC (Art. 15) is a mandatory qualified role inside the manufacturer/AR.',
    ],
    citations: [
      { label: 'IVDR Arts. 24 & Annex VI (UDI/EUDAMED)', source: 'EU' },
      { label: 'IVDR Art. 15 (PRRC)', source: 'EU' },
      { label: 'IVDR Art. 38 / NANDO (notified bodies)', source: 'EU' },
    ],
    related: ['eu.ivdr.transition-timeline', 'eu.ivdr.conformity-routes', 'eu.ivdr.overview'],
    tags: ['notified-body', 'eudamed', 'udi', 'srn', 'prrc', 'basic-udi-di'],
    lastReviewed: '2026-06-09',
  },
];
