import { FDAFormsRegistry, FormField, FDAFormDefinition, getRequiredForms, getFormsForStage } from '../config/FDAFormsRegistry';

export default class FDAFormGenerator {
  /**
   * Universal SMART Form Generator
   * Generates any FDA form based on the registry definition
   */
  async generateSmartForm(formId: string, projectData: any) {
    const formDefinition = FDAFormsRegistry[formId];
    if (!formDefinition) {
      throw new Error(`Form ${formId} not found in registry`);
    }

    // Extract data based on form field mappings
    const formData: any = {};
    let completeness = 0;
    let filledCount = 0;
    let requiredCount = 0;

    for (const field of formDefinition.fields) {
      if (field.required) requiredCount++;
      
      // Get value from workflow mapping
      let value = null;
      if (field.workflowMapping) {
        const { stage, section, field: fieldName } = field.workflowMapping;
        value = this.extractFieldValue(projectData, stage, section, fieldName);
      }
      
      // Apply AI suggestions if enabled and no value found
      if (!value && field.aiSuggestionEnabled) {
        value = await this.getAISuggestion(field, projectData);
      }
      
      // Use default value for certain field types
      if (!value && field.type === 'date' && field.id.includes('date')) {
        value = new Date().toISOString().split('T')[0];
      }
      
      formData[field.id] = value || '';
      if (value && field.required) filledCount++;
    }

    // Calculate completeness
    completeness = requiredCount > 0 ? Math.round((filledCount / requiredCount) * 100) : 100;

    // Generate HTML content
    const htmlContent = this.generateUniversalFormHTML(formDefinition, formData);

    return {
      name: `FDA Form ${formDefinition.formNumber} - ${formDefinition.title}`,
      formData,
      htmlContent,
      completeness,
      formId,
      version: formDefinition.version
    };
  }

  /**
   * Extract field value from project data based on workflow mapping
   */
  private extractFieldValue(projectData: any, stage: string, section: string | undefined, fieldName: string): any {
    const { workflowData, formData, fda510kProject, organization, metadata } = projectData;
    
    // Try workflow data first
    if (workflowData) {
      const stageData = workflowData[stage.toLowerCase()] || workflowData[stage];
      if (stageData) {
        if (section) {
          const sectionData = stageData[section] || stageData[section.toLowerCase()];
          if (sectionData && sectionData[fieldName]) {
            return sectionData[fieldName];
          }
        }
        if (stageData[fieldName]) {
          return stageData[fieldName];
        }
      }
    }
    
    // Try form data
    if (formData) {
      const formSection = formData[stage.toLowerCase()] || formData[stage];
      if (formSection && formSection[fieldName]) {
        return formSection[fieldName];
      }
    }
    
    // Try project metadata
    if (metadata && metadata[fieldName]) {
      return metadata[fieldName];
    }
    
    // Try organization data
    if (organization && organization[fieldName]) {
      return organization[fieldName];
    }
    
    // Try fda510kProject data
    if (fda510kProject && fda510kProject[fieldName]) {
      return fda510kProject[fieldName];
    }
    
    return null;
  }

  /**
   * Get AI suggestion for a field
   */
  private async getAISuggestion(field: FormField, projectData: any): Promise<string> {
    // TODO: Implement OpenAI integration for field suggestions
    // For now, return empty string
    return '';
  }

