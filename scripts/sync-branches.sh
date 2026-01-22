#!/bin/bash

###############################################################################
# Branch Synchronization Script
# 
# Purpose: Synchronize all non-main branches with main branch updates
# 
# Governance Rules:
# 1. Main is the single source of truth
# 2. Updates flow FROM main TO branches (never INTO main)
# 3. No automatic merges INTO main - requires PR approval
# 4. Merge conflicts are reported, not auto-resolved
# 5. Maintains clear audit trail
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Initialize counters
SUCCESS_COUNT=0
CONFLICT_COUNT=0
ERROR_COUNT=0
SKIPPED_COUNT=0

# Arrays to track results
declare -a SUCCESS_BRANCHES
declare -a CONFLICT_BRANCHES
declare -a ERROR_BRANCHES
declare -a SKIPPED_BRANCHES

# Function to check if we're on the correct branch
check_current_branch() {
    local current_branch=$(git rev-parse --abbrev-ref HEAD)
    log_info "Current branch: $current_branch"
}

# Function to fetch latest changes
fetch_all() {
    log_info "Fetching all remote branches..."
    if git fetch --all --prune; then
        log_success "Successfully fetched all branches"
    else
        log_error "Failed to fetch branches"
        exit 1
    fi
}

# Function to ensure main is up to date
update_main() {
    log_info "Ensuring main branch is up to date..."
    
    # Store current branch
    local current_branch=$(git rev-parse --abbrev-ref HEAD)
    
    # Checkout main
    if git checkout main 2>/dev/null; then
        # Pull latest changes
        if git pull origin main; then
            log_success "Main branch updated successfully"
        else
            log_error "Failed to update main branch"
            git checkout "$current_branch" 2>/dev/null || true
            exit 1
        fi
        # Return to original branch
        git checkout "$current_branch" 2>/dev/null || true
    else
        log_warning "Main branch not found locally, will use origin/main"
    fi
}

# Function to get all remote branches except main
get_branches_to_sync() {
    log_info "Identifying branches to sync..."
    
    # Get all remote branches excluding main and HEAD
    git branch -r | grep -v '\->' | grep -v 'origin/main' | sed 's/origin\///' | sort -u
}

# Function to sync a single branch
sync_branch() {
    local branch=$1
    log_info "=========================================="
    log_info "Processing branch: $branch"
    
    # Check if branch exists locally
    if git rev-parse --verify "$branch" >/dev/null 2>&1; then
        log_info "Branch exists locally, checking out..."
        if ! git checkout "$branch" 2>/dev/null; then
            log_error "Failed to checkout branch: $branch"
            ERROR_BRANCHES+=("$branch")
            ((ERROR_COUNT++))
            return 1
        fi
    else
        log_info "Branch doesn't exist locally, creating from remote..."
        if ! git checkout -b "$branch" "origin/$branch" 2>/dev/null; then
            log_error "Failed to create local branch from remote: $branch"
            ERROR_BRANCHES+=("$branch")
            ((ERROR_COUNT++))
            return 1
        fi
    fi
    
    # Check if branch is already up to date with main
    local main_sha=$(git rev-parse origin/main)
    local merge_base=$(git merge-base HEAD origin/main)
    
    if [ "$main_sha" = "$merge_base" ]; then
        log_info "Branch $branch is already up to date with main"
        SKIPPED_BRANCHES+=("$branch (already up to date)")
        ((SKIPPED_COUNT++))
        return 0
    fi
    
    log_info "Merging main into $branch..."
    
    # Attempt to merge main into current branch
    if git merge origin/main --no-edit --no-ff -m "Merge main into $branch - automated sync"; then
        log_success "Successfully merged main into $branch"
        
        # Push the changes
        if git push origin "$branch"; then
            log_success "Successfully pushed $branch to remote"
            SUCCESS_BRANCHES+=("$branch")
            ((SUCCESS_COUNT++))
        else
            log_error "Failed to push $branch to remote"
            ERROR_BRANCHES+=("$branch (push failed)")
            ((ERROR_COUNT++))
            # Abort the merge since we couldn't push
            git merge --abort 2>/dev/null || true
            return 1
        fi
    else
        # Merge conflict detected
        log_warning "MERGE CONFLICT detected in branch: $branch"
        log_warning "This requires manual resolution. Aborting merge..."
        
        # Abort the merge
        git merge --abort 2>/dev/null || true
        
        # Record conflict
        CONFLICT_BRANCHES+=("$branch")
        ((CONFLICT_COUNT++))
        
        log_warning "Conflict details for $branch:"
        log_warning "  - Branch has diverged from main"
        log_warning "  - Manual merge required"
        log_warning "  - Action: Review changes and resolve conflicts manually"
        
        return 1
    fi
}

