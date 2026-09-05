import { FDAFormsRegistry, FDA_FORMS_RELEASE_READINESS, FormField, FDAFormDefinition, governedFormDefinition, getRequiredForms, getFormsForStage } from '../config/FDAFormsRegistry';

/**
 * HTML-escape one interpolated value.
 *
 * This existed already — scoped INSIDE `generateUniversalFormHTML`, where the
 * four legacy builders (3514, 3601, 3881, 3654) could not reach it. They
 * interpolated applicant, device and certifier fields raw into stored FDA form
 * drafts, and those builders are LIVE: `server/routes/fda-forms.routes.ts`
 * calls all four from a router mounted unconditionally at `/api/fda-forms`.
 *
 * An applicant named "Smith & Nephew", or a device name containing `<`, silently
 * corrupts a stored Form 3514 draft that carries a compliance score and an audit
 * entry asserting it was generated correctly. Stored-XSS is latent (no renderer
 * for these drafts exists today); the confirmed harm is document integrity, on a
 * document that goes to an agency.
 */
const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

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

      // Date fields are intentionally NOT auto-stamped with the system clock.
      // Signature / certification / submission dates must come from an explicit
      // user action or a governed event, never from new Date() at render time
      // (21 CFR Part 11). An unset date stays blank and is surfaced as missing if
      // the field is required, rather than silently fabricating a date.

      formData[field.id] = value ?? '';
      if (field.required && value !== null && value !== undefined && value !== '' && value !== false) filledCount++;
    }

    // Calculate completeness
    // A stub form with no fields defined is not "100% complete" — it has nothing
    // to complete. Only report 100 for a form that actually has fields and no
    // outstanding required ones.
    completeness = formDefinition.fields.length === 0
      ? 0
      : requiredCount > 0
        ? Math.round((filledCount / requiredCount) * 100)
        : 100;

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
    <title>${escapeHtml(formDefinition.title)}</title>
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
        <h1>FDA Form ${escapeHtml(formDefinition.formNumber)}</h1>
        <h2>${escapeHtml(formDefinition.title)}</h2>
        <p>Version: ${escapeHtml(formDefinition.version)} | Last Updated: ${escapeHtml(formDefinition.lastUpdated)}</p>
    </div>
    
    <div class="form-section">
        <h3>Form Information</h3>
        <p>${escapeHtml(formDefinition.description)}</p>
        <p><strong>Category:</strong> ${escapeHtml(formDefinition.category)}</p>
    </div>
    
    <div class="form-section">
        <h3>Form Fields</h3>`;
    
    // Add form fields
    for (const field of formDefinition.fields) {
      const value = formData[field.id] ?? '';
      html += `
        <div class="field-group">
            <label class="field-label">${escapeHtml(field.label)}${field.required ? ' *' : ''}</label>`;
      
      switch (field.type) {
        case 'checkbox':
          html += `
            <input type="checkbox" class="checkbox" ${value ? 'checked' : ''} disabled />
            <span>${escapeHtml(field.label)}</span>`;
          break;
        case 'select':
          html += `
            <div class="field-value">
                <select disabled>
                    <option>${escapeHtml(value || 'Not Selected')}</option>
                </select>
            </div>`;
          break;
        case 'textarea':
          html += `
            <div class="field-value" style="min-height: 100px;">
                ${escapeHtml(value || 'Not Provided')}
            </div>`;
          break;
        default:
          html += `
            <div class="field-value">
                ${escapeHtml(value || 'Not Provided')}
            </div>`;
      }
      
      html += `
        </div>`;
    }
    
    html += `
    </div>
    
    <div class="footer">
        <p><strong>Draft preview</strong> — not a governed record; finalize through the governed workflow.</p>
        <p><strong>Generated by:</strong> Concept2Cure Regulatory Platform</p>
        <p><em>This is an electronically generated draft. Review all values for accuracy before submission.</em></p>
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
    // Never fabricate a device classification. Class determines the entire
    // premarket pathway; asserting "Class II" for an unclassified device misstates
    // the regulatory class to CDRH. Absent an established classification, render it
    // as unset (and the completeness filter below correctly counts it unfilled).
    const deviceClass = fda510kProject?.deviceClassification || formData?.device_specs?.deviceClassification || 'Not Specified';
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
      // Date prepared/submitted comes from a governed event, not the render clock.
      submissionDate: ''
    };

    // Calculate completeness
    const requiredFields: (keyof typeof formData3514)[] = ['applicantName', 'deviceName', 'deviceClass', 'productCode'];
    const filledFields = requiredFields.filter(field => formData3514[field] && formData3514[field] !== 'Not Specified');
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
      // Never assert a fee posture the filer did not provide. A hardcoded
      // "Standard 510(k)" / $19,870 / not-small-business misstates the User Fee
      // Cover Sheet for a small-business or differently-categorized filer. Absent
      // explicit fee info, render unset (completeness below counts it unfilled).
      feeCategory: workflowData?.feeInfo?.feeCategory || 'Not Specified',
      paymentMethod: workflowData?.feeInfo?.paymentMethod || 'Not Specified',
      referenceNumber: workflowData?.feeInfo?.referenceNumber || '',
      smallBusiness:
        typeof workflowData?.feeInfo?.smallBusiness === 'boolean'
          ? workflowData.feeInfo.smallBusiness
          : undefined,
      feeAmount: workflowData?.feeInfo?.feeAmount ?? null,
      // Certification date comes from the actual signing/submission event, not now().
      submissionDate: ''
    };

    // Calculate completeness
    const requiredFields: (keyof typeof formData3601)[] = ['applicantName', 'deviceName', 'feeCategory', 'paymentMethod', 'feeAmount'];
    const filledFields = requiredFields.filter(field => formData3601[field] && formData3601[field] !== 'Not Specified');
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
      // Both opt-IN. These were asymmetric — OTC `=== true` but prescription
      // `!== false` — so a device with no device_information at all rendered a
      // Form 3881 asserting "Prescription Use (21 CFR 801 Subpart D)", a
      // regulatory-use classification nobody entered. Neither box is checked
      // until someone says which it is.
      prescriptionUse: workflowData?.device_information?.prescriptionUse === true,
      overCounterUse: workflowData?.device_information?.overCounterUse === true,
      patientPopulation: workflowData?.device_information?.patientPopulation || '',
      predicateDevice: workflowData?.predicate_comparison?.predicateDevice || '',
      predicateK: workflowData?.predicate_comparison?.predicateKNumber || '',
      comparisonStatement: workflowData?.predicate_comparison?.comparisonStatement || ''
    };

    // Calculate completeness
    const requiredFields: (keyof typeof formData3881)[] = ['deviceName', 'intendedUse', 'indications'];
    const filledFields = requiredFields.filter(field => formData3881[field] && formData3881[field] !== 'Not Specified');
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
      // Never fabricate the signer's title. It appears in the certification body
      // ("in my capacity as <title>") and the signature block of a Part 11
      // certification statement, so an invented 'Regulatory Affairs Manager'
      // asserts a capacity the signer never claimed — and it counted toward the
      // stored completeness. Blank until provided; the render shows '(Title)' and
      // the completeness calc treats it as unfilled (see below).
      certifierTitle: workflowData?.certification?.certifierTitle || '',
      // Certification attestations are the signer's to make — never hardcode them
      // true. Source each from an explicit input and default to false (unchecked)
      // so a generated draft never pre-certifies compliance the user hasn't affirmed.
      certificationStatement: workflowData?.certification?.certificationStatement === true,
      // Tri-state, never inferred from whether data was uploaded. The signer must
      // explicitly state whether clinical studies were conducted; until they do,
      // this is undefined and NEITHER box is checked (see render). Deriving "WERE
      // NOT conducted" from an absent `hasClinicalData` would put an affirmative
      // negative certification the signer never made onto a Part 11 statement.
      clinicalStudies:
        typeof workflowData?.certification?.clinicalStudiesConducted === 'boolean'
          ? workflowData.certification.clinicalStudiesConducted
          : undefined,
      // Tri-state, same rule as clinicalStudies above: a `|| false` default
      // auto-checked "No financial interests to disclose (Form FDA 3454
      // attached)" — an affirmative financial-disclosure certification the signer
      // never made. Until they explicitly state it, this is undefined and NEITHER
      // disclosure box is checked (see render).
      financialInterests:
        typeof workflowData?.certification?.financialInterests === 'boolean'
          ? workflowData.certification.financialInterests
          : undefined,
      deviceCompliance: workflowData?.certification?.deviceCompliance === true,
      truthfulStatement: workflowData?.certification?.truthfulStatement === true,
      // Never fabricate an execution date. A signature date comes from the actual
      // signing event (21 CFR Part 11), not the render clock; leave blank until signed.
      signatureDate: ''
    };

    // Calculate completeness
    const requiredFields: (keyof typeof formData3654)[] = ['applicantName', 'deviceName', 'certifierName', 'certifierTitle'];
    const filledFields = requiredFields.filter(field => formData3654[field] && formData3654[field] !== 'Not Specified');
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
      <span class="field-value">${escapeHtml(data.applicantName)}</span>
    </div>
    <div class="field-group">
      <span class="field-label">Contact Person:</span>
      <span class="field-value">${escapeHtml(data.contactName || 'Not Provided')}</span>
    </div>
    <div class="field-group">
      <span class="field-label">Phone Number:</span>
      <span class="field-value">${escapeHtml(data.contactPhone || 'Not Provided')}</span>
    </div>
    <div class="field-group">
      <span class="field-label">Email Address:</span>
      <span class="field-value">${escapeHtml(data.contactEmail || 'Not Provided')}</span>
    </div>
    <div class="field-group">
      <span class="field-label">Establishment Registration:</span>
      <span class="field-value">${escapeHtml(data.establishmentNumber || 'Not Provided')}</span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">DEVICE INFORMATION</div>
    <div class="field-group">
      <span class="field-label">Device Trade Name:</span>
      <span class="field-value">${escapeHtml(data.deviceName)}</span>
    </div>
    <div class="field-group">
      <span class="field-label">Device Classification:</span>
      <span class="field-value">${escapeHtml(data.deviceClass)}</span>
    </div>
    <div class="field-group">
      <span class="field-label">Product Code:</span>
      <span class="field-value">${escapeHtml(data.productCode || 'Not Provided')}</span>
    </div>
    <div class="field-group">
      <span class="field-label">Regulation Number:</span>
      <span class="field-value">${escapeHtml(data.regulationNumber || 'Not Provided')}</span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">SUBMISSION INFORMATION</div>
    <div class="field-group">
      <span class="field-label">Submission Type:</span>
      <span class="field-value">${escapeHtml(data.submissionType)}</span>
    </div>
    <div class="field-group">
      <span class="field-label">Date Prepared:</span>
      <span class="field-value">${escapeHtml(data.submissionDate)}</span>
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
      <span class="field-value">${escapeHtml(data.applicantName)}</span>
    </div>
    <div class="field-group">
      <span class="field-label">Device Name:</span>
      <span class="field-value">${escapeHtml(data.deviceName)}</span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">FEE INFORMATION</div>
    <div class="field-group">
      <span class="field-label">Fee Category:</span>
      <span class="field-value">${escapeHtml(data.feeCategory)}</span>
    </div>
    <div class="fee-box">
      <div class="field-group">
        <span class="field-label">FY 2025 Fee Amount:</span>
        <span class="field-value">${data.feeAmount != null ? '$' + Number(data.feeAmount).toLocaleString() : 'Not Specified'}</span>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" class="checkbox" ${data.smallBusiness === true ? 'checked' : ''}>
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
      <span class="field-value">${escapeHtml(data.referenceNumber || 'Will be provided upon payment')}</span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">CERTIFICATION</div>
    <p>I certify that the information provided is complete and accurate and that the appropriate user fee has been paid.</p>
    <div class="field-group" style="margin-top: 20px;">
      <span class="field-label">Date:</span>
      <span class="field-value">${escapeHtml(data.submissionDate)}</span>
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
      <span class="field-value" style="min-height: 30px;">(assigned by FDA upon receipt)</span>
    </div>
    <div class="field-group">
      <span class="field-label">Device Name:</span>
      <span class="field-value" style="min-height: 30px;">${escapeHtml(data.deviceName)}</span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">INDICATIONS FOR USE</div>
    <div class="field-group">
      <span class="field-label">Intended Use:</span>
      <div class="field-value">${escapeHtml(data.intendedUse)}</div>
    </div>
    <div class="field-group">
      <span class="field-label">Indications for Use:</span>
      <div class="field-value">${escapeHtml(data.indications)}</div>
    </div>
    ${data.patientPopulation ? `
    <div class="field-group">
      <span class="field-label">Patient Population:</span>
      <div class="field-value">${escapeHtml(data.patientPopulation)}</div>
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
      <div class="field-value" style="min-height: 30px;">${escapeHtml(data.predicateDevice || 'Not Provided')}</div>
    </div>
    <div class="field-group">
      <span class="field-label">Predicate 510(k) Number:</span>
      <div class="field-value" style="min-height: 30px;">${escapeHtml(data.predicateK || 'Not Provided')}</div>
    </div>
    ${data.comparisonStatement ? `
    <div class="field-group">
      <span class="field-label">Comparison Statement:</span>
      <div class="field-value">${escapeHtml(data.comparisonStatement)}</div>
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
      <span class="field-value">${escapeHtml(data.applicantName)}</span>
    </div>
    <div class="field-group">
      <span class="field-label">Device Name:</span>
      <span class="field-value">${escapeHtml(data.deviceName)}</span>
    </div>
  </div>

  <div class="certification-box">
    <div class="section-title">CERTIFICATION</div>
    <p style="text-align: justify; line-height: 1.6;">
      I certify that, in my capacity as <strong>${escapeHtml(data.certifierTitle || '(Title)')}</strong> of 
      <strong>${escapeHtml(data.applicantName)}</strong>, I believe to the best of my knowledge, that all data and 
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
      <input type="checkbox" class="checkbox" ${data.clinicalStudies === true ? 'checked' : ''}>
      <label><strong>Clinical studies WERE conducted</strong> to support this 510(k)</label>
    </div>
    <div class="checkbox-group">
      <input type="checkbox" class="checkbox" ${data.clinicalStudies === false ? 'checked' : ''}>
      <label><strong>Clinical studies WERE NOT conducted</strong> to support this 510(k)</label>
    </div>
    
    ${data.clinicalStudies ? `
    <div style="margin-left: 30px; margin-top: 15px;">
      <p><strong>If clinical studies were conducted:</strong></p>
      <div class="checkbox-group">
        <input type="checkbox" class="checkbox" ${data.financialInterests === false ? 'checked' : ''}>
        <label>No financial interests to disclose (Form FDA 3454 attached)</label>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" class="checkbox" ${data.financialInterests === true ? 'checked' : ''}>
        <label>Financial interests disclosed (Form FDA 3455 attached)</label>
      </div>
      ${data.financialInterests === undefined ? `
      <div class="field-value"><em>Financial-interest disclosure not yet recorded &mdash; neither box
      is checked until the certifier states which applies.</em></div>
      ` : ''}
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
          <strong>Signature:</strong> ${escapeHtml(data.certifierName || '')}
        </span>
        <span style="display: inline-block; width: 300px;">
          <strong>Date:</strong> ${escapeHtml(data.signatureDate)}
        </span>
      </div>
      <div style="margin-top: 10px;">
        <span style="display: inline-block; width: 300px;">
          <strong>Typed Name:</strong> ${escapeHtml(data.certifierName || '')}
        </span>
        <span style="display: inline-block; width: 300px;">
          <strong>Title:</strong> ${escapeHtml(data.certifierTitle)}
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

  /** Client-release gate shared by FDA discovery and editable draft generation. */
  static readonly RELEASE_READINESS = FDA_FORMS_RELEASE_READINESS;

  /** List governed definitions from the existing canonical FDA registry. */
  listGovernedForms(input: Record<string, unknown> = {}) {
    const category = typeof input.category === 'string' ? input.category : undefined;
    const status = typeof input.implementationStatus === 'string' ? input.implementationStatus : undefined;
    const forms = Object.values(FDAFormsRegistry)
      .map(governedFormDefinition)
      .filter((form) => !category || form.category === category)
      .filter((form) => !status || form.implementationStatus === status)
      .map(({ formId, formNumber, title, category: formCategory, version, implementationStatus, fields, governance }) => ({
        formId, formNumber, title, category: formCategory, version, implementationStatus,
        fieldCount: fields.length, workflow: governance,
      }));
    return { forms, total: forms.length, canonicalRegistry: true, releaseReadiness: FDAFormGenerator.RELEASE_READINESS };
  }

  /** Prepare any registered form as an editor-compatible, structured governed draft. */
  prepareEditableDraft(input: Record<string, unknown>) {
    const formId = String(input.formId ?? '');
    const rawDefinition = FDAFormsRegistry[formId];
    const definition = rawDefinition ? governedFormDefinition(rawDefinition) : undefined;
    if (!definition) return { error: 'UNKNOWN_FORM', message: `Unknown canonical FDA form: ${formId}` };
    const reason = typeof input.reasonForChange === 'string' && input.reasonForChange.trim()
      ? input.reasonForChange.trim() : 'Initial editable FDA form draft';
    return this.buildEditableDraft(definition, this.formValues(input.values), reason);
  }

  /** Amend into a new draft; never mutate the supplied map or an approved version. */
  amendEditableDraft(input: Record<string, unknown>) {
    const formId = String(input.formId ?? '');
    const rawDefinition = FDAFormsRegistry[formId];
    const definition = rawDefinition ? governedFormDefinition(rawDefinition) : undefined;
    if (!definition) return { error: 'UNKNOWN_FORM', message: `Unknown canonical FDA form: ${formId}` };
    const reason = typeof input.reasonForChange === 'string' ? input.reasonForChange.trim() : '';
    if (!reason) return { error: 'REASON_REQUIRED', message: 'A reason for change is required to amend a governed FDA form.' };
    return this.buildEditableDraft(definition, { ...this.formValues(input.currentValues), ...this.formValues(input.changes) }, reason);
  }

  private formValues(value: unknown): Record<string, string | number | boolean | null> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, string | number | boolean | null> : {};
  }

  private blank(value: unknown): boolean {
    return value === undefined || value === null || value === '' || value === false;
  }

  private validateEditableValues(definition: FDAFormDefinition, values: Record<string, string | number | boolean | null>) {
    const known = new Set(definition.fields.map((field) => field.id));
    const unknownFields = Object.keys(values).filter((id) => !known.has(id));
    const requiredIds = new Set(definition.fields.filter((field) => field.required && this.blank(values[field.id])).map((field) => field.id));
    for (const rule of definition.conditionalLogic ?? []) {
      const actual = values[rule.when.fieldId];
      const matches = rule.when.operator === 'equals' ? actual === rule.when.value
        : rule.when.operator === 'not_equals' ? actual !== rule.when.value
          : rule.when.operator === 'truthy' ? !this.blank(actual) : this.blank(actual);
      if (matches && rule.effect === 'required') for (const fieldId of rule.fieldIds) if (this.blank(values[fieldId])) requiredIds.add(fieldId);
    }
    const missingRequired = definition.fields.map((field) => field.id).filter((id) => requiredIds.has(id));
    const validationErrors: Array<{ fieldId: string; code: string; message: string }> = [];
    for (const field of definition.fields) {
      const value = values[field.id];
      if (!this.blank(value)) {
        const validType = field.type === 'checkbox' ? typeof value === 'boolean'
          : field.type === 'number' ? typeof value === 'number' && Number.isFinite(value)
            : typeof value === 'string';
        if (!validType) {
          validationErrors.push({ fieldId: field.id, code: 'INVALID_TYPE', message: `${field.label} must be a ${field.type} value` });
          continue;
        }
        if (field.type === 'date' && typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(value))
          validationErrors.push({ fieldId: field.id, code: 'INVALID_DATE', message: `${field.label} must use YYYY-MM-DD` });
      }
      if (field.options && typeof value === 'string' && value && !field.options.includes(value))
        validationErrors.push({ fieldId: field.id, code: 'INVALID_OPTION', message: `${field.label} must be one of: ${field.options.join(', ')}` });
      if (field.maxLength && typeof value === 'string' && value.length > field.maxLength)
        validationErrors.push({ fieldId: field.id, code: 'MAX_LENGTH', message: `${field.label} exceeds ${field.maxLength} characters` });
    }
    return { unknownFields, missingRequired, validationErrors };
  }

  private buildEditableDraft(definition: FDAFormDefinition, values: Record<string, string | number | boolean | null>, reasonForChange: string) {
    const verdict = this.validateEditableValues(definition, values);
    if (verdict.unknownFields.length) return { error: 'UNKNOWN_FIELDS', message: `Unknown fields for ${definition.formId}: ${verdict.unknownFields.join(', ')}`, ...verdict };
    const render = (field: FormField) => field.type === 'checkbox' ? (values[field.id] === true ? '☒ Yes' : '☐ No')
      : this.blank(values[field.id]) ? '_Not provided_' : String(values[field.id]);
    const content = [
      `# FDA Form ${definition.formNumber} — ${definition.title}`, '',
      `> Editable governed draft · canonical ID: ${definition.formId} · registry version: ${definition.version}`,
      `> Reason for change: ${reasonForChange}`,
      `<!-- FDA_FORM_DATA_BASE64 ${Buffer.from(JSON.stringify({ formId: definition.formId, formVersion: definition.version, values }), 'utf8').toString('base64')} -->`, '',
      ...definition.fields.flatMap((field) => [`## ${field.label}${field.required ? ' *' : ''}`, render(field), '']),
    ].join('\n');
    return {
      status: 'generated', title: `FDA Form ${definition.formNumber} — ${definition.title}`,
      documentType: `fda-form/${definition.formId}`, content, formId: definition.formId,
      formVersion: definition.version, values, ...verdict, workflow: definition.governance,
      editorTarget: 'document-studio', canvasTarget: 'ana-canvas',
      pdfAvailable: definition.implementationStatus === 'full' && definition.version !== 'unverified',
      draftPdfAvailable: definition.implementationStatus === 'full',
      releaseReadiness: FDAFormGenerator.RELEASE_READINESS, approvalStatus: 'draft', reasonForChange,
    };
  }

}
