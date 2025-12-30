#!/usr/bin/env python3
"""Simple checker that fails if metrics are below provided thresholds."""
import json
import sys


def usage():
    print('Usage: check_metrics.py <metrics.json> [min_sensitivity] [min_specificity]')
    sys.exit(2)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        usage()
    path = sys.argv[1]
    min_sens = float(sys.argv[2]) if len(sys.argv) > 2 else 0.99
    min_spec = float(sys.argv[3]) if len(sys.argv) > 3 else 0.985
    with open(path) as fh:
        metrics = json.load(fh)
    sens = metrics.get('sensitivity')
    spec = metrics.get('specificity')
    ok = True
    if sens is None or sens < min_sens:
        print(f"Sensitivity {sens} < min required {min_sens}")
        ok = False
    if spec is None or spec < min_spec:
        print(f"Specificity {spec} < min required {min_spec}")
        ok = False
    if ok:
        print('Metrics pass thresholds')
        sys.exit(0)
    else:
        print('Metrics failed')
        sys.exit(1)
