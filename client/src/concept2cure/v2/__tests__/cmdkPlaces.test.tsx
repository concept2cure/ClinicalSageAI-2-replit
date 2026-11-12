// @vitest-environment jsdom
/**
 * ⌘K reaches what a person can already see; it is not a catalogue (slice 0 of
 * .design/client-journey/INFORMATION_ARCHITECTURE.md, section 2).
 *
 * Its empty-query "Jump to" listed the first eight registry rows: Projects,
 * Plan & features, Artifacts center, Project home, the editor, Regulatory
 * workspace (locked), Vault, Review. A search listed every registry surface,
 * the ones outside the release included, each as a "not in this release" lock.
 * Now:
 *   - "Jump to" (now "Go to") lists the places, in the rail's order;
 *   - with a project open, its six steps are listed, and each opens that step
 *     through the same validated action the rest of the product uses;
 *   - a surface outside the release is not listed. A licence lock (a plan, a
 *     module switched off) is still listed with its reason: the unlock panel
 *     that answers it is where a person learns what to do
 *     (cmdkLicenseGating.test.tsx).
 *
 * D1-3 (.design/claude-convergence/D1.md §D1.F): with nothing typed the palette
 * offers the most likely next things, as Claude's does: "This project" (when one
 * is open), the person's "Recent conversations", "Go to" (the places, which was
 * "Jump to") and "Actions" (which was "Quick actions", and gains New task and
 * Message a colleague: the phone's way to both, which left the top bar there).
 * A search's groups say "Pages" (which was "Surfaces"), and the "Ask AnA" row
 * stands without its own "AnA" header or hint. A place's row carries no hint.
 * The footer of key hints is gone; ">" is named in the placeholder.
 *
 * Its look (app-v2.css, §D1.F step 6): Claude's palette is a centred dialog on a
 * dimmed, lightly blurred page, with a large quiet field, sentence-case groups,
 * ink rows with grey icons and a soft fill on the selected row. Ours tinted the
 * selected row orange, drew every icon orange, set hints at 11px and a footer at
 * 10px. Pinned in its rules: no orange, nothing under 12px, the blur and the fade
 * (off under reduced motion), the fills light and dark, the field with no ring of
 * its own, 44px rows at phone width, no footer, the lock rules kept.
 * Red at 1c48581ae (before D1-3): docs/evidence/DESIGN/D1/D1-3/red/.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
/* The signed-in account: an id (the navigation verdicts are read only for an account with one, navEntitlements.tsx
   useNavigationReadOwner), and the same object on every render, as the session gives it. */
const stableUser = vi.hoisted(() => {
  const seen = new Map<string, Record<string, unknown>>();
  return (u: Record<string, unknown>) => {
    const key = JSON.stringify(u);
    if (!seen.has(key)) seen.set(key, { id: 21, ...u });
    return seen.get(key)!;
  };
});
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({
    user: stableUser({ firstName: 'Ada', lastName: 'Rowe', displayName: 'Ada Rowe', roles: ['member'] }),
    logout: vi.fn(),
  }),
}));
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: null, organizationId: 7 }),
}));

import { NavEntitlementsProvider, type NavEntitlementsPayload, type NavSurfaceEntitlement } from '../navEntitlements';
import { CmdK } from '../Shell';
import { clearShellProject, publishShellProject } from '../shellProject';
import { __resetSurfaceActionBus, registerSurfaceActionHandlers } from '../surfaceActions';
import { APP_V2_CSS, rules } from './_cssRules';

const NAV_URL = '/api/module-subscriptions/navigation';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

/** The verdicts, and (when given) the person's conversations; any other read fails. */
function serve(surfaces: NavSurfaceEntitlement[] = [], threads?: () => Response) {
  const body: NavEntitlementsPayload = {
    organizationId: 7, tier: 'standard', industryMode: 'biotech', masterAdmin: false, resolved: true, surfaces,
  };
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === NAV_URL) return ok(body);
    if (method === 'GET' && threads && url.startsWith('/api/chat/threads')) return threads();
    throw new Error(`unexpected ${method} ${url}`);
  });
}

