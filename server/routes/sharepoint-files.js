import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// In-memory file system structure for demo - in production this would be in database
let fileSystem = {
  id: 'root',
  name: 'Document Library',
  type: 'folder',
  modified: new Date().toISOString(),
  modifiedBy: 'System',
  size: null,
  parentId: null,
  children: []
};

// Folder operations
router.post('/folders', async (req, res) => {
  try {
    const { name, parentId } = req.body;
    const organizationId = req.headers['x-organization-id'] || 'default';
    
    const newFolder = {
      id: uuidv4(),
      name,
      type: 'folder',
      modified: new Date().toISOString(),
      modifiedBy: req.user?.name || 'User',
      size: null,
      parentId,
      children: []
    };
    
    // In production, save to database
    res.json({
      success: true,
      folder: newFolder
    });
  } catch (error) {
    console.error('Error creating folder:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// File upload
router.post('/upload', upload.array('files'), async (req, res) => {
  try {
    const { folderId } = req.body;
    const organizationId = req.headers['x-organization-id'] || 'default';
    const files = req.files;
    
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }
    
    const uploadedFiles = [];
    
    for (const file of files) {
      const fileRecord = {
        id: uuidv4(),
        name: file.originalname,
        type: 'file',
        size: file.size,
        mimeType: file.mimetype,
        modified: new Date().toISOString(),
        modifiedBy: req.user?.name || 'User',
        parentId: folderId || 'root',
        version: '1.0',
        // In production, save to cloud storage and get URL
        url: `/api/sharepoint-files/download/${uuidv4()}`
      };
      
      uploadedFiles.push(fileRecord);
      
      // In production, save file to storage and record to database
    }
    
    res.json({
      success: true,
      files: uploadedFiles
    });
  } catch (error) {
    console.error('Error uploading files:', error);
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

// Get folder contents
router.get('/folders/:folderId', async (req, res) => {
  try {
    const { folderId } = req.params;
    const organizationId = req.headers['x-organization-id'] || 'default';
    
    // In production, fetch from database
    // For demo, return mock data based on module context
    const moduleContext = req.query.moduleContext || 'default';
    
    let mockData = {
      id: folderId,
      name: 'Document Library',
      type: 'folder',
      children: []
    };
    
    if (moduleContext === 'ectd-coauthor') {
      mockData.children = [
        {
          id: 'ectd-m1',
          name: 'Module 1 - Administrative',
          type: 'folder',
          modified: new Date().toISOString(),
          modifiedBy: 'Regulatory Team',
          children: []
        },
        {
          id: 'ectd-m2',
          name: 'Module 2 - CTD Summaries',
          type: 'folder',
          modified: new Date().toISOString(),
          modifiedBy: 'Clinical Team',
          children: []
        },
        {
          id: 'ectd-m3',
          name: 'Module 3 - Quality',
          type: 'folder',
          modified: new Date().toISOString(),
          modifiedBy: 'QA Team',
          children: []
        }
      ];
    } else if (moduleContext === 'cmc-module3') {
      mockData.children = [
        {
          id: 'cmc-drug-substance',
          name: 'Drug Substance',
          type: 'folder',
          modified: new Date().toISOString(),
          modifiedBy: 'CMC Team',
          children: []
        },
        {
          id: 'cmc-drug-product',
          name: 'Drug Product',
          type: 'folder',
          modified: new Date().toISOString(),
          modifiedBy: 'CMC Team',
          children: []
        },
        {
          id: 'cmc-stability',
          name: 'Stability Studies',
          type: 'folder',
          modified: new Date().toISOString(),
          modifiedBy: 'QC Lab',
          children: []
        }
      ];
    } else if (moduleContext === 'medical-device') {
      mockData.children = [
        {
          id: 'md-510k',
          name: '510(k) Submissions',
          type: 'folder',
          modified: new Date().toISOString(),
          modifiedBy: 'Regulatory Team',
          children: []
        },
        {
          id: 'md-cer',
          name: 'CER Documents',
          type: 'folder',
          modified: new Date().toISOString(),
          modifiedBy: 'Clinical Team',
          children: []
        },
        {
          id: 'md-design',
          name: 'Design Controls',
          type: 'folder',
          modified: new Date().toISOString(),
          modifiedBy: 'Engineering Team',
          children: []
        }
      ];
    }
    
    res.json(mockData);
  } catch (error) {
    console.error('Error fetching folder contents:', error);
    res.status(500).json({ error: 'Failed to fetch folder contents' });
  }
});

// Move file/folder
router.put('/move', async (req, res) => {
  try {
    const { itemId, targetFolderId } = req.body;
    const organizationId = req.headers['x-organization-id'] || 'default';
    
    // In production, update database
    res.json({
      success: true,
      message: 'Item moved successfully'
    });
  } catch (error) {
    console.error('Error moving item:', error);
    res.status(500).json({ error: 'Failed to move item' });
  }
});

// Rename file/folder
router.put('/rename', async (req, res) => {
  try {
    const { itemId, newName } = req.body;
    const organizationId = req.headers['x-organization-id'] || 'default';
    
    // In production, update database
    res.json({
      success: true,
      message: 'Item renamed successfully',
      item: {
        id: itemId,
        name: newName
      }
    });
  } catch (error) {
    console.error('Error renaming item:', error);
    res.status(500).json({ error: 'Failed to rename item' });
  }
});

// Delete file/folder
router.delete('/items/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;
    const organizationId = req.headers['x-organization-id'] || 'default';
    
    // In production, soft delete in database
    res.json({
      success: true,
      message: 'Item deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// Get file versions
router.get('/files/:fileId/versions', async (req, res) => {
  try {
    const { fileId } = req.params;
    const organizationId = req.headers['x-organization-id'] || 'default';
    
    // In production, fetch from database
    const versions = [
      {
        id: uuidv4(),
        version: '1.0',
        modified: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        modifiedBy: 'Initial Upload',
        size: '234 KB',
        comment: 'Initial version'
      },
      {
        id: uuidv4(),
        version: '1.1',
        modified: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        modifiedBy: 'John Doe',
        size: '245 KB',
        comment: 'Updated references'
      },
      {
        id: uuidv4(),
        version: '1.2',
        modified: new Date().toISOString(),
        modifiedBy: 'Jane Smith',
        size: '248 KB',
        comment: 'Added new section',
        current: true
      }
    ];
    
    res.json({
      fileId,
      versions
    });
  } catch (error) {
    console.error('Error fetching file versions:', error);
    res.status(500).json({ error: 'Failed to fetch file versions' });
  }
});

// Share file/folder
router.post('/share', async (req, res) => {
  try {
    const { itemId, shareWith, permissions } = req.body;
    const organizationId = req.headers['x-organization-id'] || 'default';
    
    // In production, save sharing settings to database
    res.json({
      success: true,
      message: 'Item shared successfully',
      shareLink: `https://app.lumenbio.com/share/${uuidv4()}`
    });
  } catch (error) {
    console.error('Error sharing item:', error);
    res.status(500).json({ error: 'Failed to share item' });
  }
});

// Search files
router.get('/search', async (req, res) => {
  try {
    const { query, moduleContext } = req.query;
    const organizationId = req.headers['x-organization-id'] || 'default';
    
    // In production, search in database
    const results = [
      {
        id: uuidv4(),
        name: 'Protocol v2.1.pdf',
        type: 'file',
        path: '/Clinical Studies/Protocol',
        modified: new Date().toISOString(),
        modifiedBy: 'Clinical Team',
        size: '1.2 MB',
        matchType: 'name'
      },
      {
        id: uuidv4(),
        name: 'Safety Report.docx',
        type: 'file',
        path: '/Safety Data/Reports',
        modified: new Date().toISOString(),
        modifiedBy: 'Safety Team',
        size: '890 KB',
        matchType: 'content'
      }
    ];
    
    res.json({
      query,
      results,
      totalCount: results.length
    });
  } catch (error) {
    console.error('Error searching files:', error);
    res.status(500).json({ error: 'Failed to search files' });
  }
});

// Get file permissions
router.get('/items/:itemId/permissions', async (req, res) => {
  try {
    const { itemId } = req.params;
    const organizationId = req.headers['x-organization-id'] || 'default';
    
    // In production, fetch from database
    const permissions = {
      owner: 'admin@lumenbio.com',
      inheritsPermissions: true,
      sharedWith: [
        {
          user: 'regulatory.team@lumenbio.com',
          permission: 'edit',
          sharedDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          user: 'clinical.team@lumenbio.com',
          permission: 'view',
          sharedDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
        }
      ],
      publicLink: null
    };
    
    res.json(permissions);
  } catch (error) {
    console.error('Error fetching permissions:', error);
    res.status(500).json({ error: 'Failed to fetch permissions' });
  }
});

export default router;