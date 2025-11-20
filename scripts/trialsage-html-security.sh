#!/bin/bash
# TrialSage HTML Security Control Panel

# Display usage if no arguments provided
if [ $# -eq 0 ]; then
  echo "TrialSage HTML Security Control Panel"
  echo "Usage: $0 [command]"
  echo ""
  echo "Available commands:"
  echo "  status    - Check current lock status and integrity"
  echo "  lock      - Lock HTML files (read-only)"
  echo "  unlock    - Unlock HTML files for editing"
  echo "  verify    - Verify integrity of HTML files"
  echo "  backup    - Create a backup of HTML files"
  echo ""
  exit 0
fi

# Process commands
command=$1

case $command in
  status)
    echo "🔍 Checking TrialSage HTML security status..."
    # Check if files are locked
    find trialsage-html -type f -name "*.html" -perm /u+w -exec echo "⚠️ UNLOCKED: {}" \; || echo "✅ All HTML files are locked (read-only)"
    # Verify checksums
    bash infra/verify_integrity.sh
    ;;
    
  lock)
    echo "🔒 Locking HTML files..."
    bash scripts/lock-html
    ;;
    
  unlock)
    echo "🔓 Unlocking HTML files for editing..."
    bash scripts/unlock-html
    echo "⚠️ IMPORTANT: Remember to lock files when done with edits!"
    echo "Run: ./scripts/trialsage-html-security.sh lock"
    ;;
    
  verify)
    echo "🔍 Verifying HTML file integrity..."
    bash infra/verify_integrity.sh
    ;;
    
  backup)
    echo "📦 Creating backup of HTML files..."
    bash infra/backup_html.sh
    ;;
    
  *)
    echo "❌ Unknown command: $command"
    echo "Run without arguments to see usage"
    exit 1
    ;;
esac