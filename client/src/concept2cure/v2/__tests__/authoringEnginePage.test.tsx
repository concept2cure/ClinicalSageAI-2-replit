// @vitest-environment jsdom
/**
 * D4-7 (§D4.J item 4): the authoring engine page takes D0's header, chip and banner migrations, and nothing else.
 *
 * - The header is D0's `.ph`: no "Biotech & Pharma · authoring" eyebrow (the top bar and the rail say where you are),
 *   and "Draft with AnA" is a quiet action, not a second orange button beside the page's one primary.
 * - The claim row is quiet words with a check, not bordered pills (D0 §1.9: status and claims as words).
 * - The page's one primary stays "Open the document editor".
 *
 * Whether this static page is retired is a founder question (§D4.M); it is not decided here.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true, data: [] }) })),
}));

import { AuthoringEngine } from '../surfaces/AuthoringEngine';

const HERE = dirname(fileURLToPath(import.meta.url));
const JOURNEY_CSS = resolve(HERE, '../styles/journey-v2.css');

afterEach(() => cleanup());

function renderPage() {
  return render(
    <AuthoringEngine
      surface={{ id: 'authoring-engine', label: 'AnA authoring engine', navTier: 'global' } as never}
      onAsk={() => {}}
      onNav={() => {}}
      segment="biotech"
    />,
  );
}

describe('The authoring engine page on D0 (D4-7)', () => {
  it('has the page header with no eyebrow, and asks AnA quietly', () => {
    const { container } = renderPage();
    expect(container.querySelector('.reg-eyebrow, .ph-eyebrow')).toBeNull();
    expect(container.textContent).not.toMatch(/Biotech & Pharma/);
    const head = container.querySelector('.ph')!;
    expect(head.querySelector('h1.ph-title')?.textContent).toBe('AnA authoring engine');
    const ask = screen.getByRole('button', { name: /Draft with AnA/ });
    expect(ask.className).toBe('btn ghost');
    expect(ask.closest('.ph-acts')).not.toBeNull();
    expect(container.querySelector('.reg-ask')).toBeNull();
  });

  it('keeps "Open the document editor" as the page\'s one primary', () => {
    const { container } = renderPage();
    const primaries = [...container.querySelectorAll('.btn.primary')];
    expect(primaries).toHaveLength(1);
    expect(primaries[0].textContent).toMatch(/Open the document editor/);
  });

  it('states its claims as quiet words, not bordered pills', () => {
    const rule = /\.c2c-v2 \.ae-badge\{([^}]*)\}/.exec(readFileSync(JOURNEY_CSS, 'utf8'))?.[1] ?? '';
    expect(rule).not.toMatch(/border:\s*1px/);
    expect(rule).not.toMatch(/border-radius:\s*99px/);
    expect(rule).toMatch(/font-size:\s*var\(--fs-small\)/);
  });
});
