"""Build server/services/cmc/knowledge/cmc-regulatory-record.json from the research
workflow journal. Prefers each group's VERIFIED corpus; falls back to the
researcher's only when the verifier did not run (and marks it). Normalises CTD
codes and authority names; drops dangling source ids; reports every repair."""
import json, re, sys
JOURNAL = sys.argv[1]; OUT = sys.argv[2]; REPORT = sys.argv[3]
started, res = {}, {}
for line in open(JOURNAL):
    e = json.loads(line)
    if e['type'] == 'started': started[e['agentId']] = e['label']
    if e['type'] == 'result' and isinstance(e.get('result'), dict): res[started.get(e['agentId'])] = e['result']
AUTH = {'ich':'ICH','fda':'FDA','us fda':'FDA','ec':'EC','european commission':'EC','ema':'EMA','mhra':'MHRA','swissmedic':'Swissmedic',
        'mhlw':'MHLW','pmda':'PMDA','mhlw/pmda':'PMDA','pmda/mhlw':'PMDA','mfds':'MFDS','nmpa':'NMPA','nmpa/cde':'NMPA','cde':'NMPA','health canada':'Health Canada',
        'tga':'TGA','anvisa':'ANVISA','cdsco':'CDSCO','hsa':'HSA','who':'WHO','pic/s':'PIC/S','pics':'PIC/S','eu':'EC','european union':'EC'}
report = []
def auth(a):
    k = str(a).strip().lower()
    if k in AUTH: return AUTH[k]
    # Academic literature is its own authority: a paper co-authored by agency
    # staff is not that agency's guidance.
    if k.startswith('peer-reviewed') or 'literature' in k or k.startswith('journal'):
        report.append(f'authority normalised: {a} -> Literature'); return 'Literature'
    for key, v in AUTH.items():
        if k.startswith(key): return v
    CONTAINS = [('edqm','EDQM'),('european pharmacopoeia','EDQM'),('nmpa','NMPA'),('cfda','NMPA'),('chinese pharmacopoeia','NMPA'),('samr','NMPA'),
                ('npc standing','NMPA'),('pmda','PMDA'),('mhlw','MHLW'),('japanese pharmacopoeia','MHLW'),('mfds','MFDS'),('health canada','Health Canada'),
                ('tga','TGA'),('anvisa','ANVISA'),('cdsco','CDSCO'),('hsa','HSA'),('swissmedic','Swissmedic'),('mhra','MHRA'),('fda','FDA'),('usp','USP'),
                ('united states pharmacopeia','USP'),('ema','EMA'),('european commission','EC'),('who','WHO'),('pic/s','PIC/S'),('swiss','Swissmedic'),('uk government','MHRA')]
    for needle, v in CONTAINS:
        if needle in k:
            report.append(f'authority normalised: {a} -> {v}'); return v
    report.append(f'authority kept as given: {a}'); return str(a).strip()
def ctd(v):
    parts = v if isinstance(v, list) else re.split(r'[;,]', str(v or ''))
    out = []
    for p in parts:
        p = p.strip()
        if not p or p.lower() in ('n/a', 'na', 'none'): continue
        m = re.match(r'^m?(\d(\.\d+)*(\.[SPARspar](\.\d+)*)?)', p)
        if not m: continue
        c = '.'.join(x.upper() if re.fullmatch(r'[spar]', x, re.I) else x for x in m.group(1).split('.'))
        if c not in out: out.append(c)
    return out
groups, topics = [], []
for label, r in res.items():
    if label and label.startswith('verify:'): groups.append((label[7:], r, True))
for label, r in res.items():
    if label and label.startswith('research:') and not any(g[0] == label[9:] for g in groups): groups.append((label[9:], r, False))
for label, r in res.items():
    if label and label.startswith('topic:'): topics.append((label[6:], r))
