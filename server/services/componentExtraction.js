import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import crypto from 'crypto';
import { parse as parseHtmlWithParser } from 'node-html-parser';

/**
 * Component Extraction Engine for eCTD Co-Author
 * Transforms documents into reusable components with Unique Document Identifiers (UDIs)
 */

// Generate a unique identifier for each component
function generateUDI(type, content, moduleContext = null) {
  const hash = crypto.createHash('md5')
    .update(`${type}-${content.substring(0, 100)}`)
    .digest('hex')
    .substring(0, 8);
  
  const prefix = moduleContext ? `${moduleContext}-` : '';
  return `${prefix}${type}-${hash}`;
}

// Detect regulatory module patterns (e.g., 3.2.S.4.1 for drug substance)
function detectRegulatorySection(text) {
  const patterns = {
    '1\\.\\d+': 'Module 1 - Administrative',
    '2\\.3': 'Module 2.3 - Quality Overall Summary', 
    '2\\.5': 'Module 2.5 - Clinical Overview',
    '2\\.7': 'Module 2.7 - Clinical Summary',
    '3\\.2\\.S': 'Module 3.2.S - Drug Substance',
    '3\\.2\\.P': 'Module 3.2.P - Drug Product',
    '3\\.2\\.R': 'Module 3.2.R - Regional Information',
    '4\\.\\d+': 'Module 4 - Nonclinical Study Reports',
    '5\\.3\\.\\d+': 'Module 5.3 - Clinical Study Reports'
  };
  
  for (const [pattern, module] of Object.entries(patterns)) {
    const regex = new RegExp(`^${pattern}`, 'i');
    if (regex.test(text.trim())) {
      return module;
    }
  }
  
  return null;
}

// Enhanced component chunking function for better granularity
function chunkContentIntoComponents(parsedTextOrHtml, fileMimetype) {
  const components = [];
  let currentModule = null;
  let componentIndex = 0;
  
  // If it's plain text (from PDF), split by double newlines for basic paragraphs
  if (fileMimetype === 'application/pdf' || !parsedTextOrHtml.includes('<')) {
    const chunks = parsedTextOrHtml.split(/\n\n+/);
    
    chunks.forEach((chunk, index) => {
      const trimmedChunk = chunk.trim();
      if (trimmedChunk.length > 10) {
        // Check if this is a heading pattern (all caps, numbered section, etc.)
        const isHeading = /^[A-Z\s]{5,}$/.test(trimmedChunk) || 
                         /^\d+\./.test(trimmedChunk) ||
                         /^Section \d+/i.test(trimmedChunk);
        
        const moduleContext = detectRegulatorySection(trimmedChunk);
        if (moduleContext) currentModule = moduleContext;
        
        components.push({
          udi: generateUDI(isHeading ? 'heading' : 'paragraph', trimmedChunk, currentModule),
          type: isHeading ? 'heading' : 'paragraph',
          level: isHeading ? 1 : null,
          content: trimmedChunk,
          module: currentModule || 'General',
          contentType: 'text/plain',
          version: '1.0',
          status: 'draft',
          metadata: {
            position: componentIndex++,
            extractedAt: new Date().toISOString()
          }
        });
      }
    });
  } else {
    // For HTML content, use more sophisticated extraction
    return extractComponentsFromHtml(parsedTextOrHtml, 'imported');
  }
  
  return components;
}

