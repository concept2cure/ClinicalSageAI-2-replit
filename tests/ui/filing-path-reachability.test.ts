/**
 * The filing path is walkable: each hop has an in-product control (F0).
 *
 * ── What this holds ───────────────────────────────────────────────────────────
 * `docs/design/FILING_SPINE.md` §7.2 F0. The project is the filing, and the
 * work moves through it in order: Evidence → Author → Review → Submit →
 * Respond. Six hops on that path had no control on 2026-10-08. Each one either
 * navigated to a surface without saying what to open there (the person lands
 * on a list and has to find the thing again), offered a toast, or had no
 * caller at all:
 *
 *   | Hop                                              | Fixed by |
 *   |--------------------------------------------------|----------|
 *   | Review tab → document                            | F7       |
 *   | Unstarted outline node → started section         | F4       |
 *   | Placed document / market row → its sequence      | F10      |
 *   | Dispatched sequence → Transmit                   | F12      |
 *   | Respond → response sequence                      | F15      |
 *   | Author document row → that document              | F3       |
 *
 * A hop is green only when the control names what it opens. Navigating to the
 * right surface without the document, sequence or section is the defect this
 * test exists to catch, so it does not count.
 *
 * ── The baseline only falls ───────────────────────────────────────────────────
 * `filing-path-reachability.baseline.json` lists the hops that are still red,
 * each with the slice that fixes it. Three rules, all enforced below:
 *   1. A hop not in the baseline must be green.
 *   2. A hop in the baseline must still be red. When a slice turns it green,
 *      this test fails until the slice removes the entry, so the baseline cannot
 *      keep an entry after its fix lands.
 *   3. The baseline may only name hops from the original six
 *      (`ORIGINAL_RED`). A hop added later has to be green when it is added.
 * Putting a hop back into the baseline after it has gone green is a regression
 * on the filing path. That is a founder decision, not a cleanup.
 *
 * ── How a hop is read ─────────────────────────────────────────────────────────
 * The checks read source, like the other guards in tests/ui, so they need no
 * jsdom and no running server. Each check starts from a fixed anchor (a stage
 * branch in ProjectHome, the outline map in DocumentWorkbench, the
 * Submission Center link in AuthoringPlaceIntoFiling) and follows the
 * components and functions that region renders or calls, through the same
 * file and relative imports, three levels deep. So a slice can move a control
 * into a new component without updating this test, as long as the anchor
 * still renders it.
 *
 * Each check is also run on two small fixtures: the dead end as it was on
 * 2026-10-08 (must be red) and the shape the slice is specified to build (must
 * be green). That is how the checks are shown to fail on the case they exist
 * to catch, and shown to be passable at all.
 *
 * The behaviour of each control (the right request, refusals shown verbatim, a
 * failed read never shown as empty) is held by that slice's own test. This
 * file holds only that the control exists and names its object.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { stripComments } from './_strip-comments';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const V2 = 'client/src/concept2cure/v2';
const PROJECT_HOME = `${V2}/surfaces/ProjectHome.tsx`;
const WORKBENCH = `${V2}/editor/DocumentWorkbench.tsx`;
const PLACE_INTO_FILING = `${V2}/surfaces/AuthoringPlaceIntoFiling.tsx`;
const SUBMISSION_CENTER = `${V2}/surfaces/SubmissionCenter.tsx`;
const BASELINE_PATH = path.join(REPO, 'tests/ui/filing-path-reachability.baseline.json');

/** The six hops F0 found red. The baseline may name no others. */
const ORIGINAL_RED = [
  'review-tab-to-document',
  'outline-node-to-started-section',
  'placed-document-to-sequence',
  'dispatched-sequence-to-transmit',
  'respond-to-response-sequence',
  'author-document-row-to-document',
] as const;

// ─── Source access ────────────────────────────────────────────────────────────

/** Comment-stripped source by repo-relative path, or null if the file is absent. */
interface Sources {
  read(rel: string): string | null;
  /** Repo-relative paths of the non-test client files, for "is there any caller". */
  clientFiles(): string[];
}

