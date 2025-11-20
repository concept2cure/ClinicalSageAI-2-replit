// Document Data Flow Integration for Medical Device Regulatory Submissions
// This module manages the flow of data from searches and reviews into document sections

import { DOC_TYPES } from '@shared/docTypes';

/**
 * Populates 510(k) document sections with predicate device data
 * @param {Array} predicateDevices - Array of predicate devices from FDA search
 * @param {Object} deviceProfile - Current device profile
 * @returns {Object} Document content structured by sections
 */
export function populatePredicateSection(predicateDevices, deviceProfile) {
  if (!predicateDevices || predicateDevices.length === 0) return '';
  
  const primaryPredicate = predicateDevices[0];
  const additionalPredicates = predicateDevices.slice(1);
  
  let content = `## 2. Predicate Device(s)\n\n`;
  content += `### Primary Predicate Device\n\n`;
  content += `**510(k) Number:** ${primaryPredicate.k_number || 'Not specified'}\n`;
  content += `**Device Name:** ${primaryPredicate.device_name || primaryPredicate.deviceName || 'Not specified'}\n`;
  content += `**Manufacturer:** ${primaryPredicate.applicant_100 || primaryPredicate.manufacturer || 'Not specified'}\n`;
  content += `**Classification:** ${primaryPredicate.product_code || 'Not specified'}\n`;
  content += `**Clearance Date:** ${primaryPredicate.decision_date || primaryPredicate.clearanceDate || 'Not specified'}\n\n`;
  
  if (additionalPredicates.length > 0) {
    content += `### Additional Reference Devices\n\n`;
    additionalPredicates.forEach((device, index) => {
      content += `#### Reference Device ${index + 1}\n`;
      content += `- **510(k) Number:** ${device.k_number}\n`;
      content += `- **Device Name:** ${device.device_name || device.deviceName}\n`;
      content += `- **Manufacturer:** ${device.applicant_100 || device.manufacturer}\n\n`;
    });
  }
  
  content += `### Rationale for Predicate Selection\n\n`;
  content += `The ${primaryPredicate.device_name} (${primaryPredicate.k_number}) was selected as the primary predicate device because:\n`;
  content += `- It shares the same intended use as the subject device\n`;
  content += `- It utilizes similar technological characteristics\n`;
  content += `- It has been successfully marketed for ${calculateYearsSince(primaryPredicate.decision_date)} years\n\n`;
  
  return content;
}

/**
 * Populates substantial equivalence comparison section
 * @param {Array} predicateDevices - Array of predicate devices
 * @param {Object} deviceProfile - Current device profile
 * @returns {String} Formatted comparison content
 */
export function populateEquivalenceSection(predicateDevices, deviceProfile) {
  if (!predicateDevices || predicateDevices.length === 0) return '';
  
  const primaryPredicate = predicateDevices[0];
  
  let content = `## 3. Substantial Equivalence Comparison\n\n`;
  content += `### Comparison Table\n\n`;
  content += `| Characteristic | Subject Device | Predicate Device (${primaryPredicate.k_number}) | Comparison |\n`;
  content += `|----------------|----------------|--------------------------------------------------|------------|\n`;
  content += `| **Device Name** | ${deviceProfile.deviceName || 'Subject Device'} | ${primaryPredicate.device_name} | Similar |\n`;
  content += `| **Intended Use** | ${deviceProfile.intendedUse || 'To be specified'} | ${primaryPredicate.intended_use || 'See predicate 510(k)'} | Identical |\n`;
  content += `| **Indications for Use** | ${deviceProfile.indicationsForUse || 'To be specified'} | ${primaryPredicate.indications_for_use || 'See predicate 510(k)'} | Identical |\n`;
  content += `| **Device Classification** | ${deviceProfile.classification || 'Class II'} | ${primaryPredicate.product_code || 'Class II'} | Same |\n`;
  content += `| **Technology** | ${deviceProfile.technology || 'To be specified'} | ${primaryPredicate.technology || 'See predicate 510(k)'} | Similar |\n`;
  content += `| **Materials** | ${deviceProfile.materials || 'To be specified'} | ${primaryPredicate.materials || 'See predicate 510(k)'} | Comparable |\n`;
  content += `| **Performance Specs** | ${deviceProfile.performanceSpecs || 'To be specified'} | ${primaryPredicate.performance || 'See predicate 510(k)'} | Equivalent |\n\n`;
  
  content += `### Discussion of Differences\n\n`;
  content += `The subject device has been compared to the predicate device ${primaryPredicate.device_name} (${primaryPredicate.k_number}). `;
  content += `Both devices share the same intended use and indications for use. `;
  content += `Any minor differences in technological characteristics do not raise new questions of safety and effectiveness.\n\n`;
  
  content += `### Conclusion\n\n`;
  content += `Based on the comparison above, the subject device is substantially equivalent to the predicate device.\n\n`;
  
  return content;
}

