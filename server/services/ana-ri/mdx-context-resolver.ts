/**
 * MDX context resolver — composes the Markdown block AnA's system prompt
 * carries when the user is working in the medical-device workstream.
 *
 * Called by `chat-context-builder.ts` when `module_context.workstream === 'mdx'`.
 * The resolver collects four streams:
 *
 *   - The active surface entry from the knowledge pack (purpose, common
 *     questions, relevant tools).
 *   - The user's current onboarding milestone (so AnA frames advice at
 *     the right step).
 *   - Proactive alerts from `mdx-proactive-signals.ts` (deadlines,
 *     blockers, stale sections, no-response correspondence).
 *   - A brief on the AnA-MDX governed-mutation contract so AnA always
 *     follows the two-phase invocation pattern.
 *
 * Returns a single Markdown block. The chat-context-builder appends it to
 * the system prompt verbatim. Failures in any one section degrade
 * gracefully — AnA still gets the rest.
 *
 * Read-only. Never mutates.
 */

import type { Pool, PoolClient } from 'pg';

import { getSurface, MDX_SURFACES, MDX_WORKFLOWS, MDX_TOOLS } from './mdx-knowledge-pack';
import {
  buildMdxProactiveSnapshot,
  type MdxAlert,
  type MdxAlertSeverity,
} from './mdx-proactive-signals';
import {
  getMdxOnboardingMilestone,
  type MdxOnboardingMilestone,
} from './mdx-onboarding-milestone';

export interface MdxContextResolverInput {
  organizationId: number;
  /** The active nav key from module_context (e.g. 'k510', 'pre-sub'). */
  activeNav?: string;
  /** Active program code if known (e.g. 'OR-801'). */
  activeProgramCode?: string | null;
  /** Whether to include the proactive snapshot block (skip for cheap calls). */
  includeProactive?: boolean;
}

export interface MdxContextResolverOutput {
  /** Final Markdown block ready to append to AnA's system prompt. */
  systemPromptBlock: string;
  /** Structured payload available for callers that want to render natively. */
  payload: {
    surface: ReturnType<typeof getSurface>;
    milestone: MdxOnboardingMilestone | null;
    alerts: MdxAlert[];
    workflowsRelevant: typeof MDX_WORKFLOWS;
    toolsRelevant: typeof MDX_TOOLS;
  };
}

const SEVERITY_GLYPH: Record<MdxAlertSeverity, string> = {
  critical: '!!',
  warn: '!',
  info: '·',
};

