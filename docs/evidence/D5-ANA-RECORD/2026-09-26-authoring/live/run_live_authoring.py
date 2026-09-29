"""
The live run behind this evidence: a real server on a real Postgres 16. No
model is needed — every act here is a person's. Kept so the run can be
repeated, not as product code.

  REPO=<repo> SCRATCH=<dir> python3 run_live_authoring.py <base-url> <token-file> <psql-url> <out-dir>

It drives one document through comments, a quoted passage, a reply, a
resolution and a reopen, a tracked-change decision on AnA's text linked to a
real AnA turn record, an "Accept all" of 25 changes, reads the trail back with
its verdicts, exports it, checks the export offline, and then tries to change
the record the ways a person with database access could.
"""
import hashlib, json, os, subprocess, sys, urllib.request

BASE, TOKEN_FILE, PSQL, OUT = sys.argv[1:5]
REPO = os.environ.get('REPO', '.')
SCRATCH = os.environ.get('SCRATCH', OUT)
TOKEN = open(TOKEN_FILE).read().strip()
HERE = os.path.dirname(os.path.abspath(__file__))
lines = []


def say(*a):
    s = ' '.join(str(x) for x in a)
    print(s)
    lines.append(s)


def req(method, path, body=None, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    r.add_header('authorization', f'Bearer {TOKEN}')
    if data is not None:
        r.add_header('content-type', 'application/json')
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            text = resp.read().decode()
            return resp.status, (text if raw else (json.loads(text) if text else None))
    except urllib.error.HTTPError as e:
        text = e.read().decode()
        try:
            return e.code, json.loads(text)
        except Exception:
            return e.code, text


def psql(sql):
    p = subprocess.run(['psql', PSQL, '-v', 'ON_ERROR_STOP=1', '-Atc', sql], capture_output=True, text=True)
    return (p.stdout + p.stderr).strip()


def sha(s):
    return hashlib.sha256(s.encode()).hexdigest()


QUOTE = 'progression-free survival at 12 months'
CONTENT = f'<p>The primary endpoint is {QUOTE}, assessed by blinded independent central review.</p>'

say('## 1. A project, a document in it, and two sections')
st, pr = req('POST', '/api/c2c/projects', {'name': 'ONC-221 authoring record test', 'programType': 'ind', 'indication': 'NSCLC'})
PROJECT = ((pr or {}).get('program') or {}).get('id') if isinstance(pr, dict) else None
say('   POST /api/c2c/projects ->', st, PROJECT)
st, d = req('POST', '/api/authoring/docs', {'title': 'Clinical Overview — record test', 'module': 'M2', 'client_program_id': PROJECT})
doc = (d.get('document') or d.get('doc') or d.get('data', {}).get('doc') or {}) if isinstance(d, dict) else {}
DOC = doc.get('id')
say('   POST /docs ->', st, DOC)
st, s1 = req('POST', '/api/authoring/sections', {'doc_id': DOC, 'code': '2.5.4', 'title': 'Efficacy', 'content': CONTENT})
SEC = ((s1 or {}).get('section') or {}).get('id')
st2, s2 = req('POST', '/api/authoring/sections', {'doc_id': DOC, 'code': '2.5.5', 'title': 'Safety', 'content': '<p>No new signals.</p>'})
SEC2 = ((s2 or {}).get('section') or {}).get('id')
say('   POST /sections ->', st, SEC, '|', st2, SEC2)
if not (DOC and SEC and SEC2):
    say('   STOP: no document to record against;', json.dumps(d)[:300], json.dumps(s1)[:300])
    open(os.path.join(OUT, 'live-run.txt'), 'w').write('\n'.join(lines) + '\n')
    sys.exit(1)

say('\n## 2. A comment on a quoted passage, a reply, refusals, resolve, reopen')
start = CONTENT.index(QUOTE)
ANCHOR = {'kind': 'text-range', 'quote': QUOTE, 'from': start, 'to': start + len(QUOTE)}
st, bad = req('POST', f'/api/authoring/sections/{SEC}/comment', {
    'body': 'Filed under another document?', 'anchor': ANCHOR,
    'doc_id': '00000000-0000-0000-0000-000000000000',  # not this section's document
})
say('   comment naming another document ->', st, (bad or {}).get('error') if isinstance(bad, dict) else bad)
st, c = req('POST', f'/api/authoring/sections/{SEC}/comment', {
    'body': 'Is the 12-month landmark pre-specified in the SAP?', 'anchor': ANCHOR, 'doc_id': DOC,
})
CID = (c or {}).get('comment', {}).get('id')
say('   comment ->', st, CID, '| filed under the section\'s document:', (c or {}).get('comment', {}).get('doc_id') == DOC)
st, r = req('POST', f'/api/authoring/sections/{SEC}/comment', {'body': 'Yes — SAP §9.4.1.', 'parent_comment_id': CID})
say('   reply ->', st)
st, bad = req('POST', f'/api/authoring/sections/{SEC2}/comment', {'body': 'wrong thread', 'parent_comment_id': CID})
say('   reply filed on another section ->', st, (bad or {}).get('error') if isinstance(bad, dict) else bad)
st, _ = req('PATCH', f'/api/authoring/comments/{CID}', {'status': 'resolved', 'resolution_note': 'Confirmed against SAP v2.0 §9.4.1.'})
say('   resolve ->', st)
st, _ = req('PATCH', f'/api/authoring/comments/{CID}', {'status': 'open'})
say('   reopen ->', st)

say('\n## 3. Decisions on AnA\'s tracked changes, linked to a real AnA turn record')
st, tr = req('GET', '/api/ana-ri/turn-records?limit=1')
TURN = (tr or {}).get('data', {}).get('records', [{}])[0].get('id') if st == 200 else None
say('   an AnA turn record of this organization:', TURN)
LONG = ('The treatment-policy estimand includes outcomes after discontinuation. ' * 20)[:1200]
st, _ = req('POST', f'/api/authoring/documents/{DOC}/tracked-change-decisions', {
    'changeId': 'chg-1', 'decision': 'accept', 'changeType': 'insertion', 'text': LONG,
    'authorId': 'ana', 'authorName': 'AnA (AI draft)', 'at': '2026-09-26T05:00:00Z',
    'sectionId': SEC, 'sourceRecord': TURN, 'reason': 'Matches SAP v2.0 wording.',
})
say('   accept one (1,200 characters, with a reason) ->', st)
changes = [{'changeId': f'bulk-{i}', 'changeType': 'insertion', 'text': f'Proposed sentence {i}: ' + 'x' * 250,
            'authorId': 'ana', 'authorName': 'AnA (AI draft)', 'sourceRecord': TURN if i % 2 == 0 else 'not-a-record'} for i in range(25)]
st, _ = req('POST', f'/api/authoring/documents/{DOC}/tracked-change-decisions/bulk', {
    'decision': 'reject', 'changeIds': [c['changeId'] for c in changes], 'changes': changes, 'sectionId': SEC,
})
say('   reject all 25 in one act ->', st)
st, bad = req('POST', f'/api/authoring/documents/{DOC}/tracked-change-decisions', {
    'changeId': 'chg-x', 'decision': 'accept', 'text': 't', 'sectionId': '00000000-0000-0000-0000-000000000000'})
say('   a decision filed against a section not in the document ->', st, (bad or {}).get('error', {}).get('code') if isinstance(bad, dict) else bad)
st, bad = req('POST', '/api/authoring/documents/00000000-0000-4000-8000-000000000000/tracked-change-decisions', {
    'changeId': 'chg-y', 'decision': 'accept', 'text': 't'})
say('   a decision on a document this organization does not have ->', st, (bad or {}).get('error') if isinstance(bad, dict) else bad)

say('\n## 3b. Acts a legacy wrapper used to write as "System": a review with its reason, a reorder')
st, _ = req('POST', f'/api/authoring/documents/{DOC}/review', {
    'review_status': 'changes_requested', 'review_comments': 'Cite SAP v2.0 §9.4.1 for the landmark analysis.'})
say('   review (changes requested) ->', st)
st, _ = req('POST', f'/api/authoring/docs/{DOC}/sections/reorder', {'section_ids': [SEC2, SEC]})
say('   reorder ->', st)

say('\n## 4. The trail as the editor reads it, with a verdict per row')
st, a = req('GET', f'/api/authoring/docs/{DOC}/audit?limit=100')
for e in (a or {}).get('events', []):
    m = e.get('metadata') or {}
    extra = ''
    if m.get('quote'):
        extra = f" quote={m['quote']!r} quoteSha256 ok={sha(m['quote']) == m.get('quoteSha256')}"
    if e['event_type'] == 'tracked_change_decision':
        extra = f" text={len(m.get('text') or '')} chars source.verified={(m.get('source') or {}).get('verified')}"
    if e['event_type'] == 'tracked_change_bulk_decision':
        ch = m.get('changes') or []
        extra = f" changes={len(ch)} full-text={all(len(x.get('text') or '') > 250 for x in ch)} verified={sum(1 for x in ch if (x.get('source') or {}).get('verified'))}/{len(ch)}"
    say(f"   {e['event_type']:<30} actor={e['actor']} reason={e.get('change_reason')!r} integrity={json.dumps(e.get('integrity'))}{extra}")

say('\n## 5. The chain rows these acts wrote (actor and reason are what the ledger shows)')
say(psql(f"select action, coalesce(actor_id::text,'NULL'), coalesce(reason,'—') from audit_logs where record_id in ('{DOC}','{SEC}','{SEC2}') order by chain_seq"))
say('   rows with no actor:', psql(f"select count(*) from audit_logs where record_id in ('{DOC}','{SEC}','{SEC2}') and actor_id is null"),
    '| rows with the reason "Legacy audit event":', psql(f"select count(*) from audit_logs where record_id in ('{DOC}','{SEC}','{SEC2}') and reason = 'Legacy audit event'"))

say('\n## 6. Export, recorded first, and checked offline')
st, pkg_text = req('GET', f'/api/authoring/docs/{DOC}/audit/export', raw=True)
say('   export ->', st)
pkg_path = os.path.join(SCRATCH, 'authoring-export.json')
open(pkg_path, 'w').write(pkg_text if isinstance(pkg_text, str) else json.dumps(pkg_text))
if st == 200:
    pkg = json.loads(pkg_text)
    say('   summary', pkg['summary'], '| tenantChain', pkg['tenantChain'])
say('   export audited:', psql(f"select count(*) from audit_logs where action='authoring.record.exported' and record_id='{DOC}'"))
v = subprocess.run(['node', os.path.join(HERE, 'verify-authoring-export.mjs'), pkg_path], capture_output=True, text=True)
say('   independent verifier (exit ' + str(v.returncode) + '):\n' + '\n'.join('     ' + x for x in (v.stdout + v.stderr).strip().splitlines()))

say('\n## 7. Changing the record, as the database owner')
for sql in [
    f"update authoring_comments set body='I never asked that' where id='{CID}'",
    f"update authoring_comments set anchor='{{}}'::jsonb where id='{CID}'",
    f"update authoring_comments set status='resolved' where id='{CID}'",
    f"update authoring_audit_trail set change_reason='x' where doc_id='{DOC}'",
    f"delete from authoring_audit_trail where doc_id='{DOC}'",
    "truncate authoring_audit_trail",
]:
    out = psql(sql).splitlines()
    say('   ', sql[:64], '->', (out[0] if out else '')[:120])

say('\n## 8. A rewrite of a quoted passage past a disabled trigger')
row = psql(f"select id from authoring_audit_trail where doc_id='{DOC}' and operation_type='comment_added' limit 1")
say('   ', psql('alter table authoring_audit_trail disable trigger trg_authoring_audit_trail_append_only'))
say('   ', psql(f"update authoring_audit_trail set metadata = jsonb_set(metadata, '{{quote}}', '\"overall survival at 24 months\"') where id='{row}'"))
say('   ', psql('alter table authoring_audit_trail enable trigger trg_authoring_audit_trail_append_only'))
st, a = req('GET', f'/api/authoring/docs/{DOC}/audit?limit=100')
for e in (a or {}).get('events', []):
    if e['id'] == row:
        say('   verdict for the rewritten row:', json.dumps(e.get('integrity')))
st, pkg_text = req('GET', f'/api/authoring/docs/{DOC}/audit/export', raw=True)
pkg_path2 = os.path.join(SCRATCH, 'authoring-export-after-tamper.json')
open(pkg_path2, 'w').write(pkg_text if isinstance(pkg_text, str) else json.dumps(pkg_text))
v = subprocess.run(['node', os.path.join(HERE, 'verify-authoring-export.mjs'), pkg_path2], capture_output=True, text=True)
say('   independent verifier on the new export (exit ' + str(v.returncode) + '):\n' + '\n'.join('     ' + x for x in (v.stdout + v.stderr).strip().splitlines()))

say('\n## 9. The boot / sweep trigger check, and the whole chain')
chk = subprocess.run(['npx', 'tsx', os.path.join(HERE, '..', '..', '2026-09-26', 'live', 'trigger-check.ts')],
                     capture_output=True, text=True, cwd=REPO, env={**os.environ, 'DATABASE_URL': PSQL})
say('   ' + ((chk.stdout + chk.stderr).strip().splitlines() or [''])[-1][:300])
chain = subprocess.run(['npm', 'run', '-s', 'ops:verify-audit-chain'], capture_output=True, text=True, cwd=REPO,
                       env={**os.environ, 'DATABASE_URL': PSQL})
for ln in (chain.stdout + chain.stderr).strip().splitlines():
    if 'secretSource' not in ln and 'lastChainHash' not in ln:
        say('   ' + ln)

open(os.path.join(OUT, 'live-run.txt'), 'w').write('\n'.join(lines) + '\n')
