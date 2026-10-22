/**
 * The contract every AnA command handler shares.
 *
 * One definition, because these two interfaces were declared locally in each
 * handler module. Two copies of a result shape is how one of them grows a
 * field the executor does not read, or loses one it does.
 *
 * @module server/services/ana-ri/command-types
 */

/** Who the command runs as, and what they have open. */
export interface CommandContext {
  userId: number;
  organizationId: number;
  activeProjectId?: number;
}

/**
 * What a handler answers.
 *
 * `message` is what the assistant relays, so a refusal puts its reason and its
 * remedy there rather than leaving the caller to infer them from `success`.
 */
export interface CommandResult {
  success: boolean;
  action: string;
  message: string;
  data?: unknown;
}
