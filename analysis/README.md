This folder contains a minimal reproducible analysis for a synthetic study used for validation testing.

Files:
- sample_study/sample.csv : synthetic de-identified dataset (labels and predictions)
- analysis.py : computes sensitivity, specificity, confusion matrix and Wilson CIs, writes `analysis/results/metrics.json`
- check_metrics.py : simple script that fails if sensitivity/specificity fall below thresholds

Run locally:

python3 analysis/analysis.py data/sample_study/sample.csv
python3 analysis/check_metrics.py analysis/results/metrics.json 0.99 0.985

Add your real de-identified datasets in `data/studies/<study>/` and update the CI thresholds accordingly.
