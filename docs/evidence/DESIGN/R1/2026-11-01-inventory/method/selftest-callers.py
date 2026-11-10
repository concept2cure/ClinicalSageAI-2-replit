# Self-test for the caller passes (added 2026-11-01, see CHANGELOG-template-callers.md).
#
# Builds a small client tree, runs resolve.cjs and match.py over it, and checks every row: the
# shapes the second pass must find (an imported constant at the head of a template, an aliased
# re-export in a `+` chain, a namespace import's object property, a helper's return, a parameter
# bound at its call sites and JSX props), and the shapes it must NOT find (a `const` from another
# function's scope, a parameter with no call site, a runtime value standing in for a literal route
# segment, a runtime sub-path after the mount root). Added by the second correction (2026-11-01): the
# HTTP method must match (a PUT to a path is not a call to its DELETE, and a call whose method
# cannot be read is only probable); the caller is the line that sends the URL, not the line that
# builds it; a URL taken from a `const` array of objects through a JSX prop and a helper, with each
# object's own base kept with its own path; and a callback handed down two components as a prop.
# The fixture keeps each URL out of the literal
# pass's reach (its `${…}` spans segments, so `/api/docs/${id}` alone would already match
# `/api/docs/:id/annotations` there), so each row shows what the second pass does on its own. It
# also runs match.py --literal-only and checks that the literal pass misses the known case, so the
# test is seen failing on it.
#
#   python3 selftest-callers.py <empty scratch dir>
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
root = os.path.abspath(sys.argv[1])
os.makedirs(root + '/client/src/fx', exist_ok=True)
os.makedirs(root + '/shared', exist_ok=True)
FILES = {
    'paths.ts': """export const REVIEWS_PATH = '/api/audit/reviews';
export const API = { jobs: '/api/csr/jobs' } as const;
""",
    'barrel.ts': """export * from './paths';
export { REVIEWS_PATH as RP } from './paths';
""",
    'Sign.tsx': """import { REVIEWS_PATH } from './paths';
export async function sign(id: number) {
  return apiCall('POST', `${REVIEWS_PATH}/${id}/sign`, {});
}
""",
    'Void.ts': """import { RP } from './barrel';
export const voidIt = (id: string) => fetch(RP + '/' + encodeURIComponent(id) + '/void', { method: 'POST' });
""",
    'Jobs.ts': """import * as P from '@/fx/paths';
export const headings = (jobId: string) => fetch(`${P.API.jobs}/${jobId}/headings`);
""",
    'Docs.ts': """const docUrl = (id: string) => '/api/docs/' + encodeURIComponent(id);
export const annotations = (id: string) => fetch(`${docUrl(id)}/annotations`);
""",
    'Send.tsx': """function useSend(base: string) {
  return () => apiCall('POST', `${base}/fulfill`, {});
}
export function Commitment({ cid }: { cid: string }) {
  const send = useSend('/api/commitments/' + cid);
  return null;
}
const JOBS = '/api/csr/jobs';
function PlacementForm({ base, id }: { base: string; id: string }) {
  return fetch(`${base}/${id}/place`, { method: 'POST' });
}
export function Assembly({ j, a }: { j: string; a: string }) {
  return <PlacementForm base={`${JOBS}/${j}/assembly`} id={a} />;
}
""",
    'Calc.ts': """export const BASE = '/api/stats';
export const IVD = '/api/ivd';
export type Calc = { id: string; path: string; base?: string };
const DESIGN: Calc[] = [{ id: 'a', path: '/assurance' }, { id: 'b', path: '/win-ratio' }];
const DEVICE: Calc[] = [{ id: 'c', path: '/linearity', base: IVD }];
export const ALL: Calc[] = [...DESIGN, ...DEVICE];
export function endpoint(calc: Calc): string {
  return `${calc.base ?? BASE}${calc.path}`;
}
""",
    'Workbench.tsx': """import { ALL, endpoint, type Calc } from './Calc';
async function run(path: string, body: unknown) {
  return apiRequest('POST', path, body);
}
function Panel({ calc }: { calc: Calc }) {
  const go = () => run(endpoint(calc), {});
  return null;
}
export function Workbench({ id }: { id: string }) {
  const active = useMemo(() => ALL.find((c) => c.id === id) ?? ALL[0], [id]);
  return <Panel calc={active} />;
}
""",
    'Evidence.tsx': """type Write = (path: string, body: unknown) => Promise<boolean>;
function Unlink({ id, write }: { id: string; write: Write }) {
  const go = () => write(`/${encodeURIComponent(id)}/unlink`, {});
  return null;
}
function Item({ id, write }: { id: string; write: Write }) {
  return <Unlink id={id} write={write} />;
}
export function Evidence({ projectId }: { projectId: string }) {
  const base = '/api/evidence/' + encodeURIComponent(projectId);
  const write: Write = async (path, body) => (await apiRequest('POST', base + path, body)).ok;
  return <Item id="x" write={write} />;
}
""",
    'Designs.ts': """const DESIGNS = '/api/designs';
export async function load(id: string) {
  const target = `${DESIGNS}/${encodeURIComponent(id)}`;
  await apiCall('POST', `${target}/publish`, {});
  return apiCall('GET', target);
}
export const save = (id: string) => apiCall('PUT', `${DESIGNS}/${id}/body`, {});
export const archive = (id: string) => someLibrary.request(`${DESIGNS}/${id}/archive`);
""",
    'Negative.ts': """function a() { const base = '/api/alpha'; return base; }
export function b(base: string) { return fetch(`${base}/omega`); }
function c() { const LOCAL = '/api/beta'; return LOCAL; }
export function d() { return fetch(`${LOCAL}/x`); }
const SEQ = '/api/seq';
export function e(id: string, kind: string) { return fetch(`${SEQ}/${id}/${kind}`, { method: 'POST' }); }
export function g(rest: string) { return fetch('/api/gamma' + rest); }
""",
}
for name, src in FILES.items():
    open(f'{root}/client/src/fx/{name}', 'w').write(src)
