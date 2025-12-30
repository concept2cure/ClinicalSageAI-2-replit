Validation evidence guide

This is a minimal example demonstrating how to add a reproducible validation artefact to the repository.

Steps to follow:
1. Place de-identified dataset into `data/studies/<study-name>/sample.csv` and include a `README.md` describing provenance and de-identification.
2. Add an analysis script to `analysis/` that computes performance metrics and stores outputs in `analysis/results/`.
3. Add a GitHub Actions workflow that runs the analysis and asserts metrics meet acceptance thresholds.
4. Keep the dataset and CSR links traceable: add references in `regulatory/TRACEABILITY.md` mapping claim → dataset → analysis commit.

This file is a starting point only; adapt to your QMS and regulatory pathway (510(k), De Novo, MDR/IVDR, etc.).
