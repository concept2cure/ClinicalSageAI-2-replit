/**
 * Industry Context Templates — Concept2Cure (C2C) / AnA 1.0 RI
 *
 * Pre-built templates that populate Global.md and Local.md when a new
 * client or project is created. Each template provides industry-specific
 * sections with real regulatory references.
 *
 * Templates are pure data — no DB access needed.
 *
 * @module server/services/industry-context-templates
 * NEVER "ClinicalSageAI" — only "Concept2Cure", "C2C", or "AnA 1.0 RI"
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type CompanyType =
  | 'biotech'
  | 'pharma'
  | 'medical_device'
  | 'combination_product'
  | 'cell_gene_therapy'
  | 'biosimilar';

export type ProjectType =
  | 'IND'
  | 'NDA_BLA'
  | '510k'
  | 'PMA'
  | 'EU_CTD_MAA'
  | 'PMDA_JNDA'
  | 'ANDA'
  | 'biosimilar'
  | 'device_EU_MDR';

export interface TemplateSection {
  key: string;
  label: string;
  description: string;
  defaultContent?: string;
  isRequired: boolean;
}

export interface CompanyTemplate {
  companyType: CompanyType;
  label: string;
  sections: TemplateSection[];
}

export interface ProjectTemplate {
  projectType: ProjectType;
  label: string;
  sections: TemplateSection[];
}

export interface AgencyConvention {
  agency: string;
  fullName: string;
  sections: Array<{
    key: string;
    label: string;
    description: string;
    defaultContent?: string;
  }>;
}

// ─── Company Type Templates ─────────────────────────────────────────────────

const COMPANY_TEMPLATES: Record<CompanyType, CompanyTemplate> = {
  biotech: {
    companyType: 'biotech',
    label: 'Biotechnology Company',
    sections: [
      { key: 'org_context', label: 'About Your Company', description: 'Stage, funding, partnerships, platform technology', isRequired: true },
      { key: 'platform_tech', label: 'Platform Technology', description: 'Modality (small molecule, biologic, ADC, cell therapy, gene therapy, RNA, peptide)', isRequired: true },
      { key: 'pipeline', label: 'Pipeline Assets', description: 'INN/USAN, mechanism, target, indication(s), phase per asset', isRequired: true },
      { key: 'regulatory_identity', label: 'Regulatory Identity', description: 'Pathways (IND, BLA), FDA divisions, special designations (orphan, breakthrough, RMAT, fast track)', isRequired: true },
      { key: 'cmc_manufacturing', label: 'CMC & Manufacturing', description: 'Drug substance/product sites, process stage, CDMOs, stability', isRequired: false },
      { key: 'safety_pv', label: 'Safety & Pharmacovigilance', description: 'SUSAR reporting, safety database, REMS, RMP status', isRequired: false },
      { key: 'cro_cdmo', label: 'CRO/CDMO Partnerships', description: 'Which CROs manage which studies, CDMO relationships', isRequired: false },
      { key: 'biomarker_strategy', label: 'Biomarker Strategy', description: 'Companion diagnostics, enrichment strategies, adaptive designs', isRequired: false },
    ],
  },
  pharma: {
    companyType: 'pharma',
    label: 'Pharmaceutical Company',
    sections: [
      { key: 'org_context', label: 'About Your Company', description: 'Portfolio, therapeutic areas, global footprint', isRequired: true },
      { key: 'pipeline', label: 'Pipeline & Marketed Products', description: 'Development assets + approved products, indications, post-marketing commitments', isRequired: true },
      { key: 'regulatory_identity', label: 'Regulatory Identity', description: 'Global regulatory strategy, division relationships, meeting history', isRequired: true },
      { key: 'commercial', label: 'Commercial & Market Access', description: 'Brand names, REMS, Orange Book listings, patent expiry, exclusivity', isRequired: false },
      { key: 'quality_systems', label: 'Quality Systems', description: 'GMP history, FDA 483s/warning letters, CAPA maturity, 21 CFR Part 11/Annex 11', isRequired: false },
      { key: 'cmc_manufacturing', label: 'CMC & Manufacturing', description: 'Manufacturing sites, process validation, stability programs', isRequired: false },
      { key: 'global_reg_ops', label: 'Global Regulatory Operations', description: 'eCTD publishing, variation strategy (Type IA/IB/II), renewals', isRequired: false },
      { key: 'pharmacovigilance', label: 'Pharmacovigilance', description: 'Signal detection, PSUR/PBRER/DSUR calendar, PSMF, QPPV', isRequired: false },
      { key: 'safety_pv', label: 'Safety Database', description: 'MedDRA coding, aggregate reporting, literature monitoring', isRequired: false },
      { key: 'lifecycle', label: 'Lifecycle Management', description: 'Line extensions, new formulations, sNDA/sBLA strategy', isRequired: false },
    ],
  },
  medical_device: {
    companyType: 'medical_device',
    label: 'Medical Device Company',
    sections: [
      { key: 'device_class', label: 'Device Classification & Pathway', description: 'Class I/II/III, product codes, 510(k)/PMA/De Novo, EU MDR class', isRequired: true },
      { key: 'design_controls', label: 'Design Controls', description: 'DHF status per 21 CFR 820 / ISO 13485, design I/O/V&V traceability', isRequired: true },
      { key: 'risk_management', label: 'Risk Management', description: 'ISO 14971 risk file, hazard analysis, FMEA, risk-benefit', isRequired: true },
      { key: 'usability', label: 'Usability Engineering', description: 'IEC 62366 formative/summative studies', isRequired: false },
      { key: 'clinical_evidence', label: 'Clinical Evidence', description: 'CER (EU MDR Art. 61), CIP, PMCF plan, RWE', isRequired: false },
      { key: 'manufacturing', label: 'Manufacturing & Quality', description: 'ISO 13485 sites, sterilization, ISO 10993 biocompatibility, packaging', isRequired: false },
      { key: 'notified_body', label: 'Notified Body / Third-Party', description: 'NB name/number, audit schedule, technical file status', isRequired: false },
      { key: 'samd_cyber', label: 'SaMD & Cybersecurity', description: 'IEC 62304 software class, cybersecurity per FDA guidance', isRequired: false },
      { key: 'udi', label: 'UDI & Labeling', description: 'Unique Device Identification status, labeling compliance', isRequired: false },
    ],
  },
  combination_product: {
    companyType: 'combination_product',
    label: 'Combination Product',
    sections: [
      { key: 'constituents', label: 'Constituent Parts', description: 'Drug/biologic + device identification', isRequired: true },
      { key: 'lead_center', label: 'Lead Center Designation', description: 'CDER, CBER, or CDRH — determines primary review', isRequired: true },
      { key: 'cross_center', label: 'Cross-Center Consultation', description: 'Which centers are consulted, intercenter agreement status', isRequired: true },
      { key: 'gmp_dual', label: 'Dual GMP Compliance', description: '21 CFR Part 4 — drug cGMP + device QSR requirements', isRequired: true },
      { key: 'reg_strategy', label: 'Regulatory Strategy', description: 'Single vs co-packaged vs cross-labeled, submission pathway', isRequired: true },
    ],
  },
  cell_gene_therapy: {
    companyType: 'cell_gene_therapy',
    label: 'Cell & Gene Therapy',
    sections: [
      { key: 'cber_otat', label: 'CBER/OTAT Division', description: 'Division engagement, IND/BLA pathway', isRequired: true },
      { key: 'manufacturing', label: 'Manufacturing', description: 'Autologous vs allogeneic, viral vector production, GMP compliance', isRequired: true },
      { key: 'chain_custody', label: 'Chain of Custody/Identity', description: 'Tracking from collection to administration', isRequired: true },
      { key: 'long_term_fu', label: 'Long-Term Follow-Up', description: '15-year follow-up plan per FDA guidance', isRequired: true },
      { key: 'rmat', label: 'RMAT Designation', description: 'Regenerative Medicine Advanced Therapy status', isRequired: false },
      { key: 'tumorigenicity', label: 'Tumorigenicity & Safety', description: 'Insertional mutagenesis risk assessment', isRequired: false },
      { key: 'viral_vector', label: 'Viral Vector Details', description: 'Vector type, tropism, manufacturing, shedding studies', isRequired: false },
    ],
  },
  biosimilar: {
    companyType: 'biosimilar',
    label: 'Biosimilar Developer',
    sections: [
      { key: 'reference_product', label: 'Reference Product', description: 'Name, BLA number, approval date, manufacturer', isRequired: true },
      { key: 'analytical', label: 'Analytical Similarity', description: 'Assessment plan, critical quality attributes, functional assays', isRequired: true },
      { key: 'pk_pd', label: 'PK/PD Biosimilarity', description: 'Study design, equivalence margins, endpoints', isRequired: true },
      { key: 'clinical', label: 'Clinical Biosimilarity', description: 'Comparative efficacy study, switching study design', isRequired: true },
      { key: 'immunogenicity', label: 'Immunogenicity', description: 'Comparative immunogenicity assessment, ADA assays', isRequired: true },
      { key: 'interchangeability', label: 'Interchangeability', description: 'Switching study data if pursuing interchangeable designation', isRequired: false },
      { key: 'patent_dance', label: 'BPCIA Patent Dance', description: '42 USC 262(l) timeline, patent litigation strategy', isRequired: false },
    ],
  },
};

// ─── Project Type Templates ─────────────────────────────────────────────────

const PROJECT_TEMPLATES: Record<ProjectType, ProjectTemplate> = {
  IND: {
    projectType: 'IND',
    label: 'Investigational New Drug (IND)',
    sections: [
      { key: 'ind_info', label: 'IND Information', description: 'IND serial number, submission date, FDA division', isRequired: true },
      { key: 'pre_ind', label: 'Pre-IND Meeting', description: 'Meeting minutes, agreements, outstanding items', isRequired: false },
      { key: 'clinical_hold', label: 'Clinical Hold Status', description: 'Current hold status, resolution timeline', isRequired: false },
      { key: 'annual_report', label: 'Annual Report', description: 'Due date, content requirements per 21 CFR 312.33', isRequired: false },
      { key: 'safety_reporting', label: 'Safety Reporting', description: 'IND safety reports: 7-day (fatal/life-threatening), 15-day (serious unexpected)', isRequired: true },
      { key: 'protocol_amendments', label: 'Protocol Amendments', description: 'Amendment log with dates and rationale', isRequired: false },
      { key: 'info_amendments', label: 'Information Amendments', description: 'CMC updates, nonclinical updates, protocol changes', isRequired: false },
    ],
  },
  NDA_BLA: {
    projectType: 'NDA_BLA',
    label: 'NDA / BLA Submission',
    sections: [
      { key: 'submission_type', label: 'Submission Type', description: '505(b)(1), 505(b)(2), 351(a), 351(k)', isRequired: true },
      { key: 'pdufa_date', label: 'PDUFA Target Date', description: 'Planned submission and target PDUFA date', isRequired: true },
      { key: 'pre_nda_meeting', label: 'Pre-NDA/Pre-BLA Meeting', description: 'Meeting outcomes, agreed review division, endpoints', isRequired: false },
      { key: 'advisory_committee', label: 'Advisory Committee', description: 'Panel assignment, preparation status, briefing document', isRequired: false },
      { key: 'labeling', label: 'Labeling', description: 'Draft PI/USPI, labeling negotiations, REMS if required', isRequired: false },
      { key: 'pmr_pmc', label: 'PMR/PMC', description: 'Anticipated post-marketing requirements and commitments', isRequired: false },
    ],
  },
  '510k': {
    projectType: '510k',
    label: '510(k) Premarket Notification',
    sections: [
      { key: 'predicate', label: 'Predicate Device(s)', description: 'Name, manufacturer, 510(k) number, clearance date', isRequired: true },
      { key: 'se_argument', label: 'Substantial Equivalence', description: 'SE argument summary, comparison methodology', isRequired: true },
      { key: 'performance_testing', label: 'Performance Testing', description: 'Bench, animal, clinical testing checklist', isRequired: true },
      { key: 'pathway', label: 'Pathway Selection', description: 'Traditional vs Special vs Abbreviated 510(k)', isRequired: true },
      { key: 'estar', label: 'eSTAR Template', description: 'FDA eSTAR completion status, section tracking', isRequired: false },
      { key: 'standards', label: 'Consensus Standards', description: 'ASTM, ISO, IEC standards cited with numbers', isRequired: false },
    ],
  },
  PMA: {
    projectType: 'PMA',
    label: 'Premarket Approval (PMA)',
    sections: [
      { key: 'pma_info', label: 'PMA Information', description: 'PMA number (if supplement), panel track, original approval date', isRequired: true },
      { key: 'clinical_data', label: 'Clinical Trial Data', description: 'Pivotal study summary, endpoints, patient population', isRequired: true },
      { key: 'manufacturing', label: 'Manufacturing', description: 'Manufacturing sites, process controls, sterilization', isRequired: true },
      { key: 'advisory_panel', label: 'Advisory Panel', description: 'Panel assignment, meeting preparation status', isRequired: false },
      { key: 'supplement_strategy', label: 'Supplement Strategy', description: '180-day, real-time, 30-day, or annual report supplements', isRequired: false },
    ],
  },
  EU_CTD_MAA: {
    projectType: 'EU_CTD_MAA',
    label: 'EU CTD / MAA Submission',
    sections: [
      { key: 'procedure_type', label: 'Procedure Type', description: 'Centralised, Decentralised, Mutual Recognition, National', isRequired: true },
      { key: 'rms_cms', label: 'RMS/CMS or Rapporteur', description: 'RMS/CMS assignments (DCP/MRP) or Rapporteur/Co-rapporteur (CP)', isRequired: true },
      { key: 'day_clock', label: 'Day Clock Tracking', description: 'Day 80, 120, 150, 180/210 milestones and current status', isRequired: true },
      { key: 'loq_tracking', label: 'LoQ / LoOI Tracking', description: 'List of Questions and Outstanding Issues status', isRequired: false },
      { key: 'scientific_advice', label: 'Scientific Advice', description: 'Reference numbers, outcomes, protocol assistance', isRequired: false },
      { key: 'pip', label: 'Pediatric Investigation Plan', description: 'PIP compliance, waivers, deferrals', isRequired: false },
    ],
  },
  PMDA_JNDA: {
    projectType: 'PMDA_JNDA',
    label: 'PMDA / J-NDA Submission',
    sections: [
      { key: 'consultation', label: 'Consultation Records', description: 'PMDA consultation record numbers and outcomes', isRequired: true },
      { key: 'bridging', label: 'Bridging Study Strategy', description: 'Bridging study design, MHLW acceptance, ethnic sensitivity', isRequired: true },
      { key: 'ctd_j', label: 'CTD-J Requirements', description: 'Japan-specific CTD requirements and formatting', isRequired: true },
      { key: 'gcp_inspection', label: 'GCP Inspection Readiness', description: 'PMDA GCP inspection preparation status', isRequired: false },
      { key: 'pricing', label: 'NHI Pricing', description: 'NHI drug price listing timeline and strategy', isRequired: false },
    ],
  },
  ANDA: {
    projectType: 'ANDA',
    label: 'Abbreviated New Drug Application (ANDA)',
    sections: [
      { key: 'rld', label: 'Reference Listed Drug', description: 'RLD name, NDA number, Orange Book listing', isRequired: true },
      { key: 'bioequivalence', label: 'Bioequivalence', description: 'BE study design, fed/fasted, PK endpoints', isRequired: true },
      { key: 'paragraph_iv', label: 'Paragraph IV Certification', description: 'Patent challenge status, ANDA litigation timeline', isRequired: false },
      { key: 'formulation', label: 'Formulation', description: 'Q1/Q2 sameness, dissolution, excipient comparison', isRequired: true },
      { key: 'manufacturing', label: 'Manufacturing', description: 'Site, process, batch data, stability', isRequired: true },
    ],
  },
  biosimilar: {
    projectType: 'biosimilar',
    label: 'Biosimilar Application (351(k))',
    sections: [
      { key: 'reference_bla', label: 'Reference Product BLA', description: 'Reference biologic, BLA number, approval history', isRequired: true },
      { key: 'totality', label: 'Totality of Evidence', description: 'Stepwise approach: analytical → PK/PD → clinical', isRequired: true },
      { key: 'analytical', label: 'Analytical Similarity', description: 'CQA comparison, functional assays, tier classification', isRequired: true },
      { key: 'clinical_study', label: 'Clinical Study', description: 'Comparative efficacy, switching, endpoints', isRequired: true },
      { key: 'immunogenicity', label: 'Immunogenicity', description: 'ADA incidence comparison, NAb assessment', isRequired: true },
      { key: 'extrapolation', label: 'Extrapolation', description: 'Indication extrapolation justification', isRequired: false },
    ],
  },
  device_EU_MDR: {
    projectType: 'device_EU_MDR',
    label: 'EU MDR Device Submission',
    sections: [
      { key: 'gspr', label: 'GSPR Checklist', description: 'Annex I General Safety and Performance Requirements completion', isRequired: true },
      { key: 'cer', label: 'Clinical Evaluation Report', description: 'CER per MEDDEV 2.7/1 rev 4, EU MDR Article 61', isRequired: true },
      { key: 'pmcf', label: 'Post-Market Clinical Follow-up', description: 'PMCF plan and study design', isRequired: true },
      { key: 'notified_body', label: 'Notified Body', description: 'NB selection, conformity assessment route, audit schedule', isRequired: true },
      { key: 'technical_file', label: 'Technical Documentation', description: 'Technical file per Annex II/III, design dossier', isRequired: true },
      { key: 'mdr_transition', label: 'MDR Transition', description: 'MDD to MDR transition timeline and gaps', isRequired: false },
    ],
  },
};

// ─── Agency Conventions ─────────────────────────────────────────────────────

const AGENCY_CONVENTIONS: Record<string, AgencyConvention> = {
  FDA: {
    agency: 'FDA',
    fullName: 'U.S. Food and Drug Administration',
    sections: [
      { key: 'ectd', label: 'eCTD Submission', description: 'Module 1-5 structure, regional M1 requirements, ESG gateway' },
      { key: 'meetings', label: 'Meeting Types', description: 'Type A (30 days), Type B (60 days), Type C (75 days), Pre-Sub (device)' },
      { key: 'forms', label: 'Key Forms', description: 'FDA 1571 (IND cover), 1572 (investigator), 3674 (financial disclosure), 356h (application)' },
      { key: 'fees', label: 'User Fee Programs', description: 'PDUFA VII, MDUFA V, GDUFA III, BsUFA III schedules' },
      { key: 'guidance', label: 'Guidance Tracking', description: 'Relevant draft/final guidances for your products' },
      { key: 'divisions', label: 'Review Divisions', description: 'OND/CDER, CBER, CDRH divisions and contacts' },
    ],
  },
  EMA: {
    agency: 'EMA',
    fullName: 'European Medicines Agency',
    sections: [
      { key: 'procedures', label: 'Authorization Procedures', description: 'Centralised (CP), Decentralised (DCP), Mutual Recognition (MRP), National' },
      { key: 'scientific_advice', label: 'Scientific Advice', description: 'Protocol assistance, qualification of biomarkers, PRIME scheme' },
      { key: 'pip', label: 'Pediatric Requirements', description: 'PIP compliance, waiver/deferral, PDCO interactions' },
      { key: 'variations', label: 'Post-Authorization Changes', description: 'Type IA, IB, II variations; extensions of indication' },
      { key: 'eaf', label: 'Application Forms', description: 'eAF requirements, Annex I/II/III content' },
      { key: 'pharmacovigilance', label: 'Pharmacovigilance', description: 'PRAC, PSUR/PBRER, RMP, signal management' },
    ],
  },
  PMDA: {
    agency: 'PMDA',
    fullName: 'Pharmaceuticals and Medical Devices Agency (Japan)',
    sections: [
      { key: 'consultation', label: 'Consultation System', description: 'Pre-application, mid-review, GMP/GLP/GCP consultations' },
      { key: 'review', label: 'Review Timeline', description: 'Standard, priority, conditional early approval pathways' },
      { key: 'bridging', label: 'Bridging & Ethnic Sensitivity', description: 'ICH E5, bridging study design, Japanese subpopulation data' },
      { key: 'sakigake', label: 'SAKIGAKE Designation', description: 'Priority review for innovative therapies' },
      { key: 'ctd_j', label: 'CTD-J Formatting', description: 'Japan-specific CTD requirements and Module 1.12' },
    ],
  },
  Health_Canada: {
    agency: 'Health_Canada',
    fullName: 'Health Canada / Santé Canada',
    sections: [
      { key: 'noc', label: 'NOC / NOC-c Pathways', description: 'Notice of Compliance, NOC with conditions, priority review' },
      { key: 'din', label: 'DIN Application', description: 'Drug Identification Number, NDS/ANDS/SNDS requirements' },
      { key: 'sap', label: 'Special Access Programme', description: 'Emergency/compassionate use provisions' },
      { key: 'clinical_trials', label: 'Clinical Trial Application', description: 'CTA filing requirements, NOL process' },
    ],
  },
  TGA: {
    agency: 'TGA',
    fullName: 'Therapeutic Goods Administration (Australia)',
    sections: [
      { key: 'ctn_ctx', label: 'CTN / CTX Pathways', description: 'Clinical Trial Notification vs Exemption schemes' },
      { key: 'artg', label: 'ARTG Inclusion', description: 'Australian Register of Therapeutic Goods requirements' },
      { key: 'provisional', label: 'Provisional Approval', description: 'Provisional determination and approval pathway' },
      { key: 'priority', label: 'Priority Review', description: 'Priority review designation criteria and process' },
    ],
  },
  NMPA: {
    agency: 'NMPA',
    fullName: 'National Medical Products Administration (China)',
    sections: [
      { key: 'cde_review', label: 'CDE Review Process', description: 'Center for Drug Evaluation review pathways' },
      { key: 'mah', label: 'MAH System', description: 'Marketing Authorization Holder system requirements' },
      { key: 'bridging', label: 'Ethnic Sensitivity', description: 'China-specific bridging and ethnic factors assessment' },
      { key: 'clinical_waiver', label: 'Clinical Trial Waiver', description: 'Eligibility criteria for clinical trial waivers' },
    ],
  },
  ICH: {
    agency: 'ICH',
    fullName: 'International Council for Harmonisation',
    sections: [
      { key: 'ctd', label: 'CTD/eCTD Structure', description: 'ICH M4 Module 1-5 organization' },
      { key: 'gcp', label: 'GCP Requirements', description: 'ICH E6(R3) GCP principles and requirements' },
      { key: 'quality', label: 'Quality Guidelines', description: 'ICH Q8-Q12 pharmaceutical development framework' },
      { key: 'clinical', label: 'Clinical Guidelines', description: 'ICH E8(R1), E9(R1), E17 multi-regional trial design' },
      { key: 'safety', label: 'Safety Guidelines', description: 'ICH S guidelines for nonclinical evaluation' },
    ],
  },
};

// ─── Public API ─────────────────────────────────────────────────────────────

/** Get all available company types with labels */
export function getCompanyTypes(): Array<{ value: CompanyType; label: string }> {
  return Object.values(COMPANY_TEMPLATES).map(t => ({
    value: t.companyType,
    label: t.label,
  }));
}

