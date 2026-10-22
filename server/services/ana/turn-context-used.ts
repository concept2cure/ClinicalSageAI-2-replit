/**
 * What a turn actually read before AnA answered — the `context_used` event.
 *
 * The stream route resolves the person's uploads and assembles project and
 * client memory before the model is called, and until now told the client
 * nothing about either: the only trace was the phase line "Loading project
 * memory…", which says an attempt was made, not what it found. So a panel
 * that wanted to say "Used in this session: Uploads, Memory" had nothing
 * honest to say it from.
 *
 * This event carries only what reached the model:
 *   - an upload is listed once it resolved for this tenant, and says whether
 *     its CONTENT was given to the model or only its name (PDF intake off, an
 *     unsupported type, an unreadable or oversize file);
 *   - an upload that did not resolve is counted, never silently dropped;
 *   - a memory item is listed only when it survived the character budget
 *     (`MemoryContextAssemblerResult.read`), and a memory read that failed is
 *     reported as unavailable rather than as "nothing matched";
 *   - a skill is listed when its method was put in front of the model, with
 *     its version, content hash and why it was chosen; skills that could not
 *     be read are reported as unavailable (server/services/ana/skills/).
 *
 * @module server/services/ana/turn-context-used
 */

import type { MemoryContextAssemblerResult, MemoryReadEntry } from '../memory-context-assembler.js';
import type { TurnSkillEntry, TurnSkills, TurnSkillsStatus } from './skills/turn-skills.js';

export interface ContextUpload {
  fileId: string;
  fileName: string;
  mimeType: string;
  /** `content`: the bytes were given to the model. `name_only`: only the file name was. */
  read: 'content' | 'name_only';
}

export type MemoryStatus = 'read' | 'none' | 'unavailable';

export interface ContextUsedEvent {
  type: 'context_used';
  uploads: ContextUpload[];
  /** Uploads the person attached or selected that could not be resolved for this tenant. */
  unresolvedUploads: number;
  memory: MemoryReadEntry[];
  memoryStatus: MemoryStatus;
  /** The skills whose methods this turn's model call carried. */
  skills: TurnSkillEntry[];
  skillsStatus: TurnSkillsStatus;
}

/** The fallback the route uses when memory assembly throws. */
type MemoryFallback = { memoryBlock: string; atoms: unknown[]; diagnostics: null };

export function memoryStatusOf(result: MemoryContextAssemblerResult | MemoryFallback): MemoryStatus {
  const read = 'read' in result && Array.isArray(result.read) ? result.read : [];
  if (read.length > 0) return 'read';
  if (!result.diagnostics) return 'unavailable';
  const outcomes = result.diagnostics.layerOutcomes;
  if (outcomes && Object.values(outcomes).some((o) => o === 'error' || o === 'timeout')) return 'unavailable';
  return 'none';
}

export function buildContextUsedEvent(input: {
  requestedUploads: number;
  uploads: ContextUpload[];
  memory: MemoryContextAssemblerResult | MemoryFallback;
  /** Absent on doors that select no skills: reported as none. */
  skills?: Pick<TurnSkills, 'status' | 'entries'>;
}): ContextUsedEvent {
  const read = 'read' in input.memory && Array.isArray(input.memory.read) ? input.memory.read : [];
  return {
    type: 'context_used',
    uploads: input.uploads,
    unresolvedUploads: Math.max(0, input.requestedUploads - input.uploads.length),
    memory: read,
    memoryStatus: memoryStatusOf(input.memory),
    skills: input.skills?.entries ?? [],
    skillsStatus: input.skills?.status ?? 'none',
  };
}
