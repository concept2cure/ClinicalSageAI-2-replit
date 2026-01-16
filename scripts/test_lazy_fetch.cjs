const fs = require('fs');
const path = require('path');
const axios = require('axios');
const appFile = path.join(__dirname, '..', 'client', 'src', 'App.jsx');
const code = fs.readFileSync(appFile, 'utf8');
const lazyRe = /lazy\(\s*\(\s*\)\s*=>\s*import\(\s*['"](.+?)['"]\s*\)\s*\)/g;
let m;
const imports = [];
while ((m = lazyRe.exec(code))) {
  imports.push(m[1]);
}
console.log('Found lazy imports:', imports.length);
(async () => {
  for (const imp of imports) {
    // normalize path
    let p = imp;
    if (p.startsWith('./')) p = p.slice(2);
    // try .jsx and .tsx
    const candidates = [p + '.jsx', p + '.tsx', p + '.js', p + '/index.jsx'];
    let success = false;
    for (const c of candidates) {
      const url = 'http://localhost:5000/src/' + c;
      try {
        const res = await axios.get(url, { timeout: 5000 });
        console.log('OK:', url, 'size=', res.data.length);
        success = true;
        break;
      } catch (err) {
        //console.error('ERR:', url, err.message);
      }
    }
    if (!success) console.log('FAILED:', imp);
  }
})();