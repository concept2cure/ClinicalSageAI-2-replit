// node check.mjs <bundle.js> <authoring-v2.css to load, or "current"> <out-dir>
// Opens the Download menu in each place it is mounted, at 1440 and 390 wide,
// and asks the browser what is at the centre of every menu item. An item the
// toolbar or the list has cut off is not hit-testable.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [bundle, cssWhich, outDir] = process.argv.slice(2);
const STY = '/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/styles';
const authoringCss = cssWhich && cssWhich !== 'current' ? path.resolve(cssWhich) : `${STY}/authoring-v2.css`;
fs.mkdirSync(outDir, { recursive: true });
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="file:///home/user/ClinicalSageAI-2-replit/design-system/colors_and_type.css"><link rel="stylesheet" href="file://${STY}/app-v2.css"><link rel="stylesheet" href="file://${authoringCss}">
<style>html,body{margin:0;height:100%}#root{height:100%}</style></head>
<body><div class="c2c-v2" style="height:100vh;display:flex;flex-direction:column"><div id="root" style="flex:1;min-height:0;display:flex;flex-direction:column"></div></div>
<script src="file://${path.resolve(bundle)}"></script></body></html>`;
const page_ = path.resolve(outDir, 'page.html');
fs.writeFileSync(page_, html);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' }).catch(() => chromium.launch());
const results = [];
for (const mode of ['authoring', 'canvas', 'list']) {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, acceptDownloads: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`file://${page_}#${mode}`);
    await page.waitForTimeout(400);
    const btnSel = mode === 'list' ? '.cdl-row:first-child .dlm > button' : '.ed-doc-actions .dlm > button';
    const btn = page.locator(btnSel).first();
    await btn.scrollIntoViewIfNeeded();
    const bb = await btn.boundingBox();
    await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.waitForTimeout(250);
    const r = await page.evaluate(({ btnSel }) => {
      const out = { items: [] };
      const menu = document.querySelector('[role="menu"]');
      out.menuOpen = !!menu;
      if (!menu) return out;
      const cs = window.getComputedStyle(menu);
      out.menuPosition = cs.position;
      out.menuBackground = cs.backgroundColor;
      out.topLayer = (() => { try { return menu.matches(':popover-open'); } catch { return false; } })();
      const bar = document.querySelector(btnSel).closest('.ed-doc-actions, .cdl');
      out.scrollerScrollTop = bar ? bar.scrollTop : null;
      out.focused = document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName;
      for (const it of menu.querySelectorAll('[role="menuitem"]')) {
        const b = it.getBoundingClientRect();
        const x = b.left + b.width / 2, y = b.top + b.height / 2;
        const hit = document.elementFromPoint(x, y);
        out.items.push({ label: it.getAttribute('aria-label'), x: Math.round(x), y: Math.round(y), hit: !!hit && (hit === it || it.contains(hit)), at: hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).split(' ')[0]}` : null,
          onScreen: b.top >= 0 && b.bottom <= window.innerHeight && b.left >= 0 && b.right <= window.innerWidth });
      }
      return out;
    }, { btnSel });
    await page.screenshot({ path: path.join(outDir, `${mode}-${w}.png`) });
    // The list scrolls inside itself: with the menu open, scroll it and see the menu move with its button.
    let follows = null;
    if (mode === 'list' && r.menuOpen) {
      follows = await page.evaluate(async ({ btnSel }) => {
        const btn = document.querySelector(btnSel);
        const menu = document.querySelector('[role="menu"]');
        const gap = () => { const b = btn.getBoundingClientRect(); const m = menu.getBoundingClientRect(); return Math.round(m.bottom <= b.top ? b.top - m.bottom : m.top - b.bottom); };
        const before = { gap: gap(), btnTop: Math.round(btn.getBoundingClientRect().top) };
        document.querySelector('.cdl').scrollTop += 40;
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        const after = { gap: gap(), btnTop: Math.round(btn.getBoundingClientRect().top) };
        document.querySelector('.cdl').scrollTop -= 40;
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        return { before, after, stillOpen: !!document.querySelector('[role="menu"]') };
      }, { btnSel });
    }
    // Choose "Working copy (PDF)" with the mouse, where the person would.
    let download = null;
    const pdf = r.items.find((i) => i.label === 'Working copy (PDF)');
    if (pdf && pdf.hit) {
      const [dl] = await Promise.all([
        page.waitForEvent('download', { timeout: 4000 }).catch(() => null),
        page.mouse.click(pdf.x, pdf.y),
      ]);
      if (dl) download = { name: dl.suggestedFilename(), bytes: fs.statSync(await dl.path()).size };
      await page.waitForTimeout(200);
    }
    const toasts = await page.evaluate(() => window.__toasts);
    const hits = r.items.filter((i) => i.hit).length;
    results.push({ mode, width: w, menuOpen: r.menuOpen, position: r.menuPosition, menuBackground: r.menuBackground, topLayer: r.topLayer, scrollerScrollTop: r.scrollerScrollTop,
      focusedOnOpen: r.focused, follows, itemsHitTestable: `${hits} of ${r.items.length}`, items: r.items, download, toasts, errors });
    await ctx.close();
  }
}
await browser.close();
const lines = results.map((x) => `${x.mode.padEnd(9)} ${String(x.width).padStart(4)}px  menu open: ${x.menuOpen}  position: ${x.position}  background: ${x.menuBackground}  top layer: ${x.topLayer}  items hit-testable: ${x.itemsHitTestable}  scroller scrollTop after open: ${x.scrollerScrollTop}  focus: ${x.focusedOnOpen}  download: ${x.download ? `${x.download.name} (${x.download.bytes} bytes)` : 'none'}${x.follows ? `  list scrolled 40px: button top ${x.follows.before.btnTop}->${x.follows.after.btnTop}, menu-to-button gap ${x.follows.before.gap}->${x.follows.after.gap}px` : ''}  ${x.errors.length ? 'ERRORS ' + x.errors.join('; ') : ''}`);
fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
console.info(lines.join('\n'));
for (const x of results) for (const i of x.items) if (!i.hit) console.info(`  not hit-testable: ${x.mode} ${x.width}px "${i.label}" at (${i.x},${i.y}) -> ${i.at}`);
for (const x of results) for (const t of x.toasts) console.info(`  toast ${x.mode} ${x.width}px [${t.tone}] ${t.m}`);