function diskSources(): Sources {
  const cache = new Map<string, string | null>();
  return {
    read(rel) {
      if (!cache.has(rel)) {
        const abs = path.join(REPO, rel);
        cache.set(rel, fs.existsSync(abs) ? stripComments(fs.readFileSync(abs, 'utf8')) : null);
      }
      return cache.get(rel)!;
    },
    clientFiles() {
      const out: string[] = [];
      const walk = (dir: string) => {
        for (const e of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
          const rel = `${dir}/${e.name}`;
          if (e.isDirectory()) {
            if (e.name === '__tests__' || e.name === 'node_modules') continue;
            walk(rel);
          } else if (/\.(tsx?|jsx?)$/.test(e.name) && !/\.(test|spec|stories)\./.test(e.name)) {
            out.push(rel);
          }
        }
      };
      walk('client/src');
      return out;
    },
  };
}

function memorySources(files: Record<string, string>): Sources {
  return {
    read: (rel) => (rel in files ? stripComments(files[rel]) : null),
    clientFiles: () => Object.keys(files).filter((f) => f.startsWith('client/src/')),
  };
}

// ─── Regions ──────────────────────────────────────────────────────────────────

const indentOf = (line: string) => line.length - line.trimStart().length;

/**
 * The statement or JSX child that starts on the line containing `at`: that line
 * plus every following line indented deeper, plus closing-bracket lines at the
 * same indent. Blank lines (and lines that were only comments) do not end it.
 * Depends on formatted source, which every file this test reads is.
 */
function regionAt(src: string, at: number): string {
  const lineStart = src.lastIndexOf('\n', at) + 1;
  const lines = src.slice(lineStart).split('\n');
  const base = indentOf(lines[0]);
  let end = 1;
  for (; end < lines.length; end++) {
    const l = lines[end];
    if (l.trim() === '') continue;
    if (indentOf(l) > base) continue;
    if (/^[)\]}]/.test(l.trimStart())) continue;
    break;
  }
  return lines.slice(0, end).join('\n');
}

