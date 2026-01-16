// CMC Template Service for eCTD Module 3 templates
export class CMCTemplateService {
  static async getCMCTemplates() {
    return {
      templates: [
        {
          id: 'module-3-2-s',
          title: 'Module 3.2.S - Drug Substance',
          description: 'Complete template for drug substance documentation per ICH M4',
          sections: [
            '3.2.S.1 General Information',
            '3.2.S.2 Manufacture',
            '3.2.S.3 Characterisation',
            '3.2.S.4 Control of Drug Substance',
            '3.2.S.5 Reference Standards',
            '3.2.S.6 Container Closure System',
            '3.2.S.7 Stability',
          ],
          content: this.getDrugSubstanceTemplate(),
        },
        {
          id: 'module-3-2-p',
          title: 'Module 3.2.P - Drug Product',
          description: 'Complete template for drug product documentation per ICH M4',
          sections: [
            '3.2.P.1 Description and Composition',
            '3.2.P.2 Pharmaceutical Development',
            '3.2.P.3 Manufacture',
            '3.2.P.4 Control of Excipients',
            '3.2.P.5 Control of Drug Product',
            '3.2.P.6 Reference Standards',
            '3.2.P.7 Container Closure System',
            '3.2.P.8 Stability',
          ],
          content: this.getDrugProductTemplate(),
        },
        {
          id: 'analytical-methods',
          title: 'Analytical Methods Validation',
          description: 'ICH Q2(R1) compliant analytical method validation template',
          sections: [
            'Method Description',
            'Validation Parameters',
            'Acceptance Criteria',
            'Validation Results',
          ],
          content: this.getAnalyticalMethodsTemplate(),
        },
        {
          id: 'stability-protocol',
          title: 'Stability Study Protocol',
          description: 'ICH Q1A(R2) compliant stability study protocol template',
          sections: [
            'Study Design',
            'Storage Conditions',
            'Testing Schedule',
            'Acceptance Criteria',
          ],
          content: this.getStabilityProtocolTemplate(),
        },
      ],
    };
  }

