/**
 * IVD standards index corpus.
 *
 * Citable index of the consensus standards that recur across IVD regulatory and
 * scientific work, each with scope, why it matters, and how it is used. This is
 * a navigational/intelligence index (the deep "how" lives in the scientific
 * entries and the executable estimators); it complements the DB-seeded
 * shared/schema/regulatory-standards.seed.ts by giving each key standard a
 * narrative, cross-linked knowledge entry.
 */

import type { KnowledgeEntry } from '../types';

export const IVD_STANDARDS_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: 'std.iso-13485',
    domain: 'standard',
    topic: 'quality-system',
    title: 'ISO 13485:2016 — Medical device quality management systems',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'device'],
    summary:
      'The international QMS standard for medical devices/IVDs. It is the backbone of MDSAP, the basis for EU QMS conformity, ISO 13485-aligned national ordinances (e.g., Japan MHLW Ord. 169), and converges with the US QMSR (which incorporates ISO 13485 from Feb 2026).',
    detail:
      'ISO 13485:2016 specifies QMS requirements for organisations across the device lifecycle: management responsibility, resource management, product realisation (design & development controls, purchasing, production and service controls), and measurement/analysis/improvement (CAPA, complaints, internal audit). It is risk-based and tightly linked to ISO 14971. It underpins MDSAP audits, EU notified-body QMS certification (IVDR Annex IX), and many national systems. The US FDA\'s Quality Management System Regulation (QMSR) final rule incorporates ISO 13485 by reference, with general applicability from 2 February 2026, harmonising the former QSR (21 CFR 820) with the international standard.',
    keyPoints: [
      'International device QMS standard; lifecycle and risk-based.',
      'Backbone of MDSAP and EU (Annex IX) QMS certification.',
      'US QMSR incorporates ISO 13485 (applicable Feb 2, 2026).',
      'Tightly coupled to ISO 14971 risk management.',
    ],
    citations: [
      { label: 'ISO 13485:2016', source: 'ISO' },
      { label: 'FDA QMSR Final Rule (incorporates ISO 13485; 2026)', source: 'FDA' },
    ],
    related: ['std.iso-14971', 'global.ivd.mdsap', 'eu.ivdr.conformity-routes', 'fda.ivd.special-controls-and-standards'],
    tags: ['iso-13485', 'qms', 'qmsr', 'mdsap'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'std.iso-14971',
    domain: 'standard',
    topic: 'risk-management',
    title: 'ISO 14971:2019 — Application of risk management to medical devices',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'device'],
    summary:
      'The risk-management standard for devices/IVDs: risk analysis, evaluation, control, residual-risk and benefit-risk evaluation, and production/post-production feedback — the engine behind the IVDR risk-management GSPR and FDA expectations. ISO/TR 24971 provides guidance.',
    detail:
      'ISO 14971:2019 defines an iterative risk-management process documented in a risk-management file: identify hazards and hazardous situations, estimate and evaluate risk (severity × probability, often decomposed P1×P2 per ISO/TR 24971), implement and verify risk controls in priority order (inherent safety by design → protective measures → information for safety), evaluate residual and overall residual risk, and feed production/post-production information back into the file. It is the methodological basis for the IVDR Annex I risk-management requirement and for FDA risk documentation, and it links design controls (820.30/ISO 13485 §7.3) to post-market surveillance.',
    keyPoints: [
      'Iterative process captured in a risk-management file.',
      'Risk control priority: inherent design → protective measures → information for safety.',
      'Requires residual-risk and overall benefit-risk evaluation + post-production feedback.',
      'Basis for IVDR risk GSPR; guidance in ISO/TR 24971.',
    ],
    citations: [
      { label: 'ISO 14971:2019', source: 'ISO' },
      { label: 'ISO/TR 24971:2020 (guidance)', source: 'ISO' },
    ],
    related: ['std.iso-13485', 'eu.ivdr.gspr', 'eu.ivdr.pms-pmpf'],
    tags: ['iso-14971', 'risk-management', 'benefit-risk', 'iso-tr-24971'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'std.iso-15189',
    domain: 'standard',
    topic: 'laboratory',
    title: 'ISO 15189:2022 — Medical laboratories: quality and competence',
    jurisdictions: ['global'],
    appliesTo: ['ldt', 'ivd'],
    summary:
      'The accreditation standard for medical laboratories (not manufacturers). It governs the lab that runs tests — including labs that develop and validate LDTs — covering competence, examination processes, and quality, and is central to LDT validation and lab accreditation.',
    detail:
      'ISO 15189:2022 specifies requirements for quality and competence in medical laboratories, integrating risk management (it now embeds point-of-care testing, previously ISO 22870). It addresses pre-examination, examination, and post-examination processes, personnel competence, method validation/verification, and quality assurance. While ISO 13485 governs device manufacturers, ISO 15189 governs the laboratories that perform testing; it is the operational quality framework under which laboratory-developed tests are validated and is widely used for lab accreditation (e.g., alongside CAP/CLIA in the US and as the basis for accreditation bodies worldwide).',
    keyPoints: [
      'Accreditation standard for the laboratory (vs ISO 13485 for the manufacturer).',
      'Covers pre/examination/post processes, competence, method validation.',
      '2022 edition embeds POCT and risk management.',
      'Operational framework for LDT validation and lab accreditation.',
    ],
    citations: [
      { label: 'ISO 15189:2022', source: 'ISO' },
    ],
    related: ['legal.ivd.ldt-rule', 'fda.ivd.clia-categorization'],
    tags: ['iso-15189', 'laboratory', 'accreditation', 'ldt', 'poct'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'std.iso-17511',
    domain: 'standard',
    topic: 'traceability',
    title: 'ISO 17511:2020 — Metrological traceability of assigned values',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'Defines how calibrator and control assigned values must be traceable to higher-order references (SI via reference measurement procedures/certified reference materials), with stated uncertainty — mandated by IVDR Annex I §9 and expected by FDA.',
    detail:
      'ISO 17511:2020 establishes the requirements and calibration hierarchy for metrological traceability of values assigned to IVD calibrators, trueness controls, and human samples. It defines the chain from the end-user result up to the highest available reference (an SI unit realised via a reference measurement procedure anchored to a certified reference material, or international conventional references where none exists), and requires propagation of measurement uncertainty. It is the standard behind the IVDR Annex I §9 traceability GSPR and is paired with commutability assessment (CLSI EP30/IFCC).',
    keyPoints: [
      'Calibration hierarchy + uncertainty propagation for assigned values.',
      'Anchors to SI/RMP/CRM where available; conventional references otherwise.',
      'Mandated by IVDR Annex I §9; paired with commutability (EP30).',
    ],
    citations: [
      { label: 'ISO 17511:2020', source: 'ISO' },
    ],
    related: ['sci.ivd.traceability', 'eu.ivdr.gspr'],
    tags: ['iso-17511', 'traceability', 'calibrator', 'uncertainty'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'std.iso-18113',
    domain: 'standard',
    topic: 'labeling',
    title: 'ISO 18113 — Information supplied by the IVD manufacturer (labelling)',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'The IVD-specific labelling standard series defining requirements and terminology for information supplied by the manufacturer (labels, instructions for use) for professional-use and self-test IVDs, supporting IVDR Annex I Ch. III and FDA 809.10.',
    detail:
      'ISO 18113 (parts 1–5) specifies requirements for information supplied by IVD manufacturers: Part 1 terms/definitions/general requirements, Part 2 professional-use reagents, Part 3 professional-use instruments, Part 4 self-testing reagents, Part 5 self-testing instruments. It harmonises label and instructions-for-use content for IVDs and supports compliance with IVDR Annex I Chapter III (information supplied with the device) and, conceptually, FDA\'s 21 CFR 809.10 IVD labelling content. It is used together with ISO 15223-1 (symbols) for label symbology.',
    keyPoints: [
      'IVD-specific labelling content standard (parts 1–5).',
      'Separate parts for professional vs self-test, reagents vs instruments.',
      'Supports IVDR Annex I Ch. III and aligns with FDA 809.10.',
      'Used with ISO 15223-1 for symbols.',
    ],
    citations: [
      { label: 'ISO 18113-1..5', source: 'ISO' },
      { label: 'ISO 15223-1:2021 (symbols)', source: 'ISO' },
    ],
    related: ['eu.ivdr.technical-documentation', 'fda.ivd.definition-and-ruo-iuo'],
    tags: ['iso-18113', 'labeling', 'ifu', 'iso-15223-1'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'std.iso-20916',
    domain: 'standard',
    topic: 'clinical-performance',
    title: 'ISO 20916:2019 — IVD clinical performance studies using human specimens',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'The good-study-practice standard for IVD clinical performance studies — the diagnostics analogue of ISO 14155 — covering study design, conduct, ethics, and documentation; explicitly leveraged for IVDR Annex XIII clinical performance.',
    detail:
      'ISO 20916:2019 establishes good study practice for clinical performance studies of IVDs using specimens from human subjects: it covers study planning (protocol, objectives, design), ethical and regulatory considerations, conduct, monitoring, and reporting, paralleling ISO 14155 for therapeutic device clinical investigations. It is the methodological backbone for the clinical-performance pillar of an IVDR Performance Evaluation (Annex XIII) and is increasingly referenced for FDA clinical studies as well.',
    keyPoints: [
      'Good-study-practice standard for IVD clinical performance studies.',
      'Diagnostics analogue of ISO 14155.',
      'Backbone for IVDR Annex XIII clinical performance.',
    ],
    citations: [
      { label: 'ISO 20916:2019', source: 'ISO' },
    ],
    related: ['sci.ivd.clinical-study-design', 'eu.ivdr.performance-evaluation'],
    tags: ['iso-20916', 'clinical-performance', 'study-practice'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'std.iso-23640',
    domain: 'standard',
    topic: 'stability',
    title: 'ISO 23640:2011 — Stability evaluation of IVD reagents',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'The standard framing stability evaluation of IVD reagents — shelf-life, in-use, and transport stability — used with CLSI EP25 to substantiate stability claims required by IVDR and FDA.',
    detail:
      'ISO 23640:2011 specifies requirements for the evaluation of stability of IVD reagents, including establishing claimed shelf-life (real-time), in-use stability after first opening, and transport (stress) stability, and frames the use of accelerated studies as supportive. It is applied together with CLSI EP25 (the detailed evaluation protocol) to substantiate the stability claims required in the technical documentation/performance evaluation and the package insert.',
    keyPoints: [
      'Framework for IVD reagent stability (shelf-life, in-use, transport).',
      'Used with CLSI EP25 for the detailed protocol.',
      'Substantiates stability claims in IFU/technical documentation.',
    ],
    citations: [
      { label: 'ISO 23640:2011', source: 'ISO' },
      { label: 'CLSI EP25', source: 'CLSI' },
    ],
    related: ['sci.ivd.stability'],
    tags: ['iso-23640', 'stability', 'ep25', 'shelf-life'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'std.iec-62304',
    domain: 'standard',
    topic: 'software',
    title: 'IEC 62304 — Medical device software life-cycle processes',
    jurisdictions: ['global'],
    appliesTo: ['samd', 'ivd'],
    summary:
      'The software life-cycle standard for medical device software (including IVD software/SaMD): software safety classification (A/B/C) drives the required development, maintenance, risk, configuration, and SOUP/problem-resolution processes.',
    detail:
      'IEC 62304 defines life-cycle processes for medical device software: development planning, requirements, architecture and detailed design, implementation/unit verification, integration and system testing, release, and ongoing maintenance, risk management (linked to ISO 14971), configuration management, and problem resolution. The rigour scales with the software safety class — A (no injury possible), B (non-serious injury possible), C (death or serious injury possible) — and the standard governs management of SOUP (software of unknown provenance)/OTS components. For IVDs with embedded or standalone software (including AI/ML SaMD), conformance underpins both FDA premarket software documentation and IVDR GSPR software requirements, and pairs with IEC 62366-1 (usability) and FDA premarket cybersecurity (SPDF/SBOM).',
    keyPoints: [
      'Safety class A/B/C scales required SDLC rigour.',
      'Covers development, maintenance, risk, configuration, SOUP, problem resolution.',
      'Underpins FDA software documentation and IVDR software GSPRs.',
      'Pairs with IEC 62366-1 usability and FDA cybersecurity (SPDF/SBOM).',
    ],
    citations: [
      { label: 'IEC 62304:2006/A1:2015', source: 'IEC' },
      { label: 'IEC 62366-1:2015/A1:2020 (usability)', source: 'IEC' },
    ],
    related: ['fda.ivd.expedited-programs', 'global.ivd.imdrf'],
    tags: ['iec-62304', 'software', 'samd', 'soup', 'safety-class'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'std.clsi-ep05',
    domain: 'standard',
    topic: 'analytical-performance',
    title: 'CLSI EP series — the IVD analytical evaluation protocols',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'The CLSI Evaluation Protocols (EP series) are the FDA-recognised, NB-expected methods for IVD analytical validation: EP05 precision, EP06 linearity, EP07 interference, EP09 method comparison, EP12 qualitative tests, EP17 detection capability, EP25 stability, EP28 reference intervals, EP30 commutability.',
    detail:
      'The CLSI EP (Evaluation Protocols) series is the de-facto methodological standard for IVD analytical performance studies, widely recognised by FDA and expected by notified bodies. Key members: EP05 (precision/imprecision), EP06 (linearity/measuring range), EP07 (interference), EP09 (method comparison & bias), EP12 (qualitative test performance), EP15 (user verification of precision/bias), EP17 (detection capability — LoB/LoD/LoQ), EP25 (reagent stability), EP28 (reference intervals), EP30 (commutability of reference materials), and EP37 (interferent test concentrations). Aligning the analytical validation plan to the relevant EP protocols (and submitting Declarations of Conformity to FDA-recognised editions) is the most efficient route to a defensible analytical performance section.',
    keyPoints: [
      'EP series = FDA-recognised/NB-expected analytical validation protocols.',
      'EP05/06/07/09/12/15/17/25/28/30/37 cover the full analytical study set.',
      'Declarations of Conformity to recognised EP editions streamline review.',
    ],
    citations: [
      { label: 'CLSI EP05/EP06/EP07/EP09/EP12/EP15/EP17/EP25/EP28/EP30/EP37', source: 'CLSI' },
      { label: 'FDA Recognized Consensus Standards (CLSI EP editions)', source: 'FDA' },
    ],
    related: ['sci.ivd.analytical-performance-overview', 'sci.ivd.precision', 'sci.ivd.detection-capability', 'fda.ivd.special-controls-and-standards'],
    tags: ['clsi', 'ep-series', 'analytical-performance', 'recognized-standards'],
    lastReviewed: '2026-06-09',
  },
];
