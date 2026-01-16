# TipTap Editor Extensions

Custom extensions for Clinical Sage AI's regulatory document editor.

## 📁 Directory Structure

```
editor/
├── extensions/               ← TipTap custom extensions
│   ├── SmartTag.js          ← Regulatory-grade data tagging (NEW)
│   └── index.js             ← Export barrel
│
├── components/              ← React components for node views
│   └── SmartTagChip.tsx     ← Visual chip for SmartTag (NEW)
│
├── styles/                  ← Extension-specific CSS
│   └── smarttag.css         ← SmartTag status styling (NEW)
│
├── SMARTTAG_DEMO.md         ← Complete usage guide (NEW)
├── INTEGRATION_EXAMPLE.tsx  ← Working code examples (NEW)
├── IMPLEMENTATION_SUMMARY.md ← Technical overview (NEW)
└── README.md                ← This file
```

## 🚀 Quick Start

### Install SmartTag Extension

```javascript
import { SmartTag } from '@/editor/extensions/SmartTag';

const editor = useEditor({
  extensions: [
    StarterKit,
    SmartTag,  // Add SmartTag
  ],
});
```

### Insert a Data Point

```javascript
editor.commands.insertSmartTag({
  value: '45.3',
  rawValue: '45.2876',
  dataset: 'ADSL',
  variable: 'AGE',
  status: 'verified',
});
```

## 📚 Documentation

- **[SMARTTAG_DEMO.md](SMARTTAG_DEMO.md)** - Comprehensive usage guide with examples
- **[INTEGRATION_EXAMPLE.tsx](INTEGRATION_EXAMPLE.tsx)** - Working integration code
- **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** - Technical overview

## 🎯 Extensions

### SmartTag (NEW)
**Purpose**: Regulatory-grade data traceability for IND/eCTD submissions

**Key Features**:
- 🔒 Atom protection (users cannot manually edit)
- 📊 Full Chain of Custody (dataset, variable, version)
- ✅ Status tracking (draft/verified/stale/frozen)
- 🎨 Color-coded compliance indicators

**Files**:
- [extensions/SmartTag.js](extensions/SmartTag.js) - Core extension
- [components/SmartTagChip.tsx](components/SmartTagChip.tsx) - Visual component
- [styles/smarttag.css](styles/smarttag.css) - Styling

**Status**: ✅ Production-ready

---

## 🔧 Development

### Adding a New Extension

1. Create extension in `extensions/YourExtension.js`
2. Export in `extensions/index.js`
3. Create React component in `components/YourComponent.tsx` (if needed)
4. Add styles in `styles/yourextension.css` (if needed)
5. Document in README

### Testing Extensions

```bash
npm run dev
# Navigate to editor
# Use browser console to test commands
editor.commands.insertYourExtension({ ... })
```

---

## 📦 Available Extensions

| Extension | Status | Purpose |
|-----------|--------|---------|
| **SmartTag** | ✅ Ready | Clinical data compliance tagging |

---

## 🎓 Resources

- [TipTap Documentation](https://tiptap.dev)
- [TipTap Custom Extensions Guide](https://tiptap.dev/guide/custom-extensions)
- [React Node Views](https://tiptap.dev/guide/node-views/react)

---

## 💡 Best Practices

### Extension Design
- Use **Node** for atomic entities (like data points)
- Use **Mark** for text formatting (like bold, italic)
- Set `atom: true` for non-editable content
- Provide comprehensive `parseHTML` and `renderHTML`

### React Components
- Use `NodeViewWrapper` from `@tiptap/react`
- Set `contentEditable={false}` for atom nodes
- Add `data-*` attributes for HTML export
- Include accessibility attributes (`title`, `aria-label`)

### Styling
- Namespace classes to avoid conflicts (`smart-tag-chip`, not `chip`)
- Use status modifiers (`.status-verified`, `.status-stale`)
- Provide hover states for interactivity
- Support dark mode if applicable

---

**Maintained by**: Clinical Sage AI Development Team  
**Last Updated**: 2025-01-15
