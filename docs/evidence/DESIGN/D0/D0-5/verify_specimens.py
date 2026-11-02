#!/usr/bin/env python3
"""Verify every rule a D0-5 specimen copies against the stylesheet it came from.

For each preview file, the rules above the "specimen only" marker are copied
from the app. Each rule (one line, or a multi-line block) must appear in a
source sheet: a one-line rule as an identical line; a block as its selector
line followed, in order and inside the same source block, by each of its lines.
Rules below the marker that show a :hover or :focus state at rest (`.is-hover`,
`.is-focus`) must carry declarations identical to a source rule's.
Prints file:line for every rule, and exits 1 if any is not found.
"""
import re
import sys
from pathlib import Path

ROOT = Path(sys.argv[1])
SOURCES = [
    'client/src/concept2cure/v2/styles/app-v2.css',
    'client/src/concept2cure/v2/styles/journey-v2.css',
    'client/src/concept2cure/v2/styles/surfaces-v2.css',
    'client/src/concept2cure/v2/styles/authoring-v2.css',
    'design-system/colors_and_type.css',
]
SPECIMENS = [
    'design-system/preview/_base.css',
    'design-system/preview/components-buttons.html',
    'design-system/preview/components-cards.html',
    'design-system/preview/components-inputs.html',
    'design-system/preview/components-badges.html',
    'design-system/preview/type-body.html',
]

src = {s: [l.strip() for l in (ROOT / s).read_text().splitlines()] for s in SOURCES}


def strip_comment(line: str) -> str:
    return re.sub(r'/\*.*?\*/', '', line).strip()


def copied_section(text: str) -> list[str]:
    if '<style>' in text:
        text = text.split('<style>', 1)[1].split('</style>', 1)[0]
    marker = re.search(r'──\s*specimen (only|layout only)', text)
    head = text[: marker.start()] if marker else text
    # drop the comment that opens the marker line
    head = head.rsplit('/*', 1)[0] if marker else head
    out, in_comment = [], False
    for raw in head.splitlines():
        line = raw.strip()
        if in_comment:
            if '*/' in line:
                in_comment = False
                line = line.split('*/', 1)[1].strip()
            else:
                continue
        if line.startswith('/*') and '*/' not in line:
            in_comment = True
            continue
        if line.startswith('/*') and line.endswith('*/'):
            continue
        if line.startswith('@import'):
            continue
        if line:
            out.append(line)
    return out


def statements(lines: list[str]):
    i = 0
    while i < len(lines):
        line = lines[i]
        opens, closes = line.count('{'), line.count('}')
        if opens > closes:
            block, depth = [line], opens - closes
            i += 1
            while i < len(lines) and depth > 0:
                block.append(lines[i])
                depth += lines[i].count('{') - lines[i].count('}')
                i += 1
            yield block
        else:
            yield [line]
            i += 1


def find(block: list[str]):
    """Return (source, first line, kind) or None."""
    for s, sl in src.items():
        norm = [strip_comment(x) if '/*' in x and '*/' in x and not x.startswith('/*') else x for x in sl]
        first = block[0]
        for i, l in enumerate(sl):
            if l != first and norm[i] != strip_comment(first):
                continue
            if len(block) == 1:
                return s, i + 1, 'line'
            # contiguous?
            if [strip_comment(x) for x in sl[i:i + len(block)]] == [strip_comment(x) for x in block]:
                return s, i + 1, f'block {i + 1}-{i + len(block)}'
            # ordered subset inside the same source block
            j, depth, k = i + 1, l.count('{') - l.count('}'), 1
            while j < len(sl) and depth > 0 and k < len(block):
                if strip_comment(sl[j]) == strip_comment(block[k]):
                    k += 1
                depth += sl[j].count('{') - sl[j].count('}')
                j += 1
            if k == len(block):
                return s, i + 1, f'subset of the block at {i + 1}'
    return None


def body(rule: str) -> str:
    m = re.search(r'\{(.*)\}', rule)
    return re.sub(r'\s+', '', m.group(1)) if m else ''


