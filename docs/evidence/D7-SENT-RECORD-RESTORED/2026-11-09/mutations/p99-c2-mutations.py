"""P-99 C2 + C4a mutations, on the final code and tests. Each mutation is applied alone, its test run, and the file
restored by SHA-256 (cmut2.py beside this file; the real-PostgreSQL ones inline, as app_service with RLS_ENFORCE=on).
Run from the repo root. Env: MUT_EV (out dir); for the db ones P99_DB and P99_APP_PW_FILE (read, never printed).
Usage: python3 p99-c2-mutations.py [name-prefix ...]   (no argument runs all)"""
import datetime, hashlib, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
READ = 'server/services/submission-gateways/sent-package-read.ts'
SVC = 'server/services/submission-service/submission-service.ts'
LOADER = 'server/services/ectd/prior-sequence-loader.ts'
GUARD = 'server/services/submission-gateways/index.ts'
ROUTE = 'server/routes/submissions.ts'
ANA = 'server/services/ana/AnaToolDefinitions.ts'
UI = 'client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx'
CARD = 'client/src/concept2cure/v2/surfaces/EctdFiledState.tsx'
T_DERIVE = 'server/services/submission-gateways/__tests__/sent-record-rederive.test.ts'
T_ACT = 'server/services/submission-service/__tests__/sent-record-rederive.pglite.test.ts'
T_GUARD = 'server/services/submission-gateways/__tests__/transmit-records-what-was-sent.test.ts'
T_ROUTE = 'server/routes/__tests__/submissions-sent-record.test.ts'
T_ANA = 'server/services/ana/__tests__/ana-cannot-restore-sent-record.test.ts'
T_DB = 'tests/db/ectd-filed-state-view.dbtest.ts'
T_UI = 'client/src/concept2cure/v2/__tests__/dispatchSentRecord.test.tsx'
T_CARD = 'client/src/concept2cure/v2/__tests__/ectdFiledState.test.tsx'
M = [
  # The design's twelve (§5 C2), in its order.
  ('C2M01-reader-heading-section', READ, T_DERIVE, 'P-99 C2', "    const section = recoveredSection(l, facts.region);\n", "    const section = l.ctdSection;\n"),
  ('C2M02-no-folder-check', READ, T_DERIVE, 'P-99 C2', "  if (folder !== expected && !(/^m[45]\\//.test(expected) && path.posix.dirname(folder) === expected)) return false;\n", ""),
  ('C2M03-bind-skipped', READ, T_DERIVE, 'P-99 C2', "  reasons.push(...bindToFiledState(s, priorLeaves));\n", ""),
  ('C2M04-build-leaf-manifest-skipped', READ, T_DERIVE, 'P-99 C2', "const leaves = buildLeafManifest([...s.leaves]", "const leaves = ([...s.leaves]"),
  ('C2M05-record-row-sha-not-compared', READ, T_ACT, 'T8 refuses', "  if (record.sha256 !== row.bundle_sha256) {", "  if (false) {"),
  ('C2M06-staging-allowed', SVC, T_ACT, 'T8 refuses', "  if (m.environment !== 'production') return `Sequence ${n} was sent", "  if (false) return `Sequence ${n} was sent"),
  ('C2M07-no-cas', SVC, T_ACT, 'T10', "            WHERE id = $1 AND organization_id = $2 AND NOT (metadata ? 'leafManifest') AND NOT (metadata ? 'sentRecordStatement')\n", "            WHERE id = $1 AND organization_id = $2\n"),
  ('C2M08-compiles-beside-record', LOADER, T_ACT, 'T6', "    return [{ sequence_number: seq, leaf_manifest: record, basis: 'transmit', restored_on: typeof derivedAt === 'string' ? derivedAt : null }];",
   "    return [{ sequence_number: seq, leaf_manifest: record, basis: 'transmit', restored_on: typeof derivedAt === 'string' ? derivedAt : null }, ...read.compiles.map((c) => ({ sequence_number: seq, leaf_manifest: c.leaf_manifest, basis: 'compiles' as const }))];"),
  ('C2M09-rule2-first-of-two', LOADER, T_ACT, 'T7', "  if (named.length !== 1) return null;", "  if (named.length < 1) return null;"),
  ('C2M10-guard-keeps-restored-binding', GUARD, T_GUARD, 'P-99', "          restoredBinding: undefined,\n", ""),
  ('C2M11-manifest-sha-ignored', SVC, T_ACT, 'T10', "  if (derivation.manifestSha256 !== String(input.manifestSha256 ?? '')) throw", "  if (false) throw"),
  ('C2M12-no-tenant-context', SVC, T_DB, 'T11', "        await setTenantContextTx(client, ctx.organizationId);\n        const cq = asQueryable(client);\n        // The transmittal first, as the receipt path",
   "        const cq = asQueryable(client);\n        // The transmittal first, as the receipt path"),
  # Beside C2M07: the under-lock judgment alone, and with the CAS.
  ('C2M13-not-rejudged-under-lock', SVC, T_ACT, 'T10', "        if (changed) throw sentRecordRefused(changed);\n        if (again.transmittal?.id !== t.id)", "        if (again.transmittal?.id !== t.id)"),
  ('C2M14-ana-reaches-the-act', ANA, T_ANA, 'AnA', "/**\n * AnA Tool Definitions — Agentic Document Generation\n", "// rederiveSentRecord(\n/**\n * AnA Tool Definitions — Agentic Document Generation\n"),
  ('C2M15-restored-join-null-unsafe', LOADER, T_DB, 'P-99 C2', "              AND lower(t.metadata -> 'restoredBinding' ->> 'attemptId') IS NOT DISTINCT FROM f.transmit_attempt_id::text",
   "              AND lower(t.metadata -> 'restoredBinding' ->> 'attemptId') = f.transmit_attempt_id::text"),
  ('C2M16-route-precheck-generic', ROUTE, T_ROUTE, 'own function', "    if (parsed.data.step === 'sent-record') return res.json(await precheckSentRecord(seqId, ctx));\n", ""),
  # C4a, the client.
  ('C2M17-door-for-transmit', UI, T_UI, 'there is no door', "(t.sentRecord?.basis === 'none' || t.sentRecord?.basis === 'compiles')", "(t.sentRecord?.basis === 'none' || t.sentRecord?.basis === 'compiles' || t.sentRecord?.basis === 'transmit')"),
  ('C2M18-any-200-recorded', UI, T_UI, 'not a success', "    if (done.data?.recorded !== true || done.data.sequenceId !== seq.id) return setRefusal(", "    if (false) return setRefusal("),
  ('C2M19-payload-without-what-was-read', UI, T_UI, 'records what the person read', "{ reason: reason.trim(), manifestSha256: rb.manifestSha256 }", "{ reason: reason.trim() }"),
  # T11's own red: the kept send's row written in another organisation; under RLS the act, scoped to its tenant, must not find it.
  ('C2M22-send-row-in-another-organisation', T_DB, T_DB, 'T11', "[t.orgId, t.programId, sha256, userId, JSON.stringify(metadata)]", "[mine.orgId, t.programId, sha256, userId, JSON.stringify(metadata)]"),
  ('C2M20-card-line-dropped', CARD, T_CARD, 'read back from the package', "        {restored ? ` ${restored}` : ''}\n", ""),
]

