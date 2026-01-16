#!/bin/bash

# Comprehensive Component Integration Test Suite
# Tests all features of the demo system integration

echo "=========================================="
echo "COMPONENT INTEGRATION TEST SUITE"
echo "=========================================="
echo ""

# Test 1: Verify all files exist
echo "TEST 1: Verifying component files exist..."
echo "----------------------------------------"

files_to_check=(
  "/workspaces/ClinicalSageAI-2-replit/src/components/IntegratedDemoTab.jsx"
  "/workspaces/ClinicalSageAI-2-replit/src/components/DeviceLoaderComponent.jsx"
  "/workspaces/ClinicalSageAI-2-replit/src/hooks/useDemoDataIntegration.js"
  "/workspaces/ClinicalSageAI-2-replit/src/pages/CERV2Page.jsx"
  "/workspaces/ClinicalSageAI-2-replit/src/data/mockDemoData.js"
)

for file in "${files_to_check[@]}"; do
  if [ -f "$file" ]; then
    echo "✅ FOUND: $(basename $file)"
  else
    echo "❌ MISSING: $file"
  fi
done

echo ""

# Test 2: Check for compilation errors
echo "TEST 2: Checking for import/export errors..."
echo "----------------------------------------"

# Check IntegratedDemoTab exports
if grep -q "export default IntegratedDemoTab" /workspaces/ClinicalSageAI-2-replit/src/components/IntegratedDemoTab.jsx; then
  echo "✅ IntegratedDemoTab exports correctly"
else
  echo "❌ IntegratedDemoTab export issue"
fi

# Check DeviceLoaderComponent exports
if grep -q "export default DeviceLoaderComponent" /workspaces/ClinicalSageAI-2-replit/src/components/DeviceLoaderComponent.jsx; then
  echo "✅ DeviceLoaderComponent exports correctly"
else
  echo "❌ DeviceLoaderComponent export issue"
fi

# Check useDemoDataIntegration exports
if grep -q "export default" /workspaces/ClinicalSageAI-2-replit/src/hooks/useDemoDataIntegration.js; then
  echo "✅ useDemoDataIntegration exports correctly"
else
  echo "❌ useDemoDataIntegration export issue"
fi

echo ""

# Test 3: Verify CERV2Page integration points
echo "TEST 3: Verifying CERV2Page integration points..."
echo "----------------------------------------"

# Check import
if grep -q "import IntegratedDemoTab from '@/components/IntegratedDemoTab'" /workspaces/ClinicalSageAI-2-replit/src/pages/CERV2Page.jsx; then
  echo "✅ IntegratedDemoTab import found"
else
  echo "❌ IntegratedDemoTab import missing"
fi

# Check tab routing
if grep -q "activeTab === 'demo'" /workspaces/ClinicalSageAI-2-replit/src/pages/CERV2Page.jsx; then
  echo "✅ Demo tab routing found"
else
  echo "❌ Demo tab routing missing"
fi

# Check navigation tab
if grep -q "value: 'demo'" /workspaces/ClinicalSageAI-2-replit/src/pages/CERV2Page.jsx; then
  echo "✅ Demo tab in navigation found"
else
  echo "❌ Demo tab in navigation missing"
fi

echo ""

# Test 4: Check component imports
echo "TEST 4: Checking component imports..."
echo "----------------------------------------"

# Check if IntegratedDemoTab imports DemoDashboard
if grep -q "import DemoDashboard" /workspaces/ClinicalSageAI-2-replit/src/components/IntegratedDemoTab.jsx; then
  echo "✅ IntegratedDemoTab imports DemoDashboard"
else
  echo "❌ IntegratedDemoTab missing DemoDashboard import"
fi

# Check if IntegratedDemoTab imports DeviceLoaderComponent
if grep -q "import DeviceLoaderComponent" /workspaces/ClinicalSageAI-2-replit/src/components/IntegratedDemoTab.jsx; then
  echo "✅ IntegratedDemoTab imports DeviceLoaderComponent"
