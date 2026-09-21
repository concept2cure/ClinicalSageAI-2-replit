#!/usr/bin/env bash
# check-pdfa-toolchain.sh — prove the PDF/A toolchain the eCTD pipeline shells
# out to is present AND works, with the exact invocations the code uses.
#
# Runbook blocker B15 (docs/GA_OPS_PROCUREMENT_RUNBOOK_2026-08.md): the
# submission-grade gate ECTD_REQUIRE_PDFA=true blocks every production eCTD
# package whose PDF leaves were not converted to PDF/A-1b, and the conversion
# and validation both shell out (server/services/ectd/pdfa-pipeline.ts):
#
#   gs      --version                                          feature-detect
#   gs      -dPDFA=1 -sColorConversionStrategy=RGB -dPDFACompatibilityPolicy=1
#           -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dNOPAUSE -dQUIET -dBATCH
#           -sOutputFile=<out> <in>                             convert
#   verapdf --version                                          feature-detect
#   verapdf --flavour 1b --format text <pdf>                   validate
#
# Both binaries are resolved from PATH unless GHOSTSCRIPT_BINARY / VERAPDF_BINARY
# override them (scripts/ops/pilot-go-no-go.mjs gate 7 additionally honours
# VERAPDF_COMMAND). This script is run:
#   • at image build time by Dockerfile.optimized, so an image without the
#     toolchain cannot be built — the gap becomes a build failure instead of a
#     silent vanilla-PDF submission;
#   • by an operator, against any host, to answer "would ECTD_REQUIRE_PDFA=true
#     block here?" before flipping it (B20 ordering: flag after artifact).
#
# It is a REAL check, in two parts:
#   A. TOOLCHAIN CAPABILITY (fatal). Render a one-page PDF, convert it with
#      Ghostscript using a proper PDF/A-1 OutputIntent prelude (sRGB ICC, the
#      shape Ghostscript's own doc/PDFA_def.ps prescribes), validate with veraPDF
#      and require PASS; then require that the UNCONVERTED source FAILs, so a
#      validator that passes everything cannot pass here.
#   B. PIPELINE ARGUMENTS (reported; fatal only under
#      PDFA_CHECK_STRICT_PIPELINE_ARGS=1). Convert with the argument list the
#      product ships in pdfa-pipeline.ts convertToPdfA1bWithGhostscript and
#      validate. Measured 2026-09-20 with Ghostscript 10.02.1 + veraPDF 1.30.2:
#      that list carries NO OutputIntent, so its output FAILS PDF/A-1b clause
#      6.2.3.3 ("uncalibrated colour space … shall contain a PDF/A-1
#      OutputIntent") even though `converted: true` is recorded. That is a
#      product defect in pdfa-pipeline.ts, not a toolchain gap, so it must not
#      block the image build — but it must be printed every time until fixed.
#
# Exit 0 only when every fatal step passes. Never prints secrets; needs no network.

set -u

GS="${GHOSTSCRIPT_BINARY:-gs}"
VERAPDF="${VERAPDF_BINARY:-${VERAPDF_COMMAND:-verapdf}}"
EXPECT_VERAPDF="${VERAPDF_EXPECTED_VERSION:-}"
STRICT_PIPELINE="${PDFA_CHECK_STRICT_PIPELINE_ARGS:-0}"

fail=0
ok()   { printf '  ✓ %s\n' "$*"; }
bad()  { printf '  ✗ %s\n' "$*"; fail=1; }
warn() { printf '  ⚠ %s\n' "$*"; }

echo "▶ PDF/A toolchain check (binaries the eCTD pipeline invokes)"

# ── 1. Ghostscript ───────────────────────────────────────────────────────────
if command -v "$GS" >/dev/null 2>&1; then
  ok "ghostscript: $(command -v "$GS") — version $("$GS" --version 2>/dev/null | head -n1)"
