# TrialSage Vault™ Enhanced Reference Model - Integration Guide

This guide provides step-by-step instructions for integrating the Enhanced Reference Model into the TrialSage Vault™ application. The Reference Model is based on Veeva-style document management with document types, subtypes, lifecycles, and automated retention policies.

## 1. Components Overview

The Enhanced Reference Model consists of:

- **SQL Schema**: Tables for document types, subtypes, lifecycles, and folder templates
- **API Routes**: Meta API endpoints for taxonomy data and reference model operations
- **React Components**: UI components for document type selection and navigation
- **Middleware**: Enforces folder hierarchy and manages document lifecycles
- **Cron Jobs**: Schedules periodic reviews and applies retention policies

## 2. Integration Steps

Follow these 10 steps to fully integrate the Reference Model:

### Step 1: Run SQL Schema Migration

Run the `sql/reference_model.sql` file in Supabase or your PostgreSQL database to create the necessary tables and trigger functions.

```bash
# Using psql
psql -U postgres -d your_database -f sql/reference_model.sql

# Using Supabase Console
# Copy and paste the contents into the SQL Editor
```

### Step 2: Add Meta API Routes to Server

In `server/index.js`, import and use the meta routes:

```javascript
import metaRoutes from './routes/meta.js';
app.use('/api/meta', verifyJwt, metaRoutes);
```

### Step 3: Add the Reference Model Hooks

Make sure the `server/hooks/refModel.js` file is properly set up with the following functions:

- `getSubtype(id)`: Retrieves document subtype information
- `enforceFolder(folderId, subtypeId)`: Validates document placement
- `calculateRetentionDates(subtypeId, tenantId)`: Calculates dates for retention policies

### Step 4: Add the Periodic Review Job

Import the periodic review scheduler in `server/index.js`:

```javascript
import './jobs/periodicReview.js';
```

Ensure the cron job is set up to run at the desired intervals:

- Document review check: Daily at 2:00 AM
- Old task cleanup: Weekly on Sundays at 3:00 AM

### Step 5: Use Reference Model Middleware in Document Routes

In the documents routes file (`server/routes/documents.js`), import and use the reference model middleware:

```javascript
import refModelMiddleware from '../middleware/referenceModel.js';

// Apply to document creation/update routes
router.post('/documents', refModelMiddleware.validateDocumentAgainstModel, createDocument);
router.put('/documents/:id', refModelMiddleware.validateDocumentAgainstModel, updateDocument);
```

### Step 6: Replace Document Type Dropdowns with SubtypeSelect

Replace existing document type selection components with the enhanced `SubtypeSelect`:

```jsx
import SubtypeSelect from '@/components/SubtypeSelect';

// In your form component
<SubtypeSelect
  value={selectedSubtype}
  onChange={setSelectedSubtype}
  topFolder={currentFolder?.document_type_id}
/>;
```

### Step 7: Add TypeBreadcrumb to Document Preview

Add the `TypeBreadcrumb` component to document preview pages:

```jsx
import TypeBreadcrumb from '@/components/TypeBreadcrumb';

// In your document preview component
<TypeBreadcrumb subtypeId={document.document_subtype_id} />;
```

### Step 8: Initialize Folder Structure for Tenants

When a new tenant is created, initialize their folder structure:

```javascript
// Make a POST request to create the initial folder structure
await fetch('/api/meta/initialize-folders', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
});
```

### Step 9: Migrate Legacy Documents

Use the `scripts/migrate_legacy_types.js` script to migrate existing documents to the new reference model:

```bash
node scripts/migrate_legacy_types.js
```

This will:

1. Find all documents with legacy document types
2. Prompt for mapping to new subtypes
3. Update the documents with the appropriate subtype_id
4. Calculate and set retention dates based on the subtype
5. Create periodic review tasks if applicable

### Step 10: Quality Assurance Testing

Test the reference model implementation by:

1. Creating new documents of each subtype
2. Verifying they are placed in the correct folders
3. Checking that lifecycles are properly applied
4. Confirming that periodic review tasks are created for applicable documents
5. Validating that retention dates are correctly calculated
6. Testing folder hierarchy enforcement when moving documents

## 3. API Reference

### Meta API Endpoints

- `GET /api/meta/types`: Get all document types
- `GET /api/meta/subtypes`: Get all document subtypes (with optional type_id filter)
- `GET /api/meta/lifecycles`: Get all available lifecycles
- `GET /api/meta/retention/:subtypeId`: Get retention rules for a subtype
- `POST /api/meta/initialize-folders`: Initialize folder structure for a tenant

### Reference Model API Endpoints

- `GET /api/reference-model/document-types`: Get all document types
- `GET /api/reference-model/document-subtypes`: Get document subtypes
- `GET /api/reference-model/lifecycles`: Get all lifecycles
- `GET /api/reference-model/folder-templates`: Get folder templates
- `GET /api/reference-model/document-retention/:id`: Get retention info for a document
- `GET /api/reference-model/document-training/:id`: Get training requirements for a document
- `POST /api/reference-model/initialize-folders`: Initialize top-level folders

## 4. React Components

### SubtypeSelect

A searchable dropdown for selecting document subtypes, grouped by their parent type.

**Props:**

- `value`: Currently selected subtype ID
- `onChange`: Function called when selection changes
- `topFolder`: Optional filter for a specific document type
- `label`: Custom label for the select
- `placeholder`: Custom placeholder text

### TypeBreadcrumb

A breadcrumb component showing the document type hierarchy path.

**Props:**

- `subtypeId`: The document subtype ID
- `className`: Optional additional CSS classes

Alternative static version:

- `typeName`: The document type name
- `subtypeName`: The document subtype name

## 5. Troubleshooting

### Common Issues

1. **Database Connection Errors**: Ensure the Supabase connection is properly configured

2. **Missing Folder Hierarchy**: If documents aren't enforcing the hierarchy, check:

   - The folder has the correct document_type_id set
   - The middleware is properly applied to document routes

3. **Periodic Review Not Working**: Verify:

   - The cron job is running (check logs)
   - Documents have the correct document_subtype_id
   - The subtype has a review_interval value set

4. **SubtypeSelect Not Showing Options**: Check:
   - The meta API routes are properly set up
   - The component is properly receiving the API response

## 6. Maintenance

### Adding New Document Types/Subtypes

To add new document types or subtypes, either:

1. Insert them directly into the database using SQL
2. Use the admin interface once implemented
3. Update the seed data in the SQL file for new installations

### Customizing Retention Policies

Tenant-specific retention policies can be set in the `retention_rules` table, which will override the defaults from document subtypes.

## 7. Future Enhancements

Planned enhancements for the Reference Model:

1. Admin interface for managing the document taxonomy
2. Visual document lifecycle designer
3. Enhanced document workflow automation
4. Extended retention policy management
5. More granular permission controls based on document types

---

For technical support or questions, please contact the TrialSage technical team.