/** The region of the first match of `anchor`, or null. */
function regionOf(src: string, anchor: RegExp): string | null {
  const m = anchor.exec(src);
  return m ? regionAt(src, m.index) : null;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A function or const named `name`, at any indent, in `src`. */
function definitionOf(src: string, name: string): string | null {
  const n = escapeRe(name);
  return regionOf(
    src,
    new RegExp(`^[ \\t]*(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?(?:function\\s+${n}\\b|(?:const|let)\\s+${n}\\s*[:=])`, 'm'),
  );
}

/** Local name → repo-relative module path, for relative imports only. */
function relativeImports(src: string, fromRel: string, sources: Sources): Map<string, string> {
  const out = new Map<string, string>();
  const re = /import\s+(?:type\s+)?([\s\S]*?)\s+from\s+['"](\.{1,2}\/[^'"]+)['"]/g;
  for (const m of src.matchAll(re)) {
    const base = path.posix.join(path.posix.dirname(fromRel), m[2]);
    const target = ['', '.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts']
      .map((ext) => base + ext)
      .find((p) => /\.(tsx?|jsx?)$/.test(p) && sources.read(p) !== null);
    if (!target) continue;
    const clause = m[1];
    const def = /^([A-Za-z_$][\w$]*)/.exec(clause);
    if (def) out.set(def[1], target);
    const named = /\{([\s\S]*?)\}/.exec(clause);
    if (named) {
      for (const part of named[1].split(',')) {
        const p = part.trim().replace(/^type\s+/, '');
        if (!p) continue;
        const [, local] = /(?:[\w$]+\s+as\s+)?([\w$]+)$/.exec(p) ?? [];
        if (local) out.set(local, target);
      }
    }
  }
  return out;
}

/**
 * `region` plus the definitions of every component it renders and every
 * function it calls, followed through the same file and relative imports,
 * `depth` levels deep.
 */
function closure(region: string, fileRel: string, sources: Sources, depth = 3): string {
  const seen = new Set<string>();
  const parts = [region];
  const visit = (text: string, rel: string, d: number) => {
    if (d === 0) return;
    const src = sources.read(rel);
    if (src === null) return;
    const imports = relativeImports(src, rel, sources);
    const names = new Set<string>();
    for (const m of text.matchAll(/<([A-Z][\w$]*)/g)) names.add(m[1]);
    for (const m of text.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) names.add(m[1]);
    for (const name of names) {
      let defRel = rel;
      let def = definitionOf(src, name);
      if (def === null && imports.has(name)) {
        defRel = imports.get(name)!;
        def = definitionOf(sources.read(defRel) ?? '', name);
      }
      if (def === null) continue;
      const key = `${defRel}#${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      parts.push(def);
      visit(def, defRel, d - 1);
    }
  };
  visit(region, fileRel, depth);
  return parts.join('\n');
}

// ─── What counts as naming the object ─────────────────────────────────────────

/** `setEditorTarget({ … docId … })` with a docId that is not null. */
function opensDocument(text: string): boolean {
  for (const m of text.matchAll(/setEditorTarget\(\s*\{([^}]*)\}/g)) {
    if (/\bdocId\b(?!\s*:\s*(?:null|undefined)\b)/.test(m[1])) return true;
  }
  return false;
}

/** `stashNavParamsForTarget('<surface>', { … key … })`. */
function stashesFor(text: string, surface: string, key: string): boolean {
  const re = new RegExp(`stashNavParamsForTarget\\(\\s*['"]${escapeRe(surface)}['"]\\s*,\\s*\\{([^}]*)\\}`, 'g');
  for (const m of text.matchAll(re)) if (new RegExp(`\\b${escapeRe(key)}\\b`).test(m[1])) return true;
  return false;
}

/** The destination reads its nav params and uses `key` from them. */
function consumesParam(src: string | null, surface: string, key: string): boolean {
  if (src === null) return false;
  const m = new RegExp(`consumeNavParams\\(\\s*['"]${escapeRe(surface)}['"]\\s*\\)`).exec(src);
  if (!m) return false;
  return new RegExp(`\\b${escapeRe(key)}\\b`).test(src.slice(m.index, m.index + 1500));
}

/**
 * Every `onNav('<surface>')` in `src` is inside a handler that stashes `key`
 * for that surface (directly or through a function the handler calls).
 * Vacuously false when there is no such navigation at all.
 */
function everyNavCarries(src: string, fileRel: string, sources: Sources, surface: string, key: string): { ok: boolean; bare: number } {
  const re = new RegExp(`onNav\\(\\s*['"]${escapeRe(surface)}['"]\\s*\\)`, 'g');
  let total = 0;
  let bare = 0;
  for (const m of src.matchAll(re)) {
    total++;
    // From the handler's own `onClick=` (so a stash in an earlier button's
    // handler is not credited to this one), at most 1500 characters back.
    const handlerStart = Math.max(src.lastIndexOf('onClick=', m.index), m.index - 1500, 0);
    const handler = src.slice(handlerStart, m.index);
    if (!stashesFor(closure(handler, fileRel, sources, 2), surface, key)) bare++;
  }
  return { ok: total > 0 && bare === 0, bare };
}

// ─── The hops ─────────────────────────────────────────────────────────────────

interface Verdict { ok: boolean; why: string }
interface Hop { id: (typeof ORIGINAL_RED)[number]; from: string; to: string; check(s: Sources): Verdict }

/** A ProjectHome stage branch: `{stage === '<id>' && …}` or `case '<id>':`. */
function stageRegion(src: string, stage: string): string | null {
  const s = escapeRe(stage);
  return regionOf(src, new RegExp(`stage\\s*===\\s*['"]${s}['"]`)) ?? regionOf(src, new RegExp(`case\\s+['"]${s}['"]\\s*:`));
}

const HOPS: Hop[] = [
  {
    id: 'review-tab-to-document',
    from: 'Project page, Review tab',
    to: 'the document under review, open in the editor',
    check(s) {
      const src = s.read(PROJECT_HOME);
      const region = src && stageRegion(src, 'review');
      if (!region) return { ok: false, why: `${PROJECT_HOME} renders no Review stage` };
      const all = closure(region, PROJECT_HOME, s);
      if (/['"]task-board['"]/.test(all)) return { ok: false, why: 'the Review tab sends the person to the task-board alias' };
      if (!opensDocument(all)) return { ok: false, why: 'nothing in the Review tab calls setEditorTarget with a docId' };
      return { ok: true, why: 'the Review tab opens a named document' };
    },
  },
  {
    id: 'outline-node-to-started-section',
    from: 'Editor outline, a required section not started in this document',
    to: 'that section, created and open',
    check(s) {
      const src = s.read(WORKBENCH);
      const region = src && regionOf(src, /\bfiling\.flat\.map\(/);
      if (!region) return { ok: false, why: `${WORKBENCH} renders no outline (filing.flat.map)` };
      if (/no draft yet in this document/.test(region)) return { ok: false, why: 'an unstarted node only toasts "no draft yet in this document"' };
      const all = closure(region, WORKBENCH, s);
      if (!/['"`]\/api\/authoring\/sections['"`]/.test(all)) {
        return { ok: false, why: 'the outline never posts to /api/authoring/sections to start the section' };
      }
      return { ok: true, why: 'an unstarted node creates its section' };
    },
  },
  {
    id: 'placed-document-to-sequence',
    from: 'Place into filing, "Open in Submission Center" (and the market row, once F9 builds it)',
    to: 'the Submission Center, on that sequence',
    check(s) {
      if (!consumesParam(s.read(SUBMISSION_CENTER), 'submission-center', 'sequenceId')) {
        return { ok: false, why: "the Submission Center does not read a sequenceId from consumeNavParams('submission-center')" };
      }
      for (const rel of [PLACE_INTO_FILING, `${V2}/surfaces/ProjectMarkets.tsx`]) {
        const src = s.read(rel);
        if (src === null) continue;
        if (!/onNav\(\s*['"]submission-center['"]\s*\)/.test(src)) continue;
        const r = everyNavCarries(src, rel, s, 'submission-center', 'sequenceId');
        if (!r.ok) return { ok: false, why: `${rel}: ${r.bare} link(s) to the Submission Center carry no sequenceId` };
      }
      if (s.read(PLACE_INTO_FILING) === null) return { ok: false, why: `${PLACE_INTO_FILING} is missing` };
      return { ok: true, why: 'the link names the sequence and the Submission Center opens on it' };
    },
  },
  {
    id: 'dispatched-sequence-to-transmit',
    from: 'Submission Center, a dispatched sequence',
    to: 'POST /api/submissions/sequences/:seqId/transmit',
    check(s) {
      const caller = s.clientFiles().find((f) => /\/api\/submissions\/sequences\/\$\{[^}]+\}\/transmit\b/.test(s.read(f) ?? ''));
      return caller
        ? { ok: true, why: `${caller} calls the sequence transmit route` }
        : { ok: false, why: 'no client file calls /api/submissions/sequences/:seqId/transmit' };
    },
  },
  {
    id: 'respond-to-response-sequence',
    from: 'Project page, Respond tab',
    to: 'the Submission Center, starting a response sequence',
    check(s) {
      const src = s.read(PROJECT_HOME);
      const region = src && stageRegion(src, 'respond');
      if (!region) return { ok: false, why: `${PROJECT_HOME} renders no Respond stage` };
      if (!stashesFor(closure(region, PROJECT_HOME, s), 'submission-center', 'followUp')) {
        return { ok: false, why: 'the Respond tab has no control that opens the Submission Center with a followUp' };
      }
      if (!consumesParam(s.read(SUBMISSION_CENTER), 'submission-center', 'followUp')) {
        return { ok: false, why: "the Submission Center does not read followUp from consumeNavParams('submission-center')" };
      }
      return { ok: true, why: 'Respond starts a response sequence on the submission' };
    },
  },
  {
    id: 'author-document-row-to-document',
    from: 'Project page, Author tab, a document row',
    to: 'that document, open in the editor',
    check(s) {
      const src = s.read(PROJECT_HOME);
      const region = src && stageRegion(src, 'author');
      if (!region) return { ok: false, why: `${PROJECT_HOME} renders no Author stage` };
      const all = closure(region, PROJECT_HOME, s);
      const bareRow = /\.map\(\s*\(?[^)]*\)?\s*=>[\s\S]{0,800}?onClick=\{\s*\(\)\s*=>\s*onNav\(\s*['"]document-authoring['"]\s*\)\s*\}/.exec(all);
      if (bareRow) return { ok: false, why: 'a row in the Author tab opens the editor without naming its document' };
      if (!opensDocument(all)) return { ok: false, why: 'nothing in the Author tab calls setEditorTarget with a docId' };
      return { ok: true, why: 'each Author row opens its own document' };
    },
  },
];

// ─── Fixtures: the dead end as found, and the shape each slice builds ─────────

const SUBMISSION_CENTER_READS = `
import { consumeNavParams } from '../navParams';
export function SubmissionCenter() {
  const [target] = useState(() => {
    const p = consumeNavParams('submission-center');
    return p ? { submissionId: p.submissionId, sequenceId: p.sequenceId, ws: p.ws, followUp: p.followUp } : null;
  });
  return <div />;
}
`;

const FIXTURES: Record<Hop['id'], { red: Record<string, string>; green: Record<string, string> }> = {
  'review-tab-to-document': {
    red: {
      [PROJECT_HOME]: `
export function ProjectHome({ onNav }) {
  return (
    <div>
      {stage === 'review' && (
        <section className="pj-sec">
          <EmptyState title="Review tasks aren't wired to this workspace yet" />
          <button className="btn ghost" onClick={() => onNav('task-board')}>Open task board</button>
        </section>
      )}
      {stage === 'plan' && <Plan />}
    </div>
  );
}
`,
    },
    green: {
      [PROJECT_HOME]: `
import { ProjectReviews } from './ProjectReviews';
export function ProjectHome({ onNav }) {
  return (
    <div>
      {stage === 'review' && pid && <ProjectReviews pid={pid} onNav={onNav} />}
      {stage === 'plan' && <Plan />}
    </div>
  );
}
`,
      [`${V2}/surfaces/ProjectReviews.tsx`]: `
import { openReviewDocument } from './Review';
export function ProjectReviews({ pid, onNav }) {
  return rows.map((r) => <button key={r.id} onClick={() => openReviewDocument(r, onNav)}>Open document</button>);
}
`,
      [`${V2}/surfaces/Review.tsx`]: `
import { setEditorTarget } from '../editorTarget';
export function openReviewDocument(item, onNav) {
  setEditorTarget({ docType: null, docId: item.id, programId: item.programId });
  onNav('document-authoring');
}
`,
    },
  },
  'outline-node-to-started-section': {
    red: {
      [WORKBENCH]: `
export function DocumentWorkbench() {
  return (
    <div>
          {filing.flat.map(node => {
            return (
              <button onClick={() => {
                if (bound) {
                  requestLeave({ kind: 'section', id: bound.id });
                } else {
                  fireToast(\`\${node.key} \${node.label} — no draft yet in this document.\`, 'error');
                }
              }} />
            );
          })}
    </div>
  );
}
`,
    },
    green: {
      [WORKBENCH]: `
export function DocumentWorkbench() {
  const startSection = useCallback(async (node) => {
    const res = await apiRequest('POST', '/api/authoring/sections', { documentId: docId, code: node.key });
    return res;
  }, [docId]);
  return (
    <div>
          {filing.flat.map(node => {
            return (
              <button onClick={() => {
                if (bound) {
                  requestLeave({ kind: 'section', id: bound.id });
                } else {
                  void startSection(node);
                }
              }} />
            );
          })}
    </div>
  );
}
`,
    },
  },
  'placed-document-to-sequence': {
    red: {
      [SUBMISSION_CENTER]: `export function SubmissionCenter() { return <div />; }`,
      [PLACE_INTO_FILING]: `
export function AuthoringPlaceIntoFiling({ onNav }) {
  return (
    <button
      onClick={() => {
        setOpen(false);
        onNav('submission-center');
      }}
    >Open in Submission Center</button>
  );
}
`,
    },
    green: {
      [SUBMISSION_CENTER]: SUBMISSION_CENTER_READS,
      [PLACE_INTO_FILING]: `
import { stashNavParamsForTarget } from '../navParams';
export function AuthoringPlaceIntoFiling({ onNav }) {
  return (
    <button
      onClick={() => {
        setOpen(false);
        stashNavParamsForTarget('submission-center', { submissionId: String(placement.submissionId), sequenceId: String(placement.sequenceId), ws: 'builder' });
        onNav('submission-center');
      }}
    >Open in Submission Center</button>
  );
}
`,
    },
  },
  'dispatched-sequence-to-transmit': {
    red: {
      [`${V2}/surfaces/GatewayTransmittals.tsx`]: `
const r = await readData('POST', \`/api/mdx/gateways/\${region}/\${gateway}/transmit\`, body);
`,
    },
    green: {
      [SUBMISSION_CENTER]: `
const res = await apiRequest('POST', \`/api/submissions/sequences/\${seq.id}/transmit\`, { signatureActionId, environment, applicationId });
`,
    },
  },
  'respond-to-response-sequence': {
    red: {
      [SUBMISSION_CENTER]: `export function SubmissionCenter() { return <div />; }`,
      [PROJECT_HOME]: `
export function ProjectHome({ onNav }) {
  return (
    <div>
      {stage === 'respond' && <StagePanel stage="respond" onNav={onNav} available={available} />}
    </div>
  );
}
function StagePanel({ stage, onNav }) {
  return tools.map(t => <button key={t.id} onClick={() => onNav(t.id)}>{t.label}</button>);
}
`,
    },
    green: {
      [SUBMISSION_CENTER]: SUBMISSION_CENTER_READS,
      [PROJECT_HOME]: `
import { stashNavParamsForTarget } from '../navParams';
export function ProjectHome({ onNav }) {
  return (
    <div>
      {stage === 'respond' && pid && <ProjectRespond pid={pid} onNav={onNav} />}
    </div>
  );
}
function ProjectRespond({ pid, onNav }) {
  const startResponse = (sub) => {
    stashNavParamsForTarget('submission-center', { submissionId: String(sub.id), ws: 'sequences', followUp: 'response' });
    onNav('submission-center');
  };
  return <button onClick={() => startResponse(sub)}>Start a response sequence</button>;
}
`,
    },
  },
  'author-document-row-to-document': {
    red: {
      [PROJECT_HOME]: `
export function ProjectHome({ onNav }) {
  return (
    <div>
      {stage === 'author' && (<>
        <AuthorWorkspace onNav={onNav} />
      </>)}
    </div>
  );
}
function AuthorWorkspace({ onNav }) {
  return (
    <div className="pj-files">
      {(d.drafts ?? []).map((f) => {
        return (
          <button key={f.id} className="pj-file" onClick={() => onNav('document-authoring')}>{f.label}</button>
        );
      })}
    </div>
  );
}
`,
    },
    green: {
      [PROJECT_HOME]: `
import { ProjectDocuments } from './ProjectDocuments';
export function ProjectHome({ onNav }) {
  return (
    <div>
      {stage === 'author' && (<>
        <ProjectDocuments pid={pid} onNav={onNav} />
      </>)}
    </div>
  );
}
`,
      [`${V2}/surfaces/ProjectDocuments.tsx`]: `
import { setEditorTarget } from '../editorTarget';
export function ProjectDocuments({ pid, onNav }) {
  const open = (doc) => {
    setEditorTarget({ docType: null, docId: doc.id, programId: pid });
    onNav('document-authoring');
  };
  return <CanvasDocumentList onOpen={open} />;
}
`,
    },
  },
};

// ─── Baseline ─────────────────────────────────────────────────────────────────

interface BaselineEntry { id: string; slice: string; reason: string }
const baseline: { hops: BaselineEntry[] } = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
const baselined = new Map(baseline.hops.map((h) => [h.id, h]));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('filing path reachability (FILING_SPINE.md F0)', () => {
  const disk = diskSources();

  describe('baseline file', () => {
    it('names only hops from the original six, each once, each with its slice and a reason', () => {
      const ids = baseline.hops.map((h) => h.id);
      expect(new Set(ids).size, 'a hop is listed twice').toBe(ids.length);
      for (const h of baseline.hops) {
        expect(ORIGINAL_RED as readonly string[], `"${h.id}" was not red when F0 landed; a new hop must be green when it is added`).toContain(h.id);
        expect(h.slice, `"${h.id}" names no slice`).toMatch(/^F\d+$/);
        expect(h.reason?.trim().length ?? 0, `"${h.id}" gives no reason`).toBeGreaterThan(20);
      }
    });

    it('every hop in the test has a fixture pair', () => {
      expect(HOPS.map((h) => h.id).sort()).toEqual([...ORIGINAL_RED].sort());
      expect(Object.keys(FIXTURES).sort()).toEqual([...ORIGINAL_RED].sort());
    });
  });

  describe('each check fails on the dead end and passes on the slice', () => {
    for (const hop of HOPS) {
      it(`${hop.id}: red on the 2026-10-08 dead end`, () => {
        const v = hop.check(memorySources(FIXTURES[hop.id].red));
        expect(v.ok, v.why).toBe(false);
      });
      it(`${hop.id}: green on the shape its slice builds`, () => {
        const v = hop.check(memorySources(FIXTURES[hop.id].green));
        expect(v.ok, v.why).toBe(true);
      });
    }
  });

  describe('the hops on the code', () => {
    for (const hop of HOPS) {
      it(`${hop.id}: ${hop.from} → ${hop.to}`, () => {
        const v = hop.check(disk);
        const entry = baselined.get(hop.id);
        if (entry) {
          expect(
            v.ok,
            `${hop.id} is reachable now (${v.why}). Remove it from tests/ui/filing-path-reachability.baseline.json in the same change (${entry.slice}).`,
          ).toBe(false);
        } else {
          expect(v.ok, `${hop.id} is not reachable: ${v.why}. It is not in the baseline, so the filing path has regressed.`).toBe(true);
        }
      });
    }
  });
});
