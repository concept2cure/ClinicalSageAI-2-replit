/**
 * The quiet chrome's stylesheet rules: the sidebar (D1-1, §D1.A step 6) and the top bar (D1-2,
 * §D1.B step 7), read from app-v2.css.
 *
 * Split out of shellQuietChrome.test.tsx, which keeps the rendered cases, when that file passed the
 * 500-line limit. The cases are unchanged; what they pin and why is in that file's header.
 */
import { describe, expect, it } from 'vitest';
import { APP_V2_CSS, rules } from './_cssRules';

/* ── The sidebar's rules (app-v2.css) ─────────────────────────────────────── */

// The parser moved to _cssRules.ts in D1-3, shared with the palette's rules (cmdkPlaces.test.tsx).
const CSS = APP_V2_CSS;

const ALL = rules(CSS);
/** The sidebar's own rules: the rail's classes, the rows, the account button. The account menu's
 *  `.acct-*` block is the menu's; the two rules this step ranks above it are checked by name below. */
const SIDEBAR = /\.(rail(?:-[a-z]+)?|nav-item|nav-lic|avatar)(?![\w-])/;
const sidebar = ALL.filter((r) => SIDEBAR.test(r.selector) && !/\.acct-/.test(r.selector));
const unconditional = (sel: string) => ALL.filter((r) => r.media === null && r.selector === sel);
const phone = ALL.filter((r) => r.media !== null && /max-width:\s*640px/.test(r.media));

