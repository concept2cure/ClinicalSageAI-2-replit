#!/usr/bin/env python3
import os
import re

def fix_imports_in_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Fix imports from trialsage.* to relative imports
    content = re.sub(r'from trialsage\.', 'from ..', content)
    
    with open(filepath, 'w') as f:
        f.write(content)
    
    print(f"Fixed imports in {filepath}")

# Fix imports in all controller files
controllers_dir = "trialsage/controllers"
for filename in os.listdir(controllers_dir):
    if filename.endswith('.py'):
        filepath = os.path.join(controllers_dir, filename)
        fix_imports_in_file(filepath)

print("All imports fixed!")