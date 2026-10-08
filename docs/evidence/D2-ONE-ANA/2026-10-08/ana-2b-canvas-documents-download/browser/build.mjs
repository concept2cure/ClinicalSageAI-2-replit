// node build.mjs <out.js> [<DownloadMenu.tsx to use instead of the one in the tree>]
// The second argument is how the red run was built: the Download menu as the
// reviewers saw it, resolved against the editor directory like the real file.
import * as esbuild from '/home/user/ClinicalSageAI-2-replit/node_modules/esbuild/lib/main.js';
import path from 'node:path';
const REPO = '/home/user/ClinicalSageAI-2-replit';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const EDITOR = `${REPO}/client/src/concept2cure/v2/editor`;
const [out, swapIn] = process.argv.slice(2);
const BEFORE = swapIn ? path.resolve(swapIn) : null;
const swap = {
  name: 'swap-download-menu',
  setup(b) {
    if (!BEFORE) return;
    b.onResolve({ filter: /DownloadMenu$/ }, () => ({ path: BEFORE }));
    b.onResolve({ filter: /^\.\.?\// }, (a) => (a.importer === BEFORE ? b.resolve(a.path, { resolveDir: EDITOR, kind: a.kind }) : undefined));
  },
};
await esbuild.build({
  entryPoints: [path.join(HERE, 'harness.tsx')],
  bundle: true, outfile: out, format: 'iife', jsx: 'automatic', target: 'es2022', logLevel: 'warning',
  alias: { '@': `${REPO}/client/src` },
  nodePaths: [`${REPO}/node_modules`],
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{"MODE":"production","DEV":false,"PROD":true}' },
  loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl' },
  plugins: [swap],
});
console.info('built', out, BEFORE ? `with ${BEFORE}` : 'from the tree');