sources, requirements, pathways, notes, seen = [], [], [], [], {}
for key, r, verified in sorted(groups):
    if not verified: report.append(f'group {key}: UNVERIFIED (verifier did not run) — entries capped at medium confidence')
    cap = (lambda c: c) if verified else (lambda c: 'medium' if c == 'high' else c)
    for s in r['sources']:
        sid = s['id'].strip()
        if sid in seen:
            report.append(f'duplicate source id {sid} ({key}) — first kept'); continue
        seen[sid] = True
        s = dict(s); s['id'] = sid; s['authority'] = auth(s['authority']); s['ctdSections'] = ctd(s.get('ctdSections'))
        s['confidence'] = cap(s['confidence']); s.setdefault('corroboratingUrls', []); s.setdefault('uncertainty', '')
        if not re.fullmatch(r'\d{4}(-\d{2}(-\d{2})?)?', str(s.get('date', '')).strip()):
            report.append(f"source {sid}: date '{s.get('date')}' not established -> undated, low confidence")
            s['date'] = 'undated'; s['confidence'] = 'low'
            s['uncertainty'] = (s['uncertainty'] + ' ' if s['uncertainty'] else '') + 'Adoption date not established.'
        if not verified: s['uncertainty'] = (s['uncertainty'] + ' ' if s['uncertainty'] else '') + 'Not independently re-verified.'
        sources.append(s)
src_ids = {s['id'] for s in sources}
rid = set()
for key, r, verified in sorted(groups):
    cap = (lambda c: c) if verified else (lambda c: 'medium' if c == 'high' else c)
    for q in r['requirements']:
        q = dict(q); ids = [i for i in q['sourceIds'] if i in src_ids]
        if len(ids) < len(q['sourceIds']): report.append(f"requirement {q['id']}: dropped dangling source ids {sorted(set(q['sourceIds']) - src_ids)}")
        if not ids: report.append(f"requirement {q['id']}: no resolvable source — DROPPED"); continue
        if q['id'] in rid: q['id'] = f"{key}-{q['id']}"
        rid.add(q['id'])
        q['sourceIds'] = ids; q['authority'] = auth(q['authority']); q['ctdSections'] = ctd(q.pop('ctdSection', q.get('ctdSections')))
        q['confidence'] = cap(q['confidence']); requirements.append(q)
    for p in r['pathways']:
        p = dict(p); ids = [i for i in p['sourceIds'] if i in src_ids]
        if not ids: report.append(f"pathway {p['authority']} {p['applicationName']}: no resolvable source — DROPPED"); continue
        p['sourceIds'] = ids; p['authority'] = auth(p['authority']); p['confidence'] = cap(p['confidence']); pathways.append(p)
nid = set()
for key, t in sorted(topics):
    for n in t['notes']:
        n = dict(n)
        if not n.get('citations'): report.append(f"note {n['id']}: no citations — DROPPED"); continue
        if n['id'] in nid: n['id'] = f"{key}-{n['id']}"
        nid.add(n['id']); n['ctdSections'] = ctd(n.get('ctdSections')); notes.append(n)
    if t.get('gaps'): report.append(f'topic {key} gaps: {t["gaps"][:400]}')
record = {
  'asOf': '2026-10-04',
  'method': ('Built by the CMC/Module 3 lane on 2026-10-04 from a multi-agent research run: one researcher per authority group '
             '(ICH; FDA; EU; UK and Switzerland; Japan and Korea; China; Canada and Australia; Brazil, India, Singapore, WHO and PIC/S), '
             'each re-verified by an independent agent that re-searched every source and corrected or deleted unsupported entries, '
             'plus four academic deep dives citing peer-reviewed literature (PubMed/PMC) and industry white papers. Regulator websites '
             'could not be fetched from the build environment, so facts rest on corroborating search results and literature; each entry '
             'carries its confidence and what could not be established. Check a draft or low-confidence entry against the authority before relying on it.'),
  'sources': sources, 'requirements': requirements, 'pathways': pathways, 'notes': notes,
}
json.dump(record, open(OUT, 'w'), indent=1, ensure_ascii=False)
open(REPORT, 'w').write('\n'.join(report))
print(f'sources {len(sources)} requirements {len(requirements)} pathways {len(pathways)} notes {len(notes)}; repairs {len(report)}')
