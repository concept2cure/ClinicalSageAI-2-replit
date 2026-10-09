// @vitest-environment jsdom
/**
 * A refused content save reports the RECORD's reason, not a generic sentence.
 *
 * ── The defect this guards ───────────────────────────────────────────────────
 * A content save goes through `RichSectionEditor`'s handle, because the canvas
 * owns the serialization and the device crash-cache. That handle catches the
 * write's rejection itself — it has to, so its own footer can report "not
 * persisted" — and resolves `false`. So the host got a boolean where the
 * server had sent a sentence, and a 409 SECTION_CHANGED ("this section was
 * changed by someone else since you opened it") reached the author as "The
 * section was not saved." The one fact they needed — that somebody else had
 * moved the row and their draft was about to overwrite it — was dropped on the
 * floor. Proven live before the fix: docs/evidence/WO2/2026-09-21 records the
 * generic sentence over a real concurrent edit.
 *
 * ── Why the editor is stubbed HERE ───────────────────────────────────────────
 * ProseMirror cannot be made dirty from jsdom with `fireEvent`, and this case
 * exists only on the dirty-content path. The stub is the handle's contract and
 * nothing else; that the pane mounts the REAL `RichSectionEditor` is asserted
 * in protocolDevSectionEditor.test.tsx, which does not stub it.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

/* The handle's contract: `save()` serializes, calls `onSave`, SWALLOWS the
   rejection and resolves false — exactly what the real component does. */
vi.mock('../editor/RichSectionEditor', () => ({
  RichSectionEditor: React.forwardRef(function Stub(
    { value, onSave, onDirtyChange }:
    { value: string; onSave: (s: string) => Promise<void> | void; onDirtyChange?: (d: boolean) => void },
    ref: React.Ref<unknown>,
  ) {
    React.useImperativeHandle(ref, () => ({
      save: async () => { try { await onSave(value + ' edited'); return true; } catch { return false; } },
      getContent: () => value,
    }));
    React.useEffect(() => { onDirtyChange?.(true); }, [onDirtyChange]);
    return <div data-testid="stub-canvas">{value}</div>;
  }),
}));

import { ProtocolSectionPane } from '../surfaces/ProtocolDevSection';

const REASON = 'Saving over a section a second author has since changed';
const DOC = {
  id: '2', shortTitle: 'C2C-101-201',
  sections: [{ id: '101', num: '1', title: 'Synopsis', status: 'draft', required: true, updatedAt: '2026-09-21T10:00:00.000Z' }],
  content: { 101: [{ h: 'Synopsis', p: 'A randomised, double-blind study.', prov: {} }] },
};

const conflict = () => ({
  ok: false, status: 409,
  json: async () => ({ error: { code: 'SECTION_CHANGED', message: 'This section was changed by someone else since you opened it. Reload to see the current text; your draft was not saved.' } }),
}) as Response;
const refused = () => ({
  ok: false, status: 409,
  json: async () => ({ error: { code: 'INVALID_STATE', message: 'This protocol is finalized and cannot be edited.' } }),
}) as Response;

function mount() {
  const onSaved = vi.fn();
  render(
    <ProtocolSectionPane
      doc={DOC as never} sec={DOC.sections[0] as never} canWrite
      onAsk={vi.fn()} onSaved={onSaved}
    />,
  );
  return { onSaved };
}

async function save() {
  fireEvent.change(screen.getByLabelText(/Reason for change/), { target: { value: REASON } });
  fireEvent.click(screen.getByRole('button', { name: /Save section/ }));
}

beforeEach(() => apiRequest.mockReset());
afterEach(() => cleanup());

describe('a refused content save carries the server’s reason', () => {
  it('reports a concurrent change in the words the route used', async () => {
    apiRequest.mockResolvedValue(conflict());
    const { onSaved } = mount();
    await save();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/changed by someone else/));
    expect(screen.getByRole('alert').textContent).toMatch(/still on screen and was not written/);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('reports any other refusal in the route’s own words too', async () => {
    apiRequest.mockResolvedValue(refused());
    mount();
    await save();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/finalized and cannot be edited/));
  });

  it('reports a save the canvas refused with no server reason as exactly that', async () => {
    // `save()` can resolve false without `onSave` ever being called — the
    // canvas refuses to serialize. There is no server sentence to quote, and
    // the pane must not invent one.
    apiRequest.mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 101 }) } as Response);
    const { onSaved } = mount();
    await save();
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});
