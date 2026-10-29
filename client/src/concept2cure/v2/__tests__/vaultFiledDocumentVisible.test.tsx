// @vitest-environment jsdom
/**
 * Vault (DMS) — a document filed through the API is visible on the surface
 * (VSR-001 §8 F-11; URS-VAULT-009; OQ-VAULT-09).
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * The write path (POST /api/vault/ingest, then POST /api/c2c/project-vault/:id/
 * file) and the read model (GET /api/c2c/project-vault/:id) share one store,
 * vault.documents, and the read model carries the document as a leaf of the
 * "Source files · filing cabinet" branch — OQ-VAULT-04 proved that. The surface
 * still did not show it: it browses ONE folder at a time, defaults to the first
 * tree node (the governed CTD spine), and the cabinet is the LAST node, so its
 * leaves rendered nowhere on the page until a person found and clicked the
 * branch. A reviewer reads "not on the page" as "not in the vault", and in a
 * regulated vault that is a finding.
 *
 * ── What this pins ───────────────────────────────────────────────────────────
 * With the tree shaped exactly as the read model shapes it — spine first,
 * cabinet last — the filed document's title is on the page after the read
 * settles, with no click, and the row leads to the cabinet folder it sits in.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Vault } from '../surfaces/Vault';

const PID = 'ac97f9db-c0fe-46de-ad90-d0bc6b7bbf12';
const DOC_UUID = '7ab9a621-84a9-4c28-8a87-55eb7a648687';
const DOC_TITLE = 'OQ-002 Protocol 20260921011458';

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response;
}

function sectionLeaf(num: string, title: string) {
  return {
    id: `sec-doc_67dd-${num}`,
    num,
    title,
    type: 'Required',
    status: 'not_started',
    pct: 0,
    owner: '—',
    ver: 'v1',
    updated: 'just now',
    preview: `${title} · mandatory section`,
    blocker: true,
    src: 'authored',
  };
}

/** The filed upload, as the read model projects a vault.documents row after
 *  POST …/file placed it in Module 5 (OQ-VAULT-07). */
function filedUpload() {
  return {
    id: `up-${DOC_UUID}`,
    num: '—',
    title: DOC_TITLE,
    type: 'Protocol',
    status: 'confirmed',
    pct: 100,
    owner: 'JM Smith',
    ver: 'v1.0',
    updated: 'just now',
    preview: 'OQ-002-Protocol-20260921011458.pdf · 611 B · SHA-256 2d811d6a9643…',
    src: 'upload',
    docId: DOC_UUID,
    sizeLabel: '611 B',
    hash: '2d811d6a964381f417c4535c5006865a224bc40d88c4e189495babf73a2a4fa9',
    filing: {
      folderId: 'module-5',
      folderLabel: 'Module 5 · Clinical',
      evidenceKind: null,
      ctdSection: null,
      placementStatus: 'confirmed',
      confidence: null,
      rationale: 'OQ-002 step 07 — filed into Module 5 by validation.',
    },
  };
}

/** Spine FIRST, cabinet LAST — the order GET /api/c2c/project-vault/:id emits. */
function readModelTree() {
  return [
    {
      id: 'vaultdoc-doc_67dd',
      code: 'IND',
      label: 'OQ-002 Vault program — IND × FDA · eCTD M1 + ICH M4 M2–M5',
      children: [
        {
          id: 'sec-doc_67dd-M1',
          code: 'M1',
          label: 'Module 1 · Administrative',
          children: [sectionLeaf('1.2', 'Cover letter'), sectionLeaf('1.20', 'Introductory statement')],
        },
      ],
    },
    {
      id: 'cabinet',
      code: '',
      label: 'Source files · filing cabinet',
      children: [
        { id: 'cab-unfiled', code: '', label: 'Unfiled · needs review', children: [] },
        { id: 'cab-module-5', code: '', label: 'Module 5 · Clinical', children: [filedUpload()] },
      ],
    },
  ];
}

function vaultPayload(over: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      program: 'OQ-002 Vault program',
      spine: 'IND · 21 CFR 312',
      standard: 'biotech',
      documentCount: 3,
      tree: readModelTree(),
      unfiledCount: 0,
      uploadsWindow: { shown: 1, total: 1, truncated: false },
      dataRoom: { captured: 0, classified: 0, filed: 0, sources: [] },
      ...over,
    },
  };
}

const props = () => ({
  surface: { id: 'vault', label: 'Vault' } as any,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biopharma',
});

beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID, title: 'OQ-002 Vault program' };
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url === `/api/c2c/project-vault/${PID}` && method === 'GET') return ok(vaultPayload());
    return ok({});
  });
});
afterEach(() => {
  cleanup();
  delete (window as any).C2C_PROJECT;
});

