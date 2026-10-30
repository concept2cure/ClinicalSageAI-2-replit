// @vitest-environment jsdom
/**
 * Slice A.1 of .design/client-journey/INFORMATION_ARCHITECTURE.md (section 8): names a client reads.
 *
 * Its evidence, as section 8 names it: "a test that no client-visible label, door or Coming later
 * line contains a word from section 9's 'Not in client copy' list or names a folded feature as
 * live". This is that test. Every check reads a source of truth, never a copy of today's strings:
 *
 *   - the registry label of every surface a client can reach (LAUNCH_SURFACE_IDS, which includes
 *     LAUNCH_SHELL_SURFACES, minus the ids section 9 gives to the administration session), read
 *     through getSurfaceMeta, which is what the breadcrumb, the scaffold's page title and the ⌘K
 *     rows read; and the NAVIGATION_TARGETS label of every reachable target (AnA's Live Drive
 *     strip, the @ menu);
 *   - every door on the project's steps and the device workstream doors, held in one named
 *     constant per job (client/src/concept2cure/v2/projectDoors.ts: STEP_DOORS, DEVICE_DOORS),
 *     compared with section 9's Door names table, rendered for each device pathway, and no
 *     longer written inline anywhere else (one job, one name);
 *   - PJ_LIFECYCLE's `later` and `laterDevice`, the steps' Coming later lines (sections 3, 5.4);
 *   - the IND catalogue's phase names, as Plan reads them (buildIndDocumentCatalogSource);
 *   - the subscription's own words: the account menu, the lock copy (one source for the rail,
 *     ⌘K, Subscription & features and the unlock panel), Subscription & features' heading,
 *     licence band and loading, error and empty states, and its card names as the deployed
 *     catalogue seed would show them;
 *   - the address /concept2cure/features (section 12).
 *
 * The section 9 tables and the section 5.8 fold list are parsed from the IA document itself, so
 * this test cannot drift from the decisions it enforces. The device lane
 * (client/src/concept2cure/mdx/**) and the server's copy are outside this slice's source scans:
 * other sessions own them (the device wording sweep; the server text sweep, task 22).
 */
import React from 'react';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
/* `permissions` as the session carries them (server sessionPermissions): an
   administrator's include billing:admin, a member's do not (P-68). */
const auth = vi.hoisted(() => ({ roles: ['admin', 'user'] as string[], permissions: ['governed:write', 'billing:admin'] as string[] }));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({
    user: { firstName: 'Ada', lastName: 'Rowe', displayName: 'Ada Rowe', roles: auth.roles, permissions: auth.permissions },
    logout: vi.fn(),
  }),
}));
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: null, organizationId: 7, currentOrganization: null }),
}));

import { getSurface, type UiSurface } from '@shared/constants/ui-surface-registry';
import { LAUNCH_SURFACE_IDS } from '@shared/constants/launch-scope';
import { NAVIGATION_TARGETS } from '@shared/navigation/index';
import { getSurfaceMeta } from '../registryModel';
import { locationForSurface, surfaceIdFromLocation, UI_V2_BASE } from '../routing';
import { PJ_LIFECYCLE } from '../fixtures/project-home-data';
import { lockNotice, lockShortReason, NavEntitlementsProvider, type NavSurfaceEntitlement } from '../navEntitlements';
import { Rail, TopBar } from '../Shell';
import { clearShellProject, publishShellProject } from '../shellProject';
import { ProjectMdxWorkflow, type MdxWorkflowProject } from '../surfaces/ProjectMdxWorkflow';
import { norm, offending, SLICE1_LABELS } from './clientNamesSlice1.shared';
import { buildIndDocumentCatalogSource } from '../../../../../server/services/authoring/ind-document-catalog-source';
import { buildIndPyramid } from '../../../../../services/regulatory/pyramids/ind-pyramid';

const REPO = path.resolve(__dirname, '../../../../..');
const V2 = path.resolve(__dirname, '..');
const QUALITY = path.resolve(__dirname, '../../quality');
const rel = (file: string) => path.relative(REPO, file);

/* ── The IA document: section 9's tables and section 5.8's folds ──────────── */

const IA = readFileSync(path.join(REPO, '.design/client-journey/INFORMATION_ARCHITECTURE.md'), 'utf8');

