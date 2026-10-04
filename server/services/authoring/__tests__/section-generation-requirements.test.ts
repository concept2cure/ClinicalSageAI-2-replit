/**
 * Section generation drafts against the platform's canonical requirements for
 * the section, never against the model's recall of them (D2, round 2:
 * b2-drafting-requirements).
 *
 * The v1.0 prompt told the model to "flag any required sub-point you could not
 * ground in `ungrounded`" and sent it only `{ sectionCode, evidence,
 * productContext }`. No requirement reached it, so every "required sub-point"
 * came from memory: the free recall CLAUDE.md Rule 2 and the canonical record
 * in server/services/ind/ctd/ exist to replace.
 *
 * The user message now carries `requirements`, rendered by the canonical
 * renderSectionBrief (CTD_AUTHORING_GUIDANCE), and `requirementsSource`, the
 * resolver's kind ('exact' | 'ancestor' | 'parent') or 'none' when nothing is
 * indexed, in which case the requirements say so instead of being guessed. The
 * prompt version is section-generation@v1.1 at the gateway, on the stored
 * draft and in the audit row, and the source is recorded beside it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  route: vi.fn(),
  logAction: vi.fn(async () => undefined),
  inserted: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../../db', () => {
  const selectChain = {
    from: () => selectChain,
    where: () => selectChain,
    limit: async () => [{ id: 11 }],
  };
  return {
    db: {
      select: () => selectChain,
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          h.inserted.push(v);
          return { returning: async () => [{ id: 901 }] };
        },
      }),
    },
  };
});
vi.mock('../../ai-gateway', () => ({ getGateway: () => ({ route: h.route }) }));
vi.mock('../../auditService', () => ({ default: { logAction: h.logAction } }));

import { generateSection } from '../section-generation-service';
import { CTD_AUTHORING_GUIDANCE, renderSectionBrief } from '../../ind/ctd/index';

const TRAILER = '```json\n{ "citations": [], "ungrounded": [] }\n```';

interface RouteRequest {
  messages: Array<{ role: string; content: string }>;
  promptVersion: string;
  metadata: Record<string, unknown>;
}

/** Generate a section and return what the gateway, the draft and the audit row received. */
async function generate(sectionCode: string) {
  h.route.mockResolvedValueOnce({ content: `Body.\n\n${TRAILER}` });
  await generateSection(
    { submissionId: 11, sectionCode, evidence: [{ id: 'E1', source: 'csr', text: 'Study 301 met its primary endpoint.' }] },
    { organizationId: 7, userId: 41 },
  );
  const request = h.route.mock.calls[0][0] as RouteRequest;
  const system = request.messages.find((m) => m.role === 'system')!.content;
  const user = JSON.parse(request.messages.find((m) => m.role === 'user')!.content) as Record<string, unknown>;
  const authoring = (h.inserted[0].metadata as { authoring: Record<string, unknown> }).authoring;
  const audit = (h.logAction.mock.calls[0] as unknown as [{ details: Record<string, unknown> }])[0].details;
  return { request, system, user, authoring, audit };
}

beforeEach(() => {
  h.route.mockReset();
  h.logAction.mockClear();
  h.inserted.length = 0;
});

describe('section generation is given the canonical requirements for the section', () => {
  it('2.7.3: the requirements are the Summary of Clinical Efficacy brief, exact', async () => {
    const { system, user } = await generate('2.7.3');
    expect(typeof user.requirements).toBe('string');
    expect(user.requirements).toContain('Summary of Clinical Efficacy');
    expect(user.requirements).toContain('5.3.5.3');
    expect(user.requirementsSource).toBe('exact');
    // The prompt tells the model what the field is.
    expect(system).toContain('`requirements`');
    expect(system).toContain('`requirementsSource`');
  });

  it('a code nothing indexes: the requirements say so, source none', async () => {
    const { user } = await generate('9.9');
    expect(user.requirements).toBe('The platform has no requirements indexed for 9.9.');
    expect(user.requirementsSource).toBe('none');
  });

  it('a container code: source parent', async () => {
    const { user } = await generate('2.7');
    expect(user.requirementsSource).toBe('parent');
    expect(user.requirements).toContain('2.7.3');
  });

  it('a sub-section deeper than any entry: source ancestor', async () => {
    const { user } = await generate('2.5.4.1');
    expect(user.requirementsSource).toBe('ancestor');
  });
});

describe('the prompt and its version', () => {
  it('section-generation@v1.1 at the gateway, on the draft and in the audit row, with the source', async () => {
    const { request, authoring, audit } = await generate('2.7.3');
    expect(request.promptVersion).toBe('section-generation@v1.1');
    expect(request.metadata.requirementsSource).toBe('exact');
    expect(authoring.promptVersion).toBe('section-generation@v1.1');
    expect(authoring.requirementsSource).toBe('exact');
    expect(audit.promptVersion).toBe('section-generation@v1.1');
    expect(audit.requirementsSource).toBe('exact');
  });

  it('the system prompt asks for the impersonal register, labelled platform convention, not second person', async () => {
    const { system } = await generate('2.7.3');
    expect(system).not.toMatch(/second person/i);
    expect(system).toMatch(/impersonal third person/i);
    expect(system).toMatch(/platform convention/i);
    // Requirements are never stated from memory.
    expect(system).toMatch(/never fill it from memory/i);
  });
});

// The prompt tells the model to cover each element under "It must contain".
// renderSectionBrief drops optional blocks that do not fit its character cap,
// so a longer "How it is written" for one entry could silently push the
// required elements out of the drafting input. Every registered code must keep
// them.
describe('every registered section keeps its required elements in the drafting input', () => {
  it.each(Object.keys(CTD_AUTHORING_GUIDANCE))('%s', (code) => {
    expect(renderSectionBrief(code)).toContain('### It must contain');
  });
});
