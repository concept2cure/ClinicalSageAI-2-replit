// @vitest-environment jsdom
/**
 * D0.md §8.1: the spark marks an AnA action, and only that.
 *
 * AnswerLead drew `I.sparkles` on every lead action by default, so "Review the inbox" and "Open a pediatric plan",
 * which change local state, carried the same mark as "Ask AnA about these findings". A spark on an action AnA does not
 * take is a false signal. The default is now no icon. An action that asks AnA (`ask(` / `onAsk(` in its onClick)
 * passes `I.sparkles`; one that does not, passes none.
 *
 * Two checks:
 *   - the component: no icon unless given one;
 *   - every literal lead action in v2, read with the TypeScript parser: it carries the spark if and only if it asks
 *     AnA. An action held in a variable (Review's `signAction`) cannot be read statically; it is counted and named,
 *     and takes the default (none).
 * Red at ce6ba73b18 (the default was the spark, and nine AnA actions passed none); evidence in
 * docs/evidence/DESIGN/D0/D0-14-spark-marks-ana/.
 */
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import { AnswerLead } from '../AnswerLead';
import { I } from '../icons';

afterEach(cleanup);

const V2 = path.resolve(__dirname, '..');

function tsxFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : tsxFiles(p);
    return e.name.endsWith('.tsx') ? [p] : [];
  });
}

interface LeadAction { where: string; label: string; asks: boolean; spark: boolean }

/** Every object literal with `label` and `onClick` inside an AnswerLead's `action={…}`, except its `alt`. */
function leadActions(): { actions: LeadAction[]; byVariable: string[] } {
  const actions: LeadAction[] = [];
  const byVariable: string[] = [];
  for (const file of tsxFiles(V2)) {
    const text = fs.readFileSync(file, 'utf8');
    if (!text.includes('<AnswerLead')) continue;
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const rel = path.relative(V2, file);
    const visit = (node: ts.Node): void => {
      if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(sf) === 'AnswerLead') {
        for (const attr of node.attributes.properties) {
          if (!ts.isJsxAttribute(attr) || attr.name.getText(sf) !== 'action') continue;
          const init = attr.initializer;
          if (!init || !ts.isJsxExpression(init) || !init.expression) continue;
          if (ts.isIdentifier(init.expression)) { byVariable.push(rel + ': ' + init.expression.text); continue; }
          const walk = (n: ts.Node): void => {
            if (ts.isObjectLiteralExpression(n)) {
              const prop = (name: string) => n.properties.find(
                (p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText(sf) === name);
              const label = prop('label');
              const onClick = prop('onClick');
              if (label && onClick) {
                const icon = prop('icon');
                actions.push({
                  where: rel + ':' + (sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1),
                  label: label.initializer.getText(sf).slice(0, 60),
                  asks: /\b(ask|onAsk)\s*\(/.test(onClick.initializer.getText(sf)),
                  // A mixed action (IndLifecycle: ask, or assemble) may name the spark in a condition.
                  spark: /\bI\.sparkles\b/.test(icon?.initializer.getText(sf) ?? ''),
                });
                // The alt renders no icon; its own object is not a lead action.
                for (const p of n.properties) if (p !== prop('alt')) ts.forEachChild(p, walk);
                return;
              }
            }
            ts.forEachChild(n, walk);
          };
          walk(init.expression);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return { actions, byVariable };
}

describe('D0.md §8.1: the spark marks an AnA action, and only that', () => {
  it('AnswerLead draws no icon on its action unless given one', () => {
    render(<AnswerLead headline="Nothing is waiting on you." action={{ label: 'Open the queue', onClick: () => {} }} />);
    expect(document.querySelector('.al-btn svg')).toBeNull();
    cleanup();
    render(<AnswerLead headline="Two findings." action={{ label: 'Ask AnA', icon: I.sparkles, onClick: () => {} }} />);
    expect(document.querySelector('.al-btn svg')).not.toBeNull();
  });

  it('every literal lead action carries the spark exactly when it asks AnA', () => {
    const { actions, byVariable } = leadActions();
    // The scan found the lead actions (35, 14 of them asking AnA, at 2026-11-09), so a parser change cannot pass it empty.
    expect(actions.length).toBeGreaterThan(15);
    expect(actions.filter((a) => a.asks).length).toBeGreaterThan(5);
    const wrong = actions.filter((a) => a.asks !== a.spark)
      .map((a) => `${a.where} ${a.label}: ${a.asks ? 'asks AnA, no spark' : 'spark on a local action'}`);
    expect(wrong).toEqual([]);
    // Held in a variable, so unread here; they take the default (no spark). Named so a new one is seen.
    expect(byVariable).toEqual(['surfaces/Review.tsx: signAction']);
  });
});
