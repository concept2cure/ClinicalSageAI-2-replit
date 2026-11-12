/**
 * Where two captures differ: the bounding box of the differing pixels and how many there are.
 *   node png-diff.cjs <before.png> <after.png> [<before.png> <after.png> ...]
 */
const { chromium } = require('playwright');
const fs = require('fs');
const diff = async ([a, b]) => {
  const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  if (ia.width !== ib.width || ia.height !== ib.height) return { sizes: [[ia.width, ia.height], [ib.width, ib.height]] };
  const px = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, img.width, img.height).data; };
  const da = px(ia); const db = px(ib);
  let n = 0; let x0 = 1e9; let y0 = 1e9; let x1 = -1; let y1 = -1;
  for (let i = 0; i < da.length; i += 4) {
    if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2]) {
      n++; const p = i / 4; const x = p % ia.width; const y = Math.floor(p / ia.width);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return n ? { differingPixels: n, box: { left: x0, top: y0, right: x1, bottom: y1 } } : { differingPixels: 0 };
};
(async () => {
  const args = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (let i = 0; i < args.length; i += 2) {
    const url = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
    const r = await page.evaluate(diff, [url(args[i]), url(args[i + 1])]);
    console.info(`${args[i + 1].split('/').slice(-2).join('/')}: ${JSON.stringify(r)}`);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
