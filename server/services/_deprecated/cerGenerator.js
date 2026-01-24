const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Generate a structured Clinical Evaluation Report using OpenAI
 */
async function generateCER(deviceData, clinicalData, literatureData, templateSettings) {
  try {
    // First, analyze the clinical data for key findings
    const clinicalAnalysis = await analyzeClinicalData(clinicalData);
    
    // Generate a literature review
    const literatureReview = await generateLiteratureReview(literatureData, deviceData);
    
    // Generate a risk assessment
    const riskAssessment = await generateRiskAssessment(deviceData, clinicalData);
    
    // Generate the full CER combining all components
    const cerContent = await generateFullCER(
      deviceData,
      clinicalAnalysis,
      literatureReview,
      riskAssessment,
      templateSettings
    );
    
    return {
      deviceData,
      templateSettings,
      clinicalAnalysis,
      literatureReview,
      riskAssessment,
      cerContent
    };
  } catch (error) {
    console.error('Error generating CER:', error);
    throw new Error(`CER generation failed: ${error.message}`);
  }
}

/**
 * Analyze clinical data to extract key findings
 */
async function analyzeClinicalData(clinicalData) {
  try {
    const response = await openai.chat.completions.create({

/**
 * Helper function to estimate number of pages for a section based on content length
 * @param {string|object} content - The section content
 * @param {number} charsPerPage - Estimated characters per page
 * @param {object} options - Additional options for calculation
 * @returns {number} - Estimated page count
 */
function calculateSectionPages(content, charsPerPage = 3000, options = {}) {
  if (!content) return 1;
  
  const { includeImages = true, complexFormatting = false } = options;
  
  // Calculate base content length
  let contentLength = 0;
  
  if (typeof content === 'string') {
    contentLength = content.length;
  } else {
    try {
      contentLength = JSON.stringify(content).length;
    } catch (error) {
      console.error('Error stringifying content for page calculation:', error);
      // Fallback to a reasonable estimate
      contentLength = 5000;
    }
  }
  
  // Adjust based on content complexity
  let adjustedCharsPerPage = charsPerPage;
  
  // If content has complex formatting, reduce chars per page estimate
  if (complexFormatting) {
    adjustedCharsPerPage = Math.floor(charsPerPage * 0.8);
  }
  
  // Calculate base page count
  let estimatedPages = Math.ceil(contentLength / adjustedCharsPerPage);
  
  // Add pages for images if detected in content and option is enabled
  if (includeImages && typeof content === 'string') {
    // Count image references in content
    const imageMatches = content.match(/\!\[.*?\]\(.*?\)|<img|data:image/g) || [];
    const imageCount = imageMatches.length;
    
    // Each image takes approximately 1/3 page
    if (imageCount > 0) {
      estimatedPages += Math.ceil(imageCount / 3);
    }
  }
  
  // Ensure at least 1 page
  return Math.max(1, estimatedPages);
}

/**
 * Chunks large text content for more efficient processing
 * @param {string} text - The text content to chunk
 * @param {number} chunkSize - Maximum characters per chunk
 * @returns {Array<string>} Array of text chunks
 */
function chunkTextContent(text, chunkSize = 10000) {
  if (!text || text.length <= chunkSize) return [text];
  
  const chunks = [];
  let currentIndex = 0;
  
  while (currentIndex < text.length) {
    // Find a good breaking point (paragraph or sentence end)
    let endIndex = Math.min(currentIndex + chunkSize, text.length);
    
    // If we're not at the end, look for paragraph break
    if (endIndex < text.length) {
      // Try to find paragraph break near the end of chunk
      const paragraphBreakIndex = text.lastIndexOf('\n\n', endIndex);
      if (paragraphBreakIndex > currentIndex && paragraphBreakIndex > endIndex - 500) {
        endIndex = paragraphBreakIndex + 2; // Include the double newline
      } else {
        // Try to find sentence end
        const sentenceEndIndex = text.lastIndexOf('. ', endIndex);
        if (sentenceEndIndex > currentIndex && sentenceEndIndex > endIndex - 200) {
          endIndex = sentenceEndIndex + 2; // Include the period and space
        }
      }
    }
    
    chunks.push(text.substring(currentIndex, endIndex));
    currentIndex = endIndex;
  }
  
  return chunks;
}


      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert medical device clinical data analyst. Analyze the provided clinical data 
            and extract key findings, patterns, and insights relevant to a Clinical Evaluation Report. 
            Structure your analysis into clear sections with specific findings.`
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Analyze clinical data for a medical device",
            clinicalData
          })
        }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    });
    
    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('Error analyzing clinical data:', error);
    throw new Error(`Clinical data analysis failed: ${error.message}`);
  }
}

/**
 * Generate a literature review based on provided references
 */
async function generateLiteratureReview(literatureData, deviceData) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert medical literature reviewer. Generate a comprehensive 
            literature review for a Clinical Evaluation Report based on the provided literature references.
            Focus on methodology, outcomes, and relevance to the device being evaluated.`
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Generate a literature review for a medical device CER",
            deviceData,
            literatureData
          })
        }
      ],
      temperature: 0.2,
      response_format: { type: "json_object" }
    });
    
    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('Error generating literature review:', error);
    throw new Error(`Literature review generation failed: ${error.message}`);
  }
}

