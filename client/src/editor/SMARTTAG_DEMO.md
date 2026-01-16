# SmartTag Extension - Regulatory Compliance Demo

## Overview
The **SmartTag** extension provides regulatory-grade data traceability for clinical documents in IND/eCTD submissions. Every number, p-value, demographic statistic, and safety count maintains a complete Chain of Custody back to its statistical source.

## Key Features

### 1. **Atom Protection** (`atom: true`)
- Users CANNOT manually edit the number inside a SmartTag
- This prevents typos, transcription errors, and "finger trouble" during document editing
- Only programmatic updates (via re-import from SAS) can change the value

### 2. **Chain of Custody**
Each SmartTag tracks:
- **Dataset**: CDISC domain (ADSL, ADAE, ADLB, etc.)
- **Variable**: Specific statistical variable (AVAL, PCHG, etc.)
- **Version**: Data cut version (v1.0, v1.1, v2.0)
- **Raw Value**: Exact SAS output (e.g., 0.0453221)
- **Display Value**: ICH E3 formatted (e.g., "0.045")

### 3. **Status Tracking**
- 🟡 **Draft** (amber) - Data inserted but not QC'd
- 🟢 **Verified** (green) - Passed QC validation
- 🔴 **Stale** (red, pulsing) - Upstream data changed, needs re-verification
- 🔵 **Frozen** (blue, 🔒) - Locked for regulatory submission

### 4. **Version Control**
When statistical datasets are updated (e.g., ADSL v1.0 → v1.1):
- All SmartTags linked to that dataset are flagged as **stale**
- The system prevents submission until stale tags are re-verified or replaced
- This prevents "Refusal to File" due to outdated data

## Usage Example

### Installation
```javascript
// Add to your TipTap editor extensions
import { SmartTag } from '@/editor/extensions/SmartTag';

const editor = useEditor({
  extensions: [
    StarterKit,
    SmartTag, // <-- Add SmartTag extension
    // ... other extensions
  ],
  // ...
});
```

### Inserting a SmartTag
```javascript
// Insert a demographic statistic from ADSL
editor.commands.insertSmartTag({
  value: '45.3',              // Display value (ICH E3 formatted)
  rawValue: '45.2876',        // Raw SAS output
  dataset: 'ADSL',            // CDISC domain
  variable: 'AGE',            // Statistical variable
  dataVersion: 'v1.0',        // Data cut version
  status: 'verified',         // QC status
  sourceId: 'DEMO-TABLE-01',  // Link to source table
  label: 'Mean Age (ADSL/AGE v1.0)', // Hover tooltip
});

// Insert a p-value from efficacy analysis
editor.commands.insertSmartTag({
  value: '0.0342',
  rawValue: '0.034235789',
  dataset: 'ADTTE',
  variable: 'PVAL_OS',
  dataVersion: 'v1.0',
  status: 'verified',
  sourceId: 'EFFICACY-TABLE-03',
  label: 'Overall Survival p-value (ADTTE/PVAL_OS v1.0)',
});

// Insert a safety count from ADAE
editor.commands.insertSmartTag({
  value: '23',
  rawValue: '23',
  dataset: 'ADAE',
  variable: 'AESER_N',
  dataVersion: 'v1.0',
  status: 'draft', // Not yet QC'd
  sourceId: 'SAFETY-LISTING-05',
  label: 'Serious AEs (ADAE/AESER_N v1.0)',
});
```

### HTML Output
When serialized to HTML (for eCTD submission), SmartTags render as:

```html
<smart-tag
  data-id="tag-1735678901234-abc123"
  data-value="45.3"
  data-raw-value="45.2876"
  data-dataset="ADSL"
  data-variable="AGE"
  data-version="v1.0"
  data-verified="2025-01-15T14:30:00Z"
  data-status="verified"
  data-source-id="DEMO-TABLE-01"
  data-label="Mean Age (ADSL/AGE v1.0)"
  class="smart-tag-chip status-verified"
  title="Mean Age (ADSL/AGE v1.0)"
>45.3</smart-tag>
```

### Visual Appearance
In the editor, SmartTags appear as colored chips:
- **Draft**: `[45.3]` in amber/yellow
- **Verified**: `[45.3]` in green
- **Stale**: `[45.3]` in red (pulsing animation)
- **Frozen**: `[45.3 🔒]` in blue (with lock icon)

