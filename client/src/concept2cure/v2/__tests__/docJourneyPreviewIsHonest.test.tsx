// @vitest-environment jsdom
/**
 * The document-journey preview may not offer a control it cannot honour.
 *
 * ── The finding ──────────────────────────────────────────────────────────────
 * The preview carried a nine-control formatting toolbar — a paragraph-style
 * select (Title / Heading 1 / Heading 2 / Body text), B, I, U, bulleted list,
 * numbered list, block quote, insert table — and a "Track changes" pill, on a
 * surface whose ONLY request is GET /api/doc-journey. There is no save path,
 * no mutation, no draft store. A user pressed Bold and nothing happened, ever.
 *
 * ── Why "disabled" was not the fix, and this test is ─────────────────────────
 * This was already fixed once, the other way, and the fix did not hold. The
 * previous pass marked all nine `disabled` and gave each `title="Read-only
 * preview"` — attribute-correct, and still a live-looking toolbar, because the
 * CASCADE never followed the attribute. `.dj-tb-b` had no `:disabled` rule and
 * `.dj-tb-b:hover` still lifted every button; `.dj-tb-tc:hover` still turned
 * the Track-changes pill accent-coloured, so the one control that implies a
 * Part 11 audit-trail mode read as armable on a regulated document.
 *
 * That is the argument this test encodes. Keeping the toolbar and disabling it
 * requires the same truth to be told in three places at once — the `disabled`
 * attribute, the tooltip, and the cascade — in two different files. Those
 * three drifted apart inside a single commit. Deleting the toolbar requires
 * the truth in one place, and a correctly-disabled nine-control toolbar still
 * tells every reader who does not hover that this screen formats documents.
 * The affordance IS the message. So: the controls are gone, and the toolbar
 * strip states the constraint and names the way out instead.
 *
 * ── What is pinned ───────────────────────────────────────────────────────────
 * Deliberately not just "the markup is absent". The invariant is the one that
 * survives either decision, so a future author who wants the toolbar back can
 * have it — but only honestly:
 *
 *   1. no interactive control in the preview may be inert. Any that exists
 *      must be genuinely `disabled` AND carry a title that says both that this
 *      is read-only and where the document is actually edited;
 *   2. the stylesheet must MATCH — no `.dj-tb-*` rule may survive that the
 *      surface does not render, and no `:hover` rule may target a toolbar
 *      class, because there is no live toolbar control to highlight.
 *
 * (2) is the half that was missing last time, and it is why the CSS is read
 * off disk here rather than asserted through jsdom. jsdom applies no author
 * stylesheet, so a rendered-tree assertion cannot see a hover rule at all —
 * exactly the blind spot the previous fix fell into.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() =>
  vi.fn(async (..._a: unknown[]): Promise<any> => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: [] }),
  })),
);
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { DocJourney } from '../surfaces/DocJourney';

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS_PATH = resolve(HERE, '../styles/app-v2.css');
const TSX_PATH = resolve(HERE, '../surfaces/DocJourney.tsx');

/* A journey whose selected stage renders the DOCUMENT page mode — the only
   mode that ever drew the toolbar. Shaped exactly as the assembler returns it
   (server doc-journey.routes.ts → doc-journey-view-assembler). */
const JOURNEY = [
  {
    id: 'approved',
    label: 'Approved',
    ic: 'checkCircle',
    when: '12 Aug 2026',
    who: 'A. Reviewer',
    ver: '3.0',
    done: true,
    active: true,
    sub: 'Signed off by the reviewer',
    kind: 'doc',
    doc: { title: 'Clinical Overview', module: '2.5', productCode: 'BX-204', version: '3.0' },
    snap: {
      mode: 'doc',
      heading: 'Clinical Overview',
      seal: 'Approved',
      body: ['The clinical development programme comprised three studies.'],
      prov: 'Reconstructed from the document audit trail',
    },
  },
];

beforeEach(() => {
  cleanup();
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (..._a: unknown[]) => ({
    ok: true,
    status: 200,
    json: async () => (String(_a[1] ?? '').includes('/api/doc-journey')
      ? { success: true, data: JOURNEY }
      : { success: true, data: [] }),
  }));
});
afterEach(() => cleanup());

async function renderPreview() {
  const view = render(
    <DocJourney
      surface={{ id: 'doc-journey', label: 'Document journey', navTier: 'global' } as any}
      onAsk={() => {}}
      onNav={() => {}}
      segment="biotech"
    />,
  );
  // Assert on the SETTLED tree. The toolbar only exists in the document page
  // modes, which only exist after the journey resolves.
  await waitFor(() => expect(view.container.querySelector('.dj-page')).not.toBeNull());
  return view;
}

/* ── The stylesheet predicate, factored out so it can be shown failing ────── */

/** Every `.dj-tb-*` class the stylesheet styles, with whether the rule is a
 *  `:hover` rule. One entry per selector occurrence, not per rule block. */
function toolbarSelectors(css: string): { cls: string; hover: boolean; selector: string }[] {
  const out: { cls: string; hover: boolean; selector: string }[] = [];
  // Rule heads only: everything before the `{` of each block.
  for (const m of css.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    const head = m[1];
    for (const c of head.matchAll(/\.(dj-tb-[a-z0-9-]+)/gi)) {
      out.push({ cls: c[1], hover: /:hover/.test(head), selector: head.trim().slice(0, 160) });
    }
  }
  return out;
}

