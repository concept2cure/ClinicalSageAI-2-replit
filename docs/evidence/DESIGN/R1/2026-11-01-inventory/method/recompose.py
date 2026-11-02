# R1 inventory: re-run the caller columns over the route table already measured (added 2026-11-01,
# see CHANGELOG-template-callers.md).
#
# The route table (method, path, route file), the production verdict and the owning packages depend
# only on the server, which trace.cjs, compose.py and verdict.ts measured at the inventory's commit.
# A change to the caller method does not need the server again, so this script takes those columns
# from an existing inventory and replaces only the caller columns:
#
#   python3 recompose.py routes <inventory.json> <S>
#       writes <S>/full-routes.json (the input match.py reads) from the inventory's rows.
#   python3 recompose.py merge <inventory.json> <S> <out.json>
#       writes <out.json>: the inventory's rows in the same order, prod/claimedBy/packages kept,
#       caller from <S>/matched.json (its first file), and for a row found by the second pass
#       callerAt (file:line), builtAt, via, how, pattern and its confidence (exact, or probable with
#       callMethod: unknown); for a row whose path the client sends only with other methods,
#       samePathAt and samePathMethods. Any other row's confidence is left to match2.py.
#
# Run match.py and match2.py from the root of the tree being measured (the inventory's commit), so
# the client read is the client of the commit the routes were traced at.
import json, sys

cmd, inv, S = sys.argv[1], sys.argv[2], sys.argv[3]
data = json.load(open(inv))
if cmd == 'routes':
    rows = [{'method': r['m'], 'path': r['path'], 'file': r['file']} for r in data['rows']]
    rows.sort(key=lambda o: (o['path'], o['method']))
    json.dump(rows, open(S + '/full-routes.json', 'w'), indent=0)
    print('routes', len(rows))
elif cmd == 'merge':
    out = sys.argv[4]
    matched = {(r['method'], r['path']): r for r in json.load(open(S + '/matched.json'))}
    rows = []
    for r in data['rows']:
        m = matched[(r['m'], r['path'])]
        row = {k: r[k] for k in ('m', 'path', 'file', 'prod', 'claimedBy', 'packages')}
        row['caller'] = m['caller'][0] if m['caller'] else None
        for k in ('callerAt', 'builtAt', 'via', 'how', 'pattern', 'callMethod', 'samePathAt', 'samePathMethods', 'confidence'):
            if k in m: row[k] = m[k]
        rows.append(row)
    res = {k: v for k, v in data.items() if k != 'rows'}
    for k in sys.argv[5:]:  # extra top-level fields, key=value
        a, b = k.split('=', 1)
        res[a] = b
    res['rows'] = rows
    json.dump(res, open(out, 'w'), indent=0)
    print('rows', len(rows), 'with a caller', sum(1 for r in rows if r['caller']), 'found by the second pass', sum(1 for r in rows if 'via' in r),
          'of them probable', sum(1 for r in rows if r.get('confidence') == 'probable'))
else:
    sys.exit('usage: recompose.py routes|merge <inventory.json> <S> [<out.json> [key=value …]]')
