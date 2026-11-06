const { c, openDoc } = require('./lib.cjs');
const prog = '1078548e-39d6-4132-84d7-3cbeb64890d0';
(async () => {
  const b = await c.chromium.launch();
  const p = await c.signIn(b, 'author');
  await openDoc(p, 'NeuroPanel-Dx 510(k) Summary (J3 walk)', /Device Description/, prog);
  await p.getByRole('button', { name: 'More document actions' }).click(); await p.waitForTimeout(500);
  await p.getByRole('menuitem', { name: /Project files/ }).click(); await p.waitForTimeout(2500);
  await c.shot(p, 'j3-f12-510k-files-rail-after.png');
  console.info('IND documents offered:', await p.getByText('IND documents', { exact: true }).count());
  await openDoc(p, "C2C-101 Investigator's Brochure (J3 walk)", /Summary/);
  await p.getByRole('button', { name: 'More document actions' }).click(); await p.waitForTimeout(500);
  await p.getByRole('menuitem', { name: /Project files/ }).click(); await p.waitForTimeout(2500);
  console.info('IND project offers it:', await p.getByText('IND documents', { exact: true }).count());
  await b.close();
})();
