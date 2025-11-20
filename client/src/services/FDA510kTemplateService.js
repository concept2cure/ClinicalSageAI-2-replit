/**
 * FDA 510(k) Template Service
 * 
 * Provides comprehensive templates, regulatory guidance, and boilerplate content
 * for each section of an FDA 510(k) submission as per FDA guidance documents
 */

class FDA510kTemplateService {
  constructor() {
    this.templates = this.initializeTemplates();
  }

  initializeTemplates() {
    return {
      '1.0': {
        title: 'Medical Device User Fee Cover Sheet',
        template: `
<h2>Medical Device User Fee Cover Sheet (FDA Form 3601)</h2>

<h3>Applicant Information</h3>
<p><strong>Applicant Name:</strong> [Company Name]</p>
<p><strong>Address:</strong> [Street Address]</p>
<p><strong>City, State, ZIP:</strong> [City, State ZIP]</p>
<p><strong>Phone:</strong> [Phone Number]</p>
<p><strong>Email:</strong> [Email Address]</p>
<p><strong>DUNS Number:</strong> [DUNS Number]</p>

<h3>Device Information</h3>
<p><strong>Device Trade Name:</strong> [Device Name]</p>
<p><strong>Device Classification:</strong> Class II</p>
<p><strong>Product Code:</strong> [3-letter FDA Product Code]</p>
<p><strong>Regulation Number:</strong> 21 CFR [XXX.XXXX]</p>

<h3>Fee Information</h3>
<p><strong>Fee Type:</strong> 510(k) Premarket Notification</p>
<p><strong>Amount:</strong> $[Current FDA Fee Amount]</p>
<p><strong>Payment Method:</strong> [Check/Wire Transfer/Credit Card]</p>
<p><strong>Payment Confirmation Number:</strong> [Confirmation Number]</p>

<h3>Small Business Determination</h3>
<p>☐ Standard Fee Applicant</p>
<p>☐ Small Business (Qualified for reduced fee)</p>
<p>☐ First-time 510(k) Submitter (Qualified for waiver)</p>
`,
        guidance: 'Complete FDA Form 3601. Include proof of payment. Small businesses with <$100M in gross receipts may qualify for reduced fees.',
        required: true,
        regulations: ['21 CFR 807.87', 'MDUFA V']
      },
      
      '2.0': {
        title: 'Table of Contents',
        template: `
<h2>Table of Contents</h2>

<p>1.0 Medical Device User Fee Cover Sheet ........................... Page [X]</p>
<p>2.0 Table of Contents ................................................ Page [X]</p>
<p>3.0 510(k) Cover Letter .............................................. Page [X]</p>
<p>4.0 Indications for Use Statement .................................... Page [X]</p>
<p>5.0 510(k) Summary or Statement ...................................... Page [X]</p>
<p>6.0 Truthful and Accuracy Statement .................................. Page [X]</p>
<p>7.0 Device Description ............................................... Page [X]</p>
<p>8.0 Executive Summary ................................................ Page [X]</p>
<p>9.0 Substantial Equivalence Comparison ............................... Page [X]</p>
<p>10.0 Proposed Labeling ............................................... Page [X]</p>
<p>11.0 Sterilization and Shelf Life ................................... Page [X]</p>
<p>12.0 Biocompatibility ................................................ Page [X]</p>
<p>13.0 Software ........................................................ Page [X]</p>
<p>14.0 Electromagnetic Compatibility (EMC) ............................ Page [X]</p>
<p>15.0 Performance Testing - Bench .................................... Page [X]</p>
<p>16.0 Performance Testing - Animal .................................... Page [X]</p>
<p>17.0 Performance Testing - Clinical .................................. Page [X]</p>
<p>18.0 Other ......................................................... Page [X]</p>

<h3>Appendices</h3>
<p>Appendix A: Predicate Device Labeling</p>
<p>Appendix B: Test Reports</p>
<p>Appendix C: Standards Compliance Documentation</p>
`,
        guidance: 'Include all sections and appendices with accurate page numbers. Update before final submission.',
        required: true,
        regulations: ['FDA Guidance: Format for Traditional and Abbreviated 510(k)s']
      },

      '3.0': {
        title: '510(k) Cover Letter',
        template: `
<h2>510(k) Cover Letter</h2>

<p>[Date]</p>

<p>Food and Drug Administration</p>
<p>Center for Devices and Radiological Health</p>
<p>Document Control Center - WO66-G609</p>
<p>10903 New Hampshire Avenue</p>
<p>Silver Spring, MD 20993-0002</p>

<p><strong>Re: 510(k) Premarket Notification for [Device Trade Name]</strong></p>

<p>Dear Review Team,</p>

<p>We are pleased to submit this 510(k) premarket notification for [Device Trade Name]. This submission demonstrates substantial equivalence to the predicate device [Predicate Device Name, K Number].</p>

<h3>Submission Type</h3>
<p>☐ Traditional 510(k)</p>
<p>☐ Special 510(k)</p>
<p>☐ Abbreviated 510(k)</p>

<h3>Device Information</h3>
<p><strong>Trade Name:</strong> [Device Name]</p>
<p><strong>Common Name:</strong> [Common Name]</p>
<p><strong>Classification Name:</strong> [Classification]</p>
<p><strong>Classification Regulation:</strong> 21 CFR [XXX.XXXX]</p>
<p><strong>Product Code:</strong> [3-letter code]</p>
<p><strong>Panel:</strong> [Medical Specialty Panel]</p>

<h3>Predicate Device</h3>
<p><strong>Trade Name:</strong> [Predicate Device Name]</p>
<p><strong>Manufacturer:</strong> [Predicate Manufacturer]</p>
<p><strong>510(k) Number:</strong> K[XXXXXX]</p>
<p><strong>Clearance Date:</strong> [MM/DD/YYYY]</p>

<h3>Performance Standards</h3>
<p>This device complies with the following consensus standards:</p>
<ul>
  <li>ISO 13485:2016 - Medical devices - Quality management systems</li>
  <li>IEC 60601-1:2005+AMD1:2012 - Medical electrical equipment safety</li>
  <li>ISO 10993-1:2018 - Biological evaluation of medical devices</li>
  <li>[Additional applicable standards]</li>
</ul>

<h3>Clinical Studies</h3>
<p>☐ Clinical data are included in this submission</p>
<p>☐ Clinical data are not necessary for this submission</p>

<h3>Contact Information</h3>
<p><strong>Primary Contact:</strong> [Name, Title]</p>
<p><strong>Phone:</strong> [Phone Number]</p>
<p><strong>Email:</strong> [Email Address]</p>

<p><strong>Regulatory Consultant (if applicable):</strong></p>
<p>[Consultant Name and Contact Information]</p>

<p>We believe this submission is complete and look forward to FDA's review. Please contact us if you require any additional information.</p>

<p>Sincerely,</p>
<p>[Signature]</p>
<p>[Name]</p>
<p>[Title]</p>
`,
        guidance: 'The cover letter introduces your submission and highlights key information. Be clear and concise.',
        required: true,
        regulations: ['21 CFR 807.87(a)']
      },

      '4.0': {
        title: 'Indications for Use Statement',
        template: `
<h2>Indications for Use Statement</h2>

<div style="border: 2px solid #000; padding: 20px; margin: 20px 0;">
<p><strong>510(k) Number (if known):</strong> K_______</p>

<p><strong>Device Name:</strong> [Device Trade Name]</p>

<p><strong>Indications for Use:</strong></p>

<p>[Provide a clear, precise statement of the indications for use of the device. This must match exactly what will appear in the device labeling.]</p>

<p><strong>Example Format:</strong></p>
<p>The [Device Name] is indicated for use in [patient population] for [specific medical purpose/condition]. The device is intended to [specific function] in patients who [specific criteria].</p>

<p><strong>Prescription Use ✓</strong> (Part 21 CFR 801 Subpart D)</p>
<p><strong>OR</strong></p>
<p><strong>Over-The-Counter Use ___</strong> (Part 21 CFR 801 Subpart C)</p>

<p><strong>PLEASE DO NOT WRITE BELOW THIS LINE - CONTINUE ON A SEPARATE PAGE IF NEEDED</strong></p>
<hr/>
<p style="color: gray;">For FDA Use Only</p>
<p style="color: gray;">Concurrence of Center for Devices and Radiological Health (CDRH)</p>
</div>

<h3>Comparison with Predicate Device</h3>
<table border="1" cellpadding="5" style="width: 100%; border-collapse: collapse;">
  <tr>
    <th>Aspect</th>
    <th>Subject Device</th>
    <th>Predicate Device (K[XXXXXX])</th>
  </tr>
  <tr>
    <td>Indications for Use</td>
    <td>[Subject device indications]</td>
    <td>[Predicate device indications]</td>
  </tr>
  <tr>
    <td>Patient Population</td>
    <td>[Target population]</td>
    <td>[Predicate population]</td>
  </tr>
  <tr>
    <td>Disease/Condition</td>
    <td>[Conditions addressed]</td>
    <td>[Predicate conditions]</td>
  </tr>
</table>
`,
        guidance: 'The indications for use must be identical to or narrower than the predicate device. Any expansion requires clinical data.',
        required: true,
        regulations: ['21 CFR 807.87(e)', 'FDA Form 3881']
      },

      '5.0': {
        title: '510(k) Summary',
        template: `
<h2>510(k) Summary</h2>
<p><em>Prepared in accordance with 21 CFR 807.92</em></p>

<h3>Date Prepared</h3>
<p>[Current Date]</p>

<h3>Submitter Information</h3>
<p><strong>Company Name:</strong> [Company Name]</p>
<p><strong>Address:</strong> [Complete Address]</p>
<p><strong>Contact Person:</strong> [Name, Title]</p>
<p><strong>Phone:</strong> [Phone Number]</p>
<p><strong>Fax:</strong> [Fax Number]</p>
<p><strong>Email:</strong> [Email Address]</p>

<h3>Device Identification</h3>
<p><strong>Trade/Proprietary Name:</strong> [Device Name]</p>
<p><strong>Common/Usual Name:</strong> [Common Name]</p>
<p><strong>Classification Name:</strong> [Classification per 21 CFR]</p>
<p><strong>Regulatory Class:</strong> Class II</p>
<p><strong>Product Code:</strong> [3-letter FDA code]</p>

<h3>Predicate Device</h3>
<p><strong>Trade Name:</strong> [Predicate Device Name]</p>
<p><strong>Manufacturer:</strong> [Manufacturer Name]</p>
<p><strong>510(k) Number:</strong> K[XXXXXX]</p>
<p><strong>Clearance Date:</strong> [Date]</p>

<h3>Device Description</h3>
<p>[Provide a detailed description of the device, including:]</p>
<ul>
  <li>Physical characteristics (dimensions, weight, materials)</li>
  <li>Functional characteristics (how it works, key features)</li>
  <li>Technical specifications (operating parameters, performance specs)</li>
  <li>Principles of operation</li>
  <li>Key components and their functions</li>
</ul>

<h3>Indications for Use</h3>
<p>[Copy exact statement from Section 4.0]</p>

<h3>Technological Characteristics Comparison</h3>
<table border="1" cellpadding="5" style="width: 100%; border-collapse: collapse;">
  <tr>
    <th>Feature</th>
    <th>Subject Device</th>
    <th>Predicate Device</th>
    <th>Discussion</th>
  </tr>
  <tr>
    <td>Intended Use</td>
    <td>[Description]</td>
    <td>[Description]</td>
    <td>[Same/Similar]</td>
  </tr>
  <tr>
    <td>Technology</td>
    <td>[Description]</td>
    <td>[Description]</td>
    <td>[Comparison]</td>
  </tr>
  <tr>
    <td>Materials</td>
    <td>[Materials used]</td>
    <td>[Materials used]</td>
    <td>[Biocompatibility]</td>
  </tr>
  <tr>
    <td>Design Features</td>
    <td>[Key features]</td>
    <td>[Key features]</td>
    <td>[Similarities/Differences]</td>
  </tr>
</table>

<h3>Performance Data</h3>
<p><strong>Non-Clinical Performance Testing:</strong></p>
<ul>
  <li><strong>Bench Testing:</strong> [Summary of mechanical, electrical, software testing]</li>
  <li><strong>Biocompatibility:</strong> Testing per ISO 10993-1 demonstrated [results]</li>
  <li><strong>Sterilization:</strong> Validated per ISO 11137 for [method]</li>
  <li><strong>Shelf Life:</strong> [Duration] stability demonstrated through accelerated aging</li>
  <li><strong>Software Verification:</strong> [If applicable, summary of V&V testing]</li>
</ul>

<p><strong>Clinical Performance Testing:</strong></p>
<p>[If applicable, provide summary of clinical studies, or state "Clinical testing was not required for this submission."]</p>

<h3>Standards Conformity</h3>
<p>The following consensus standards were applied:</p>
<ul>
  <li>ISO 13485:2016 - Quality Management Systems</li>
  <li>IEC 60601-1:2005+A1:2012 - Medical Electrical Equipment Safety</li>
  <li>ISO 10993-1:2018 - Biological Evaluation</li>
  <li>[Additional standards as applicable]</li>
</ul>

<h3>Substantial Equivalence Conclusion</h3>
<p>The [Device Name] has the same intended use and similar technological characteristics as the predicate device. The minor differences in [specify differences] do not raise new questions of safety and effectiveness. Performance testing demonstrates that the device performs as well as or better than the predicate device. Therefore, the [Device Name] is substantially equivalent to the predicate device [Predicate Name, K Number].</p>
`,
        guidance: 'The 510(k) Summary is publicly available. Ensure all information is accurate and non-confidential.',
        required: true,
        regulations: ['21 CFR 807.92']
      },

      '6.0': {
        title: 'Truthful and Accuracy Statement',
        template: `
<h2>Truthful and Accuracy Statement</h2>

<p>I certify that, in my capacity as [Title] of [Company Name], I believe to the best of my knowledge, that all data and information submitted in this premarket notification are truthful and accurate and that no material fact has been omitted.</p>

<p>I am aware that there are criminal penalties for making false statements to the government, including the possibility of fine and imprisonment (18 U.S.C. 1001).</p>

<p><strong>Signature:</strong> _________________________</p>
<p><strong>Printed Name:</strong> [Name]</p>
<p><strong>Title:</strong> [Title]</p>
<p><strong>Company:</strong> [Company Name]</p>
<p><strong>Date:</strong> [Date]</p>

<hr style="margin: 40px 0;"/>

<h3>Certification Statement for Premarket Notification</h3>

<p>I certify that [Company Name] will make available all information included in this premarket notification on safety and effectiveness within 30 days of a request from any person if the device described in this premarket notification is determined to be substantially equivalent. The information I agree to make available will be a duplicate of the premarket notification including any adverse safety and effectiveness data, but excluding all patient identifiers, trade secret, and confidential commercial information, as defined in 21 CFR 20.61.</p>

<p><strong>Signature:</strong> _________________________</p>
<p><strong>Date:</strong> [Date]</p>
`,
        guidance: 'This must be signed by a responsible person with authority to bind the company.',
        required: true,
        regulations: ['21 CFR 807.87(j)']
      },

      '7.0': {
        title: 'Device Description',
        template: `
<h2>Device Description</h2>

<h3>Device Overview</h3>
<p>[Provide comprehensive description of your device]</p>

<h3>Physical Characteristics</h3>
<ul>
  <li><strong>Dimensions:</strong> [Length x Width x Height]</li>
  <li><strong>Weight:</strong> [Weight with units]</li>
  <li><strong>Color:</strong> [Color(s)]</li>
  <li><strong>Shape:</strong> [Physical form]</li>
</ul>

<h3>Materials of Construction</h3>
<table border="1" cellpadding="5" style="width: 100%; border-collapse: collapse;">
  <tr>
    <th>Component</th>
    <th>Material</th>
    <th>Patient Contact</th>
    <th>Contact Duration</th>
    <th>Standard/Grade</th>
  </tr>
  <tr>
    <td>[Component 1]</td>
    <td>[Material specification]</td>
    <td>[Yes/No]</td>
    <td>[Duration if applicable]</td>
    <td>[Medical grade/standard]</td>
  </tr>
</table>

<h3>Functional Components</h3>
<p>[Describe each major component and its function]</p>
<ol>
  <li><strong>[Component 1]:</strong> [Function and description]</li>
  <li><strong>[Component 2]:</strong> [Function and description]</li>
  <li><strong>[Component 3]:</strong> [Function and description]</li>
</ol>

<h3>Principles of Operation</h3>
<p>[Explain how the device works, including:]</p>
<ul>
  <li>Scientific principles utilized</li>
  <li>Mechanism of action</li>
  <li>Energy source (if applicable)</li>
  <li>User interface and controls</li>
  <li>Output characteristics</li>
</ul>

<h3>Technical Specifications</h3>
<table border="1" cellpadding="5" style="width: 100%; border-collapse: collapse;">
  <tr>
    <th>Parameter</th>
    <th>Specification</th>
    <th>Tolerance</th>
    <th>Units</th>
  </tr>
  <tr>
    <td>[Parameter 1]</td>
    <td>[Value]</td>
    <td>[±Tolerance]</td>
    <td>[Units]</td>
  </tr>
</table>

<h3>Software Overview (if applicable)</h3>
<p><strong>Software Level of Concern:</strong> [Minor/Moderate/Major]</p>
<p><strong>Software Version:</strong> [Version Number]</p>
<p><strong>Key Functions:</strong></p>
<ul>
  <li>[Function 1]</li>
  <li>[Function 2]</li>
  <li>[Function 3]</li>
</ul>

<h3>Accessories and Compatible Devices</h3>
<p>[List any accessories or devices used with your device]</p>

<h3>Device Images</h3>
<p>[Include photographs/diagrams showing:]</p>
<ul>
  <li>Overall device appearance</li>
  <li>Key components</li>
  <li>User interface/controls</li>
  <li>Packaging</li>
</ul>

<h3>Manufacturing Information</h3>
<p><strong>Manufacturing Site:</strong> [Address]</p>
<p><strong>Quality System:</strong> ISO 13485:2016 certified</p>
<p><strong>Manufacturing Process:</strong> [Brief overview]</p>
`,
        guidance: 'Provide enough detail for FDA to understand your device completely. Include engineering drawings if helpful.',
        required: true,
        regulations: ['21 CFR 807.87(f)']
      },

      '8.0': {
        title: 'Executive Summary',
        template: `
<h2>Executive Summary</h2>

<h3>Overview</h3>
<p>This 510(k) submission demonstrates that the [Device Name] is substantially equivalent to the legally marketed predicate device [Predicate Name, K Number]. Both devices share the same intended use and similar technological characteristics.</p>

<h3>Intended Use/Indications for Use</h3>
<p>[Restate the intended use and indications]</p>

<h3>Technology Comparison Summary</h3>
<p>The subject and predicate devices utilize similar technology to achieve the same clinical outcome. Key similarities include:</p>
<ul>
  <li>[Similarity 1]</li>
  <li>[Similarity 2]</li>
  <li>[Similarity 3]</li>
</ul>

<p>Minor differences that do not affect safety or effectiveness:</p>
<ul>
  <li>[Difference 1 and why it doesn't matter]</li>
  <li>[Difference 2 and why it doesn't matter]</li>
</ul>

<h3>Performance Testing Summary</h3>
<table border="1" cellpadding="5" style="width: 100%; border-collapse: collapse;">
  <tr>
    <th>Test Category</th>
    <th>Standards/Methods</th>
    <th>Results</th>
    <th>Conclusion</th>
  </tr>
  <tr>
    <td>Mechanical Testing</td>
    <td>[Standards used]</td>
    <td>[Pass/Fail metrics]</td>
    <td>Meets requirements</td>
  </tr>
  <tr>
    <td>Electrical Safety</td>
    <td>IEC 60601-1</td>
    <td>[Results]</td>
    <td>Compliant</td>
  </tr>
  <tr>
    <td>Biocompatibility</td>
    <td>ISO 10993 series</td>
    <td>[Results]</td>
    <td>Biocompatible</td>
  </tr>
  <tr>
    <td>Software V&V</td>
    <td>IEC 62304</td>
    <td>[If applicable]</td>
    <td>Validated</td>
  </tr>
</table>

<h3>Clinical Data Summary (if applicable)</h3>
<p>[Provide brief summary of clinical data or state not applicable]</p>

<h3>Substantial Equivalence Rationale</h3>
<ol>
  <li><strong>Same Intended Use:</strong> Both devices are intended for [use]</li>
  <li><strong>Similar Technology:</strong> Both devices use [technology]</li>
  <li><strong>Similar Materials:</strong> Both use biocompatible materials appropriate for [contact type]</li>
  <li><strong>Comparable Performance:</strong> Testing demonstrates equivalent or superior performance</li>
  <li><strong>Same Safety Profile:</strong> No new risks identified</li>
</ol>

<h3>Conclusion</h3>
<p>Based on the comparisons and testing presented in this submission, we conclude that the [Device Name] is substantially equivalent to the predicate device and can be cleared for marketing.</p>
`,
        guidance: 'The Executive Summary provides FDA reviewers with a high-level overview of your submission.',
        required: false,
        regulations: ['FDA Guidance Documents']
      },

      '9.0': {
        title: 'Substantial Equivalence Discussion',
        template: `
<h2>Substantial Equivalence Discussion</h2>

<h3>Predicate Device Selection Rationale</h3>
<p>The [Predicate Device, K Number] was selected as the primary predicate because:</p>
<ul>
  <li>Same intended use for [specific use]</li>
  <li>Same technological characteristics</li>
  <li>Cleared for the same indications</li>
  <li>Similar patient population</li>
  <li>Well-established safety and effectiveness profile</li>
</ul>

<h3>Detailed Comparison Table</h3>
<table border="1" cellpadding="5" style="width: 100%; border-collapse: collapse;">
  <tr>
    <th>Characteristic</th>
    <th>Subject Device</th>
    <th>Predicate Device</th>
    <th>Comparison</th>
    <th>Impact on S&E</th>
  </tr>
  <tr>
    <td><strong>Intended Use</strong></td>
    <td>[Subject intended use]</td>
    <td>[Predicate intended use]</td>
    <td>Identical</td>
    <td>None</td>
  </tr>
  <tr>
    <td><strong>Indications for Use</strong></td>
    <td>[Subject indications]</td>
    <td>[Predicate indications]</td>
    <td>Same/Similar</td>
    <td>None</td>
  </tr>
  <tr>
    <td><strong>Patient Population</strong></td>
    <td>[Demographics, conditions]</td>
    <td>[Demographics, conditions]</td>
    <td>Same</td>
    <td>None</td>
  </tr>
  <tr>
    <td><strong>Design</strong></td>
    <td>[Design features]</td>
    <td>[Design features]</td>
    <td>[Comparison]</td>
    <td>[Impact analysis]</td>
  </tr>
  <tr>
    <td><strong>Materials</strong></td>
    <td>[Materials list]</td>
    <td>[Materials list]</td>
    <td>[Same/Different]</td>
    <td>[Biocompatibility assessment]</td>
  </tr>
  <tr>
    <td><strong>Operating Principle</strong></td>
    <td>[How it works]</td>
    <td>[How it works]</td>
    <td>[Comparison]</td>
    <td>[Impact]</td>
  </tr>
  <tr>
    <td><strong>Energy Source</strong></td>
    <td>[Power requirements]</td>
    <td>[Power requirements]</td>
    <td>[Comparison]</td>
    <td>[Safety considerations]</td>
  </tr>
  <tr>
    <td><strong>Performance Specs</strong></td>
    <td>[Key specifications]</td>
    <td>[Key specifications]</td>
    <td>[Comparison]</td>
    <td>[Clinical relevance]</td>
  </tr>
</table>

<h3>Analysis of Differences</h3>
<p>The following differences exist between the subject and predicate devices:</p>

<h4>Difference 1: [Describe difference]</h4>
<p><strong>Nature of Difference:</strong> [Detailed description]</p>
<p><strong>Rationale for Difference:</strong> [Why this change was made]</p>
<p><strong>Impact on Safety:</strong> [Analysis showing no negative impact]</p>
<p><strong>Impact on Effectiveness:</strong> [Analysis showing maintained/improved effectiveness]</p>
<p><strong>Supporting Data:</strong> [Reference to test reports/literature]</p>

<h4>Difference 2: [If applicable]</h4>
<p>[Similar analysis for each difference]</p>

<h3>Risk Analysis Comparison</h3>
<table border="1" cellpadding="5" style="width: 100%; border-collapse: collapse;">
  <tr>
    <th>Hazard</th>
    <th>Subject Device Risk Control</th>
    <th>Predicate Device Risk Control</th>
    <th>Residual Risk Comparison</th>
  </tr>
  <tr>
    <td>[Hazard 1]</td>
    <td>[Control measures]</td>
    <td>[Control measures]</td>
    <td>Equivalent/Lower</td>
  </tr>
</table>

<h3>Performance Comparison</h3>
<p>Comparative testing demonstrated:</p>
<ul>
  <li><strong>[Test 1]:</strong> Subject device performed [comparison to predicate]</li>
  <li><strong>[Test 2]:</strong> Subject device performed [comparison to predicate]</li>
  <li><strong>[Test 3]:</strong> Subject device performed [comparison to predicate]</li>
</ul>

<h3>Substantial Equivalence Conclusion</h3>
<p>The comparison demonstrates that:</p>
<ol>
  <li>The subject device has the same intended use as the predicate</li>
  <li>The subject device has similar technological characteristics</li>
  <li>The minor differences do not raise new questions of safety or effectiveness</li>
  <li>Performance data demonstrate the subject device is as safe and effective as the predicate</li>
</ol>

<p>Therefore, the [Device Name] is substantially equivalent to the predicate device [Predicate Name, K Number].</p>
`,
        guidance: 'This is the core of your 510(k). Clearly demonstrate how your device is substantially equivalent to the predicate.',
        required: true,
        regulations: ['21 CFR 807.87(f)', 'FDA Guidance: The 510(k) Program']
      },

      '10.0': {
        title: 'Proposed Labeling',
        template: `
<h2>Proposed Labeling</h2>

<h3>Device Label</h3>
<div style="border: 1px solid #000; padding: 15px; margin: 20px 0;">
  <p><strong>[COMPANY LOGO]</strong></p>
  <p><strong>[Device Name]</strong></p>
  <p>Model: [Model Number]</p>
  <p>Serial Number: [XXXXXXXX]</p>
  <p>Manufactured: [Date]</p>
  <p>℞ Prescription Use Only</p>
  <p>[Company Name]</p>
  <p>[Address]</p>
  <p>Made in [Country]</p>
  <p>[Symbols: CE mark, RoHS, etc.]</p>
</div>

<h3>Instructions for Use (IFU)</h3>
<h4>1. Device Description</h4>
<p>[Brief description of device and components]</p>

<h4>2. Indications for Use</h4>
<p>[Exact indications statement]</p>

<h4>3. Contraindications</h4>
<ul>
  <li>[Contraindication 1]</li>
  <li>[Contraindication 2]</li>
</ul>

<h4>4. Warnings</h4>
<div style="border: 2px solid red; padding: 10px; margin: 10px 0;">
  <p><strong>⚠ WARNING:</strong> [Most serious warnings]</p>
</div>

<h4>5. Precautions</h4>
<ul>
  <li>[Precaution 1]</li>
  <li>[Precaution 2]</li>
  <li>[Precaution 3]</li>
</ul>

<h4>6. Operating Instructions</h4>
<p><strong>Setup:</strong></p>
<ol>
  <li>[Step 1]</li>
  <li>[Step 2]</li>
  <li>[Step 3]</li>
</ol>

<p><strong>Operation:</strong></p>
<ol>
  <li>[Step 1]</li>
  <li>[Step 2]</li>
  <li>[Step 3]</li>
</ol>

<h4>7. Maintenance and Cleaning</h4>
<p><strong>Cleaning:</strong></p>
<ul>
  <li>[Cleaning instruction 1]</li>
  <li>[Cleaning instruction 2]</li>
</ul>

<p><strong>Maintenance:</strong></p>
<ul>
  <li>[Maintenance requirement 1]</li>
  <li>[Maintenance requirement 2]</li>
</ul>

<h4>8. Troubleshooting</h4>
<table border="1" cellpadding="5" style="width: 100%; border-collapse: collapse;">
  <tr>
    <th>Problem</th>
    <th>Possible Cause</th>
    <th>Solution</th>
  </tr>
  <tr>
    <td>[Problem 1]</td>
    <td>[Cause]</td>
    <td>[Solution]</td>
  </tr>
</table>

<h4>9. Technical Specifications</h4>
<table border="1" cellpadding="5" style="width: 100%; border-collapse: collapse;">
  <tr>
    <td>Dimensions</td>
    <td>[Specifications]</td>
  </tr>
  <tr>
    <td>Weight</td>
    <td>[Specifications]</td>
  </tr>
  <tr>
    <td>Power Requirements</td>
    <td>[Specifications]</td>
  </tr>
  <tr>
    <td>Environmental Conditions</td>
    <td>[Temperature, humidity ranges]</td>
  </tr>
</table>

<h4>10. Symbols Used</h4>
<table border="1" cellpadding="5" style="width: 100%; border-collapse: collapse;">
  <tr>
    <th>Symbol</th>
    <th>Meaning</th>
    <th>Standard</th>
  </tr>
  <tr>
    <td>℞</td>
    <td>Prescription Use Only</td>
    <td>21 CFR 801.109</td>
  </tr>
  <tr>
    <td>⚠</td>
    <td>Warning/Caution</td>
    <td>ISO 15223-1</td>
  </tr>
</table>

<h4>11. Warranty Information</h4>
<p>[Warranty terms and conditions]</p>

<h4>12. Contact Information</h4>
<p>[Company contact details for support and adverse event reporting]</p>
`,
        guidance: 'Include all labeling that will accompany the device. Ensure compliance with 21 CFR Part 801.',
        required: true,
        regulations: ['21 CFR Part 801', '21 CFR 807.87(e)']
      },

      '11.0': {
        title: 'Sterilization and Shelf Life',
        template: `
<h2>Sterilization and Shelf Life</h2>

<h3>Sterilization Information</h3>
<p><strong>Device Provided:</strong> ☐ Sterile ☐ Non-Sterile</p>

<h4>Sterilization Method</h4>
<p><strong>Method Used:</strong> [Ethylene Oxide (EO) / Gamma Radiation / Steam / E-beam]</p>
<p><strong>Sterilization Cycle Parameters:</strong></p>
<ul>
  <li>Temperature: [°C]</li>
  <li>Exposure Time: [minutes/hours]</li>
  <li>Concentration/Dose: [specify]</li>
  <li>Humidity: [% if applicable]</li>
</ul>

<h4>Sterilization Validation</h4>
<p><strong>Standards Applied:</strong></p>
<ul>
  <li>ISO 11135:2014 - Ethylene oxide sterilization</li>
  <li>ISO 11137:2006 - Radiation sterilization</li>
  <li>ISO 17665:2006 - Moist heat sterilization</li>
</ul>

<p><strong>Sterility Assurance Level (SAL):</strong> 10⁻⁶</p>

<p><strong>Bioburden Testing:</strong></p>
<ul>
  <li>Method: ISO 11737-1</li>
  <li>Results: [CFU/device]</li>
  <li>Sample Size: [n=X]</li>
</ul>

<p><strong>Biological Indicator Testing:</strong></p>
<ul>
  <li>Organism: [Bacillus species used]</li>
  <li>Population: [spores]</li>
  <li>D-value: [minutes]</li>
  <li>Results: Complete kill achieved</li>
</ul>

<h4>Residuals Testing (for EO)</h4>
<table border="1" cellpadding="5" style="width: 100%; border-collapse: collapse;">
  <tr>
    <th>Residual</th>
    <th>Limit (ISO 10993-7)</th>
    <th>Test Result</th>
    <th>Method</th>
  </tr>
  <tr>
    <td>Ethylene Oxide</td>
    <td>[Limit in ppm]</td>
    <td>[Result]</td>
    <td>GC-MS</td>
  </tr>
  <tr>
    <td>Ethylene Chlorohydrin</td>
    <td>[Limit in ppm]</td>
    <td>[Result]</td>
    <td>GC-MS</td>
  </tr>
</table>

<h3>Package Validation</h3>
<p><strong>Packaging System:</strong> [Description of sterile barrier system]</p>
<p><strong>Materials:</strong> [Tyvek, medical grade paper, etc.]</p>

<p><strong>Package Testing (ISO 11607):</strong></p>
<ul>
  <li>Seal Strength: [Results per ASTM F88]</li>
  <li>Seal Integrity: [Dye penetration test results]</li>
  <li>Whole Package Integrity: [Bubble emission test]</li>
  <li>Aging: Accelerated and real-time</li>
</ul>

<h3>Shelf Life Determination</h3>
<p><strong>Claimed Shelf Life:</strong> [X years]</p>

<h4>Accelerated Aging Study</h4>
<p><strong>Standard:</strong> ASTM F1980</p>
<p><strong>Aging Temperature:</strong> [°C]</p>
<p><strong>Aging Factor (Q10):</strong> [typically 2.0]</p>
<p><strong>Accelerated Aging Time:</strong> [days]</p>
<p><strong>Equivalent Real Time:</strong> [years]</p>

<p><strong>Testing Performed Post-Aging:</strong></p>
<ul>
  <li>Package integrity testing</li>
  <li>Sterility testing (ISO 11737)</li>
  <li>Functional testing</li>
  <li>Material properties testing</li>
</ul>

<h4>Real-Time Aging Study</h4>
<p><strong>Storage Conditions:</strong> [Temperature and humidity]</p>
<p><strong>Status:</strong> ☐ Complete ☐ Ongoing (X months complete)</p>
<p><strong>Test Points:</strong> 0, 6, 12, 18, 24, 36, [X] months</p>

<h3>Shelf Life Testing Results</h3>
<table border="1" cellpadding="5" style="width: 100%; border-collapse: collapse;">
  <tr>
    <th>Test</th>
    <th>Acceptance Criteria</th>
    <th>T=0</th>
    <th>Accelerated</th>
    <th>Real-Time</th>
  </tr>
  <tr>
    <td>Sterility</td>
    <td>No growth</td>
    <td>Pass</td>
    <td>Pass</td>
    <td>[Pass/Ongoing]</td>
  </tr>
  <tr>
    <td>Package Integrity</td>
    <td>[Criteria]</td>
    <td>Pass</td>
    <td>Pass</td>
    <td>[Pass/Ongoing]</td>
  </tr>
  <tr>
    <td>Functional Testing</td>
    <td>[Specifications]</td>
    <td>Pass</td>
    <td>Pass</td>
    <td>[Pass/Ongoing]</td>
  </tr>
</table>

<h3>Reprocessing Instructions (if applicable)</h3>
<p>[If device can be reprocessed, provide validated cleaning and sterilization instructions]</p>

<h3>Conclusion</h3>
<p>The sterilization process has been validated to achieve a SAL of 10⁻⁶. The packaging system maintains sterility for the [X-year] shelf life as demonstrated through accelerated and real-time aging studies.</p>
`,
        guidance: 'Provide complete sterilization validation data and shelf life studies per FDA guidance.',
        required: true,
        regulations: ['FDA Guidance: Submission and Review of Sterility Information', 'ISO 11607', 'ASTM F1980']
      },

      '12.0': {
        title: 'Biocompatibility',
        template: `
<h2>Biocompatibility</h2>

<h3>Biocompatibility Assessment per ISO 10993-1:2018</h3>

<h4>Device Categorization</h4>
<ul>
  <li><strong>Nature of Body Contact:</strong> [Surface/External Communicating/Implant]</li>
  <li><strong>Type of Contact:</strong> [Skin/Mucosal Membrane/Blood Path/Tissue/Bone]</li>
  <li><strong>Contact Duration:</strong> [Limited (≤24h)/Prolonged (>24h-30d)/Long Term (>30d)]</li>
  <li><strong>Category:</strong> [Category based on above: e.g., Surface Device - Intact Skin - Prolonged]</li>
</ul>

<h4>Materials Assessment</h4>
<table border="1" cellpadding="5" style="width: 100%; border-collapse: collapse;">
  <tr>
    <th>Component</th>
    <th>Material</th>
    <th>Patient Contact</th>
    <th>Prior Use History</th>
    <th>Chemical Characterization</th>
  </tr>
  <tr>
    <td>[Component 1]</td>
    <td>[Material/Grade]</td>
    <td>[Yes/No]</td>
    <td>[FDA cleared devices using same material]</td>
    <td>[Available/Required]</td>
  </tr>
</table>

<h4>Biological Evaluation Plan</h4>
<table border="1" cellpadding="5" style="width: 100%; border-collapse: collapse;">
  <tr>
    <th>Biological Effect</th>
    <th>ISO 10993 Part</th>
    <th>Required?</th>
    <th>Testing/Justification</th>
    <th>Result</th>
  </tr>
  <tr>
    <td>Cytotoxicity</td>
    <td>Part 5</td>
    <td>Yes</td>
    <td>MEM Elution per ISO 10993-5</td>
    <td>Non-cytotoxic</td>
  </tr>
  <tr>
    <td>Sensitization</td>
    <td>Part 10</td>
    <td>Yes</td>
    <td>Guinea Pig Maximization</td>
    <td>Non-sensitizing</td>
  </tr>
  <tr>
    <td>Irritation</td>
    <td>Part 23</td>
    <td>Yes</td>
    <td>Intracutaneous Reactivity</td>
    <td>Non-irritating</td>
  </tr>
  <tr>
    <td>Acute Systemic Toxicity</td>
    <td>Part 11</td>
    <td>[Yes/No]</td>
    <td>[Test method or justification]</td>
    <td>[Result]</td>
  </tr>
  <tr>
    <td>Subacute/Subchronic Toxicity</td>
    <td>Part 11</td>
    <td>[Yes/No]</td>
    <td>[Test method or justification]</td>
    <td>[Result]</td>
  </tr>
  <tr>
    <td>Genotoxicity</td>
    <td>Part 3</td>
    <td>[Yes/No]</td>
    <td>[Test method or justification]</td>
    <td>[Result]</td>
  </tr>
  <tr>
    <td>Implantation</td>
    <td>Part 6</td>
    <td>[Yes/No]</td>
    <td>[Test method or justification]</td>
    <td>[Result]</td>
  </tr>
  <tr>
    <td>Hemocompatibility</td>
    <td>Part 4</td>
    <td>[Yes/No]</td>
    <td>[Hemolysis, Thrombogenicity, etc.]</td>
    <td>[Result]</td>
  </tr>
</table>

<h4>Chemical Characterization (ISO 10993-18)</h4>
<p><strong>Extractables and Leachables Study:</strong></p>
<ul>
  <li>Extraction Conditions: [Solvent, temperature, time]</li>
  <li>Analytical Methods: [GC-MS, LC-MS, ICP-MS]</li>
  <li>Compounds Identified: [List]</li>
  <li>Toxicological Risk Assessment: [Summary]</li>
</ul>

<h4>Test Reports Summary</h4>
<table border="1" cellpadding="5" style="width: 100%; border-collapse: collapse;">
  <tr>
    <th>Test</th>
    <th>Test Facility</th>
    <th>Report Number</th>
    <th>Date</th>
    <th>Result</th>
  </tr>
  <tr>
    <td>Cytotoxicity</td>
    <td>[Lab Name]</td>
    <td>[Report #]</td>
    <td>[Date]</td>
    <td>Pass</td>
  </tr>
  <tr>
    <td>Sensitization</td>
    <td>[Lab Name]</td>
    <td>[Report #]</td>
    <td>[Date]</td>
    <td>Pass</td>
  </tr>
</table>

<h4>Comparison to Predicate Device</h4>
<p>The subject device uses the same materials in patient-contacting components as the predicate device [K Number], which has been safely marketed for [X years]. Therefore, no new biocompatibility concerns are raised.</p>

<h3>Conclusion</h3>
<p>All biocompatibility testing required per ISO 10993-1:2018 has been completed successfully. The device materials are biocompatible for their intended use and contact duration.</p>

<h3>Appendices</h3>
<p>☐ Complete test reports attached as Appendix [X]</p>
<p>☐ Certificates of compliance for materials</p>
<p>☐ Toxicological risk assessment report</p>
`,
        guidance: 'Follow ISO 10993-1:2018 and FDA guidance. Include all test reports or valid justifications for not testing.',
        required: true,
        regulations: ['ISO 10993 series', 'FDA Guidance: Use of ISO 10993-1']
      },

      '15.0': {
        title: 'Performance Testing - Bench',
        template: `
<h2>Performance Testing - Bench</h2>

<h3>Test Overview</h3>
<p>The following bench testing was conducted to verify the device meets all design specifications and performs substantially equivalent to the predicate device.</p>

<h3>Test Summary Table</h3>
<table border="1" cellpadding="5" style="width: 100%; border-collapse: collapse;">
  <tr>
    <th>Test</th>
    <th>Standard/Method</th>
    <th>Acceptance Criteria</th>
    <th>Results</th>
    <th>Pass/Fail</th>
  </tr>
  <tr>
    <td>Mechanical Strength</td>
    <td>[ASTM/ISO standard]</td>
    <td>[Specific criteria]</td>
    <td>[Actual results]</td>
    <td>Pass</td>
  </tr>
  <tr>
    <td>Fatigue Testing</td>
    <td>[Standard]</td>
    <td>[Cycles without failure]</td>
    <td>[Results]</td>
    <td>Pass</td>
  </tr>
  <tr>
    <td>Dimensional Verification</td>
    <td>Engineering Drawings</td>
    <td>[Tolerances]</td>
    <td>[Measurements]</td>
    <td>Pass</td>
  </tr>
  <tr>
    <td>Functional Testing</td>
    <td>Internal Protocol</td>
    <td>[Performance specs]</td>
    <td>[Results]</td>
    <td>Pass</td>
  </tr>
</table>

<h3>Detailed Test Results</h3>

<h4>Test 1: [Mechanical Strength Testing]</h4>
<p><strong>Objective:</strong> Verify device can withstand expected forces during use</p>
<p><strong>Method:</strong> [Detailed test method]</p>
<p><strong>Equipment:</strong> [Test equipment used]</p>
<p><strong>Sample Size:</strong> n=[X]</p>
<p><strong>Results:</strong></p>
<table border="1" cellpadding="5">
  <tr>
    <th>Sample</th>
    <th>Force Applied (N)</th>
    <th>Failure Point</th>
    <th>Pass/Fail</th>
  </tr>
  <tr>
    <td>1</td>
    <td>[Value]</td>
    <td>[Value or N/A]</td>
    <td>Pass</td>
  </tr>
</table>
<p><strong>Statistical Analysis:</strong> Mean = [X], SD = [Y], All samples exceeded minimum requirement of [Z]</p>
<p><strong>Conclusion:</strong> Device meets mechanical strength requirements</p>

<h4>Test 2: [Fatigue/Durability Testing]</h4>
<p><strong>Objective:</strong> Demonstrate device maintains function over expected use life</p>
<p><strong>Method:</strong> Cyclic loading per [standard]</p>
<p><strong>Test Parameters:</strong></p>
<ul>
  <li>Number of cycles: [X]</li>
  <li>Frequency: [Hz]</li>
  <li>Load: [N or specification]</li>
  <li>Environment: [Temperature, humidity]</li>
</ul>
<p><strong>Results:</strong> All samples completed [X] cycles without failure</p>
<p><strong>Conclusion:</strong> Device demonstrates adequate durability</p>

<h4>Test 3: [Accuracy/Precision Testing]</h4>
<p><strong>Objective:</strong> Verify device measurements/outputs are within specifications</p>
<p><strong>Method:</strong> [Test method]</p>
<p><strong>Results:</strong></p>
<ul>
  <li>Accuracy: ±[X]% of reading</li>
  <li>Precision: CV = [Y]%</li>
  <li>Linearity: R² = [value]</li>
</ul>

<h4>Test 4: [Environmental Testing]</h4>
<p><strong>Storage Conditions:</strong></p>
<ul>
  <li>Temperature: -20°C to 60°C</li>
  <li>Humidity: 10% to 90% RH</li>
  <li>Duration: [Time]</li>
  <li>Result: No degradation in performance</li>
</ul>

<p><strong>Operating Conditions:</strong></p>
<ul>
  <li>Temperature: 10°C to 40°C</li>
  <li>Humidity: 30% to 75% RH</li>
  <li>Result: Performs within specifications</li>
</ul>

<h4>Test 5: [Comparative Testing with Predicate]</h4>
<p><strong>Objective:</strong> Demonstrate equivalent performance to predicate device</p>
<p><strong>Method:</strong> Side-by-side testing under identical conditions</p>
<p><strong>Results:</strong></p>
<table border="1" cellpadding="5">
  <tr>
    <th>Parameter</th>
    <th>Subject Device</th>
    <th>Predicate Device</th>
    <th>Statistical Comparison</th>
  </tr>
  <tr>
    <td>[Parameter 1]</td>
    <td>[Result ± SD]</td>
    <td>[Result ± SD]</td>
    <td>p = [value], Not significant</td>
  </tr>
</table>

<h3>Standards Compliance Testing</h3>
<table border="1" cellpadding="5" style="width: 100%; border-collapse: collapse;">
  <tr>
    <th>Standard</th>
    <th>Title</th>
    <th>Testing Performed</th>
    <th>Result</th>
  </tr>
  <tr>
    <td>IEC 60601-1</td>
    <td>Medical Electrical Equipment Safety</td>
    <td>Full compliance testing</td>
    <td>Compliant</td>
  </tr>
  <tr>
    <td>IEC 60601-1-2</td>
    <td>EMC Requirements</td>
    <td>Emissions and immunity</td>
    <td>Compliant</td>
  </tr>
</table>

<h3>Worst-Case Testing</h3>
<p>Testing was performed under worst-case conditions including:</p>
<ul>
  <li>Maximum rated load/stress</li>
  <li>Environmental extremes</li>
  <li>Tolerance stack-up analysis</li>
  <li>End of shelf life conditions</li>
</ul>

<h3>Conclusion</h3>
<p>All bench testing demonstrates the device meets its design specifications and performs substantially equivalent to the predicate device. Complete test reports are provided in Appendix [X].</p>
`,
        guidance: 'Include all relevant bench testing. Focus on tests that demonstrate safety, effectiveness, and substantial equivalence.',
        required: true,
        regulations: ['21 CFR 807.87(f)', 'FDA Guidance: Premarket Notification 510(k)']
      }
    };
  }

