/**
 * The GA demo seed runs its domain parts in the order their numeric prefixes
 * say. 2026-09-28 (W5/D7, WO-9).
 *
 * `111-ind-program.mjs` anchors the BX-512 IND's submission spine to the
 * regulatory program `80-programs-tlf-pdev.mjs` creates, and
 * `112-ind-authoring-doc.mjs` writes that program's authoring document. Sorted
 * as strings, every 1xx part ran before `20-…`: on a fresh database both found
 * no program and skipped, and the demo IND existed only after a second run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
// @ts-expect-error — a plain .mjs seed module, no declarations.
import { orderDomainParts } from '../../scripts/seed/ga-demo-order.mjs';

const PARTS_DIR = path.resolve(__dirname, '../../scripts/seed/ga-demo.d');
const runOrder = (): string[] =>
  orderDomainParts(fs.readdirSync(PARTS_DIR).filter((f) => f.endsWith('.mjs')));

describe('GA demo seed — domain part run order', () => {
  it('seeds the regulatory programs before the IND program spine and its authoring document', () => {
    const order = runOrder();
    const at = (file: string): number => {
      const i = order.indexOf(file);
      expect(i, `${file} is a seed part`).toBeGreaterThanOrEqual(0);
      return i;
    };
    expect(at('80-programs-tlf-pdev.mjs')).toBeLessThan(at('111-ind-program.mjs'));
    expect(at('80-programs-tlf-pdev.mjs')).toBeLessThan(at('112-ind-authoring-doc.mjs'));
  });

  it('runs every numbered part in the order of its number', () => {
    const numbers = runOrder()
      .map((f) => /^(\d+)-/.exec(f)?.[1])
      .filter((n): n is string => n !== undefined)
      .map(Number);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
  });
});
