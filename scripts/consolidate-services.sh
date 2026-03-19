#!/bin/bash
#
# Service Consolidation Script
# 
# This script archives deprecated services to a _deprecated directory.
# Run after updating all imports to use canonical services.
#
# Usage: ./scripts/consolidate-services.sh [--dry-run]
#

set -e

DRY_RUN=false
if [[ "$1" == "--dry-run" ]]; then
    DRY_RUN=true
    echo "=== DRY RUN MODE - No changes will be made ==="
fi

SERVICES_DIR="/workspaces/Concept2Cure.RI-2-replit/server/services"
DEPRECATED_DIR="${SERVICES_DIR}/_deprecated"

# Files to deprecate
DEPRECATED_FILES=(
    # CER Services
    "cerGenerator.ts"
    "cerService.js"
    "cerPdfService.js"
    "cerServiceLite.ts"
    
    # Document Processing
    "documentProcessor.js"
    "documentProcessingService.ts"
    "documentService.js"
    
    # PDF/Word Services
    "pdfService.js"
    "pdfService-esm.js"
    "wordService.js"
    
    # Document Assembly
    "documentAssemblyService.js"
    
    # Compliance
    "complianceAnalyzer.js"
)

echo "=== Concept2Cure.RI Service Consolidation ==="
echo "Date: $(date)"
echo ""

# Create deprecated directory
if [[ "$DRY_RUN" == false ]]; then
    mkdir -p "$DEPRECATED_DIR"
    echo "Created: $DEPRECATED_DIR"
else
    echo "[DRY RUN] Would create: $DEPRECATED_DIR"
fi

# Check for imports before archiving
echo ""
echo "=== Checking for remaining imports ==="
IMPORT_ISSUES=0

for file in "${DEPRECATED_FILES[@]}"; do
    basename="${file%.*}"
    # Check for imports of this file
    count=$(grep -r "from.*${basename}" "${SERVICES_DIR}/../" --include="*.ts" --include="*.js" 2>/dev/null | grep -v "_deprecated" | grep -v "node_modules" | wc -l || true)
    
    if [[ $count -gt 0 ]]; then
        echo "⚠️  WARNING: $file still has $count imports"
        grep -r "from.*${basename}" "${SERVICES_DIR}/../" --include="*.ts" --include="*.js" 2>/dev/null | grep -v "_deprecated" | grep -v "node_modules" | head -3 || true
        IMPORT_ISSUES=$((IMPORT_ISSUES + 1))
    else
        echo "✅ $file - no imports found"
    fi
done

if [[ $IMPORT_ISSUES -gt 0 ]]; then
    echo ""
    echo "⚠️  Found $IMPORT_ISSUES files with remaining imports"
    echo "   Update imports before running without --dry-run"
    if [[ "$DRY_RUN" == false ]]; then
        echo ""
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Aborted."
            exit 1
        fi
    fi
fi

# Archive files
echo ""
echo "=== Archiving deprecated files ==="

for file in "${DEPRECATED_FILES[@]}"; do
    src="${SERVICES_DIR}/${file}"
    dst="${DEPRECATED_DIR}/${file}"
    
    if [[ -f "$src" ]]; then
        if [[ "$DRY_RUN" == false ]]; then
            mv "$src" "$dst"
            echo "✅ Archived: $file"
        else
            echo "[DRY RUN] Would archive: $file"
        fi
    else
        echo "⏭️  Skip (not found): $file"
    fi
done

# Create README in deprecated folder
if [[ "$DRY_RUN" == false ]]; then
    cat > "${DEPRECATED_DIR}/README.md" << 'EOF'
# Deprecated Services

These services have been deprecated as part of the codebase consolidation.

## Canonical Replacements

| Deprecated | Canonical Replacement |
|------------|----------------------|
| cerGenerator.ts | cerGenerationService.ts |
| cerService.js | cerGenerationService.ts |
| cerPdfService.js | cerPdfExporter.js |
| cerServiceLite.ts | cerGenerationService.ts |
| documentProcessor.js | unifiedDocumentIngestion.js |
| documentProcessingService.ts | unifiedDocumentIngestion.js |
| documentService.js | unifiedDocumentIngestion.js |
| pdfService.js | indPdfExporter.ts |
| pdfService-esm.js | indPdfExporter.ts |
| wordService.js | wordService-esm.js |
| documentAssemblyService.js | documentAssemblyService-esm.js |
| complianceAnalyzer.js | complianceService.ts |

## Deletion Schedule

These files will be permanently deleted after 30 days of monitoring.

Archived Date: $(date +%Y-%m-%d)
Scheduled Deletion: $(date -d "+30 days" +%Y-%m-%d 2>/dev/null || date -v+30d +%Y-%m-%d 2>/dev/null || echo "TBD")
EOF
    echo ""
    echo "✅ Created README in deprecated folder"
fi

echo ""
echo "=== Summary ==="
echo "Total files to archive: ${#DEPRECATED_FILES[@]}"
if [[ "$DRY_RUN" == true ]]; then
    echo ""
    echo "This was a dry run. Run without --dry-run to apply changes."
fi