export async function buildMdxContextBlock(
  client: Pool | PoolClient,
  input: MdxContextResolverInput,
): Promise<MdxContextResolverOutput> {
  const surface = input.activeNav ? getSurface(input.activeNav) : null;

  // ── Collect inputs in parallel; never let one failure blank the rest ──
  const [milestone, snapshot] = await Promise.all([
    safe(() => getMdxOnboardingMilestone(client, input.organizationId)),
    input.includeProactive === false
      ? Promise.resolve(null)
      : safe(() => buildMdxProactiveSnapshot(client, input.organizationId)),
  ]);

  const alerts = snapshot?.alerts ?? [];
  const workflowsRelevant = surface
    ? MDX_WORKFLOWS.filter(w => w.surfaces.includes(surface.key))
    : MDX_WORKFLOWS;
  const toolsRelevant = surface
    ? MDX_TOOLS.filter(t => surface.relevantTools.includes(t.name))
    : MDX_TOOLS;

  // ── Render Markdown ──────────────────────────────────────────────────
  const lines: string[] = [];
  lines.push('## MDX context (medical-device workstream)');
  lines.push('');

  // Surface block.
  if (surface) {
    lines.push(`### Active surface: ${surface.label}`);
    lines.push(`Purpose: ${surface.purpose}`);
    lines.push(`When to use: ${surface.whenToUse}`);
    if (surface.affordances.length > 0) {
      lines.push(`Top affordances: ${surface.affordances.join('; ')}.`);
    }
    if (surface.commonQuestions.length > 0) {
      lines.push(`Questions users commonly ask here: ${surface.commonQuestions.join(' / ')}.`);
    }
    lines.push(`Surface status: ${surface.status}.`);
    lines.push('');
  } else {
    lines.push('### Active surface: (unknown)');
    lines.push(
      `User is in the MDX workstream but hasn't surfaced a specific page. ` +
        `MDX has ${MDX_SURFACES.length} surfaces — list them if asked.`,
    );
    lines.push('');
  }

  if (input.activeProgramCode) {
    lines.push(`Active program: **${input.activeProgramCode}**`);
    lines.push('');
  }

  // Onboarding milestone.
  if (milestone) {
    lines.push(`### Onboarding milestone: ${milestone.label}`);
    lines.push(`Next step: ${milestone.nextStep}`);
    if (milestone.workflowId) {
      const w = MDX_WORKFLOWS.find(x => x.id === milestone.workflowId);
      if (w) {
        lines.push(`Active workflow reference: ${w.id} — ${w.label}.`);
      }
    }
    lines.push('');
  }

  // Proactive alerts.
  if (alerts.length > 0) {
    lines.push(`### Proactive alerts (${alerts.length})`);
    lines.push(
      'These were computed from the live tables and surface things the user has not yet asked ' +
        'about. Surface them when they are actionable to the active surface; do NOT dump them ' +
        'unprovoked unless they include a critical-severity item.',
    );
    for (const a of alerts.slice(0, 12)) {
      lines.push(`- ${SEVERITY_GLYPH[a.severity]} **${a.kind}** — ${a.message}`);
    }
    if (alerts.length > 12) {
      lines.push(`- … and ${alerts.length - 12} more (lower severity).`);
    }
    lines.push('');
  }

  // Relevant workflows for this surface.
  if (workflowsRelevant.length > 0) {
    lines.push('### Relevant workflows');
    for (const w of workflowsRelevant) {
      lines.push(`- **${w.id} ${w.label}** — ${w.objective}`);
    }
    lines.push('');
  }

  // Relevant tools for this surface, plus the governance contract.
  if (toolsRelevant.length > 0) {
    lines.push('### Tools you can propose here');
    for (const t of toolsRelevant) {
      lines.push(`- \`${t.name}\` — ${t.description}`);
      lines.push(`  Propose when: ${t.proposeWhen}`);
    }
    lines.push('');
  }

  // Governance reminder.
  lines.push('### Governed-mutation contract (always follow)');
  lines.push(
    'Every state-mutating tool requires a two-phase invocation. Phase 1: you ' +
      'emit the command WITHOUT confirm so the user sees what you propose; the ' +
      'gate stashes the params under their thread and returns ' +
      'confirmation_required. Phase 2: when the user replies "yes", you re-emit ' +
      'the command with `confirm: \'yes\'` (or `\'yes-transmit\'` for ESG ' +
      'transmit) and the user\'s reason; the gate merges the stashed params so ' +
      'the user does not have to re-state every field.',
  );
  lines.push('');
  lines.push(
    '**Reason quality.** The reason must be the USER\'S explanation, not yours. ' +
      'NEVER fabricate a reason on the user\'s behalf — restate the user\'s words ' +
      'verbatim, or refuse to advance until the user provides one. Strong reasons ' +
      'cite a concrete artifact: a section number (§6.1), a Q-number (Q251142), ' +
      'a K-number (K212284), a commitment code (cm-1142-3), an ISO/ASTM standard, ' +
      'a CFR citation, or a date. Generic reasons like "because the user asked" ' +
      'pass the length check but flag in the audit row as `reasonReferencedArtifact: false`.',
  );
  lines.push('');
  lines.push(
    '**ESG transmit.** The most consequential mutation in the platform. NEVER ' +
      'propose it proactively. Only ever surface the option after the user has ' +
      'explicitly said "we are ready to transmit" AND pre-flight is green AND ' +
      'every load-bearing section is approved. The strict gate (confirm=' +
      '"yes-transmit", reason ≥ 30 chars) is intentional friction, not a bug.',
  );
  lines.push('');
  lines.push(
    'All AnA mutations land in audit_logs under `agent.ana.<resource>.<verb>` ' +
      'with `details.actorKind = \'agent:ana\'`, `details.agentReason`, ' +
      '`details.threadId`, and `details.chatMessageId` so an auditor can replay ' +
      'your timeline AND pull the chat that produced the mutation. The ' +
      '`reasonReferencedArtifact` flag in details lets the auditor filter for ' +
      'low-quality justifications.',
  );
  lines.push('');
  lines.push('### Failure-recovery (when a tool returns success: false)');
  lines.push(
    'When any tool returns `success: false`, you MUST do the following — never ' +
      'just say "the action failed" and stop:',
  );
  lines.push('');
  lines.push(
    '1. **Restate the error code in plain language.** `TENANT_ACCESS_DENIED` ' +
      'means the resource is not in the user\'s organization (suggest checking ' +
      'the active program). `INVALID_INPUT` means a required field was missing ' +
      'or malformed (point to the specific field). `GATE_BLOCKED` means a ' +
      'validation gate refused (offer to walk through the findings). ' +
      '`NOT_FOUND` means the id does not exist for this tenant. ' +
      '`CONFIRMATION_REQUIRED` is your normal Phase 1; it\'s not a failure — ' +
      're-emit the command in Phase 2 with confirm + reason.',
  );
  lines.push(
    '2. **Diagnose the root cause** by reading the data field on the result ' +
      '(it carries the structured detail). For `GATE_BLOCKED` on ' +
      '`post_market.document.approve`, the data carries the validation ' +
      'findings; pull the top three, name them, and offer to address them.',
  );
  lines.push(
    '3. **Propose the next concrete action.** Never leave the user with a ' +
      'failed action and no path forward. If the right next step is another ' +
      'tool, propose it (Phase 1). If it\'s a section edit, name the section. ' +
      'If it\'s a question for FDA, suggest a Pre-Sub.',
  );
  lines.push('');
  lines.push('### Auditor mode');
  lines.push(
    'When a user asks "what happened on row N?" or "why did this audit row ' +
      'fire?", invoke the `audit.explain` tool with the audit_logs.id. It ' +
      'returns a Markdown explainer with the action restated in plain ' +
      'language, the reason recorded, the chat thread it came from, and the ' +
      'workflow + regulation context. Use the explainer verbatim where ' +
      'possible — auditors expect the structure.',
  );

  return {
    systemPromptBlock: lines.join('\n'),
    payload: {
      surface,
      milestone: milestone ?? null,
      alerts,
      workflowsRelevant,
      toolsRelevant,
    },
  };
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}
