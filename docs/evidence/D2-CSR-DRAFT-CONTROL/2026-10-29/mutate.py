"""Apply one source mutation at a time, run the named tests, record the exit, restore the file byte for byte."""
import json, shutil, subprocess, sys, hashlib, os
ROOT = os.getcwd()  # run from the repository root
OUT = os.path.dirname(os.path.abspath(__file__))
E = 'client/src/concept2cure/v2/editor'
V = 'client/src/concept2cure/v2/__tests__'
PANEL_T = f'{V}/authoringDraftAlternatives.test.tsx'
WB_T = f'{E}/__tests__/workbenchDraftParagraphs.test.tsx'
UNIT_T = f'{E}/__tests__/draftAlternatives.test.ts'
M = [
 ('M1 paragraph author names no turn record', f'{E}/draftAlternatives.ts',
  "...(record?.status === 'recorded' ? { sourceRecord: record.id } : {})", "", [WB_T, UNIT_T]),
 ('M2 paragraphs proposed as the person, not AnA', f'{E}/draftAlternatives.ts',
  "return { id: ANA_SUGGESTION_AUTHOR_ID, name: 'AnA (draft alternative)'", "return { id: 'person', name: 'AnA (draft alternative)'", [WB_T, UNIT_T]),
 ('M3 the turn record is not passed to the governed-write gate', f'{E}/DraftAlternatives.tsx',
  "draftParagraphAuthor(draft.turnRecord), draft.turnRecord, false)", "draftParagraphAuthor(draft.turnRecord), undefined, false)", [WB_T]),
 ('M4 pairing by position instead of shared words', f'{E}/draftAlternatives.ts',
  "const score = similarity(paragraph, candidate);", "const score = j === Math.min(i, current.length - 1) ? 1 : 0;", [WB_T, UNIT_T]),
 ('M5 every alternative asks for the same tone', f'{E}/useAuthoringDraftReview.ts',
  "...request, tone: approach,", "...request,", [PANEL_T]),
 ('M6 switching does not change the candidate accepted', f'{E}/draftAlternatives.ts',
  "shownAlternative: index, draft: kept[index].draft,", "shownAlternative: index,", [PANEL_T, UNIT_T]),
 ('M7 switching drops the edits of the alternative left', f'{E}/draftAlternatives.ts',
  "i === shown && state.draft ? { ...a, body: state.body } : a", "a", [PANEL_T, UNIT_T]),
 ('M8 a later arrival moves the view', f'{E}/draftAlternatives.ts',
  "return { alternatives: [...(state.alternatives ?? []), alternative], pendingApproaches: pending };",
  "return { alternatives: [...(state.alternatives ?? []), alternative], pendingApproaches: pending, draft, body: draft.generated, shownAlternative: (state.alternatives ?? []).length };", [PANEL_T, UNIT_T]),
 ('M9 the workbench does not hand the panel its proposal door', f'{E}/DocumentWorkbench.tsx',
  "                    proposals={draftProposals}\n", "", [WB_T]),
 ('M10 the panel skips its own model refusal', f'{E}/DraftAlternatives.tsx',
  "return anaInsertRefusal(draft.turnRecord, false) ?? STANDARD_NOTE;", "return STANDARD_NOTE;", [WB_T]),
 ('M11 Discard keeps the alternatives', 'client/src/concept2cure/v2/surfaces/AuthoringAiDraft.tsx',
  "checkedContent: undefined, ...NO_ALTERNATIVES });", "checkedContent: undefined });", [PANEL_T]),
 ('M12 a failed alternative does not stop the run', f'{E}/useAuthoringDraftReview.ts',
  "        : `Couldn’t draft this section — ${sentence(result.message)}. Nothing was changed.`, 'error');\n      return;",
  "        : `Couldn’t draft this section — ${sentence(result.message)}. Nothing was changed.`, 'error');\n      continue;", [PANEL_T]),
 ('M13 a pair that changes nothing is proposed anyway', f'{E}/draftAlternatives.ts',
  "if (collapse(replacement) === input.current[target]) { unchanged.push(...paragraphs); continue; }", "", [UNIT_T]),
 ('M14 the empty-section addition loses draft order', f'{E}/draftAlternatives.ts',
  ".filter(i => input.draft[i] !== undefined).sort((a, b) => a - b);", ".filter(i => input.draft[i] !== undefined);", [UNIT_T]),
]
sha = lambda p: hashlib.sha256(open(p,'rb').read()).hexdigest()
results = []
for name, rel, old, new, tests in M:
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.join(OUT, 'mut'), exist_ok=True)
    backup = os.path.join(OUT, 'mut', os.path.basename(rel) + '.orig')
    shutil.copyfile(path, backup)
    before = sha(path)
    src = open(path).read()
    assert src.count(old) == 1, (name, src.count(old))
    open(path, 'w').write(src.replace(old, new))
    try:
        r = subprocess.run(['npx', 'vitest', 'run', '--config', 'vitest.config.ts', *tests], cwd=ROOT, capture_output=True, text=True, timeout=900)
        failed = [l.strip() for l in r.stdout.splitlines() if l.strip().startswith('×')]
    finally:
        shutil.copyfile(backup, path)
    assert sha(path) == before, name
    results.append({'mutation': name, 'file': rel, 'exitCode': r.returncode, 'killed': r.returncode != 0, 'failingTests': failed, 'restoredSha256': before})
    print(json.dumps(results[-1]), flush=True)
json.dump(results, open(os.path.join(OUT, 'mutations.json'), 'w'), indent=1)
print('killed', sum(x['killed'] for x in results), 'of', len(results))
sys.exit(0 if all(x['killed'] for x in results) else 1)
