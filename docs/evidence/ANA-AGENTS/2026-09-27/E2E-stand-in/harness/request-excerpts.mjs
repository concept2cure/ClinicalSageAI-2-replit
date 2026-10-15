// Excerpts of what the SERVER sent the (stand-in) model, from the saved request
// bodies: the request's settings, and every message after the person's ask,
// each trimmed. The full bodies (system prompt and 50 tool definitions each)
// are not filed: they are ~100 KB apiece and say nothing more about S1/S2/S4.
//   node request-excerpts.mjs <reqDir> <outFile> <n>[:label] ...
import fs from 'node:fs';
import path from 'node:path';

const [reqDir, outFile, ...wanted] = process.argv.slice(2);
const textOf = c => (typeof c === 'string' ? c : Array.isArray(c) ? c.map(b => (b.type === 'text' ? b.text : `[${b.type}]`)).join('\n') : '');
const trim = (s, n = 900) => (s.length > n ? `${s.slice(0, n)} …[${s.length - n} more chars]` : s);

function askIndex(msgs) {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const t = textOf(msgs[i].content);
    if (msgs[i].role === 'user' && !/\[Tool Result for /.test(t)) return i;
  }
  return 0;
}

const out = [];
for (const w of wanted) {
  const [n, label] = w.split(':');
  const { body, verdict } = JSON.parse(fs.readFileSync(path.join(reqDir, `${String(n).padStart(4, '0')}.json`), 'utf8'));
  const msgs = body.messages;
  const sys = typeof body.system === 'string' ? body.system : (body.system || []).map(b => b.text || '').join('\n');
  const noteRe = /Your previous turn [^\n]*/;
  const ai = askIndex(msgs);
  out.push({
    request: Number(n),
    label: label || null,
    refusedByContract: verdict,
    model: body.model,
    max_tokens: body.max_tokens,
    output_config: body.output_config ?? null,
    thinking: body.thinking ?? null,
    tool_choice: body.tool_choice ?? null,
    tools: (body.tools || []).length,
    messages: msgs.length,
    stoppedTurnNoteIn: noteRe.test(sys) ? 'system prompt' : msgs.findIndex(m => noteRe.test(textOf(m.content))) >= 0 ? `messages[${msgs.findIndex(m => noteRe.test(textOf(m.content)))}]` : null,
    stoppedTurnNote: (noteRe.exec(sys) || noteRe.exec(msgs.map(m => textOf(m.content)).join('\n')) || [null])[0],
    fromTheAsk: msgs.slice(ai).map((m, k) => ({ index: ai + k, role: m.role, content: trim(textOf(m.content)) })),
  });
}
fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
console.info(`${outFile}: ${out.length} request(s)`);
