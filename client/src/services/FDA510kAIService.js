/**
 * FDA 510(k) AI Assistance Service
 * 
 * Provides intelligent AI-powered content generation, suggestions, and oversight
 * for FDA 510(k) regulatory submissions. Ensures compliance and completeness.
 */

class FDA510kAIService {
  constructor() {
    this.baseUrl = '/api/ai-assistance';
    this.openAIKey = localStorage.getItem('OPENAI_API_KEY');
  }

  /**
   * Generate AI suggestions for a specific section based on device data
   * Includes automatic citations from Device Data Center files
   */
  async generateSectionContent(sectionNumber, deviceProfile, existingContent = '', deviceDataFiles = []) {
    const sectionPrompts = {
      '1.0': {
        title: 'Medical Device User Fee Cover Sheet',
        prompt: `Generate professional content for FDA Form 3601 Medical Device User Fee Cover Sheet for a ${deviceProfile.deviceName || 'medical device'}.
        
Device Information:
- Name: ${deviceProfile.deviceName}
- Manufacturer: ${deviceProfile.manufacturer}
- Classification: ${deviceProfile.mdClass || 'Class II'}
- Product Code: ${deviceProfile.productCode || '[To be determined]'}
- Intended Use: ${deviceProfile.intendedUse}

Generate complete cover sheet content including:
1. Applicant information section
2. Device identification
3. Fee category determination
4. Small business qualification (if applicable)
5. Contact information

Format as professional FDA submission content.`,
      },
      
      '4.0': {
        title: 'Indications for Use Statement',
        prompt: `Generate a comprehensive FDA Indications for Use Statement for ${deviceProfile.deviceName}.

Device Profile:
- Device Name: ${deviceProfile.deviceName}
- Intended Use: ${deviceProfile.intendedUse}
- Target Population: ${deviceProfile.targetPopulation || 'Healthcare professionals in clinical settings'}
- Clinical Setting: ${deviceProfile.clinicalSetting || 'Hospital/Clinical environment'}

Create a precise statement that includes:
1. Specific indications for use (what the device does)
2. Patient population (who it's for)
3. Clinical conditions addressed
4. Setting of use (hospital, home, etc.)
5. User profile (physician, nurse, patient, etc.)
6. Any limitations or contraindications

The statement must be:
- Clear and specific
- Consistent with predicate device scope
- Free of marketing claims
- Regulatory compliant

Format: "The [Device Name] is indicated for use [specific use] in [patient population] with [condition]. The device is intended for use by [user] in [setting]."`,
      },

      '5.0': {
        title: '510(k) Summary',
        prompt: `Generate a comprehensive 510(k) Summary per 21 CFR 807.92 for ${deviceProfile.deviceName}.

Device Information:
- Name: ${deviceProfile.deviceName}
- Manufacturer: ${deviceProfile.manufacturer}
- Classification: ${deviceProfile.mdClass}
- Intended Use: ${deviceProfile.intendedUse}
- Predicate Device: ${deviceProfile.predicateDevice || '[Predicate to be identified]'}

Include all required sections:
1. Date Prepared
2. Submitter Information (name, address, contact)
3. Device Identification (trade name, common name, classification)
4. Predicate Device Information
5. Device Description (detailed technical description)
6. Indications for Use
7. Technological Characteristics Comparison
8. Performance Data Summary
9. Standards Conformity
10. Substantial Equivalence Conclusion

Ensure the summary demonstrates substantial equivalence clearly.`,
      },

      '7.0': {
        title: 'Device Description',
        prompt: `Generate a detailed Device Description for ${deviceProfile.deviceName}.

Device Profile:
- Name: ${deviceProfile.deviceName}
- Type: ${deviceProfile.deviceType}
- Description: ${deviceProfile.description}
- Key Features: ${deviceProfile.keyFeatures}

Include comprehensive details on:
1. Physical Characteristics
   - Dimensions and weight
   - Materials of construction
   - Color and appearance
   
2. Functional Components
   - Major components and their functions
   - User interface elements
   - Control mechanisms
   
3. Principles of Operation
   - How the device works
   - Scientific/engineering principles
   - Energy source (if applicable)
   
4. Technical Specifications
   - Performance parameters
   - Operating ranges
   - Accuracy/precision specifications
   
5. Software (if applicable)
   - Level of concern
   - Key functions
   - User interface
   
6. Accessories and Compatible Devices

Provide detailed technical content suitable for FDA review.`,
      },

      '9.0': {
        title: 'Substantial Equivalence Discussion',
        prompt: `Generate a comprehensive Substantial Equivalence Discussion comparing ${deviceProfile.deviceName} to the predicate device.

Subject Device:
- Name: ${deviceProfile.deviceName}
- Intended Use: ${deviceProfile.intendedUse}
- Technology: ${deviceProfile.technology}

Predicate Device:
- Name: ${deviceProfile.predicateDevice || '[To be identified]'}
- 510(k) Number: ${deviceProfile.predicateKNumber || '[K Number]'}

Create a detailed comparison covering:
1. Intended Use Comparison
   - Demonstrate identical intended use
   - Address any differences in indications
   
2. Technological Characteristics
   - Design features comparison
   - Materials comparison
   - Operating principles
   - Performance specifications
   
3. Analysis of Differences
   - Identify all differences
   - Explain why differences don't affect safety/effectiveness
   - Provide supporting rationale
   
4. Performance Data
   - Bench testing comparisons
   - Standards compliance
   - Any clinical data (if applicable)
   
5. Conclusion
   - Clear statement of substantial equivalence
   - Summary of supporting evidence

Ensure the discussion definitively establishes substantial equivalence.`,
      },

      '10.0': {
        title: 'Proposed Labeling',
        prompt: `Generate comprehensive device labeling for ${deviceProfile.deviceName}.

Device Information:
- Name: ${deviceProfile.deviceName}
- Intended Use: ${deviceProfile.intendedUse}
- Prescription/OTC: ${deviceProfile.prescriptionDevice ? 'Prescription Use' : 'OTC'}

Create professional labeling including:
1. Device Label
   - Product name and model
   - Manufacturer information
   - Regulatory symbols (Rx if prescription)
   - Lot/Serial number fields
   
2. Instructions for Use (IFU)
   - Device description
   - Indications for use
   - Contraindications
   - Warnings and precautions
   - Step-by-step operating instructions
   - Maintenance and cleaning
   - Troubleshooting guide
   - Technical specifications
   - Symbols glossary
   
3. Package Insert Content
   - Clinical information
   - Performance data
   - Storage conditions
   
Ensure labeling meets 21 CFR Part 801 requirements.`,
      },

      '12.0': {
        title: 'Biocompatibility',
        prompt: `Generate a biocompatibility assessment for ${deviceProfile.deviceName} per ISO 10993-1:2018.

Device Information:
- Name: ${deviceProfile.deviceName}
- Patient Contact: ${deviceProfile.patientContact || 'Surface contact'}
- Contact Duration: ${deviceProfile.contactDuration || 'Limited (<24 hours)'}
- Materials: ${deviceProfile.materials || 'Medical grade materials'}

Create comprehensive content covering:
1. Device Categorization
   - Nature of body contact
   - Contact duration
   - ISO 10993-1 category determination
   
2. Materials Assessment
   - List all patient-contacting materials
   - Prior use history in cleared devices
   - Chemical characterization needs
   
3. Biological Evaluation Plan
   - Required tests per ISO 10993-1
   - Cytotoxicity assessment
   - Sensitization evaluation
   - Irritation testing
   - Systemic toxicity (if applicable)
   - Justification for any waived tests
   
4. Test Results Summary
   - Overview of all testing performed
   - Pass/fail results
   - Compliance with acceptance criteria
   
5. Conclusion
   - Statement of biocompatibility
   - Reference to test reports

Format as professional regulatory submission.`,
      },

      '15.0': {
        title: 'Performance Testing - Bench',
        prompt: `Generate comprehensive bench testing documentation for ${deviceProfile.deviceName}.

Device Specifications:
- Name: ${deviceProfile.deviceName}
- Type: ${deviceProfile.deviceType}
- Key Performance Parameters: ${deviceProfile.performanceSpecs}

Create detailed testing documentation including:
1. Test Overview
   - Rationale for testing
   - Standards applied
   - Test objectives
   
2. Test Methods
   - Mechanical testing (strength, durability, fatigue)
   - Functional testing (performance verification)
   - Environmental testing (temperature, humidity)
   - Electrical safety (if applicable)
   - Software verification (if applicable)
   
3. Acceptance Criteria
   - Specific pass/fail criteria
   - Statistical requirements
   - Sample size justification
   
4. Test Results
   - Summary tables
   - Statistical analysis
   - Comparison to specifications
   - Comparison to predicate
   
5. Conclusions
   - Performance meets specifications
   - Substantial equivalence to predicate
   - Safety and effectiveness demonstrated

Include specific test protocols and results summaries.`,
      }
    };

    const sectionConfig = sectionPrompts[sectionNumber];
    if (!sectionConfig) {
      return {
        success: false,
        error: 'Section not configured for AI assistance'
      };
    }

    try {
      // Check for OpenAI integration
      const hasOpenAI = await this.checkOpenAIIntegration();
      
      if (!hasOpenAI) {
        // Return template-based suggestion if no AI available
        return {
          success: true,
          content: this.getTemplateBasedContent(sectionNumber, deviceProfile, deviceDataFiles),
          source: 'template'
        };
      }

      // Prepare file context for citations
      let fileContext = '';
      if (deviceDataFiles && deviceDataFiles.length > 0) {
        fileContext = '\n\nAvailable Evidence Files for Citation:\n';
        deviceDataFiles.forEach((file, idx) => {
          fileContext += `${idx + 1}. ${file.file_name} (Category: ${file.category || 'N/A'}, Tags: ${file.tags?.join(', ') || 'N/A'})\n`;
        });
        fileContext += '\nPlease include citations to relevant files in brackets [filename] where appropriate in the generated content.';
      }
      
      // Call OpenAI API for intelligent content generation
      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: sectionConfig.prompt + fileContext,
          maxTokens: 2000,
          temperature: 0.7,
          systemPrompt: `You are an FDA regulatory expert helping prepare a 510(k) submission. 
          Generate professional, compliant content that meets FDA requirements. 
          Be specific, detailed, and accurate. Include all required elements.
          Format the content with proper HTML tags for structure (h3, p, ul, li, strong).
          Do not include placeholder text in brackets - provide specific professional content.`
        })
      });

      if (!response.ok) {
        throw new Error('AI generation failed');
      }

      const data = await response.json();
      
      return {
        success: true,
        content: data.content,
        source: 'ai',
        confidence: data.confidence || 0.95
      };
    } catch (error) {
      console.error('AI generation error:', error);
      // Fallback to template with citations
      return {
        success: true,
        content: this.getTemplateBasedContent(sectionNumber, deviceProfile, deviceDataFiles),
        source: 'template'
      };
    }
  }

  /**
   * Get template-based content when AI is not available
   * Includes auto-citations from Device Data Center files
   */
  getTemplateBasedContent(sectionNumber, deviceProfile, deviceDataFiles = []) {
    // Generate citation references
    let citations = '';
    if (deviceDataFiles && deviceDataFiles.length > 0) {
      citations = '\n\n<h4>References</h4>\n<ul>\n';
      deviceDataFiles.forEach(file => {
        citations += `<li>[${file.file_name}] - ${file.category || 'Supporting Documentation'}</li>\n`;
      });
      citations += '</ul>';
    }
    
    const templates = {
      '4.0': `<h3>Indications for Use Statement</h3>
<p><strong>Device Name:</strong> ${deviceProfile.deviceName || 'Medical Device'}</p>
<p><strong>Indications for Use:</strong></p>
<p>The ${deviceProfile.deviceName || 'device'} is indicated for use ${deviceProfile.intendedUse || 'in clinical settings for its intended medical purpose'}.</p>
<p><strong>Target Population:</strong> ${deviceProfile.targetPopulation || 'Patients requiring medical intervention'}</p>
<p><strong>Environment of Use:</strong> ${deviceProfile.environment || 'Professional healthcare facilities'}</p>
<p><strong>Prescription Device:</strong> This device is restricted to use by or on the order of a physician.</p>`,

      '5.0': `<h3>510(k) Summary</h3>
<p><strong>Date Prepared:</strong> ${new Date().toLocaleDateString()}</p>
<h4>Submitter Information</h4>
<p><strong>Company:</strong> ${deviceProfile.manufacturer || 'Manufacturing Company'}</p>
<p><strong>Contact Person:</strong> Regulatory Affairs Manager</p>
<h4>Device Identification</h4>
<p><strong>Trade Name:</strong> ${deviceProfile.deviceName}</p>
<p><strong>Common Name:</strong> ${deviceProfile.commonName || deviceProfile.deviceName}</p>
<p><strong>Classification:</strong> ${deviceProfile.mdClass || 'Class II'}</p>
<h4>Substantial Equivalence</h4>
<p>The ${deviceProfile.deviceName} has been shown to be substantially equivalent to legally marketed predicate devices.</p>`
    };

    return (templates[sectionNumber] || `<p>Content for ${deviceProfile.deviceName}</p>`) + citations;
  }

  /**
   * Provide real-time compliance checking
   */
  async checkCompliance(sectionNumber, content) {
    const issues = [];
    const suggestions = [];

    // Check for placeholder text
    if (content.includes('[') && content.includes(']')) {
      issues.push({
        type: 'error',
        message: 'Content contains placeholder text that must be replaced',
        severity: 'high'
      });
    }

    // Check minimum content length
    if (content.replace(/<[^>]*>/g, '').trim().length < 100) {
      issues.push({
        type: 'warning',
        message: 'Section content appears incomplete',
        severity: 'medium'
      });
    }

    // Section-specific checks
    if (sectionNumber === '4.0') {
      // Indications for Use checks
      if (!content.includes('indicated for use')) {
        issues.push({
          type: 'error',
          message: 'Indications statement must include "indicated for use" language',
          severity: 'high'
        });
      }
      if (!content.includes('Prescription') && !content.includes('Over-The-Counter')) {
        suggestions.push({
          type: 'suggestion',
          message: 'Specify whether this is a prescription or OTC device'
        });
      }
    }

    if (sectionNumber === '5.0') {
      // 510(k) Summary checks
      const requiredSections = ['Submitter Information', 'Device Identification', 'Predicate Device', 'Substantial Equivalence'];
      requiredSections.forEach(section => {
        if (!content.includes(section)) {
          issues.push({
            type: 'error',
            message: `Missing required section: ${section}`,
            severity: 'high'
          });
        }
      });
    }

    return {
      compliant: issues.filter(i => i.type === 'error').length === 0,
      issues,
      suggestions,
      score: Math.max(0, 100 - (issues.length * 10))
    };
  }

  /**
   * Get AI-powered suggestions for improving content
   */
  async getSuggestions(sectionNumber, currentContent, deviceProfile) {
    const suggestions = [];

    // Analyze current content
    const contentLength = currentContent.replace(/<[^>]*>/g, '').trim().length;
    
    if (contentLength < 200) {
      suggestions.push({
        type: 'expand',
        message: 'This section needs more detail. Consider adding specific technical information.',
        action: 'Add more comprehensive content'
      });
    }

    // Check for regulatory keywords
    const regulatoryTerms = ['intended use', 'indication', 'substantially equivalent', 'predicate', 'clearance'];
    const missingTerms = regulatoryTerms.filter(term => !currentContent.toLowerCase().includes(term));
    
    if (missingTerms.length > 0 && ['4.0', '5.0', '9.0'].includes(sectionNumber)) {
      suggestions.push({
        type: 'terminology',
        message: `Consider including regulatory terms: ${missingTerms.join(', ')}`,
        action: 'Add regulatory terminology'
      });
    }

    // Section-specific suggestions
    if (sectionNumber === '7.0' && !currentContent.includes('materials')) {
      suggestions.push({
        type: 'missing',
        message: 'Device description should include materials of construction',
        action: 'Add materials information'
      });
    }

    return suggestions;
  }

  /**
   * Check if OpenAI integration is available
   */
  async checkOpenAIIntegration() {
    try {
      const response = await fetch('/api/ai/status');
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Generate executive review summary
   */
  async generateReviewSummary(allSections) {
    const completedSections = allSections.filter(s => s.content && s.content.length > 100);
    const progress = (completedSections.length / allSections.length) * 100;

    return {
      overallProgress: progress,
      sectionsComplete: completedSections.length,
      totalSections: allSections.length,
      readyForSubmission: progress === 100,
      criticalIssues: [],
      recommendations: [
        'Complete all required sections before submission',
        'Ensure predicate device comparison is comprehensive',
        'Verify all testing data is included',
        'Review labeling for compliance with 21 CFR Part 801'
      ]
    };
  }
}

export default new FDA510kAIService();