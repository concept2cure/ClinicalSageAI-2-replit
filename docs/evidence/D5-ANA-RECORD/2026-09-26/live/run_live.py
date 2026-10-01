"""
The live run behind this evidence: a real server, a real Postgres 16, a fake
model. Kept so the run can be repeated, not as product code.

  python3 run_live.py <base-url> <token-file> <psql-url> <out-dir> <fake-restart-cmd>

Each case prints what the server did and what the stored record says. Model
identifiers are replaced with <model> (repository rule: none in artifacts).
"""
import hashlib, json, os, re, subprocess, sys, threading, time, urllib.request, uuid

BASE, TOKEN_FILE, PSQL, OUT, FAKE = sys.argv[1:6]
TOKEN = open(TOKEN_FILE).read().strip()
lines = []


def say(*a):
    s = ' '.join(str(x) for x in a)
    s = re.sub(r'claude-[a-z0-9.-]+', '<model>', s)
    print(s)
    lines.append(s)


def req(method, path, body=None, raw=False, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    r.add_header('authorization', f'Bearer {TOKEN}')
    if data is not None:
        r.add_header('content-type', 'application/json')
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    try:
        with urllib.request.urlopen(r, timeout=180) as resp:
            text = resp.read().decode()
            return resp.status, (text if raw else json.loads(text) if text else None), dict(resp.headers)
    except urllib.error.HTTPError as e:
        text = e.read().decode()
        try:
            return e.code, json.loads(text), dict(e.headers)
        except Exception:
            return e.code, text, dict(e.headers)


def stream(body, on_event=None):
    data = json.dumps(body).encode()
    r = urllib.request.Request(BASE + '/api/ana-ri/stream', data=data, method='POST')
    r.add_header('authorization', f'Bearer {TOKEN}')
    r.add_header('content-type', 'application/json')
    events = []
    with urllib.request.urlopen(r, timeout=180) as resp:
        buf = ''
        for chunk in iter(lambda: resp.read(1), b''):
            buf += chunk.decode('utf-8', 'replace')
            while '\n\n' in buf:
                block, buf = buf.split('\n\n', 1)
                for ln in block.splitlines():
                    if ln.startswith('data: '):
                        try:
                            ev = json.loads(ln[6:])
                        except Exception:
                            continue
                        events.append(ev)
                        if on_event:
                            on_event(ev)
    return events


def psql(sql):
    p = subprocess.run(['psql', PSQL, '-v', 'ON_ERROR_STOP=1', '-Atc', sql], capture_output=True, text=True)
    return (p.stdout + p.stderr).strip()


def closing(events):
    for ev in events:
        if ev.get('type') in ('post_done', 'error') and 'turnRecord' in ev:
            return ev['turnRecord'], ev['type']
    return None, None


def read(rec_id):
    st, body, _ = req('GET', f'/api/ana-ri/turn-records/{rec_id}?texts=1')
    assert st == 200, (st, body)
    return body['data']


def summary(d):
    r, t = d['record'], d['texts']
    say('   outcome', r['turn']['outcome'], '| thread', r['turn']['threadId'], '| user msg', r['turn']['userMessageId'], '| answer msg', r['turn']['assistantMessageId'])
    say('   asked   ', repr(t[r['request']['typed']['sha256']][:90]))
    say('   model input: first call', len(r['modelInput']), 'messages', [m['role'] for m in r['modelInput']],
        '| later calls', [(ri['call'], len(ri['messages'])) for ri in r['roundInputs']])
    say('   calls   ', [(c['call'], c['round'], c['provider'], c['model']) for c in r['model']['calls']])
    say('   files   ', r['context']['files'], '| memory', r['context']['memoryStatus'])
    for s in r['steps']:
        say('   step    ', s['round'], s['tool'], s['status'], (s['error'] or '')[:80])
    for p in r['plan']:
        say('   plan    ', p['round'], [st['status'] for st in p['steps']])
    ans = r['answer']
    say('   streamed', repr(t[ans['streamed']['sha256']][:90]) if ans['streamed'] else None)
    say('   stored  ', repr(t[ans['stored']['sha256']][:90]) if ans['stored'] else None)
    say('   drafts  ', [(x['title'], x['authoringDocId']) for x in r['outputs']['drafts']])
    say('   controls', r['controls'])
    say('   warnings', r['warnings'])
    say('   verdict ', d['verdict'])


# ── 1. An answered turn, with a real upload ────────────────────────────────
say('## 1. Answered turn with an uploaded file')
fname = os.path.join(OUT, 'Protocol-ONC-221-v3.2.txt')
with open(fname, 'w') as f:
    f.write('Protocol ONC-221 v3.2. Primary endpoint: progression-free survival at 12 months by BICR (RECIST 1.1).\n')
file_bytes = open(fname, 'rb').read()
boundary = uuid.uuid4().hex
body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="Protocol-ONC-221-v3.2.txt"\r\n'
        f'Content-Type: text/plain\r\n\r\n').encode() + file_bytes + f'\r\n--{boundary}--\r\n'.encode()