else
  bad "ghostscript binary '$GS' not found on PATH (Debian/Ubuntu: apt-get install -y ghostscript)"
fi

# ── 2. veraPDF ───────────────────────────────────────────────────────────────
if command -v "$VERAPDF" >/dev/null 2>&1; then
  vline="$("$VERAPDF" --version 2>/dev/null | grep -m1 -i 'veraPDF' || true)"
  if [ -z "$vline" ]; then
    bad "verapdf binary '$VERAPDF' is on PATH but '--version' printed no veraPDF banner (JRE missing?)"
  elif [ -n "$EXPECT_VERAPDF" ] && ! printf '%s' "$vline" | grep -q "$EXPECT_VERAPDF"; then
    bad "verapdf reports '$vline' but VERAPDF_EXPECTED_VERSION=$EXPECT_VERAPDF"
  else
    ok "verapdf: $(command -v "$VERAPDF") — $vline"
  fi
else
  bad "verapdf binary '$VERAPDF' not found on PATH (see Dockerfile.optimized for the pinned install)"
fi

# ── 3. xmllint — server/services/ectd/xml-validator.ts feature-detects it ────
# Not a PDF/A binary, but the same class of deployment gap (a shell-out the
# image must carry): the eCTD XML validator degrades silently without it.
if command -v xmllint >/dev/null 2>&1; then
  ok "xmllint: $(command -v xmllint) — $(xmllint --version 2>&1 | head -n1)"
else
  bad "xmllint not found on PATH (Debian/Ubuntu: apt-get install -y libxml2-utils)"
fi

