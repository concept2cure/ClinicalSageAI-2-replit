import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
const root = resolve(import.meta.dirname, '../..');
const postCreate = resolve(root, '.devcontainer/post-create.sh');

// Real venv/pip/import checks, using tiny local fixture wheels: these exercise provisioning, not DOCX generation.
// The actual Node-to-Python document round trip is a separate native acceptance check.
export function docxFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'c2c-docx-runtime-'));
  const project = join(directory, 'project'), wheels = join(directory, 'wheels'), state = join(directory, 'state with space');
  mkdirSync(project); mkdirSync(wheels);
  const requirements = join(project, 'requirements.txt');
  writeFileSync(requirements, 'python-docx==1.2.0 # canonical pin\nlxml==6.1.1\n');
  const built = spawnSync('python3', ['-I', '-c', `
import base64,csv,hashlib,io,pathlib,sys,zipfile
wheelhouse=pathlib.Path(sys.argv[1])
for name,version in [('python_docx','1.2.0'),('python_docx','1.3.0'),('lxml','6.1.1')]:
 package='docx' if name=='python_docx' else name
 info=f'{name}-{version}.dist-info'
 files={f'{package}/__init__.py':f'__version__ = {version!r}\\n',
  f'{info}/METADATA':f'Metadata-Version: 2.1\\nName: {name.replace("_","-")}\\nVersion: {version}\\n',
  f'{info}/WHEEL':'Wheel-Version: 1.0\\nGenerator: c2c-test-fixture\\nRoot-Is-Purelib: true\\nTag: py3-none-any\\n'}
 if name=='lxml':files['lxml/etree.py']='FIXTURE = True\\n'
 rows=[]
 for path,body in files.items():
  encoded=body.encode();digest=base64.urlsafe_b64encode(hashlib.sha256(encoded).digest()).rstrip(b'=').decode()
  rows.append([path,'sha256='+digest,str(len(encoded))])
 rows.append([f'{info}/RECORD','','']);record=io.StringIO();csv.writer(record).writerows(rows);files[f'{info}/RECORD']=record.getvalue()
 with zipfile.ZipFile(wheelhouse/f'{name}-{version}-py3-none-any.whl','w') as archive:
  for path,body in files.items():archive.writestr(path,body)
`, wheels], { encoding: 'utf8' });
  assert.equal(built.status, 0, built.stderr);
  const env = { ...process.env, C2C_TEST_PROJECT: project, C2C_CODESPACE_STATE: state,
    PIP_NO_INDEX: '1', PIP_FIND_LINKS: wheels, PIP_CONFIG_FILE: '/dev/null', PIP_DISABLE_PIP_VERSION_CHECK: '1' };
  for (const name of ['ANA_DOCX_PYTHON', 'C2C_VERIFIED_DOCX_PYTHON', 'PYTHONPATH', 'PYTHONHOME']) delete env[name];
  const selected = join(state, 'docx-runtime', 'bin', 'python');
  return { directory, project, wheels, state, requirements, env, selected,
    run: (extra = {}) => spawnSync('bash', ['-c', `
      source "${postCreate}"
      C2C_REPO_ROOT="$C2C_TEST_PROJECT"
      if c2c_install_docx_runtime; then
        printf 'SELECTED=%s\\n' "$ANA_DOCX_PYTHON"
        test "$ANA_DOCX_PYTHON" = "$C2C_VERIFIED_DOCX_PYTHON"
      else
        rc=$?; test -z "\${C2C_VERIFIED_DOCX_PYTHON:-}" && echo NO_VERIFIED_INTERPRETER; exit "$rc"
      fi
    `], { cwd: root, encoding: 'utf8', env: { ...env, ...extra }, timeout: 90000 }),
    close: () => rmSync(directory, { recursive: true, force: true }) };
}

export function pythonCheck(python, expression, env = process.env) {
  return spawnSync(python, ['-I', '-c', expression], { encoding: 'utf8', env, timeout: 15000 });
}

