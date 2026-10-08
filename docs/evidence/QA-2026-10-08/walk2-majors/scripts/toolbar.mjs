// Where are the editor's header controls at a given viewport? Each one: visible, or clipped by which box.
import { open, sleep, EMILY } from '../walk-2/h.mjs';
const PID = '8a11b987-ac2d-4748-9e9c-5dc40c082662';
const [w, h] = (process.argv[2] || '1440x900').split('x').map(Number);
const tag = process.argv[3] || 'before';
const { page, done } = await open(`toolbar-${tag}-${w}`, EMILY);
await page.setViewportSize({ width: w, height: h });
await page.goto(`http://localhost:5078/concept2cure/document-authoring?program=${PID}`, { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 60 && !(await page.$('[data-testid=save-section]')); i++) await sleep(1000);
await sleep(2500);
const report = await page.evaluate(() => {
  const vw = window.innerWidth;
  const where = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return 'not rendered';
    let p = el.parentElement;
    while (p) {
      const pr = p.getBoundingClientRect();
      const cs = window.getComputedStyle(p);
      if (/(auto|hidden|scroll|clip)/.test(cs.overflowX) && (r.right > pr.right + 1 || r.left < pr.left - 1)) return `CLIPPED by .${String(p.className).split(' ')[0]} (x ${Math.round(r.left)}-${Math.round(r.right)}, box ends ${Math.round(pr.right)})`;
      p = p.parentElement;
    }
    if (r.right > vw + 1 || r.left < -1) return `OFF-SCREEN (x ${Math.round(r.left)}-${Math.round(r.right)}, viewport ${vw})`;
    return `visible (x ${Math.round(r.left)}-${Math.round(r.right)}, y ${Math.round(r.top)})`;
  };
  const head = document.querySelector('.ed-doc-h');
  const out = [];
  if (!head) return ['no .ed-doc-h'];
  for (const el of head.querySelectorAll('button, input, select, [role=button]')) {
    const label = (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    out.push(`${label || '(unlabelled ' + el.tagName + ')'} :: ${where(el)}`);
  }
  const hr = head.getBoundingClientRect();
  out.push(`HEADER height ${Math.round(hr.height)} width ${Math.round(hr.width)}; doc scrollWidth ${document.documentElement.scrollWidth} vs viewport ${vw}`);
  return out;
});
console.info(`${tag} ${w}x${h}\n` + report.join('\n'));
await page.screenshot({ path: `${process.env.OUT}/screens/toolbar-${tag}-${w}.png` });
await done();
