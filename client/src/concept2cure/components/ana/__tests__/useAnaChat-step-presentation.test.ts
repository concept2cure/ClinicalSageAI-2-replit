/**
 * @vitest-environment jsdom
 *
 * The step a frame describes, live and reopened (ANA-SUMMARY S3,
 * docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md §5 S3).
 *
 * The hook kept its own label table and fell back to the tool's name,
 * humanised ("Sentinel tool xyz"), on a live frame and on a reopened trace;
 * and a finished step kept the label it was announced with, so a search that
 * was over still read "Searching…". The server's labels are now the only
 * labels: a frame with none reads "Running a step" / "Ran a step", and a
 * result's label (the done form) replaces the announced one, with its source,
 * preview, facts and usedModel.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

import { useAnaChat, hydrateToolTrace } from '../useAnaChat';

const ev = (o: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(o)}\n\n`);
const drain = () => new Promise((r) => setTimeout(r, 25));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis.fetch as any) = fetchMock;
});
afterEach(cleanup);

function openStream() {
  let ctl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(c) { ctl = c; } });
  return { ctl, body };
}

const lastAssistant = (result: { current: ReturnType<typeof useAnaChat> }) =>
  [...result.current.messages].reverse().find((m) => m.role === 'assistant')!;

async function startTurn() {
  const { ctl, body } = openStream();
  fetchMock.mockResolvedValue({ ok: true, status: 200, body });
  const hook = renderHook(() => useAnaChat({ projectId: 'proj_12' }));
  await act(async () => {
    void hook.result.current.send('find the shelf-life claims');
    await drain();
  });
  return { ctl, result: hook.result };
}

describe('live frames', () => {
  it('S3 test 3: a frame with no label reads "Running a step", never the tool\'s name', async () => {
    const { ctl, result } = await startTurn();
    await act(async () => {
      ctl.enqueue(ev({ type: 'tool_use', round: 1, name: 'sentinel_tool_xyz', toolUseId: 'tu_x', input: { q: 'x' } }));
      await drain();
    });
    const call = lastAssistant(result).toolCalls?.[0];
    expect(call?.label).toBe('Running a step');
    expect(JSON.stringify({ label: call?.label, preview: call?.preview, facts: call?.facts })).not.toMatch(/sentinel/i);
  });

  it('S3 test 3: the finished frame\'s "Ran a step" replaces the announced label', async () => {
    const { ctl, result } = await startTurn();
    await act(async () => {
      ctl.enqueue(ev({ type: 'tool_use', round: 1, name: 'sentinel_tool_xyz', toolUseId: 'tu_x', label: 'Running a step' }));
      ctl.enqueue(ev({ type: 'tool_result', round: 1, name: 'sentinel_tool_xyz', toolUseId: 'tu_x', label: 'Ran a step', status: 'success', result: '{}' }));
      await drain();
    });
    expect(lastAssistant(result).toolCalls?.[0].label).toBe('Ran a step');
  });

  it('S3 test 4: a live step reads in the doing form and the finished one in the done form, with its facts', async () => {
    const { ctl, result } = await startTurn();
    await act(async () => {
      ctl.enqueue(
        ev({
          type: 'tool_use', round: 1, name: 'search_project_documents', toolUseId: 'tu_s',
          label: 'Searching the Vault', source: 'vault', preview: 'shelf life',
          facts: [{ name: 'Searched for', value: 'shelf life' }], input: { query: 'shelf life' },
        }),
      );
      await drain();
    });
    expect(lastAssistant(result).toolCalls?.[0]).toMatchObject({ label: 'Searching the Vault', status: 'running', source: 'vault', preview: 'shelf life' });
    await act(async () => {
      ctl.enqueue(
        ev({
          type: 'tool_result', round: 1, name: 'search_project_documents', toolUseId: 'tu_s',
          label: 'Searched the Vault', source: 'vault', preview: 'shelf life', status: 'success', latencyMs: 2400, usedModel: false,
          facts: [{ name: 'Searched for', value: 'shelf life' }, { name: 'Found', value: '12 matches' }, { name: 'Took', value: '2.4s' }],
          result: '{"totalMatches":12}',
        }),
      );
      await drain();
    });
    expect(lastAssistant(result).toolCalls?.[0]).toMatchObject({
      label: 'Searched the Vault',
      status: 'success',
      usedModel: false,
      facts: [{ name: 'Searched for', value: 'shelf life' }, { name: 'Found', value: '12 matches' }, { name: 'Took', value: '2.4s' }],
    });
  });
});

describe('a reopened trace', () => {
  it('S3 test 3: an entry with no label reads "Ran a step", never the tool\'s name', () => {
    const [call] = hydrateToolTrace([{ tool: 'sentinel_tool_xyz', status: 'success' }]);
    expect(call.label).toBe('Ran a step');
    expect(call.label).not.toMatch(/sentinel/i);
  });

  it('carries the presentation the server recorded, and its sentence for a step that did not succeed', () => {
    const [ok, failed] = hydrateToolTrace([
      {
        tool: 'search_project_documents', label: 'Searched the Vault', status: 'success', resultSummary: '12 matches',
        source: 'vault', preview: 'shelf life', facts: [{ name: 'Found', value: '12 matches' }], usedModel: false,
      },
      {
        tool: 'validate_ectd_package', label: 'Validating the eCTD package', status: 'error', resultSummary: 'error: x',
        source: 'engine', message: "AnA couldn't finish validating the eCTD package and continued without it.",
      },
    ]);
    expect(ok).toMatchObject({ label: 'Searched the Vault', source: 'vault', preview: 'shelf life', usedModel: false, facts: [{ name: 'Found', value: '12 matches' }] });
    expect(failed.message).toBe("AnA couldn't finish validating the eCTD package and continued without it.");
  });
});