r = urllib.request.Request(BASE + '/api/chat/upload', data=body, method='POST')
r.add_header('authorization', f'Bearer {TOKEN}')
r.add_header('content-type', f'multipart/form-data; boundary={boundary}')
up = json.loads(urllib.request.urlopen(r, timeout=60).read().decode())
say('   upload fileId', up.get('fileId'), '| sha256 of the bytes sent', hashlib.sha256(file_bytes).hexdigest())
ev1 = stream({'message': 'Draft a one-page summary of the protocol primary endpoint', 'file_ids': [up['fileId']], 'context': {'screenName': 'conversation'}})
tr1, where = closing(ev1)
say('   stream closed with', where, tr1)
d1 = read(tr1['id'])
summary(d1)
thread = d1['record']['turn']['threadId']
f0 = d1['record']['context']['files'][0] if d1['record']['context']['files'] else {}
say('   the record names the exact bytes:', f0.get('uploadSha256') == hashlib.sha256(file_bytes).hexdigest())

# ── 2. A follow-up in the same conversation ────────────────────────────────
say('\n## 2. Follow-up in the same conversation: history by reference')
blobs_before = int(psql("select count(*) from ana_record_blobs"))
ev2 = stream({'message': 'And the key secondary endpoint?', 'thread_id': thread, 'context': {'screenName': 'conversation'}})
tr2, where = closing(ev2)
say('   stream closed with', where, tr2)
d2 = read(tr2['id'])
summary(d2)
first_q = d1['record']['request']['typed']['sha256']
say('   turn 1 question is in turn 2 model input by hash:', any(m['text']['sha256'] == first_q for m in d2['record']['modelInput']))
say('   new texts stored for turn 2:', int(psql("select count(*) from ana_record_blobs")) - blobs_before)

# ── 3. A turn the person stopped ──────────────────────────────────────────
say('\n## 3. A turn the person stopped')
subprocess.run(FAKE + ' 4000', shell=True, check=True)
time.sleep(1.5)
run_id = {}


def on_ev(ev):
    if ev.get('type') == 'run_started' and ev.get('runId'):
        run_id['id'] = ev['runId']

        def cancel():
            time.sleep(2.0)
            st, b, _ = req('POST', f"/api/ana-ri/stream/{ev['runId']}/control", {'action': 'cancel'})
            say('   cancel ->', st, (b or {}).get('ok') if isinstance(b, dict) else b)
        threading.Thread(target=cancel, daemon=True).start()


ev3 = stream({'message': 'Draft a one-page summary of the protocol primary endpoint', 'context': {'screenName': 'conversation'}}, on_ev)
tr3, where = closing(ev3)
say('   stream closed with', where, tr3)
summary(read(tr3['id']))

