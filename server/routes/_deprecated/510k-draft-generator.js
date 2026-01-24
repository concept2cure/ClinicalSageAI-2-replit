/**
 * 510(k) Draft Generator API
 *
 * Handles the generation of complete 510(k) submission draft documents
 * based on device profiles and predicate comparisons.
 */

const express = require('express');
const router = express.Router();
const pdfService = require('../services/pdfGenerationService');
const wordService = require('../services/wordGenerationService');

/**
 * Generate a complete 510(k) draft document
 * POST /api/510k/generate-draft
 */
router.post('/generate-draft', async (req, res) => {
  try {
    const { deviceProfile, predicateDevices, options } = req.body;

    if (!deviceProfile || !deviceProfile.deviceName) {
      return res.status(400).json({
        success: false,
        message: 'Device profile is required with at least a device name',
      });
    }

    // Generate content for the 510(k) submission
    const content = await generate510kContent(deviceProfile, predicateDevices);

    // Generate document in requested format
    let documentData;
    let documentMimeType;

    if (options.outputFormat === 'docx') {
      documentData = await wordService.generateDocx(
        content,
        `510k_draft_${deviceProfile.deviceName}.docx`
      );
      documentMimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else {
      documentData = await pdfService.generatePdf(
        content,
        `510k_draft_${deviceProfile.deviceName}.pdf`
      );
      documentMimeType = 'application/pdf';
    }

    // Convert buffer to base64 for transmission
    const base64Data = documentData.toString('base64');

    res.json({
      success: true,
      documentData: base64Data,
      documentMimeType,
      documentName: `510k_draft_${deviceProfile.deviceName.replace(/\s+/g, '_')}.${options.outputFormat === 'docx' ? 'docx' : 'pdf'}`,
    });
  } catch (error) {
    console.error('Error generating 510(k) draft:', error);
    res.status(500).json({
      success: false,
      message: `Error generating 510(k) draft: ${error.message}`,
    });
  }
});

/**
 * Generate structured content for a 510(k) submission
 */
async function generate510kContent(deviceProfile, predicateDevices) {
  // Build a structured content object for the document generation services
  const content = {
    title: `510(k) PREMARKET NOTIFICATION`,
    subtitle: `For ${deviceProfile.deviceName}`,
    sections: [
      {
        title: 'Cover Letter',
        content: [
          {
            text: `Date: ${new Date().toLocaleDateString()}\n\nFood and Drug Administration\nCenter for Devices and Radiological Health\nDocument Control Center - WO66-G609\n10903 New Hampshire Avenue\nSilver Spring, MD 20993-0002\n\nRe: 510(k) Premarket Notification for ${deviceProfile.deviceName}\n\nDear Sir or Madam:\n\nWe are hereby submitting this 510(k) Premarket Notification for the ${deviceProfile.deviceName}, manufactured by ${deviceProfile.manufacturer || '[MANUFACTURER NAME]'}.\n\nWe believe that our device is substantially equivalent to [PREDICATE DEVICE NAME AND 510(k) NUMBER].`,
          },
        ],
      },
      {
        title: 'Indications for Use',
        content: [
          {
            text: `The ${deviceProfile.deviceName} is indicated for ${deviceProfile.intendedUse || '[DESCRIBE INTENDED USE HERE]'}.`,
          },
          {
            text: 'Prescription Use ___X___\nOR\nOver-The-Counter Use _______',
          },
        ],
      },
      {
        title: '510(k) Summary',
        content: [
          {
            heading: 'Submitter Information',
            text: `Manufacturer: ${deviceProfile.manufacturer || '[MANUFACTURER NAME]'}\nAddress: [MANUFACTURER ADDRESS]\nContact Person: [CONTACT PERSON NAME AND TITLE]\nPhone: [CONTACT PHONE]\nEmail: [CONTACT EMAIL]\nDate Prepared: ${new Date().toLocaleDateString()}`,
          },
          {
            heading: 'Device Information',
            text: `Device Name: ${deviceProfile.deviceName}\nCommon Name: [COMMON NAME]\nRegulation Number: [CFR REFERENCE]\nRegulation Name: [REGULATION NAME]\nRegulatory Class: ${deviceProfile.deviceClass || 'II'}\nProduct Code: [PRODUCT CODE]`,
          },
          {
            heading: 'Predicate Device(s)',
            text:
              predicateDevices && predicateDevices.length > 0
                ? `Primary Predicate: ${predicateDevices[0].deviceName} (${predicateDevices[0].kNumber || '[K NUMBER]'})`
                : 'Primary Predicate: [PREDICATE DEVICE NAME] ([K NUMBER])',
          },
          {
            heading: 'Device Description',
            text: `The ${deviceProfile.deviceName} is ${deviceProfile.description || '[PROVIDE A BRIEF DESCRIPTION OF THE DEVICE, ITS COMPONENTS, AND PRINCIPLES OF OPERATION]'}.`,
          },
          {
            heading: 'Indications for Use',
            text: `The ${deviceProfile.deviceName} is indicated for ${deviceProfile.intendedUse || '[DESCRIBE INTENDED USE HERE]'}.`,
          },
          {
            heading: 'Substantial Equivalence Discussion',
            text: 'The subject device is substantially equivalent to the predicate device in terms of intended use, technological characteristics, and performance. Any differences between the subject device and the predicate device do not raise new questions of safety and effectiveness.',
          },
        ],
      },
      {
        title: 'Substantial Equivalence Comparison',
        content: [
          {
            heading: 'Comparison Table',
            text: 'The following table provides a comparison of the subject device to the predicate device:',
          },
          {
            table: {
              headers: ['Characteristic', 'Subject Device', 'Predicate Device', 'Comparison'],
              rows:
                predicateDevices && predicateDevices.length > 0
                  ? generateComparisonRows(deviceProfile, predicateDevices[0])
                  : [
                      [
                        'Intended Use',
                        deviceProfile.intendedUse || '[INTENDED USE]',
                        '[PREDICATE INTENDED USE]',
                        'Same',
                      ],
                      [
                        'Indications for Use',
                        deviceProfile.intendedUse || '[INDICATIONS FOR USE]',
                        '[PREDICATE INDICATIONS FOR USE]',
                        'Same',
                      ],
                      ['Technology', '[SUBJECT TECHNOLOGY]', '[PREDICATE TECHNOLOGY]', 'Same'],
                      ['Materials', '[SUBJECT MATERIALS]', '[PREDICATE MATERIALS]', 'Same'],
                      ['Design', '[SUBJECT DESIGN]', '[PREDICATE DESIGN]', 'Same'],
                      ['Performance', '[SUBJECT PERFORMANCE]', '[PREDICATE PERFORMANCE]', 'Same'],
                    ],
            },
          },
        ],
      },
      {
        title: 'Performance Data',
        content: [
          {
            heading: 'Non-Clinical Testing',
            text: 'The following non-clinical tests were conducted on the subject device:\n\n• [TEST NAME 1] - [BRIEF DESCRIPTION AND RESULTS]\n• [TEST NAME 2] - [BRIEF DESCRIPTION AND RESULTS]\n• [TEST NAME 3] - [BRIEF DESCRIPTION AND RESULTS]',
          },
          {
            heading: 'Clinical Testing',
            text: 'Clinical testing [WAS/WAS NOT] performed on the subject device.',
          },
          {
            heading: 'Standards',
            text: 'The subject device conforms to the following FDA-recognized standards:\n\n• [STANDARD 1]\n• [STANDARD 2]\n• [STANDARD 3]',
          },
        ],
      },
      {
        title: 'Conclusion',
        content: [
          {
            text: `Based on the information provided in this premarket notification, the ${deviceProfile.deviceName} is substantially equivalent to the predicate device.`,
          },
        ],
      },
    ],
    footer: {
      text: `510(k) Submission for ${deviceProfile.deviceName} - Confidential`,
    },
  };

  return content;
}

/**
 * Generate comparison rows for the substantial equivalence table
 */
function generateComparisonRows(deviceProfile, predicateDevice) {
  const rows = [];

  rows.push([
    'Intended Use',
    deviceProfile.intendedUse || '[INTENDED USE]',
    predicateDevice.intendedUse || '[PREDICATE INTENDED USE]',
    'Same',
  ]);

  rows.push([
    'Indications for Use',
    deviceProfile.intendedUse || '[INDICATIONS FOR USE]',
    predicateDevice.intendedUse || '[PREDICATE INDICATIONS FOR USE]',
    'Same',
  ]);

  rows.push([
    'Device Class',
    deviceProfile.deviceClass || 'II',
    predicateDevice.deviceClass || 'II',
    deviceProfile.deviceClass === predicateDevice.deviceClass ? 'Same' : 'Different',
  ]);

  // Add additional rows for other characteristics as needed

  return rows;
}

module.exports = router;
