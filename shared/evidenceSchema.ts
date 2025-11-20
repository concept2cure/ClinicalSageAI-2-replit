// Evidence Graph Schema for CERV2 Document Generation
// This schema normalizes all feature outputs to feed into 510(k) document generation

export interface EvidenceNode {
  id: string;
  sourceRef: string; // Panel ID or external URI (e.g., 'risk-assessment', 'predicate-finder', 'pubmed')
  evidenceType: EvidenceType;
  category: EvidenceCategory;
  timestamp: Date;
  confidence: number; // 0-1 confidence score
  validationStatus: ValidationStatus;
  data: any; // Flexible data payload
  metadata: {
    author?: string;
    version?: string;
    attachments?: string[];
    reviewStatus?: string;
    approvalDate?: Date;
  };
  citations: Citation[];
}

export enum EvidenceType {
  // Device Information
  DEVICE_PROFILE = 'device_profile',
  DEVICE_SPECIFICATION = 'device_specification',
  
  // Regulatory
  PREDICATE_DEVICE = 'predicate_device',
  SUBSTANTIAL_EQUIVALENCE = 'substantial_equivalence',
  REGULATORY_COMPLIANCE = 'regulatory_compliance',
  
  // Clinical & Literature
  LITERATURE_ARTICLE = 'literature_article',
  CLINICAL_TRIAL = 'clinical_trial',
  STATISTICAL_ANALYSIS = 'statistical_analysis',
  
  // Risk & Safety
  RISK_ASSESSMENT = 'risk_assessment',
  RISK_MITIGATION = 'risk_mitigation',
  ADVERSE_EVENT = 'adverse_event',
  MAUDE_REPORT = 'maude_report',
  
  // Testing
  BENCH_TEST = 'bench_test',
  BIOCOMPATIBILITY_TEST = 'biocompatibility_test',
  ELECTRICAL_SAFETY_TEST = 'electrical_safety_test',
  SOFTWARE_VALIDATION = 'software_validation',
  STERILIZATION_VALIDATION = 'sterilization_validation',
  
  // Manufacturing & QC
  MANUFACTURING_PROCESS = 'manufacturing_process',
  QUALITY_CONTROL = 'quality_control',
  SUPPLIER_AUDIT = 'supplier_audit',
  NONCONFORMANCE_LOG = 'nonconformance_log',
  
  // Timeline & Planning
  TIMELINE_MILESTONE = 'timeline_milestone',
  PROJECT_DELIVERABLE = 'project_deliverable',
  
  // AI & Guidance
  AI_RECOMMENDATION = 'ai_recommendation',
  REGULATORY_GUIDANCE = 'regulatory_guidance',
  
  // Documents
  VAULT_DOCUMENT = 'vault_document',
  GENERATED_CONTENT = 'generated_content'
}

export enum EvidenceCategory {
  ADMINISTRATIVE = 'administrative',
  TECHNICAL = 'technical',
  CLINICAL = 'clinical',
  REGULATORY = 'regulatory',
  QUALITY = 'quality',
  SAFETY = 'safety'
}

export enum ValidationStatus {
  DRAFT = 'draft',
  PENDING_REVIEW = 'pending_review',
  REVIEWED = 'reviewed',
  APPROVED = 'approved',
  REJECTED = 'rejected'
}

export interface Citation {
  id: string;
  type: 'internal' | 'external' | 'database' | 'ai_generated';
  source: string;
  reference: string;
  url?: string;
  accessDate?: Date;
}

// Section-to-Evidence Mapping
export interface SectionEvidenceMap {
  sectionId: string;
  sectionName: string;
  requiredEvidence: EvidenceType[];
  optionalEvidence: EvidenceType[];
  autoPopulate: boolean;
}

