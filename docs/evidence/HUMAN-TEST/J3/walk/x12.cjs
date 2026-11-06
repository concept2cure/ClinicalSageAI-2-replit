const { c, openDoc } = require('./lib.cjs');
(async () => {
  const b = await c.chromium.launch();
  const p = await c.signIn(b, 'author');
  await openDoc(p, "C2C-101 Investigator's Brochure (J3 walk)", /Introduction/);
  await p.getByText('Draft with AnA', { exact: true }).first().click(); await p.waitForTimeout(2500);
  const reply = p.getByRole('textbox', { name: 'Reply to AnA' });
  console.info('prefill:', await reply.inputValue().catch(() => reply.innerText()));
  await p.getByRole('button', { name: /^Send/ }).first().click().catch(async () => { await reply.press('Enter'); });
  await p.waitForTimeout(12000);
  await c.shot(p, 'x-21-ana-no-key.png');
  const convo = await p.locator('main').first().innerText();
  console.info(convo.slice(0, 2500));
  console.info(c.apiErrors);
  await b.close();
})();