  /**
   * Generate universal HTML for any form
   */
  private generateUniversalFormHTML(formDefinition: FDAFormDefinition, formData: any): string {
    let html = `
<!DOCTYPE html>
<html>
<head>
    <title>${formDefinition.title}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .form-header { background: #003366; color: white; padding: 20px; margin-bottom: 20px; }
        .form-section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; }
        .field-group { margin: 15px 0; }
        .field-label { font-weight: bold; display: block; margin-bottom: 5px; }
        .field-value { padding: 8px; background: #f5f5f5; border: 1px solid #ddd; min-height: 30px; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #003366; }
        .checkbox { width: 20px; height: 20px; }
    </style>
</head>
<body>
    <div class="form-header">
        <h1>FDA Form ${formDefinition.formNumber}</h1>
        <h2>${formDefinition.title}</h2>
        <p>Version: ${formDefinition.version} | Last Updated: ${formDefinition.lastUpdated}</p>
    </div>
    
    <div class="form-section">
        <h3>Form Information</h3>
        <p>${formDefinition.description}</p>
        <p><strong>Category:</strong> ${formDefinition.category}</p>
        <p><strong>Submission Date:</strong> ${new Date().toLocaleDateString()}</p>
    </div>
    
    <div class="form-section">
        <h3>Form Fields</h3>`;
    
    // Add form fields
    for (const field of formDefinition.fields) {
      const value = formData[field.id] || '';
      html += `
        <div class="field-group">
            <label class="field-label">${field.label}${field.required ? ' *' : ''}</label>`;
      
      switch (field.type) {
        case 'checkbox':
          html += `
            <input type="checkbox" class="checkbox" ${value ? 'checked' : ''} disabled />
            <span>${field.label}</span>`;
          break;
        case 'select':
          html += `
            <div class="field-value">
                <select disabled>
                    <option>${value || 'Not Selected'}</option>
                </select>
            </div>`;
          break;
        case 'textarea':
          html += `
            <div class="field-value" style="min-height: 100px;">
                ${value || 'Not Provided'}
            </div>`;
          break;
        default:
          html += `
            <div class="field-value">
                ${value || 'Not Provided'}
            </div>`;
      }
      
      html += `
        </div>`;
    }
    
    html += `
    </div>
    
    <div class="footer">
        <p><strong>Form Generated:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>Generated By:</strong> CERV2 SMART Forms System</p>
        <p><em>This is an electronically generated form. Please review all information for accuracy.</em></p>
    </div>
</body>
</html>`;
    
    return html;
  }

  /**
   * Generate all required forms for a submission type
   */
  async generateRequiredForms(submissionType: '510k' | 'PMA' | 'DeNovo', projectData: any) {
    const requiredFormIds = getRequiredForms(submissionType);
    const generatedForms = [];
    
    for (const formId of requiredFormIds) {
      try {
        const form = await this.generateSmartForm(formId, projectData);
        generatedForms.push(form);
      } catch (error) {
        console.error(`Error generating form ${formId}:`, error);
      }
    }
    
    return generatedForms;
  }

  /**
   * Generate forms for a specific workflow stage
   */
  async generateFormsForStage(stage: number, projectData: any) {
    const formIds = getFormsForStage(stage);
    const generatedForms = [];
    
    for (const formId of formIds) {
      try {
        const form = await this.generateSmartForm(formId, projectData);
        generatedForms.push(form);
      } catch (error) {
        console.error(`Error generating form ${formId} for stage ${stage}:`, error);
      }
    }
    
    return generatedForms;
  }

