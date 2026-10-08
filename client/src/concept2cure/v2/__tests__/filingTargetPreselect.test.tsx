// @vitest-environment jsdom
/**
 * The filing picker pre-selects a sequence only when exactly one is open
 * (P-21, product decision 2026-10-08: regulated choices start unstated).
 *
 * The shared picker (filingTarget.tsx — the IND forms panel, the Vault, the
 * authoring dialog and the CMC dialog) chose the FIRST open sequence for the
 * person. With an original 0000 and a draft amendment 0001 both open, that is a
 * regulatory decision — which submission a document is filed in — made by the
 * list order. With one open sequence there is no decision to make; with two or
 * more nothing is chosen until the person chooses.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { useFilingTarget, FilingTargetFields, type SequenceRow } from '../surfaces/filingTarget';

const PROGRAM = '44444444-4444-4444-8444-444444444444';
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
const seq = (id: number, sequenceNumber: string, status: string, type = 'amendment'): SequenceRow => ({ id, sequenceNumber, type, status, region: 'fda' });

function Harness() {
  const target = useFilingTarget(undefined, PROGRAM);
  const { load } = target;
  React.useEffect(() => load(), [load]);
  return (
    <div>
      <FilingTargetFields target={target} idPrefix="t" />
      <output data-testid="chosen">{target.seqId == null ? 'none' : String(target.seqId)}</output>
    </div>
  );
}

function serve(sequences: SequenceRow[]) {
  apiRequest.mockImplementation(async (_m: string, raw: unknown) => {
    const url = String(raw ?? '');
    if (url.startsWith('/api/submissions?')) {
      return ok([{ id: 6, title: 'Vorelinib IND', applicationType: 'ind', primaryRegion: 'fda', status: 'active', programId: PROGRAM }]);
    }
    if (url === '/api/submissions/6/sequences') return ok(sequences);
    return ok([]);
  });
}

async function pickTheSubmission() {
  render(<Harness />);
  fireEvent.change(await screen.findByLabelText('Target submission'), { target: { value: '6' } });
  await screen.findByLabelText('Sequence');
}

beforeEach(() => apiRequest.mockReset());
afterEach(cleanup);

describe('the filing picker chooses a sequence only when there is no choice to make', () => {
  it('with two open sequences (0000 and a draft 0001) nothing is chosen until the person chooses', async () => {
    serve([seq(61, '0000', 'validated', 'original'), seq(62, '0001', 'draft')]);
    await pickTheSubmission();
    const select = screen.getByLabelText('Sequence') as HTMLSelectElement;
    await waitFor(() => expect(select.options.length).toBe(3));
    expect(select.value).toBe('');
    expect(select.options[select.selectedIndex].text).toBe('Choose a sequence…');
    expect(screen.getByTestId('chosen').textContent).toBe('none');

    fireEvent.change(select, { target: { value: '61' } });
    expect(screen.getByTestId('chosen').textContent).toBe('61');
  });

  it('with exactly one open sequence it is chosen, and a locked one never is', async () => {
    serve([seq(61, '0000', 'frozen', 'original'), seq(62, '0001', 'draft')]);
    await pickTheSubmission();
    await waitFor(() => expect(screen.getByTestId('chosen').textContent).toBe('62'));
  });

  it('with every sequence locked nothing is chosen', async () => {
    serve([seq(61, '0000', 'dispatched', 'original'), seq(62, '0001', 'frozen')]);
    await pickTheSubmission();
    await waitFor(() => expect((screen.getByLabelText('Sequence') as HTMLSelectElement).options.length).toBe(3));
    expect(screen.getByTestId('chosen').textContent).toBe('none');
  });
});