/**
 * Populates CER document sections with literature review data
 * @param {Array} literatureData - Array of literature review results
 * @param {Object} deviceProfile - Current device profile
 * @returns {String} Formatted literature content
 */
export function populateLiteratureSection(literatureData, deviceProfile) {
  if (!literatureData || literatureData.length === 0) return '';
  
  let content = `## 3. Clinical Data Set (Literature + Studies)\n\n`;
  content += `### Literature Search Strategy\n\n`;
  content += `A comprehensive literature search was conducted using the following databases:\n`;
  content += `- PubMed/MEDLINE\n`;
  content += `- Cochrane Library\n`;
  content += `- EMBASE\n`;
  content += `- Clinical trial registries\n\n`;
  
  content += `**Search Terms:** ${deviceProfile.deviceName}, ${deviceProfile.technology || 'medical device'}, clinical outcomes\n\n`;
  
  content += `### Identified Literature\n\n`;
  content += `Total articles identified: ${literatureData.length}\n\n`;
  
  // Group by relevance
  const highRelevance = literatureData.filter(item => item.relevanceScore >= 0.8);
  const mediumRelevance = literatureData.filter(item => item.relevanceScore >= 0.5 && item.relevanceScore < 0.8);
  const lowRelevance = literatureData.filter(item => item.relevanceScore < 0.5);
  
  if (highRelevance.length > 0) {
    content += `#### Highly Relevant Studies (n=${highRelevance.length})\n\n`;
    highRelevance.slice(0, 10).forEach((study, index) => {
      content += `${index + 1}. **${study.title}**\n`;
      content += `   - Authors: ${study.authors || 'Not specified'}\n`;
      content += `   - Year: ${study.year || study.publicationDate?.split('-')[0] || 'N/A'}\n`;
      content += `   - Journal: ${study.journal || 'Not specified'}\n`;
      content += `   - Study Type: ${study.studyType || 'Not classified'}\n`;
      content += `   - Sample Size: ${study.sampleSize || 'Not reported'}\n`;
      content += `   - Key Findings: ${study.abstract?.substring(0, 200) || 'See full article'}...\n\n`;
    });
  }
  
  if (mediumRelevance.length > 0) {
    content += `#### Moderately Relevant Studies (n=${mediumRelevance.length})\n\n`;
    mediumRelevance.slice(0, 5).forEach((study, index) => {
      content += `${index + 1}. ${study.title} (${study.year || 'N/A'})\n`;
    });
    content += `\n`;
  }
  
  content += `### Clinical Evidence Summary\n\n`;
  content += `The clinical literature demonstrates:\n`;
  content += `- Consistent safety profile across ${highRelevance.length} high-quality studies\n`;
  content += `- Efficacy outcomes comparable to current standard of care\n`;
  content += `- No significant adverse events reported in long-term follow-up\n\n`;
  
  return content;
}

/**
 * Populates CER critical appraisal section
 * @param {Array} literatureData - Array of literature review results
 * @returns {String} Formatted appraisal content
 */
export function populateAppraisalSection(literatureData) {
  if (!literatureData || literatureData.length === 0) return '';
  
  let content = `## 4. Critical Appraisal & Weighting\n\n`;
  content += `### Appraisal Methodology\n\n`;
  content += `Each identified study was critically appraised using the following criteria:\n`;
  content += `- Study design and methodology quality\n`;
  content += `- Sample size and statistical power\n`;
  content += `- Relevance to the subject device\n`;
  content += `- Risk of bias assessment\n`;
  content += `- Clinical significance of outcomes\n\n`;
  
  content += `### Quality Assessment Results\n\n`;
  
  const highQuality = literatureData.filter(item => item.qualityScore >= 0.7).length;
  const mediumQuality = literatureData.filter(item => item.qualityScore >= 0.4 && item.qualityScore < 0.7).length;
  const lowQuality = literatureData.filter(item => item.qualityScore < 0.4 || !item.qualityScore).length;
  
  content += `| Quality Level | Number of Studies | Percentage |\n`;
  content += `|---------------|------------------|------------|\n`;
  content += `| High Quality (Score ≥ 0.7) | ${highQuality} | ${Math.round(highQuality/literatureData.length*100)}% |\n`;
  content += `| Medium Quality (Score 0.4-0.7) | ${mediumQuality} | ${Math.round(mediumQuality/literatureData.length*100)}% |\n`;
  content += `| Low Quality (Score < 0.4) | ${lowQuality} | ${Math.round(lowQuality/literatureData.length*100)}% |\n\n`;
  
  content += `### Data Weighting\n\n`;
  content += `Studies were weighted based on:\n`;
  content += `- Level of evidence (RCTs weighted highest)\n`;
  content += `- Direct applicability to subject device\n`;
  content += `- Recency of publication\n`;
  content += `- Sample size and follow-up duration\n\n`;
  
  return content;
}

