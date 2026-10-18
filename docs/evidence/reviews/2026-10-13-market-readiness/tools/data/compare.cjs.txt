const S = process.argv[2];
const dz = require(S + '/drizzle_cols.json');
const db = require(S + '/db_cols.json');
const dbMap = new Map();
for (const r of db) { if (!dbMap.has(r.t)) dbMap.set(r.t, new Map()); dbMap.get(r.t).set(r.c, r); }
const norm = t => t.toLowerCase().replace(/, /g,',').replace(/\s+/g,' ').replace('timestamp without time zone','timestamp').replace('timestamp with time zone','timestamptz').replace(/^serial$/,'integer').replace(/^bigserial$/,'bigint').replace(/^smallserial$/,'smallint').replace('character varying','varchar').replace(/^varchar$/, 'varchar').replace('double precision','double precision');
let missingTables=[], missingCols=[], typeMismatch=[], nnMismatch=[], extraCols=0, extraColTables=0;
for (const t of dz) {
  const m = dbMap.get(t.table);
  if (!m) { missingTables.push(t.table); continue; }
  const declared = new Set(t.columns.map(c=>c.name));
  let extra = [...m.keys()].filter(c => !declared.has(c)); if (extra.length) { extraCols += extra.length; extraColTables++; }
  for (const c of t.columns) {
    const d = m.get(c.name);
    if (!d) { missingCols.push(`${t.table}.${c.name} (${c.type})`); continue; }
    let a = norm(c.type), b = norm(d.type);
    a = a.replace(/^varchar\(\d+\)$/,m=>m); 
    if (a !== b && !(a==='varchar' && b.startsWith('varchar')) && !(a.startsWith('timestamp') && b.startsWith(a)) && !(a==='numeric' && b.startsWith('numeric')) && !(a.startsWith('vector') && b.startsWith('vector')))
      typeMismatch.push(`${t.table}.${c.name}: drizzle=${c.type} db=${d.type}`);
    if (c.notNull !== d.nn) nnMismatch.push(`${t.table}.${c.name}: drizzle notNull=${c.notNull} db=${d.nn}`);
  }
}
const dzSet = new Set(dz.map(t=>t.table));
const dbOnly = [...dbMap.keys()].filter(t => !dzSet.has(t));
console.log(JSON.stringify({drizzleTables: dz.length, dbRelationsWithCols: dbMap.size, dbOnlyRelations: dbOnly.length, missingTables, missingColsCount: missingCols.length, missingCols: missingCols.slice(0,40), typeMismatchCount: typeMismatch.length, typeMismatch: typeMismatch.slice(0,60), nnMismatchCount: nnMismatch.length, nnMismatchSample: nnMismatch.slice(0,25), extraColsInDbOnDeclaredTables: extraCols, tablesWithExtraCols: extraColTables}, null, 1));