  static getDrugSubstanceTemplate() {
    return `
      <h1>3.2.S Drug Substance</h1>
      
      <h2>3.2.S.1 General Information</h2>
      
      <h3>3.2.S.1.1 Nomenclature</h3>
      <p><strong>Recommended International Nonproprietary Name (INN):</strong> [Insert INN]</p>
      <p><strong>Chemical Name:</strong> [Insert IUPAC chemical name]</p>
      <p><strong>Company Code:</strong> [Insert internal company code]</p>
      <p><strong>Other Names:</strong> [Insert any other relevant names]</p>
      
      <h3>3.2.S.1.2 Structure</h3>
      <p><strong>Structural Formula:</strong> [Insert structural formula]</p>
      <p><strong>Molecular Formula:</strong> [Insert molecular formula]</p>
      <p><strong>Molecular Weight:</strong> [Insert molecular weight] Da</p>
      
      <h3>3.2.S.1.3 General Properties</h3>
      <p>The drug substance is a [describe physical state] with [describe key physicochemical properties].</p>
      
      <table>
        <tr><th>Property</th><th>Value</th><th>Method</th></tr>
        <tr><td>Appearance</td><td>[Description]</td><td>Visual inspection</td></tr>
        <tr><td>Solubility</td><td>[Value and units]</td><td>[Method reference]</td></tr>
        <tr><td>pH</td><td>[Range]</td><td>USP/Ph.Eur.</td></tr>
        <tr><td>Melting Point</td><td>[Temperature range]</td><td>DSC</td></tr>
      </table>
      
      <h2>3.2.S.2 Manufacture</h2>
      
      <h3>3.2.S.2.1 Manufacturer(s)</h3>
      <p><strong>Drug Substance Manufacturer:</strong></p>
      <p>[Company Name]<br>
      [Complete Address]<br>
      [Contact Information]</p>
      
      <p><strong>Responsibility:</strong> [Manufacturing and testing/Manufacturing only/Testing only]</p>
      
      <h3>3.2.S.2.2 Description of Manufacturing Process and Process Controls</h3>
      <p>The manufacturing process for [drug substance name] consists of the following steps:</p>
      
      <ol>
        <li><strong>Step 1:</strong> [Describe process step]
          <ul>
            <li>Critical process parameters: [List parameters]</li>
            <li>In-process controls: [Describe controls]</li>
          </ul>
        </li>
        <li><strong>Step 2:</strong> [Describe process step]
          <ul>
            <li>Critical process parameters: [List parameters]</li>
            <li>In-process controls: [Describe controls]</li>
          </ul>
        </li>
      </ol>
      
      <h3>3.2.S.2.3 Control of Materials</h3>
      <p>Raw materials and starting materials used in the manufacturing process are controlled as follows:</p>
      
      <table>
        <tr><th>Material</th><th>Grade</th><th>Specification</th><th>Supplier</th></tr>
        <tr><td>[Material name]</td><td>[Grade]</td><td>[Specification reference]</td><td>[Supplier name]</td></tr>
      </table>
      
      <h2>3.2.S.3 Characterisation</h2>
      
      <h3>3.2.S.3.1 Elucidation of Structure and other Characteristics</h3>
      <p>The structure of [drug substance name] has been confirmed using the following analytical techniques:</p>
      
      <ul>
        <li><strong>Nuclear Magnetic Resonance (NMR):</strong> 1H NMR and 13C NMR spectra confirm the proposed structure</li>
        <li><strong>Mass Spectrometry:</strong> Molecular ion peak at m/z [value] confirms molecular weight</li>
        <li><strong>Infrared Spectroscopy:</strong> Characteristic absorption bands confirm functional groups</li>
        <li><strong>Ultraviolet Spectroscopy:</strong> UV spectrum consistent with structure</li>
      </ul>
      
      <h3>3.2.S.3.2 Impurities</h3>
      <p>Impurities in the drug substance have been characterized and controlled according to ICH Q3A(R2) guidelines.</p>
      
      <table>
        <tr><th>Impurity</th><th>Structure</th><th>Limit (%)</th><th>Rationale</th></tr>
        <tr><td>[Impurity name]</td><td>[Structure or description]</td><td>[Limit]</td><td>[ICH threshold/Qualified level]</td></tr>
      </table>
      
      <h2>3.2.S.4 Control of Drug Substance</h2>
      
      <h3>3.2.S.4.1 Specification</h3>
      <p>The specification for [drug substance name] is based on data generated during development and stability studies.</p>
      
      <table>
        <tr><th>Test</th><th>Method</th><th>Acceptance Criteria</th></tr>
        <tr><td>Appearance</td><td>Visual inspection</td><td>[Description]</td></tr>
        <tr><td>Identification</td><td>HPLC retention time</td><td>Matches reference standard</td></tr>
        <tr><td>Identification</td><td>IR spectroscopy</td><td>Conforms to reference spectrum</td></tr>
        <tr><td>Assay</td><td>HPLC</td><td>98.0% - 102.0% (anhydrous basis)</td></tr>
        <tr><td>Related substances</td><td>HPLC</td><td>Individual: NMT 0.15%<br>Total: NMT 0.5%</td></tr>
        <tr><td>Water content</td><td>Karl Fischer</td><td>NMT 1.0%</td></tr>
        <tr><td>Residual solvents</td><td>GC</td><td>Per ICH Q3C(R8)</td></tr>
      </table>
      
      <h2>3.2.S.7 Stability</h2>
      
      <h3>3.2.S.7.1 Stability Summary and Conclusions</h3>
      <p>Stability studies have been conducted in accordance with ICH Q1A(R2) guidelines. The proposed retest period is [X] months when stored under the recommended storage conditions.</p>
      
      <p><strong>Recommended Storage Conditions:</strong> [Storage conditions]</p>
      
      <h3>3.2.S.7.3 Stability Data</h3>
      <p>Long-term stability data demonstrate that [drug substance name] remains within specification limits for [time period] under the proposed storage conditions.</p>
    `;
  }

