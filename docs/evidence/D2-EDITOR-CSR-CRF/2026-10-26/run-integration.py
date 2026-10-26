import json, subprocess, sys
from pathlib import Path
packet=Path(__file__).resolve().parent
tests=json.loads((packet/'test-selection.json').read_text())['tests']
sys.exit(subprocess.run(['npx','vitest','run',*tests]).returncode)
