/**
 * FDA 510(k) Template Service - Backend Version
 * 
 * Provides comprehensive templates for backend document generation
 */

class FDA510kTemplateService {
  private templates: Record<string, any>;

  constructor() {
    this.templates = this.initializeTemplates();
  }

  getAllTemplates() {
    return this.templates;
  }

  getTemplate(sectionId: string) {
    return this.templates[sectionId];
  }

  private initializeTemplates() {
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

<h3>Device Information</h3>
<p><strong>Device Trade Name:</strong> [Device Trade Name]</p>
<p><strong>Device Classification:</strong> Class II</p>
<p><strong>Product Code:</strong> [3-letter FDA Product Code]</p>
<p><strong>Regulation Number:</strong> 21 CFR [XXX.XXXX]</p>`,
        required: true
      },
      
      '3.0': {
        title: '510(k) Cover Letter',
        template: `
<h2>510(k) Cover Letter</h2>

<p>Food and Drug Administration</p>
<p>Center for Devices and Radiological Health</p>

<p><strong>Re: 510(k) Premarket Notification for [Device Trade Name]</strong></p>

<h3>Device Information</h3>
<p><strong>Trade Name:</strong> [Device Trade Name]</p>
<p><strong>Common Name:</strong> [Common Name]</p>
<p><strong>Product Code:</strong> [3-letter FDA Product Code]</p>

<h3>Predicate Device</h3>
<p><strong>Trade Name:</strong> [Predicate Device Name]</p>
<p><strong>510(k) Number:</strong> K[XXXXXX]</p>`,
        required: true
      },

      '4.0': {
        title: 'Indications for Use Statement',
        template: `
<h2>Indications for Use Statement</h2>

<p><strong>Device Name:</strong> [Device Trade Name]</p>

<p><strong>Indications for Use:</strong></p>
<p>[Indications for Use]</p>

<p><strong>Prescription Use ✓</strong> (Part 21 CFR 801 Subpart D)</p>`,
        required: true
      },

      '5.0': {
        title: '510(k) Summary',
        template: `
<h2>510(k) Summary</h2>

<h3>Submitter Information</h3>
<p><strong>Company:</strong> [Company Name]</p>
<p><strong>Contact:</strong> [Contact Name]</p>

<h3>Device Identification</h3>
<p><strong>Device Name:</strong> [Device Trade Name]</p>
<p><strong>Common Name:</strong> [Common Name]</p>

<h3>Predicate Device</h3>
<p><strong>Predicate:</strong> [Predicate Device Name] (K[XXXXXX])</p>

<h3>Device Description</h3>
<p>[Device Description]</p>

<h3>Substantial Equivalence</h3>
<p>[Substantial Equivalence Rationale]</p>`,
        required: true
      },

      '7.0': {
        title: 'Device Description',
        template: `
<h2>Device Description</h2>

<h3>General Description</h3>
<p>[Device Description]</p>

<h3>Physical Characteristics</h3>
<p>[Physical Characteristics]</p>

<h3>Principles of Operation</h3>
<p>[Principles of Operation]</p>

<h3>Materials</h3>
<p>[Materials Description]</p>`,
        required: true
      },

      '9.0': {
        title: 'Substantial Equivalence Comparison',
        template: `
<h2>Substantial Equivalence Comparison</h2>

<table border="1">
<tr>
  <th>Feature</th>
  <th>Subject Device</th>
  <th>Predicate Device</th>
</tr>
<tr>
  <td>Trade Name</td>
  <td>[Device Trade Name]</td>
  <td>[Predicate Device Name]</td>
</tr>
<tr>
  <td>510(k) Number</td>
  <td>TBD</td>
  <td>K[XXXXXX]</td>
</tr>
<tr>
  <td>Indications for Use</td>
  <td>[Indications for Use]</td>
  <td>[Predicate Indications]</td>
</tr>
</table>`,
        required: true
      },

      '10.0': {
        title: 'Proposed Labeling',
        template: `
<h2>Proposed Labeling</h2>

<h3>Device Label</h3>
<p>[Label Content]</p>

<h3>Instructions for Use</h3>
<p>[Instructions Content]</p>

<h3>Warnings and Precautions</h3>
<p>[Warnings Content]</p>`,
        required: true
      },

      '15.0': {
        title: 'Performance Testing - Bench',
        template: `
<h2>Performance Testing - Bench</h2>

<h3>Test Summary</h3>
<p>[Test Summary]</p>

<h3>Test Methods</h3>
<p>[Test Methods Description]</p>

<h3>Results</h3>
<p>[Test Results]</p>

<h3>Conclusions</h3>
<p>[Test Conclusions]</p>`,
        required: false
      }
    };
  }
}

export default FDA510kTemplateService;