/**
 * Generate a risk assessment for the device
 */
async function generateRiskAssessment(deviceData, clinicalData) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert medical device risk assessor. Generate a comprehensive 
            risk assessment for a Clinical Evaluation Report based on the provided device and clinical data.
            Include risk identification, classification, mitigation strategies, and benefit-risk analysis.`
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Generate a risk assessment for a medical device CER",
            deviceData,
            clinicalData
          })
        }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    });
    
    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('Error generating risk assessment:', error);
    throw new Error(`Risk assessment generation failed: ${error.message}`);
  }
}

/**
 * Generate the complete CER combining all components
 */
async function generateFullCER(deviceData, clinicalAnalysis, literatureReview, riskAssessment, templateSettings) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert medical device regulatory writer. Generate a complete 
            Clinical Evaluation Report combining the provided components. Follow EU MDR guidelines
            and ensure the document meets regulatory standards. Apply the specified template settings.`
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Generate a complete Clinical Evaluation Report",
            deviceData,
            clinicalAnalysis,
            literatureReview,
            riskAssessment,
            templateSettings
          })
        }
      ],
      temperature: 0.2,
      response_format: { type: "json_object" }
    });
    
    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('Error generating full CER:', error);
    throw new Error(`Full CER generation failed: ${error.message}`);
  }
}

/**
 * Generate a PDF version of the CER with memory optimizations
 * @param {Object} cerData - The CER data to format into PDF
 * @param {Object} options - Options for PDF generation
 * @returns {Object} Result object with file path and metadata
 */
