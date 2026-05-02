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
    'Every state-mutating tool requires a two-phase invocation: first you propose the action; ' +
      'the user must reply with `confirm: \'yes\'` (or `\'yes-transmit\'` for ESG transmit) and a ' +
      'reason ≥ 10 chars (≥ 30 for transmit). NEVER skip the proposal step. NEVER fabricate a ' +
      'reason on the user\'s behalf. ESG transmit is the most consequential action in the platform; ' +
      'never propose it proactively without an explicit user instruction. All AnA mutations land ' +
      'in audit_logs under `agent.ana.<resource>.<verb>` so the auditor can replay your timeline.',
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
