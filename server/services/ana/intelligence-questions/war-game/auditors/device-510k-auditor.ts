/**
 * Device 510(k) War Game Auditor
 *
 * Simulates an FDA CDRH reviewer scrutinizing a 510(k) premarket
 * notification for substantial equivalence. Rules reference 21 CFR 807,
 * 21 CFR 820, ISO 10993, IEC 62304, and applicable FDA guidance documents.
 *
 * @module server/services/ana/intelligence-questions/war-game/auditors/device-510k-auditor
 */

import type { WarGameAuditor, AuditRule, WarGameFinding, AuditDimension } from '../types.js';

const rid = (suffix: string) => 'device510k_' + suffix;

/* ------------------------------------------------------------------ */
/*  Helper predicates                                                  */
/* ------------------------------------------------------------------ */

const isBlank = (v: unknown): boolean =>
  v === undefined || v === null || (typeof v === 'string' && v.trim().length === 0);

const isTooShort = (v: unknown, min: number): boolean =>
  typeof v === 'string' && v.trim().length > 0 && v.trim().length < min;

/* ------------------------------------------------------------------ */
/*  Rules                                                              */
/* ------------------------------------------------------------------ */

const rules: AuditRule[] = [
  /* ── 1. Device name ─────────────────────────────────────────────── */
  {
    id: rid('device_name_missing'),
    dimension: 'completeness',
    title: 'Device Trade/Proprietary Name Missing',
    question:
      'Per 21 CFR 807.87(a), the 510(k) submission must identify the device by its trade or proprietary name. Has the submitter provided the device name?',
    check: (a) => {
      if (isBlank(a.device_name)) {
        return {
          id: rid('device_name_missing'),
          dimension: 'completeness',
          severity: 'critical',
          title: 'Device Trade/Proprietary Name Missing',
          question:
            'Per 21 CFR 807.87(a), the 510(k) submission must identify the device by its trade or proprietary name. Has the submitter provided the device name?',
          observation: 'No device trade or proprietary name was provided in the submission.',
          requirement:
            '21 CFR 807.87(a) requires identification of the device, including its trade or proprietary name.',
          reference: '21 CFR 807.87(a); FDA Refuse to Accept Checklist for 510(k) Submissions',
          recommendation:
            'Provide the exact trade/proprietary name under which the device will be marketed. This is a mandatory field and its absence will trigger an RTA (Refuse to Accept) determination.',
          relatedFields: ['device_name'],
        };
      }
      return null;
    },
  },

  /* ── 2. Device classification ───────────────────────────────────── */
  {
    id: rid('device_class_missing'),
    dimension: 'regulatory_alignment',
    title: 'Device Classification Not Specified',
    question:
      'Under 21 CFR 807.87(b), the submitter must state the classification of the device (Class I, II, or III). Has the device class been declared?',
    check: (a) => {
      if (isBlank(a.device_class)) {
        return {
          id: rid('device_class_missing'),
          dimension: 'regulatory_alignment',
          severity: 'critical',
          title: 'Device Classification Not Specified',
          question:
            'Under 21 CFR 807.87(b), the submitter must state the classification of the device (Class I, II, or III). Has the device class been declared?',
          observation: 'The device classification (Class I, II, or III) was not specified.',
          requirement:
            'The 510(k) must identify the device classification per 21 CFR 807.87(b). Most 510(k)-eligible devices are Class II.',
          reference: '21 CFR 807.87(b); 21 CFR Part 860 — Medical Device Classification Procedures',
          recommendation:
            'State the device class explicitly and confirm it is consistent with the product code and regulation number cited.',
          relatedFields: ['device_class', 'product_code', 'regulation_number'],
        };
      }
      return null;
    },
  },

  /* ── 3. Product code ────────────────────────────────────────────── */
  {
    id: rid('product_code_missing'),
    dimension: 'completeness',
    title: 'Product Code Not Provided',
    question:
      'FDA uses three-letter product codes to identify the generic category of a device and route submissions to the correct review division. Has the submitter identified the product code?',
    check: (a) => {
      if (isBlank(a.product_code)) {
        return {
          id: rid('product_code_missing'),
          dimension: 'completeness',
          severity: 'warning',
          title: 'Product Code Not Provided',
          question:
            'FDA uses three-letter product codes to identify the generic category of a device and route submissions to the correct review division. Has the submitter identified the product code?',
          observation: 'No product code was supplied for the device.',
          requirement:
            'The product code must be provided and must match the classification regulation cited. FDA relies on this code to route the submission to the correct review division.',
          reference: '21 CFR 807.87(b); FDA Product Classification Database',
          recommendation:
            'Look up the appropriate product code in the FDA Product Classification Database and include it. Verify the product code corresponds to the regulation number and device class stated.',
          relatedFields: ['product_code', 'regulation_number', 'device_class'],
        };
      }
      return null;
    },
  },

  /* ── 4. Regulation number ───────────────────────────────────────── */
  {
    id: rid('regulation_number_missing'),
    dimension: 'regulatory_alignment',
    title: '21 CFR Classification Regulation Number Missing',
    question:
      'Each medical device regulated by FDA is classified under a specific regulation in 21 CFR Parts 862-892. Has the submitter identified the applicable classification regulation number?',
    check: (a) => {
      if (isBlank(a.regulation_number)) {
        return {
          id: rid('regulation_number_missing'),
          dimension: 'regulatory_alignment',
          severity: 'warning',
          title: '21 CFR Classification Regulation Number Missing',
          question:
            'Each medical device regulated by FDA is classified under a specific regulation in 21 CFR Parts 862-892. Has the submitter identified the applicable classification regulation number?',
          observation:
            'The 21 CFR classification regulation number was not provided.',
          requirement:
            'The 510(k) must cite the specific classification regulation number (e.g., 21 CFR 878.4200) that governs the device. This determines the regulatory requirements and any special controls that apply.',
          reference: '21 CFR 807.87(b); 21 CFR Parts 862-892',
          recommendation:
            'Identify the correct 21 CFR classification regulation number. Cross-reference with the product code to ensure consistency. If special controls apply, confirm they have been addressed.',
          relatedFields: ['regulation_number', 'product_code', 'device_class'],
        };
      }
      return null;
    },
  },

  /* ── 5. Predicate device identification ─────────────────────────── */
  {
    id: rid('predicate_device_missing'),
    dimension: 'regulatory_alignment',
    title: 'Predicate Device Not Identified',
    question:
      'Per 21 CFR 807.87(f), the submitter must identify the predicate device to which substantial equivalence is claimed. Without a named predicate, the 510(k) pathway cannot proceed. Has a predicate device been specified?',
    check: (a) => {
      if (isBlank(a.predicate_device)) {
        return {
          id: rid('predicate_device_missing'),
          dimension: 'regulatory_alignment',
          severity: 'critical',
          title: 'Predicate Device Not Identified',
          question:
            'Per 21 CFR 807.87(f), the submitter must identify the predicate device to which substantial equivalence is claimed. Without a named predicate, the 510(k) pathway cannot proceed. Has a predicate device been specified?',
          observation: 'No predicate device was identified in the submission.',
          requirement:
            'A 510(k) submission must name the specific legally marketed predicate device and provide evidence of substantial equivalence (21 CFR 807.87(f)).',
          reference: '21 CFR 807.87(f); FDA Guidance: The 510(k) Program — Evaluating Substantial Equivalence (2014)',
          recommendation:
            'Identify the predicate device by trade name, manufacturer, and 510(k) clearance number. Select a predicate with the same intended use and similar technological characteristics.',
          relatedFields: ['predicate_device', 'predicate_510k_number'],
        };
      }
      return null;
    },
  },

  /* ── 6. Predicate 510(k) number ─────────────────────────────────── */
  {
    id: rid('predicate_510k_number_missing'),
    dimension: 'completeness',
    title: 'Predicate 510(k) Clearance Number Missing',
    question:
      'CDRH requires the 510(k) clearance number (e.g., K######) for the predicate device to verify its legal marketing status in the FDA database. Has this been provided?',
    check: (a) => {
      if (!isBlank(a.predicate_device) && isBlank(a.predicate_510k_number)) {
        return {
          id: rid('predicate_510k_number_missing'),
          dimension: 'completeness',
          severity: 'warning',
          title: 'Predicate 510(k) Clearance Number Missing',
          question:
            'CDRH requires the 510(k) clearance number (e.g., K######) for the predicate device to verify its legal marketing status in the FDA database. Has this been provided?',
          observation:
            'A predicate device was named but its 510(k) clearance number was not provided.',
          requirement:
            'The predicate 510(k) clearance number is necessary to confirm the device is legally marketed and to verify the cleared intended use.',
          reference: '21 CFR 807.87(f); FDA 510(k) Refuse to Accept Checklist',
          recommendation:
            'Provide the predicate device 510(k) number (K-number). Verify it in the FDA 510(k) Premarket Notification Database to confirm current legal marketing status.',
          relatedFields: ['predicate_510k_number', 'predicate_device'],
        };
      }
      return null;
    },
  },

  /* ── 7. Intended use statement ──────────────────────────────────── */
  {
    id: rid('intended_use_missing'),
    dimension: 'regulatory_alignment',
    title: 'Intended Use Statement Missing',
    question:
      'Per 21 CFR 807.87(e), the submitter must provide a statement of the intended use of the device. The intended use is the cornerstone of the SE determination. Has it been clearly articulated?',
    check: (a) => {
      if (isBlank(a.intended_use)) {
        return {
          id: rid('intended_use_missing'),
          dimension: 'regulatory_alignment',
          severity: 'critical',
          title: 'Intended Use Statement Missing',
          question:
            'Per 21 CFR 807.87(e), the submitter must provide a statement of the intended use of the device. The intended use is the cornerstone of the SE determination. Has it been clearly articulated?',
          observation: 'No intended use statement was provided.',
          requirement:
            'The intended use must match or be within the scope of the predicate device intended use per 21 CFR 807.87(e). It forms the basis for the substantial equivalence determination.',
          reference:
            '21 CFR 807.87(e); FDA Guidance: The 510(k) Program — Evaluating Substantial Equivalence (2014)',
          recommendation:
            'Draft a clear intended use statement. If the intended use differs from the predicate, explain how the differences do not constitute a new intended use per FDA guidance.',
          relatedFields: ['intended_use', 'indications_for_use', 'predicate_device'],
        };
      }
      return null;
    },
  },

  /* ── 8. Indications for use adequacy ────────────────────────────── */
  {
    id: rid('indications_for_use_inadequate'),
    dimension: 'completeness',
    title: 'Indications for Use Insufficiently Detailed',
    question:
      'FDA Form 3881 requires a clear statement of indications for use specifying the target patient population, medical condition, and clinical context. Does the current statement meet this standard?',
    check: (a) => {
      if (isBlank(a.indications_for_use) || isTooShort(a.indications_for_use, 50)) {
        return {
          id: rid('indications_for_use_inadequate'),
          dimension: 'completeness',
          severity: 'warning',
          title: 'Indications for Use Insufficiently Detailed',
          question:
            'FDA Form 3881 requires a clear statement of indications for use specifying the target patient population, medical condition, and clinical context. Does the current statement meet this standard?',
          observation:
            'The indications for use statement is missing or too brief to adequately describe the clinical context, target population, and conditions of use.',
          requirement:
            'The indications for use statement (FDA Form 3881) must specify the disease/condition, patient population, part of the body or type of tissue involved, frequency of use, and clinical setting.',
          reference:
            'FDA Form 3881; FDA Guidance: Device Labeling Guidance — Indications for Use Section',
          recommendation:
            'Expand the indications for use to include: (1) target patient population; (2) specific disease or condition; (3) anatomical site if applicable; (4) clinical setting (prescription use vs. OTC); (5) whether the device is intended for diagnosis, treatment, monitoring, or other.',
          relatedFields: ['indications_for_use', 'intended_use'],
        };
      }
      return null;
    },
  },

  /* ── 9. Substantial equivalence rationale — presence ────────────── */
  {
    id: rid('se_rationale_missing'),
    dimension: 'scientific_rigor',
    title: 'Substantial Equivalence Rationale Absent',
    question:
      'The substantial equivalence determination under FD&C Act Section 513(i) is the central question of every 510(k). Has the submitter articulated a rationale comparing intended use and technological characteristics to the predicate?',
    check: (a) => {
      if (isBlank(a.substantial_equivalence_rationale)) {
        return {
          id: rid('se_rationale_missing'),
          dimension: 'scientific_rigor',
          severity: 'critical',
          title: 'Substantial Equivalence Rationale Absent',
          question:
            'The substantial equivalence determination under FD&C Act Section 513(i) is the central question of every 510(k). Has the submitter articulated a rationale comparing intended use and technological characteristics to the predicate?',
          observation:
            'No substantial equivalence rationale was provided. This is the most critical element of a 510(k) submission.',
          requirement:
            'Per 21 CFR 807.87(f) and FD&C Act Section 513(i), the submitter must demonstrate that the new device has the same intended use as the predicate and that it is either: (a) the same technologically, or (b) different technologically but equally safe and effective.',
          reference:
            '21 CFR 807.87(f); FD&C Act Section 513(i); FDA Guidance: The 510(k) Program — Evaluating Substantial Equivalence (2014)',
          recommendation:
            'Develop a structured SE comparison covering: (1) intended use comparison; (2) technological characteristics comparison; (3) performance data demonstrating equivalent safety and effectiveness if technological differences exist.',
          relatedFields: [
            'substantial_equivalence_rationale',
            'intended_use',
            'technological_characteristics',
            'predicate_device',
          ],
        };
      }
      return null;
    },
  },

  /* ── 10. Substantial equivalence rationale — depth ──────────────── */
  {
    id: rid('se_rationale_shallow'),
    dimension: 'scientific_rigor',
    title: 'Substantial Equivalence Rationale Lacks Sufficient Detail',
    question:
      'CDRH reviewers expect a detailed side-by-side comparison table of the subject and predicate devices covering intended use, design, materials, energy source, and performance. Is the rationale sufficiently detailed to support an SE determination?',
    check: (a) => {
      if (!isBlank(a.substantial_equivalence_rationale) && isTooShort(a.substantial_equivalence_rationale, 200)) {
        return {
          id: rid('se_rationale_shallow'),
          dimension: 'scientific_rigor',
          severity: 'warning',
          title: 'Substantial Equivalence Rationale Lacks Sufficient Detail',
          question:
            'CDRH reviewers expect a detailed side-by-side comparison table of the subject and predicate devices covering intended use, design, materials, energy source, and performance. Is the rationale sufficiently detailed to support an SE determination?',
          observation:
            'The substantial equivalence rationale is present but appears too brief to constitute a rigorous comparison.',
          requirement:
            'The SE determination must include a detailed comparison addressing: identical or related intended use, technological characteristics (design, materials, energy type), and performance data where differences exist.',
          reference:
            'FDA Guidance: The 510(k) Program — Evaluating Substantial Equivalence (2014); FDA Guidance: Format for Traditional and Abbreviated 510(k)s',
          recommendation:
            'Include a side-by-side comparison table. For each technological difference identified, describe the testing performed to demonstrate that the difference does not raise new questions of safety and effectiveness.',
          relatedFields: ['substantial_equivalence_rationale', 'technological_characteristics', 'performance_data_type'],
        };
      }
      return null;
    },
  },

  /* ── 11. Technological characteristics ──────────────────────────── */
  {
    id: rid('tech_characteristics_missing'),
    dimension: 'completeness',
    title: 'Technological Characteristics Not Described',
    question:
      'Per 21 CFR 807.87(f), a 510(k) must include a description of the device\'s technological characteristics — materials, design features, energy source, and principles of operation. Have these been documented?',
    check: (a) => {
      if (isBlank(a.technological_characteristics)) {
        return {
          id: rid('tech_characteristics_missing'),
          dimension: 'completeness',
          severity: 'critical',
          title: 'Technological Characteristics Not Described',
          question:
            'Per 21 CFR 807.87(f), a 510(k) must include a description of the device\'s technological characteristics — materials, design features, energy source, and principles of operation. Have these been documented?',
          observation:
            'No description of technological characteristics was provided.',
          requirement:
            'The submitter must describe the design, materials, energy source, and mechanism of action. These are compared against the predicate to evaluate whether differences raise new safety or effectiveness questions.',
          reference: '21 CFR 807.87(f); FDA Guidance: Deciding When to Submit a 510(k) for a Change to an Existing Device',
          recommendation:
            'Provide a comprehensive description of the device technological characteristics including: design architecture, materials of construction, dimensions, energy type/source, and principles of operation.',
          relatedFields: ['technological_characteristics', 'device_description', 'materials_of_construction'],
        };
      }
      return null;
    },
  },

  /* ── 12. Device description ─────────────────────────────────────── */
  {
    id: rid('device_description_missing'),
    dimension: 'completeness',
    title: 'Device Description Missing',
    question:
      'A complete device description is required under 21 CFR 807.87(e), including sufficient detail for the reviewer to understand how the device works, its components, and patient interface. Has a comprehensive description been provided?',
    check: (a) => {
      if (isBlank(a.device_description)) {
        return {
          id: rid('device_description_missing'),
          dimension: 'completeness',
          severity: 'warning',
          title: 'Device Description Missing',
          question:
            'A complete device description is required under 21 CFR 807.87(e), including sufficient detail for the reviewer to understand how the device works, its components, and patient interface. Has a comprehensive description been provided?',
          observation:
            'No device description was provided. CDRH expects a narrative description accompanied by diagrams, photographs, or engineering drawings.',
          requirement:
            'The device description must be sufficient for the reviewer to understand how the device works, its components, and how it interfaces with the patient or user.',
          reference: '21 CFR 807.87(e); FDA Guidance: Format for Traditional and Abbreviated 510(k)s',
          recommendation:
            'Include a detailed device description covering: physical description, component list, accessories, operational overview, and diagrams or photographs.',
          relatedFields: ['device_description', 'technological_characteristics'],
        };
      }
      return null;
    },
  },

  /* ── 13. Performance testing ────────────────────────────────────── */
  {
    id: rid('performance_data_missing'),
    dimension: 'scientific_rigor',
    title: 'Performance Testing Data Type Not Specified',
    question:
      'When technological differences exist between the subject and predicate devices, performance data is required under 21 CFR 807.87(f) to demonstrate those differences do not raise new questions of safety or effectiveness. Has the type of performance data been identified?',
    check: (a) => {
      if (isBlank(a.performance_data_type)) {
        return {
          id: rid('performance_data_missing'),
          dimension: 'scientific_rigor',
          severity: 'warning',
          title: 'Performance Testing Data Type Not Specified',
          question:
            'When technological differences exist between the subject and predicate devices, performance data is required under 21 CFR 807.87(f) to demonstrate those differences do not raise new questions of safety or effectiveness. Has the type of performance data been identified?',
          observation:
            'No performance testing data type was indicated. If there are technological differences from the predicate, bench, animal, or clinical data may be required.',
          requirement:
            'Performance testing must be sufficient to support the SE determination. The type of data depends on the nature of the differences: bench testing, biocompatibility, animal studies, or clinical data.',
          reference:
            'FDA Guidance: The 510(k) Program — Evaluating Substantial Equivalence (2014); 21 CFR 807.87(f)',
          recommendation:
            'Identify the types of performance testing conducted (e.g., bench testing, biocompatibility, software verification/validation, electrical safety, clinical studies). Provide a summary of results with pass/fail conclusions.',
          relatedFields: ['performance_data_type', 'nonclinical_testing_summary', 'clinical_data_summary'],
        };
      }
      return null;
    },
  },

  /* ── 14. Biocompatibility ───────────────────────────────────────── */
  {
    id: rid('biocompatibility_missing'),
    dimension: 'scientific_rigor',
    title: 'Biocompatibility Testing Not Addressed',
    question:
      'Per FDA guidance on the use of ISO 10993-1, any device with direct or indirect patient contact requires a biological evaluation. The evaluation must consider the nature, degree, frequency, and duration of body contact. Has biocompatibility been addressed?',
    check: (a) => {
      if (isBlank(a.biocompatibility_testing)) {
        return {
          id: rid('biocompatibility_missing'),
          dimension: 'scientific_rigor',
          severity: 'warning',
          title: 'Biocompatibility Testing Not Addressed',
          question:
            'Per FDA guidance on the use of ISO 10993-1, any device with direct or indirect patient contact requires a biological evaluation. The evaluation must consider the nature, degree, frequency, and duration of body contact. Has biocompatibility been addressed?',
          observation:
            'No biocompatibility testing information was provided. For patient-contacting devices, this is a significant gap.',
          requirement:
            'Biocompatibility must be evaluated per ISO 10993-1 based on the nature and duration of body contact. Endpoints may include cytotoxicity, sensitization, irritation, systemic toxicity, and others depending on contact category.',
          reference:
            'ISO 10993-1:2018; FDA Guidance: Use of International Standard ISO 10993-1 — Biological Evaluation of Medical Devices (2020)',
          recommendation:
            'Perform a biocompatibility risk assessment per ISO 10993-1. Identify the body contact type (surface, external communicating, or implant) and duration (limited, prolonged, or permanent). Conduct required biological evaluations or justify use of existing data.',
          relatedFields: ['biocompatibility_testing', 'materials_of_construction'],
        };
      }
      return null;
    },
  },

  /* ── 15. Sterilization validation ───────────────────────────────── */
  {
    id: rid('sterilization_missing'),
    dimension: 'scientific_rigor',
    title: 'Sterilization Method Not Described',
    question:
      'For devices provided sterile or requiring sterilization prior to use, the 510(k) must describe the sterilization method and include validation data demonstrating a sterility assurance level (SAL) of 10^-6. Has the sterilization method been specified?',
    check: (a) => {
      if (isBlank(a.sterilization_method)) {
        return {
          id: rid('sterilization_missing'),
          dimension: 'scientific_rigor',
          severity: 'warning',
          title: 'Sterilization Method Not Described',
          question:
            'For devices provided sterile or requiring sterilization prior to use, the 510(k) must describe the sterilization method and include validation data demonstrating a sterility assurance level (SAL) of 10^-6. Has the sterilization method been specified?',
          observation:
            'No sterilization method was described. If the device is provided sterile or intended for sterilization prior to use, this is a required section.',
          requirement:
            'The sterilization method (e.g., EtO, gamma irradiation, steam, e-beam) must be identified with validation per appropriate standards (e.g., ISO 11135, ISO 11137, ISO 17665). Sterility assurance level (SAL) of 10^-6 is expected.',
          reference:
            'FDA Guidance: Submission and Review of Sterility Information in Premarket Notification (510(k)) Submissions; ISO 11135; ISO 11137; ISO 17665',
          recommendation:
            'Specify whether the device is provided sterile. If so, describe the sterilization method, validation approach, and SAL achieved. If not sterile, state whether it requires sterilization/disinfection by the user and provide reprocessing instructions.',
          relatedFields: ['sterilization_method', 'shelf_life'],
        };
      }
      return null;
    },
  },

  /* ── 16. Software level of concern ──────────────────────────────── */
  {
    id: rid('software_loc_missing'),
    dimension: 'regulatory_alignment',
    title: 'Software Level of Concern Not Specified',
    question:
      'For software-containing devices, FDA guidance on Content of Premarket Submissions for Device Software Functions requires documentation proportional to the software safety classification per IEC 62304. Has the level of concern been identified?',
    check: (a) => {
      if (isBlank(a.software_level_of_concern)) {
        return {
          id: rid('software_loc_missing'),
          dimension: 'regulatory_alignment',
          severity: 'warning',
          title: 'Software Level of Concern Not Specified',
          question:
            'For software-containing devices, FDA guidance on Content of Premarket Submissions for Device Software Functions requires documentation proportional to the software safety classification per IEC 62304. Has the level of concern been identified?',
          observation:
            'No software level of concern was specified. If the device contains software, the safety classification (Class A, B, or C per IEC 62304) must be determined.',
          requirement:
            'Software-containing devices must document the software safety classification and provide documentation commensurate with that level, including software requirements, architecture, and verification/validation testing results.',
          reference:
            'FDA Guidance: Content of Premarket Submissions for Device Software Functions (2023); IEC 62304:2006+A1:2015 — Medical Device Software Life Cycle Processes',
          recommendation:
            'Determine whether the device contains software. If so, classify the software safety class per IEC 62304 (Class A, B, or C) and provide the corresponding documentation package including software description, risk analysis, and verification/validation evidence.',
          relatedFields: ['software_level_of_concern', 'cybersecurity_applicable'],
        };
      }
      return null;
    },
  },

  /* ── 17. Cybersecurity ──────────────────────────────────────────── */
  {
    id: rid('cybersecurity_not_addressed'),
    dimension: 'risk_identification',
    title: 'Cybersecurity Considerations Not Addressed',
    question:
      'Per Section 524B of the FD&C Act and FDA Guidance on Cybersecurity in Medical Devices (2023), devices with software or network connectivity must address cybersecurity risks including an SBOM, threat modeling, and vulnerability management. Has cybersecurity applicability been determined?',
    check: (a) => {
      if (isBlank(a.cybersecurity_applicable)) {
        return {
          id: rid('cybersecurity_not_addressed'),
          dimension: 'risk_identification',
          severity: 'warning',
          title: 'Cybersecurity Considerations Not Addressed',
          question:
            'Per Section 524B of the FD&C Act and FDA Guidance on Cybersecurity in Medical Devices (2023), devices with software or network connectivity must address cybersecurity risks including an SBOM, threat modeling, and vulnerability management. Has cybersecurity applicability been determined?',
          observation:
            'No determination was made regarding the applicability of cybersecurity requirements. Since Section 524B of the FD&C Act, cybersecurity documentation is required for cyber devices.',
          requirement:
            'If the device is a "cyber device" (contains software, connects to the internet, or has cybersecurity vulnerabilities), the submitter must include a cybersecurity management plan, SBOM (Software Bill of Materials), and vulnerability assessment.',
          reference:
            'FD&C Act Section 524B; FDA Guidance: Cybersecurity in Medical Devices — Quality System Considerations and Content of Premarket Submissions (2023)',
          recommendation:
            'Determine whether the device meets the definition of a "cyber device." If so, provide: (1) cybersecurity risk assessment; (2) SBOM; (3) vulnerability management plan; (4) patch/update mechanisms; (5) evidence of secure design principles.',
          relatedFields: ['cybersecurity_applicable', 'software_level_of_concern', 'emr_compatibility'],
        };
      }
      return null;
    },
  },

  /* ── 18. Electrical safety ──────────────────────────────────────── */
  {
    id: rid('electrical_safety_missing'),
    dimension: 'scientific_rigor',
    title: 'Electrical Safety Testing Not Documented',
    question:
      'For electrically powered devices, compliance with IEC 60601-1 and applicable collateral and particular standards is expected per FDA recognized consensus standards. Has electrical safety testing been addressed?',
    check: (a) => {
      if (isBlank(a.electrical_safety_testing)) {
        return {
          id: rid('electrical_safety_missing'),
          dimension: 'scientific_rigor',
          severity: 'warning',
          title: 'Electrical Safety Testing Not Documented',
          question:
            'For electrically powered devices, compliance with IEC 60601-1 and applicable collateral and particular standards is expected per FDA recognized consensus standards. Has electrical safety testing been addressed?',
          observation:
            'No electrical safety testing information was provided. If the device is electrically powered, IEC 60601-1 testing is generally expected.',
          requirement:
            'Electrically powered medical devices must comply with IEC 60601-1 (general requirements) and applicable collateral and particular standards. Test reports from accredited laboratories are expected.',
          reference:
            'IEC 60601-1:2005+A1+A2; FDA Recognized Consensus Standards Database; 21 CFR 807.87(f)',
          recommendation:
            'If the device is electrically powered, provide IEC 60601-1 test reports covering: dielectric strength, leakage current, earth/ground continuity, temperature limits, and mechanical hazards. List all applicable collateral and particular standards.',
          relatedFields: ['electrical_safety_testing', 'standards_referenced'],
        };
      }
      return null;
    },
  },

  /* ── 19. EMR/EHR compatibility ──────────────────────────────────── */
  {
    id: rid('emr_compatibility_missing'),
    dimension: 'practical_feasibility',
    title: 'EMR/EHR Interoperability Not Addressed',
    question:
      'Per FDA Guidance on Design Considerations for Interoperable Medical Devices (2017), if the device outputs data intended for integration with electronic medical records, interoperability and data format standards must be documented. Has EMR compatibility been addressed?',
    check: (a) => {
      if (isBlank(a.emr_compatibility)) {
        return {
          id: rid('emr_compatibility_missing'),
          dimension: 'practical_feasibility',
          severity: 'info',
          title: 'EMR/EHR Interoperability Not Addressed',
          question:
            'Per FDA Guidance on Design Considerations for Interoperable Medical Devices (2017), if the device outputs data intended for integration with electronic medical records, interoperability and data format standards must be documented. Has EMR compatibility been addressed?',
          observation:
            'No information was provided about EMR/EHR compatibility. If the device communicates data to hospital information systems, this should be addressed.',
          requirement:
            'Devices that interface with electronic health record systems should document the communication protocols, data formats (e.g., HL7, FHIR, DICOM), and interoperability testing conducted.',
          reference:
            'FDA Guidance: Design Considerations and Pre-market Submission Recommendations for Interoperable Medical Devices (2017)',
          recommendation:
            'If applicable, describe the data output format, communication standards used, and any interoperability testing performed. If not applicable, state so explicitly.',
          relatedFields: ['emr_compatibility', 'cybersecurity_applicable'],
        };
      }
      return null;
    },
  },

  /* ── 20. Shelf life ─────────────────────────────────────────────── */
  {
    id: rid('shelf_life_missing'),
    dimension: 'scientific_rigor',
    title: 'Shelf Life / Packaging Validation Not Addressed',
    question:
      'For devices with limited shelf life or provided in sterile packaging, accelerated or real-time aging studies per ASTM F1980 and package integrity validation per ISO 11607 are required. Has shelf life been addressed?',
    check: (a) => {
      if (isBlank(a.shelf_life)) {
        return {
          id: rid('shelf_life_missing'),
          dimension: 'scientific_rigor',
          severity: 'info',
          title: 'Shelf Life / Packaging Validation Not Addressed',
          question:
            'For devices with limited shelf life or provided in sterile packaging, accelerated or real-time aging studies per ASTM F1980 and package integrity validation per ISO 11607 are required. Has shelf life been addressed?',
          observation:
            'No shelf life or packaging validation information was provided.',
          requirement:
            'If the device has a finite shelf life or is provided in sterile packaging, the submitter must provide shelf life data (real-time or accelerated aging per ASTM F1980) and sterile barrier system validation (per ISO 11607 / ASTM D4169).',
          reference:
            'ASTM F1980 — Standard Guide for Accelerated Aging of Sterile Barrier Systems; ISO 11607 — Packaging for Terminally Sterilized Medical Devices; FDA Guidance: Shelf Life of Medical Devices',
          recommendation:
            'Determine whether the device has shelf life limitations. If so, provide accelerated and/or real-time aging data. If the device is provided sterile, include package integrity testing per ISO 11607.',
          relatedFields: ['shelf_life', 'sterilization_method'],
        };
      }
      return null;
    },
  },

  /* ── 21. Labeling compliance ────────────────────────────────────── */
  {
    id: rid('labeling_not_reviewed'),
    dimension: 'documentation',
    title: 'Labeling Not Reviewed for Regulatory Compliance',
    question:
      'Per 21 CFR 807.87(e) and 21 CFR Part 801, complete labeling — including the device label, instructions for use, package labeling, and any promotional materials — must be submitted and comply with general and device-specific requirements. Has labeling been reviewed?',
    check: (a) => {
      if (isBlank(a.labeling_reviewed) || a.labeling_reviewed === false || a.labeling_reviewed === 'no') {
        return {
          id: rid('labeling_not_reviewed'),
          dimension: 'documentation',
          severity: 'warning',
          title: 'Labeling Not Reviewed for Regulatory Compliance',
          question:
            'Per 21 CFR 807.87(e) and 21 CFR Part 801, complete labeling — including the device label, instructions for use, package labeling, and any promotional materials — must be submitted and comply with general and device-specific requirements. Has labeling been reviewed?',
          observation:
            'Labeling has not been reviewed or confirmed compliant with 21 CFR Part 801 requirements.',
          requirement:
            'The 510(k) must include proposed labeling (21 CFR 807.87(e)) that complies with 21 CFR Part 801 (general labeling), 21 CFR 801.109 (prescription device labeling), and any device-specific labeling guidance. Indications for use in labeling must match the 510(k) clearance.',
          reference:
            '21 CFR 807.87(e); 21 CFR Part 801; FDA Guidance: Guidelines for the Content of Premarket 510(k) Notifications',
          recommendation:
            'Review all proposed labeling for compliance with: (1) 21 CFR 801 general requirements (manufacturer name/address, intended use, directions for use, warnings/precautions); (2) Rx-only legend if applicable; (3) UDI requirements (21 CFR Part 830); (4) consistency of the indications for use across labeling and the 510(k).',
          relatedFields: ['labeling_reviewed', 'indications_for_use', 'intended_use'],
        };
      }
      return null;
    },
  },

  /* ── 22. Materials of construction ──────────────────────────────── */
  {
    id: rid('materials_not_described'),
    dimension: 'completeness',
    title: 'Materials of Construction Not Described',
    question:
      'CDRH expects a detailed description of all patient-contacting and structural materials, identified by chemical name, grade, and supplier specification. Material differences from the predicate may trigger additional biocompatibility testing under ISO 10993-1. Are the materials adequately documented?',
    check: (a) => {
      if (isBlank(a.materials_of_construction)) {
        return {
          id: rid('materials_not_described'),
          dimension: 'completeness',
          severity: 'warning',
          title: 'Materials of Construction Not Described',
          question:
            'CDRH expects a detailed description of all patient-contacting and structural materials, identified by chemical name, grade, and supplier specification. Material differences from the predicate may trigger additional biocompatibility testing under ISO 10993-1. Are the materials adequately documented?',
          observation:
            'No materials of construction were described. Material composition is essential for biocompatibility assessment and comparison with the predicate device.',
          requirement:
            'All patient-contacting materials must be identified by chemical name, grade, and supplier specification. Material differences from the predicate device may require additional biocompatibility testing per ISO 10993-1.',
          reference:
            'ISO 10993-1:2018; FDA Guidance: Use of International Standard ISO 10993-1; 21 CFR 807.87(f)',
          recommendation:
            'List all materials of construction, distinguishing patient-contacting from non-patient-contacting components. For patient-contacting materials, identify the specific grade and any biocompatibility data available.',
          relatedFields: ['materials_of_construction', 'biocompatibility_testing', 'technological_characteristics'],
        };
      }
      return null;
    },
  },

  /* ── 23. Clinical data requirement determination ────────────────── */
  {
    id: rid('clinical_data_undetermined'),
    dimension: 'risk_identification',
    title: 'Clinical Data Necessity Not Assessed',
    question:
      'Under 21 CFR 807.87(f), if technological differences from the predicate cannot be resolved by bench testing alone, clinical evidence may be required. Has the submitter made a determination regarding the need for clinical data?',
    check: (a) => {
      if (isBlank(a.clinical_data_required)) {
        return {
          id: rid('clinical_data_undetermined'),
          dimension: 'risk_identification',
          severity: 'warning',
          title: 'Clinical Data Necessity Not Assessed',
          question:
            'Under 21 CFR 807.87(f), if technological differences from the predicate cannot be resolved by bench testing alone, clinical evidence may be required. Has the submitter made a determination regarding the need for clinical data?',
          observation:
            'No determination was made regarding the need for clinical data.',
          requirement:
            'If the subject device has different technological characteristics that could affect safety or effectiveness, and bench testing alone cannot resolve the question, clinical data may be required (21 CFR 807.87(f)).',
          reference:
            '21 CFR 807.87(f); FDA Guidance: The 510(k) Program — Evaluating Substantial Equivalence',
          recommendation:
            'Assess whether the technological differences from the predicate raise safety/effectiveness questions that cannot be resolved through bench testing. Document the rationale for including or excluding clinical data.',
          relatedFields: ['clinical_data_required', 'clinical_data_summary', 'substantial_equivalence_rationale'],
        };
      }
      return null;
    },
  },

  /* ── 24. Clinical data summary when required ────────────────────── */
  {
    id: rid('clinical_data_summary_missing'),
    dimension: 'scientific_rigor',
    title: 'Clinical Data Summary Not Provided When Required',
    question:
      'Clinical data was identified as necessary to support the SE determination. Per 21 CFR 807.87(f), has a clinical data summary been included with adequate detail on study design, enrollment, endpoints, statistical methodology, and outcomes?',
    check: (a) => {
      const needed = a.clinical_data_required === true || a.clinical_data_required === 'yes';
      if (needed && isBlank(a.clinical_data_summary)) {
        return {
          id: rid('clinical_data_summary_missing'),
          dimension: 'scientific_rigor',
          severity: 'critical',
          title: 'Clinical Data Summary Not Provided When Required',
          question:
            'Clinical data was identified as necessary to support the SE determination. Per 21 CFR 807.87(f), has a clinical data summary been included with adequate detail on study design, enrollment, endpoints, statistical methodology, and outcomes?',
          observation:
            'Clinical data was indicated as required, but no clinical data summary was provided. This is a significant gap that will likely result in an Additional Information (AI) request from CDRH.',
          requirement:
            'When clinical data is needed, the submission must include a summary with: study design, subject demographics, primary endpoints, statistical analysis plan, results, and conclusions relevant to the SE determination.',
          reference:
            '21 CFR 807.87(f); FDA Guidance: The 510(k) Program — Evaluating Substantial Equivalence; FDA Guidance: Investigational Device Exemptions (IDEs) for Early Feasibility Medical Device Clinical Studies',
          recommendation:
            'Provide a clinical data summary covering: (1) study design and objectives; (2) enrollment criteria and demographics; (3) primary and secondary endpoints; (4) statistical methodology; (5) results with confidence intervals; (6) adverse events; (7) conclusions supporting SE.',
          relatedFields: ['clinical_data_summary', 'clinical_data_required'],
        };
      }
      return null;
    },
  },

  /* ── 25. Nonclinical testing summary ────────────────────────────── */
  {
    id: rid('nonclinical_testing_missing'),
    dimension: 'scientific_rigor',
    title: 'Nonclinical Testing Summary Missing',
    question:
      'Bench testing, software verification and validation, and other nonclinical studies form the foundation of most 510(k) SE determinations. Per FDA guidance on the format for traditional 510(k)s, has a nonclinical testing summary been provided?',
    check: (a) => {
      if (isBlank(a.nonclinical_testing_summary)) {
        return {
          id: rid('nonclinical_testing_missing'),
          dimension: 'scientific_rigor',
          severity: 'warning',
          title: 'Nonclinical Testing Summary Missing',
          question:
            'Bench testing, software verification and validation, and other nonclinical studies form the foundation of most 510(k) SE determinations. Per FDA guidance on the format for traditional 510(k)s, has a nonclinical testing summary been provided?',
          observation:
            'No nonclinical testing summary was provided. Most 510(k) submissions require bench testing data to support the SE determination.',
          requirement:
            'The nonclinical testing section should summarize all bench, analytical, and computational testing performed, including test protocols, acceptance criteria, and results.',
          reference:
            'FDA Guidance: Format for Traditional and Abbreviated 510(k)s; 21 CFR 807.87(f)',
          recommendation:
            'Provide a nonclinical testing summary organized by test type (e.g., mechanical, electrical, software V&V, biocompatibility, sterilization, packaging). For each test, include the test standard, protocol, acceptance criteria, and pass/fail results.',
          relatedFields: ['nonclinical_testing_summary', 'performance_data_type', 'standards_referenced'],
        };
      }
      return null;
    },
  },

  /* ── 26. Standards referenced ───────────────────────────────────── */
  {
    id: rid('standards_not_referenced'),
    dimension: 'documentation',
    title: 'No Recognized Consensus Standards Referenced',
    question:
      'Per Section 514(c) of the FD&C Act, FDA maintains a list of recognized consensus standards. Declaring conformity via FDA Form 3654 can streamline review and may substitute for detailed test reports. Has the submitter identified applicable consensus standards?',
    check: (a) => {
      if (isBlank(a.standards_referenced)) {
        return {
          id: rid('standards_not_referenced'),
          dimension: 'documentation',
          severity: 'info',
          title: 'No Recognized Consensus Standards Referenced',
          question:
            'Per Section 514(c) of the FD&C Act, FDA maintains a list of recognized consensus standards. Declaring conformity via FDA Form 3654 can streamline review and may substitute for detailed test reports. Has the submitter identified applicable consensus standards?',
          observation:
            'No consensus standards were referenced in the submission. Declaring conformity to FDA-recognized standards can facilitate the review process.',
          requirement:
            'While not mandatory, submitters are encouraged to declare conformity to FDA-recognized consensus standards per Section 514(c) of the FD&C Act. Declarations of conformity using FDA Form 3654 can be used in place of detailed test reports.',
          reference:
            'FD&C Act Section 514(c); FDA Guidance: Appropriate Use of Voluntary Consensus Standards in Premarket Submissions; FDA Recognized Consensus Standards Database',
          recommendation:
            'Review the FDA Recognized Consensus Standards Database for standards applicable to the device type. Consider declaring conformity to relevant standards (e.g., IEC 60601-1 for electrical devices, ISO 10993 series for biocompatibility, IEC 62304 for software).',
          relatedFields: ['standards_referenced', 'electrical_safety_testing', 'biocompatibility_testing'],
        };
      }
      return null;
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Factory                                                            */
/* ------------------------------------------------------------------ */

export function createDevice510kAuditor(): WarGameAuditor {
  return {
    category: '510k',
    name: 'FDA CDRH 510(k) Reviewer',
    description:
      'Simulates an FDA Center for Devices and Radiological Health (CDRH) reviewer evaluating a 510(k) premarket notification for substantial equivalence. Scrutinizes predicate selection, intended use comparison, technological characteristics, performance data, biocompatibility, software documentation, cybersecurity, sterilization, and labeling compliance per 21 CFR 807.87 and applicable FDA guidance documents.',
    rules,
  };
}
