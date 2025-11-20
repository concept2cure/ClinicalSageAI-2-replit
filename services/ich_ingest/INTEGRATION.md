# ICH Specialist Integration Guide

This guide explains how to integrate the ICH Specialist service into various TrialSage modules.

## Overview

The ICH Specialist provides context-aware regulatory guidance and project management suggestions based on the current module. The system has two main components:

1. **Backend Service**: A FastAPI application providing the `/api/ich-agent` endpoint
2. **Frontend Component**: The `ICHSpecialistSidebar` React component

## Backend Integration

### 1. Adding the Endpoint to Express Server

Add this route to your Express server to proxy requests to the FastAPI service:

```javascript
// server/routes.ts
const express = require('express');
const router = express.Router();
const axios = require('axios');

// ICH Specialist API
router.post('/api/ich-agent', async (req, res) => {
  try {
    const { question, module } = req.body;

    // Call the ICH Specialist service
    const response = await axios.post('http://localhost:8000/api/ich-agent', {
      question,
      module,
    });

    res.json(response.data);
  } catch (error) {
    console.error('ICH Specialist error:', error);
    res.status(500).json({ error: 'Failed to get response from ICH Specialist' });
  }
});

module.exports = router;
```

### 2. Environment Variables

Ensure these environment variables are set in your `.env` file:

```
OPENAI_API_KEY=your_openai_key
PINECONE_API_KEY=your_pinecone_key
PINECONE_ENV=your_pinecone_environment
ICH_SPECIALIST_URL=http://localhost:8000
```

## Frontend Integration

### 1. Basic Integration

Import and add the `ICHSpecialistSidebar` component to any module:

```jsx
import ICHSpecialistSidebar from '@/components/ich/ICHSpecialistSidebar';

function YourModulePage() {
  return (
    <div className="layout">
      <main>{/* Your module content */}</main>
      <ICHSpecialistSidebar />
    </div>
  );
}
```

### 2. Module-specific Integration

For module-specific context, pass the module name explicitly:

```jsx
<ICHSpecialistSidebar defaultModule="protocol" />
```

Valid module values:

- `protocol` - Protocol design and review
- `csr_review` - CSR analysis
- `cmc` - Chemistry, Manufacturing, and Controls
- `ind` - IND/NDA submission
- `document` - Document management
- `general` - General regulatory queries

### 3. Task-aware Integration

To use the generated tasks in your module's workflow:

```jsx
import ICHSpecialistSidebar from '@/components/ich/ICHSpecialistSidebar';
import { useTaskContext } from '@/contexts/TaskContext';

function ProtocolReviewPage() {
  const { addTask } = useTaskContext();

  const handleTaskCreation = task => {
    // Add the task to your module's task system
    addTask({
      ...task,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Due in 1 week
      status: 'pending',
    });
  };

  return (
    <div className="layout">
      <main>{/* Protocol review content */}</main>
      <ICHSpecialistSidebar defaultModule="protocol" onTaskCreated={handleTaskCreation} />
    </div>
  );
}
```

## Integration Examples

### Protocol Review Module

```jsx
// client/src/pages/ProtocolReview.jsx
import React from 'react';
import ProtocolReviewDashboard from '@/components/protocol/ProtocolReviewDashboard';
import ICHSpecialistSidebar from '@/components/ich/ICHSpecialistSidebar';

function ProtocolReview() {
  return (
    <div className="flex h-screen">
      <div className="flex-1 overflow-auto p-6">
        <ProtocolReviewDashboard />
      </div>
      <div className="border-l border-gray-200">
        <ICHSpecialistSidebar defaultModule="protocol" />
      </div>
    </div>
  );
}

export default ProtocolReview;
```

### CSR Intelligence Module

```jsx
// client/src/pages/CSRIntelligence.jsx
import React from 'react';
import CSRDashboard from '@/components/csr/CSRDashboard';
import ICHSpecialistSidebar from '@/components/ich/ICHSpecialistSidebar';

function CSRIntelligence() {
  return (
    <div className="flex h-screen">
      <div className="flex-1 overflow-auto p-6">
        <CSRDashboard />
      </div>
      <div className="border-l border-gray-200">
        <ICHSpecialistSidebar defaultModule="csr_review" />
      </div>
    </div>
  );
}

export default CSRIntelligence;
```

### IND Wizard Module

```jsx
// client/src/pages/INDWizard.jsx
import React from 'react';
import INDWizardForm from '@/components/ind/INDWizardForm';
import ICHSpecialistSidebar from '@/components/ich/ICHSpecialistSidebar';

function INDWizard() {
  return (
    <div className="flex h-screen">
      <div className="flex-1 overflow-auto p-6">
        <INDWizardForm />
      </div>
      <div className="border-l border-gray-200">
        <ICHSpecialistSidebar defaultModule="ind" />
      </div>
    </div>
  );
}

export default INDWizard;
```

## Troubleshooting

### Common Issues

1. **ICH Agent not responding**

   - Check if the FastAPI service is running
   - Verify the OPENAI_API_KEY is valid
   - Check the Pinecone connection

2. **Module context detection not working**

   - Manually specify the module using the `defaultModule` prop
   - Check that your route paths follow the expected pattern

3. **Tasks not appearing**
   - Ensure the questions are relevant to regulatory compliance
   - Try more specific questions about guidelines or requirements