bad = 0
for spec in SPECIMENS:
    text = (ROOT / spec).read_text()
    print(f'\n== {spec}')
    for block in statements(copied_section(text)):
        hit = find(block)
        head = block[0][:96]
        if hit:
            print(f'  ok   {hit[0]}:{hit[1]} ({hit[2]})  {head}')
        else:
            bad += 1
            print(f'  MISS {head}')
    # hover/focus shown at rest
    for line in text.splitlines():
        if re.search(r'\.is-(hover|focus)\s*\{', line):
            b = body(line)
            where = None
            for s, sl in src.items():
                for i, l in enumerate(sl):
                    if (':hover' in l or ':focus' in l) and body(l) == b:
                        where = f'{s}:{i + 1}'
                        break
                    # a multi-line focus rule: selector line, then the body on the next line
                    if (':hover' in l or ':focus' in l) and l.endswith('{') and i + 1 < len(sl) and re.sub(r'\s+', '', sl[i + 1]) == b:
                        where = f'{s}:{i + 1}-{i + 2}'
                        break
                if where:
                    break
            if where:
                print(f'  ok   state at rest = {where}  {line.strip()[:80]}')
            else:
                bad += 1
                print(f'  MISS state at rest  {line.strip()[:96]}')

# The icon-only button, flattened from authoring-v2.css's `.c2c-v2 { … }` nesting.
auth = src['client/src/concept2cure/v2/styles/authoring-v2.css']
for i, l in enumerate(auth):
    if l == '.dcv-bar .btn.ed-ico {' and auth[i + 1:i + 3] == ['width: 32px;', 'padding: 0;']:
        print(f'\n  ok   flattened .c2c-v2 .dcv-bar .btn.ed-ico {{ width: 32px; padding: 0; }} = authoring-v2.css:{i + 1}-{i + 4}')
        break
else:
    bad += 1
    print('\n  MISS flattened .dcv-bar .btn.ed-ico')

# The README's type table against the tokens declared in colors_and_type.css.
ct = (ROOT / 'design-system/colors_and_type.css').read_text().splitlines()
decl = {}
for i, l in enumerate(ct):
    m = re.match(r'\s*(--fs-[a-z]+):\s*(\d+)px;', l)
    if m:
        decl[m.group(1)] = (int(m.group(2)), i + 1)
readme = (ROOT / 'design-system/README.md').read_text()
print('\n== design-system/README.md type table against colors_and_type.css')
for tok, (px, line) in sorted(decl.items(), key=lambda kv: -kv[1][0]):
    m = re.search(r'\| `' + re.escape(tok) + r'` \| (\d+)px', readme)
    ok = bool(m) and int(m.group(1)) == px
    bad += 0 if ok else 1
    print(f'  {"ok  " if ok else "MISS"} {tok}: README {m.group(1) if m else "-"}px, colors_and_type.css:{line} {px}px')
rows = re.findall(r'\| `(--fs-[a-z]+)` \|', readme)
extra = sorted(set(rows) - set(decl))
if extra:
    bad += 1
    print(f'  MISS README names tokens that are not declared: {extra}')
app = (ROOT / 'client/src/concept2cure/v2/styles/app-v2.css').read_text()
own = re.findall(r'^\s*(--fs-[a-z]+)\s*:', app, re.M)
print(f'  app-v2.css declares {own or "no"} --fs-* token(s)')
# The specimen labels in type-body.html against the same tokens.
tb = (ROOT / 'design-system/preview/type-body.html').read_text()
print('\n== design-system/preview/type-body.html labels against colors_and_type.css')
for tok, (px, line) in decl.items():
    m = re.search(r'<span class="mono">' + re.escape(tok) + r'</span> · (\d+)', tb)
    ok = bool(m) and int(m.group(1)) == px
    bad += 0 if ok else 1
    print(f'  {"ok  " if ok else "MISS"} {tok}: label {m.group(1) if m else "-"}, colors_and_type.css:{line} {px}px')

print(f'\n{"FAIL" if bad else "OK"}: {bad} rule(s) not found in the source sheets')
sys.exit(1 if bad else 0)
