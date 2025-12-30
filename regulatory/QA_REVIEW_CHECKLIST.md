QA Review Checklist — Validation Evidence

This checklist is intended for reviewers validating the reproducible analysis and evidence package before sign-off.

1. Data integrity
   - [ ] Confirm the dataset is de-identified and contains a data dictionary (`data/studies/<study>/README.md`)
   - [ ] Verify checksum of `data/sample_study/sample.csv` matches TRACEABILITY entry
2. Analysis reproducibility
   - [ ] Run `python3 analysis/analysis.py data/sample_study/sample.csv` and confirm `analysis/results/metrics.json` is produced
   - [ ] Check `analysis/check_metrics.py` thresholds and confirm tests pass
3. Results verification
   - [ ] Confirm `analysis/results/plot.png` displays ROC and confusion matrix correctly
   - [ ] Confirm unit tests in `tests/test_analysis.py` pass
4. Traceability & documentation
   - [ ] Confirm `regulatory/TRACEABILITY.md` maps the claim to dataset & analysis commit sha
   - [ ] Confirm `regulatory/RISK_REGISTER.csv` lists mitigations and corresponding verification artifacts
5. Sign-off
   - [ ] Add reviewer name and date to the bottom of this file when signed off

Sign-off

Reviewer: 
Date: 
