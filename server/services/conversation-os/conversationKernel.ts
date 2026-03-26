import type {
  ArtifactProposal,
  PlanTrace,
  RetrievalChunk,
  ScoutFinding,
  ToolEvent,
  ToolManifest,
} from './types';
import fs from 'node:fs';
import path from 'node:path';

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const SNAPSHOT_PATH = path.resolve(process.cwd(), 'server/.cache/conversation-os-kernel.json');

type KernelSnapshot = {
  manifests: Array<[string, ToolManifest]>;
  events: ToolEvent[];
  chunks: Array<[string, RetrievalChunk[]]>;
  findings: Array<[string, ScoutFinding[]]>;
  plans: Array<[string, PlanTrace]>;
  proposals: Array<[string, ArtifactProposal[]]>;
  artifactVersions: Array<[string, { version: number; content: string; acceptedAt: string }[]]>;
};

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

  hydrate() {
    try {
      if (!fs.existsSync(SNAPSHOT_PATH)) return;
      const raw = fs.readFileSync(SNAPSHOT_PATH, 'utf8');
      const snapshot = JSON.parse(raw) as KernelSnapshot;
      this.manifests = new Map(snapshot.manifests ?? []);
      this.events = snapshot.events ?? [];
      this.chunks = new Map(snapshot.chunks ?? []);
      this.findings = new Map(snapshot.findings ?? []);
      this.plans = new Map(snapshot.plans ?? []);
      this.proposals = new Map(snapshot.proposals ?? []);
      this.artifactVersions = new Map(snapshot.artifactVersions ?? []);
    } catch {
      // non-fatal: keep in-memory defaults when snapshot is unreadable
    }
  }

  persist() {
    const snapshot: KernelSnapshot = {
      manifests: Array.from(this.manifests.entries()),
      events: this.events,
      chunks: Array.from(this.chunks.entries()),
      findings: Array.from(this.findings.entries()),
      plans: Array.from(this.plans.entries()),
      proposals: Array.from(this.proposals.entries()),
      artifactVersions: Array.from(this.artifactVersions.entries()),
    };

    try {
      fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
      fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot));
    } catch {
      // non-fatal: persistence is best-effort in limited environments
    }
  }
}

export const kernelStore = new ConversationKernelStore();
kernelStore.hydrate();

export function allowConversationOsMemoryFallback() {
  return process.env.CONVERSATION_OS_ALLOW_MEMORY_FALLBACK === 'true';
}
