const fs = require('fs');
const acorn = require('acorn');
const jsx = require('acorn-jsx');

const code = fs.readFileSync('client/src/components/ectd/EnhancedDocumentEditor.jsx', 'utf8');
try {
  acorn.Parser.extend(jsx()).parse(code, { ecmaVersion: 2020, sourceType: 'module' });
  console.log('Valid Syntax');
} catch (e) {
  console.log('Syntax Error:', e.message);
  console.log('Location:', e.pos, e.loc);
}
