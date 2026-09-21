/**
 * Drafting tools.
 *
 * c2c_draft_cover_letter is deterministic (the platform's cover-letter
 * composer). c2c_draft_agency_response is the connector's ONE model-backed
 * tool and it goes through getGateway() — the governed gateway that records
 * model, prompt hash and provenance for every call. It fails closed: with no
 * provider configured it returns the gateway's own refusal verbatim, and it
 * refuses any demo-mode ("deterministic") response rather than pass fixture
 * text off as a draft. Numbers and verdicts never come from this tool.
 */

import { z } from 'zod';
import { defineTool, ok, refused, errorMessage } from './runtime';
import { MCP_SCOPES } from '../config';

const issueInput = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  severity: z.string().min(1),
  blocker: z.boolean().default(false),
  description: z.string().min(1),
  section_numbers: z.array(z.string()).default([]),
});

export const draftCoverLetter = defineTool({
  name: 'c2c_draft_cover_letter',
  title: 'Draft cover letter',
  description:
    'Deterministic DRAFT of an agency correspondence cover letter from the platform’s composer, for a ' +
    'document in your organisation and the issues being addressed. Returns Markdown, the sections that ' +
    'came back empty (missingSections — surface them, never hide them) and provenance. A draft for review ' +
    'in the app; nothing is filed or sent.',
  inputSchema: {
    document_id: z.number().int().positive().describe('The eSTAR/510(k) document id the letter accompanies.'),
    sponsor_name: z.string().min(1).max(200),
    submission_tracking_number: z.string().max(40).optional().describe('e.g. K251102'),
    issues: z.array(issueInput).min(1).max(100),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: MCP_SCOPES.draft,
  governed: false,
  implementation: 'server/services/cover-letter/cover-letter-composer.ts composeCoverLetterDraft',
  async run(input, ctx) {
    const { composeCoverLetterDraft } = await import('../../services/cover-letter/cover-letter-composer');
    try {
      const draft = await composeCoverLetterDraft({
        organizationId: ctx.principal.organizationId,
        documentId: input.document_id,
        submissionTrackingNumber: input.submission_tracking_number ?? null,
        sponsorName: input.sponsor_name,
        issues: input.issues.map((i) => ({ id: i.id, category: i.category, severity: i.severity, blocker: i.blocker, description: i.description, sectionNumbers: i.section_numbers })),
      });
      return ok(
        `Cover letter DRAFT composed deterministically (${draft.body.length} chars); ${draft.missingSections.length} missing section(s)${draft.missingSections.length ? `: ${draft.missingSections.join(', ')}` : ''}.`,
        { engine: 'deterministic', body: draft.body, missingSections: draft.missingSections, provenance: draft.provenance, status: 'draft' },
      );
    } catch (err) {
      return refused(errorMessage(err));
    }
  },
});

/** The gateway's own production refusal, returned verbatim when no provider can serve. */
export const GATEWAY_NO_PROVIDER_REFUSAL =
  '[AI Gateway] No AI provider is configured in production; refusing to serve demo-mode content. ' +
  'Set ANTHROPIC_API_KEY / OPENAI_API_KEY, or enable deterministicMode explicitly.';

export const draftAgencyResponse = defineTool({
  name: 'c2c_draft_agency_response',
  title: 'Draft agency response narrative',
  description:
    'DRAFT narrative text responding to one agency deficiency/information request, generated through the ' +
    'platform’s governed AI gateway (Claude is the named model; the call is provenance-logged). Provide the ' +
    'agency’s question and the facts to rely on; the draft cites only what you supplied and never invents ' +
    'data. Fails closed when no model provider is configured: the gateway’s refusal is returned verbatim. ' +
    'Output is a draft for the app’s review workflow, not a filing.',
  inputSchema: {
    agency: z.string().max(20).default('FDA'),
    deficiency: z.string().min(10).max(8000).describe('The agency’s deficiency or information request, verbatim.'),
    facts: z.array(z.string().min(1).max(2000)).min(1).max(50).describe('Verified facts, figures and citations the response may rely on.'),
    tone: z.enum(['formal', 'concise']).default('formal'),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  scope: MCP_SCOPES.draft,
  governed: false,
  implementation: 'server/services/ai-gateway/gateway.ts getGateway().chat (taskType document_drafting)',
  async run(input, ctx) {
    const { getGateway } = await import('../../services/ai-gateway/gateway');
    const gateway = getGateway();
    const live = gateway.getModels().some((m) => m.enabled) && !gateway.isDeterministic();
    if (!live) return refused(GATEWAY_NO_PROVIDER_REFUSAL, { provider: null });
    const system =
      'You draft regulatory correspondence for a sponsor. Write a response narrative to the agency request ' +
      'below using ONLY the facts supplied. Where a fact needed to answer is not supplied, write "[FACT NEEDED: …]" ' +
      'rather than inventing one. Do not state numbers, dates or study results that are not in the facts. ' +
      `Tone: ${input.tone}. Output Markdown with a heading per point raised.`;
    const user = `Agency: ${input.agency}\n\nRequest:\n${input.deficiency}\n\nFacts available:\n${input.facts.map((f, i) => `${i + 1}. ${f}`).join('\n')}`;
    try {
      const response = await gateway.chat(system, user, {
        taskType: 'document_drafting',
        organizationId: ctx.principal.organizationId,
        userId: ctx.principal.userId,
        callerModule: 'mcp:c2c_draft_agency_response',
        maxTokens: 2000,
        temperature: 0.2,
      });
      if (response.deterministic || response.model === 'demo-mode') {
        return refused(GATEWAY_NO_PROVIDER_REFUSAL, { provider: response.provider, model: response.model });
      }
      return ok(
        `Agency-response DRAFT generated via the governed gateway (${response.provider}/${response.model}); review in the app before use.`,
        { status: 'draft', body: response.content, provider: response.provider, model: response.model, resolvedModel: response.resolvedModel ?? null, requestId: response.requestId, usage: response.usage },
      );
    } catch (err) {
      return refused(errorMessage(err));
    }
  },
});
