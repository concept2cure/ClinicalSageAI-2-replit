/**
 * Capability registry — the single source of truth for AnA's enrichment commands.
 *
 * AnA gained a large set of judgment capabilities (wisdom, wayfinding,
 * constructive challenge, decision frameworks, agency tactics, competitive
 * strategy, stakeholder alignment) wired as slash commands and proactive
 * triggers in context-enrichment.ts. But nothing catalogued them: the
 * operational COMMAND_REGISTRY only knows the older document/workflow commands,
 * the persona prompt describes the reflexes in prose, and the UI has no
 * structured list to render a command palette from.
 *
 * That gap is a real source of capability hallucination — when a user asks
 * "what can you do?", AnA has no grounded inventory of her newer reflexes, and
 * the product cannot show an accurate, current command list.
 *
 * This module is that inventory: one typed record per enrichment capability,
 * with the command(s) that invoke it, a one-line description, the category,
 * and whether it also fires proactively (without a command). It is paired with
 * an anti-drift test (ana-ri.test.ts) that fails if any wired slash command in
 * SUPPORTED_SLASH_COMMANDS that belongs to a judgment pack is missing here, so
 * the catalogue cannot silently fall behind the wiring.
 *
 * Read by:
 *   - context-enrichment.ts (/capabilities command — grounds AnA's answer to
 *     "what can you do" in this list instead of improvising)
 *   - the UI (a renderable command palette / help surface)
 *
 * NOT a prompt template for the persona. Structured data; a builder emits a
 * compact Markdown catalogue on demand.
 * Tone floor (enforced by ana-ri.test.ts): no emoji, no exclamation marks.
 *
 * @module server/services/ana-ri/capability-registry
 */

export type CapabilityCategory =
  | 'orientation'
  | 'judgment'
  | 'strategy'
  | 'agency'
  | 'people'
  | 'integrity';

export interface Capability {
  id: string;
  /** Human label, sentence case. */
  label: string;
  /** Slash command(s) that invoke it (without the leading slash). */
  commands: string[];
  /** One-line, plain-language description of what it does for the user. */
  description: string;
  category: CapabilityCategory;
  /** True when this capability also fires proactively, with no command. */
  proactive: boolean;
}

export const CAPABILITIES: Capability[] = [
  {
    id: 'wisdom',
    label: 'Industry wisdom',
    commands: ['wisdom'],
    description:
      'Brings the experiential lore for your segment and stage — the pitfall a veteran would warn you about before you hit it.',
    category: 'judgment',
    proactive: true,
  },
  {
    id: 'guide',
    label: 'Wayfinding and orientation',
    commands: ['guide', 'orient', 'tour', 'playbook'],
    description:
      'Orients you when you are new or unsure — where you are, what matters now, and the few moves people in your situation make next.',
    category: 'orientation',
    proactive: true,
  },
  {
    id: 'challenge',
    label: 'Constructive challenge',
    commands: ['challenge', 'redteam', 'devil'],
    description:
      'Red-teams a plan or premise and pushes back, politely and with evidence, when experience says it is risky.',
    category: 'judgment',
    proactive: true,
  },
  {
    id: 'decide',
    label: 'Decision frameworks',
    commands: ['decide', 'tradeoff', 'framework'],
    description:
      'Structures a genuine strategic trade-off — names the tension, what tilts it each way, and the deciding question, without making the call for you.',
    category: 'judgment',
    proactive: true,
  },
  {
    id: 'agency',
    label: 'Agency-interaction tactics',
    commands: ['meeting', 'agency', 'tactics'],
    description:
      'Coaches the conversation with the regulator — meeting preparation, response strategy for a deficiency or complete-response letter, and posture.',
    category: 'agency',
    proactive: true,
  },
  {
    id: 'position',
    label: 'Competitive strategy',
    commands: ['position', 'landscape', 'compete'],
    description:
      'Reads precedent and positions you against the field — what transfers, what the competitor label actually claims, and where to differentiate.',
    category: 'strategy',
    proactive: true,
  },
  {
    id: 'align',
    label: 'Stakeholder alignment',
    commands: ['align'],
    description:
      'Navigates the internal side — CMC versus clinical, a commercial label ambition, a board that wants a date, a CRO that holds the data — tied to regulatory consequence.',
    category: 'people',
    proactive: true,
  },
];

// ─── Lookups ─────────────────────────────────────────────────────────────────

/** Set of every command string that maps to a registered capability. */
export const CAPABILITY_COMMANDS: ReadonlySet<string> = new Set(
  CAPABILITIES.flatMap((c) => c.commands),
);

export function getCapability(id: string): Capability | null {
  return CAPABILITIES.find((c) => c.id === id) ?? null;
}

export function getCapabilityForCommand(command: string): Capability | null {
  return CAPABILITIES.find((c) => c.commands.includes(command)) ?? null;
}

export function listCapabilitiesByCategory(category: CapabilityCategory): Capability[] {
  return CAPABILITIES.filter((c) => c.category === category);
}

// ─── Rendering ───────────────────────────────────────────────────────────────

/**
 * Build a compact Markdown catalogue of AnA's enrichment capabilities, for
 * grounding a "what can you do" answer. AnA should still demonstrate against
 * the user's project state rather than reciting this verbatim — it is the
 * grounded inventory she draws from, not a script.
 */
export function buildCapabilityCatalogue(): string {
  const lines = CAPABILITIES.map((c) => {
    const cmds = c.commands.map((x) => `/${x}`).join(', ');
    const auto = c.proactive ? ' (also offered automatically)' : '';
    return `- **${c.label}** — ${c.description} Invoke with ${cmds}${auto}.`;
  });
  return (
    '\n\n## Your enrichment capabilities (grounded inventory)\n' +
    'These are the judgment and guidance capabilities available to you beyond drafting and analysis. ' +
    'Do not recite this as a menu — when the user asks what you can do, demonstrate against their actual ' +
    'situation and offer the one or two that fit. This is the grounded list you draw from, so you never ' +
    'claim a capability you do not have or miss one you do.\n\n' +
    lines.join('\n')
  );
}
