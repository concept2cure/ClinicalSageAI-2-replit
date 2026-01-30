import fs from 'fs';

// Read the HTML file
const filePath = 'clean_landing_page.html';
let htmlContent = fs.readFileSync(filePath, 'utf8');

// Step 1: Remove the "Why Leading Companies Choose TrialSage™" section
// This has already been done manually, but we'll double-check
let updatedHtml = htmlContent;

// Step 2: Remove the redundant Vault content organization section
const vaultContentSectionStart = '<!-- Vault content organization -->';
const vaultContentSectionEnd = '</section>';

const vaultContentStartIndex = updatedHtml.indexOf(vaultContentSectionStart);
if (vaultContentStartIndex !== -1) {
  // Find the end of the section (the first </section> after the start marker)
  const sectionEndSearchFrom = vaultContentStartIndex + vaultContentSectionStart.length;
  const vaultContentEndIndex =
    updatedHtml.indexOf(vaultContentSectionEnd, sectionEndSearchFrom) +
    vaultContentSectionEnd.length;

  if (vaultContentEndIndex > vaultContentStartIndex) {
    // Remove the section
    updatedHtml =
      updatedHtml.substring(0, vaultContentStartIndex) +
      '<!-- Removed redundant Vault content organization section -->\n    ' +
      updatedHtml.substring(vaultContentEndIndex);

    logger.info('Successfully removed Vault content organization section');
  } else {
    logger.error('Could not find the end of the Vault content organization section');
  }
} else {
  logger.info('Vault content organization section not found (may have been already removed)');
}

// Step 3: Remove the "Solution 4 - Vault Module (Condensed)" section
const vaultCondensedSectionStart = '<!-- Solution 4 - Vault Module (Condensed) -->';
const vaultCondensedSectionEnd = '</div>'; // Careful, this might match multiple divs

const vaultCondensedStartIndex = updatedHtml.indexOf(vaultCondensedSectionStart);
if (vaultCondensedStartIndex !== -1) {
  // Need to find the correct end div by counting open and close divs
  let sectionEndSearchFrom = vaultCondensedStartIndex + vaultCondensedSectionStart.length;
  let openDivs = 1; // Start with 1 because we're inside a div
  let closePos = -1;

  while (openDivs > 0) {
    let nextOpenDiv = updatedHtml.indexOf('<div', sectionEndSearchFrom);
    let nextCloseDiv = updatedHtml.indexOf('</div>', sectionEndSearchFrom);

    if (nextCloseDiv === -1) {
      logger.error('Could not find proper closing div');
      break;
    }

    if (nextOpenDiv !== -1 && nextOpenDiv < nextCloseDiv) {
      openDivs++;
      sectionEndSearchFrom = nextOpenDiv + 4;
    } else {
      openDivs--;
      closePos = nextCloseDiv;
      sectionEndSearchFrom = nextCloseDiv + 6;
    }
  }

  if (closePos > vaultCondensedStartIndex) {
    const vaultCondensedEndIndex = closePos + 6; // Length of '</div>'

    // Remove the section
    updatedHtml =
      updatedHtml.substring(0, vaultCondensedStartIndex) +
      '<!-- Removed redundant Solution 4 - Vault Module (Condensed) section -->\n                ' +
      updatedHtml.substring(vaultCondensedEndIndex);

    logger.info('Successfully removed Vault Module (Condensed) section');
  } else {
    logger.error('Could not find the proper end of the Vault Module (Condensed) section');
  }
} else {
  logger.info('Vault Module (Condensed) section not found (may have been already removed)');
}

// Step 4: Remove the Vault Intelligence System section with the "Learn More About Vault™" button
const vaultIntelligenceButtonStart = '<div style="text-align: center; margin-top: 40px;">';
const vaultIntelligenceButtonEnd = '</section>';

