import type {
  ArtifactProposal,
  PlanTrace,
  RetrievalChunk,
  ScoutFinding,
  ToolEvent,
  ToolManifest,
} from './types';

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

class ConversationKernelStore {
  manifests = new Map<string, ToolManifest>();
  events: ToolEvent[] = [];
  chunks = new Map<string, RetrievalChunk[]>();
  findings = new Map<string, ScoutFinding[]>();
  plans = new Map<string, PlanTrace>();
  proposals = new Map<string, ArtifactProposal[]>();
  artifactVersions = new Map<string, { version: number; content: string; acceptedAt: string }[]>();

  id() {
    return makeId();
  }
}

export const kernelStore = new ConversationKernelStore();
