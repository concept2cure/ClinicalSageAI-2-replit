/**
 * The CMC work area: does it SAY what to do, and does it REACH what we built?
 *
 * ## Why this file exists
 *
 * The client-journey reorganisation (docs/design/CLIENT_JOURNEY_2026-10-25.md)
 * gave every project step a one-sentence "what to do now" and left this work
 * area untouched. Opened as a client, CMC was nine nouns in a tab strip; the
 * only sentence beside each was its screen's own `CmHead meta`, which says
 * what the screen HOLDS. That is the founder's recorded complaint about the
 * catalog — "I have no idea what we're doing with apps, what the apps do, how
 * to use them, when to use them" — inside one work area.
 *
 * At the same time three deterministic engines we had built were not on any
 * screen. Measured, not assumed: a reachability sweep over all 99 CMC server
 * routes against every file in `client/src` found exactly three with no caller
 * (docs/evidence/D2-CLIENT-JOURNEY/2026-10-25/pass7/):
 *
 *     POST /api/cmc/stability-studies/:id/trending      out-of-trend + drift
 *     GET  /api/cmc/projects/:id/process-capability      Pp/Ppk/Cp/Cpk
 *     GET  /api/cmc/specifications/:id/history           the revision log
 *
 * The first was the sharpest: the Stability tab's own AnA starter has said
 * "Show every study trending toward a limit" the whole time. The question was
 * offered, the deterministic answer existed, and the only door to it was chat.
 *
 * ## What these cases hold
 *
 * The guidance is guidance (never a measurement), each destination has it, and
 * each of the three engines has a door on the screen it belongs to. The
 * reachability sweep itself is the regression guard: a route built and never
 * called is the defect class, and it cannot be seen in a diff.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PJ_LIFECYCLE } from '../fixtures/project-home-data';

const V2 = join(__dirname, '..');
const CLIENT_SRC = join(__dirname, '..', '..', '..');
const REPO = join(__dirname, '..', '..', '..', '..', '..');
const read = (...p: string[]) => readFileSync(join(...p), 'utf8');
const CMC_MODULE = read(V2, 'surfaces', 'CmcModule.tsx');
/**
 * The same file with its comments removed.
 *
 * A name written in prose is not code. The first run of the retired-band case
 * below failed on the comment that RECORDS CmConnectBar's deletion and says
 * where each of its six destinations went — the rule reading its own
 * documentation as a violation. This file already strips comments for the route
 * sweep, for the same reason and after the same mistake; the assertions about
 * what the module no longer renders read this instead.
 */
const CMC_CODE = CMC_MODULE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * The destinations, as the module declares them.
 *
 * The matcher is per-FIELD rather than one expression over the whole entry: the
 * first version was a single regex that required `id`, `label`, `icon`, `blurb`
 * and `now` in that order on consecutive lines, so adding `half` to the first
 * line (D5 §A.4.1) made it match nothing at all — and a parser that returns
 * zero destinations makes every case over it vacuously pass. Splitting the
 * entry first and reading each field out of it cannot fail that way, and the
 * count is asserted below.
 */