  // Keep existing methods for backward compatibility
  /**
   * Generate FDA Form 3514 - CDRH Cover Sheet
   */
  async generateForm3514(projectData: any) {
    const { fda510kProject, organization, workflowData, formData, project } = projectData;
    
    // Extract data from various sources
    const applicantName = organization?.name || 'Not Specified';
    const deviceName = fda510kProject?.deviceName || formData?.device_specs?.deviceName || 'Not Specified';
    const deviceClass = fda510kProject?.deviceClassification || formData?.device_specs?.deviceClassification || 'Class II';
    const productCode = fda510kProject?.productCode || formData?.device_specs?.productCode || '';
    const regulationNumber = fda510kProject?.regulationNumber || formData?.device_specs?.regulationNumber || '';
    
    // Get contact information from workflow or metadata
    const contactName = workflowData?.setup?.projectLead || projectData?.metadata?.projectLead || '';
    const contactPhone = workflowData?.manufacturerInfo?.contactPhone || organization?.contactPhone || '';
    const contactEmail = workflowData?.manufacturerInfo?.contactEmail || organization?.contactEmail || '';
    const establishmentNumber = workflowData?.manufacturerInfo?.establishmentNumber || '';
    
    const formData3514 = {
      applicantName,
      deviceName,
      deviceClass,
      productCode,
      regulationNumber,
      contactName,
      contactPhone,
      contactEmail,
      establishmentNumber,
      submissionType: 'Traditional 510(k)',
      submissionDate: new Date().toLocaleDateString()
    };

    // Calculate completeness
    const requiredFields = ['applicantName', 'deviceName', 'deviceClass', 'productCode'];
    const filledFields = requiredFields.filter(field => (formData3514 as any)[field] && (formData3514 as any)[field] !== 'Not Specified');
    const completeness = Math.round((filledFields.length / requiredFields.length) * 100);

    // Generate HTML content
    const htmlContent = this.generateForm3514HTML(formData3514);

    return {
      name: 'FDA Form 3514 - CDRH Premarket Notification Cover Sheet',
      formData: formData3514,
      htmlContent,
      completeness
    };
  }

  /**
   * Generate FDA Form 3601 - User Fee Cover Sheet
   */
  async generateForm3601(projectData: any) {
    const { fda510kProject, organization, workflowData } = projectData;
    
    const formData3601 = {
      applicantName: organization?.name || 'Not Specified',
      deviceName: fda510kProject?.deviceName || 'Not Specified',
      feeCategory: 'Standard 510(k)',
      paymentMethod: workflowData?.feeInfo?.paymentMethod || 'Check',
      referenceNumber: workflowData?.feeInfo?.referenceNumber || '',
      smallBusiness: workflowData?.feeInfo?.smallBusiness || false,
      feeAmount: workflowData?.feeInfo?.feeAmount || 19870, // FY2025 standard fee
      submissionDate: new Date().toLocaleDateString()
    };

    // Calculate completeness
    const requiredFields = ['applicantName', 'deviceName', 'feeCategory', 'paymentMethod', 'feeAmount'];
    const filledFields = requiredFields.filter(field => (formData3601 as any)[field] && (formData3601 as any)[field] !== 'Not Specified');
    const completeness = Math.round((filledFields.length / requiredFields.length) * 100);

    // Generate HTML content
    const htmlContent = this.generateForm3601HTML(formData3601);

    return {
      name: 'FDA Form 3601 - User Fee Cover Sheet',
      formData: formData3601,
      htmlContent,
      completeness
    };
  }

  /**
   * Generate FDA Form 3881 - Indications for Use
   */
  async generateForm3881(projectData: any) {
    const { fda510kProject, workflowData, formData } = projectData;
    
    // Get indications from multiple sources
    const intendedUse = formData?.intended_use?.intendedUse || 
                        workflowData?.device_information?.intendedUse || 
                        workflowData?.setup?.intendedUse || 
                        'Not Specified';
    
    const indications = formData?.intended_use?.indications || 
                       workflowData?.device_information?.indications || 
                       workflowData?.setup?.indications || 
                       'Not Specified';

    const formData3881 = {
      deviceName: fda510kProject?.deviceName || 'Not Specified',
      intendedUse,
      indications,
      prescriptionUse: workflowData?.device_information?.prescriptionUse !== false,
      overCounterUse: workflowData?.device_information?.overCounterUse === true,
      patientPopulation: workflowData?.device_information?.patientPopulation || '',
      predicateDevice: workflowData?.predicate_comparison?.predicateDevice || '',
      predicateK: workflowData?.predicate_comparison?.predicateKNumber || '',
      comparisonStatement: workflowData?.predicate_comparison?.comparisonStatement || ''
    };

    // Calculate completeness
    const requiredFields = ['deviceName', 'intendedUse', 'indications'];
    const filledFields = requiredFields.filter(field => (formData3881 as any)[field] && (formData3881 as any)[field] !== 'Not Specified');
    const completeness = Math.round((filledFields.length / requiredFields.length) * 100);

    // Generate HTML content
    const htmlContent = this.generateForm3881HTML(formData3881);

    return {
      name: 'FDA Form 3881 - Indications for Use Statement',
      formData: formData3881,
      htmlContent,
      completeness
    };
  }