function iaBlock(start: string, end: string): string {
  const i = IA.indexOf(start);
  const j = IA.indexOf(end, i + start.length);
  if (i < 0 || j < 0) throw new Error(`INFORMATION_ARCHITECTURE.md has no "${start}" … "${end}" block`);
  return IA.slice(i, j);
}

/** The body rows of the markdown tables in a block: header and separator rows dropped. */
function tableRows(block: string, header: string): string[][] {
  return block.split('\n')
    .filter((line) => line.startsWith('|'))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells[0] !== header && !cells.every((cell) => /^-+$/.test(cell)));
}

const ids = (cell: string) => [...cell.matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]);

/** Section 9, Surface names: [surface, registry label today, other names, client label, where it changes]. */
const SURFACE_ROWS = tableRows(iaBlock('### Surface names', '### Door names'), 'Surface');
/** Section 9, Door names: [where, today, job name]. */
const DOOR_ROWS = tableRows(iaBlock('### Door names', '## 10.'), 'Where');

/** Rows section 9 changes in slice 1 ("Slice 1", "slice 1 (label)", "Slice 1 (the line), slice 12"). */
const SLICE1_ROWS = SURFACE_ROWS.filter((row) => /\bslice 1\b/i.test(row[4] ?? ''));
/** Ids section 9 gives to the administration session; their names change there, not here. */
const ADMINISTRATION_SESSION_IDS = new Set(
  SURFACE_ROWS.filter((row) => /^administration session$/i.test(row[4] ?? '')).flatMap((row) => ids(row[0])),
);

/** Section 5.8: every folded id and what the client sees in its place. */
const FOLDS: Array<{ id: string; placed: string }> = [
  ...iaBlock('### 5.8 Fold into', '### 5.9').matchAll(/^\| `([a-z0-9-]+)` \| ([^|]+) \|/gm),
].map((m) => ({ id: m[1], placed: m[2].trim() }));
const FOLDED = new Set(FOLDS.map((f) => f.id));

/**
 * A folded feature's own name: its registry label, or, with no registry row, the words of its id.
 * A name its placed name still contains ("Billing" in "Subscription & billing") is not a claim that
 * it is live. Five id phrases are ordinary regulatory words a line may use for the thing itself
 * ("an IND filing", "CE marking", "a safety signal", "a PMA submission", "a 510k submission"), so
 * they are not read as a feature's name.
 */
const ORDINARY_ID_PHRASES = new Set(['ind-filing', 'ce-marking', 'safety-signal', 'pma-submission', '510k-submission']);
const FOLDED_NAMES = FOLDS.flatMap(({ id, placed }) => {
  const label = getSurface(id)?.label;
  if (!label && ORDINARY_ID_PHRASES.has(id)) return [];
  const name = norm(label ?? id.replace(/-/g, ' '));
  if (norm(placed).toLowerCase().includes(name.toLowerCase())) return [];
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [{ id, name, re: new RegExp(`(?:^|[^\\w])${escaped}s?(?![\\w])`, 'i') }];
});

function namesFolded(entries: ReadonlyArray<readonly [string, string | null | undefined]>): string[] {
  return entries.flatMap(([where, text]) => {
    if (!text) return [];
    const hits = FOLDED_NAMES.filter((f) => f.re.test(norm(text)));
    return hits.length ? [`${where}: "${norm(text)}" names ${hits.map((f) => `${f.id} ("${f.name}")`).join(', ')}`] : [];
  });
}

/* ── Source literals (string literals, template literals, JSX text) ───────── */

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== '__tests__') sourceFiles(full, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}
const CLIENT_FILES = [...sourceFiles(V2), ...sourceFiles(QUALITY)];

interface Literal { file: string; line: number; text: string }
const literalCache = new Map<string, Literal[]>();
/** Every literal a file can put on screen; a template literal's substitutions read as "{}". */
function literalsOf(file: string): Literal[] {
  const cached = literalCache.get(file);
  if (cached) return cached;
  const source = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: Literal[] = [];
  const push = (node: ts.Node, text: string) => {
    if (text.trim()) out.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, text: norm(text) });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) push(node, node.text);
    else if (ts.isTemplateExpression(node)) {
      push(node, node.head.text + node.templateSpans.map((span) => `{}${span.literal.text}`).join(''));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  literalCache.set(file, out);
  return out;
}