const vaultIntelligenceButtonStartIndex = updatedHtml.indexOf(vaultIntelligenceButtonStart);
if (vaultIntelligenceButtonStartIndex !== -1) {
  // Find the end of the section (the first </section> after the start marker)
  const buttonSectionEndSearchFrom =
    vaultIntelligenceButtonStartIndex + vaultIntelligenceButtonStart.length;
  const vaultIntelligenceButtonEndIndex =
    updatedHtml.indexOf(vaultIntelligenceButtonEnd, buttonSectionEndSearchFrom) +
    vaultIntelligenceButtonEnd.length;

  if (vaultIntelligenceButtonEndIndex > vaultIntelligenceButtonStartIndex) {
    // Remove the section
    updatedHtml =
      updatedHtml.substring(0, vaultIntelligenceButtonStartIndex) +
      '<!-- Removed redundant "Learn More About Vault™" button section -->\n            ' +
      updatedHtml.substring(vaultIntelligenceButtonEndIndex);

    logger.info('Successfully removed "Learn More About Vault™" button section');
  } else {
    logger.error('Could not find the end of the "Learn More About Vault™" button section');
  }
} else {
  logger.info(
    '"Learn More About Vault™" button section not found (may have been already removed)'
  );
}

// Step 5: Remove the "Regulatory Timeline Section" containing Vault redundancy
const regulatoryTimelineStart = '<!-- Regulatory Timeline Section -->';
const regulatoryTimelineEnd = '</section>';

const regulatoryTimelineStartIndex = updatedHtml.indexOf(regulatoryTimelineStart);
if (regulatoryTimelineStartIndex !== -1) {
  // Find the end of the section (the first </section> after the start marker)
  const timelineSectionEndSearchFrom =
    regulatoryTimelineStartIndex + regulatoryTimelineStart.length;
  const regulatoryTimelineEndIndex =
    updatedHtml.indexOf(regulatoryTimelineEnd, timelineSectionEndSearchFrom) +
    regulatoryTimelineEnd.length;

  if (regulatoryTimelineEndIndex > regulatoryTimelineStartIndex) {
    // Remove the section
    updatedHtml =
      updatedHtml.substring(0, regulatoryTimelineStartIndex) +
      '<!-- Removed redundant "Regulatory Timeline Section" -->\n    ' +
      updatedHtml.substring(regulatoryTimelineEndIndex);

    logger.info('Successfully removed "Regulatory Timeline Section"');
  } else {
    logger.error('Could not find the end of the "Regulatory Timeline Section"');
  }
} else {
  logger.info('"Regulatory Timeline Section" not found (may have been already removed)');
}

// Step 6: Remove the "Vault™ Core Advantages" section
const vaultCoreAdvantagesStart = '<!-- TrialSage Core Advantages - YPrime Style -->';
const vaultCoreAdvantagesEnd = '</section>';

const vaultCoreAdvantagesStartIndex = updatedHtml.indexOf(vaultCoreAdvantagesStart);
if (vaultCoreAdvantagesStartIndex !== -1) {
  // Find the end of the section (the first </section> after the start marker)
  const coreAdvantagesSectionEndSearchFrom =
    vaultCoreAdvantagesStartIndex + vaultCoreAdvantagesStart.length;
  const vaultCoreAdvantagesEndIndex =
    updatedHtml.indexOf(vaultCoreAdvantagesEnd, coreAdvantagesSectionEndSearchFrom) +
    vaultCoreAdvantagesEnd.length;

  if (vaultCoreAdvantagesEndIndex > vaultCoreAdvantagesStartIndex) {
    // Remove the section
    updatedHtml =
      updatedHtml.substring(0, vaultCoreAdvantagesStartIndex) +
      '<!-- Removed "Vault™ Core Advantages" section -->\n    ' +
      updatedHtml.substring(vaultCoreAdvantagesEndIndex);

    logger.info('Successfully removed "Vault™ Core Advantages" section');
  } else {
    logger.error('Could not find the end of the "Vault™ Core Advantages" section');
  }
} else {
  logger.info('"Vault™ Core Advantages" section not found (may have been already removed)');
}

// Write the updated HTML back to the file
fs.writeFileSync(filePath, updatedHtml, 'utf8');
logger.info('HTML file has been updated successfully');
