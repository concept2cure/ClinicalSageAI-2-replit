/** Keep receipts readable and bounded without dropping parsed evidence fields. */
export function evidenceJson(value) {
  const normalized = JSON.parse(JSON.stringify(value));
  function render(input, depth) {
    const compact = JSON.stringify(input);
    if (input === null || typeof input !== 'object' || compact.length <= 200) return compact;
    const indent = ' '.repeat(depth), next = `${indent} `;
    if (Array.isArray(input)) return `[\n${input.map(item => next + render(item, depth + 1)).join(',\n')}\n${indent}]`;
    return `{\n${Object.entries(input).map(([key, item]) => `${next}${JSON.stringify(key)}: ${render(item, depth + 1)}`).join(',\n')}\n${indent}}`;
  }
  return render(normalized, 0) + '\n';
}
