import json,subprocess,sys
from pathlib import Path
p=Path(__file__).resolve().parent
sys.exit(subprocess.run(['npx','vitest','run',*json.loads((p/'test-selection.json').read_text())['tests']]).returncode)
