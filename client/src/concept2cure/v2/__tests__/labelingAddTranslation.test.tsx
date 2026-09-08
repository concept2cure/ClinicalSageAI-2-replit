// @vitest-environment jsdom
/**
 * The add-translation form asks only for what the record can hold.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * Labeling.tsx's `transFormConfig` carried a REQUIRED "Language name" field.
 * The form refused to submit without it — `C2CForm.submit()` returns early with
 * "Complete the required field: Language name" and never calls `onSubmit` — and
 * `addTrans` then read `v.language` and `v.method` and nothing else. Every name
 * a user typed was demanded and thrown away.
 *
 * It could not have been kept. `labeling_translations`
 * (migrations/20260511_qms_and_labeling.sql:187) has language, translator,
 * translation_method, back_translation_verified, status, artifact_id — and no
 * name column; POST /api/mdx/labeling/:id/translations inserts exactly those.
 * The name on the board is DERIVED from the code by `languageName()`.
 *
 * ── What this asserts ────────────────────────────────────────────────────────
 * The CHAIN, not the render: filling in only the fields the write actually uses
 * reaches the transport with the real body. Against the old config that chain
 * breaks at the form — no request is made at all — which is exactly the defect.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const calls: Array<{ method: string; path: string; body?: unknown }> = [];
let responder: (method: string, path: string) => { ok: boolean; status: number; json?: unknown };

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Labeling } from '../surfaces/Labeling';

const DOC = {
  id: 4, device_name: 'Aurora CGM', doc_kind: 'ifu', version: '3',
  organization_id: 7, status: 'draft',
};

beforeEach(() => {
  calls.length = 0;
  apiRequest.mockReset();
  responder = (_m, path) => {
    if (path === '/api/mdx/labeling') return { ok: true, status: 200, json: { data: [DOC] } };
    if (path.endsWith('/translations')) return { ok: true, status: 200, json: { data: [] } };
    if (path.endsWith('/symbols')) return { ok: true, status: 200, json: { data: [] } };
    return { ok: true, status: 200, json: { data: [] } };
  };
  apiRequest.mockImplementation(async (method: string, path: string, body?: unknown) => {
    calls.push({ method, path, body });
    const r = responder(method, path);
    return { ok: r.ok, status: r.status, json: async () => r.json ?? {} };
  });
});
afterEach(() => cleanup());

/** The drawer's own submit button — not the surface's "Add translation" opener. */
function submitButton(): HTMLElement {
  const dialog = screen.getByRole('dialog', { name: 'Add translation' });
  return Array.from(dialog.querySelectorAll('button.de-btn.primary'))[0] as HTMLElement;
}

async function openForm() {
  render(
    <Labeling
      {...({ onAsk: () => {} } as unknown as React.ComponentProps<typeof Labeling>)}
    />,
  );
  const add = await screen.findAllByText(/Add translation/);
  fireEvent.click(add[0].closest('button')!);
  return await screen.findByLabelText(/Language code/);
}

describe('Labeling — add translation', () => {
  it('does not ask for a language name it cannot store', async () => {
    await openForm();
    /* The board's name comes from `languageName(code)`. There is nowhere to put
       a typed one, so it is not collected. */
    expect(screen.queryByLabelText(/Language name/)).toBeNull();
  });

  it('POSTs language + method after the code and method alone are filled in', async () => {
    const code = await openForm();
    fireEvent.change(code, { target: { value: 'pt-BR' } });
    fireEvent.change(screen.getByLabelText(/Translation method/), { target: { value: 'human' } });

    responder = (_m, path) =>
      path.endsWith('/translations')
        ? {
            ok: true, status: 201,
            json: {
              data: {
                id: 91, language: 'pt-BR', translation_method: 'human',
                back_translation_verified: false, status: 'pending',
              },
            },
          }
        : { ok: true, status: 200, json: { data: [] } };

    fireEvent.click(submitButton());

    await waitFor(() =>
      expect(calls.some((c) => c.method === 'POST' && c.path === '/api/mdx/labeling/4/translations')).toBe(true),
    );
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.body).toEqual({ language: 'pt-BR', translationMethod: 'human', status: 'pending' });
    /* Nothing named `name` travels — the column does not exist. */
    expect(Object.keys(post.body as object)).not.toContain('name');
  });

  it('still refuses to submit without the one field the write needs', async () => {
    await openForm();
    fireEvent.change(screen.getByLabelText(/Translation method/), { target: { value: 'human' } });
    fireEvent.click(submitButton());
    await waitFor(() => expect(screen.getByText(/Complete the required field/)).toBeTruthy());
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });
});
