Draft Release Notes — validation-evidence branch

Version: v0.0.1-alpha (draft)
Date: [YYYY-MM-DD]

Summary:
- Added a minimal reproducible validation example (synthetic dataset + analysis scripts).
- Added CI validation workflow to compute performance metrics and assert thresholds.
- Added plotting of ROC and confusion matrix and upload of artifacts.
- Added regulatory traceability, a QA review checklist, and a risk register template.

Files of interest:
- data/sample_study/sample.csv
- analysis/analysis.py, analysis/check_metrics.py, analysis/plot_metrics.py
- .github/workflows/validation.yml, .github/workflows/security-scan.yml, .github/workflows/qa-signoff.yml
- regulatory/TRACEABILITY.md, regulatory/RISK_REGISTER.csv, regulatory/QA_REVIEW_CHECKLIST.md

Known issues / next steps:
- Add real de-identified study datasets and SAP/CSR documents.
- Integrate SAST (semgrep/ESLint rules) and SCA gating tuned for production.
- Expand CI to run analysis on multiple datasets and create signed artifacts for submission.

Release sign-off:
- Release owner: 
- QA reviewer: 
- Regulatory reviewer: 