/** The literals of `files` whose whole text is one of `names` ({…} placeholders match any substitution). */
function wholeLiterals(files: readonly string[], names: ReadonlyArray<{ name: string; caseSensitive?: boolean }>): string[] {
  const wanted = names.map(({ name, caseSensitive }) => ({
    name, caseSensitive,
    key: norm(name).replace(/\{[^}]*\}/g, '{}'),
    tokens: norm(name).split(/\{[^}]*\}/).map((s) => s.trim().toLowerCase()).filter(Boolean),
  }));
  const hits: string[] = [];
  for (const file of files) {
    const raw = norm(readFileSync(file, 'utf8')).toLowerCase();
    const candidates = wanted.filter((w) => w.tokens.every((t) => raw.includes(t)));
    if (!candidates.length) continue;
    for (const lit of literalsOf(file)) {
      for (const w of candidates) {
        const same = w.caseSensitive ? lit.text === w.key : lit.text.toLowerCase() === w.key.toLowerCase();
        if (same) hits.push(`${rel(lit.file)}:${lit.line}: "${lit.text}"`);
      }
    }
  }
  return hits;
}

/** The literals of `files` that contain a match of `re`. */
function literalsMatching(files: readonly string[], re: RegExp, prefilter: RegExp): string[] {
  const hits: string[] = [];
  for (const file of files) {
    if (!prefilter.test(norm(readFileSync(file, 'utf8')))) continue;
    for (const lit of literalsOf(file)) if (re.test(lit.text)) hits.push(`${rel(lit.file)}:${lit.line}: "${lit.text}"`);
  }
  return hits;
}

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async () => ok({ data: [] }));
});
afterEach(() => {
  cleanup();
  clearShellProject();
  auth.roles = ['admin', 'user'];
  auth.permissions = ['governed:write', 'billing:admin'];
});

/** A client can reach a surface when it is in the release, resolved the way the shell resolves it. */
function reachable(targetId: string): boolean {
  const surface = surfaceIdFromLocation(locationForSurface(targetId));
  return surface === 'home' || LAUNCH_SURFACE_IDS.has(surface);
}
const CLIENT_SURFACE_IDS = [...LAUNCH_SURFACE_IDS].filter((id) => !ADMINISTRATION_SESSION_IDS.has(id));

/** Slice 1 rows whose change is not a registry label, and where this file checks each. */
const SLICE1_ELSEWHERE: Readonly<Record<string, string>> = {
  'project-home': 'the breadcrumb names the open project',
  'agency-meetings': "slice 1 changes only Respond's Coming later line; the label changes in slice 12",
  'IND catalogue, phase 1': "the IND catalogue's phase 1 name",
};
const rowKey = (row: string[]) => ids(row[0])[0] ?? row[0];
/** The registry label each slice 1 row carries today, by section 9 (plus the account menu's "Licensing"). */
const OLD_LABELS: Array<{ id: string; name: string }> = [
  ...SLICE1_ROWS.filter((row) => SLICE1_LABELS[rowKey(row)]).map((row) => ({ id: rowKey(row), name: norm(row[1]) })),
  { id: 'master-licensing', name: 'Licensing' },
];
const oldLabelMatcher = OLD_LABELS.map(({ id, name }) => ({
  name,
  // "Submission center" differs from its new name only by case, and "licensing" is also an id, so
  // both are matched by case.
  caseSensitive: name.toLowerCase() === SLICE1_LABELS[id].toLowerCase() || name === 'Licensing',
}));

/* ═════════════════════════════════════════════════════════════════════════ */

