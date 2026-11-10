const { z } = require(process.argv[2]);
const body = '[' + Array(1_000_000).fill('0').join(',') + ']'; // a 2 MB JSON body
const arr = JSON.parse(body);
global.gc && global.gc();
const before = process.memoryUsage().heapUsed;
const t = Date.now();
const r = z.array(z.string()).max(10).safeParse(arr);
const peak = process.memoryUsage().heapUsed;
console.info(JSON.stringify({ bodyBytes: body.length, ok: r.success, issues: r.success ? 0 : r.error.issues.length, heapDeltaMB: Math.round((peak - before) / 1048576), ms: Date.now() - t }));
