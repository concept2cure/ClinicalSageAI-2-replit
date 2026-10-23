import { describe, expect, it } from 'vitest';
import { chunkExtractedText } from '../document-chunking.service';

type Case = { name: string; text: string; maxChars: number; overlapChars: number };
const PAIRS = ['𠮷', '🧬', '𝛼', '𠀀'];
const SIZES = [499, 501, 700, 4000];
const SEPARATORS = ['\n\n', '. ', '.\n', ' '];

/** Whole tokens only: the corpus must not manufacture malformed originals. */
function seededText(seed: number, target: number): string {
  const tokens = ['a', 'bc', ' ', '\n\n', '. ', '.\n', '𠮷', '🧬', '𝛼', '𠀀', 'e\u0301', '\r\n', '\uFEFF'];
  let state = seed;
  let text = '';
  while (text.length < target) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    text += tokens[(state >>> 0) % tokens.length];
  }
  return text;
}

function corpus(): Case[] {
  const cases: Case[] = [];
  for (const maxChars of SIZES) {
    const bound = Math.max(500, maxChars);
    const half = Math.floor(bound / 2);
    const overlaps = [-1, 0, 1, 2, half - 1, half, bound];
    for (const overlapChars of overlaps) {
      const overlap = Math.min(Math.max(0, overlapChars), half);
      for (const pair of PAIRS) {
        const name = `${maxChars}/${overlapChars}/${pair}`;
        const texts = [
          'a'.repeat(bound - 1) + pair + 'z'.repeat(bound + 43),
          'a'.repeat(bound - overlap - 1) + pair + 'z'.repeat(bound + 45),
          pair + 'a'.repeat(half - 2) + ' ' + 'z'.repeat(bound + 20),
          'a' + pair.repeat(bound + 17),
          ...SEPARATORS.map(separator =>
            'a'.repeat(half - 2) + pair + separator + pair + 'z'.repeat(bound + 31)),
        ];
        texts.forEach((text, pattern) => cases.push({ name: `${name}/${pattern}`, text, maxChars, overlapChars }));
      }
      for (let seed = 1; seed <= 64; seed++) {
        cases.push({ name: `${maxChars}/${overlapChars}/seed${seed}`,
          text: seededText(seed, bound + 503), maxChars, overlapChars });
      }
    }
  }
  return cases;
}

/** Independent code-unit oracle, rather than the chunker's cut mechanism. */
function splitsPair(text: string, offset: number): boolean {
  const before = text.charCodeAt(offset - 1);
  const after = text.charCodeAt(offset);
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
}

describe('canonical chunker Unicode property corpus', () => {
  it('preserves exact UTF-16 coverage and UTF-8 text across 2,688 deterministic cases', () => {
    const cases = corpus();
    const violations: Record<string, number> = {};
    const examples: string[] = [];
    let totalChunks = 0;
    function check(condition: boolean, invariant: string, name: string): void {
      if (condition) return;
      violations[invariant] = (violations[invariant] ?? 0) + 1;
      if (examples.length < 8) examples.push(`${name}: ${invariant}`);
    }
    for (const entry of cases) {
      const { name, text, maxChars, overlapChars } = entry;
      const bound = Math.max(500, maxChars);
      const overlap = Math.min(Math.max(0, overlapChars), Math.floor(bound / 2));
      check(Buffer.from(text, 'utf8').toString('utf8') === text, 'well-formed original', name);
      const options = { maxChars, overlapChars };
      const chunks = chunkExtractedText(text, options);
      totalChunks += chunks.length;
      check(chunks.length > 0, 'nonempty result', name);
      check(chunks[0]?.charStart === 0, 'source start', name);
      check(chunks.at(-1)?.charEnd === text.length, 'source tail', name);
      check(JSON.stringify(chunks) === JSON.stringify(chunkExtractedText(text, options)), 'deterministic', name);
      chunks.forEach((chunk, index) => {
        const location = `${name}/chunk${index}`;
        check(chunk.index === index, 'sequential index', location);
        check(Number.isSafeInteger(chunk.charStart) && Number.isSafeInteger(chunk.charEnd), 'integer coordinates', location);
        check(chunk.charStart >= 0 && chunk.charEnd <= text.length && chunk.charStart < chunk.charEnd, 'span bounds', location);
        check(chunk.text === text.slice(chunk.charStart, chunk.charEnd), 'exact source slice', location);
        check(chunk.text.length <= bound, 'size cap', location);
        check(!splitsPair(text, chunk.charStart) && !splitsPair(text, chunk.charEnd), 'intact boundaries', location);
        check(Buffer.from(chunk.text, 'utf8').toString('utf8') === chunk.text, 'UTF-8 round trip', location);
        const previous = chunks[index - 1];
        if (!previous) return;
        check(chunk.charStart > previous.charStart && chunk.charEnd > previous.charEnd, 'strict forward progress', location);
        check(chunk.charStart <= previous.charEnd, 'no coverage gap', location);
        check(previous.charEnd - chunk.charStart <= overlap, 'overlap cap', location);
      });
    }
    console.info('Unicode chunk property census', JSON.stringify({ cases: cases.length, totalChunks, violations, examples }));
    expect(cases).toHaveLength(2688);
    expect({ violations, examples }).toEqual({ violations: {}, examples: [] });
  });
});