function stylesheetFindings(css: string, tsx: string): string[] {
  const findings: string[] = [];
  const rendered = new Set(
    [...tsx.matchAll(/className=["'{`][^"'}`]*?\b(dj-tb-[a-z0-9-]+)/gi)].map((m) => m[1]),
  );
  for (const { cls, hover, selector } of toolbarSelectors(css)) {
    if (!rendered.has(cls)) {
      findings.push(`orphaned toolbar rule for .${cls} — the surface renders no such class: ${selector}`);
    }
    if (hover) {
      findings.push(`hover rule on .${cls} — the preview toolbar has no live control to highlight: ${selector}`);
    }
  }
  return findings;
}

/* ── The gate must be able to fail ────────────────────────────────────────────
   Verbatim from the stylesheet as it stood while the toolbar was "fixed" by
   marking the buttons disabled. If this ever comes back green, the predicate
   above has stopped predicating and every case below is decoration. */
const SEEDED_BAD_CSS = `
.c2c-v2 .dj-tb-sel{font-size:12px;}
.c2c-v2 .dj-tb-b{width:30px;height:30px;}
.c2c-v2 .dj-tb-b:hover{background:var(--bg-100);color:var(--text-100);}
.c2c-v2 .dj-tb-tc{display:inline-flex;}
.c2c-v2 .dj-tb-tc:hover{border-color:var(--accent-100);color:var(--accent-200);}
.c2c-v2 .dj-tb-dot{width:7px;}
.c2c-v2 .dj-tb-tc:hover .dj-tb-dot{background:var(--accent-100);}
.c2c-v2 .dj-tb-save{margin-left:auto;}
`;

describe('the stylesheet gate measures what it claims', () => {
  it('flags the orphaned rules and the hover highlights it exists to catch', () => {
    // `tsx` here renders only the read-only strip, as the surface does today.
    const found = stylesheetFindings(SEEDED_BAD_CSS, '<span className="dj-tb-ro" />');
    expect(found.some((f) => f.includes('.dj-tb-b —') || f.includes('.dj-tb-b ')), found.join('\n'))
      .toBe(true);
    expect(found.filter((f) => f.startsWith('hover rule')).length).toBeGreaterThanOrEqual(3);
    expect(found.filter((f) => f.startsWith('orphaned')).length).toBeGreaterThanOrEqual(6);
  });

  it('does not flag a class the surface genuinely renders', () => {
    const good = '.c2c-v2 .dj-tb-ro{display:inline-flex;}\n.c2c-v2 .dj-tb-ro svg{width:13px;}';
    expect(stylesheetFindings(good, '<span className="dj-tb-ro" />')).toEqual([]);
  });
});

describe('DocJourney preview offers no control it cannot honour', () => {
  it('states that it is read-only and names where the document is edited', async () => {
    const { container } = await renderPreview();
    const strip = container.querySelector('.dj-toolbar');
    expect(strip, 'the toolbar strip should still exist, carrying the constraint').not.toBeNull();
    const said = (strip!.textContent || '').toLowerCase();
    expect(said).toContain('read-only');
    expect(said).toContain('editor');
    // The way out is a real control, not prose — it has always been here.
    expect(screen.getByRole('button', { name: /open in editor/i })).toBeTruthy();
  });

  it('carries none of the nine formatting controls', async () => {
    const { container } = await renderPreview();
    const strip = container.querySelector('.dj-toolbar')!;
    expect(strip.querySelectorAll('button, select, input, textarea, [role="button"]').length).toBe(0);
    for (const cls of [
      'dj-tb-sel', 'dj-tb-b', 'dj-tb-sep', 'dj-tb-tc', 'dj-tb-dot', 'dj-tb-save',
    ]) {
      expect(container.querySelector('.' + cls), `.${cls} is back in the preview`).toBeNull();
    }
  });

  /* The invariant, not the decision. If the toolbar is ever restored, this is
     the bar it has to clear: really disabled, and a tooltip that tells the
     truth about BOTH facts — that nothing here writes, and where writing
     happens. "Read-only preview" alone was the last version's tooltip, and it
     answered only the first half. */
  it('leaves no inert control anywhere in the preview', async () => {
    const { container } = await renderPreview();
    const region = container.querySelector('.dj-stagepane')!;
    const controls = [...region.querySelectorAll<HTMLElement>(
      '.dj-toolbar button, .dj-toolbar select, .dj-toolbar input, .dj-toolbar textarea, .dj-toolbar [role="button"]',
    )];
    for (const el of controls) {
      expect((el as HTMLButtonElement).disabled, `${el.outerHTML} is offered but does nothing`).toBe(true);
      const t = (el.getAttribute('title') || '').toLowerCase();
      expect(t, `${el.outerHTML} has no explanatory title`).toContain('read-only');
      expect(t, `${el.outerHTML} does not say where to edit`).toMatch(/editor|authoring/);
    }
  });

  it('does not present the page as editable', async () => {
    const { container } = await renderPreview();
    const page = container.querySelector('.dj-page')!;
    expect(page.getAttribute('contenteditable')).toBeNull();
    expect(container.querySelectorAll('[contenteditable="true"]').length).toBe(0);
  });

  it('the stylesheet matches — no orphaned toolbar rule, no hover highlight', () => {
    const findings = stylesheetFindings(readFileSync(CSS_PATH, 'utf8'), readFileSync(TSX_PATH, 'utf8'));
    expect(
      findings,
      findings.length ? `app-v2.css still styles the deleted toolbar:\n  · ${findings.join('\n  · ')}` : '',
    ).toEqual([]);
  });
});