describe('Vault — a document filed through the API is on the page', () => {
  it('shows the filed document by title once the read settles, with the spine still the open folder', async () => {
    render(<Vault {...props()} />);

    // The spine is still the default browse folder (unchanged behaviour)…
    expect((await screen.findAllByText('Cover letter')).length).toBeGreaterThan(0);
    // …and the filed upload is on the page WITHOUT navigating the tree.
    const lane = screen.getByTestId('vault-uploads-lane');
    expect(within(lane).getByText(DOC_TITLE)).toBeTruthy();
    // With where the vault holds it, so "on the page" is also "findable".
    expect(within(lane).getAllByText(/Module 5 · Clinical/).length).toBeGreaterThan(0);
    // Counted honestly against the server's programme-wide window, not the rows shown.
    expect(lane.textContent).toMatch(/1 uploaded file/);
  });

  it('the row opens the cabinet folder the document sits in and selects it', async () => {
    render(<Vault {...props()} />);
    const lane = await screen.findByTestId('vault-uploads-lane');

    fireEvent.click(within(lane).getByText(DOC_TITLE));

    // Breadcrumb now names the cabinet folder, and the folder list carries the row.
    const list = document.querySelector('.vd-list') as HTMLElement;
    expect(within(list).getByText(/Module 5 · Clinical/)).toBeTruthy();
    expect(within(list).getAllByText(DOC_TITLE).length).toBeGreaterThan(0);
    // The detail pane shows the selected document (its filing decision is a
    // real column, rendered as such).
    const detail = document.querySelector('.vd-detail') as HTMLElement;
    expect(within(detail).getAllByText(DOC_TITLE).length).toBeGreaterThan(0);
  });

  it('a vault with no uploads says so in the lane rather than rendering nothing', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (url === `/api/c2c/project-vault/${PID}` && method === 'GET') {
        const tree = readModelTree();
        (tree[1] as { children: Array<{ children: unknown[] }> }).children[1].children = [];
        return ok(vaultPayload({ tree, uploadsWindow: { shown: 0, total: 0, truncated: false } }));
      }
      return ok({});
    });
    render(<Vault {...props()} />);

    const lane = await screen.findByTestId('vault-uploads-lane');
    expect(lane.textContent).toMatch(/No files uploaded to this project yet/i);
  });
});

/**
 * At a phone's width the lane's names rendered 0 px wide, so no document could
 * be opened from the lane (RR3 acceptance, 390x844). Every other part of the
 * row is fixed-width or nowrap ("Auto-filed · confirm" alone is 146 px), and
 * the name's button, the one part allowed to shrink to nothing, took the whole
 * shortfall. Its cap was an inline style, which no media query can lift.
 *
 * jsdom does no layout, so this pins the mechanism; the measured widths at
 * 390x844 and 1440x900 are docs/evidence/D2-VAULT-PHONE-LIST/2026-10-29/.
 */
describe('Vault — the uploads lane at a phone width', () => {
  const css = fs
    .readFileSync(path.resolve(__dirname, '..', 'styles', 'misc-surfaces-v2.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  /** Declarations of `selector` in the top-level rules, or inside `@media (max-width:Npx)` blocks with N <= maxPx. */
  function rulesOf(selector: string, where: 'base' | { maxPx: number }): string[] {
    const out: string[] = [];
    const walk = (text: string, inNarrow: boolean) => {
      let i = 0;
      while (i < text.length) {
        const open = text.indexOf('{', i);
        if (open < 0) break;
        const head = text.slice(i, open).split(';').pop()!.trim();
        let depth = 1;
        let j = open + 1;
        for (; j < text.length && depth > 0; j++) {
          if (text[j] === '{') depth++;
          else if (text[j] === '}') depth--;
        }
        const body = text.slice(open + 1, j - 1);
        const media = /^@media\s*\(max-width:\s*(\d+)px\)$/.exec(head);
        if (media) {
          if (where !== 'base' && Number(media[1]) <= where.maxPx) walk(body, true);
        } else if (head.startsWith('@')) {
          // another at-rule: not this check's
        } else if (body.includes('{')) {
          walk(body, inNarrow); // a nested wrapper such as `.c2c-v2 { … }`
        } else if (head.split(',').some((s) => s.trim() === selector) && (where === 'base' ? !inNarrow : inNarrow)) {
          out.push(body);
        }
        i = j;
      }
    };
    walk(css, false);
    return out;
  }

  it('the name button carries its cap as a class, not an inline style', async () => {
    render(<Vault {...props()} />);
    const lane = await screen.findByTestId('vault-uploads-lane');
    const button = within(lane).getByText(DOC_TITLE).closest('button') as HTMLButtonElement;
    expect(button.classList.contains('vd-dr-open')).toBe(true);
    expect(button.getAttribute('style')).toBeNull();
  });

  it('on a desktop the cap is unchanged: at most 45% of the row, and it may shrink', () => {
    const base = rulesOf('.vd-dr-open', 'base').join(';');
    expect(base).toMatch(/max-width:\s*45%/);
    expect(base).toMatch(/min-width:\s*0/);
    expect(base).toMatch(/flex-shrink:\s*1/);
  });

  it('at a phone width the row wraps, so the name keeps a line of its own width', () => {
    const row = rulesOf('.vd-dr-row', { maxPx: 900 }).join(';');
    const open = rulesOf('.vd-dr-open', { maxPx: 900 }).join(';');
    expect(row).toMatch(/flex-wrap:\s*wrap/);
    expect(open).toMatch(/max-width:\s*none/);
    expect(open).toMatch(/flex:\s*1 1 \d+%/);
  });
});
