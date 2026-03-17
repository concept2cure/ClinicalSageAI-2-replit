/**
 * Document Generator Utilities
 *
 * This module provides utilities for generating various document formats
 * used in CMC documentation.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getOpenAIClient } from '../services/openai-client';

// Get current directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize OpenAI client
const openai = getOpenAIClient();

/**
 * Generate CMC documentation based on molecular structure and process data
 *
 * @param {Object} moleculeData - Molecule data structure
 * @param {Object} processData - Process data structure (optional)
 * @param {String} documentType - Type of document to generate
 * @param {String} outputFormat - Format for output (docx, pdf, etc.)
 * @param {String} documentId - Unique ID for the document
 * @param {Boolean} includeReferences - Whether to include references
 * @param {String} complianceRegion - Region for regulatory compliance
 * @returns {Promise<Object>} - Generated document details
 */
export async function generateDocumentation(
  moleculeData,
  processData,
  documentType,
  outputFormat = 'docx',
  documentId,
  includeReferences = true,
  complianceRegion = 'ich'
) {
  try {
    // Verify OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured');
    }

    // Ensure output directory exists
    const outputDir = path.join(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Create the appropriate prompt based on document type
    let prompt = `Generate an ICH-compliant Module 3 ${documentType.toUpperCase()} document for ${moleculeData.moleculeName} (${moleculeData.molecularFormula}).
    
    The document should follow the CTD format and include all required sections for ${documentType.toUpperCase()}.
    
    Molecule Data:
    ${JSON.stringify(moleculeData, null, 2)}
    
    ${processData ? `Process Data:\n${JSON.stringify(processData, null, 2)}` : ''}
    
    ${includeReferences ? 'Include appropriate regulatory references and citations.' : ''}
    
    Compliance region: ${complianceRegion.toUpperCase()}
    
    Format the document with proper headings, subheadings, tables, and sections according to ICH CTD guidelines.`;

    // Call OpenAI API to generate document content
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert regulatory affairs specialist with extensive experience in Chemistry, Manufacturing, and Controls (CMC) documentation for pharmaceutical products. You are creating a regulatory document that follows ICH Common Technical Document (CTD) format and guidelines.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 4000,
    });

    // Extract the generated content
    const generatedContent = response.choices[0].message.content;

    // Generate a document name
    const documentName = `${documentType.replace(/\./g, '_')}_${moleculeData.moleculeName}_${new Date().toISOString().split('T')[0]}`;

    // Write the content to a text file as a fallback
    const textFilePath = path.join(outputDir, `${documentId}.txt`);
    fs.writeFileSync(textFilePath, generatedContent);

    // In a real implementation, we would convert to the requested format
    // For this example, we'll just simulate different format handling
    let outputPath;
    switch (outputFormat.toLowerCase()) {
      case 'pdf':
        // Simulate PDF generation
        outputPath = path.join(outputDir, `${documentId}.pdf`);
        fs.writeFileSync(outputPath, generatedContent); // Placeholder
        break;
      case 'html':
        // Simulate HTML generation
        outputPath = path.join(outputDir, `${documentId}.html`);
        const htmlContent = `<!DOCTYPE html>
        <html>
        <head>
          <title>${documentName}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.5; }
            h1, h2, h3 { color: #333; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #ddd; padding: 8px; }
            th { background-color: #f2f2f2; }
          </style>
        </head>
        <body>
          <h1>${documentName}</h1>
          <div>${generatedContent.replace(/\n/g, '<br>').replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;')}</div>
        </body>
        </html>`;
        fs.writeFileSync(outputPath, htmlContent);
        break;
      case 'docx':
      default:
        // Simulate DOCX generation
        outputPath = path.join(outputDir, `${documentId}.docx`);
        fs.writeFileSync(outputPath, generatedContent); // Placeholder
        break;
    }

    return {
      success: true,
      documentName,
      documentPath: outputPath,
      documentDetails: {
        type: documentType,
        format: outputFormat,
        molecule: moleculeData.moleculeName,
        generatedAt: new Date().toISOString(),
        complianceRegion,
      },
    };
  } catch (error) {
    console.error('Error in document generation:', error);
    throw error;
  }
}

/**
 * Generate process flow diagram or chemical structure illustration
 *
 * @param {String} diagramType - Type of diagram to generate
 * @param {Object} processData - Process data for diagram
 * @param {Object} moleculeData - Molecule data for diagram
 * @param {String} format - Output format (svg, png)
 * @param {String} diagramId - Unique ID for the diagram
 * @returns {Promise<Object>} - Generated diagram details
 */
