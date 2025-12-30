Traceability guide

This file maps claims in generated submission templates to evidence stored in the repository.

Example entry:
- Claim: '99.2% sensitivity for condition X'  
  Evidence: `data/sample_study/sample.csv` (de-identified dataset), `analysis/analysis.py` (reproducible calculation), `analysis/results/metrics.json` (output), `regulatory/CER/SAMPLE_STUDY/CSR_DRAFT.md` (draft report)

- Notebook: `analysis/validation_notebook.ipynb` demonstrates a reproducible run and plotting of results.
- Risk register: `regulatory/RISK_REGISTER.csv` maps identified risks to mitigations and verification artifacts.

Best practices:
- For each claim add a section mapping: claim → dataset path (with checksum) → analysis commit sha → analysis script path → CSR section reference and sign-off.
- Keep TRACEABILITY.md updated as part of release sign-off.
