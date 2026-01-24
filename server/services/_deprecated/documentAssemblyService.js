/**
 * Document Assembly Service
 *
 * This service handles the assembly of complete CER and 510(k) reports by combining
 * various document sections and applying consistent formatting and validation.
 */

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const pdfGenerationService = require('./pdfGenerationService');

// Generate a unique ID (replacement for uuid)
function generateId() {
  return crypto.randomBytes(16).toString('hex');
}

// Configuration
const CONFIG = {
  outputDir: path.join(process.cwd(), 'generated_documents'),
  templateDir: path.join(process.cwd(), 'templates'),
  exampleDir: path.join(process.cwd(), 'attached_assets/example_reports'),
  maxConcurrentAssemblies: 5,
  defaultTimeout: 180000, // 3 minutes
};

// Track active assembly operations
const activeAssemblies = new Map();

/**
 * Initialize document assembly service
 */
async function initialize() {
  try {
    // Ensure output directory exists
    await fs.mkdir(CONFIG.outputDir, { recursive: true });

    // Ensure example reports directory exists
    await fs.mkdir(CONFIG.exampleDir, { recursive: true });

    // Initialize PDF generation service
    await pdfGenerationService.initialize();

    console.log(`Document Assembly Service initialized. Output directory: ${CONFIG.outputDir}`);
    return true;
  } catch (error) {
    console.error('Failed to initialize document assembly service:', error);
    return false;
  }
}

/**
 * Assemble a complete CER document from sections and metadata
 *
 * @param {Object} cerData - The CER data including all sections and metadata
 * @param {Object} options - Assembly options
 * @returns {Promise<Object>} - Assembly result with document paths and status
 */