/** Get all available project types with labels */
export function getProjectTypes(): Array<{ value: ProjectType; label: string }> {
  return Object.values(PROJECT_TEMPLATES).map(t => ({
    value: t.projectType,
    label: t.label,
  }));
}

/** Get all supported regulatory agencies */
export function getAgencies(): Array<{ value: string; label: string }> {
  return Object.values(AGENCY_CONVENTIONS).map(a => ({
    value: a.agency,
    label: a.fullName,
  }));
}

/** Get a specific company template by type */
export function getCompanyTemplate(companyType: CompanyType): CompanyTemplate {
  return COMPANY_TEMPLATES[companyType] ?? COMPANY_TEMPLATES.biotech;
}

/** Get a specific project template by type */
export function getProjectTemplate(projectType: ProjectType): ProjectTemplate {
  return PROJECT_TEMPLATES[projectType] ?? PROJECT_TEMPLATES.IND;
}

/** Get agency-specific convention template */
export function getAgencyConventions(agency: string): AgencyConvention | null {
  return AGENCY_CONVENTIONS[agency] ?? null;
}

/** Get merged template for a specific company + project + agencies combination */
export function getTemplateForContext(
  companyType: CompanyType,
  projectType: ProjectType,
  agencies: string[]
): {
  companySections: TemplateSection[];
  projectSections: TemplateSection[];
  agencySections: Array<{ agency: string; sections: TemplateSection[] }>;
} {
  const company = getCompanyTemplate(companyType);
  const project = getProjectTemplate(projectType);

  const agencySections = agencies
    .map(a => {
      const convention = getAgencyConventions(a);
      if (!convention) return null;
      return {
        agency: convention.agency,
        sections: convention.sections.map(s => ({
          ...s,
          isRequired: false,
        })),
      };
    })
    .filter(Boolean) as Array<{ agency: string; sections: TemplateSection[] }>;

  return {
    companySections: company.sections,
    projectSections: project.sections,
    agencySections,
  };
}