function Harness({ onNav, onClose }: { onNav: (id: string) => void; onClose?: () => void }) {
  const [open, setOpen] = React.useState(true);
  return (
    <NavEntitlementsProvider>
      <CmdK open={open} onClose={() => { onClose?.(); setOpen(false); }} onNav={onNav} onAsk={vi.fn()} onAct={vi.fn()} />
    </NavEntitlementsProvider>
  );
}

async function mount() {
  const onNav = vi.fn();
  const onClose = vi.fn();
  render(<Harness onNav={onNav} onClose={onClose} />);
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', NAV_URL, undefined, undefined, expect.any(AbortSignal)));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return { onNav, onClose };
}

/** The rows under one header, in order, by their visible label. */
function rowsUnder(header: string): string[] {
  const out: string[] = [];
  let inside = false;
  for (const el of Array.from(document.querySelectorAll('.cmdk-list > *'))) {
    if (el.classList.contains('cmdk-hdr')) {
      inside = el.textContent?.trim() === header;
      continue;
    }
    if (inside) out.push(el.querySelector('.lbl')?.textContent?.trim() ?? '');
  }
  return out;
}

const search = (term: string) => fireEvent.change(screen.getByRole('textbox'), { target: { value: term } });

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
  clearShellProject();
  __resetSurfaceActionBus();
  delete window.C2C_CONVO;
  delete (window as unknown as { C2C?: unknown }).C2C;
});

const RELEASE_LOCK = (id: string, label: string): NavSurfaceEntitlement => ({
  id, label, entitled: false, source: 'launch-scope', requiredTier: null,
});

