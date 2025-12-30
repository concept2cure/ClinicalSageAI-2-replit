# Clinical Sage AI

## Validation example

![Validation](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/workflows/validation.yml/badge.svg)

This repository contains a minimal reproducible validation example under `data/sample_study` and `analysis/` demonstrating how to compute sensitivity/specificity and run a CI validation workflow.

Run locally:

> python3 analysis/analysis.py data/sample_study/sample.csv
> python3 analysis/check_metrics.py analysis/results/metrics.json 0.99 0.985

See `regulatory/README_VALIDATION.md` for guidance on adding real study artifacts.
