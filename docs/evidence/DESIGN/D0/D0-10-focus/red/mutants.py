"""Show each d0Focus.test.ts check that was already green at HEAD failing on the case it exists to catch.

Each mutant is a copy of the working tree's styles folder (with this change) in the scratchpad, with one
edit; the test reads the copy through D0_FOCUS_STYLES. No tracked file is written.
Run: python3 -I mutants.py <scratch dir>
"""
import shutil, subprocess, sys, pathlib

R = pathlib.Path('/home/user/ClinicalSageAI-2-replit')
STYLES = R / 'client/src/concept2cure/v2/styles'
OUT = R / 'docs/evidence/DESIGN/D0/D0-10-focus/red'
SCRATCH = pathlib.Path(sys.argv[1])

TABS = '.c2c-v2 :is(.tab, .reg-tab, .sc-ws, .cc-tab) {\n'
INSET = '.c2c-v2 :is(.tab, .reg-tab, .sc-ws, .cc-tab, .seg-b, .ml-seg-btn):focus-visible { outline-offset: -2px; }'
LIGHT = 'box-shadow: 0 1px 2px rgb(20 20 19 / .06), 0 0 0 1px var(--border);'
DARK = '.c2c-v2.dark :is(.seg-b, .ml-seg-btn):is(.on, [data-on], [aria-pressed="true"], [aria-selected="true"], [aria-checked="true"]) {'
TEXTAREAS = '.c2c-v2 :is(.landing-input, .pj-composer textarea, .ct-composer textarea, .cmdk-in input):focus-visible { outline: none; }'
APPEND = None  # marker: append `new` to the end of the sheet

MUTANTS = {
    # fix 7
    'm1-an-item-leaves-the-tab-primitive': [('app-v2.css', TABS, '.c2c-v2 :is(.tab, .reg-tab, .sc-ws) {\n')],
    'm2-an-item-joins-without-the-ring': [('app-v2.css', TABS, '.c2c-v2 :is(.tab, .reg-tab, .sc-ws, .cc-tab, .cm-subtab) {\n')],
    'm3-the-inset-rule-removes-the-ring': [('app-v2.css', INSET, INSET.replace('outline-offset: -2px;', 'outline-offset: -2px; outline: none;'))],
    'm4-the-inset-rule-is-outranked': [('app-v2.css', INSET, INSET.replace('.c2c-v2 :is(', '.c2c-v2 :where('))],
    'm5-an-owner-sets-the-offset-back': [('misc-surfaces-v2.css', APPEND, '\n.c2c-v2 .rbm-tabs .reg-tab:focus-visible{outline-offset:2px;}\n')],
    # fix 12
    'm6-light-loses-its-ring': [('app-v2.css', LIGHT, 'box-shadow: 0 1px 2px rgb(20 20 19 / .06);')],
    'm7-dark-misses-a-state': [('app-v2.css', DARK, DARK.replace('[aria-pressed="true"], ', ''))],
    'm8-an-owner-drops-the-dark-ring': [('misc-surfaces-v2.css', APPEND, '\n.c2c-v2.dark .orch-views .seg-b.on{box-shadow:none;}\n')],
    # fix 13
    'm9-an-owner-removes-a-field-outline': [('coverage-v2.css', APPEND, '\n.c2c-v2 .vd-filter .c2c-input:focus{outline:none;}\n')],
    'm10-the-reviews-literal-text-area-change': [('app-v2.css', TEXTAREAS, TEXTAREAS.replace('outline: none;', 'outline: 2px solid transparent;'))],
    'm11-an-owner-removes-the-composer-outline': [('surfaces-v2.css', APPEND, '\n.c2c-v2 .pj-composer:focus-within{outline:none;}\n')],
}

for name, edits in MUTANTS.items():
    copy = SCRATCH / f'styles-{name}'
    if copy.exists():
        shutil.rmtree(copy)
    shutil.copytree(STYLES, copy)
    for sheet, old, new in edits:
        p = copy / sheet
        s = p.read_text()
        if old is APPEND:
            s = s + new
        else:
            assert s.count(old) == 1, (name, old[:70], s.count(old))
            s = s.replace(old, new)
        p.write_text(s)
    r = subprocess.run(['npx', 'vitest', 'run', 'client/src/concept2cure/v2/__tests__/d0Focus.test.ts', '--maxWorkers=1', '--reporter=verbose'],
                       cwd=R, capture_output=True, text=True, timeout=300, env={**__import__('os').environ, 'D0_FOCUS_STYLES': str(copy)})
    (OUT / f'd0Focus-{name}.txt').write_text(f'# mutant {name}: {edits}\n' + r.stdout + r.stderr)
    fails = [l.strip() for l in r.stdout.splitlines() if l.strip().startswith('×')]
    print(name, 'exit', r.returncode, 'failed', len(fails))
    for f in fails:
        print('   ', f.split(' > ', 2)[-1][:150])
