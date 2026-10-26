import json,subprocess,sys
from pathlib import Path
p=Path(__file__).resolve().parent
files=json.loads((p/'lint-selection.json').read_text())['files']
r=subprocess.run(['npx','eslint',*files,'--format','json','--output-file',str(p/'lint-details.json')])
data=json.loads((p/'lint-details.json').read_text())
print(json.dumps({'files':len(files),'errors':sum(f['errorCount'] for f in data),'warnings':sum(f['warningCount'] for f in data)}))
sys.exit(r.returncode)
