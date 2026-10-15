/**
 * Security contract (C2C-AI-003): AnA tool arguments are attacker-influenced
 * input, and the two places that trusted them are closed.
 *
 * Tool arguments are chosen by the model, and the model reads untrusted content
 * — uploaded protocols, fetched pages, documents another user supplied. So an
 * argument is not a parameter the system chose; it is a value an attacker can
 * steer. Two handlers treated arguments as trusted:
 *
 *   1. `convert_docx_to_pdf` took `input_docx_path` and `output_pdf_path` as raw
 *      strings and handed them to the docx→pdf worker, which READS the first and
 *      OVERWRITES the second (`generated.replace(output_pdf)` in
 *      server/scripts/docx_pdf_pipeline.py). It was also the only tool in the
 *      document-surgery family registered WITHOUT a ToolContext, so it had no
 *      tenant identity to check even in principle.
 *
 *   2. `query_rim_patterns_by_domain` / `summarize_rim_intelligence` read
 *      `input.orgId` — and their schemas made it a REQUIRED model-supplied
 *      field — then queried the pattern store with it. Naming another
 *      organization's id returned that tenant's learned regulatory patterns.
 *
 * These tests exercise the confinement predicate directly and pin the tool
 * schemas, so a regression that reintroduces a model-supplied tenant id or a
 * model-supplied absolute path fails here.
 *
 * INJ-PATH-002 (audit 2026-07) then found that the confinement was not per
 * tenant: `tmp/` and `uploads/` held every organization's files, so a path
 * under `uploads/org-2/` passed for an org-1 caller. The workspace is now the
 * caller's own — `uploads/org-<id>/` and `tmp/<kind>/org-<id>/` — and a
 * symlink cannot carry a checked path somewhere else.
 */

import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  anaScratchDir,
  assertWithinDocumentWorkspace,
  documentWorkspaceRoots,
  isWithinDocumentWorkspace,
  workspaceFileName,
} from '../server/services/ana/document-workspace';
import {
  QUERY_RIM_PATTERNS_BY_DOMAIN,
  SUMMARIZE_RIM_INTELLIGENCE,
} from '../server/services/ana/rimQueryTools';

const ORG = 7;
const inside = (candidate: unknown, org: unknown = ORG) => isWithinDocumentWorkspace(candidate, org);

