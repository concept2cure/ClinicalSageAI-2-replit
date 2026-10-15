/**
 * What AnA is told about her own writes matches what the platform does with
 * them (P0-12 residual fix round, 2026-10-01; audit DP-08; 21 CFR 11.10(e)).
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 * The ```ana-action block became a proposal a person confirms, but the prompts
 * still told AnA it saved itself:
 *   - persona.ts: "so the system can auto-save it", "The system will
 *     auto-create a project artifact from your response", "Auto-save as a
 *     governed artifact", "auto-saved as artifact";
 *   - lumen-context/base-system-prompt.ts: "so the platform can execute it
 *     automatically", "The action block will be automatically processed …
 *     The artifact will be created";
 *   - document-routing.ts: "include an ```ana-action block to auto-save as a
 *     governed artifact".
 * A model told that tells the person "I've saved it" while the person is shown
 * only a pending card. And the platform-command bridge (ana/AnaToolExecutor.ts)
 * told the model to "re-issue with params.confirm=true", which the gate ignores
 * (executeCommands reads only ctx.humanConfirmed): the model spent rounds
 * re-asking and could tell the person it had asked twice.
 *
 * ── What is pinned here ─────────────────────────────────────────────────────
 * Every prompt that tells AnA to emit the block says the person confirms
 * before anything is saved, and none says it saves, creates or executes on
 * its own. The bridge says a proposal ran nothing and is not re-issued.
 */
import { describe, expect, it, vi } from 'vitest';

const poolStub = vi.hoisted(() => ({
  query: async () => ({ rows: [] as any[], rowCount: 0 }),
  connect: async () => {
    throw new Error('no transaction expected');
  },
}));
vi.mock('../../../db', () => ({ db: {}, pool: poolStub, getPool: () => poolStub, getDb: () => ({}) }));
vi.mock('../../roleBasedAccess', () => ({
  default: { hasRole: async () => true, getUserRoles: async () => [] },
}));

import { getCorePrompt } from '../persona.js';
import { orchestrate } from '../orchestrator.js';
import { BASE_SYSTEM_PROMPT } from '../../lumen-context/base-system-prompt.js';
import { buildDocumentGenerationContext, detectDocumentType } from '../document-routing.js';

/** A claim that the block, or the platform, saves or acts with no one asked. */
const SELF_SAVING =
  /auto-?sav(?:e|ed|es|ing)\b|auto-?creat|execute it automatically|automatically (?:processed|created|saved|executed)|will be created as a draft|will auto/i;
/** The model is told a person decides. */
const PERSON_CONFIRMS = /the person confirms|until they (?:do|confirm)|only when they confirm/i;

function sectionOf(prompt: string, heading: string): string {
  const start = prompt.indexOf(heading);
  expect(start, `${heading} is in the prompt`).toBeGreaterThanOrEqual(0);
  const next = prompt.indexOf('\n## ', start + heading.length);
  return prompt.slice(start, next === -1 ? undefined : next);
}

describe('the prompts that ask for an ana-action block say a person confirms it', () => {
  const doc = detectDocumentType('Draft the nonclinical overview for our IND');

  const prompts: Array<[string, string]> = [
    ['persona.ts (core prompt)', getCorePrompt()],
    ['the live stream’s assembled prompt (orchestrate)', orchestrate({ message: 'Draft a risk memo on the stability gap' }).systemPrompt],
    ['lumen-context/base-system-prompt.ts', BASE_SYSTEM_PROMPT],
    ['document-routing.ts (draft request)', doc ? buildDocumentGenerationContext(doc) : ''],
  ];

  it('a document request is detected, so its prompt is checked', () => {
    expect(doc).not.toBeNull();
  });

  for (const [name, prompt] of prompts) {
    it(`${name}: nothing says the block saves, creates or executes on its own`, () => {
      const hit = prompt.match(SELF_SAVING);
      expect(hit?.[0] ?? null, `${name} still says: “${hit ? prompt.slice(Math.max(0, hit.index! - 60), hit.index! + 80) : ''}”`).toBeNull();
    });
  }

  it('persona.ts “Creating Artifacts”: the person confirms, and AnA does not say it was saved', () => {
    const s = sectionOf(getCorePrompt(), '## Creating Artifacts');
    expect(s).toMatch(PERSON_CONFIRMS);
    expect(s).toMatch(/do not say it was saved|never say it was saved/i);
  });

  it('base-system-prompt.ts “Guidance-to-Action Execution”: the person confirms, and AnA does not say it was created', () => {
    const s = sectionOf(BASE_SYSTEM_PROMPT, '## Guidance-to-Action Execution');
    expect(s).toMatch(PERSON_CONFIRMS);
    expect(s).toMatch(/never (?:tell|say)[^.]*(?:created|saved)/i);
  });

  it('document-routing.ts: the draft request asks for a proposal, not a save', () => {
    expect(buildDocumentGenerationContext(doc!)).toMatch(/propose saving it as a governed artifact/);
    expect(buildDocumentGenerationContext(doc!)).toMatch(PERSON_CONFIRMS);
  });
});

describe('the platform-command bridge tells the model a proposal ran nothing', () => {
  async function handler(name: string) {
    const { getToolHandler } = await import('../../ana/AnaToolExecutor.js');
    return getToolHandler(name)!;
  }
  const RE_ISSUE_WITH_CONFIRM = /re-?issue[^.]*confirm|confirm\s*=\s*true|need params\.confirm/i;

  it('list_platform_commands: a write comes back as a proposal; a confirm flag is not a confirmation', async () => {
    const out = JSON.parse(await (await handler('list_platform_commands'))({}, { organizationId: 61, userId: 7 } as any));
    expect(out.instruction).not.toMatch(RE_ISSUE_WITH_CONFIRM);
    expect(out.instruction).toMatch(/HUMAN_CONFIRMATION_REQUIRED/);
    expect(out.instruction).toMatch(/person/);
  });

  it('execute_platform_command: on a proposal, nothing ran, tell the person, do not re-issue', async () => {
    const out = JSON.parse(
      await (await handler('execute_platform_command'))(
        { command: 'create_task', params: { projectId: 5, title: 'Run the accelerated study' } },
        { organizationId: 61, userId: 7, projectId: 5 } as any,
      ),
    );
    expect(out.result).toMatchObject({ error: 'HUMAN_CONFIRMATION_REQUIRED' });
    expect(out.instruction).not.toMatch(RE_ISSUE_WITH_CONFIRM);
    expect(out.instruction).toMatch(/nothing ran/i);
    expect(out.instruction).toMatch(/do not re-issue/i);
    expect(out.instruction).toMatch(/has not been done/i);
  });
});

describe('the execute_platform_command definition the model reads says the same as the bridge', () => {
  it('never asks for params.confirm, says a write is only proposed, and says not to re-issue it', async () => {
    const { EXECUTE_PLATFORM_COMMAND } = await import('../../ana/bla-biologics-tool-defs.js');
    const text = [
      EXECUTE_PLATFORM_COMMAND.description,
      JSON.stringify(EXECUTE_PLATFORM_COMMAND.input_schema),
    ].join('\n');
    expect(text).not.toMatch(/re-issue with params\.confirm|confirm\s*[:=]\s*true/i);
    expect(text).toMatch(/proposal/i);
    expect(text).toMatch(/do not re-issue/i);
  });
});
