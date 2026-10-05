// @vitest-environment jsdom
/**
 * The docks say that Manual does not reach them (row 74, slice S4).
 *
 * Manual is honoured by the AnA rail and the conversation screen, which run
 * the shell's chat and send its run policy. The editor dock
 * (DocumentWorkbench), the eCTD co-author and RBM run their OWN chats, which
 * send no run policy — the server's turn there is today's effort-bounded one:
 * she does not stop between steps, and anything that changes a record still
 * waits for a person. Bridging Manual into them is handed on (row 74). Until
 * it lands, a person who chose Manual must not be left to assume it applies
 * there: each dock says so beside its composer — and, under Auto, that Auto's
 * time limit and its stop on an unanswered request do not reach it either.
 */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

/* jsdom has no layout; ProseMirror asks for client rects on mount (the shim
   ectdCoauthorEmptyStateAction.test.tsx uses). */
const emptyRects = function () {
  return [] as unknown as DOMRectList;
};
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = emptyRects;
  if (typeof proto.getBoundingClientRect !== 'function') {
    proto.getBoundingClientRect = function () {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 } as DOMRect;
    };
  }
}

import { RunPolicyContext, RunPolicyDockNote } from '../RunPolicySwitch';
import { EctdCoauthor } from '../surfaces/EctdCoauthor';
import type { AnaRunPolicy } from '@shared/ana/run-control-limits';

const NOTE =
  'Manual applies to the AnA rail and conversation. Here AnA works without stopping between steps, ' +
  'up to her round limit; anything that changes a record still waits for you.';

const AUTO_NOTE =
  'Auto applies to the AnA rail and conversation. Here AnA works up to her usual round limit, with no time limit, ' +
  'and an unanswered request does not end her turn; anything that changes a record still waits for you.';

afterEach(cleanup);
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response);
});

const within = (policy: AnaRunPolicy | null, node: React.ReactNode) =>
  policy ? <RunPolicyContext.Provider value={{ runPolicy: policy, setRunPolicy: vi.fn() }}>{node}</RunPolicyContext.Provider> : node;

describe('the note', () => {
  it('is said under Manual', () => {
    render(within('manual', <RunPolicyDockNote />));
    expect(screen.getByText(NOTE)).toBeTruthy();
  });

  it('is said under Auto too, in its own words: Auto\'s time limit and its stop on an unanswered request do not reach a dock', () => {
    // Review follow-through (objection 13): the Auto description says "she
    // stops" on an unanswered approval; a dock's own chat does not.
    render(within('auto', <RunPolicyDockNote />));
    expect(screen.getByText(AUTO_NOTE)).toBeTruthy();
  });

  it('says nothing outside the shell', () => {
    const bare = render(<RunPolicyDockNote />);
    expect(bare.container.textContent).toBe('');
  });
});

describe('each dock mounts it beside its composer', () => {
  const src = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
  const near = (file: string, composer: string, span = 1500) => {
    const s = src(file);
    const at = s.indexOf(composer);
    expect(at, `${file}: composer anchor not found`).toBeGreaterThan(-1);
    return s.slice(at, at + span);
  };

  it('DocumentWorkbench — the editor dock', () => {
    expect(near('editor/DocumentWorkbench.tsx', 'ref={anaComposerRef}', 2400)).toContain('<RunPolicyDockNote />');
  });

  it('EctdCoauthor — the co-author composer', () => {
    expect(near('surfaces/EctdCoauthor.tsx', '<div className="ec-composer">', 3000)).toContain('<RunPolicyDockNote />');
  });

  it('RBM — the study dock composer', () => {
    expect(near('surfaces/RbmSurfaces.tsx', '<div className="rbm-ana-composer">', 800)).toContain('<RunPolicyDockNote />');
  });

  it('the co-author, rendered, says each policy in its own words', () => {
    const props = { surface: { id: 'ectd-coauthor', label: 'eCTD' } as never, onNav: vi.fn(), segment: 'biopharma' };
    render(within('manual', <EctdCoauthor {...props} />));
    expect(screen.getByText(NOTE)).toBeTruthy();
    cleanup();
    render(within('auto', <EctdCoauthor {...props} />));
    expect(screen.queryByText(NOTE)).toBeNull();
    expect(screen.getByText(AUTO_NOTE)).toBeTruthy();
  });
});