describe('the sidebar’s rules (app-v2.css, §D1.A step 6)', () => {
  it('finds the sidebar’s rules', () => {
    expect(sidebar.length).toBeGreaterThan(20);
  });

  it('the round "+" of New conversation is the sidebar’s one orange', () => {
    const plus = sidebar.filter((r) => /\.rail-new/.test(r.selector) && /background\s*:\s*var\(--accent-strong\)/.test(r.body));
    expect(plus.map((r) => r.selector)).toEqual(['.c2c-v2 .nav-item.rail-new .ico']);
    const orange = sidebar
      .filter((r) => r.selector !== '.c2c-v2 .nav-item.rail-new .ico')
      .filter((r) => /var\(--accent-(strong|100|200|000|main)/.test(r.body))
      .map((r) => r.selector);
    expect(orange).toEqual([]);
  });

  it('no brand fill beside Home’s own row, and the ".RI" in ink', () => {
    expect(CSS).not.toMatch(/\.rail-logo\[data-on/);
    expect(unconditional('.c2c-v2 .rail-logo-text span')[0]?.body).toMatch(/color:var\(--text-300\)/);
  });

  it('group labels are 12px sentence case in --text-300', () => {
    const h = unconditional('.c2c-v2 .rail-group-h')[0]?.body ?? '';
    expect(h).toMatch(/text-transform:none/);
    expect(h).toMatch(/font-size:var\(--fs-caption,\s*12px\)/);
    expect(h).toMatch(/color:var\(--text-300\)/);
  });

  it('rows are 14px, recents 13px, and nothing in the sidebar is under 12px', () => {
    expect(unconditional('.c2c-v2 .nav-item')[0]?.body).toMatch(/font-size:var\(--fs-body,\s*14px\)/);
    expect(unconditional('.c2c-v2 .rail-recent')[0]?.body).toMatch(/font-size:var\(--fs-small,\s*13px\)/);
    const small = sidebar.flatMap((r) =>
      Array.from(r.body.matchAll(/font-size\s*:\s*([\d.]+)px/g)).filter((m) => Number(m[1]) < 12).map((m) => `${r.selector} ${m[0]}`));
    expect(small).toEqual([]);
  });

  it('the avatar is ink, in the sidebar and the account menu’s head, ranked above the menu block’s own rule', () => {
    const ink = unconditional('.c2c-v2 .rail :is(.rail-account, .acct-head) .avatar')[0]?.body ?? '';
    expect(ink).toMatch(/background:var\(--text-100\)/);
    expect(ink).toMatch(/color:var\(--bg-000\)/);
    // The global rule keeps the shape only; no fill of its own.
    expect(unconditional('.c2c-v2 .avatar')[0]?.body).not.toMatch(/background/);
  });

  it('the account’s second line is 12px --text-300; the menu head’s line 13px', () => {
    expect(unconditional('.c2c-v2 .rail-account .rl')[0]?.body).toMatch(/font-size:var\(--fs-caption,\s*12px\);color:var\(--text-300\)/);
    expect(unconditional('.c2c-v2 .rail .acct-head .rl')[0]?.body).toMatch(/font-size:var\(--fs-small,\s*13px\)/);
  });

  it('at ≤640px no strip is reserved, the collapsed rail is not drawn, and the expanded one is the drawer', () => {
    const sel = (s: string) => phone.find((r) => r.selector === s)?.body ?? '';
    // Both variables are 0, so every grid that reads them (here and the editor's) reserves nothing.
    expect(sel('.c2c-v2.shell')).toMatch(/--rail:0px/);
    expect(sel('.c2c-v2.shell')).toMatch(/--rail-collapsed:0px/);
    expect(sel('.c2c-v2.shell[data-collapsed="true"] .rail')).toMatch(/display:none/);
    expect(sel('.c2c-v2.shell:not([data-collapsed="true"]) .rail')).toMatch(/position:fixed/);
    expect(sel('.c2c-v2.shell:not([data-collapsed="true"]) .rail')).toMatch(/box-shadow:var\(--v2-shadow-lg\)/);
    expect(sel('.c2c-v2.shell:not([data-collapsed="true"]) .rail-scrim')).toMatch(/display:block/);
    // The top bar's button shows only there. D1-2 folded D1-1's interim `.topbar .tb-rail`
    // rules into the bar's own `:is(.tb-rail, .tb-new)` pair (§D1.B step 7).
    expect(unconditional('.c2c-v2 :is(.tb-rail, .tb-new)')[0]?.body).toMatch(/display:none/);
    expect(sel('.c2c-v2 :is(.tb-rail, .tb-new)')).toMatch(/display:inline-flex/);
  });
});

/* ── The top bar's rules (app-v2.css, §D1.B steps 7 and 8) ───────────────── */

/** The bar's own rules: its box, the crumbs, its icon buttons and the Your work badge. */
const BAR = /\.(topbar|crumbs|crumb-proj|tb-btn|tb-rail|tb-new|tb-collab|tb-newtask|tt-badge|tt-trigger)(?![\w-])/;
/** `.tb-btn.on` is the MDX filters' engaged state (K510Surface, cer/SignalsTab), which the spec keeps. */
const bar = ALL.filter((r) => BAR.test(r.selector) && !/\.tb-btn\.on/.test(r.selector));
const body = (sel: string, media: 'none' | 'phone' = 'none') =>
  (media === 'none' ? unconditional(sel) : phone.filter((r) => r.selector === sel)).map((r) => r.body).join(';');

describe('the top bar’s rules (app-v2.css, §D1.B step 7)', () => {
  it('finds the bar’s rules', () => {
    expect(bar.length).toBeGreaterThan(10);
  });

  it('the bar: 4px between controls, a hairline under it that Home drops', () => {
    expect(body('.c2c-v2 .topbar')).toMatch(/gap:4px;.*border-bottom:1px solid var\(--border\)/);
    expect(body('.c2c-v2 .main[data-surface="home"] .topbar')).toMatch(/border-bottom-color:transparent/);
  });

  it('the crumbs: 13px --text-300, the page --text-100 at 500, the project a quiet button that hovers --bg-100, unclipped', () => {
    expect(body('.c2c-v2 .crumbs')).toMatch(/font-size:var\(--fs-small,\s*13px\);color:var\(--text-300\)/);
    expect(body('.c2c-v2 .crumbs .here')).toMatch(/color:var\(--text-100\);font-weight:500/);
    expect(body('.c2c-v2 .crumb-proj')).toMatch(/color:var\(--text-200\)/);
    expect(body('.c2c-v2 .crumb-proj:hover')).toMatch(/background:var\(--bg-100\)/);
    expect(body('.c2c-v2 .crumb-proj .ico')).toMatch(/color:var\(--text-300\)/);
    /* Review: .crumbs clips and is as tall as the crumb, which sits 8px left of its text. Unpadded,
       the clip cut its hover fill and the shell's 2px-outset focus ring; at phone width it sits flush. */
    expect([body('.c2c-v2 .crumbs').match(/overflow:hidden|padding-left:\s*\d+px/g), body('.c2c-v2 .crumb-proj:focus-visible'), body('.c2c-v2 .topbar .crumbs', 'phone')])
      .toEqual([['overflow:hidden', `padding-left:${/margin-left:\s*-(\d+)px/.exec(body('.c2c-v2 .crumb-proj'))?.[1]}px`], 'outline-offset:-2px;', 'margin-left:0;padding-left:0;']);
  });

  it('icon buttons: 32px, --text-300, hover --bg-100; 44px at phone width', () => {
    expect(body('.c2c-v2 .tb-btn')).toMatch(/width:32px;height:32px/);
    expect(body('.c2c-v2 .tb-btn')).toMatch(/color:var\(--text-300\)/);
    expect(body('.c2c-v2 .tb-btn:hover')).toMatch(/background:var\(--bg-100\)/);
    expect(body('.c2c-v2 :is(.tb-btn)', 'phone')).toMatch(/width:44px;height:44px/);
  });

  it('at phone width the menu and New conversation show, and Collaborate and New task go to ⌘K', () => {
    expect(body('.c2c-v2 :is(.tb-rail, .tb-new)')).toMatch(/display:none/);
    expect(body('.c2c-v2 :is(.tb-rail, .tb-new)', 'phone')).toMatch(/display:inline-flex/);
    expect(body('.c2c-v2 .topbar .tb-collab, .c2c-v2 .topbar .tb-newtask', 'phone')).toMatch(/display:none/);
  });

  it('the badge is ink at 12px, and red when something is overdue', () => {
    expect(body('.c2c-v2 .tt-badge')).toMatch(/background:var\(--text-100\);color:var\(--bg-000\)/);
    expect(body('.c2c-v2 .tt-badge')).toMatch(/font-size:var\(--fs-caption,\s*12px\)/);
    expect(body('.c2c-v2 .tt-trigger[data-overdue] .tt-badge')).toMatch(/background:var\(--error\)/);
  });

  it('no orange and nothing under 12px in the bar’s rules', () => {
    const orange = bar.filter((r) => /var\(--accent-(strong|100|200|000|muted|main)/.test(r.body)).map((r) => r.selector);
    expect(orange).toEqual([]);
    const small = bar.flatMap((r) =>
      Array.from(r.body.matchAll(/font-size\s*:\s*(?:var\(--fs-[\w-]+,\s*)?([\d.]+)px/g))
        .filter((m) => Number(m[1]) < 12).map((m) => `${r.selector} ${m[0]}`));
    expect(small).toEqual([]);
  });

  it('the retired bar classes have no rule left', () => {
    // Each name and every `-suffix` of it (`.tb-task-lbl`, `.tb-org-mark`, `.tb-proj[data-empty]`).
    for (const gone of ['tb-cmdk', 'tb-org', 'tb-task', 'tb-proj', 'crumb-root', 'crumb-tier']) {
      expect(CSS.includes(`.${gone}`), gone).toBe(false);
    }
  });

  it('the lazy fallback is a quiet line, not a box (§D1.B step 8)', () => {
    expect(body('.c2c-v2 .scaf-note[aria-busy="true"]'))
      .toMatch(/border:0;background:none;.*text-align:center;font-size:var\(--fs-small,\s*13px\);color:var\(--text-300\)/);
  });
});