export async function renderProcessDiagram(
  diagramType,
  processData,
  moleculeData,
  format = 'svg',
  diagramId
) {
  try {
    // Verify OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured');
    }

    // Ensure output directory exists
    const outputDir = path.join(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Create the appropriate prompt based on diagram type
    let prompt;
    switch (diagramType) {
      case 'process-flow':
        prompt = `Create a detailed process flow diagram for the following manufacturing process:
        
        ${JSON.stringify(processData, null, 2)}
        
        Show each step, inputs, outputs, and critical process parameters. Use standard process flow notation.`;
        break;
      case 'reaction-scheme':
        prompt = `Create a chemical reaction scheme showing the synthesis of ${moleculeData.moleculeName}:
        
        ${JSON.stringify(moleculeData, null, 2)}
        
        Use standard chemical notation and include reagents, conditions, and intermediates.`;
        break;
      case 'equipment-layout':
        prompt = `Create an equipment layout diagram for the following manufacturing process:
        
        ${JSON.stringify(processData, null, 2)}
        
        Show the arrangement of equipment, material flow, and connections between units.`;
        break;
      default:
        throw new Error(`Unsupported diagram type: ${diagramType}`);
    }

    // In a real implementation, we would use DALL-E to generate the diagram
    // For this example, we'll generate a placeholder SVG
    const svgCode = generatePlaceholderSVG(diagramType, moleculeData, processData);

    // Write SVG to file
    const outputPath = path.join(outputDir, `diagram_${diagramId}.svg`);
    fs.writeFileSync(outputPath, svgCode);

    return {
      success: true,
      diagramPath: outputPath,
      diagramType,
      diagramDetails: {
        format: 'svg',
        generatedAt: new Date().toISOString(),
        molecule: moleculeData ? moleculeData.moleculeName : null,
        processName: processData?.processName || 'Manufacturing Process',
      },
    };
  } catch (error) {
    console.error('Error in diagram generation:', error);
    throw error;
  }
}

/**
 * Generate a placeholder SVG for demonstration purposes
 *
 * @param {String} diagramType - Type of diagram
 * @param {Object} moleculeData - Molecule data
 * @param {Object} processData - Process data
 * @returns {String} - SVG code
 */
function generatePlaceholderSVG(diagramType, moleculeData, processData) {
  const width = 800;
  const height = 600;

  // Base SVG structure
  const svgHeader = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#f8f9fa"/>
  <text x="50%" y="40" font-family="Arial" font-size="24" text-anchor="middle" fill="#333">`;

  const svgFooter = `</text>
  <text x="50%" y="${height - 20}" font-family="Arial" font-size="14" text-anchor="middle" fill="#666">Generated by AI-CMC Blueprint Generator</text>
</svg>`;

  // Title based on diagram type
  let title;
  let content = '';

  switch (diagramType) {
    case 'process-flow':
      title = `Process Flow Diagram: ${processData?.processName || 'Manufacturing Process'}`;
      content = generateProcessFlowSVG(processData);
      break;
    case 'reaction-scheme':
      title = `Reaction Scheme: ${moleculeData?.moleculeName || 'Chemical Synthesis'}`;
      content = generateReactionSchemeSVG(moleculeData);
      break;
    case 'equipment-layout':
      title = `Equipment Layout: ${processData?.processName || 'Manufacturing Facility'}`;
      content = generateEquipmentLayoutSVG(processData);
      break;
    default:
      title = `Diagram: ${diagramType}`;
      content = '';
  }

  return `${svgHeader}${title}${svgFooter}`;
}

/**
 * Generate process flow SVG content
 *
 * @param {Object} processData - Process data
 * @returns {String} - SVG content
 */
function generateProcessFlowSVG(processData) {
  // In a real implementation, this would generate a proper process flow diagram
  // For this example, we return an empty string
  return '';
}

/**
 * Generate reaction scheme SVG content
 *
 * @param {Object} moleculeData - Molecule data
 * @returns {String} - SVG content
 */
function generateReactionSchemeSVG(moleculeData) {
  // In a real implementation, this would generate a proper reaction scheme
  // For this example, we return an empty string
  return '';
}

/**
 * Generate equipment layout SVG content
 *
 * @param {Object} processData - Process data
 * @returns {String} - SVG content
 */
function generateEquipmentLayoutSVG(processData) {
  // In a real implementation, this would generate a proper equipment layout
  // For this example, we return an empty string
  return '';
}

// Provide exports for the document generation functions expected by other modules
export const createDocx = data => {
  console.log('Creating DOCX document', data);
  return generateDocumentation(data, null, 'docx', 'docx');
};

export const createPDF = data => {
  console.log('Creating PDF document', data);
  return generateDocumentation(data, null, 'pdf', 'pdf');
};

export const createECTD = data => {
  console.log('Creating eCTD document', data);
  return generateDocumentation(data, null, 'ectd', 'zip');
};

export const createJSONExport = data => {
  console.log('Creating JSON export', data);
  return generateDocumentation(data, null, 'json', 'json');
};

export default {
  generateDocumentation,
  renderProcessDiagram,
  createDocx,
  createPDF,
  createECTD,
  createJSONExport,
};
