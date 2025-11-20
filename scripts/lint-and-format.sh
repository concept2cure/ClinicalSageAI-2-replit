#!/bin/bash

# Create scripts directory if it doesn't exist
mkdir -p scripts

# Lint the codebase
echo "Running ESLint..."
npx eslint . --ext .js,.jsx,.ts,.tsx --max-warnings=0

# Format the codebase
echo "Running Prettier..."
npx prettier -w .

echo "Done!"