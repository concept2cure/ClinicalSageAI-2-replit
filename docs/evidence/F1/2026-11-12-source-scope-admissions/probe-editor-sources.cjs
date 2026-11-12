// Probe: what does GET /projects/:id/sources answer when the one editor opens on a controlled document just created?
const { run, signIn, log, api, BASE } = require('./lib.cjs');
const PROGRAM = process.env.WALK_PROGRAM || '5d669ca3-055f-48b1-9c34-364eb33ecb95';
run('probe-editor-sources', async (browser) => {
  const { page, ctx } = await signIn(browser, 'author', 1440);
  await page.goto(`${BASE}/concept2cure/quality?program=${PROGRAM}`, { waitUntil: 'networkidle' });
  // Three reads in a row with nothing else going on, then two at once.
  const t = async () => { const a = Date.now(); const r = await api(page, 'GET', `/api/c2c/projects/${PROGRAM}/sources?limit=200&offset=0`); return { status: r.status, ms: Date.now() - a, code: r.body?.code ?? null, n: r.body?.sources?.length ?? null }; };
  const alone = [await t(), await t()];
  const together = await Promise.all([t(), t(), t()]);
  log.steps.push({ name: 'reads', alone, together });
  await ctx.close();
});