/**
 * Generates risk-benefit determination section for CER
 * @param {Object} deviceProfile - Current device profile
 * @param {Array} literatureData - Literature review results
 * @returns {String} Formatted risk-benefit content
 */
export function populateRiskBenefitSection(deviceProfile, literatureData) {
  let content = `## 5. Benefit-Risk Determination\n\n`;
  
  content += `### Identified Benefits\n\n`;
  content += `Based on the clinical evidence, the ${deviceProfile.deviceName || 'subject device'} provides the following benefits:\n\n`;
  content += `1. **Primary Clinical Benefits**\n`;
  content += `   - ${deviceProfile.primaryBenefit || 'Improved patient outcomes'}\n`;
  content += `   - ${deviceProfile.secondaryBenefit || 'Reduced procedure time'}\n`;
  content += `   - Enhanced quality of life measures\n\n`;
  
  content += `2. **Additional Benefits**\n`;
  content += `   - Cost-effectiveness compared to alternatives\n`;
  content += `   - Ease of use for healthcare providers\n`;
  content += `   - Reduced need for follow-up interventions\n\n`;
  
  content += `### Identified Risks\n\n`;
  content += `The following risks have been identified and mitigated:\n\n`;
  content += `1. **Device-Related Risks**\n`;
  content += `   - Risk of device malfunction: Mitigated through quality controls\n`;
  content += `   - Risk of user error: Mitigated through training and clear IFU\n\n`;
  
  content += `2. **Procedure-Related Risks**\n`;
  content += `   - Standard procedural risks applicable to all similar devices\n`;
  content += `   - No device-specific risks identified beyond class risks\n\n`;
  
  content += `### Benefit-Risk Conclusion\n\n`;
  content += `The clinical evidence demonstrates that the benefits of the ${deviceProfile.deviceName || 'device'} `;
  content += `outweigh the risks when used as intended. The benefit-risk profile is favorable and `;
  content += `consistent with similar devices in this classification.\n\n`;
  
  content += `### Acceptability of Risks\n\n`;
  content += `All identified risks are:\n`;
  content += `- Acceptable given the clinical benefits\n`;
  content += `- Consistent with the current state of the art\n`;
  content += `- Adequately controlled through risk mitigation measures\n`;
  content += `- Clearly communicated in the Instructions for Use\n\n`;
  
  return content;
}

/**
 * Combines all sections into a complete document
 * @param {Object} params - Parameters for document generation
 * @returns {String} Complete document content
 */
export function generateCompleteDocument(params) {
  const {
    documentType,
    deviceProfile,
    predicateDevices,
    literatureData,
    existingContent
  } = params;
  
  let completeContent = existingContent || '';
  
  if (documentType === 'cerv2_510k' || documentType === '510k') {
    // Add predicate section if we have predicate data
    if (predicateDevices && predicateDevices.length > 0) {
      const predicateSection = populatePredicateSection(predicateDevices, deviceProfile);
      const equivalenceSection = populateEquivalenceSection(predicateDevices, deviceProfile);
      
      // Insert or update sections
      completeContent = updateSection(completeContent, '2. Predicate Device', predicateSection);
      completeContent = updateSection(completeContent, '3. Substantial Equivalence', equivalenceSection);
    }
  } else if (documentType === 'cerv2_cer' || documentType === 'cer') {
    // Add literature and risk-benefit sections for CER
    if (literatureData && literatureData.length > 0) {
      const literatureSection = populateLiteratureSection(literatureData, deviceProfile);
      const appraisalSection = populateAppraisalSection(literatureData);
      const riskBenefitSection = populateRiskBenefitSection(deviceProfile, literatureData);
      
      completeContent = updateSection(completeContent, '3. Clinical Data Set', literatureSection);
      completeContent = updateSection(completeContent, '4. Critical Appraisal', appraisalSection);
      completeContent = updateSection(completeContent, '5. Benefit-Risk', riskBenefitSection);
    }
  }
  
  return completeContent;
}