// Extract components from HTML content
function extractComponentsFromHtml(htmlContent, sourceFile = 'unknown') {
  const components = [];
  const root = parseHtmlWithParser(htmlContent);
  let currentModule = null;
  let componentIndex = 0;
  
  // Extract headings with enhanced module detection
  const headings = root.querySelectorAll('h1, h2, h3, h4, h5, h6');
  headings.forEach((heading, index) => {
    const level = parseInt(heading.tagName.substring(1));
    const text = heading.text || heading.innerText || heading.textContent || '';
    const moduleContext = detectRegulatorySection(text);
    
    if (moduleContext) currentModule = moduleContext;
    
    components.push({
      udi: generateUDI('heading', text, currentModule),
      type: 'heading',
      level,
      content: text.trim(),
      module: currentModule || 'General',
      contentType: 'text/html',
      version: '1.0',
      status: 'draft',
      metadata: {
        sourceFile,
        position: componentIndex++,
        moduleContext: currentModule,
        extractedAt: new Date().toISOString()
      }
    });
  });
  
  // Extract paragraphs with module context
  const paragraphs = root.querySelectorAll('p');
  paragraphs.forEach((para, index) => {
    const text = para.text || para.innerText || para.textContent || '';
    if (text.trim().length > 10) { // Skip very short paragraphs
      components.push({
        udi: generateUDI('paragraph', text, currentModule),
        type: 'paragraph', 
        content: text.trim(),
        module: currentModule || 'General',
        contentType: 'text/html',
        version: '1.0',
        status: 'draft',
        metadata: {
          sourceFile,
          position: index,
          wordCount: text.split(/\s+/).length,
          extractedAt: new Date().toISOString()
        }
      });
    }
  });
  
  // Extract tables with proper DOM traversal
  const tables = root.querySelectorAll('table');
  tables.forEach((table, index) => {
    const headers = [];
    const rows = [];
    
    // Extract headers
    const headerCells = table.querySelectorAll('th');
    headerCells.forEach(cell => {
      headers.push((cell.text || cell.innerText || cell.textContent || '').trim());
    });
    
    // Extract rows
    const dataRows = table.querySelectorAll('tr');
    dataRows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length > 0) {
        const rowData = [];
        cells.forEach(cell => {
          rowData.push((cell.text || cell.innerText || cell.textContent || '').trim());
        });
        rows.push(rowData);
      }
    });
    
    if (headers.length > 0 || rows.length > 0) {
      components.push({
        udi: generateUDI('table', JSON.stringify({ headers, rows }).substring(0, 100)),
        type: 'table',
        content: {
          headers,
          rows,
          html: table.toString()
        },
        metadata: {
          sourceFile,
          position: index,
          columns: headers.length || (rows[0] ? rows[0].length : 0),
          rowCount: rows.length,
          extractedAt: new Date().toISOString()
        }
      });
    }
  });
  
  // Extract lists with proper DOM traversal
  const lists = root.querySelectorAll('ul, ol');
  lists.forEach((list, index) => {
    const items = [];
    const listType = list.tagName.toLowerCase();
    const listItems = list.querySelectorAll('li');
    
    listItems.forEach(item => {
      items.push((item.text || item.innerText || item.textContent || '').trim());
    });
    
    if (items.length > 0) {
      components.push({
        udi: generateUDI('list', items.join('-')),
        type: list.tagName.toLowerCase() === 'ol' ? 'ordered-list' : 'unordered-list',
        content: items,
        metadata: {
          sourceFile,
          position: index,
          itemCount: items.length,
          extractedAt: new Date().toISOString()
        }
      });
    }
  });
  
  // Extract images/figures (if any)
  const images = root.querySelectorAll('img');
  images.forEach((img, index) => {
    components.push({
      udi: generateUDI('figure', img.getAttribute('alt') || img.getAttribute('src') || ''),
      type: 'figure',
      content: {
        src: img.getAttribute('src'),
        alt: img.getAttribute('alt'),
        title: img.getAttribute('title')
      },
      metadata: {
        sourceFile,
        position: index,
        extractedAt: new Date().toISOString()
      }
    });
  });
  
  // Extract cross-references and links
  const links = root.querySelectorAll('a[href]');
  const crossReferences = [];
  links.forEach(link => {
    const href = link.getAttribute('href');
    if (href && (href.startsWith('#') || href.includes('module') || href.includes('section'))) {
      crossReferences.push({
        text: (link.innerText || link.textContent || '').trim(),
        target: href
      });
    }
  });
  
  if (crossReferences.length > 0) {
    components.push({
      udi: generateUDI('cross-references', JSON.stringify(crossReferences)),
      type: 'cross-references',
      content: crossReferences,
      metadata: {
        sourceFile,
        count: crossReferences.length,
        extractedAt: new Date().toISOString()
      }
    });
  }
  
  return components;
}

