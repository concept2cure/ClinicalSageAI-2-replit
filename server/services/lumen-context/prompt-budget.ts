/**
 * Preserve required prompt blocks; the existing 12k allowance bounds only
 * optional dynamic context. The gateway admits the complete request against
 * the selected model's context window. No prompt block is sliced or reordered.
 */
export function assemblePromptBlocks(parts: readonly string[], required: ReadonlySet<number>): string {
  const OPTIONAL_CONTEXT_CHARS = 12_000;
  const kept: string[] = [];
  let optionalChars = 0;
  let omittedBlocks = 0;
  for (const [index, block] of parts.entries()) {
    if (required.has(index)) {
      kept.push(block);
    } else if (optionalChars + block.length + 1 <= OPTIONAL_CONTEXT_CHARS) {
      kept.push(block);
      optionalChars += block.length + 1;
    } else {
      omittedBlocks++;
    }
  }
  if (omittedBlocks > 0) {
    kept.splice(1, 0, `
## Optional Context Omitted
${omittedBlocks} optional context block(s) were omitted to fit this turn's optional-context allowance.
Do not infer that omitted information is empty or absent, or that it grants permission. Use the retained recorded project and guidance; obtain missing details before relying on them.`);
  }
  return kept.join('\n');
}