interface CmcDestination { id: string; label: string; blurb: string; now: string; half: string }
function destinations(): CmcDestination[] {
  const block = /const CMC_NAV: CmcNavItem\[\] = \[([\s\S]*?)\n\];/.exec(CMC_MODULE);
  if (!block) return [];
  const out: CmcDestination[] = [];
  /* Each entry runs from its `id:` to the next one (or the array's end). A
     comment above an `id:` therefore belongs to the entry before it, which is
     harmless: no field is read out of a comment. */
  const starts = [...block[1].matchAll(/\n\s*id: '/g)].map((m) => m.index!);
  for (let i = 0; i < starts.length; i += 1) {
    const entry = block[1].slice(starts[i], i + 1 < starts.length ? starts[i + 1] : undefined);
    const field = (name: string): string => {
      const m = new RegExp(`\\b${name}: '((?:[^'\\\\]|\\\\.)*)'`).exec(entry);
      return m ? m[1] : '';
    };
    out.push({
      id: field('id'), label: field('label'), blurb: field('blurb'),
      now: field('now'), half: field('half'),
    });
  }
  return out;
}

describe('every CMC destination says what it is and what to do on it', () => {
  it('declares all nine, with both sentences', () => {
    const d = destinations();
    /* The order the work is done, which is also each tab's "Next step"
       (P-122, 2026-11-10; the row D5-1 split, restored). The IDS are unchanged,
       because `cmc.open-tab`, `__cmSetTab` and the cases below address a
       destination by id. */
    expect(d.map((x) => x.id)).toEqual([
      'overview', 'materials', 'specs', 'stability', 'batch', 'change', 'quality', 'build', 'pathway',
    ]);
    for (const x of d) {
      expect(x.blurb.length, `${x.id} blurb`).toBeGreaterThan(10);
      /* Long enough to be an instruction rather than a label. The project
         steps' own sentences are all well past this. */
      expect(x.now.length, `${x.id} now`).toBeGreaterThan(60);
    }
  });

  it('splits the nine into the two halves the founder named', () => {
    /* Was: "keeps the shape the project steps carry, so one band renders
       both" — the nine destinations were rendered by the project's `StageBand`
       as a "What to do now / NEXT STEP" box above the title. That box is a
       retired pattern (ONE_DESIGN_PLAN §2; D5 §A.4.3). Since P-122 its `now` is
       printed again as a quiet line under the one tab row, and published to
       AnA as `facts.whatToDoHere`. The halves are the row's two groups. */
    const d = destinations();
    const byHalf = (h: string) => d.filter((x) => x.half === h).map((x) => x.id);
    expect(byHalf('module3')).toEqual(['overview', 'quality', 'build', 'pathway']);
    expect(byHalf('records')).toEqual(['materials', 'specs', 'stability', 'batch', 'change']);
    /* Every destination is in exactly one half — a typo'd value would leave a
       tab reachable by id and on no tab row. */
    expect(d.filter((x) => x.half !== 'module3' && x.half !== 'records')).toEqual([]);
  });

  it('keeps no band above the title', () => {
    /* The three bands that filled CMC's first screen. Each is asserted by the
       thing that rendered it, not by its words, so a re-spelling cannot slip
       one back in. */
    expect(CMC_CODE).not.toContain("from './ProjectStages'");
    expect(CMC_CODE).not.toMatch(/<StageBand\b/);
    expect(CMC_CODE).not.toMatch(/\bCmConnectBar\b/);
    expect(CMC_CODE).not.toMatch(/className="cm-sub"/);
    /* And what the page opens with instead: one h1, then the ask row, then the
       one tab row and its "what to do now" line — the tabs are BELOW the
       header, never above it (P-122). */
    const page = /<div className="page-inner" data-work-area="cmc">([\s\S]*?)<Surf /.exec(CMC_CODE);
    expect(page, 'the work-area root is not where this case can read it').not.toBeNull();
    const order = ['<ProjectBack', '<h1 className="ph-title">', '<CmStarters', '<CmTabs', '<CmNow'];
    let at = -1;
    for (const piece of order) {
      const next = page![1].indexOf(piece);
      expect(next, `${piece} is missing or out of order`).toBeGreaterThan(at);
      at = next;
    }
    /* `CmcModule` still publishes the retired band's sentence to AnA, so the
       guidance moved rather than went. */
    expect(CMC_CODE).toMatch(/whatToDoHere: CMC_NAV\.find\(\(n\) => n\.id === tab\)\?\.now/);
  });

  it('would notice a band put back, or a parser that reads nothing', () => {
    /* Verified by making the checks fail, over the real helpers. */
    expect(destinations().length, 'the field parser matched nothing').toBe(9);
    /* The comment strip is doing its job: the module DOES name CmConnectBar,
       in the comment that records its removal, and the code does not. */
    expect(CMC_MODULE).toMatch(/\bCmConnectBar\b/);
    expect(CMC_CODE).not.toMatch(/\bCmConnectBar\b/);
    /* The retired-band assertions, applied to the markup D5 replaced. */
    const before = '<div className="cm-sub">…</div>\n<StageBand stage={tab} lifecycle={CMC_NAV} onStage={setTab} sequenced />\n<CmConnectBar nav={onNav} />';
    expect(before).toMatch(/<StageBand\b/);
    expect(before).toMatch(/\bCmConnectBar\b/);
    expect(before).toMatch(/className="cm-sub"/);
    /* And the project steps' own band is untouched: it still carries the
       fields it always did, for the screens that are a lifecycle. */
    for (const f of ['id', 'label', 'icon', 'blurb', 'now'] as const) {
      expect(Object.keys(PJ_LIFECYCLE[0])).toContain(f);
    }
  });

  it('gives guidance about the destination and never a claim about the program', () => {
    /* The rule the project steps keep, for the same reason: a sentence that
       reads as a measurement is one nobody measured. No destination's sentence
       may assert a count, a percentage or a state of THIS program. */
    /* A count followed by a unit. "Module 3" and "§3.2" are NAMES — the first
       draft of this rule flagged "Module 3 sections" as a measurement, which
       is how a correct sentence gets rewritten to satisfy a wrong check. */
    const measured = /(?<!Module )(?<!§)(?<!\d\.)\b\d+\s*(%|of\b|sections?\b|batch(es)?\b|stud(y|ies)\b|specifications?\b|contradictions?\b)/i;
    for (const x of destinations()) {
      expect(measured.test(x.now), `${x.id}: "${x.now}" reads as a measurement`).toBe(false);
      expect(/\b(is|are) (now|currently)\b/i.test(x.now), `${x.id} asserts current state`).toBe(false);
    }
  });

  it('tells a client where to start', () => {
    const overview = destinations().find((d) => d.id === 'overview');
    expect(overview?.now).toMatch(/start here/i);
  });
});

describe('the three engines that had no screen now have one', () => {
  it('assesses a stability study for drift from the Stability register', () => {
    /* The tab's own AnA starter offered this question before any screen could
       answer it deterministically. */
    expect(CMC_MODULE).toContain("'/api/cmc/stability-studies/' + study.id + '/trending'");
    /* The chain from the register row to the action: the row's governed
       actions are a component (StabilityRowActions, extracted when this button
       took the row's render past the complexity cap), so the wiring is what is
       asserted, not the call site's spelling. */
    expect(CMC_MODULE).toMatch(/trend: assessTrending/);
    expect(CMC_MODULE).toMatch(/void on\.trend\(study\)/);
    expect(CMC_MODULE).toMatch(/<StabilityRowActions/);
    expect(CMC_MODULE).toMatch(/CMC_SUGGEST[\s\S]*?trending toward a limit/);
  });

  it('shows process capability where the batches are', () => {
    expect(CMC_MODULE).toContain("'/api/cmc/projects/' + encodeURIComponent(projectId) + '/process-capability'");
    expect(CMC_MODULE).toMatch(/<CmProcessCapability projectId=\{projectId\}/);
  });

  it('reads a specification’s recorded changes through the one history panel', () => {
    const panel = read(V2, 'surfaces', 'cmcRecordHistory.tsx');
    expect(panel).toContain('/api/cmc/specifications/');
    expect(panel).toContain('/history');
    expect(CMC_MODULE).toMatch(/registerPath="specifications"/);
    /* One panel, not a second one for this register. */
    expect(CMC_MODULE.match(/<RecordHistoryPanel/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('says which store a history came from, because the two attest differently', () => {
    const panel = read(V2, 'surfaces', 'cmcRecordHistory.tsx');
    expect(panel).toContain('specification_revision_log');
    expect(panel).toMatch(/UNCHAINED\[store\]/);
  });
});

/** Every CMC surface file, so the rule is not asserted over one of them. */
function cmcSurfaceFiles(): Array<[name: string, src: string]> {
  const dir = join(V2, 'surfaces');
  return readdirSync(dir)
    .filter((f) => /^[Cc]mc.*\.tsx?$/.test(f))
    .map((f) => [f, readFileSync(join(dir, f), 'utf8')] as [string, string]);
}

/**
 * An `<EmptyState …/>` element, whole, from its tag to its matching close.
 *
 * Counted by angle brackets rather than matched with a bounded window: the
 * first version of this case used `[\s\S]{0,700}?\/>`, which silently skips an
 * element longer than the window — so a doorless empty state could sit in the
 * file and never be examined. The rule a gate enforces has to be enforced over
 * everything the gate claims to cover.
 */
function emptyStateElements(src: string): string[] {
  const out: string[] = [];
  const re = /<EmptyState\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 0;
    let i = m.index;
    for (; i < src.length; i += 1) {
      if (src[i] === '<') depth += 1;
      else if (src[i] === '>') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push(src.slice(m.index, i + 1));
  }
  return out;
}

describe('a client told to open a project is given a way to open one', () => {
  it('offers the door on every CMC empty state that asks for a project', () => {
    /* Four of six did. Specifications and Batch records said "Open a program"
       and gave no button, which is an instruction with no door. Asserted over
       every CMC surface file, because the rule is about the work area and not
       about one file in it. */
    const doorless: string[] = [];
    let asked = 0;
    for (const [name, src] of cmcSurfaceFiles()) {
      for (const el of emptyStateElements(src)) {
        if (!/title=\{?"Open a pro(?:ject|gram)\b/.test(el)) continue;
        asked += 1;
        if (!el.includes('openProgramAction(nav)')) doorless.push(`${name}: ${el.slice(0, 120).replace(/\s+/g, ' ')}`);
      }
    }
    /* The sweep must be finding them at all. */
    expect(asked, 'no "Open a project" empty state was examined — the matcher is broken').toBeGreaterThanOrEqual(5);
    expect(doorless, 'an "Open a project" empty state with no way to open one').toEqual([]);
  });

  it('would notice a doorless one', () => {
    /* Verified by making the check fail, over the real matcher. */
    const withDoor = '<EmptyState icon={I.x} title="Open a project to see it" action={openProgramAction(nav)} />';
    const without = '<EmptyState icon={I.x} title="Open a project to see it" hint="..." />';
    expect(emptyStateElements(withDoor)[0]).toContain('openProgramAction(nav)');
    expect(emptyStateElements(without)[0]).not.toContain('openProgramAction(nav)');
    /* And an element far longer than any fixed window is still returned whole. */
    const long = `<EmptyState icon={I.x} title="Open a project to see it" hint="${'x'.repeat(1200)}" action={openProgramAction(nav)} />`;
    expect(emptyStateElements(long)[0]).toContain('openProgramAction(nav)');
  });
});

/* ══════════ The regression guard: a route we built that nothing calls ══════════ */

const CMC_MOUNTS: Array<[file: string, prefix: string]> = [
  ['server/api/cmc/routes.ts', '/api/cmc'],
  ['server/api/cmc/specificationRoutes.ts', '/api/cmc/specifications'],
  ['server/api/cmc/batchRecordRoutes.ts', '/api/cmc/batch-records'],
  ['server/api/cmc/module3OperatingSystemRoutes.ts', '/api/cmc/module3-os'],
  ['server/api/cmc/module3BuildStateRoutes.ts', '/api/cmc/module3-os'],
  ['server/api/cmc/module3ConvergenceRoutes.ts', '/api/cmc/module3-os'],
  ['server/api/cmc/sourceEvidenceRoutes.ts', '/api/cmc/module3-os'],
  ['server/routes/cmc-module3-board.routes.ts', '/api/cmc/module3-board'],
  ['server/routes/cmc-agency-questions.routes.ts', '/api/cmc/agency-questions'],
  /* The proposed-change store (cmc_change_controls), outside /api/cmc. Swept
     since P-122 (2026-11-10): its POST had no caller, and nothing looked. */
  ['server/routes/cmc-changes.routes.ts', '/api/cmc-changes'],
];

/**
 * Routes whose capability a client reaches by another path, with the reason.
 * An entry here is a claim that nothing is hidden from a user, not a mute
 * button: each one names the door that serves the same purpose.
 */
const REACHED_ELSEWHERE: Record<string, string> = {
  'POST /api/cmc/module3-os/sections/:projectId/:sectionKey/refresh':
    'Re-composing one section is POST /build-section/:projectId/:sectionKey, which the Module 3 build board ' +
    'calls and which also bridges the result to its governed artifact. AnA refreshes stale sections through ' +
    'the service directly (module3_refresh_stale). This HTTP path is a second door onto the same compose.',
};

/**
 * Routes that are MEANT to have no caller: retired, and refusing.
 *
 * A route kept mounted so an old client gets a stated refusal rather than a
 * 404 is correctly uncalled, and listing it as a gap would push someone to
 * "reach" a capability the product has deliberately withdrawn. Each entry
 * names the refusal, and the case below reads the route's own handler to check
 * the claim — so this list cannot become a place to park a live route.
 */
const RETIRED_AND_REFUSED: Record<string, { refusal: string; why: string }> = {
  /* Listed 2026-11-10 (P-122), when the sweep learned the verb: until then the
     GET of the same path stood in as this POST's caller. */
  'POST /api/cmc/agency-questions': {
    refusal: '410',
    why:
      'Recording a question in the earlier CMC file is withdrawn with the PATCH below (P-38/P-39, 2026-10-19): ' +
      'a question is recorded on the letter it came in, in Communication. The route answers 410 and issues no query.',
  },
  'PATCH /api/cmc/agency-questions/:id': {
    refusal: '410',
    why:
      'The earlier CMC question file (reg_questions) is read-only since 2026-10-19 (P-38/P-39): a question has ' +
      'one home, the letter it came in, where a response is approved under a Part 11 signature. POST and PATCH ' +
      'answer 410 and issue no query, and the database refuses the write for every role.',
  },
};

/**
 * Routes with a REAL caller this instrument cannot see, each named by file.
 *
 * The detector matches a route's literal segments inside one source string. It
 * therefore cannot see a path whose base is held in a variable — the honest
 * limitation, stated rather than papered over, and the reason every finding is
 * confirmed by hand before it is called a gap. Each entry below was confirmed
 * that way; an entry is a verified caller, never a way to quiet the sweep.
 */
const CALLER_NOT_VISIBLE_TO_THIS_SWEEP: Record<string, string> = {
  /* These three were found when the sweep learned the verb (P-122,
     2026-11-10): each path is written as a literal, but the verb is in a
     helper, so only the path was visible — and a GET of the same path had been
     standing in as their caller. Each was confirmed by hand. */
  'POST /api/cmc/ich-compliance':
    "surfaces/CmcQuality.tsx `runIch` — post('ich', '/api/cmc/ich-compliance', …), where the local `post` helper calls apiRequest('POST', path, body).",
  'POST /api/cmc/control-strategy':
    "surfaces/CmcQuality.tsx `runStrategy` — post('strategy', '/api/cmc/control-strategy', …), the same `post` helper.",
  'POST /api/cmc/module3-os/source-evidence/:projectId':
    "surfaces/CmcSectionEvidence.tsx, the link form's `submit` — write('', …), which posts to `base`, the project's source-evidence path held in a variable.",
  'POST /api/cmc/module3-os/sections/:projectId/:sectionKey/approve':
    "surfaces/CmcModule.tsx `doSign` — built across five lines as '/api/cmc/module3-os/sections/' + id + '/' + key + '/approve'.",
  'POST /api/cmc/module3-os/register-links/:projectId/:register/:recordId/retry':
    'surfaces/CmcRegisterLinks.tsx `retry` — `${path}/${register}/${recordId}/retry`, where `path` holds the base.',
  'GET /api/cmc/module3-os/source-evidence/:projectId/documents':
    'surfaces/CmcSectionEvidence.tsx — `${base}/documents`, where `base` holds the project-scoped base.',
  'POST /api/cmc/module3-os/source-evidence/:projectId/:linkId/unlink':
    'surfaces/CmcSectionEvidence.tsx `removeLink` — `write(`/${link.id}/unlink`)`, which posts to `base + path`.',
};

function cmcRoutes(): Array<{ verb: string; path: string; file: string }> {
  const out: Array<{ verb: string; path: string; file: string }> = [];
  for (const [file, prefix] of CMC_MOUNTS) {
    const src = readFileSync(join(REPO, file), 'utf8');
    for (const m of src.matchAll(/router\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]*)['"`]/g)) {
      const p = m[2];
      out.push({ verb: m[1].toUpperCase(), path: prefix + (p === '/' ? '' : p), file });
    }
  }
  return out;
}

function clientSources(): string[] {
  const files: string[] = [];
  (function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) {
        if (entry !== '__tests__' && entry !== 'node_modules') walk(p);
      } else if (/\.(ts|tsx)$/.test(entry)) files.push(p);
    }
  })(CLIENT_SRC);
  /* Comments stripped: a path named in prose is not a caller, and three
     separate instruments in this repository's audits have been wrong in
     exactly that way (scripts/ci/check-client-api-calls-resolve.mjs). */
  return files.map((f) =>
    readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''),
  );
}

/**
 * The HTTP verb one call site uses, read from the code around one occurrence of
 * a route's path.
 *
 * ── Why the verb, and not only the path ─────────────────────────────────────
 * The sweep was verb-blind (P-122 inventory, finding A11, 2026-11-10). `PUT
 * /api/cmc/batch-records/:id` (edit a logged batch) and `GET
 * /api/cmc/batch-records/:projectId` (list a project's batches) reduce to the
 * same literals, so the Batch tab's LIST call read as the EDIT route's caller,
 * and an edit nothing could make was reported as reached. A route is reached
 * only by a call that uses its verb.
 *
 * The shapes a call is written in, in the order they are tried:
 *   1. the verb as the argument just before the path —
 *      `apiRequest('PUT', '/api/…' + id)`, `run('compile', 'POST', '/api/…')`;
 *   2. a `method:` option after the path, inside the same call or config
 *      object — `fetch(url, { method: 'PATCH' })`, a register row action's
 *      `method: 'POST'`;
 *   3. a register row action's `path: (r) => …` or `retireSignedAction(…)`'s
 *      path argument with no method, which RegisterCard sends as PUT
 *      (cmcRegisters.tsx, `action.method ?? 'PUT'`);
 *   4. a register's `create={{ path: '…' }}`, which RegisterCard POSTs
 *      (cmcRegisters.tsx, `apiRequest('POST', create.path, …)`);
 *   5. anything else is a read: `useLiveRows(…)`, `useLiveData(…)`,
 *      `fetch(path)`, a RegisterCard `path="…"`.
 * A verb held in a variable reads as GET, so it can make a READ look reached
 * but never a write — the error this case exists to stop runs one way only.
 */
const VERBS = 'GET|POST|PUT|PATCH|DELETE';
function verbAt(src: string, start: number, end: number): string {
  const before = src.slice(Math.max(0, start - 80), start);
  const lead = new RegExp(`['"\x60](${VERBS})['"\x60]\\s*,\\s*['"\x60]?/?$`).exec(before);
  if (lead) return lead[1];
  const tail = src.slice(end, end + 300);
  const stop = tail.search(/\b(label|path):|apiRequest\(|fetch\(|useLive\w*\(/);
  const option = new RegExp(`method:\\s*['"\x60](${VERBS})['"\x60]`).exec(stop >= 0 ? tail.slice(0, stop) : tail);
  if (option) return option[1];
  const wider = src.slice(Math.max(0, start - 400), start);
  if (/path:\s*\([^)]*\)\s*=>\s*['"\x60]\/?$/.test(before)) return 'PUT';
  if (/retireSignedAction\([^;]*?\([^)]*\)\s*=>\s*['"\x60]\/?$/.test(wider)) return 'PUT';
  if (/path:\s*['"\x60]\/?$/.test(before) && /create=\{\{(?:(?!\}\})[\s\S])*$/.test(wider)) return 'POST';
  return 'GET';
}

/**
 * Does any client source build this path, with this verb?
 *
 * The literal segments must appear in order, with a bounded gap between them —
 * a caller writes `'/api/cmc/batch-records/' + id + '/release'`, so the gap
 * holds quotes and operators. Bounded rather than unbounded so two unrelated
 * strings in one file cannot satisfy a path between them.
 *
 * ── The trailing-parameter rule, and why it is here ─────────────────────────
 * A route that ENDS in a parameter — `PUT /analytical-methods/:id` — reduces to
 * the literals of its collection, `analytical-methods`. Without more, the
 * collection's own `GET /analytical-methods` call satisfies it, and 37 of the
 * 99 CMC routes read as reached on the strength of a list call. Raised by an
 * adversarial review of this file, and correct: the sweep would have reported
 * an edit route nothing calls as reached.
 *
 * So a route ending in a parameter must be seen with something built onto its
 * prefix: a concatenation, a template hole, or a further path segment. That is
 * what distinguishes `'/api/cmc/analytical-methods'` from
 * `'/api/cmc/analytical-methods/' + row.id`.
 *
 * ── The verb (P-122) ────────────────────────────────────────────────────────
 * When a verb is given, an occurrence counts only if `verbAt` reads that verb
 * at it. Without one (the cases below that pin the path rule alone) any
 * occurrence counts, as before.
 *
 * ── What it still cannot see ────────────────────────────────────────────────
 * A path whose base is held in a variable (`` `${base}/documents` ``). Those
 * are named, with their call site, in CALLER_NOT_VISIBLE_TO_THIS_SWEEP — and
 * every finding is confirmed by hand before it is called a gap.
 */
function isCalled(routePath: string, sources: string[], verb?: string): boolean {
  const segments = routePath.split('/').filter(Boolean);
  const literals: string[] = [];
  let run: string[] = [];
  for (const seg of segments) {
    if (seg.startsWith(':')) {
      if (run.length) { literals.push(run.join('/')); run = []; }
    } else run.push(seg);
  }
  if (run.length) literals.push(run.join('/'));
  const escaped = literals.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  /* `+ x`, `${…}` or `/…` immediately after the prefix: something is being
     appended, which a bare collection call never does. */
  const BUILT_ON = String.raw`['\x60]?\s*(\+|\$\{|/)`;
  const body = escaped.join('[^\\n]{0,70}');
  const pattern = new RegExp(segments[segments.length - 1]?.startsWith(':') ? body + BUILT_ON : body, 'g');
  return sources.some((src) => {
    for (const m of src.matchAll(pattern)) {
      if (!verb || verbAt(src, m.index!, m.index! + m[0].length) === verb) return true;
    }
    return false;
  });
}

/** `"PUT /api/…"` → its verb and path. */
const routeKey = (key: string): [verb: string, path: string] => [key.slice(0, key.indexOf(' ')), key.slice(key.indexOf(' ') + 1)];

describe('a CMC capability we built is reachable from the product', () => {
  it('has a client caller, or a named door that serves the same purpose', () => {
    /* The defect class this guards: a route, its engine and its tests all
       written, and no screen calling it — invisible in every diff, and
       indistinguishable from a feature that was never built. Three were in
       that state on 2026-10-25. */
    const sources = clientSources();
    const unreached = cmcRoutes()
      .map((r) => `${r.verb} ${r.path}`)
      .filter((key, i, all) => all.indexOf(key) === i)
      .filter((key) => !REACHED_ELSEWHERE[key] && !CALLER_NOT_VISIBLE_TO_THIS_SWEEP[key] && !RETIRED_AND_REFUSED[key])
      .filter((key) => !isCalled(routeKey(key)[1], sources, routeKey(key)[0]));
    expect(
      unreached,
      'built and not reachable from any screen — reach it, or record in REACHED_ELSEWHERE which door serves it',
    ).toEqual([]);
  });

  it('measures enough routes to be measuring anything', () => {
    /* A sweep whose extractor silently matches nothing passes forever. */
    expect(cmcRoutes().length).toBeGreaterThan(90);
    expect(clientSources().length).toBeGreaterThan(200);
  });

  it('every route listed as retired really does refuse', () => {
    /* The entry is a claim about the handler, so it is read against the
       handler. A route that stopped refusing would be a live capability
       nothing calls, hidden behind a note saying it is gone. */
    for (const [key, { refusal }] of Object.entries(RETIRED_AND_REFUSED)) {
      const [verb, path] = key.split(' ');
      /* The LONGEST matching mount, as Express attributes a path: '/api/cmc'
         is a prefix of '/api/cmc/agency-questions', and taking the first match
         read the leaf as '/agency-questions/:id' against the wrong file. */
      const mount = [...CMC_MOUNTS]
        .filter(([, prefix]) => path.startsWith(prefix + '/') || path === prefix)
        .sort((a, b) => b[1].length - a[1].length)[0];
      expect(mount, `${key}: no mount holds it`).toBeDefined();
      const src = readFileSync(join(REPO, mount![0]), 'utf8');
      const leaf = path.slice(mount![1].length) || '/';
      /* The handler is mounted, and the file states the refusal it gives. */
      expect(src, key).toMatch(new RegExp(`router\\.${verb.toLowerCase()}\\(\\s*['"\`]${leaf.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`));
      expect(src, `${key} no longer states a ${refusal}`).toContain(refusal);
    }
  });

  it('still names the caller for every route the sweep cannot see', () => {
    /* An unreadable caller is a limitation of the instrument, so each one is
       recorded with the file that calls it. A stale entry — a route that this
       sweep CAN now see, or one that no longer exists — is removed, so the
       list cannot grow into a place to hide a real gap. */
    const sources = clientSources();
    const live = new Set(cmcRoutes().map((r) => `${r.verb} ${r.path}`));
    for (const [key, why] of Object.entries(REACHED_ELSEWHERE)) {
      /* Same staleness rule for the other list: an entry naming a route that
         no longer exists, or one this sweep can now see called, is a line
         nobody reads that a real gap could hide behind. */
      expect(live.has(key), `${key} is listed in REACHED_ELSEWHERE and no longer exists`).toBe(true);
      expect(why.length, `${key} has no stated door`).toBeGreaterThan(40);
      expect(
        isCalled(routeKey(key)[1], sources, routeKey(key)[0]),
        `${key} has a caller now — remove it from REACHED_ELSEWHERE`,
      ).toBe(false);
    }
    for (const [key, { why }] of Object.entries(RETIRED_AND_REFUSED)) {
      expect(live.has(key), `${key} is listed as retired and no longer exists`).toBe(true);
      expect(why.length, `${key} has no stated reason`).toBeGreaterThan(40);
    }
    for (const [key, why] of Object.entries(CALLER_NOT_VISIBLE_TO_THIS_SWEEP)) {
      expect(live.has(key), `${key} is listed and no longer exists`).toBe(true);
      expect(why).toMatch(/\.tsx?\b/);
      expect(
        isCalled(routeKey(key)[1], sources, routeKey(key)[0]),
        `${key} is visible to the sweep now — remove it from CALLER_NOT_VISIBLE_TO_THIS_SWEEP`,
      ).toBe(false);
    }
  });

  it('would notice a route nothing calls', () => {
    /* Verified by making the check fail: a path no client builds must be
       reported, or the case above proves nothing. */
    const sources = clientSources();
    expect(isCalled('/api/cmc/not-a-real-register/:id/verdict', sources)).toBe(false);
    expect(isCalled('/api/cmc/analytical-methods', sources)).toBe(true);
  });

  it('does not count a collection call as reaching the route for one record', () => {
    /* The blind spot this sweep shipped with: a route ending in a parameter
       reduces to its collection's literals, so `GET /analytical-methods` made
       `PUT /analytical-methods/:id` read as reached — 37 of the 99 routes on
       the strength of a list call. Proven over a made-up collection that the
       client names exactly once, as a bare string. */
    const listOnly = ["const p = '/api/cmc/analytical-methods';"];
    expect(isCalled('/api/cmc/analytical-methods', listOnly)).toBe(true);
    expect(isCalled('/api/cmc/analytical-methods/:id', listOnly)).toBe(false);
    /* And a real per-record caller is still seen, in each shape one is written. */
    expect(isCalled('/api/cmc/analytical-methods/:id', ["'/api/cmc/analytical-methods/' + row.id"])).toBe(true);
    expect(isCalled('/api/cmc/analytical-methods/:id', ['`/api/cmc/analytical-methods/${row.id}`'])).toBe(true);
    expect(isCalled('/api/cmc/analytical-methods/:id', ["'/api/cmc/analytical-methods/12'"])).toBe(true);
  });

  it('does not count a list call as the caller of an edit (the verb is part of the route)', () => {
    /* P-122 inventory A11: the Batch tab LISTS a project's batches with
       GET /batch-records/:projectId, and that call made PUT /batch-records/:id —
       an edit no screen could make — read as reached. Same literals, same
       trailing parameter; only the verb tells them apart. */
    const list = ["const rows = useLiveRows('/api/cmc/batch-records/' + projectId);"];
    expect(isCalled('/api/cmc/batch-records/:projectId', list, 'GET')).toBe(true);
    expect(isCalled('/api/cmc/batch-records/:id', list, 'PUT')).toBe(false);
    /* Each shape a write is written in is still read as its own verb. */
    expect(isCalled('/api/cmc/batch-records/:id', ["apiRequest('PUT', '/api/cmc/batch-records/' + b.dbId, body)"], 'PUT')).toBe(true);
    expect(isCalled('/api/cmc/batch-records/:id', ["apiRequest('PUT', '/api/cmc/batch-records/' + b.dbId, body)"], 'GET')).toBe(false);
    expect(isCalled('/api/cmc/x/:id/go', ["fetch('/api/cmc/x/' + id + '/go', { method: 'PATCH' })"], 'PATCH')).toBe(true);
    expect(isCalled('/api/cmc/x/:id', ['{ label: \'Edit\', path: (r) => `/api/cmc/x/${r.id}`, toBody: (v) => v },'], 'PUT')).toBe(true);
    expect(isCalled('/api/cmc/x/:id/sign', ['{ label: \'Sign\', path: (r) => `/api/cmc/x/${r.id}/sign`, method: \'POST\', toBody: (v) => v },'], 'POST')).toBe(true);
    expect(isCalled('/api/cmc/x', ["create={{ label: 'Add', path: '/api/cmc/x', toBody: (v) => v }}"], 'POST')).toBe(true);
    expect(isCalled('/api/cmc/x', ["create={{ label: 'Add', path: '/api/cmc/x', toBody: (v) => v }}"], 'GET')).toBe(false);
  });
});