describe('AnA document workspace confinement', () => {
  it("is the caller's own uploads and scratch areas, and nothing else", () => {
    const cwd = process.cwd();
    expect(documentWorkspaceRoots(ORG)).toEqual([
      path.resolve(cwd, 'tmp', 'docbuilder', 'org-7'),
      path.resolve(cwd, 'tmp', 'submissions', 'org-7'),
      path.resolve(cwd, 'tmp', 'ana-scripts', 'org-7'),
      path.resolve(cwd, 'tmp', 'ana-container', 'org-7'),
      path.resolve(cwd, 'uploads', 'org-7'),
    ]);
  });

  it.each([
    ['a builder output path', 'tmp/docbuilder/org-7/ab12cd34/draft.docx'],
    ['an eCTD packager path', 'tmp/submissions/org-7/pkg-1/m1/cover.pdf'],
    ['an upload of its own', 'uploads/org-7/file_abc'],
    ['an absolute path that genuinely lives in its workspace', path.resolve(process.cwd(), 'tmp', 'docbuilder', 'org-7', 'x.docx')],
  ])('accepts %s', (_label, candidate) => {
    expect(inside(candidate)).toBe(true);
  });

  it.each([
    ['an absolute path to a secrets file', '/app/.env'],
    ['an absolute system path', '/etc/passwd'],
    ['a traversal out of the workspace', 'tmp/../../etc/passwd'],
    ['a bare traversal segment', '../secrets.docx'],
    ['a windows-style traversal', 'tmp\\..\\..\\secrets'],
    [
      'an absolute sibling directory sharing the root prefix',
      `${path.resolve(process.cwd(), 'tmp', 'docbuilder', 'org-7')}evil/x.docx`,
    ],
    ['an embedded NUL truncation trick', 'tmp/docbuilder/org-7/ok.docx\0/etc/passwd'],
    ['an empty string', ''],
    ['a non-string', 42],
    ['null', null],
    ['undefined', undefined],
  ])('rejects %s', (_label, candidate) => {
    expect(inside(candidate as unknown)).toBe(false);
  });

  it('throws a correctable, non-echoing error', () => {
    // The message must NOT contain the rejected path: the tool result goes back
    // into the conversation, so echoing attacker-controlled text there is a
    // reflection the model will read.
    const attacker = '/etc/shadow';
    expect(() => assertWithinDocumentWorkspace(attacker, 'input_docx_path', ORG)).toThrow(
      /input_docx_path must be a path inside your organization's AnA workspace/,
    );
    try {
      assertWithinDocumentWorkspace(attacker, 'input_docx_path', ORG);
    } catch (e) {
      expect((e as Error).message).not.toContain(attacker);
    }
  });

  it("returns the RESOLVED absolute path, not the caller's string", () => {
    // Callers must forward this value. Returning the raw candidate is what let
    // the guard validate one file while the consumer opened another — see the
    // relative-path regressions below.
    expect(assertWithinDocumentWorkspace('tmp/docbuilder/org-7/x/y.docx', 'input_docx_path', ORG)).toBe(
      path.resolve(process.cwd(), 'tmp/docbuilder/org-7/x/y.docx'),
    );
  });
});

/*
 * INJ-PATH-002. Each of these passed the old guard, which confined a path to
 * tmp/ or uploads/ as a whole — every tenant's files alike.
 */
describe("workspace confinement is per tenant (INJ-PATH-002)", () => {
  it.each([
    ["another tenant's upload", 'uploads/org-2/file_1753900000000_a1b2c3'],
    ["another tenant's builder output", 'tmp/docbuilder/org-2/ab12cd34/draft.docx'],
    ["another tenant's eCTD package", 'tmp/submissions/org-2/pkg-1/m1/cover.pdf'],
    ['a tenant whose id merely starts with ours', 'uploads/org-77/file_abc'],
    ['a scratch file that belongs to nobody (the old layout)', 'tmp/docbuilder/ab12cd34/draft.docx'],
    ['the whole uploads tree', 'uploads'],
    ['a tmp area AnA does not write to', 'tmp/other/org-7/x.docx'],
  ])('refuses %s', (_label, candidate) => {
    expect(inside(candidate)).toBe(false);
  });

  it.each([
    ['no organization', undefined],
    ['organization 0', 0],
    ['a non-numeric organization', 'org-7'],
    ['a negative organization', -7],
  ])('refuses everything with %s', (_label, org) => {
    expect(isWithinDocumentWorkspace('uploads/org-7/file_abc', org)).toBe(false);
    expect(documentWorkspaceRoots(org)).toEqual([]);
  });

  it("names every scratch directory inside the tenant's own area", () => {
    const dir = anaScratchDir(ORG, 'docbuilder');
    expect(dir.startsWith(path.resolve(process.cwd(), 'tmp', 'docbuilder', 'org-7') + path.sep)).toBe(true);
    expect(inside(path.join(dir, 'draft.docx'))).toBe(true);
    expect(inside(path.join(dir, 'draft.docx'), 2)).toBe(false);
    expect(anaScratchDir(ORG, 'docbuilder')).not.toBe(dir);
    expect(() => anaScratchDir(undefined, 'docbuilder')).toThrow();
  });

  describe('a symlink cannot carry a checked path out', () => {
    const own = path.resolve(process.cwd(), 'uploads', 'org-990001');
    const other = path.resolve(process.cwd(), 'uploads', 'org-990002');
    afterAll(() => {
      fs.rmSync(own, { recursive: true, force: true });
      fs.rmSync(other, { recursive: true, force: true });
    });

    it("to another tenant's files, or to the host", () => {
      fs.mkdirSync(own, { recursive: true });
      fs.mkdirSync(other, { recursive: true });
      fs.writeFileSync(path.join(other, 'dossier.docx'), 'org 2');
      fs.symlinkSync(other, path.join(own, 'neighbour'));
      fs.symlinkSync('/etc', path.join(own, 'etc'));
      fs.writeFileSync(path.join(own, 'mine.docx'), 'org 1');

      expect(isWithinDocumentWorkspace('uploads/org-990001/mine.docx', 990001)).toBe(true);
      expect(isWithinDocumentWorkspace('uploads/org-990001/neighbour/dossier.docx', 990001)).toBe(false);
      expect(isWithinDocumentWorkspace('uploads/org-990001/etc/passwd', 990001)).toBe(false);
      // A file not written yet under a linked directory is refused too: the
      // write would land wherever the link points.
      expect(isWithinDocumentWorkspace('uploads/org-990001/neighbour/new.pdf', 990001)).toBe(false);
    });
  });

  it('builds file names that cannot leave a directory', () => {
    for (const raw of ['../../etc/cron.d/x', '/abs/path/doc', 'a\\..\\b', '..']) {
      const name = workspaceFileName(raw, 'f');
      expect(name, raw).not.toMatch(/[\\/]/);
      expect(name.startsWith('.'), raw).toBe(false);
      expect(path.join('/w', name).startsWith('/w/'), raw).toBe(true);
    }
    expect(workspaceFileName('Module 2.5 — Overview', 'f')).toBe('Module_2.5___Overview');
    expect(workspaceFileName('..', 'fallback')).toBe('fallback');
    expect(workspaceFileName('.env', 'fallback')).toBe('env');
    expect(workspaceFileName(undefined, 'fallback')).toBe('fallback');
  });
});

