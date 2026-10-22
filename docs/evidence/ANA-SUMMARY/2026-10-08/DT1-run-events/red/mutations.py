import sys, os, json, shutil
ROOT='./'  # run from the repository root
BK='/tmp/dt1-mutbak/'
M = {
 # test 2: no guard triggers installed
 'no-guard-trigger': [('migrations/20261008f_ana_run_events.sql',
   "  IF NOT EXISTS (\n    SELECT 1 FROM pg_trigger\n     WHERE tgname = 'trg_ana_run_events_guard'",
   "  IF false AND NOT EXISTS (\n    SELECT 1 FROM pg_trigger\n     WHERE tgname = 'trg_ana_run_events_guard'"),
   ('migrations/20261008f_ana_run_events.sql',
   "  IF NOT EXISTS (\n    SELECT 1 FROM pg_trigger\n     WHERE tgname = 'trg_ana_run_events_no_truncate'",
   "  IF false AND NOT EXISTS (\n    SELECT 1 FROM pg_trigger\n     WHERE tgname = 'trg_ana_run_events_no_truncate'")],
 # test 3: seal without awaiting the flush
 'seal-without-await': [('server/services/ana/run-events.ts',
   "    await mirror.close().catch(() => undefined);",
   "    void mirror.close().catch(() => undefined);")],
 # test 4: no owner predicate on the batch or the beat
 'no-owner-predicate': [('server/services/ana/run-events.ts',
   " WHERE r.id = $1 AND r.organization_id = $5 AND r.owner_instance = $6",
   " WHERE r.id = $1 AND r.organization_id = $5 AND $6::text IS NOT NULL"),
   ('server/services/ana/run-control.ts',
   "            AND r.owner_instance = $3\n            AND r.status IN",
   "            AND $3::text IS NOT NULL\n            AND r.status IN")],
 # test 5: no cap
 'no-cap': [('server/services/ana/run-events.ts',
   "    if (event.seq > MIRROR_EVENT_CAP) {",
   "    if (false) {")],
 # test 6: highWater from the rows alone
 'highwater-rows-only': [('server/routes/ana-ri/runs.ts',
   "    highWater: Math.max(Number(row.timeline_seq ?? 0), mirror.maxSeq),",
   "    highWater: mirror.maxSeq,")],
 # test 7: no process heartbeat (the beat rode the keepalive)
 'no-process-heartbeat': [('server/services/ana/run-control.ts',
   "  armRunHeartbeat(input.pool);\n",
   "")],
 # test 8: the flush runs in whatever context made the timer
 'flush-unscoped': [('server/services/ana/run-events.ts',
   "        const r = await inRunScope(organizationId, 'ana-run-events:flush', () =>",
   "        const r = await ((_o: number, _c: string, f: () => Promise<any>) => f())(organizationId, 'ana-run-events:flush', () =>")],
 # test 9: the organisation only in JS... and here not at all in the statement
 'access-no-org-in-sql': [('server/routes/ana-ri/runs.ts',
   "  const { rows } = await pool.query(`SELECT ${RUN_COLUMNS} FROM ana_runs WHERE id = $1 AND organization_id = $2`, [\n    runId,\n    organizationId,\n  ]);",
   "  const { rows } = await pool.query(`SELECT ${RUN_COLUMNS}, organization_id FROM ana_runs WHERE id = $1`, [runId]);")],
 # test 10: SELECT * and a spread row
 'payload-select-star': [('server/routes/ana-ri/runs.ts',
   "  const { rows } = await pool.query(`SELECT ${RUN_COLUMNS} FROM ana_runs WHERE id = $1 AND organization_id = $2`, [",
   "  const { rows } = await pool.query(`SELECT * FROM ana_runs WHERE id = $1 AND organization_id = $2`, ["),
   ('server/routes/ana-ri/runs.ts',
   "  res.status(200).json({\n    runId: row.id,",
   "  res.status(200).json({\n    ...row,\n    runId: row.id,")],
 # beginRun: the client's thread stamped as sent, no locks, no caps (HEAD's insert)
 'begin-unverified': [('server/services/ana/run-control.ts',
   "    const threadId = await verifiedThreadId(client, org, input.userId, input.threadId);\n    if (threadId) {",
   "    const threadId = input.threadId ?? null;\n    if (false) {"),
   ('server/services/ana/run-control.ts',
   "      if (Number(rows[0]?.n ?? 0) >= MAX_LIVE_RUNS_PER_PERSON) throw new RunRefusedError('RUN_LIMIT');",
   "      void rows;")],
 # stream: the keepalive beats the run again
 'keepalive-beats': [('server/routes/ana-ri/stream.ts',
   "        // without a socket. This ping stays for the proxies and touches no row.\n      }, STREAM_KEEPALIVE_MS);",
   "        // without a socket. This ping stays for the proxies and touches no row.\n        if (runId && runHandle) void runHandle.heartbeat(0);\n      }, STREAM_KEEPALIVE_MS);")],
 # stream: the record written without the mirror
 'stream-no-seal-order': [('server/routes/ana-ri/stream.ts',
   "        : sealAfterMirror(runHandle?.events, () =>",
   "        : sealAfterMirror(undefined, () =>")],
 # stream: no third sink
 'stream-no-mirror-sink': [('server/routes/ana-ri/stream.ts',
   "      mirror: () => runHandle?.events,\n",
   "")],
 # gate: the entry after the final sweep
 'set-order-after-sweep': [('scripts/db/migration-set.mjs',
   "  'migrations/20261008f_ana_run_events.sql',\n\n  UUID_TENANT_ISOLATION_NONPUBLIC,",
   "\n  UUID_TENANT_ISOLATION_NONPUBLIC,"),
   ('scripts/db/migration-set.mjs',
   "  TENANT_ISOLATION_SWEEP,\n];",
   "  TENANT_ISOLATION_SWEEP,\n  'migrations/20261008f_ana_run_events.sql',\n];")],
 # gate: the table left off the purge list
 'purge-list-without-table': [('server/services/tenant/tenant-offboarding.ts',
   "  'ana_run_events',\n  'ana_runs',",
   "  'ana_runs',")],
 # stream: a refusal treated as an outage
 'stream-refusal-as-outage': [('server/routes/ana-ri/stream.ts',
   "          const refusal = runRefusalFrame(err);\n          if (refusal) {",
   "          const refusal = runRefusalFrame(err);\n          if (refusal && false) {")],
}
cmd, name = sys.argv[1], (sys.argv[2] if len(sys.argv)>2 else None)
os.makedirs(BK, exist_ok=True)
if cmd=='apply':
    for f,old,new in M[name]:
        p=ROOT+f
        b=BK+f.replace('/','__')
        if not os.path.exists(b): shutil.copy(p,b)
        s=open(p).read()
        assert s.count(old)==1, (name,f,s.count(old))
        open(p,'w').write(s.replace(old,new,1))
    print('applied',name)
elif cmd=='restore':
    for b in os.listdir(BK):
        shutil.copy(BK+b, ROOT+b.replace('__','/'))
        os.remove(BK+b)
    print('restored')
