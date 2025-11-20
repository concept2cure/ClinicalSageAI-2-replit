import { Document, Packer, Paragraph, TextRun, Table, TableCell, TableRow, HeadingLevel, AlignmentType } from 'docx';
import { db } from '../db/index.js';
import { 
  coauthorDocuments, 
  documentComponents, 
  components, 
  componentVersions 
} from '../../shared/schema.js';
import { eq, and, sql, asc } from 'drizzle-orm';

/**
 * Document Reconstruction Engine for eCTD Co-Author
 * Rebuilds documents from components for export
 */

// Convert component type to docx element
function componentToDocxElement(component) {
  const { type, content, level } = component;
  
  switch (type) {
    case 'heading':
      return new Paragraph({
        text: content,
        heading: level ? getHeadingLevel(level) : HeadingLevel.HEADING_2,
        spacing: {
          before: 240,
          after: 120
        }
      });
      
    case 'paragraph':
      return new Paragraph({
        children: [new TextRun(content)],
        spacing: {
          after: 120
        }
      });
      
    case 'ordered-list':
    case 'unordered-list':
      const bullets = Array.isArray(content) ? content : [content];
      return bullets.map(item => 
        new Paragraph({
          text: item,
          bullet: type === 'unordered-list' ? { level: 0 } : undefined,
          numbering: type === 'ordered-list' ? { reference: 'default-numbering', level: 0 } : undefined,
          spacing: {
            after: 60
          }
        })
      );
      
    case 'table':
      if (!content || typeof content !== 'object') {
        return null;
      }
      
      const { headers = [], rows = [] } = content;
      const tableRows = [];
      
      // Add header row if exists
      if (headers.length > 0) {
        tableRows.push(
          new TableRow({
            children: headers.map(header => 
              new TableCell({
                children: [new Paragraph({
                  children: [new TextRun({ text: header, bold: true })],
                  alignment: AlignmentType.CENTER
                })],
                shading: { fill: 'E0E0E0' }
              })
            )
          })
        );
      }
      
      // Add data rows
      rows.forEach(row => {
        if (Array.isArray(row)) {
          tableRows.push(
            new TableRow({
              children: row.map(cell => 
                new TableCell({
                  children: [new Paragraph(cell || '')]
                })
              )
            })
          );
        }
      });
      
      return tableRows.length > 0 ? new Table({
        rows: tableRows,
        width: {
          size: 100,
          type: 'pct'
        }
      }) : null;
      
    case 'figure':
      // For now, just add a placeholder paragraph
      // In production, you'd embed the actual image
      return new Paragraph({
        children: [
          new TextRun({
            text: `[Figure: ${content?.alt || content?.title || 'Image'}]`,
            italics: true
          })
        ],
        spacing: {
          before: 120,
          after: 120
        }
      });
      
    default:
      // Default to paragraph for unknown types
      return new Paragraph({
        text: JSON.stringify(content),
        spacing: {
          after: 120
        }
      });
  }
}

// Convert level number to docx heading level
function getHeadingLevel(level) {
  const mapping = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
    4: HeadingLevel.HEADING_4,
    5: HeadingLevel.HEADING_5,
    6: HeadingLevel.HEADING_6
  };
  return mapping[level] || HeadingLevel.HEADING_2;
}

