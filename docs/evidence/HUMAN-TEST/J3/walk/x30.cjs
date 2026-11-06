const { c, openDoc, prog } = require('./lib.cjs');
(async () => {
  const b = await c.chromium.launch();
  const p = await c.signIn(b, 'author');
  await openDoc(p, 'SOP-J3 Electronic Signatures (J3 walk)', /Purpose/);
  await c.shot(p, 'j3-f7-sop-bar-after.png');
  console.log('outline note present:', await p.getByText(/stored in an order that differs/).count());
  console.log('mast:', await p.locator('.ed-mast-num').innerText(), '| tree nums:', await p.locator('.ed-tree-row .ed-num').allInnerTexts());
  await b.close();
})();