describe('⌘K: places, the open project\'s steps, and features already shown', () => {
  // D1-3 (§D1.F step 1): the group is "Go to", which was "Jump to".
  it('"Go to" lists the places, in the rail\'s order', async () => {
    serve();
    await mount();
    expect(rowsUnder('Go to')).toEqual([
      'Home', 'Projects', 'Tasks', 'Communication', 'Vault', 'Submission Center', 'CMC / Module 3', 'Biostatistics', 'Risk-based monitoring', 'Quality', 'Reporting & analytics',
    ]);
  });

  it('a place opens as the rail opens it', async () => {
    serve();
    const { onNav } = await mount();
    fireEvent.click(screen.getByRole('button', { name: /^Vault/ }));
    expect(onNav).toHaveBeenCalledWith('vault');
  });

  it('a surface outside the release is not listed; a licence lock still is, with its reason', async () => {
    serve([
      RELEASE_LOCK('submission-twin', 'Submission twin'),
      { id: 'submission-center', label: 'Submission Center', entitled: false, source: 'tier', requiredTier: 'professional' },
    ]);
    await mount();
    search('submission');
    expect(screen.queryByRole('button', { name: /Submission twin/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Submission Center — not included in your subscription' })).toBeTruthy();
  });

  it('with a project open, its steps are listed, and a step opens the project on it', async () => {
    publishShellProject({ id: '16431c9c-f452-4bf6-9482-95a920ee51eb', title: 'BX-401 Oncology IND', code: 'BX-401' });
    serve();
    const { onNav } = await mount();
    expect(rowsUnder('This project')).toEqual(['Plan', 'Evidence', 'Author', 'Review', 'Submit', 'Respond']);
    search('evid');
    fireEvent.click(screen.getByRole('button', { name: /^Evidence.*BX-401/ }));
    expect(onNav).toHaveBeenCalledWith('project-home');
    const stages: string[] = [];
    registerSurfaceActionHandlers('project-home', {
      'project-home.set-stage': (params) => {
        stages.push(params.stage);
        return { ok: true };
      },
    });
    expect(stages).toEqual(['evidence']);
  });

  it('with no project open, no steps are listed', async () => {
    serve();
    await mount();
    expect(rowsUnder('This project')).toEqual([]);
    search('plan');
    expect(screen.queryByText('This project')).toBeNull();
  });
});

/* ── D1-3: the palette with nothing typed, and its words (D1.md §D1.F) ───────── */

const THREADS = [
  { id: 't-1', title: 'Summarize the nonclinical package' },
  { id: 't-2', title: null },
  { id: 't-3', title: 'Draft the cover letter' },
  { id: 't-4', title: 'What blocks dispatch?' },
  { id: 't-5', title: 'Compare the two stability studies' },
];
const threadsOk = () => ok({ threads: THREADS });
const headers = () => Array.from(document.querySelectorAll('.cmdk-list .cmdk-hdr')).map((el) => el.textContent?.trim());
/** The palette's row whose label is exactly this (a predicate, not a pattern built from text). */
const rowNamed = (label: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('.cmdk-item')).find((el) => el.querySelector('.lbl')?.textContent === label);
const hintOf = (label: string) => rowNamed(label)?.querySelector('.hint')?.textContent;

describe('⌘K with nothing typed: the most likely next things (§D1.F steps 1–3)', () => {
  it('groups: This project, Recent conversations, Go to, Actions, in sentence case', async () => {
    publishShellProject({ id: '16431c9c-f452-4bf6-9482-95a920ee51eb', title: 'BX-401 Oncology IND', code: 'BX-401' });
    serve([], threadsOk);
    await mount();
    await screen.findByText('Summarize the nonclinical package');
    expect(headers()).toEqual(['This project', 'Recent conversations', 'Go to', 'Actions']);
  });

  it('lists the person’s conversations first, newest first, read only while the palette is open', async () => {
    serve([], threadsOk);
    await mount();
    await screen.findByText('Summarize the nonclinical package');
    expect(headers()).toEqual(['Recent conversations', 'Go to', 'Actions']);
    expect(rowsUnder('Recent conversations')).toEqual([
      'Summarize the nonclinical package', 'Untitled conversation', 'Draft the cover letter', 'What blocks dispatch?', 'Compare the two stability studies',
    ]);
    expect(apiRequest.mock.calls.filter(([m, u]) => m === 'GET' && String(u).startsWith('/api/chat/threads')).map(([, u]) => u))
      .toEqual(['/api/chat/threads?limit=5']);
    // Closed, the palette reads nothing.
    cleanup();
    apiRequest.mockClear();
    render(<NavEntitlementsProvider><CmdK open={false} onClose={vi.fn()} onNav={vi.fn()} onAsk={vi.fn()} onAct={vi.fn()} /></NavEntitlementsProvider>);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(apiRequest.mock.calls.some(([, u]) => String(u).startsWith('/api/chat/threads'))).toBe(false);
  });

  it('a conversation opens as the sidebar’s Recents opens it, by click or by Enter', async () => {
    serve([], threadsOk);
    const { onNav, onClose } = await mount();
    fireEvent.click(await screen.findByRole('button', { name: /^Draft the cover letter/ }));
    expect(window.C2C_CONVO).toEqual({ id: 't-3' });
    expect(onNav).toHaveBeenCalledExactlyOnceWith('conversation-thread');
    expect(onClose).toHaveBeenCalledTimes(1);
    cleanup();
    delete window.C2C_CONVO;
    const second = await mount();
    await screen.findByText('Summarize the nonclinical package');
    // The cursor starts on the first row: the newest conversation.
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(window.C2C_CONVO).toEqual({ id: 't-1' });
    expect(second.onNav).toHaveBeenCalledExactlyOnceWith('conversation-thread');
  });

  it('a failed read says so; none is no group at all', async () => {
    serve([], () => ({ ok: false, status: 500, json: async () => ({ error: 'down' }) }) as Response);
    await mount();
    await waitFor(() => expect(document.body.textContent).toContain('Conversations could not be read, so none are listed here.'));
    expect(headers()).toEqual(['Recent conversations', 'Go to', 'Actions']);
    expect(rowsUnder('Recent conversations')).toEqual(['']);
    cleanup();
    serve([], () => ok({ threads: [] }));
    await mount();
    expect(headers()).toEqual(['Go to', 'Actions']);
  });

  it('a place carries no hint; Actions are the two quick actions, New task and Message a colleague', async () => {
    serve([], threadsOk);
    await mount();
    expect(hintOf('CMC / Module 3')).toBe('');
    expect(hintOf('Vault')).toBe('');
    expect(rowsUnder('Actions')).toEqual(['Run validation', 'Export document', 'New task', 'Message a colleague']);
  });

  it.each([
    ['New task', 'task'],
    ['Message a colleague', 'collab'],
  ])('"%s" opens the launcher on its tab, as the top bar does, and closes the palette', async (label, mode) => {
    const open = vi.fn();
    (window as unknown as { C2C?: unknown }).C2C = { open };
    serve([], threadsOk);
    const { onNav, onClose } = await mount();
    fireEvent.click(rowNamed(label)!);
    expect(open).toHaveBeenCalledExactlyOnceWith(mode);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onNav).not.toHaveBeenCalled();
  });
});

describe('⌘K’s words when searching (§D1.F steps 1, 4 and 5)', () => {
  it('the field names projects, conversations, pages and ">" for actions; there is no footer of key hints', async () => {
    serve();
    await mount();
    expect(screen.getByRole('textbox').getAttribute('placeholder')).toBe('Search projects, conversations and pages, or type > for actions');
    expect(document.querySelector('.cmdk-foot')).toBeNull();
    expect(document.body.textContent).not.toMatch(/↑↓|↵|esc close|\/ jump/);
  });

  it('pages are under "Pages"; "Ask AnA" ends the list with no header or hint of its own', async () => {
    serve();
    await mount();
    search('vault');
    expect(rowsUnder('Pages')).toContain('Vault');
    expect(headers()).not.toContain('Surfaces');
    expect(headers()).not.toContain('AnA');
    const rows = Array.from(document.querySelectorAll('.cmdk-list .cmdk-item'));
    const ask = rows[rows.length - 1];
    expect(ask.querySelector('.lbl')?.textContent).toBe('Ask AnA: "vault"');
    expect(ask.querySelector('.hint')?.textContent).toBe('');
    expect(hintOf('Vault')).toBe('');
  });

  it('">" lists the AI actions; New task is found by its name', async () => {
    serve();
    await mount();
    search('>');
    expect(headers()).toEqual([]);
    const labels = Array.from(document.querySelectorAll('.cmdk-item .lbl')).map((el) => el.textContent);
    expect(labels).toEqual(expect.arrayContaining(['Run validation', 'Refine with findings', 'Attach sources']));
    search('new task');
    expect(rowsUnder('Actions')).toContain('New task');
  });
});

/* ── The palette's rules (app-v2.css, §D1.F step 6) ───────────────────────── */

const ALL = rules(APP_V2_CSS);
const MEDIA = {
  none: (m: string | null) => m === null,
  phone: (m: string | null) => m !== null && /max-width:\s*640px/.test(m),
  reduced: (m: string | null) => m !== null && /prefers-reduced-motion:\s*reduce/.test(m),
};
/** The bodies of every rule with exactly this selector, in that media, joined. */
const body = (sel: string, media: keyof typeof MEDIA = 'none') =>
  ALL.filter((r) => r.selector === sel && MEDIA[media](r.media)).map((r) => r.body).join(';');
/** ⌘K's own rules. The lock rules (`[data-locked]`, `.nav-lic`) are kept as they were (the spec: "keep
 *  the lock rules"), and the field's focus rule is D0's input block (§4.2.5), not the palette's. */
const palette = ALL.filter((r) => /\.cmdk(?:-[a-z]+)?(?![\w-])/.test(r.selector) && !/\[data-locked\]|\.nav-lic|:focus-visible/.test(r.selector));

describe('the palette’s rules (app-v2.css, §D1.F step 6)', () => {
  it('finds the palette’s rules', () => {
    expect(palette.length).toBeGreaterThan(10);
  });

  it('a centred dialog on a dimmed, lightly blurred page, with a fade that reduced motion turns off', () => {
    expect(body('.c2c-v2 .cmdk-bd')).toMatch(/z-index:80;.*padding:14vh 16px 16px;background:rgb\(20 20 19 \/ \.24\);backdrop-filter:blur\(4px\);animation:de-fade var\(--dur\) var\(--ease\)/);
    expect(body('.c2c-v2.dark .cmdk-bd')).toMatch(/background:rgb\(0 0 0 \/ \.5\)/);
    expect(body('.c2c-v2 .cmdk-bd', 'reduced')).toMatch(/animation:none/);
    expect(body('.c2c-v2 .cmdk')).toMatch(/width:min\(640px,100%\);background:var\(--canvas-elevated\);.*border-radius:var\(--radius-2xl\)/);
  });

  it('rows: 36px, 14px --text-200, grey icons, 12px hints; the selected row a soft fill, --bg-200 in dark', () => {
    expect(body('.c2c-v2 .cmdk-item')).toMatch(/min-height:36px;.*font-size:var\(--fs-body,\s*14px\);color:var\(--text-200\)/);
    expect(body('.c2c-v2 .cmdk-item.on')).toMatch(/background:var\(--bg-100\);color:var\(--text-100\)/);
    expect(body('.c2c-v2.dark .cmdk-item.on')).toMatch(/background:var\(--bg-200\)/);
    expect(body('.c2c-v2 .cmdk-item .ico')).toMatch(/color:var\(--text-300\)/);
    expect(body('.c2c-v2 .cmdk-item .hint')).toMatch(/font-size:var\(--fs-caption,\s*12px\);color:var\(--text-300\)/);
  });

  it('group labels are 12px sentence case in --text-300', () => {
    expect(body('.c2c-v2 .cmdk-hdr')).toMatch(/font-size:var\(--fs-caption,\s*12px\);font-weight:500;letter-spacing:0;text-transform:none;color:var\(--text-300\)/);
  });

  it('the field is a large quiet line with no ring of its own; D0’s focus rule still steps the outline aside', () => {
    expect(body('.c2c-v2 .cmdk-in input')).toMatch(/border:0;background:none;font-size:var\(--fs-section,\s*15px\);color:var\(--text-100\)/);
    expect(palette.filter((r) => /\.cmdk-in/.test(r.selector) && /box-shadow|outline/.test(r.body)).map((r) => r.selector)).toEqual([]);
    // Found by what it covers, not by its whole list: D0's input block names every composer, and it grows (845a63b2bf).
    const focus = ALL.filter((r) => r.media === null && /:is\([^)]*\.cmdk-in input[^)]*\):focus-visible/.test(r.selector));
    expect(focus.map((r) => r.selector)).toHaveLength(1);
    expect(focus[0].body).toMatch(/outline:\s*none/);
  });

  it('no orange and nothing under 12px in the palette’s rules', () => {
    expect(palette.filter((r) => /var\(--accent-(strong|100|200|000|muted|main)/.test(r.body)).map((r) => r.selector)).toEqual([]);
    const small = palette.flatMap((r) =>
      Array.from(r.body.matchAll(/font-size\s*:\s*(?:var\(--fs-[\w-]+,\s*)?([\d.]+)px/g))
        .filter((m) => Number(m[1]) < 12).map((m) => `${r.selector} ${m[0]}`));
    expect(small).toEqual([]);
  });

  it('at phone width the dialog sits 8px from the top and rows are 44px', () => {
    expect(body('.c2c-v2 .cmdk-bd', 'phone')).toMatch(/padding-top:8px/);
    expect(body('.c2c-v2 .cmdk-item', 'phone')).toMatch(/min-height:44px/);
  });

  it('the footer has no rule left, the list and the empty line one each, and the lock rules are kept', () => {
    expect(APP_V2_CSS.includes('.cmdk-foot')).toBe(false);
    expect(ALL.filter((r) => r.media === null && r.selector === '.c2c-v2 .cmdk-list')).toHaveLength(1);
    expect(ALL.filter((r) => r.media === null && r.selector === '.c2c-v2 .cmdk-empty')).toHaveLength(1);
    expect(body('.c2c-v2 .cmdk-item[data-locked] .lbl')).toMatch(/color:var\(--text-300\)/);
    expect(body('.c2c-v2 .cmdk-item[data-locked].on .nav-lic[data-lic="off"]')).toMatch(/color:var\(--warning\)/);
  });
});
