/**
 * A screen that holds AnA's action while its data loads must say when the
 * data has settled — however it settled.
 *
 * The contract (surfaceActions.ts): a handler answers `retry: true` while its
 * read is in flight, the bus holds the directive, and the screen calls
 * `notifySurfaceActionReady` so the held directive gets its answer. Nothing
 * else re-attempts it. A directive still held after PENDING_ACTION_TTL_MS
 * (20 s) is reported as "did not become ready in time", and the server has
 * told AnA "not confirmed" at 10 s.
 *
 * Found in the browser, 2026-09-29 (docs/evidence/W1/2026-09-28-ana-drive/
 * held-actions.txt). Acting on a screen the person is not on sends the bus
 * there, so the action arrives while that screen's read is in flight:
 *   1. Two screens held and never signalled. Switching the Inconsistency
 *      overlay from another screen never landed; loading a Biostatistics
 *      design never answered.
 *   2. Sixteen screens signalled only when their read succeeded. Their
 *      handlers refuse honestly when it fails ("the sponsor roster did not
 *      load…"), but a held directive never got that answer: it waited out the
 *      20 s and was reported as not ready instead.
 *
 * Read from the source with the TypeScript parser, like the registry gates
 * beside it: which screens can hold, and what gates their ready signal.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const CLIENT = path.join(ROOT, 'client/src');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : sourceFiles(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

interface Screen {
  file: string;
  line: number;
  id: string;
  holds: boolean;
}
interface Signal {
  file: string;
  line: number;
  id: string;
  gate: string | null;
}

/** Every handler registration and every ready signal in the client. */
function readScreens(): { screens: Screen[]; signals: Signal[] } {
  const screens: Screen[] = [];
  const signals: Signal[] = [];
  for (const file of sourceFiles(CLIENT)) {
    const text = fs.readFileSync(file, 'utf8');
    if (!/useSurfaceActionHandlers|notifySurfaceActionReady/.test(text)) continue;
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const rel = path.relative(ROOT, file);
    const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
    const visit = (n: ts.Node): void => {
      if (ts.isCallExpression(n) && n.arguments.length > 0) {
        const callee = n.expression.getText();
        const id = n.arguments[0].getText();
        if (callee === 'useSurfaceActionHandlers' && n.arguments[1]) {
          screens.push({ file: rel, line: lineOf(n), id, holds: /\bretry:\s*true\b/.test(n.arguments[1].getText()) });
        }
        if (callee === 'notifySurfaceActionReady') {
          let at: ts.Node | undefined = n.parent;
          while (at && !ts.isIfStatement(at) && !ts.isFunctionLike(at)) at = at.parent;
          signals.push({ file: rel, line: lineOf(n), id, gate: at && ts.isIfStatement(at) ? at.expression.getText() : null });
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return { screens, signals };
}

/** A gate that withholds the signal when the read failed or came back empty. */
const FAILURE_EXCLUDED = /!\s*[\w.]*\b(error|empty)\b/;

describe('the ready signal — a held action always gets its answer', () => {
  const { screens, signals } = readScreens();

  it('reads the screens it guards (a parser that found none would pass vacuously)', () => {
    expect(screens.filter(s => s.holds).length).toBeGreaterThan(20);
    expect(signals.length).toBeGreaterThan(20);
  });

  it('every screen that can hold an action signals when its data settles', () => {
    const silent = screens
      .filter(s => s.holds && !signals.some(g => g.file === s.file && g.id === s.id))
      .map(s => `${s.file}:${s.line} (${s.id})`);
    expect(silent, 'holds an action (retry: true) and never calls notifySurfaceActionReady for it').toEqual([]);
  });

  it('no ready signal waits for the read to succeed', () => {
    const gated = signals
      .filter(g => g.gate && FAILURE_EXCLUDED.test(g.gate))
      .map(g => `${g.file}:${g.line} if (${g.gate})`);
    expect(gated, 'a failed or empty read never re-attempts the held action, so its honest refusal is lost').toEqual([]);
  });
});

describe('the pattern that catches it', () => {
  it('flags the gates it exists to catch, and not the ones that pass', () => {
    for (const gate of ['!live.loading && !live.error', '!loading && !error && !empty', "applied && !board.loading && !board.error"]) {
      expect(FAILURE_EXCLUDED.test(gate), gate).toBe(true);
    }
    for (const gate of ['!live.loading', "listState === 'ready' || listState === 'error'", '!boardState.loading || boardData']) {
      expect(FAILURE_EXCLUDED.test(gate), gate).toBe(false);
    }
  });
});
