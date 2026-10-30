/**
 * The clinical phases a phase written as text names, in the order written.
 *
 * Studies record their phase as text: "Phase 1", "I", "1/2", "Phase IIb",
 * "phase_3", "2/3". One reading for every consumer, so the CMC program stage
 * (cmc/program-stage.ts) and the Module 2 summaries (m2-summary-builders.ts)
 * cannot disagree about what a study is. Pure.
 */
export type ClinicalPhaseNumber = 1 | 2 | 3;

/** "Phase 2/3" → [2, 3]; "IIIb" → [3]; "Phase 4" or "" → []. */
export function phaseNumbers(text: unknown): ClinicalPhaseNumber[] {
  const t = String(text ?? '').toLowerCase().replace(/phase|_|-/g, ' ');
  const found: ClinicalPhaseNumber[] = [];
  for (const m of t.matchAll(/\b(iii|ii|i|[123])(?:[ab])?\b/g)) {
    const v = m[1];
    found.push(v === 'iii' || v === '3' ? 3 : v === 'ii' || v === '2' ? 2 : 1);
  }
  return found;
}

/** The highest phase named, or null when it names none of 1–3. */
export function phaseNumber(text: unknown): ClinicalPhaseNumber | null {
  const found = phaseNumbers(text);
  return found.length ? (Math.max(...found) as ClinicalPhaseNumber) : null;
}

/** "3" → "Phase 3"; "Phase 2/3" stays as written. For display beside a study. */
export function phaseLabel(text: string): string {
  return /^\s*phase\b/i.test(text) ? text.trim() : `Phase ${text.trim()}`;
}
