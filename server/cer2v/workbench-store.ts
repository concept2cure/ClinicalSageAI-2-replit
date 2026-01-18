export type WorkbenchEvidence = {
  id: string;
  name: string;
  type: string;
  status: string;
  hash: string;
  tags?: string[];
  linkedClaims: number;
  linkedStandards: number;
  linkedOutcomes: number;
  uploadedAt: string;
  owner: string;
};

export type WorkbenchClaim = {
  id: string;
  text: string;
  type: string;
  risk: string;
  status: string;
  strength: number;
  linkedEvidence: number;
  evidenceIds?: string[];
};

export type WorkbenchStandard = {
  id: string;
  name: string;
  requirement: string;
  status: string;
  linkedEvidence: number;
  owner: string;
  evidenceIds?: string[];
};

export type WorkbenchOutcome = {
  id: string;
  name: string;
  timepoint: string;
  comparator: string;
  confidence: string;
  status: string;
  linkedEvidence: number;
  evidenceIds?: string[];
};

export type WorkbenchData = {
  evidence: WorkbenchEvidence[];
  claims: WorkbenchClaim[];
  standards: WorkbenchStandard[];
  outcomes: WorkbenchOutcome[];
};

export const createEmptyWorkbenchData = (): WorkbenchData => ({
  evidence: [],
  claims: [],
  standards: [],
  outcomes: [],
});

export const getWorkbenchData = (_key: string): WorkbenchData => createEmptyWorkbenchData();
