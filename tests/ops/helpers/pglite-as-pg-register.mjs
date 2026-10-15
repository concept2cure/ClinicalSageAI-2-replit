/**
 * `node --import tests/ops/helpers/pglite-as-pg-register.mjs <script>` runs the
 * script with its `import pg from 'pg'` resolved to pglite-as-pg.mjs.
 */
import { register } from 'node:module';

const shim = new URL('./pglite-as-pg.mjs', import.meta.url).href;
register(
  'data:text/javascript,' +
    encodeURIComponent(
      `export async function resolve(s, c, next) { return s === 'pg' ? { url: ${JSON.stringify(shim)}, shortCircuit: true } : next(s, c); }`,
    ),
);
