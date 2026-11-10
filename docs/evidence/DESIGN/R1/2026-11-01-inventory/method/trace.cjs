// Preload: records every Express router, where it was created, its routes and its mounts.
const path = require('path');
const fs = require('fs');
const expressPath = require.resolve('express', { paths: [process.cwd()] });
const express = require(expressPath);
const RouterMod = require(require.resolve('router', { paths: [path.dirname(expressPath)] }));
const OUT = process.env.R1_OUT;
const routers = new Map(); // fn -> {file}
const edges = []; // {parent, path, child}
function callerFile() {
  const lines = (new Error().stack || '').split('\n').slice(2);
  for (const l of lines) {
    const m = l.match(/\(?((?:file:\/\/)?\/[^():]+\.(?:ts|js|mjs|cjs|tsx)):\d+:\d+\)?$/);
    if (!m) continue;
    const f = m[1].replace('file://', '');
    if (f.includes('node_modules') || f.includes('/r1/trace')) continue;
    return path.relative(process.cwd(), f);
  }
  return '?';
}
const origRouter = express.Router;
function TracedRouter(...a) {
  const r = origRouter.apply(this, a);
  routers.set(r, { file: callerFile() });
  return r;
}
Object.assign(TracedRouter, origRouter);
TracedRouter.prototype = origRouter.prototype;
express.Router = TracedRouter;
const proto = RouterMod.prototype;
const origUse = proto.use;
proto.use = function (...args) {
  let p = '/';
  let fns = args;
  if (typeof args[0] === 'string' || args[0] instanceof RegExp || Array.isArray(args[0])) { p = args[0]; fns = args.slice(1); }
  for (const fn of fns.flat(Infinity)) {
    if (typeof fn === 'function' && fn.stack && Array.isArray(fn.stack)) edges.push({ parent: this, path: String(p), child: fn, at: callerFile() });
  }
  return origUse.apply(this, args);
};
function dump() {
  const ids = new Map();
  const id = (r) => { if (!ids.has(r)) ids.set(r, ids.size); return ids.get(r); };
  const all = new Set([...routers.keys(), ...edges.map(e => e.parent), ...edges.map(e => e.child)]);
  const out = { routers: [], edges: [] };
  for (const r of all) {
    const routes = [];
    for (const layer of (r.stack || [])) {
      if (layer.route) routes.push({ path: String(layer.route.path), methods: Object.keys(layer.route.methods || {}) });
    }
    out.routers.push({ id: id(r), file: (routers.get(r) || {}).file || null, routes });
  }
  for (const e of edges) out.edges.push({ parent: id(e.parent), path: e.path, child: id(e.child), at: e.at });
  if (out.routers.length) fs.writeFileSync(OUT.replace(".json", "." + process.pid + ".json"), JSON.stringify(out));
}
process.on('SIGUSR2', dump);
setTimeout(dump, Number(process.env.R1_DUMP_MS || 90000)).unref();
