#!/bin/bash

# Script to automate fixing react-toastify imports across the project
# This replaces any remaining toast imports with our secure implementation

echo "🔍 Finding all files with react-toastify imports..."

# Recursive function to process files in a directory
function process_directory() {
  local dir="$1"
  
  # Find all JS/JSX/TS/TSX files
  find "$dir" -type f \( -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" \) | while read -r file; do
    # Check if file contains react-toastify imports
    if grep -q "import.*from ['\"]react-toastify['\"]" "$file"; then
      echo "🔧 Fixing imports in: $file"
      
      # Replace react-toastify imports with our secure implementation
      sed -i 's/import.*from ["'\''"]react-toastify["'\'']/import { useToast } from "..\/..\/hooks\/use-toast"/g' "$file"
      
      # Replace any ToastContainer components with our own
      sed -i 's/<ToastContainer.*\/>//g' "$file"
      
      # Replace toast.success calls
      sed -i 's/toast\.success/toast.success/g' "$file"
      
      # Replace toast.error calls
      sed -i 's/toast\.error/toast.error/g' "$file"
      
      # Replace toast.info calls
      sed -i 's/toast\.info/toast.info/g' "$file"
      
      # Replace toast.warning calls
      sed -i 's/toast\.warning/toast.warning/g' "$file"
      
      # Replace direct toast calls
      sed -i 's/toast(/toast.info(/g' "$file"
      
      echo "✅ Fixed: $file"
    fi
  done
}

# Start processing from client directory
process_directory "./client/src"

echo "✨ Toast import fixing complete!"