  static getDrugProductTemplate() {
    return `
      <h1>3.2.P Drug Product</h1>
      
      <h2>3.2.P.1 Description and Composition of the Drug Product</h2>
      
      <p>The drug product is formulated as [dosage form] containing [amount] of [drug substance name] as the active pharmaceutical ingredient.</p>
      
      <h3>Composition</h3>
      <table>
        <tr><th>Component</th><th>Function</th><th>Quantity per [unit]</th><th>Quality Standard</th></tr>
        <tr><td>[Drug substance name]</td><td>Active ingredient</td><td>[Amount and units]</td><td>[Specification reference]</td></tr>
        <tr><td>[Excipient name]</td><td>[Function]</td><td>[Amount and units]</td><td>[Compendial standard]</td></tr>
      </table>
      
      <h2>3.2.P.2 Pharmaceutical Development</h2>
      
      <h3>3.2.P.2.1 Components of the Drug Product</h3>
      
      <h4>3.2.P.2.1.1 Drug Substance</h4>
      <p>The drug substance [name] was selected based on [rationale for selection, including physicochemical properties relevant to formulation].</p>
      
      <h4>3.2.P.2.1.2 Excipients</h4>
      <p>Excipients were selected based on their functionality and compatibility with the drug substance:</p>
      
      <ul>
        <li><strong>[Excipient name]:</strong> [Function and rationale for selection]</li>
        <li><strong>[Excipient name]:</strong> [Function and rationale for selection]</li>
      </ul>
      
      <h3>3.2.P.2.2 Drug Product</h3>
      
      <h4>3.2.P.2.2.1 Formulation Development</h4>
      <p>The formulation was developed considering the following factors:</p>
      <ul>
        <li>Route of administration: [Route]</li>
        <li>Target patient population: [Population]</li>
        <li>Dosing frequency: [Frequency]</li>
        <li>Stability requirements: [Requirements]</li>
      </ul>
      
      <h2>3.2.P.5 Control of Drug Product</h2>
      
      <h3>3.2.P.5.1 Specification(s)</h3>
      <p>The specification for the drug product is based on data generated during pharmaceutical development and stability studies.</p>
      
      <table>
        <tr><th>Test</th><th>Method</th><th>Acceptance Criteria</th></tr>
        <tr><td>Appearance</td><td>Visual inspection</td><td>[Description]</td></tr>
        <tr><td>Identification</td><td>HPLC</td><td>Retention time matches reference</td></tr>
        <tr><td>Assay</td><td>HPLC</td><td>90.0% - 110.0% of label claim</td></tr>
        <tr><td>Content uniformity</td><td>HPLC</td><td>AV ≤ 15.0</td></tr>
        <tr><td>Dissolution</td><td>USP Apparatus [X]</td><td>NLT 80% (Q) in [time] minutes</td></tr>
        <tr><td>Related substances</td><td>HPLC</td><td>Individual: NMT 0.2%<br>Total: NMT 1.0%</td></tr>
        <tr><td>Microbial limits</td><td>USP <61></td><td>Total aerobic count: NMT 10³ cfu/g<br>Total yeast and mold: NMT 10² cfu/g</td></tr>
      </table>
      
      <h2>3.2.P.8 Stability</h2>
      
      <h3>3.2.P.8.1 Stability Summary and Conclusion</h3>
      <p>Stability studies conducted according to ICH Q1A(R2) support a shelf life of [X] months when stored under the recommended conditions.</p>
      
      <p><strong>Recommended Storage:</strong> Store at [temperature range]. [Additional storage requirements]</p>
      
      <h3>3.2.P.8.3 Stability Data</h3>
      <p>Stability data demonstrate that the drug product remains within specification for the proposed shelf life under the recommended storage conditions.</p>
    `;
  }

  static getAnalyticalMethodsTemplate() {
    return `
      <h1>Analytical Method Validation</h1>
      
      <h2>Method Description</h2>
      <p><strong>Method Type:</strong> [HPLC/GC/Spectrophotometric]</p>
      <p><strong>Purpose:</strong> [Quantitative determination/Identity test/Impurity testing]</p>
      <p><strong>Sample Type:</strong> [Drug substance/Drug product]</p>
      
      <h2>Validation Parameters (per ICH Q2(R1))</h2>
      
      <h3>Specificity</h3>
      <p>The method is specific for [analyte] in the presence of [potential interferents].</p>
      
      <h3>Linearity</h3>
      <table>
        <tr><th>Parameter</th><th>Result</th><th>Acceptance Criteria</th></tr>
        <tr><td>Concentration range</td><td>[Range] µg/mL</td><td>80-120% of target concentration</td></tr>
        <tr><td>Correlation coefficient (r)</td><td>[Value]</td><td>≥ 0.999</td></tr>
        <tr><td>y-intercept</td><td>[Value]</td><td>≤ 2.0% of response at 100%</td></tr>
      </table>
      
      <h3>Accuracy</h3>
      <table>
        <tr><th>Level (%)</th><th>Mean Recovery (%)</th><th>RSD (%)</th></tr>
        <tr><td>80</td><td>[Value]</td><td>[Value]</td></tr>
        <tr><td>100</td><td>[Value]</td><td>[Value]</td></tr>
        <tr><td>120</td><td>[Value]</td><td>[Value]</td></tr>
      </table>
      <p><strong>Acceptance Criteria:</strong> 98.0-102.0% recovery, RSD ≤ 2.0%</p>
      
      <h3>Precision</h3>
      <p><strong>Repeatability (n=6):</strong> RSD = [Value]% (Acceptance: ≤ 2.0%)</p>
      <p><strong>Intermediate Precision:</strong> RSD = [Value]% (Acceptance: ≤ 2.0%)</p>
      
      <h3>Detection Limit (LOD)</h3>
      <p>LOD = [Value] µg/mL</p>
      
      <h3>Quantitation Limit (LOQ)</h3>
      <p>LOQ = [Value] µg/mL</p>
      
      <h3>Robustness</h3>
      <p>The method was tested for robustness by varying the following parameters:</p>
      <ul>
        <li>pH of mobile phase: ± 0.2 units</li>
        <li>Column temperature: ± 5°C</li>
        <li>Flow rate: ± 0.2 mL/min</li>
      </ul>
      <p>No significant impact on method performance was observed.</p>
      
      <h2>Conclusion</h2>
      <p>The analytical method has been validated and is suitable for its intended use in quality control testing.</p>
    `;
  }