# ── 4. sRGB ICC profile for the OutputIntent (shipped with Ghostscript) ──────
ICC="${PDFA_SRGB_ICC:-}"
if [ -z "$ICC" ]; then
  for cand in /usr/share/color/icc/ghostscript/srgb.icc /usr/share/ghostscript/*/iccprofiles/srgb.icc; do
    [ -f "$cand" ] && { ICC="$cand"; break; }
  done
fi
if [ -n "$ICC" ] && [ -f "$ICC" ]; then
  ok "sRGB ICC profile: $ICC"
else
  bad "no srgb.icc found (Ghostscript ships one; set PDFA_SRGB_ICC to its path)"
fi

if [ "$fail" -ne 0 ]; then
  echo "✗ PDF/A toolchain INCOMPLETE — ECTD_REQUIRE_PDFA=true would block every production eCTD package here."
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
src="$work/src.pdf"

# A one-page PDF produced by Ghostscript itself (no external fonts or files).
if ! "$GS" -q -dNOPAUSE -dBATCH -sDEVICE=pdfwrite -sOutputFile="$src" \
     -c '/Helvetica findfont 12 scalefont setfont 72 720 moveto (PDF/A toolchain check) show showpage' >/dev/null 2>&1 \
   || [ ! -s "$src" ]; then
  echo "  ✗ ghostscript could not render the probe PDF"
  echo "✗ PDF/A toolchain BROKEN"; exit 1
fi
ok "rendered probe PDF ($(stat -c %s "$src") bytes)"

# ── A. Toolchain capability: OutputIntent prelude → convert → validate PASS ──
prelude="$work/pdfa_def.ps"
cat > "$prelude" <<EOF
%!
[ /Title (PDF/A toolchain check) /DOCINFO pdfmark
[ /_objdef {icc_PDFA} /type /stream /OBJ pdfmark
[ {icc_PDFA} << /N 3 >> /PUT pdfmark
[ {icc_PDFA} ($ICC) (r) file /PUT pdfmark
[ /_objdef {OutputIntent_PDFA} /type /dict /OBJ pdfmark
[ {OutputIntent_PDFA} << /Type /OutputIntent /S /GTS_PDFA1 /DestOutputProfile {icc_PDFA} /OutputConditionIdentifier (sRGB IEC61966-2.1) /Info (sRGB IEC61966-2.1) >> /PUT pdfmark
[ {Catalog} << /OutputIntents [ {OutputIntent_PDFA} ] >> /PUT pdfmark
EOF
outA="$work/pdfa-with-outputintent.pdf"
if ! "$GS" -dPDFA=1 -sColorConversionStrategy=RGB -dPDFACompatibilityPolicy=1 \
     -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dNOPAUSE -dQUIET -dBATCH \
     --permit-file-read="$ICC" -sOutputFile="$outA" "$prelude" "$src" >/dev/null 2>&1 || [ ! -s "$outA" ]; then
  echo "  ✗ ghostscript PDF/A-1b conversion (with OutputIntent prelude) failed"
  echo "✗ PDF/A toolchain BROKEN"; exit 1
fi
reportA="$("$VERAPDF" --flavour 1b --format text "$outA" 2>&1)"; rcA=$?
if [ $rcA -eq 0 ] && printf '%s' "$reportA" | grep -q '^PASS'; then
  ok "toolchain capability: gs (+sRGB OutputIntent) → veraPDF PDF/A-1b $(printf '%s' "$reportA" | grep -m1 '^PASS' | cut -d' ' -f1)"
else
  echo "  ✗ veraPDF did not PASS Ghostscript's PDF/A-1b output (exit $rcA): $(printf '%s' "$reportA" | head -n3 | tr '\n' ' ')"
  echo "✗ PDF/A toolchain BROKEN — conversion and validation disagree; do not set ECTD_REQUIRE_PDFA=true"
  exit 1
fi
neg="$("$VERAPDF" --flavour 1b --format text "$src" 2>&1 || true)"
if printf '%s' "$neg" | grep -q '^FAIL'; then
  ok "validator is discriminating: the unconverted source is rejected (FAIL)"
else
  echo "  ✗ veraPDF did not FAIL the unconverted source — the validator is not discriminating: $(printf '%s' "$neg" | head -n1)"
  exit 1
fi

# ── B. The product's own argument list (pdfa-pipeline.ts) ────────────────────
# Mirrors convertToPdfA1bWithGhostscript exactly: since 2026-09-21 that list
# carries the sRGB OutputIntent prelude (the same pdfmark sequence as A) and
# --permit-file-read for the profile. Keep this block and that function in
# step — a drift here is what section B exists to catch.
outB="$work/pdfa-pipeline-args.pdf"
if "$GS" -dPDFA=1 -sColorConversionStrategy=RGB -dPDFACompatibilityPolicy=1 \
     -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dNOPAUSE -dQUIET -dBATCH \
     --permit-file-read="$ICC" -sOutputFile="$outB" "$prelude" "$src" >/dev/null 2>&1 && [ -s "$outB" ]; then
  reportB="$("$VERAPDF" --flavour 1b --format text "$outB" 2>&1)"; rcB=$?
  if [ $rcB -eq 0 ] && printf '%s' "$reportB" | grep -q '^PASS'; then
    ok "pipeline arguments (pdfa-pipeline.ts convertToPdfA1bWithGhostscript) produce a file veraPDF PASSes"
  else
    msg="pipeline arguments (pdfa-pipeline.ts convertToPdfA1bWithGhostscript, as mirrored above) produce a file veraPDF REJECTS for PDF/A-1b. The packager records converted:true on such a leaf. Product defect, not a toolchain gap — check the OutputIntent prelude and --permit-file-read in that argument list."
    if [ "$STRICT_PIPELINE" = "1" ]; then bad "$msg"; else warn "$msg"; fi
  fi
else
  bad "ghostscript failed with the pipeline's own argument list"
fi

if [ "$fail" -ne 0 ]; then
  echo "✗ PDF/A check FAILED (see above)"
  exit 1
fi
echo "✅ PDF/A toolchain present and working (gs + veraPDF + xmllint). ECTD_REQUIRE_PDFA=true is safe on this host once the pipeline-argument warning above (if any) is fixed."
