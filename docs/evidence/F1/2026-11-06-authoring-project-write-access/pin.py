"""Pin selected local code and static imports, not a full dynamic dependency graph."""
import hashlib,json,os,re,subprocess,sys
from pathlib import Path
p=Path(__file__).resolve().parent;r=p.parents[3];os.chdir(r)
name,*selected=sys.argv[1:]
queue=selected+['package.json','package-lock.json','tsconfig.json','vitest.config.ts','tests/setup.ts']
pattern=re.compile(r'''(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\(|\bimport\s*)['"]([^'"\s]+)['"]''')
def resolve(base,value):
 if value.startswith('.'): location=base.parent/value
 elif value.startswith('@shared/'): location=Path('shared')/value[8:]
 elif value.startswith('@/'): location=Path('client/src')/value[2:]
 else:return None
 location=Path(os.path.normpath(str(location)))
 choices=[location]
 if location.suffix=='.js':choices.insert(0,location.with_suffix('.ts'))
 if not location.suffix:choices += [Path(str(location)+x) for x in ['.ts','.tsx','.js','.jsx','.json']]+[location/x for x in ['index.ts','index.tsx','index.js']]
 return next((x for x in choices if x.is_file() and not str(x).startswith('..')),None)
seen=set()
while queue:
 name_in=str(queue.pop());f=Path(name_in)
 if name_in in seen or not f.is_file():continue
 seen.add(name_in)
 if f.suffix not in ['.ts','.tsx','.js','.jsx','.mjs']:continue
 source=f.read_text();queue += [str(t) for v in pattern.findall(source) if (t:=resolve(f,v))]
 queue += [v for v in re.findall(r'''['"]((?:db/)?migrations/[^'"\s]+\.sql)['"]''',source) if Path(v).is_file()]
data={'head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'selected':selected,'scope':'Selected code, static local imports, direct SQL and named test configs; not all dynamic inputs.','files':{n:hashlib.sha256(Path(n).read_bytes()).hexdigest() for n in sorted(seen)}}
(p/name).write_text(json.dumps(data,indent=2)+'\n');print(json.dumps({'freeze':name,'selected':len(selected),'inputs':len(seen)}))
