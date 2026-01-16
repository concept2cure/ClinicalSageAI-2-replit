/**
 * INTEGRATION EXAMPLE: Adding SmartTag to EditorCanvas
 * 
 * This file demonstrates how to integrate the SmartTag extension
 * into the existing TipTap editor in EditorCanvas.tsx
 */

// ============================================================================
// STEP 1: Import SmartTag Extension
// ============================================================================

import { SmartTag } from '@/editor/extensions/SmartTag';
// OR from client path:
// import { SmartTag } from '@client/editor/extensions/SmartTag';

// ============================================================================
// STEP 2: Add to Extensions Array
// ============================================================================

const editor = useEditor({
  extensions: [
    StarterKit,
    SmartTable.configure({ /* ... */ }),
    // ... other extensions ...
    SmartData,           // Existing lightweight data tagging
    SmartTag,            // NEW: Regulatory-grade data compliance
  ],
  // ... rest of config
});

// ============================================================================
// STEP 3: Insert SmartTags Programmatically
// ============================================================================

// Example: Insert a demographic statistic
const insertDemographicStat = () => {
  editor?.commands.insertSmartTag({
    value: '45.3',
    rawValue: '45.2876',
    dataset: 'ADSL',
    variable: 'AGE',
    dataVersion: 'v1.0',
    status: 'verified',
    sourceId: 'DEMO-01',
    label: 'Mean Age (ADSL/AGE v1.0)',
  });
};

// Example: Insert a p-value
const insertPValue = () => {
  editor?.commands.insertSmartTag({
    value: '0.0342',
    rawValue: '0.034235789',
    dataset: 'ADTTE',
    variable: 'PVAL_OS',
    dataVersion: 'v1.0',
    status: 'verified',
    sourceId: 'EFFICACY-03',
    label: 'OS p-value',
  });
};

// Example: Insert a safety count
const insertSafetyCount = () => {
  editor?.commands.insertSmartTag({
    value: '23',
    rawValue: '23',
    dataset: 'ADAE',
    variable: 'AESER_N',
    dataVersion: 'v1.0',
    status: 'draft',
    sourceId: 'SAFETY-05',
    label: 'Serious AEs',
  });
};

// ============================================================================
// STEP 4: Bulk Import from SAS Dataset
// ============================================================================

interface SASDataPoint {
  table_id: string;
  dataset: string;
  variable: string;
  value: number | string;
  formatted_value: string;
  version: string;
}

const importSASData = async (documentId: string) => {
  // Fetch data from backend API
  const response = await fetch(`/api/sas/import/${documentId}`);
  const dataPoints: SASDataPoint[] = await response.json();

  // Insert each data point as a SmartTag
  dataPoints.forEach(dp => {
    editor?.commands.insertSmartTag({
      value: dp.formatted_value,
      rawValue: String(dp.value),
      dataset: dp.dataset,
      variable: dp.variable,
      dataVersion: dp.version,
      status: 'draft', // Start as draft, QC later
      sourceId: dp.table_id,
      label: `${dp.dataset}/${dp.variable} (${dp.version})`,
    });
  });
};

// ============================================================================
// STEP 5: Status Update Functions
// ============================================================================

// Mark all tags as verified after QC
const verifyAllTags = () => {
  // Note: This requires implementing a custom command to update existing tags
  // For now, this is a placeholder for future enhancement
  console.log('Verify all tags functionality coming soon');
};

// Flag stale tags when data version changes
const flagStaleTags = (oldVersion: string, newVersion: string) => {
  // Pseudo-code for version detection
  // This would require traversing the editor content and updating tag status
  console.log(`Flagging tags from ${oldVersion} to ${newVersion}`);
};

// Freeze all tags for submission
const freezeAllTags = () => {
  console.log('Freezing all tags for regulatory submission');
};

// ============================================================================
// STEP 6: Add UI Controls (Example Toolbar Buttons)
// ============================================================================

const SmartTagToolbar = () => {
  return (
    <div className="flex gap-2 p-2 border-b">
      <Button onClick={insertDemographicStat} size="sm" variant="outline">
        Insert Demo Stat
      </Button>
      <Button onClick={insertPValue} size="sm" variant="outline">
        Insert p-value
      </Button>
      <Button onClick={insertSafetyCount} size="sm" variant="outline">
        Insert Safety Count
      </Button>
      <Separator orientation="vertical" className="h-6" />
      <Button onClick={verifyAllTags} size="sm" variant="outline">
        Verify All
      </Button>
      <Button onClick={freezeAllTags} size="sm" variant="outline">
        Freeze for Submission
      </Button>
    </div>
  );
};

// ============================================================================
// STEP 7: Complete Integration Example
// ============================================================================

export default function EnhancedEditorCanvas({
  content,
  onChange,
  region,
  documentId,
  productName,
}: EditorCanvasProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      SmartTable.configure({ /* ... */ }),
      TableRow.configure({ /* ... */ }),
      TableHeader.configure({ /* ... */ }),
      TableCell.configure({ /* ... */ }),
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Mention.configure({ /* ... */ }),
      CharacterCount,
      ValidationPlugin.configure({ /* ... */ }),
      CitationsPlugin,
      PlaceholdersPlugin.configure({ /* ... */ }),
      RedlinePlugin,
      RegionTerminologyPlugin.configure({ region }),
      SmartData,    // Existing
      SmartTag,     // NEW: Add SmartTag
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose-base lg:prose-lg xl:prose-xl mx-auto font-serif leading-relaxed focus:outline-none min-h-[400px] p-6',
      },
    },
  });

  return (
    <div className="editor-container">
      <SmartTagToolbar />
      <EditorContent editor={editor} />
    </div>
  );
}

// ============================================================================
// STEP 8: Import CSS Styling
// ============================================================================

// Add to your main CSS file or component:
// import '@/editor/styles/smarttag.css';

// ============================================================================
// STEP 9: Backend API (Example)
// ============================================================================

/*
// Express route to import SAS data
app.post('/api/sas/import/:documentId', async (req, res) => {
  const { documentId } = req.params;
  
  // Parse uploaded SAS dataset (XPORT, CSV, etc.)
  const dataPoints = await parseSASFile(req.file);
  
  // Return formatted data points
  res.json(dataPoints.map(dp => ({
    table_id: dp.table,
    dataset: dp.domain,
    variable: dp.varname,
    value: dp.raw_value,
    formatted_value: dp.display_value,
    version: dp.data_version,
  })));
});
*/

// ============================================================================
// COMPLETE! SmartTag is now integrated into your editor.
// ============================================================================

export {
  insertDemographicStat,
  insertPValue,
  insertSafetyCount,
  importSASData,
  verifyAllTags,
  flagStaleTags,
  freezeAllTags,
  SmartTagToolbar,
};
