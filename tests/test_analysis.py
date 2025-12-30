import json
from analysis.analysis import compute_metrics


def test_sample_metrics():
    m = compute_metrics('data/sample_study/sample.csv')
    assert m['positives'] == 125
    assert m['negatives'] == 300
    assert m['tp'] == 124
    assert m['tn'] == 299
    assert round(m['sensitivity'], 3) == 0.992
    assert round(m['specificity'], 3) == 0.997
