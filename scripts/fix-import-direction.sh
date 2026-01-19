#!/bin/bash

# Find and fix all files importing server/db incorrectly
find . -name "*.ts" -exec grep -l "from.*server/db" {} \; | while read file; do
  # Only fix files outside of server/ directory
  if [[ ! $file == server/* ]] && [[ ! $file == shared/schema.ts ]]; then
    sed -i 's|from.*server/db|from @shared/schema|g' "$file"
    git add "$file"
    echo "✅ Fixed import: $file"
  fi
done

# Also fix the broken imports in shared/types files
sed -i 's|from.*server/db|from @shared/schema|g' shared/types.strict.d.ts
sed -i 's|from.*server/db|from @shared/schema|g' shared/schema.exports.ts

git add shared/types.strict.d.ts shared/schema.exports.ts
