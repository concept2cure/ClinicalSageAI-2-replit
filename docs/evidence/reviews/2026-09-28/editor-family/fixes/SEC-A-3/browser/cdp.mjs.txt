// node cdp.mjs <page.html> : load the page in headless Chromium over a CDP PIPE (no port, no server),
// wait, then report every target and, for the PDF viewer extension frame, whether it loaded the document.
import { spawn } from 'node:child_process';
import path from 'node:path';
const page = path.resolve(process.argv[2]);
const CH = '<chromium>';
const prof = `${page}.cdp-profile`;
const ch = spawn(CH, ['--headless', '--no-sandbox', '--disable-gpu', '--no-first-run', '--remote-debugging-pipe',
  `--user-data-dir=${prof}`, '--window-size=900,700', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
const out = ch.stdio[3], inp = ch.stdio[4];
let id = 0; const pending = new Map(); let buf = '';
inp.on('data', d => { buf += d.toString(); let i; while ((i = buf.indexOf('\0')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } });
const send = (method, params = {}, sessionId) => new Promise(r => { const m = { id: ++id, method, params }; if (sessionId) m.sessionId = sessionId; pending.set(m.id, r); out.write(JSON.stringify(m) + '\0'); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
try {
  const { result: { targetInfos } } = await send('Target.getTargets');
  const tab = targetInfos.find(t => t.type === 'page');
  const { result: { sessionId } } = await send('Target.attachToTarget', { targetId: tab.targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Page.navigate', { url: 'file://' + page }, sessionId);
  await sleep(6000);
  const all = (await send('Target.getTargets')).result.targetInfos;
  for (const t of all) console.log(`target type=${t.type} url=${t.url.slice(0, 90)}`);
  const pdfTargets = all.filter(t => t.url.startsWith('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai'));
  for (const t of pdfTargets) {
    const s = (await send('Target.attachToTarget', { targetId: t.targetId, flatten: true })).result.sessionId;
    const ev = await send('Runtime.evaluate', { expression: `(() => { const v = document.querySelector('pdf-viewer'); const sr = v && v.shadowRoot; const err = sr && sr.querySelector('viewer-error-dialog'); const tb = sr && sr.querySelector('viewer-toolbar'); const pages = tb && tb.shadowRoot && tb.shadowRoot.querySelector('viewer-page-selector'); return JSON.stringify({ title: document.title, hasViewer: !!v, errorDialogShown: !!(err && (err.open || err.hasAttribute('open') || (err.shadowRoot && err.shadowRoot.querySelector('dialog[open]')))), pageCount: pages ? pages.docLength : null, docLength: v ? v.docLength_ ?? null : null }); })()`, returnByValue: true }, s);
    console.log('pdf-viewer frame:', ev.result?.result?.value ?? JSON.stringify(ev));
  }
  // Frame tree of the page itself: does any frame show Chrome's blocked-plugin page?
  const tree = (await send('Page.getFrameTree', {}, sessionId)).result.frameTree;
  const walk = (n, d = 0) => { console.log(`${'  '.repeat(d)}frame url=${n.frame.url.slice(0, 80)} mime=${n.frame.mimeType ?? ''} sandboxFlags? crossOriginIsolated=${n.frame.crossOriginIsolatedContextType}`); (n.childFrames || []).forEach(c => walk(c, d + 1)); };
  walk(tree);
} finally { ch.kill('SIGKILL'); }
