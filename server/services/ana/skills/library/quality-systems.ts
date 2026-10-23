/**
 * Quality systems skills: drug and biologic GMP and the pharmaceutical quality
 * system, the device QMSR and ISO 13485:2016, and the platform's Quality
 * records: SOPs, controlled documents, CAPA and deviations, change control,
 * data integrity, GMP and suppliers, complaint handling, and internal audits
 * and responses to audit and inspection findings.
 *
 * Device citations follow the QMSR crosswalk (shared/regulatory/qmsr-crosswalk.ts):
 * ISO 13485:2016 clauses through 21 CFR 820.10, removed QSR sections only as
 * "formerly" (docs/evidence/D2-ANA-SOP-EXPERTISE/2026-10-08).
 *
 * @module server/services/ana/skills/library/quality-systems
 */

import { skill, type LibrarySkillSource } from '../types.js';

const SOP_REQUIREMENTS = 'shared/regulatory/sop-requirements.ts';
const QMSR_CROSSWALK = 'shared/regulatory/qmsr-crosswalk.ts';
const GMP_KNOWLEDGE = 'server/services/gmp-quality-systems/gmp-quality-systems-knowledge.ts';

export const QUALITY_SYSTEMS_SKILLS: LibrarySkillSource[] = [
  skill({
    key: 'quality-systems',
    name: 'Quality systems',
    description:
      'Which quality requirements apply and how the quality system fits together: drug and biologic CGMP with ICH Q10, API GMP, the device QMSR and ISO 13485:2016, combination products, and the platform’s linked Quality records.',
    disciplines: ['quality-systems'],
    useCases: ['gap-analysis', 'review', 'strategy'],
    surfaces: ['quality'],
    documentTypes: ['QMS_QUALITY_MANUAL', 'QMS_QSR_820', 'QMS_ISO_13485', 'QMS_MDSAP'],
    triggers: [
      'quality system',
      'quality systems',
      'quality management system',
      'qms',
      'pharmaceutical quality system',
      'ich q10',
      'qmsr',
      'quality system regulation',
      'iso 13485',
      '21 cfr 820',
      'part 820',
      'cgmp',
      'part 211',
      '21 cfr 211',
      'quality manual',
      'management review',
      'quality unit',
      'mdsap',
      'combination product cgmp',
    ],
    tools: [
      'plan_combination_cgmp',
      'check_regulatory_currency',
      'assess_qms',
      'global_search',
    ],
    references: [
      { kind: 'standard', id: 'cfr_820_qmsr' },
      { kind: 'standard', id: 'iso_13485' },
      { kind: 'ich', id: 'Q10' },
      { kind: 'ich', id: 'Q9(R1)' },
      { kind: 'ich', id: 'Q7' },
      { kind: 'currency-fact', id: 'us-qmsr' },
      { kind: 'record', id: QMSR_CROSSWALK, label: 'QMSR crosswalk: ISO 13485:2016 clauses and the removed QSR sections' },
    ],
    instructions: `
## When this applies
Questions about a quality system as a whole, or about which quality requirements apply: drug and biologic CGMP and the pharmaceutical quality system, API GMP, the device QMSR and ISO 13485:2016, combination products, and how the platform's Quality records connect. The sub-skills carry SOPs, controlled documents, CAPA and deviations, change control, data integrity, and GMP and suppliers.

## Method
1. Establish the product type and the markets first; they decide the regulation.
   - Drugs: 21 CFR Parts 210 and 211, with ICH Q10 as the pharmaceutical quality system model and ICH Q9(R1) for quality risk management; EU GMP (EudraLex Volume 4) in the EU.
   - Biologics: the drug CGMP plus 21 CFR Parts 600 to 680.
   - Active pharmaceutical ingredients: ICH Q7.
   - Devices and IVDs: the QMSR, in force since 2026-02-02 (fact us-qmsr). 21 CFR 820.10 requires a quality management system that complies with ISO 13485:2016, incorporated by reference; 21 CFR 820.35 adds record requirements and 21 CFR 820.45 labeling and packaging controls. In the EU, the quality management system obligations of the MDR or IVDR.
   - Combination products: 21 CFR Part 4. \`plan_combination_cgmp\` returns the base quality system, the called-out provisions of the other system and their basis as of a date.
2. Cite device requirements by ISO 13485:2016 clause through 21 CFR 820.10, and name a removed QSR section only as "formerly". CAPA is ISO 13485:2016 §8.5.2 and §8.5.3, formerly 820.100; design and development is §7.3 through 21 CFR 820.10(c), formerly 820.30. The QMSR crosswalk record holds the mapping. If any output, a tool's included, cites a removed section as current, correct it and say so. \`check_regulatory_currency\` confirms the QMSR's status.
3. For a device QMS gap check, \`assess_qms\` returns the ISO 13485 clause structure with its QMSR mapping and auditor questions or, given the clauses in place, readiness and the missing clauses. It is an audit-preparation aid, not an audit verdict.
4. Search before creating. \`global_search\` finds existing QMS documents and records; extend or revise what exists rather than writing a second version beside it.
5. Route the work to the sub-skill that owns it, and keep the quality records linked: a deviation to its CAPA, a CAPA to the change it requires, a change to the documents it revises.
6. Clinical (GCP) quality and pharmacovigilance systems have their own methods; this one does not cover them.

## Before answering
- The governing regulation matches the product type: no drug CGMP for a device QMS, or the reverse.
- No removed QSR section is cited as current.
- Tool outputs are presented as aids, not determinations.

## Not AnA's to decide
- Quality decisions belong to the quality unit or, for devices, top management and the management representative: release, disposition, approval of procedures, acceptance of investigations.
- Audit and inspection outcomes are the auditor's and the agency's.
- AnA never approves, signs or acknowledges a quality record for anyone.
`,
  }),

  skill({
    key: 'quality-systems.sop-authoring',
    name: 'SOP writing and review',
    description:
      'Writing a new SOP, or reviewing an existing one, against the clause-level requirements for its topic and the product it governs: device SOPs to the QMSR and ISO 13485:2016, drug and biologic SOPs to 21 CFR 211 and ICH Q10.',
    disciplines: ['quality-systems'],
    useCases: ['drafting', 'review', 'gap-analysis'],
    triggers: [
      'sop',
      'sops',
      'standard operating procedure',
      'write an sop',
      'draft an sop',
      'review our sop',
      'sop review',
      'sop gap',
      'work instruction',
      'capa procedure',
      'deviation procedure',
      'complaint handling procedure',
      'document control procedure',
      'training procedure',
      'supplier qualification procedure',
      'internal audit procedure',
      'management review procedure',
      'change control procedure',
    ],
    tools: ['global_search', 'review_sop_requirements', 'generate_sop', 'create_qms_document'],
    references: [
      { kind: 'record', id: SOP_REQUIREMENTS, label: 'SOP requirements by topic and product type' },
      { kind: 'record', id: 'shared/regulatory/sop-review.ts', label: 'SOP review (wording check per requirement)' },
      { kind: 'record', id: QMSR_CROSSWALK, label: 'QMSR crosswalk' },
      { kind: 'currency-fact', id: 'us-qmsr' },
      { kind: 'ich', id: 'Q10' },
      { kind: 'standard', id: 'iso_13485' },
    ],
    instructions: `
## When this applies
Writing a new SOP or reviewing an existing one against what its topic requires for the product it governs: CAPA, deviations or nonconforming product, complaint handling, document control, training, supplier qualification, internal audit, management review and change control.

## Method
1. Establish the topic, the product type (drug, biologic or device), the regions and the date the SOP takes effect. The product type decides the citations: a device SOP answers to the QMSR and ISO 13485:2016; a drug SOP to 21 CFR 211 and ICH Q10; a biologic SOP adds 21 CFR 600 to 680. Ask for the product type when it is not known.
2. Search first with \`global_search\`. If the organization already has a procedure for the topic, review and revise it; do not write a second one beside it.
3. To review a client's SOP, run \`review_sop_requirements\` with the text, topic and product type. Each requirement comes back addressed, with the sentence that addresses it, or not_found. Not_found means no wording for it was found, not that the procedure is deficient; tell the person to read for it. Each requirement carries its basis (regulator text, recall or platform convention); say which when you cite it.
4. To draft, run \`generate_sop\` with the title, process type, product type, regions and owner role. It returns the SOP with a "Requirements this procedure addresses" section, each requirement with its basis, and region-appropriate references; a product type it had to assume is named as assumed.
5. Make the procedure executable: purpose, scope, responsibilities by role, definitions, numbered steps that say who does what, when, and in which record, the records produced, references and revision history. A step that states an intent ("ensure quality") without an action is rewritten as an action.
6. Cite correctly. Device clauses go through 21 CFR 820.10, with removed QSR sections only as "formerly". ICH Q10 CAPA is §3.2.2 and change management §3.2.3; there is no §3.2.5. EU GMP Annex 15 is qualification and validation, not training; personnel and training are EU GMP Chapter 2. Practices no regulation states, such as critical, major and minor deviation classes or a fixed document review interval, are written as the organization's convention, not as a requirement.
7. When the person accepts the draft, it becomes a controlled document through \`create_qms_document\` in draft status; review, approval and training then follow the controlled-documents method.

## Pitfalls reviewers raise
- A device SOP citing drug CGMP, or a drug SOP citing only ISO 13485.
- Removed QSR sections cited as current requirements.
- A CAPA procedure with no effectiveness check.
- Industry practice presented as a regulatory requirement.

## Before answering
- The product type and governing regulation are stated.
- Every requirement cited carries its basis.
- Review results are reported as addressed or not found, never as compliant.

## Not AnA's to decide
- Whether a procedure is adequate is the quality unit's judgment, and in the end an inspector's.
- An SOP takes effect only when a person other than its author approves it with an electronic signature.
`,
  }),

  skill({
    key: 'quality-systems.controlled-documents',
    name: 'Controlled documents and training acknowledgment',
    description:
      'Moving a controlled QMS document through its lifecycle in the Quality register: create, review, approve under Part 11, train, revise and retire. AnA prepares and explains; approval, retirement and acknowledgment are signed acts by people.',
    disciplines: ['quality-systems'],
    useCases: ['drafting', 'review'],
    triggers: [
      'controlled document',
      'controlled documents',
      'document control',
      'quality register',
      'approve the sop',
      'approve this document',
      'make it effective',
      'effective date',
      'retire the sop',
      'retire this document',
      'obsolete document',
      'revise the sop',
      'new revision',
      'controlled revision',
      'read and understood',
      'training acknowledgment',
      'training acknowledgement',
      'acknowledge training',
      'periodic review',
      'signature manifestation',
    ],
    tools: [
      'global_search',
      'create_qms_document',
      'compare_document_versions',
      'approve_qms_document',
      'render_signature_manifestation',
      'ack_training',
      'revise_qms_document',
      'retire_qms_document',
    ],
    references: [
      { kind: 'record', id: SOP_REQUIREMENTS, label: 'SOP requirements: document control and training' },
      { kind: 'record', id: QMSR_CROSSWALK, label: 'QMSR crosswalk: documentation and records' },
      { kind: 'standard', id: 'iso_13485' },
    ],
    instructions: `
## When this applies
Moving a controlled QMS document (SOP, work instruction, form, specification, policy, manual, validation protocol) through its lifecycle in the platform's Quality register: create, review, approve, train, revise, retire.

## Method
1. Find the document and its state first. \`global_search\` finds QMS documents by title or number. The states run draft, in review, effective, then superseded or retired. Only a draft can be edited; changing an effective document takes a controlled revision.
2. Create: \`create_qms_document\` with the title, document type, program and a stated reason opens a draft, optionally seeded from a template. The author writes the content in the editor.
3. Review: the author sends the draft for review in the Quality register; reviewers comment and the author resolves each comment. When a reviewer asks what changed between two texts, \`compare_document_versions\` gives the section-level and line-level differences.
4. Approve: approval makes the document effective and is an electronic signature under 21 CFR Part 11, with the signer's password and second factor, made in the Quality register by a person other than the author. \`approve_qms_document\` writes nothing; use it only to explain this and send the person to the document. For a printed or rendered copy of a signed record, \`render_signature_manifestation\` produces the 21 CFR 11.50 manifestation (printed name, date and time, meaning of the signature) for an executed signature.
5. Train: each affected person acknowledges the released revision themselves. \`ack_training\` writes nothing; it directs the person to Quality to read the revision and acknowledge it. Whether read-and-understood is enough or competence must be assessed is set by the organization's training procedure; for devices, ISO 13485:2016 §6.2 requires the effectiveness of training to be evaluated.
6. Revise: \`revise_qms_document\` with a reason opens the next major version in draft and clears the prior approval, so the revision is reviewed and approved again. A revision that implements a change is linked to its change record under change control.
7. Retire: retirement ends effective status and is also an electronic signature. \`retire_qms_document\` writes nothing; use it to explain and send the person to Quality.
8. Records: superseded versions stay retrievable as records, kept as the governing rule requires (21 CFR 211.180 for drugs; ISO 13485:2016 §4.2.5 with 21 CFR 820.35 for devices).

## Before answering
- The document's current state was checked before any action.
- Every write carries the person's stated reason.
- Nothing is described as approved, effective, retired or acknowledged unless a person did it.

## Not AnA's to decide
- AnA never approves, retires or signs a document, and never acknowledges training for anyone; each is a signed act by a person with the authority.
- The effective date and the training required on release are decided by the document owner and the quality unit.
`,
  }),

  skill({
    key: 'quality-systems.capa-and-deviations',
    name: 'Deviations, nonconformances and CAPA',
    description:
      'Classifying and investigating GMP deviations, out-of-specification results, nonconforming product and complaints, finding the root cause, and planning CAPA with effectiveness checks, for drug GMP and device quality systems.',
    disciplines: ['quality-systems'],
    useCases: ['analysis', 'review'],
    triggers: [
      'capa',
      'corrective and preventive action',
      'corrective action',
      'preventive action',
      'root cause',
      'root cause analysis',
      'gmp deviation',
      'deviation investigation',
      'deviation classification',
      'nonconforming product',
      'nonconformance',
      'ncr',
      'out of specification',
      'oos investigation',
      'field alert report',
      'biological product deviation',
      'bpdr',
      'effectiveness check',
      'fishbone',
      '5 whys',
    ],
    tools: [
      'classify_gmp_deviation',
      'log_nonconforming_product',
      'assess_mdr_reportability',
      'lookup_fda_guidance',
      'design_capa',
      'qms_change_link',
    ],
    references: [
      { kind: 'ich', id: 'Q10' },
      { kind: 'ich', id: 'Q9(R1)' },
      { kind: 'standard', id: 'iso_13485' },
      { kind: 'standard', id: 'cfr_820_qmsr' },
      { kind: 'record', id: SOP_REQUIREMENTS, label: 'SOP requirements: CAPA, deviation and complaint handling' },
      { kind: 'record', id: GMP_KNOWLEDGE, label: 'GMP quality systems knowledge: deviation classification and CAPA design' },
    ],
    instructions: `
## When this applies
A deviation, out-of-specification result, nonconforming product, complaint or audit finding that needs classifying, investigating and correcting, and the CAPA that follows: root cause, actions, effectiveness and closure, for drug and biologic GMP and for device quality systems.

## Method
1. Establish the event and its context: what happened and in which area; the product and the batches or lots; whether material was distributed; whether the product is sterile; any patient-safety impact; whether a specification failure is confirmed; whether it has happened before. A clinical protocol deviation belongs to the clinical method, not this one.
2. Contain first: hold or segregate affected material and record the correction taken.
3. Classify a GMP deviation with \`classify_gmp_deviation\`. It returns a class with its rationale, a handling timeline, product-impact and disposition guidance, whether a field alert report (21 CFR 314.81(b)(1)) or a recall evaluation is triggered, whether a CAPA is required, and citations. A fact left out comes back undetermined; report it so. Critical, major and minor are a risk-based convention, not categories a regulation defines; the organization's SOP governs. For a licensed biologic, a biological product deviation report under 21 CFR 600.14 may also apply.
4. Device nonconforming product: log it with \`log_nonconforming_product\` (number, description, device, lot or serial, source). Disposition follows ISO 13485:2016 §8.3 through 21 CFR 820.10 (formerly 820.90). When the source is a complaint involving an adverse event, reportability is a separate question: \`assess_mdr_reportability\` computes the FDA medical device reporting and EU vigilance triggers from the event facts.
5. Investigate thoroughly and extend the investigation to other batches and products that may be affected (21 CFR 211.192). An out-of-specification result is investigated in the laboratory before any result is invalidated; name FDA's guidance on OOS investigations by topic and confirm it with \`lookup_fda_guidance\` before citing.
6. Plan the CAPA with \`design_capa\`: an objective problem statement; a root-cause method suited to the problem (5 Whys, fishbone, FMEA, fault tree or is/is-not); correction, corrective action and preventive action kept distinct; effectiveness checks with measures, timing and acceptance criteria; closure conditions; all scaled to risk under ICH Q9(R1). For devices the requirements are ISO 13485:2016 §8.5.2 and §8.5.3 (formerly 820.100); for drugs, 21 CFR 211.192 and ICH Q10 §3.2.2.
7. When an action changes a procedure, process, specification or design, raise it through change control and link the records with \`qms_change_link\`.
8. Close only on evidence that the actions worked. Feed deviations, investigations and CAPA into trending, management review and, for drugs, the annual product review (21 CFR 211.180(e)).

## Pitfalls reviewers raise
- "Human error" as the root cause with no look at why the system allowed it; retraining as the only action.
- Investigations that stop at the batch in hand.
- CAPA closed without an effectiveness check, or with "no recurrence" as the measure and no period defined.
- Recurring deviations never linked to each other.

## Before answering
- Classification, timelines and reporting triggers are reported as the tool returned them, with anything undetermined named.
- Correction, corrective action and preventive action are kept distinct.

## Not AnA's to decide
- The quality unit decides classification, disposition, batch release and closure.
- Whether to file a field alert, a biological product deviation report, a medical device report or to recall is the firm's decision; recall classification is the agency's.
`,
  }),

  skill({
    key: 'quality-systems.change-control',
    name: 'Change control and regulatory impact',
    description:
      'Raising, assessing, approving, implementing and closing a controlled change, with its impact on product quality, documents and validation, and the regulatory filing it may need in each market.',
    disciplines: ['quality-systems', 'cmc'],
    useCases: ['lifecycle-change', 'analysis'],
    triggers: [
      'change control',
      'change request',
      'change management',
      'change impact',
      'raise a change',
      'post-approval change',
      'reporting category',
      'prior approval supplement',
      'cbe-30',
      'cbe-0',
      'annual reportable',
      'variation classification',
      'type ii variation',
      'type ib variation',
      'design change',
      'site transfer',
    ],
    tools: [
      'qms_change_create',
      'classify_post_approval_change',
      'global_ri_post_approval_change',
      'lookup_fda_guidance',
      'qms_change_transition',
      'qms_change_link',
      'revise_qms_document',
    ],
    references: [
      { kind: 'record', id: 'shared/regulatory/change-control-taxonomy.ts', label: 'Change-control taxonomy: scopes and filing vehicles' },
      { kind: 'record', id: SOP_REQUIREMENTS, label: 'SOP requirements: change control' },
      { kind: 'ich', id: 'Q10' },
      { kind: 'ich', id: 'Q9(R1)' },
      { kind: 'ich', id: 'Q12' },
      { kind: 'standard', id: 'cfr_314' },
      { kind: 'currency-fact', id: 'us-qmsr' },
    ],
    instructions: `
## When this applies
A proposed change to a product, process, facility, equipment, method, specification, supplier, document, software or design that must be assessed, approved, implemented and verified under change control, and the regulatory filing it may need.

## Method
1. Establish what changes, why, the product type, and its status in each market (in development under an IND, approved, cleared, CE-marked). The change-control taxonomy record names the scopes: site, process, specification, analytical method, shelf life, labeling, indication, formulation, container closure, software, design, sterilisation, materials.
2. Raise the change with \`qms_change_create\` (status proposed): the description, type, classification, risk level, reason, impact assessment and implementation plan, as the person states them.
3. Assess the impact with quality risk management (ICH Q9(R1)), drawing on the expertise the change touches (ICH Q10 §3.2.3): product quality and validation status, stability, specifications and methods, documents and batch records, training, suppliers, other products, labeling and regulatory commitments.
4. Assess the regulatory impact by product type:
   - Approved drug or biologic: \`classify_post_approval_change\` returns the US reporting category (prior approval supplement, CBE-30, CBE-0 or annual report under 21 CFR 314.70, or 601.12 for a BLA) and the EU variation type, with citations. For Japan or Canada, \`global_ri_post_approval_change\` returns that market's filing vehicle. Both are decision aids; report the category with its basis. ICH Q12 tools (established conditions, a post-approval change management protocol) can change what is reportable where they have been agreed.
   - Investigational drug: chemistry, manufacturing and controls changes are reported to the IND in an information amendment (21 CFR 312.31); protocol changes in a protocol amendment (21 CFR 312.30).
   - Device: design changes are controlled under ISO 13485:2016 §7.3.9 through 21 CFR 820.10(c) (formerly 820.30(i)). Whether a change needs a new 510(k) (21 CFR 807.81(a)(3)) or a PMA supplement (21 CFR 814.39) is assessed against FDA's guidance on deciding when to submit a 510(k) for a change; confirm it with \`lookup_fda_guidance\`. In the EU, assess whether the change must go to the notified body before it is made.
5. Approval: \`qms_change_transition\` advances the change (proposed, under assessment, in implementation, verification, closed) with a reason. It cannot approve: approval is an electronic signature in the Quality register by someone other than the person who proposed the change.
6. Implement only when the required approvals, internal and regulatory, are in place; a change in a prior-approval category waits for the agency.
7. Link the records with \`qms_change_link\` (deviations, CAPA, validation protocols, controlled documents), and open controlled revisions of affected documents with \`revise_qms_document\`.
8. Close with the post-implementation evaluation: whether the change met its objective without harming product quality (ICH Q10 §3.2.3). Pass the effectiveness review when closing.

## Before answering
- Regulatory impact is assessed for every market the product is in.
- Reporting categories are given as the tool's classification with its basis, not as the agency's decision.

## Not AnA's to decide
- The quality unit approves changes; regulatory affairs decides the filing; the agency or notified body has the final word on the category.
- AnA never approves a change.
`,
  }),

  skill({
    key: 'quality-systems.data-integrity',
    name: 'Data integrity and computerized systems',
    description:
      'Whether GxP records and the systems that hold them can be trusted: ALCOA+ assessment, audit trails and their review, 21 CFR Part 11 and EU GMP Annex 11 controls, and risk-based computerized system validation.',
    disciplines: ['quality-systems'],
    useCases: ['gap-analysis', 'review'],
    triggers: [
      'data integrity',
      'alcoa',
      'part 11',
      '21 cfr part 11',
      'audit trail',
      'audit trail review',
      'electronic records',
      'electronic signatures',
      'computer system validation',
      'computerized system validation',
      'computerised system',
      'computer software assurance',
      'gamp 5',
      'gamp category',
      'annex 11',
      'hybrid records',
      'shared login',
    ],
    tools: [
      'assess_data_integrity',
      'advise_data_integrity',
      'assess_computer_system_validation',
      'lookup_fda_guidance',
    ],
    references: [
      { kind: 'record', id: GMP_KNOWLEDGE, label: 'GMP quality systems knowledge: data integrity and computer system validation' },
      { kind: 'ich', id: 'Q9(R1)' },
    ],
    instructions: `
## When this applies
Whether records and the systems that hold them are trustworthy: ALCOA+ assessment of a record or dataset, audit trails and their review, 21 CFR Part 11 and EU GMP Annex 11 controls, and risk-based validation of computerized systems.

## Method
1. Establish the record and why it matters: what it is; its format (paper, hybrid or electronic); the GxP area; the predicate rule that requires it; and whether it supports batch release or patient safety. Part 11 applies to electronic records kept under FDA's record requirements (the predicate rules) and to electronic records submitted to FDA, and to the electronic signatures on them.
2. Assess the record with \`assess_data_integrity\`: per-attribute ALCOA+ findings (attributable, legible, contemporaneous, original, accurate, complete, consistent, enduring, available), the audit-trail expectation and the review frequency the engine sets by risk, lifecycle-stage risks with key controls, an overall risk rating and citations. For the principles themselves, or a quick cue-based gap check of a described process, use \`advise_data_integrity\`.
3. Assess the system with \`assess_computer_system_validation\`: the GAMP 5 software category; the assurance approach, from unscripted to fully scripted testing, scaled to risk; the Part 11 controls that apply (validation, secure time-stamped audit trails, access and authority checks, signature manifestation and signature-record linking); and the validation deliverables for that category and risk.
4. Audit trails record who changed what, when and why without obscuring the original entry. For critical data they are reviewed as part of the record review, before the data are used for a decision.
5. Look for the patterns inspectors cite: shared or generic logins; audit trails disabled or never reviewed; unofficial trial runs before the reported one; data deleted or reprocessed without justification; uncontrolled blank forms; entries made after the fact.
6. Name guidance by topic as the tools cite it (FDA's guidance on data integrity and drug CGMP and on computer software assurance, MHRA and PIC/S data-integrity guidance, EU GMP Annex 11). Confirm an FDA guidance with \`lookup_fda_guidance\` before citing it, and check which version of Annex 11 is in force before quoting it.

## Before answering
- The record's predicate rule and criticality are stated.
- Ratings and review frequencies are the engine's, reported as returned.
- Each gap is listed with the control that would close it.

## Not AnA's to decide
- Whether a system is validated and released for GxP use is the quality unit's decision on the validation evidence.
- Investigating a suspected data integrity failure, and reporting it, belong to the firm's quality and legal functions.
`,
  }),

  skill({
    key: 'quality-systems.gmp-and-suppliers',
    name: 'GMP operations, suppliers and inspection readiness',
    description:
      'GMP expectations for a manufacturing operation and the suppliers it depends on: API steps under ICH Q7, sterile manufacturing controls, investigational product manufacture, supplier and contract manufacturer qualification, and inspection readiness.',
    disciplines: ['quality-systems', 'cmc'],
    useCases: ['gap-analysis', 'review', 'strategy'],
    documentTypes: ['QMS_GMP_INSPECTION'],
    triggers: [
      'gmp',
      'good manufacturing practice',
      'ich q7',
      'api gmp',
      'annex 1',
      'contamination control strategy',
      'aseptic processing',
      'media fill',
      'cleanroom grade',
      'supplier qualification',
      'supplier audit',
      'vendor qualification',
      'approved supplier list',
      'quality agreement',
      'contract manufacturer',
      'cdmo',
      'phase 1 gmp',
      'gmp inspection',
      'pre-approval inspection',
      'inspection readiness',
      'form 483',
    ],
    tools: [
      'lookup_fda_guidance',
      'assess_api_gmp',
      'design_sterile_controls',
      'register_supplier',
      'assess_inspection_readiness',
    ],
    references: [
      { kind: 'ich', id: 'Q7' },
      { kind: 'ich', id: 'Q10' },
      { kind: 'ich', id: 'Q9(R1)' },
      { kind: 'record', id: SOP_REQUIREMENTS, label: 'SOP requirements: supplier qualification' },
      { kind: 'record', id: QMSR_CROSSWALK, label: 'QMSR crosswalk: purchasing' },
      { kind: 'record', id: GMP_KNOWLEDGE, label: 'GMP quality systems knowledge: ICH Q7 and sterile controls' },
    ],
    instructions: `
## When this applies
GMP expectations for a manufacturing operation and the suppliers it depends on: API steps under ICH Q7, sterile manufacturing controls, investigational product manufacture, supplier and contract manufacturer qualification, and readiness for an inspection.

## Method
1. Establish what is made, where and at what stage: API or intermediate, drug product, sterile product, biologic, or a device component; in-house or at a contract manufacturer; investigational or commercial. Most phase 1 investigational drugs are exempt from Part 211 under 21 CFR 210.2(c), but are still made under the controls FDA describes in its guidance on CGMP for phase 1 investigational drugs; confirm that guidance with \`lookup_fda_guidance\` before citing it.
2. API: \`assess_api_gmp\` with the manufacturing step returns its GMP stringency under ICH Q7 (GMP applies from the introduction of the API starting material and increases toward the final API), the critical controls for the step, change-control guidance and the expectation of an independent quality unit.
3. Sterile products: \`design_sterile_controls\` returns an EU GMP Annex 1 contamination control strategy: the sterilisation approach chosen by rule, the barrier technology, cleanroom grades, environmental monitoring and aseptic process simulation. Report its values as returned; the site's own qualification data decide the specifics.
4. Suppliers and contractors, by risk:
   - qualify before use: an assessment or audit scaled to the material's criticality, and a written quality agreement that defines responsibilities with a contract facility (FDA has guidance on quality agreements for contract manufacturing; confirm it before citing);
   - control incoming material: for drugs, at least one identity test on each component lot, and a supplier's certificate of analysis relied on only with that test and periodic validation of the supplier's results (21 CFR 211.84);
   - monitor and re-evaluate suppliers (ICH Q10 §2.7; for devices, ISO 13485:2016 §7.4 through 21 CFR 820.10, formerly 820.50).
   When the person decides to add a supplier, \`register_supplier\` records it with its criticality. The audit schedule it attaches is the platform's convention, not a regulatory interval; say so.
5. Inspection readiness for a GMP or pre-approval inspection: current procedures and training records; open deviations and CAPA with their status; data integrity; change control; supplier files; the latest annual product review; and a plan for handling requests during the inspection. \`assess_inspection_readiness\` scores clinical (BIMO) inspection readiness only; use it for a sponsor, CRO, investigator or IRB inspection, not for a GMP one, and say which it covers.

## Before answering
- The GMP framework matches the product and the development stage.
- Engine outputs are reported as returned; the site's data, not defaults, decide specifics.
- The scope of any readiness score is stated.

## Not AnA's to decide
- Batch release is the quality unit's decision, and in the EU a Qualified Person's certification.
- Supplier approval is the quality unit's; inspection outcomes and classifications are the agency's.
`,
  }),

  skill({
    key: 'quality-systems.complaint-handling',
    name: 'Complaint handling',
    description:
      'Handling complaints about devices, IVDs, medicines and biologics: intake and the decision that feedback is a complaint, complaint records, same-day triage for adverse events and quality defects, investigation or its documented omission, trending and closure, with the hand-offs to vigilance, pharmacovigilance and CAPA.',
    disciplines: ['quality-systems', 'safety'],
    useCases: ['analysis', 'review', 'drafting'],
    triggers: [
      'complaint intake',
      'complaint evaluation',
      'complaint investigation',
      'complaint investigations',
      'complaint triage',
      'complaint trending',
      'complaint trends',
      'complaint file',
      'complaint files',
      'complaint records',
      'customer complaint',
      'customer complaints',
      'product complaint',
      'product complaints',
      'product quality complaint',
      'product quality complaints',
      'quality defect',
      'returned product',
      'returned device',
      '211.198',
      '8.2.2',
    ],
    tools: [
      'assess_mdr_reportability',
      'classify_expedited_reporting',
      'classify_gmp_deviation',
      'log_nonconforming_product',
      'design_capa',
      'global_search',
      'review_sop_requirements',
      'lookup_fda_guidance',
    ],
    references: [
      { kind: 'standard', id: 'iso_13485' },
      { kind: 'standard', id: 'cfr_820_qmsr' },
      { kind: 'standard', id: 'iso_14971' },
      { kind: 'ich', id: 'Q10' },
      { kind: 'ich', id: 'Q9(R1)' },
      { kind: 'currency-fact', id: 'us-qmsr' },
      { kind: 'record', id: SOP_REQUIREMENTS, label: 'SOP requirements: complaint handling for devices (ISO 13485:2016 §8.2.2) and drugs (21 CFR 211.198)' },
      { kind: 'record', id: QMSR_CROSSWALK, label: 'QMSR crosswalk: feedback, complaint handling and the 21 CFR 820.35 complaint record' },
    ],
    instructions: `
## When this applies
A complaint about a device, IVD, medicine or biologic, or a complaint process to set up or check: intake, deciding what counts as a complaint, records, triage for safety and quality, investigation, trending and closure. Filing a device report is the device vigilance skill's; investigation technique and CAPA are the deviations and CAPA skill's; writing the complaint SOP is the SOP skill's.

## Method
1. Establish the product type and markets, who received the information and when, what is alleged, whether anyone was harmed, whether the product or a sample can be returned, and its lot, serial number or UDI. Reporting clocks run from when the firm had the information, not from when the complaint unit logged it, so record the receipt date as it happened.
2. Decide whether the feedback is a complaint, and record why when it is not.
   - Device: ISO 13485:2016 defines a complaint as a communication alleging deficiencies in identity, quality, durability, reliability, usability, safety or performance after release. Under the QMSR complaint handling is clause 8.2.2 through 21 CFR 820.10 (formerly 820.198), and 21 CFR 820.35 sets record content, including any UDI.
   - Drug or biologic: written and oral complaints are handled under a written procedure and recorded with the content 21 CFR 211.198 sets; in the EU, EU GMP Chapter 8 covers complaints and quality defects.
   Take requirement wording from the SOP requirements record and the QMSR crosswalk.
3. Triage two questions in parallel on the day the information arrives, and record both answers:
   - Safety. A device event goes to \`assess_mdr_reportability\`, which returns the FDA medical device reporting and EU vigilance triggers and clock; the device vigilance skill drafts the report. An adverse event in a drug or biologic complaint goes to pharmacovigilance: \`classify_expedited_reporting\` returns the expedited obligation and clock from the seriousness, expectedness and relatedness the person states.
   - Quality. A possible defect in a distributed drug batch goes to \`classify_gmp_deviation\`, which returns whether a field alert report or a recall evaluation is triggered; for a licensed biologic, consider a biological product deviation report.
   Report each result as returned; a fact left out stays undetermined.
4. Investigate, or document why not (for example, the same failure already investigated, with that record referenced). For a drug, the quality unit reviews any complaint involving a possible failure to meet specifications and decides on investigation under 21 CFR 211.192. Examine the returned sample, production records, retained samples and earlier complaints of the same failure mode.
5. A confirmed device defect is logged with \`log_nonconforming_product\` (source complaint). A systemic cause opens a CAPA: \`design_capa\` with source complaint or trend returns the problem statement, root-cause method and effectiveness checks.
6. Trending: code complaints consistently (failure mode, device problem and patient problem, using IMDRF terms for devices where the organization adopts them), normalise by units distributed, and fix the method and thresholds in the procedure before the data arrive. Thresholds are the organization's; AnA does not supply them. Trends feed CAPA, the ISO 14971 post-production review, management review, the annual product review for drugs (21 CFR 211.180(e)) and, for devices in the EU, post-market surveillance and trend reporting.
7. A combination product complaint can raise drug and device duties at once under 21 CFR Part 4; assess both.
8. Close with the reply to the complainant where due, the investigation outcome, actions and the reportability decision on the record. Find related records with \`global_search\` first; check a complaint procedure with \`review_sop_requirements\` (topic complaint_handling). Confirm any FDA guidance cited with \`lookup_fda_guidance\`.

## Pitfalls reviewers raise
- Feedback screened out as not a complaint with no rationale.
- A complaint closed with no reportability decision, or an awareness date later than receipt.
- No investigation and no justification for skipping one.
- Trend thresholds set after seeing the data, or trends with no denominator.

## Before answering
- Reportability, clocks and field-alert triggers come from the tools, quoted as returned.
- Device citations are QMSR and ISO 13485:2016; 820.198 appears only as "formerly".

## Not AnA's to decide
- Whether feedback is a complaint, whether to investigate, reportability and closure are the firm's, through its quality unit or management representative.
- AnA does not file a report or close a complaint.
`,
  }),

  skill({
    key: 'quality-systems.audits-and-inspections',
    name: 'Internal audits and audit or inspection findings',
    description:
      'Running an internal audit programme for a device or GMP quality system, conducting an audit, and responding to findings from internal, supplier, notified body and MDSAP audits and regulator inspections, including a written response to FDA Form 483 observations. Inspection readiness is the GMP and suppliers and GCP operations skills.',
    disciplines: ['quality-systems'],
    useCases: ['review', 'gap-analysis', 'agency-interaction', 'drafting'],
    triggers: [
      'internal audit',
      'internal audits',
      'internal audit program',
      'internal audit programme',
      'audit programme',
      'audit schedule',
      'audit finding',
      'audit findings',
      'audit nonconformity',
      'self-inspection',
      'lead auditor',
      'auditor qualification',
      'iso 19011',
      '483 response',
      '483 observations',
      'respond to the 483',
      'response to the 483',
      'inspectional observations',
      'inspection observations',
      'inspection findings',
      'warning letter response',
      'establishment inspection report',
      'mdsap audit',
      'mdsap nonconformity',
      'notified body audit',
      'surveillance audit',
      'unannounced audit',
    ],
    tools: [
      'check_regulatory_currency',
      'assess_qms',
      'review_sop_requirements',
      'lookup_fda_guidance',
      'design_capa',
      'qms_change_link',
      'global_search',
      'search_regulatory_correspondence',
    ],
    references: [
      { kind: 'standard', id: 'iso_13485' },
      { kind: 'standard', id: 'cfr_820_qmsr' },
      { kind: 'ich', id: 'Q10' },
      { kind: 'currency-fact', id: 'us-qmsr' },
      { kind: 'record', id: SOP_REQUIREMENTS, label: 'SOP requirements: internal audit for devices (ISO 13485:2016 §8.2.4) and drug GMP (self-inspection)' },
      { kind: 'record', id: QMSR_CROSSWALK, label: 'QMSR crosswalk' },
    ],
    instructions: `
## When this applies
Planning and running internal audits, conducting a supplier audit, and responding to findings from internal, supplier, notified body and MDSAP audits and regulator inspections, including FDA Form 483 observations. Inspection preparation is the GMP and suppliers skill's (manufacturing) and the GCP operations skill's (clinical); which suppliers to audit, and how often, is the GMP and suppliers skill's.

## Method
1. Establish the quality system and its rule. For a device QMS, internal audit is ISO 13485:2016 clause 8.2.4 through 21 CFR 820.10 under the QMSR (formerly 820.22); confirm the QMSR's status with \`check_regulatory_currency\`. For drug or biologic GMP, 21 CFR Part 211 has no internal-audit section; ICH Q10 and EU GMP Chapter 9 (self-inspection) set the expectation. The SOP requirements record holds the elements for each.
2. The programme covers every process and site over a planned cycle, with each interval set by risk and by earlier results (open CAPA, complaints, changes, prior findings). Write it as the organization's plan with the reasoning for each interval; no regulation fixes one.
3. Auditors are trained and competent and never audit their own work. ISO 19011 guides audit management and auditor competence; cite it as guidance.
4. Each audit has a scope, criteria (regulation, standard clauses and the organization's procedures), a plan, evidence from interviews, observation and records, and a report stating each finding against its requirement with the objective evidence. For a device QMS, \`assess_qms\` returns the ISO 13485 clause structure with auditor questions for the checklist; it is a preparation aid, not a verdict. To check an internal audit procedure, run \`review_sop_requirements\` (topic internal_audit) and report each requirement as addressed or not found.
5. Grade internal findings on the organization's own scale and say it is the organization's convention. External grading differs: EU GMP inspectorates classify deficiencies as critical, major or other; MDSAP grades each nonconformity on its own system, and the grade sets the response and reporting timeline; a notified body sets its own deadlines. Take every timeline from the report or current programme documents.
6. FDA Form 483: the observations are the investigator's, listed at the close of the inspection, and are not a final agency determination. Respond in writing, observation by observation:
   - the observation quoted;
   - agreement, or disagreement with evidence;
   - the investigation and root cause;
   - correction, corrective action and preventive action, kept distinct and extended to other products, lines and sites that share the cause;
   - completed actions with evidence, open actions with owners and dates, and the effectiveness check;
   - a commitment to update FDA as actions close.
   Confirm FDA's current policy on how promptly a response must arrive to be considered with \`lookup_fda_guidance\`; never state the period from memory. A warning letter response follows the same structure at the level of the whole system.
7. Plan each action with \`design_capa\` (source audit_finding or inspection_observation) and link it to the changes it needs with \`qms_change_link\`. Search earlier records of the same issue with \`global_search\` first; a repeat finding is a systemic signal, named as one. With the regulatory mailbox connected, \`search_regulatory_correspondence\` retrieves the agency's letters.
8. Keep audit reports, responses and evidence of closure. The SOP requirements record notes, from recall not yet checked against the regulation's text, that under the QMSR FDA may review internal audit, supplier audit and management review reports the former QSR exempted; confirm against the QMSR before advising what an investigator may see.
9. Audit results and the status of inspection commitments are inputs to management review.

## Pitfalls reviewers raise
- Retraining as the only action, or a fix for the investigator's example but not the system.
- Actions without owners, dates or effectiveness checks; commitments that slip without an update.
- Disagreement asserted without evidence.
- Auditors auditing their own area, or a programme that skips high-risk processes.

## Before answering
- Every response timeline and grade comes from the report, programme documents or confirmed guidance.
- Each finding is quoted with the requirement it cites; correction, corrective and preventive action stay distinct.

## Not AnA's to decide
- Findings, their classification and the outcome of a response are the auditor's or the agency's.
- The response is the firm's, signed by its management; AnA drafts and checks it.
`,
  }),
];
