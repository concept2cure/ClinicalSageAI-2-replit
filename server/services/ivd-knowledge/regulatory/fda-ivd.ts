/**
 * FDA IVD regulatory intelligence corpus.
 *
 * Deep, citable entries on the U.S. regulatory framework for in-vitro
 * diagnostics: device definition & RUO/IUO labeling, classification &
 * premarket pathways (510(k), De Novo, PMA), CLIA categorization and waiver,
 * companion diagnostics, special controls, recognized standards, and the
 * expedited programs. Citations point to the governing CFR / statute / guidance.
 */

import type { KnowledgeEntry } from '../types';

export const FDA_IVD_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: 'fda.ivd.definition-and-ruo-iuo',
    domain: 'regulatory',
    topic: 'scope-and-labeling',
    title: 'IVD definition, RUO/IUO labeling, and the analyte specific reagent rule',
    jurisdictions: ['US'],
    appliesTo: ['ivd', 'ruo'],
    summary:
      'IVDs are reagents, instruments, and systems intended for use in the diagnosis of disease, regulated as devices under the FD&C Act. "Research Use Only" and "Investigational Use Only" are labeling categories with strict limits; misuse of RUO/IUO to market an unapproved clinical assay is a recurring enforcement target.',
    detail:
      'In-vitro diagnostic products are defined at 21 CFR 809.3 as reagents, instruments, and systems intended for use in the diagnosis of disease or other conditions, including a determination of the state of health, in order to cure, mitigate, treat, or prevent disease. Because they meet the device definition in section 201(h) of the FD&C Act, IVDs are subject to the full device framework: classification, premarket review, QSR/QMSR, labeling, registration/listing, and postmarket controls.\n\n21 CFR 809.10 governs IVD labeling and is more prescriptive than general device labeling: it requires intended use, summary and explanation, principle of the procedure, reagents, specimen collection/handling, procedure, quality control, results interpretation, limitations, and specific performance characteristics (accuracy, precision, analytical sensitivity/specificity, etc.) in the package insert.\n\n"Research Use Only" (RUO) products are in the laboratory research phase and must be labeled "For Research Use Only. Not for use in diagnostic procedures." "Investigational Use Only" (IUO) products are in the product development/clinical investigation phase. FDA\'s 2013 guidance "Distribution of IVD Products Labeled for Research Use Only or Investigational Use Only" warns that the RUO/IUO label is not a safe harbor: if the manufacturer\'s totality of conduct (marketing claims, instructions, clinical support) shows intent for clinical diagnostic use, FDA treats the product as an unapproved/uncleared IVD. Analyte Specific Reagents (ASRs, 21 CFR 864.4020) are a distinct narrow class — "the building blocks" of lab-developed tests — and carry their own restrictions on combination and promotion.',
    keyPoints: [
      'IVDs are devices; 21 CFR 809 adds IVD-specific labeling on top of general device rules.',
      'RUO/IUO is a development-stage label, not a route to market a clinical assay.',
      'FDA judges RUO/IUO by "totality of circumstances," not the disclaimer alone.',
      'ASRs (864.4020) are single reagents with promotion/combination restrictions.',
    ],
    pitfalls: [
      'Providing clinical interpretation guidance or test performance claims on an RUO product.',
      'Bundling RUO components into a de facto clinical system.',
    ],
    citations: [
      { label: '21 CFR 809.3 (definitions)', source: 'FDA', url: 'https://www.ecfr.gov/current/title-21/part-809' },
      { label: '21 CFR 809.10 (IVD labeling)', source: 'FDA', url: 'https://www.ecfr.gov/current/title-21/section-809.10' },
      { label: '21 CFR 864.4020 (ASRs)', source: 'FDA' },
      { label: 'Guidance: Distribution of IVDs Labeled RUO/IUO (2013)', source: 'FDA' },
    ],
    related: ['fda.ivd.510k-pathway', 'fda.ivd.clia-categorization', 'legal.ivd.ldt-rule'],
    tags: ['ruo', 'iuo', 'labeling', 'asr', '809'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'fda.ivd.classification',
    domain: 'regulatory',
    topic: 'classification',
    title: 'Device classification (Class I/II/III) and the IVD product code system',
    jurisdictions: ['US'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'FDA classifies IVDs by risk into Class I (general controls), Class II (general + special controls, usually 510(k)), and Class III (premarket approval). Classification is anchored to a regulation number and a three-letter product code that drives the review pathway, panel, and applicable special controls.',
    detail:
      'Risk-based classification (section 513 of the FD&C Act) determines the premarket pathway. Class I devices are low-risk and mostly 510(k)-exempt under general controls (registration, listing, labeling, QSR, MDR). Class II devices need "special controls" — performance standards, special labeling, guidance, postmarket surveillance — and typically require a 510(k). Class III devices sustain or support life or present potential unreasonable risk and require Premarket Approval (PMA) unless preamendment.\n\nEvery cleared/approved IVD maps to a classification regulation (e.g., 21 CFR 866 immunology/microbiology, 862 clinical chemistry/toxicology, 864 hematology/pathology) and a three-letter product code in FDA\'s Product Classification database. The product code is operationally central: it identifies the device type, the lead review division, whether a 510(k)/De Novo/PMA applies, applicable special controls and recognized standards, and is the key for searching predicates (510(k) database), adverse events (MAUDE), and recalls. A novel device with no existing classification/product code is automatically Class III by statute (513(f)(1)) unless reclassified via De Novo.',
    keyPoints: [
      'Class I → general controls (often exempt); Class II → 510(k) + special controls; Class III → PMA.',
      'The three-letter product code drives pathway, panel, predicates, and special controls.',
      'No predicate/classification ⇒ statutory Class III unless De Novo reclassifies down.',
      'IVD classification regs cluster in 21 CFR 862/864/866.',
    ],
    citations: [
      { label: 'FD&C Act §513 (classification)', source: 'FDA' },
      { label: '21 CFR 860 (classification procedures)', source: 'FDA' },
      { label: 'FDA Product Classification database', source: 'FDA', url: 'https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfPCD/classification.cfm' },
    ],
    related: ['fda.ivd.510k-pathway', 'fda.ivd.de-novo', 'fda.ivd.pma', 'eu.ivdr.classification-rules'],
    tags: ['classification', 'product-code', 'special-controls', 'class-iii'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'fda.ivd.510k-pathway',
    domain: 'regulatory',
    topic: 'premarket-pathway',
    title: '510(k) premarket notification and substantial equivalence',
    jurisdictions: ['US'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'A 510(k) demonstrates the device is substantially equivalent (SE) to a legally marketed predicate: same intended use, and either the same technological characteristics or different characteristics that do not raise different questions of safety/effectiveness and are supported by performance data.',
    detail:
      'Substantial equivalence is the SE decision tree of the 510(k) program (FD&C Act §513(i); FDA 2014 SE guidance). The submission must establish (1) the same intended use as a predicate and (2) the same technological characteristics, OR different characteristics that do not raise different questions of safety and effectiveness, with performance data showing the new device is as safe and effective as the predicate. For IVDs, the performance data are the analytical and (where intended use requires) clinical performance studies.\n\nModern IVD 510(k)s are increasingly authored in eSTAR (the interactive PDF template, now required) and submitted through the CDRH Customer Collaboration Portal/eSG. Key failure modes: an "intended use drift" between the new device and predicate (e.g., new specimen type, new clinical claim, screening vs. aid-in-diagnosis), reliance on a predicate that has itself been the subject of a design-related recall ("predicate creep"), and inadequate justification when a "new question of safety/effectiveness" is triggered by a technology change (new measurand, new platform, software/AI). The Special 510(k) supports a manufacturer\'s own device modification when design controls and methods can verify the change; the Abbreviated 510(k) leans on FDA guidance/recognized standards/special controls.',
    keyPoints: [
      'SE = same intended use + (same tech OR different tech with no new S&E questions + data).',
      'eSTAR authoring and electronic submission (eSG/portal) are now the norm/required.',
      'Analytical performance is mandatory; clinical performance scales with the claim.',
      'Special 510(k) = own modification verifiable by design controls; Abbreviated = standards/guidance-driven.',
    ],
    pitfalls: [
      'Intended-use drift from the predicate (specimen, population, claim level).',
      'New measurand/platform/software triggering a "different question" without data to resolve it.',
      'Citing a predicate with a design-related recall.',
    ],
    citations: [
      { label: 'FD&C Act §513(i) (substantial equivalence)', source: 'FDA' },
      { label: 'Guidance: The 510(k) Program — Evaluating SE (2014)', source: 'FDA' },
      { label: 'eSTAR / electronic submission requirement', source: 'FDA' },
    ],
    related: ['fda.ivd.classification', 'fda.ivd.de-novo', 'fda.ivd.special-controls-and-standards', 'fda.ivd.cdx'],
    tags: ['510k', 'substantial-equivalence', 'predicate', 'estar'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'fda.ivd.de-novo',
    domain: 'regulatory',
    topic: 'premarket-pathway',
    title: 'De Novo classification for novel low-to-moderate risk IVDs',
    jurisdictions: ['US'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'De Novo (FD&C Act §513(f)(2)) provides a risk-based route to Class I/II for novel devices that lack a predicate but are low-to-moderate risk, creating a new classification, product code, and special controls that subsequent devices can use as a predicate.',
    detail:
      'When a device has no legally marketed predicate it is automatically Class III, but De Novo lets a sponsor request down-classification to Class I or II by demonstrating that general (and, for Class II, special) controls provide reasonable assurance of safety and effectiveness. The granted De Novo establishes a new device type: a classification regulation, a product code, and a set of special controls (the performance, labeling, and sometimes clinical/PMS requirements) that define the type. This is strategically powerful for first-of-kind IVDs (novel biomarkers, NGS oncology panels, AI-based diagnostics) because it both authorizes the device and becomes the predicate/benchmark for competitors.\n\nThe core deliverables are a device description, a risk-and-mitigation analysis (the special controls are essentially the mitigations), and analytical + clinical performance establishing the benefit-risk profile. The 21st Century Cures Act and the De Novo final rule (21 CFR 860 subpart D, effective 2021) formalized content and process. A pre-submission (Q-Sub) to align on the proposed classification, special controls, and study design is strongly advised because the sponsor is, in effect, writing the regulation for the new device type.',
    keyPoints: [
      'Route to Class I/II for novel devices with no predicate but low-to-moderate risk.',
      'Creates a new classification + product code + special controls = future predicate.',
      'Special controls are the documented risk mitigations.',
      'Pre-Sub alignment is high-value because you are defining the device type.',
    ],
    citations: [
      { label: 'FD&C Act §513(f)(2) (De Novo)', source: 'FDA' },
      { label: '21 CFR 860 subpart D (De Novo final rule, 2021)', source: 'FDA' },
      { label: 'Guidance: De Novo Classification Process', source: 'FDA' },
    ],
    related: ['fda.ivd.classification', 'fda.ivd.510k-pathway', 'fda.ivd.special-controls-and-standards'],
    tags: ['de-novo', 'novel', 'special-controls', 'classification'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'fda.ivd.pma',
    domain: 'regulatory',
    topic: 'premarket-pathway',
    title: 'Premarket Approval (PMA) for Class III IVDs',
    jurisdictions: ['US'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'PMA is the most stringent pathway, required for Class III IVDs (and most novel companion diagnostics), demanding valid scientific evidence of safety and effectiveness, manufacturing (QS) review, and a pre-approval inspection. Changes are managed via PMA supplements.',
    detail:
      'PMA (FD&C Act §515; 21 CFR 814) applies to Class III IVDs — those supporting/sustaining life, of substantial importance in preventing impairment, or presenting potential unreasonable risk. The standard is "reasonable assurance of safety and effectiveness" supported by "valid scientific evidence," typically including robust analytical validation and adequately powered clinical performance studies in the intended-use population. Unlike 510(k) SE, PMA is an independent benefit-risk determination, not a comparison to a predicate.\n\nA PMA also includes a manufacturing section reviewed against the Quality System Regulation (QSR, transitioning to QMSR) and usually triggers a pre-approval establishment inspection. Most first-of-kind companion diagnostics historically went through PMA, frequently contemporaneously with the therapeutic\'s NDA/BLA. Post-approval, changes are handled through the PMA supplement hierarchy (Panel-Track, 180-Day, Real-Time, Special PMA Supplement, or 30-Day Notice) depending on the change\'s impact on safety/effectiveness; manufacturers also owe annual reports and any required post-approval studies.',
    keyPoints: [
      'Independent safety/effectiveness determination (not predicate comparison).',
      'Requires valid scientific evidence: strong analytical + clinical performance.',
      'Includes QS manufacturing review + typically a pre-approval inspection.',
      'Lifecycle via PMA supplements (Panel-Track / 180-Day / Real-Time / 30-Day Notice).',
    ],
    citations: [
      { label: 'FD&C Act §515 (PMA)', source: 'FDA' },
      { label: '21 CFR 814 (PMA)', source: 'FDA', url: 'https://www.ecfr.gov/current/title-21/part-814' },
      { label: 'Guidance: Modifications to Devices Subject to PMA (Supplements)', source: 'FDA' },
    ],
    related: ['fda.ivd.classification', 'fda.ivd.cdx', 'fda.ivd.510k-pathway'],
    tags: ['pma', 'class-iii', 'supplement', 'clinical-validation'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'fda.ivd.clia-categorization',
    domain: 'regulatory',
    topic: 'clia',
    title: 'CLIA complexity categorization and CLIA Waiver (incl. Dual Submission)',
    jurisdictions: ['US'],
    appliesTo: ['ivd'],
    summary:
      'Separate from premarket clearance, every IVD is categorized under CLIA as waived, moderate, or high complexity. FDA assigns categorization at clearance; a CLIA Waiver by Application (or the Dual 510(k)+CLIA Waiver) lets a test be used in CLIA-waived settings like physician offices and pharmacies.',
    detail:
      'CLIA (Clinical Laboratory Improvement Amendments, 42 USC 263a; 42 CFR 493) governs the laboratories that run tests, but its complexity categorization is assigned per test and matters enormously for market access. FDA categorizes a newly cleared/approved test using a seven-criteria scorecard (knowledge, training, reagent/material prep, operational steps, calibration/QC/proficiency, troubleshooting/maintenance, interpretation) into moderate or high complexity by default. Waived tests are simple, with an insignificant risk of erroneous result, and can be run by sites holding only a CLIA Certificate of Waiver.\n\nCLIA Waiver status dramatically expands the addressable market (physician office labs, pharmacies, urgent care, near-patient). A manufacturer obtains it via a CLIA Waiver by Application (CW), demonstrating the test is "simple" and accurate in the hands of untrained operators (typically flex/robustness studies and a method-comparison study at intended waived sites). The Dual 510(k) and CLIA Waiver by Application program lets a sponsor seek clearance and waiver simultaneously in one submission, and a 2020 statutory change/guidance discussions have addressed "least burdensome" data for waiver. Categorization also interacts with the 2017 CLIA-related guidances and with point-of-care intended-use claims.',
    keyPoints: [
      'CLIA categorization (waived / moderate / high) is assigned per test, separate from clearance.',
      'FDA scores complexity on seven criteria; default is moderate/high.',
      'CLIA Waiver opens POC/decentralized markets (offices, pharmacies, urgent care).',
      'Dual 510(k) + CLIA Waiver = one submission for clearance and waiver.',
    ],
    pitfalls: [
      'Designing a "near-patient" claim without the flex/robustness + lay-user data a waiver needs.',
      'Assuming clearance implies waiver — it does not.',
    ],
    citations: [
      { label: '42 USC 263a; 42 CFR 493 (CLIA)', source: 'CMS/FDA' },
      { label: 'Guidance: Recommendations for CLIA Waiver Applications', source: 'FDA' },
      { label: 'Guidance: Dual 510(k) and CLIA Waiver by Application', source: 'FDA' },
    ],
    related: ['fda.ivd.510k-pathway', 'legal.ivd.ldt-rule', 'fda.ivd.definition-and-ruo-iuo'],
    tags: ['clia', 'waiver', 'point-of-care', 'complexity', 'dual-submission'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'fda.ivd.cdx',
    domain: 'regulatory',
    topic: 'companion-diagnostics',
    title: 'Companion and complementary diagnostics (CDx) and contemporaneous review',
    jurisdictions: ['US'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'A companion diagnostic is an IVD essential for the safe and effective use of a corresponding therapeutic product. FDA expects contemporaneous development and review of the drug and Dx, cross-labeling, and analytical+clinical validation in the therapeutic trial population.',
    detail:
      'Per FDA\'s 2014 CDx guidance, a companion diagnostic provides information essential for the safe and effective use of a therapeutic product — e.g., selecting patients likely to benefit, identifying those at increased risk of serious adverse reactions, or monitoring response to adjust treatment. Because the drug label may restrict use to a biomarker-defined population, the CDx is typically a higher-risk device (often PMA or a De Novo) and is co-developed with the drug.\n\nThe expectation is contemporaneous review: the IVD and the therapeutic are reviewed by CDRH/OHT7 and CDER/CBER together so that the device is approved/cleared at or about the time the drug is approved, with each label cross-referencing the other. Analytical validation establishes the assay\'s performance (precision, LoD, reproducibility, specimen handling); clinical validation must demonstrate the assay\'s ability to identify the clinically relevant population, ideally using samples from the pivotal therapeutic trial (a "training/validation" design or bridging study when the trial used a clinical trial assay distinct from the market-ready device). A "complementary diagnostic" is a related but distinct concept: it aids benefit-risk decisions but is not a prerequisite for receiving the drug. Follow-on CDx for an already-approved drug class can sometimes use a 510(k)/De Novo when a predicate/special controls exist.',
    keyPoints: [
      'CDx = IVD essential to safe/effective use of a specific therapeutic.',
      'Contemporaneous FDA review of drug + Dx with reciprocal cross-labeling.',
      'Clinical validation should use the pivotal trial population (or a justified bridging study).',
      'Complementary Dx informs but is not required for treatment.',
    ],
    pitfalls: [
      'Clinical Trial Assay vs. market-ready device divergence without a bridging study.',
      'Treating the CDx timeline as downstream of the drug rather than parallel.',
    ],
    citations: [
      { label: 'Guidance: In Vitro Companion Diagnostic Devices (2014)', source: 'FDA' },
      { label: 'Guidance: Principles for Codevelopment of an IVD CDx with a Therapeutic (2016)', source: 'FDA' },
      { label: '21 CFR 814 (PMA pathway commonly used)', source: 'FDA' },
    ],
    related: ['fda.ivd.pma', 'fda.ivd.de-novo', 'eu.ivdr.companion-diagnostics', 'sci.ivd.clinical-performance-metrics'],
    tags: ['companion-diagnostic', 'cdx', 'co-development', 'bridging-study'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'fda.ivd.special-controls-and-standards',
    domain: 'regulatory',
    topic: 'controls-and-standards',
    title: 'Special controls, recognized consensus standards, and least burdensome evidence',
    jurisdictions: ['US'],
    appliesTo: ['ivd', 'cdx', 'samd'],
    summary:
      'Class II IVDs are governed by device-type special controls; conformance to FDA-recognized consensus standards (with a Declaration of Conformity) streamlines review under the least-burdensome principle.',
    detail:
      'Special controls are the device-type-specific requirements that, with general controls, provide reasonable assurance of safety and effectiveness for Class II devices: mandatory performance testing, specific labeling, clinical data expectations, design/validation requirements, and sometimes postmarket surveillance. They are published in the classification regulation or De Novo order for the device type and effectively define the evidentiary bar.\n\nFDA maintains a database of Recognized Consensus Standards; a sponsor may submit a Declaration of Conformity to a recognized standard instead of full underlying data, which is a primary lever of the "least burdensome" provisions (FD&C Act §513(i)(1)(D), §515(c)(5)). For IVDs the recognized set heavily features CLSI evaluation protocols (EP05 precision, EP06 linearity, EP07 interference, EP09 method comparison, EP17 detection capability, EP25 stability, EP28 reference intervals), ISO 13485, ISO 14971, ISO 15223-1 symbols, ISO 17511 metrological traceability, ISO 20916 clinical performance studies, and IEC 62304/62366 for software/usability. Aligning the validation plan to the recognized standards and the device-type special controls is the most efficient route to a defensible submission.',
    keyPoints: [
      'Special controls define the Class II evidentiary bar for a device type.',
      'Declaration of Conformity to recognized standards shortcuts data requirements.',
      'Recognized IVD standards center on the CLSI EP series + ISO/IEC quality/software standards.',
      '"Least burdensome" lets sponsors propose the minimum evidence that answers the question.',
    ],
    citations: [
      { label: 'FD&C Act §513(i)/§515(c)(5) (least burdensome)', source: 'FDA' },
      { label: 'FDA Recognized Consensus Standards database', source: 'FDA', url: 'https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfStandards/search.cfm' },
      { label: 'Guidance: Recognition and Use of Consensus Standards', source: 'FDA' },
    ],
    related: ['std.iso-13485', 'std.clsi-ep05', 'fda.ivd.510k-pathway', 'fda.ivd.de-novo'],
    tags: ['special-controls', 'recognized-standards', 'least-burdensome', 'clsi'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'fda.ivd.expedited-programs',
    domain: 'regulatory',
    topic: 'expedited-programs',
    title: 'Breakthrough Devices, STeP, and predetermined change control plans (PCCP) for AI',
    jurisdictions: ['US'],
    appliesTo: ['ivd', 'cdx', 'samd'],
    summary:
      'FDA offers expedited interaction (Breakthrough, STeP) for high-impact diagnostics and now authorizes Predetermined Change Control Plans so AI/ML-enabled IVDs can update within pre-agreed bounds without a new submission.',
    detail:
      'The Breakthrough Devices Program (FD&C Act §515B) grants priority review and intensive FDA interaction for devices that provide more effective treatment/diagnosis of life-threatening or irreversibly debilitating conditions and meet one of several criteria (breakthrough technology, no approved alternative, significant advantages, or best interest of patients). The Safer Technologies Program (STeP) extends similar engagement to non-life-threatening conditions where the device meaningfully improves safety. Both accelerate alignment but do not lower the approval standard.\n\nFor AI/ML-enabled diagnostics, the Predetermined Change Control Plan (PCCP) — codified by the FDORA 2022 amendment (FD&C Act §515C) and the 2024 final PCCP guidance — lets a sponsor pre-specify and get authorization for future modifications (the "what" via a Modification Protocol and the "how" via the SACP/impact assessment), so that in-scope model updates can be deployed without a new 510(k)/De Novo/PMA supplement. This is the maintenance backbone for adaptive algorithms and pairs with the IMDRF/Good Machine Learning Practice principles.',
    keyPoints: [
      'Breakthrough (§515B): priority + intensive interaction for high-impact diagnostics.',
      'STeP: similar engagement for safety-improving, non-life-threatening devices.',
      'PCCP (§515C / 2024 guidance): pre-authorized AI/ML changes without a new submission.',
      'Expedited status speeds engagement; it does not lower the evidence bar.',
    ],
    citations: [
      { label: 'FD&C Act §515B (Breakthrough Devices)', source: 'FDA' },
      { label: 'FD&C Act §515C (PCCP, FDORA 2022)', source: 'FDA' },
      { label: 'Guidance: Marketing Submission Recommendations for a PCCP (2024)', source: 'FDA' },
      { label: 'Guidance: Safer Technologies Program (STeP)', source: 'FDA' },
    ],
    related: ['fda.ivd.cdx', 'std.iec-62304', 'eu.ivdr.performance-evaluation'],
    tags: ['breakthrough', 'step', 'pccp', 'ai-ml', 'samd'],
    lastReviewed: '2026-06-09',
  },
];
