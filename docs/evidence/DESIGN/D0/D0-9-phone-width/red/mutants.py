import hashlib, subprocess, sys, pathlib
R = pathlib.Path('/home/user/ClinicalSageAI-2-replit')
APP = R / 'client/src/concept2cure/v2/styles/app-v2.css'
JOU = R / 'client/src/concept2cure/v2/styles/journey-v2.css'
OUT = R / 'docs/evidence/DESIGN/D0/D0-9-phone-width/red'
NEW16 = "@media (pointer: coarse) {\n  .c2c-v2 :is(.de-textarea, .landing-input, .pj-composer textarea, .ct-composer textarea) { font-size: 16px; }\n}\n"
MUTANTS = {
  'm1-16px-rule-in-the-inputs-block': [(APP, NEW16, ''),
     (APP, "  .c2c-v2 :is(.c2c-input, .de-input, .de-select) { min-height: 44px; font-size: 16px; } /* iOS does not zoom at ≥16px */\n",
           "  .c2c-v2 :is(.c2c-input, .de-input, .de-select) { min-height: 44px; font-size: 16px; } /* iOS does not zoom at ≥16px */\n  .c2c-v2 :is(.de-textarea, .landing-input, .pj-composer textarea, .ct-composer textarea) { font-size: 16px; }\n")],
  'm2-d5-0-copy-not-folded': [(APP, "@media (max-width: 640px){\n  .c2c-v2 [data-work-area] .pj-sec-h{flex-wrap:wrap;}",
     "@media (max-width: 640px){\n  .c2c-v2 [data-work-area] .pj-sec > .reg-tbl,\n  .c2c-v2 [data-work-area] .pj-sec > .pj-card-b > .reg-tbl{display:block;overflow-x:auto;}\n  .c2c-v2 [data-work-area] .pj-sec-h{flex-wrap:wrap;}")],
  'm3-copy-in-another-sheet': [(JOU, "  .c2c-v2 .de-f .de-btn.primary { flex: 1 1 auto; }\n",
     "  .c2c-v2 .de-f .de-btn.primary { flex: 1 1 auto; }\n  .c2c-v2 .pj-card > .reg-tbl { display: block; overflow-x: auto; }\n")],
  'm4-scoped-rule-outranks-16px': [(APP, NEW16, NEW16 + ".c2c-v2 .pj .pj-composer textarea { font-size: 15px; }\n")],
  'm5-tasks-column-rule-back': [(APP, "@media (max-width:760px){\n  .c2c-v2 .tb .c2c-error-state",
     "@media (max-width:760px){\n  .c2c-v2 .tb .ph{flex-direction:column;align-items:stretch;gap:12px;}\n  .c2c-v2 .tb .c2c-error-state")],
  'm6-equal-halves-kept': [(JOU, "  .c2c-v2 .de-f .de-btn.ghost { flex: 0 0 auto; }\n", "")],
  'm7-footer-does-not-wrap': [(JOU, "  .c2c-v2 .de-f { flex-wrap: wrap; padding-bottom", "  .c2c-v2 .de-f { padding-bottom")],
  'm8-label-may-wrap': [(JOU, "font-weight:500;white-space:nowrap;transition:", "font-weight:500;transition:")],
}
md5 = lambda p: hashlib.md5(p.read_bytes()).hexdigest()
for name, edits in MUTANTS.items():
    before = {p: (p.read_bytes(), md5(p)) for p in {APP, JOU}}
    try:
        for p, old, new in edits:
            s = p.read_text()
            assert s.count(old) == 1, (name, old[:60], s.count(old))
            p.write_text(s.replace(old, new))
        r = subprocess.run(['npx', 'vitest', 'run', 'client/src/concept2cure/v2/__tests__/d0PhoneWidth.test.ts', '--maxWorkers=1', '--reporter=verbose'],
                           cwd=R, capture_output=True, text=True, timeout=300)
        (OUT / f'd0PhoneWidth-{name}.txt').write_text(r.stdout + r.stderr)
        fails = [l.strip() for l in (r.stdout).splitlines() if l.strip().startswith('×')]
        print(name, 'exit', r.returncode, 'failed', len(fails))
        for f in fails: print('   ', f.split(' > ', 2)[-1][:150])
    finally:
        for p, (b, h) in before.items():
            p.write_bytes(b); assert md5(p) == h
print('restored', md5(APP), md5(JOU))