  /**
   * Generate FDA Form 3654 - Certification/Disclosure Statement
   */
  async generateForm3654(projectData: any) {
    const { fda510kProject, organization, workflowData, project } = projectData;
    
    const formData3654 = {
      applicantName: organization?.name || 'Not Specified',
      deviceName: fda510kProject?.deviceName || 'Not Specified',
      certifierName: workflowData?.certification?.certifierName || workflowData?.setup?.projectLead || '',
      certifierTitle: workflowData?.certification?.certifierTitle || 'Regulatory Affairs Manager',
      certificationStatement: true,
      clinicalStudies: fda510kProject?.hasClinicalData || false,
      financialInterests: workflowData?.certification?.financialInterests || false,
      deviceCompliance: true,
      truthfulStatement: true,
      signatureDate: new Date().toLocaleDateString()
    };

    // Calculate completeness
    const requiredFields = ['applicantName', 'deviceName', 'certifierName', 'certifierTitle'];
    const filledFields = requiredFields.filter(field => (formData3654 as any)[field] && (formData3654 as any)[field] !== 'Not Specified');
    const completeness = Math.round((filledFields.length / requiredFields.length) * 100);

    // Generate HTML content
    const htmlContent = this.generateForm3654HTML(formData3654);

    return {
      name: 'FDA Form 3654 - Certification/Disclosure Statement',
      formData: formData3654,
      htmlContent,
      completeness
    };
  }

