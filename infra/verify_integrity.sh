#!/bin/bash
# Exit on any error
trap 'echo "🚨 Integrity check failed" >&2; exit 1' ERR

echo "Verifying TrialSage HTML hashes..."
cd trialsage-html
if [ -f "trialsage-html.hashes" ]; then
  sha256sum -c trialsage-html.hashes --quiet || {
    echo "🚨 HTML files have been modified!"
    exit 1
  }
  echo "✅ All HTML files verified successfully"
else
  echo "⚠️ No baseline hashes found. Creating initial checksums..."
  find . -type f -name "*.html" -exec sha256sum {} \; > trialsage-html.hashes
  chmod 444 trialsage-html.hashes
  echo "✅ Baseline hashes created"
fi
cd ..