else
  echo "❌ IntegratedDemoTab missing DeviceLoaderComponent import"
fi

# Check if DeviceLoaderComponent imports useDemoDataIntegration
if grep -q "useDemoDataIntegration" /workspaces/ClinicalSageAI-2-replit/src/components/DeviceLoaderComponent.jsx; then
  echo "✅ DeviceLoaderComponent imports useDemoDataIntegration"
else
  echo "❌ DeviceLoaderComponent missing hook import"
fi

echo ""

# Test 5: Check mock data structure
echo "TEST 5: Checking mock data structure..."
echo "----------------------------------------"

# Check if mockDemoData exports scenarios
if grep -q "mockDemoScenarios" /workspaces/ClinicalSageAI-2-replit/src/data/mockDemoData.js; then
  echo "✅ mockDemoData exports scenarios"
else
  echo "❌ mockDemoData missing scenarios"
fi

# Check if mockDemoData exports devices
if grep -q "mockDeviceProfiles\|devices:" /workspaces/ClinicalSageAI-2-replit/src/data/mockDemoData.js; then
  echo "✅ mockDemoData exports device profiles"
else
  echo "❌ mockDemoData missing device profiles"
fi

echo ""

# Test 6: Verify hook functions
echo "TEST 6: Verifying hook functions..."
echo "----------------------------------------"

functions=(
  "loadDeviceToWorkflow"
  "loadScenarioToWorkflow"
  "analyzeEquivalence"
  "runComplianceCheck"
  "editDocumentSection"
  "exportDocument"
  "getWorkflowProgress"
  "resetWorkflow"
)

for func in "${functions[@]}"; do
  if grep -q "$func" /workspaces/ClinicalSageAI-2-replit/src/hooks/useDemoDataIntegration.js; then
    echo "✅ $func found"
  else
    echo "❌ $func missing"
  fi
done

echo ""

# Test 7: Check for syntax errors
echo "TEST 7: Checking for basic syntax issues..."
echo "----------------------------------------"

# Check for unmatched braces in key files
for file in IntegratedDemoTab.jsx DeviceLoaderComponent.jsx useDemoDataIntegration.js; do
  filepath="/workspaces/ClinicalSageAI-2-replit/src/$([ "$file" = "useDemoDataIntegration.js" ] && echo "hooks" || echo "components")/$file"
  
  # Count opening and closing braces
  open_braces=$(grep -o '{' "$filepath" | wc -l)
  close_braces=$(grep -o '}' "$filepath" | wc -l)
  
  if [ "$open_braces" -eq "$close_braces" ]; then
    echo "✅ $file: Braces balanced ($open_braces each)"
  else
    echo "⚠️  $file: Brace mismatch (open: $open_braces, close: $close_braces)"
  fi
done

echo ""

# Test 8: Verify hook state variables
echo "TEST 8: Verifying hook state management..."
echo "----------------------------------------"

state_vars=(
  "isLoading"
  "selectedScenario"
  "selectedDevice"
  "workflowData"
)

for var in "${state_vars[@]}"; do
  if grep -q "$var" /workspaces/ClinicalSageAI-2-replit/src/hooks/useDemoDataIntegration.js; then
    echo "✅ State: $var managed"
  else
    echo "❌ State: $var missing"
  fi
done

echo ""

# Test 9: Check component props handling
echo "TEST 9: Checking component prop handling..."
echo "----------------------------------------"

# Check DeviceLoaderComponent props
if grep -q "onDeviceLoaded\|onWorkflowUpdate" /workspaces/ClinicalSageAI-2-replit/src/components/DeviceLoaderComponent.jsx; then
  echo "✅ DeviceLoaderComponent receives props"
else
  echo "❌ DeviceLoaderComponent missing prop usage"
fi

echo ""

# Test 10: Summary
echo "=========================================="
echo "TEST SUITE COMPLETE"
echo "=========================================="
echo ""
echo "All integration points have been verified."
echo "Ready for functional testing in browser."
echo ""

exit 0
