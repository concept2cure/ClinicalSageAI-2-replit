"""Self-check for m3-tasks.json.

usage: selfcheck.py <m3-tasks.json> <source-dir with PMCxxxx.json> <existing gold-tasks.json>
Exit 1 on any failure. Rules mirror server/eval/pq/__tests__/gold-bank-floor.test.ts and
doc-quality-metrics.ts norm(): lowercase, collapse whitespace, trim.
"""
import json, re, sys
from collections import Counter

tasks_path, src_dir, bank_path = sys.argv[1:4]
tasks = json.load(open(tasks_path))
bank_ids = {t['id'] for t in json.load(open(bank_path))['tasks']}

ALLOWED = {'CC BY 4.0', 'CC BY 3.0', 'CC BY', 'CC BY-NC', 'CC BY-NC 4.0', 'CC BY-SA', 'CC BY-SA 4.0',
           'CC BY-NC-ND', 'CC BY-NC-ND 4.0', 'CC BY-NC-SA 4.0', 'CC0', 'CC0 1.0', 'public domain'}
SRC_KEYS = {'pmid', 'pmcid', 'doi', 'title', 'journal', 'year', 'license', 'section', 'retrieved'}

# What may sit between two verbatim slices: a dropped call-out phrase ("listed in",
# ", as listed in,", "; this is demonstrated in", "From,") or a whole sentence whose only
# content was a call-out ("The results are presented in.", "…is captured in.").
CALLOUT_GAP = re.compile(
    r'(?:[,;]?\s*(?:this is )?(?:as )?(?:listed|demonstrated|presented|provided|captured|included|shown) in(?: the)?[,.]?'
    r'|(?:[A-Z][^.]{0,120}\b(?:are|is) (?:presented|provided|captured|included|shown) in(?: the)?\.\s*)+'
    r'|presents the experimentally determined limits\.)'
)

def norm(v):
    return re.sub(r'\s+', ' ', str(v if v is not None else '').lower()).strip()

def clean_source(pmc):
    a = json.load(open(f'{src_dir}/{pmc}.json'))
    # the two edits the authoring rules allow: empty citation brackets and empty
    # figure/table call-out parentheses ("()", "(,)", "(and)", "(,,,,and)") left by the export
    t = re.sub(r'\s*\[[,\s]*\]', '', a['full_text'])
    t = re.sub(r'\s*\((?:[,\s]|and)*\)', '', t)
    t = re.sub(r',\s*as demonstrated in(?=\.)', '', t)  # "…, as demonstrated in [Figure N]."
    return re.sub(r'\s+', ' ', t)

fail = []
def check(cond, msg):
    if not cond:
        fail.append(msg)

gen = [t for t in tasks if t.get('taskType') == 'generation']
ext = [t for t in tasks if t.get('taskType') == 'extraction']
check(len(gen) == 12, f'generation tasks = {len(gen)} (want 12)')
check(len(ext) == 12, f'extraction tasks = {len(ext)} (want 12)')
check(len(tasks) == 24, f'total tasks = {len(tasks)}')

ids = [t['id'] for t in tasks]
dups = [i for i, n in Counter(ids).items() if n > 1]
check(not dups, f'duplicate ids: {dups}')
clash = sorted(set(ids) & bank_ids)
check(not clash, f'ids already in gold-tasks.json: {clash}')