  static getStabilityProtocolTemplate() {
    return `
      <h1>Stability Study Protocol</h1>
      
      <h2>Study Objective</h2>
      <p>To evaluate the stability of [product name] under various storage conditions and establish a shelf life/retest period in accordance with ICH Q1A(R2) guidelines.</p>
      
      <h2>Study Design</h2>
      
      <h3>Storage Conditions</h3>
      <table>
        <tr><th>Study Type</th><th>Storage Condition</th><th>Duration</th><th>Testing Frequency</th></tr>
        <tr><td>Long-term</td><td>25°C ± 2°C / 60% RH ± 5%</td><td>[X] months</td><td>0, 3, 6, 9, 12, [X] months</td></tr>
        <tr><td>Intermediate</td><td>30°C ± 2°C / 65% RH ± 5%</td><td>6 months</td><td>0, 3, 6 months</td></tr>
        <tr><td>Accelerated</td><td>40°C ± 2°C / 75% RH ± 5%</td><td>6 months</td><td>0, 1, 2, 3, 6 months</td></tr>
      </table>
      
      <h3>Sample Description</h3>
      <p><strong>Product:</strong> [Product name and strength]</p>
      <p><strong>Batch Numbers:</strong> [List of batches]</p>
      <p><strong>Container/Closure:</strong> [Description]</p>
      <p><strong>Package Configuration:</strong> [Description]</p>
      
      <h2>Test Parameters</h2>
      <table>
        <tr><th>Test</th><th>Method</th><th>Acceptance Criteria</th></tr>
        <tr><td>Appearance</td><td>Visual inspection</td><td>[Criteria]</td></tr>
        <tr><td>Assay</td><td>HPLC</td><td>[Range]% of label claim</td></tr>
        <tr><td>Related substances</td><td>HPLC</td><td>Individual: NMT [X]%<br>Total: NMT [Y]%</td></tr>
        <tr><td>Content uniformity</td><td>HPLC</td><td>AV ≤ 15.0</td></tr>
        <tr><td>Dissolution</td><td>USP method</td><td>NLT [X]% in [Y] minutes</td></tr>
        <tr><td>Water content</td><td>Karl Fischer</td><td>NMT [X]%</td></tr>
        <tr><td>Microbial limits</td><td>USP <61></td><td>Per specification</td></tr>
      </table>
      
      <h2>Statistical Analysis</h2>
      <p>Statistical analysis will be performed according to ICH Q1E guidelines. Linear regression analysis will be used to determine if there are statistically significant changes over time.</p>
      
      <h2>Acceptance Criteria for Shelf Life</h2>
      <p>The shelf life will be established based on the time point where the 95% confidence limit for the mean intersects the acceptance criteria.</p>
      
      <h2>Reporting</h2>
      <p>A stability report will be prepared summarizing the study results and providing shelf life recommendations.</p>
      
      <h2>Deviations</h2>
      <p>Any deviations from this protocol will be documented and evaluated for their impact on the study integrity.</p>
    `;
  }

  static async getControlledTerminology() {
    return {
      cmcTerms: [
        {
          term: 'Active Pharmaceutical Ingredient',
          abbreviation: 'API',
          context: 'Drug substance',
        },
        { term: 'Good Manufacturing Practice', abbreviation: 'GMP', context: 'Quality system' },
        {
          term: 'International Council for Harmonisation',
          abbreviation: 'ICH',
          context: 'Regulatory guidance',
        },
        { term: 'Quality by Design', abbreviation: 'QbD', context: 'Development approach' },
        { term: 'Critical Quality Attribute', abbreviation: 'CQA', context: 'Product quality' },
        { term: 'Design Space', abbreviation: 'DS', context: 'Manufacturing' },
        {
          term: 'Process Analytical Technology',
          abbreviation: 'PAT',
          context: 'Manufacturing control',
        },
        { term: 'Real Time Release Testing', abbreviation: 'RTRT', context: 'Quality control' },
      ],
      regulatoryGuidelines: [
        'ICH Q8(R2) - Pharmaceutical Development',
        'ICH Q9 - Quality Risk Management',
        'ICH Q10 - Pharmaceutical Quality System',
        'ICH Q11 - Development and Manufacture of Drug Substances',
        'ICH Q1A(R2) - Stability Testing Guidelines',
        'ICH Q2(R1) - Analytical Procedure Validation',
        'ICH Q3A(R2) - Impurities in New Drug Substances',
      ],
    };
  }
}