## Regulatory Workflow

### Step 1: Data Import
Statistical programmer exports SAS datasets → SmartTag parser extracts values → Tags inserted as **draft**

### Step 2: QC Review
Medical writer reviews tags → Verify accuracy → Mark as **verified** (turns green)

### Step 3: Version Detection
SAS data updated (v1.0 → v1.1) → System flags all v1.0 tags as **stale** (turns red, pulsing)

### Step 4: Re-verification
Writer reviews each stale tag → Replace or re-verify → Mark as **verified**

### Step 5: Submission Lock
Document ready for eCTD → All tags marked **frozen** (turns blue, locked)

## API Reference

### SmartTagAttributes
```typescript
interface SmartTagAttributes {
  id: string | null;                    // Auto-generated UUID
  value: string;                        // Display value (REQUIRED)
  rawValue: string | null;              // Exact SAS output
  sourceId: string | null;              // Link to source table/listing
  dataset: string | null;               // CDISC domain (ADSL, ADAE, etc.)
  variable: string | null;              // Statistical variable name
  dataVersion: string;                  // Data cut version (default: 'v1.0')
  lastVerified: string | null;          // ISO timestamp of last QC
  status: 'draft' | 'verified' | 'stale' | 'frozen';
  label: string;                        // Hover tooltip text
}
```

### Commands
```typescript
editor.commands.insertSmartTag(attrs: SmartTagInsertPayload)
```

## Compliance Benefits

### 21 CFR Part 11
- **Audit Trails**: Every tag has `lastVerified` timestamp
- **Data Integrity**: `atom: true` prevents manual tampering
- **Version Control**: `dataVersion` tracks data provenance

### ICH E3
- **Precision Rules**: `rawValue` vs `value` separation
- **Source Documentation**: `sourceId` links to Tables/Listings/Figures

### FDA Refusal to File Prevention
- **Stale Data Detection**: Red flags prevent submission of outdated statistics
- **Traceability**: Every number has documented source

## Integration with Existing SmartData
SmartTag is designed to **coexist** with the existing SmartDataNode:
- **SmartDataNode**: Lightweight tagging for nonclinical data (simple `value` + `sourceLabel`)
- **SmartTag**: Full regulatory compliance for clinical trial data (Chain of Custody)

Both can be used in the same editor without conflicts.

## CSS Styling
The extension includes comprehensive status-based styling:
- Color-coded by verification status
- Pulse animation for stale tags
- Lock icon for frozen tags
- Hover tooltips with full metadata

See `client/src/editor/styles/smarttag.css` for complete styling.

## Advanced Features (Future)

### Planned Enhancements
1. **Bulk Status Updates**: Select all tags from ADSL v1.0 → Mark as verified
2. **Diff Viewer**: Compare v1.0 vs v1.1 values side-by-side
3. **Export Report**: Generate audit trail PDF with all tag metadata
4. **SAS Integration**: Direct connection to statistical systems for auto-update
5. **Multi-language**: Support for translations in Module 1 Regional

## Examples in Context

### Efficacy Section
> In the ITT population (N = `[312]`), the median overall survival was `[24.5]` months 
> (95% CI: `[21.3]` - `[27.8]`) in the treatment group versus `[18.2]` months 
> (95% CI: `[15.9]` - `[20.4]`) in the control group (HR = `[0.73]`, p = `[0.0342]`).

All bracketed values are SmartTags with full traceability.

### Safety Section
> A total of `[127]` subjects (40.7%) experienced at least one treatment-emergent 
> adverse event (TEAE). Serious adverse events occurred in `[23]` subjects (7.4%).

Each count is a SmartTag linked to ADAE dataset, specific variable, and data cut version.

## Troubleshooting

### Tag Not Inserting
- Ensure `value` is provided (required field)
- Check that SmartTag extension is registered in editor

### Tag Appears as Plain Text
- Verify React component (SmartTagChip.tsx) is imported correctly
- Check that `addNodeView()` calls `ReactNodeViewRenderer(SmartTagChip)`

### Styling Not Applied
- Import `smarttag.css` in your main CSS file
- Ensure Tailwind CSS is configured to scan editor components

## Support
For questions or feature requests, see the project documentation or contact the development team.

---

**Note**: This extension is designed for regulatory submissions and follows FDA, EMA, and ICH guidelines for electronic document formats.
