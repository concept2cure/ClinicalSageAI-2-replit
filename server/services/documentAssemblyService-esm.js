/**
 * Document Assembly Service (ESM Version)
 *
 * This service handles the assembly of complete CER and 510(k) reports by combining
 * various document sections and applying consistent formatting and validation.
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import { fileURLToPath } from 'url';
import pdfGenerationService from './pdfGenerationService-esm.js';
import wordGenerationService from './wordGenerationService-esm.js';

// Get dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
          ${submission510kData.conclusion || '<p>Based on the information provided in this submission, the subject device is substantially equivalent to the predicate device.</p>'}
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

  // Convert Map to Array and sort by startTime (descending)
  let assemblies = Array.from(activeAssemblies.values()).sort(
    (a, b) => (b.startTime || 0) - (a.startTime || 0)
  );

  // Filter by type if specified
  if (type) {
    assemblies = assemblies.filter(a => a.type === type);
  }

  // Limit results
  return assemblies.slice(0, limit);
}

/**
 * Generate a perfect 510(k) example report for demo purposes
 *
 * @returns {Promise<string>} - Path to the example report
 */
async function generatePerfect510kExampleReport() {
  try {
    // Generate a simulated 510(k) submission with all proper sections
    const exampleSubmission = {
      deviceProfile: {
        deviceName: 'ExampleMed Glucose Monitor Pro',
        manufacturer: 'ExampleMed Technologies, Inc.',
        commonName: 'Blood Glucose Monitor',
        classificationName: 'System, Test, Blood Glucose, Over The Counter',
        deviceClass: 'II',
        productCode: 'NBW',
        regulationNumber: '21 CFR 862.1345',
        intendedUse:
          'The ExampleMed Glucose Monitor Pro is intended for the quantitative measurement of glucose in fresh capillary whole blood samples drawn from the fingertips. It is indicated for use by healthcare professionals and people with diabetes mellitus in home settings as an aid in monitoring the effectiveness of diabetes control programs.',
        deviceDescription:
          'The ExampleMed Glucose Monitor Pro is a compact, handheld blood glucose monitoring system designed for self-testing. The system includes a meter, test strips, and a lancing device. The meter uses electrochemical biosensor technology to measure glucose levels in whole blood samples, requiring a minimum sample volume of 0.5 μL and providing results in approximately 5 seconds.',
        technicalSpecifications:
          'The device utilizes electrochemical biosensor technology with glucose oxidase enzyme reaction. It has a measurement range of 20-600 mg/dL with a clinical accuracy of ±10% compared to laboratory reference methods. It includes features such as automatic coding, hypoglycemia warning alerts, 500-test memory storage, and data connectivity via Bluetooth to compatible mobile applications.',
      },
      sections: [
        {
          title: 'Indications for Use',
          content: `<p>The ExampleMed Glucose Monitor Pro is intended for the quantitative measurement of glucose in fresh capillary whole blood samples drawn from the fingertips. It is indicated for use by healthcare professionals and people with diabetes mellitus in home settings as an aid in monitoring the effectiveness of diabetes control programs.</p>
          
          <p>The system is intended for single patient use and should not be shared. It is intended for self-testing outside the body (in vitro diagnostic use).</p>
          
          <p>The ExampleMed Glucose Monitor Pro is not intended for the diagnosis of or screening for diabetes and is not intended for use on neonates.</p>`,
        },
        {
          title: 'Performance Data',
          content: `<h3>Clinical Studies</h3>
          <p>A clinical study was conducted to evaluate the performance of the ExampleMed Glucose Monitor Pro. The study included 350 participants with diabetes across 5 clinical sites. Blood glucose measurements were compared with a laboratory reference method (YSI Glucose Analyzer).</p>
          
          <table>
            <tr>
              <th>Parameter</th>
              <th>Result</th>
              <th>Acceptance Criteria</th>
            </tr>
            <tr>
              <td>System Accuracy (within ±15 mg/dL or ±15% of reference)</td>
              <td>95.8%</td>
              <td>≥95%</td>
            </tr>
            <tr>
              <td>System Accuracy (within ±10 mg/dL or ±10% of reference)</td>
              <td>90.3%</td>
              <td>≥85%</td>
            </tr>
            <tr>
              <td>Coefficient of Variation</td>
              <td>3.8%</td>
              <td>≤5%</td>
            </tr>
          </table>
          
          <h3>Reliability Testing</h3>
          <p>The device was subjected to extensive reliability testing, including:</p>
          <ul>
            <li>Drop test (1 meter onto hardwood surface): Passed</li>
            <li>Vibration test: Passed</li>
            <li>Altitude simulation (up to 10,000 feet): Passed</li>
            <li>Temperature and humidity variation: Passed</li>
            <li>Electrical safety testing: Passed</li>
          </ul>`,
        },
        {
          title: 'Technological Characteristics',
          content: `<p>The ExampleMed Glucose Monitor Pro and the predicate device both utilize electrochemical biosensor technology based on glucose oxidase enzyme reactions. Both devices measure glucose in whole blood samples, require similar blood volumes, and provide results within 10 seconds.</p>
          
          <h3>Key Technological Features Comparison</h3>
          <table>
            <tr>
              <th>Feature</th>
              <th>ExampleMed Glucose Monitor Pro</th>
              <th>Predicate Device</th>
            </tr>
            <tr>
              <td>Measurement Technology</td>
              <td>Electrochemical biosensor</td>
              <td>Electrochemical biosensor</td>
            </tr>
            <tr>
              <td>Enzyme</td>
              <td>Glucose oxidase</td>
              <td>Glucose oxidase</td>
            </tr>
            <tr>
              <td>Sample Type</td>
              <td>Fresh capillary whole blood</td>
              <td>Fresh capillary whole blood</td>
            </tr>
            <tr>
              <td>Sample Size</td>
              <td>0.5 μL</td>
              <td>0.6 μL</td>
            </tr>
            <tr>
              <td>Test Time</td>
              <td>5 seconds</td>
              <td>8 seconds</td>
            </tr>
            <tr>
              <td>Measurement Range</td>
              <td>20-600 mg/dL</td>
              <td>20-500 mg/dL</td>
            </tr>
            <tr>
              <td>Memory Capacity</td>
              <td>500 tests</td>
              <td>450 tests</td>
            </tr>
            <tr>
              <td>Data Connectivity</td>
              <td>Bluetooth, USB</td>
              <td>USB only</td>
            </tr>
          </table>`,
        },
        {
          title: 'Sterilization and Shelf Life',
          content: `<p>The ExampleMed Glucose Monitor Pro is not supplied sterile as sterilization is not required for this type of device. The test strips are manufactured in a controlled environment to maintain cleanliness and functionality.</p>
          
          <h3>Shelf Life</h3>
          <p>Shelf life studies were conducted to establish the following:</p>
          <ul>
            <li>Glucose Monitor: 5 years from date of manufacture</li>
            <li>Test Strips: 18 months from date of manufacture when stored in the original vial at 39-86°F (4-30°C) and 10-90% relative humidity</li>
            <li>Control Solution: 3 months after first opening or until the expiration date printed on the bottle, whichever comes first</li>
          </ul>
          
          <p>Accelerated aging studies confirmed that the device maintains its performance specifications throughout the labeled shelf life.</p>`,
        },
        {
          title: 'Biocompatibility',
          content: `<p>The patient-contacting components of the ExampleMed Glucose Monitor Pro system include the test strips and the lancing device. Biocompatibility testing was conducted in accordance with ISO 10993-1:2018 for the appropriate category of devices with limited (less than 24 hours) skin contact.</p>
          
          <h3>Biocompatibility Testing Results</h3>
          <table>
            <tr>
              <th>Test</th>
              <th>Standard</th>
              <th>Result</th>
            </tr>
            <tr>
              <td>Cytotoxicity</td>
              <td>ISO 10993-5</td>
              <td>Pass</td>
            </tr>
            <tr>
              <td>Sensitization</td>
              <td>ISO 10993-10</td>
              <td>Pass</td>
            </tr>
            <tr>
              <td>Irritation</td>
              <td>ISO 10993-10</td>
              <td>Pass</td>
            </tr>
            <tr>
              <td>Acute Systemic Toxicity</td>
              <td>ISO 10993-11</td>
              <td>Pass</td>
            </tr>
          </table>
          
          <p>All materials used in the patient-contacting components have a history of safe use in previously cleared blood glucose monitoring systems.</p>`,
        },
        {
          title: 'Software Verification and Validation',
          content: `<p>The ExampleMed Glucose Monitor Pro contains software of moderate level of concern as defined by FDA's guidance document "Guidance for the Content of Premarket Submissions for Software Contained in Medical Devices." Software verification and validation testing were conducted according to IEC 62304:2015 Medical device software – Software life cycle processes.</p>
          
          <h3>Software Testing Summary</h3>
          <ul>
            <li>Software Version: v3.2.1</li>
            <li>Requirements Specification: All requirements verified</li>
            <li>Risk Analysis: All identified risks mitigated to acceptable levels</li>
            <li>Unit Testing: Passed all 127 unit tests</li>
            <li>Integration Testing: Passed all 45 integration scenarios</li>
            <li>System Testing: Passed all 32 system test cases</li>
            <li>Cybersecurity Assessment: No critical vulnerabilities identified</li>
          </ul>
          
          <p>The software validation documentation is provided in Section 16 of this submission.</p>`,
        },
      ],
      predicateComparison: {
        html: `<div class="predicate-comparison">
          <h3>Predicate Device Comparison</h3>
          <p>The ExampleMed Glucose Monitor Pro is substantially equivalent to the GlucoSense 5000 (K123456) in terms of intended use, technological characteristics, and performance.</p>
          
          <h4>Substantial Equivalence Comparison</h4>
          <table>
            <tr>
              <th>Characteristic</th>
              <th>ExampleMed Glucose Monitor Pro</th>
              <th>GlucoSense 5000 (Predicate)</th>
              <th>Comparison</th>
            </tr>
            <tr>
              <td>Intended Use</td>
              <td>Measurement of glucose in capillary whole blood for self-testing</td>
              <td>Measurement of glucose in capillary whole blood for self-testing</td>
              <td>Same</td>
            </tr>
            <tr>
              <td>Technology</td>
              <td>Electrochemical biosensor</td>
              <td>Electrochemical biosensor</td>
              <td>Same</td>
            </tr>
            <tr>
              <td>Sample Type</td>
              <td>Fresh capillary whole blood</td>
              <td>Fresh capillary whole blood</td>
              <td>Same</td>
            </tr>
            <tr>
              <td>Measurement Range</td>
              <td>20-600 mg/dL</td>
              <td>20-500 mg/dL</td>
              <td>Similar (Wider range)</td>
            </tr>
            <tr>
              <td>Accuracy</td>
              <td>±10% (90.3% of samples)</td>
              <td>±10% (89.7% of samples)</td>
              <td>Similar (Slightly improved)</td>
            </tr>
            <tr>
              <td>Test Time</td>
              <td>5 seconds</td>
              <td>8 seconds</td>
              <td>Similar (Faster)</td>
            </tr>
            <tr>
              <td>Sample Size</td>
              <td>0.5 μL</td>
              <td>0.6 μL</td>
              <td>Similar (Smaller sample)</td>
            </tr>
            <tr>
              <td>Operating Temperature</td>
              <td>50-104°F (10-40°C)</td>
              <td>50-104°F (10-40°C)</td>
              <td>Same</td>
            </tr>
            <tr>
              <td>Storage Temperature</td>
              <td>39-86°F (4-30°C)</td>
              <td>39-86°F (4-30°C)</td>
              <td>Same</td>
            </tr>
            <tr>
              <td>Power Source</td>
              <td>3V lithium battery (CR2032)</td>
              <td>3V lithium battery (CR2032)</td>
              <td>Same</td>
            </tr>
          </table>
          
          <h4>Differences Analysis</h4>
          <p>The differences between the ExampleMed Glucose Monitor Pro and the predicate device do not raise new questions of safety or effectiveness:</p>
          <ul>
            <li>The wider measurement range (20-600 mg/dL vs. 20-500 mg/dL) provides additional clinical utility without affecting performance within the overlapping range.</li>
            <li>The faster test time (5 seconds vs. 8 seconds) is due to an improved enzyme formulation and does not affect accuracy or reliability.</li>
            <li>The smaller sample size (0.5 μL vs. 0.6 μL) reduces discomfort without compromising test accuracy.</li>
            <li>Additional connectivity features (Bluetooth) provide improved user convenience but do not affect the core measurement functionality.</li>
          </ul>
        </div>`,
      },
      conclusion: `<p>Based on the information provided in this 510(k) submission, including performance data and comparison to the predicate device, the ExampleMed Glucose Monitor Pro is substantially equivalent to the predicate device GlucoSense 5000 (K123456).</p>
      
      <p>The ExampleMed Glucose Monitor Pro has the same intended use and similar technological characteristics as the predicate device. The differences between the devices do not raise new questions of safety or effectiveness, and performance testing demonstrates that the device is as safe and effective as the predicate device.</p>
      
      <p>Therefore, the ExampleMed Glucose Monitor Pro is substantially equivalent to the legally marketed predicate device.</p>`,
    };

    // Generate the document
    const result = await assemble510kDocument(exampleSubmission);

    // Copy to the example directory
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

export default {
  initialize,
  assembleCERDocument,
  assemble510kDocument,
  getAssemblyStatus,
  listAssemblies,
  generatePerfect510kExampleReport,
};