describe('workspace confinement — relative paths that escape (regression)', () => {
  /**
   * The guard originally resolved candidates against the workspace ROOT while
   * the Python worker resolves against process.cwd(). Two bases, so the check
   * and the open addressed different files, and every ordinary relative path
   * passed:
   *
   *   "dist/index.js"
   *     guard    → resolve("<cwd>/tmp", "dist/index.js") = <cwd>/tmp/dist/index.js  → PASS
   *     consumer → Path("dist/index.js").resolve()       = <cwd>/dist/index.js      → overwritten
   *
   * convert_docx_to_pdf OVERWRITES output_pdf_path, so this was an arbitrary
   * file write reachable by an authenticated tenant whose model was steered by
   * injected content. Absolute paths and '..' were blocked; these were not.
   */
  it.each([
    ['the production server bundle', 'dist/index.js'],
    ['the package manifest', 'package.json'],
    ['a secrets file', '.env'],
    ['application source', 'server/index.ts'],
    ['a nested source path', 'server/routes/auth.ts'],
  ])('rejects %s reached by a plain relative path', (_label, candidate) => {
    expect(inside(candidate)).toBe(false);
    expect(() => assertWithinDocumentWorkspace(candidate, 'output_pdf_path', ORG)).toThrow();
  });

  it('still accepts the paths the document tools actually produce', () => {
    for (const ok of ['tmp/docbuilder/org-7/ab12cd34/draft.docx', 'tmp/submissions/org-7/pkg-1/m1/cover.pdf']) {
      expect(inside(ok)).toBe(true);
    }
  });

  it('the guard and the consumer now agree on which file is meant', () => {
    // One base, one resolution: what the guard validated is exactly what a
    // consumer resolving against cwd will open.
    const candidate = 'tmp/docbuilder/org-7/x/y.docx';
    expect(assertWithinDocumentWorkspace(candidate, 'input_docx_path', ORG)).toBe(
      path.resolve(process.cwd(), candidate),
    );
  });
});

