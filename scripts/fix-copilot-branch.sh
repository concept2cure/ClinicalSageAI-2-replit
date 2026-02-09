#!/bin/bash
# Fix Copilot Branch Issue
# This script helps migrate work from a copilot/* branch back to concept2cure-v2

set -e

# Check if script has execute permissions
if [ ! -x "$0" ]; then
    echo "Error: This script needs execute permissions."
    echo "Run: chmod +x $0"
    exit 1
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Copilot Branch Fix Utility ===${NC}"
echo ""

# Check current branch
CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"

# Check if we're on a copilot/* branch
if [[ ! "$CURRENT_BRANCH" =~ ^copilot/.* ]]; then
    echo -e "${GREEN}✓ You're not on a copilot/* branch. No action needed.${NC}"
    exit 0
fi

echo -e "${RED}⚠ WARNING: You are on a copilot/* branch!${NC}"
echo "According to repository governance, all work must be on concept2cure-v2"
echo ""

# Check if there are uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo -e "${YELLOW}You have uncommitted changes. Please commit them first.${NC}"
    git status --short
    exit 1
fi

# Get list of commits on this branch but not on concept2cure-v2
echo ""
echo "Checking for commits to migrate..."
git fetch origin concept2cure-v2 2>/dev/null || true

# Count commits
COMMIT_COUNT=$(git rev-list --count origin/concept2cure-v2..HEAD 2>/dev/null || echo "0")

if [ "$COMMIT_COUNT" = "0" ]; then
    echo -e "${GREEN}No commits to migrate. Safe to switch to concept2cure-v2.${NC}"
    echo ""
    echo "Switching to concept2cure-v2..."
    git checkout concept2cure-v2
    git pull origin concept2cure-v2
    echo -e "${GREEN}✓ Successfully switched to concept2cure-v2${NC}"
    
    echo ""
    echo "Cleaning up copilot branch..."
    read -p "Delete local copilot branch '$CURRENT_BRANCH'? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git branch -D "$CURRENT_BRANCH"
        echo -e "${GREEN}✓ Local branch deleted${NC}"
        
        # Check if branch exists on remote
        if git ls-remote --exit-code --heads origin "$CURRENT_BRANCH" >/dev/null 2>&1; then
            read -p "Delete remote copilot branch '$CURRENT_BRANCH'? (y/n) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                git push origin --delete "$CURRENT_BRANCH"
                echo -e "${GREEN}✓ Remote branch deleted${NC}"
            fi
        fi
    fi
    exit 0
fi

echo "Found $COMMIT_COUNT commit(s) to migrate"
echo ""
echo "Commits to be migrated:"
git log --oneline origin/concept2cure-v2..HEAD
echo ""

read -p "Migrate these commits to concept2cure-v2? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted. No changes made."
    exit 0
fi

echo ""
echo "Switching to concept2cure-v2..."
git checkout concept2cure-v2
git pull origin concept2cure-v2

echo ""
echo "Cherry-picking commits..."
# Get list of commit hashes
COMMITS=$(git rev-list --reverse origin/concept2cure-v2.."$CURRENT_BRANCH")

for commit in $COMMITS; do
    echo "Cherry-picking $commit..."
    if ! git cherry-pick "$commit"; then
        echo -e "${RED}✗ Cherry-pick failed. Please resolve conflicts manually.${NC}"
        echo "After resolving, run: git cherry-pick --continue"
        echo "Or abort with: git cherry-pick --abort"
        exit 1
    fi
done

echo -e "${GREEN}✓ All commits successfully migrated to concept2cure-v2${NC}"
echo ""

# Push changes
read -p "Push changes to origin/concept2cure-v2? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    git push origin concept2cure-v2
    echo -e "${GREEN}✓ Changes pushed to origin${NC}"
fi

echo ""
echo "Cleaning up copilot branch..."
read -p "Delete local copilot branch '$CURRENT_BRANCH'? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    git branch -D "$CURRENT_BRANCH"
    echo -e "${GREEN}✓ Local branch deleted${NC}"
    
    # Check if branch exists on remote
    if git ls-remote --exit-code --heads origin "$CURRENT_BRANCH" >/dev/null 2>&1; then
        read -p "Delete remote copilot branch '$CURRENT_BRANCH'? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            git push origin --delete "$CURRENT_BRANCH"
            echo -e "${GREEN}✓ Remote branch deleted${NC}"
        fi
    fi
fi

echo ""
echo -e "${GREEN}=== Migration Complete ===${NC}"
echo "You are now on concept2cure-v2 with all your changes."
echo "Remember: Future work should be done directly on concept2cure-v2!"
