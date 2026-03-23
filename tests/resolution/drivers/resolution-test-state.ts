/**
 * Resolution Test State — In-Memory State Store
 *
 * Single source of truth for all test state. Every driver reads/writes here.
 * Reset between tests to prevent contamination.
 *
 * This is NOT a mock. It's a model of reality.
 */

export interface TestSupersessionRecord {
  id: string;
  organizationId: number;
  projectId: number;
  supersededObjectType: string;
  supersededObjectId: string;
  supersededObjectTitle?: string;
  successorObjectType: string;
  successorObjectId: string;
  successorObjectTitle?: string;
  state: 'proposed' | 'confirmed' | 'reverted';
  rationale: string;
  resolutionPlanId?: string;
  bundleId?: string;
  createdById: number;
  confirmedById?: number;
  createdAt: Date;
  confirmedAt?: Date;
}

export interface TestArtifact {
  id: string;
  organizationId: number;
  title: string;
  status: 'draft' | 'review' | 'approved' | 'published' | 'locked' | 'archived';
  versions: TestArtifactVersion[];
}

export interface TestArtifactVersion {
  artifactId: string;
  version: number;
  content: string;
  contentHash: string;
  changeDescription: string;
  createdById: number;
  createdAt: Date;
}

export interface TestDocument {
  id: string;
  organizationId: number;
  title: string;
  status: 'draft' | 'review' | 'approved' | 'published' | 'locked';
}

export interface TestAssumption {
  id: string;
  organizationId: number;
  title: string;
  // Assumptions don't have a status column — supersession state comes from supersession records
}

export interface TestBundle {
  id: string;
  organizationId: number;
  projectId: number;
  planId: string | null;
  title: string;
  description: string;
  state: string;
  confidence: string;
  requiresReview: boolean;
  requiresReapproval: boolean;
  createdById: number;
  resolutionMemo: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestPlan {
  id: string;
  organizationId: number;
  projectId: number;
  state: string;
  triggerType: string;
  triggerId: string;
  triggerDescription: string;
  recommendedPath: string;
  confidence: string;
  requiresReview: boolean;
  requiresReapproval: boolean;
  requiresEscalation: boolean;
  affectedObjects: any[];
  alternativePaths: any[];
  rationale: string;
  createdById: number;
  bundleId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestBundleItem {
  id: string;
  bundleId: string;
  objectType: string;
  objectId: string;
  objectTitle: string | null;
  actionType: string;
  actionDescription: string;
  status: string;
  preparedContent: string | null;
  preparedContentConfidence: string | null;
  sectionCode: string | null;
  impactRationale: string | null;
  sortOrder: number;
  completedAt: Date | null;
  completedById: number | null;
  createdAt: Date;
}

/**
 * The state store. Every test driver reads from and writes to this.
 * Call reset() in beforeEach.
 */
export class ResolutionTestState {
  supersessions: TestSupersessionRecord[] = [];
  artifacts: TestArtifact[] = [];
  documents: TestDocument[] = [];
  assumptions: TestAssumption[] = [];
  bundles: TestBundle[] = [];
  plans: TestPlan[] = [];
  bundleItems: TestBundleItem[] = [];

  reset(): void {
    this.supersessions = [];
    this.artifacts = [];
    this.documents = [];
    this.assumptions = [];
    this.bundles = [];
    this.plans = [];
    this.bundleItems = [];
  }
}
