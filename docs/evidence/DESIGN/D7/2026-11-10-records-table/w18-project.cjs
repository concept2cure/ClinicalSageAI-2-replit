// Walk 18 (setup): a project for the walk's organisation, through the intake's own two calls, so a CAPA can be raised.
const { run, signIn, api, log } = require('./lib.cjs');
run('w18-project', async (browser) => {
  for (const who of ['approver', 'author']) {
    const { ctx, page } = await signIn(browser, who, 1440);
    const clients = await api(page, 'GET', '/api/clients?purpose=project-intake');
    const list = (clients.body && clients.body.clients) || [];
    log.steps.push({ name: `${who}-clients`, status: clients.status, count: list.length, first: list[0] ? { id: list[0].id, name: list[0].name } : null,
      error: clients.body && (clients.body.error || clients.body.message) });
    if (list.length) {
      const made = await api(page, 'POST', '/api/c2c/projects', { name: 'Walk C11 gasket programme', programType: 'ind', productType: 'drug', primaryAgency: 'FDA', clientWorkspaceId: Number(list[0].id) });
      log.steps.push({ name: `${who}-create`, status: made.status, body: JSON.stringify(made.body).slice(0, 300) });
      if (made.status < 300) { await ctx.close(); break; }
    }
    await ctx.close();
  }
});
