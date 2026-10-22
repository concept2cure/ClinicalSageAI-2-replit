# 4 — Security Scan (Trivy filesystem): Pillow 12.3.0 → 13.0.0

CI job `119003362475` (run `39533094089`), step "Trivy filesystem scan (deps +
secrets)", exit 1. One cause, read from the full job log: **Pillow==12.3.0**.
- **CRITICAL:** CVE-2026-112403 (JPEG decoder).
- **HIGH (6):** CVE-2026-112397, -112400, -112404, -112895, -112896 and
  -112897 (zero-width out-of-bounds DoS, GIF memory exhaustion, TIFF
  out-of-bounds read, PDF append DoS, TIFF encoder out-of-bounds read, TIFF
  uninitialised buffer).

All seven are fixed in 13.0.0. They are reported twice, once per pinning file:
`requirements.txt:15` and `server/services/python/requirements.txt:83`.
Nothing else in the step fails:
- `package-lock.json`: 0 findings.
- `tests/validation/package-lock.json`: 0 findings.
- Secrets: 0.
- The Trivy config scan: 0 misconfigurations.

**Real, not ignorable.** `ingestion/pdf_extractor.py` runs `Image.open` on
images taken from user-uploaded PDFs and OCR input, which is exactly where
these decoder bugs apply. A fixed version exists, so a `.trivyignore` entry
would be wrong under the file's own hygiene rule (it is for unfixable or
unreachable findings).

**Fix.**
- Both pins move to `Pillow==13.0.0`.
- The root pin's comment records why.

**Checked.**
- PyPI publishes `pillow-13.0.0-cp311-cp311-manylinux_2_27_x86_64.whl`.
- `npm run ci:requirements-pins` passes: 21 pinned packages install on Python
  3.11.
- The code uses two calls, `Image.open` and `Image.fromarray`
  (`pdf_extractor.py` lines 275, 374, 551, 553, 584). Both work unchanged on
  13.0.0: a scratch environment round-trips an array through `fromarray` →
  PNG → `open` → `load`.
- No dependency caps Pillow below 13: matplotlib 3.10.9, pytesseract 0.3.13
  and pdf2image 1.17.0 declare no upper bound.

**Not verified here.** Trivy itself was not run locally; the scanner is not
installed in this container. The red-to-green proof is the next CI run's
Security Scan job.