# ── 4. A turn that failed ─────────────────────────────────────────────────
say('\n## 4. A turn that failed (the model endpoint is gone)')
subprocess.run(FAKE + ' stop', shell=True, check=True)
time.sleep(1)
ev4 = stream({'message': 'What does the SAP say about multiplicity?', 'context': {'screenName': 'conversation'}})
tr4, where = closing(ev4)
say('   stream closed with', where, tr4)
if tr4 and tr4.get('status') == 'recorded':
    summary(read(tr4['id']))
subprocess.run(FAKE + ' 0', shell=True, check=True)
time.sleep(1.5)

# ── 5. The no-model path ──────────────────────────────────────────────────
say('\n## 5. The intelligence-answer path (no model runs)')
ev5 = stream({'message': '[INTELLIGENCE_ANSWER]{"flow_id":"not-a-flow","answer":"yes"}', 'context': {'screenName': 'conversation'}})
tr5, where = closing(ev5)
say('   stream closed with', where, tr5)
summary(read(tr5['id']))

# ── 6. Listing and exporting ──────────────────────────────────────────────
say('\n## 6. The conversation\'s records, and an export an inspector can check offline')
st, lst, _ = req('GET', f'/api/ana-ri/turn-records?thread_id={thread}')
say('   list', st, [(x['outcome'], x['recordSha256'][:12]) for x in lst['data']['records']])
st, pkg_text, hdrs = req('GET', f"/api/ana-ri/turn-records/{tr1['id']}/export", raw=True)
say('   export', st, hdrs.get('Content-Disposition'), 'X-Turn-Record-Sha256 =', hdrs.get('X-Turn-Record-Sha256'))
# The package names the model that served the turn, so it is kept out of the
# repository (SCRATCH) and only the verifier's verdict is filed here.
pkg_path = os.path.join(os.environ.get('SCRATCH', OUT), 'export-turn-1.json')
open(pkg_path, 'w').write(pkg_text)
pkg = json.loads(pkg_text)
say('   package holds', sorted(pkg.keys()), '|', len(pkg['texts']), 'texts')
say('   export audited:', psql(f"select count(*) from audit_logs where action='ana.turn.exported' and record_id='{tr1['id']}'"))
v = subprocess.run(['node', os.path.join(os.path.dirname(__file__), 'verify-turn-export.mjs'), pkg_path], capture_output=True, text=True)
say('   independent verifier:\n' + '\n'.join('     ' + x for x in (v.stdout + v.stderr).strip().splitlines()))

# ── 7. The engine refuses to change a record ──────────────────────────────
say('\n## 7. Changing a record, as the database owner')
for sql in [f"update ana_turn_records set outcome='failed' where id='{tr1['id']}'",
            f"delete from ana_turn_records where id='{tr1['id']}'",
            "truncate ana_turn_records",
            "update ana_record_blobs set text='x' where true",
            "delete from ana_record_blobs",
            "truncate ana_record_blobs"]:
    say('   ', sql[:60], '->', psql(sql).splitlines()[0][:110])

say('\n## 8. A rewrite past a disabled trigger')
# Self-consistent: the forged text is stored under its own hash, so the
# table's CHECK accepts it. Only the chain can tell.
forged_text = json.dumps(d1['record'], separators=(',', ':'), sort_keys=True).replace('"conversation"', '"forged"')
forged_sha = hashlib.sha256(forged_text.encode()).hexdigest()
say('   ', psql('alter table ana_turn_records disable trigger trg_ana_turn_records_append_only'))
check = subprocess.run(['npx', 'tsx', os.path.join(os.path.dirname(__file__), 'trigger-check.ts')], capture_output=True, text=True, cwd=os.environ.get('REPO', '.'),
                       env={**os.environ, 'DATABASE_URL': PSQL})