  /**
   * Get template for a specific section
   */
  getTemplate(sectionNumber) {
    return this.templates[sectionNumber] || null;
  }

  /**
   * Get all templates
   */
  getAllTemplates() {
    return this.templates;
  }

  /**
   * Get required sections for 510(k)
   */
  getRequiredSections() {
    return Object.entries(this.templates)
      .filter(([_, template]) => template.required)
      .map(([number, template]) => ({
        number,
        title: template.title,
        regulations: template.regulations
      }));
  }

  /**
   * Generate complete 510(k) document with all sections
   */
  generateComplete510k(deviceData = {}) {
    let fullDocument = '<h1>FDA 510(k) Premarket Notification</h1>\n\n';
    
    Object.entries(this.templates).forEach(([sectionNumber, template]) => {
      fullDocument += `<div class="section" data-section="${sectionNumber}">\n`;
      fullDocument += template.template;
      fullDocument += '\n</div>\n\n';
    });

    // Replace placeholders with actual device data if provided
    if (deviceData.deviceName) {
      fullDocument = fullDocument.replace(/\[Device Name\]/g, deviceData.deviceName);
    }
    if (deviceData.companyName) {
      fullDocument = fullDocument.replace(/\[Company Name\]/g, deviceData.companyName);
    }
    if (deviceData.predicateDevice) {
      fullDocument = fullDocument.replace(/\[Predicate Device Name\]/g, deviceData.predicateDevice);
    }

    return fullDocument;
  }

