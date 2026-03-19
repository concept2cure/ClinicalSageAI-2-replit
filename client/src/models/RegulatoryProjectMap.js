/**
 * Regulatory Project Map Model
 *
 * This model serves as the "brain" of the Concept2Cure Project Manager.
 * It defines the structure of different project types, their phases,
 * required documents, milestones, and regulatory guidelines sources.
 *
 * This data model drives:
 * - Dashboard project tiles
 * - Next action tasks
 * - Deep links into real modules
 * - Risk alerts
 */

const RegulatoryProjectMap = {
  projectTypes: {
    IND: {
      id: 'ind_submission',
      name: 'IND Submission',
      description: 'Investigational New Drug application process',
      phases: [
        { id: 'pre_ind', name: 'Pre-IND', order: 1 },
        { id: 'initial_ind', name: 'Initial IND', order: 2 },
        { id: 'amendments', name: 'Amendments', order: 3 },
        { id: 'clinical_phase', name: 'Clinical Phase', order: 4 },
        { id: 'nda_bla', name: 'NDA/BLA', order: 5 },
      ],
      requiredDocuments: [
        { id: 'form_1571', name: 'Form 1571', phase: 'initial_ind', required: true },
        { id: 'protocol', name: 'Protocol', phase: 'initial_ind', required: true },
        {
          id: 'investigator_brochure',
          name: 'Investigator Brochure',
          phase: 'initial_ind',
          required: true,
        },
        { id: 'cmc_module_3', name: 'CMC Module 3', phase: 'initial_ind', required: true },
        {
          id: 'nonclinical_study_reports',
          name: 'Nonclinical Study Reports',
          phase: 'initial_ind',
          required: true,
        },
        { id: 'safety_reports', name: 'Safety Reports', phase: 'clinical_phase', required: true },
      ],
      guidelines: ['FDA Guidance for Industry', 'ICH M4', 'ICH E6(R2)'],
      moduleLink: '/ind-wizard',
      iconColor: 'amber',
    },
    CSR: {
      id: 'csr_submission',
      name: 'CSR Submission',
      description: 'Clinical Study Report preparation and submission',
      phases: [
        { id: 'study_conduct', name: 'Study Conduct', order: 1 },
        { id: 'csr_drafting', name: 'CSR Drafting', order: 2 },
        { id: 'csr_finalization', name: 'CSR Finalization', order: 3 },
      ],
      requiredDocuments: [
        {
          id: 'clinical_study_report',
          name: 'Clinical Study Report (E3 Format)',
          phase: 'csr_finalization',
          required: true,
        },
        {
          id: 'analysis_datasets',
          name: 'Analysis Datasets',
          phase: 'csr_drafting',
          required: true,
        },
        {
          id: 'investigator_site_list',
          name: 'Investigator Site List',
          phase: 'study_conduct',
          required: true,
        },
      ],
      guidelines: ['ICH E3'],
      moduleLink: '/csr-analyzer',
      iconColor: 'indigo',
    },
    CER: {
      id: 'cer_submission',
      name: 'CER Submission',
      description: 'Clinical Evaluation Report for medical devices',
      phases: [
        { id: 'literature_review', name: 'Literature Review', order: 1 },
        { id: 'evaluation_plan', name: 'Evaluation Plan', order: 2 },
        { id: 'evaluation_report', name: 'Evaluation Report', order: 3 },
      ],
      requiredDocuments: [
        { id: 'cer_plan', name: 'CER Plan', phase: 'evaluation_plan', required: true },
        {
          id: 'clinical_literature_search',
          name: 'Clinical Literature Search',
          phase: 'literature_review',
          required: true,
        },
        {
          id: 'clinical_evaluation_report',
          name: 'Clinical Evaluation Report',
          phase: 'evaluation_report',
          required: true,
        },
      ],
      guidelines: ['MEDDEV 2.7.1 Rev 4', 'EU MDR 2017/745'],
      moduleLink: '/cer-generator',
      iconColor: 'emerald',
    },
    CRC: {
      id: 'crc_site_management',
      name: 'CRC (Site Management)',
      description: 'Clinical Research Coordinator site management',
      phases: [
        { id: 'study_startup', name: 'Study Startup', order: 1 },
        { id: 'irb_approval', name: 'IRB Approval', order: 2 },
        { id: 'enrollment', name: 'Enrollment', order: 3 },
      ],
      requiredDocuments: [
        {
          id: 'site_initiation_packets',
          name: 'Site Initiation Packets',
          phase: 'study_startup',
          required: true,
        },
        {
          id: 'subject_enrollment_logs',
          name: 'Subject Enrollment Logs',
          phase: 'enrollment',
          required: true,
        },
        { id: 'irb_letters', name: 'IRB Letters', phase: 'irb_approval', required: true },
      ],
      guidelines: ['GCP', 'FDA'],
      moduleLink: '/study-architect',
      iconColor: 'blue',
    },
    CMC: {
      id: 'cmc_manufacturing',
      name: 'CMC (Manufacturing Submissions)',
      description: 'Chemistry, Manufacturing, and Controls documentation',
      phases: [
        { id: 'process_development', name: 'Process Development', order: 1 },
        { id: 'stability_studies', name: 'Stability Studies', order: 2 },
        { id: 'final_cmc_sections', name: 'Final CMC Sections', order: 3 },
      ],
      requiredDocuments: [
        {
          id: 'module_3_ctd_docs',
          name: 'Module 3 CTD Docs',
          phase: 'final_cmc_sections',
          required: true,
        },
        {
          id: 'process_validation_reports',
          name: 'Process Validation Reports',
          phase: 'process_development',
          required: true,
        },
      ],
      guidelines: ['ICH Q8/Q9/Q10'],
      moduleLink: '/cmc-wizard',
      iconColor: 'rose',
    },
    VAULT: {
      id: 'document_vault',
      name: 'Vault',
      description: 'Document storage and versioning system',
      phases: [{ id: 'storage_versioning', name: 'Storage & Versioning', order: 1 }],
      requiredDocuments: [
        {
          id: 'uploaded_documents',
          name: 'Uploaded Documents',
          phase: 'storage_versioning',
          required: false,
        },
        {
          id: 'regulatory_metadata',
          name: 'Regulatory Metadata',
          phase: 'storage_versioning',
          required: true,
        },
      ],
      guidelines: ['Internal'],
      moduleLink: '/vault',
      iconColor: 'violet',
    },
    ANALYTICS: {
      id: 'analytics_reporting',
      name: 'Analytics',
      description: 'Risk analysis and metrics reporting',
      phases: [
        { id: 'risk_analysis', name: 'Risk Analysis', order: 1 },
        { id: 'metrics_reporting', name: 'Metrics Reporting', order: 2 },
      ],
      requiredDocuments: [
        {
          id: 'submission_kpi_reports',
          name: 'Submission KPI Reports',
          phase: 'metrics_reporting',
          required: true,
        },
        { id: 'delay_alerts', name: 'Delay Alerts', phase: 'risk_analysis', required: false },
      ],
      guidelines: ['Internal'],
      moduleLink: '/analytics',
      iconColor: 'cyan',
    },
  },

  // Helper methods

  getProjectType(typeId) {
    return this.projectTypes[typeId];
  },

  getAllProjectTypes() {
    return Object.values(this.projectTypes);
  },

  getProjectPhases(typeId) {
    const projectType = this.projectTypes[typeId];
    return projectType ? projectType.phases.sort((a, b) => a.order - b.order) : [];
  },

  getRequiredDocuments(typeId, phaseId = null) {
    const projectType = this.projectTypes[typeId];
    if (!projectType) return [];

    if (phaseId) {
      return projectType.requiredDocuments.filter(doc => doc.phase === phaseId);
    }

    return projectType.requiredDocuments;
  },
};

export default RegulatoryProjectMap;