describe('A.1 · the registry labels a client reads (breadcrumb, page title, ⌘K)', () => {
  it('section 9 decides the scope: every slice 1 row is checked here, and only those', () => {
    const rows = SLICE1_ROWS.map(rowKey);
    expect(rows.filter((key) => !SLICE1_LABELS[key] && !SLICE1_ELSEWHERE[key]), 'slice 1 rows this test does not check').toEqual([]);
    expect([...Object.keys(SLICE1_LABELS), ...Object.keys(SLICE1_ELSEWHERE)].filter((key) => !rows.includes(key)),
      'names this test enforces that section 9 does not give slice 1').toEqual([]);
    const drift = SLICE1_ROWS.filter((row) => SLICE1_LABELS[rowKey(row)] && !norm(row[3]).includes(norm(SLICE1_LABELS[rowKey(row)])))
      .map((row) => `${rowKey(row)}: section 9 says "${row[3]}", this test says "${SLICE1_LABELS[rowKey(row)]}"`);
    expect(drift).toEqual([]);
    expect(ADMINISTRATION_SESSION_IDS.size, 'section 9 names the administration session rows').toBeGreaterThan(0);
  });

  it('no surface a client can reach is named with a word from "Not in client copy"', () => {
    expect(offending(CLIENT_SURFACE_IDS.map((id) => [id, getSurfaceMeta(id).label] as const))).toEqual([]);
  });

  it('no surface a client can reach is named after a folded feature (section 5.8)', () => {
    expect(FOLDS.length, 'section 5.8 lists the folds').toBe(72);
    expect(namesFolded(CLIENT_SURFACE_IDS.filter((id) => !FOLDED.has(id)).map((id) => [id, getSurfaceMeta(id).label] as const))).toEqual([]);
  });

  it('each slice 1 row carries its section 9 name, exactly', () => {
    const wrong = Object.entries(SLICE1_LABELS)
      .filter(([id, label]) => getSurfaceMeta(id).label !== label)
      .map(([id, label]) => `${id}: "${getSurfaceMeta(id).label}" should be "${label}"`);
    expect(wrong).toEqual([]);
  });

  it('the names AnA and the @ menu give a reachable screen (NAVIGATION_TARGETS) use none of the words', () => {
    expect(offending(NAVIGATION_TARGETS.filter((t) => reachable(t.id)).map((t) => [`NAVIGATION_TARGETS ${t.id}`, t.label] as const))).toEqual([]);
  });

  it('the project-home breadcrumb names the open project, as the project chip does', async () => {
    publishShellProject({ id: '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', code: 'BX-301', title: 'Brexolimab IND' });
    render(<TopBar surface={getSurfaceMeta('project-home') as UiSurface} onPalette={() => {}} segment="biopharma" onSegment={() => {}} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(document.querySelector('.crumbs .here')?.textContent).toBe('BX-301');
  });

  it("section 9's own names pass this file's word and fold checks (so the guard can be met)", () => {
    const names = [
      ...Object.entries(SLICE1_LABELS).map(([id, label]) => [id, label] as const),
      ...DOOR_JOBS.map((job) => [`door (${job.where})`, job.name] as const),
    ];
    expect({ words: offending(names), folded: namesFolded(names) }).toEqual({ words: [], folded: [] });
  });
});

/* ── Doors ─────────────────────────────────────────────────────────────── */

/** "Open ("Open {market} in the Submission Center")" → the button's text and its accessible name. */
function todayLabels(cell: string): string[] {
  const quoted = [...cell.matchAll(/\("([^"]+)"\)/g)].map((m) => m[1]);
  const main = cell.replace(/\s*\("[^"]+"\)/g, '');
  return [...main.split('; '), ...quoted].map(norm).filter(Boolean);
}
const PATHWAY = /^(510\(k\)|PMA|MDR|IVDR): /;
/** "510(k): Choose …; PMA: See …" → one job name per pathway; otherwise the cell's names. */
function jobNames(cell: string): Array<{ name: string; pathway: string | null }> {
  return cell.split('; ').map((part) => {
    const m = PATHWAY.exec(part);
    return { name: norm(m ? part.slice(m[0].length) : part), pathway: m ? m[1] : null };
  });
}
const DOOR_TODAY = DOOR_ROWS.flatMap((row) => todayLabels(row[1]).map((label) => ({ where: row[0], label })));
const DOOR_JOBS = DOOR_ROWS.flatMap((row) => jobNames(row[2]).map((job) => ({ where: row[0], ...job })));
const DEVICE_JOBS = DOOR_JOBS.filter((job) => job.where === 'Device workstream');
const DEVICE_TODAY = DOOR_TODAY.filter((door) => door.where === 'Device workstream').map((door) => door.label);

/** The one constant per job: client/src/concept2cure/v2/projectDoors.ts, exporting STEP_DOORS and DEVICE_DOORS. */
const DOORS_FILE = path.join(V2, 'projectDoors.ts');
async function loadDoors(): Promise<{ STEP_DOORS?: unknown; DEVICE_DOORS?: unknown } | null> {
  if (!existsSync(DOORS_FILE)) return null;
  return import(/* @vite-ignore */ DOORS_FILE);
}
/** Every string a door constant holds: nested records are walked, a function is called with "{market}". */
function doorValues(value: unknown, where: string): Array<[string, string]> {
  if (typeof value === 'string') return [[where, value]];
  if (typeof value === 'function') return [[where, String((value as (m: string) => unknown)('{market}'))]];
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => doorValues(v, `${where}.${k}`));
  return [];
}

const STEP_FILES = readdirSync(path.join(V2, 'surfaces'))
  .filter((name) => /^Project[A-Za-z]*\.tsx$/.test(name))
  .map((name) => path.join(V2, 'surfaces', name));

describe('A.1 · doors: one job, one name (section 9, Door names)', () => {
  it('section 9 lists the doors', () => {
    expect(DOOR_JOBS.length).toBeGreaterThan(20);
    expect(DEVICE_JOBS.filter((job) => job.pathway).map((job) => job.pathway).sort())
      .toEqual(['510(k)', 'IVDR', 'IVDR', 'MDR', 'MDR', 'PMA', 'PMA']);
  });

  it('the door names live in one module, one constant per job, each with its section 9 name', async () => {
    const doors = await loadDoors();
    expect(doors, `${rel(DOORS_FILE)} does not exist: it holds STEP_DOORS and DEVICE_DOORS`).not.toBeNull();
    if (!doors) return;
    expect(typeof doors.STEP_DOORS, 'STEP_DOORS').toBe('object');
    expect(typeof doors.DEVICE_DOORS, 'DEVICE_DOORS').toBe('object');
    const values = [...doorValues(doors.STEP_DOORS, 'STEP_DOORS'), ...doorValues(doors.DEVICE_DOORS, 'DEVICE_DOORS')];
    const counts = new Map<string, string[]>();
    for (const [where, text] of values) counts.set(norm(text), [...(counts.get(norm(text)) ?? []), where]);
    expect(DOOR_JOBS.filter((job) => !counts.has(job.name)).map((job) => `${job.where}: "${job.name}" has no constant`)).toEqual([]);
    expect([...counts].filter(([, where]) => where.length > 1).map(([name, where]) => `"${name}" is held ${where.length} times: ${where.join(', ')}`)).toEqual([]);
    expect(offending(values)).toEqual([]);
    expect(namesFolded(values)).toEqual([]);
    const today = new Set(DOOR_TODAY.map((door) => door.label));
    expect(values.filter(([, text]) => today.has(norm(text))).map(([where, text]) => `${where}: "${text}" is today's name`)).toEqual([]);
  });

  it("no step door still carries today's name (Project*.tsx)", () => {
    const hits = [
      ...wholeLiterals(STEP_FILES, DOOR_TODAY.filter((door) => door.label !== 'Open').map((door) => ({ name: door.label, caseSensitive: true }))),
      // The market row's bare "Open" names only where it goes; it is looked for in the file that draws it.
      ...wholeLiterals(STEP_FILES.filter((file) => file.endsWith('ProjectMarkets.tsx')), [{ name: 'Open', caseSensitive: true }]),
    ];
    expect(hits).toEqual([]);
  });

  it('a job name is written once, in projectDoors.ts, and read from there by every door', () => {
    const files = CLIENT_FILES.filter((file) => file !== DOORS_FILE);
    expect(wholeLiterals(files, DOOR_JOBS.map((job) => ({ name: job.name, caseSensitive: true })))).toEqual([]);
  });

  const BASE = { id: '11111111-1111-4111-8111-111111111111', name: 'Client device', primary_agency: 'FDA', device_flags: [] as string[] };
  const DEVICE_PROJECTS: Array<{ pathway: string; project: MdxWorkflowProject }> = [
    { pathway: '510(k)', project: { ...BASE, product_type: 'samd', program_type: '510K', regulatory_path: '510k' } },
    { pathway: 'PMA', project: { ...BASE, product_type: 'device', program_type: 'PMA', regulatory_path: 'pma' } },
    { pathway: 'MDR', project: { ...BASE, product_type: 'device', program_type: 'MDR', regulatory_path: null } },
    { pathway: 'IVDR', project: { ...BASE, product_type: 'cdx', program_type: 'IVDR', regulatory_path: null } },
  ];
  function deviceDoors(project: MdxWorkflowProject, available: (id: string) => boolean): { doors: string[]; chrome: string[] } {
    const { container } = render(<ProjectMdxWorkflow project={project} otherFilings={[]} marketsState="ready"
      onNav={() => {}} onStage={() => {}} onAsk={() => {}} available={available} />);
    const doors = [...container.querySelectorAll('.pj-mdx-actions button')].map((b) => norm(b.textContent ?? ''))
      .filter((label) => label !== 'Prepare this work with AnA');
    // The names the step draws around the doors: its heading, each workstream's title, accessible
    // names. The work packages' regulatory text (purpose, deliverables, criteria) is not a label.
    const chrome = [
      ...[...container.querySelectorAll('h2, summary > span:first-child')].map((el) => el.textContent ?? ''),
      ...[...container.querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label') ?? ''),
    ];
    cleanup();
    return { doors, chrome };
  }

  it('each device workstream door is drawn with its job name, by pathway', () => {
    const jobs = new Set(DEVICE_JOBS.map((job) => job.name));
    const wrong: string[] = [];
    const seen = new Set<string>();
    for (const { pathway, project } of DEVICE_PROJECTS) {
      for (const open of [true, false]) {
        const { doors, chrome } = deviceDoors(project, () => open);
        const who = open ? pathway : `${pathway} (feature not available)`;
        doors.forEach((door) => seen.add(door));
        wrong.push(...doors.filter((door) => !jobs.has(door)).map((door) => `${who}: "${door}" is not a job name`));
        wrong.push(...offending(chrome.map((text) => [`${who} heading`, text] as const)));
        if (open) {
          const missing = DEVICE_JOBS.filter((job) => job.pathway === pathway && !doors.includes(job.name));
          wrong.push(...missing.map((job) => `${who}: "${job.name}" is not drawn (drawn: ${doors.join(' | ')})`));
        }
      }
    }
    const neverDrawn = DEVICE_JOBS.filter((job) => !job.pathway && !seen.has(job.name)).map((job) => `"${job.name}" is drawn for no pathway`);
    expect([...new Set(wrong), ...neverDrawn]).toEqual([]);
    expect([...seen].filter((door) => DEVICE_TODAY.includes(door))).toEqual([]);
  });
});

/* ── Coming later ─────────────────────────────────────────────────────────── */

describe("A.1 · each step's Coming later line (sections 3 and 5.4)", () => {
  const lines = PJ_LIFECYCLE.flatMap((step) => [
    [`${step.id}.later`, step.later] as const,
    [`${step.id}.laterDevice`, step.laterDevice] as const,
  ]);

  it('Plan, Evidence, Author, Review, Submit and Respond each have one', () => {
    expect(PJ_LIFECYCLE.map((step) => step.id)).toEqual(['plan', 'evidence', 'author', 'review', 'submit', 'respond']);
    expect(PJ_LIFECYCLE.filter((step) => !step.later?.trim()).map((step) => `${step.id} has no Coming later line`)).toEqual([]);
  });

  it('no line uses a word from "Not in client copy"', () => {
    expect(offending(lines)).toEqual([]);
  });

  it('no line names a folded feature as a thing still to come', () => {
    expect(namesFolded(lines)).toEqual([]);
  });

  it("Submit's lines name only Submit's rows not yet shown", () => {
    /* Each of these is live or homed elsewhere: IND annual reports are assembled and filed in IND
       forms (section 5.4 Submit, ind-checklist); the variation classifier and regulatory
       intelligence run as AnA (sections 5.4 lifecycle-mgmt, 5.6 global-ri); precedent is a Plan and
       Respond row (precedent-intelligence); market access and pharmacovigilance are document-build
       rows (section 5.5). */
    const NOT_SUBMIT: ReadonlyArray<[string, RegExp]> = [
      ['IND annual-report tracking', /annual[- ]report/i],
      ['the variation classifier', /variation classifier/i],
      ['precedent', /precedent/i],
      ['market access', /market access/i],
      ['pharmacovigilance', /pharmacovigilance/i],
    ];
    const submit = PJ_LIFECYCLE.find((step) => step.id === 'submit');
    const wrong = [['later', submit?.later], ['laterDevice', submit?.laterDevice]].flatMap(([field, text]) =>
      NOT_SUBMIT.filter(([, re]) => re.test(text ?? '')).map(([what]) => `submit.${field} names ${what}: "${text}"`));
    expect(wrong).toEqual([]);
  });

  it("Respond's line names precedent responses and FDA's Pre-Sub feedback", () => {
    const respond = PJ_LIFECYCLE.find((step) => step.id === 'respond')?.later ?? '';
    expect(respond).toMatch(/precedent/i);
    expect(respond).toMatch(/Pre-Sub/i);
  });
});

/* ── The IND catalogue ───────────────────────────────────────────────────── */

describe('A.1 · the IND catalogue Plan shows ("{n}. {phase name}")', () => {
  it('phase 1 is "Planning", in the catalogue, so Plan and AnA read one name', () => {
    const catalog = buildIndDocumentCatalogSource();
    const phase1 = catalog.phases.find((p) => p.id === 'phase1');
    expect(`${phase1?.order}. ${phase1?.name}`).toBe('1. Planning');
    expect(buildIndPyramid().phases.find((p) => p.id === 'phase1')?.name).toBe('Planning');
    expect([...new Set(catalog.deliverables.filter((d) => d.phaseId === 'phase1').map((d) => d.phaseName))]).toEqual(['Planning']);
  });

  it('no phase name uses a word from "Not in client copy"', () => {
    expect(offending(buildIndDocumentCatalogSource().phases.map((p) => [`${p.id}`, `${p.order}. ${p.name}`] as const))).toEqual([]);
  });
});

/* ── The address ─────────────────────────────────────────────────────────── */

describe('A.1 · /concept2cure/features (section 12)', () => {
  it('/concept2cure/features opens Subscription & features', () => {
    expect(surfaceIdFromLocation(`${UI_V2_BASE}/features`)).toBe('apps');
    expect(surfaceIdFromLocation(`${UI_V2_BASE}/features?program=7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d`)).toBe('apps');
    expect(getSurfaceMeta(surfaceIdFromLocation(`${UI_V2_BASE}/features`)).label).toBe('Subscription & features');
  });

  it('the shell writes /concept2cure/features for apps, and an old /concept2cure/apps link still arrives', () => {
    expect(locationForSurface('apps')).toBe(`${UI_V2_BASE}/features`);
    expect(surfaceIdFromLocation(locationForSurface('apps'))).toBe('apps');
    expect(surfaceIdFromLocation(`${UI_V2_BASE}/apps`)).toBe('apps');
    // V2App navigates by writing locationForSurface(id), so every door, menu item and AnA move writes it.
    expect(readFileSync(path.join(V2, 'V2App.tsx'), 'utf8')).toMatch(/setLocation\(locationForSurface\(/);
  });

  it('no address a client can reach has "app" in it', () => {
    expect([...LAUNCH_SURFACE_IDS].map((id) => locationForSurface(id)).filter((loc) => /(^|[/-])apps?($|[/?-])/.test(loc))).toEqual([]);
  });
});

/* ── The subscription's words ────────────────────────────────────────────── */

const NAV_URL = '/api/module-subscriptions/navigation';
async function accountMenu(platformAdmin: boolean) {
  apiRequest.mockImplementation(async (method: string, url: string) =>
    method === 'GET' && url === NAV_URL
      ? ok({ organizationId: 7, tier: 'enterprise', industryMode: 'biotech', masterAdmin: false, platformAdmin, resolved: true, surfaces: [] })
      : ok({ data: [] }));
  const onNav = vi.fn();
  render(
    <NavEntitlementsProvider>
      <Rail activeId="projects" onNav={onNav} collapsed={false} setCollapsed={() => {}} segment="biotech" setSegment={() => {}} />
    </NavEntitlementsProvider>,
  );
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', NAV_URL));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  fireEvent.click(screen.getByTitle('Ada Rowe'));
  return { onNav, items: screen.getAllByRole('menuitem').map((b) => norm(b.textContent ?? '')) };
}

describe('A.1 · the subscription is "subscription"; "Plan" is the step', () => {
  it('the account menu: Subscription & features, Subscription & billing (P-68), Platform licensing', async () => {
    const { items, onNav } = await accountMenu(true);
    const want = ['Subscription & features', 'Subscription & billing', 'Platform licensing'];
    expect({
      words: offending(items.map((item) => ['account menu', item] as const)),
      missing: want.filter((name) => !items.includes(name)),
      oldName: items.filter((item) => item === 'Licensing'),
    }).toEqual({ words: [], missing: [], oldName: [] });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Subscription & features' }));
    expect(onNav).toHaveBeenCalledWith('apps');
  });

  it("a member's menu offers Compare subscriptions", async () => {
    auth.roles = ['user'];
    auth.permissions = [];
    const { items } = await accountMenu(false);
    expect(offending(items.map((item) => ['account menu (member)', item] as const))).toEqual([]);
    expect(items).toContain('Compare subscriptions');
  });

  it('the lock copy (rail, ⌘K, Subscription & features, unlock panel) names the subscription and the job', () => {
    const verdict = (source: NavSurfaceEntitlement['source'], requiredTier: string | null = null): NavSurfaceEntitlement =>
      ({ id: 'device-510k', label: '510(k) and eSTAR', entitled: false, source, requiredTier });
    const verdicts = [verdict('launch-scope'), verdict('disabled'), verdict('industry'), verdict('tier', 'professional'), verdict('tier')];
    const copy = verdicts.flatMap((v) => [false, true].flatMap((isOrgAdmin) => {
      const notice = lockNotice(v, { isOrgAdmin });
      const who = `${v.source}${v.requiredTier ? ` (${v.requiredTier})` : ''}${isOrgAdmin ? ', administrator' : ', member'}`;
      return [
        [`${who} short reason`, lockShortReason(v)],
        [`${who} status`, notice.status],
        [`${who} body`, notice.body],
        [`${who} button`, notice.ctaLabel],
      ] as Array<[string, string | null]>;
    }));
    const disabled = lockNotice(verdict('disabled'), { isOrgAdmin: true });
    expect({
      words: offending(copy),
      tierButton: lockNotice(verdict('tier', 'professional'), { isOrgAdmin: true }).ctaLabel,
      disabledBodyNamesSubscriptionAndFeatures: disabled.body.includes('Subscription & features'),
      disabledButtonNamesSubscriptionAndFeatures: (disabled.ctaLabel ?? '').includes('Subscription & features'),
      // A door names its job, not only where it goes.
      disabledButtonNamesOnlyWhereItGoes: /^Open\b/.test(disabled.ctaLabel ?? ''),
    }).toEqual({
      words: [],
      tierButton: 'Compare subscriptions',
      disabledBodyNamesSubscriptionAndFeatures: true,
      disabledButtonNamesSubscriptionAndFeatures: true,
      disabledButtonNamesOnlyWhereItGoes: false,
    });
  });

  it('every door to Compare subscriptions has that name (no "View all plans", "View plans", "See plans", "Manage plan")', () => {
    const DOOR = /\b(?:View all plans|View plans|See plans|Manage plan|Compare plans|Upgrade (?:your )?plan)\b/i;
    expect(literalsMatching(CLIENT_FILES, DOOR, DOOR)).toEqual([]);
  });

  it("no heading or label outside the registry still carries a slice 1 row's old name", () => {
    const nav = NAVIGATION_TARGETS.filter((t) => reachable(t.id)).flatMap((t) =>
      oldLabelMatcher.filter((o) => (o.caseSensitive ? norm(t.label) === o.name : norm(t.label).toLowerCase() === o.name.toLowerCase()))
        .map(() => `NAVIGATION_TARGETS ${t.id}: "${t.label}"`));
    expect({ source: wholeLiterals(CLIENT_FILES, oldLabelMatcher), navigationTargets: nav })
      .toEqual({ source: [], navigationTargets: [] });
  });

  it("Setup's module panel no longer sends anyone to the Workflows", () => {
    const admin = path.join(V2, 'surfaces', 'AdminSurfaces.tsx');
    expect(literalsMatching([admin], /\bthe Workflows\b/, /the Workflows/)).toEqual([]);
  });
});