  /**
   * Validate section content for completeness
   */
  validateSection(sectionNumber, content) {
    const template = this.templates[sectionNumber];
    if (!template) return { valid: false, errors: ['Invalid section number'] };

    const errors = [];
    
    // Check for remaining placeholders
    const placeholderRegex = /\[[^\]]+\]/g;
    const placeholders = content.match(placeholderRegex);
    if (placeholders && placeholders.length > 0) {
      errors.push(`Unfilled placeholders found: ${placeholders.slice(0, 5).join(', ')}`);
    }

    // Check minimum content length
    if (content.length < 100) {
      errors.push('Section appears incomplete (too short)');
    }

    // Check for required elements based on section
    if (sectionNumber === '4.0' && !content.includes('Indications for Use:')) {
      errors.push('Missing Indications for Use statement');
    }

    if (sectionNumber === '6.0' && !content.includes('Signature:')) {
      errors.push('Missing signature line');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get guidance for AI assistance
   */
  getAIGuidance(sectionNumber) {
    const template = this.templates[sectionNumber];
    if (!template) return null;

    return {
      title: template.title,
      guidance: template.guidance,
      regulations: template.regulations,
      tips: [
        'Be specific and detailed',
        'Use clear, professional language',
        'Reference applicable standards',
        'Include all required elements',
        'Support claims with data'
      ]
    };
  }
}

export default new FDA510kTemplateService();