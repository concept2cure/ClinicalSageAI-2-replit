// Core CSR Report types
export interface CsrReport {
  id: number;
  title: string;
  sponsor: string;
  indication: string;
  phase: string;
  status: 'Processing' | 'Processed' | 'Failed';
  date: string;
  uploadDate: string | Date;
  summary: string;
  fileName: string;
  fileSize: number;
}

export interface TreatmentArm {
  arm: string;
  intervention: string;
  dosingRegimen: string;
  participants: number;
}

export interface Endpoints {
  primary: string;
  secondary: string[];
}

export interface Results {
  primaryResults: string;
  secondaryResults: string;
  biomarkerResults: string;
}

export interface Safety {
  overallSafety: string;
  ariaResults?: string;
  commonAEs: string;
  severeEvents?: string;
  discontinuationRates?: string;
}

export interface CsrDetails {
  id: number;
  reportId: number;
  studyDesign: string;
  primaryObjective: string;
  studyDescription: string;
  inclusionCriteria: string;
  exclusionCriteria: string;
  treatmentArms: TreatmentArm[];
  studyDuration: string;
  endpoints: Endpoints;
  results: Results;
  safety: Safety;
  processed: boolean;
}

// Dashboard stats
export interface Stats {
  totalReports: number;
  processedReports: number;
  dataPointsExtracted: number;
  processingTimeSaved: number;
}

// Upload form data
export interface UploadFormData {
  title: string;
  sponsor: string;
  indication: string;
  phase: string;
  file: File | null;
}