EXPECT = {  # (method, path): file the second pass must name, or None
    ('POST', '/api/audit/reviews/:id/sign'): 'client/src/fx/Sign.tsx:3',
    ('POST', '/api/audit/reviews/:id/void'): 'client/src/fx/Void.ts:2',
    ('GET', '/api/csr/jobs/:jobId/headings'): 'client/src/fx/Jobs.ts:2',
    ('GET', '/api/docs/:id/annotations'): 'client/src/fx/Docs.ts:2',
    ('POST', '/api/commitments/:id/fulfill'): 'client/src/fx/Send.tsx:2',
    ('POST', '/api/csr/jobs/:jobId/assembly/:assemblyId/place'): 'client/src/fx/Send.tsx:10',
    ('GET', '/api/alpha/omega'): None,
    ('GET', '/api/beta/x'): None,
    ('POST', '/api/seq/:id/freeze'): None,
    ('GET', '/api/gamma/deep/path'): None,
    # second correction
    ('POST', '/api/stats/assurance'): 'client/src/fx/Workbench.tsx:6',
    ('POST', '/api/stats/win-ratio'): 'client/src/fx/Workbench.tsx:6',
    ('POST', '/api/ivd/linearity'): 'client/src/fx/Workbench.tsx:6',
    ('POST', '/api/stats/linearity'): None,  # each object's base stays with its own path
    ('GET', '/api/stats/assurance'): None,  # the workbench only POSTs
    ('POST', '/api/evidence/:projectId/:linkId/unlink'): 'client/src/fx/Evidence.tsx:11',
    ('GET', '/api/designs/:id'): 'client/src/fx/Designs.ts:5',  # the call, not the `const target` line
    ('POST', '/api/designs/:id/publish'): 'client/src/fx/Designs.ts:4',
    ('DELETE', '/api/designs/:id'): None,  # the path is sent, with GET only
    ('PUT', '/api/designs/:id/body'): 'client/src/fx/Designs.ts:7',
    ('DELETE', '/api/designs/:id/body'): None,  # the path is sent, with PUT only
    ('POST', '/api/designs/:id/archive'): ('client/src/fx/Designs.ts:8', 'probable'),  # method not readable
}
SAME_PATH = {  # rows left uncalled because the client sends the path with another method
    ('DELETE', '/api/designs/:id'): ('client/src/fx/Designs.ts:5', ['GET']),
    ('DELETE', '/api/designs/:id/body'): ('client/src/fx/Designs.ts:7', ['PUT']),
    ('GET', '/api/stats/assurance'): ('client/src/fx/Workbench.tsx:6', ['POST']),
}
S = root + '/out'
os.makedirs(S, exist_ok=True)
json.dump([{'method': m, 'path': p, 'file': 'fixture'} for m, p in EXPECT], open(S + '/full-routes.json', 'w'))
run = lambda *a: subprocess.run(list(a), cwd=root, check=True, capture_output=True, text=True).stdout.strip()
run('python3', '-I', HERE + '/match.py', S, '--literal-only')
lit = {(r['method'], r['path']): r for r in json.load(open(S + '/matched.json'))}
print('literal pass:', run('python3', '-I', HERE + '/match.py', S, '--literal-only'))
print('resolve.cjs:', run('node', HERE + '/resolve.cjs', S))
print('both passes:', run('python3', '-I', HERE + '/match.py', S))
got = {(r['method'], r['path']): r for r in json.load(open(S + '/matched.json'))}
bad = 0
for k, want in EXPECT.items():
    at = got[k].get('callerAt') if got[k]['caller'] else None
    conf = got[k].get('confidence', 'exact') if got[k]['caller'] else None
    want_at, want_conf = (want if isinstance(want, tuple) else (want, 'exact')) if want else (None, None)
    ok = (at == want_at and conf == want_conf) if want else not got[k]['caller']
    bad += not ok
    print(f"{'ok  ' if ok else 'FAIL'} {k[0]:6} {k[1]:46} expected {(want_at + ' ' + want_conf) if want else 'no caller'}, got {((at or 'literal ' + got[k]['caller'][0]) + ' ' + conf) if got[k]['caller'] else 'no caller'}"
          + (f"  [{got[k]['via']}: {got[k]['how']}]" if got[k].get('via') else ''))
for k, (want_at, want_m) in SAME_PATH.items():
    ok = got[k].get('samePathAt') == want_at and got[k].get('samePathMethods') == want_m
    bad += not ok
    print(f"{'ok  ' if ok else 'FAIL'} {k[0]:6} {k[1]:46} the client sends this path with {want_m} at {want_at}: got {got[k].get('samePathMethods')} at {got[k].get('samePathAt')}")
known = ('POST', '/api/audit/reviews/:id/sign')
if lit[known]['caller']:
    bad += 1
    print('FAIL the literal pass alone found the known case, so this test does not show the blind spot')
else:
    print('ok   the literal pass alone reports the known case as not called (the blind spot this test exists for)')
print('PASS' if not bad else f'{bad} FAILED')
sys.exit(1 if bad else 0)
