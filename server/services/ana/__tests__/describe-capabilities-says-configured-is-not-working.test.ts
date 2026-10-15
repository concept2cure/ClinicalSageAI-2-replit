/**
 * describe_capabilities tells the model that a configured integration is one it
 * can try, not one that works.
 *
 * What the guidance used to say: only "offer or attempt tools whose integration
 * is configured". Every integration entry carries reachability 'unchecked' (no
 * call has proved any of them reachable) and integrationSummary.live counts only
 * proven ones, but nothing told the model so — "configured" read as "working",
 * and the model could tell the user an integration was live or connected.
 */
import { describe, expect, it } from 'vitest';
// Importing the executor registers every handler as a side effect.
import { getToolHandler } from '../AnaToolExecutor';

describe('describe_capabilities: configured is not working', () => {
  it("states that reachability is unchecked, configured means can be tried, and live counts only proven ones", async () => {
    const out = JSON.parse(await getToolHandler('describe_capabilities')!({}, {} as never));
    // The payload the guidance describes: nothing has been proved reachable.
    expect(out.integrations.every((i: { reachability: string }) => i.reachability === 'unchecked')).toBe(true);
    expect(out.integrationSummary.live).toBe(0);

    const guidance: string = out.guidance;
    expect(guidance, 'the guidance does not say reachability is unchecked').toMatch(/reachability is 'unchecked' for every integration/i);
    expect(guidance).toMatch(/configured means it can be tried, not that it works/i);
    expect(guidance).toMatch(/never call (one|an integration) live or connected/i);
    expect(guidance).toMatch(/integrationSummary\.live counts only/);
  });
});
