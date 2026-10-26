"""Existing CSR, CRF and editor-handoff regression, with an explicit retained selection."""
import json
import subprocess
import sys
from pathlib import Path

packet = Path(__file__).resolve().parent
tests = json.loads((packet / 'regression-tests.json').read_text())
sys.exit(subprocess.run(['node', 'node_modules/vitest/vitest.mjs', 'run', *tests], check=False).returncode)
