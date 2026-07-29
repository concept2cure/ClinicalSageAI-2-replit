import type { BaseTask, SubmissionPyramid } from './types.js';
import { buildPhase } from './types.js';

/**
 * IND Amendment Pyramid
 *
 * Used when sponsors submit serial amendments to an existing IND, including:
 *   - Protocol amendments (new or revised protocols)
 *   - Information amendments (CMC changes, new nonclinical data)
 *   - IND safety reports (unexpected serious adverse events)
 *   - New investigator additions
 *
 * Governed primarily by 21 CFR 312.31 (amendments) and 21 CFR 312.32
 * (safety reports). Lighter than an initial IND — typical total effort
 * is 80-120 hours depending on amendment scope.
 *
 * @module services/regulatory/pyramids/ind-amendment-pyramid
 */
export function buildIndAmendmentPyramid(): SubmissionPyramid {
  const phases: SubmissionPyramid['phases'] = [];

  // ─── Phase 1 — Amendment Planning ───────────────────────────────────────────

  const phase1 = buildPhase('phase1', 'Amendment Planning', 1, [
    {
      id: 'identify_trigger',
      name: 'Identify amendment trigger',
      estimatedHours: 4,
      role: 'ra_lead',
      critical: true,
      description:
        'Determine the event or change that necessitates the amendment: protocol change, CMC change, safety update, or new investigator addition.',
      risk: {
        severity: 'high',
        probability: 0.25,
        impact:
          'Incorrect trigger classification delays submission or results in wrong amendment type filed with FDA',
        mitigations: [
          'Review 21 CFR 312.31 amendment categories systematically',
          'Consult cross-functional team (clinical, CMC, safety) to confirm scope',
          'Check whether multiple triggers should be consolidated or filed separately',
        ],
      },
      guidance: {
        cfrReference: '21 CFR 312.31',
        fdaGuidanceRef:
          'Guidance for Industry: IND Amendments — Content and Format',
        keyConsiderations: [
          'Protocol amendments: any change to a protocol covered by the IND',
          'Information amendments: new CMC data, nonclinical data, or updated administrative information',
          'IND safety reports: governed separately under 21 CFR 312.32',
          'New investigator additions may be submitted as information amendments',
        ],
      },
      timeline: { typicalStartWeek: 1, typicalDurationWeeks: 1 },
      deliverables: [
        'Amendment trigger assessment memo',
        'Scope of changes summary',
      ],
    },
    {
      id: 'classify_amendment',
      name: 'Classify amendment type per 21 CFR 312.31',
      estimatedHours: 3,
      role: 'ra_lead',
      critical: true,
      description:
        'Formally classify the amendment as a protocol amendment (312.31(a)), information amendment (312.31(b)), or IND safety report (312.32).',
      risk: {
        severity: 'high',
        probability: 0.2,
        impact:
          'Misclassification leads to regulatory non-compliance or missed reporting timelines',
        mitigations: [
          'Map each change against the specific 312.31 subsection',
          'Confirm whether safety reporting obligations under 312.32 apply',
          'Document classification rationale for the regulatory file',
        ],
      },
      guidance: {
        cfrReference: '21 CFR 312.31(a)-(b)',
        keyConsiderations: [
          '312.31(a)(1): new protocol — submit before study begins',
          '312.31(a)(2): protocol change — submit as amendment to previously submitted protocol',
          '312.31(a)(3): significant safety changes may need to be filed before implementation',
          '312.31(b): information amendments for CMC changes, new nonclinical data, etc.',
        ],
      },
      timeline: { typicalStartWeek: 1, typicalDurationWeeks: 1 },
      deliverables: [
        'Amendment classification memo',
        'Applicable CFR section mapping',
      ],
    },
    {
      id: 'impact_assessment',
      name: 'Assess impact on ongoing studies',
      estimatedHours: 6,
      role: 'clinical_lead',
      description:
        'Evaluate the amendment impact on all ongoing and planned clinical studies under the IND.',
      risk: {
        severity: 'medium',
        probability: 0.3,
        impact:
          'Failure to assess ongoing study impact may require protocol deviations or subject safety notifications',
        mitigations: [
          'Review all active protocols under the IND',
          'Identify enrolled subjects who may be affected by the change',
          'Coordinate with investigators at active sites',
        ],
      },
      guidance: {
        cfrReference: '21 CFR 312.31(a)(3)',
        keyConsiderations: [
          'Changes that increase risk must be reported to IRBs and investigators',
          'Significant safety changes may not be implemented until the amendment is submitted',
          'Impact on informed consent must be evaluated',
        ],
      },
      timeline: { typicalStartWeek: 1, typicalDurationWeeks: 1 },
      deliverables: [
        'Impact assessment report',
        'List of affected studies and sites',
      ],
    },
    {
      id: 'amendment_timeline',
      name: 'Create amendment timeline',
      estimatedHours: 3,
      role: 'project_manager',
      description:
        'Develop a timeline for amendment preparation, review, and submission.',
      guidance: {
        cfrReference: '21 CFR 312.31',
        keyConsiderations: [
          'Protocol amendments for new protocols must be submitted before the study begins',
          'IND safety reports have strict 7-day (fatal/life-threatening) and 15-day reporting windows per 312.32',
          'Information amendments have no specific deadline but should be submitted in a timely manner',
        ],
      },
      timeline: { typicalStartWeek: 1, typicalDurationWeeks: 1 },
      deliverables: [
        'Amendment project timeline',
        'Key milestone calendar',
      ],
    },
    {
      id: 'cover_letter_draft',
      name: 'Draft amendment cover letter',
      estimatedHours: 4,
      role: 'ra_lead',
      description:
        'Prepare the amendment cover letter describing the nature, purpose, and scope of the amendment.',
      guidance: {
        cfrReference: '21 CFR 312.23(a)(1)',
        keyConsiderations: [
          'Cover letter must identify the IND number and amendment type',
          'Clearly describe the reason for the amendment',
          'Reference the sequence number of the submission',
          'List all changed or new documents included in the amendment',
        ],
      },
      timeline: { typicalStartWeek: 2, typicalDurationWeeks: 1 },
      deliverables: ['Draft amendment cover letter'],
      documentBindings: [
        {
          ctdSection: '1.1',
          sectionTitle: 'Cover Letter',
          ectdLifecycleOp: 'new',
          artifactTypes: ['cover_letter'],
        },
      ],
    },
  ]);
  phases.push(phase1.phase);

  // ─── Phase 2 — Content Development ──────────────────────────────────────────

  const phase2 = buildPhase(
    'phase2',
    'Content Development',
    2,
    [
      {
        id: 'amended_sections',
        name: 'Prepare amended sections (changed modules only)',
        estimatedHours: 8,
        role: 'medical_writer',
        critical: true,
        description:
          'Draft or revise only the CTD modules affected by the amendment. Unchanged sections are not resubmitted.',
        risk: {
          severity: 'high',
          probability: 0.25,
          impact:
            'Incomplete or inconsistent amended sections lead to FDA information requests or clinical hold',
          mitigations: [
            'Use redline comparison against previously submitted versions',
            'Verify eCTD lifecycle operations (replace vs. append) are correct for each document',
            'Ensure all cross-references within the submission remain valid after changes',
          ],
        },
        guidance: {
          cfrReference: '21 CFR 312.31',
          ichGuideline: 'ICH M4',
          keyConsiderations: [
            'Only changed modules should be submitted — do not resubmit unchanged content',
            'eCTD lifecycle operations must correctly reflect the nature of each change',
            'Track changes or summary of changes document recommended for reviewer clarity',
          ],
        },
        timeline: { typicalStartWeek: 3, typicalDurationWeeks: 2 },
        deliverables: [
          'Revised CTD module sections',
          'Summary of changes document',
        ],
        documentBindings: [
          {
            ctdSection: '2.0',
            sectionTitle: 'Amended CTD Modules',
            ectdLifecycleOp: 'replace',
          },
        ],
      },
      {
        id: 'update_ib',
        name: "Update Investigator's Brochure (if safety data changed)",
        estimatedHours: 8,
        role: 'medical_writer',
        description:
          'Revise the IB to incorporate new safety data, revised risk/benefit assessments, or updated nonclinical findings.',
        risk: {
          severity: 'high',
          probability: 0.3,
          impact:
            'Outdated IB creates investigator liability and regulatory non-compliance',
          mitigations: [
            'Cross-reference new safety data with existing IB sections',
            'Distribute updated IB to all investigators within regulatory timelines',
            'Track IB version history and distribution',
          ],
        },
        guidance: {
          ichGuideline: 'ICH E6(R2) Section 7',
          cfrReference: '21 CFR 312.55(a)',
          keyConsiderations: [
            'IB must be reviewed and updated at least annually (21 CFR 312.55)',
            'New safety information may require interim IB updates',
            'Updated IB must be provided to investigators and IRBs',
          ],
        },
        timeline: { typicalStartWeek: 3, typicalDurationWeeks: 2 },
        deliverables: [
          "Updated Investigator's Brochure",
          'IB change log',
        ],
        documentBindings: [
          {
            ctdSection: '5.3.5.4',
            sectionTitle: "Investigator's Brochure",
            ectdLifecycleOp: 'replace',
            artifactTypes: ['investigator_brochure'],
          },
        ],
      },
      {
        id: 'revise_protocol',
        name: 'Revise clinical protocol (if protocol amendment)',
        estimatedHours: 10,
        role: 'clinical_lead',
        critical: true,
        description:
          'Incorporate protocol changes including study design modifications, endpoint revisions, eligibility criteria updates, or dosing changes.',
        risk: {
          severity: 'high',
          probability: 0.2,
          impact:
            'Protocol deficiencies are a leading cause of FDA feedback and may result in clinical hold',
          mitigations: [
            'Internal protocol review committee sign-off',
            'Verify consistency with IB and nonclinical data',
            'Assess impact on statistical analysis plan',
          ],
        },
        guidance: {
          cfrReference: '21 CFR 312.31(a)(2)',
          ichGuideline: 'ICH E6(R2)',
          keyConsiderations: [
            'Protocol amendment must include a brief description of the change and reference to the original protocol',
            'Changes increasing risk to subjects may not be implemented before submission',
            'IRB approval of the amended protocol is required before implementation at each site',
          ],
        },
        timeline: { typicalStartWeek: 3, typicalDurationWeeks: 3 },
        deliverables: [
          'Revised clinical protocol',
          'Protocol amendment summary',
        ],
        documentBindings: [
          {
            ctdSection: '5.3.5.1',
            sectionTitle: 'Clinical Study Protocol',
            ectdLifecycleOp: 'replace',
            artifactTypes: ['protocol'],
          },
        ],
      },
      {
        id: 'update_cmc',
        name: 'Update CMC information (if chemistry changes)',
        estimatedHours: 6,
        role: 'cmc_lead',
        description:
          'Revise Module 3 content to reflect manufacturing changes, new specifications, updated stability data, or changes to drug substance/product.',
        risk: {
          severity: 'medium',
          probability: 0.25,
          impact:
            'CMC deficiencies may trigger FDA information requests or delay clinical supply',
          mitigations: [
            'Ensure all specification changes are scientifically justified',
            'Include comparative data (before vs. after change)',
            'Verify stability data supports the change',
          ],
        },
        guidance: {
          cfrReference: '21 CFR 312.31(b)',
          ichGuideline: 'ICH Q6A, ICH Q8(R2)',
          keyConsiderations: [
            'CMC changes filed as information amendments under 312.31(b)',
            'Significant manufacturing changes may require comparability studies',
            'Updated stability data should cover new formulation or process',
          ],
        },
        timeline: { typicalStartWeek: 3, typicalDurationWeeks: 2 },
        deliverables: [
          'Updated Module 3 sections',
          'Comparability data (if applicable)',
        ],
        documentBindings: [
          {
            ctdSection: '3.2.S',
            sectionTitle: 'Drug Substance',
            ectdLifecycleOp: 'replace',
            artifactTypes: ['cmc_report'],
          },
          {
            ctdSection: '3.2.P',
            sectionTitle: 'Drug Product',
            ectdLifecycleOp: 'replace',
            artifactTypes: ['cmc_report'],
          },
        ],
      },
      {
        id: 'form_1571_amendment',
        name: 'Prepare Form 1571 amendment version',
        estimatedHours: 3,
        role: 'ra_associate',
        critical: true,
        description:
          'Complete FDA Form 1571 for the amendment submission, including updated serial number, amendment type indication, and table of contents.',
        risk: {
          severity: 'high',
          probability: 0.1,
          impact:
            'Amendment will be refused if Form 1571 is incomplete or incorrectly identifies the amendment type',
          mitigations: [
            'Use validated form-fill tool',
            'Verify IND number matches the existing IND',
            'Confirm correct amendment type checkbox is selected',
          ],
        },
        guidance: {
          cfrReference: '21 CFR 312.23(a)(1)',
          keyConsiderations: [
            'Form 1571 must identify the submission as an amendment (not an original IND)',
            'Serial number must increment from the last submission',
            'Table of contents must reflect only the documents included in this amendment',
          ],
        },
        timeline: { typicalStartWeek: 4, typicalDurationWeeks: 1 },
        deliverables: ['Completed FDA Form 1571 (amendment version)'],
        documentBindings: [
          {
            ctdSection: '1.2',
            sectionTitle: 'FDA Form 1571',
            ectdLifecycleOp: 'new',
            artifactTypes: ['fda_form'],
          },
        ],
      },
      {
        id: 'cross_reference',
        name: 'Cross-reference to original IND',
        estimatedHours: 4,
        role: 'ra_associate',
        description:
          'Document cross-references to the original IND submission and all prior sequences to maintain submission continuity.',
        guidance: {
          cfrReference: '21 CFR 312.23(b)',
          keyConsiderations: [
            'Reference the original IND number and sequence numbers of documents being replaced',
            'Include a submission history table',
            'Ensure eCTD backbone references are correct for lifecycle operations',
          ],
        },
        timeline: { typicalStartWeek: 4, typicalDurationWeeks: 1 },
        deliverables: [
          'Cross-reference table',
          'Submission history summary',
        ],
        documentBindings: [
          {
            ctdSection: '1.0',
            sectionTitle: 'Regional Administrative Information',
            ectdLifecycleOp: 'append',
          },
        ],
      },
    ],
    phase1.completeId,
  );
  phases.push(phase2.phase);

  // ─── Phase 3 — Safety & Compliance ──────────────────────────────────────────

  const phase3 = buildPhase(
    'phase3',
    'Safety & Compliance',
    3,
    [
      {
        id: 'safety_narrative',
        name: 'Safety narrative update',
        estimatedHours: 6,
        role: 'medical_monitor',
        critical: true,
        description:
          'Update the integrated safety narrative with new safety data, adverse event summaries, and revised risk/benefit assessments.',
        risk: {
          severity: 'critical',
          probability: 0.2,
          impact:
            'Inadequate safety narrative may result in clinical hold or failure to meet IND safety reporting obligations',
          mitigations: [
            'Cross-reference all new AE/SAE data with existing safety database',
            'Update risk/benefit assessment with current totality of evidence',
            'Ensure consistency between safety narrative and IB',
          ],
        },
        guidance: {
          cfrReference: '21 CFR 312.32',
          keyConsiderations: [
            'Safety narrative should integrate all available safety data across studies',
            'Identify any new safety signals or changes in risk profile',
            'SUSAR reporting timelines: 7 calendar days for fatal/life-threatening, 15 calendar days for all others',
          ],
        },
        timeline: { typicalStartWeek: 5, typicalDurationWeeks: 2 },
        deliverables: [
          'Updated safety narrative',
          'Safety data summary tables',
        ],
      },
      {
        id: 'ind_safety_report',
        name: 'IND safety report preparation (if applicable, 21 CFR 312.32)',
        estimatedHours: 8,
        role: 'medical_monitor',
        critical: true,
        description:
          'Prepare IND safety reports for suspected unexpected serious adverse reactions (SUSARs) per 21 CFR 312.32 reporting requirements.',
        risk: {
          severity: 'critical',
          probability: 0.15,
          impact:
            'Failure to report SUSARs within required timelines is a serious regulatory violation and may result in IND termination',
          mitigations: [
            'Implement automated safety alert system for real-time AE tracking',
            'Maintain current list of expected adverse reactions from the IB',
            'Pre-establish CIOMS/MedWatch reporting workflows',
          ],
        },
        guidance: {
          cfrReference: '21 CFR 312.32(c)',
          fdaGuidanceRef:
            'Safety Reporting Requirements for INDs and BA/BE Studies (2012)',
          keyConsiderations: [
            '7-calendar-day telephone/fax report for fatal or life-threatening unexpected events',
            '15-calendar-day written report for all other serious and unexpected adverse experiences',
            'Follow-up reports required with additional information as it becomes available',
            'Annual reporting of non-serious adverse experiences in IND annual report',
          ],
        },
        timeline: {
          typicalStartWeek: 5,
          typicalDurationWeeks: 2,
          regulatoryDeadlineDays: 15,
        },
        deliverables: [
          'IND safety report (MedWatch 3500A)',
          'CIOMS form (if international reporting)',
          'Follow-up safety report (if applicable)',
        ],
        documentBindings: [
          {
            ctdSection: '1.2',
            sectionTitle: 'IND Safety Reports',
            ectdLifecycleOp: 'new',
            artifactTypes: ['safety_report'],
          },
        ],
      },
      {
        id: 'glp_gcp_compliance',
        name: 'Verify GLP/GCP compliance of new data',
        estimatedHours: 4,
        role: 'qa_manager',
        description:
          'Confirm that any new nonclinical or clinical data included in the amendment was generated under appropriate GLP or GCP standards.',
        risk: {
          severity: 'medium',
          probability: 0.2,
          impact:
            'FDA will not accept pivotal data generated without GLP/GCP compliance',
          mitigations: [
            'Obtain signed GLP compliance statements from CROs',
            'Verify investigator GCP training documentation',
            'Audit trail review for data integrity',
          ],
        },
        guidance: {
          cfrReference: '21 CFR Part 58 (GLP), 21 CFR Part 312 Subpart D (GCP)',
          keyConsiderations: [
            'GLP compliance required for pivotal nonclinical studies',
            'GCP compliance required for all clinical data',
            'Non-GLP studies must be identified and justified',
          ],
        },
        timeline: { typicalStartWeek: 5, typicalDurationWeeks: 1 },
        deliverables: [
          'GLP/GCP compliance verification checklist',
          'Compliance statements from study sites or CROs',
        ],
      },
      {
        id: 'informed_consent_update',
        name: 'Update informed consent (if protocol changes affect participants)',
        estimatedHours: 4,
        role: 'clinical_lead',
        description:
          'Revise informed consent documents when protocol amendments change study procedures, risks, or benefits for participants.',
        risk: {
          severity: 'high',
          probability: 0.3,
          impact:
            'Failure to update informed consent for material changes is a GCP violation and may lead to regulatory action',
          mitigations: [
            'Review all protocol changes for informed consent implications',
            'Coordinate with IRBs at each active site for approval of updated consent',
            'Plan re-consent process for already-enrolled participants',
          ],
        },
        guidance: {
          cfrReference: '21 CFR 50.25, 21 CFR 50.27',
          ichGuideline: 'ICH E6(R2) Section 4.8',
          keyConsiderations: [
            'Any change in risk or procedures requires informed consent update',
            'IRB must approve revised consent before it is used',
            'Already-enrolled subjects must be re-consented if changes are material',
            'Document the re-consent process at each site',
          ],
        },
        timeline: { typicalStartWeek: 6, typicalDurationWeeks: 1 },
        deliverables: [
          'Revised informed consent form',
          'Re-consent plan (if applicable)',
        ],
      },
    ],
    phase2.completeId,
  );
  phases.push(phase3.phase);

  // ─── Phase 4 — QA Review ────────────────────────────────────────────────────

  const phase4 = buildPhase(
    'phase4',
    'QA Review',
    4,
    [
      {
        id: 'qc_review',
        name: 'QC review of amendment package',
        estimatedHours: 6,
        role: 'qa_manager',
        critical: true,
        description:
          'Perform quality control review of the complete amendment package for accuracy, completeness, and formatting.',
        risk: {
          severity: 'high',
          probability: 0.25,
          impact:
            'Quality defects in the amendment package may cause FDA information requests or delays',
          mitigations: [
            'Use comprehensive QC checklist specific to amendment type',
            'Independent second review of critical sections',
            'Verify all document cross-references are correct',
          ],
        },
        timeline: { typicalStartWeek: 7, typicalDurationWeeks: 1 },
        deliverables: [
          'QC review report',
          'Deficiency log with dispositions',
        ],
        subTasks: [
          {
            id: 'content_accuracy',
            name: 'Content accuracy verification',
            estimatedHours: 2,
          },
          {
            id: 'format_check',
            name: 'eCTD formatting and hyperlink verification',
            estimatedHours: 2,
          },
          {
            id: 'completeness_check',
            name: 'Completeness check against amendment scope',
            estimatedHours: 2,
          },
        ],
      },
      {
        id: 'cross_consistency',
        name: 'Cross-consistency check against existing IND',
        estimatedHours: 4,
        role: 'qa_manager',
        description:
          'Verify that the amendment content is consistent with the existing IND dossier and does not introduce contradictions.',
        risk: {
          severity: 'medium',
          probability: 0.3,
          impact:
            'Inconsistencies between amendment and existing IND undermine credibility and may trigger FDA queries',
          mitigations: [
            'Compare amended sections against corresponding original submissions',
            'Verify numerical consistency (doses, study results, specifications)',
            'Check that cross-references to prior sequences remain valid',
          ],
        },
        timeline: { typicalStartWeek: 7, typicalDurationWeeks: 1 },
        deliverables: ['Cross-consistency check report'],
      },
      {
        id: 'internal_signoff',
        name: 'Internal sign-off',
        estimatedHours: 3,
        role: 'ra_lead',
        description:
          'Obtain internal approvals from all relevant functional heads (clinical, CMC, safety, quality) before submission.',
        guidance: {
          cfrReference: '21 CFR Part 11',
          keyConsiderations: [
            'Electronic signatures must comply with 21 CFR Part 11',
            'Sponsor or authorized representative must sign Form 1571',
            'Maintain audit trail of all internal approvals',
          ],
        },
        timeline: { typicalStartWeek: 8, typicalDurationWeeks: 1 },
        deliverables: [
          'Signed approval page',
          'Sign-off tracking log',
        ],
      },
      {
        id: 'regulatory_compliance_check',
        name: 'Regulatory compliance verification',
        estimatedHours: 3,
        role: 'ra_lead',
        description:
          'Final verification that the amendment meets all applicable regulatory requirements and reporting timelines.',
        guidance: {
          cfrReference: '21 CFR 312.31, 21 CFR 312.32',
          keyConsiderations: [
            'Confirm amendment type matches 312.31 classification',
            'Verify safety reporting timelines are met if applicable',
            'Check that all required forms and certifications are included',
          ],
        },
        timeline: { typicalStartWeek: 8, typicalDurationWeeks: 1 },
        deliverables: [
          'Regulatory compliance checklist (completed)',
          'Filing readiness memo',
        ],
      },
    ],
    phase3.completeId,
  );
  phases.push(phase4.phase);

  // ─── Phase 5 — Submission ───────────────────────────────────────────────────

  const phase5 = buildPhase(
    'phase5',
    'Submission',
    5,
    [
      {
        id: 'ectd_compile',
        name: 'Compile eCTD sequence (increment from last sequence)',
        estimatedHours: 5,
        role: 'regulatory_ops',
        critical: true,
        description:
          'Build the eCTD sequence for the amendment, incrementing the sequence number from the last submission under the IND.',
        risk: {
          severity: 'high',
          probability: 0.15,
          impact:
            'Incorrect sequence numbering or eCTD structure will cause FDA ESG rejection',
          mitigations: [
            'Verify sequence number against FDA ESG submission history',
            'Use validated eCTD publishing tool',
            'Confirm all lifecycle operations (new, replace, append, delete) are correctly assigned',
          ],
        },
        guidance: {
          keyConsiderations: [
            'Sequence number must increment from the last successfully submitted sequence',
            'eCTD backbone XML must correctly reference prior document versions for replace/delete operations',
            'US regional Module 1 must conform to FDA eCTD specifications',
          ],
        },
        timeline: { typicalStartWeek: 9, typicalDurationWeeks: 1 },
        deliverables: ['Compiled eCTD amendment sequence'],
      },
      {
        id: 'ectd_validate',
        name: 'Validate eCTD',
        estimatedHours: 3,
        role: 'regulatory_ops',
        critical: true,
        description:
          'Run the eCTD through FDA-recognized validation tools to confirm technical compliance before gateway submission.',
        risk: {
          severity: 'medium',
          probability: 0.2,
          impact:
            'FDA ESG rejection if eCTD validation fails — resubmission delays timeline',
          mitigations: [
            'Use FDA-recognized validation tool (e.g., Lorenz docuBridge, EURS)',
            'Resolve all errors and critical warnings before submission',
            'Validate PDF bookmarks, hyperlinks, and document properties',
          ],
        },
        timeline: { typicalStartWeek: 9, typicalDurationWeeks: 1 },
        deliverables: ['eCTD validation report'],
      },
      {
        id: 'submit_amendment',
        name: 'Submit amendment to FDA via ESG',
        estimatedHours: 2,
        role: 'regulatory_ops',
        critical: true,
        description:
          'Transmit the validated eCTD amendment to the FDA via the Electronic Submissions Gateway (ESG).',
        risk: {
          severity: 'high',
          probability: 0.05,
          impact:
            'ESG transmission failure delays regulatory filing — safety reports have strict deadlines',
          mitigations: [
            'Test ESG connectivity before submission window',
            'Maintain backup submission method (physical media) for safety reports with tight deadlines',
            'Confirm receipt acknowledgment from FDA ESG',
          ],
        },
        guidance: {
          cfrReference: '21 CFR 312.31',
          keyConsiderations: [
            'Confirm ESG acknowledgment receipt (ACK1 and ACK2)',
            'Safety reports under 312.32 have strict timelines — do not delay for non-critical issues',
            'Retain ESG transmission log for regulatory files',
          ],
        },
        timeline: {
          typicalStartWeek: 10,
          typicalDurationWeeks: 1,
          fdaMilestone: 'IND Amendment Submission',
        },
        deliverables: [
          'FDA ESG submission acknowledgment (ACK1/ACK2)',
          'Submission confirmation record',
        ],
      },
      {
        id: 'archive_log',
        name: 'Archive and log amendment',
        estimatedHours: 2,
        role: 'regulatory_ops',
        description:
          'Archive the complete amendment package and update the IND submission log with the new sequence entry.',
        timeline: { typicalStartWeek: 10, typicalDurationWeeks: 1 },
        deliverables: [
          'Archived amendment package',
          'Updated IND submission log',
          'Amendment tracking record',
        ],
      },
    ],
    phase4.completeId,
  );
  phases.push(phase5.phase);

  // ─── Aggregate ──────────────────────────────────────────────────────────────

  const tasks = phases.flatMap(phase => phase.tasks);
  const totalEstimatedHours = tasks.reduce(
    (sum, t) => sum + t.estimatedHours,
    0,
  );
  const criticalPathIds = tasks
    .filter(t => t.critical)
    .map(t => t.id);

  return {
    type: 'IND_AMENDMENT',
    phases,
    tasks,
    totalEstimatedHours,
    criticalPathIds,
  };
}
