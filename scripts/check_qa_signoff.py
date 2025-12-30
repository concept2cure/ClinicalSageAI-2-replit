#!/usr/bin/env python3
"""Check that regulatory/QA_REVIEW_CHECKLIST.md has reviewer name and date filled in.
Exits 0 if signed, 1 otherwise.
"""
import re
import sys

path = 'regulatory/QA_REVIEW_CHECKLIST.md'
try:
    with open(path) as fh:
        text = fh.read()
except FileNotFoundError:
    print(f'Missing {path}', file=sys.stderr)
    sys.exit(1)

m_reviewer = re.search(r'^Reviewer:\s*(.*)$', text, flags=re.MULTILINE)
m_date = re.search(r'^Date:\s*(.*)$', text, flags=re.MULTILINE)

if not m_reviewer or not m_date:
    print('QA checklist missing Reviewer or Date lines', file=sys.stderr)
    sys.exit(1)

rev = m_reviewer.group(1).strip()
dt = m_date.group(1).strip()

if rev == '' or dt == '':
    print('QA checklist not signed: Reviewer or Date empty', file=sys.stderr)
    sys.exit(1)

print(f'QA checklist signed by {rev} on {dt}')
sys.exit(0)