say('   the boot/sweep trigger check while disabled:', (check.stdout + check.stderr).strip().splitlines()[-1][:300])
esc = forged_text.replace("'", "''")
say('   ', psql(f"update ana_turn_records set record_text='{esc}', record_sha256='{forged_sha}' where id='{tr1['id']}'"))
say('   ', psql('alter table ana_turn_records enable trigger trg_ana_turn_records_append_only'))
d1b = read(tr1['id'])
say('   verdict after the rewrite', d1b['verdict'])

# ── 9. Deleting the conversation ──────────────────────────────────────────
say('\n## 9. Deleting the conversation')
st, b, _ = req('DELETE', f'/api/chat/thread/{thread}')
say('   delete ->', st, b)
say('   audit row:', psql(f"select action, new_values::text from audit_logs where action='chat.thread.deleted' and record_id='{thread}'"))
say('   transcript rows left:', psql(f"select count(*) from chat_messages where thread_id='{thread}'"))
st, lst2, _ = req('GET', f'/api/ana-ri/turn-records?thread_id={thread}')
say('   turn records still listed for the deleted conversation:', len(lst2['data']['records']))
say('   turn 2 still verifies:', read(tr2['id'])['verdict']['ok'])

say('\n## 10. The other doors into the agentic loop')
st, b, _ = req('POST', '/api/claude/agent', {'prompt': 'What is the primary endpoint of ONC-221?'})
say('   POST /api/claude/agent ->', st, (b or {}).get('data', {}).get('turnRecord') if isinstance(b, dict) else b)
if isinstance(b, dict) and b.get('data', {}).get('turnRecord', {}).get('status') == 'recorded':
    summary(read(b['data']['turnRecord']['id']))
st, b, _ = req('POST', '/api/chat/send-message', {'message': 'What is the primary endpoint of ONC-221?'})
say('   POST /api/chat/send-message ->', st, (b or {}).get('turnRecord') if isinstance(b, dict) else b)
if isinstance(b, dict) and (b.get('turnRecord') or {}).get('status') == 'recorded':
    summary(read(b['turnRecord']['id']))
sock = subprocess.run(['node', os.path.join(os.path.dirname(__file__), 'socket-turn.mjs'), BASE, TOKEN_FILE, 'What is the primary endpoint of ONC-221?'],
                      capture_output=True, text=True, cwd=os.environ.get('REPO', '.'))
for ln in (sock.stdout + sock.stderr).strip().splitlines()[-4:]:
    say('   socket', ln[:220])
try:
    last = json.loads((sock.stdout.strip().splitlines() or ['{}'])[-1])
    if last.get('turnRecord', {}).get('status') == 'recorded':
        summary(read(last['turnRecord']['id']))
except Exception as e:
    say('   socket parse failed', e)

say('\n## 11. A turn that names a colleague\'s conversation')
org = psql("select organization_id from ana_turn_records order by created_at desc limit 1")
psql(f"insert into chat_threads (id, user_id, organization_id, title) values ('th_colleague_live', 999999, {org}, 'Colleague') on conflict do nothing")
ev11 = stream({'message': 'Continue this conversation', 'thread_id': 'th_colleague_live', 'context': {'screenName': 'conversation'}})
tr11, where = closing(ev11)
say('   stream closed with', where, [e.get('error') for e in ev11 if e.get('type') == 'error'], tr11)
if tr11 and tr11.get('status') == 'recorded':
    summary(read(tr11['id']))

say('\n## 12. The organization\'s whole audit chain')
chain = subprocess.run(['npm', 'run', '-s', 'ops:verify-audit-chain'], capture_output=True, text=True, cwd=os.environ.get('REPO', '.'),
                       env={**os.environ, 'DATABASE_URL': PSQL})
say('   ' + '\n   '.join(l for l in (chain.stdout + chain.stderr).strip().splitlines() if 'secretSource' not in l and 'lastChainHash' not in l))

open(os.path.join(OUT, 'live-run.txt'), 'w').write('\n'.join(lines) + '\n')