// Reconstruct document from components
export async function reconstructDocument(documentId, organizationId) {
  try {
    // Get document metadata
    const document = await db
      .select()
      .from(coauthorDocuments)
      .where(and(
        eq(coauthorDocuments.id, documentId),
        eq(coauthorDocuments.organizationId, organizationId)
      ))
      .limit(1);
    
    if (document.length === 0) {
      throw new Error('Document not found');
    }
    
    const doc = document[0];
    
    // Get all components for this document in order
    const docComponents = await db
      .select({
        docComponent: documentComponents,
        component: components,
        version: componentVersions
      })
      .from(documentComponents)
      .innerJoin(components, eq(documentComponents.componentId, components.id))
      .leftJoin(componentVersions, eq(documentComponents.componentVersionId, componentVersions.id))
      .where(and(
        eq(documentComponents.documentId, documentId),
        eq(documentComponents.organizationId, organizationId)
      ))
      .orderBy(asc(documentComponents.position));
    
    // Build document sections
    const sections = [];
    
    // Add title page
    sections.push(
      new Paragraph({
        text: doc.title || 'Untitled Document',
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: {
          after: 600
        }
      })
    );
    
    // Add metadata if exists
    if (doc.metadata) {
      sections.push(
        new Paragraph({
          text: 'Document Information',
          heading: HeadingLevel.HEADING_1,
          spacing: {
            before: 400,
            after: 200
          }
        })
      );
      
      if (doc.metadata.module) {
        sections.push(
          new Paragraph({
            children: [
              new TextRun({ text: 'Module: ', bold: true }),
              new TextRun(doc.metadata.module)
            ],
            spacing: { after: 60 }
          })
        );
      }
      
      if (doc.status) {
        sections.push(
          new Paragraph({
            children: [
              new TextRun({ text: 'Status: ', bold: true }),
              new TextRun(doc.status)
            ],
            spacing: { after: 60 }
          })
        );
      }
      
      sections.push(
        new Paragraph({
          children: [
            new TextRun({ text: 'Last Updated: ', bold: true }),
            new TextRun(new Date(doc.updatedAt).toLocaleDateString())
          ],
          spacing: { after: 400 }
        })
      );
    }
    
    // Add main content from components
    let lastModuleContext = null;
    
    for (const { docComponent, component, version } of docComponents) {
      // Use overridden content if available, otherwise use version content or component content
      const content = docComponent.overrideContent || 
                     version?.content || 
                     component.content;
      
      // Add module separator if context changes
      if (component.moduleContext && component.moduleContext !== lastModuleContext) {
        sections.push(
          new Paragraph({
            text: component.moduleContext,
            heading: HeadingLevel.HEADING_1,
            spacing: {
              before: 600,
              after: 300
            }
          })
        );
        lastModuleContext = component.moduleContext;
      }
      
      // Convert component to docx element(s)
      const element = componentToDocxElement({
        type: component.type,
        level: component.level,
        content
      });
      
      if (element) {
        if (Array.isArray(element)) {
          sections.push(...element);
        } else {
          sections.push(element);
        }
      }
    }
    
    // Create Word document
    const wordDoc = new Document({
      creator: 'eCTD Co-Author Module',
      title: doc.title,
      description: `Reconstructed from ${docComponents.length} components`,
      sections: [{
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch
              right: 1440,
              bottom: 1440,
              left: 1440
            }
          }
        },
        headers: {
          default: new Paragraph({
            children: [
              new TextRun({
                text: doc.title || 'eCTD Document',
                size: 20,
                color: '666666'
              })
            ],
            alignment: AlignmentType.RIGHT,
            spacing: {
              after: 120
            }
          })
        },
        footers: {
          default: new Paragraph({
            children: [
              new TextRun('Page '),
              new TextRun({
                children: ['PAGE_NUMBER']
              }),
              new TextRun(' of '),
              new TextRun({
                children: ['TOTAL_PAGES']
              })
            ],
            alignment: AlignmentType.CENTER
          })
        },
        children: sections
      }],
      numbering: {
        config: [{
          reference: 'default-numbering',
          levels: [{
            level: 0,
            format: 'decimal',
            text: '%1.',
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: {
                indent: { left: 720, hanging: 360 }
              }
            }
          }]
        }]
      }
    });
    
    // Generate buffer
    const buffer = await Packer.toBuffer(wordDoc);
    
    return {
      success: true,
      buffer,
      metadata: {
        documentId,
        title: doc.title,
        componentCount: docComponents.length,
        exportedAt: new Date().toISOString()
      }
    };
    
  } catch (error) {
    console.error('Error reconstructing document:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Export document to Word format with template options
export async function exportToWord(documentId, organizationId, options = {}) {
  const { 
    templateNumber, 
    includeMetadata = true, 
    title, 
    documentType = 'IND' 
  } = options;
  
  const result = await reconstructDocument(documentId, organizationId);
  
  if (!result.success) {
    throw new Error(result.error);
  }
  
  // Add template information to metadata
  result.metadata = {
    ...result.metadata,
    templateNumber,
    includeMetadata,
    documentType,
    exportedAt: new Date().toISOString()
  };
  
  return result;
}

// Get component history for a document
export async function getComponentHistory(documentId, organizationId) {
  try {
    const history = await db
      .select({
        component: components,
        versions: sql`
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'versionNumber', cv.version_number,
                'versionLabel', cv.version_label,
                'changeDescription', cv.change_description,
                'changeType', cv.change_type,
                'createdAt', cv.created_at,
                'createdBy', cv.created_by_name
              ) ORDER BY cv.version_number DESC
            ) FILTER (WHERE cv.id IS NOT NULL),
            '[]'::json
          )`
      })
      .from(documentComponents)
      .innerJoin(components, eq(documentComponents.componentId, components.id))
      .leftJoin(componentVersions, eq(componentVersions.componentId, components.id))
      .where(and(
        eq(documentComponents.documentId, documentId),
        eq(documentComponents.organizationId, organizationId)
      ))
      .groupBy(components.id)
      .orderBy(asc(documentComponents.position));
    
    return {
      success: true,
      history
    };
    
  } catch (error) {
    console.error('Error getting component history:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export default {
  reconstructDocument,
  exportToWord,
  getComponentHistory
};