// node mkpage.mjs <name> <sandbox|NONE> <pdf|html> <blobType>
import fs from 'node:fs';
const [name, sandbox, content, blobType] = process.argv.slice(2);
const pdf = fs.readFileSync(new URL('./pdf.b64', import.meta.url), 'utf8').trim();
const html = `<!doctype html><html><body style="background:#fff"><h1 id=h>HTML DOCUMENT LOADED</h1><script>
document.body.style.background='red'; document.getElementById('h').textContent='SCRIPT RAN IN FRAME';
try { parent.document.body.setAttribute('data-pwned','parent-reached'); parent.document.getElementById('status').textContent='PARENT REACHED FROM FRAME'; }
catch (e) { document.getElementById('h').textContent='SCRIPT RAN, PARENT BLOCKED: '+e.name; }
</script></body></html>`;
const page = `<!doctype html><html><head><title>${name}</title></head><body style="margin:0;font:14px sans-serif">
<div id=status>status: frame script did not reach parent</div><div>variant: ${name} sandbox=${sandbox} content=${content} type=${blobType}</div>
<script>
const b64 = ${JSON.stringify(pdf)};
const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
const htmlBytes = new TextEncoder().encode(${JSON.stringify(html).replace(/<\//g, "<\\/")});
const body = ${JSON.stringify(content)} === 'pdf' ? bytes : htmlBytes;
const blob = new Blob([body], { type: ${JSON.stringify(blobType)} });
const url = URL.createObjectURL(blob);
const f = document.createElement('iframe');
${sandbox === 'NONE' ? '' : `f.setAttribute('sandbox', ${JSON.stringify(sandbox === 'EMPTY' ? '' : sandbox)});`}
f.src = url; f.style.width = '560px'; f.style.height = '300px'; f.style.border = '2px solid blue';
f.onload = () => { document.body.setAttribute('data-frame-loaded', '1'); };
document.body.appendChild(f);
</script></body></html>`;
fs.writeFileSync(new URL(`./${name}.html`, import.meta.url), page);