async function assembleCERDocument(cerData, options = {}) {
  const assemblyId = generateId();
  const startTime = Date.now();

  try {
    // Validate inputs
    if (!cerData || !cerData.deviceProfile) {
      throw new Error('CER data or device profile missing');
    }

    // Get device information
    const { deviceName, manufacturer } = cerData.deviceProfile;
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const outputFilename = `CER_${deviceName || 'Device'}_${timestamp}.html`;
    const outputPath = path.join(CONFIG.outputDir, outputFilename);

    // Track assembly operation
    activeAssemblies.set(assemblyId, {
      id: assemblyId,
      type: 'cer',
      status: 'in_progress',
      startTime,
      deviceName,
      outputPath,
    });

    // Collect all sections
    const sections = cerData.sections || [];

    // Create HTML document structure
    let documentHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Clinical Evaluation Report - ${deviceName || 'Medical Device'}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.5;
            color: #333;
            max-width: 1000px;
            margin: 0 auto;
            padding: 20px;
          }
          h1 {
            color: #2563eb;
            text-align: center;
            margin-bottom: 30px;
          }
          h2 {
            color: #1d4ed8;
            margin-top: 40px;
            border-bottom: 1px solid #e5e7eb;
            padding-bottom: 8px;
          }
          h3 {
            color: #1e40af;
            margin-top: 25px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
          }
          th, td {
            border: 1px solid #e5e7eb;
            padding: 12px;
            text-align: left;
          }
          th {
            background-color: #f3f4f6;
          }
          .header {
            text-align: center;
            margin-bottom: 40px;
          }
          .footer {
            margin-top: 50px;
            text-align: center;
            font-size: 14px;
            color: #6b7280;
            border-top: 1px solid #e5e7eb;
            padding-top: 20px;
          }
          .section {
            margin-bottom: 30px;
          }
          .metadata {
            font-size: 12px;
            color: #6b7280;
          }
          .toc {
            background-color: #f9fafb;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 40px;
          }
          .toc ul {
            list-style-type: none;
          }
          .toc a {
            text-decoration: none;
            color: #2563eb;
          }
          .toc a:hover {
            text-decoration: underline;
          }
          .references {
            margin-top: 50px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
          }
          .references ol {
            padding-left: 20px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Clinical Evaluation Report</h1>
          <p><strong>${deviceName || 'Medical Device'}</strong>${manufacturer ? ' - ' + manufacturer : ''}</p>
          <p>Generated: ${new Date().toLocaleDateString()}</p>
        </div>
        
        <div class="toc" id="table-of-contents">
          <h2>Table of Contents</h2>
          <ul>
            <li><a href="#overview">1. Device Overview</a></li>
            ${sections
              .map(
                (section, index) =>
                  `<li><a href="#section-${index + 2}">${index + 2}. ${section.title || 'Untitled Section'}</a></li>`
              )
              .join('\n')}
            <li><a href="#conclusion">Conclusion</a></li>
          </ul>
        </div>
        
        <div class="section" id="overview">
          <h2>1. Device Overview</h2>
          <table>
            <tr>
              <th>Device Name</th>
              <td>${deviceName || 'Not Specified'}</td>
            </tr>
            <tr>
              <th>Manufacturer</th>
              <td>${cerData.deviceProfile.manufacturer || 'Not Specified'}</td>
            </tr>
            <tr>
              <th>Device Class</th>
              <td>${cerData.deviceProfile.deviceClass || 'Not Specified'}</td>
            </tr>
            <tr>
              <th>Intended Use</th>
              <td>${cerData.deviceProfile.intendedUse || 'Not Specified'}</td>
            </tr>
            <tr>
              <th>Device Description</th>
              <td>${cerData.deviceProfile.deviceDescription || 'Not Specified'}</td>
            </tr>
          </table>
        </div>
    `;

    // Add each section content
    sections.forEach((section, index) => {
      const sectionNumber = index + 2; // Start numbering from 2 (after overview)

      documentHtml += `
        <div class="section" id="section-${sectionNumber}">
          <h2>${sectionNumber}. ${section.title || 'Untitled Section'}</h2>
          ${section.content || ''}
          ${
            section.metadata
              ? `
            <div class="metadata">
              <p>Last updated: ${new Date(section.metadata.updatedAt || section.metadata.createdAt || Date.now()).toLocaleDateString()}</p>
            </div>
          `
              : ''
          }
        </div>
      `;
    });

    // Add conclusion section
    documentHtml += `
        <div class="section" id="conclusion">
          <h2>Conclusion</h2>
          ${cerData.conclusion || '<p>Based on the clinical evaluation conducted, the device meets applicable requirements.</p>'}
        </div>
        
        <div class="footer">
          <p>This document was generated on ${new Date().toLocaleDateString()} by TrialSage Clinical Evaluation Report System.</p>
        </div>
      </body>
      </html>
    `;

    // Write to file
    await fs.writeFile(outputPath, documentHtml);

    // Update assembly status
    activeAssemblies.set(assemblyId, {
      ...activeAssemblies.get(assemblyId),
      status: 'completed',
      endTime: Date.now(),
      outputPath,
    });

    return {
      success: true,
      assemblyId,
      documentPath: outputPath,
      documentUrl: `/generated_documents/${outputFilename}`,
      documentName: outputFilename,
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    console.error('Error assembling CER document:', error);

    // Update assembly status
    if (activeAssemblies.has(assemblyId)) {
      activeAssemblies.set(assemblyId, {
        ...activeAssemblies.get(assemblyId),
        status: 'failed',
        endTime: Date.now(),
        error: error.message,
      });
    }

    throw error;
  }
}

/**
 * Assemble a 510(k) submission document
 *
 * @param {Object} submission510kData - The 510(k) submission data
 * @param {Object} options - Assembly options
 * @returns {Promise<Object>} - Assembly result with document paths and status
 */
async function assemble510kDocument(submission510kData, options = {}) {
  const assemblyId = generateId();
  const startTime = Date.now();

  try {
    // Validate inputs
    if (!submission510kData || !submission510kData.deviceProfile) {
      throw new Error('510(k) submission data or device profile missing');
    }

    // Get device information
    const { deviceName, manufacturer } = submission510kData.deviceProfile;
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const outputFilename = `510k_${deviceName || 'Device'}_${timestamp}.html`;
    const outputPath = path.join(CONFIG.outputDir, outputFilename);

    // Track assembly operation
    activeAssemblies.set(assemblyId, {
      id: assemblyId,
      type: '510k',
      status: 'in_progress',
      startTime,
      deviceName,
      outputPath,
    });

    // Collect all sections
    const sections = submission510kData.sections || [];

    // Create HTML document structure
    let documentHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>510(k) Submission - ${deviceName || 'Medical Device'}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.5;
            color: #333;
            max-width: 1000px;
            margin: 0 auto;
            padding: 20px;
          }
          h1 {
            color: #2563eb;
            text-align: center;
            margin-bottom: 30px;
          }
          h2 {
            color: #1d4ed8;
            margin-top: 40px;
            border-bottom: 1px solid #e5e7eb;
            padding-bottom: 8px;
          }
          h3 {
            color: #1e40af;
            margin-top: 25px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
          }
          th, td {
            border: 1px solid #e5e7eb;
            padding: 12px;
            text-align: left;
          }
          th {
            background-color: #f3f4f6;
          }
          .header {
            text-align: center;
            margin-bottom: 40px;
          }
          .footer {
            margin-top: 50px;
            text-align: center;
            font-size: 14px;
            color: #6b7280;
            border-top: 1px solid #e5e7eb;
            padding-top: 20px;
          }
          .section {
            margin-bottom: 30px;
          }
          .metadata {
            font-size: 12px;
            color: #6b7280;
          }
          .toc {
            background-color: #f9fafb;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 40px;
          }
          .toc ul {
            list-style-type: none;
          }
          .toc a {
            text-decoration: none;
            color: #2563eb;
          }
          .toc a:hover {
            text-decoration: underline;
          }
          .predicate-comparison {
            background-color: #f9fafb;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>510(k) Premarket Notification</h1>
          <p><strong>${deviceName || 'Medical Device'}</strong>${manufacturer ? ' - ' + manufacturer : ''}</p>
          <p>Generated: ${new Date().toLocaleDateString()}</p>
        </div>
        
        <div class="toc" id="table-of-contents">
          <h2>Table of Contents</h2>
          <ul>
            <li><a href="#administrative">1. Administrative Information</a></li>
            <li><a href="#device-description">2. Device Description</a></li>
            <li><a href="#substantial-equivalence">3. Substantial Equivalence</a></li>
            ${sections
              .map(
                (section, index) =>
                  `<li><a href="#section-${index + 4}">${index + 4}. ${section.title || 'Untitled Section'}</a></li>`
              )
              .join('\n')}
            <li><a href="#conclusion">Conclusion</a></li>
          </ul>
        </div>
        
        <div class="section" id="administrative">
          <h2>1. Administrative Information</h2>
          <table>
            <tr>
              <th>Device Trade Name</th>
              <td>${deviceName || 'Not Specified'}</td>
            </tr>
            <tr>
              <th>Manufacturer</th>
              <td>${submission510kData.deviceProfile.manufacturer || 'Not Specified'}</td>
            </tr>
            <tr>
              <th>Common Name</th>
              <td>${submission510kData.deviceProfile.commonName || 'Not Specified'}</td>
            </tr>
            <tr>
              <th>Classification Name</th>
              <td>${submission510kData.deviceProfile.classificationName || 'Not Specified'}</td>
            </tr>
            <tr>
              <th>Device Class</th>
              <td>${submission510kData.deviceProfile.deviceClass || 'Not Specified'}</td>
            </tr>
            <tr>
              <th>Product Code</th>
              <td>${submission510kData.deviceProfile.productCode || 'Not Specified'}</td>
            </tr>
            <tr>
              <th>Regulation Number</th>
              <td>${submission510kData.deviceProfile.regulationNumber || 'Not Specified'}</td>
            </tr>
          </table>
        </div>
        
        <div class="section" id="device-description">
          <h2>2. Device Description</h2>
          <h3>Intended Use</h3>
          <p>${submission510kData.deviceProfile.intendedUse || 'Not Specified'}</p>
          
          <h3>Device Description</h3>
          <p>${submission510kData.deviceProfile.deviceDescription || 'Not Specified'}</p>
          
          <h3>Technological Characteristics</h3>
          <p>${submission510kData.deviceProfile.technicalSpecifications || 'Not Specified'}</p>
        </div>
        
        <div class="section" id="substantial-equivalence">
          <h2>3. Substantial Equivalence</h2>
          ${submission510kData.predicateComparison?.html || '<p>No predicate device comparison available.</p>'}
        </div>
    `;

    // Add each section content
    sections.forEach((section, index) => {
      const sectionNumber = index + 4; // Start numbering from 4 (after administrative, description, and equivalence)

      documentHtml += `
        <div class="section" id="section-${sectionNumber}">
          <h2>${sectionNumber}. ${section.title || 'Untitled Section'}</h2>
          ${section.content || ''}
          ${
            section.metadata
              ? `
            <div class="metadata">
              <p>Last updated: ${new Date(section.metadata.updatedAt || section.metadata.createdAt || Date.now()).toLocaleDateString()}</p>
            </div>
          `
              : ''
          }
        </div>
      `;
    });

    // Add conclusion section
    documentHtml += `
        <div class="section" id="conclusion">
          <h2>Conclusion</h2>
          ${submission510kData.conclusion || '<p>Based on the information presented in this submission, the subject device is substantially equivalent to the predicate device(s).</p>'}
        </div>
        
        <div class="footer">
          <p>This document was generated on ${new Date().toLocaleDateString()} by TrialSage 510(k) Submission System.</p>
        </div>
      </body>
      </html>
    `;

    // Write to file
    await fs.writeFile(outputPath, documentHtml);

    // Update assembly status
    activeAssemblies.set(assemblyId, {
      ...activeAssemblies.get(assemblyId),
      status: 'completed',
      endTime: Date.now(),
      outputPath,
    });

    return {
      success: true,
      assemblyId,
      documentPath: outputPath,
      documentUrl: `/generated_documents/${outputFilename}`,
      documentName: outputFilename,
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    console.error('Error assembling 510(k) document:', error);

    // Update assembly status
    if (activeAssemblies.has(assemblyId)) {
      activeAssemblies.set(assemblyId, {
        ...activeAssemblies.get(assemblyId),
        status: 'failed',
        endTime: Date.now(),
        error: error.message,
      });
    }

    throw error;
  }
}

/**
 * Get assembly status
 *
 * @param {string} assemblyId - The assembly ID to check
 * @returns {Object|null} - Assembly status or null if not found
 */
function getAssemblyStatus(assemblyId) {
  return activeAssemblies.get(assemblyId) || null;
}

/**
 * List recent assembly operations
 *
 * @param {Object} options - List options
 * @param {number} options.limit - Number of assemblies to return (default: 10)
 * @param {string} options.type - Filter by document type (cer, 510k)
 * @returns {Array} - Array of assembly operations
 */
function listAssemblies(options = {}) {
  const { limit = 10, type } = options;

  let assemblies = Array.from(activeAssemblies.values());

  // Apply type filter if specified
  if (type) {
    assemblies = assemblies.filter(assembly => assembly.type === type);
  }

  // Sort by start time (most recent first)
  assemblies.sort((a, b) => b.startTime - a.startTime);

  // Apply limit
  return assemblies.slice(0, limit);
}

/**
 * Generate a perfect example 510(k) report for demo purposes
 *
 * @returns {Promise<string>} - Path to the example report
 */
async function generatePerfect510kExampleReport() {
  try {
    console.log('Generating perfect 510(k) example report...');

    // Create a well-structured example device profile
    const exampleDeviceProfile = {
      deviceName: 'CardioFlow X1 Cardiac Monitor',
      manufacturer: 'MedTech Innovations, Inc.',
      commonName: 'Cardiac Monitor',
      classificationName: 'Monitor, Cardiac (including Cardiotachometer and Rate Alarm)',
      deviceClass: 'II',
      productCode: 'DRT',
      regulationNumber: '870.2300',
      intendedUse:
        'The CardioFlow X1 Cardiac Monitor is intended for continuous monitoring of cardiac output and cardiac rhythm in adult patients in clinical and hospital environments.',
      deviceDescription:
        'The CardioFlow X1 is a portable cardiac monitor that utilizes advanced sensor technology to provide continuous, real-time monitoring of cardiac output, rhythm, and associated physiological parameters. The device features a high-resolution touch display, wireless connectivity, and is designed for use in various clinical settings.',
      technicalSpecifications:
        'Dimensions: 8.5" x 5.2" x 1.3", Weight: 320g, Display: 7" touch-screen LCD, Battery: Rechargeable lithium-ion (12 hours operation), Connectivity: Bluetooth 5.0, Wi-Fi (802.11 a/b/g/n), Data storage: 72 hours of continuous recording',
    };

    // Create sections for the example report
    const exampleSections = [
      {
        title: 'Performance Testing',
        content: `
          <h3>Bench Testing</h3>
          <p>The CardioFlow X1 Cardiac Monitor underwent comprehensive bench testing to validate its performance against established industry standards and predicate devices. The following tests were conducted:</p>
          <ul>
            <li>Electrical safety testing according to IEC 60601-1</li>
            <li>Electromagnetic compatibility testing according to IEC 60601-1-2</li>
            <li>Accuracy testing for cardiac output measurement</li>
            <li>Alarm system functionality testing</li>
            <li>Battery performance and longevity testing</li>
            <li>Mechanical integrity and durability testing</li>
          </ul>
          <p>All test results demonstrated that the CardioFlow X1 meets or exceeds the established performance criteria and is substantially equivalent to legally marketed predicate devices.</p>
          
          <h3>Software Verification and Validation</h3>
          <p>Software verification and validation testing was conducted according to the FDA guidance "General Principles of Software Validation" and IEC 62304. The software was classified as Class B according to IEC 62304. Testing included:</p>
          <ul>
            <li>Unit testing of software components</li>
            <li>Integration testing of software modules</li>
            <li>System-level verification testing</li>
            <li>User interface validation</li>
            <li>Algorithm validation using reference datasets</li>
          </ul>
          <p>All software verification and validation activities were successfully completed, and the results confirm that the software meets its intended use and specified requirements.</p>
        `,
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
      {
        title: 'Biocompatibility Evaluation',
        content: `
          <h3>Materials Used</h3>
          <p>The CardioFlow X1 Cardiac Monitor includes the following patient-contacting materials:</p>
          <ul>
            <li>Medical-grade silicone (sensor housing)</li>
            <li>Medical-grade stainless steel (electrode contacts)</li>
            <li>Hypoallergenic medical adhesive (attachment mechanism)</li>
          </ul>
          
          <h3>Biocompatibility Assessment</h3>
          <p>Biocompatibility evaluation was conducted in accordance with ISO 10993-1:2018 "Biological evaluation of medical devices - Part 1: Evaluation and testing within a risk management process." The device was categorized as surface device with limited contact duration (≤24 hours) with intact skin.</p>
          
          <h3>Testing Performed</h3>
          <p>The following biocompatibility tests were conducted:</p>
          <ul>
            <li>Cytotoxicity (ISO 10993-5)</li>
            <li>Sensitization (ISO 10993-10)</li>
            <li>Irritation (ISO 10993-10)</li>
          </ul>
          
          <h3>Results</h3>
          <p>All biocompatibility tests were completed successfully, demonstrating that the patient-contacting materials of the CardioFlow X1 Cardiac Monitor are non-cytotoxic, non-sensitizing, and non-irritating. The device meets all applicable biocompatibility requirements for its intended use.</p>
        `,
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
      {
        title: 'Clinical Evaluation',
        content: `
          <h3>Clinical Studies Overview</h3>
          <p>A clinical evaluation of the CardioFlow X1 Cardiac Monitor was conducted to assess device performance and safety in the intended use environment. The evaluation included:</p>
          <ol>
            <li>A comprehensive literature review of similar devices</li>
            <li>A clinical validation study</li>
            <li>Analysis of post-market surveillance data from similar devices</li>
          </ol>
          
          <h3>Clinical Validation Study</h3>
          <p>A clinical validation study was conducted at three clinical sites with a total of 85 adult patients requiring cardiac monitoring. The primary endpoints were:</p>
          <ul>
            <li>Accuracy of cardiac output measurements compared to a reference method (thermodilution)</li>
            <li>Reliability of rhythm detection compared to standard 12-lead ECG</li>
            <li>Incidence of device-related adverse events</li>
          </ul>
          
          <h3>Results</h3>
          <p>The CardioFlow X1 demonstrated a high correlation (r=0.94, p&lt;0.001) with the reference method for cardiac output measurements with a mean percentage error of 5.2% (within the predetermined acceptance criteria of ±10%). Rhythm detection showed 98.7% agreement with standard 12-lead ECG interpretation. No serious device-related adverse events were reported during the study.</p>
          
          <h3>Conclusion</h3>
          <p>The clinical evaluation demonstrates that the CardioFlow X1 Cardiac Monitor performs as intended for its specific use, with acceptable accuracy and reliability. The benefit-risk analysis supports the safety and performance of the device for its intended use.</p>
        `,
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    ];

    // Create a predicate comparison section
    const predicateComparison = {
      html: `
        <h3>Predicate Device Comparison</h3>
        <p>The CardioFlow X1 Cardiac Monitor is substantially equivalent to the following legally marketed predicate device:</p>
        <p><strong>Primary Predicate:</strong> CardioSense PRO (K123456)</p>
        
        <table style="width:100%; border-collapse: collapse; margin: 20px 0;">
          <tr style="background-color: #f3f4f6;">
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Feature</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">CardioFlow X1 (Subject Device)</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">CardioSense PRO (Predicate)</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Comparison</th>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Intended Use</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">Continuous monitoring of cardiac output and cardiac rhythm in adult patients in clinical and hospital environments</td>
            <td style="border: 1px solid #ddd; padding: 8px;">Continuous monitoring of cardiac output and cardiac rhythm in adult patients in clinical and hospital environments</td>
            <td style="border: 1px solid #ddd; padding: 8px;">Same</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Device Classification</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">Class II</td>
            <td style="border: 1px solid #ddd; padding: 8px;">Class II</td>
            <td style="border: 1px solid #ddd; padding: 8px;">Same</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Product Code</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">DRT</td>
            <td style="border: 1px solid #ddd; padding: 8px;">DRT</td>
            <td style="border: 1px solid #ddd; padding: 8px;">Same</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Measurement Technology</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">Impedance cardiography with advanced algorithm</td>
            <td style="border: 1px solid #ddd; padding: 8px;">Impedance cardiography</td>
            <td style="border: 1px solid #ddd; padding: 8px;">Similar, with enhanced algorithm</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Display</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">7" touch-screen LCD</td>
            <td style="border: 1px solid #ddd; padding: 8px;">5.5" LCD</td>
            <td style="border: 1px solid #ddd; padding: 8px;">Larger display with touch capability</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Battery Life</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">12 hours</td>
            <td style="border: 1px solid #ddd; padding: 8px;">8 hours</td>
            <td style="border: 1px solid #ddd; padding: 8px;">Improved</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Connectivity</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">Bluetooth 5.0, Wi-Fi</td>
            <td style="border: 1px solid #ddd; padding: 8px;">Bluetooth 4.2, Wi-Fi</td>
            <td style="border: 1px solid #ddd; padding: 8px;">Enhanced</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Data Storage</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">72 hours</td>
            <td style="border: 1px solid #ddd; padding: 8px;">48 hours</td>
            <td style="border: 1px solid #ddd; padding: 8px;">Improved</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Patient Population</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">Adults</td>
            <td style="border: 1px solid #ddd; padding: 8px;">Adults</td>
            <td style="border: 1px solid #ddd; padding: 8px;">Same</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Biocompatibility</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">Complies with ISO 10993</td>
            <td style="border: 1px solid #ddd; padding: 8px;">Complies with ISO 10993</td>
            <td style="border: 1px solid #ddd; padding: 8px;">Same</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Electrical Safety</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">Complies with IEC 60601-1</td>
            <td style="border: 1px solid #ddd; padding: 8px;">Complies with IEC 60601-1</td>
            <td style="border: 1px solid #ddd; padding: 8px;">Same</td>
          </tr>
        </table>
        
        <h3>Substantial Equivalence Analysis</h3>
        <p>The CardioFlow X1 has the same intended use, patient population, and fundamental technology as the predicate device CardioSense PRO. The differences between the subject and predicate devices do not raise new questions of safety or effectiveness. The subject device incorporates technological improvements such as enhanced display, longer battery life, and improved data storage, which provide benefits without introducing new risks.</p>
        
        <p>Performance testing has demonstrated that the CardioFlow X1 is as safe and effective as the predicate device for its intended use. Therefore, the CardioFlow X1 Cardiac Monitor is substantially equivalent to the legally marketed predicate device CardioSense PRO.</p>
      `,
    };

    // Create the example 510(k) submission data
    const submission510kData = {
      deviceProfile: exampleDeviceProfile,
      sections: exampleSections,
      predicateComparison: predicateComparison,
      conclusion: `
        <p>Based on the comparison of intended use, technological characteristics, performance data, and overall evaluation, the CardioFlow X1 Cardiac Monitor is substantially equivalent to the legally marketed predicate device. The subject device does not raise new questions of safety or effectiveness and performs as well as or better than the predicate device.</p>
        
        <p>The data presented in this submission demonstrate that the CardioFlow X1 Cardiac Monitor is as safe and effective as the predicate device and is substantially equivalent to the CardioSense PRO (K123456) for its intended use.</p>
      `,
    };

    // Generate the 510(k) document
    const result = await assemble510kDocument(submission510kData);

    // Save a copy to the example reports directory
    const exampleFilename = 'Example_510k_Submission.html';
    const examplePath = path.join(CONFIG.exampleDir, exampleFilename);
    await fs.copyFile(result.documentPath, examplePath);

    console.log(`Perfect 510(k) example report generated and saved to: ${examplePath}`);
    return examplePath;
  } catch (error) {
    console.error('Error generating perfect 510(k) example report:', error);
    throw error;
  }
}

module.exports = {
  initialize,
  assembleCERDocument,
  assemble510kDocument,
  getAssemblyStatus,
  listAssemblies,
  generatePerfect510kExampleReport,
};
