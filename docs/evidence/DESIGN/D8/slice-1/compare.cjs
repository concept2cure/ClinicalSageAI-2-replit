// Compare the before and after walks of the twelve device screens: failed requests, console errors, overflow, text.
const fs = require('fs'); const path = require('path');
const root = process.argv[2]; const out = [];
for (const v of ['1440-light', '1440-dark', '390-light', '390-dark']) {
  const b = JSON.parse(fs.readFileSync(path.join(root, `before-${v}`, 'facts.json'), 'utf8'));
  const a = JSON.parse(fs.readFileSync(path.join(root, `after-${v}`, 'facts.json'), 'utf8'));
  for (const before of b) {
    const after = a.find((x) => x.name === before.name) || {};
    const bf = before.facts || {}; const af = after.facts || {};
    out.push({ variant: v, screen: before.name,
      failedBefore: before.failed || [], failedAfter: after.failed || [],
      consoleBefore: (before.consoleErrors || []).length, consoleAfter: (after.consoleErrors || []).length,
      hScrollBefore: bf.hScroll ?? null, hScrollAfter: af.hScroll ?? null,
      textLengthBefore: bf.textLength ?? null, textLengthAfter: af.textLength ?? null,
      buttonsBefore: (bf.buttons || []).length, buttonsAfter: (af.buttons || []).length,
      headingsSame: JSON.stringify([bf.h1, bf.h2, bf.h3]) === JSON.stringify([af.h1, af.h2, af.h3]),
      error: after.error || before.error || null });
  }
}
fs.writeFileSync(path.join(root, 'facts-summary.json'), JSON.stringify(out, null, 1));
const bad = out.filter((r) => r.error || JSON.stringify(r.failedBefore) !== JSON.stringify(r.failedAfter) || r.consoleAfter > r.consoleBefore || (r.hScrollAfter ?? 0) > (r.hScrollBefore ?? 0) || !r.headingsSame || r.buttonsBefore !== r.buttonsAfter);
console.info(`${out.length} comparisons; ${bad.length} differ in failed requests, console errors, overflow, headings or controls`);
for (const r of bad) console.info(JSON.stringify(r).slice(0, 400));
const text = out.filter((r) => r.textLengthBefore !== r.textLengthAfter);
console.info(`text length differs on ${text.length}: ${text.slice(0, 8).map((r) => `${r.variant} ${r.screen} ${r.textLengthBefore}->${r.textLengthAfter}`).join('; ')}`);
