#!/usr/bin/env python3
"""Simple analysis script that computes sensitivity, specificity, confusion matrix and Wilson CIs."""
import csv
import json
import math
import sys
from collections import Counter


def wilson_ci(k, n, z=1.96):
    if n == 0:
        return (0.0, 0.0)
    phat = k / n
    denom = 1 + z*z/n
    centre = phat + z*z/(2*n)
    margin = z * math.sqrt((phat*(1-phat)+z*z/(4*n))/n)
    low = (centre - margin) / denom
    high = (centre + margin) / denom
    return (max(0.0, low), min(1.0, high))


def compute_metrics(path):
    tp = fp = tn = fn = 0
    total = 0
    with open(path, newline='') as csvfile:
        reader = csv.DictReader(filter(lambda row: not row.strip().startswith('#'), csvfile))
        for r in reader:
            total += 1
            label = int(r['label'])
            pred = int(r['predicted_label'])
            if label == 1 and pred == 1:
                tp += 1
            elif label == 1 and pred == 0:
                fn += 1
            elif label == 0 and pred == 0:
                tn += 1
            elif label == 0 and pred == 1:
                fp += 1
    pos = tp + fn
    neg = tn + fp
    sens = tp / pos if pos > 0 else None
    spec = tn / neg if neg > 0 else None
    sens_ci = wilson_ci(tp, pos) if pos > 0 else (None, None)
    spec_ci = wilson_ci(tn, neg) if neg > 0 else (None, None)
    metrics = {
        'total': total,
        'positives': pos,
        'negatives': neg,
        'tp': tp,
        'tn': tn,
        'fp': fp,
        'fn': fn,
        'sensitivity': round(sens, 6) if sens is not None else None,
        'sensitivity_ci': [round(s, 6) for s in sens_ci] if sens_ci[0] is not None else None,
        'specificity': round(spec, 6) if spec is not None else None,
        'specificity_ci': [round(s, 6) for s in spec_ci] if spec_ci[0] is not None else None,
    }
    return metrics


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: analysis.py <csv-file>')
        sys.exit(2)
    path = sys.argv[1]
    metrics = compute_metrics(path)
    print(json.dumps(metrics, indent=2))
    # Write results
    import os
    outdir = os.path.join('analysis', 'results')
    os.makedirs(outdir, exist_ok=True)
    with open(os.path.join(outdir, 'metrics.json'), 'w') as fh:
        json.dump(metrics, fh, indent=2)
    sys.exit(0)
