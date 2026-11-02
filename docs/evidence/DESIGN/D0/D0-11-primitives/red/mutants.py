#!/usr/bin/env python3
"""Mutants of this change, each applied to a copy of client/src/concept2cure/v2/styles and run
through d0Primitives.test.ts via D0_PRIMITIVES_STYLES. Each must turn the test red.
Usage, from the repository root: python3 docs/evidence/DESIGN/D0/D0-11-primitives/red/mutants.py <scratch dir>"""
import os, shutil, subprocess, sys

SRC = 'client/src/concept2cure/v2/styles'
OUT = os.path.dirname(os.path.abspath(__file__))
scratch = sys.argv[1]

MUTANTS = {
    # an unscoped alias reaches mdx's .seg-btn, which renders inside .c2c-v2
    'm1-seg-btn-alias-unscoped': ('app-v2.css', '.c2c-v2 :is(.seg-b, .ml-seg-btn), .c2c-v2 .adm-access .seg-btn {', '.c2c-v2 :is(.seg-b, .ml-seg-btn, .seg-btn) {'),
    # a bare tone rule comes back, scoped only by the shell root
    'm2-bare-tone-back': ('misc-surfaces-v2.css', '.c2c-v2 .cro-pipe-n.tone-ai{background:var(--ai-muted);}', '.c2c-v2 .cro-pipe-n.tone-ai{background:var(--ai-muted);}\n.c2c-v2 .tone-idle{background:var(--idle-muted);color:var(--text-300);}'),
    # an element that showed a bare fill loses it
    'm3-rejected-tag-loses-its-fill': ('coverage-v2.css', '.c2c-v2 .rv-wf-tag.tone-err{ background:var(--error-muted); color:var(--error); }', ''),
    # the lift comes back on the retired primary
    'm4-sp-primary-lifts-again': ('journey-v2.css', '.c2c-v2 .sp-primary{flex-shrink:0;white-space:nowrap;}', '.c2c-v2 .sp-primary{flex-shrink:0;white-space:nowrap;}\n.c2c-v2 .sp-primary:hover{transform:translateY(-1px);}'),
    # the disabled primary keeps the canonical orange border
    'm5-disabled-primary-keeps-orange-border': ('journey-v2.css', 'background:var(--bg-200);border-color:transparent;color:var(--text-400);', 'background:var(--bg-200);color:var(--text-400);'),
    # admin's primary comes back and wins on load order
    'm6-admin-primary-back': ('admin-access.css', '.adm-access .btn.small { padding: 6px 11px; font-size: 12px; }', '.adm-access .btn.small { padding: 6px 11px; font-size: 12px; }\n.adm-access .btn.primary { background: var(--accent-strong); border-color: transparent; color: var(--accent-on-strong); }'),
    # the card header stops wrapping
    'm7-card-header-nowrap': ('app-v2.css', '.c2c-v2 .pj-card-h { display: flex; flex-wrap: wrap;', '.c2c-v2 .pj-card-h { display: flex;'),
    # the regulation line goes back to --text-400
    'm8-regulation-line-text-400': ('app-v2.css', '.c2c-empty-reg { margin-top: 6px; font-size: var(--fs-caption); color: var(--text-300); }', '.c2c-empty-reg { margin-top: 6px; font-size: var(--fs-caption); color: var(--text-400); }'),
}

lines = []
for name, (sheet, old, new) in MUTANTS.items():
    dst = os.path.join(scratch, name)
    shutil.rmtree(dst, ignore_errors=True)
    shutil.copytree(SRC, dst)
    path = os.path.join(dst, sheet)
    text = open(path).read()
    assert text.count(old) == 1, f'{name}: anchor not found once in {sheet}'
    open(path, 'w').write(text.replace(old, new))
    env = dict(os.environ, D0_PRIMITIVES_STYLES=dst)
    run = subprocess.run(['npx', 'vitest', 'run', '--config', 'vitest.config.ts', '--maxWorkers=1',
                          'client/src/concept2cure/v2/__tests__/d0Primitives.test.ts'],
                         env=env, capture_output=True, text=True)
    out = run.stdout + run.stderr
    with open(os.path.join(OUT, f'd0Primitives-{name}.txt'), 'w') as f:
        f.write(f'# mutant {name}: in {sheet}, replace\n#   {old!r}\n# with\n#   {new!r}\n# exit {run.returncode}\n')
        f.write(out)
    failed = [l.split('> ')[-1] for l in out.splitlines() if l.strip().startswith('×')]
    lines.append(f'{name}: exit {run.returncode}, {len(failed)} failed: ' + ' | '.join(failed))
open(os.path.join(OUT, 'mutants-summary.txt'), 'w').write('\n'.join(lines) + '\n')
print('\n'.join(lines))
