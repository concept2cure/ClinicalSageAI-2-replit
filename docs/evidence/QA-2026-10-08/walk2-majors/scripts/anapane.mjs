// The editor's AnA pane after a turn: is the newest answer on screen?
import { open, sleep, EMILY } from '../walk-2/h.mjs';
const PID = '8a11b987-ac2d-4748-9e9c-5dc40c082662';
const tag = process.argv[2] || 'after';
const { page, done } = await open(`anapane-${tag}`, EMILY);
await page.goto(`http://localhost:5078/concept2cure/document-authoring?program=${PID}`, { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 60 && !(await page.$('[data-testid=save-section]')); i++) await sleep(1000);
await sleep(2000);
const ask = page.getByPlaceholder(/Ask about 2\.5\.1/);
await ask.fill('Tighten this section for an FDA reviewer');
await ask.press('Enter');
await sleep(9000);
const r = await page.evaluate(() => {
  const region = document.querySelector('[aria-label="AnA conversation"]');
  const work = document.querySelector('.ed-comments .ana-work-host');
  const answers = region ? [...region.querySelectorAll('.cmt')].filter((c) => /^AnA/.test(c.textContent || '')) : [];
  const newest = answers[answers.length - 1];
  const md = newest?.querySelector('.ana-md, .cmt-body');
  const rr = region?.getBoundingClientRect();
  const ar = md?.getBoundingClientRect();
  return {
    region: rr && { top: Math.round(rr.top), bottom: Math.round(rr.bottom), height: Math.round(rr.height) },
    work: work && { height: Math.round(work.getBoundingClientRect().height) },
    answerText: (md?.textContent || '').slice(0, 80),
    answer: ar && { top: Math.round(ar.top), bottom: Math.round(ar.bottom) },
    answerVisible: !!(rr && ar && ar.bottom > rr.top && ar.top < rr.bottom), pageScrolled: document.scrollingElement.scrollTop, headerTop: Math.round(document.querySelector(".ed-doc-h").getBoundingClientRect().top),
  };
});
console.info(tag, JSON.stringify(r));
await page.screenshot({ path: `${process.env.OUT}/screens/anapane-${tag}.png` });
await done();