export const FDA_510K_SECTION_EVIDENCE_MAP: SectionEvidenceMap[] = [
  {
    sectionId: 'cover-letter',
    sectionName: '1. Cover Letter',
    requiredEvidence: [
      EvidenceType.DEVICE_PROFILE,
      EvidenceType.REGULATORY_COMPLIANCE
    ],
    optionalEvidence: [
      EvidenceType.TIMELINE_MILESTONE,
      EvidenceType.AI_RECOMMENDATION
    ],
    autoPopulate: true
  },
  {
    sectionId: 'indications-for-use',
    sectionName: '2. Indications for Use',
    requiredEvidence: [
      EvidenceType.DEVICE_PROFILE,
      EvidenceType.CLINICAL_TRIAL
    ],
    optionalEvidence: [
      EvidenceType.LITERATURE_ARTICLE,
      EvidenceType.RISK_ASSESSMENT
    ],
    autoPopulate: true
  },
  {
    sectionId: 'device-description',
    sectionName: '3. Device Description',
    requiredEvidence: [
      EvidenceType.DEVICE_SPECIFICATION,
      EvidenceType.MANUFACTURING_PROCESS
    ],
    optionalEvidence: [
      EvidenceType.QUALITY_CONTROL,
      EvidenceType.SOFTWARE_VALIDATION
    ],
    autoPopulate: true
  },
  {
    sectionId: 'substantial-equivalence',
    sectionName: '4. Substantial Equivalence',
    requiredEvidence: [
      EvidenceType.PREDICATE_DEVICE,
      EvidenceType.SUBSTANTIAL_EQUIVALENCE
    ],
    optionalEvidence: [
      EvidenceType.RISK_ASSESSMENT,
      EvidenceType.BENCH_TEST
    ],
    autoPopulate: true
  },
  {
    sectionId: 'performance-testing',
    sectionName: '5. Performance Testing',
    requiredEvidence: [
      EvidenceType.BENCH_TEST,
      EvidenceType.ELECTRICAL_SAFETY_TEST
    ],
    optionalEvidence: [
      EvidenceType.SOFTWARE_VALIDATION,
      EvidenceType.BIOCOMPATIBILITY_TEST,
      EvidenceType.STERILIZATION_VALIDATION
    ],
    autoPopulate: true
  },
  {
    sectionId: 'biocompatibility',
    sectionName: '6. Biocompatibility',
    requiredEvidence: [],
    optionalEvidence: [
      EvidenceType.BIOCOMPATIBILITY_TEST,
      EvidenceType.LITERATURE_ARTICLE
    ],
    autoPopulate: true
  },
  {
    sectionId: 'sterilization',
    sectionName: '7. Sterilization',
    requiredEvidence: [],
    optionalEvidence: [
      EvidenceType.STERILIZATION_VALIDATION,
      EvidenceType.QUALITY_CONTROL
    ],
    autoPopulate: true
  },
  {
    sectionId: 'clinical-data',
    sectionName: '8. Clinical Data',
    requiredEvidence: [],
    optionalEvidence: [
      EvidenceType.CLINICAL_TRIAL,
      EvidenceType.LITERATURE_ARTICLE,
      EvidenceType.STATISTICAL_ANALYSIS,
      EvidenceType.ADVERSE_EVENT,
      EvidenceType.MAUDE_REPORT
    ],
    autoPopulate: true
  },
  {
    sectionId: 'labeling',
    sectionName: '9. Labeling',
    requiredEvidence: [
      EvidenceType.DEVICE_PROFILE,
      EvidenceType.REGULATORY_COMPLIANCE
    ],
    optionalEvidence: [
      EvidenceType.RISK_MITIGATION,
      EvidenceType.AI_RECOMMENDATION
    ],
    autoPopulate: true
  },
  {
    sectionId: 'certifications',
    sectionName: '10. Certifications & Statements',
    requiredEvidence: [
      EvidenceType.REGULATORY_COMPLIANCE,
      EvidenceType.QUALITY_CONTROL
    ],
    optionalEvidence: [
      EvidenceType.SUPPLIER_AUDIT,
      EvidenceType.NONCONFORMANCE_LOG
    ],
    autoPopulate: true
  }
];

// Evidence Aggregation Service Interface
export interface EvidenceAggregator {
  collectEvidence(sectionId: string): EvidenceNode[];
  addEvidence(evidence: EvidenceNode): void;
  updateEvidence(id: string, updates: Partial<EvidenceNode>): void;
  removeEvidence(id: string): void;
  getEvidenceByType(type: EvidenceType): EvidenceNode[];
  getEvidenceBySource(sourceRef: string): EvidenceNode[];
  validateEvidenceCompleteness(sectionId: string): {
    complete: boolean;
    missing: EvidenceType[];
    available: EvidenceType[];
  };
  generateCitations(evidenceIds: string[]): Citation[];
  exportEvidenceGraph(): any;
}

// Evidence Publishers (each CERV2 feature implements this)
export interface EvidencePublisher {
  publishEvidence(): EvidenceNode[];
  subscribeToChanges(callback: (evidence: EvidenceNode[]) => void): void;
  unsubscribe(): void;
}

// Document Builder Interface
export interface DocumentBuilder {
  buildSection(sectionId: string, evidence: EvidenceNode[]): {
    content: string;
    citations: Citation[];
    confidence: number;
  };
  generateFullDocument(evidenceGraph: Map<string, EvidenceNode[]>): {
    document: string;
    citations: Citation[];
    traceabilityMatrix: any;
  };
}