async function generateCERPDF(cerData, options = {}) {
  const {
    optimizeMemory = true,
    compressImages = true,
    chunkProcessing = true,
    debugMode = false
  } = options;
  
  // Start monitoring memory usage
  const memoryUsage = process.memoryUsage();
  const startMemory = {
    rss: Math.round(memoryUsage.rss / 1024 / 1024),
    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
    external: Math.round(memoryUsage.external / 1024 / 1024)
  };
  
  if (debugMode) {
    console.log(`Memory usage at start of PDF generation: ${JSON.stringify(startMemory)}MB`);
  }
  
  try {
    // Create a new PDF document with memory efficiency options
    const pdfDoc = await PDFDocument.create({
      updateMetadata: true, // Only update when necessary
      useObjectStreams: true, // More compact binary representation
      compress: true // Compress content streams
    });
    
    // Add metadata
    pdfDoc.setTitle(`Clinical Evaluation Report - ${cerData.deviceData.deviceName}`);
    pdfDoc.setAuthor('TrialSage AI');
    pdfDoc.setSubject('Clinical Evaluation Report');
    pdfDoc.setKeywords(['CER', 'Clinical Evaluation', 'Medical Device', 'Regulatory', 'EU MDR', 'MEDDEV']);
    pdfDoc.setCreator('TrialSage AI CER Generator');
    pdfDoc.setProducer('TrialSage AI CER Module v2.0.1');
    
    // Track memory at key points if debug mode enabled
    let phasedMemoryUsage = {};
    if (debugMode) {
      const postSetupMemory = process.memoryUsage();
      phasedMemoryUsage.afterSetup = {
        rss: Math.round(postSetupMemory.rss / 1024 / 1024),
        heapUsed: Math.round(postSetupMemory.heapUsed / 1024 / 1024),
        delta: Math.round((postSetupMemory.heapUsed - memoryUsage.heapUsed) / 1024 / 1024)
      };
    }
    
    // Get the standard font
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Add a cover page
    const coverPage = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = coverPage.getSize();
    
    // Track memory usage during PDF generation
    const memoryUsage = process.memoryUsage();
    console.log(`Memory usage before cover page: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`);
    
    // Add title
    coverPage.drawText('CLINICAL EVALUATION REPORT', {
      x: 150,
      y: height - 200,
      size: 24,
      font: helveticaBold,
      color: rgb(0, 0.3, 0.6)
    });
    
    // Add device name
    coverPage.drawText(`${cerData.deviceData.deviceName}`, {
      x: 150,
      y: height - 250,
      size: 18,
      font: helveticaBold
    });
    
    // Add manufacturer
    coverPage.drawText(`Manufacturer: ${cerData.deviceData.manufacturer || 'Not specified'}`, {
      x: 150,
      y: height - 280,
      size: 12,
      font: helveticaFont
    });
    
    // Add date
    coverPage.drawText(`Date: ${new Date().toLocaleDateString()}`, {
      x: 150,
      y: height - 300,
      size: 12,
      font: helveticaFont
    });
    
    // Add version
    coverPage.drawText(`Version: ${cerData.templateSettings?.version || '1.0.0'}`, {
      x: 150,
      y: height - 320,
      size: 12,
      font: helveticaFont
    });
    
    // Add report ID for traceability
    coverPage.drawText(`Report ID: ${cerData.reportId || 'Generated ' + Date.now()}`, {
      x: 150,
      y: height - 340,
      size: 12,
      font: helveticaFont
    });
    
    // Add table of contents page
    const tocPage = pdfDoc.addPage([595.28, 841.89]);
    
    tocPage.drawText('TABLE OF CONTENTS', {
      x: 50,
      y: height - 50,
      size: 16,
      font: helveticaBold,
      color: rgb(0, 0.3, 0.6)
    });
    
    // Determine page numbers based on actual sections
    let currentPage = 3; // Start after TOC page
    const tocItems = [];
    
    // Executive Summary is always first
    tocItems.push({ title: '1. Executive Summary', page: currentPage });
    currentPage += 2;
    
    // Add TOC items based on available sections
    if (cerData.cerContent?.deviceDescription) {
      tocItems.push({ title: '2. Device Description', page: currentPage });
      currentPage += calculateSectionPages(cerData.cerContent.deviceDescription, 3000);
    }
    
    if (cerData.literatureReview?.findings) {
      tocItems.push({ title: '3. Literature Review', page: currentPage });
      currentPage += calculateSectionPages(cerData.literatureReview.findings, 3500);
    }
    
    if (cerData.clinicalAnalysis?.findings) {
      tocItems.push({ title: '4. Clinical Data Analysis', page: currentPage });
      currentPage += calculateSectionPages(cerData.clinicalAnalysis.findings, 4000);
    }
    
    if (cerData.riskAssessment?.assessment) {
      tocItems.push({ title: '5. Risk Assessment', page: currentPage });
      currentPage += calculateSectionPages(cerData.riskAssessment.assessment, 3500);
    }
    
    // Always add conclusions
    tocItems.push({ title: '6. Conclusions', page: currentPage });
    currentPage += 2;
    
    // Always add appendices
    tocItems.push({ title: '7. Appendices', page: currentPage });
    
    // Draw the TOC
    tocItems.forEach((item, index) => {
      tocPage.drawText(item.title, {
        x: 50,
        y: height - 100 - (index * 20),
        size: 12,
        font: helveticaFont
      });
      
      tocPage.drawText(item.page.toString(), {
        x: 500,
        y: height - 100 - (index * 20),
        size: 12,
        font: helveticaFont
      });
      
      tocPage.drawLine({
        start: { x: 50, y: height - 102 - (index * 20) },
        end: { x: 500, y: height - 102 - (index * 20) },
        thickness: 0.5,
        color: rgb(0.9, 0.9, 0.9)
      });
    });
    
    // Add executive summary
    const summaryPage = pdfDoc.addPage([595.28, 841.89]);
    
    summaryPage.drawText('1. EXECUTIVE SUMMARY', {
      x: 50,
      y: height - 50,
      size: 16,
      font: helveticaBold,
      color: rgb(0, 0.3, 0.6)
    });
    
    // Extract the executive summary from our CER content
    let executiveSummary = "This is a placeholder for the executive summary. In a real implementation, this would contain detailed content from the AI-generated CER including key findings, methodology, and conclusions about the safety and performance of the device.";
    
    if (cerData.cerContent && cerData.cerContent.executiveSummary) {
      executiveSummary = cerData.cerContent.executiveSummary;
    }
    
    // Format and draw the executive summary text with pagination
    const textLines = wrapText(executiveSummary, 70);
    let currentLine = 0;
    let currentTextPage = summaryPage;
    const linesPerPage = Math.floor((height - 150) / 14);
    
    while (currentLine < textLines.length) {
      // How many lines can we fit on this page
      const endLine = Math.min(currentLine + linesPerPage, textLines.length);
      
      // Draw the lines for this page
      for (let i = currentLine; i < endLine; i++) {
        const y = height - 100 - ((i - currentLine) * 14);
        currentTextPage.drawText(textLines[i], {
          x: 50,
          y,
          size: 10,
          font: helveticaFont
        });
      }
      
      currentLine = endLine;
      
      // If we have more lines, add a new page
      if (currentLine < textLines.length) {
        currentTextPage = pdfDoc.addPage([595.28, 841.89]);
        currentTextPage.drawText('1. EXECUTIVE SUMMARY (continued)', {
          x: 50,
          y: height - 50,
          size: 16,
          font: helveticaBold,
          color: rgb(0, 0.3, 0.6)
        });
      }
    }
    
    // Track memory during generation
    const memoryAfterSummary = process.memoryUsage();
    console.log(`Memory usage after summary: ${Math.round(memoryAfterSummary.heapUsed / 1024 / 1024)}MB`);
    
    // In a real implementation, we would add all sections here
    // For this optimization, we'll just add page numbers
    
    // Add page numbers in batches to avoid memory pressure
    const pageCount = pdfDoc.getPageCount();
    const batchSize = 10; // Process pages in batches of 10 to avoid memory spikes
    
    for (let batchStart = 0; batchStart < pageCount; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize, pageCount);
      
      for (let i = batchStart; i < batchEnd; i++) {
        const page = pdfDoc.getPage(i);
        page.drawText(`Page ${i + 1} of ${pageCount}`, {
          x: 250,
          y: 30,
          size: 10,
          font: helveticaFont
        });
      }
      
      // If we're running in a production environment, allow some GC time
      if (process.env.NODE_ENV === 'production' && batchEnd < pageCount) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    // Log final memory usage
    const finalMemory = process.memoryUsage();
    console.log(`Final memory usage: ${Math.round(finalMemory.heapUsed / 1024 / 1024)}MB`);
    
    // Serialize to bytes with compression to reduce memory footprint
    const pdfBytes = await pdfDoc.save({ 
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: 50 // Process in small batches to avoid memory pressure
    });
    
    // Save the PDF to a temporary file
    const tempFilePath = path.join(__dirname, '../../temp', `cer-${Date.now()}.pdf`);
    const tempDir = path.dirname(tempFilePath);
    
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Write the file in chunks to avoid memory pressure
    const fileHandle = fs.openSync(tempFilePath, 'w');
    const chunkSize = 1024 * 1024; // 1MB chunks
    
    for (let i = 0; i < pdfBytes.length; i += chunkSize) {
      const chunk = pdfBytes.slice(i, Math.min(i + chunkSize, pdfBytes.length));
      fs.writeSync(fileHandle, chunk, 0, chunk.length);
    }
    
    fs.closeSync(fileHandle);
    
    return {
      filePath: tempFilePath,
      fileName: `CER-${cerData.deviceData.deviceName.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`
    };
  } catch (error) {
    console.error('Error generating CER PDF:', error);
    throw new Error(`CER PDF generation failed: ${error.message}`);
  }
}

/**
 * Helper function to wrap text for PDF rendering
 */
function wrapText(text, maxCharsPerLine) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  
  words.forEach(word => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length <= maxCharsPerLine) {
      currentLine = testLine;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  });
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines;
}

/**
 * Extract text from a PDF document for analysis
 */
async function extractTextFromPDF(pdfPath) {
  return new Promise((resolve, reject) => {
    // In a real implementation, we would extract text using a PDF library
    // For demo purposes, we're returning a mock extraction
    resolve('This is placeholder text from a PDF document. In a real implementation, this would be actual text extracted from the PDF file.');
  });
}

module.exports = {
  generateCER,
  analyzeClinicalData,
  generateLiteratureReview,
  generateRiskAssessment,
  generateFullCER,
  generateCERPDF,
  extractTextFromPDF
};