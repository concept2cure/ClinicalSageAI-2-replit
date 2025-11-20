#!/bin/bash

# TrialSage Pre-Commit Safety Script
# Automatically runs safety checks before committing changes
# Usage: ./scripts/pre_commit_safety.sh [component_path]

# Set colors for better readability
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🛡️  TrialSage Pre-Commit Safety Sequence${NC}"
echo -e "${BLUE}=====================================${NC}"

# Check if a component path was provided
if [ -z "$1" ]; then
  echo -e "${YELLOW}⚠️  No specific component path provided. Running general safety checks.${NC}"
  COMPONENT_PATH=""
else
  COMPONENT_PATH="$1"
  echo -e "${BLUE}📄 Target component: ${COMPONENT_PATH}${NC}"
  
  # Verify the component exists
  if [ ! -f "$COMPONENT_PATH" ]; then
    echo -e "${RED}❌ Error: Component not found at $COMPONENT_PATH${NC}"
    exit 1
  fi
fi

# 1. Create a timestamped log directory
LOG_DIR="safety_logs/$(date +"%Y%m%d_%H%M%S")"
mkdir -p "$LOG_DIR"
echo -e "${BLUE}📝 Safety logs will be saved to: ${LOG_DIR}${NC}"

# 2. Run full backup
echo -e "\n${BLUE}📦 Step 1: Creating system backup...${NC}"
./scripts/backup.sh > "${LOG_DIR}/backup.log" 2>&1

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Backup completed successfully${NC}"
else
  echo -e "${RED}❌ Backup failed! Check ${LOG_DIR}/backup.log for details${NC}"
  echo -e "${YELLOW}⚠️ Continuing with other safety checks...${NC}"
fi

# 3. Create component snapshot if specific component
if [ ! -z "$COMPONENT_PATH" ]; then
  echo -e "\n${BLUE}📸 Step 2: Creating component snapshot...${NC}"
  ./scripts/create_component_snapshot.sh "$COMPONENT_PATH" > "${LOG_DIR}/snapshot.log" 2>&1
  
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Component snapshot created successfully${NC}"
  else
    echo -e "${RED}❌ Component snapshot failed! Check ${LOG_DIR}/snapshot.log for details${NC}"
  fi
else
  echo -e "\n${BLUE}📸 Step 2: Component snapshot skipped (no specific component)${NC}"
fi

# 4. Run verification checks
echo -e "\n${BLUE}🔍 Step 3: Running component verification...${NC}"
./scripts/verify_components.sh > "${LOG_DIR}/verification.log" 2>&1

VERIFY_STATUS=$?
if [ $VERIFY_STATUS -eq 0 ]; then
  echo -e "${GREEN}✅ Verification completed successfully${NC}"
elif [ $VERIFY_STATUS -eq 1 ]; then
  echo -e "${RED}❌ Verification found errors! Check ${LOG_DIR}/verification.log for details${NC}"
  echo -e "${YELLOW}⚠️ WARNING: Proceeding with errors could cause system instability${NC}"
  
  # Show a summary of the errors
  grep -A 2 "❌" "${LOG_DIR}/verification.log"
else
  echo -e "${YELLOW}⚠️ Verification completed with warnings. Check ${LOG_DIR}/verification.log for details${NC}"
  # Show a summary of the warnings
  grep -A 2 "⚠️" "${LOG_DIR}/verification.log" | head -6
  if [ $(grep -c "⚠️" "${LOG_DIR}/verification.log") -gt 3 ]; then
    echo -e "${YELLOW}   ... and more warnings. See log for details.${NC}"
  fi
fi

# 5. Create safety report
echo -e "\n${BLUE}📊 Creating safety report...${NC}"
SAFETY_REPORT="${LOG_DIR}/safety_report.md"

cat > "$SAFETY_REPORT" << EOF
# TrialSage Safety Report
Generated: $(date)

## Component
${COMPONENT_PATH:-"Full system check (no specific component)"}

## Safety Checks Performed
- System Backup
- Component Snapshot
- Code Verification

## Results
- Backup: $([[ -s "${LOG_DIR}/backup.log" ]] && echo "✅ Completed" || echo "❌ Failed")
- Snapshot: $([[ -z "$COMPONENT_PATH" ]] && echo "⏩ Skipped" || ([[ -s "${LOG_DIR}/snapshot.log" ]] && echo "✅ Completed" || echo "❌ Failed"))
- Verification: $([ $VERIFY_STATUS -eq 0 ] && echo "✅ Passed" || ([ $VERIFY_STATUS -eq 1 ] && echo "❌ Failed" || echo "⚠️ Warnings"))

## Recommendations
$([ $VERIFY_STATUS -eq 0 ] && echo "✅ System is safe for changes" || echo "⚠️ Fix reported issues before proceeding with changes")

## Recovery Options
- Latest backup: $(ls -t backups/trialsage_backup_*.tar.gz 2>/dev/null | head -1)
- Latest snapshot: $([ ! -z "$COMPONENT_PATH" ] && ls -t snapshots/$(dirname "$COMPONENT_PATH")/$(basename "$COMPONENT_PATH" .jsx)_v*.jsx 2>/dev/null | head -1 || echo "N/A")
EOF

echo -e "${GREEN}✅ Safety report created: ${SAFETY_REPORT}${NC}"

# 6. Final assessment
echo -e "\n${BLUE}🔒 Safety Assessment${NC}"
echo -e "${BLUE}=================${NC}"

if [ $VERIFY_STATUS -eq 0 ]; then
  echo -e "${GREEN}✅ All safety checks PASSED. It is safe to proceed with changes.${NC}"
  echo -e "${GREEN}✅ Safety documentation has been saved to ${LOG_DIR}${NC}"
  exit 0
elif [ $VERIFY_STATUS -eq 1 ]; then
  echo -e "${RED}❌ Safety checks FAILED. Proceeding with changes is NOT recommended.${NC}"
  echo -e "${YELLOW}⚠️ Review ${LOG_DIR}/verification.log to address issues before continuing.${NC}"
  exit 1
else
  echo -e "${YELLOW}⚠️ Safety checks completed with WARNINGS.${NC}"
  echo -e "${YELLOW}⚠️ Review ${LOG_DIR}/verification.log to assess risk before continuing.${NC}"
  exit 0
fi