segments_report = []
for t in tasks:
    tid = t['id']
    check(t.get('docType') == 'module-3-quality', f'{tid}: docType {t.get("docType")!r}')
    check(re.fullmatch(r'm3-[a-z0-9-]+-(generate|extract)', tid) is not None, f'{tid}: id pattern')
    check(tid.endswith('-generate') == (t['taskType'] == 'generation'), f'{tid}: id suffix vs taskType')
    check('candidateContent' not in t and 'candidateExtraction' not in t, f'{tid}: carries a captured candidate')
    inp = t.get('input')
    check(isinstance(inp, str) and inp.strip(), f'{tid}: empty input')
    n_in = norm(inp)
    src = t.get('source') or {}
    check(SRC_KEYS <= set(src), f'{tid}: source missing {sorted(SRC_KEYS - set(src))}')
    check(src.get('license') in ALLOWED, f'{tid}: licence {src.get("license")!r} not in allowed list')
    check(src.get('retrieved') == '2026-11-01', f'{tid}: retrieved date')
    check(bool(t.get('tags')), f'{tid}: no tags')
    check(any(re.fullmatch(r'3\.2\.[SP](\.\d+)+', g) for g in t.get('tags', [])), f'{tid}: no CTD section tag')

    # Verbatim provenance, anchored: walk the input left to right; each slice is the longest
    # prefix of what remains that occurs in the cleaned source at or after the previous
    # slice's end. Slices therefore sit in source order, and every gap between two slices
    # must be a figure/table call-out remnant, never arbitrary text (a reworded sentence or
    # a substituted value). The first slice may start anywhere; the last may stop anywhere.
    S = clean_source(src['pmcid'])
    i, prev_end, nseg = 0, None, 0
    while i < len(inp):
        while i < len(inp) and inp[i] == ' ':
            i += 1
        if i >= len(inp):
            break
        base = prev_end if prev_end is not None else 0
        if S.find(inp[i], base) < 0:
            fail.append(f'{tid}: text not in source order from: {inp[i:i + 60]!r}')
            break
        lo, hi = 1, len(inp) - i          # largest L with inp[i:i+L] found at/after base
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if S.find(inp[i:i + mid], base) >= 0:
                lo = mid
            else:
                hi = mid - 1
        piece = inp[i:i + lo]
        at = S.find(piece, base)
        if prev_end is not None:
            gap = S[prev_end:at].strip()
            # the previous slice may have swallowed the dropped sentence's first word
            # ("…formulations. The" + "results are presented in. … The"): try it rotated
            tail = prev_piece.rstrip().rsplit(' ', 1)[-1]
            rot = (tail + ' ' + gap[:-len(tail)]).strip() if tail and gap.endswith(tail) else None
            if gap and not CALLOUT_GAP.fullmatch(gap) and not (rot and CALLOUT_GAP.fullmatch(rot)):
                fail.append(f'{tid}: gap between slices is not a call-out remnant: {gap[:90]!r} '
                            f'(input continues {piece[:40]!r})')
                break
        prev_end, i, nseg, prev_piece = at + len(piece), i + lo, nseg + 1, piece
    segments_report.append((tid, nseg))

    if t['taskType'] == 'generation':
        check(300 <= len(inp) <= 1800, f'{tid}: input length {len(inp)} outside 300-1800')
        rs, fp = t.get('requiredSections', []), t.get('forbiddenPatterns', [])
        check(3 <= len(rs) <= 5, f'{tid}: requiredSections count {len(rs)}')
        check(3 <= len(fp) <= 5, f'{tid}: forbiddenPatterns count {len(fp)}')
        for p in fp:
            check(norm(p) not in n_in, f'{tid}: forbidden pattern {p!r} occurs in its own input')
            check(' ' in p or len(p) >= 8, f'{tid}: forbidden pattern {p!r} is a single word shorter than 8')
        check('expectedFields' not in t, f'{tid}: generation task carries expectedFields')
    else:
        check(200 <= len(inp) <= 1500, f'{tid}: input length {len(inp)} outside 200-1500')
        ef = t.get('expectedFields') or {}
        check(3 <= len(ef) <= 6, f'{tid}: expectedFields count {len(ef)}')
        for k, v in ef.items():
            check(re.fullmatch(r'[a-z][a-z0-9_]*', k) is not None, f'{tid}: field key {k!r} not snake_case')
            check(norm(v) != '' and norm(v) in n_in, f'{tid}.{k}: expected value {v!r} not in input')

articles = {t['source']['pmid'] for t in tasks}
check(len(articles) >= 6, f'distinct articles = {len(articles)}')
drugs = {g for t in tasks for g in t['tags'] if g in {
    'itraconazole', 'latanoprost', 'ritlecitinib', 'velpatasvir', 'miglitol', 'ramipril', 'cisatracurium',
    'levothyroxine', 'meropenem', 'amiodarone', 'bupropion', 'naltrexone'}}
check(len(drugs) >= 6, f'distinct drug substances = {len(drugs)}')

print(f'tasks: {len(tasks)} (generation {len(gen)}, extraction {len(ext)})')
print(f'distinct articles: {len(articles)}; distinct drug substances: {len(drugs)}')
print('licences:', dict(Counter(t["source"]["license"] for t in tasks)))
print('verbatim segments per input (1 = one contiguous slice; >1 = slices joined where a call-out was dropped):')
print('  ' + ', '.join(f'{tid.removeprefix("m3-")}={n}' for tid, n in segments_report))
if fail:
    print(f'FAIL ({len(fail)}):')
    for f in fail:
        print('  -', f)
    sys.exit(1)
print('PASS: all checks')
