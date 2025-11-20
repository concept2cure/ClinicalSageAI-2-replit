/**
 * Landing Page Reorganization Script
 *
 * This script reorganizes the TrialSage landing page content according to
 * pharmaceutical industry workflow, ensuring a logical flow from study design
 * through regulatory submissions.
 */

import fs from 'fs';

// File paths
const landingPagePath = 'clean_landing_page.html';

// Read the landing page HTML
const html = fs.readFileSync(landingPagePath, 'utf8');

// Function to extract a section from HTML
function extractSection(html, startMarker, endMarker = '</section>') {
  const startIndex = html.indexOf(startMarker);
  if (startIndex === -1) return { section: '', found: false };

  const searchFrom = startIndex + startMarker.length;
  let endIndex = html.indexOf(endMarker, searchFrom);

  // If end marker not found, look for next section
  if (endIndex === -1) {
    endIndex = html.indexOf('<!-- ', searchFrom);
  }

  if (endIndex === -1) return { section: '', found: false };

  // Include the end marker in the extracted section
  endIndex += endMarker.length;

  return {
    section: html.substring(startIndex, endIndex),
    found: true,
  };
}

// Function to remove a section from HTML
function removeSection(html, startMarker, endMarker = '</section>') {
  const { section, found } = extractSection(html, startMarker, endMarker);
  if (!found) return html;

  return html.replace(section, '');
}

// Extract header and hero sections (keep at top)
const headerSection = extractSection(
  html,
  '<!-- YPrime-style Header - Exact Copy -->',
  '<!-- Hero Section -->'
).section;
const heroSection = extractSection(
  html,
  '<!-- Hero Section -->',
  '<!-- Solutions Section -->'
).section;

// Extract footer section (keep at bottom)
const footerStartMarker = '<!-- CTA Section - YPrime Style -->';
const footerEndMarker = '</html>';
const footerSection = extractSection(html, footerStartMarker, footerEndMarker).section;

// Extract all module sections
// 1. Study/Protocol Designer (Protocol Design)
const protocolDesignerSection = extractSection(
  html,
  '<!-- Solution 5: Study/Protocol Designer -->',
  '</div>'
).section;
const studyArchitectSection = extractSection(
  html,
  '<!-- Module 4: Study Architect -->',
  '</div>'
).section;

// 2. ICH Wiz (Compliance)
const ichWizSection = extractSection(html, '<!-- Solution 9: ICH Wiz -->', '</div>').section;
const ichWizModuleSection = extractSection(html, '<!-- Module 5: ICH Wiz -->', '</div>').section;
const ichGuidelinesSection = extractSection(
  html,
  '<!-- ICH Guidelines Section -->',
  '</div>'
).section;

// 3. IND Wizard
const indWizardSection = extractSection(html, '<!-- Solution 2: IND Wizard -->', '</div>').section;
const indWizardModuleSection = extractSection(
  html,
  '<!-- Module 3: IND Wizard -->',
  '</div>'
).section;

// 4. CMC Automation
const cmcAutomationSection = extractSection(
  html,
  '<!-- Solution 3: CMC Automation Module -->',
  '</div>'
).section;
const cmcBlueprintSection = extractSection(
  html,
  '<!-- AI-CMC Blueprint Generator - YPrime Style -->',
  '</section>'
).section;

// 5. CSR Intelligence
const csrIntelligenceSection = extractSection(
  html,
  '<!-- Solution 1: CSR Intelligence -->',
  '</div>'
).section;
const csrIntelligenceModuleSection = extractSection(
  html,
  '<!-- Module 2: CSR Intelligence -->',
  '</div>'
).section;

// 6. CER Generator
const cerGeneratorSection = extractSection(
  html,
  '<!-- Solution 4: CER Generator -->',
  '</div>'
).section;

// 7. Regulatory Timeline
const regulatoryTimelineSection = extractSection(
  html,
  '<!-- Solution 6: Regulatory Timeline -->',
  '</div>'
).section;
const submissionPipelineSection = extractSection(
  html,
  '<!-- Submission Pipeline -->',
  '</div>'
).section;

// 8. TrialSage Vault
const trialSageVaultSection = extractSection(
  html,
  '<!-- Key Feature Section with No Whitespace -->',
  '</section>'
).section;
const tsvLiteSection = extractSection(html, '<!-- Module 1: TSV Lite -->', '</div>').section;

// 9. AI & Security
const aiSecuritySection = extractSection(
  html,
  '<!-- Module 6: AI & Security -->',
  '</div>'
).section;
const aiRegulatoryAssistantSection = extractSection(
  html,
  '<!-- AI Regulatory Assistant Section -->',
  '</div>'
).section;

// 10. Testimonials
const testimonialsSection = extractSection(
  html,
  '<!-- Testimonials Section - YPrime Style -->',
  '</section>'
).section;

