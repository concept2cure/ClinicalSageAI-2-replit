#!/bin/bash

echo "[1/6] Verifying route: /cer"
grep -q '/cer' ./client/src/routes/CERRoutes.jsx && echo "✅ Route /cer exists" || echo "❌ Missing /cer route"

echo "[2/6] Checking page component: CERV2Page"
test -f ./client/src/pages/CERV2Page.jsx && echo "✅ CERV2Page.jsx found" || echo "❌ CERV2Page.jsx not found"

echo "[3/6] Checking builder component"
test -f ./client/src/components/cer/CerBuilderPanel.jsx && echo "✅ CerBuilderPanel.jsx found" || echo "❌ CerBuilderPanel.jsx not found"

echo "[4/6] Checking preview component"
test -f ./client/src/components/cer/CerPreviewPanel.jsx && echo "✅ CerPreviewPanel.jsx found" || echo "❌ CerPreviewPanel.jsx not found"

echo "[5/6] Checking sidebar integration"
grep -q '/cer' ./client/src/components/SidebarNav.jsx && echo "✅ Sidebar links to /cer" || echo "❌ Sidebar missing link to /cer"

echo "[6/6] Backend API route check"
grep -q 'fetch-faers\|generate-section' ./server/routes/cer.js 2>/dev/null && echo "✅ CER API routes exist" || echo "❌ CER API routes missing"

echo ""  # Empty line for spacing
echo "🧪 QA Checklist verification:"
test -f ./docs/CER_QA_Checklist.md && echo "✅ CER QA Checklist document created" || echo "❌ CER QA Checklist document missing"

echo ""  # Empty line for spacing
echo "🎯 TrialSage CER setup check complete."

echo ""  # Empty line for spacing
echo "NOTE: Final verification requires manual UI testing using the QA Checklist"
echo "Run: 'cat ./docs/CER_QA_Checklist.md' to view the full checklist"