// Parse Word document and extract components
export async function parseWordDocument(buffer, filename) {
  try {
    // Convert Word to HTML using mammoth
    const result = await mammoth.convertToHtml({ buffer });
    
    if (result.messages && result.messages.length > 0) {
      console.warn('Word parsing warnings:', result.messages);
    }
    
    // Extract structured components
    const components = extractComponentsFromHtml(result.value, filename);
    
    // Extract document-level metadata
    const metadata = {
      filename,
      format: 'docx',
      conversionMessages: result.messages || [],
      componentCount: components.length,
      processedAt: new Date().toISOString()
    };
    
    return {
      success: true,
      components,
      metadata,
      html: result.value // Keep original HTML for reference
    };
    
  } catch (error) {
    console.error('Error parsing Word document:', error);
    return {
      success: false,
      error: error.message,
      components: [],
      metadata: { filename, format: 'docx', error: error.message }
    };
  }
}

// Parse PDF document and extract components
export async function parsePDFDocument(buffer, filename) {
  try {
    // Extract text and metadata from PDF
    const data = await pdfParse(buffer);
    
    // Convert PDF text to pseudo-HTML for component extraction
    // PDFs don't have semantic structure, so we need to infer it
    const lines = data.text.split('\n');
    let html = '';
    
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      
      // Detect headings (all caps or numbered sections)
      if (/^[A-Z\s]+$/.test(trimmed) && trimmed.length < 100) {
        html += `<h2>${trimmed}</h2>\n`;
      } else if (/^\d+(\.\d+)*\s+/.test(trimmed)) {
        html += `<h3>${trimmed}</h3>\n`;
      } else if (/^[•·▪▫◦‣⁃]\s+/.test(trimmed)) {
        // Bullet points
        html += `<li>${trimmed.substring(1).trim()}</li>\n`;
      } else {
        html += `<p>${trimmed}</p>\n`;
      }
    });
    
    // Wrap loose list items
    html = html.replace(/(<li>.*<\/li>\n)+/g, match => `<ul>\n${match}</ul>\n`);
    
    // Extract components from the pseudo-HTML
    const components = extractComponentsFromHtml(html, filename);
    
    // Add PDF-specific metadata
    const metadata = {
      filename,
      format: 'pdf',
      pages: data.numpages,
      info: data.info,
      componentCount: components.length,
      processedAt: new Date().toISOString()
    };
    
    return {
      success: true,
      components,
      metadata,
      text: data.text, // Keep original text for reference
      html // Generated HTML representation
    };
    
  } catch (error) {
    console.error('Error parsing PDF document:', error);
    return {
      success: false,
      error: error.message,
      components: [],
      metadata: { filename, format: 'pdf', error: error.message }
    };
  }
}

