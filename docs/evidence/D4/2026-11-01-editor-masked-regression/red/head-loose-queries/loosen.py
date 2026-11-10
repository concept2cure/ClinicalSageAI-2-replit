import re, sys, pathlib
REPO = '/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/'
src_dir = pathlib.Path(REPO + '__tests__')
out_dir = pathlib.Path(sys.argv[1])
names = ['authoringReasonForChange', 'authoringSaveFilingCommit', 'authoringSectionCheckRecord',
         'documentAuthoringAuditRail', 'documentAuthoringEditor']
save_exact = re.compile(r"within\(screen\.getByRole\('group', \{ name: 'Save and sign' \}\)\)\s*\n\s*\.getByRole\('button', \{ name: /\^Save\(\?:d\)\?\$/i \}\)")
check_exact = re.compile(r"name: /\^Check\$/ \}")
for n in names:
    text = (src_dir / f'{n}.test.tsx').read_text()
    text, ns = save_exact.subn("screen.getByRole('button', { name: /Save/i })", text)
    text, nc = check_exact.subn("name: /check/i }", text)
    text = text.replace("from '../", "from '" + REPO)
    (out_dir / f'{n}.loose.test.tsx').write_text(text)
    print(f'{n}: save queries loosened={ns} check queries loosened={nc}')
