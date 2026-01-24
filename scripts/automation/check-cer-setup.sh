#!/bin/bash

echo "[1/6] Verifying route: /cer"
grep -q 'path=\"/cer\"' ./client/src/routes/CERRoutes.jsx && echo "✅ Route /cer exists" || echo "❌ Missing /cer route"

echo "[2/6] Checking page component: CERV2Page"
test -f ./client/src/pages/CERV2Page.jsx && echo "✅ CERV2Page.jsx found" || echo "❌ CERV2Page.jsx not found"

echo "[3/6] Checking builder component"
test -f ./client/src/components/cer/CerBuilderPanel.jsx && echo "✅ CerBuilderPanel.jsx found" || echo "❌ CerBuilderPanel.jsx not found"

echo "[4/6] Checking preview component"
test -f ./client/src/components/cer/CerPreviewPanel.jsx && echo "✅ CerPreviewPanel.jsx found" || echo "❌ CerPreviewPanel.jsx not found"

echo "[5/6] Checking sidebar integration"
grep -q '/cer' ./client/src/components/SidebarNav.jsx && echo "✅ Sidebar links to /cer" || echo "❌ Sidebar missing link to /cer"

echo "[6/6] Backend API route check"
grep -q 'fetch-faers' ./server/routes/cer.js && echo "✅ fetch-faers API route exists" || echo "❌ fetch-faers API route missing"

echo "🎯 TrialSage CER setup check complete."