def db_run(name, path, test, filt, a, b):
    db = os.environ['P99_DB']; pw = open(os.environ['P99_APP_PW_FILE']).read().strip()
    env = dict(os.environ, CI='true', NODE_ENV='test', RLS_ENFORCE='on',
               DATABASE_URL=f'postgresql://postgres@127.0.0.1:5432/{db}', TEST_DATABASE_URL=f'postgresql://postgres@127.0.0.1:5432/{db}',
               APP_DATABASE_URL=f'postgresql://app_service:{pw}@127.0.0.1:5432/{db}')
    orig = open(path).read(); h0 = hashlib.sha256(orig.encode()).hexdigest()
    assert orig.count(a) == 1, 'anchor not unique: ' + a
    open(path, 'w').write(orig.replace(a, b))
    try:
        r = subprocess.run(['timeout', '600', 'npx', 'vitest', 'run', '--config', 'vitest.db.config.ts', test, '-t', filt], capture_output=True, text=True, env=env)
        out = r.stdout + r.stderr
    finally:
        open(path, 'w').write(orig)
    h1 = hashlib.sha256(open(path).read().encode()).hexdigest()
    keep = [l for l in out.splitlines() if any(k in l for k in ('✓', '×', '→', 'Tests ', 'Expected', 'Received', 'AssertionError'))][:40]
    dst = os.path.join(os.environ['MUT_EV'], f'mutation-{name}.txt')
    with open(dst, 'w') as f:
        f.write(f"MUTATION {name} in {path} (on the final code and tests, {datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None).isoformat()}Z): replaced [{a}] with [{b}]; "
                f"{test} -t '{filt}', on PostgreSQL as app_service with RLS_ENFORCE=on\n")
        f.write('\n'.join(keep) + '\n')
        f.write(f"restored sha256 {h1} (expected {h0})\n")
    print(open(dst).read()[-500:])

only = sys.argv[1:]
for m in M:
    if only and not any(m[0].startswith(p) for p in only):
        continue
    if m[2] == T_DB:
        db_run(*m)
    else:
        subprocess.run([sys.executable, os.path.join(HERE, 'cmut2.py'), *m], check=False)