describe('RIM query tools take no tenant id from the model', () => {
  it.each([
    [QUERY_RIM_PATTERNS_BY_DOMAIN],
    [SUMMARIZE_RIM_INTELLIGENCE],
  ])('$name declares no orgId parameter', (tool) => {
    const props = tool.input_schema.properties as Record<string, unknown>;
    expect(Object.keys(props)).not.toContain('orgId');
    expect(tool.input_schema.required ?? []).not.toContain('orgId');
  });

  it('does not invite the model to name an organization', () => {
    for (const tool of [QUERY_RIM_PATTERNS_BY_DOMAIN, SUMMARIZE_RIM_INTELLIGENCE]) {
      expect(tool.description).toMatch(/do not pass an organization id/i);
    }
  });

  it('still asks for the domain filter, which is genuinely the model\'s to choose', () => {
    expect(QUERY_RIM_PATTERNS_BY_DOMAIN.input_schema.required).toEqual(['domain']);
  });
});

/*
 * INJ-PATH-002 found the guard wired into ONE tool while its siblings read the
 * same kind of argument unguarded. So this is the ratchet the finding asked
 * for: every AnA tool handler that reads a path-shaped argument (…_path,
 * …_dir, or a leaf's source_path) resolves it through the workspace guard. A handler that takes such
 * an argument and never touches the filesystem is listed below with the
 * reason, and stays listed only while that is true.
 */
describe('every AnA tool that takes a path runs it through the workspace guard', () => {
  const NO_FILESYSTEM: Record<string, string> = {
    record_validation_finding: 'file_path is stored as the finding\'s text; nothing is opened',
    transmit_submission: 'bundle_path is echoed into the refusal; the tool transmits nothing',
    compute_lifecycle_operations: 'source_path is carried through a pure lifecycle computation',
    convene_drafting_council: 'section_path is a section label, not a file',
    convert_to_rps_v4: 'a leaf\'s source_path is only a lookup key for a caller-supplied hash; the in-memory RPS message opens nothing',
    check_ectd_cross_references: 'the cross-reference resolver reads the leaf list, not the files',
  };
  const PATH_INPUT = /input\.\w*_(?:path|dir)\b|\.source_path\b/;
  // The guard itself, or a helper that does nothing but apply it to one tool's
  // paths (confinePackagerPaths, for package_ectd_for_region's leaves).
  const GUARD =
    /workspacePathOrRefusal\(|assertWithinDocumentWorkspace\(|resolveWithinDocumentWorkspace\(|confinePackagerPaths\(/;

  const handlers: Array<{ tool: string; body: string }> = [];
  for (const rel of ['server/services/ana/AnaToolExecutor.ts', 'server/services/ana/agentic-workflow-tools.ts']) {
    const src = fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
    const starts = [...src.matchAll(/(?:registerToolHandler|register)\('([a-z0-9_]+)'/g)];
    starts.forEach((m, i) => {
      handlers.push({ tool: m[1], body: src.slice(m.index!, starts[i + 1]?.index ?? src.length) });
    });
  }

  it('finds the handlers it checks', () => {
    expect(handlers.length).toBeGreaterThan(500);
  });

  it('has no unguarded path argument', () => {
    const unguarded = handlers
      .filter(h => PATH_INPUT.test(h.body) && !GUARD.test(h.body) && !(h.tool in NO_FILESYSTEM))
      .map(h => h.tool);
    expect(unguarded, 'tool handlers that read a path argument without the workspace guard').toEqual([]);
  });

  it('lists only handlers that still take a path argument', () => {
    const stale = Object.keys(NO_FILESYSTEM).filter(tool => {
      const h = handlers.find(x => x.tool === tool);
      return !h || !PATH_INPUT.test(h.body);
    });
    expect(stale).toEqual([]);
  });
});
