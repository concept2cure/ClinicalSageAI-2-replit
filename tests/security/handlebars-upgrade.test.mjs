import assert from 'node:assert/strict';
import test from 'node:test';
import Handlebars from 'handlebars';

// Exercise the installed transitive dependency. These reproduce the October
// 2026 advisories without executing commands or touching external resources.
test('Handlebars rejects the blockParams AST injection bypass (GHSA-8r5x-fm3f-whwj)', () => {
  const ast = Handlebars.parse('{{#missingHelper}}{{/missingHelper}}');
  ast.body[0].program.blockParams = {
    length: '(globalThis.__c2cHandlebarsInjection = true, 0)',
  };
  delete globalThis.__c2cHandlebarsInjection;
  try {
    assert.throws(() => Handlebars.compile(ast)({}));
    assert.equal(globalThis.__c2cHandlebarsInjection, undefined);
    assert.throws(() => Handlebars.precompile(ast));
    assert.equal(globalThis.__c2cHandlebarsInjection, undefined);
  } finally {
    delete globalThis.__c2cHandlebarsInjection;
  }
});

test('Handlebars blocks Function constructor lookup through own properties (GHSA-p8wg-vrv2-v86f)', () => {
  const render = Handlebars.compile('{{lookup (lookup fn "__proto__") "constructor"}}');
  assert.equal(render({ fn: () => undefined }, { allowProtoMethodsByDefault: true }), '');
});

test('Handlebars precompiled templates cannot terminate an inline script (GHSA-xw65-4hp5-5hc7)', () => {
  const compiled = Handlebars.precompile('safe</script><script>inertMarker</script><script>');
  assert.equal(compiled.includes('</script>'), false);
});

test('Handlebars retains ordinary string rendering and HTML escaping', () => {
  const render = Handlebars.compile('Hello {{name}}: {{#each values}}{{this}} {{/each}}');
  assert.equal(render({ name: '<reviewer>', values: ['one', 'two'] }),
    'Hello &lt;reviewer&gt;: one two ');
});
