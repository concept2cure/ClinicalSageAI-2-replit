/**
 * Canonical CTD authoring-guidance overlay — the SINGLE home for per-section
 * authoring prose across the FDA drug lifecycle (IND -> NDA/BLA). Keyed by
 * canonical (plain, no "m" prefix) CTD code. Consumed by every authoring rail
 * (the deep IND eCTD tree, the marketing blueprints, the IND section registry)
 * via getCtdAuthoringGuidance() so guidance never drifts between copies.
 *
 * GENERATED from a multi-agent authoring pass and reviewed for structure. The
 * content is REFERENCE + ADVISORY: it defines what a complete section contains
 * and the governing ICH/FDA references; the sponsor owns every scientific and
 * clinical conclusion. No study data is fabricated here.
 *
 * @module server/services/ind/ctd/authoring-guidance
 */
import type { CtdSection } from './types.js';

export const CTD_AUTHORING_GUIDANCE: Record<string, CtdSection> = {
  "1.1.1": {
    "code": "1.1.1",
    "title": "Form FDA 1571 — Investigational New Drug Application",
    "module": 1,
    "moduleName": "Administrative",
    "required": true,
    "requiredFor": [
      "IND"
    ],
    "contentType": "form",
    "guidance": "Form FDA 1571 is the mandatory cover form for every IND submission and every subsequent amendment. It captures sponsor identity, the drug, the phase(s) of investigation, a contents checklist, and the sponsor's binding commitments under 21 CFR Part 312.",
    "authoringGuidance": "Form FDA 1571 is the official transmittal and legal commitment form required by 21 CFR 312.23(a)(1) for the original IND and by 312.30/312.31 for amendments. The reviewer uses it to confirm the sponsor, the drug identity, the serial number continuity of the IND, the phase of the studies, and — critically — that the sponsor has affirmatively agreed to the Part 312 obligations (not to begin studies until 30 days after FDA receipt or upon notification, to comply with IRB and safety-reporting requirements). Acceptability depends on an unbroken, correctly incremented serial number, a completed contents checklist that matches the actual submission, and signature by the sponsor or an authorized representative with a U.S. agent named if the sponsor is foreign. Every field must be internally consistent with the cover letter and the eCTD backbone.",
    "keyContentElements": [
      "Name, address, and telephone of sponsor",
      "Date of submission and the IND serial number (0000 for original, incrementing sequentially)",
      "Name of the drug (proprietary and established) and indication under study",
      "Phase(s) of clinical investigation to be conducted (Phase 1/2/3)",
      "Identification of whether the submission is an original IND, protocol amendment, information amendment, IND safety report, annual report, or response to clinical hold",
      "Contents checklist (items 1–12) cross-referenced to the submission's location",
      "Name and title of the person responsible for monitoring the conduct and progress of the investigation",
      "Name and title of the person responsible for review and evaluation of safety information",
      "Sponsor/authorized representative signature, printed name, title, and date; U.S. agent if sponsor is foreign",
      "Transfer-of-obligations statement if any sponsor obligations are transferred to a CRO"
    ],
    "generationPrompt": "Prepare the field-completion guidance and a completed-example narrative for Form FDA 1571 for {{SPONSOR}}'s original IND for {{PRODUCT_NAME}} in {{INDICATION}}, {{PHASE}}. Populate sponsor identity, drug name, indication, phase, and serial number 0000; complete the item 1–12 contents checklist mapped to eCTD locations; name the individual responsible for monitoring the investigation and the individual responsible for safety review; and include the sponsor commitment and signature block. Use bracketed placeholders for names, addresses, and dates. Note where a U.S. agent must be added if {{SPONSOR}} is foreign.",
    "parentCode": "1.1",
    "commonPitfalls": [
      "Serial number errors or gaps that break IND lifecycle continuity and confuse the reviewer's chronology",
      "Contents checklist boxes checked that do not correspond to material actually present in the submission",
      "Missing or non-authorized signatory, or a foreign sponsor without a named U.S. agent",
      "Failing to name distinct individuals responsible for overall monitoring versus safety review as Part 312 requires",
      "Phase designation inconsistent with the protocol in Module 5, prompting a reviewer query"
    ],
    "wordCountRange": [
      150,
      400
    ],
    "dependencies": [
      "1.2",
      "1.1.2",
      "1.1.3"
    ]
  },
  "1.1.2": {
    "code": "1.1.2",
    "title": "Form FDA 1572 — Statement of Investigator",
    "module": 1,
    "moduleName": "Administrative",
    "required": true,
    "requiredFor": [
      "IND"
    ],
    "contentType": "form",
    "guidance": "Form FDA 1572 is the clinical investigator's signed commitment to conduct a study under an IND in compliance with the protocol and 21 CFR Part 312. One completed 1572 is required per investigator at each participating clinical site.",
    "authoringGuidance": "Form FDA 1572 is required by 21 CFR 312.53(c) and documents that each named clinical investigator understands and accepts the regulatory obligations of conducting an investigational study — following the protocol, obtaining IRB approval, ensuring informed consent, supervising study staff, and maintaining records. FDA reviewers and BIMO (Bioresearch Monitoring) inspectors use the 1572 to verify who is accountable at each site, which facilities and sub-investigators are involved, and which IRB oversees the site. Acceptability requires that the investigator (not the sponsor) sign, that all sub-investigators who assist in a material way are listed, that the clinical facility and IRB are correctly identified, and that the protocol(s) named on the form match those in the submission. A 1572 is not used for foreign sites conducted outside an IND — those follow 21 CFR 312.120 instead.",
    "keyContentElements": [
      "Name and address of the investigator",
      "Name and address of the clinical research facility/site where the study will be conducted",
      "Name and address of any clinical laboratory facilities used",
      "Name and address of the IRB responsible for review and approval of the study",
      "Names of sub-investigators who will assist the investigator in the conduct of the investigation",
      "Name and code number/title of the protocol(s) the investigator is committing to conduct",
      "Investigator's education, training, and experience reference (CV attached)",
      "The investigator's signed commitments under 21 CFR 312.53 (protocol adherence, informed consent, IRB, recordkeeping, safety reporting)",
      "Investigator signature and date"
    ],
    "generationPrompt": "Produce field-completion guidance and a completed-example narrative for Form FDA 1572 (Statement of Investigator) for a U.S. site participating in {{SPONSOR}}'s {{PHASE}} study of {{PRODUCT_NAME}} in {{INDICATION}}. Populate investigator name/address, clinical site, clinical laboratory, IRB of record, list of sub-investigators, and the protocol number/title, and reference the attached investigator CV. Restate the 312.53(c) commitments and the requirement that the investigator personally sign and date. Use bracketed placeholders for names and addresses, and add a note distinguishing when 21 CFR 312.120 applies instead for foreign sites.",
    "parentCode": "1.1",
    "commonPitfalls": [
      "Omitting sub-investigators who materially contribute, a frequent BIMO inspection finding",
      "Sponsor or coordinator signing in place of the investigator, invalidating the commitment",
      "IRB or facility addresses that do not match site records, or an outdated IRB of record",
      "Protocol number/title on the form not matching the current protocol version in Module 5",
      "Using a 1572 for a foreign site not conducted under the IND (should follow 312.120), or failing to update the form when key site information changes"
    ],
    "wordCountRange": [
      150,
      400
    ],
    "dependencies": [
      "1.1.1"
    ]
  },
  "1.1.3": {
    "code": "1.1.3",
    "title": "Form FDA 3674 — Certification of Compliance with ClinicalTrials.gov (42 U.S.C. 282(j))",
    "module": 1,
    "moduleName": "Administrative",
    "required": true,
    "requiredFor": [
      "IND"
    ],
    "contentType": "form",
    "guidance": "Form FDA 3674 certifies that the sponsor has met the ClinicalTrials.gov registration and results-reporting requirements of FDAAA Section 801 for any applicable clinical trials referenced in the submission. It is required with INDs and with marketing applications.",
    "authoringGuidance": "Form FDA 3674 is the certification required under Section 402(j) of the PHS Act (42 U.S.C. 282(j), added by FDAAA Section 801) confirming compliance with ClinicalTrials.gov registration and results-submission obligations. The reviewer uses it to verify that applicable clinical trials (ACTs) in the submission have been registered and, where required, have results posted, and to obtain the NCT number(s) linking the submission to the public registry. Acceptability requires selecting the correct certification box (no applicable trials; certification with NCT number(s); or certification that requirements are addressed), listing all relevant NCT numbers, and signing by an authorized official. The certification must be current for the submission it accompanies — an original IND with only Phase 1 trials often qualifies for the 'no applicable clinical trials' path, but this must be evaluated per protocol, not assumed.",
    "keyContentElements": [
      "Identification of the submission type the certification accompanies (IND, NDA, BLA, amendment)",
      "Correct selection among the certification options (no applicable clinical trials; ACTs registered with NCT numbers; requirements otherwise satisfied)",
      "NCT number(s) for each applicable clinical trial referenced in the submission",
      "Sponsor/applicant name and the product/drug identification",
      "Name, title, and signature of the responsible/authorized official",
      "Date of certification consistent with the submission date"
    ],
    "generationPrompt": "Prepare field-completion guidance and a completed-example narrative for Form FDA 3674 (Certification of Compliance with ClinicalTrials.gov) accompanying {{SPONSOR}}'s {{PHASE}} IND submission for {{PRODUCT_NAME}} in {{INDICATION}}. Explain how to determine whether each referenced trial is an 'applicable clinical trial,' select the correct certification checkbox accordingly, and list NCT numbers where registration applies. Include the applicant identification and authorized-official signature block with bracketed placeholders, and add a note on when the 'no applicable clinical trials' option is defensible for an early-phase program.",
    "parentCode": "1.1",
    "commonPitfalls": [
      "Incorrectly claiming 'no applicable clinical trials' for a trial that meets the ACT definition, a certifiable compliance issue",
      "Missing or transposed NCT numbers that break the link between the submission and the registry",
      "Submitting a stale certification that does not reflect trials added by an amendment",
      "Signature by someone without authority to certify on behalf of the sponsor",
      "Failing to include a 3674 at all with an IND submission that references clinical trials"
    ],
    "wordCountRange": [
      150,
      350
    ],
    "dependencies": [
      "1.1.1"
    ]
  },
  "1.1.4": {
    "code": "1.1.4",
    "title": "Form FDA 356h — Application to Market a New or Abbreviated New Drug or Biologic",
    "module": 1,
    "moduleName": "Administrative",
    "required": false,
    "requiredFor": [
      "NDA",
      "BLA"
    ],
    "contentType": "form",
    "guidance": "Form FDA 356h is the mandatory application form and jurat for NDAs and BLAs. It identifies the product and applicant, provides the master contents checklist for the marketing application, and carries the applicant's certifications, including debarment and application-integrity attestations.",
    "authoringGuidance": "Form FDA 356h is required by 21 CFR 314.50 for NDAs and 21 CFR 601.2 for BLAs as the signed application form for a marketing application. Reviewers and the RPM use it to confirm the application type (505(b)(1), 505(b)(2), original BLA), the proposed proprietary and established names, dosage form, strength, route, and proposed indication, and to verify that each required application component is present via the contents checklist. Acceptability turns on internal consistency with the cover letter and eCTD backbone, correct classification of the application, complete checklist mapping, and signature by a responsible official who thereby makes the debarment certification (FD&C Act 306(k)) and agrees to comply with all applicable laws. Any 'not applicable' checklist entry should be justified elsewhere in Module 1.",
    "keyContentElements": [
      "Applicant name, address, and authorized U.S. agent if the applicant is foreign",
      "Product proprietary name, established/proper name, dosage form, strength(s), and route of administration",
      "Proposed indication(s) for use",
      "Application type and basis (505(b)(1), 505(b)(2), NDA, original BLA; new molecular entity indicator)",
      "Cross-references to any relevant IND, DMF, or master file numbers",
      "Complete contents checklist mapping each required item (labeling, CMC, nonclinical, clinical, statistics, pediatric, etc.) to its eCTD location",
      "Certifications: debarment certification, financial certification/disclosure reference, patent information reference, application-integrity statement",
      "Name, title, and signature of the responsible official making the application and its jurat",
      "Establishment information/registration numbers where applicable"
    ],
    "generationPrompt": "Prepare field-completion guidance and a completed-example narrative for Form FDA 356h for {{SPONSOR}}'s original {{PRODUCT_NAME}} marketing application for {{INDICATION}}. Populate applicant identity, proprietary/established names, dosage form, strength, route, proposed indication, and application type/basis (state assumptions for 505(b)(1) vs 505(b)(2) or original BLA). Complete the contents checklist mapping each item to its eCTD module location, and identify where the debarment certification, financial disclosure, and patent information are provided. Include the responsible-official signature/jurat block with bracketed placeholders and a note on U.S.-agent designation for a foreign applicant.",
    "parentCode": "1.1",
    "commonPitfalls": [
      "Contents checklist items marked present that do not resolve to a populated eCTD location, causing filing-review deficiencies",
      "Misclassifying the application (e.g., 505(b)(2) vs 505(b)(1)) or the NME status",
      "Product identity fields (established name, strength, route) inconsistent with the proposed labeling in 1.3.1",
      "Signature by an official lacking authority to bind the applicant to the 306(k) debarment certification",
      "Foreign applicant failing to designate a U.S. agent"
    ],
    "wordCountRange": [
      250,
      550
    ],
    "dependencies": [
      "1.2",
      "1.14.1.3",
      "1.3.5.1",
      "1.3.3",
      "1.3.4"
    ]
  },
  "1.2": {
    "code": "1.2",
    "title": "Cover Letter",
    "module": 1,
    "moduleName": "Administrative",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "narrative",
    "guidance": "The cover letter orients the FDA review division to the submission's purpose, contents, and any special handling requests. It is the first document a regulatory project manager (RPM) reads and it frames triage: submission type, sequence, and whether the package is complete or a partial/amendment.",
    "authoringGuidance": "The cover letter is a signed transmittal that identifies the application, states the submission type and purpose in the first paragraph, and lists the significant contents so the RPM can route the package correctly. An FDA reviewer reads it to confirm the submission matches the intended action (original IND, protocol amendment, information amendment, NDA/BLA original, resubmission) and to catch any requested meetings, expedited-program designations, or prior agreements being fulfilled. What makes it acceptable is precise identification data (application number, product name, sponsor), an accurate one-line statement of purpose, explicit cross-references to any FDA correspondence or advice being addressed, and a named, reachable regulatory contact. Keep it factual and concise — it is a routing and commitment document, not a scientific argument. Flag any items requiring prompt attention (e.g., safety report, clinical hold response, PDUFA-relevant filing) up front.",
    "keyContentElements": [
      "Date, application/submission type, and application number (IND/NDA/BLA number; 'pre-assigned' if original)",
      "Sponsor/applicant name and full address; product proprietary and established (nonproprietary) name",
      "One-paragraph statement of purpose (original submission, amendment type, resubmission, response to FDA request)",
      "Itemized list of the submission's major contents and eCTD modules included",
      "Cross-references to prior FDA meetings, minutes, advice letters, or agreements being addressed (with dates)",
      "Identification of any expedited program (Fast Track, Breakthrough, Accelerated Approval, Priority Review) and designation numbers",
      "Explicit callout of time-sensitive or special-handling items (safety reports, clinical hold responses, waiver/exception requests)",
      "Named regulatory contact with direct phone and email; authorized signatory name, title, and signature",
      "Statement of the eCTD sequence number and whether the submission is paper, hybrid, or fully electronic"
    ],
    "generationPrompt": "Draft an FDA cover letter for {{SPONSOR}}'s {{PHASE}} submission of {{PRODUCT_NAME}} for the treatment of {{INDICATION}}. Open with a single-sentence statement of the submission type and purpose, then identify the application number, sponsor, and product proprietary/established names. Provide an itemized list of the major contents by eCTD module, cross-reference any relevant prior FDA meetings or correspondence (use bracketed placeholders for dates and minute references), note any expedited-program designations, flag any time-sensitive items, and close with a named regulatory contact (phone/email) and authorized signatory block. Keep the tone factual and transmittal-oriented; do not argue scientific conclusions.",
    "parentCode": "1",
    "commonPitfalls": [
      "Omitting or misstating the application number or eCTD sequence, causing misrouting or a technical rejection",
      "Vague purpose statement that forces the RPM to open multiple modules to understand what the submission is",
      "Failing to reference the specific FDA advice, meeting minutes, or IR being responded to, so the reviewer cannot confirm commitments were met",
      "Listing contents that do not match the actual eCTD backbone, triggering a validation or completeness question",
      "Providing a generic mailbox or an unreachable contact, delaying any subsequent information request"
    ],
    "wordCountRange": [
      300,
      700
    ],
    "dependencies": []
  },
  "1.3.3": {
    "code": "1.3.3",
    "title": "Debarment Certification",
    "module": 1,
    "moduleName": "Administrative",
    "required": false,
    "requiredFor": [
      "NDA",
      "BLA"
    ],
    "contentType": "narrative",
    "guidance": "The debarment certification is the applicant's sworn statement that it did not and will not use, in any capacity in connection with the application, the services of any person debarred under the FD&C Act. It is a mandatory integrity certification for marketing applications.",
    "authoringGuidance": "The debarment certification is required by Section 306(k)(1) of the Federal Food, Drug, and Cosmetic Act (21 U.S.C. 335a(k)(1)) and must accompany each NDA and BLA. The applicant certifies that it did not and will not use in any capacity, in connection with the application, the services of any person debarred under Section 306. FDA uses this certification as part of its application-integrity framework; a false certification is grounds for refusal to file, application withdrawal, and criminal liability. Acceptability requires a certification statement that tracks the statutory language, is signed by an authorized official of the applicant, and — if any debarred person's services were in fact used — a list of those persons in lieu of or in addition to the certification as the statute requires. The certification is typically provided as a signed statement in Module 1 and is also attested on Form FDA 356h.",
    "keyContentElements": [
      "Certification statement tracking FD&C Act 306(k)(1) that no debarred person's services were or will be used in connection with the application",
      "Applicant name and the specific application/product to which the certification applies",
      "Name, title, and signature of an authorized official of the applicant",
      "Date of certification consistent with the submission",
      "If applicable, a list of any debarred persons whose services were used, as the statute contemplates",
      "Cross-reference to the corresponding attestation on Form FDA 356h"
    ],
    "generationPrompt": "Draft a debarment certification for {{SPONSOR}}'s {{PRODUCT_NAME}} marketing application for {{INDICATION}} that tracks Section 306(k)(1) of the FD&C Act (21 U.S.C. 335a). Provide the certification statement that the applicant did not and will not use the services of any debarred person in connection with the application, identify the applicant and product, include an authorized-official signature block with bracketed placeholders, and note the statutory list requirement if any debarred person's services were used. Cross-reference the corresponding Form FDA 356h attestation.",
    "parentCode": "1.3",
    "commonPitfalls": [
      "Certification language that does not track the statutory 306(k)(1) wording",
      "Signature by an individual not authorized to bind the applicant",
      "Omitting the certification entirely, a refuse-to-file basis for a marketing application",
      "Failing to reconcile the certification with the 356h attestation",
      "Certifying without having actually screened contractors/consultants against the debarment list"
    ],
    "wordCountRange": [
      150,
      400
    ],
    "dependencies": [
      "1.1.4"
    ]
  },
  "1.3.4": {
    "code": "1.3.4",
    "title": "Financial Disclosure — Forms FDA 3454 and 3455",
    "module": 1,
    "moduleName": "Administrative",
    "required": false,
    "requiredFor": [
      "NDA",
      "BLA"
    ],
    "contentType": "form",
    "guidance": "Financial disclosure documents whether clinical investigators who conducted covered studies had financial interests or arrangements that could bias study outcomes. Form FDA 3454 certifies the absence of disclosable interests; Form FDA 3455 discloses interests that exist, with steps taken to minimize bias.",
    "authoringGuidance": "Financial disclosure is governed by 21 CFR Part 54. For every covered clinical study relied on to establish safety and effectiveness, the applicant must submit either Form FDA 3454 (certification that no listed financial arrangements/interests existed) or Form FDA 3455 (disclosure of the specific interests) for each clinical investigator, together with a list of investigators. The reviewer uses this to assess the reliability of the clinical data and whether financial conflicts could have biased results; disclosed interests trigger an evaluation of the impact and of any steps taken to minimize bias (randomization, blinding, independent adjudication). Acceptability requires complete coverage of all covered studies and all covered investigators (including sub-investigators and their spouses/dependent children as defined), correct selection of certification vs disclosure per investigator, and, where interests are disclosed on 3455, a description of the interest and the mitigation. Applicants must also certify they exercised due diligence to collect the information; unobtainable information requires an explanation.",
    "keyContentElements": [
      "List of all clinical investigators (and covered sub-investigators) who conducted covered clinical studies",
      "Form FDA 3454 certification of no disclosable financial arrangements/interests for investigators where applicable",
      "Form FDA 3455 disclosure for each investigator with a covered financial interest or arrangement",
      "Description of the nature and magnitude of each disclosed interest (compensation tied to outcome, proprietary/equity interest, significant payments, significant equity in a public sponsor)",
      "Description of steps taken to minimize the potential for bias for disclosed interests",
      "Certification of the applicant's due diligence to obtain the information and explanation for any missing information",
      "Mapping of each certification/disclosure to the specific covered study(ies) in Module 5",
      "Authorized-official signature and date"
    ],
    "generationPrompt": "Prepare 21 CFR Part 54 financial disclosure content for {{SPONSOR}}'s {{PRODUCT_NAME}} marketing application for {{INDICATION}}. Explain how to identify covered clinical studies and covered investigators (including sub-investigators and covered family members), and how to determine for each whether Form FDA 3454 (certification of no disclosable interests) or Form FDA 3455 (disclosure) applies. Provide the structure for the investigator list, an investigator-by-study matrix, the description of any disclosed interest and the steps taken to minimize bias, and the applicant's due-diligence certification with an explanation mechanism for unobtainable information. Use bracketed placeholders for investigator names and study numbers; do not fabricate financial arrangements.",
    "parentCode": "1.3",
    "expectedData": [
      "Investigator-by-study matrix linking each covered investigator to studies and to their 3454/3455 status"
    ],
    "commonPitfalls": [
      "Failing to cover every covered study and every covered investigator, including sub-investigators and covered family members",
      "Submitting a blanket 3454 when a disclosable interest actually exists for one or more investigators",
      "Disclosing interests on 3455 without describing steps taken to minimize bias",
      "No explanation for investigators whose financial information could not be obtained despite due diligence",
      "Certifications/disclosures not reconciling with the investigator list or the study reports in Module 5"
    ],
    "wordCountRange": [
      300,
      900
    ],
    "dependencies": [
      "1.1.4"
    ]
  },
  "1.3.5.1": {
    "code": "1.3.5.1",
    "title": "Patent Information and Certification (1.3.5.1 patent information · 1.3.5.2 patent certification · 1.3.5.3 exclusivity claim)",
    "module": 1,
    "moduleName": "Administrative",
    "required": false,
    "requiredFor": [
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Patent information identifies the patents claiming the drug substance, drug product, or approved methods of use for Orange Book listing, and — for 505(b)(2) applications — provides the required patent certifications or statements against patents listed for any referenced listed drug. This section carries significant Hatch-Waxman exclusivity and litigation consequences.",
    "authoringGuidance": "Patent information and certifications are governed by 21 CFR 314.53 (submission of patent information) and 314.50(i) (patent certification requirements), implementing the Hatch-Waxman framework. For a 505(b)(1) NDA the applicant submits patent information (Form FDA 3542a for submission and 3542 for Orange Book listing) identifying drug substance, drug product, and method-of-use patents. For a 505(b)(2) application, the applicant must, for each patent listed on a referenced listed drug, submit one of the paragraph I–IV certifications or a section viii statement (method-of-use carve-out). The reviewer and the Orange Book staff use this to establish listable patents, exclusivity interplay, and, for Paragraph IV, the notice and 30-month-stay machinery. Acceptability requires correct patent numbers and expiration dates, correct patent-use codes for method-of-use patents, the correct certification type per referenced patent, and — for Paragraph IV — a plan for the required notice to the NDA holder and patent owner. Errors here have direct legal and exclusivity consequences, so accuracy and internal consistency are paramount. (Note: BLAs use the BPCIA 'patent dance' rather than Orange Book listing, so 505(b)(2)-style certifications generally do not apply to biologics; include only the applicable patent representations.)",
    "keyContentElements": [
      "Identification of the application basis (505(b)(1) vs 505(b)(2); or BLA) determining which patent obligations apply",
      "Drug substance, drug product, and method-of-use patents with patent numbers and expiration dates (Form FDA 3542a)",
      "Patent-use code descriptions for each method-of-use patent tied to specific approved indications",
      "For 505(b)(2): the required certification (Paragraph I, II, III, or IV) or section viii statement for each patent listed on the referenced listed drug",
      "For Paragraph IV: a statement of intent to provide notice to the NDA holder and patent owner and the factual/legal basis of the certification",
      "Declaration/signature of the responsible official attesting to the accuracy of the patent information",
      "Cross-reference to the referenced listed drug (RLD) and its Orange Book patent listings for 505(b)(2)",
      "For BLAs: applicable patent representations consistent with BPCIA rather than Orange Book certification"
    ],
    "generationPrompt": "Prepare patent information and certification content for {{SPONSOR}}'s {{PRODUCT_NAME}} marketing application for {{INDICATION}}. First identify the application basis (505(b)(1), 505(b)(2), or BLA) and the resulting patent obligations. For a 505(b)(1) NDA, structure the drug-substance, drug-product, and method-of-use patent submission (Form FDA 3542a) with a patents table (number, type, use code, expiration). For a 505(b)(2), specify the required Paragraph I–IV certification or section viii statement for each patent listed on the referenced listed drug and describe Paragraph IV notice obligations. For a BLA, describe the applicable BPCIA representations instead of Orange Book certification. Use bracketed placeholders for all patent numbers, dates, and RLD identifiers; do not invent patent data.",
    "parentCode": "1.3.5",
    "expectedData": [
      "Table of listed patents (patent number, type: substance/product/use, use code, expiration date) for the product or referenced listed drug"
    ],
    "commonPitfalls": [
      "Incorrect or omitted patent numbers, expiration dates, or use codes causing Orange Book listing errors",
      "Selecting the wrong certification type (e.g., Paragraph III vs IV) for a referenced patent in a 505(b)(2)",
      "Failing to address every patent listed for the referenced listed drug in a 505(b)(2) application",
      "Missing or defective Paragraph IV notice planning, which can invalidate the certification's legal effect",
      "Applying Orange Book certification logic to a BLA where BPCIA governs, or vice versa"
    ],
    "wordCountRange": [
      400,
      1200
    ],
    "dependencies": [
      "1.1.4"
    ]
  },
  "1.9": {
    "code": "1.9",
    "title": "Pediatric Study Plan / PREA and Pediatric Assessment (FDA heading 1.9: 1.9.1 waiver · 1.9.2 deferral · 1.9.4 proposed pediatric study request)",
    "module": 1,
    "moduleName": "Administrative",
    "required": false,
    "requiredFor": [
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "This section addresses the applicant's pediatric obligations: the initial Pediatric Study Plan (iPSP) submitted during development and the pediatric assessment, waiver, or deferral request in the marketing application under the Pediatric Research Equity Act (PREA). It documents how pediatric use will be studied or why studies are waived/deferred.",
    "authoringGuidance": "Pediatric obligations are governed by the Pediatric Research Equity Act, codified at Section 505B of the FD&C Act (21 U.S.C. 355c), with the initial Pediatric Study Plan (iPSP) required generally no later than 60 days after an end-of-Phase-2 meeting. In the marketing application the applicant must contain a pediatric assessment for the same indication being sought in adults, or a request for a partial/full waiver or deferral with justification. The reviewer and the Pediatric Review Committee (PeRC) evaluate whether the pediatric plan adequately addresses each pediatric age group, whether requested waivers meet the statutory criteria (e.g., studies impossible/impracticable, product does not represent a meaningful therapeutic benefit and is unlikely to be used in a substantial number of pediatric patients, or evidence the product would be unsafe/ineffective in pediatrics), and whether deferrals are justified with timelines. Acceptability requires alignment with the agreed iPSP, coverage of all relevant pediatric age groups, proposed pediatric formulation considerations, and clearly justified waiver/deferral requests with milestone dates. Note any orphan-designation interplay (PREA does not apply to orphan-designated indications) and any BPCA (pediatric exclusivity) considerations.",
    "keyContentElements": [
      "Statement of the applicant's PREA obligations for the indication under review and the pediatric age groups implicated",
      "Reference to the agreed initial Pediatric Study Plan (iPSP) and any agreed amendments",
      "Proposed pediatric studies (objectives, age groups, endpoints, and timelines) or the pediatric assessment being submitted",
      "Requests for full or partial waiver with the specific statutory basis under 505B",
      "Requests for deferral with justification and proposed study completion milestone dates",
      "Pediatric formulation development plan or justification for why a pediatric formulation is/is not needed",
      "Extrapolation strategy from adult (or older pediatric) efficacy where scientifically justified",
      "Interaction history with FDA/PeRC and any orphan-designation or BPCA (pediatric exclusivity) considerations",
      "Cross-reference to any pediatric data in Module 5 and to labeling Section 8.4"
    ],
    "generationPrompt": "Prepare the PREA pediatric content for {{SPONSOR}}'s {{PRODUCT_NAME}} marketing application for {{INDICATION}}. State the Section 505B obligations and the pediatric age groups implicated by the adult indication; reference the agreed initial Pediatric Study Plan; and present either the pediatric assessment or the requested full/partial waiver and/or deferral with the specific statutory basis and dated milestones. Include the pediatric formulation plan, any efficacy-extrapolation strategy, a table mapping pediatric age groups to studies and waiver/deferral status, and cross-references to Module 5 pediatric data and labeling Section 8.4. Note orphan-designation and BPCA considerations. Use bracketed placeholders for dates and study identifiers; do not fabricate results.",
    "parentCode": "1",
    "expectedData": [
      "Table of pediatric age groups mapped to planned/completed studies, waiver/deferral status, and milestone dates"
    ],
    "commonPitfalls": [
      "Requesting a waiver without meeting or clearly articulating the statutory 505B criteria",
      "Failing to address all relevant pediatric age groups or omitting a required pediatric formulation plan",
      "Deferral requests lacking justified, dated completion milestones",
      "Marketing-application pediatric plan inconsistent with the previously agreed iPSP",
      "Overlooking that PREA does not apply to orphan-designated indications, or conflating PREA obligations with BPCA voluntary incentives"
    ],
    "wordCountRange": [
      500,
      1500
    ],
    "dependencies": [
      "1.1.4",
      "1.14.1.3"
    ]
  },
  "1.12.14": {
    "code": "1.12.14",
    "title": "Environmental Assessment / Categorical Exclusion",
    "module": 1,
    "moduleName": "Administrative",
    "required": false,
    "requiredFor": [
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Every marketing application must address the environmental impact of manufacturing and use, either by claiming a categorical exclusion (with justification) or by submitting a full Environmental Assessment (EA). This satisfies FDA's obligations under the National Environmental Policy Act (NEPA).",
    "authoringGuidance": "Environmental impact is governed by 21 CFR Part 25, which implements NEPA for FDA actions. The applicant must include either a claim of categorical exclusion under 21 CFR 25.31 (with a statement that no extraordinary circumstances under 25.21 exist), or, if no categorical exclusion applies, a full Environmental Assessment under 21 CFR 25.40. The reviewer evaluates whether the claimed exclusion is appropriate — most drug/biologic approvals qualify for categorical exclusion where the action will not increase the concentration of the substance in the environment above a threshold or where the substance occurs naturally — and, where an EA is required, whether the EA adequately estimates the introduction concentration (EIC/PEC) and environmental fate and effects to support a Finding of No Significant Impact (FONSI) or the need for an Environmental Impact Statement. Acceptability requires the correct citation of the applicable categorical-exclusion provision, an affirmative statement that no extraordinary circumstances exist, and, for a full EA, the Part 25.40 content elements with supporting fate/effects data. Failing to address environmental impact at all is a filing deficiency.",
    "keyContentElements": [
      "Determination of whether a categorical exclusion applies or a full Environmental Assessment is required",
      "For an exclusion: citation of the specific 21 CFR 25.31 provision relied on",
      "For an exclusion: an affirmative statement that no extraordinary circumstances under 21 CFR 25.21 exist that would require an EA",
      "For a full EA: the Part 25.40 content — identification of the action, need, and environmental impact of the manufacturing/use/disposal",
      "For a full EA: estimated introduction concentration/predicted environmental concentration and environmental fate and effects data",
      "For a full EA: mitigation measures and the basis for a Finding of No Significant Impact (FONSI), if applicable",
      "Signature/statement of the responsible official",
      "Cross-reference to relevant CMC (Module 3) manufacturing and disposal information supporting the environmental analysis"
    ],
    "generationPrompt": "Prepare the environmental impact content for {{SPONSOR}}'s {{PRODUCT_NAME}} marketing application for {{INDICATION}} under 21 CFR Part 25. First determine whether a categorical exclusion applies: if so, cite the specific 21 CFR 25.31 provision and include the affirmative statement that no extraordinary circumstances under 25.21 exist. If a full Environmental Assessment is required, structure the 25.40 content — action and need, environmental impact of manufacture/use/disposal, estimated introduction concentration/predicted environmental concentration, environmental fate and effects, mitigation, and the basis for a Finding of No Significant Impact — with placeholder tables for fate/effects endpoints. Cross-reference the supporting Module 3 manufacturing/disposal information. Use bracketed placeholders for all quantitative values; do not fabricate environmental data.",
    "parentCode": "1.12",
    "expectedData": [
      "For a full EA: tables of estimated environmental introduction concentration and environmental fate/effects (aquatic/terrestrial) endpoints"
    ],
    "commonPitfalls": [
      "Claiming a categorical exclusion without citing the specific 25.31 provision or without the no-extraordinary-circumstances statement",
      "Claiming an exclusion where the estimated environmental concentration or other factors actually trigger the need for a full EA",
      "Submitting a full EA that omits required fate/effects data needed to support a FONSI",
      "Failing to address environmental impact at all, a refuse-to-file deficiency",
      "Environmental analysis inconsistent with the manufacturing/disposal information in Module 3"
    ],
    "wordCountRange": [
      300,
      1500
    ],
    "dependencies": [
      "1.1.4"
    ]
  },
  "1.14.1.1": {
    "code": "1.14.1.1",
    "title": "Draft Carton and Container Labels",
    "module": 1,
    "moduleName": "Administrative",
    "required": false,
    "requiredFor": [
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Carton and container labeling comprises the immediate container label and the outer carton labeling for every proposed presentation. FDA reviews these for compliance with content-and-format requirements, consistency with the PI, and avoidance of medication errors and name/look-alike confusion.",
    "authoringGuidance": "Container and carton labeling is governed by 21 CFR 201.100 (prescription drug labeling), the general labeling requirements of 201.1–201.25, and for biologics 21 CFR 610.60–610.65. Reviewers, including the Division of Medication Error Prevention and Analysis (DMEPA), examine the mock-ups for required content (established and proprietary names with the correct name prominence, strength expressed per total and per mL where relevant, net quantity, storage, Rx statement, lot and expiration placeholders, NDC, manufacturer/distributor) and for design features that reduce medication errors (differentiation across strengths, barcode compliance, avoidance of error-prone abbreviations). Acceptability requires legible, to-scale color mock-ups for each presentation, exact consistency with the approved PI (strength, concentration, storage, indication class), NDC assignment consistent with the establishment/listing, and DMEPA-aligned human-factors considerations. For biologics, the specific 610 statements (proper name, licensed manufacturer, dating period) must appear.",
    "keyContentElements": [
      "To-scale, legible color mock-ups of every immediate container label and outer carton for each strength/presentation",
      "Proprietary and established (proper) names with correct name juxtaposition and prominence",
      "Strength/concentration expressed per total content and per mL (for injectables/liquids) to prevent dosing errors",
      "Net quantity of contents and dosage form",
      "NDC number for each presentation consistent with establishment registration and drug listing",
      "Storage and handling statements consistent with the stability data and PI Section 16",
      "'Rx only' statement and route of administration",
      "Lot number and expiration date placeholders, and barcode (linear/2D) meeting bar-code label requirements",
      "Manufacturer/distributor name and address; for biologics the 21 CFR 610 proper-name, license-number, and dating-period statements",
      "Warnings/Boxed Warning callouts and any REMS/Medication Guide references where space and rules require"
    ],
    "generationPrompt": "Prepare carton and container labeling guidance and annotated text content for each proposed presentation of {{SPONSOR}}'s {{PRODUCT_NAME}} for {{INDICATION}}. For every strength/presentation, specify the immediate-container and outer-carton content: proprietary and established names with correct prominence, strength/concentration expressed per total and per mL where applicable, net quantity, dosage form, NDC placeholder, storage statement consistent with PI Section 16, 'Rx only', route, lot/expiration placeholders, barcode requirement, and manufacturer/distributor. Add the 21 CFR 610 proper-name/license/dating statements if {{PRODUCT_NAME}} is a biologic. Provide a presentations table (strength, container/closure, fill volume, NDC, configuration) with bracketed placeholders, and flag medication-error/DMEPA design considerations. Do not invent NDCs or lot data.",
    "parentCode": "1.14.1",
    "expectedData": [
      "Table of proposed presentations mapping strength, container/closure, fill volume, NDC, and package configuration"
    ],
    "commonPitfalls": [
      "Strength or concentration expressed ambiguously (e.g., per mL vs per total volume) inviting DMEPA medication-error deficiencies",
      "Insufficient visual differentiation between strengths or look-alike/sound-alike naming concerns",
      "Storage statements inconsistent with the stability program and PI Section 16",
      "Missing or non-compliant barcode, NDC inconsistencies, or missing 21 CFR 610 statements for biologics",
      "Mock-ups not to scale or illegible, preventing DMEPA human-factors review"
    ],
    "wordCountRange": [
      500,
      1500
    ],
    "dependencies": [
      "1.14.1.3"
    ]
  },
  "1.14.1.3": {
    "code": "1.14.1.3",
    "title": "Draft Labeling Text — Prescribing Information (PLR: Highlights + Full PI Sections 1–17) and Patient Labeling",
    "module": 1,
    "moduleName": "Administrative",
    "required": false,
    "requiredFor": [
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "The prescribing information is the FDA-approved labeling that governs how the product may be promoted and used. It must follow the Physician Labeling Rule (PLR) format — a Highlights of Prescribing Information summary, a Table of Contents, and the Full Prescribing Information organized into the 17 numbered sections. This is the single most scrutinized administrative document in a marketing application. Draft labeling text (FDA heading 1.14.1.3) carries the Prescribing Information together with the Medication Guide, Patient Package Insert and Instructions for Use; the annotated PI goes to 1.14.1.2 and carton/container labels to 1.14.1.1.",
    "authoringGuidance": "The prescribing information (PI) is governed by 21 CFR 201.56 and 201.57 (the Physician Labeling Rule format for applications submitted or pending after June 30, 2006). It is a negotiated, evidence-bounded document: every claim must be supported by data elsewhere in the application, and the reviewer cross-checks each statement against the clinical, nonclinical, and CMC modules. The PLR structure has three parts — Highlights of Prescribing Information (a half-page concise summary), a Contents (table of contents) to the Full PI, and the Full Prescribing Information organized into 17 numbered sections in fixed order. Acceptability requires strict format compliance (Highlights length limit, required bolded headings, the Highlights limitation statement, the initial U.S. approval year), consistency between Highlights and the corresponding Full PI sections, adherence to labeling content rules for each population and warning, and the mandated cross-references (e.g., each Highlights item citing its Full PI section number). The FDA reviewer treats the PI as the deliverable the whole application exists to support; unsubstantiated, promotional, or comparative claims draw immediate labeling deficiencies.",
    "keyContentElements": [
      "HIGHLIGHTS: the required limitation statement, product name(s) and dosage form/route, initial U.S. approval year",
      "HIGHLIGHTS: Boxed Warning summary (if any), Recent Major Changes with dates, Indications and Usage, Dosage and Administration, Dosage Forms and Strengths",
      "HIGHLIGHTS: Contraindications, Warnings and Precautions, Adverse Reactions (with the FDA adverse-reaction reporting statement), Drug Interactions, Use in Specific Populations, and the patient counseling/Medication Guide statement with revision date",
      "CONTENTS: a table of contents listing all Full PI sections and subsections that appear",
      "FULL PI Section 1 Indications and Usage; Section 2 Dosage and Administration; Section 3 Dosage Forms and Strengths",
      "FULL PI Section 4 Contraindications; Section 5 Warnings and Precautions; Section 6 Adverse Reactions (clinical trials + postmarketing subsections)",
      "FULL PI Section 7 Drug Interactions; Section 8 Use in Specific Populations (Pregnancy, Lactation, Females and Males of Reproductive Potential, Pediatric, Geriatric per the Pregnancy and Lactation Labeling Rule)",
      "FULL PI Section 9 Drug Abuse and Dependence; Section 10 Overdosage; Section 11 Description (with established name, structure, formulation)",
      "FULL PI Section 12 Clinical Pharmacology (12.1 Mechanism of Action, 12.2 Pharmacodynamics, 12.3 Pharmacokinetics, 12.4/12.5 as applicable); Section 13 Nonclinical Toxicology (13.1 Carcinogenesis/Mutagenesis/Impairment of Fertility, 13.2 Animal Toxicology)",
      "FULL PI Section 14 Clinical Studies; Section 15 References; Section 16 How Supplied/Storage and Handling; Section 17 Patient Counseling Information",
      "Boxed Warning at the top of the Full PI (if applicable) and consistent cross-references between Highlights and Full PI section numbers",
      "Medication Guide / patient labeling: Determination and justification of whether a Medication Guide, PPI, or IFU is required under Part 208",
      "Medication Guide / patient labeling: The 'What is the most important information I should know about [drug]?' section aligned to the Boxed Warning/serious risks",
      "Medication Guide / patient labeling: 'What is [drug]?' and approved use in plain language",
      "Medication Guide / patient labeling: 'Who should not take/use [drug]?' reflecting contraindications"
    ],
    "generationPrompt": "Draft PLR-format prescribing information for {{SPONSOR}}'s {{PRODUCT_NAME}} for {{INDICATION}}. Produce three parts: (1) HIGHLIGHTS OF PRESCRIBING INFORMATION with the required limitation statement, product/dosage-form line, initial U.S. approval placeholder, any Boxed Warning summary, Recent Major Changes, and concise entries for Indications, Dosage and Administration, Dosage Forms and Strengths, Contraindications, Warnings and Precautions, Adverse Reactions with the FDA reporting statement, Drug Interactions, Use in Specific Populations, and the patient counseling/revision line — each cross-referenced to its Full PI section number; (2) a CONTENTS list; and (3) the FULL PRESCRIBING INFORMATION as the 17 numbered sections in fixed order, with Section 8 following PLLR subsection structure and Section 12 broken into 12.1–12.3. Insert bracketed placeholders wherever a specific study result, incidence value, PK parameter, or NDC would go — do not fabricate data. Keep all language evidence-bounded and non-promotional.",
    "parentCode": "1.14.1",
    "expectedData": [
      "Adverse reaction incidence tables (treatment vs comparator/placebo) supporting Section 6",
      "Pharmacokinetic parameter tables (Cmax, AUC, t1/2, effect of intrinsic/extrinsic factors) supporting Section 12.3",
      "Clinical efficacy results tables (endpoints, effect sizes, confidence intervals) supporting Section 14",
      "Dosage/strength and How Supplied tables (NDC numbers, package configurations) supporting Sections 3 and 16",
      "Drug-interaction summary tables supporting Section 7"
    ],
    "commonPitfalls": [
      "Highlights exceeding the length limit or omitting required elements (limitation statement, initial U.S. approval, reporting statement), an automatic format deficiency",
      "Claims in labeling not substantiated by data in Modules 4/5, or promotional/comparative language not supported by adequate and well-controlled studies",
      "Inconsistency between Highlights and the corresponding Full PI section, or broken cross-references to section numbers",
      "Section 8 not conforming to the Pregnancy and Lactation Labeling Rule (PLLR) subsection structure and risk-summary format",
      "Adverse-reaction tables that do not reconcile with the integrated safety analysis, prompting reviewer reconciliation requests",
      "Boxed Warning content or placement not matching the agreed risk, or missing required Medication Guide/REMS cross-references",
      "Content that diverges from the approved PI's serious risks or uses technical language above the required patient reading level",
      "Missing or misaligned 'most important information' section relative to the Boxed Warning"
    ],
    "wordCountRange": [
      3000,
      9000
    ],
    "dependencies": [
      "1.14.1.1"
    ]
  },
  "1.14.4.1": {
    "code": "1.14.4.1",
    "title": "Investigator's Brochure",
    "module": 1,
    "moduleName": "Administrative",
    "required": true,
    "requiredFor": [
      "IND"
    ],
    "contentType": "narrative",
    "guidance": "In the FDA regional module the Investigator's Brochure (IB) is referenced under 1.4.1 as one of the references/cross-references for the submission. The IB compiles the clinical and nonclinical information relevant to the study drug for the investigators; the submitted IND must include a current IB and each amendment must reference the version in effect.",
    "authoringGuidance": "The Investigator's Brochure is required by 21 CFR 312.23(a)(5), which enumerates its content; 21 CFR 312.55 separately obligates the sponsor to furnish the current IB to each participating investigator. ICH E6(R2)/E6(R3) Good Clinical Practice Section 7 defines the standard IB structure. In the US eCTD regional backbone the IB appears at 1.4.1 as a reference document that gives investigators and the FDA reviewer a consolidated, current summary of the physical/chemical/pharmaceutical properties, nonclinical pharmacology and toxicology, pharmacokinetics, and available clinical safety and efficacy data — plus guidance for the investigator on possible risks and adverse-reaction management. Acceptability requires that the version referenced matches the version supporting the current protocol, that the safety information (including a summary of known and potential risks) is current as of the submission, and that the IB is internally consistent with the protocol, the 1571, and Module 4/5 data. A stale IB that does not reflect new safety findings is a common information-amendment trigger.",
    "keyContentElements": [
      "Title page with product identifier, IB version/edition number, and date",
      "Summary of physical, chemical, and pharmaceutical properties and formulation",
      "Summary of nonclinical pharmacology, toxicology, and pharmacokinetics/ADME",
      "Summary of available clinical pharmacokinetics, safety, and efficacy data",
      "A guidance-for-the-investigator section describing known and potential risks and adverse-reaction management",
      "Reference safety information (expected/listed adverse events) used for expedited-reporting assessments",
      "Clear version control and identification of the edition supporting the current protocol",
      "Cross-reference to the underlying nonclinical (Module 4) and clinical (Module 5) data sources"
    ],
    "generationPrompt": "Prepare the 1.4.1 Investigator's Brochure reference content and version-control guidance for {{SPONSOR}}'s {{PHASE}} IND for {{PRODUCT_NAME}} in {{INDICATION}}. Describe the IB edition/date being referenced and confirm it supports the current protocol; summarize the required IB sections (physicochemical/pharmaceutical properties, nonclinical pharmacology/toxicology/PK, available clinical safety and efficacy, guidance for the investigator on known and potential risks, and reference safety information for expectedness assessments); and specify the cross-references to Module 4 and Module 5. Emphasize version control and consistency with the 1571 and protocol. Use bracketed placeholders for edition numbers, dates, and specific findings; do not fabricate data.",
    "parentCode": "1.14.4",
    "expectedData": [
      "Summary tables of nonclinical toxicology findings and exposure margins",
      "Summary tables of clinical safety (adverse events) and available PK parameters"
    ],
    "commonPitfalls": [
      "Referencing an outdated IB edition that does not reflect newly identified safety information",
      "IB reference safety information inconsistent with the safety-reporting assessments (expectedness determinations)",
      "Version/date on the IB not matching the protocol it is meant to support",
      "Summaries that overstate efficacy or understate risk relative to the underlying Module 4/5 data",
      "Failing to update or re-reference the IB when an amendment changes the risk profile"
    ],
    "wordCountRange": [
      300,
      800
    ],
    "dependencies": [
      "1.1.1"
    ]
  },
  "1.14.4.2": {
    "code": "1.14.4.2",
    "title": "Investigational Drug Labeling",
    "module": 1,
    "moduleName": "Administrative",
    "required": true,
    "requiredFor": [
      "IND"
    ],
    "contentType": "mixed",
    "guidance": "21 CFR 312.23(a)(7)(iv)(d) requires a copy of all labels and labeling to be provided to each investigator, and 21 CFR 312.6 prescribes the investigational-use caution statement. FDA eCTD Module 1 Specification v2.3 files investigational drug labeling at heading 1.14.4.2, beside the Investigator's Brochure at 1.14.4.1.",
    "authoringGuidance": "Investigational labeling establishes that clinical supplies are identified, controlled, and legally marked for investigational use. The immediate-container label and any outer package label must carry the statement required by 21 CFR 312.6(a) (\"Caution: New Drug — Limited by Federal (or United States) law to investigational use\") and must not bear any statement that is false or misleading or that represents the drug as safe or effective for the investigational purpose. The reviewer checks the label against the drug product description in Module 3 (name, strength, dosage form, lot/batch identification, storage conditions, sponsor identity) and against the protocol's blinding and packaging scheme. Acceptability depends on every presentation to be shipped being represented, consistency with the CMC section, and — for blinded studies — a labeling scheme that preserves the blind while remaining traceable.",
    "keyContentElements": [
      "Immediate-container label text for every strength and presentation to be supplied to investigators",
      "Outer package / carton label text where applicable",
      "The 21 CFR 312.6(a) investigational-use caution statement, verbatim",
      "Product name, strength, dosage form, quantity, lot or batch number, storage conditions, and sponsor identity",
      "Blinded-study labeling scheme (placebo/comparator naming, kit numbering) and how the blind is preserved",
      "Any investigator-directed instructions for use accompanying the supplies"
    ],
    "generationPrompt": "Prepare the investigational drug labeling text (21 CFR 312.6; 312.23(a)(7)(iv)(d); FDA eCTD heading 1.14.4.2) for {{SPONSOR}}'s IND for {{PRODUCT_NAME}} in {{INDICATION}}. Provide immediate-container and outer-package label text for each presentation with the verbatim investigational-use caution statement, product identity, strength, dosage form, lot/batch, storage and sponsor fields, and the blinded-study labeling scheme where the protocol is blinded. Use bracketed placeholders for values you were not given.",
    "parentCode": "1.14.4",
    "commonPitfalls": [
      "Omitting or paraphrasing the 21 CFR 312.6(a) caution statement",
      "Label strength or dosage form inconsistent with the Module 3 drug product description",
      "A labeling scheme that breaks the blind or makes kits untraceable",
      "Filing the labeling under 1.3 (administrative information) instead of 1.14"
    ],
    "wordCountRange": [
      200,
      800
    ],
    "dependencies": [
      "3.2.P.1",
      "5.3.5"
    ]
  },
  "1.20": {
    "code": "1.20",
    "title": "Introductory Statement and General Investigational Plan",
    "module": 1,
    "moduleName": "Administrative",
    "required": true,
    "requiredFor": [
      "IND"
    ],
    "contentType": "narrative",
    "guidance": "21 CFR 312.23(a)(3) requires every initial IND to open with a brief introductory statement and a general investigational plan for the first year. FDA eCTD Module 1 Specification v2.3 files it as one document at heading 1.20 (general investigational plan for initial IND) — not at 1.6, which is the meetings heading.",
    "authoringGuidance": "The introductory statement and general investigational plan is the first scientific narrative the review division reads and it frames the 30-day safety review: it tells the division what the drug is, what the sponsor intends to learn in the first year, and why the proposed exposure is reasonable. The introductory statement gives the drug's name and all active ingredients, pharmacological class, structural formula, formulation and route, and the broad objectives and planned duration of the investigation, together with a summary of previous human experience (marketing or investigation outside the US, and any withdrawal for safety or effectiveness). The general investigational plan states the rationale for the drug or research study, the indication(s) to be studied, the general approach to evaluating the drug, the clinical trials to be conducted in the first year (or a statement that plans are not developed beyond the initial protocol), the estimated number of subjects, and any risks of particular severity or seriousness anticipated from nonclinical or prior human data. It must be consistent with the Form 1571 phase designation, the protocol in Module 5, and the nonclinical package in Module 4; a plan that promises studies the toxicology program cannot yet support is the most common trigger for a clinical-hold question.",
    "keyContentElements": [
      "Drug name (proprietary and established), all active ingredients, pharmacological class, and structural formula",
      "Dosage form, formulation, and route of administration",
      "Broad objectives and planned duration of the proposed clinical investigation(s)",
      "Summary of previous human experience, including marketing or investigation in other countries and any withdrawal for safety or effectiveness reasons",
      "Rationale for the drug or the research study, and the indication(s) to be studied",
      "General approach to be followed in evaluating the drug",
      "Clinical trials to be conducted during the first year following submission, or a statement that plans are limited to the initial protocol",
      "Estimated number of subjects to be given the drug in those studies",
      "Any risks of particular severity or seriousness anticipated on the basis of toxicological data in animals or prior studies in humans"
    ],
    "generationPrompt": "Draft the Introductory Statement and General Investigational Plan (21 CFR 312.23(a)(3); FDA eCTD heading 1.20) for {{SPONSOR}}'s initial IND for {{PRODUCT_NAME}} in {{INDICATION}} at {{PHASE}}. Cover the drug's identity, pharmacological class, structural formula, formulation and route; the broad objectives and planned duration; a summary of previous human experience (or a first-in-human statement); the rationale and indication(s); the general evaluation approach; the studies planned for the first year with estimated subject numbers; and anticipated risks of particular severity. Keep it consistent with the Form 1571 phase and the Module 5 protocol. Use bracketed placeholders for values you were not given; do not fabricate data.",
    "parentCode": "1",
    "commonPitfalls": [
      "Filing the plan at heading 1.6 (meetings) or 1.5 (application status) instead of 1.20, so the reviewer cannot find it in the backbone",
      "First-year plan that exceeds what the nonclinical program supports (duration or dose), inviting a clinical-hold question",
      "Phase or indication inconsistent with Form 1571 or the Module 5 protocol",
      "Omitting the previous-human-experience summary, or asserting first-in-human status when the drug has been marketed or studied abroad",
      "No estimate of subject numbers or no statement of anticipated serious risks"
    ],
    "wordCountRange": [
      800,
      2500
    ],
    "dependencies": [
      "1.1.1",
      "2.4",
      "5.3.5"
    ]
  },
  "2.2": {
    "code": "2.2",
    "title": "Introduction",
    "module": 2,
    "moduleName": "CTD Summaries",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "narrative",
    "guidance": "The CTD Introduction (M4 Organization) is a one-page orientation to the application, not a scientific argument. It states the drug substance nonproprietary and proprietary names, pharmacologic class, mechanism of action, and the proposed indication, dose, route, and dosage form. An FDA reviewer reads it first to frame the entire dossier and confirm the product and claim under review; acceptability depends on it being concise, factual, and perfectly consistent with the proposed labeling and the Overviews that follow.",
    "authoringGuidance": "Keep to roughly one page; per ICH M4 the Introduction should not exceed one page and must include proprietary name, nonproprietary/common name, company name, dosage form(s), strength(s), route of administration, and proposed indication. Write in the present tense and mirror the exact wording used in the proposed prescribing information so the reviewer sees no drift between the Introduction, the Overviews (2.4/2.5), and the label. Do not editorialize on benefit or risk here — that belongs in 2.5.6. Every term (class, MOA, indication population) introduced here must be carried consistently through Module 2. Confirm regulatory-region alignment because 2.2 is a shared CTD element across ICH regions.",
    "keyContentElements": [
      "Proprietary (brand) name and INN/USAN nonproprietary name of the drug substance",
      "Sponsor/applicant company name",
      "Pharmacologic/therapeutic class and mechanism of action (one to two sentences)",
      "Proposed dosage form(s) and strength(s)",
      "Route(s) of administration",
      "Proposed indication and target patient population as worded in the draft label",
      "Proposed posology/dosing regimen at a high level",
      "Statement of submission type/regulatory context (e.g., original NDA/BLA/IND)"
    ],
    "generationPrompt": "Draft the CTD Module 2.2 Introduction (one page maximum) for {{PRODUCT_NAME}} developed by {{SPONSOR}}. State the proprietary and nonproprietary names, pharmacologic class and mechanism of action, dosage form(s), strength(s), route of administration, and the proposed indication for {{INDICATION}} using wording consistent with the proposed prescribing information. Note the {{PHASE}} development stage and submission type. Keep it factual and free of benefit/risk conclusions, and ensure every term aligns with the 2.4 Nonclinical Overview, 2.5 Clinical Overview, and the label.",
    "parentCode": "2",
    "commonPitfalls": [
      "Exceeding the one-page limit or turning the Introduction into a mini-overview with efficacy/safety conclusions",
      "Indication or dosing wording that does not match the proposed prescribing information or the 2.5 Clinical Overview",
      "Using an unapproved or inconsistent proprietary name, or omitting the INN entirely",
      "Introducing pharmacologic-class or MOA claims not supported by the nonclinical/clinical modules",
      "Region-specific content inserted into a document meant to be common across ICH regions"
    ],
    "wordCountRange": [
      200,
      450
    ],
    "dependencies": [
      "2.5",
      "2.4",
      "2.3"
    ]
  },
  "2.3": {
    "code": "2.3",
    "title": "Quality Overall Summary (QOS)",
    "module": 2,
    "moduleName": "CTD Summaries",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "The Quality Overall Summary is a critical CMC summary that follows the scope and outline of Module 3 Body of Data and distills drug substance and drug product quality into a reviewer-navigable narrative with key tables. Per ICH M4Q it should not normally exceed 40 pages (excluding tables/figures) for a chemical entity, though biotech products commonly run longer. An FDA quality reviewer uses the QOS to understand the control strategy, critical quality attributes, and manufacturing rationale before diving into Module 3; acceptability requires that it faithfully summarize — never contradict — the underlying 3.2.S and 3.2.P data and highlight where and why the applicant deviated from guidance.",
    "authoringGuidance": "Structure the QOS to parallel Module 3: 2.3.Introduction, 2.3.S (Drug Substance), 2.3.P (Drug Product), 2.3.A (Appendices), and 2.3.R (Regional Information). Emphasize the control strategy: critical quality attributes (CQAs), critical process parameters, specifications with justification, and the linkage between manufacturing process, characterization, and clinical/nonclinical batches. Summarize rather than reproduce Module 3, but include the pivotal tables (batch analyses, specifications, stability). Every number, specification limit, and method reference must reconcile exactly with Module 3.2. Call out any quality-by-design elements, design space, and post-approval change management protocols. For biologics, address comparability, viral safety, and characterization more extensively.",
    "keyContentElements": [
      "2.3.Introduction with proprietary name, nonproprietary name, dosage form, strength, route, and proposed indication",
      "Drug substance summary (2.3.S) covering nomenclature, structure, manufacture, characterization, control, and stability",
      "Drug product summary (2.3.P) covering description/composition, formulation development, manufacture, control of excipients, control of drug product, and stability",
      "Statement of the overall control strategy linking CQAs to specifications and process controls",
      "Key summary tables: batch analysis, drug substance/product specifications, stability summary",
      "Justification of specifications and analytical method summaries (with ICH Q2 validation status)",
      "Container closure system summary and compatibility",
      "Appendices summary (2.3.A) — facilities/equipment, adventitious agents safety, excipients",
      "Regional information summary (2.3.R) — e.g., executed batch records, process validation scheme"
    ],
    "generationPrompt": "Draft the CTD Module 2.3 Quality Overall Summary for {{PRODUCT_NAME}} ({{SPONSOR}}), a {{INDICATION}} product at {{PHASE}}. Follow the ICH M4Q outline (Introduction, S, P, A, R). Summarize the drug substance and drug product quality, articulate the control strategy linking critical quality attributes to justified specifications and process controls, and include placeholder key tables for batch analyses, specifications, and stability. Flag every location where numeric values must reconcile with Module 3.2, and note any quality-by-design, comparability, elemental impurity (ICH Q3D), and nitrosamine considerations. Do not fabricate results — describe what each subsection must contain.",
    "parentCode": "2",
    "expectedData": [
      "Batch analysis summary table",
      "Drug substance specification table",
      "Drug product specification table",
      "Stability summary tables (DS and DP)",
      "Composition/formulation table"
    ],
    "commonPitfalls": [
      "QOS values (specification limits, batch data, stability results) that do not match Module 3.2",
      "Presenting a specification without a scientific/statistical justification tying limits to clinical/toxicology exposure",
      "Omitting or under-describing the control strategy and CQA linkage, forcing the reviewer into Module 3",
      "For biologics, inadequate comparability discussion across process changes or clinical phases",
      "Missing analytical method validation status (ICH Q2) or elemental impurity (ICH Q3D) and nitrosamine risk assessments",
      "Treating the QOS as a page-limited abstract rather than a self-standing critical summary"
    ],
    "wordCountRange": [
      6000,
      15000
    ],
    "dependencies": [
      "2.2",
      "2.3.S",
      "2.3.P",
      "2.3.A",
      "2.3.R"
    ]
  },
  "2.3.A": {
    "code": "2.3.A",
    "title": "Quality Overall Summary — Appendices",
    "module": 2,
    "moduleName": "CTD Summaries",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Section 2.3.A summarizes the CTD quality Appendices that cut across drug substance and drug product: facilities and equipment (particularly for biotech products), adventitious agents safety evaluation, and novel excipients. It gives the reviewer assurance that the manufacturing environment, viral/TSE safety, and any non-compendial excipients are adequately controlled. Acceptability depends on a clear summary of 3.2.A that demonstrates contamination control and, for biologics, robust viral clearance and adventitious agent risk mitigation.",
    "authoringGuidance": "Summarize the three CTD appendix areas: A.1 Facilities and Equipment (for biotech, including a summary of the multi-product facility contamination-control strategy and product-contact equipment), A.2 Adventitious Agents Safety Evaluation (viral safety per ICH Q5A, TSE/BSE risk per the relevant guidance, and non-viral adventitious agents such as mycoplasma and bacteria), and A.3 Excipients (characterization and control of novel excipients not covered by pharmacopoeias). Focus A.2 on the source of raw materials of biological origin, testing of cell banks and unprocessed bulk, and the viral clearance/inactivation study summary with clearance factors. Cross-reference the safety qualification of novel excipients to any supporting nonclinical data. Include only appendices relevant to the product; state explicitly when an appendix is not applicable.",
    "keyContentElements": [
      "Facilities and equipment summary with contamination/cross-contamination control, especially for multi-product biotech sites (A.1)",
      "Adventitious agents safety evaluation: viral safety strategy per ICH Q5A (A.2)",
      "Summary of cell bank testing and unprocessed bulk testing for adventitious agents",
      "Viral clearance/inactivation study summary with log reduction (clearance) factors",
      "TSE/BSE risk assessment for materials of animal origin",
      "Non-viral adventitious agent controls (mycoplasma, bioburden, endotoxin)",
      "Novel/non-compendial excipient characterization and control, with safety qualification cross-reference (A.3)",
      "Explicit not-applicable statements for appendices that do not apply to the product"
    ],
    "generationPrompt": "Draft CTD Module 2.3.A (QOS Appendices) for {{PRODUCT_NAME}} ({{SPONSOR}}). Summarize A.1 Facilities and Equipment (contamination-control strategy, relevant for biotech/multi-product sites), A.2 Adventitious Agents Safety Evaluation (viral safety per ICH Q5A including cell bank and bulk testing and viral clearance log-reduction factors, plus TSE/BSE and non-viral agent controls), and A.3 Novel Excipients (characterization, control, and safety qualification cross-reference). Include placeholder viral clearance and testing summary tables. Explicitly mark any appendix not applicable to this product. Do not fabricate clearance values — describe what the summary must contain.",
    "parentCode": "2.3",
    "expectedData": [
      "Viral clearance summary table (log reduction factors)",
      "Cell bank and adventitious agent testing summary",
      "Novel excipient specification (if applicable)"
    ],
    "commonPitfalls": [
      "Viral clearance summary lacking cumulative log reduction factors or orthogonal mechanisms (ICH Q5A)",
      "Inadequate TSE/BSE certification for animal-derived raw materials",
      "Multi-product facility contamination-control strategy not summarized for biotech products",
      "Novel excipient introduced without safety qualification cross-reference",
      "Omitting the appendix entirely rather than stating it is not applicable, creating a perceived gap"
    ],
    "wordCountRange": [
      800,
      3000
    ],
    "dependencies": [
      "2.3.S",
      "2.3.P"
    ]
  },
  "2.3.P": {
    "code": "2.3.P",
    "title": "Quality Overall Summary — Drug Product",
    "module": 2,
    "moduleName": "CTD Summaries",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Section 2.3.P summarizes drug product quality mirroring Module 3.2.P — describing the finished dosage form, its formulation development, how it is manufactured and controlled, and how it remains stable through shelf life. It demonstrates that the commercial product is well-defined, reproducibly manufactured, and controlled to assure identity, strength, quality, and purity. FDA reviewers use it to confirm the formulation is justified, the manufacturing process is controlled, and the proposed shelf life is supported; acceptability requires faithful, consistent condensation of 3.2.P.1 through 3.2.P.8.",
    "authoringGuidance": "Organize 2.3.P by the 3.2.P subheadings: P.1 Description and Composition, P.2 Pharmaceutical Development, P.3 Manufacture, P.4 Control of Excipients, P.5 Control of Drug Product (specification, analytical procedures, validation, batch analyses, characterization of impurities, justification of specification), P.6 Reference Standards, P.7 Container Closure System, and P.8 Stability. Summarize the pharmaceutical development story (QbD/formulation rationale, compatibility, overages, dissolution method development) so the reviewer understands why the formulation and process are as they are. Present composition, specification, and stability tables. Address degradation products against ICH Q3B, dissolution/BCS considerations, and for biologics the appropriate product-specific controls. Every limit and result must reconcile with 3.2.P and the drug product stability must justify the proposed shelf life and storage statement.",
    "keyContentElements": [
      "Description and quantitative composition of the dosage form, including function of each excipient (P.1)",
      "Pharmaceutical development summary: formulation rationale, compatibility, dissolution/method development, overages (P.2)",
      "Manufacturer(s), batch formula, manufacturing process and controls, and process validation summary (P.3)",
      "Control of excipients including novel excipients and compendial references (P.4)",
      "Drug product specification with justification, analytical procedures, and validation (P.5)",
      "Batch analysis results for clinical and registration/process-validation batches",
      "Degradation product identification and control per ICH Q3B",
      "Container closure system description and suitability (P.7)",
      "Stability summary supporting proposed shelf life, storage conditions, and in-use stability (P.8)"
    ],
    "generationPrompt": "Draft CTD Module 2.3.P (Drug Product QOS) for {{PRODUCT_NAME}} ({{SPONSOR}}), dosage form for {{INDICATION}}. Follow the 3.2.P structure (P.1 Description/Composition, P.2 Pharmaceutical Development, P.3 Manufacture, P.4 Control of Excipients, P.5 Control of Drug Product, P.6 Reference Standards, P.7 Container Closure, P.8 Stability). Summarize composition and excipient function, the formulation/pharmaceutical development rationale, the manufacturing process and validation, the justified specification and analytical methods, degradation product control per ICH Q3B, and the stability data supporting the proposed shelf life and storage. Include placeholder composition, specification, batch analysis, dissolution, and stability tables. Ensure all values are described as reconciling with Module 3.2.P; do not fabricate data.",
    "parentCode": "2.3",
    "expectedData": [
      "Composition/formulation table",
      "Drug product specification table",
      "Batch analysis table",
      "Dissolution profile data (if applicable)",
      "Stability summary table with proposed shelf life"
    ],
    "commonPitfalls": [
      "Weak or missing pharmaceutical development (P.2) rationale, leaving formulation and process choices unjustified",
      "Specification or stability values inconsistent between 2.3.P and 3.2.P",
      "Degradation products not characterized/qualified against ICH Q3B thresholds",
      "Proposed shelf life or storage statement not supported by the ICH Q1A/Q1E stability data summarized",
      "Dissolution method or acceptance criteria not justified, or BCS/biowaiver rationale absent when relied upon",
      "Container closure suitability (protection, compatibility, safety) not addressed"
    ],
    "wordCountRange": [
      2500,
      7000
    ],
    "dependencies": [
      "2.3",
      "2.3.S"
    ]
  },
  "2.3.R": {
    "code": "2.3.R",
    "title": "Quality Overall Summary — Regional Information",
    "module": 2,
    "moduleName": "CTD Summaries",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Section 2.3.R summarizes region-specific quality information required by the receiving regulatory authority that is not part of the harmonized CTD core. For an FDA submission this includes items such as executed (representative) batch records, method validation packages, and comparability protocols as applicable in the US region. It signals to the reviewer that region-mandated documentation is present and consistent; acceptability depends on including exactly what the target region requires and reconciling it with the rest of Module 3.",
    "authoringGuidance": "Populate 2.3.R with the region-specific elements the target authority requires, summarizing the corresponding 3.2.R content. For the US/FDA region, this commonly includes a summary of executed batch records (representative), the process validation scheme/lifecycle approach, comparability protocols/post-approval change management protocols, and, where applicable, the certificate of suitability or specific method validation summaries. State the region explicitly. Do not place harmonized S/P content here. Confirm that anything summarized in 2.3.R matches 3.2.R and that region-specific naming, units, and requirements are correct for the receiving authority.",
    "keyContentElements": [
      "Explicit identification of the regulatory region (e.g., United States/FDA)",
      "Summary of executed/representative batch records provided in 3.2.R",
      "Process validation scheme or lifecycle validation approach summary",
      "Comparability protocols / post-approval change management protocols (as applicable)",
      "Region-specific method validation or additional analytical data summaries",
      "Any region-required certifications (e.g., BSE/TSE statements, CEP/CoS) not captured elsewhere",
      "Cross-reference map to the corresponding 3.2.R documents"
    ],
    "generationPrompt": "Draft CTD Module 2.3.R (QOS Regional Information) for {{PRODUCT_NAME}} ({{SPONSOR}}) directed to the US/FDA region. Summarize the region-specific quality items provided in 3.2.R — representative executed batch records, the process validation/lifecycle scheme, comparability or post-approval change management protocols, and any US-required method validation or certifications. Explicitly identify the region, include a cross-reference map to 3.2.R, and exclude harmonized S/P content. Include placeholder summary tables where relevant and do not fabricate batch or validation data.",
    "parentCode": "2.3",
    "expectedData": [
      "Executed batch record summary (representative)",
      "Process validation summary table (if applicable)"
    ],
    "commonPitfalls": [
      "Placing harmonized drug substance/product content in 2.3.R instead of region-specific items",
      "Omitting region-required documents the receiving authority expects (e.g., US executed batch record summaries)",
      "2.3.R content inconsistent with 3.2.R or referencing documents not actually provided",
      "Mixing requirements of different regions into a single US-directed section",
      "Failing to name the region, leaving the reviewer unsure which authority's requirements are addressed"
    ],
    "wordCountRange": [
      400,
      2000
    ],
    "dependencies": [
      "2.3",
      "2.3.S",
      "2.3.P"
    ]
  },
  "2.3.S": {
    "code": "2.3.S",
    "title": "Quality Overall Summary — Drug Substance",
    "module": 2,
    "moduleName": "CTD Summaries",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Section 2.3.S summarizes the drug substance quality information mirroring Module 3.2.S, giving the reviewer a concise account of what the active ingredient is, how it is made, how it is characterized, and how it is controlled. It establishes confidence that the manufacturer can reproducibly deliver a well-characterized substance of defined quality. A quality reviewer reads it to confirm the structure is proven, impurities are identified and controlled, and specifications are justified; acceptability rests on complete, internally consistent summaries that faithfully condense 3.2.S.1 through 3.2.S.7.",
    "authoringGuidance": "Organize 2.3.S following the 3.2.S subheadings: S.1 General Information (nomenclature, structure, general properties), S.2 Manufacture (manufacturer(s), process and controls, control of materials, critical steps/intermediates, process validation, development), S.3 Characterization (elucidation of structure, impurities), S.4 Control of Drug Substance (specification, analytical procedures, validation, batch analyses, justification of specification), S.5 Reference Standards, S.6 Container Closure, and S.7 Stability. Where multiple drug substances or manufacturers exist, repeat S for each with a clear naming convention. Summarize impurity profiles (organic, inorganic, residual solvents per ICH Q3C, elemental per ICH Q3D) and, for biologics, higher-order structure, post-translational modifications, and process/product-related impurities. Include the pivotal batch analysis and specification tables; every limit must trace to 3.2.S.4.",
    "keyContentElements": [
      "Nomenclature (INN, chemical name, CAS number) and molecular formula/mass",
      "Structure, stereochemistry, and physicochemical properties (S.1)",
      "Manufacturer name(s)/site(s) and a summary of the manufacturing process and controls (S.2)",
      "Critical steps, intermediates controls, and process development/validation summary",
      "Structural elucidation and characterization data summary (S.3)",
      "Impurity discussion: organic, inorganic, residual solvents (ICH Q3C), elemental impurities (ICH Q3D)",
      "Drug substance specification with justification and analytical procedure summary (S.4)",
      "Batch analysis results table for clinical/toxicology/registration batches",
      "Reference standard characterization (S.5), container closure (S.6), and stability summary with proposed retest/shelf life (S.7)"
    ],
    "generationPrompt": "Draft CTD Module 2.3.S (Drug Substance QOS) for the active ingredient in {{PRODUCT_NAME}} ({{SPONSOR}}). Follow the 3.2.S structure (S.1 General Information, S.2 Manufacture, S.3 Characterization, S.4 Control, S.5 Reference Standards, S.6 Container Closure, S.7 Stability). Summarize nomenclature and structure, the manufacturing process and controls, structural/characterization evidence, the impurity profile against ICH Q3A/Q3C/Q3D thresholds, the justified specification with analytical procedures, and the stability-derived retest period. Include placeholder specification, batch analysis, impurity, and stability tables, and note that every limit must reconcile with Module 3.2.S. Do not invent analytical results.",
    "parentCode": "2.3",
    "expectedData": [
      "Drug substance specification table",
      "Batch analysis table",
      "Impurity summary table",
      "Stability summary table with proposed retest period"
    ],
    "commonPitfalls": [
      "Structure/characterization summary insufficient to prove identity and stereochemistry (draws IR for full characterization data)",
      "Impurity limits not qualified by toxicology exposure or not aligned with ICH Q3A/Q3B thresholds",
      "Residual solvent (Q3C) or elemental impurity (Q3D) assessments omitted or inconsistent with 3.2.S",
      "Specification limits in 2.3.S that differ from those in 3.2.S.4.1",
      "For biologics, inadequate summary of higher-order structure, glycosylation, and product-related variants",
      "Stability conclusions (retest/shelf life) not supported by the summarized stability data or ICH Q1A conditions"
    ],
    "wordCountRange": [
      2500,
      7000
    ],
    "dependencies": [
      "2.3",
      "2.3.P"
    ]
  },
  "2.4": {
    "code": "2.4",
    "title": "Nonclinical Overview",
    "module": 2,
    "moduleName": "CTD Summaries",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "narrative",
    "guidance": "The Nonclinical Overview is an integrated, interpretive assessment of the pharmacology, pharmacokinetics, and toxicology program — the sponsor's expert argument that the nonclinical data support the safety of the proposed clinical use. Per ICH M4S it should be about 30 pages and is critical rather than merely descriptive: it draws conclusions, justifies the testing strategy, and relates animal findings to human exposure and to the clinical program. FDA pharm/tox reviewers read it as the sponsor's scientific position and test whether the conclusions are supported by 2.6 and Module 4; acceptability requires reasoned interpretation, safety-margin analysis, and honest integration of findings, not a data restatement.",
    "authoringGuidance": "Follow the ICH M4S sequence: (1) overview of the nonclinical testing strategy, (2) pharmacology, (3) pharmacokinetics, (4) toxicology, and (5) integrated overview and conclusions, with a reference list. Justify the studies conducted and any deviations from standard testing paradigms (including GLP status). Provide exposure-based safety margin comparisons (animal NOAEL exposures vs. anticipated/observed human exposure), not just dose comparisons. Integrate across disciplines — link a toxicologic finding to pharmacology, PK, and its clinical monitoring or labeling implication. Address impurity qualification, genotoxic impurities (ICH M7), carcinogenicity strategy (ICH S1), reproductive/developmental toxicity (ICH S5), and safety pharmacology (ICH S7A/B) as relevant to stage. Conclusions must state whether the program supports the proposed clinical use and dose.",
    "keyContentElements": [
      "Overview of the nonclinical testing strategy and its scientific/regulatory justification (including GLP compliance)",
      "Integrated pharmacology summary: primary (MOA), secondary, and safety pharmacology (ICH S7A/S7B)",
      "Integrated pharmacokinetics/ADME and interspecies comparison relevant to species selection",
      "Integrated toxicology: single/repeat-dose, genotoxicity, carcinogenicity, reproductive/developmental, local tolerance",
      "Exposure-based safety margins (NOAEL exposure vs. human exposure), not dose-based only",
      "Qualification of impurities and degradants, including genotoxic impurity assessment (ICH M7)",
      "Cross-discipline integration linking findings to clinical relevance and proposed monitoring/labeling",
      "Discussion of the relevance of animal findings to humans and of any species-specific effects",
      "Overall conclusion on whether nonclinical data support the proposed indication, dose, route, and duration"
    ],
    "generationPrompt": "Draft the CTD Module 2.4 Nonclinical Overview (~30 pages) for {{PRODUCT_NAME}} ({{SPONSOR}}) supporting {{INDICATION}} at {{PHASE}}. Follow ICH M4S: overview of the testing strategy (with GLP justification), integrated pharmacology (primary/secondary/safety, ICH S7A/S7B), integrated pharmacokinetics/ADME, integrated toxicology (repeat-dose, genotoxicity, carcinogenicity per ICH S1, reproductive/developmental per ICH S5), exposure-based safety margins, impurity/genotoxic impurity qualification (ICH M7), and an integrated conclusion on support for the proposed indication, dose, route, and duration. Write critically and interpretively, cross-linking findings to clinical relevance. Reference the 2.6 summaries and do not fabricate study results — describe where data belongs and how conclusions are drawn.",
    "parentCode": "2",
    "expectedData": [
      "Safety margin / exposure multiple summary table",
      "Pivotal toxicology study overview table (optional in overview)"
    ],
    "commonPitfalls": [
      "Descriptive restatement of studies without critical interpretation or integrated conclusions",
      "Safety margins expressed as dose ratios rather than exposure (AUC/Cmax) multiples",
      "Failure to justify the testing strategy, species selection, or non-GLP status of pivotal studies",
      "Genotoxic impurity (ICH M7), carcinogenicity (ICH S1), or reproductive toxicity (ICH S5) strategy not addressed when expected",
      "Nonclinical findings with clinical relevance not connected to proposed monitoring or labeling",
      "Conclusions inconsistent with the 2.6 summaries, Module 4 data, or the proposed clinical use"
    ],
    "wordCountRange": [
      6000,
      12000
    ],
    "dependencies": [
      "2.6.2",
      "2.6.4",
      "2.6.6",
      "2.5"
    ]
  },
  "2.5": {
    "code": "2.5",
    "title": "Clinical Overview",
    "module": 2,
    "moduleName": "CTD Summaries",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "narrative",
    "guidance": "The Clinical Overview is the sponsor's concise, critical analysis of the clinical data and the central benefit-risk argument for approval. Per ICH M4E it is normally 30 pages or less and is interpretive, not descriptive: it justifies the development program, critiques the design and conduct of the studies, and builds the case that the product is effective and safe for the proposed use. FDA clinical reviewers and the division director read it as the sponsor's overarching argument and cross-check it against 2.7 and Module 5; acceptability requires reasoned interpretation, candid discussion of limitations, and conclusions that follow logically from the data.",
    "authoringGuidance": "Follow the ICH M4E structure: 2.5.1 Product Development Rationale, 2.5.2 Overview of Biopharmaceutics, 2.5.3 Overview of Clinical Pharmacology, 2.5.4 Overview of Efficacy, 2.5.5 Overview of Safety, and 2.5.6 Benefits and Risks Conclusions. Keep it critical and integrative — summarize and interpret rather than repeat 2.7. Reference how the development program aligns with FDA advice (End-of-Phase-2, SPA, Type C meetings) and applicable disease-specific guidances. Discuss the adequacy of the evidence (substantial evidence standard, number/design of adequate and well-controlled trials per 21 CFR 314.126), the appropriateness of endpoints, dose selection, and the relevance of the studied population to the labeled population. Conclusions must be supported and must foreshadow the proposed labeling.",
    "keyContentElements": [
      "Product development rationale linking unmet need, MOA, and program design (2.5.1)",
      "Overview of biopharmaceutics: formulation bridging, BA/BE, food effect (2.5.2)",
      "Overview of clinical pharmacology: PK/PD, exposure-response, special populations, DDI (2.5.3)",
      "Overview of efficacy: pivotal trial designs, endpoints, results, and consistency across studies (2.5.4)",
      "Overview of safety: exposure, common and serious adverse events, and risk characterization (2.5.5)",
      "Benefit-risk conclusions integrating efficacy and safety for the proposed use (2.5.6)",
      "Critical appraisal of study design, conduct, GCP compliance, and data quality",
      "Discussion of the substantial evidence basis and consistency with FDA guidance/agreements",
      "Relationship of studied population and results to the proposed labeling"
    ],
    "generationPrompt": "Draft the CTD Module 2.5 Clinical Overview (30 pages or less) for {{PRODUCT_NAME}} ({{SPONSOR}}) for {{INDICATION}} at {{PHASE}}. Follow ICH M4E with subsections 2.5.1 Product Development Rationale, 2.5.2 Biopharmaceutics, 2.5.3 Clinical Pharmacology, 2.5.4 Efficacy, 2.5.5 Safety, and 2.5.6 Benefits and Risks Conclusions. Write critically and integratively, appraising study design and conduct, justifying the substantial-evidence basis per 21 CFR 314.126, referencing relevant FDA guidances and any agency agreements, and reconciling the studied population with the proposed labeling. Reference the 2.7 summaries; do not fabricate results — describe where data belongs and how the benefit-risk case is constructed.",
    "parentCode": "2",
    "expectedData": [
      "Table of clinical studies / development program overview (optional)",
      "Key efficacy results summary (referenced from 2.7.3)"
    ],
    "commonPitfalls": [
      "Descriptive duplication of 2.7 instead of critical, integrated analysis",
      "Overstating efficacy or minimizing safety signals relative to the underlying data",
      "Failing to justify endpoint selection, dose, or the adequacy/number of pivotal trials (21 CFR 314.126)",
      "Ignoring regulatory interactions/agreements (EOP2, SPA) or relevant disease-specific guidances",
      "Benefit-risk conclusion not clearly supported by the efficacy and safety sections or not aligned with 2.5.6",
      "Studied population not reconciled with the proposed labeled population (generalizability gap)"
    ],
    "wordCountRange": [
      7000,
      13000
    ],
    "dependencies": [
      "2.5.1",
      "2.5.2",
      "2.5.3",
      "2.5.4",
      "2.5.5",
      "2.5.6",
      "2.7.3",
      "2.7.4"
    ]
  },
  "2.5.1": {
    "code": "2.5.1",
    "title": "Product Development Rationale",
    "module": 2,
    "moduleName": "CTD Summaries",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "narrative",
    "guidance": "Subsection 2.5.1 explains why and how the product was developed — the scientific rationale connecting the disease, unmet medical need, mechanism of action, and the strategy of the clinical program. It orients the reviewer to the logic of the development plan before the efficacy and safety cases are made. Acceptability depends on a coherent narrative that ties the MOA and target population to the specific studies conducted and to key regulatory milestones and agreements.",
    "authoringGuidance": "Concisely present the disease/condition and current therapy landscape, the unmet need, the product's mechanism of action and scientific rationale, and the overall structure and logic of the clinical development program. Reference pivotal regulatory interactions and their outcomes (pre-IND, End-of-Phase-2, SPA, Breakthrough/Fast Track/Orphan designations) that shaped the program, and note reliance on any FDA disease-specific or endpoint guidance. Explain how phase-to-phase decisions (dose selection, endpoint choice, population) followed from emerging data. Keep it interpretive and brief; detailed results belong in 2.5.3–2.5.5 and 2.7. Ensure consistency with the Introduction (2.2) and Nonclinical Overview (2.4).",
    "keyContentElements": [
      "Disease/condition background, epidemiology, and current treatment landscape",
      "Statement of unmet medical need the product addresses",
      "Mechanism of action and scientific rationale for the therapeutic approach",
      "Overall clinical development strategy and the logic linking phases and studies",
      "Key regulatory interactions and agreements (pre-IND, EOP2, SPA) and special designations",
      "Reliance on relevant FDA/ICH disease- or endpoint-specific guidance",
      "Rationale for dose selection, endpoint choice, and target population",
      "Consistency statement with proposed indication and labeling"
    ],
    "generationPrompt": "Draft CTD Module 2.5.1 Product Development Rationale for {{PRODUCT_NAME}} ({{SPONSOR}}) in {{INDICATION}} at {{PHASE}}. Present the disease background and treatment landscape, the unmet need, the mechanism of action and scientific rationale, and the logic of the clinical development program. Reference key regulatory interactions and agreements (pre-IND, End-of-Phase-2, SPA) and special designations, and note reliance on relevant FDA disease/endpoint guidance. Explain the rationale for dose, endpoint, and population selection. Keep it interpretive and consistent with 2.2 and 2.4; do not include detailed efficacy/safety results.",
    "parentCode": "2.5",
    "commonPitfalls": [
      "Failing to connect the mechanism of action and unmet need to the specific program design",
      "Omitting key FDA agreements (EOP2, SPA) that justify endpoint or trial-design choices",
      "Not citing the applicable disease-specific guidance the program was designed against",
      "Rationale inconsistent with the proposed indication or with 2.2/2.4",
      "Drifting into detailed efficacy/safety results that belong in later subsections"
    ],
    "wordCountRange": [
      1000,
      2500
    ],
    "dependencies": [
      "2.2",
      "2.4",
      "2.5"
    ]
  },
  "2.5.2": {
    "code": "2.5.2",
    "title": "Overview of Biopharmaceutics",
    "module": 2,
    "moduleName": "CTD Summaries",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "narrative",
    "guidance": "Subsection 2.5.2 provides a critical overview of the biopharmaceutic data — how formulation, bioavailability, and bioequivalence findings support the dosage form and any formulation bridging across development. It assures the reviewer that the to-be-marketed formulation is adequately linked to the formulations used in pivotal trials. Acceptability depends on a clear bridging argument and honest treatment of any BE gaps, food effects, or dissolution issues.",
    "authoringGuidance": "Summarize and interpret the biopharmaceutics program: absolute/relative bioavailability, bioequivalence between clinical and commercial formulations, food effect, and dissolution/in vitro-in vivo relationships. Build the formulation bridge — demonstrate that pivotal efficacy/safety data generated with earlier formulations apply to the to-be-marketed product, or explain the BE studies that establish the link. Reference the applicable FDA guidances (e.g., Bioavailability and Bioequivalence Studies; Food-Effect BA and Fed BE; SUPAC) and BCS classification where relevant. Flag any formulation changes and their supporting data. Detailed study data reside in 2.7.1; keep this interpretive and reconciled with the biopharmaceutics summary.",
    "keyContentElements": [
      "Summary of absolute and/or relative bioavailability findings",
      "Bioequivalence bridging between clinical-trial and to-be-marketed formulations",
      "Food effect assessment and its labeling implication",
      "Dissolution method and in vitro-in vivo correlation/relationship discussion",
      "BCS classification and any biowaiver rationale, if relied upon",
      "History of formulation changes across development and their bridging data",
      "Reference to applicable FDA BA/BE and food-effect guidances",
      "Conclusion on adequacy of the biopharmaceutics package to support the commercial product"
    ],
    "generationPrompt": "Draft CTD Module 2.5.2 Overview of Biopharmaceutics for {{PRODUCT_NAME}} ({{SPONSOR}}). Summarize and interpret bioavailability, bioequivalence bridging between clinical and to-be-marketed formulations, food effect, dissolution/IVIVC, and BCS classification/biowaiver rationale if used. Build the formulation bridge across development, reference applicable FDA BA/BE and food-effect guidances, and conclude on the adequacy of the package for the commercial product. Reference detailed data in 2.7.1; do not fabricate PK values — describe the bridging logic and where data belongs.",
    "parentCode": "2.5",
    "expectedData": [
      "Relative bioavailability / BE summary table (referenced from 2.7.1)",
      "Formulation bridging summary"
    ],
    "commonPitfalls": [
      "Incomplete formulation bridge leaving pivotal-trial data unconnected to the commercial product",
      "Food-effect findings not translated into a labeling recommendation",
      "Missing or unjustified dissolution method / BCS biowaiver rationale",
      "BE conclusions overstated relative to confidence intervals in 2.7.1",
      "Formulation changes during development not disclosed or not supported by bridging data"
    ],
    "wordCountRange": [
      800,
      2000
    ],
    "dependencies": [
      "2.5",
      "2.7.1",
      "2.3.P"
    ]
  },
  "2.5.3": {
    "code": "2.5.3",
    "title": "Overview of Clinical Pharmacology",
    "module": 2,
    "moduleName": "CTD Summaries",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "narrative",
    "guidance": "Subsection 2.5.3 critically overviews the clinical pharmacology program — pharmacokinetics, pharmacodynamics, exposure-response, special populations, and drug interactions — and explains how it justifies the dose and dosing regimen. FDA clinical pharmacology reviewers use it to judge whether dose selection, exposure-response, and dose adjustments for intrinsic/extrinsic factors are well supported. Acceptability depends on an integrated exposure-response narrative and clear translation of PK/PD findings into dosing and labeling recommendations.",
    "authoringGuidance": "Summarize and interpret human PK (absorption, distribution, metabolism, excretion), PD and biomarkers, and exposure-response for efficacy and safety, culminating in the justification of the proposed dose and regimen. Address special populations (renal/hepatic impairment, age, sex, race, body weight, pediatrics as applicable) and intrinsic/extrinsic factors, and summarize drug-drug interaction findings, including metabolic pathway and transporter data. Reference the applicable FDA/ICH guidances (ICH E14/S7B for QT, FDA In Vitro/Clinical DDI guidances, renal and hepatic impairment guidances, population PK guidance, exposure-response guidance) and note any model-informed drug development (popPK/PBPK) supporting labeling. Flag dosing recommendations for specific populations. Detailed studies live in 2.7.2; keep this interpretive and reconciled.",
    "keyContentElements": [
      "Human PK overview (ADME), including linearity, accumulation, and variability",
      "Pharmacodynamics and biomarker/PD-endpoint relationships",
      "Exposure-response analyses for efficacy and safety supporting dose selection",
      "Special-population effects (renal, hepatic, age, sex, race, weight, pediatric) and dose adjustments",
      "Drug-drug interaction summary, including metabolic and transporter pathways",
      "QT/cardiac safety pharmacology conclusion (ICH E14/S7B), including any TQT or C-QTc analysis",
      "Model-informed analyses (population PK, PBPK, exposure-response) supporting labeling",
      "Justification of the proposed dose and dosing regimen and resulting labeling recommendations"
    ],
    "generationPrompt": "Draft CTD Module 2.5.3 Overview of Clinical Pharmacology for {{PRODUCT_NAME}} ({{SPONSOR}}) in {{INDICATION}}. Summarize and interpret human PK (ADME, linearity, variability), PD/biomarkers, and exposure-response for efficacy and safety to justify the proposed dose and regimen. Address special populations (renal, hepatic, age, sex, race, weight, pediatric), drug-drug interactions (metabolic and transporter pathways), and QT/cardiac safety per ICH E14/S7B. Note any population PK/PBPK model-informed analyses supporting labeling and reference applicable FDA DDI, impairment, and exposure-response guidances. Reference 2.7.2 for detail; do not fabricate parameters — describe the analyses and dosing conclusions.",
    "parentCode": "2.5",
    "expectedData": [
      "Key PK parameter summary table (referenced from 2.7.2)",
      "Exposure-response summary",
      "DDI summary table",
      "Special-population PK comparison"
    ],
    "commonPitfalls": [
      "Dose justification not grounded in exposure-response analysis",
      "Special-population dosing recommendations absent or unsupported by PK data",
      "DDI conclusions incomplete for key metabolic/transporter pathways (draws FDA DDI IRs)",
      "QT/cardiac safety conclusion missing or inconsistent with ICH E14/S7B expectations",
      "PopPK/PBPK models relied upon for labeling without adequate qualification summary",
      "Exposure-response or PK conclusions inconsistent with 2.7.2 or the proposed label"
    ],
    "wordCountRange": [
      1500,
      3500
    ],
    "dependencies": [
      "2.5",
      "2.7.2",
      "2.6.4"
    ]
  },
  "2.5.4": {
    "code": "2.5.4",
    "title": "Overview of Efficacy",
    "module": 2,
    "moduleName": "CTD Summaries",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "narrative",
    "guidance": "Subsection 2.5.4 is the critical overview of efficacy — the argument that the pivotal and supportive trials provide substantial evidence of effectiveness for the proposed indication. It integrates results across studies, evaluates endpoint validity and clinical meaningfulness, and addresses consistency across subgroups and studies. FDA reviewers weigh it against the substantial-evidence standard; acceptability requires a defensible, integrated efficacy case that candidly addresses design limitations, multiplicity, and generalizability.",
    "authoringGuidance": "Provide an integrated, critical analysis of efficacy: pivotal trial designs and endpoints, primary and key secondary results with effect sizes and confidence intervals, and consistency across trials, subgroups, and endpoints. Justify the endpoints (clinical vs. surrogate) and the statistical approach, including control of type I error/multiplicity and handling of missing data (aligned with ICH E9 and the E9(R1) estimand framework). Address the substantial-evidence basis (adequate and well-controlled studies per 21 CFR 314.126) and whether a single trial plus confirmatory evidence is being relied upon. Discuss dose-response for efficacy, durability, and persistence of effect. Reconcile the studied population with the labeled population. Detailed integrated results live in 2.7.3; keep this section interpretive and consistent with it.",
    "keyContentElements": [
      "Pivotal and supportive trial designs, populations, and comparators",
      "Primary and key secondary endpoint results with effect sizes and confidence intervals",
      "Justification of endpoints (clinical meaningfulness, surrogate validation if used)",
      "Statistical methods, multiplicity control, and estimand/missing-data handling (ICH E9/E9(R1))",
      "Consistency of effect across trials, subgroups, and endpoints",
      "Dose-response for efficacy and durability/maintenance of effect",
      "Substantial-evidence argument per 21 CFR 314.126 (number and adequacy of trials)",
      "Reconciliation of studied population with the proposed labeled indication and population"
    ],
    "generationPrompt": "Draft CTD Module 2.5.4 Overview of Efficacy for {{PRODUCT_NAME}} ({{SPONSOR}}) in {{INDICATION}}. Provide an integrated, critical analysis of the pivotal and supportive trials: designs, primary and key secondary results with effect sizes and confidence intervals, endpoint justification, statistical/multiplicity control and estimand/missing-data handling per ICH E9/E9(R1), consistency across trials and subgroups, dose-response, and durability. Establish the substantial-evidence basis per 21 CFR 314.126 and reconcile the studied population with the proposed labeling. Reference the integrated efficacy analysis in 2.7.3; do not fabricate results — describe the analyses and how the efficacy case is built.",
    "parentCode": "2.5",
    "expectedData": [
      "Integrated efficacy results summary (referenced from 2.7.3)",
      "Subgroup/forest summary",
      "Pivotal trial design overview table"
    ],
    "commonPitfalls": [
      "Presenting per-study results without integrating across the program",
      "Endpoint or surrogate not adequately justified as clinically meaningful",
      "Multiplicity/type I error control or missing-data handling not addressed (ICH E9(R1) estimands)",
      "Overstating effect by emphasizing favorable subgroups or post hoc analyses",
      "Substantial-evidence basis (adequate and well-controlled trials) not clearly established",
      "Efficacy conclusions inconsistent with 2.7.3 or with the proposed labeled population"
    ],
    "wordCountRange": [
      2000,
      4500
    ],
    "dependencies": [
      "2.5",
      "2.7.3"
    ]
  },
  "2.5.5": {
    "code": "2.5.5",
    "title": "Overview of Safety",
    "module": 2,
    "moduleName": "CTD Summaries",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "narrative",
    "guidance": "Subsection 2.5.5 is the critical overview of safety — an integrated characterization of the product's safety profile across the development program, culminating in the key identified and potential risks. It draws on the pooled safety population to describe exposure, common and serious adverse events, deaths, discontinuations, and safety in special populations. FDA reviewers use it to anticipate the WARNINGS/PRECAUTIONS, ADVERSE REACTIONS, and any REMS; acceptability depends on a candid, integrated risk characterization consistent with the detailed integrated safety analysis in 2.7.4.",
    "authoringGuidance": "Integrate safety across the program: extent of exposure (patient-years, dose/duration), the pooled adverse event profile, serious adverse events, deaths, and discontinuations due to AEs, plus laboratory, vital sign, ECG, and special-safety findings. Characterize the important identified and potential risks and adverse events of special interest, with mechanistic and dose/exposure context. Address safety in special populations and long-term/rare events, and note relationship to the exposure-response for safety in 2.5.3. Frame the risks that will drive labeling and any pharmacovigilance/REMS or risk-management plan (aligned with ICH E2E). Do not minimize signals. Detailed pooled analyses live in 2.7.4; keep this interpretive and fully consistent with it.",
    "keyContentElements": [
      "Extent of exposure: number of subjects, patient-years, dose and duration distribution",
      "Overall/common adverse event profile from the pooled safety population",
      "Serious adverse events, deaths, and discontinuations due to adverse events",
      "Clinically significant laboratory, vital sign, and ECG findings",
      "Important identified and potential risks and adverse events of special interest",
      "Safety in special populations (organ impairment, elderly, sex, race, pediatric) and drug interactions",
      "Long-term safety, rare events, and any dose/exposure-safety relationship",
      "Risk-management/pharmacovigilance approach and anticipated labeling risks (ICH E2E)"
    ],
    "generationPrompt": "Draft CTD Module 2.5.5 Overview of Safety for {{PRODUCT_NAME}} ({{SPONSOR}}) in {{INDICATION}}. Integrate safety across the program: extent of exposure (subjects, patient-years, dose/duration), the pooled common and serious adverse event profile, deaths, discontinuations, and clinically significant lab/vital sign/ECG findings. Characterize important identified and potential risks and adverse events of special interest with exposure context, address safety in special populations and drug interactions, and connect to the exposure-safety analysis and to a pharmacovigilance/risk-management plan (ICH E2E). Reference the integrated safety analysis in 2.7.4 and the proposed labeling; do not minimize signals and do not fabricate rates — describe the analyses and risk characterization.",
    "parentCode": "2.5",
    "expectedData": [
      "Integrated safety exposure summary (referenced from 2.7.4)",
      "Common adverse event table",
      "Serious adverse event / deaths summary",
      "Adverse events of special interest summary"
    ],
    "commonPitfalls": [
      "Downplaying or omitting serious adverse events, deaths, or safety signals",
      "Reporting per-study safety instead of the integrated/pooled safety population",
      "Failing to characterize important identified/potential risks and AESIs with exposure context",
      "Special-population and drug-interaction safety not addressed",
      "Safety overview inconsistent with the integrated analysis in 2.7.4 or with proposed labeling",
      "No linkage to a pharmacovigilance/risk-management plan when signals warrant one"
    ],
    "wordCountRange": [
      2000,
      4500
    ],
    "dependencies": [
      "2.5",
      "2.7.4",
      "2.5.3"
    ]
  },
  "2.5.6": {
    "code": "2.5.6",
    "title": "Benefits and Risks Conclusions",
    "module": 2,
    "moduleName": "CTD Summaries",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "narrative",
    "guidance": "Subsection 2.5.6 is the culminating benefit-risk assessment — the sponsor's integrated conclusion that, for the proposed indication and population, the benefits outweigh the risks. It synthesizes efficacy (2.5.4) and safety (2.5.5) in the context of the disease and available therapies, and states how risks are managed. FDA reviewers and the signatory authority read it as the bottom-line justification for approval; acceptability depends on a balanced, evidence-anchored conclusion that acknowledges uncertainties and aligns with the proposed labeling and any risk-management commitments.",
    "authoringGuidance": "Frame the benefit-risk in the context of the disease severity, the unmet need, and the current treatment options. Concisely restate the key benefits (magnitude, durability, clinical meaningfulness) and the key risks (severity, frequency, reversibility, manageability), then weigh them for the proposed population. Address residual uncertainties and how they are mitigated through labeling, monitoring, pharmacovigilance, or a REMS/risk-management plan. Use a structured benefit-risk framework where appropriate (consistent with FDA's Benefit-Risk Assessment framework and ICH M4E(R2)). Keep it concise and free of new data. Conclusions must follow logically from 2.5.4 and 2.5.5 and align exactly with the proposed indication and labeling.",
    "keyContentElements": [
      "Disease context: severity, unmet need, and current treatment landscape",
      "Concise restatement of key benefits with magnitude, durability, and clinical meaningfulness",
      "Concise restatement of key risks with severity, frequency, reversibility, and manageability",
      "Integrated weighing of benefits against risks for the specific proposed population",
      "Discussion of residual uncertainties and their mitigation",
      "Risk-management strategy (labeling, monitoring, pharmacovigilance, REMS if applicable)",
      "Use of a structured benefit-risk framework (FDA BR framework / ICH M4E(R2))",
      "Overall conclusion aligned with the proposed indication and labeling"
    ],
    "generationPrompt": "Draft CTD Module 2.5.6 Benefits and Risks Conclusions for {{PRODUCT_NAME}} ({{SPONSOR}}) in {{INDICATION}}. Frame the disease severity, unmet need, and current therapies; concisely restate the key benefits (magnitude, durability, clinical meaningfulness) and key risks (severity, frequency, reversibility, manageability); and integrate them into a weighed conclusion for the proposed population using a structured benefit-risk framework (FDA BR framework / ICH M4E(R2)). Address residual uncertainties and the risk-management strategy (labeling, monitoring, pharmacovigilance, REMS if applicable). Introduce no new data; ensure the conclusion follows from 2.5.4 and 2.5.5 and aligns with the proposed indication and labeling.",
    "parentCode": "2.5",
    "expectedData": [
      "Structured benefit-risk summary table (optional)"
    ],
    "commonPitfalls": [
      "Restating efficacy and safety separately without an integrated weighing",
      "Conclusion not grounded in disease context, unmet need, and available therapies",
      "Ignoring or under-stating residual uncertainties and how they are managed",
      "Introducing new data or analyses not presented in 2.5.4/2.5.5 or 2.7",
      "Benefit-risk conclusion broader than, or inconsistent with, the proposed indication/labeling",
      "No risk-management or pharmacovigilance framing when the safety profile warrants it"
    ],
    "wordCountRange": [
      1000,
      2500
    ],
    "dependencies": [
      "2.5.4",
      "2.5.5",
      "2.5"
    ]
  },
  "2.6.1": {
    "code": "2.6.1",
    "title": "Introduction (Nonclinical Written and Tabulated Summaries)",
    "module": 2,
    "moduleName": "CTD Summaries",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "narrative",
    "guidance": "Section 2.6.1 is a brief introduction to the nonclinical written and tabulated summaries, orienting the reviewer to the product, its pharmacologic class and MOA, and the scope of the nonclinical program summarized in 2.6.2 through 2.6.7. It sets expectations for the pharmacology, pharmacokinetics, and toxicology summaries that follow. Acceptability depends on it being short, accurate, and consistent with the Nonclinical Overview (2.4) and the detailed summaries.",
    "authoringGuidance": "Keep 2.6.1 concise (about one page per ICH M4S). State the drug substance, pharmacologic class, mechanism of action, proposed clinical indication and route, and the general scope and organization of the nonclinical program (species tested, GLP status, types of studies). Do not present results or conclusions — those belong in the written and tabulated summaries and in 2.4. Ensure terminology and scope statements match 2.4, 2.6.2, 2.6.4, and 2.6.6 exactly.",
    "keyContentElements": [
      "Drug substance name and pharmacologic/therapeutic class",
      "Mechanism of action (brief)",
      "Proposed clinical indication and route of administration",
      "Scope and organization of the nonclinical program (pharmacology, PK, toxicology)",
      "Species used and general GLP compliance statement",
      "Orientation to how the written (2.6.2/2.6.4/2.6.6) and tabulated (2.6.3/2.6.5/2.6.7) summaries are organized"
    ],
    "generationPrompt": "Draft CTD Module 2.6.1 Introduction to the nonclinical summaries for {{PRODUCT_NAME}} ({{SPONSOR}}). In about one page, state the drug substance, pharmacologic class, mechanism of action, proposed indication for {{INDICATION}} and route, and the scope and organization of the nonclinical program (pharmacology, pharmacokinetics, toxicology; species tested; GLP status). Do not present results. Ensure consistency with the 2.4 Nonclinical Overview and the written/tabulated summaries that follow.",
    "parentCode": "2.6",
    "commonPitfalls": [
      "Exceeding the brief scope and presenting results/conclusions that belong in later summaries",
      "Class/MOA/indication wording inconsistent with 2.4 or the clinical modules",
      "Misstating the scope of studies or species covered relative to the tabulated summaries",
      "Omitting GLP status framing for the program"
    ],
    "wordCountRange": [
      200,
      600
    ],
    "dependencies": [
      "2.4",
      "2.6.2",
      "2.6.4",
      "2.6.6"
    ]
  },
  "2.6.2": {
    "code": "2.6.2",
    "title": "Pharmacology Written Summary",
    "module": 2,
    "moduleName": "CTD Summaries",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "narrative",
    "guidance": "Section 2.6.2 is the factual written summary of nonclinical pharmacology — primary pharmacodynamics (MOA/target activity), secondary pharmacodynamics, safety pharmacology, and pharmacodynamic drug interactions. Unlike the interpretive 2.4, this is a comprehensive but non-argumentative account of what the pharmacology studies showed. FDA pharm/tox reviewers use it to understand the biological rationale and off-target/safety-pharmacology profile; acceptability depends on completeness, factual accuracy, and consistency with the tabulated summary (2.6.3) and Module 4.",
    "authoringGuidance": "Follow the ICH M4S order: brief summary, primary pharmacodynamics, secondary pharmacodynamics, safety pharmacology, and pharmacodynamic drug interactions, with an integrated discussion at the end. Present study designs, species/models, doses/concentrations, and results factually; the summary should be roughly narrative text supported by cross-references to 2.6.3 tables. Cover the safety pharmacology core battery (cardiovascular including hERG/QT, central nervous, and respiratory systems) per ICH S7A and S7B. State GLP status of pivotal safety pharmacology studies. Keep interpretation minimal here (integration and conclusions belong in 2.4) but include a short discussion relating findings. Every result must reconcile with 2.6.3 and Module 4 study reports.",
    "keyContentElements": [
      "Brief summary orienting the pharmacology program",
      "Primary pharmacodynamics: target/MOA activity in vitro and in vivo with potency data",
      "Secondary pharmacodynamics: off-target and receptor/enzyme profiling",
      "Safety pharmacology core battery: cardiovascular (hERG/QT per ICH S7B), CNS, respiratory (ICH S7A)",
      "Pharmacodynamic drug interactions, if studied",
      "Study designs, species/models, and dose/concentration ranges",
      "GLP compliance status of pivotal safety pharmacology studies",
      "Integrated discussion cross-referencing the tabulated summary (2.6.3)"
    ],
    "generationPrompt": "Draft CTD Module 2.6.2 Pharmacology Written Summary for {{PRODUCT_NAME}} ({{SPONSOR}}). Following ICH M4S order, factually summarize primary pharmacodynamics (target/MOA activity and potency in vitro and in vivo), secondary/off-target pharmacodynamics, the safety pharmacology core battery (cardiovascular including hERG/QT per ICH S7B, CNS, and respiratory per ICH S7A), and any PD drug interactions, ending with a short integrated discussion. State study designs, species/models, doses, and GLP status, and cross-reference the 2.6.3 tables. Do not fabricate results — describe what the summary must contain and ensure consistency with 2.6.3, 2.4, and Module 4.",
    "parentCode": "2.6",
    "expectedData": [
      "Primary pharmacodynamics results summary",
      "Safety pharmacology results summary (CV/CNS/respiratory)",
      "Secondary pharmacodynamics/off-target profiling summary"
    ],
    "commonPitfalls": [
      "Incomplete safety pharmacology core battery (e.g., missing respiratory or CNS assessment) per ICH S7A",
      "hERG/QT (ICH S7B) data absent or inconsistent with the clinical QT strategy",
      "Results in 2.6.2 that do not match the 2.6.3 tables or Module 4 reports",
      "Turning the written summary into the interpretive Overview (duplicating 2.4)",
      "Omitting GLP status of pivotal safety pharmacology studies",
      "Secondary/off-target pharmacology not addressed, leaving off-target risk uncharacterized"
    ],
    "wordCountRange": [
      2000,
      6000
    ],
    "dependencies": [
      "2.6.1",
      "2.6.3",
      "2.4"
    ]
  },
  "2.6.3": {
    "code": "2.6.3",
    "title": "Pharmacology Tabulated Summary",
    "module": 2,
    "moduleName": "CTD Summaries",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "table",
    "guidance": "Section 2.6.3 presents the nonclinical pharmacology data in the standardized ICH M4S tabular format, giving the reviewer a rapid, structured view of primary/secondary pharmacodynamics, safety pharmacology, and PD interactions. The tables condense study designs and key results for quick comparison. Acceptability depends on using the ICH-recommended table templates, completeness, and exact numerical consistency with the written summary (2.6.2) and Module 4.",
    "authoringGuidance": "Build the tables using the ICH M4S tabulated-summary templates for pharmacology, organized to parallel 2.6.2: primary pharmacodynamics, secondary pharmacodynamics, safety pharmacology, and PD drug interactions. Each table row should capture study type/identifier, test system/species, method, doses/concentrations, and key results (e.g., EC50/IC50, hERG IC50, NOEL for safety pharmacology endpoints), with GLP status and study report cross-references. Keep units and values identical to 2.6.2 and Module 4. Include the study-report location (module/volume reference). Do not add interpretation — these are data tables.",
    "keyContentElements": [
      "Primary pharmacodynamics summary table (test system, method, results such as EC50/IC50)",
      "Secondary pharmacodynamics / off-target profiling table",
      "Safety pharmacology summary tables by organ system (CV/hERG, CNS, respiratory)",
      "Pharmacodynamic drug interaction table (if applicable)",
      "Study identifiers, species/test system, and GLP status per row",
      "Doses/concentrations and key quantitative endpoints per study",
      "Cross-references to the Module 4 study reports and to 2.6.2"
    ],
    "generationPrompt": "Build CTD Module 2.6.3 Pharmacology Tabulated Summary for {{PRODUCT_NAME}} ({{SPONSOR}}) using the ICH M4S tabulated-summary templates. Provide tables paralleling 2.6.2 for primary pharmacodynamics (with endpoints such as EC50/IC50), secondary/off-target pharmacodynamics, safety pharmacology by organ system (cardiovascular/hERG, CNS, respiratory), and PD drug interactions. Each row must capture study identifier, species/test system, method, doses/concentrations, key results, GLP status, and a Module 4 cross-reference. Keep all values and units identical to 2.6.2; do not fabricate data — provide the table structure and placeholders.",
    "parentCode": "2.6",
    "expectedData": [
      "ICH M4S pharmacology tabulated summary tables (primary PD, secondary PD, safety pharmacology, PD interactions)"
    ],
    "commonPitfalls": [
      "Not using the ICH M4S standardized table templates/format",
      "Numerical values or units inconsistent with 2.6.2 or Module 4",
      "Missing GLP status or study report cross-references in the tables",
      "Incomplete coverage (e.g., safety pharmacology organ systems omitted)",
      "Adding interpretation into what should be a purely tabular presentation"
    ],
    "wordCountRange": [
      200,
      800
    ],
    "dependencies": [
      "2.6.2"
    ]
  },
  "2.6.4": {
    "code": "2.6.4",
    "title": "Pharmacokinetics Written Summary",
    "module": 2,
    "moduleName": "CTD Summaries",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "narrative",
    "guidance": "Section 2.6.4 is the factual written summary of nonclinical pharmacokinetics and ADME — analytical methods, absorption, distribution, metabolism, excretion, and PK drug interactions across species. It establishes the toxicokinetic basis for interpreting toxicology findings and supports interspecies scaling to humans. FDA reviewers use it to connect exposure in toxicology species to anticipated human exposure; acceptability depends on completeness, factual accuracy, adequate bioanalytical method description, and consistency with the tabulated summary (2.6.5) and Module 4.",
    "authoringGuidance": "Follow ICH M4S order: brief summary, analytical methods, absorption, distribution (including tissue distribution and protein binding), metabolism (in vitro and in vivo, metabolite profiling, enzyme induction/inhibition), excretion, PK drug interactions, and other/discussion. Present toxicokinetic exposure data (AUC, Cmax) that will underpin safety-margin comparisons in 2.4. Address metabolite coverage across species relevant to the MIST assessment (Metabolites in Safety Testing / ICH M3(R2)). Summarize CYP/transporter interaction findings that inform clinical DDI risk. State bioanalytical method validation status. Every parameter must reconcile with 2.6.5 and Module 4; keep interpretation limited, with integration reserved for 2.4.",
    "keyContentElements": [
      "Bioanalytical/analytical methods and validation status",
      "Absorption: bioavailability, Tmax, dose proportionality across species",
      "Distribution: volume, tissue distribution, plasma protein binding, placental transfer",
      "Metabolism: in vitro/in vivo metabolite profiling, metabolic pathways, enzyme induction/inhibition",
      "Excretion: routes, mass balance, biliary/renal/fecal recovery",
      "Toxicokinetic exposure data (AUC, Cmax) supporting safety-margin analysis",
      "Cross-species metabolite comparison relevant to MIST (ICH M3(R2))",
      "PK drug interaction (CYP/transporter) findings informing clinical DDI risk",
      "Cross-references to the 2.6.5 tables and Module 4"
    ],
    "generationPrompt": "Draft CTD Module 2.6.4 Pharmacokinetics Written Summary for {{PRODUCT_NAME}} ({{SPONSOR}}). Following ICH M4S order, factually summarize bioanalytical methods and validation status, absorption, distribution (tissue distribution, protein binding), metabolism (in vitro/in vivo metabolite profiling, enzyme induction/inhibition), excretion/mass balance, toxicokinetic exposure (AUC/Cmax) supporting safety margins, cross-species metabolite comparison relevant to MIST (ICH M3(R2)), and CYP/transporter PK interactions informing clinical DDI risk. Cross-reference the 2.6.5 tables and Module 4. Do not fabricate parameters — describe what the summary must contain and ensure consistency across summaries.",
    "parentCode": "2.6",
    "expectedData": [
      "ADME parameter summary",
      "Toxicokinetic exposure (AUC/Cmax) summary by species/dose",
      "Metabolite profile / cross-species comparison",
      "Mass balance/excretion summary"
    ],
    "commonPitfalls": [
      "Toxicokinetic exposure data insufficient to support safety-margin calculations in 2.4",
      "Cross-species metabolite comparison inadequate for the MIST assessment (ICH M3(R2))",
      "Bioanalytical method validation status not stated",
      "CYP/transporter interaction data incomplete, undermining clinical DDI risk assessment",
      "Parameters inconsistent between 2.6.4, 2.6.5, and Module 4",
      "Protein binding or tissue distribution omitted where relevant to interpretation"
    ],
    "wordCountRange": [
      2000,
      5500
    ],
    "dependencies": [
      "2.6.1",
      "2.6.5",
      "2.4",
      "2.5.3"
    ]
  },
  "2.6.5": {
    "code": "2.6.5",
    "title": "Pharmacokinetics Tabulated Summary",
    "module": 2,
    "moduleName": "CTD Summaries",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "table",
    "guidance": "Section 2.6.5 presents the nonclinical pharmacokinetic/ADME and toxicokinetic data in the standardized ICH M4S tabular format for rapid reviewer comparison across species and studies. The tables consolidate absorption, distribution, metabolism, excretion, and toxicokinetic exposure. Acceptability depends on using the ICH table templates, completeness, and exact numerical consistency with the written summary (2.6.4) and Module 4.",
    "authoringGuidance": "Build the tables using the ICH M4S PK tabulated-summary templates, organized to parallel 2.6.4: analytical methods, absorption, distribution, metabolism, excretion, PK drug interactions, and toxicokinetics. Capture study identifier, species, method, doses, and key parameters (Cmax, Tmax, AUC, t1/2, CL, Vd, %F, protein binding, recovery) with GLP status and Module 4 cross-references. Toxicokinetic tables should present exposure by species, dose, and sex over the study duration to feed safety-margin analysis. Keep units and values identical to 2.6.4. No interpretation — data tables only.",
    "keyContentElements": [
      "Analytical methods summary table",
      "Absorption/toxicokinetic exposure tables (Cmax, Tmax, AUC, t1/2) by species and dose",
      "Distribution table (Vd, tissue distribution, protein binding)",
      "Metabolism table (metabolites, pathways, enzyme kinetics)",
      "Excretion/mass balance table (routes, % recovery)",
      "PK drug interaction table (CYP/transporter)",
      "Study identifiers, species, sex, and GLP status per row",
      "Cross-references to 2.6.4 and Module 4 reports"
    ],
    "generationPrompt": "Build CTD Module 2.6.5 Pharmacokinetics Tabulated Summary for {{PRODUCT_NAME}} ({{SPONSOR}}) using the ICH M4S PK tabulated-summary templates. Provide tables paralleling 2.6.4 for analytical methods, absorption/toxicokinetics (Cmax, Tmax, AUC, t1/2 by species and dose), distribution (Vd, protein binding), metabolism (metabolites, pathways), excretion/mass balance, and PK drug interactions. Each row must capture study identifier, species, sex, doses, key parameters, GLP status, and Module 4 cross-reference. Present toxicokinetic exposure by species/dose/sex/duration to support safety margins. Keep values and units identical to 2.6.4; do not fabricate data — provide structure and placeholders.",
    "parentCode": "2.6",
    "expectedData": [
      "ICH M4S PK tabulated summary tables (absorption/TK, distribution, metabolism, excretion, interactions)"
    ],
    "commonPitfalls": [
      "Not using the ICH M4S standardized PK table templates",
      "Toxicokinetic exposure not tabulated by species/dose/sex/duration, hampering safety-margin review",
      "Values or units inconsistent with 2.6.4 or Module 4",
      "Missing GLP status or study report cross-references",
      "Incomplete ADME coverage (e.g., excretion/mass balance omitted)"
    ],
    "wordCountRange": [
      200,
      800
    ],
    "dependencies": [
      "2.6.4"
    ]
  },
  "2.6.6": {
    "code": "2.6.6",
    "title": "Toxicology Written Summary",
    "module": 2,
    "moduleName": "CTD Summaries",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "narrative",
    "guidance": "Section 2.6.6 is the factual written summary of the toxicology program — single- and repeat-dose toxicity, genotoxicity, carcinogenicity, reproductive/developmental toxicity, local tolerance, and other special toxicity studies. It provides the reviewer with a complete account of adverse findings, NOAELs, and target organs across species and durations. FDA pharm/tox reviewers rely on it to identify the toxicities of concern and their exposure margins; acceptability depends on completeness, factual accuracy, clear NOAEL determination, and consistency with the tabulated summary (2.6.7) and Module 4.",
    "authoringGuidance": "Follow ICH M4S order: brief summary; single-dose toxicity; repeat-dose toxicity (with toxicokinetics); genotoxicity (in vitro and in vivo per ICH S2(R1)); carcinogenicity (long-term and short/medium-term studies, and any rationale/waiver per ICH S1); reproductive and developmental toxicity (fertility, embryo-fetal development, pre/postnatal per ICH S5(R3)); local tolerance; and other toxicity studies (e.g., immunotoxicity, phototoxicity, impurity/metabolite qualification, juvenile toxicity). For each study state species, duration, doses, exposures, NOAEL/target organs, and reversibility, with GLP status. Present findings factually and identify NOAELs and their exposure basis (to feed the 2.4 safety-margin analysis). Address genotoxic impurity qualification (ICH M7) as relevant. Every value must reconcile with 2.6.7 and Module 4; reserve integrated interpretation for 2.4.",
    "keyContentElements": [
      "Brief summary orienting the toxicology program and pivotal GLP studies",
      "Single-dose toxicity findings",
      "Repeat-dose toxicity by species/duration: target organs, NOAEL, reversibility, with toxicokinetics",
      "Genotoxicity battery (in vitro and in vivo) per ICH S2(R1)",
      "Carcinogenicity studies and/or scientific rationale/waiver per ICH S1",
      "Reproductive and developmental toxicity (fertility, embryo-fetal, pre/postnatal) per ICH S5(R3)",
      "Local tolerance and other special toxicity (immunotoxicity, phototoxicity, juvenile)",
      "Impurity/metabolite qualification, including genotoxic impurities (ICH M7)",
      "NOAEL determinations with the exposure (AUC/Cmax) basis and GLP status per study"
    ],
    "generationPrompt": "Draft CTD Module 2.6.6 Toxicology Written Summary for {{PRODUCT_NAME}} ({{SPONSOR}}). Following ICH M4S order, factually summarize single-dose and repeat-dose toxicity (target organs, NOAEL, reversibility, with toxicokinetics), genotoxicity per ICH S2(R1), carcinogenicity or its justified deferral/waiver per ICH S1, reproductive/developmental toxicity per ICH S5(R3), local tolerance, and other special toxicity (immunotoxicity, phototoxicity, juvenile), plus impurity/metabolite qualification including genotoxic impurities per ICH M7. For each study state species, duration, doses, exposures, NOAEL, and GLP status, providing the exposure basis for safety margins. Cross-reference 2.6.7 and Module 4. Do not fabricate findings — describe what the summary must contain and ensure cross-summary consistency.",
    "parentCode": "2.6",
    "expectedData": [
      "Repeat-dose toxicity summary (species, duration, NOAEL, target organs)",
      "Genotoxicity battery results summary",
      "Reproductive/developmental toxicity summary",
      "NOAEL and exposure summary feeding safety margins"
    ],
    "commonPitfalls": [
      "NOAELs stated without the supporting toxicokinetic exposure, preventing safety-margin calculation",
      "Genotoxicity battery incomplete relative to ICH S2(R1) expectations",
      "Reproductive/developmental or carcinogenicity assessment absent or its deferral/waiver not justified (ICH S5/S1)",
      "Impurity or metabolite qualification (including ICH M7 for mutagenic impurities) not addressed",
      "Findings, target organs, or NOAELs inconsistent between 2.6.6, 2.6.7, and Module 4",
      "Non-GLP status of pivotal toxicology studies not disclosed"
    ],
    "wordCountRange": [
      3000,
      8000
    ],
    "dependencies": [
      "2.6.1",
      "2.6.7",
      "2.4",
      "2.6.4"
    ]
  },
  "2.6.7": {
    "code": "2.6.7",
    "title": "Toxicology Tabulated Summary",
    "module": 2,
    "moduleName": "CTD Summaries",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "table",
    "guidance": "Section 2.6.7 presents the toxicology data in the standardized ICH M4S tabular format, letting the reviewer rapidly compare study designs, doses, exposures, and findings across the program. The tables consolidate single/repeat-dose, genotoxicity, carcinogenicity, reproductive/developmental, and other toxicity studies with their NOAELs and toxicokinetics. Acceptability depends on using the ICH table templates, completeness, and exact numerical consistency with the written summary (2.6.6) and Module 4.",
    "authoringGuidance": "Build the tables using the ICH M4S toxicology tabulated-summary templates, organized to parallel 2.6.6: single-dose, repeat-dose (with integrated toxicokinetics), genotoxicity, carcinogenicity, reproductive/developmental, local tolerance, and other studies. Each row/table should capture study identifier, species/strain, method/duration, doses, toxicokinetic exposures, NOAEL/NOEL, major findings and target organs, and GLP status, with Module 4 cross-references. Keep units and values identical to 2.6.6. No interpretation — data tables only.",
    "keyContentElements": [
      "Single-dose toxicity table",
      "Repeat-dose toxicity tables with integrated toxicokinetics (dose, exposure, NOAEL, target organs)",
      "Genotoxicity tables (in vitro and in vivo assays, results)",
      "Carcinogenicity tables (if applicable)",
      "Reproductive/developmental toxicity tables (fertility, embryo-fetal, pre/postnatal)",
      "Local tolerance and other toxicity tables",
      "Study identifiers, species/strain, duration, and GLP status per row",
      "NOAEL/NOEL and exposure values, with Module 4 cross-references"
    ],
    "generationPrompt": "Build CTD Module 2.6.7 Toxicology Tabulated Summary for {{PRODUCT_NAME}} ({{SPONSOR}}) using the ICH M4S toxicology tabulated-summary templates. Provide tables paralleling 2.6.6 for single-dose and repeat-dose toxicity (with integrated toxicokinetics, NOAEL, target organs), genotoxicity, carcinogenicity, reproductive/developmental toxicity, local tolerance, and other studies. Each row must capture study identifier, species/strain, duration, doses, exposures, NOAEL/NOEL, major findings, GLP status, and Module 4 cross-reference. Keep values and units identical to 2.6.6; do not fabricate data — provide structure and placeholders.",
    "parentCode": "2.6",
    "expectedData": [
      "ICH M4S toxicology tabulated summary tables (single-dose, repeat-dose with TK, genotoxicity, carcinogenicity, reproductive/developmental, other)"
    ],
    "commonPitfalls": [
      "Not using the ICH M4S standardized toxicology table templates",
      "Toxicokinetic exposures not integrated with repeat-dose tables, hampering margin review",
      "NOAELs, target organs, or values inconsistent with 2.6.6 or Module 4",
      "Missing GLP status or Module 4 cross-references",
      "Incomplete coverage of study types (e.g., reproductive/developmental tables omitted)"
    ],
    "wordCountRange": [
      200,
      900
    ],
    "dependencies": [
      "2.6.6"
    ]
  },
  "2.7.1": {
    "code": "2.7.1",
    "title": "Summary of Biopharmaceutic Studies and Associated Analytical Methods",
    "module": 2,
    "moduleName": "CTD Summaries",
    "required": false,
    "requiredFor": [
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Section 2.7.1 factually summarizes the biopharmaceutic studies — bioavailability, comparative BA/bioequivalence, in vitro dissolution, and the bioanalytical methods used — that establish the performance of the dosage form and bridge formulations across development. Per ICH M4E it is a detailed but non-interpretive summary that feeds the 2.5.2 Overview. FDA reviewers use it to confirm formulation bridging and dissolution controls; acceptability depends on complete study-level results, valid bioanalytical methods, and consistency with Module 5 and the 2.3.P dissolution controls. For an IND this content is abbreviated to the available early data.",
    "authoringGuidance": "Following ICH M4E, summarize the background/overview then the results by study type: bioavailability (absolute and relative), comparative BA and bioequivalence (with 90% confidence intervals for Cmax/AUC ratios), in vitro dissolution and any in vitro-in vivo correlation, and the bioanalytical methods and their validation. Tabulate the study inventory and key PK/statistical results. Present the formulation bridging chronology so a reviewer can trace pivotal-trial formulations to the commercial product. Reference applicable FDA BA/BE and food-effect guidances and BCS-based approaches. Keep it factual; interpretation belongs in 2.5.2. Reconcile all values with the Module 5 study reports and the dissolution method in 2.3.P/3.2.P.",
    "keyContentElements": [
      "Background and overview of the biopharmaceutic development approach",
      "Bioavailability study results (absolute and relative BA)",
      "Comparative BA / bioequivalence results with 90% CIs for Cmax and AUC ratios",
      "Food-effect study results",
      "In vitro dissolution data and any IVIVC",
      "Bioanalytical method descriptions and validation summaries",
      "Formulation bridging chronology linking clinical to commercial formulations",
      "Inventory table of all biopharmaceutic studies with designs and key results"
    ],
    "generationPrompt": "Draft CTD Module 2.7.1 Summary of Biopharmaceutic Studies for {{PRODUCT_NAME}} ({{SPONSOR}}). Following ICH M4E, factually summarize bioavailability (absolute/relative), comparative BA and bioequivalence (with 90% CIs for Cmax/AUC ratios), food effect, in vitro dissolution and any IVIVC, and the bioanalytical methods and their validation. Provide a study inventory table, a BE results table, and the formulation bridging chronology linking clinical to commercial formulations, referencing applicable FDA BA/BE and food-effect guidances. Keep it non-interpretive (interpretation is in 2.5.2) and reconcile values with Module 5 and 2.3.P. Do not fabricate results — describe structure and placeholders.",
    "parentCode": "2.7",
    "expectedData": [
      "Biopharmaceutic study inventory table",
      "BE results table (Cmax/AUC geometric mean ratios and 90% CIs)",
      "Dissolution profile data",
      "Bioanalytical method validation summary"
    ],
    "commonPitfalls": [
      "BE conclusions reported without 90% confidence intervals for Cmax/AUC",
      "Bioanalytical method validation inadequate or omitted, undermining PK data reliability",
      "Formulation bridging chronology incomplete, leaving pivotal-trial-to-commercial link unproven",
      "Dissolution data inconsistent with the 2.3.P/3.2.P control strategy",
      "Interpreting/arguing instead of summarizing (duplicating 2.5.2)",
      "Food-effect results not summarized when a labeling statement depends on them"
    ],
    "wordCountRange": [
      1500,
      4000
    ],
    "dependencies": [
      "2.5.2",
      "2.7.2",
      "2.3.P"
    ]
  },
  "2.7.2": {
    "code": "2.7.2",
    "title": "Summary of Clinical Pharmacology Studies",
    "module": 2,
    "moduleName": "CTD Summaries",
    "required": false,
    "requiredFor": [
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Section 2.7.2 factually summarizes human pharmacokinetics, pharmacodynamics, exposure-response, and related clinical pharmacology studies — including special populations and drug-interaction studies — that support dose selection and labeling. Per ICH M4E it is a detailed, non-interpretive summary feeding the 2.5.3 Overview. FDA clinical pharmacology reviewers rely on it for the quantitative basis of dosing, special-population adjustments, and DDI language; acceptability depends on complete study-level PK/PD results, sound modeling summaries, and consistency with Module 5. For an IND this is abbreviated to available Phase 1 data.",
    "authoringGuidance": "Following ICH M4E, summarize by topic: background/overview; human biopharmaceutics/PK (single/multiple dose, dose proportionality, accumulation, intrinsic-factor PK); PK in special populations (renal, hepatic, age, sex, race, weight, pediatric); PD and exposure-response for efficacy and safety; and drug-drug interaction studies (in vitro and clinical, CYP/transporter). Summarize any population PK, PBPK, and exposure-response modeling used for labeling, including model qualification. Present the QT/QTc analysis (thorough QT or concentration-QTc per ICH E14). Tabulate PK parameters and the study inventory. Keep it factual — interpretation and dosing conclusions belong in 2.5.3. Reconcile all values with the Module 5 study reports and clinical pharmacology reviews.",
    "keyContentElements": [
      "Background/overview and inventory of clinical pharmacology studies",
      "Human PK: single/multiple dose parameters, dose proportionality, accumulation, variability",
      "PK in special populations (renal, hepatic, age, sex, race, weight, pediatric)",
      "Pharmacodynamics, biomarkers, and exposure-response for efficacy and safety",
      "Drug-drug interaction results (in vitro and clinical; CYP and transporter based)",
      "QT/QTc assessment (thorough QT or concentration-QTc per ICH E14)",
      "Population PK / PBPK / exposure-response modeling summaries and qualification",
      "PK parameter and study-inventory tables"
    ],
    "generationPrompt": "Draft CTD Module 2.7.2 Summary of Clinical Pharmacology Studies for {{PRODUCT_NAME}} ({{SPONSOR}}) in {{INDICATION}}. Following ICH M4E, factually summarize human PK (single/multiple dose, dose proportionality, accumulation, variability), PK in special populations (renal, hepatic, age, sex, race, weight, pediatric), PD and exposure-response for efficacy and safety, drug-drug interactions (in vitro and clinical, CYP/transporter), and the QT/QTc analysis per ICH E14, plus any population PK/PBPK/exposure-response modeling with qualification. Provide a study inventory table, PK parameter tables, and a DDI table. Keep it non-interpretive (dosing conclusions are in 2.5.3) and reconcile with Module 5. Do not fabricate parameters — describe structure and placeholders.",
    "parentCode": "2.7",
    "expectedData": [
      "Clinical pharmacology study inventory table",
      "PK parameter summary tables by study/population",
      "DDI results table",
      "Exposure-response / QT analysis summary",
      "Special-population PK comparison table"
    ],
    "commonPitfalls": [
      "Special-population PK not summarized, leaving dose-adjustment labeling unsupported",
      "DDI program incomplete for major CYP/transporter pathways (frequent FDA IR source)",
      "QT/QTc analysis missing or not aligned with ICH E14 expectations",
      "PopPK/PBPK models relied on for labeling without a qualification/validation summary",
      "PK parameters inconsistent with Module 5 study reports",
      "Interpreting results or drawing dosing conclusions that belong in 2.5.3"
    ],
    "wordCountRange": [
      2500,
      6000
    ],
    "dependencies": [
      "2.5.3",
      "2.7.1",
      "2.7.3",
      "2.7.4"
    ]
  },
  "2.7.3": {
    "code": "2.7.3",
    "title": "Summary of Clinical Efficacy",
    "module": 2,
    "moduleName": "CTD Summaries",
    "required": false,
    "requiredFor": [
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Section 2.7.3 is where the Integrated Summary of Efficacy (ISE) narrative lives — the detailed, cross-study analysis of efficacy for each proposed indication, pooling data where appropriate to support the effectiveness claim. Per ICH M4E it is the comprehensive factual efficacy summary feeding the 2.5.4 Overview, and for a US NDA/BLA it houses the integrated efficacy analyses FDA expects under 21 CFR 314.50(d)(5)(v). FDA statistical and clinical reviewers scrutinize it for the pooled evidence, subgroup consistency, and persistence of effect; acceptability depends on rigorous integrated analyses, pre-specified vs. post hoc clarity, and full consistency with Module 5 study reports. This is abbreviated for an IND.",
    "authoringGuidance": "Organize per ICH M4E: background and overview of clinical efficacy; a table of all studies pertinent to efficacy; comparison and analyses of results across studies (study populations, comparisons of efficacy results of all studies, comparison of results in subpopulations); analysis of clinical information relevant to dosing recommendations; persistence of efficacy and/or tolerance effects; and appendices with tables/figures. Present the integrated (pooled) efficacy analyses — the ISE — with clear identification of pre-specified versus post hoc analyses, multiplicity handling, and the estimand/missing-data framework (ICH E9/E9(R1)). Provide demographic and baseline comparability across pooled studies, primary and secondary endpoint results with effect sizes and CIs, and subgroup/forest analyses (age, sex, race, region, disease severity). Address dose-response for efficacy and durability. Keep it factual; interpretation belongs in 2.5.4. Reconcile every number with Module 5.",
    "keyContentElements": [
      "Background and overview of clinical efficacy across the program",
      "Inventory table of all efficacy-relevant studies (design, population, endpoints)",
      "Integrated/pooled efficacy analyses (ISE) with pre-specified vs. post hoc identification",
      "Primary and key secondary endpoint results with effect sizes and confidence intervals",
      "Cross-study comparison of populations and results, including comparability of pooled data",
      "Subgroup analyses (age, sex, race, region, disease severity) with forest plots",
      "Statistical methodology: multiplicity control, estimands, and missing-data handling (ICH E9/E9(R1))",
      "Analyses relevant to dosing recommendations and dose-response for efficacy",
      "Persistence/durability of effect and any tolerance/loss of effect over time"
    ],
    "generationPrompt": "Draft CTD Module 2.7.3 Summary of Clinical Efficacy for {{PRODUCT_NAME}} ({{SPONSOR}}) in {{INDICATION}} — this houses the Integrated Summary of Efficacy (ISE). Following ICH M4E, provide the background/overview, an inventory of all efficacy-relevant studies, the integrated/pooled efficacy analyses with pre-specified vs. post hoc identification, primary and secondary endpoint results with effect sizes and CIs, cross-study and subgroup analyses (age, sex, race, region, severity) with forest plots, statistical methodology (multiplicity, estimands, and missing-data handling per ICH E9/E9(R1)), dosing-relevant analyses and dose-response, and persistence/durability of effect. Include the pooled demographic/baseline table and support the substantial-evidence basis under 21 CFR 314.50/314.126. Keep it factual (interpretation is in 2.5.4) and reconcile with Module 5. Do not fabricate results — describe structure and placeholders.",
    "parentCode": "2.7",
    "expectedData": [
      "Efficacy study inventory table",
      "Integrated efficacy results tables (primary/secondary endpoints, effect sizes, CIs)",
      "Subgroup/forest plot data",
      "Demographic and baseline characteristics of pooled population",
      "Dose-response and durability summaries"
    ],
    "commonPitfalls": [
      "Pooling studies that are not appropriately combinable, or not justifying the pooling strategy",
      "Post hoc analyses presented without clearly distinguishing them from pre-specified analyses",
      "Multiplicity/type I error or missing-data/estimand handling not adequately described (ICH E9(R1))",
      "Subgroup inconsistencies (e.g., by sex, race, region) not surfaced or explained",
      "Integrated efficacy results not reconciling with individual Module 5 study reports",
      "Drifting into interpretation/benefit framing that belongs in 2.5.4"
    ],
    "wordCountRange": [
      4000,
      12000
    ],
    "dependencies": [
      "2.5.4",
      "2.7.2",
      "2.7.6",
      "2.7.4"
    ]
  },
  "2.7.4": {
    "code": "2.7.4",
    "title": "Summary of Clinical Safety",
    "module": 2,
    "moduleName": "CTD Summaries",
    "required": false,
    "requiredFor": [
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Section 2.7.4 is where the Integrated Summary of Safety (ISS) narrative lives — the comprehensive, pooled analysis of safety across the entire clinical program, the single most scrutinized safety document in the application. Per ICH M4E it is the detailed factual safety summary feeding the 2.5.5 Overview, and for a US NDA/BLA it houses the integrated safety analyses FDA expects under 21 CFR 314.50(d)(5)(vi). FDA reviewers mine it for exposure, adverse-event patterns, deaths, serious events, laboratory signals, and adverse events of special interest; acceptability depends on a rigorous pooling strategy, complete adverse-event accounting, and full consistency with Module 5. This is abbreviated for an IND.",
    "authoringGuidance": "Organize per ICH M4E: exposure (extent of exposure by dose, duration, demographics; patient-years); adverse events (common/overall AEs, deaths, other serious adverse events, other significant AEs, analysis by organ system/syndrome, AEs by dose/time/demographics); clinical laboratory evaluations (hematology, chemistry, urinalysis, shifts, marked abnormalities, hepatotoxicity/Hy's Law analysis); vital signs, physical findings, and ECG (including QT); safety in special populations and situations (intrinsic/extrinsic factors, drug interactions, pregnancy/lactation, overdose, withdrawal/rebound, abuse potential); and post-marketing data if any. Define and justify the pooling strategy (which studies grouped and why). Provide the integrated (ISS) analyses with MedDRA coding, standardized AE tables, and dedicated analyses of adverse events of special interest and important identified/potential risks. Present a rigorous hepatotoxicity (Hy's Law/eDISH) evaluation. Keep it factual; interpretation and risk framing belong in 2.5.5. Reconcile all counts and rates with Module 5.",
    "keyContentElements": [
      "Extent of exposure: subjects, patient-years, dose/duration/demographic distribution, and pooling strategy",
      "Overall/common adverse events with incidence by treatment group (MedDRA-coded)",
      "Deaths, other serious adverse events, and adverse events leading to discontinuation",
      "Analysis of adverse events by organ system, dose, time, and demographic subgroup",
      "Clinical laboratory evaluations including hematology, chemistry, and hepatotoxicity (Hy's Law/eDISH)",
      "Vital signs, ECG/QT, and physical examination findings",
      "Adverse events of special interest and important identified/potential risks",
      "Safety in special populations and situations (organ impairment, pregnancy/lactation, overdose, withdrawal, abuse potential)",
      "Post-marketing safety data (if available) and any immunogenicity data for biologics"
    ],
    "generationPrompt": "Draft CTD Module 2.7.4 Summary of Clinical Safety for {{PRODUCT_NAME}} ({{SPONSOR}}) in {{INDICATION}} — this houses the Integrated Summary of Safety (ISS). Following ICH M4E, define and justify the pooling strategy, then summarize extent of exposure (subjects, patient-years, dose/duration/demographics); adverse events (common, deaths, serious, discontinuations; analyses by organ system, dose, time, and subgroup, MedDRA-coded); clinical laboratory evaluations including a rigorous hepatotoxicity/Hy's Law (eDISH) analysis; vital signs and ECG/QT; adverse events of special interest and important identified/potential risks; and safety in special populations and situations (organ impairment, pregnancy/lactation, overdose, withdrawal, abuse potential, and immunogenicity for biologics). Support the integrated safety analyses expected under 21 CFR 314.50, include the required pooled tables, and cross-reference deaths/SAE narratives to 2.7.6. Keep it factual (risk framing is in 2.5.5) and reconcile with Module 5. Do not fabricate rates — describe structure and placeholders.",
    "parentCode": "2.7",
    "expectedData": [
      "Integrated exposure table (patient-years by dose/duration/demographics)",
      "Pooled adverse event incidence tables by SOC/PT",
      "Deaths and serious adverse event listings/summaries",
      "Laboratory shift tables and Hy's Law/eDISH plot data",
      "Adverse events of special interest summary tables",
      "Immunogenicity summary (biologics)"
    ],
    "commonPitfalls": [
      "Pooling strategy undefined or inappropriate (combining incompatible studies), a top FDA IR trigger",
      "Incomplete accounting of deaths and serious adverse events, or narratives not cross-referenced (2.7.6)",
      "Hepatotoxicity not rigorously evaluated (no Hy's Law/eDISH analysis)",
      "Adverse events of special interest and important risks not analyzed with dedicated pooled analyses",
      "MedDRA coding inconsistencies or rates that do not reconcile with Module 5",
      "Special-situation safety (pregnancy, overdose, withdrawal, abuse potential, immunogenicity for biologics) omitted",
      "Minimizing signals or deferring interpretation without presenting the underlying integrated data"
    ],
    "wordCountRange": [
      5000,
      14000
    ],
    "dependencies": [
      "2.5.5",
      "2.7.3",
      "2.7.6",
      "2.7.2"
    ]
  },
  "2.7.5": {
    "code": "2.7.5",
    "title": "Literature References",
    "module": 2,
    "moduleName": "CTD Summaries",
    "required": false,
    "requiredFor": [
      "NDA",
      "BLA"
    ],
    "contentType": "list",
    "guidance": "Section 2.7.5 is the consolidated list of literature references cited in the Module 2.7 clinical summaries, with copies of the referenced articles provided per regional requirements. It lets the reviewer locate and verify every published source relied upon in the efficacy, safety, and clinical pharmacology summaries. Acceptability depends on a complete, accurately formatted reference list that matches every in-text citation and includes retrievable copies where required.",
    "authoringGuidance": "Provide a complete reference list in a consistent citation style (e.g., Vancouver/ICMJE) for all literature cited across 2.7.1–2.7.4 (and coordinate with 2.5 references as applicable). Number references to match the in-text citations in the summaries. Provide full-text copies of each cited publication as required for the region (typically in Module 5.4 for the US, with 2.7.5 serving as the reference list). Verify that every citation in the summaries appears in the list and vice versa, and that DOIs/PMIDs and publication details are accurate. Do not include uncited references or rely on non-retrievable sources.",
    "keyContentElements": [
      "Complete, consistently formatted reference list (e.g., ICMJE/Vancouver style)",
      "Numbering aligned to in-text citations in 2.7.1–2.7.4",
      "Full bibliographic details (authors, title, journal, year, volume, pages, DOI/PMID)",
      "Cross-reference to full-text copies (e.g., Module 5.4) per regional requirement",
      "Coverage of all sources cited in the clinical summaries with no orphan citations"
    ],
    "generationPrompt": "Compile CTD Module 2.7.5 Literature References for {{PRODUCT_NAME}} ({{SPONSOR}}). Provide a complete, consistently formatted reference list (ICMJE/Vancouver style) for every source cited in the 2.7.1–2.7.4 clinical summaries, numbered to match the in-text citations, with full bibliographic details and DOIs/PMIDs. Cross-reference full-text copies per regional requirements (e.g., Module 5.4 for the US). Ensure no orphan citations in either direction; do not fabricate references — provide the list structure and formatting rules.",
    "parentCode": "2.7",
    "expectedData": [
      "Formatted literature reference list"
    ],
    "commonPitfalls": [
      "Citations in the summaries missing from the reference list (or vice versa)",
      "Inconsistent or incomplete citation formatting and missing DOIs/PMIDs",
      "Referenced full-text articles not provided where the region requires copies",
      "Including uncited or non-retrievable references",
      "Reference numbering that does not match the in-text citations"
    ],
    "wordCountRange": [
      100,
      600
    ],
    "dependencies": [
      "2.7.1",
      "2.7.2",
      "2.7.3",
      "2.7.4"
    ]
  },
  "2.7.6": {
    "code": "2.7.6",
    "title": "Synopses of Individual Studies",
    "module": 2,
    "moduleName": "CTD Summaries",
    "required": false,
    "requiredFor": [
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Section 2.7.6 provides a consistent set of study synopses for the individual clinical studies, giving the reviewer a standardized one-to-several-page abstract of each study's design, population, treatments, endpoints, and results. Per ICH M4E it typically references the tabular listing of all clinical studies and presents ICH E3-style synopses. It is the bridge between the integrated summaries (2.7.3/2.7.4) and the full study reports in Module 5; acceptability depends on synopses that are complete, uniformly structured, and exactly consistent with the corresponding Clinical Study Reports.",
    "authoringGuidance": "Include a synopsis for each clinical study, ideally in a consistent format based on the ICH E3 synopsis (Clinical Study Report guideline), covering: study identifier and title, objectives, design, population and key eligibility, treatments and duration, endpoints, statistical methods, subject disposition, key efficacy results, and key safety results. Reference or reproduce the tabular listing of all clinical studies that maps each study to its Module 5 location. Ensure each synopsis reconciles exactly with its full Clinical Study Report (CSR) and with the pooled analyses in 2.7.3/2.7.4. Keep synopses concise and uniform so the reviewer can compare studies at a glance. Include SAE/death narratives cross-references where relevant.",
    "keyContentElements": [
      "Tabular listing of all clinical studies mapped to Module 5 locations",
      "Per-study synopsis in a consistent ICH E3-based format",
      "Study identifier, title, objectives, and design (randomization, blinding, control)",
      "Population, key eligibility criteria, and subject disposition",
      "Treatments, doses, and duration",
      "Primary/secondary endpoints and statistical methods",
      "Key efficacy and safety results per study",
      "Cross-references to the corresponding Clinical Study Reports and to 2.7.3/2.7.4"
    ],
    "generationPrompt": "Compile CTD Module 2.7.6 Synopses of Individual Studies for {{PRODUCT_NAME}} ({{SPONSOR}}) in {{INDICATION}}. Provide a tabular listing of all clinical studies mapped to their Module 5 locations, then a uniform ICH E3-based synopsis for each study covering identifier/title, objectives, design (randomization, blinding, control), population and eligibility, treatments and duration, endpoints, statistical methods, subject disposition, and key efficacy and safety results. Ensure each synopsis reconciles exactly with its Clinical Study Report and with the pooled analyses in 2.7.3/2.7.4, and cross-reference SAE/death narratives. Do not fabricate results — describe the synopsis structure and placeholders.",
    "parentCode": "2.7",
    "expectedData": [
      "Tabular listing of all clinical studies",
      "Individual study synopsis tables/abstracts (ICH E3 format)"
    ],
    "commonPitfalls": [
      "Synopses inconsistent with the corresponding Clinical Study Reports or with the pooled 2.7.3/2.7.4 analyses",
      "Non-uniform synopsis formats making cross-study comparison difficult",
      "Missing synopses for some studies, or the study-listing table not mapping to Module 5 locations",
      "Omitting subject disposition or key safety results from a synopsis",
      "Discrepancies in endpoint definitions or results versus the CSR"
    ],
    "wordCountRange": [
      1000,
      6000
    ],
    "dependencies": [
      "2.7.3",
      "2.7.4",
      "2.7.2"
    ]
  },
  "3.2.A": {
    "code": "3.2.A",
    "title": "Appendices (Facilities and Equipment, Adventitious Agents Safety Evaluation, Excipients)",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Houses the CTD Quality appendices that supplement the S and P sections, per ICH M4Q(R1): A.1 Facilities and Equipment (principally for biotech/biologics), A.2 Adventitious Agents Safety Evaluation, and A.3 Excipients (novel excipients). Reviewers rely on A.2 in particular to confirm that viral, TSE/BSE, and microbial contamination risks are controlled and that clearance/inactivation has been validated where applicable per ICH Q5A(R2) and Q5D. A.1 supports assessment of multiproduct facilities and containment/cross-contamination control for biologics. Acceptability requires that adventitious-agent risks are systematically assessed and that any human/animal-sourced materials are traced and controlled.",
    "authoringGuidance": "For A.1, describe the facility layout, equipment, and product/personnel/material/waste flows relevant to contamination and cross-contamination control for multiproduct or biologic manufacture, with segregation and campaign/changeover controls. For A.2, provide the adventitious agents safety evaluation: for non-viral agents, the sourcing and TSE/BSE control of animal-derived materials (with certificates and EDQM CEP where available); for viral safety of biologics, the testing of cell banks and raw materials plus viral clearance/inactivation validation per ICH Q5A(R2); and microbial/mycoplasma controls. For A.3, provide full information on any novel excipient (safety, manufacture, characterization, control), cross-referencing P.4.6. Include only the appendices relevant to the product and clearly state where an appendix is not applicable.",
    "keyContentElements": [
      "A.1 Facilities and Equipment: layout, equipment, and flows for contamination/cross-contamination control (biologics/multiproduct)",
      "A.1 segregation, campaign changeover, and cleaning/containment controls",
      "A.2 sourcing and TSE/BSE control of animal-derived materials with certificates/CEP",
      "A.2 viral safety for biologics: cell bank and raw material testing per ICH Q5A(R2)/Q5D",
      "A.2 viral clearance/inactivation validation studies (spiking studies, log reduction) for biologics",
      "A.2 microbial and mycoplasma control strategy",
      "A.3 novel excipient full information (safety, manufacture, characterization, control), cross-reference P.4.6",
      "Clear statement of applicability/non-applicability of each appendix to the product"
    ],
    "generationPrompt": "Draft CTD section 3.2.A (Appendices) for {{PRODUCT_NAME}} for {{INDICATION}}, sponsored by {{SPONSOR}} at {{PHASE}}, per ICH M4Q, Q5A(R2), and Q5D. Provide the appendices relevant to the product: A.1 Facilities and Equipment (facility layout, equipment, and flows for contamination/cross-contamination control for biologic/multiproduct manufacture); A.2 Adventitious Agents Safety Evaluation (TSE/BSE sourcing and certificates for animal-derived materials; for biologics, cell bank/raw material testing and viral clearance/inactivation validation with log-reduction data; microbial/mycoplasma controls); and A.3 Excipients (full safety/manufacture/characterization/control for any novel excipient, cross-referencing P.4.6). Clearly state where an appendix is not applicable. Use bracketed placeholders for study results and certificates rather than inventing them; describe study designs and where data belong.",
    "parentCode": "3.2",
    "expectedData": [
      "TSE/BSE certificates and sourcing summary tables",
      "Viral clearance validation summary (process step / model virus / log reduction) for biologics",
      "Facility flow diagrams for biologic/multiproduct manufacture",
      "Novel excipient characterization/safety data summaries"
    ],
    "commonPitfalls": [
      "Omitting or under-documenting viral clearance validation for a biologic (ICH Q5A(R2))",
      "Animal-derived materials without TSE/BSE sourcing documentation or certificates",
      "No cross-contamination/segregation strategy for multiproduct or biologic facilities in A.1",
      "Novel excipient in A.3 lacking adequate safety qualification",
      "Providing appendices not relevant while omitting the ones the product requires, or not stating non-applicability"
    ],
    "wordCountRange": [
      400,
      3000
    ],
    "dependencies": [
      "3.2.P.3.1",
      "3.2.P.3.3",
      "3.2.P.4",
      "3.2.S.2.3"
    ]
  },
  "3.2.P.1": {
    "code": "3.2.P.1",
    "title": "Description and Composition of the Drug Product",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "table",
    "guidance": "Establishes the qualitative and quantitative identity of the finished drug product and every ingredient it contains, per ICH M4Q(R1) and 21 CFR 314.50(d)(1). It is the reviewer's anchor for cross-checking every downstream section (batch formula in 3.2.P.3.2, excipient controls in 3.2.P.4, specifications in 3.2.P.5.1), so any inconsistency here propagates into information requests. Reviewers read it to confirm the dosage form, strength(s), the function of each excipient, and that overages are declared and justified rather than hidden. Acceptability turns on internal consistency, complete component disclosure (including processing aids and imprinting inks), and clear reference to the reconstitution diluent or accompanying device where applicable.",
    "authoringGuidance": "State the dosage form, route of administration, and each strength, then present a composition table listing every component, its quantity per unit dose, the unit of measure, its function, and a reference to its quality standard (USP/NF, Ph.Eur., JP, or in-house). Declare any overage explicitly with a cross-reference to its justification in 3.2.P.2, and clearly mark components removed during processing (e.g., water, nitrogen, solvents). Describe the type of container closure system at a high level and reference 3.2.P.7 for detail, and for reconstitutable or co-packaged products describe the diluent and any administration device. Keep component names and grade descriptors identical to those used in 3.2.P.3.2 and 3.2.P.4 so the reviewer can reconcile the three sections without ambiguity.",
    "keyContentElements": [
      "Dosage form, route of administration, and complete list of strengths",
      "Composition table: component name, quantity per dosage unit, units, function, and quality standard reference",
      "Statement of the function of each excipient (e.g., diluent, disintegrant, lubricant, buffer, tonicity agent)",
      "Declaration and justification cross-reference for any overage",
      "Identification of components removed during manufacture (processing aids, solvents, gases)",
      "Description of accompanying reconstitution diluent, and its own composition where a novel diluent is used",
      "High-level description of the container closure system with cross-reference to 3.2.P.7",
      "For products with a device component, identification of the device and cross-reference to relevant sections",
      "Statement of the pharmacopoeial or in-house monograph applied to the finished product where one exists"
    ],
    "generationPrompt": "Draft CTD section 3.2.P.1 (Description and Composition of the Drug Product) for {{PRODUCT_NAME}}, a product indicated for {{INDICATION}}, sponsored by {{SPONSOR}}, at development {{PHASE}}. Open with the dosage form, route of administration, and all strengths. Produce a unit composition table per strength listing each component, quantity per dosage unit, units, function, and quality standard (USP/NF, Ph.Eur., JP, or in-house). Explicitly declare any overage with a cross-reference to its justification in 3.2.P.2, identify components removed during manufacture, describe any reconstitution diluent or co-packaged device, and give a high-level container closure description referencing 3.2.P.7. Use placeholder brackets where specific quantities are product data rather than fabricating values, and keep component nomenclature consistent with 3.2.P.3.2 and 3.2.P.4.",
    "parentCode": "3.2.P",
    "expectedData": [
      "Unit composition table (component / quantity per unit / units / function / reference to standard)",
      "Batch-independent quantitative composition per strength"
    ],
    "commonPitfalls": [
      "Composition quantities that do not reconcile with the batch formula in 3.2.P.3.2 after scaling",
      "Undeclared or unjustified overages, or overage described without cross-reference to 3.2.P.2",
      "Omitting processing aids, imprinting inks, capsule shell components, or the reconstitution diluent",
      "Vague excipient functions or inconsistent component nomenclature/grade between P.1, P.3.2, and P.4",
      "Failing to state the quality standard (compendial vs. in-house) for each component"
    ],
    "wordCountRange": [
      500,
      1100
    ],
    "dependencies": [
      "3.2.P.3.2",
      "3.2.P.4",
      "3.2.P.5.1",
      "3.2.P.7",
      "3.2.P.2"
    ]
  },
  "3.2.P.2": {
    "code": "3.2.P.2",
    "title": "Pharmaceutical Development",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "narrative",
    "guidance": "This is the scientific narrative that demonstrates, per ICH Q8(R2), that the formulation and manufacturing process were rationally designed to consistently deliver a product with the intended quality and performance. Reviewers use it to understand the Quality Target Product Profile (QTPP), the critical quality attributes (CQAs), and the studies linking material attributes and process parameters to those CQAs; a strong section justifies the control strategy that appears in P.3.4, P.5.1, and P.5.6. It is where a sponsor may present a Quality-by-Design approach, design space, and any proposed regulatory flexibility. Acceptability rests on a defensible, data-supported rationale rather than assertions, with clear risk assessment (ICH Q9) tying development findings to controls.",
    "authoringGuidance": "Define the QTPP and derive the CQAs, then narrate the development of the formulation, the drug substance–excipient compatibility studies, and the selection of the container closure system and manufacturing process. Present the risk assessments (ICH Q9) that prioritized material attributes and process parameters, the studies (including DoE) that established their relationship to CQAs, and, if a QbD approach is used, the design space and its verification. Address overages with quantitative justification, discuss physicochemical and biological properties relevant to performance (dissolution, particle size, polymorphic form), and for solutions/parenterals justify pH, tonicity, and antioxidant/preservative selection with any preservative effectiveness data. Explicitly connect development conclusions to the elements of the control strategy so the reviewer sees the through-line from science to specification.",
    "keyContentElements": [
      "Quality Target Product Profile (QTPP) and identification of CQAs with rationale",
      "Development history of the formulation, including changes across clinical phases and bridging where relevant",
      "Drug substance–excipient and excipient–excipient compatibility study summaries",
      "Physicochemical and biological characterization relevant to performance (solubility, pKa, polymorphism, particle size, permeability/BCS class)",
      "Risk assessment (ICH Q9) linking material attributes and process parameters to CQAs",
      "Design of Experiments (DoE) summaries and, where applicable, the proposed design space and its verification",
      "Justification of overages with supporting data",
      "Container closure system selection rationale, including protection, compatibility, and functional suitability",
      "Microbiological attributes: preservative selection and preservative effectiveness testing rationale where applicable",
      "Dissolution/drug release method development and discriminating power, and IVIVC/biowaiver rationale where applicable",
      "Compatibility with reconstitution diluents and in-use/administration conditions",
      "Explicit linkage of development conclusions to the proposed control strategy (P.3.4, P.5.1, P.5.6)"
    ],
    "generationPrompt": "Draft CTD section 3.2.P.2 (Pharmaceutical Development) for {{PRODUCT_NAME}} for {{INDICATION}}, sponsored by {{SPONSOR}} at {{PHASE}}, following ICH Q8(R2) and Q9. Define the QTPP and derive the CQAs with rationale. Narrate formulation development, drug substance–excipient compatibility, physicochemical/biological characterization, and container closure selection. Present the risk assessment linking material attributes and process parameters to CQAs, summarize any DoE and proposed design space with verification, justify overages quantitatively, and address dissolution method development and (if a parenteral) pH/tonicity/preservative selection with preservative effectiveness rationale. Close by tracing each development conclusion to the corresponding control in 3.2.P.3.4, 3.2.P.5.1, and 3.2.P.5.6. Where specific study results are product data, describe the study design and where results belong rather than inventing numbers. Scale depth to {{PHASE}}: an early IND emphasizes rationale and safety-relevant controls, an NDA/BLA emphasizes a fully justified control strategy.",
    "parentCode": "3.2.P",
    "expectedData": [
      "Excipient compatibility study summary tables",
      "DoE factor/response tables and design-space summaries",
      "Dissolution method development and discrimination data",
      "Risk assessment/FMEA tables mapping parameters to CQAs",
      "Comparative formulation/bridging data across clinical phases"
    ],
    "commonPitfalls": [
      "Listing CQAs without a QTPP-based rationale or without linking them to controls",
      "Asserting a design space without adequate multivariate data or verification at the edges",
      "Failing to bridge formulation or process changes between early-phase clinical and to-be-marketed product",
      "Omitting a discriminating dissolution method justification, or presenting a method that fails to discriminate",
      "Justifying overage on manufacturing convenience rather than stability/assay data",
      "Weak or absent risk assessment, leaving critical parameters unidentified and unjustified"
    ],
    "wordCountRange": [
      1500,
      5000
    ],
    "dependencies": [
      "3.2.P.1",
      "3.2.P.3.3",
      "3.2.P.3.4",
      "3.2.P.5.1",
      "3.2.P.5.6",
      "3.2.P.7",
      "3.2.S.1"
    ]
  },
  "3.2.P.3": {
    "code": "3.2.P.3",
    "title": "Manufacture",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "The umbrella section for how the drug product is made, organizing the manufacturer identity, batch formula, process description, critical-step controls, and process validation into a coherent whole per ICH M4Q(R1). Reviewers read the parent narrative to orient themselves before drilling into the sub-sections and to confirm that the described process, sites, and scale are consistent across P.3.1 through P.3.5. It should present a concise orientation rather than duplicate the detailed content of its children. Acceptability depends on internal consistency and a clear statement of which sites and process trains support the submission.",
    "authoringGuidance": "Provide a brief orienting overview of the manufacturing approach and then defer to the sub-sections for detail, ensuring the batch scale, process train, and sites are described identically throughout. Confirm that all manufacturers listed in P.3.1 map to the operations they perform, that the batch formula in P.3.2 scales consistently to the process in P.3.3, and that the critical steps controlled in P.3.4 flow from the development rationale in P.2. Keep this parent section lean and use it to signal the manufacturing strategy (e.g., conventional, continuous, aseptic vs. terminal sterilization).",
    "keyContentElements": [
      "Concise overview of the manufacturing strategy and dosage-form processing approach",
      "Statement of manufacturing scale(s) covered by the submission and their relationship to clinical/commercial batches",
      "Identification of the sterilization approach for sterile products (aseptic processing vs. terminal sterilization)",
      "Roadmap to sub-sections P.3.1 through P.3.5 with confirmation of consistency",
      "Statement of any continuous manufacturing or novel technology elements"
    ],
    "generationPrompt": "Draft the parent CTD section 3.2.P.3 (Manufacture) for {{PRODUCT_NAME}} for {{INDICATION}}, sponsored by {{SPONSOR}} at {{PHASE}}. Provide a concise orientation to the manufacturing strategy, the batch scale(s) covered, and the sterilization approach if sterile, then defer to sub-sections P.3.1–P.3.5. Keep it lean and ensure batch scale, process train, and site references are stated consistently with the sub-sections. Do not duplicate detailed content.",
    "parentCode": "3.2.P",
    "commonPitfalls": [
      "Duplicating detailed content that belongs in sub-sections, creating divergence risk",
      "Inconsistent batch scale or process description between the parent and the sub-sections",
      "Failing to state the sterilization strategy up front for sterile products"
    ],
    "wordCountRange": [
      200,
      600
    ],
    "dependencies": [
      "3.2.P.3.1",
      "3.2.P.3.2",
      "3.2.P.3.3",
      "3.2.P.3.4",
      "3.2.P.3.5"
    ]
  },
  "3.2.P.3.1": {
    "code": "3.2.P.3.1",
    "title": "Manufacturer(s)",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "table",
    "guidance": "Identifies every facility and party involved in the manufacture, packaging, testing, and storage of the drug product, per ICH M4Q(R1) and 21 CFR 314.50(d)(1). Reviewers and the FDA facility-inspection group use this to confirm each site's registration status, DUNS/FEI numbers, and the specific operation it performs, and to schedule pre-approval inspections. Omissions or address mismatches here directly delay approval because a site cannot be cleared for an operation it is not correctly listed for. Acceptability requires that every operation in P.3.3 and P.5.2 maps to a named, fully addressed, and appropriately identified establishment.",
    "authoringGuidance": "Tabulate each manufacturer, contract manufacturer, packager, and contract testing laboratory with full legal name, complete street address, and the specific responsibility (e.g., drug product manufacture, primary/secondary packaging, release testing, stability testing, sterilization). Include the FEI number and, for U.S. submissions, DUNS numbers, and ensure each site's role reconciles with the process steps in P.3.3 and the analytical work in P.5.2. Note the registration/GMP status where appropriate and ensure names/addresses exactly match the Form FDA 356h and the establishment information elsewhere in the application. Do not list a site generically as \"manufacturer\" when it performs only packaging or testing.",
    "keyContentElements": [
      "Table of each establishment: legal name, full street address, city, country",
      "Specific operation performed by each site (manufacture, packaging, labeling, testing, sterilization, storage)",
      "FEI number and DUNS number for each site",
      "Cross-reference of each site's role to the process steps in P.3.3 and analytical work in P.5.2",
      "Identification of contract facilities and their contractual role",
      "Statement of GMP/registration status where relevant"
    ],
    "generationPrompt": "Draft CTD section 3.2.P.3.1 (Manufacturers) for {{PRODUCT_NAME}} sponsored by {{SPONSOR}} at {{PHASE}}. Produce a table of every establishment involved in manufacture, packaging, labeling, testing, sterilization, and storage, with legal name, full address, FEI and DUNS numbers, and the specific operation performed. Map each site's role to the process steps in P.3.3 and testing in P.5.2. Use bracketed placeholders for site-specific identifiers that are sponsor data rather than inventing them, and ensure roles are stated specifically (not generic 'manufacturer').",
    "parentCode": "3.2.P.3",
    "expectedData": [
      "Manufacturer/site table (name, address, FEI/DUNS, operation performed)"
    ],
    "commonPitfalls": [
      "Site addresses that do not exactly match Form FDA 356h or the DMF/establishment records",
      "Listing a site without specifying the exact operation it performs, delaying inspection scheduling",
      "Missing contract testing laboratories or the sterilization contractor",
      "Omitting FEI/DUNS numbers or providing outdated registration information"
    ],
    "wordCountRange": [
      150,
      500
    ],
    "dependencies": [
      "3.2.P.3.3",
      "3.2.P.5.2",
      "3.2.A.1"
    ]
  },
  "3.2.P.3.2": {
    "code": "3.2.P.3.2",
    "title": "Batch Formula",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "table",
    "guidance": "Provides the quantitative list of all components for a defined commercial (or clinical) batch size, per ICH M4Q(R1), and is the reviewer's bridge between the per-unit composition in P.1 and the process description in P.3.3. Reviewers verify that the batch formula scales correctly from the unit composition, that overages are represented consistently, and that the stated batch size matches the scale used for validation in P.3.5. Discrepancies between the batch formula and either the unit composition or the process yield trigger information requests. Acceptability requires an unambiguous, reconcilable formula for each batch size and strength claimed.",
    "authoringGuidance": "Present a batch formula table for the representative/commercial batch size listing every component, its quantity per batch, units, and reference to its quality standard, with subtotals and theoretical yield. Represent overages exactly as in P.1 and note components removed during processing (with an accounting of volatile/removed materials). If multiple batch sizes or strengths are claimed, provide a formula for each or clearly describe the scaling relationship, and confirm the batch size matches P.3.5 validation batches. Ensure component names, grades, and standards are identical to P.1 and P.4 so the three sections reconcile exactly.",
    "keyContentElements": [
      "Batch formula table per component: name, quantity per batch, units, quality standard reference",
      "Defined batch size(s) with units (e.g., number of units, total mass/volume)",
      "Representation of overages consistent with P.1",
      "Identification and accounting of components removed during processing",
      "Theoretical yield and subtotals",
      "Multiple batch sizes/strengths handled explicitly (individual formulas or scaling statement)",
      "Consistency of nomenclature, grade, and standards with P.1 and P.4"
    ],
    "generationPrompt": "Draft CTD section 3.2.P.3.2 (Batch Formula) for {{PRODUCT_NAME}} sponsored by {{SPONSOR}} at {{PHASE}}. Provide a batch formula table for the representative/commercial batch size listing each component, quantity per batch, units, and quality standard reference, with theoretical yield and subtotals. Represent overages consistently with 3.2.P.1, account for components removed during processing, and address multiple batch sizes/strengths explicitly. Confirm the batch size matches the P.3.5 validation batches. Use bracketed placeholders for quantities that are sponsor data; keep nomenclature aligned with P.1 and P.4.",
    "parentCode": "3.2.P.3",
    "expectedData": [
      "Batch formula table (component / quantity per batch / units / standard)",
      "Batch size and theoretical yield statement"
    ],
    "commonPitfalls": [
      "Batch formula that does not scale consistently from the P.1 unit composition",
      "Overages shown in the batch formula but not in P.1 (or vice versa)",
      "Batch size that does not match the process validation batches in P.3.5",
      "Failing to account for water/solvent/gas removed during processing",
      "Different component grades or standards than those declared in P.4"
    ],
    "wordCountRange": [
      200,
      700
    ],
    "dependencies": [
      "3.2.P.1",
      "3.2.P.3.3",
      "3.2.P.3.5",
      "3.2.P.4"
    ]
  },
  "3.2.P.3.3": {
    "code": "3.2.P.3.3",
    "title": "Description of Manufacturing Process and Process Controls",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Narrates the complete manufacturing process step by step with equipment, process parameters, and in-process controls, per ICH M4Q(R1) and ICH Q8(R2). This is where the reviewer confirms the process is described in enough detail to be reproducible and that the operating ranges and in-process controls match the development understanding in P.2 and the critical-step controls in P.3.4. For sterile products it must make the sterilization strategy and aseptic operations explicit, and for continuous manufacturing it must define the process from a control-strategy and traceability standpoint. Acceptability rests on a reproducible, appropriately detailed description with justified operating ranges and clearly stated in-process controls and acceptance limits.",
    "authoringGuidance": "Provide a process flow diagram and a sequential narrative covering each unit operation, the equipment type (not necessarily brand), key process parameters with target values and ranges, and the in-process controls with their acceptance criteria and test points. Identify critical steps and reprocessing/rework provisions, state hold times and storage conditions for intermediates and bulk, and define the batch and its numbering scheme. For sterile products, describe filtration, filling, lyophilization, and sterilization (terminal or aseptic) with the associated parameters and reference to P.3.5 and A.2; for solid orals, cover granulation/blending/compression/coating with the relevant parameters. Ensure operating ranges are consistent with the design space or validated ranges and that in-process controls trace back to CQAs identified in P.2.",
    "keyContentElements": [
      "Process flow diagram covering all unit operations from dispensing to packaging",
      "Step-by-step narrative with equipment type and mode of operation for each unit operation",
      "Key process parameters with target values and operating ranges",
      "In-process controls with test points, methods, and acceptance criteria",
      "Identification of critical steps (linking to P.3.4) and non-critical steps",
      "Hold times and storage conditions for intermediates and bulk drug product",
      "Reprocessing/rework provisions with justification, if any",
      "Sterilization/aseptic processing description for sterile products (filtration, filling, lyophilization cycle, terminal cycle)",
      "Batch definition, batch size, and batch numbering convention",
      "Description of any continuous manufacturing control strategy, diversion, and traceability",
      "Cross-references to P.3.4 (critical step controls) and P.3.5 (validation)"
    ],
    "generationPrompt": "Draft CTD section 3.2.P.3.3 (Description of Manufacturing Process and Process Controls) for {{PRODUCT_NAME}} for {{INDICATION}}, sponsored by {{SPONSOR}} at {{PHASE}}, per ICH M4Q and Q8(R2). Provide a process flow diagram and a sequential narrative of each unit operation with equipment type, key process parameters (target and range), and in-process controls with test points and acceptance criteria. Identify critical steps (linking to P.3.4), state intermediate/bulk hold times and storage, describe any reprocessing with justification, and for sterile products fully describe filtration, filling, lyophilization, and sterilization with reference to P.3.5 and A.2. Define the batch and numbering convention. Where parameter values are sponsor data, describe the parameter and use bracketed placeholders rather than inventing numbers, and keep ranges consistent with P.2 and P.3.5. Scale detail to {{PHASE}}.",
    "parentCode": "3.2.P.3",
    "expectedData": [
      "Process flow diagram",
      "Process parameter table (step / parameter / target / range)",
      "In-process control table (test point / attribute / method / acceptance criterion)",
      "Hold-time/storage-condition table for intermediates and bulk"
    ],
    "commonPitfalls": [
      "Description too generic to be reproducible (missing equipment mode, parameter ranges, or sequence detail)",
      "Operating ranges inconsistent with the design space or validated ranges in P.2/P.3.5",
      "In-process controls without acceptance criteria, or that do not trace to CQAs",
      "Undocumented or unjustified reprocessing/rework steps",
      "Hold times stated without supporting stability/hold-time study data",
      "For sterile products, incomplete sterilization/aseptic detail (e.g., missing filter integrity testing or lyophilization cycle parameters)"
    ],
    "wordCountRange": [
      1200,
      4500
    ],
    "dependencies": [
      "3.2.P.3.2",
      "3.2.P.3.4",
      "3.2.P.3.5",
      "3.2.P.2",
      "3.2.A.1",
      "3.2.A.2"
    ]
  },
  "3.2.P.3.4": {
    "code": "3.2.P.3.4",
    "title": "Controls of Critical Steps and Intermediates",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Documents the tests and acceptance criteria applied at the manufacturing steps identified as critical, and the specifications for isolated intermediates, per ICH M4Q(R1) and ICH Q8(R2)/Q9. Reviewers read it to confirm that the points where quality is established or could be lost are controlled with justified limits derived from development and risk assessment. The section is the operational expression of the control strategy: it should show that each critical parameter/attribute has a defined limit and a rationale. Acceptability depends on a clear link between the critical steps chosen (and their limits) and the CQA/risk analysis in P.2.",
    "authoringGuidance": "List each critical step and each isolated intermediate, and for each provide the controlled attributes/parameters, the test methods, and the acceptance criteria, with a concise justification of the limits derived from development studies and risk assessment. Distinguish critical process parameters (CPPs) from in-process controls and give the rationale for criticality designations. For intermediates that are stored, provide their specification and stability/hold-time basis, and cross-reference the validation in P.3.5 that demonstrates the controls perform as intended. Ensure the criteria here are numerically consistent with the in-process controls stated in P.3.3.",
    "keyContentElements": [
      "List of critical manufacturing steps with rationale for criticality (linked to CQAs and risk assessment in P.2)",
      "Critical process parameters (CPPs) with acceptance ranges",
      "Tests, methods, and acceptance criteria at each critical step",
      "Specifications for isolated/stored intermediates",
      "Justification of acceptance criteria from development data and risk assessment",
      "Hold-time and stability basis for stored intermediates",
      "Consistency of criteria with in-process controls in P.3.3 and validation in P.3.5"
    ],
    "generationPrompt": "Draft CTD section 3.2.P.3.4 (Controls of Critical Steps and Intermediates) for {{PRODUCT_NAME}} sponsored by {{SPONSOR}} at {{PHASE}}, per ICH Q8(R2) and Q9. For each critical manufacturing step and each isolated intermediate, provide the controlled attributes/CPPs, test methods, acceptance criteria, and a concise justification of the limits derived from development and risk assessment. Give the rationale for each criticality designation, provide intermediate specifications with hold-time/stability basis, and cross-reference validation in P.3.5. Keep acceptance criteria numerically consistent with the in-process controls in P.3.3. Use bracketed placeholders for sponsor-specific limits rather than inventing values.",
    "parentCode": "3.2.P.3",
    "expectedData": [
      "Critical step control table (step / CPP or attribute / method / acceptance criterion / justification)",
      "Intermediate specification table"
    ],
    "commonPitfalls": [
      "Designating steps critical or non-critical without a documented rationale or risk assessment link",
      "Acceptance criteria that conflict numerically with in-process controls in P.3.3",
      "Intermediate specifications lacking a stability/hold-time justification",
      "Presenting controls without justifying the limits from development data",
      "Confusing critical process parameters with routine in-process controls"
    ],
    "wordCountRange": [
      500,
      2000
    ],
    "dependencies": [
      "3.2.P.3.3",
      "3.2.P.3.5",
      "3.2.P.2",
      "3.2.P.5.1"
    ]
  },
  "3.2.P.3.5": {
    "code": "3.2.P.3.5",
    "title": "Process Validation and/or Evaluation",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Describes and, for marketing applications, demonstrates that the manufacturing process is capable of reproducibly producing product meeting its quality attributes, per ICH Q8(R2), Q10, and FDA's Process Validation: General Principles and Practices (2011) lifecycle approach. Expectations scale sharply with phase: for an IND this is typically a validation strategy/commitment, whereas for an NDA/BLA the reviewer expects executed validation data (or a robust justification and post-approval protocol for aseptic/non-standard processes). Reviewers focus on whether the validation covers the critical steps and ranges from P.3.4 and confirms the control strategy. Acceptability requires that the validation scope, acceptance criteria, and results (or the protocol and commitment) match the process as described and the batches on stability.",
    "authoringGuidance": "State the validation approach (traditional three-batch, continuous process verification, or hybrid) and provide the protocol scope: critical steps evaluated, sampling plans, acceptance criteria, and the batch sizes/sites covered. For NDA/BLA, summarize executed process performance qualification (PPQ) results against acceptance criteria, including sterilization/aseptic process validation (media fills, sterilization cycle validation) with cross-reference to A.2 where relevant. For IND phases, present the validation strategy and commitment and any process evaluation data available at scale. Address hold-time validation, mixing/homogeneity, filtration validation, and reprocessing validation as applicable, and ensure the validated ranges reconcile with P.3.3/P.3.4 and that PPQ batches align with those referenced in P.5.4 and P.8.",
    "keyContentElements": [
      "Validation approach and lifecycle stage (strategy/commitment vs. executed PPQ)",
      "Scope: critical steps, parameters, and ranges evaluated (linked to P.3.4)",
      "Sampling plans and acceptance criteria for validation",
      "Batch sizes, number of batches, and sites covered",
      "Executed PPQ results vs. acceptance criteria (for NDA/BLA)",
      "Sterilization/aseptic process validation: media fills, cycle validation, filter validation (link to A.2)",
      "Hold-time, homogeneity/uniformity, and filtration validation as applicable",
      "Reprocessing/rework validation where reprocessing is claimed",
      "Consistency of validation batches with batches in P.5.4 and P.8",
      "Post-approval validation protocol/commitment where full validation is deferred (e.g., aseptic)"
    ],
    "generationPrompt": "Draft CTD section 3.2.P.3.5 (Process Validation and/or Evaluation) for {{PRODUCT_NAME}} sponsored by {{SPONSOR}} at {{PHASE}}, per ICH Q8(R2), Q10, and FDA's 2011 Process Validation guidance. State the validation approach and scope (critical steps, sampling, acceptance criteria, batch sizes, sites) linked to P.3.4. For NDA/BLA, summarize executed PPQ results against acceptance criteria and include sterilization/aseptic validation (media fills, cycle validation, filter validation) with reference to A.2; for early IND, present the validation strategy and commitment. Address hold-time, homogeneity, and filtration validation as applicable, and confirm validation batches reconcile with P.5.4 and P.8. Where results are sponsor data, describe the study and acceptance criteria and use bracketed placeholders rather than inventing outcomes. Explicitly scale expectations to {{PHASE}}.",
    "parentCode": "3.2.P.3",
    "expectedData": [
      "PPQ acceptance-criteria vs. results summary table",
      "Validation batch list (batch number / size / site / date)",
      "Media fill / sterilization cycle validation summary (for sterile products)",
      "Blend/content uniformity and hold-time study summaries"
    ],
    "commonPitfalls": [
      "Submitting an NDA/BLA with a validation protocol only, when executed PPQ data are expected for a standard process",
      "Validation ranges narrower than, or inconsistent with, the ranges described in P.3.3/P.3.4",
      "Missing sterilization/aseptic validation elements (media fills, cycle validation, filter validation) for sterile products",
      "Validation batches that do not correspond to the batches on stability (P.8) or in batch analyses (P.5.4)",
      "Claiming reprocessing without corresponding validation",
      "Acceptance criteria in the protocol that are looser than the product specification"
    ],
    "wordCountRange": [
      600,
      3000
    ],
    "dependencies": [
      "3.2.P.3.3",
      "3.2.P.3.4",
      "3.2.P.5.4",
      "3.2.P.8",
      "3.2.A.1",
      "3.2.A.2"
    ]
  },
  "3.2.P.4": {
    "code": "3.2.P.4",
    "title": "Control of Excipients",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Establishes that every excipient is controlled to an appropriate quality standard, with additional scrutiny for novel excipients and those of human or animal origin, per ICH M4Q(R1), ICH Q6A, and (for adventitious agents) ICH Q5A(R2)/Q5D and TSE considerations. Reviewers confirm that each excipient has a specification (compendial or in-house), that the tests and limits are adequate for its function and the dosage form, and that safety concerns (elemental impurities per ICH Q3D, residual solvents per ICH Q3C, nitrosamines, TSE/BSE) are addressed. Novel excipients require full characterization and safety data equivalent to a drug substance. Acceptability requires appropriate, referenced specifications and a clear TSE/adventitious-agent and elemental-impurity position for each excipient.",
    "authoringGuidance": "For each excipient, state the applied standard (USP/NF, Ph.Eur., JP, or in-house) and provide the specification where in-house or where additional tests supplement the monograph, including functionality-related characteristics where relevant. Address the safety dimensions explicitly: compendial compliance, elemental impurities (ICH Q3D risk assessment contribution), residual solvents (ICH Q3C), and TSE/BSE certification for animal-derived excipients (cross-reference A.2). For novel excipients, provide full information analogous to a drug substance (manufacture, characterization, control, stability, and safety) in the appropriate sub-sections (P.4.1–P.4.6) and reference supporting safety data. Ensure excipient names and grades exactly match P.1 and P.3.2 and that any human/animal-origin materials are flagged with their control approach.",
    "keyContentElements": [
      "Specifications for each excipient (P.4.1) with reference to compendial monograph or in-house standard",
      "Analytical procedures for non-compendial tests (P.4.2) and their validation (P.4.3)",
      "Justification of specifications for excipients where non-compendial or functionality-related tests apply (P.4.4)",
      "Identification of excipients of human or animal origin with TSE/BSE and adventitious-agent control (P.4.5, cross-reference A.2)",
      "Information on novel excipients (P.4.6): manufacture, characterization, control, and safety data",
      "Functionality-related characteristics (e.g., particle size, viscosity grade) where they affect product performance",
      "Elemental impurity (ICH Q3D) and residual solvent (ICH Q3C) considerations attributable to excipients",
      "Consistency of excipient names/grades with P.1 and P.3.2",
      "Statement on nitrosamine risk contribution from excipients where applicable"
    ],
    "generationPrompt": "Draft CTD section 3.2.P.4 (Control of Excipients) for {{PRODUCT_NAME}} sponsored by {{SPONSOR}} at {{PHASE}}, per ICH M4Q, Q6A, Q3C, Q3D, and Q5A(R2). For each excipient, state the applied standard (USP/NF, Ph.Eur., JP, or in-house), provide specifications and functionality-related characteristics where relevant (P.4.1), analytical procedures and validation for non-compendial tests (P.4.2/P.4.3), and justification of specifications (P.4.4). Address excipients of human/animal origin with TSE/BSE and adventitious-agent controls (P.4.5, cross-reference A.2), and provide full manufacture/characterization/control/safety information for any novel excipient (P.4.6). Note elemental impurity, residual solvent, and nitrosamine contributions. Keep names/grades consistent with P.1 and P.3.2 and use bracketed placeholders for sponsor-specific limits.",
    "parentCode": "3.2.P",
    "expectedData": [
      "Excipient specification table (excipient / grade / standard / key tests / limits)",
      "TSE/BSE risk and certification summary for animal-derived excipients",
      "Novel excipient characterization and safety data summaries"
    ],
    "commonPitfalls": [
      "Citing a compendial monograph but omitting functionality-related characteristics critical to performance",
      "Failing to address TSE/BSE status or adventitious-agent risk for animal- or human-derived excipients",
      "Not accounting for excipient contribution to elemental impurities (ICH Q3D) or residual solvents",
      "Novel excipient with insufficient safety/characterization data",
      "Excipient grade/name mismatch with P.1 and P.3.2",
      "Overlooking nitrosamine or peroxide-mediated degradation risk from excipients"
    ],
    "wordCountRange": [
      600,
      2500
    ],
    "dependencies": [
      "3.2.P.1",
      "3.2.P.3.2",
      "3.2.P.2",
      "3.2.A.2",
      "3.2.P.5.5"
    ]
  },
  "3.2.P.5": {
    "code": "3.2.P.5",
    "title": "Control of Drug Product",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "The umbrella section for the drug product control strategy, gathering the specification, analytical procedures and their validation, batch analyses, impurity characterization, and specification justification into an integrated whole per ICH M4Q(R1), ICH Q6A, and ICH Q3B(R2). Reviewers read the parent to confirm that the release and shelf-life controls collectively assure identity, strength, quality, purity, and potency. It should orient the reviewer and confirm consistency across P.5.1–P.5.6 rather than duplicate their content. Acceptability depends on a coherent, internally consistent control strategy that reflects the development understanding in P.2.",
    "authoringGuidance": "Provide a brief orienting overview of the drug product control strategy and defer detail to the sub-sections, ensuring that specifications (P.5.1), methods (P.5.2), validation (P.5.3), batch data (P.5.4), impurities (P.5.5), and justification (P.5.6) are mutually consistent. Confirm that release and shelf-life specifications are distinguished where they differ and that the specification reflects the CQAs from P.2. Keep the parent concise and use it to signal any product-specific control considerations (e.g., biologic potency assay strategy, dissolution approach).",
    "keyContentElements": [
      "Overview of the drug product control strategy and its basis in CQAs (P.2)",
      "Statement of release vs. shelf-life specification approach where they differ",
      "Roadmap to sub-sections P.5.1–P.5.6 with confirmation of consistency",
      "Identification of any biologic-specific controls (potency, identity, purity) or complex-generic considerations"
    ],
    "generationPrompt": "Draft the parent CTD section 3.2.P.5 (Control of Drug Product) for {{PRODUCT_NAME}} for {{INDICATION}}, sponsored by {{SPONSOR}} at {{PHASE}}. Provide a concise overview of the drug product control strategy grounded in the CQAs from P.2, distinguish release from shelf-life controls where they differ, and defer detail to sub-sections P.5.1–P.5.6. Keep it lean and ensure consistency across sub-sections without duplicating them.",
    "parentCode": "3.2.P",
    "commonPitfalls": [
      "Duplicating sub-section content in the parent, creating divergence",
      "Failing to distinguish release from shelf-life acceptance criteria",
      "Control strategy overview that does not trace to the CQAs in P.2"
    ],
    "wordCountRange": [
      200,
      600
    ],
    "dependencies": [
      "3.2.P.5.1",
      "3.2.P.5.2",
      "3.2.P.5.3",
      "3.2.P.5.4",
      "3.2.P.5.5",
      "3.2.P.5.6",
      "3.2.P.2"
    ]
  },
  "3.2.P.5.1": {
    "code": "3.2.P.5.1",
    "title": "Specification(s)",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "table",
    "guidance": "Presents the drug product specification — the list of tests, references to analytical procedures, and acceptance criteria applied at release and shelf life — per ICH Q6A and ICH M4Q(R1). This is the reviewer's primary gauge of whether the product's identity, strength, quality, purity, and potency are adequately controlled, and it must reflect the CQAs from P.2 and the degradation profile from P.8/P.5.5. Reviewers check that all required universal and dosage-form-specific tests are present, that limits are justified (P.5.6), and that release and shelf-life criteria are correctly distinguished. Acceptability requires a complete, appropriately tabulated specification with each test tied to a method and a justified limit.",
    "authoringGuidance": "Provide the specification as a table listing each test, the analytical procedure reference (linking to P.5.2), and the acceptance criteria, with separate release and shelf-life columns where they differ. Include the universal tests (description, identification, assay, impurities) and dosage-form-specific tests per ICH Q6A: for solid orals, dissolution and uniformity of dosage units; for parenterals, sterility, endotoxins, particulate matter, pH, and container/closure integrity; for products with preservatives, antimicrobial preservative content. Include degradation products with individual and total limits consistent with ICH Q3B(R2), and for biologics include potency, identity, purity/impurities, and quantity per ICH Q6B. Ensure every test maps to a method in P.5.2 and a justification in P.5.6, and that limits are consistent with batch data (P.5.4) and stability (P.8).",
    "keyContentElements": [
      "Specification table: test, analytical procedure reference, acceptance criteria",
      "Separate release and shelf-life acceptance criteria where they differ",
      "Universal tests: description, identification, assay, degradation products/impurities",
      "Dosage-form-specific tests per ICH Q6A (dissolution, uniformity of dosage units, sterility, endotoxin, particulate matter, pH, water content, CCI)",
      "Degradation product limits (individual specified, individual unspecified, total) consistent with ICH Q3B(R2)",
      "Preservative and antioxidant content limits where applicable",
      "Microbial limits or sterility as appropriate to the dosage form",
      "For biologics: potency, identity, purity, and impurity/quantity tests per ICH Q6B",
      "Mapping of each test to its method (P.5.2) and justification (P.5.6)",
      "Consistency of limits with batch analyses (P.5.4) and stability data (P.8)"
    ],
    "generationPrompt": "Draft CTD section 3.2.P.5.1 (Specification) for {{PRODUCT_NAME}} for {{INDICATION}}, sponsored by {{SPONSOR}} at {{PHASE}}, per ICH Q6A (or Q6B for biologics) and ICH Q3B(R2). Present the specification as a table of tests, analytical procedure references (to P.5.2), and acceptance criteria, with separate release and shelf-life columns where they differ. Include universal tests and the dosage-form-specific tests appropriate to {{PRODUCT_NAME}} (e.g., dissolution and uniformity for solid orals; sterility, endotoxin, particulate matter, pH, CCI for parenterals; potency/identity/purity for biologics), plus degradation product limits aligned to ICH Q3B(R2) thresholds. Map each test to its method (P.5.2) and justification (P.5.6). Use bracketed placeholders for sponsor-specific limits and keep them consistent with P.5.4 and P.8.",
    "parentCode": "3.2.P.5",
    "expectedData": [
      "Drug product specification table (test / method reference / release limit / shelf-life limit)",
      "Degradation product limits table aligned to ICH Q3B(R2) thresholds"
    ],
    "commonPitfalls": [
      "Omitting a required dosage-form-specific test (e.g., uniformity of dosage units, CCI, particulate matter)",
      "Degradation product limits exceeding ICH Q3B(R2) qualification thresholds without qualification data",
      "Release limits tighter/looser than justified by batch data, or shelf-life limits not supported by stability",
      "Specification tests that do not map to a validated method in P.5.2",
      "Failing to distinguish release from shelf-life acceptance criteria",
      "Setting acceptance criteria not derived from CQAs or clinical/stability experience"
    ],
    "wordCountRange": [
      400,
      1500
    ],
    "dependencies": [
      "3.2.P.5.2",
      "3.2.P.5.4",
      "3.2.P.5.5",
      "3.2.P.5.6",
      "3.2.P.8",
      "3.2.P.2"
    ]
  },
  "3.2.P.5.2": {
    "code": "3.2.P.5.2",
    "title": "Analytical Procedures",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Describes each analytical procedure used to test the drug product against its specification in sufficient detail to be reproduced, per ICH M4Q(R1), ICH Q2(R2), and ICH Q6A. Reviewers use it to confirm that methods are scientifically sound, appropriately described, and capable of measuring the attributes they control, and to assess whether compendial methods are correctly applied or in-house methods are adequately detailed. Methods described here must correspond exactly to the tests in P.5.1 and be the ones validated in P.5.3. Acceptability requires complete, reproducible method descriptions with system suitability criteria for chromatographic and other instrumental methods.",
    "authoringGuidance": "For each test in the specification, provide the analytical procedure: principle, reagents/standards, equipment/column, sample and standard preparation, instrument parameters, run conditions, system suitability criteria, and calculation. For compendial methods, cite the current monograph and describe any product-specific modification (which then requires verification/validation). Include system suitability requirements (resolution, tailing, precision, S/N) for chromatographic methods and describe the reference standard used (linking to P.6). Ensure each described method maps one-to-one to a specification test in P.5.1 and to the validation in P.5.3, and describe biologic potency/bioassay procedures with their controls where applicable.",
    "keyContentElements": [
      "Method principle and category (identification, assay, impurities, dissolution, etc.) for each specification test",
      "Reagents, reference standards, and columns/equipment specified",
      "Sample and standard preparation procedures",
      "Instrument/run parameters and detection conditions",
      "System suitability criteria for chromatographic and instrumental methods",
      "Calculation formulae and reporting conventions",
      "Citation of compendial methods with description of any product-specific modifications",
      "Reference standard identification with cross-reference to P.6",
      "Description of bioassay/potency and identity methods for biologics with controls",
      "One-to-one mapping of each method to a specification test (P.5.1) and to validation (P.5.3)"
    ],
    "generationPrompt": "Draft CTD section 3.2.P.5.2 (Analytical Procedures) for {{PRODUCT_NAME}} sponsored by {{SPONSOR}} at {{PHASE}}, per ICH Q2(R2) and Q6A. For each test in the P.5.1 specification, provide the analytical procedure: principle, reagents/reference standards, column/equipment, sample and standard preparation, instrument parameters, system suitability criteria, and calculation. Cite compendial methods by current monograph and describe any product-specific modification. Identify reference standards with a cross-reference to P.6, and describe bioassay/potency methods for biologics with their controls. Ensure each method maps one-to-one to a P.5.1 test and to P.5.3 validation. Use bracketed placeholders for sponsor-specific conditions rather than inventing exact parameters.",
    "parentCode": "3.2.P.5",
    "expectedData": [
      "Per-method parameter tables (conditions, system suitability criteria)",
      "Chromatographic gradient/mobile phase tables where applicable"
    ],
    "commonPitfalls": [
      "Method descriptions too abbreviated to reproduce (missing sample prep, column, or system suitability)",
      "Product-specific modifications to compendial methods without corresponding verification/validation",
      "System suitability criteria omitted for chromatographic methods",
      "Methods described that do not match the tests listed in P.5.1",
      "Impurity method not demonstrated to resolve/detect all specified and known degradants",
      "Reference standard not identified or not linked to P.6"
    ],
    "wordCountRange": [
      600,
      3000
    ],
    "dependencies": [
      "3.2.P.5.1",
      "3.2.P.5.3",
      "3.2.P.6",
      "3.2.P.5.5"
    ]
  },
  "3.2.P.5.3": {
    "code": "3.2.P.5.3",
    "title": "Validation of Analytical Procedures",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Demonstrates that each non-compendial analytical procedure is suitable for its intended purpose, presenting validation data for the characteristics relevant to the method type, per ICH Q2(R2) and ICH M4Q(R1). Reviewers assess whether specificity, accuracy, precision, linearity, range, detection/quantitation limits, and robustness were evaluated as appropriate to the method's purpose, and whether the results meet accepted criteria. Expectations scale with phase — early IND may rely on demonstrated suitability with validation completed later, while NDA/BLA requires full validation. Acceptability requires validation appropriate to each method category with results meeting predefined acceptance criteria, plus verification of compendial methods under conditions of use.",
    "authoringGuidance": "For each in-house method, present the validation summary organized by the ICH Q2(R2) characteristics relevant to the method category (specificity, accuracy, precision including repeatability and intermediate precision, linearity and range, LOD/LOQ for impurity methods, robustness, and stability of solutions). State the acceptance criteria and the results against them, and demonstrate specificity in the presence of degradation products (forced degradation cross-referenced to P.5.5/P.8). For compendial methods, provide verification data confirming suitability under actual conditions of use, including any product matrix interference assessment. Address method transfer where testing occurs at multiple sites, and ensure the validated methods correspond exactly to those described in P.5.2 and the tests in P.5.1.",
    "keyContentElements": [
      "Validation summary per method organized by ICH Q2(R2) characteristics appropriate to method category",
      "Specificity data, including in presence of degradation products/excipients (link to forced degradation)",
      "Accuracy and precision (repeatability, intermediate precision, and reproducibility where relevant)",
      "Linearity, range, and for impurity methods LOD and LOQ",
      "Robustness evaluation and solution stability",
      "Predefined acceptance criteria and results against them",
      "Verification data for compendial methods under conditions of use",
      "Analytical method transfer/comparability data for multi-site testing",
      "Correspondence of validated methods to P.5.2 descriptions and P.5.1 tests",
      "System suitability establishment consistent with P.5.2"
    ],
    "generationPrompt": "Draft CTD section 3.2.P.5.3 (Validation of Analytical Procedures) for {{PRODUCT_NAME}} sponsored by {{SPONSOR}} at {{PHASE}}, per ICH Q2(R2). For each in-house method in P.5.2, present the validation summary by the characteristics appropriate to its category (specificity, accuracy, precision incl. intermediate precision, linearity/range, LOD/LOQ for impurity methods, robustness, solution stability), with predefined acceptance criteria and results. Demonstrate specificity against degradation products via forced degradation (cross-reference P.5.5/P.8), provide verification data for compendial methods under conditions of use, and address method transfer for multi-site testing. Ensure methods correspond to P.5.2 and tests in P.5.1. Describe study designs and where results belong, using bracketed placeholders rather than inventing validation numbers; scale completeness to {{PHASE}}.",
    "parentCode": "3.2.P.5",
    "expectedData": [
      "Validation summary tables per method (characteristic / acceptance criterion / result)",
      "Forced degradation/specificity chromatograms and peak purity data",
      "Linearity regression and precision (RSD) data tables",
      "Compendial method verification summary"
    ],
    "commonPitfalls": [
      "Validating only a subset of required characteristics for the method category (e.g., no robustness or no intermediate precision)",
      "Specificity not demonstrated against actual degradation products (weak or missing forced degradation)",
      "Compendial methods used without verification under conditions of use",
      "Validation acceptance criteria not predefined, or results not clearly meeting them",
      "No method transfer data despite testing at multiple sites",
      "LOQ for impurity methods above the reporting threshold in the specification"
    ],
    "wordCountRange": [
      600,
      3000
    ],
    "dependencies": [
      "3.2.P.5.1",
      "3.2.P.5.2",
      "3.2.P.5.5",
      "3.2.P.8"
    ]
  },
  "3.2.P.5.4": {
    "code": "3.2.P.5.4",
    "title": "Batch Analyses",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "table",
    "guidance": "Presents actual analytical results for representative batches, demonstrating conformance to the specification and providing the empirical basis for the acceptance criteria justified in P.5.6, per ICH M4Q(R1), ICH Q6A, and ICH Q3B(R2). Reviewers use it to confirm process consistency, to see the real distribution of results (especially assay and impurities) that underpins the limits, and to link the batches to their use (clinical, stability, validation, primary). It ties the manufacturing sections to the control strategy with data. Acceptability requires clearly identified batches with complete results for all specification tests and a description of each batch's provenance and use.",
    "authoringGuidance": "Provide a batch analysis table listing, for each representative batch, the batch number, size, manufacturing site and date, and the use of the batch (e.g., clinical, stability, PPQ, primary stability), with results for every test in the specification reported quantitatively (not merely \"conforms\"). Include the batches used for clinical trials, process validation (P.3.5), and stability (P.8) so the reviewer can cross-link them, and describe the analytical procedures and specification version applied. Present impurity/degradation results numerically to support the limits in P.5.1 and the discussion in P.5.6, and identify any out-of-trend or atypical results with explanation. Ensure batch identities reconcile across P.3.5, P.5.4, and P.8.",
    "keyContentElements": [
      "Batch analysis table: batch number, size, site, manufacturing date, and batch use",
      "Quantitative results for every specification test (not \"conforms\" statements)",
      "Identification of clinical, validation (P.3.5), and primary stability (P.8) batches",
      "Specification version and analytical procedures applied to each batch",
      "Numeric impurity/degradation results supporting limits in P.5.1 and P.5.6",
      "Explanation of any out-of-specification or out-of-trend results",
      "Statement of process consistency across batches and scales",
      "Cross-reconciliation of batch identities across P.3.5, P.5.4, and P.8"
    ],
    "generationPrompt": "Draft CTD section 3.2.P.5.4 (Batch Analyses) for {{PRODUCT_NAME}} sponsored by {{SPONSOR}} at {{PHASE}}, per ICH Q6A and Q3B(R2). Provide a batch analysis table listing for each representative batch the batch number, size, site, manufacturing date, and use (clinical, PPQ, primary stability), with quantitative results for every specification test — not 'conforms' statements. Include clinical, validation (P.3.5), and stability (P.8) batches and reconcile their identities across sections. State the specification version and methods applied, present numeric impurity/degradation results supporting the P.5.1 limits and P.5.6 justification, and explain any atypical results. Use bracketed placeholders for actual results rather than inventing data; describe which batches and datasets belong here.",
    "parentCode": "3.2.P.5",
    "expectedData": [
      "Batch analysis results table (batch / size / site / date / use / result per test)",
      "Impurity results by batch table"
    ],
    "commonPitfalls": [
      "Reporting \"conforms\" instead of actual numeric results, especially for assay and impurities",
      "Batch numbers that do not reconcile with validation (P.3.5) or stability (P.8) batches",
      "Too few or non-representative batches to support the proposed limits",
      "Omitting the batch use/provenance, so the reviewer cannot link clinical exposure to quality",
      "Not stating which specification version/methods were applied to older batches",
      "Unexplained atypical or out-of-trend results"
    ],
    "wordCountRange": [
      400,
      1500
    ],
    "dependencies": [
      "3.2.P.5.1",
      "3.2.P.5.6",
      "3.2.P.3.5",
      "3.2.P.8"
    ]
  },
  "3.2.P.5.5": {
    "code": "3.2.P.5.5",
    "title": "Characterisation of Impurities",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Identifies and characterizes the degradation products and other product-related impurities that can arise in the drug product, distinct from drug-substance impurities, per ICH Q3B(R2) and ICH M4Q(R1). Reviewers use it to confirm that all observed and potential degradants are identified, that their levels are controlled against ICH Q3B(R2) thresholds, and that impurities above the qualification threshold are toxicologically qualified. It draws on forced degradation and stability data and underpins the impurity limits in P.5.1 and their justification in P.5.6. Acceptability requires a complete impurity inventory with structures/origins, control approach, and qualification status for anything above threshold.",
    "authoringGuidance": "Provide an inventory of degradation products and product-related impurities with their identities/structures where known, origins (hydrolysis, oxidation, photolysis, drug substance–excipient interaction), and observed levels, distinguishing them from drug-substance impurities carried into the product. Compare each against the ICH Q3B(R2) reporting, identification, and qualification thresholds (which are dose-dependent), and describe the qualification (toxicological/clinical) basis for any impurity above the qualification threshold. Reference the forced degradation studies and stability data (P.8) that reveal the degradation pathways, and address specific safety-relevant impurities such as nitrosamines, elemental impurities (ICH Q3D), and, for biologics, product-related substances/aggregates per ICH Q6B. Ensure the impurities discussed correspond to the limits in P.5.1 and the methods' demonstrated specificity in P.5.3.",
    "keyContentElements": [
      "Inventory of degradation products and product-related impurities with structures/identities where established",
      "Origin/degradation pathway for each impurity (hydrolysis, oxidation, photolysis, interaction)",
      "Distinction between drug-product degradants and drug-substance-derived impurities",
      "Comparison of observed levels to ICH Q3B(R2) reporting/identification/qualification thresholds (dose-adjusted)",
      "Qualification (toxicological/clinical) basis for impurities above the qualification threshold",
      "Forced degradation study summary establishing degradation pathways and method specificity",
      "Assessment of nitrosamine risk and mitigation where applicable",
      "Elemental impurity assessment consistent with ICH Q3D",
      "For biologics: aggregates, fragments, charge/size variants per ICH Q6B",
      "Correspondence to impurity limits in P.5.1 and method specificity in P.5.3"
    ],
    "generationPrompt": "Draft CTD section 3.2.P.5.5 (Characterisation of Impurities) for {{PRODUCT_NAME}} for {{INDICATION}}, sponsored by {{SPONSOR}} at {{PHASE}}, per ICH Q3B(R2), Q3D, and (for biologics) Q6B. Provide an inventory of degradation products and product-related impurities with identities/structures and origins, distinguished from drug-substance impurities. Compare observed levels to dose-adjusted ICH Q3B(R2) reporting/identification/qualification thresholds and state the qualification basis for anything above the qualification threshold. Summarize forced degradation establishing pathways and mass balance, assess nitrosamine and elemental-impurity risk, and (for biologics) address aggregates and variants. Ensure consistency with the impurity limits in P.5.1 and method specificity in P.5.3. Use bracketed placeholders for observed levels rather than inventing data; describe study designs and where results belong.",
    "parentCode": "3.2.P.5",
    "expectedData": [
      "Impurity/degradant inventory table (identity / origin / observed level / threshold / qualification status)",
      "Forced degradation results table with mass balance",
      "Nitrosamine risk assessment summary where applicable"
    ],
    "commonPitfalls": [
      "Impurities present above the ICH Q3B(R2) qualification threshold without qualification data",
      "Incomplete degradation profile due to inadequate forced degradation or poor mass balance",
      "Failing to distinguish drug-product degradants from drug-substance impurities",
      "Not addressing nitrosamine risk despite susceptible structures or nitrite-containing excipients",
      "Impurity limits in P.5.1 inconsistent with the levels/thresholds discussed here",
      "Applying generic Q3B thresholds without adjusting for the maximum daily dose"
    ],
    "wordCountRange": [
      600,
      2500
    ],
    "dependencies": [
      "3.2.P.5.1",
      "3.2.P.5.3",
      "3.2.P.5.6",
      "3.2.P.8",
      "3.2.S.3.2"
    ]
  },
  "3.2.P.5.6": {
    "code": "3.2.P.5.6",
    "title": "Justification of Specification(s)",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "narrative",
    "guidance": "Provides the rationale for the choice of tests, methods, and acceptance criteria in the drug product specification, per ICH Q6A and ICH M4Q(R1). Reviewers read it to understand why each test is included (or a common test omitted), and why each limit is set where it is, drawing on development data (P.2), batch history (P.5.4), stability (P.8), impurity qualification (P.5.5), and compendial/regulatory requirements. A strong justification connects each acceptance criterion to safety, efficacy, process capability, or clinical experience rather than to convenience. Acceptability requires a test-by-test rationale that reconciles the limits with the supporting data and any relevant compendial and clinical constraints.",
    "authoringGuidance": "Justify, test by test, the inclusion of each specification parameter and the basis for each acceptance criterion, referencing the QTPP/CQAs (P.2), batch data (P.5.4), stability trends (P.8), impurity qualification (P.5.5), clinical exposure, and compendial requirements. Explain any test omissions (e.g., skip testing, parametric release, periodic verification) and justify limits that are tighter or wider than compendial defaults. Address the dissolution acceptance criterion's clinical relevance/discrimination, the basis for impurity limits relative to qualified levels, and the distinction between release and shelf-life criteria in terms of stability change. Ensure the justification is internally consistent with every referenced section so a reviewer can trace each limit to its evidence.",
    "keyContentElements": [
      "Test-by-test rationale for inclusion of each specification parameter",
      "Basis for each acceptance criterion (CQAs, batch data, stability, clinical exposure, compendial requirement)",
      "Justification of impurity/degradation limits relative to qualified levels (P.5.5) and ICH Q3B(R2)",
      "Clinical relevance/discriminating basis of the dissolution or drug-release acceptance criterion",
      "Rationale for release vs. shelf-life criteria differences based on stability change",
      "Justification for any omitted tests or alternative control strategies (skip testing, parametric release, RTRT)",
      "Justification of limits tighter or wider than compendial defaults",
      "Cross-reference consistency with P.2, P.5.4, P.5.5, and P.8"
    ],
    "generationPrompt": "Draft CTD section 3.2.P.5.6 (Justification of Specifications) for {{PRODUCT_NAME}} for {{INDICATION}}, sponsored by {{SPONSOR}} at {{PHASE}}, per ICH Q6A. Provide a test-by-test rationale for including each specification parameter and setting each acceptance criterion, referencing CQAs (P.2), batch data (P.5.4), stability (P.8), impurity qualification (P.5.5), clinical exposure, and compendial requirements. Justify impurity limits relative to qualified levels, tie the dissolution limit to a discriminating method or bioavailability data, explain release vs. shelf-life differences by stability change, and justify any omitted tests or alternative control strategies. Keep the reasoning internally consistent with all referenced sections. Reference where supporting data lives rather than inventing results.",
    "parentCode": "3.2.P.5",
    "expectedData": [
      "Justification summary table (test / basis / supporting data reference)"
    ],
    "commonPitfalls": [
      "Restating the specification without providing a rationale for each limit",
      "Acceptance criteria justified by manufacturing capability alone rather than safety/efficacy",
      "Impurity limits set above qualified levels without justification",
      "Dissolution limits not tied to a discriminating method or clinical/bioavailability data",
      "Release/shelf-life differences not explained by stability data",
      "Justification internally inconsistent with batch (P.5.4) or stability (P.8) results"
    ],
    "wordCountRange": [
      600,
      2500
    ],
    "dependencies": [
      "3.2.P.5.1",
      "3.2.P.5.4",
      "3.2.P.5.5",
      "3.2.P.8",
      "3.2.P.2"
    ]
  },
  "3.2.P.6": {
    "code": "3.2.P.6",
    "title": "Reference Standards or Materials",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Describes the reference standards and materials used in testing the drug product, including their source, characterization, and qualification, per ICH Q6A and ICH M4Q(R1). Reviewers use it to confirm that assay and impurity results are traceable to well-characterized standards, that primary and working standards are appropriately qualified and requalified, and that impurity/degradant reference materials support the impurity methods. For biologics this includes the primary and working reference standards and the traceability to a well-characterized lot. Acceptability requires documented characterization, qualification, and a maintenance/requalification approach for each standard.",
    "authoringGuidance": "Identify each reference standard and material (drug substance/API standard, impurity/degradant standards, and any performance standards), stating source, grade (compendial vs. in-house primary/working), and the characterization tests used to establish identity, purity, and assigned value/potency. Describe the qualification of primary standards and the establishment of working standards against them, plus the requalification/stability monitoring program. For impurity reference materials, describe how identity and purity were confirmed to support the impurity methods in P.5.2/P.5.3, and for biologics describe the two-tiered (primary/working) reference standard system and its traceability. Ensure the standards described correspond to those cited in P.5.2.",
    "keyContentElements": [
      "Identification of each reference standard/material (API, impurity/degradant, performance)",
      "Source and grade (compendial vs. in-house primary/working)",
      "Characterization tests establishing identity, purity, and assigned value/potency",
      "Qualification of primary standards and establishment of working standards against them",
      "Requalification and stability-monitoring program for reference standards",
      "Characterization of impurity/degradant reference materials supporting P.5.2/P.5.3",
      "For biologics: two-tiered primary/working reference standard system and traceability",
      "Correspondence of standards to those cited in the analytical procedures (P.5.2)"
    ],
    "generationPrompt": "Draft CTD section 3.2.P.6 (Reference Standards or Materials) for {{PRODUCT_NAME}} sponsored by {{SPONSOR}} at {{PHASE}}, per ICH Q6A. Identify each reference standard and material (API, impurity/degradant, performance) with source, grade (compendial vs. in-house primary/working), and the characterization tests establishing identity, purity, and assigned value/potency. Describe qualification of primary standards, establishment of working standards against them, and the requalification/stability-monitoring program. For impurity reference materials, describe how identity/purity were confirmed to support P.5.2/P.5.3, and for biologics describe the primary/working reference standard system and traceability. Ensure standards correspond to those cited in P.5.2. Use bracketed placeholders for assigned values rather than inventing them.",
    "parentCode": "3.2.P",
    "expectedData": [
      "Reference standard inventory table (standard / source / grade / assigned value / qualification status)",
      "Characterization data summaries for primary/working standards"
    ],
    "commonPitfalls": [
      "Working standards not qualified against a characterized primary standard",
      "Missing characterization data for in-house impurity/degradant reference materials",
      "No requalification or stability-monitoring program for reference standards",
      "Reference standards cited in P.5.2 not described here",
      "For biologics, no defined primary/working reference standard traceability"
    ],
    "wordCountRange": [
      300,
      1500
    ],
    "dependencies": [
      "3.2.P.5.2",
      "3.2.P.5.3",
      "3.2.S.5"
    ]
  },
  "3.2.P.7": {
    "code": "3.2.P.7",
    "title": "Container Closure System",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Describes the container closure system(s) for the marketed and any bulk/in-process product, establishing suitability for protection, compatibility, safety, and performance, per ICH M4Q(R1), ICH Q6A, and FDA's Container Closure Systems for Packaging Human Drugs and Biologics guidance (1999). Reviewers confirm that the materials of construction are identified and controlled, that the system protects the product (light, moisture, oxygen), that it is compatible with the formulation (no adverse leaching/sorption), and that extractables/leachables have been assessed appropriately for the route of administration. Functional components (droppers, delivery devices, closures) must be shown to perform. Acceptability requires component specifications plus suitability data commensurate with the dosage form and route.",
    "authoringGuidance": "Describe each primary packaging component (container, closure, and any liner, seal, or delivery component) with materials of construction, and provide specifications and drawings/descriptions. Establish suitability across the four dimensions from the FDA guidance: protection (light/moisture/oxygen barrier, cross-referenced to stability P.8), compatibility (leaching and sorption studies), safety (extractables/leachables assessment scaled to route — most rigorous for inhalation and parenteral), and performance (functional testing such as delivery dose, container closure integrity, and device function). Reference the relevant compendial standards (USP <661>/<661.1>/<661.2>, <381>, <87>/<88> biological reactivity), describe secondary packaging where it provides protection, and address CCI method and acceptance in P.5.1 where applicable. Ensure the described system matches P.1 and the stability configuration in P.8.",
    "keyContentElements": [
      "Identification of each primary packaging component and materials of construction",
      "Component specifications and drawings/descriptions",
      "Protection data: light, moisture, and oxygen barrier (cross-reference to stability P.8)",
      "Compatibility data: leaching and sorption studies with the formulation",
      "Safety data: extractables/leachables assessment scaled to route of administration",
      "Performance/functional data: delivery/dosing accuracy, CCI, device function",
      "Reference to relevant compendial standards (USP <661.1>/<661.2>, <381>, <87>/<88>, <382>)",
      "Description of secondary packaging where it contributes to protection",
      "Consistency of the described system with P.1 and the stability configuration in P.8",
      "For combination products/devices, cross-reference to device sections and human factors as applicable"
    ],
    "generationPrompt": "Draft CTD section 3.2.P.7 (Container Closure System) for {{PRODUCT_NAME}} for {{INDICATION}}, sponsored by {{SPONSOR}} at {{PHASE}}, per ICH Q6A and FDA's 1999 Container Closure Systems guidance. Identify each primary packaging component and its materials of construction, provide component specifications and descriptions, and establish suitability across protection (light/moisture/oxygen, cross-referenced to stability P.8), compatibility (leaching/sorption), safety (extractables/leachables scaled to route — most rigorous for parenteral/inhalation), and performance (CCI, delivery/dose accuracy, device function). Cite relevant USP standards (<661.1>, <661.2>, <381>, <87>, <88>), describe protective secondary packaging, and ensure the system matches P.1 and the P.8 stability configuration. Use bracketed placeholders for study results; describe study designs and where data belong rather than inventing outcomes.",
    "parentCode": "3.2.P",
    "expectedData": [
      "Container closure component specification table",
      "Extractables/leachables study summary",
      "Container closure integrity and functional/delivery test summaries",
      "Moisture/oxygen permeation data where relevant"
    ],
    "commonPitfalls": [
      "Extractables/leachables assessment absent or inadequate for a parenteral or inhalation product",
      "No demonstration of container closure integrity for sterile products",
      "Protection claims not supported by stability data in the actual market packaging",
      "Missing component specifications or materials of construction",
      "Functional/delivery performance not demonstrated for droppers, pens, or metered devices",
      "Compatibility (sorption/leaching) not studied for sensitive formulations"
    ],
    "wordCountRange": [
      500,
      2500
    ],
    "dependencies": [
      "3.2.P.1",
      "3.2.P.8",
      "3.2.P.5.1",
      "3.2.A.1"
    ]
  },
  "3.2.P.8": {
    "code": "3.2.P.8",
    "title": "Stability",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Establishes the shelf life and storage conditions of the drug product through a stability program conducted per ICH Q1A(R2) (with Q1B for photostability and Q1E for data evaluation/extrapolation), and presented per ICH M4Q(R1). Reviewers evaluate whether the study design (batches, conditions, orientations, intervals, stability-indicating methods) supports the proposed shelf life and storage statement, and whether observed trends stay within the shelf-life specification. For NDA/BLA this section drives the approved expiry and labeled storage; for IND it supports the use period for clinical supplies. Acceptability requires a compliant protocol, adequate primary-batch data at long-term and accelerated conditions, a sound extrapolation argument, and a post-approval stability commitment.",
    "authoringGuidance": "Present the stability summary and conclusion (proposed shelf life, storage statement, and any in-use/reconstitution period), then the stability protocol and the data. Describe the number and provenance of primary batches (per ICH Q1A(R2), generally three for NDA, at least two pilot-scale), the storage conditions (long-term, intermediate, accelerated appropriate to the climatic zone and product), container orientations, and test intervals, using stability-indicating methods (link to P.5.2/P.5.3). Include photostability (ICH Q1B), thermal cycling/freeze-thaw where relevant, and in-use stability for multi-dose or reconstituted products; evaluate and extrapolate data per ICH Q1E with statistical analysis where used to justify extrapolation. Provide the shelf-life specification (which may differ from release), state the post-approval stability commitment to continue long-term studies and place annual batches on stability, and ensure batches reconcile with P.5.4 and P.3.5. Address bracketing/matrixing (ICH Q1D) if used.",
    "keyContentElements": [
      "Stability conclusion: proposed shelf life, storage statement, and in-use/reconstitution period",
      "Stability protocol: batches, conditions, orientations, intervals, and tests",
      "Number and provenance of primary stability batches (scale, site, relation to clinical/validation batches)",
      "Storage conditions for the relevant climatic zone (long-term, intermediate, accelerated)",
      "Use of stability-indicating methods (cross-reference P.5.2/P.5.3)",
      "Photostability data per ICH Q1B and thermal-cycling/freeze-thaw where relevant",
      "In-use stability for multi-dose/reconstituted/diluted products",
      "Data evaluation and extrapolation per ICH Q1E, with statistical analysis where used",
      "Shelf-life specification (distinguished from release specification per P.5.1)",
      "Post-approval stability commitment and ongoing/annual-batch program",
      "Bracketing/matrixing design (ICH Q1D) if applied",
      "Reconciliation of stability batches with P.5.4 and P.3.5"
    ],
    "generationPrompt": "Draft CTD section 3.2.P.8 (Stability) for {{PRODUCT_NAME}} for {{INDICATION}}, sponsored by {{SPONSOR}} at {{PHASE}}, per ICH Q1A(R2), Q1B, Q1E (and Q1D if bracketing/matrixing). Present the stability conclusion (proposed shelf life, storage statement, in-use/reconstitution period), then the protocol (batches, conditions for the relevant climatic zone, orientations, intervals, stability-indicating tests linked to P.5.2/P.5.3) and the data. Describe the number/provenance of primary batches, include photostability and any thermal-cycling/in-use studies, evaluate and extrapolate per ICH Q1E with statistics where used, provide the shelf-life specification distinguished from release, and state the post-approval stability commitment. Reconcile stability batches with P.5.4 and P.3.5. Use bracketed placeholders for actual results; describe study designs and where data belong rather than inventing stability numbers. Scale scope to {{PHASE}}.",
    "parentCode": "3.2.P",
    "expectedData": [
      "Stability data tables by batch/condition/timepoint for each attribute",
      "Trend/regression analysis supporting shelf-life extrapolation (ICH Q1E)",
      "Photostability study results",
      "In-use/reconstitution stability data",
      "Stability protocol and post-approval commitment table"
    ],
    "commonPitfalls": [
      "Proposed shelf life over-extrapolated beyond what ICH Q1E supports from available long-term data",
      "Fewer primary batches or shorter data than ICH Q1A(R2) expects for the application type",
      "Stability methods not demonstrated to be stability-indicating (weak link to forced degradation/P.5.3)",
      "Missing photostability (ICH Q1B) or, for reconstituted/multi-dose products, missing in-use stability",
      "Stability batches not reconciling with batch analyses (P.5.4) or validation batches (P.3.5)",
      "No post-approval stability commitment, or shelf-life specification identical to release without stability justification",
      "Wrong storage conditions for the intended climatic zone, or refrigerated/frozen products lacking thermal-excursion data"
    ],
    "wordCountRange": [
      1000,
      4000
    ],
    "dependencies": [
      "3.2.P.5.1",
      "3.2.P.5.2",
      "3.2.P.5.3",
      "3.2.P.5.4",
      "3.2.P.3.5",
      "3.2.P.7",
      "3.2.P.2"
    ]
  },
  "3.2.R": {
    "code": "3.2.R",
    "title": "Regional Information",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Contains region-specific quality information required by the receiving regulatory authority that does not fit the harmonized S and P structure, per ICH M4Q(R1); for the United States (FDA) this includes items such as executed/production batch records, comparability protocols, and method validation packages as regionally requested. Reviewers use it to obtain the U.S.-specific documentation FDA expects (e.g., executed batch records for the primary/exhibit batches, the process validation scheme where required regionally). Because contents differ by region, the section must be built to the FDA's specific expectations for the submission type. Acceptability requires the correct set of U.S. regional documents, complete and consistent with the harmonized sections.",
    "authoringGuidance": "Include the U.S. regional quality items FDA expects for the submission type: representative executed batch records (and the master production/batch record) for the primary/exhibit batches, any comparability protocols proposed for post-approval changes, and regional method validation or additional information as requested. Ensure executed batch records correspond to the batches in P.5.4/P.3.5 and reflect the process in P.3.3, and that any proposed comparability protocol is scoped to specific changes with predefined acceptance criteria. State which items are provided and cross-reference the harmonized sections; for other regions, adapt the content to that authority's defined regional requirements. Keep this section aligned with the master and executed records so no discrepancy exists between the described process and the documented execution.",
    "keyContentElements": [
      "Executed batch records for primary/exhibit batches (US regional requirement)",
      "Master production and control records (batch record template)",
      "Comparability protocols for planned post-approval changes, with predefined acceptance criteria",
      "Regional method validation or additional information as requested by FDA",
      "Cross-reference of executed batch records to batches in P.5.4 and P.3.5",
      "Consistency of documented execution with the process described in P.3.3",
      "Statement of which regional items apply and identification of the target region/authority"
    ],
    "generationPrompt": "Draft CTD section 3.2.R (Regional Information) for {{PRODUCT_NAME}} sponsored by {{SPONSOR}} at {{PHASE}}, targeting FDA (US) per ICH M4Q. Include the U.S. regional quality items expected for the submission type: the master production/control record and representative executed batch records for the primary/exhibit batches, any proposed comparability protocols (scoped to specific post-approval changes with predefined acceptance criteria), and regional method validation or additional information as requested. Cross-reference executed batch records to the batches in P.5.4/P.3.5 and confirm they reflect the process in P.3.3. State which regional items apply and identify the target authority. Use bracketed placeholders for record-specific content rather than inventing batch documentation; describe what each document must contain and where it belongs.",
    "parentCode": "3.2",
    "expectedData": [
      "Executed batch record(s) for representative batches",
      "Master batch/production record",
      "Comparability protocol tables (change / tests / acceptance criteria) where proposed"
    ],
    "commonPitfalls": [
      "Executed batch records that do not match the process described in P.3.3 or the batches in P.5.4/P.3.5",
      "Omitting executed/production batch records where FDA expects them for the submission type",
      "Comparability protocols lacking predefined, specific acceptance criteria",
      "Providing generic regional content not tailored to the FDA's actual requirements",
      "Inconsistencies between the master batch record and the executed records"
    ],
    "wordCountRange": [
      300,
      2000
    ],
    "dependencies": [
      "3.2.P.3.2",
      "3.2.P.3.3",
      "3.2.P.3.5",
      "3.2.P.5.4"
    ]
  },
  "3.2.S.1": {
    "code": "3.2.S.1",
    "title": "General Information (Drug Substance)",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "narrative",
    "guidance": "Establishes the identity of the drug substance and its nomenclature, structure, and general physicochemical/biological properties.",
    "authoringGuidance": "Section 3.2.S.1 anchors the entire drug-substance dossier by unambiguously identifying the active moiety and its fundamental properties. An FDA reviewer reads it first to confirm the substance's identity, salt/hydrate form, and the properties (solubility, pKa, polymorphism, hygroscopicity, and for biologics higher-order structure and heterogeneity) that will drive formulation, control strategy, and stability. Acceptability requires internal consistency: the structure, molecular formula, and molecular weight stated here must exactly match those elucidated in 3.2.S.3.1. For biologics, describe the general nature (e.g., glycoprotein, mAb, isotype, expression system) and known post-translational modifications. This section is descriptive, not data-heavy, but errors here propagate throughout Module 3.",
    "keyContentElements": [
      "Nomenclature: INN/USAN, chemical (IUPAC/CAS) name, CAS registry number, company/laboratory code, and compendial name if applicable",
      "Structural formula, including stereochemistry, and for biologics the amino acid sequence, disulfide bonds, and glycosylation sites",
      "Molecular formula and relative molecular mass (free base/acid and the actual salt/hydrate form used)",
      "General physicochemical properties: appearance, solubility across physiological pH range, pKa, partition coefficient (log P), melting point",
      "Polymorphism, pseudopolymorphism (solvates/hydrates), and hygroscopicity statement",
      "For biologics: isoform/charge heterogeneity, higher-order structure summary, and biological activity basis",
      "Chirality/optical rotation and identification of the pharmacologically active enantiomer or isomer",
      "Statement of drug substance form (e.g., besylate salt, monohydrate) consistent with 3.2.S.3.1 and 3.2.S.4.1"
    ],
    "generationPrompt": "Draft CTD Section 3.2.S.1 (General Information) for the drug substance in {{PRODUCT_NAME}}, sponsored by {{SPONSOR}}, at development {{PHASE}} for the treatment of {{INDICATION}}. Provide nomenclature (INN/USAN, chemical/IUPAC name, CAS number, company code), structural formula with stereochemistry (or sequence and PTMs for a biologic), molecular formula and molecular mass for the actual salt/hydrate form, and a properties table (appearance, solubility vs. pH, pKa, log P, melting point, polymorphism, hygroscopicity). Keep every identity element internally consistent with 3.2.S.3.1 and 3.2.S.4.1. Do not fabricate numeric values; insert clearly marked placeholders where product-specific data belong.",
    "parentCode": "3.2.S",
    "expectedData": [
      "Table of physicochemical properties (appearance, solubility vs. pH, pKa, log P, melting point, specific rotation)",
      "Annotated structural formula with stereocenters/disulfide map or sequence diagram for biologics"
    ],
    "commonPitfalls": [
      "Molecular weight/formula inconsistent between S.1 and S.3.1 (e.g., free base vs. salt form confusion)",
      "Omitting salt, hydrate, or solvate designation so the exact substance form is ambiguous",
      "Failing to state polymorphic form or hygroscopicity when these affect manufacturability and stability",
      "For biologics, giving an incomplete or non-annotated sequence or omitting known post-translational modifications",
      "Using an outdated or non-final INN/USAN name inconsistent with other modules"
    ],
    "wordCountRange": [
      400,
      900
    ],
    "dependencies": [
      "3.2.S.3.1",
      "3.2.S.4.1"
    ]
  },
  "3.2.S.2": {
    "code": "3.2.S.2",
    "title": "Manufacture (Drug Substance) — Overview",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Umbrella section presenting the complete manufacture of the drug substance across manufacturer, process, materials, controls, validation, and development.",
    "authoringGuidance": "Section 3.2.S.2 is the container for the full manufacturing narrative and must present a coherent, end-to-end story from starting materials to purified drug substance. The FDA reviewer uses it to judge whether the process is adequately described, controlled, and (at NDA/BLA) validated, and whether the control strategy per ICH Q11 is justified by process understanding. Acceptability depends on consistency across the S.2 sub-sections: the process described in S.2.2 must reconcile with the flow diagram, the controls in S.2.4, the validation in S.2.5, and the development rationale in S.2.6. For IND submissions, phase-appropriate detail is expected—more emphasis on safety-relevant controls and less on full validation—whereas NDA/BLA requires the complete package. Cross-reference rather than duplicate detailed content held in the sub-sections.",
    "keyContentElements": [
      "Roadmap paragraph orienting the reviewer to the S.2 sub-sections and how they interconnect",
      "Identification of all manufacturing and testing sites with roles (S.2.1)",
      "High-level narrative of the manufacturing route consistent with the detailed process (S.2.2)",
      "Summary of the control strategy linking critical steps, in-process controls, and specifications",
      "Statement of manufacturing scale(s) and batch definition used across the submission",
      "For biologics, description of the expression system, cell banking strategy, and reference to viral safety (S.2.3 / A.2)",
      "Phase-appropriateness statement for IND submissions describing the current state of process development"
    ],
    "generationPrompt": "Draft the CTD Section 3.2.S.2 (Manufacture) overview for the drug substance in {{PRODUCT_NAME}} by {{SPONSOR}} at {{PHASE}} for {{INDICATION}}. Provide an orienting roadmap of the S.2 sub-sections, a high-level description of the manufacturing route and scale, the identity and role of manufacturing/testing sites, and a summary of the control strategy per ICH Q11 linking critical steps to specifications. For a biologic, summarize the expression system and cell-banking approach and cross-reference viral safety. State phase-appropriate expectations if {{PHASE}} is an IND stage. Use placeholders for site names and scales; do not invent process parameters.",
    "parentCode": "3.2.S",
    "commonPitfalls": [
      "Inconsistencies between the overview narrative and the detailed sub-sections (route, scale, controls)",
      "Treating S.2 as a duplicate of S.2.2 rather than an integrating overview",
      "Failing to reconcile batch/scale definitions used in manufacture, validation, batch analyses, and stability",
      "Omitting the ICH Q11 control-strategy linkage that ties development to routine control"
    ],
    "wordCountRange": [
      300,
      700
    ],
    "dependencies": [
      "3.2.S.2.1",
      "3.2.S.2.2",
      "3.2.S.2.3",
      "3.2.S.2.4",
      "3.2.S.2.5",
      "3.2.S.2.6"
    ]
  },
  "3.2.S.2.1": {
    "code": "3.2.S.2.1",
    "title": "Manufacturer(s)",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "table",
    "guidance": "Identifies every facility involved in manufacturing, testing, and storage of the drug substance with addresses and responsibilities.",
    "authoringGuidance": "Section 3.2.S.2.1 must name every manufacturer, contract manufacturer, and testing laboratory involved in producing and controlling the drug substance, with full legal name, physical address, and FEI/DUNS identifier where available. FDA uses this section to schedule pre-approval inspections and to verify that each named site holds the appropriate registration and CGMP status. Acceptability requires that each site's specific responsibility be stated (e.g., synthesis of regulated starting material, final purification, release testing, micro/stability testing, storage) so the reviewer can map the process steps to responsible facilities. Any site performing a GMP operation on the drug substance—including contract testing—must appear here and must match the sites cited elsewhere in the application (Form FDA 356h for NDA/BLA).",
    "keyContentElements": [
      "Full legal name and complete street address (not P.O. box) of each manufacturing site",
      "FEI number and/or DUNS number for each facility",
      "Specific responsibility/function of each site (synthesis step(s), purification, release testing, stability, storage, packaging)",
      "Contract manufacturing organizations and contract testing laboratories explicitly identified",
      "Manufacturing license/registration status statement where applicable",
      "Table mapping process stages/steps to the responsible facility",
      "Consistency statement with Form FDA 356h and other CTD modules"
    ],
    "generationPrompt": "Draft CTD Section 3.2.S.2.1 (Manufacturers) for the drug substance in {{PRODUCT_NAME}} by {{SPONSOR}} at {{PHASE}} for {{INDICATION}}. Produce a table listing each manufacturing, testing, and storage site with full legal name, complete street address, FEI/DUNS number, and specific responsibility (synthesis, purification, release testing, stability, storage). Explicitly identify any CMOs and contract testing laboratories, and add a statement of consistency with Form FDA 356h. Use bracketed placeholders for site names, addresses, and identifiers; do not fabricate FEI/DUNS numbers.",
    "parentCode": "3.2.S.2",
    "expectedData": [
      "Manufacturer table: site name | full address | FEI/DUNS | responsibility/function"
    ],
    "commonPitfalls": [
      "Omitting contract testing labs or off-site storage/warehousing facilities that perform GMP activities",
      "Providing P.O. box or headquarters addresses instead of the actual operational site address",
      "Missing or incorrect FEI/DUNS numbers that delay inspection scheduling",
      "Site list inconsistent with Form 356h or with sites referenced in S.2.2/S.4",
      "Failing to state each site's specific responsibility, leaving roles ambiguous"
    ],
    "wordCountRange": [
      150,
      400
    ],
    "dependencies": [
      "3.2.S.2.2"
    ]
  },
  "3.2.S.2.2": {
    "code": "3.2.S.2.2",
    "title": "Description of Manufacturing Process and Process Controls",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Provides the complete sequential description of the drug substance manufacturing process, including a flow diagram, batch scale, and in-process controls.",
    "authoringGuidance": "Section 3.2.S.2.2 is the technical heart of the manufacture section: it must describe the process sequentially from starting materials (small molecule) or from cell bank through harvest and purification (biologic) to the packaged drug substance, in enough detail for a reviewer to understand each transformation and its controls. Reviewers assess whether operating parameters, reagents, solvents, catalysts, and in-process controls are defined and whether ranges are consistent with the validated/characterized process. Acceptability requires a complete annotated flow diagram, a representative batch/scale statement, identification of any reprocessing/reworking, and clearly stated in-process controls (IPCs) with acceptance criteria for each critical step. For biologics per ICH Q5A–Q5E, include culture duration limits, cell age, bioreactor scale, harvest criteria, chromatography and viral clearance steps, and pooling strategy. Alternate processes or sites must be described and justified.",
    "keyContentElements": [
      "Sequential narrative of each synthetic/biological step with reagents, solvents, catalysts, and stoichiometry or ratios",
      "Annotated process flow diagram showing inputs, outputs, IPCs, and isolated intermediates",
      "Definition of the regulated starting material(s) and point of GMP entry (small molecule) or cell substrate origin (biologic)",
      "Operating parameters and target ranges (temperature, pH, time, pressure) for each step",
      "In-process controls with test, method reference, and acceptance criteria at each critical step",
      "Batch/lot definition, commercial batch size(s), and scale of the described process",
      "For biologics: cell culture/fermentation conditions, culture duration and cell-age limits, harvest criteria, purification chromatography sequence, viral inactivation/removal steps, and pooling/blending strategy",
      "Statement on reprocessing/reworking and recovery of solvents/reagents, with controls",
      "Yield ranges (theoretical and typical) per step",
      "Identification of any hold times and storage conditions for intermediates"
    ],
    "generationPrompt": "Draft CTD Section 3.2.S.2.2 (Description of Manufacturing Process and Process Controls) for the drug substance in {{PRODUCT_NAME}} by {{SPONSOR}} at {{PHASE}} for {{INDICATION}}. Provide a complete sequential process narrative from the designated starting material(s) or cell bank to packaged drug substance, an annotated flow diagram, a batch formula table, per-step operating parameter ranges, and an in-process controls table (step, test, method, acceptance criteria). For a biologic, include cell culture conditions, culture duration and cell-age limits, harvest criteria, the purification and viral clearance sequence, and pooling strategy per ICH Q5A–Q5E. State batch size and address any reprocessing. Ensure consistency with the starting-material justification in S.2.3/S.2.6 and validation scale in S.2.5. Insert placeholders for all numeric parameters; do not invent process values.",
    "parentCode": "3.2.S.2",
    "expectedData": [
      "Annotated manufacturing process flow diagram",
      "Batch formula / input materials table with quantities per batch",
      "In-process controls table: step | parameter/test | method | acceptance criteria",
      "Operating parameter ranges table per unit operation"
    ],
    "commonPitfalls": [
      "Designating a starting material too late in the synthesis, giving inadequate control over the route (frequent ICH Q11 deficiency)",
      "Flow diagram inconsistent with the narrative or missing IPCs and isolated intermediates",
      "Vague or missing operating ranges so the reviewer cannot judge process control",
      "Reprocessing/reworking performed but not described or justified",
      "For biologics, omitting culture duration/cell-age limits or an unjustified pooling strategy",
      "Batch size/scale stated here inconsistent with S.2.5 validation and S.4.4 batch analyses"
    ],
    "wordCountRange": [
      1200,
      3500
    ],
    "dependencies": [
      "3.2.S.2.3",
      "3.2.S.2.4",
      "3.2.S.2.5",
      "3.2.S.2.6"
    ]
  },
  "3.2.S.2.3": {
    "code": "3.2.S.2.3",
    "title": "Control of Materials",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Documents the quality and control of all materials used in manufacture, including starting materials, reagents, solvents, and for biologics the cell banks and raw materials of biological origin.",
    "authoringGuidance": "Section 3.2.S.2.3 must list and control every material used to make the drug substance and demonstrate that their quality is adequate for their role. Reviewers scrutinize the justification and specification of regulated starting materials (ICH Q11) for small molecules, and for biologics they focus heavily on cell bank characterization (MCB/WCB per ICH Q5A/Q5B/Q5D) and the safety of raw materials of animal/human origin (TSE/BSE and adventitious agents). Acceptability requires specifications for starting materials and critical reagents, a description and characterization of cell banking systems, generation/qualification/storage/genetic stability data for cell banks, and adventitious-agent safety documentation. The section must make clear which materials are quality-critical and how their control assures consistent drug substance quality; gaps here are a leading cause of complete-response and information-request findings.",
    "keyContentElements": [
      "List of all raw materials, reagents, solvents, and catalysts with grade/compendial status and point of use",
      "Specifications for regulated starting material(s) with tests, methods, and acceptance criteria",
      "Justification of starting material designation per ICH Q11 (fate, purge, characterization)",
      "For biologics: description of the cell substrate, host/vector construction, and MCB/WCB two-tier banking system",
      "Cell bank characterization, qualification, genetic stability, and storage per ICH Q5B/Q5D",
      "Adventitious agent safety of biologically sourced materials (TSE/BSE certification, viral safety) per ICH Q5A",
      "Control of materials of animal or human origin with source and testing documentation",
      "Certificates of analysis references and supplier qualification approach"
    ],
    "generationPrompt": "Draft CTD Section 3.2.S.2.3 (Control of Materials) for the drug substance in {{PRODUCT_NAME}} by {{SPONSOR}} at {{PHASE}} for {{INDICATION}}. Provide a materials table (grade, function, point of use, control), specifications for the regulated starting material(s), and an ICH Q11 justification of the starting-material designation addressing impurity fate and purge. For a biologic, describe the host/vector system and the MCB/WCB banking strategy, summarize cell bank characterization and genetic stability per ICH Q5B/Q5D, and document adventitious-agent and TSE/BSE safety of biologically sourced materials per ICH Q5A. Use placeholders for specifications and characterization results; do not fabricate test data.",
    "parentCode": "3.2.S.2",
    "expectedData": [
      "Materials list table: material | grade/compendial | function | point of use | control",
      "Starting material specification table: test | method | acceptance criterion",
      "Cell bank characterization summary table (identity, purity, adventitious agents, genetic stability) for biologics"
    ],
    "commonPitfalls": [
      "Inadequate justification for the starting material designation (ICH Q11), lacking impurity fate/purge discussion",
      "Missing or weak specifications for critical reagents and starting materials",
      "For biologics, incomplete cell bank characterization or absent genetic stability data",
      "Failure to document TSE/BSE and adventitious-agent safety for animal/human-derived materials",
      "Not identifying which materials are quality-critical versus non-critical",
      "Reliance on supplier CoA without defining sponsor acceptance criteria or qualification"
    ],
    "wordCountRange": [
      800,
      2500
    ],
    "dependencies": [
      "3.2.S.2.2",
      "3.2.S.2.6",
      "3.2.S.3.2"
    ]
  },
  "3.2.S.2.4": {
    "code": "3.2.S.2.4",
    "title": "Controls of Critical Steps and Intermediates",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "table",
    "guidance": "Defines the critical process steps and isolated intermediates, their tests, and acceptance criteria that ensure the process is controlled.",
    "authoringGuidance": "Section 3.2.S.2.4 identifies which process steps are critical to drug substance quality and specifies the controls—in-process tests and acceptance criteria—that keep them in control, plus specifications for isolated intermediates. Reviewers evaluate whether the designation of critical steps is justified by the process understanding presented in S.2.6 and whether the acceptance criteria are tight enough to assure quality yet supported by data. Acceptability requires a clear link between critical quality attributes/critical process parameters and the controls listed here, with each critical control traceable to development data. For biologics, this includes controls on bioburden, endotoxin, and key purification-step performance, and specifications for pooled harvest or key intermediates. This section should not merely restate S.2.2 IPCs but should distinguish and justify the critical subset.",
    "keyContentElements": [
      "List of critical process steps with the rationale for criticality (link to CQAs/CPPs)",
      "Acceptance criteria for each critical in-process control with the analytical method referenced",
      "Specifications for isolated intermediates (tests, methods, acceptance criteria)",
      "Hold times and storage conditions for intermediates, with supporting stability rationale",
      "For biologics: bioburden and endotoxin limits at critical steps, and column/step performance criteria",
      "Traceability of each critical control to process development data in S.2.6",
      "Distinction between critical and non-critical controls with justification"
    ],
    "generationPrompt": "Draft CTD Section 3.2.S.2.4 (Controls of Critical Steps and Intermediates) for the drug substance in {{PRODUCT_NAME}} by {{SPONSOR}} at {{PHASE}} for {{INDICATION}}. Provide a table of critical process steps with the rationale for criticality (linked to CQAs/CPPs), the in-process test, method reference, and acceptance criterion for each; and a table of isolated intermediate specifications with hold times and storage. For a biologic, include bioburden and endotoxin limits at critical steps. Ensure each critical control traces to development data in S.2.6. Use placeholders for acceptance criteria; do not invent limits or data.",
    "parentCode": "3.2.S.2",
    "expectedData": [
      "Critical steps and controls table: step | why critical | test | method | acceptance criterion",
      "Intermediate specification table: intermediate | test | method | acceptance criterion | hold time"
    ],
    "commonPitfalls": [
      "Designating steps as critical without linking to CQAs/CPPs or development data",
      "Acceptance criteria set without supporting batch or development data (arbitrary limits)",
      "Isolated intermediates lacking specifications or hold-time justification",
      "Duplicating all S.2.2 IPCs without distinguishing the truly critical subset",
      "For biologics, omitting bioburden/endotoxin controls at open or hold steps"
    ],
    "wordCountRange": [
      500,
      1500
    ],
    "dependencies": [
      "3.2.S.2.2",
      "3.2.S.2.6",
      "3.2.S.4.5"
    ]
  },
  "3.2.S.2.5": {
    "code": "3.2.S.2.5",
    "title": "Process Validation and/or Evaluation",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Presents the validation or evaluation of the drug substance manufacturing process, demonstrating it reproducibly yields material meeting specifications.",
    "authoringGuidance": "Section 3.2.S.2.5 demonstrates that the manufacturing process is capable of consistently producing drug substance meeting its specifications. For NDA/BLA, reviewers expect a process validation package (prospective validation of consecutive commercial-scale batches, or a lifecycle/continuous-verification approach per the FDA 2011 Process Validation guidance and ICH Q11) and, for biologics, validation of critical purification and viral-clearance steps. Acceptability requires a validation protocol summary, results demonstrating that CPPs stayed within range and CQAs met acceptance criteria across batches, and evaluation of consistency. The level of detail is phase-appropriate: for IND, an evaluation/description of process control suffices, and full validation is not required at early phases; for aseptic/sterile or biologic steps, specific validation (e.g., viral clearance studies per ICH Q5A) is expected even earlier. Distinguish validation (routine, non-dedicated equipment steps) from evaluation (specialized biologic steps studied at small scale).",
    "keyContentElements": [
      "Validation approach and protocol summary (prospective, concurrent, or lifecycle/continuous verification)",
      "Number and scale of validation batches and their acceptance criteria",
      "Results demonstrating CPPs within range and CQAs meeting specification across batches",
      "For biologics: viral clearance validation studies per ICH Q5A with log reduction factors",
      "Validation of critical purification/chromatography steps, resin/membrane reuse and lifetime",
      "Impurity clearance and consistency data across validation batches",
      "Evaluation of hold-time and in-process stability validation",
      "Statement of phase-appropriateness for IND submissions (evaluation vs. full validation)"
    ],
    "generationPrompt": "Draft CTD Section 3.2.S.2.5 (Process Validation/Evaluation) for the drug substance in {{PRODUCT_NAME}} by {{SPONSOR}} at {{PHASE}} for {{INDICATION}}. Summarize the validation approach and protocol, the number/scale of validation batches, and results showing CPPs within range and CQAs meeting specifications, per the FDA Process Validation guidance and ICH Q11. For a biologic, include viral clearance validation with log reduction factors per ICH Q5A and chromatography resin lifetime/reuse studies. State phase-appropriate expectations if {{PHASE}} is an IND stage (evaluation vs. full validation, but retain required viral clearance). Use placeholders for batch numbers and results; do not fabricate validation data.",
    "parentCode": "3.2.S.2",
    "expectedData": [
      "Process validation batch summary table: batch | scale | key CPPs | key CQA results | pass/fail",
      "Viral clearance table: step | virus | log reduction factor (biologics)",
      "Resin/membrane lifetime and reuse study summary (biologics)"
    ],
    "commonPitfalls": [
      "Submitting fewer than the expected number of validation batches without justification at NDA/BLA",
      "Validation batches not at commercial scale or not representative of the routine process",
      "For biologics, inadequate viral clearance study design (insufficient orthogonal steps or spiking controls)",
      "Missing resin/column lifetime and reuse validation for chromatography steps",
      "Claiming full validation at an early IND phase when only evaluation is required, or vice versa omitting required viral clearance",
      "Validation acceptance criteria inconsistent with the release specification in S.4.1"
    ],
    "wordCountRange": [
      800,
      2500
    ],
    "dependencies": [
      "3.2.S.2.2",
      "3.2.S.2.4",
      "3.2.S.4.1",
      "3.2.S.4.4"
    ]
  },
  "3.2.S.2.6": {
    "code": "3.2.S.2.6",
    "title": "Manufacturing Process Development",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Describes the development history of the manufacturing process, changes across development, and the process understanding supporting the control strategy.",
    "authoringGuidance": "Section 3.2.S.2.6 tells the story of how the process evolved and why the final process and its controls are appropriate, providing the ICH Q11 development rationale that underpins S.2.2 and S.2.4. Reviewers use it to assess comparability of drug substance across development (linking clinical, stability, and validation batches) and to understand the scientific basis—risk assessments, design of experiments, and criticality determinations—for the control strategy. Acceptability requires a batch-history/genealogy table, a summary of significant process and site changes with their rationale and impact assessment, comparability data bridging pre- and post-change material (critical for biologics per ICH Q5E), and the identification of CQAs and CPPs. For NDA/BLA this section justifies design space claims (if any) and the overall control strategy; for IND it documents development to date and any changes affecting the batches used in clinical/nonclinical studies.",
    "keyContentElements": [
      "Batch genealogy/history table linking batches to development phase, use (clinical, tox, stability, validation), and process version",
      "Summary of significant process changes with rationale, timing, and impact assessment",
      "Comparability assessment across process changes (physicochemical, biological, impurity) per ICH Q5E for biologics",
      "Identification and justification of critical quality attributes (CQAs) via risk assessment",
      "Identification of critical process parameters (CPPs) and their proven acceptable ranges",
      "Development studies (DoE, univariate) supporting the control strategy per ICH Q11",
      "Design space description and justification, if a design space is claimed",
      "Rationale linking development knowledge to the S.2.4 critical controls and S.4 specification"
    ],
    "generationPrompt": "Draft CTD Section 3.2.S.2.6 (Manufacturing Process Development) for the drug substance in {{PRODUCT_NAME}} by {{SPONSOR}} at {{PHASE}} for {{INDICATION}}. Provide a batch genealogy table linking batches to process version, scale, site, and use (clinical, tox, stability, validation); a summary of significant process/site changes with rationale and impact; a comparability assessment across changes (per ICH Q5E for biologics); identification of CQAs via risk assessment and CPPs with proven acceptable ranges per ICH Q11; and, if claimed, a justified design space. Link development knowledge to the S.2.4 controls and S.4 specification. Use placeholders for batch identifiers and results; do not fabricate comparability data.",
    "parentCode": "3.2.S.2",
    "expectedData": [
      "Batch genealogy table: batch | process version | scale | site | use (clinical/tox/stability/validation)",
      "Process change summary table: change | rationale | batches affected | comparability outcome",
      "CQA risk assessment summary table",
      "Comparability results table for pre/post-change material (biologics)"
    ],
    "commonPitfalls": [
      "Missing or incomplete batch genealogy so clinical/validation material cannot be linked",
      "Process changes described without impact/comparability assessment (major biologics deficiency per ICH Q5E)",
      "CQA/CPP designations asserted without documented risk assessment or supporting data",
      "Claiming a design space not adequately supported by multivariate development studies",
      "Development narrative inconsistent with the controls actually implemented in S.2.4/S.4.1",
      "Comparability limited to release testing without characterization or stability bridging"
    ],
    "wordCountRange": [
      1000,
      3000
    ],
    "dependencies": [
      "3.2.S.2.2",
      "3.2.S.2.4",
      "3.2.S.3",
      "3.2.S.4.5",
      "3.2.S.7"
    ]
  },
  "3.2.S.3": {
    "code": "3.2.S.3",
    "title": "Characterisation (Drug Substance) — Overview",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Umbrella section presenting structural elucidation and impurity characterization that establish the identity and quality profile of the drug substance.",
    "authoringGuidance": "Section 3.2.S.3 integrates the evidence that the drug substance is what the sponsor claims it is (structure) and what else is present (impurities). Reviewers read it to confirm that the elucidated structure supports the proposed identity and that the impurity profile is fully understood and controlled. Acceptability rests on the completeness of S.3.1 (orthogonal structural methods) and S.3.2 (identification, origin, and control rationale for all impurities), and on consistency with the control strategy in S.4. For biologics, characterization is far more extensive—primary/higher-order structure, post-translational modifications, biological activity, and heterogeneity per ICH Q6B—and forms the basis for comparability. This overview should orient the reviewer and cross-reference the detailed sub-sections rather than duplicating them.",
    "keyContentElements": [
      "Orientation to S.3.1 (structure) and S.3.2 (impurities) and their role in the control strategy",
      "Summary of the analytical characterization toolkit applied to the substance",
      "For biologics: overview of physicochemical, structural, and biological characterization per ICH Q6B",
      "Linkage of characterization findings to CQA identification and specification setting",
      "Cross-reference to comparability (S.2.6) and specification justification (S.4.5)"
    ],
    "generationPrompt": "Draft the CTD Section 3.2.S.3 (Characterisation) overview for the drug substance in {{PRODUCT_NAME}} by {{SPONSOR}} at {{PHASE}} for {{INDICATION}}. Orient the reviewer to structural elucidation (S.3.1) and impurities (S.3.2), summarize the characterization toolkit, and link findings to CQA identification and specification setting. For a biologic, summarize physicochemical, structural, and biological characterization per ICH Q6B and note the basis for comparability. Cross-reference S.2.6 and S.4.5. Keep it a concise integrating overview; do not duplicate sub-section detail or fabricate results.",
    "parentCode": "3.2.S",
    "commonPitfalls": [
      "Treating S.3 as a redundant restatement of the sub-sections instead of an integrating overview",
      "Failing to connect characterization findings to the control strategy and specification",
      "For biologics, under-scoping characterization relative to ICH Q6B expectations",
      "Inconsistency between the structure/impurity summary and S.1/S.4 content"
    ],
    "wordCountRange": [
      250,
      600
    ],
    "dependencies": [
      "3.2.S.3.1",
      "3.2.S.3.2"
    ]
  },
  "3.2.S.3.1": {
    "code": "3.2.S.3.1",
    "title": "Elucidation of Structure and Other Characteristics",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Provides the evidence, from orthogonal analytical techniques, confirming the structure of the drug substance and its physicochemical/biological characteristics.",
    "authoringGuidance": "Section 3.2.S.3.1 must present definitive, orthogonal evidence that establishes the covalent structure, stereochemistry, and solid-state/physical characteristics of the drug substance. Reviewers verify that the assigned structure is supported by mutually corroborating spectroscopic and analytical data (e.g., IR, UV, NMR, MS, elemental analysis, X-ray for small molecules; peptide mapping, MS, sequencing, disulfide mapping, glycan analysis, and higher-order structure methods for biologics). Acceptability requires that all structural features stated in S.1—molecular formula, stereocenters, salt form, polymorph—be experimentally supported here, and that physicochemical properties relevant to performance (polymorphism, particle size, solubility) be characterized. For biologics, primary structure, post-translational modifications, higher-order structure, and biological activity must be demonstrated per ICH Q6B. Structural conclusions must be internally consistent with the impurity and control sections.",
    "keyContentElements": [
      "Structural elucidation by orthogonal techniques (IR, UV, 1D/2D NMR, MS, elemental analysis) for small molecules",
      "Confirmation of stereochemistry/absolute configuration (X-ray, chiroptical methods)",
      "Solid-state characterization: polymorphic form, crystallinity (XRPD, DSC, TGA), and where relevant particle size/morphology",
      "For biologics: amino acid sequence confirmation, peptide mapping, intact/subunit mass, disulfide and free-thiol mapping",
      "Post-translational modification characterization (glycosylation, deamidation, oxidation, C-/N-terminal variants)",
      "Higher-order structure assessment (CD, DSC, FTIR, HDX-MS, NMR fingerprint) for biologics",
      "Biological activity/potency characterization and its relationship to structure",
      "Assignment tables correlating spectral data to structural features",
      "Consistency statement with the structure/formula/MW declared in S.1"
    ],
    "generationPrompt": "Draft CTD Section 3.2.S.3.1 (Elucidation of Structure and Other Characteristics) for the drug substance in {{PRODUCT_NAME}} by {{SPONSOR}} at {{PHASE}} for {{INDICATION}}. Present orthogonal structural evidence (IR, UV, 1D/2D NMR, MS, elemental analysis, X-ray/chiroptical for stereochemistry) with spectral assignment tables, plus solid-state characterization (XRPD, DSC, TGA, polymorph, particle size). For a biologic, confirm primary sequence, peptide mapping with coverage, intact/subunit mass, disulfide mapping, PTMs (glycosylation, deamidation, oxidation, terminal variants), higher-order structure, and biological activity per ICH Q6B. Ensure consistency with the structure/formula/MW in S.1. Use placeholders for spectral values and results; do not fabricate data.",
    "parentCode": "3.2.S.3",
    "expectedData": [
      "Spectral assignment tables (NMR/MS/IR) mapping signals to structural features",
      "XRPD/DSC/TGA data summary and polymorph designation",
      "Peptide map and mass table with sequence coverage (biologics)",
      "Glycan profile and PTM summary table (biologics)"
    ],
    "commonPitfalls": [
      "Incomplete orthogonal evidence—relying on a single technique to assign structure",
      "Stereochemistry/absolute configuration not experimentally confirmed",
      "Polymorphic form not characterized despite relevance to solubility/stability",
      "For biologics, low sequence coverage in peptide mapping or unassigned mass discrepancies",
      "Under-characterized PTMs or higher-order structure inconsistent with ICH Q6B",
      "Structural data inconsistent with the molecular formula/MW stated in S.1"
    ],
    "wordCountRange": [
      1000,
      3500
    ],
    "dependencies": [
      "3.2.S.1",
      "3.2.S.3.2",
      "3.2.S.4.5"
    ]
  },
  "3.2.S.3.2": {
    "code": "3.2.S.3.2",
    "title": "Impurities",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Identifies, characterizes, and justifies the control of all impurities in the drug substance, including organic, inorganic, residual solvents, and process-related impurities.",
    "authoringGuidance": "Section 3.2.S.3.2 must present a complete accounting of actual and potential impurities—process-related, degradation-related, residual solvents, elemental impurities, and for genotoxic concerns mutagenic impurities—together with their origin, structure where known, and the rationale for their control. Reviewers assess conformity with ICH Q3A (impurities in new drug substances), Q3C (residual solvents), Q3D (elemental impurities), and M7 (mutagenic impurities), verifying that observed levels are at or below qualification thresholds or are qualified by safety data. Acceptability requires an impurity fate-and-purge discussion linked to the synthetic route (S.2.2/S.2.3), identification of impurities above the identification threshold, and justification for proposed specification limits. For biologics per ICH Q6B, process-related impurities (host cell protein, DNA, leachables from resins) and product-related substances/impurities (aggregates, fragments, charge variants) must be characterized and controlled. Qualification of impurities not covered by thresholds must be explicitly addressed.",
    "keyContentElements": [
      "Comprehensive list of actual and potential impurities with origin (starting material, reagent, intermediate, degradant)",
      "Impurity structures and identification for those above the ICH Q3A identification threshold",
      "Residual solvent evaluation and limits per ICH Q3C (Class 1/2/3)",
      "Elemental impurity risk assessment and control per ICH Q3D",
      "Mutagenic/genotoxic impurity assessment per ICH M7 (including nitrosamines) with control approach",
      "Fate-and-purge rationale linking impurities to the route and process controls",
      "Qualification of impurities against ICH Q3A thresholds or by toxicology data",
      "For biologics: process-related impurities (HCP, residual DNA, protein A/resin leachables) and product-related impurities (aggregates, fragments, charge/size variants) per ICH Q6B",
      "Comparison of observed impurity levels across batches to proposed specification limits"
    ],
    "generationPrompt": "Draft CTD Section 3.2.S.3.2 (Impurities) for the drug substance in {{PRODUCT_NAME}} by {{SPONSOR}} at {{PHASE}} for {{INDICATION}}. Provide a comprehensive impurity table (structure/ID, origin, method, observed range, proposed limit, qualification basis) covering organic process/degradation impurities per ICH Q3A, residual solvents per ICH Q3C, elemental impurities per an ICH Q3D risk assessment, and mutagenic impurities and nitrosamines per ICH M7. Include a fate-and-purge rationale linked to the route. For a biologic, add process-related impurities (HCP, residual DNA, resin/protein A leachables) and product-related impurities (aggregates, fragments, charge/size variants) per ICH Q6B. Justify each proposed limit against thresholds or safety data. Use placeholders for levels and limits; do not fabricate impurity data.",
    "parentCode": "3.2.S.3",
    "expectedData": [
      "Impurity summary table: impurity | structure/ID | origin | analytical method | observed range | proposed limit | qualification basis",
      "Residual solvents table with ICH Q3C class and limit",
      "Elemental impurity risk assessment table per ICH Q3D",
      "Mutagenic impurity/nitrosamine assessment table per ICH M7",
      "Process- and product-related impurity table (biologics): HCP, DNA, aggregates, variants"
    ],
    "commonPitfalls": [
      "Impurities present above identification/qualification thresholds not identified or qualified per ICH Q3A",
      "Missing or inadequate mutagenic impurity and nitrosamine risk assessment per ICH M7",
      "Elemental impurity control based on outdated heavy-metals test rather than ICH Q3D risk assessment",
      "No fate-and-purge rationale linking impurities to the synthetic route",
      "For biologics, HCP or residual DNA methods not suitably sensitive or not process-specific",
      "Proposed limits set without batch data support or degradation/stress study justification"
    ],
    "wordCountRange": [
      1200,
      3500
    ],
    "dependencies": [
      "3.2.S.2.2",
      "3.2.S.2.3",
      "3.2.S.3.1",
      "3.2.S.4.1",
      "3.2.S.4.5",
      "3.2.S.7"
    ]
  },
  "3.2.S.4": {
    "code": "3.2.S.4",
    "title": "Control of Drug Substance — Overview",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Umbrella section presenting the specification, analytical procedures, method validation, batch analyses, and specification justification for the drug substance.",
    "authoringGuidance": "Section 3.2.S.4 assembles the complete control package for the drug substance and must present a coherent control strategy in which the specification (S.4.1), the methods (S.4.2), their validation (S.4.3), the supporting batch data (S.4.4), and the justification (S.4.5) all reconcile. Reviewers read it to judge whether routine release and stability testing will reliably ensure the quality, safety, and efficacy of every batch. Acceptability depends on internal consistency—every specification test must have a described, validated method and batch data demonstrating capability—and on conformity with ICH Q6A (small molecules) or Q6B (biologics). This overview orients the reviewer and should cross-reference, not duplicate, the sub-sections.",
    "keyContentElements": [
      "Orientation to the S.4 sub-sections and how the control strategy fits together",
      "Statement of the overall approach to drug substance control per ICH Q6A/Q6B",
      "Confirmation that every specification parameter has a corresponding method, validation, and batch data",
      "Cross-reference to development and impurity qualification (S.2.6, S.3.2) supporting the specification",
      "Statement of phase-appropriateness of the control strategy for IND submissions"
    ],
    "generationPrompt": "Draft the CTD Section 3.2.S.4 (Control of Drug Substance) overview for the drug substance in {{PRODUCT_NAME}} by {{SPONSOR}} at {{PHASE}} for {{INDICATION}}. Orient the reviewer to the specification (S.4.1), analytical procedures (S.4.2), validation (S.4.3), batch analyses (S.4.4), and justification (S.4.5), and describe the overall control strategy per ICH Q6A/Q6B. Confirm that every specification parameter maps to a method, its validation, and batch data. State phase-appropriate expectations if {{PHASE}} is an IND stage. Keep it a concise integrating overview; do not fabricate specification values.",
    "parentCode": "3.2.S",
    "commonPitfalls": [
      "Presenting sub-sections that do not reconcile (a spec test with no method, or a method with no validation)",
      "Overview inconsistent with the actual specification in S.4.1",
      "Failing to state the ICH Q6A/Q6B basis for the control approach",
      "Not addressing phase-appropriateness for early IND control strategies"
    ],
    "wordCountRange": [
      250,
      600
    ],
    "dependencies": [
      "3.2.S.4.1",
      "3.2.S.4.2",
      "3.2.S.4.3",
      "3.2.S.4.4",
      "3.2.S.4.5"
    ]
  },
  "3.2.S.4.1": {
    "code": "3.2.S.4.1",
    "title": "Specification",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "table",
    "guidance": "Presents the drug substance specification: the list of tests, references to analytical procedures, and acceptance criteria applied at release and (where applicable) shelf life.",
    "authoringGuidance": "Section 3.2.S.4.1 is the formal specification—the tests, methods, and acceptance criteria that define what a compliant batch of drug substance must meet. Reviewers verify that the specification is complete per ICH Q6A (universal tests: description, identification, assay, impurities; plus specific tests such as physicochemical properties, particle size, polymorphic form, water content, residual solvents, microbial limits) or ICH Q6B for biologics (identity, purity/impurities, potency, quantity, plus product-specific attributes), and that acceptance criteria are appropriately justified in S.4.5. Acceptability requires that each specified test link to a numbered analytical procedure in S.4.2 and that the criteria be consistent with batch data (S.4.4), stability (S.7), and impurity qualification (S.3.2). The specification must be presented in a clear tabular format and dated/version-controlled.",
    "keyContentElements": [
      "Tabular specification: test | analytical procedure reference | acceptance criterion",
      "Universal tests per ICH Q6A: description, identification (two orthogonal for small molecules), assay, impurities",
      "Specific tests as applicable: polymorphic form, particle size, water/loss on drying, residual solvents, inorganic impurities, microbial limits/endotoxin",
      "For biologics per ICH Q6B: identity, potency/biological activity, purity and impurities (aggregates, variants, HCP, DNA), quantity/content, and appearance",
      "Distinction between release and shelf-life acceptance criteria where they differ",
      "Specification version number and effective date",
      "Reference to the compendial standard (USP/Ph.Eur.) where a monograph is applied",
      "Linkage of each parameter to its analytical procedure (S.4.2) and justification (S.4.5)"
    ],
    "generationPrompt": "Draft CTD Section 3.2.S.4.1 (Specification) for the drug substance in {{PRODUCT_NAME}} by {{SPONSOR}} at {{PHASE}} for {{INDICATION}}. Present a version-controlled specification table (test, analytical procedure reference, acceptance criterion, distinguishing release vs. shelf-life) covering ICH Q6A universal tests (description, two orthogonal identifications, assay, impurities) plus applicable specific tests (polymorph, particle size, water, residual solvents, inorganic impurities, microbial/endotoxin). For a biologic, cover ICH Q6B attributes including identity, potency, purity/impurities (aggregates, variants, HCP, residual DNA), and quantity. Link each test to S.4.2 and justify in S.4.5. Use placeholders for acceptance criteria; do not fabricate limits.",
    "parentCode": "3.2.S.4",
    "expectedData": [
      "Drug substance specification table: test | method reference | acceptance criterion (release and shelf-life)"
    ],
    "commonPitfalls": [
      "Only a single identification test where ICH Q6A expects orthogonal identity confirmation",
      "Acceptance criteria not justified by batch data or set wider than data support",
      "Missing specific tests (e.g., polymorph, particle size, residual solvents) relevant to the substance",
      "For biologics, omitting a potency/biological activity test or process-impurity limits (HCP, DNA)",
      "Specification tests not linked to numbered methods in S.4.2",
      "Failure to distinguish release from shelf-life criteria when stability data warrant it"
    ],
    "wordCountRange": [
      400,
      1200
    ],
    "dependencies": [
      "3.2.S.4.2",
      "3.2.S.4.4",
      "3.2.S.4.5",
      "3.2.S.3.2",
      "3.2.S.7"
    ]
  },
  "3.2.S.4.2": {
    "code": "3.2.S.4.2",
    "title": "Analytical Procedures",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Describes, in sufficient detail to reproduce, each analytical procedure used to test the drug substance against its specification.",
    "authoringGuidance": "Section 3.2.S.4.2 provides the full description of every analytical procedure referenced in the specification, in enough detail that a qualified analyst could reproduce the method. Reviewers check that each method is described completely—reagents, system suitability, sample/standard preparation, chromatographic or spectroscopic conditions, calculations—and that methods are suitable for their intended purpose per ICH Q2(R2). Acceptability requires that every specification test in S.4.1 have a corresponding method here, that compendial methods be cited with any product-specific modifications stated, and that for biologics the bioassay/potency and impurity methods be described with appropriate system-suitability and reference-standard use. Incomplete method descriptions—especially missing system suitability or ambiguous integration/calculation—are a common source of information requests.",
    "keyContentElements": [
      "Complete description of each non-compendial method: principle, equipment, reagents, standard/sample preparation, conditions, and calculation",
      "System suitability criteria for chromatographic and bioassay methods",
      "Reference to compendial (USP/Ph.Eur.) methods with any product-specific modifications explicitly stated",
      "Chromatographic conditions (column, mobile phase, gradient, detection, run time) for HPLC/UPLC/GC methods",
      "For biologics: potency/bioassay procedure, peptide map, size- and charge-variant methods, HCP/DNA assays with controls",
      "Identification method(s) description consistent with the two-orthogonal-ID requirement",
      "Residual solvent (GC) and elemental impurity (ICP-MS/OES) procedures where applicable",
      "Reference standard usage and placement within each quantitative method"
    ],
    "generationPrompt": "Draft CTD Section 3.2.S.4.2 (Analytical Procedures) for the drug substance in {{PRODUCT_NAME}} by {{SPONSOR}} at {{PHASE}} for {{INDICATION}}. Describe each specification method in reproducible detail—principle, equipment, reagents, standard/sample preparation, conditions (e.g., HPLC column/mobile phase/gradient/detection), system suitability, and calculation—consistent with ICH Q2(R2). Cite compendial methods with product-specific modifications. For a biologic, describe the potency/bioassay, peptide map, size/charge-variant, and HCP/residual DNA methods with controls and reference-standard use. Ensure every S.4.1 test has a corresponding method here. Use placeholders for method parameters; do not fabricate conditions or results.",
    "parentCode": "3.2.S.4",
    "expectedData": [
      "Method parameter tables (e.g., HPLC gradient table, GC conditions, system suitability table)"
    ],
    "commonPitfalls": [
      "Method descriptions too brief to reproduce (missing sample prep, integration, or calculation detail)",
      "Absent or incomplete system-suitability criteria for chromatographic/bioassay methods",
      "Compendial method cited without stating product-specific modifications or verification",
      "For biologics, potency assay described without controls, standards, or acceptance format",
      "A specification test in S.4.1 with no corresponding method described here",
      "Inconsistent method version/numbering between S.4.1, S.4.2, and S.4.3"
    ],
    "wordCountRange": [
      800,
      2500
    ],
    "dependencies": [
      "3.2.S.4.1",
      "3.2.S.4.3",
      "3.2.S.5"
    ]
  },
  "3.2.S.4.3": {
    "code": "3.2.S.4.3",
    "title": "Validation of Analytical Procedures",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Presents the validation data demonstrating that each analytical procedure is suitable for its intended purpose per ICH Q2(R2).",
    "authoringGuidance": "Section 3.2.S.4.3 demonstrates that the analytical procedures in S.4.2 are fit for purpose by presenting validation data appropriate to each method type per ICH Q2(R2). Reviewers verify that the validation characteristics match the method's purpose—specificity for identity; specificity, accuracy, precision, linearity, range, and quantitation/detection limits for assay and impurity methods; and appropriate parameters for bioassays. Acceptability requires a validation summary for each method with results against pre-defined acceptance criteria, plus, for compendial methods, verification of suitability under actual conditions of use. The level of validation is phase-appropriate for IND (qualified/suitably validated methods) but must be complete for NDA/BLA. For biologics, potency and impurity methods require particular attention to accuracy, precision, and specificity given assay variability, and stability-indicating capability must be demonstrated.",
    "keyContentElements": [
      "Validation summary per method with characteristics matched to purpose per ICH Q2(R2)",
      "Specificity/selectivity data, including stability-indicating capability for assay/impurity methods",
      "Accuracy (recovery), precision (repeatability, intermediate precision), and where relevant reproducibility",
      "Linearity, range, and limits of detection/quantitation for quantitative and impurity methods",
      "Robustness evaluation and system-suitability derivation",
      "Verification of compendial methods under actual conditions of use",
      "For biologics: bioassay validation (relative potency, accuracy, precision, linearity) and specificity of HCP/DNA/variant methods",
      "Pre-defined acceptance criteria and pass/fail conclusion for each validated parameter"
    ],
    "generationPrompt": "Draft CTD Section 3.2.S.4.3 (Validation of Analytical Procedures) for the drug substance in {{PRODUCT_NAME}} by {{SPONSOR}} at {{PHASE}} for {{INDICATION}}. For each specification method, present a validation summary per ICH Q2(R2) with characteristics matched to purpose: specificity (including forced-degradation/stability-indicating data), accuracy, repeatability and intermediate precision, linearity, range, LOD/LOQ, and robustness, each against pre-defined acceptance criteria with a pass/fail conclusion. Verify compendial methods under actual conditions of use. For a biologic, include bioassay/potency validation and specificity of HCP/DNA/variant assays. State phase-appropriate expectations for IND. Use placeholders for validation results; do not fabricate data.",
    "parentCode": "3.2.S.4",
    "expectedData": [
      "Validation summary table per method: parameter | acceptance criterion | result",
      "Linearity/accuracy/precision data tables",
      "Forced degradation/stability-indicating specificity summary"
    ],
    "commonPitfalls": [
      "Validating parameters not relevant to the method type or omitting required ones (e.g., no LOQ for an impurity method)",
      "No stability-indicating/forced-degradation data to establish specificity of the assay",
      "Intermediate precision omitted (only repeatability shown)",
      "Compendial methods used without verification under actual conditions of use",
      "For biologics, bioassay validation lacking adequate accuracy/precision across the range",
      "Validation acceptance criteria not pre-defined or results not clearly concluded pass/fail"
    ],
    "wordCountRange": [
      800,
      2500
    ],
    "dependencies": [
      "3.2.S.4.2",
      "3.2.S.4.4",
      "3.2.S.7"
    ]
  },
  "3.2.S.4.4": {
    "code": "3.2.S.4.4",
    "title": "Batch Analyses",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "table",
    "guidance": "Presents analytical results for representative drug substance batches, demonstrating conformance to specification and process consistency.",
    "authoringGuidance": "Section 3.2.S.4.4 provides the empirical evidence—actual test results for relevant batches—that the process consistently produces drug substance meeting the specification. Reviewers use it to confirm that acceptance criteria are realistic and met, to assess batch-to-batch consistency, and to link the batches used in nonclinical, clinical, stability, and validation studies to the control strategy. Acceptability requires a description of each batch (number, date, site, scale, manufacturing process version, use/disposition) and a results table reporting each specification parameter for each batch, with methods identified. The batches presented must include those pivotal to the application (clinical, primary stability, process validation) and must be consistent with S.2.6 genealogy, S.4.1 limits, and S.7 stability. Numeric results—not merely 'complies'—are expected for quantitative attributes.",
    "keyContentElements": [
      "Batch description table: batch number | manufacturing date | site | scale | process version | use/disposition",
      "Results table reporting each specification parameter for each batch with actual numeric values",
      "Identification of the analytical method/version used for each result",
      "Inclusion of clinical, primary stability, and process-validation batches",
      "Statement of the reporting convention (e.g., individual impurities and totals) and any out-of-trend results",
      "Consistency mapping to batch genealogy in S.2.6",
      "For biologics, potency and key variant/impurity results across batches demonstrating consistency"
    ],
    "generationPrompt": "Draft CTD Section 3.2.S.4.4 (Batch Analyses) for the drug substance in {{PRODUCT_NAME}} by {{SPONSOR}} at {{PHASE}} for {{INDICATION}}. Provide a batch description table (number, date, site, scale, process version, use/disposition) and an analytical results table reporting actual numeric values for each specification parameter across representative batches, with the method identified and the acceptance criterion shown. Include clinical, primary stability, and process-validation batches, consistent with the S.2.6 genealogy and S.4.1 specification. For a biologic, include potency and key variant/impurity results. Report numeric values rather than 'complies'. Use placeholders for batch identifiers and results; do not fabricate data.",
    "parentCode": "3.2.S.4",
    "expectedData": [
      "Batch description table (number, date, site, scale, process version, use)",
      "Batch analytical results table: parameter | method | batch 1 | batch 2 | ... | acceptance criterion"
    ],
    "commonPitfalls": [
      "Reporting 'complies' or 'conforms' instead of actual numeric results for quantitative attributes",
      "Too few batches or omission of pivotal clinical/stability/validation batches",
      "Batch information inconsistent with the genealogy in S.2.6 or scale in S.2.5",
      "Results shown against methods not described/validated in S.4.2/S.4.3",
      "No discussion of out-of-trend or atypical results when present",
      "Acceptance criteria in the table inconsistent with the specification in S.4.1"
    ],
    "wordCountRange": [
      400,
      1200
    ],
    "dependencies": [
      "3.2.S.2.5",
      "3.2.S.2.6",
      "3.2.S.4.1",
      "3.2.S.4.2",
      "3.2.S.7"
    ]
  },
  "3.2.S.4.5": {
    "code": "3.2.S.4.5",
    "title": "Justification of Specification",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "narrative",
    "guidance": "Provides the scientific and regulatory rationale for the selection of specification tests and the setting of acceptance criteria.",
    "authoringGuidance": "Section 3.2.S.4.5 justifies why each test is included (or excluded) and why each acceptance criterion is set where it is, tying the specification back to development knowledge, batch data, stability, impurity qualification, and safety. Reviewers use it to judge whether the specification adequately controls quality without being either too loose (permitting substandard material) or arbitrarily tight. Acceptability requires that acceptance criteria be justified by manufacturing capability (batch data in S.4.4), stability behavior (S.7), toxicological qualification of impurities (S.3.2, ICH Q3A), clinical experience, and relevant compendial/ICH standards (Q6A/Q6B). The narrative should explain omission of routine tests (e.g., not testing for a Class 1 solvent never used), the basis for identity strategy, and for biologics the relationship of potency and impurity limits to lots used in clinical studies. This is often where reviewers challenge over-wide limits, so data-anchored reasoning is essential.",
    "keyContentElements": [
      "Rationale for inclusion of each specification test per ICH Q6A/Q6B (universal and specific tests)",
      "Justification of each acceptance criterion by batch data, stability, and clinical/qualified exposure",
      "Justification for omission of tests not included (e.g., solvents/elements not used, per Q3C/Q3D risk assessment)",
      "Linkage of impurity limits to toxicological qualification per ICH Q3A/M7",
      "Basis for the identity strategy and any orthogonal-method choices",
      "For biologics, justification of potency range and product-/process-related impurity limits relative to clinical lots",
      "Discussion of release vs. shelf-life criteria differences and their statistical/stability basis",
      "Reference to compendial requirements and how the specification meets or exceeds them"
    ],
    "generationPrompt": "Draft CTD Section 3.2.S.4.5 (Justification of Specification) for the drug substance in {{PRODUCT_NAME}} by {{SPONSOR}} at {{PHASE}} for {{INDICATION}}. Justify inclusion of each specification test per ICH Q6A/Q6B and the basis for each acceptance criterion using batch data (S.4.4), stability (S.7), impurity qualification (ICH Q3A/M7), and clinical experience. Justify any omitted tests via ICH Q3C/Q3D risk assessments and explain the identity strategy. For a biologic, anchor potency and impurity limits to pivotal clinical lots. Discuss release vs. shelf-life criteria differences. Provide a justification summary table (parameter, limit, basis). Use placeholders for data ranges; do not fabricate results.",
    "parentCode": "3.2.S.4",
    "expectedData": [
      "Justification summary table: parameter | proposed limit | basis (batch data range, stability, qualification, compendial)"
    ],
    "commonPitfalls": [
      "Acceptance criteria justified by assay capability alone without safety/clinical qualification",
      "Limits set wider than batch data and stability support without rationale",
      "Omitted tests not justified by a documented risk assessment (Q3C/Q3D)",
      "Impurity limits above qualification thresholds without toxicological justification (Q3A/M7)",
      "For biologics, potency limits not anchored to lots used in pivotal clinical studies",
      "Generic justification language not tied to the actual product data"
    ],
    "wordCountRange": [
      600,
      1800
    ],
    "dependencies": [
      "3.2.S.3.2",
      "3.2.S.4.1",
      "3.2.S.4.4",
      "3.2.S.7",
      "3.2.S.2.6"
    ]
  },
  "3.2.S.5": {
    "code": "3.2.S.5",
    "title": "Reference Standards or Materials",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Describes the reference standards and materials used in testing the drug substance, including their source, characterization, qualification, and lifecycle management.",
    "authoringGuidance": "Section 3.2.S.5 documents the reference standards and materials that anchor quantitative and qualitative testing of the drug substance. Reviewers assess whether primary and working standards are adequately characterized and qualified, and, for biologics, whether a two-tiered reference standard system (primary/reference against which working standards are calibrated) is established and maintained per ICH Q6B. Acceptability requires the source, preparation, characterization, qualification protocol, storage, and, where relevant, assigned potency/purity values and expiry/re-qualification approach for each standard. Compendial reference standards (USP/Ph.Eur.) may be cited with traceability, while in-house standards require full characterization consistent with S.3.1. For impurity and system-suitability standards, identity and purity must be established. A weak or uncharacterized reference standard undermines every quantitative result in the dossier.",
    "keyContentElements": [
      "Identification of each reference standard/material and its role (assay, impurity, potency, system suitability)",
      "Source: compendial (USP/Ph.Eur.) with traceability, or in-house with lot number",
      "Characterization of in-house primary standard consistent with S.3.1 methods",
      "Qualification protocol and assigned values (purity, potency, content, water)",
      "For biologics: two-tier primary/working reference standard system and calibration hierarchy per ICH Q6B",
      "Storage conditions, container, and stability/re-qualification (expiry) program for standards",
      "Impurity and degradation reference standards with identity and purity established",
      "Bridging/qualification of successive reference standard lots against the prior standard"
    ],
    "generationPrompt": "Draft CTD Section 3.2.S.5 (Reference Standards or Materials) for the drug substance in {{PRODUCT_NAME}} by {{SPONSOR}} at {{PHASE}} for {{INDICATION}}. Describe each reference standard/material with its role, source (compendial with traceability or in-house lot), characterization (consistent with S.3.1), qualification protocol and assigned values, storage, and re-qualification/expiry program. For a biologic, establish a two-tier primary/working reference standard system and calibration hierarchy per ICH Q6B, and describe lot-to-lot bridging. Include impurity and system-suitability standards with identity/purity established. Provide a reference standard summary table. Use placeholders for lot numbers and assigned values; do not fabricate data.",
    "parentCode": "3.2.S",
    "expectedData": [
      "Reference standard table: standard | source/lot | role | assigned value | storage | re-qualification interval",
      "Characterization/qualification summary for the in-house primary standard"
    ],
    "commonPitfalls": [
      "In-house reference standard not fully characterized or its assigned value not justified",
      "No qualification/bridging protocol when successive standard lots are introduced",
      "For biologics, absence of a two-tier reference standard system or unclear calibration hierarchy",
      "Missing storage conditions and re-qualification/expiry program for standards",
      "Impurity/system-suitability standards without established identity and purity",
      "Reference standard characterization methods inconsistent with those in S.3.1/S.4.2"
    ],
    "wordCountRange": [
      400,
      1200
    ],
    "dependencies": [
      "3.2.S.3.1",
      "3.2.S.4.2",
      "3.2.S.3.2"
    ]
  },
  "3.2.S.6": {
    "code": "3.2.S.6",
    "title": "Container Closure System",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Describes the container closure system used to store and ship the drug substance, including materials of construction, specifications, and suitability.",
    "authoringGuidance": "Section 3.2.S.6 describes the packaging that protects the drug substance and demonstrates its suitability for storage and shipment. Reviewers assess whether the container closure system provides adequate protection (light, moisture, oxygen), whether materials of construction are identified and controlled, and whether suitability—protection, compatibility, safety, and performance—is supported, drawing on the FDA container-closure guidance and ICH Q6A. Acceptability requires description of each packaging component (primary, secondary, and any protective/inner packaging), materials of construction with compendial references, specifications for critical components, and a justification of suitability consistent with the stability program (S.7), which is typically conducted in the proposed container. For drug substances stored frozen or as biologics, extractables/leachables and compatibility over intended hold conditions warrant attention. The container used in stability studies must match the proposed commercial container or be bridged.",
    "keyContentElements": [
      "Description of each packaging component (primary contact, secondary, protective/inner liners)",
      "Materials of construction with compendial/regulatory references (e.g., HDPE, LDPE liner, USP/Ph.Eur. resin class)",
      "Specifications and control of critical container components",
      "Suitability discussion: protection (light/moisture/oxygen), compatibility, safety, and performance",
      "Extractables/leachables assessment where relevant (biologics, frozen storage, solutions)",
      "Consistency of the stability-study container with the proposed commercial container closure",
      "Storage and shipping conditions the system is qualified to support (including frozen/cold chain if applicable)",
      "Reference to the FDA container-closure guidance and ICH Q6A"
    ],
    "generationPrompt": "Draft CTD Section 3.2.S.6 (Container Closure System) for the drug substance in {{PRODUCT_NAME}} by {{SPONSOR}} at {{PHASE}} for {{INDICATION}}. Describe each packaging component (primary contact, secondary, protective liners), materials of construction with compendial references, specifications for critical components, and a suitability discussion covering protection, compatibility, safety, and performance per the FDA container-closure guidance and ICH Q6A. Address extractables/leachables where relevant (biologic, solution, or frozen storage) and confirm the stability container matches the commercial one. State the storage/shipping conditions supported. Provide a component table. Use placeholders for material and supplier specifics; do not fabricate data.",
    "parentCode": "3.2.S",
    "expectedData": [
      "Container closure component table: component | material | supplier/spec reference | function",
      "Extractables/leachables summary where applicable"
    ],
    "commonPitfalls": [
      "Materials of construction not fully identified or not referenced to compendial standards",
      "Suitability asserted without addressing protection/compatibility/safety/performance",
      "Stability studies conducted in a container different from the proposed one without bridging",
      "Omitting extractables/leachables assessment for biologics or solution/frozen storage",
      "No specifications for critical container components",
      "Cold-chain/frozen storage claims not supported by container qualification"
    ],
    "wordCountRange": [
      400,
      1200
    ],
    "dependencies": [
      "3.2.S.7"
    ]
  },
  "3.2.S.7": {
    "code": "3.2.S.7",
    "title": "Stability (Drug Substance)",
    "module": 3,
    "moduleName": "Quality (CMC)",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Presents the stability data, protocol, and conclusions supporting the retest period or shelf life and recommended storage conditions of the drug substance.",
    "authoringGuidance": "Section 3.2.S.7 establishes how long and under what conditions the drug substance remains within specification, supporting the proposed retest period/shelf life and storage statement. Reviewers evaluate the stability program against ICH Q1A(R2) (design, conditions, testing frequency), Q1B (photostability), Q1E (data evaluation/extrapolation), and for biologics Q5C, checking that stability-indicating methods, appropriate storage conditions (long-term, intermediate, accelerated), and stressed studies support the claim. Acceptability requires a stability protocol and commitment, results on primary batches (typically at least three, representative of the commercial process), a data-driven proposal for the retest period/shelf life with any extrapolation justified per Q1E, and a post-approval stability commitment. For biologics, real-time/real-condition data govern because accelerated data are supportive only, and forced-degradation studies establish degradation pathways. Storage statement wording must be consistent with the demonstrated conditions and container (S.6).",
    "keyContentElements": [
      "Stability protocol: conditions (long-term, intermediate, accelerated per ICH Q1A(R2)), orientations, and testing frequency",
      "Stability-indicating parameters and methods (cross-referenced to S.4.2/S.4.3)",
      "Primary stability batches (number, scale, process version, container matching S.6)",
      "Available long-term, accelerated, and where applicable intermediate results with trend analysis",
      "Photostability study per ICH Q1B and forced-degradation/stress results establishing degradation pathways",
      "Proposed retest period/shelf life with extrapolation justified per ICH Q1E",
      "Recommended storage condition statement consistent with the data and container closure",
      "For biologics: real-time/real-condition data per ICH Q5C, with accelerated/stressed data as supportive",
      "Post-approval stability protocol and commitment for ongoing/commercial batches"
    ],
    "generationPrompt": "Draft CTD Section 3.2.S.7 (Stability) for the drug substance in {{PRODUCT_NAME}} by {{SPONSOR}} at {{PHASE}} for {{INDICATION}}. Present the stability protocol (long-term, intermediate, accelerated conditions, orientations, and testing frequency per ICH Q1A(R2)), stability-indicating methods cross-referenced to S.4.2/S.4.3, primary batch information (number, scale, container matching S.6), and results tables with trend analysis. Include photostability per ICH Q1B and forced-degradation studies defining degradation pathways. Propose a retest period/shelf life with extrapolation justified per ICH Q1E and a storage statement consistent with the data. For a biologic, base the claim on real-time/real-condition data per ICH Q5C with accelerated/stressed data as supportive. Include a post-approval stability commitment. Use placeholders for batch identifiers and results; do not fabricate stability data.",
    "parentCode": "3.2.S",
    "expectedData": [
      "Stability results tables by condition/time point: parameter | acceptance criterion | results over time",
      "Stability protocol table: condition | orientation | time points | tests",
      "Forced-degradation/photostability summary table",
      "Trend/regression analysis supporting the retest period (per ICH Q1E)"
    ],
    "commonPitfalls": [
      "Proposed retest period/shelf life extrapolated beyond what ICH Q1E supports",
      "Stability methods not demonstrated to be stability-indicating (specificity gap from S.4.3)",
      "Fewer than three primary batches or batches not representative of the commercial process",
      "Missing photostability (ICH Q1B) or forced-degradation studies to define degradation pathways",
      "For biologics, over-reliance on accelerated data where ICH Q5C requires real-time data",
      "Stability container inconsistent with S.6, or storage statement not matching demonstrated conditions",
      "No post-approval stability commitment provided"
    ],
    "wordCountRange": [
      1000,
      3000
    ],
    "dependencies": [
      "3.2.S.4.1",
      "3.2.S.4.2",
      "3.2.S.4.3",
      "3.2.S.4.4",
      "3.2.S.6"
    ]
  },
  "4.2.1.1": {
    "code": "4.2.1.1",
    "title": "Primary Pharmacodynamics",
    "module": 4,
    "moduleName": "Nonclinical",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Section 4.2.1.1 houses the full study reports establishing the primary pharmacodynamic (PD) activity of the drug — the mechanism of action and effects related to the intended therapeutic target. This section provides the scientific rationale linking the molecular pharmacology to the proposed clinical indication, and an FDA reviewer reads it to confirm that a plausible, characterized mechanism supports advancing to humans. Acceptable sections present in vitro potency/selectivity data (receptor binding, functional assays, enzyme inhibition) together with in vivo proof-of-concept in relevant animal disease models, with clear dose-exposure-response characterization. The reviewer looks for concordance between the pharmacology and the safety pharmacology/toxicology program, and for exposure margins that make human dosing rational.",
    "authoringGuidance": "Organize reports by study type (in vitro before in vivo) and present each as a complete ICH E3-style study report with objective, methods, results, and conclusions. State the target, mechanism, and how the primary PD endpoints connect to the {{INDICATION}}. Report potency metrics (IC50/EC50/Ki), selectivity ratios, species reactivity (critical for biologics to justify the pharmacologically relevant species per ICH S6(R1)), and in vivo efficacy with dose-response and, where available, PK/PD relationships. Cross-reference the Nonclinical Overview (2.4) and Pharmacology Written Summary (2.6.2) where these reports are summarized. Do not restate clinical efficacy claims; confine content to nonclinical evidence and clearly identify GLP versus non-GLP status (primary PD studies are typically non-GLP, which is acceptable).",
    "keyContentElements": [
      "Defined molecular target and proposed mechanism of action",
      "In vitro potency and selectivity data (IC50/EC50/Ki, receptor/enzyme panels)",
      "Species cross-reactivity data justifying the pharmacologically relevant species (especially for biologics per ICH S6(R1))",
      "In vivo proof-of-concept efficacy in relevant animal disease/pharmacology models",
      "Dose-response and, where available, exposure-response (PK/PD) relationships",
      "Study design details: species/strain, test system, dose levels, route, controls",
      "Positive/reference comparator data where applicable",
      "Link between primary PD endpoints and the intended clinical indication",
      "GLP/non-GLP status statement for each report",
      "Individual complete study reports formatted per ICH E3 structure"
    ],
    "generationPrompt": "Draft the CTD Section 4.2.1.1 Primary Pharmacodynamics authoring framework for {{PRODUCT_NAME}}, a product being developed by {{SPONSOR}} for {{INDICATION}} at {{PHASE}}. Describe how to organize the in vitro mechanism-of-action and potency/selectivity reports and in vivo proof-of-concept study reports, what quantitative endpoints (IC50/EC50/Ki, selectivity ratios, species reactivity, dose-response) each must contain, and how the primary PD evidence should connect the molecular target to the intended indication. Do not fabricate results; specify where data belong and what a complete, FDA-ready section contains, referencing ICH M3(R2) and, for biologics, ICH S6(R1).",
    "parentCode": "4.2.1",
    "expectedData": [
      "Table of in vitro potency and selectivity values (IC50/EC50/Ki, selectivity ratios) across target and off-target assays",
      "Species cross-reactivity/binding affinity comparison table",
      "In vivo efficacy dose-response tables with statistical analysis",
      "PK/PD relationship summary where exposure data are available"
    ],
    "commonPitfalls": [
      "Failing to demonstrate species reactivity, undermining the choice of pharmacologically relevant toxicology species (common biologics IR)",
      "Presenting only in vitro data with no in vivo proof-of-concept to support the mechanism",
      "Omitting dose-response characterization so no relationship between exposure and pharmacologic effect can be established",
      "Reporting potency without selectivity data, leaving off-target liabilities uncharacterized",
      "Disconnect between the claimed mechanism and the pharmacology actually studied, or between PD models and the proposed indication",
      "Burying key quantitative endpoints in narrative rather than tabulating them"
    ],
    "wordCountRange": [
      700,
      1400
    ],
    "dependencies": [
      "2.6.2",
      "2.6.3",
      "2.4"
    ]
  },
  "4.2.1.2": {
    "code": "4.2.1.2",
    "title": "Secondary Pharmacodynamics",
    "module": 4,
    "moduleName": "Nonclinical",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Section 4.2.1.2 contains study reports on secondary pharmacodynamic effects — actions of the drug not related to its primary therapeutic target, typically arising from off-target activity. These data help characterize the drug's overall pharmacologic profile and identify potential mechanisms for adverse effects observed in toxicology or anticipated in the clinic. An FDA reviewer uses this section to understand off-target liabilities (e.g., broad receptor/enzyme/ion-channel panel hits) and to contextualize findings from safety pharmacology and repeat-dose toxicity. A complete section presents systematic off-target screening (often a broad pharmacology panel) with interpretation of any hits relative to anticipated clinical exposures.",
    "authoringGuidance": "Present secondary PD as complete study reports, typically including a broad in vitro pharmacological profiling panel (receptors, enzymes, transporters, ion channels) and any targeted follow-up studies of identified off-target activities. For each significant hit, provide the potency and compare it to projected clinical Cmax/free-drug exposure to assess clinical relevance. Interpret secondary PD findings in the context of observed toxicology and safety pharmacology signals, and cross-reference 2.6.2. State GLP/non-GLP status (usually non-GLP). Avoid dismissing off-target hits without an exposure-margin justification; the reviewer expects a reasoned relevance assessment, not a bare table.",
    "keyContentElements": [
      "Broad in vitro off-target profiling panel results (receptors, enzymes, ion channels, transporters)",
      "Potency values for any off-target hits (IC50/EC50/Ki, percent inhibition at test concentration)",
      "Comparison of off-target potency to projected clinical free-drug exposure (safety margins)",
      "Targeted mechanistic follow-up studies of significant off-target activities",
      "Interpretation linking secondary PD hits to observed or potential adverse effects",
      "Cross-reference to safety pharmacology (4.2.1.3) and toxicology findings",
      "Study design and test system details for each report",
      "GLP/non-GLP status statement"
    ],
    "generationPrompt": "Draft the CTD Section 4.2.1.2 Secondary Pharmacodynamics authoring framework for {{PRODUCT_NAME}} ({{SPONSOR}}, {{INDICATION}}, {{PHASE}}). Explain how to present broad off-target pharmacological profiling and targeted follow-up study reports, how to tabulate off-target potency, and how to assess clinical relevance by comparing off-target potency to projected human free-drug exposure. Describe how secondary PD findings should be interpreted against safety pharmacology and toxicology signals. Do not invent results; specify where data belong and what a complete section contains, referencing ICH M3(R2).",
    "parentCode": "4.2.1",
    "expectedData": [
      "Broad pharmacology panel table (targets tested, percent inhibition/potency, hit flags)",
      "Off-target potency vs. projected clinical exposure margin table",
      "Follow-up study dose-response data for confirmed off-target activities"
    ],
    "commonPitfalls": [
      "Reporting off-target hits without comparing potency to anticipated human exposure, so clinical relevance is unassessed",
      "Omitting a broad pharmacology screen entirely, leaving off-target liabilities uncharacterized",
      "Failing to connect secondary PD findings to safety pharmacology or toxicology observations",
      "Dismissing hits as irrelevant without a quantitative margin justification",
      "Not following up mechanistically on a significant off-target activity"
    ],
    "wordCountRange": [
      500,
      1000
    ],
    "dependencies": [
      "2.6.2",
      "2.6.3",
      "4.2.1.3"
    ]
  },
  "4.2.1.3": {
    "code": "4.2.1.3",
    "title": "Safety Pharmacology",
    "module": 4,
    "moduleName": "Nonclinical",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Section 4.2.1.3 contains the safety pharmacology study reports that evaluate potential undesirable effects of the drug on vital physiological functions — the core battery covering the cardiovascular, central nervous, and respiratory systems, per ICH S7A, plus in vitro/in vivo cardiac repolarization (hERG/QT) assessment per ICH S7B. These studies are pivotal for supporting first-in-human dosing, and an FDA reviewer scrutinizes them to judge acute functional risks, particularly proarrhythmic (QT prolongation) potential. Acceptable sections present GLP-compliant core battery studies with adequate dose range (spanning and exceeding anticipated therapeutic exposures), appropriate positive controls, and clear exposure-effect relationships. Findings feed directly into clinical monitoring plans and, for QT, into the integrated cardiac safety assessment.",
    "authoringGuidance": "Present the ICH S7A core battery (CNS/functional observational battery, cardiovascular telemetry, respiratory) and ICH S7B studies (hERG/IKr current in vitro and in vivo QT assessment) as complete GLP study reports. For each, document species, dose levels with achieved exposures, route matching the clinical route, positive controls confirming assay sensitivity, and statistical analysis. Establish no-effect levels and exposure margins to the projected clinical exposure. For biologics, tailor the battery per ICH S6(R1) — often integrating endpoints into repeat-dose toxicity studies rather than standalone studies. Cross-reference 2.6.2/2.6.3 and the ICH E14/S7B integrated QT strategy where relevant. State GLP status explicitly; core battery studies should be GLP-compliant.",
    "keyContentElements": [
      "Cardiovascular assessment (in vivo telemetry: blood pressure, heart rate, ECG/QT interval)",
      "In vitro hERG/IKr assay results per ICH S7B",
      "Central nervous system evaluation (functional observational battery / Irwin test)",
      "Respiratory function assessment (rate, tidal volume, minute volume)",
      "Positive control data demonstrating assay sensitivity for each endpoint",
      "Dose levels with achieved systemic exposures and margins to clinical exposure",
      "No-observed-effect levels for each vital function",
      "GLP compliance statement for core battery studies",
      "Route of administration matching the intended clinical route",
      "Integration/justification approach for biologics per ICH S6(R1)"
    ],
    "generationPrompt": "Draft the CTD Section 4.2.1.3 Safety Pharmacology authoring framework for {{PRODUCT_NAME}} ({{SPONSOR}}, {{INDICATION}}, {{PHASE}}). Describe how to present the ICH S7A core battery (cardiovascular telemetry, CNS functional observational battery, respiratory) and ICH S7B cardiac repolarization (hERG/IKr and in vivo QT) study reports, including required positive controls, dose selection with achieved exposures and safety margins, no-effect levels, and GLP compliance. Explain the ICH S6(R1) approach for integrating safety pharmacology endpoints for biologics. Do not fabricate results; specify where data belong and what makes the section FDA-acceptable.",
    "parentCode": "4.2.1",
    "expectedData": [
      "Cardiovascular telemetry parameter tables (HR, BP, PR/QRS/QT/QTc) by dose and time",
      "hERG concentration-response (IC50) table",
      "CNS functional observational battery scoring tables",
      "Respiratory parameter tables by dose",
      "Exposure (Cmax/AUC) and safety margin summary table"
    ],
    "commonPitfalls": [
      "Absence or inadequate documentation of positive controls, so assay sensitivity cannot be confirmed",
      "Insufficient high-dose exposure margins relative to anticipated clinical Cmax",
      "Missing or inadequate hERG/QT assessment, a frequent clinical-hold or IR trigger",
      "Non-GLP core battery studies without adequate justification",
      "Failure to relate observed functional effects to systemic exposure (no exposure-effect analysis)",
      "Using a route or formulation not representative of clinical use without justification"
    ],
    "wordCountRange": [
      800,
      1500
    ],
    "dependencies": [
      "2.6.2",
      "2.6.3",
      "4.2.3.2"
    ]
  },
  "4.2.1.4": {
    "code": "4.2.1.4",
    "title": "Pharmacodynamic Drug Interactions",
    "module": 4,
    "moduleName": "Nonclinical",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Section 4.2.1.4 contains nonclinical study reports evaluating pharmacodynamic interactions — how the drug's pharmacologic effect (efficacy or toxicity) is altered by co-administration with other agents, or how it alters the effect of other agents, independent of pharmacokinetic changes. This section is required only when such studies were conducted; many programs have no nonclinical PD interaction studies, in which case the section states that none were performed and provides a brief justification. An FDA reviewer reads it when the intended clinical use involves combination therapy or when mechanism suggests additive/synergistic pharmacology (e.g., co-administration affecting the same physiological pathway). Acceptable content presents the interaction design (fixed-ratio or checkerboard), the nature of the interaction (additive, synergistic, antagonistic), and its relevance to the anticipated clinical combination.",
    "authoringGuidance": "If PD interaction studies were performed (common for fixed-dose combination products or intended add-on therapy), present each as a complete study report describing the co-administered agents, the interaction model, endpoints, and the analytical method for characterizing the interaction (e.g., isobolographic analysis, combination index). Interpret whether the interaction is additive, synergistic, or antagonistic and relate it to the intended clinical regimen. If no studies were conducted, state this explicitly with a scientific rationale and cross-reference the clinical pharmacology interaction strategy. Cross-reference 2.6.2 and the primary PD section (4.2.1.1). State GLP/non-GLP status.",
    "keyContentElements": [
      "Identification of co-administered agent(s) and rationale for studying the combination",
      "Interaction study design (fixed-ratio, checkerboard, isobolographic)",
      "PD endpoints assessed for the combination",
      "Characterization of interaction nature (additive/synergistic/antagonistic)",
      "Analytical method for interaction (combination index, isobologram)",
      "Relevance to intended clinical combination or add-on use",
      "Explicit statement and justification if no studies were performed",
      "GLP/non-GLP status statement"
    ],
    "generationPrompt": "Draft the CTD Section 4.2.1.4 Pharmacodynamic Drug Interactions authoring framework for {{PRODUCT_NAME}} ({{SPONSOR}}, {{INDICATION}}, {{PHASE}}). Explain when nonclinical PD interaction studies are needed (e.g., fixed-dose combinations or intended add-on therapy), how to present interaction study reports including design and interaction analysis (isobologram/combination index), and how to characterize additive/synergistic/antagonistic effects relative to the intended clinical regimen. Provide the language for a justified 'no studies conducted' statement when applicable. Do not fabricate results; specify where data belong and what a complete section contains.",
    "parentCode": "4.2.1",
    "expectedData": [
      "Combination dose-response / isobologram data tables (if studies performed)",
      "Combination index or interaction analysis summary"
    ],
    "commonPitfalls": [
      "Omitting the section entirely rather than stating that no studies were conducted with justification",
      "For combination products, failing to provide any nonclinical PD interaction characterization",
      "Reporting a combination effect without a formal interaction analysis (isobologram/combination index)",
      "Not relating the nonclinical interaction to the intended clinical regimen"
    ],
    "wordCountRange": [
      300,
      800
    ],
    "dependencies": [
      "2.6.2",
      "4.2.1.1"
    ]
  },
  "4.2.2.1": {
    "code": "4.2.2.1",
    "title": "Analytical Methods and Validation Reports (Pharmacokinetics)",
    "module": 4,
    "moduleName": "Nonclinical",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Section 4.2.2.1 contains the bioanalytical method descriptions and validation reports for the assays used to measure drug (and relevant metabolites) in biological matrices supporting the nonclinical PK and toxicokinetic program. These reports underpin the credibility of every exposure value reported across Module 4, so an FDA reviewer treats them as foundational — inadequate bioanalytical validation can invalidate the interpretation of toxicokinetic safety margins. Acceptable content presents full validation per the FDA Bioanalytical Method Validation guidance (2018) and ICH M10, covering accuracy, precision, selectivity, sensitivity, calibration range, stability, and (for macromolecules/biologics) immunogenicity and ligand-binding assay considerations. Method reports should be clearly cross-linked to the specific studies whose samples they analyzed.",
    "authoringGuidance": "Present each bioanalytical method (LC-MS/MS for small molecules; ligand-binding/ELISA for biologics; and anti-drug antibody assays where applicable) with its validation report demonstrating compliance with ICH M10 and the FDA 2018 Bioanalytical Method Validation guidance. Document calibration range, lower limit of quantitation, accuracy and precision (intra-/inter-run), selectivity/specificity, matrix effects, dilution integrity, and stability (bench-top, freeze-thaw, long-term, stock). Include incurred sample reanalysis outcomes where required. Clearly map each method/validation to the studies it supported and note the analyzing laboratory and GLP status. Cross-reference 2.6.4 (Pharmacokinetics Written Summary) and the toxicokinetic sections of the toxicology reports.",
    "keyContentElements": [
      "Analyte(s) and biological matrix for each method",
      "Assay technology (LC-MS/MS, ligand-binding assay/ELISA, LBA for biologics)",
      "Calibration range and lower limit of quantitation (LLOQ)",
      "Accuracy and precision (intra- and inter-run) validation data",
      "Selectivity, specificity, and matrix effect assessment",
      "Stability data (bench-top, freeze-thaw, long-term, stock, dilution integrity)",
      "Anti-drug antibody / immunogenicity assay validation for biologics",
      "Incurred sample reanalysis results where applicable",
      "Compliance statement to ICH M10 and FDA 2018 BMV guidance",
      "Mapping of each method to the specific studies analyzed and GLP status"
    ],
    "generationPrompt": "Draft the CTD Section 4.2.2.1 Analytical Methods and Validation Reports authoring framework for {{PRODUCT_NAME}} ({{SPONSOR}}, {{INDICATION}}, {{PHASE}}). Describe how to present bioanalytical method and validation reports (LC-MS/MS for small molecules or ligand-binding/ELISA and anti-drug antibody assays for biologics) supporting nonclinical PK and toxicokinetics, covering calibration range/LLOQ, accuracy, precision, selectivity, matrix effects, stability, dilution integrity, and incurred sample reanalysis, with compliance to ICH M10 and the FDA 2018 Bioanalytical Method Validation guidance. Explain how to map each method to the studies it supported. Do not fabricate results; specify where data belong and what a complete section contains.",
    "parentCode": "4.2.2",
    "expectedData": [
      "Accuracy and precision summary tables (intra-/inter-run) at QC levels",
      "Calibration curve and LLOQ/ULOQ summary",
      "Stability results table (conditions, durations, pass/fail)",
      "Incurred sample reanalysis summary table",
      "Method-to-study cross-reference table"
    ],
    "commonPitfalls": [
      "Incomplete stability characterization (missing long-term or freeze-thaw stability covering study sample storage duration)",
      "Missing or inadequate incurred sample reanalysis, triggering an FDA information request",
      "Method validation range not covering the concentrations actually observed in study samples",
      "For biologics, failing to validate or report anti-drug antibody assays affecting exposure interpretation",
      "Not cross-referencing which studies each validated method supported",
      "Selectivity not demonstrated against relevant metabolites or matrix components"
    ],
    "wordCountRange": [
      500,
      1100
    ],
    "dependencies": [
      "2.6.4",
      "2.6.5",
      "4.2.2.2",
      "4.2.3.2"
    ]
  },
  "4.2.2.2": {
    "code": "4.2.2.2",
    "title": "Absorption",
    "module": 4,
    "moduleName": "Nonclinical",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Section 4.2.2.2 contains nonclinical study reports characterizing absorption — the rate and extent to which the drug enters systemic circulation after administration by the intended and other routes. These data establish bioavailability, dose-exposure proportionality, and single-/repeat-dose kinetics in the toxicology species, forming the basis for interpreting toxicokinetic exposure margins and for interspecies scaling to humans. An FDA reviewer reads this section to confirm that adequate systemic exposure was achieved in safety species and to understand the exposure basis for safety margins. Acceptable content presents PK parameters (Cmax, Tmax, AUC, bioavailability, half-life) across species, doses, and single vs. repeat dosing, with dose-proportionality and accumulation assessment.",
    "authoringGuidance": "Present absorption/PK study reports by species, including IV and extravascular (typically clinical-route) dosing to derive absolute bioavailability. Report Cmax, Tmax, AUC, t1/2, clearance, volume of distribution, and dose-proportionality across the studied range, plus accumulation ratios from repeat dosing. Address sex differences and single- vs. multiple-dose kinetics. Relate exposures to those in pivotal toxicology studies and toward projected human exposure. Follow ICH S3A for toxicokinetic exposure assessment principles. Cross-reference 2.6.4/2.6.5 and the bioanalytical methods in 4.2.2.1. State GLP status (dedicated PK studies are often non-GLP; toxicokinetic data embedded in GLP tox studies are GLP).",
    "keyContentElements": [
      "PK parameters (Cmax, Tmax, AUC, t1/2, CL, Vd) by species and route",
      "Absolute and/or relative bioavailability determination (IV vs. extravascular)",
      "Dose-proportionality assessment across the studied dose range",
      "Single-dose versus repeat-dose kinetics and accumulation ratios",
      "Sex differences in exposure",
      "Relationship of nonclinical exposures to pivotal toxicology study exposures",
      "Route(s) of administration including the intended clinical route",
      "Cross-reference to bioanalytical validation (4.2.2.1)",
      "GLP/non-GLP status per report"
    ],
    "generationPrompt": "Draft the CTD Section 4.2.2.2 Absorption authoring framework for {{PRODUCT_NAME}} ({{SPONSOR}}, {{INDICATION}}, {{PHASE}}). Describe how to present nonclinical absorption/PK study reports across toxicology species, including derivation of bioavailability (IV vs. extravascular), PK parameters (Cmax, Tmax, AUC, t1/2, CL, Vd), dose-proportionality, single- vs. repeat-dose accumulation, and sex differences, and how to reconcile these exposures with pivotal toxicology exposures per ICH S3A. Cross-reference the bioanalytical methods section. Do not fabricate results; specify where data belong and what a complete section contains.",
    "parentCode": "4.2.2",
    "expectedData": [
      "PK parameter summary tables by species, dose, and route",
      "Concentration-time profile data (mean +/- SD)",
      "Dose-proportionality analysis table",
      "Accumulation ratio table (single vs. repeat dose)"
    ],
    "commonPitfalls": [
      "Not establishing absolute bioavailability (no IV comparator), limiting interspecies extrapolation",
      "Failing to characterize accumulation on repeat dosing relevant to toxicology exposures",
      "Ignoring nonlinear (saturable) kinetics observed at higher doses",
      "Not reporting sex differences in exposure where present",
      "Exposures in PK studies not reconciled with toxicokinetic exposures in pivotal studies"
    ],
    "wordCountRange": [
      500,
      1100
    ],
    "dependencies": [
      "2.6.4",
      "2.6.5",
      "4.2.2.1"
    ]
  },
  "4.2.2.3": {
    "code": "4.2.2.3",
    "title": "Distribution",
    "module": 4,
    "moduleName": "Nonclinical",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Section 4.2.2.3 contains study reports on tissue distribution, plasma protein binding, blood-to-plasma partitioning, and placental transfer of the drug and relevant metabolites. Tissue distribution data — typically from quantitative whole-body autoradiography (QWBA) in a single species — reveal target organ accumulation, persistence, and penetration of protected compartments (CNS, reproductive organs), informing target-organ toxicity interpretation and human dosimetry. An FDA reviewer uses this section to understand where the drug goes, whether it accumulates or is retained, and the free (unbound) fraction that drives pharmacology and toxicity. Acceptable content presents species protein binding (including human for translational context), Kp/tissue:plasma ratios, and time-course of tissue retention.",
    "authoringGuidance": "Present distribution study reports including plasma protein binding across nonclinical species and human, blood-to-plasma ratio, and tissue distribution (usually QWBA with a radiolabeled compound) characterizing peak tissue concentrations, tissue:blood ratios, and elimination/retention over time. Address melanin binding, penetration of the CNS and reproductive organs, and placental/fetal transfer where relevant to reproductive toxicity. For biologics, distribution is assessed differently (target-mediated disposition, catabolism) per ICH S6(R1). Relate the unbound fraction to interpretation of exposure margins. Cross-reference 2.6.4/2.6.5 and reproductive toxicology (4.2.3.5). State GLP/non-GLP status.",
    "keyContentElements": [
      "Plasma protein binding across nonclinical species and human (unbound fraction)",
      "Blood-to-plasma concentration ratio",
      "Tissue distribution data (QWBA): peak concentrations and tissue:blood ratios",
      "Time-course of tissue retention/elimination and any persistence",
      "Penetration of protected compartments (CNS, reproductive organs)",
      "Placental transfer / fetal exposure data where relevant",
      "Melanin/specialized tissue binding assessment",
      "Radiolabel position and radiochemical purity for QWBA studies",
      "Cross-reference to reproductive toxicology and PK summary",
      "GLP/non-GLP status statement"
    ],
    "generationPrompt": "Draft the CTD Section 4.2.2.3 Distribution authoring framework for {{PRODUCT_NAME}} ({{SPONSOR}}, {{INDICATION}}, {{PHASE}}). Describe how to present plasma protein binding (nonclinical species and human), blood-to-plasma ratio, and tissue distribution (QWBA) study reports, including tissue:blood ratios, retention/persistence, penetration of CNS and reproductive compartments, and placental transfer where relevant. Note the distinct disposition considerations for biologics per ICH S6(R1). Explain how unbound fraction informs exposure-margin interpretation. Do not fabricate results; specify where data belong and what a complete section contains.",
    "parentCode": "4.2.2",
    "expectedData": [
      "Plasma protein binding table by species (including human) with unbound fraction",
      "Tissue:blood concentration ratio table over time (QWBA)",
      "Blood-to-plasma ratio summary",
      "Placental/fetal transfer data table where applicable"
    ],
    "commonPitfalls": [
      "Omitting human plasma protein binding, preventing translational interpretation of unbound exposure",
      "Not characterizing tissue retention/persistence that could signal accumulation toxicity",
      "Failing to assess placental transfer when a reproductive toxicity signal or DART program requires it",
      "Inadequate radiolabel characterization (position, purity) for QWBA studies",
      "Not relating unbound fraction to exposure-margin interpretation"
    ],
    "wordCountRange": [
      500,
      1000
    ],
    "dependencies": [
      "2.6.4",
      "2.6.5",
      "4.2.3.5"
    ]
  },
  "4.2.2.4": {
    "code": "4.2.2.4",
    "title": "Metabolism",
    "module": 4,
    "moduleName": "Nonclinical",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Section 4.2.2.4 contains study reports characterizing the metabolic fate of the drug — in vitro (hepatocytes, microsomes, recombinant enzymes) and in vivo metabolite identification, metabolic pathways, enzymes responsible, and interspecies comparison of metabolites. These data are central to identifying the enzymes involved (informing DDI risk), confirming that toxicology species are exposed to the same metabolites as humans, and detecting disproportionate or unique human metabolites (MIST considerations per FDA guidance and ICH M3(R2)). An FDA reviewer scrutinizes metabolite cross-species coverage to confirm nonclinical safety qualification of major human metabolites. Acceptable content presents metabolic pathway maps, enzyme phenotyping, and comparative metabolite profiles across species and human.",
    "authoringGuidance": "Present in vitro metabolism (metabolic stability, metabolite profiling in hepatocytes/microsomes across species and human, reaction phenotyping identifying responsible CYP/UGT/other enzymes) and in vivo metabolite identification study reports. Provide a proposed metabolic scheme, comparative metabolite profiles demonstrating that nonclinical species produce the human metabolites (MIST assessment per ICH M3(R2) and the FDA Safety Testing of Drug Metabolites guidance), and identification of any disproportionate or unique human metabolites requiring qualification. Cross-reference PK DDI (4.2.2.6), repeat-dose toxicity (4.2.3.2), and 2.6.4/2.6.5. State GLP/non-GLP status.",
    "keyContentElements": [
      "Proposed metabolic pathway scheme with identified metabolites",
      "Metabolic stability data across species and human matrices",
      "Reaction phenotyping identifying responsible enzymes (CYP/UGT isoforms)",
      "Comparative metabolite profiles across nonclinical species and human",
      "Identification of major, disproportionate, or unique human metabolites (MIST)",
      "Structural characterization of key metabolites",
      "Assessment of whether toxicology species cover human metabolites",
      "Cross-reference to PK drug interaction (4.2.2.6) and toxicology",
      "GLP/non-GLP status statement"
    ],
    "generationPrompt": "Draft the CTD Section 4.2.2.4 Metabolism authoring framework for {{PRODUCT_NAME}} ({{SPONSOR}}, {{INDICATION}}, {{PHASE}}). Describe how to present in vitro and in vivo metabolism study reports: metabolic stability, metabolite profiling and identification, reaction phenotyping (responsible CYP/UGT enzymes), a proposed metabolic scheme, and comparative cross-species metabolite profiles to support a MIST assessment per ICH M3(R2) and the FDA Safety Testing of Drug Metabolites guidance, including identification of disproportionate or unique human metabolites. Do not fabricate results; specify where data belong and what a complete section contains.",
    "parentCode": "4.2.2",
    "expectedData": [
      "Metabolic pathway/scheme figure with metabolite structures",
      "Comparative metabolite profile table (species vs. human, relative abundance)",
      "Reaction phenotyping table (enzyme contribution to metabolism)",
      "Metabolic stability parameter table by matrix/species"
    ],
    "commonPitfalls": [
      "Failing to identify a disproportionate or unique human metabolite, triggering MIST information requests",
      "Not demonstrating that toxicology species produce the major human metabolites",
      "Incomplete reaction phenotyping, leaving the enzymes responsible unidentified for DDI assessment",
      "Metabolite identification limited to in vitro without in vivo confirmation",
      "Not linking metabolism findings to DDI risk or metabolite safety qualification"
    ],
    "wordCountRange": [
      600,
      1200
    ],
    "dependencies": [
      "2.6.4",
      "2.6.5",
      "4.2.2.6",
      "4.2.3.2"
    ]
  },
  "4.2.2.5": {
    "code": "4.2.2.5",
    "title": "Excretion",
    "module": 4,
    "moduleName": "Nonclinical",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Section 4.2.2.5 contains study reports characterizing the routes and extent of excretion of the drug and its metabolites — typically mass balance (recovery of radiolabeled dose in urine, feces, and bile), excretion into milk, and clearance mechanisms. These data establish the predominant elimination pathway (renal vs. hepatic/biliary), informing organ-impairment and DDI considerations and the potential for exposure in nursing offspring. An FDA reviewer uses this section to understand elimination routes and mass balance completeness. Acceptable content presents cumulative recovery over time, route distribution, evidence of enterohepatic recirculation where relevant, and excretion in milk when lactation exposure is a concern.",
    "authoringGuidance": "Present mass balance/excretion study reports (usually with radiolabeled drug in a rodent and sometimes non-rodent species) reporting cumulative percent of dose recovered in urine, feces, and bile, the time to achieve mass balance, and the predominant elimination route. Include biliary excretion and enterohepatic recirculation assessment where relevant, and milk excretion studies where lactational transfer matters. Relate elimination pathways to potential clinical DDI and organ-impairment implications. Cross-reference 2.6.4/2.6.5 and metabolism (4.2.2.4). State radiolabel details and GLP/non-GLP status.",
    "keyContentElements": [
      "Cumulative percent of administered (radiolabeled) dose recovered in urine, feces, and bile",
      "Time to achieve mass balance / total recovery",
      "Predominant route of elimination (renal vs. biliary/fecal)",
      "Biliary excretion and enterohepatic recirculation assessment where relevant",
      "Excretion into milk (lactational transfer) where applicable",
      "Metabolite composition in excreta",
      "Radiolabel position, purity, and dose administered",
      "Cross-reference to metabolism (4.2.2.4) and PK summary",
      "GLP/non-GLP status statement"
    ],
    "generationPrompt": "Draft the CTD Section 4.2.2.5 Excretion authoring framework for {{PRODUCT_NAME}} ({{SPONSOR}}, {{INDICATION}}, {{PHASE}}). Describe how to present mass balance and excretion study reports: cumulative recovery of radiolabeled dose in urine, feces, and bile, time to mass balance, predominant elimination route, biliary excretion and enterohepatic recirculation, and milk excretion where lactation exposure matters. Explain how elimination pathways inform DDI and organ-impairment considerations. Do not fabricate results; specify where data belong and what a complete section contains.",
    "parentCode": "4.2.2",
    "expectedData": [
      "Cumulative excretion table (% dose in urine/feces/bile over time)",
      "Mass balance recovery summary",
      "Excreta metabolite composition table",
      "Milk excretion data table where applicable"
    ],
    "commonPitfalls": [
      "Incomplete mass balance (low total recovery) without explanation, prompting information requests",
      "Not assessing biliary excretion/enterohepatic recirculation where kinetics suggest it",
      "Omitting milk excretion data relevant to lactation labeling",
      "Not distinguishing parent from metabolite in excreta composition",
      "Failing to relate elimination route to clinical organ-impairment/DDI implications"
    ],
    "wordCountRange": [
      400,
      900
    ],
    "dependencies": [
      "2.6.4",
      "2.6.5",
      "4.2.2.4"
    ]
  },
  "4.2.2.6": {
    "code": "4.2.2.6",
    "title": "Pharmacokinetic Drug Interactions",
    "module": 4,
    "moduleName": "Nonclinical",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Section 4.2.2.6 contains nonclinical (primarily in vitro) study reports assessing pharmacokinetic drug-drug interaction potential — the drug as a substrate, inhibitor, or inducer of drug-metabolizing enzymes (CYPs, UGTs) and transporters (P-gp, BCRP, OATP, OAT, OCT, MATE). These in vitro data drive the clinical DDI strategy and labeling, and an FDA reviewer evaluates them against the FDA In Vitro Drug Interaction Studies guidance (2020) and ICH M12 to decide which clinical DDI studies are warranted. Acceptable content presents reversible and time-dependent inhibition (Ki/IC50, KI/kinact), induction (mRNA/activity fold-change, EC50/Emax), transporter substrate/inhibition data, and basic/mechanistic model predictions (R values) supporting or excluding clinical DDI risk.",
    "authoringGuidance": "Present in vitro DDI study reports covering: enzyme reaction phenotyping (fraction metabolized by each enzyme), reversible and time-dependent (mechanism-based) CYP inhibition with Ki/IC50 and KI/kinact, CYP/UGT induction, and transporter substrate and inhibition assessment for the key transporters. Provide the basic (R-value) and, where triggered, mechanistic static or PBPK model calculations used to predict clinical relevance per the FDA 2020 In Vitro DDI guidance and ICH M12. Clearly state which clinical DDI studies are or are not warranted based on the cutoffs. Cross-reference metabolism (4.2.2.4), 2.6.4/2.6.5, and the clinical pharmacology DDI plan. State GLP/non-GLP status (typically non-GLP but conducted to guidance standards).",
    "keyContentElements": [
      "Enzyme reaction phenotyping / fraction metabolized by each CYP/UGT",
      "Reversible CYP inhibition data (Ki/IC50) across major isoforms",
      "Time-dependent (mechanism-based) inhibition parameters (KI, kinact)",
      "CYP/UGT induction data (mRNA and activity fold-change, EC50/Emax)",
      "Transporter substrate assessment (P-gp, BCRP, OATP1B1/1B3, OAT, OCT, MATE)",
      "Transporter inhibition data (IC50) for relevant transporters",
      "Basic model (R-value) and mechanistic static/PBPK DDI predictions",
      "Conclusions on which clinical DDI studies are warranted per cutoffs",
      "Compliance to FDA 2020 In Vitro DDI guidance and ICH M12",
      "Cross-reference to metabolism and clinical pharmacology DDI plan"
    ],
    "generationPrompt": "Draft the CTD Section 4.2.2.6 Pharmacokinetic Drug Interactions authoring framework for {{PRODUCT_NAME}} ({{SPONSOR}}, {{INDICATION}}, {{PHASE}}). Describe how to present in vitro DDI study reports: reaction phenotyping, reversible and time-dependent CYP inhibition (Ki/IC50, KI/kinact), CYP/UGT induction, and transporter substrate/inhibition assessment (P-gp, BCRP, OATP, OAT, OCT, MATE), plus basic (R-value) and mechanistic/PBPK predictions applying the decision cutoffs from the FDA 2020 In Vitro Drug Interaction Studies guidance and ICH M12 to determine which clinical DDI studies are warranted. Do not fabricate results; specify where data belong and what a complete section contains.",
    "parentCode": "4.2.2",
    "expectedData": [
      "CYP inhibition table (Ki/IC50 by isoform, reversible and time-dependent)",
      "CYP/UGT induction table (fold-change, EC50/Emax by isoform)",
      "Transporter substrate/inhibition summary table",
      "DDI prediction (R-value / static model) table with cutoff comparison",
      "Reaction phenotyping / fraction metabolized table"
    ],
    "commonPitfalls": [
      "Not testing the full panel of relevant CYP isoforms and transporters recommended by FDA/ICH M12",
      "Omitting time-dependent (mechanism-based) inhibition assessment",
      "Failing to apply the guidance decision cutoffs (R-values) to justify or exclude clinical DDI studies",
      "Inducer test concentrations not spanning clinically relevant exposures",
      "Not reconciling in vitro DDI conclusions with the clinical DDI program",
      "Using non-recommended positive controls or acceptance criteria"
    ],
    "wordCountRange": [
      600,
      1200
    ],
    "dependencies": [
      "2.6.4",
      "2.6.5",
      "4.2.2.4"
    ]
  },
  "4.2.2.7": {
    "code": "4.2.2.7",
    "title": "Other Pharmacokinetic Studies",
    "module": 4,
    "moduleName": "Nonclinical",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Section 4.2.2.7 is the placeholder for nonclinical PK/ADME study reports that do not fit the preceding absorption/distribution/metabolism/excretion/DDI categories — for example, PK in disease-model or pediatric juvenile animals, transporter-focused mechanistic studies not covered above, PK/PD modeling reports, PK in special populations of animals, or studies supporting a specific formulation or route. This section is used only when such studies exist; otherwise it states that none were conducted. An FDA reviewer reads it to capture supportive kinetic evidence relevant to specific development questions. Acceptable content presents each report with clear rationale for why it falls outside the standard ADME categories and how it supports the program.",
    "authoringGuidance": "Include here nonclinical PK study reports that are supportive but not classifiable under 4.2.2.2–4.2.2.6, such as juvenile-animal PK supporting pediatric development, PK in pharmacology/disease models, dedicated PK/PD modeling, formulation- or route-comparison PK, or in vitro transporter mechanistic studies beyond the standard DDI panel. State the rationale and how each supports specific development or regulatory questions. If no such studies exist, state so explicitly. Cross-reference the relevant standard PK sections and 2.6.4/2.6.5. State GLP/non-GLP status.",
    "keyContentElements": [
      "Study reports not classifiable under standard ADME/DDI categories (with rationale for placement)",
      "Juvenile-animal PK supporting pediatric development where applicable",
      "PK in disease/pharmacology models",
      "Dedicated PK/PD modeling and simulation reports",
      "Formulation- or route-comparison PK studies",
      "Explicit statement if no other PK studies were conducted",
      "Cross-reference to relevant standard PK sections",
      "GLP/non-GLP status statement"
    ],
    "generationPrompt": "Draft the CTD Section 4.2.2.7 Other Pharmacokinetic Studies authoring framework for {{PRODUCT_NAME}} ({{SPONSOR}}, {{INDICATION}}, {{PHASE}}). Explain what nonclinical PK/ADME study reports belong here (e.g., juvenile-animal PK for pediatric development, PK in disease models, PK/PD modeling, formulation/route-comparison PK) versus the standard ADME sections, how to state the rationale for each, and how to provide a justified 'none conducted' statement when applicable. Do not fabricate results; specify where data belong and what a complete section contains.",
    "parentCode": "4.2.2",
    "commonPitfalls": [
      "Misfiling standard ADME studies here that belong in 4.2.2.2–4.2.2.6",
      "Omitting juvenile-animal PK when a pediatric program requires it",
      "Including reports without a clear rationale for why they are 'other'",
      "Leaving the section blank rather than stating none were conducted"
    ],
    "wordCountRange": [
      200,
      700
    ],
    "dependencies": [
      "2.6.4",
      "2.6.5"
    ]
  },
  "4.2.3.1": {
    "code": "4.2.3.1",
    "title": "Single-Dose Toxicity",
    "module": 4,
    "moduleName": "Nonclinical",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Section 4.2.3.1 contains single-dose (acute) toxicity study reports characterizing the toxicity of a single administration, including the dose-toxicity relationship and, where determined, approximate lethal/maximum tolerated dose. Under ICH M3(R2), classical lethality-based acute toxicity studies are no longer required; acute toxicity information is now commonly obtained from appropriately designed dose-ranging or the early phase of repeat-dose studies, and non-lethal endpoints are emphasized. An FDA reviewer reads this section to understand the immediate toxicity profile, target organs of acute toxicity, and the margin between pharmacologic and acutely toxic doses. Acceptable content presents dose levels, clinical signs, mortality (where observed), gross pathology, and the exposure basis, in at least the toxicologically relevant species.",
    "authoringGuidance": "Present acute/single-dose toxicity information — which per ICH M3(R2) may be derived from dose-ranging or the initial phase of repeat-dose studies rather than dedicated lethality studies — including doses tested, route (intended clinical route and often a parenteral route), clinical observations, mortality if any, body weight, gross necropsy, and toxicokinetics where available. Identify the maximum tolerated dose or maximum feasible dose and any acute target organs. Emphasize non-lethal endpoints per current guidance. Cross-reference 2.6.6/2.6.7 and repeat-dose toxicity (4.2.3.2). State GLP status (pivotal acute toxicity data supporting first-in-human should be GLP-compliant).",
    "keyContentElements": [
      "Species, strain, sex, route(s), and dose levels tested",
      "Clinical signs of toxicity and onset/reversibility",
      "Mortality data where observed and approximate maximum tolerated/tolerated dose",
      "Body weight and food consumption effects",
      "Gross necropsy/pathology findings",
      "Acute target organs of toxicity",
      "Toxicokinetic/exposure data where collected",
      "Statement that acute data derive from dose-ranging/repeat-dose studies per ICH M3(R2) where applicable",
      "GLP compliance statement for pivotal studies"
    ],
    "generationPrompt": "Draft the CTD Section 4.2.3.1 Single-Dose Toxicity authoring framework for {{PRODUCT_NAME}} ({{SPONSOR}}, {{INDICATION}}, {{PHASE}}). Describe how to present acute/single-dose toxicity information consistent with ICH M3(R2) — where such data may be derived from dose-ranging or the initial phase of repeat-dose studies rather than dedicated lethality studies — covering species, route, dose levels, clinical signs, maximum tolerated/feasible dose, acute target organs, gross pathology, and exposure. Emphasize non-lethal endpoints. Do not fabricate results; specify where data belong and what a complete, FDA-acceptable section contains.",
    "parentCode": "4.2.3",
    "expectedData": [
      "Dose-level design and mortality/clinical-signs summary table",
      "Body weight and food consumption tables",
      "Gross pathology findings table",
      "Toxicokinetic exposure summary where available"
    ],
    "commonPitfalls": [
      "Conducting classical lethality (LD50) studies no longer expected under ICH M3(R2)",
      "Not identifying a maximum tolerated or maximum feasible dose to frame the toxicity range",
      "Failing to test the intended clinical route",
      "Omitting exposure data, so acute findings cannot be related to systemic exposure",
      "Not reconciling acute findings with target organs seen in repeat-dose studies"
    ],
    "wordCountRange": [
      400,
      900
    ],
    "dependencies": [
      "2.6.6",
      "2.6.7",
      "4.2.3.2"
    ]
  },
  "4.2.3.2": {
    "code": "4.2.3.2",
    "title": "Repeat-Dose Toxicity",
    "module": 4,
    "moduleName": "Nonclinical",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Section 4.2.3.2 contains the pivotal repeat-dose (subchronic to chronic) toxicity study reports in rodent and non-rodent species that define the safety profile supporting the duration and dose of clinical use. These GLP studies establish the No-Observed-Adverse-Effect-Level (NOAEL), target organs of toxicity, reversibility, and the toxicokinetic exposures underpinning human safety margins and starting-dose selection per ICH M3(R2) and the FDA maximum-recommended-starting-dose approach. An FDA reviewer treats this as one of the most consequential sections in Module 4, checking that study duration supports the intended clinical trial/marketing duration, that dose selection achieved adequate exposure multiples, and that TK data (ICH S3A) anchor the safety margins. Acceptable content presents full study reports with integrated toxicokinetics, complete pathology, and clear NOAEL determination.",
    "authoringGuidance": "Present repeat-dose toxicity study reports for both a rodent and a non-rodent species at durations that support the intended clinical use per ICH M3(R2) Table 1 (e.g., up to 9-month non-rodent / 6-month rodent for chronic). For each study document design (species, dose levels, duration, route matching clinical), in-life findings (clinical signs, body weight, food consumption, ophthalmology, ECG for non-rodent), clinical pathology (hematology, chemistry, urinalysis), organ weights, gross and histopathology, toxicokinetics (ICH S3A), reversibility (recovery groups), NOAEL, and target organs. Derive exposure margins to projected clinical exposure and support MRSD. For biologics, apply ICH S6(R1) (relevant species, immunogenicity, longer-duration integration). Cross-reference 2.6.6/2.6.7, 4.2.2.1, and safety pharmacology. State GLP compliance (required for pivotal studies).",
    "keyContentElements": [
      "Study designs by species (rodent and non-rodent), dose levels, duration, and route",
      "NOAEL determination for each pivotal study",
      "Target organs of toxicity and dose-response relationships",
      "Clinical pathology (hematology, clinical chemistry, urinalysis) findings",
      "Organ weights, gross necropsy, and histopathology findings",
      "Toxicokinetic data integrated per ICH S3A (Cmax, AUC by dose/sex/day, accumulation)",
      "Reversibility assessment from recovery-group animals",
      "Exposure margins (safety multiples) vs. projected clinical exposure",
      "Duration adequacy vs. intended clinical use per ICH M3(R2)",
      "Immunogenicity and relevant-species justification for biologics (ICH S6(R1))",
      "GLP compliance statement for all pivotal studies"
    ],
    "generationPrompt": "Draft the CTD Section 4.2.3.2 Repeat-Dose Toxicity authoring framework for {{PRODUCT_NAME}} ({{SPONSOR}}, {{INDICATION}}, {{PHASE}}). Describe how to present pivotal GLP repeat-dose toxicity study reports in rodent and non-rodent species at durations supporting the intended clinical use per ICH M3(R2), covering design, in-life and clinical pathology findings, organ weights, gross and histopathology, integrated toxicokinetics per ICH S3A, reversibility (recovery groups), NOAEL determination, target organs, and derivation of exposure margins supporting the maximum recommended starting dose. Address ICH S6(R1) considerations for biologics (relevant species, immunogenicity). Do not fabricate results; specify where data belong and what makes the section FDA-acceptable.",
    "parentCode": "4.2.3",
    "expectedData": [
      "Study design summary table (species, doses, duration, group sizes, recovery)",
      "Toxicokinetic exposure tables (Cmax, AUC) by dose, sex, and day with accumulation",
      "Clinical pathology summary tables by dose and sex",
      "Organ weight tables",
      "Histopathology incidence tables by dose",
      "NOAEL and exposure-margin (safety multiple) summary table"
    ],
    "commonPitfalls": [
      "Study duration insufficient to support the intended clinical trial or marketing duration per ICH M3(R2)",
      "Inadequate high-dose exposure margins (dose selection failed to reach MTD/MFD or saturating exposure)",
      "Missing or incomplete toxicokinetics, so safety margins cannot be quantified (ICH S3A deficiency)",
      "No recovery groups to assess reversibility of key findings",
      "Incomplete histopathology or inadequate peer review of pathology findings",
      "For biologics, failure to justify the pharmacologically relevant species or address immunogenicity affecting exposure",
      "NOAEL not clearly justified or inconsistent with the adverse-finding interpretation"
    ],
    "wordCountRange": [
      1000,
      1800
    ],
    "dependencies": [
      "2.6.6",
      "2.6.7",
      "4.2.2.1",
      "4.2.1.3"
    ]
  },
  "4.2.3.3": {
    "code": "4.2.3.3",
    "title": "Genotoxicity",
    "module": 4,
    "moduleName": "Nonclinical",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Section 4.2.3.3 contains the genotoxicity study reports comprising the standard battery under ICH S2(R1): a bacterial reverse mutation (Ames) test, an in vitro assay for chromosomal/gene damage (mammalian cell), and an in vivo genotoxicity assay (e.g., rodent micronucleus). These studies assess the potential to cause gene mutations and chromosomal damage, informing carcinogenic risk and, for small molecules, gating early clinical exposure. An FDA reviewer verifies that the recommended battery is complete, conducted to GLP with adequate top concentrations/doses and positive controls, and that any positive finding is followed up and its human relevance assessed. Acceptable content presents each assay with clear positive/negative calls, exposure confirmation for the in vivo assay, and an integrated weight-of-evidence conclusion. For most biologics, genotoxicity studies are generally not warranted per ICH S6(R1).",
    "authoringGuidance": "Present the ICH S2(R1) standard battery: bacterial reverse mutation (Ames), an in vitro mammalian assay (chromosomal aberration, micronucleus, or mouse lymphoma tk), and an in vivo assay (typically rodent bone-marrow micronucleus), with demonstrated systemic/target-tissue exposure for the in vivo test. Document top concentrations/doses per guidance, metabolic activation (S9), positive and negative controls, and acceptance criteria. Provide an integrated weight-of-evidence conclusion and, for any positive result, mechanistic follow-up and human relevance assessment (thresholded vs. non-thresholded mechanism). For biologics, state the ICH S6(R1) rationale that standard genotoxicity testing is generally not applicable. Cross-reference 2.6.6/2.6.7 and carcinogenicity (4.2.3.4). State GLP compliance (required).",
    "keyContentElements": [
      "Bacterial reverse mutation (Ames) test report with strains and S9 activation",
      "In vitro mammalian cell assay (chromosomal aberration, micronucleus, or mouse lymphoma tk)",
      "In vivo genotoxicity assay (e.g., rodent bone-marrow micronucleus)",
      "Demonstration of systemic/target-tissue exposure for the in vivo assay",
      "Top concentration/dose selection per ICH S2(R1) and acceptance criteria",
      "Positive and negative (vehicle) controls confirming assay validity",
      "Integrated weight-of-evidence conclusion across the battery",
      "Follow-up and human-relevance assessment for any positive finding",
      "ICH S6(R1) rationale where genotoxicity testing is not applicable (biologics)",
      "GLP compliance statement"
    ],
    "generationPrompt": "Draft the CTD Section 4.2.3.3 Genotoxicity authoring framework for {{PRODUCT_NAME}} ({{SPONSOR}}, {{INDICATION}}, {{PHASE}}). Describe how to present the ICH S2(R1) standard battery — bacterial reverse mutation (Ames), an in vitro mammalian cell assay, and an in vivo genotoxicity assay — including top dose/concentration selection, S9 metabolic activation, positive/negative controls, demonstration of in vivo exposure, an integrated weight-of-evidence conclusion, and mechanistic/human-relevance follow-up for any positive finding. Note the ICH S6(R1) rationale for omitting standard genotoxicity testing for biologics. Do not fabricate results; specify where data belong and what a complete section contains.",
    "parentCode": "4.2.3",
    "expectedData": [
      "Ames test results table (strains, +/-S9, revertant counts, dose levels)",
      "In vitro mammalian assay results table (aberration/micronucleus/mutant frequency by dose)",
      "In vivo micronucleus results table (micronucleated cell frequency, exposure confirmation)",
      "Positive/negative control results summary"
    ],
    "commonPitfalls": [
      "Incomplete battery (missing the in vivo assay or an in vitro component) per ICH S2(R1)",
      "Failure to demonstrate in vivo exposure/target-tissue exposure for a negative in vivo result",
      "Inadequate top dose/concentration selection not meeting guidance criteria",
      "Positive finding left without mechanistic follow-up or human-relevance assessment",
      "Missing or invalid positive controls",
      "Running standard genotoxicity studies for a biologic without justification, or failing to justify their omission"
    ],
    "wordCountRange": [
      600,
      1200
    ],
    "dependencies": [
      "2.6.6",
      "2.6.7",
      "4.2.3.4"
    ]
  },
  "4.2.3.4": {
    "code": "4.2.3.4",
    "title": "Carcinogenicity",
    "module": 4,
    "moduleName": "Nonclinical",
    "required": false,
    "requiredFor": [
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Section 4.2.3.4 contains carcinogenicity study reports evaluating tumorigenic potential over the lifetime, generally required for drugs intended for continuous use of 6 months or longer or with cause-for-concern, per ICH S1A/S1B(R1)/S1C(R2) and ICH M3(R2). The standard design is a 2-year rodent bioassay plus either a second rodent species/short-term study or, increasingly, a transgenic mouse model; dose selection and study design should reflect ICH S1C(R2) and the ICH S1B(R1) weight-of-evidence framework. These studies are not required to initiate clinical trials but are pivotal for marketing (NDA/BLA), so an FDA reviewer evaluates dose adequacy, tumor incidence with statistical trend analysis, and human relevance of any tumor finding. Acceptable content presents survival-adjusted tumor incidence, exposure margins, mechanistic context, and a clear carcinogenic-risk conclusion.",
    "authoringGuidance": "Present carcinogenicity study reports (typically a 2-year rat bioassay and a 6-month transgenic mouse or second-species study) with dose selection justified per ICH S1C(R2) (based on toxicity, exposure/AUC ratio, saturation of absorption, or MFD) and, where used, the ICH S1B(R1) weight-of-evidence assessment potentially reducing the need for a second study. Document survival, tumor incidence by site with statistical trend/pairwise analysis, non-neoplastic findings, toxicokinetic exposures and margins, and mechanistic/mode-of-action data addressing human relevance for any increased tumor incidence. For biologics, apply ICH S6(R1) (standard bioassays often not appropriate; weight-of-evidence/product-specific assessment). Confirm the ICH M3(R2) timing (results generally needed before large long-term trials/marketing, not for initial IND). Cross-reference genotoxicity (4.2.3.3) and 2.6.6/2.6.7. State GLP compliance (required).",
    "keyContentElements": [
      "Study designs (2-year rodent bioassay and second species/transgenic model or S1B(R1) WoE justification)",
      "Dose selection rationale per ICH S1C(R2) (toxicity-, AUC-, saturation-, or MFD-based)",
      "Survival data and survival-adjusted analysis",
      "Tumor incidence by site with statistical trend and pairwise analyses",
      "Non-neoplastic histopathology findings",
      "Toxicokinetic exposures and carcinogenicity exposure margins",
      "Mechanism/mode-of-action and human-relevance assessment for tumor findings",
      "Integration with genotoxicity outcomes (weight of evidence)",
      "ICH S6(R1) product-specific approach for biologics where applicable",
      "GLP compliance statement and ICH M3(R2) timing confirmation"
    ],
    "generationPrompt": "Draft the CTD Section 4.2.3.4 Carcinogenicity authoring framework for {{PRODUCT_NAME}} ({{SPONSOR}}, {{INDICATION}}, {{PHASE}}). Describe how to present carcinogenicity study reports (2-year rodent bioassay plus a transgenic/second-species study or an ICH S1B(R1) weight-of-evidence justification), including dose selection per ICH S1C(R2), survival-adjusted tumor incidence with statistical trend analysis, toxicokinetic exposure margins, and mode-of-action/human-relevance assessment integrated with genotoxicity outcomes. Confirm ICH M3(R2) timing (needed for marketing, not initial IND) and note ICH S6(R1) considerations for biologics. Do not fabricate results; specify where data belong and what a complete section contains.",
    "parentCode": "4.2.3",
    "expectedData": [
      "Study design and dose-selection justification table",
      "Survival summary by group",
      "Tumor incidence tables by site and sex with statistical analysis (trend/pairwise)",
      "Non-neoplastic findings incidence tables",
      "Toxicokinetic exposure and carcinogenicity margin summary"
    ],
    "commonPitfalls": [
      "Inadequate high-dose selection failing ICH S1C(R2) criteria (insufficient AUC ratio or not reaching MTD/MFD), invalidating the study",
      "Poor survival compromising the sensitivity of the bioassay",
      "Missing statistical trend analysis of tumor incidence",
      "Tumor findings not addressed with a mode-of-action/human-relevance assessment",
      "Not integrating genotoxicity results into the carcinogenic risk conclusion",
      "For biologics, applying an inappropriate standard bioassay without the ICH S6(R1) weight-of-evidence rationale"
    ],
    "wordCountRange": [
      900,
      1600
    ],
    "dependencies": [
      "2.6.6",
      "2.6.7",
      "4.2.3.3"
    ]
  },
  "4.2.3.5": {
    "code": "4.2.3.5",
    "title": "Reproductive and Developmental Toxicity",
    "module": 4,
    "moduleName": "Nonclinical",
    "required": false,
    "requiredFor": [
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Section 4.2.3.5 contains the reproductive and developmental toxicity (DART) study reports covering fertility and early embryonic development (ICH S5(R3) Stage A/B), embryo-fetal development (EFD, teratogenicity, typically two species), and pre-/postnatal development (PPND), plus, where relevant, juvenile animal toxicity. Timing of each segment relative to clinical development follows ICH M3(R2) (e.g., EFD generally before including women of childbearing potential in larger/longer trials, with regional flexibilities). An FDA reviewer evaluates whether the DART package supports the intended patient population and pregnancy labeling, checking dose selection, maternal toxicity context, and NOAELs for fertility, embryo-fetal, and developmental endpoints. Acceptable content presents complete study reports with fetal examinations, developmental endpoints, exposure data, and clear NOAEL determinations.",
    "authoringGuidance": "Present DART study reports per ICH S5(R3): fertility and early embryonic development (Stage A-B, usually rat), embryo-fetal development (Stage C-D, two species, commonly rat and rabbit), and pre-/postnatal development (Stage C-F, rat), each with dose selection reaching maternal toxicity or adequate exposure, maternal endpoints, litter/fetal parameters (implantations, resorptions, fetal weight, external/visceral/skeletal malformations and variations), and F1 functional/developmental assessments for PPND. Report toxicokinetics and exposure margins, and NOAELs for maternal, reproductive, and developmental effects. Address juvenile animal studies where a pediatric indication is intended. Confirm segment timing per ICH M3(R2) relative to enrollment of women of childbearing potential. For biologics, apply ICH S6(R1)/S5(R3) (relevant species, often enhanced pre-/postnatal design in NHP). Cross-reference distribution/placental transfer (4.2.2.3) and 2.6.6/2.6.7. State GLP compliance.",
    "keyContentElements": [
      "Fertility and early embryonic development study (ICH S5(R3) Stage A-B)",
      "Embryo-fetal development studies in two species (Stage C-D) with fetal examinations",
      "Pre-/postnatal development study (Stage C-F) with F1 functional assessments",
      "Dose selection reaching maternal toxicity or adequate exposure and toxicokinetics",
      "Litter/fetal parameters (implantations, resorptions, fetal weight, malformations, variations)",
      "NOAELs for maternal, reproductive, and developmental effects",
      "Exposure margins to projected clinical exposure",
      "Juvenile animal toxicity study where a pediatric indication applies",
      "Segment timing justification per ICH M3(R2) relative to WOCBP enrollment",
      "NHP enhanced pre-/postnatal or relevant-species approach for biologics (ICH S6(R1))",
      "GLP compliance statement"
    ],
    "generationPrompt": "Draft the CTD Section 4.2.3.5 Reproductive and Developmental Toxicity authoring framework for {{PRODUCT_NAME}} ({{SPONSOR}}, {{INDICATION}}, {{PHASE}}). Describe how to present the DART package per ICH S5(R3): fertility and early embryonic development, embryo-fetal development in two species, and pre-/postnatal development, plus juvenile animal studies where a pediatric indication applies, covering dose selection, maternal and fetal/litter endpoints, toxicokinetics and developmental exposure margins, and NOAEL determinations. Confirm segment timing relative to enrolling women of childbearing potential per ICH M3(R2) and note ICH S6(R1) enhanced pre-/postnatal/relevant-species considerations for biologics. Do not fabricate results; specify where data belong and what a complete section contains.",
    "parentCode": "4.2.3",
    "expectedData": [
      "Fertility indices and reproductive performance tables",
      "Embryo-fetal endpoints tables (implantations, resorptions, fetal weight, malformation/variation incidence)",
      "Pre-/postnatal F1 developmental and functional endpoint tables",
      "Toxicokinetic exposure and developmental margin summary",
      "Maternal, reproductive, and developmental NOAEL summary table"
    ],
    "commonPitfalls": [
      "Incomplete DART package for the intended population (e.g., EFD in only one species when two are needed)",
      "Dose selection failing to reach maternal toxicity or adequate exposure, weakening the negative conclusion",
      "Missing toxicokinetics, preventing derivation of developmental exposure margins",
      "Inadequate fetal examination (skeletal or visceral) reducing sensitivity to teratogenic findings",
      "Segment timing not aligned with ICH M3(R2) requirements for enrolling women of childbearing potential",
      "Omitting juvenile animal studies when a pediatric program is planned"
    ],
    "wordCountRange": [
      1000,
      1700
    ],
    "dependencies": [
      "2.6.6",
      "2.6.7",
      "4.2.2.3"
    ]
  },
  "4.2.3.6": {
    "code": "4.2.3.6",
    "title": "Local Tolerance",
    "module": 4,
    "moduleName": "Nonclinical",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Section 4.2.3.6 contains local tolerance study reports evaluating tolerability at the site(s) of administration for the intended clinical route (e.g., injection-site reactions for parenterals, ocular tolerance for ophthalmics, dermal/mucosal tolerance for topicals). Per ICH M3(R2), local tolerance can be evaluated in dedicated studies or, preferably, as endpoints incorporated into general (repeat-dose) toxicity studies, avoiding standalone studies where possible. An FDA reviewer reads this section to confirm the clinical formulation and route are locally tolerated and that any injection-site or application-site findings are characterized and reversible. Acceptable content presents the tested formulation, route, observation/scoring of local reactions, histopathology of the administration site, and comparison to vehicle/control.",
    "authoringGuidance": "Present local tolerance evaluations for the intended clinical route using the to-be-marketed (or clinical) formulation, ideally integrated into repeat-dose toxicity studies per ICH M3(R2) but as dedicated studies where necessary (e.g., single-dose injection-site tolerance, perivenous/paravenous and intra-arterial assessment for IV products). Document macroscopic scoring of local reactions, administration-site histopathology, reversibility, and comparison to vehicle and, where relevant, positive irritant controls. Address the actual clinical formulation, concentration, and pH/osmolality relevance. Cross-reference repeat-dose toxicity (4.2.3.2) and 2.6.6/2.6.7. State GLP status (dedicated pivotal local tolerance studies should be GLP).",
    "keyContentElements": [
      "Intended clinical route and formulation (concentration, pH, osmolality) tested",
      "Study design (dedicated study or integration into repeat-dose toxicity per ICH M3(R2))",
      "Macroscopic scoring of local reactions at the administration site",
      "Histopathology of the administration site",
      "Reversibility of local findings (recovery assessment)",
      "Comparison to vehicle/control and positive irritant control where applicable",
      "Assessment of perivenous/paravenous and, for IV, intra-arterial tolerance where relevant",
      "Cross-reference to repeat-dose toxicity where endpoints were integrated",
      "GLP status statement for pivotal studies"
    ],
    "generationPrompt": "Draft the CTD Section 4.2.3.6 Local Tolerance authoring framework for {{PRODUCT_NAME}} ({{SPONSOR}}, {{INDICATION}}, {{PHASE}}). Describe how to present local tolerance evaluation for the intended clinical route using the clinical/to-be-marketed formulation, ideally integrated into repeat-dose toxicity studies per ICH M3(R2), covering macroscopic scoring, administration-site histopathology, reversibility, vehicle/positive-control comparison, and (for IV) perivenous/intra-arterial tolerance. Do not fabricate results; specify where data belong and what a complete section contains.",
    "parentCode": "4.2.3",
    "expectedData": [
      "Local reaction scoring tables by time point and treatment",
      "Administration-site histopathology incidence tables",
      "Reversibility/recovery summary"
    ],
    "commonPitfalls": [
      "Testing a formulation different from the clinical/to-be-marketed formulation",
      "Conducting standalone local tolerance studies where integration into repeat-dose studies would suffice (contrary to ICH M3(R2) 3R principles)",
      "Omitting administration-site histopathology (relying on gross observation alone)",
      "Not assessing reversibility of injection-site findings",
      "For IV products, failing to evaluate perivenous/paravenous or intra-arterial tolerance"
    ],
    "wordCountRange": [
      350,
      800
    ],
    "dependencies": [
      "2.6.6",
      "2.6.7",
      "4.2.3.2"
    ]
  },
  "4.2.3.7": {
    "code": "4.2.3.7",
    "title": "Other Toxicity Studies",
    "module": 4,
    "moduleName": "Nonclinical",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Section 4.2.3.7 houses toxicity study reports not covered by the preceding categories — including antigenicity/immunogenicity, immunotoxicity (ICH S8), mechanistic/mode-of-action studies, dependence/abuse liability, metabolite toxicity (MIST qualification), impurity qualification studies (ICH Q3A/Q3B, and for mutagenic impurities ICH M7(R2)), phototoxicity (ICH S10), and studies on excipients or degradants. Its sub-parts (4.2.3.7.1 antigenicity, 4.2.3.7.2 immunotoxicity, 4.2.3.7.3 mechanistic studies, 4.2.3.7.4 dependence, 4.2.3.7.5 metabolites, 4.2.3.7.6 impurities, 4.2.3.7.7 other) organize these. An FDA reviewer reads this section to find product-specific safety characterization triggered by the molecule's properties, findings elsewhere in the program, or the intended population. Acceptable content presents each study with a clear rationale for why it was conducted and how it addresses a specific safety question.",
    "authoringGuidance": "Organize under the standard sub-parts and include only the studies relevant to the product: antigenicity/immunogenicity (4.2.3.7.1), immunotoxicity per ICH S8 and weight-of-evidence from standard studies (4.2.3.7.2), mechanistic studies clarifying findings (4.2.3.7.3), dependence/abuse-liability per the FDA Abuse Potential guidance and ICH M3(R2) where CNS-active (4.2.3.7.4), metabolite safety qualification supporting MIST (4.2.3.7.5), impurity/degradant qualification per ICH Q3A(R2)/Q3B(R2) and mutagenic-impurity assessment per ICH M7(R2) (4.2.3.7.6), plus phototoxicity per ICH S10 and any excipient studies (4.2.3.7.7). State the rationale for each and cross-reference the driving finding or property. Where a category is not applicable, note it. Cross-reference 2.6.6/2.6.7 and the relevant primary tox sections. State GLP status per study.",
    "keyContentElements": [
      "Antigenicity/immunogenicity study reports where relevant (4.2.3.7.1)",
      "Immunotoxicity assessment per ICH S8 (weight-of-evidence and dedicated studies) (4.2.3.7.2)",
      "Mechanistic/mode-of-action studies clarifying toxicology findings (4.2.3.7.3)",
      "Dependence/abuse-liability studies for CNS-active drugs (4.2.3.7.4)",
      "Metabolite safety qualification studies supporting MIST (4.2.3.7.5)",
      "Impurity/degradant qualification per ICH Q3A(R2)/Q3B(R2) (4.2.3.7.6)",
      "Mutagenic impurity assessment/control per ICH M7(R2) (4.2.3.7.6)",
      "Phototoxicity assessment per ICH S10 and excipient studies (4.2.3.7.7)",
      "Clear rationale for each study and cross-reference to the driving finding",
      "GLP status statement per study"
    ],
    "generationPrompt": "Draft the CTD Section 4.2.3.7 Other Toxicity Studies authoring framework for {{PRODUCT_NAME}} ({{SPONSOR}}, {{INDICATION}}, {{PHASE}}). Describe how to organize the sub-parts (antigenicity, immunotoxicity per ICH S8, mechanistic studies, dependence/abuse liability, metabolite qualification for MIST, impurity/degradant qualification per ICH Q3A(R2)/Q3B(R2) and mutagenic-impurity control per ICH M7(R2), and phototoxicity per ICH S10), the rationale that triggers each, and how to cross-reference the driving finding or molecular property. Do not fabricate results; specify where data belong and what a complete section contains.",
    "parentCode": "4.2.3",
    "expectedData": [
      "Impurity qualification summary table (impurity, level, qualifying study/exposure) where applicable",
      "Metabolite qualification exposure-coverage table where applicable",
      "Phototoxicity assay results where conducted",
      "Abuse-liability/dependence study endpoint tables where conducted"
    ],
    "commonPitfalls": [
      "Not qualifying an impurity or degradant above ICH Q3A/Q3B thresholds, or an inadequate ICH M7(R2) mutagenic-impurity assessment",
      "Failing to assess abuse potential for a CNS-active molecule, drawing an FDA information request",
      "Omitting a phototoxicity assessment for a phototoxic-risk chromophore per ICH S10",
      "Not qualifying a disproportionate human metabolite identified in 4.2.2.4 (MIST gap)",
      "Immunotoxicity not addressed by weight-of-evidence when standard studies flag immune findings (ICH S8)",
      "Including studies without stating the rationale that triggered them"
    ],
    "wordCountRange": [
      500,
      1200
    ],
    "dependencies": [
      "2.6.6",
      "2.6.7",
      "4.2.2.4",
      "4.2.3.2"
    ]
  },
  "4.3": {
    "code": "4.3",
    "title": "Literature References",
    "module": 4,
    "moduleName": "Nonclinical",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "list",
    "guidance": "Section 4.3 contains copies of the published literature references cited throughout Module 4 — the scientific articles, review papers, monographs, and previously published nonclinical data supporting the pharmacology, PK, and toxicology assessments. This section provides the reviewer with the primary sources underpinning claims made in the nonclinical study reports and written summaries (2.4, 2.6), and is especially important for programs relying on literature-based safety qualification (e.g., well-characterized excipients, class effects, or published metabolite/impurity data). An FDA reviewer uses it to verify that cited evidence is accurate, current, and actually supports the assertions. Acceptable content presents full-text copies (or appropriate citations) organized to correspond to the citations in the Module 4 reports and summaries.",
    "authoringGuidance": "Compile full copies of all literature cited in Module 4, organized and numbered to correspond to citations in the nonclinical study reports and the Nonclinical Overview/Written Summaries. Provide complete bibliographic citations (authors, title, journal, year, volume, pages, DOI) and ensure every in-text citation across Module 4 maps to an included reference. Include copyright/permission compliance for reproduced articles. Where the submission is electronic (eCTD), provide references as individual bookmarked PDF files per the citation list. Do not include references not cited in the dossier, and ensure translated versions accompany non-English sources. Cross-reference 2.4 and 2.6.",
    "keyContentElements": [
      "Full-text copies (or appropriate citations) of all literature cited in Module 4",
      "Complete bibliographic citations (authors, title, journal, year, volume, pages, DOI)",
      "Numbering/organization corresponding to in-text citations in Module 4 reports and summaries",
      "Copyright/permission compliance for reproduced articles",
      "English translations accompanying non-English references",
      "eCTD-compliant individual, bookmarked reference files",
      "Cross-reference alignment with 2.4 and 2.6 written summaries"
    ],
    "generationPrompt": "Draft the CTD Section 4.3 Literature References authoring framework for {{PRODUCT_NAME}} ({{SPONSOR}}, {{INDICATION}}, {{PHASE}}). Explain how to compile and organize full-text copies of all literature cited across Module 4, ensure every in-text citation maps to an included reference with complete bibliographic details, handle copyright/permissions and English translations of non-English sources, and format references as individual bookmarked files for eCTD, aligned with the citations in the Nonclinical Overview (2.4) and Written Summaries (2.6). Do not fabricate references; specify how the section is assembled and what a complete section contains.",
    "parentCode": "4",
    "expectedData": [
      "Numbered reference list mapping citation IDs to full bibliographic entries"
    ],
    "commonPitfalls": [
      "In-text citations in Module 4 that have no corresponding reference included in 4.3 (or vice versa)",
      "Incomplete bibliographic details preventing source verification",
      "Missing English translations for non-English publications",
      "Copyright/permission issues with reproduced full-text articles",
      "Including references not actually cited in the dossier, cluttering the section",
      "Citations that do not actually support the assertion made in the study report or summary"
    ],
    "wordCountRange": [
      100,
      400
    ],
    "dependencies": [
      "2.4",
      "2.6.2",
      "2.6.4",
      "2.6.6"
    ]
  },
  "5.1": {
    "code": "5.1",
    "title": "Table of Contents of Module 5",
    "module": 5,
    "moduleName": "Clinical",
    "required": false,
    "requiredFor": [
      "NDA",
      "BLA"
    ],
    "contentType": "list",
    "guidance": "Navigable table of contents for the entire clinical module, mapping every study report and reference to its eCTD leaf.",
    "authoringGuidance": "The Module 5 Table of Contents is the reviewer's map to the clinical evidence base and must list every document in 5.2 through 5.4 with its exact granular CTD heading, study identifier, and volume/leaf location. FDA reviewers navigate directly from this TOC to individual CSRs, so hyperlinks and study-number labeling must be precise and consistent with the 5.2 tabular listing. A complete TOC reflects the ICH M4 granularity (one folder/leaf per study report set) and does not collapse multiple studies under a single heading. Discrepancies between the TOC, the 5.2 listing, and the actual submitted files are among the most common causes of technical rejection during eCTD validation.",
    "keyContentElements": [
      "Hierarchical listing of all sections 5.2, 5.3.1-5.3.7, and 5.4",
      "Study identifier (protocol number) for each clinical study report",
      "eCTD leaf title and file location/hyperlink for each document",
      "Consistent study numbering matching the 5.2 tabular listing",
      "Indication of appended items (CSR body, protocol, SAP, CRF samples) per study",
      "Volume and page references for paper or hybrid submissions",
      "Cross-references to Module 2 summaries (2.5 Clinical Overview, 2.7 Clinical Summary)"
    ],
    "generationPrompt": "Generate the Module 5 Table of Contents for the {{PRODUCT_NAME}} ({{INDICATION}}) marketing application submitted by {{SPONSOR}}. Produce a hierarchical, hyperlinked listing covering sections 5.2 through 5.4, with one leaf per clinical study report labeled by protocol/study number, phase ({{PHASE}}), and eCTD location. Ensure study numbering is consistent with the 5.2 tabular listing and cross-reference Module 2.5 and 2.7. Do not fabricate study numbers or results; use bracketed placeholders where sponsor-specific identifiers belong.",
    "parentCode": "5",
    "commonPitfalls": [
      "Study numbers in the TOC do not match those in the 5.2 tabular listing or the CSR titles",
      "Broken or missing hyperlinks to study report leaves causing eCTD validation errors",
      "Collapsing multiple studies under one heading instead of one leaf per study per ICH M4 granularity",
      "Omitting appended CSR components (protocol, SAP, sample CRF) from the listing"
    ],
    "wordCountRange": [
      150,
      600
    ],
    "dependencies": [
      "5.2"
    ]
  },
  "5.2": {
    "code": "5.2",
    "title": "Tabular Listing of All Clinical Studies",
    "module": 5,
    "moduleName": "Clinical",
    "required": false,
    "requiredFor": [
      "NDA",
      "BLA"
    ],
    "contentType": "table",
    "guidance": "A single master table cataloging every clinical study in the application with design attributes, populations, and dosing, per ICH M4E.",
    "authoringGuidance": "Section 5.2 provides the reviewer's index of the entire clinical program in one structured table, following the ICH M4E(R2) recommended format so every study can be located and characterized at a glance. Each row must capture study identifier, phase/type, objective, design (control, blinding, randomization), test product/dose/route/regimen, number of subjects (enrolled/treated by arm), population/diagnosis, and study status/report location. FDA reviewers use this listing to confirm that every study referenced in the Clinical Overview (2.5) and Clinical Summary (2.7) is accounted for and to detect studies that are ongoing, terminated, or reported only by synopsis. Acceptability depends on completeness (all studies including terminated and ongoing), internal consistency of study numbers, and exact correspondence to the CSRs actually filed under 5.3.",
    "keyContentElements": [
      "Study identifier (protocol number) and CTD location of the report",
      "Study type/phase and primary objective for each study",
      "Study design: control type, blinding, randomization, parallel/crossover",
      "Test product(s), dosage, route, and regimen including comparators",
      "Number of subjects enrolled and treated, by treatment arm",
      "Study population and diagnosis/entry criteria",
      "Duration of treatment and study status (completed, ongoing, terminated)",
      "Type of report (full CSR, abbreviated report, synopsis)",
      "Grouping of studies by type consistent with the 5.3 organization"
    ],
    "generationPrompt": "Create the Section 5.2 Tabular Listing of All Clinical Studies for {{PRODUCT_NAME}} in {{INDICATION}}, sponsored by {{SPONSOR}}. Build a master table using the ICH M4E(R2) column set (study ID, phase/type, objective, design, test product/dose/route/regimen, N enrolled/treated by arm, population, treatment duration, status, report type, CTD location). Group rows by study category (biopharmaceutic, PK, PD, controlled efficacy/safety, uncontrolled, post-marketing) and ensure every study reconciles with the 5.3 reports and the 2.7 Clinical Summary. Include {{PHASE}} studies. Use bracketed placeholders for sponsor study numbers and subject counts; do not invent results.",
    "parentCode": "5",
    "expectedData": [
      "Master tabular listing of all clinical studies (ICH M4E recommended columns)",
      "Sub-groupings: biopharmaceutic, PK, PD, efficacy/safety, post-marketing"
    ],
    "commonPitfalls": [
      "Omitting terminated, ongoing, or bioanalytical/BE studies from the listing",
      "Study numbers or subject counts that disagree with the corresponding CSRs or ISS/ISE",
      "Failing to indicate report type (full vs. abbreviated vs. synopsis) so reviewers cannot tell what was filed",
      "Comparator/placebo arms missing from the dosing and subject-count columns",
      "Listing does not reconcile with the study inventory in the Clinical Summary (2.7)"
    ],
    "wordCountRange": [
      300,
      1200
    ],
    "dependencies": [
      "5.1",
      "5.3.1",
      "5.3.2",
      "5.3.3",
      "5.3.4",
      "5.3.5.1",
      "5.3.5.2"
    ]
  },
  "5.3.1": {
    "code": "5.3.1",
    "title": "Reports of Biopharmaceutic Studies",
    "module": 5,
    "moduleName": "Clinical",
    "required": false,
    "requiredFor": [
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Bioavailability, bioequivalence, comparative BA/BE, in vitro-in vivo correlation, and bioanalytical method reports supporting the to-be-marketed formulation.",
    "authoringGuidance": "Section 5.3.1 houses the studies that link the clinical formulation to the commercial product: absolute and relative bioavailability (BA), bioequivalence (BE) bridging formulation or manufacturing changes, food-effect, and in vitro-in vivo correlation (IVIVC) studies, plus the bioanalytical and analytical method validation reports supporting them. Reviewers in the Office of Clinical Pharmacology read this section to confirm that the formulation used in pivotal trials is bridged to the marketed product and that BE criteria (typically the 90% CI of the geometric mean ratio for Cmax and AUC within 80.00-125.00%) are met. A complete section presents each study per ICH E3 with clear formulation identity, reference/test designations, and validated assay performance. Deficiencies here frequently trigger clinical pharmacology information requests and can jeopardize a formulation bridge, so bioanalytical method validation and incurred sample reanalysis must be documented.",
    "keyContentElements": [
      "Bioavailability study reports (absolute and relative BA)",
      "Comparative BA / bioequivalence study reports bridging formulations or process changes",
      "Food-effect bioavailability study reports",
      "In vitro-in vivo correlation (IVIVC) study reports and dissolution data",
      "Bioanalytical and analytical method validation reports for each study",
      "Formulation identity and lot/batch information for test and reference products",
      "Statistical analysis of BE (geometric mean ratios and 90% confidence intervals for Cmax, AUC0-t, AUC0-inf)",
      "Cross-references to Module 3 (3.2.P) for formulation and to the 2.7.1 Summary of Biopharmaceutic Studies"
    ],
    "generationPrompt": "Author the Section 5.3.1 Reports of Biopharmaceutic Studies framework for {{PRODUCT_NAME}} ({{INDICATION}}), {{SPONSOR}}. Describe where each ICH E3-formatted report goes: absolute/relative BA, comparative BA/BE bridging the clinical to the to-be-marketed formulation, food-effect, IVIVC, and the supporting bioanalytical method validation reports. Specify the BE acceptance framework (90% CI of geometric mean ratio for Cmax and AUC within 80.00-125.00%), required formulation/lot identification, and cross-references to Module 3 and 2.7.1. Do not fabricate PK values; indicate where sponsor data belong.",
    "parentCode": "5.3",
    "expectedData": [
      "PK parameter summary tables (Cmax, Tmax, AUC0-t, AUC0-inf, t1/2)",
      "90% CI tables for BE endpoints",
      "Bioanalytical method validation summary (accuracy, precision, selectivity, stability, ISR)",
      "Dissolution profiles / f2 similarity data"
    ],
    "commonPitfalls": [
      "Missing bioanalytical method validation or incurred sample reanalysis (ISR) data",
      "Formulation used in pivotal trials not bridged to the to-be-marketed formulation",
      "BE 90% CI outside 80.00-125.00% without adequate justification",
      "Food-effect study omitted when labeling makes dosing claims relative to meals",
      "Inconsistent lot/batch identification between the CSR and Module 3"
    ],
    "wordCountRange": [
      500,
      2500
    ],
    "dependencies": [
      "5.2",
      "5.3.3"
    ]
  },
  "5.3.2": {
    "code": "5.3.2",
    "title": "Reports of Studies Pertinent to Pharmacokinetics Using Human Biomaterials",
    "module": 5,
    "moduleName": "Clinical",
    "required": false,
    "requiredFor": [
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "In vitro studies using human biomaterials (plasma protein binding, hepatic metabolism, drug-drug interaction, transporters) that inform PK interpretation.",
    "authoringGuidance": "Section 5.3.2 contains in vitro studies using human biomaterials -- plasma protein binding, hepatocyte and microsomal metabolism, CYP reaction phenotyping and inhibition/induction, and transporter (e.g., P-gp, BCRP, OATP) substrate/inhibitor assessments -- that mechanistically explain the clinical PK and predict drug-drug interaction (DDI) liability. FDA clinical pharmacology reviewers use these data, often alongside PBPK modeling, to decide which clinical DDI studies are needed and to support labeling statements on metabolism and interactions. A complete section identifies the human biomaterial source, characterizes enzyme/transporter pathways quantitatively (fraction metabolized, Ki/IC50, induction Emax), and states the decision criteria used to trigger or waive clinical studies per FDA's in vitro DDI guidance. Because these studies drive the DDI section of labeling, gaps or unjustified negative conclusions commonly generate clinical pharmacology information requests.",
    "keyContentElements": [
      "Plasma protein binding and blood-to-plasma ratio studies",
      "Hepatic metabolism studies (hepatocytes, microsomes) and metabolic stability",
      "CYP reaction phenotyping identifying enzymes responsible for metabolism",
      "CYP inhibition (reversible and time-dependent) and induction assessments with Ki/IC50/Emax",
      "Transporter substrate and inhibitor studies (P-gp, BCRP, OATP1B1/1B3, OCT, MATE, etc.)",
      "Decision criteria and cut-offs per FDA in vitro DDI guidance linking results to clinical DDI need",
      "Human biomaterial source, characterization, and assay validation",
      "Cross-references to 5.3.3 clinical DDI studies and 2.7.2 Summary of Clinical Pharmacology"
    ],
    "generationPrompt": "Draft the Section 5.3.2 framework (PK studies using human biomaterials) for {{PRODUCT_NAME}} ({{INDICATION}}), {{SPONSOR}}. Describe placement of in vitro reports: plasma protein binding, hepatic metabolism and CYP reaction phenotyping, reversible and time-dependent CYP inhibition, CYP induction, and transporter substrate/inhibitor studies. State the FDA in vitro DDI decision criteria that determine whether clinical DDI studies (in 5.3.3) are needed, and cross-reference 2.7.2. Report where sponsor-specific Ki/IC50 and fraction-metabolized values belong without inventing them.",
    "parentCode": "5.3",
    "expectedData": [
      "Enzyme kinetics tables (Km, Vmax, fraction metabolized by enzyme)",
      "Inhibition/induction parameter tables (Ki, IC50, Emax, EC50)",
      "Transporter IC50 and substrate classification tables",
      "Protein binding (fraction unbound) across concentrations"
    ],
    "commonPitfalls": [
      "In vitro DDI conclusions not linked to explicit FDA cut-off criteria (R-values, basic/mechanistic-static models)",
      "Time-dependent (mechanism-based) CYP inhibition not evaluated",
      "Transporter assessment incomplete (missing clinically relevant transporters)",
      "Negative in vitro conclusions used to waive clinical DDI studies without adequate justification",
      "Metabolite identification insufficient to trigger MIST (metabolites in safety testing) evaluation"
    ],
    "wordCountRange": [
      400,
      2000
    ],
    "dependencies": [
      "5.3.3",
      "5.2"
    ]
  },
  "5.3.3": {
    "code": "5.3.3",
    "title": "Reports of Human Pharmacokinetic (PK) Studies",
    "module": 5,
    "moduleName": "Clinical",
    "required": false,
    "requiredFor": [
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Healthy-subject and patient PK, special-population PK, DDI, and population PK studies characterizing ADME and exposure.",
    "authoringGuidance": "Section 5.3.3 presents the clinical PK evidence: single- and multiple-dose PK in healthy volunteers and patients, intrinsic-factor studies (renal and hepatic impairment, age, sex, body weight, pharmacogenetics), extrinsic-factor drug-drug interaction studies, and population PK analyses that support dosing and labeling. Reviewers use dose-proportionality, accumulation, and exposure-response linkage from this section to justify the recommended dose and any dose adjustments in impaired populations. A complete section reports each study per ICH E3 with a defined PK analysis population, validated bioanalysis, and standard parameter summaries (Cmax, Tmax, AUC, t1/2, CL/F, Vz/F), and it clearly separates dedicated studies from the population PK report. Missing organ-impairment or key DDI studies, or PK conclusions unsupported by exposure data, are frequent triggers for post-filing clinical pharmacology requests and labeling negotiation.",
    "keyContentElements": [
      "Single-dose and multiple-dose PK study reports in healthy subjects",
      "PK in the target patient population and dose-proportionality/accumulation assessment",
      "Intrinsic-factor studies: renal impairment, hepatic impairment, age, sex, weight, pharmacogenetics",
      "Extrinsic-factor clinical drug-drug interaction study reports",
      "Population PK report with model, covariate analysis, and dosing implications",
      "PK parameter summary tables and inter-subject variability",
      "Bioanalytical method validation cross-references",
      "Exposure metrics feeding exposure-response and 5.3.4 PD analyses",
      "Cross-references to 2.7.2 Summary of Clinical Pharmacology Studies"
    ],
    "generationPrompt": "Author the Section 5.3.3 Human PK Studies framework for {{PRODUCT_NAME}} ({{INDICATION}}), {{SPONSOR}}, spanning {{PHASE}} data. Describe placement of single/multiple-dose PK, patient PK with dose-proportionality, intrinsic-factor studies (renal, hepatic, age, sex, pharmacogenetics), clinical DDI studies, and the population PK report. Specify ICH E3 reporting, the standard NCA parameter set, exposure metrics feeding PD/exposure-response, and cross-references to 5.3.2 and 2.7.2. Indicate where sponsor PK values belong; do not fabricate exposures.",
    "parentCode": "5.3",
    "expectedData": [
      "Noncompartmental PK parameter tables (Cmax, Tmax, AUC0-t, AUC0-inf, t1/2, CL/F, Vz/F)",
      "Dose-proportionality and accumulation ratio tables",
      "Special-population exposure comparisons (impairment vs. normal, ratios and 90% CIs)",
      "DDI geometric mean ratio and 90% CI tables",
      "Population PK model diagnostics and covariate forest plots"
    ],
    "commonPitfalls": [
      "Renal or hepatic impairment PK study missing when systemic exposure/elimination warrants it",
      "Population PK covariate analysis not translated into dosing recommendations",
      "QT/exposure relationship not characterized (linking to a thorough QT or C-QTc analysis)",
      "Inadequate characterization of major DDIs implied by 5.3.2 in vitro findings",
      "PK analysis population and exclusions not clearly defined per study"
    ],
    "wordCountRange": [
      600,
      3000
    ],
    "dependencies": [
      "5.3.1",
      "5.3.2",
      "5.3.4",
      "5.2"
    ]
  },
  "5.3.4": {
    "code": "5.3.4",
    "title": "Reports of Human Pharmacodynamic (PD) Studies",
    "module": 5,
    "moduleName": "Clinical",
    "required": false,
    "requiredFor": [
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Human PD and PK/PD studies including mechanism/biomarker studies and the thorough QT/QTc evaluation.",
    "authoringGuidance": "Section 5.3.4 contains studies characterizing the drug's pharmacodynamics -- biomarker and mechanism-of-action studies, dose- and concentration-response, and the cardiac safety (thorough QT/QTc or concentration-QTc) evaluation per ICH E14 and the E14/S7B Q&A. Reviewers use these data to establish proof of pharmacology, support dose selection, and clear a critical safety gate (QT prolongation). A complete section links exposure to PD effect quantitatively (Emax/EC50 or exposure-response models), defines the PD analysis population, and, for the QT assessment, documents assay sensitivity (positive control), the primary time-matched analysis, and the concentration-QTc relationship. An inadequate or absent QT evaluation, or PD claims unsupported by exposure-response modeling, are common causes of clinical pharmacology deficiency letters.",
    "keyContentElements": [
      "Biomarker and mechanism-of-action PD study reports",
      "Dose-response and concentration-response (PK/PD) study reports and models",
      "Thorough QT/QTc study or concentration-QTc analysis per ICH E14",
      "Assay sensitivity documentation (positive control, e.g., moxifloxacin) for the QT study",
      "Primary and secondary PD endpoints with statistical analysis",
      "Exposure-response relationships (Emax/EC50) supporting dose selection",
      "PD analysis population definition",
      "Cross-references to 5.3.3 PK, exposure-response, and 2.7.2"
    ],
    "generationPrompt": "Draft the Section 5.3.4 Human PD Studies framework for {{PRODUCT_NAME}} ({{INDICATION}}), {{SPONSOR}}. Describe placement of biomarker/mechanism PD studies, dose- and concentration-response PK/PD reports, and the ICH E14 thorough QT or concentration-QTc analysis (including assay sensitivity and supratherapeutic coverage). Specify exposure-response modeling to support dose selection and cross-references to 5.3.3 and 2.7.2. Do not fabricate PD or QTc values; mark where sponsor data belong.",
    "parentCode": "5.3",
    "expectedData": [
      "PD endpoint summary tables by dose/concentration",
      "Concentration-QTc model output and predicted delta-QTcF at therapeutic/supratherapeutic Cmax",
      "Time-matched QTc change-from-baseline (delta-delta QTcF) tables",
      "Exposure-response model parameters and goodness-of-fit"
    ],
    "commonPitfalls": [
      "Thorough QT/concentration-QTc evaluation absent or lacking demonstrated assay sensitivity",
      "Supratherapeutic exposures not covered by the QT/PK-PD assessment",
      "PD/dose-selection claims not supported by an exposure-response model",
      "Biomarker endpoints not prospectively defined or validated",
      "PD analysis population and handling of missing PD data unclear"
    ],
    "wordCountRange": [
      400,
      2000
    ],
    "dependencies": [
      "5.3.3",
      "5.2"
    ]
  },
  "5.3.5.1": {
    "code": "5.3.5.1",
    "title": "Study Reports of Controlled Clinical Studies Pertinent to the Claimed Indication",
    "module": 5,
    "moduleName": "Clinical",
    "required": false,
    "requiredFor": [
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Full ICH E3 clinical study reports for the pivotal (and supportive) controlled trials establishing efficacy and safety for the claimed indication.",
    "authoringGuidance": "Section 5.3.5.1 holds the full ICH E3 clinical study reports for the adequate and well-controlled trials that establish substantial evidence of effectiveness for the claimed indication -- the evidentiary heart of the application under 21 CFR 314.126. Each CSR must present the pre-specified protocol and statistical analysis plan (SAP), the analysis populations (ITT/mITT, per-protocol, safety), the primary and key secondary efficacy endpoints with their prospectively defined multiplicity control, and the full safety profile. FDA statistical and clinical reviewers reconstruct the primary analysis from this section, so alignment among protocol, SAP, CSR results, and datasets is essential, and all protocol amendments and their timing relative to unblinding must be transparent. Post hoc analyses, changes to the primary endpoint after data were seen, or unaddressed missing-data/estimand issues per ICH E9(R1) are the most consequential deficiencies here.",
    "keyContentElements": [
      "Complete ICH E3-formatted CSR body for each controlled pivotal and supportive trial",
      "Final protocol, all amendments, and the pre-specified statistical analysis plan (SAP)",
      "Definition of analysis populations (ITT/mITT, per-protocol, safety)",
      "Primary efficacy endpoint result with prospectively defined multiplicity/alpha control",
      "Key secondary and exploratory endpoint results with testing hierarchy",
      "Estimand and missing-data handling per ICH E9(R1) (sensitivity analyses)",
      "Subject disposition, demographics, and baseline characteristics",
      "Full safety results (AEs, SAEs, deaths, discontinuations, labs, vitals, ECGs)",
      "Sample CRFs and individual patient data listings (or cross-reference to 5.3.7)",
      "Cross-references to 2.7.3 Summary of Clinical Efficacy and 2.7.4 Summary of Clinical Safety"
    ],
    "generationPrompt": "Author the Section 5.3.5.1 framework (controlled clinical study reports) for {{PRODUCT_NAME}} in {{INDICATION}}, {{SPONSOR}}, covering the {{PHASE}} pivotal and supportive trials. Describe the required ICH E3 CSR structure, the pre-specified protocol/SAP, analysis populations (ITT/mITT, per-protocol, safety), primary and key secondary endpoints with multiplicity control, the ICH E9(R1) estimand and missing-data strategy, subject disposition, and the full safety presentation. State the 21 CFR 314.126 adequate-and-well-controlled standard and cross-reference 2.7.3/2.7.4 and 5.3.7. Do not fabricate efficacy or safety results; use placeholders for sponsor data.",
    "parentCode": "5.3.5",
    "expectedData": [
      "CONSORT-style subject disposition flow and enrollment table",
      "Demographic and baseline characteristics table by arm",
      "Primary and secondary efficacy analysis tables (effect estimate, CI, p-value)",
      "Sensitivity/supplementary analyses for the estimand",
      "Adverse event summary tables (overall, by SOC/PT, by severity and relatedness)",
      "SAE, death, and discontinuation listings; laboratory shift tables"
    ],
    "commonPitfalls": [
      "Primary endpoint or analysis changed after unblinding without adequate justification",
      "Multiplicity/testing hierarchy not pre-specified, inflating type I error",
      "Missing-data and estimand strategy inadequate or inconsistent with ICH E9(R1)",
      "CSR results not reconcilable with submitted analysis datasets (ADaM)",
      "Protocol amendments and their timing relative to database lock not transparent",
      "Efficacy claims resting on post hoc subgroup findings"
    ],
    "wordCountRange": [
      800,
      4000
    ],
    "dependencies": [
      "5.2",
      "5.3.7",
      "5.3.5.3"
    ]
  },
  "5.3.5.2": {
    "code": "5.3.5.2",
    "title": "Study Reports of Uncontrolled Clinical Studies",
    "module": 5,
    "moduleName": "Clinical",
    "required": false,
    "requiredFor": [
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Full CSRs for open-label, single-arm, and long-term extension/safety studies that provide supportive efficacy and long-term safety exposure.",
    "authoringGuidance": "Section 5.3.5.2 contains the ICH E3 reports for uncontrolled studies -- open-label single-arm trials, long-term open-label extensions, and dedicated long-term safety studies -- that supply extended-exposure safety and supportive (not pivotal) efficacy. Reviewers rely on these studies for the duration-of-exposure data expected by ICH E1 (generally at least 100 patients exposed for 1 year and roughly 300-600 for 6 months) and for durability of effect, while recognizing that absence of a concurrent control limits efficacy inference. A complete section transparently frames efficacy findings as supportive/descriptive, fully characterizes cumulative safety and exposure, and reconciles subjects who rolled over from controlled trials to avoid double-counting in the integrated analyses. Overstating single-arm results as confirmatory, or exposure tallies that do not reconcile with the ISS, are common review issues.",
    "keyContentElements": [
      "ICH E3 CSRs for open-label single-arm and long-term extension studies",
      "Long-term safety study reports supporting ICH E1 exposure expectations",
      "Cumulative duration-of-exposure summaries (patient-years, subjects >=6 and >=12 months)",
      "Descriptive efficacy/durability results framed as supportive",
      "Rollover accounting to prevent double-counting with controlled trials",
      "Subject disposition, demographics, and discontinuation reasons",
      "Safety results with emphasis on long-term and cumulative events",
      "Cross-references to 5.3.5.3 ISS and 2.7.4 Summary of Clinical Safety"
    ],
    "generationPrompt": "Draft the Section 5.3.5.2 framework (uncontrolled clinical study reports) for {{PRODUCT_NAME}} ({{INDICATION}}), {{SPONSOR}}. Describe placement of open-label single-arm, long-term extension, and long-term safety CSRs in ICH E3 format, the ICH E1 exposure expectations they satisfy, cumulative duration-of-exposure summaries, and rollover accounting to prevent double-counting. Frame efficacy as supportive and cross-reference the 5.3.5.3 ISS and 2.7.4. Do not fabricate results; indicate where sponsor exposure and safety data belong.",
    "parentCode": "5.3.5",
    "expectedData": [
      "Duration-of-exposure tables (subjects and patient-years by interval)",
      "Subject disposition and discontinuation tables",
      "Cumulative adverse event summary tables",
      "Descriptive efficacy-over-time tables (as supportive)"
    ],
    "commonPitfalls": [
      "Presenting single-arm efficacy as confirmatory rather than supportive",
      "Exposure/patient-year totals not reconciling with the integrated safety analysis",
      "Double-counting subjects who rolled over from controlled studies",
      "Inadequate long-term exposure to meet ICH E1 expectations for chronic use",
      "Loss to follow-up and its impact on safety interpretation not addressed"
    ],
    "wordCountRange": [
      500,
      2500
    ],
    "dependencies": [
      "5.3.5.1",
      "5.3.5.3",
      "5.2"
    ]
  },
  "5.3.5.3": {
    "code": "5.3.5.3",
    "title": "Reports of Analyses of Data from More Than One Study (Integrated Summary of Safety and Integrated Summary of Efficacy)",
    "module": 5,
    "moduleName": "Clinical",
    "required": false,
    "requiredFor": [
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Pooled cross-study analyses: the Integrated Summary of Safety (ISS) and Integrated Summary of Efficacy (ISE), plus formal meta-analyses and dose-response integrations.",
    "authoringGuidance": "Section 5.3.5.3 contains the integrated cross-study analyses -- most importantly the Integrated Summary of Safety (ISS) and Integrated Summary of Efficacy (ISE), which are statutory expectations under 21 CFR 314.50(d)(5)(v)-(vi) and are analytical documents, not mere narrative summaries. The ISS pools individual patient data across the program to characterize the safety profile at a granularity impossible in any single trial: total exposure by dose and duration, common and rare adverse events, deaths and SAEs, adverse events of special interest, laboratory/vital-sign/ECG signals, and safety across demographic and intrinsic/extrinsic-factor subgroups. The ISE integrates efficacy across the adequate and well-controlled trials to demonstrate consistency of treatment effect, examine dose-response, and explore effect modification in pre-specified subgroups. Because these documents drive labeling (Sections 6 ADVERSE REACTIONS and 8 USE IN SPECIFIC POPULATIONS) and the benefit-risk conclusion, the pooling strategy is the central methodological decision: the sponsor must justify which studies are combined versus analyzed separately based on comparability of design, population, dose, and endpoint ascertainment, and define pre-specified pooling groups (e.g., all placebo-controlled comparisons, all active-controlled, all-exposure pool) with a documented rationale. Reviewers scrutinize whether pooling is prospectively defined (or at least pre-specified before unblinding of the integrated data), whether analysis populations and adverse-event coding (a single MedDRA version) are harmonized across studies, whether denominators and exposure adjustment (events per 100 patient-years) are correct given differing study durations, and whether subgroup analyses are hypothesis-generating versus confirmatory. FDA's guidance on Integrated Summaries of Effectiveness and Safety, the Premarketing Risk Assessment guidance, and ICH E9 govern the analytical approach; a defensible ISS/ISE presents an explicit study-comparability table, defined integrated populations, full exposure characterization, integrated AE analysis with crude and exposure-adjusted rates, deaths/SAEs/discontinuations, adverse events of special interest, integrated lab/vital/ECG analyses, and pre-specified subgroup forest plots, plus, where appropriate, a formal meta-analysis with a stated fixed/random-effects model and heterogeneity (I2) assessment.",
    "keyContentElements": [
      "Pre-specified pooling strategy with rationale and a study-comparability table (design, population, dose, duration, endpoints)",
      "Defined integrated analysis populations (integrated safety/all-treated; integrated efficacy/ITT) mapped from each study",
      "Total exposure characterization by dose and duration (subjects and patient-years) supporting ICH E1",
      "Integrated adverse-event analysis by MedDRA SOC/PT with crude incidence and exposure-adjusted rates (per 100 patient-years)",
      "Deaths, serious adverse events, and discontinuations due to AEs across the pool",
      "Adverse events of special interest and integrated laboratory, vital-sign, and ECG analyses (shifts, outliers)",
      "Safety and efficacy in pre-specified subgroups (age/geriatric, sex, race, region, renal/hepatic impairment, weight, concomitant meds) with forest plots",
      "Integrated efficacy: consistency of effect across studies and subgroups and dose-response integration",
      "Formal meta-analysis where appropriate with model (fixed/random effects) and heterogeneity (I2) assessment",
      "A single harmonized MedDRA version and consistent coding conventions across pooled studies",
      "Cross-references to 2.7.3 Summary of Clinical Efficacy, 2.7.4 Summary of Clinical Safety, and labeling Sections 6 and 8"
    ],
    "generationPrompt": "Author the Section 5.3.5.3 framework covering the Integrated Summary of Safety (ISS) and Integrated Summary of Efficacy (ISE) for {{PRODUCT_NAME}} in {{INDICATION}}, {{SPONSOR}}, integrating the {{PHASE}} program. Specify: a pre-specified pooling strategy with a study-comparability table and rationale for each included/excluded study; the integrated safety (all-treated) and integrated efficacy (ITT) populations and how each study maps in; total exposure by dose and duration in subjects and patient-years (ICH E1); integrated adverse-event analysis by MedDRA SOC/PT with crude and exposure-adjusted (per 100 patient-years) rates; deaths/SAEs/discontinuations; adverse events of special interest and integrated lab/vital/ECG analyses; pre-specified subgroup analyses (geriatric, sex, race, region, renal/hepatic impairment, weight, concomitant meds) with forest plots; integrated efficacy consistency and dose-response, plus meta-analysis with fixed/random-effects model and I2 where appropriate. Cite 21 CFR 314.50(d)(5)(v)-(vi), FDA guidance on Integrated Summaries of Effectiveness and Safety, and ICH E9. Cross-reference 2.7.3/2.7.4 and labeling Sections 6 and 8. Do not fabricate rates or effect sizes; use placeholders for sponsor data.",
    "parentCode": "5.3.5",
    "expectedData": [
      "Study-comparability / pooling-strategy table across all included studies",
      "Integrated exposure tables by dose and duration (N and patient-years)",
      "Integrated adverse-event tables by SOC/PT: crude incidence and exposure-adjusted rates by treatment group",
      "Deaths, SAE, and AE-related-discontinuation tables across the pool",
      "Adverse-events-of-special-interest tables and integrated laboratory shift/outlier tables",
      "Subgroup forest plots for key safety and efficacy endpoints",
      "Meta-analysis effect estimates with confidence intervals and heterogeneity statistics"
    ],
    "commonPitfalls": [
      "Pooling dissimilar studies (different populations, doses, or endpoint ascertainment) without documented justification",
      "Pooling strategy not pre-specified, allowing selection of favorable groupings after seeing data",
      "Crude AE incidence used across studies of very different duration without exposure adjustment (per patient-year)",
      "Inconsistent MedDRA versions across pooled studies producing miscoded/duplicated preferred terms",
      "Exploratory subgroup findings presented as confirmatory (multiplicity not controlled)",
      "Integrated denominators/exposure not reconciling with individual CSRs and the 5.2 listing",
      "Geriatric, renal/hepatic-impairment, or sex/race subgroups omitted, weakening labeling Sections 8 and 6"
    ],
    "wordCountRange": [
      1500,
      6000
    ],
    "dependencies": [
      "5.3.5.1",
      "5.3.5.2",
      "5.3.3",
      "5.2",
      "5.3.7"
    ]
  },
  "5.3.5.4": {
    "code": "5.3.5.4",
    "title": "Other Clinical Study Reports",
    "module": 5,
    "moduleName": "Clinical",
    "required": false,
    "requiredFor": [
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "CSRs and interim/analytic reports that do not fit prior categories: ongoing-study interims, controlled studies not for the claimed indication, and published-only studies.",
    "authoringGuidance": "Section 5.3.5.4 is the placement for clinical study reports that do not fit the controlled/uncontrolled-for-the-indication categories: interim analyses of ongoing studies, reports of controlled studies conducted for a different indication or dose, comparative-effectiveness or patient-reported-outcome sub-studies, and studies available only as publications. Reviewers use this section to obtain a complete picture of the clinical program and to detect relevant safety information arising outside the pivotal trials. A complete section provides each report at the appropriate level (full CSR, abbreviated report, or synopsis with justification per ICH E3) and clearly states why the study sits here rather than in 5.3.5.1/5.3.5.2. Safety data from these studies must still feed the integrated safety analysis; omitting relevant ongoing-study safety is a common gap.",
    "keyContentElements": [
      "Interim analysis reports for ongoing studies with a defined data cut-off",
      "Controlled studies conducted for other indications, populations, or doses",
      "Comparative-effectiveness, PRO, or health-outcomes sub-study reports",
      "Studies available only as published literature (with full citation)",
      "Justification for report level (full CSR vs. abbreviated vs. synopsis) per ICH E3",
      "Rationale for placement in 5.3.5.4 rather than 5.3.5.1/5.3.5.2",
      "Contribution of these studies' safety data to the integrated analysis (5.3.5.3)",
      "Cross-references to 5.4 Literature References for publication-only studies"
    ],
    "generationPrompt": "Draft the Section 5.3.5.4 framework (other clinical study reports) for {{PRODUCT_NAME}} ({{INDICATION}}), {{SPONSOR}}. Describe placement of ongoing-study interim analyses, controlled studies for other indications/doses, PRO/comparative-effectiveness sub-studies, and publication-only studies, with ICH E3 justification for report level and rationale for placement here. Explain how their safety data feed the 5.3.5.3 ISS and cross-reference 5.4. Do not fabricate results; mark where sponsor data belong.",
    "parentCode": "5.3.5",
    "expectedData": [
      "Interim analysis result tables with data cut-off dates",
      "Study-level summary table for other-category studies (design, N, status)"
    ],
    "commonPitfalls": [
      "Relevant safety data from ongoing/other-indication studies not carried into the ISS",
      "Abbreviated reports or synopses used without ICH E3 justification",
      "Interim analyses lacking clear data cut-off dates and blinding status",
      "Publication-only studies not cross-referenced in 5.4"
    ],
    "wordCountRange": [
      300,
      1500
    ],
    "dependencies": [
      "5.3.5.3",
      "5.4",
      "5.2"
    ]
  },
  "5.3.6": {
    "code": "5.3.6",
    "title": "Reports of Post-Marketing Experience",
    "module": 5,
    "moduleName": "Clinical",
    "required": false,
    "requiredFor": [
      "NDA",
      "BLA"
    ],
    "contentType": "mixed",
    "guidance": "Cumulative worldwide post-marketing safety experience for products already marketed anywhere, including PSUR/PBRER-derived data and regulatory actions.",
    "authoringGuidance": "Section 5.3.6 applies when the product is already marketed in any country and presents the cumulative worldwide post-marketing safety experience: estimated exposure, serious and non-serious adverse reaction data, adverse events of special interest, and any regulatory actions taken for safety (withdrawals, restrictions, label changes). Reviewers use this real-world experience to corroborate the clinical-trial safety profile and to surface rare events not detectable in the trial population. A complete section draws on the periodic safety reports (PSUR/PBRER per ICH E2C(R2)) and clearly states data lock points, exposure-estimation methodology, and the signal-evaluation conclusions. For products with no marketing experience, the section states that explicitly rather than being omitted; incomplete exposure estimates or unreconciled serious events versus the clinical safety database are common deficiencies.",
    "keyContentElements": [
      "Countries where marketed, approval dates, and marketed indications/formulations",
      "Estimated cumulative patient exposure and the estimation methodology",
      "Serious and non-serious post-marketing adverse reaction summaries (cumulative and interval)",
      "Adverse events of special interest and signal evaluation outcomes",
      "Regulatory actions taken for safety reasons (withdrawals, restrictions, label changes)",
      "Data lock points and reference to PSUR/PBRER per ICH E2C(R2)",
      "Reconciliation of post-marketing serious events with the clinical safety database",
      "Explicit statement when there is no marketing experience"
    ],
    "generationPrompt": "Author the Section 5.3.6 framework (post-marketing experience) for {{PRODUCT_NAME}} ({{INDICATION}}), {{SPONSOR}}. Describe placement of worldwide marketing status, cumulative exposure estimates with methodology, serious/non-serious post-marketing adverse reaction summaries drawn from PSUR/PBRER (ICH E2C(R2)), adverse events of special interest and signal evaluations, and safety-related regulatory actions. State the requirement to reconcile with the clinical safety database and to include an explicit 'no marketing experience' statement when applicable. Do not fabricate exposure or event data; use placeholders.",
    "parentCode": "5.3",
    "expectedData": [
      "Cumulative exposure estimate table by region/time",
      "Post-marketing adverse reaction tables by MedDRA SOC/PT (serious/non-serious)",
      "Listing of safety-related regulatory actions with dates"
    ],
    "commonPitfalls": [
      "Exposure estimates unsupported by a stated methodology",
      "Serious post-marketing events not reconciled with the trial safety database or ISS",
      "Omitting the section (or its 'not applicable' statement) for products with no marketing history",
      "Missing or outdated safety-related regulatory actions from other regions",
      "Signal evaluations stated as conclusions without supporting cumulative data"
    ],
    "wordCountRange": [
      300,
      1800
    ],
    "dependencies": [
      "5.3.5.3",
      "5.2"
    ]
  },
  "5.3.7": {
    "code": "5.3.7",
    "title": "Case Report Forms and Individual Patient Listings",
    "module": 5,
    "moduleName": "Clinical",
    "required": false,
    "requiredFor": [
      "NDA",
      "BLA"
    ],
    "contentType": "data",
    "guidance": "Sample CRFs and the individual patient data listings appended to each study report, per ICH E3 appendices.",
    "authoringGuidance": "Section 5.3.7 contains the case report forms and individual patient data listings that support the study reports, organized as ICH E3 appendices (16.3 and 16.4): a blank/annotated sample CRF per study, plus CRFs for deaths, serious adverse events, and dropouts, and the individual patient efficacy and safety listings. Reviewers and inspectors use these to verify that summary tables in the CSRs and ISS/ISE trace to source-level records and to conduct data integrity checks. A complete section provides the annotated CRF mapped to dataset variables and the required patient-level listings, organized so a reviewer can locate any subject cited in the analyses. Missing death/SAE narratives or CRFs, or listings that cannot be reconciled to the analysis datasets, are frequent audit and information-request triggers.",
    "keyContentElements": [
      "Blank/annotated sample case report form for each study (ICH E3 Appendix 16.1.2)",
      "CRFs for deaths, serious adverse events, and discontinuations due to AEs (Appendix 16.3)",
      "Individual patient data listings, efficacy and safety (Appendix 16.4)",
      "Patient narratives for deaths, other SAEs, and clinically significant events (Appendix 16.3)",
      "Annotation mapping CRF fields to dataset (SDTM/ADaM) variables",
      "Organization allowing traceability from summary tables to individual subjects",
      "Cross-references from each CSR in 5.3.5 to its listings"
    ],
    "generationPrompt": "Draft the Section 5.3.7 framework (case report forms and individual patient listings) for {{PRODUCT_NAME}} ({{INDICATION}}), {{SPONSOR}}. Describe the ICH E3 appendix content required per study: annotated sample CRF (16.1.2), CRFs and narratives for deaths/SAEs/dropouts (16.3), and individual patient efficacy and safety listings (16.4), with CRF-to-dataset (SDTM/ADaM) annotation and traceability from summary tables to subjects. Cross-reference the 5.3.5 CSRs. Do not fabricate patient data; describe structure and placement only.",
    "parentCode": "5.3",
    "expectedData": [
      "Individual subject efficacy listings",
      "Individual subject safety/adverse-event listings",
      "Death, SAE, and dropout CRF sets",
      "Annotated CRF with variable mapping"
    ],
    "commonPitfalls": [
      "Death/SAE CRFs or patient narratives missing for cited subjects",
      "Patient listings not reconcilable with analysis datasets or summary tables",
      "Sample CRF not annotated / not mapped to dataset variables",
      "Incomplete listings for discontinued subjects, obscuring dropout patterns"
    ],
    "wordCountRange": [
      150,
      800
    ],
    "dependencies": [
      "5.3.5.1",
      "5.3.5.2"
    ]
  },
  "5.4": {
    "code": "5.4",
    "title": "Literature References",
    "module": 5,
    "moduleName": "Clinical",
    "required": true,
    "requiredFor": [
      "IND",
      "NDA",
      "BLA"
    ],
    "contentType": "list",
    "guidance": "Full-text copies of published literature cited anywhere in the clinical documentation, provided per ICH M4 and 21 CFR expectations.",
    "authoringGuidance": "Section 5.4 provides copies of the published literature references cited throughout Module 5 and the Module 2 clinical summaries, supplied as full-text articles per ICH M4 organization. Reviewers use this section to verify that literature-based safety, efficacy, mechanism, or class-effect claims are accurately represented and traceable to their sources. A complete section includes every reference cited in the clinical documents, presented as full-text copies (with translations where required) in a consistent citation style and cross-linked to the citing text. References cited but not provided, or provided but never cited, and reliance on abstracts where the full paper is available, are recurring completeness issues.",
    "keyContentElements": [
      "Full-text copies of every publication cited in Module 5 and Module 2 clinical summaries",
      "Consistent, complete citations (authors, title, journal, year, volume, pages, DOI)",
      "English translations of non-English references where required",
      "Cross-linking between each reference and its citing location",
      "Coverage of literature supporting mechanism, class effects, efficacy, and safety claims",
      "Copyright/permissions handling for reproduced articles",
      "Reconciliation so every cited reference is provided and every provided reference is cited"
    ],
    "generationPrompt": "Author the Section 5.4 Literature References framework for {{PRODUCT_NAME}} ({{INDICATION}}), {{SPONSOR}}. Describe the requirement to provide full-text copies of every publication cited in Module 5 and the Module 2 clinical summaries, with consistent complete citations, translations where required, copyright handling, and cross-linking to citing text, plus reconciliation that all cited references are provided and all provided references are cited. Note relevance for IND (prior human experience) as well as NDA/BLA. Do not fabricate citations; describe structure and standards only.",
    "parentCode": "5",
    "expectedData": [
      "Numbered reference list mapped to citing sections"
    ],
    "commonPitfalls": [
      "References cited in the text but not provided (or vice versa)",
      "Reliance on abstracts when full-text publications are available",
      "Missing translations for non-English references",
      "Inconsistent or incomplete citation details preventing source verification"
    ],
    "wordCountRange": [
      100,
      600
    ],
    "dependencies": [
      "5.3.5.1",
      "5.3.5.3",
      "5.3.5.4"
    ]
  }
};

export default CTD_AUTHORING_GUIDANCE;
