import pg from '/workspace/concept2cure/node_modules/pg/lib/index.js';
const inputs = [
 '2026-10-14T12:34:56.789Z','2000-02-29T00:00:00.000Z','1900-02-29T00:00:00.000Z',
 '2024-02-29T00:00:00.000Z','2026-02-29T00:00:00.000Z','2026-04-31T00:00:00.000Z',
 '2026-13-01T00:00:00.000Z','2026-00-01T00:00:00.000Z','2026-01-00T00:00:00.000Z',
 '0000-01-01T00:00:00.000Z','0001-01-01T00:00:00.000Z','9999-12-31T23:59:59.999Z',
 '2026-01-01T24:00:00.000Z','2026-01-01T23:60:00.000Z','2026-01-01T23:59:60.000Z',
 'infinity','-infinity','NaN','2026-01-01T00:00:00.000+00:00','2026-01-01T00:00:00.000Zgarbage',
 '2026-01-01T00:00:00Z','2026-01-01T00:00:00.000Z\n',' 2026-01-01T00:00:00.000Z',
 '2026-01-01T00:00:00.0000Z','2026-01-01T00:00:00.00Z','2026-01-01T00:00:00.999Z',
 '2026-01-01T00:00:00.000z','2026-01-01t00:00:00.000Z','２０２６-01-01T00:00:00.000Z',
 '10000-01-01T00:00:00.000Z','-0001-01-01T00:00:00.000Z',null,42,{},[],true,
];
for(const year of ['0000','0001','0099','1500','1600','1700','1900','2000','2004','9999'])
 for(const month of ['00','01','02','04','06','12','13'])
  for(const day of ['00','01','28','29','30','31','32'])
   inputs.push(`${year}-${month}-${day}T12:34:56.789Z`);
const strict = (v) => typeof v==='string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$/.test(v) && !v.startsWith('0000') && Number.isFinite(Date.parse(v)) && new Date(v).toISOString()===v;
const t='sample.input';
const guarded = `(CASE WHEN ${t} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$' AND left(${t},4)<>'0000' THEN
 CASE WHEN jsonb_path_exists(to_jsonb(left(${t},23)||'+00:00'),'$.datetime()','{}'::jsonb,true) THEN
  CASE WHEN to_char((${t})::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')=${t} THEN (${t})::timestamptz END
 END END)`;
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
await client.connect();
try {
 await client.query('BEGIN READ ONLY');
 const version=await client.query("SELECT current_setting('server_version') AS server_version");
 console.log(JSON.stringify({server_version:version.rows[0].server_version,cases:inputs.length,normalization:'fixed canonical Z -> +00:00 for silent JSONPath validation only',year_zero:'rejected before cast'}));
 for(const [style,zone] of [['ISO, MDY','UTC'],['SQL, DMY','Pacific/Honolulu'],['German, DMY','Asia/Kolkata']]) {
  await client.query('SELECT set_config($1,$2,true),set_config($3,$4,true)',['DateStyle',style,'TimeZone',zone]);
  const result=await client.query(`WITH sample AS (SELECT ordinal,value#>>'{}' AS input FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS v(value,ordinal)) SELECT ordinal,input,${guarded} IS NOT NULL AS accepted FROM sample ORDER BY ordinal`,[JSON.stringify(inputs)]);
  const mismatches=result.rows.filter((r,i)=>r.accepted!==strict(inputs[i]));
  console.log(JSON.stringify({dateStyle:style,timeZone:zone,accepted:result.rows.filter(r=>r.accepted).length,rejected:result.rows.filter(r=>!r.accepted).length,mismatches}));
 }
 await client.query('ROLLBACK');
} finally {await client.end();}