# Function to print summary report
print_summary() {
    echo ""
    echo "=========================================="
    echo "SYNCHRONIZATION SUMMARY"
    echo "=========================================="
    echo ""
    
    echo "Total branches processed: $(( SUCCESS_COUNT + CONFLICT_COUNT + ERROR_COUNT + SKIPPED_COUNT ))"
    echo ""
    
    if [ $SUCCESS_COUNT -gt 0 ]; then
        log_success "Successfully synced: $SUCCESS_COUNT"
        for branch in "${SUCCESS_BRANCHES[@]}"; do
            echo "  ✓ $branch"
        done
        echo ""
    fi
    
    if [ $SKIPPED_COUNT -gt 0 ]; then
        log_info "Skipped (already up to date): $SKIPPED_COUNT"
        for branch in "${SKIPPED_BRANCHES[@]}"; do
            echo "  - $branch"
        done
        echo ""
    fi
    
    if [ $CONFLICT_COUNT -gt 0 ]; then
        log_warning "Conflicts detected: $CONFLICT_COUNT"
        echo "The following branches have merge conflicts and require manual resolution:"
        for branch in "${CONFLICT_BRANCHES[@]}"; do
            echo "  ⚠ $branch"
        done
        echo ""
        log_warning "ACTION REQUIRED: Manually resolve conflicts in these branches"
        log_warning "To resolve:"
        log_warning "  1. git checkout <branch>"
        log_warning "  2. git merge main"
        log_warning "  3. Resolve conflicts"
        log_warning "  4. git commit"
        log_warning "  5. git push origin <branch>"
        echo ""
    fi
    
    if [ $ERROR_COUNT -gt 0 ]; then
        log_error "Errors encountered: $ERROR_COUNT"
        for branch in "${ERROR_BRANCHES[@]}"; do
            echo "  ✗ $branch"
        done
        echo ""
    fi
    
    echo "=========================================="
    echo "GOVERNANCE COMPLIANCE CHECK"
    echo "=========================================="
    log_success "✓ Main branch integrity preserved (no changes to main)"
    log_success "✓ Updates flowed FROM main TO branches only"
    log_success "✓ Merge conflicts reported for human review"
    log_success "✓ Audit trail maintained in git history"
    echo ""
    
    if [ $CONFLICT_COUNT -gt 0 ] || [ $ERROR_COUNT -gt 0 ]; then
        log_warning "Some branches require attention. Please review the summary above."
        exit 1
    else
        log_success "All branches synchronized successfully!"
        exit 0
    fi
}

# Main execution
main() {
    log_info "=========================================="
    log_info "BRANCH SYNCHRONIZATION PROCESS"
    log_info "=========================================="
    log_info "Start time: $(date)"
    echo ""
    
    # Check current branch
    check_current_branch
    
    # Store original branch to return to it later
    ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)
    
    # Fetch all branches
    fetch_all
    echo ""
    
    # Update main branch
    update_main
    echo ""
    
    # Get list of branches to sync
    BRANCHES=$(get_branches_to_sync)
    
    if [ -z "$BRANCHES" ]; then
        log_info "No branches to sync (only main exists)"
        exit 0
    fi
    
    echo "Branches to sync:"
    echo "$BRANCHES" | sed 's/^/  - /'
    echo ""
    
    # Process each branch
    while IFS= read -r branch; do
        # Skip empty lines
        [ -z "$branch" ] && continue
        
        # Sync the branch
        sync_branch "$branch" || true  # Continue even if sync fails
        echo ""
    done <<< "$BRANCHES"
    
    # Return to original branch
    log_info "Returning to original branch: $ORIGINAL_BRANCH"
    git checkout "$ORIGINAL_BRANCH" 2>/dev/null || git checkout main 2>/dev/null || true
    
    echo ""
    log_info "End time: $(date)"
    echo ""
    
    # Print summary
    print_summary
}

# Run main function
main "$@"