// Extract components directly from HTML string (for CoAuthor documents)
export function extractComponents(htmlContent, metadata = {}) {
  try {
    // If it's a buffer (Word/PDF upload), use the old function
    if (Buffer.isBuffer(htmlContent)) {
      return extractComponentsFromBuffer(htmlContent, metadata.filename, metadata.mimeType);
    }
    
    // Otherwise, extract from HTML string
    const components = [];
    let componentIndex = 0;
    
    // Simple HTML extraction for CoAuthor documents
    if (typeof htmlContent === 'string' && htmlContent.includes('<')) {
      const root = parseHtmlWithParser(htmlContent);
      let currentModule = metadata.module || 'General';
      
      // Extract headings
      const headings = root.querySelectorAll('h1, h2, h3, h4, h5, h6');
      headings.forEach((heading) => {
        const level = parseInt(heading.tagName.substring(1));
        const text = heading.text || heading.innerText || heading.textContent || '';
        
        if (text.trim()) {
          components.push({
            type: 'heading',
            level,
            content: text.trim(),
            name: `Heading: ${text.trim().substring(0, 50)}`,
            position: componentIndex++,
            context: currentModule
          });
        }
      });
      
      // Extract paragraphs
      const paragraphs = root.querySelectorAll('p');
      paragraphs.forEach((para) => {
        const text = para.text || para.innerText || para.textContent || '';
        
        if (text.trim().length > 20) {
          components.push({
            type: 'paragraph',
            content: text.trim(),
            name: `Paragraph: ${text.trim().substring(0, 50)}...`,
            position: componentIndex++,
            context: currentModule
          });
        }
      });
      
      // Extract lists
      const lists = root.querySelectorAll('ul, ol');
      lists.forEach((list) => {
        const listType = list.tagName.toLowerCase();
        const items = [];
        const listItems = list.querySelectorAll('li');
        
        listItems.forEach(item => {
          const text = item.text || item.innerText || item.textContent || '';
          if (text.trim()) items.push(text.trim());
        });
        
        if (items.length > 0) {
          components.push({
            type: listType === 'ol' ? 'ordered-list' : 'unordered-list',
            content: items.join('\n'),
            name: `List with ${items.length} items`,
            position: componentIndex++,
            context: currentModule
          });
        }
      });
      
      // Extract tables
      const tables = root.querySelectorAll('table');
      tables.forEach((table) => {
        const tableHtml = table.toString();
        components.push({
          type: 'table',
          content: tableHtml,
          name: 'Table Component',
          position: componentIndex++,
          context: currentModule
        });
      });
    } else {
      // Plain text fallback
      const paragraphs = htmlContent.split(/\n\n+/);
      paragraphs.forEach((para) => {
        if (para.trim().length > 20) {
          components.push({
            type: 'paragraph',
            content: para.trim(),
            name: `Text: ${para.trim().substring(0, 50)}...`,
            position: componentIndex++,
            context: metadata.module || 'General'
          });
        }
      });
    }
    
    return components;
  } catch (error) {
    console.error('Error extracting components:', error);
    return [];
  }
}

// Main extraction function that handles Word and PDF buffers
async function extractComponentsFromBuffer(buffer, filename, mimeType) {
  const isWord = mimeType?.includes('word') || 
                 filename?.toLowerCase().endsWith('.docx') || 
                 filename?.toLowerCase().endsWith('.doc');
  
  const isPDF = mimeType?.includes('pdf') || 
                filename?.toLowerCase().endsWith('.pdf');
  
  if (isWord) {
    return await parseWordDocument(buffer, filename);
  } else if (isPDF) {
    return await parsePDFDocument(buffer, filename);
  } else {
    return {
      success: false,
      error: 'Unsupported file type. Only Word (.docx) and PDF files are supported.',
      components: [],
      metadata: { filename, format: 'unknown' }
    };
  }
}

// Find reusable components across documents
export function findReusableComponents(components, existingComponents = []) {
  const reusable = [];
  
  components.forEach(component => {
    // Check if similar content exists in other documents
    const similar = existingComponents.find(existing => {
      if (existing.type !== component.type) return false;
      
      // For text components, check similarity
      if (['heading', 'paragraph'].includes(component.type)) {
        const similarity = calculateTextSimilarity(
          component.content,
          existing.content
        );
        return similarity > 0.85; // 85% similarity threshold
      }
      
      // For structured components, check exact match
      if (component.type === 'table') {
        return JSON.stringify(component.content) === JSON.stringify(existing.content);
      }
      
      return false;
    });
    
    if (similar) {
      reusable.push({
        newComponent: component,
        existingComponent: similar,
        reuseType: 'exact' // or 'similar'
      });
    }
  });
  
  return reusable;
}

// Calculate text similarity (simple implementation)
function calculateTextSimilarity(text1, text2) {
  const words1 = text1.toLowerCase().split(/\s+/);
  const words2 = text2.toLowerCase().split(/\s+/);
  
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

export default {
  extractComponents,
  parseWordDocument,
  parsePDFDocument,
  findReusableComponents,
  generateUDI
};