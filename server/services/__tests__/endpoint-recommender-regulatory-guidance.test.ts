/**
 * WO-16C finding #48 — the endpoint recommender asked a language model to
 * INVENT regulatory guidance: `{authority, document_name, guidance_text}`
 * objects, primed by an example naming two real FDA and EMA titles, returned
 * verbatim to the caller as `regulatory_guidance`.
 *
 * Two things make it worse than a fallback that rarely fires.
 *
 * First, it is not a fallback in practice. `loadRegulatoryGuidance` only caches
 * a file whose parsed content has `.indication` and an array `.guidance`
 * (endpoint-recommender-service.ts:219), and both files under `regulatory_data/`
 * are top-level arrays, so nothing is ever cached, `foundGuidance` is always
 * false, and the model-invented branch is the ONLY source this service has.
 *
 * Second, the array is load-bearing: `classifyEndpointBasis` returns
 * `'regulatory_recommended'` for any endpoint with a non-empty
 * `regulatory_guidance` (line 104), the highest basis there is, worth a base
 * evidence strength of 80. So an invented citation did not merely appear beside
 * a recommendation — it promoted it above endpoints backed by the real corpus.
 *
 * Failure is injected at the dependency: the injected Hugging Face client
 * answers with exactly the shape the prompt asks for, naming a guidance
 * document that does not exist. RED on the pre-fix head: that document comes
 * back as `regulatory_guidance` for "Overall Survival".
 */
import { describe, expect, it } from 'vitest';
import {
  EndpointRecommenderService,
  classifyEndpointBasis,
  type EndpointRecommendation,
} from '../endpoint-recommender-service';

/** What a model returns when asked to produce regulatory guidance: plausible, and invented. */
const INVENTED = JSON.stringify({
  'Overall Survival': [
    {
      authority: 'FDA',
      document_name: 'Guidance for Industry: Endpoint Selection in Advanced Solid Tumours (2024)',
      guidance_text: 'Overall survival remains the preferred primary endpoint for registrational intent.',
    },
  ],
});

function serviceWithModel(answer: string) {
  const calls: string[] = [];
  const hf = {
    queryHuggingFace: async (prompt: string) => {
      calls.push(prompt);
      return answer;
    },
  };
  const svc = new EndpointRecommenderService(hf as never);
  const getRegulatoryGuidance = (indication: string, phase: string) =>
    (svc as unknown as {
      getRegulatoryGuidance(i: string, p: string): Promise<Record<string, unknown>>;
    }).getRegulatoryGuidance(indication, phase);
  return { svc, calls, getRegulatoryGuidance };
}

describe('endpoint recommender: regulatory guidance is retrieved or absent, never generated', () => {
  it('returns no guidance when nothing was retrieved, instead of asking a model to write some', async () => {
    const { calls, getRegulatoryGuidance } = serviceWithModel(INVENTED);

    const guidance = await getRegulatoryGuidance('non-small cell lung cancer', 'Phase 3');

    expect(guidance).toEqual({});
    // The absence of the call is the point: there is no prompt whose answer
    // could be mistaken for a citation.
    expect(calls).toHaveLength(0);
  });

  it('does not surface an invented document name under any endpoint key', async () => {
    const { getRegulatoryGuidance } = serviceWithModel(INVENTED);

    const guidance = await getRegulatoryGuidance('non-small cell lung cancer', 'Phase 3');

    expect(JSON.stringify(guidance)).not.toContain('Endpoint Selection in Advanced Solid Tumours');
  });

  it('answers the same way when the model returns nothing usable', async () => {
    const { getRegulatoryGuidance } = serviceWithModel('not json at all');

    await expect(getRegulatoryGuidance('rheumatoid arthritis', '')).resolves.toEqual({});
  });

  /**
   * Why the empty answer matters, stated as the consequence it removes. This
   * assertion holds before and after the fix; it is here so a reader knows what
   * a non-empty `regulatory_guidance` buys an endpoint.
   */
  it('regulatory backing is the highest evidence basis there is, which is why it cannot be invented', () => {
    const base: EndpointRecommendation = {
      endpoint: 'Overall Survival',
      success_rate: null,
      evidence: [],
      is_primary: true,
    } as unknown as EndpointRecommendation;

    expect(classifyEndpointBasis(base)).toBe('ai_suggested');
    expect(
      classifyEndpointBasis({
        ...base,
        regulatory_guidance: [
          { authority: 'FDA', document_name: 'anything', guidance_text: 'anything' },
        ],
      }),
    ).toBe('regulatory_recommended');
  });
});
