// Extract a subagent's final report from its JSONL transcript into a markdown file.
// Prefers the SubagentHandback tool input; otherwise the longest assistant text block.
// Usage: node extract-report.mjs <transcript.jsonl> <out.md>   (prints a one-line summary only)
import fs from 'node:fs';
const [, , src, out] = process.argv;
const lines = fs.readFileSync(src, 'utf8').split('\n').filter(Boolean);
let handback = null, longest = '';
for (const line of lines) {
  let ev; try { ev = JSON.parse(line); } catch { continue; }
  const msg = ev.message ?? ev;
  if (!Array.isArray(msg.content)) continue;
  for (const b of msg.content) {
    if (b.type === 'tool_use' && /handback/i.test(b.name || '')) {
      const inp = b.input || {};
      handback = typeof inp === 'string' ? inp : (inp.report ?? inp.message ?? inp.text ?? inp.content ?? JSON.stringify(inp));
    }
    if ((msg.role === 'assistant' || ev.type === 'assistant') && b.type === 'text' && (b.text || '').length > longest.length) longest = b.text;
  }
}
const report = handback || longest;
if (!report) { console.log(`NO_TEXT ${src}`); process.exit(1); }
fs.writeFileSync(out, report);
console.log(`${out} ${Buffer.byteLength(report)}B handback=${!!handback} ${(report.match(/^#+ .*$/m) || [''])[0]}`);
