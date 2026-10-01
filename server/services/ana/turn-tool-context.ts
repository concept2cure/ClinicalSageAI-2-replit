/**
 * The context an AnA tool runs with, built once for the three ways a tool runs
 * in a turn (PF-10 S5; lineage plan LX-06, its stream half).
 *
 *   1. dispatched in the loop          (routes/ana-ri/stream.ts)
 *   2. held for the person's yes       (stream.ts, recorded on the run row)
 *   3. run once the person confirms    (routes/ana-ri/utility.ts runConfirmedTool)
 *
 * Each of the three built its own copy, and none passed the conversation, the
 * turn or the model. A document AnA drafted therefore recorded no
 * conversation, no turn and no model in its provenance
 * (authoring-draft-tool.ts reads ctx.threadId, ctx.turnId, ctx.model), and the
 * founder-path walk baselined both checks. draft_authoring_document is in the
 * confirm class, so in production it runs only through 2 then 3: a fix to 1
 * alone would leave every real draft unrecorded. One builder each, here.
 *
 * The turn id is the run id: ana_turn_records.run_id joins a draft back to
 * its turn record.
 */
import { PLATFORM_COMMAND_TOOL } from './governed-tool-gate.js';

/** The model call that served the turn, as servedModelOf reports it. */
export interface ServedModel {
  provider?: string | null;
  model?: string | null;
  requestId?: string | null;
}

/** Who is asking: the conversation, the turn, and the model serving it. */
export interface TurnIdentity {
  threadId: string | null | undefined;
  turnId: string | null | undefined;
  servingModel: ServedModel | null | undefined;
}

/** The project as the client sent it, in both forms the tools read. */
function projectFields(rawProject: unknown) {
  return {
    // A v2 project is a regulatory_programs UUID, whose integer form is null.
    projectId: rawProject ? Number(rawProject) || null : null,
    projectRef: rawProject ? String(rawProject) : null,
  };
}

function identityFields(id: TurnIdentity) {
  return {
    servingModel: id.servingModel ?? null,
    threadId: id.threadId || null,
    turnId: id.turnId || null,
    // A tool never claims a model it was not told about.
    model: id.servingModel?.model ?? null,
  };
}

/** 1. The fields a tool dispatched in the loop is handed. */
export function turnToolContext(rawProject: unknown, id: TurnIdentity) {
  return { ...projectFields(rawProject), ...identityFields(id) };
}

/** What a held tool call records on its run row, to run from later. */
export interface HeldToolContext {
  projectId: number | null;
  projectRef: string | null;
  servingModel: ServedModel | null;
  /** Absent on a run held before PF-10 S5: the confirmed run then records none. */
  threadId?: string | null;
  turnId?: string | null;
}

/**
 * 2. For a tool that writes on its own handler (anything but the command
 * carrier), the context the loop would have run it with, recorded on the held
 * run so the governed-action route runs the tool from it, never from the
 * browser's body. Undefined for a platform command, which JSON drops from the
 * row.
 */
export function heldToolContext(toolName: string, rawProject: unknown, id: TurnIdentity): HeldToolContext | undefined {
  if (toolName === PLATFORM_COMMAND_TOOL) return undefined;
  const { projectId, projectRef, servingModel, threadId, turnId } = turnToolContext(rawProject, id);
  return { projectId, projectRef, servingModel, threadId, turnId };
}

/** 3. The context a confirmed tool runs with: the held one, and the person's yes. */
export function confirmedToolContext(held: HeldToolContext | null | undefined, organizationId: number, userId: number) {
  return {
    organizationId,
    userId,
    projectId: held?.projectId ?? null,
    projectRef: held?.projectRef ?? null,
    ...identityFields({ threadId: held?.threadId, turnId: held?.turnId, servingModel: held?.servingModel }),
    humanConfirmed: true as const,
  };
}
