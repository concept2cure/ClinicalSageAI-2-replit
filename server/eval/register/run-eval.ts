/**
 * Register evaluation runner — scores captured AnA turns against the chat
 * register and prints a scorecard. Companion to server/eval/doc-quality and
 * server/eval/rag; the metrics live in register-linter.ts and are unit-tested.
 *
 * Offline only. It scores a transcript file you give it; it does not call a
 * model. No AI provider was available when this was written (2026-09-21), so
 * the live evaluation — real AnA answers through the governed gateway, scored
 * here — is owed. Nothing in this runner fabricates a pass: with no
 * transcript it reports "no turns scored" and exits non-zero.
 *
 * Transcript format (JSON):
 *   { "turns": [ { "id": "...", "text": "<assistant markdown>",
 *                  "firstTurn"?: bool, "userAskedForList"?: bool,
 *                  "register"?: "chat" | "artifact" } ] }
 *   A turn without "register" is classified heuristically.
 *
 * Usage:
 *   tsx server/eval/register/run-eval.ts --transcript path/to/turns.json
 *   tsx server/eval/register/run-eval.ts --transcript turns.json --min-pass-rate 0.8
 *   tsx server/eval/register/run-eval.ts --samples      # the hand-written samples, as a smoke run
 *
 * Exit code is non-zero when the pass-rate threshold is missed or nothing was
 * scored.
 */

/* eslint-disable no-console -- CLI runner; the scorecard is its output */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  classifyRegister,
  lintArtifactRegister,
  lintChatRegister,
  summarizeRegisterLint,
  type Register,
  type RegisterLintResult,
} from './register-linter.js';

interface Turn {
  id: string;
  text: string;
  firstTurn?: boolean;
  userAskedForList?: boolean;
  register?: Register;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function loadTurns(): Turn[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  if (process.argv.includes('--samples')) {
    const raw = JSON.parse(readFileSync(path.join(here, 'samples.json'), 'utf8'));
    return raw.samples.map((s: any) => ({
      id: s.id,
      text: s.text,
      register: s.register,
      firstTurn: s.options?.firstTurn,
      userAskedForList: s.options?.userAskedForList,
    }));
  }
  const file = arg('--transcript');
  if (!file) return [];
  const raw = JSON.parse(readFileSync(path.resolve(file), 'utf8'));
  return Array.isArray(raw.turns) ? raw.turns : [];
}

function main(): number {
  const turns = loadTurns();
  const minPassRate = Number(arg('--min-pass-rate') ?? '0');
  if (turns.length === 0) {
    console.error('[register-eval] no turns scored — pass --transcript <file> or --samples. Live evaluation with a provider is owed.');
    return 1;
  }

  const chat: RegisterLintResult[] = [];
  let artifactPassed = 0;
  let artifactCount = 0;

  console.log(`[register-eval] ${turns.length} turn(s)`);
  for (const t of turns) {
    const register = t.register ?? classifyRegister(t.text);
    if (register === 'artifact') {
      artifactCount += 1;
      const r = lintArtifactRegister(t.text);
      if (r.pass) artifactPassed += 1;
      console.log(
        `  ${t.id.padEnd(48)} artifact ${r.pass ? 'PASS' : 'FAIL'} ${r.violations.map(v => v.rule).join(',')}`
      );
      continue;
    }
    const r = lintChatRegister(t.text, { firstTurn: t.firstTurn, userAskedForList: t.userAskedForList });
    chat.push(r);
    console.log(
      `  ${t.id.padEnd(48)} chat     ${r.pass ? 'PASS' : 'FAIL'} score=${r.score.toFixed(2)} ${r.violations
        .map(v => v.rule)
        .join(',')}`
    );
  }

  const s = summarizeRegisterLint(chat);
  console.log('\n[register-eval] chat register:');
  console.log(`  turns=${s.count} passed=${s.passed} passRate=${(s.passRate * 100).toFixed(1)}% meanScore=${s.meanScore}`);
  for (const [rule, n] of Object.entries(s.violationsByRule).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${rule.padEnd(20)} ${n}`);
  }
  if (artifactCount > 0) {
    console.log(`[register-eval] artifact register: turns=${artifactCount} passed=${artifactPassed}`);
  }

  if (s.count > 0 && s.passRate < minPassRate) {
    console.error(`[register-eval] pass rate ${(s.passRate * 100).toFixed(1)}% below threshold ${(minPassRate * 100).toFixed(1)}%`);
    return 1;
  }
  return 0;
}

process.exit(main());
