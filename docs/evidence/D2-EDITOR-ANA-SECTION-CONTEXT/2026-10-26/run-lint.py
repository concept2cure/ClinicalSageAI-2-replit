import json,subprocess,sys
from pathlib import Path
p=Path(__file__).resolve().parent
files=json.loads((p/'lint-selection.json').read_text())['files']
r=subprocess.run(['npx','eslint',*files,'--format','json','--output-file',str(p/'lint-details.json')])
f=json.loads((p/'lint-details.json').read_text())
print(json.dumps({'files':len(files),'errors':sum(v['errorCount'] for v in f),'warnings':sum(v['warningCount'] for v in f)}))
sys.exit(r.returncode)
