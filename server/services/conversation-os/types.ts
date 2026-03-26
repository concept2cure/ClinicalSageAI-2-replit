export type ToolMode = 'off' | 'auto' | 'on-demand';
export type ToolKind = 'read' | 'mutating';

export interface ConversationToolConfig {
  name: string;
  kind: ToolKind;
  enabled: boolean;
  requireExplicitPermission: boolean;
}

export interface ToolManifest {
  conversationId: string;
  mode: ToolMode;
  tools: ConversationToolConfig[];
  updatedAt: string;
}

export interface ToolEvent {
  id: string;
  conversationId: string;
  tool: string;
  action: 'allowed' | 'blocked';
  reason: string;
  timestamp: string;
}

export interface RetrievalChunk {
  id: string;
  sourceId: string;
  section?: string;
  approvedOnly?: boolean;
  text: string;
  tags: string[];
}

export interface ScoutFinding {
  id: string;
  summary: string;
  chunkIds: string[];
  createdAt: string;
  promoted: boolean;
}

export interface PlanStep {
  id: string;
  label: string;
  status: 'pending' | 'completed';
}

export interface PlanTrace {
  conversationId: string;
  task: string;
  class: 'simple' | 'hard';
  steps: PlanStep[];
  sourcesUsed: string[];
}

export interface ArtifactProposal {
  id: string;
  conversationId: string;
  artifactId: string;
  content: string;
  createdAt: string;
  status: 'pending' | 'accepted' | 'rejected';
}
