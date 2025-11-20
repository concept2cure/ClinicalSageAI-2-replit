/**
 * Document Download Hook
 *
 * Provides functionality to download documents in various formats (PDF, DOCX, etc.)
 */

// Define supported format mapping with MIME types
const FORMAT_CONFIGS = {
  pdf: {
    mimeType: 'application/pdf',
    label: 'PDF Document',
  },
  docx: {
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    label: 'Word Document',
  },
  xlsx: {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    label: 'Excel Spreadsheet',
  },
  pptx: {
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    label: 'PowerPoint Presentation',
  },
  txt: {
    mimeType: 'text/plain',
    label: 'Text Document',
  },
  csv: {
    mimeType: 'text/csv',
    label: 'CSV Spreadsheet',
  },
  html: {
    mimeType: 'text/html',
    label: 'HTML Document',
  },
  xml: {
    mimeType: 'application/xml',
    label: 'XML Document',
  },
  json: {
    mimeType: 'application/json',
    label: 'JSON Data',
  },
  rtf: {
    mimeType: 'application/rtf',
    label: 'Rich Text Format',
  },
};

// Get all supported formats for UI display
export function getSupportedFormats() {
  return Object.entries(FORMAT_CONFIGS).map(([format, config]) => ({
    value: format,
    label: config.label,
  }));
}

// In production, this would connect to your backend API
export async function downloadDocument(document, format = 'original') {
  try {
    // Here we're simulating a document download since actual files don't exist in the demo
    // In a real implementation, you would call the backend API

    // Simulated API call
    console.log(`Downloading document: ${document.displayName} in format: ${format}`);

    // Create a filename with the right extension
    let filename = document.displayName;

    // If converting format, adjust the filename extension
    if (format !== 'original') {
      const baseName = filename.substring(0, filename.lastIndexOf('.')) || filename;
      filename = `${baseName}.${format.toLowerCase()}`;
    }

    // Get the appropriate MIME type for the selected format
    let mimeType = 'text/plain';
    if (format !== 'original' && FORMAT_CONFIGS[format]) {
      mimeType = FORMAT_CONFIGS[format].mimeType;
    }

    // In demo mode, generate a demo file with content
    let content;

    if (format === 'json' || format === 'xml') {
      // Generate structured content for JSON or XML
      if (format === 'json') {
        const jsonData = {
          document: {
            name: document.displayName,
            type: document.type,
            status: document.status,
            lastModified: document.lastModified,
            author: document.author || 'Unknown',
            metadata: {
              format: 'JSON',
              generated: new Date().toISOString(),
              demo: true,
            },
          },
        };
        content = JSON.stringify(jsonData, null, 2);
      } else {
        // Simple XML
        content = `<?xml version="1.0" encoding="UTF-8"?>
<document>
  <name>${document.displayName}</name>
  <type>${document.type}</type>
  <status>${document.status}</status>
  <lastModified>${document.lastModified}</lastModified>
  <author>${document.author || 'Unknown'}</author>
  <metadata>
    <format>XML</format>
    <generated>${new Date().toISOString()}</generated>
    <demo>true</demo>
  </metadata>
</document>`;
      }
    } else if (format === 'html') {
      // Generate HTML content
      content = `<!DOCTYPE html>
<html>
<head>
  <title>${document.displayName}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { color: #2563eb; }
    .metadata { background: #f1f5f9; padding: 15px; border-radius: 8px; }
  </style>
</head>
<body>
  <h1>${document.displayName}</h1>
  <div class="metadata">
    <p><strong>Type:</strong> ${document.type}</p>
    <p><strong>Status:</strong> ${document.status}</p>
    <p><strong>Last Modified:</strong> ${document.lastModified}</p>
    <p><strong>Author:</strong> ${document.author || 'Unknown'}</p>
  </div>
  <p>This is a placeholder file generated for demonstration purposes.
  In the production environment, this would be the actual document content.</p>
  <footer>Generated: ${new Date().toLocaleString()}</footer>
</body>
</html>`;
    } else {
      // Default text content
      content = `Document: ${document.displayName}
      
Type: ${document.type}
Status: ${document.status}
Last Modified: ${document.lastModified}
Author: ${document.author || 'Unknown'}

This is a placeholder file generated for demonstration purposes.
In the production environment, this would be the actual document content.

Generated: ${new Date().toLocaleString()}
Format: ${format.toUpperCase()}
`;
    }

    // Create a download blob with the appropriate MIME type
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    // Create a temporary anchor element and trigger download
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    // Clean up
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return {
      success: true,
      message: `Downloaded ${filename}`,
      format: format,
      mimeType: mimeType,
    };
  } catch (error) {
    console.error('Download error:', error);
    return { success: false, message: error.message || 'Download failed' };
  }
}

// Function to convert documents to different formats
export async function convertDocument(document, targetFormat) {
  try {
    if (!document) {
      throw new Error('No document selected');
    }

    // Validate target format
    if (!FORMAT_CONFIGS[targetFormat.toLowerCase()]) {
      throw new Error(`Unsupported format: ${targetFormat}`);
    }

    // In a real implementation, this would call a backend API for conversion
    // For demo, we'll just simulate success and call the download function

    // Call the download function with the specified format
    return await downloadDocument(document, targetFormat);
  } catch (error) {
    console.error('Conversion error:', error);
    return { success: false, message: error.message || 'Conversion failed' };
  }
}

// Get the MIME type and other info for a specific format
export function getFormatInfo(format) {
  return FORMAT_CONFIGS[format] || null;
}