// Main content area (to be replaced)
const mainContentStartMarker = '<!-- Solutions Section -->';
const mainContentEndMarker = '<!-- CTA Section - YPrime Style -->';
const { section: mainContentSection } = extractSection(
  html,
  mainContentStartMarker,
  mainContentEndMarker
);

// Build the reorganized content in logical workflow order
let reorganizedContent = `
<!-- Solutions Section -->
<section class="solutions-section">
    <div class="container">
        <h2 class="section-title">Our Solutions</h2>
        <p class="section-description">TrialSage™ offers a comprehensive suite of AI-powered modules that follow the natural clinical development workflow:</p>
        
        <div class="solutions-grid">
            <!-- WORKFLOW STEP 1: STUDY DESIGN -->
            <div class="workflow-stage">
                <h3 class="workflow-title">1. Study Design & Planning</h3>
                <div class="workflow-modules">
                    ${protocolDesignerSection}
                    ${studyArchitectSection}
                </div>
            </div>

            <!-- WORKFLOW STEP 2: REGULATORY COMPLIANCE -->
            <div class="workflow-stage">
                <h3 class="workflow-title">2. Regulatory Compliance</h3>
                <div class="workflow-modules">
                    ${ichWizSection}
                    ${ichWizModuleSection}
                    ${ichGuidelinesSection}
                </div>
            </div>

            <!-- WORKFLOW STEP 3: IND SUBMISSION -->
            <div class="workflow-stage">
                <h3 class="workflow-title">3. IND Submission</h3>
                <div class="workflow-modules">
                    ${indWizardSection}
                    ${indWizardModuleSection}
                    ${cmcAutomationSection}
                </div>
            </div>
            
            <!-- WORKFLOW STEP 4: CMC MODULE -->
            <div class="workflow-stage">
                <h3 class="workflow-title">4. Chemistry, Manufacturing, and Controls (CMC)</h3>
                <div class="workflow-modules">
                    ${cmcBlueprintSection}
                </div>
            </div>

            <!-- WORKFLOW STEP 5: STUDY EXECUTION & REPORTING -->
            <div class="workflow-stage">
                <h3 class="workflow-title">5. Study Execution & Reporting</h3>
                <div class="workflow-modules">
                    ${csrIntelligenceSection}
                    ${csrIntelligenceModuleSection}
                    ${cerGeneratorSection}
                </div>
            </div>

            <!-- WORKFLOW STEP 6: REGULATORY SUBMISSIONS -->
            <div class="workflow-stage">
                <h3 class="workflow-title">6. Regulatory Submissions & Timeline Management</h3>
                <div class="workflow-modules">
                    ${regulatoryTimelineSection}
                    ${submissionPipelineSection}
                </div>
            </div>

            <!-- PLATFORM FOUNDATION: DOCUMENT MANAGEMENT -->
            <div class="workflow-stage">
                <h3 class="workflow-title">Platform Foundation: Intelligent Document Management</h3>
                <div class="workflow-modules">
                    ${trialSageVaultSection}
                    ${tsvLiteSection}
                </div>
            </div>

            <!-- AI & SECURITY -->
            <div class="workflow-stage">
                <h3 class="workflow-title">AI & Security</h3>
                <div class="workflow-modules">
                    ${aiSecuritySection}
                    ${aiRegulatoryAssistantSection}
                </div>
            </div>
        </div>
    </div>
</section>

<!-- Client Testimonials -->
${testimonialsSection}
`;

// Replace the main content with reorganized content
let updatedHtml = html.replace(mainContentSection, reorganizedContent);

// Add CSS for the new layout
const newCss = `
<style>
    .workflow-stage {
        margin-bottom: 40px;
        border-bottom: 1px solid #eaeaea;
        padding-bottom: 30px;
    }
    
    .workflow-title {
        font-size: 24px;
        color: #0056b3;
        margin-bottom: 20px;
        position: relative;
        padding-left: 15px;
        border-left: 4px solid var(--primary);
    }
    
    .workflow-modules {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 20px;
    }
    
    @media (max-width: 768px) {
        .workflow-modules {
            grid-template-columns: 1fr;
        }
    }
    
    .section-description {
        text-align: center;
        font-size: 18px;
        margin-bottom: 40px;
        max-width: 800px;
        margin-left: auto;
        margin-right: auto;
    }
</style>
`;

// Insert new CSS after existing styles
updatedHtml = updatedHtml.replace('</style>', '</style>\n' + newCss);

// Write the reorganized HTML back to the file
fs.writeFileSync('reorganized_landing_page.html', updatedHtml, 'utf8');

console.log('Landing page reorganized successfully!');
console.log('New file created: reorganized_landing_page.html');
