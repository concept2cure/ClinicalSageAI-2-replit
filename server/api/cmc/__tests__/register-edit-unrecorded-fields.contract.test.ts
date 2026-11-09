/**
 * Every CMC register edit asks the unrecorded-field question.
 *
 * The rule itself is unit-tested in
 * `server/services/cmc/__tests__/unrecorded-register-fields.test.ts`. This
 * contract holds its ADOPTION: a register edit added later, or one whose guard
 * is deleted in a tidy-up, is caught here rather than by a caller whose write
 * is answered 200 and stored nothing.
 *
 * It reads the route file's source because each handler's body is private to
 * it. Comments are blanked first: the fix documents the expression it replaced,
 * and a grep over raw source reports that prose as if it were code — three
 * separate instruments in this repository have been wrong in exactly that way.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const FILE = 'server/api/cmc/routes.ts';
const RAW = fs.readFileSync(path.join(process.cwd(), FILE), 'utf8');
const SOURCE = RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** The source split into one chunk per `router.<verb>('<path>'` declaration. */
function handlers(): Array<{ route: string; body: string }> {
  const starts: Array<{ route: string; at: number }> = [];
  const re = /router\.(get|put|post|patch|delete)\('([^']+)'/g;
  for (let m = re.exec(SOURCE); m; m = re.exec(SOURCE)) {
    starts.push({ route: `${m[1].toUpperCase()} ${m[2]}`, at: m.index });
  }
  return starts.map((s, i) => ({
    route: s.route,
    body: SOURCE.slice(s.at, i + 1 < starts.length ? starts[i + 1].at : SOURCE.length),
  }));
}

/** The edits: a handler that parses a register body as a partial. */
const edits = handlers().filter(h => /\.partial\(\)\.parse\(req\.body\)/.test(h.body));

describe('every register edit refuses a field it does not record', () => {
  it('finds the register edits at all — an empty sweep proves nothing', () => {
    expect(edits.length).toBeGreaterThanOrEqual(15);
  });

  it.each(edits.map(e => e.route))('%s asks refuseUnrecordedFields', route => {
    const handler = edits.find(e => e.route === route)!;
    expect(handler.body).toContain('refuseUnrecordedFields(');
  });

  it('asks it with the same schema it then parses with', () => {
    for (const edit of edits) {
      const parsed = /const validatedData = (\w+)\.partial\(\)\.parse\(req\.body\)/.exec(edit.body);
      const guarded = /refuseUnrecordedFields\((\w+),/.exec(edit.body);
      expect(parsed, `${edit.route} parses a register body`).toBeTruthy();
      expect(guarded, `${edit.route} asks the question`).toBeTruthy();
      expect(guarded![1], `${edit.route} guards the schema it parses with`).toBe(parsed![1]);
    }
  });

  it('asks it BEFORE the parse, so the caller is told the field name is wrong', () => {
    for (const edit of edits) {
      expect(
        edit.body.indexOf('refuseUnrecordedFields('),
        `${edit.route} guards before parsing`,
      ).toBeLessThan(edit.body.indexOf('.partial().parse(req.body)'));
    }
  });
});