  /**
   * Generate HTML for Form 3514
   */
  private generateForm3514HTML(data: any): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; max-width: 8.5in; margin: 0 auto; padding: 20px; }
    .form-header { text-align: center; border: 2px solid black; padding: 10px; margin-bottom: 20px; }
    .form-title { font-size: 16px; font-weight: bold; }
    .form-number { font-size: 14px; margin-top: 5px; }
    .section { margin-bottom: 25px; }
    .section-title { font-weight: bold; font-size: 14px; border-bottom: 2px solid black; padding-bottom: 5px; margin-bottom: 10px; }
    .field-group { margin-bottom: 10px; }
    .field-label { font-weight: bold; display: inline-block; width: 200px; }
    .field-value { display: inline-block; border-bottom: 1px solid #666; min-width: 300px; padding: 2px; }
    .checkbox { margin-right: 5px; }
    .footer { margin-top: 40px; font-size: 12px; }
    @media print { body { margin: 0; padding: 10px; } }
  </style>
</head>
<body>
  <div class="form-header">
    <div class="form-title">DEPARTMENT OF HEALTH AND HUMAN SERVICES</div>
    <div class="form-title">FOOD AND DRUG ADMINISTRATION</div>
    <div class="form-number">FORM FDA 3514 (10/22)</div>
    <div class="form-title">CDRH PREMARKET NOTIFICATION 510(K) COVER SHEET</div>
  </div>

  <div class="section">
    <div class="section-title">APPLICANT INFORMATION</div>
    <div class="field-group">
      <span class="field-label">Applicant Name:</span>
      <span class="field-value">${data.applicantName}</span>
    </div>
    <div class="field-group">
      <span class="field-label">Contact Person:</span>
      <span class="field-value">${data.contactName || 'Not Provided'}</span>
    </div>
    <div class="field-group">
      <span class="field-label">Phone Number:</span>
      <span class="field-value">${data.contactPhone || 'Not Provided'}</span>
    </div>
    <div class="field-group">
      <span class="field-label">Email Address:</span>
      <span class="field-value">${data.contactEmail || 'Not Provided'}</span>
    </div>
    <div class="field-group">
      <span class="field-label">Establishment Registration:</span>
      <span class="field-value">${data.establishmentNumber || 'Not Provided'}</span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">DEVICE INFORMATION</div>
    <div class="field-group">
      <span class="field-label">Device Trade Name:</span>
      <span class="field-value">${data.deviceName}</span>
    </div>
    <div class="field-group">
      <span class="field-label">Device Classification:</span>
      <span class="field-value">${data.deviceClass}</span>
    </div>
    <div class="field-group">
      <span class="field-label">Product Code:</span>
      <span class="field-value">${data.productCode || 'Not Provided'}</span>
    </div>
    <div class="field-group">
      <span class="field-label">Regulation Number:</span>
      <span class="field-value">${data.regulationNumber || 'Not Provided'}</span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">SUBMISSION INFORMATION</div>
    <div class="field-group">
      <span class="field-label">Submission Type:</span>
      <span class="field-value">${data.submissionType}</span>
    </div>
    <div class="field-group">
      <span class="field-label">Date Prepared:</span>
      <span class="field-value">${data.submissionDate}</span>
    </div>
  </div>

  <div class="footer">
    <p>This form is automatically generated from workflow data. Please review all information for accuracy before submission.</p>
    <p>Form FDA 3514 (10/22)</p>
  </div>
</body>
</html>`;
  }

  /**
   * Generate HTML for Form 3601
   */
  private generateForm3601HTML(data: any): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; max-width: 8.5in; margin: 0 auto; padding: 20px; }
    .form-header { text-align: center; border: 2px solid black; padding: 10px; margin-bottom: 20px; }
    .form-title { font-size: 16px; font-weight: bold; }
    .form-number { font-size: 14px; margin-top: 5px; }
    .section { margin-bottom: 25px; }
    .section-title { font-weight: bold; font-size: 14px; border-bottom: 2px solid black; padding-bottom: 5px; margin-bottom: 10px; }
    .field-group { margin-bottom: 10px; }
    .field-label { font-weight: bold; display: inline-block; width: 200px; }
    .field-value { display: inline-block; border-bottom: 1px solid #666; min-width: 300px; padding: 2px; }
    .checkbox-group { margin: 10px 0; }
    .checkbox { margin-right: 5px; }
    .fee-box { border: 2px solid black; padding: 15px; margin: 20px 0; background: #f9f9f9; }
    .footer { margin-top: 40px; font-size: 12px; }
    @media print { body { margin: 0; padding: 10px; } }
  </style>
</head>
<body>
  <div class="form-header">
    <div class="form-title">DEPARTMENT OF HEALTH AND HUMAN SERVICES</div>
    <div class="form-title">FOOD AND DRUG ADMINISTRATION</div>
    <div class="form-number">FORM FDA 3601 (09/22)</div>
    <div class="form-title">MEDICAL DEVICE USER FEE COVER SHEET</div>
  </div>

  <div class="section">
    <div class="section-title">APPLICANT INFORMATION</div>
    <div class="field-group">
      <span class="field-label">Applicant Name:</span>
      <span class="field-value">${data.applicantName}</span>
    </div>
    <div class="field-group">
      <span class="field-label">Device Name:</span>
      <span class="field-value">${data.deviceName}</span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">FEE INFORMATION</div>
    <div class="field-group">
      <span class="field-label">Fee Category:</span>
      <span class="field-value">${data.feeCategory}</span>
    </div>
    <div class="fee-box">
      <div class="field-group">
        <span class="field-label">FY 2025 Fee Amount:</span>
        <span class="field-value">$${data.feeAmount?.toLocaleString() || '19,870'}</span>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" class="checkbox" ${data.smallBusiness ? 'checked' : ''}>
        <label>Small Business Qualified (Reduced Fee Applies)</label>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">PAYMENT METHOD</div>
    <div class="checkbox-group">
      <input type="checkbox" class="checkbox" ${data.paymentMethod === 'Check' ? 'checked' : ''}>
      <label>Check (Made payable to FDA)</label>
    </div>
    <div class="checkbox-group">
      <input type="checkbox" class="checkbox" ${data.paymentMethod === 'Wire Transfer' ? 'checked' : ''}>
      <label>Wire Transfer</label>
    </div>
    <div class="checkbox-group">
      <input type="checkbox" class="checkbox" ${data.paymentMethod === 'Credit Card' ? 'checked' : ''}>
      <label>Credit Card (Complete FDA Form 3602A)</label>
    </div>
    <div class="field-group" style="margin-top: 15px;">
      <span class="field-label">Payment Reference:</span>
      <span class="field-value">${data.referenceNumber || 'Will be provided upon payment'}</span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">CERTIFICATION</div>
    <p>I certify that the information provided is complete and accurate and that the appropriate user fee has been paid.</p>
    <div class="field-group" style="margin-top: 20px;">
      <span class="field-label">Date:</span>
      <span class="field-value">${data.submissionDate}</span>
    </div>
  </div>

  <div class="footer">
    <p>This form is automatically generated from workflow data. Please review all information for accuracy before submission.</p>
    <p>Form FDA 3601 (09/22)</p>
  </div>
</body>
</html>`;
  }

  /**
   * Generate HTML for Form 3881
   */
  private generateForm3881HTML(data: any): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; max-width: 8.5in; margin: 0 auto; padding: 20px; }
    .form-header { text-align: center; border: 2px solid black; padding: 10px; margin-bottom: 20px; }
    .form-title { font-size: 16px; font-weight: bold; }
    .form-number { font-size: 14px; margin-top: 5px; }
    .section { margin-bottom: 25px; }
    .section-title { font-weight: bold; font-size: 14px; border-bottom: 2px solid black; padding-bottom: 5px; margin-bottom: 10px; }
    .field-group { margin-bottom: 15px; }
    .field-label { font-weight: bold; display: block; margin-bottom: 5px; }
    .field-value { display: block; border: 1px solid #666; min-height: 60px; padding: 8px; white-space: pre-wrap; }
    .checkbox-group { margin: 15px 0; }
    .checkbox { margin-right: 5px; }
    .comparison-box { border: 2px solid #333; padding: 15px; margin: 20px 0; background: #f9f9f9; }
    .footer { margin-top: 40px; font-size: 12px; }
    @media print { body { margin: 0; padding: 10px; } }
  </style>
</head>
<body>
  <div class="form-header">
    <div class="form-title">DEPARTMENT OF HEALTH AND HUMAN SERVICES</div>
    <div class="form-title">FOOD AND DRUG ADMINISTRATION</div>
    <div class="form-number">FORM FDA 3881 (08/22)</div>
    <div class="form-title">INDICATIONS FOR USE STATEMENT</div>
  </div>

  <div class="section">
    <div class="field-group">
      <span class="field-label">510(k) Number (if known):</span>
      <span class="field-value" style="min-height: 30px;">K${new Date().getFullYear()}XXXX</span>
    </div>
    <div class="field-group">
      <span class="field-label">Device Name:</span>
      <span class="field-value" style="min-height: 30px;">${data.deviceName}</span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">INDICATIONS FOR USE</div>
    <div class="field-group">
      <span class="field-label">Intended Use:</span>
      <div class="field-value">${data.intendedUse}</div>
    </div>
    <div class="field-group">
      <span class="field-label">Indications for Use:</span>
      <div class="field-value">${data.indications}</div>
    </div>
    ${data.patientPopulation ? `
    <div class="field-group">
      <span class="field-label">Patient Population:</span>
      <div class="field-value">${data.patientPopulation}</div>
    </div>
    ` : ''}
  </div>

  <div class="section">
    <div class="section-title">TYPE OF USE</div>
    <div class="checkbox-group">
      <input type="checkbox" class="checkbox" ${data.prescriptionUse ? 'checked' : ''}>
      <label><strong>Prescription Use</strong> (Part 21 CFR 801 Subpart D)</label>
    </div>
    <div class="checkbox-group">
      <input type="checkbox" class="checkbox" ${data.overCounterUse ? 'checked' : ''}>
      <label><strong>Over-The-Counter Use</strong> (Part 21 CFR 807 Subpart C)</label>
    </div>
  </div>

  ${data.predicateDevice || data.predicateK ? `
  <div class="comparison-box">
    <div class="section-title">COMPARISON TO PREDICATE DEVICE</div>
    <div class="field-group">
      <span class="field-label">Predicate Device:</span>
      <div class="field-value" style="min-height: 30px;">${data.predicateDevice || 'Not Provided'}</div>
    </div>
    <div class="field-group">
      <span class="field-label">Predicate 510(k) Number:</span>
      <div class="field-value" style="min-height: 30px;">${data.predicateK || 'Not Provided'}</div>
    </div>
    ${data.comparisonStatement ? `
    <div class="field-group">
      <span class="field-label">Comparison Statement:</span>
      <div class="field-value">${data.comparisonStatement}</div>
    </div>
    ` : ''}
  </div>
  ` : ''}

  <div class="section" style="margin-top: 40px;">
    <p><strong>PLEASE DO NOT WRITE BELOW THIS LINE – CONTINUE ON ANOTHER PAGE IF NEEDED</strong></p>
    <hr style="border: 1px solid black;">
    <p style="font-size: 12px; margin-top: 10px;">FOR FDA USE ONLY</p>
    <p style="font-size: 12px;">Concurrence of CDRH Office of Device Evaluation (ODE)</p>
  </div>

  <div class="footer">
    <p>This form is automatically generated from workflow data. Please review all information for accuracy before submission.</p>
    <p>Form FDA 3881 (08/22)</p>
  </div>
</body>
</html>`;
  }

  /**
   * Generate HTML for Form 3654
   */
  private generateForm3654HTML(data: any): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; max-width: 8.5in; margin: 0 auto; padding: 20px; }
    .form-header { text-align: center; border: 2px solid black; padding: 10px; margin-bottom: 20px; }
    .form-title { font-size: 16px; font-weight: bold; }
    .form-number { font-size: 14px; margin-top: 5px; }
    .section { margin-bottom: 25px; }
    .section-title { font-weight: bold; font-size: 14px; border-bottom: 2px solid black; padding-bottom: 5px; margin-bottom: 10px; }
    .field-group { margin-bottom: 10px; }
    .field-label { font-weight: bold; display: inline-block; width: 200px; }
    .field-value { display: inline-block; border-bottom: 1px solid #666; min-width: 300px; padding: 2px; }
    .checkbox-group { margin: 15px 0; }
    .checkbox { margin-right: 5px; }
    .certification-box { border: 2px solid black; padding: 20px; margin: 20px 0; background: #f9f9f9; }
    .signature-line { border-bottom: 1px solid black; width: 300px; display: inline-block; margin-right: 20px; }
    .footer { margin-top: 40px; font-size: 12px; }
    @media print { body { margin: 0; padding: 10px; } }
  </style>
</head>
<body>
  <div class="form-header">
    <div class="form-title">DEPARTMENT OF HEALTH AND HUMAN SERVICES</div>
    <div class="form-title">FOOD AND DRUG ADMINISTRATION</div>
    <div class="form-number">FORM FDA 3654 (12/21)</div>
    <div class="form-title">CERTIFICATION AND DISCLOSURE STATEMENT</div>
    <div style="margin-top: 5px;">510(k) PREMARKET NOTIFICATION</div>
  </div>

  <div class="section">
    <div class="section-title">SUBMISSION INFORMATION</div>
    <div class="field-group">
      <span class="field-label">Applicant/Sponsor:</span>
      <span class="field-value">${data.applicantName}</span>
    </div>
    <div class="field-group">
      <span class="field-label">Device Name:</span>
      <span class="field-value">${data.deviceName}</span>
    </div>
  </div>

  <div class="certification-box">
    <div class="section-title">CERTIFICATION</div>
    <p style="text-align: justify; line-height: 1.6;">
      I certify that, in my capacity as <strong>${data.certifierTitle || '(Title)'}</strong> of 
      <strong>${data.applicantName}</strong>, I believe to the best of my knowledge, that all data and 
      information submitted in the premarket notification are truthful and accurate and that no material 
      fact has been omitted.
    </p>
    
    <div class="checkbox-group" style="margin-top: 20px;">
      <input type="checkbox" class="checkbox" ${data.deviceCompliance ? 'checked' : ''}>
      <label>I certify that the device complies with the applicable requirements of 21 CFR Part 820 (Quality System Regulation)</label>
    </div>
    
    <div class="checkbox-group">
      <input type="checkbox" class="checkbox" ${data.truthfulStatement ? 'checked' : ''}>
      <label>I certify that all statements made in this submission are true and accurate</label>
    </div>
  </div>

  <div class="section">
    <div class="section-title">CLINICAL INVESTIGATIONS</div>
    <div class="checkbox-group">
      <input type="checkbox" class="checkbox" ${data.clinicalStudies ? 'checked' : ''}>
      <label><strong>Clinical studies WERE conducted</strong> to support this 510(k)</label>
    </div>
    <div class="checkbox-group">
      <input type="checkbox" class="checkbox" ${!data.clinicalStudies ? 'checked' : ''}>
      <label><strong>Clinical studies WERE NOT conducted</strong> to support this 510(k)</label>
    </div>
    
    ${data.clinicalStudies ? `
    <div style="margin-left: 30px; margin-top: 15px;">
      <p><strong>If clinical studies were conducted:</strong></p>
      <div class="checkbox-group">
        <input type="checkbox" class="checkbox" ${!data.financialInterests ? 'checked' : ''}>
        <label>No financial interests to disclose (Form FDA 3455 attached)</label>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" class="checkbox" ${data.financialInterests ? 'checked' : ''}>
        <label>Financial interests disclosed (Form FDA 3454 attached)</label>
      </div>
    </div>
    ` : ''}
  </div>

  <div class="section">
    <div class="section-title">AUTHORIZED SIGNATURE</div>
    <p>I am aware that there are significant penalties for submitting false information including the possibility that 
    FDA will debar me and/or the sponsor from submitting or assisting in the submission of any premarket notification.</p>
    
    <div style="margin-top: 30px;">
      <div style="margin-bottom: 20px;">
        <span class="signature-line"></span>
        <span class="signature-line"></span>
      </div>
      <div>
        <span style="display: inline-block; width: 300px;">
          <strong>Signature:</strong> ${data.certifierName || ''}
        </span>
        <span style="display: inline-block; width: 300px;">
          <strong>Date:</strong> ${data.signatureDate}
        </span>
      </div>
      <div style="margin-top: 10px;">
        <span style="display: inline-block; width: 300px;">
          <strong>Typed Name:</strong> ${data.certifierName || ''}
        </span>
        <span style="display: inline-block; width: 300px;">
          <strong>Title:</strong> ${data.certifierTitle}
        </span>
      </div>
    </div>
  </div>

  <div class="footer">
    <p>This form is automatically generated from workflow data. Please review all information for accuracy before submission.</p>
    <p>Form FDA 3654 (12/21)</p>
  </div>
</body>
</html>`;
  }
}