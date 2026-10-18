const ts = require('<repo>/node_modules/typescript');
const fs = require('fs');
const files = fs.readFileSync(process.argv[2],'utf8').split('\n').filter(Boolean);
let total=0, noassert=[];
for (const f of files) {
  let src; try { src = fs.readFileSync('<repo>/'+f,'utf8'); } catch { continue; }
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  const visit = (n) => {
    if (ts.isCallExpression(n)) {
      let e = n.expression; let name='';
      if (ts.isIdentifier(e)) name=e.text;
      else if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression)) name=e.expression.text+'.'+e.name.text;
      else if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && ts.isIdentifier(e.expression.expression)) name=e.expression.expression.text+'.'+e.expression.name.text+'()';
      if (/^(it|test)(\.(only|concurrent|each\(\)|skipIf\(\)|runIf\(\)))?$/.test(name) && !/skip$/.test(name)) {
        const fn = n.arguments.find(a => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
        if (fn) {
          total++;
          const body = fn.body.getText(sf);
          if (!/expect|assert|should|toThrow|rejects|\bcheck[A-Z]\w*\(|\bverify\w*\(|\bexpect\w*\(/i.test(body)) {
            noassert.push(f+':'+(sf.getLineAndCharacterOfPosition(n.getStart()).line+1)+'  '+(n.arguments[0]?n.arguments[0].getText(sf).slice(0,90):''));
          }
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
console.log('tests parsed:', total, 'with no assertion-like token in body:', noassert.length);
console.log(noassert.join('\n'));
