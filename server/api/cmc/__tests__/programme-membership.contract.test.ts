/**
 * Every CMC route that takes a programme from the client must check it is this
 * organisation's.
 *
 * ## What this caught
 *
 * A sweep of the register router on 2026-10-19 found two kinds of route that
 * never asked:
 *
 * 1. **A verdict over a programme nobody holds.** `POST /api/cmc/ich-compliance`
 *    answered **200 with a complete eleven-guideline verdict and nine findings**
 *    for a programme that does not exist, for another organisation's programme,
 *    and for the string `not-a-uuid`. The findings were the "nothing is
 *    recorded" ones, so a mistyped id read as a confident compliance report
 *    about an empty register. `GET /quality/qbd/:projectId` and
 *    `POST /control-strategy` derived CQAs, CPPs and a control strategy the
 *    same way.
 *
 * 2. **A record filed under a programme nobody holds.** `POST
 *    /api/cmc/container-closures` wrote the body's `projectId` straight into the
 *    row: it filed record id 144 under `99999999-9999-4999-8999-999999999999`
 *    and answered 200, while `POST /api/cmc/analytical-methods` refused the
 *    same body with 409 and the sentence that names the problem. Five of the
 *    seven `register-writes.ts` creates were in that state, and so was the
 *    raw-SQL comparability create.
 *
 * ## Why a source contract and not only route tests
 *
 * Both defects are *absences*. A route test proves the routes it names; it
 * cannot fail for the route somebody adds next month. This reads the router and
 * fails on any path that takes a client-supplied programme and reaches neither
 * the create-side check (`filedProjectOnCreate`), the edit-side one
 * (`projectOnEdit`), nor a membership refusal — which is the shape in which
 * both of these arrived.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROUTES_FILE = 'server/api/cmc/routes.ts';
const WRITES_FILE = 'server/services/cmc/register-writes.ts';
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

/** One route handler's span: from its `router.<verb>(` to the next one's. */
interface RouteSpan {
  verb: string;
  routePath: string;
  body: string;
}
function routeSpans(source: string): RouteSpan[] {
  const starts = [...source.matchAll(/router\.(get|post|put|delete)\('([^']+)'/g)];
  return starts.map((m, i) => ({
    verb: m[1].toUpperCase(),
    routePath: m[2],
    body: source.slice(m.index, starts[i + 1]?.index ?? source.length),
  }));
}

/** Does the handler read a programme id the CLIENT chose? */
function takesClientProgramme(body: string): boolean {
  return /req\.(body\??\.?\??\.?projectId|params\.projectId|query\.projectId)/.test(body);
}

/**
 * The three ways a CMC route legitimately establishes the programme, and the
 * register-writes creators that each do it inside.
 *
 * `projectFilter` is NOT one of them, and deliberately: it narrows a list that
 * is already `organizationId`-scoped, so an id of another organisation matches
 * no row. It establishes nothing and is only safe in that position, so a route
 * that reads a client programme for anything else is not excused by it.
 */
const ESTABLISHES_PROGRAMME = [
  'answeredUnknownProgram',
  'projectBelongsToTenant',
  'filedProjectOnCreate',
  'projectOnEdit',
  'createContainerClosure',
  'createMaterialSpec',
  'createFormulationRecord',
  'createManufacturingProcess',
  'createCharacterizationStudy',
  'createDrugSubstance',
  'createDrugProduct',
];

/** A list route that only narrows its own organisation's rows. */
const NARROWS_A_LIST = (span: RouteSpan) =>
  span.verb === 'GET' && span.body.includes('projectFilter(req,') && span.body.includes('organizationId, orgId');

describe('no CMC route acts on a programme it has not checked', () => {
  const spans = routeSpans(read(ROUTES_FILE));

  it('reads some routes at all, so a broken regex cannot pass as compliance', () => {
    expect(spans.length).toBeGreaterThan(30);
    expect(spans.filter((s) => takesClientProgramme(s.body)).length).toBeGreaterThan(5);
  });

  it('every route taking a client-supplied programme establishes it', () => {
    const unchecked = spans
      .filter((s) => takesClientProgramme(s.body))
      .filter((s) => !ESTABLISHES_PROGRAMME.some((fn) => s.body.includes(fn)))
      .filter((s) => !NARROWS_A_LIST(s))
      .map((s) => `${s.verb} ${s.routePath}`);
    expect(
      unchecked,
      'a route that takes a programme from the client and never checks it either files a record under a dossier ' +
        'this organisation does not hold, or answers a verdict over a register it never read',
    ).toEqual([]);
  });

  it('the refusal is a 404 that assesses nothing, not a 403', () => {
    /* That a programme exists in another organisation is not the caller's to
       learn, and the sentence has to say that nothing was assessed — a bare
       404 reads as "the route is missing". */
    const helper = read(ROUTES_FILE);
    expect(helper).toContain('async function answeredUnknownProgram');
    expect(helper).toMatch(/answeredUnknownProgram[\s\S]{0,900}res\.status\(404\)/);
    expect(helper).toMatch(/No such program in this organization — nothing was assessed\./);
  });
});

describe('no register create files under a programme it has not checked', () => {
  const writes = read(WRITES_FILE);
  const creators = [...writes.matchAll(/export async function (create\w+)\(/g)].map((m, i, all) => ({
    name: m[1],
    body: writes.slice(m.index, all[i + 1] ? writes.indexOf(`export async function ${all[i + 1][1]}(`) : writes.length),
  }));

  it('finds the creators, so an empty match cannot pass', () => {
    expect(creators.map((c) => c.name)).toContain('createContainerClosure');
    expect(creators.length).toBeGreaterThan(4);
  });

  for (const creator of creators) {
    it(`${creator.name} verifies the programme before it writes`, () => {
      expect(
        creator.body.includes('filedProjectOnCreate'),
        `${creator.name} writes the body's projectId with no check: a typo files an invisible record and another ` +
          "organisation's programme id files one under a dossier this tenant does not hold",
      ).toBe(true);
    });
  }

  it('the check runs before the row is inserted, not after', () => {
    for (const creator of creators) {
      const checkAt = creator.body.indexOf('filedProjectOnCreate');
      const insertAt = creator.body.search(/insertRegisterRow|client\.query\(/);
      if (insertAt < 0) continue;
      expect(checkAt, `${creator.name}: the programme is checked after the row is written`).toBeLessThan(insertAt);
    }
  });
});