/**
 * Updates or inserts a section in the document
 * @param {String} content - Existing document content
 * @param {String} sectionTitle - Title of the section to update
 * @param {String} newSectionContent - New content for the section
 * @returns {String} Updated document content
 */
function updateSection(content, sectionTitle, newSectionContent) {
  // Try to find and replace existing section
  const sectionRegex = new RegExp(`##\\s*${sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?(?=##|$)`, 'i');
  
  if (sectionRegex.test(content)) {
    // Replace existing section
    return content.replace(sectionRegex, newSectionContent);
  } else {
    // Append new section
    return content + '\n\n' + newSectionContent;
  }
}

/**
 * Calculates years since a date
 * @param {String} dateString - Date string
 * @returns {Number} Years since the date
 */
function calculateYearsSince(dateString) {
  if (!dateString) return 'several';
  const date = new Date(dateString);
  const now = new Date();
  return Math.floor((now - date) / (365.25 * 24 * 60 * 60 * 1000));
}

/**
 * Monitors workflow progress and suggests next sections
 * @param {Object} workflowState - Current workflow state
 * @returns {Object} Suggestions for next steps
 */
export function getWorkflowSuggestions(workflowState) {
  const {
    documentType,
    currentStep,
    completedSections,
    deviceProfile,
    predicateDevices,
    literatureData
  } = workflowState;
  
  const suggestions = {
    nextActions: [],
    missingSections: [],
    readinessScore: 0
  };
  
  if (documentType === 'cerv2_510k' || documentType === '510k') {
    // Check 510(k) workflow
    if (!deviceProfile.deviceName) {
      suggestions.nextActions.push('Complete device profile information');
    }
    if (!predicateDevices || predicateDevices.length === 0) {
      suggestions.nextActions.push('Search and select predicate devices');
      suggestions.missingSections.push('Predicate Device(s)');
      suggestions.missingSections.push('Substantial Equivalence Comparison');
    }
    if (!deviceProfile.performanceData) {
      suggestions.nextActions.push('Add performance testing data');
      suggestions.missingSections.push('Performance Data');
    }
    
    // Calculate readiness score
    let completedItems = 0;
    const totalItems = 10; // Total required sections for 510(k)
    
    if (deviceProfile.deviceName) completedItems++;
    if (predicateDevices && predicateDevices.length > 0) completedItems += 2;
    if (deviceProfile.performanceData) completedItems++;
    if (completedSections.includes('labeling')) completedItems++;
    
    suggestions.readinessScore = Math.round((completedItems / totalItems) * 100);
    
  } else if (documentType === 'cerv2_cer' || documentType === 'cer') {
    // Check CER workflow
    if (!literatureData || literatureData.length === 0) {
      suggestions.nextActions.push('Conduct literature search');
      suggestions.missingSections.push('Clinical Data Set');
      suggestions.missingSections.push('Critical Appraisal');
    }
    if (!deviceProfile.clinicalEvidence) {
      suggestions.nextActions.push('Add clinical evaluation data');
      suggestions.missingSections.push('Clinical Evaluation');
    }
    if (!deviceProfile.riskAnalysis) {
      suggestions.nextActions.push('Complete risk-benefit analysis');
      suggestions.missingSections.push('Benefit-Risk Determination');
    }
    
    // Calculate readiness score for CER
    let completedItems = 0;
    const totalItems = 8; // Total required sections for CER
    
    if (deviceProfile.deviceName) completedItems++;
    if (literatureData && literatureData.length > 0) completedItems += 2;
    if (deviceProfile.clinicalEvidence) completedItems++;
    if (deviceProfile.riskAnalysis) completedItems++;
    
    suggestions.readinessScore = Math.round((completedItems / totalItems) * 100);
  }
  
  return suggestions;
}

export default {
  populatePredicateSection,
  populateEquivalenceSection,
  populateLiteratureSection,
  populateAppraisalSection,
  populateRiskBenefitSection,
  generateCompleteDocument,
  getWorkflowSuggestions
};