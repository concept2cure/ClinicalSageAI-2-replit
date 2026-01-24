import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2,
  FolderTree,
  Download,
  FileText,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Upload,
  ExternalLink,
} from 'lucide-react';

/**
 * Blueprint Generator - Create folder structures and XML manifest for submission packages
 */
const BlueprintPage = () => {
  // Blueprint state
  const [submissionType, setSubmissionType] = useState('ind');
  const [region, setRegion] = useState('fda');
  const [modules, setModules] = useState({
    module1: true,
    module2: true,
    module3: true,
    module4: true,
    module5: true,
  });
  const [customization, setCustomization] = useState('standard');
  const [companyName, setCompanyName] = useState('');
  const [productName, setProductName] = useState('');
  const [applicationNumber, setApplicationNumber] = useState('');
  const [sequenceNumber, setSequenceNumber] = useState('0000');
  const [submissionDescription, setSubmissionDescription] = useState('');

  // Blueprint generation state
  const [generating, setGenerating] = useState(false);
  const [generatedBlueprint, setGeneratedBlueprint] = useState(null);
  const [folderPreview, setFolderPreview] = useState([]);
  const [xmlPreview, setXmlPreview] = useState('');
  const [activeTab, setActiveTab] = useState('config');

  // Validation state
  const [validating, setValidating] = useState(false);
  const [validationResults, setValidationResults] = useState(null);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submissionGateway, setSubmissionGateway] = useState(null);
  const [submissionResults, setSubmissionResults] = useState(null);

  // Get predefined templates based on submission type and region
  const getTemplates = () => {
    return {
      ind: {
        fda: ['Original IND', 'IND Amendment', 'IND Annual Report', 'Special Protocol Assessment'],
        ema: ['Initial Scientific Advice', 'Clinical Trial Application', 'CTA Amendment'],
        pmda: ['CTN Initial Submission', 'CTN Amendment'],
      },
      nda: {
        fda: [
          'Original NDA',
          'Efficacy Supplement',
          'CMC Supplement',
          'Annual Report',
          'REMS Assessment',
        ],
        ema: ['Initial Marketing Authorization', 'Type II Variation', 'Line Extension'],
        pmda: ['New Drug Application', 'Partial Change Application'],
      },
      bla: {
        fda: ['Original BLA', 'BLA Supplement', 'Annual Report'],
        ema: ['Initial MAA', 'Type II Variation'],
        pmda: ['New Biologics Application'],
      },
      dmd: {
        fda: ['Original DMD', 'DMD Supplement'],
        ema: ['Medical Device Dossier'],
        pmda: ['Medical Device Application'],
      },
    };
  };

  // Get available templates for current selection
  const availableTemplates = getTemplates()[submissionType][region] || [];

  // Generate folder structure preview
  useEffect(() => {
    generateFolderPreview();
  }, [submissionType, region, modules, customization]);

  // Generate folder preview based on current selections
  const generateFolderPreview = () => {
    let folders = [];

    // Root folder
    folders.push({
      name: `${submissionType.toUpperCase()}_${sequenceNumber || '0000'}`,
      level: 0,
      type: 'folder',
    });

    // Module folders
    if (modules.module1) {
      folders.push({
        name: 'm1-administrative',
        level: 1,
        type: 'folder',
      });

      if (region === 'fda') {
        folders.push({
          name: 'us',
          level: 2,
          type: 'folder',
        });
        folders.push({
          name: 'cover-letter.pdf',
          level: 3,
          type: 'file',
        });
        folders.push({
          name: 'form-1571.pdf',
          level: 3,
          type: 'file',
        });
      } else if (region === 'ema') {
        folders.push({
          name: 'eu',
          level: 2,
          type: 'folder',
        });
        folders.push({
          name: 'cover-letter.pdf',
          level: 3,
          type: 'file',
        });
      } else if (region === 'pmda') {
        folders.push({
          name: 'jp',
          level: 2,
          type: 'folder',
        });
        folders.push({
          name: 'cover-letter.pdf',
          level: 3,
          type: 'file',
        });
      }
    }

    if (modules.module2) {
      folders.push({
        name: 'm2-common-technical-document-summaries',
        level: 1,
        type: 'folder',
      });
      folders.push({
        name: 'm2-2-introduction',
        level: 2,
        type: 'folder',
      });
      folders.push({
        name: 'm2-3-quality-overall-summary',
        level: 2,
        type: 'folder',
      });
      folders.push({
        name: 'm2-4-nonclinical-overview',
        level: 2,
        type: 'folder',
      });
      folders.push({
        name: 'm2-5-clinical-overview',
        level: 2,
        type: 'folder',
      });
      folders.push({
        name: 'm2-7-clinical-summary',
        level: 2,
        type: 'folder',
      });
    }

    if (modules.module3) {
      folders.push({
        name: 'm3-quality',
        level: 1,
        type: 'folder',
      });
      folders.push({
        name: 'm3-2-body-of-data',
        level: 2,
        type: 'folder',
      });
      folders.push({
        name: 'm3-2-s-drug-substance',
        level: 3,
        type: 'folder',
      });
      folders.push({
        name: 'm3-2-p-drug-product',
        level: 3,
        type: 'folder',
      });
    }

    if (modules.module4) {
      folders.push({
        name: 'm4-nonclinical-study-reports',
        level: 1,
        type: 'folder',
      });
      folders.push({
        name: 'm4-2-study-reports',
        level: 2,
        type: 'folder',
      });
      folders.push({
        name: 'm4-2-1-pharmacology',
        level: 3,
        type: 'folder',
      });
      folders.push({
        name: 'm4-2-2-pharmacokinetics',
        level: 3,
        type: 'folder',
      });
      folders.push({
        name: 'm4-2-3-toxicology',
        level: 3,
        type: 'folder',
      });
    }

    if (modules.module5) {
      folders.push({
        name: 'm5-clinical-study-reports',
        level: 1,
        type: 'folder',
      });
      folders.push({
        name: 'm5-2-tabular-listing-of-all-clinical-studies',
        level: 2,
        type: 'folder',
      });
      folders.push({
        name: 'm5-3-clinical-study-reports',
        level: 3,
        type: 'folder',
      });
      folders.push({
        name: 'm5-3-5-reports-of-efficacy-and-safety-studies',
        level: 4,
        type: 'folder',
      });
    }

    // Add index.xml file
    folders.push({
      name: 'index.xml',
      level: 0,
      type: 'file',
    });

    setFolderPreview(folders);

    // Generate XML preview
    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ectd:submission SYSTEM "util/dtd/ich-ectd-3-2.dtd">
<ectd:submission xmlns:ectd="http://www.ich.org/ectd" xmlns:xlink="http://www.w3c.org/1999/xlink">
  <admin>
    <submission-type>${submissionType.toUpperCase()}</submission-type>
    <sequence>${sequenceNumber || '0000'}</sequence>
    <company>${companyName || 'COMPANY_NAME'}</company>
    <product-name>${productName || 'PRODUCT_NAME'}</product-name>
    <application-number>${applicationNumber || 'APPLICATION_NUMBER'}</application-number>
    <submission-description>${submissionDescription || 'SUBMISSION_DESCRIPTION'}</submission-description>
  </admin>
  <!-- Module folders structure -->
  <m1-administrative/>
  <m2-common-technical-document-summaries/>
  <m3-quality/>
  <m4-nonclinical-study-reports/>
  <m5-clinical-study-reports/>
</ectd:submission>`;

    setXmlPreview(xmlContent);
  };

  // Generate blueprint package
  const handleGenerateBlueprint = async () => {
    if (!companyName || !productName || !applicationNumber) {
      alert('Please fill in required fields (Company Name, Product Name, and Application Number)');
      return;
    }

    setGenerating(true);
    try {
      const blueprintRequest = {
        submissionType,
        region,
        modules,
        customization,
        companyName,
        productName,
        applicationNumber,
        sequenceNumber,
        submissionDescription,
      };

      const response = await fetch('/api/blueprint/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(blueprintRequest),
      });

      if (!response.ok) {
        throw new Error('Failed to generate blueprint');
      }

      const data = await response.json();
      setGeneratedBlueprint(data);
      setActiveTab('result');
    } catch (error) {
      console.error('Error generating blueprint:', error);
    } finally {
      setGenerating(false);
    }
  };

  // Download blueprint as ZIP
  const handleDownloadBlueprint = () => {
    if (!generatedBlueprint) return;

    window.open(`/api/blueprint/${generatedBlueprint.id}/download`, '_blank');
  };

  // Toggle module selection
  const toggleModule = module => {
    setModules(prev => ({
      ...prev,
      [module]: !prev[module],
    }));
  };

  // Validate eCTD package
  const handleValidate = async () => {
    if (!generatedBlueprint) {
      alert('Please generate a blueprint first');
      return;
    }

    setValidating(true);
    setValidationResults(null);

    try {
      // Request validation from server
      const response = await fetch(`/api/ectd/validate/${generatedBlueprint.id}`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('Failed to validate CTD package');
      }

      const data = await response.json();
      setValidationResults(data);
    } catch (error) {
      console.error('Error validating CTD package:', error);
      setValidationResults({
        success: false,
        error: error.message || 'Failed to validate CTD package',
      });
    } finally {
      setValidating(false);
    }
  };

  // Submit to FDA ESG
  const handleSubmitToFDA = async () => {
    if (!generatedBlueprint) {
      alert('Please generate a blueprint first');
      return;
    }

    setSubmitting(true);
    setSubmissionGateway('FDA ESG');
    setSubmissionResults(null);

    try {
      // Build form data for submission
      const formData = new FormData();
      formData.append('submissionType', submissionType);
      formData.append('applicationType', submissionType.toUpperCase());
      formData.append('applicationNumber', applicationNumber);
      formData.append('sponsorName', companyName);
      formData.append('productName', productName);
      formData.append(
        'contactEmail',
        'regulatory@' + companyName.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com'
      );

      // Request submission
      const response = await fetch(`/api/submission/esg?blueprintId=${generatedBlueprint.id}`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to submit to FDA ESG');
      }

      const data = await response.json();
      setSubmissionResults(data);
    } catch (error) {
      console.error('Error submitting to FDA ESG:', error);
      setSubmissionResults({
        success: false,
        error: error.message || 'Failed to submit to FDA ESG',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Submit to EMA CESP
  const handleSubmitToEMA = async () => {
    if (!generatedBlueprint) {
      alert('Please generate a blueprint first');
      return;
    }

    setSubmitting(true);
    setSubmissionGateway('EMA CESP');
    setSubmissionResults(null);

    try {
      // Build form data for submission
      const formData = new FormData();
      formData.append('procedureType', 'Centralised');
      formData.append('procedureNumber', 'EMEA/H/C/' + applicationNumber.replace(/[^0-9]/g, ''));
      formData.append('marketingAuthorizationHolder', companyName);
      formData.append('productName', productName);
      formData.append('substanceName', productName.split(' ')[0]);
      formData.append(
        'contactEmail',
        'regulatory@' + companyName.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com'
      );

      // Request submission
      const response = await fetch(`/api/submission/cesp?blueprintId=${generatedBlueprint.id}`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to submit to EMA CESP');
      }

      const data = await response.json();
      setSubmissionResults(data);
    } catch (error) {
      console.error('Error submitting to EMA CESP:', error);
      setSubmissionResults({
        success: false,
        error: error.message || 'Failed to submit to EMA CESP',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="blueprint-page-container p-4">
      <h1 className="text-2xl font-bold mb-6">Submission Blueprint Generator</h1>

      <Tabs defaultValue="config" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="config">
            <FileText className="h-4 w-4 mr-2" />
            Configure Blueprint
          </TabsTrigger>
          <TabsTrigger value="preview">
            <FolderTree className="h-4 w-4 mr-2" />
            Folder Preview
          </TabsTrigger>
          <TabsTrigger value="result" disabled={!generatedBlueprint}>
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Generated Blueprint
          </TabsTrigger>
        </TabsList>

        {/* Configuration Tab */}
        <TabsContent value="config">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Submission Information</CardTitle>
                <CardDescription>Configure your submission package</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-1 font-medium">Submission Type</label>
                      <select
                        className="w-full p-2 border rounded"
                        value={submissionType}
                        onChange={e => setSubmissionType(e.target.value)}
                      >
                        <option value="ind">IND</option>
                        <option value="nda">NDA</option>
                        <option value="bla">BLA</option>
                        <option value="dmd">Medical Device</option>
                      </select>
                    </div>

                    <div>
                      <label className="block mb-1 font-medium">Region</label>
                      <select
                        className="w-full p-2 border rounded"
                        value={region}
                        onChange={e => setRegion(e.target.value)}
                      >
                        <option value="fda">FDA (US)</option>
                        <option value="ema">EMA (EU)</option>
                        <option value="pmda">PMDA (Japan)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block mb-1 font-medium">Template</label>
                    <select
                      className="w-full p-2 border rounded"
                      value={customization}
                      onChange={e => setCustomization(e.target.value)}
                    >
                      <option value="standard">Standard</option>
                      {availableTemplates.map((template, index) => (
                        <option key={index} value={template.toLowerCase().replace(/\s+/g, '-')}>
                          {template}
                        </option>
                      ))}
                      <option value="custom">Custom</option>
                    </select>
                  </div>

                  <div>
                    <label className="block mb-1 font-medium">
                      Company Name<span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      className="w-full p-2 border rounded"
                      value={companyName}
                      onChange={e => setCompanyName(e.target.value)}
                      placeholder="e.g., Concept2Cures Pharma, Inc."
                      required
                    />
                  </div>

                  <div>
                    <label className="block mb-1 font-medium">
                      Product Name<span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      className="w-full p-2 border rounded"
                      value={productName}
                      onChange={e => setProductName(e.target.value)}
                      placeholder="e.g., PRODUCTNAME (generic name)"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-1 font-medium">
                        Application Number<span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        className="w-full p-2 border rounded"
                        value={applicationNumber}
                        onChange={e => setApplicationNumber(e.target.value)}
                        placeholder="e.g., IND123456"
                        required
                      />
                    </div>

                    <div>
                      <label className="block mb-1 font-medium">Sequence Number</label>
                      <input
                        type="text"
                        className="w-full p-2 border rounded"
                        value={sequenceNumber}
                        onChange={e => setSequenceNumber(e.target.value)}
                        placeholder="e.g., 0000"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block mb-1 font-medium">Submission Description</label>
                    <textarea
                      className="w-full p-2 border rounded"
                      rows="2"
                      value={submissionDescription}
                      onChange={e => setSubmissionDescription(e.target.value)}
                      placeholder="Brief description of this submission"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Module Selection</CardTitle>
                <CardDescription>Select modules to include in the package</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="border rounded p-4">
                    <div className="flex items-center mb-3">
                      <input
                        type="checkbox"
                        id="module1"
                        checked={modules.module1}
                        onChange={() => toggleModule('module1')}
                        className="h-4 w-4 mr-2"
                      />
                      <label htmlFor="module1" className="font-medium">
                        Module 1: Administrative Information
                      </label>
                    </div>
                    <p className="text-sm text-gray-500 ml-6">
                      Region-specific administrative information including cover letters, forms, and
                      prescribing information.
                    </p>
                  </div>

                  <div className="border rounded p-4">
                    <div className="flex items-center mb-3">
                      <input
                        type="checkbox"
                        id="module2"
                        checked={modules.module2}
                        onChange={() => toggleModule('module2')}
                        className="h-4 w-4 mr-2"
                      />
                      <label htmlFor="module2" className="font-medium">
                        Module 2: CTD Summaries
                      </label>
                    </div>
                    <p className="text-sm text-gray-500 ml-6">
                      Overall summaries including Quality Overall Summary (QOS), Nonclinical
                      Overview, and Clinical Overview.
                    </p>
                  </div>

                  <div className="border rounded p-4">
                    <div className="flex items-center mb-3">
                      <input
                        type="checkbox"
                        id="module3"
                        checked={modules.module3}
                        onChange={() => toggleModule('module3')}
                        className="h-4 w-4 mr-2"
                      />
                      <label htmlFor="module3" className="font-medium">
                        Module 3: Quality
                      </label>
                    </div>
                    <p className="text-sm text-gray-500 ml-6">
                      Chemical, pharmaceutical, and biological documentation for both drug substance
                      and drug product.
                    </p>
                  </div>

                  <div className="border rounded p-4">
                    <div className="flex items-center mb-3">
                      <input
                        type="checkbox"
                        id="module4"
                        checked={modules.module4}
                        onChange={() => toggleModule('module4')}
                        className="h-4 w-4 mr-2"
                      />
                      <label htmlFor="module4" className="font-medium">
                        Module 4: Nonclinical Study Reports
                      </label>
                    </div>
                    <p className="text-sm text-gray-500 ml-6">
                      Nonclinical study reports for pharmacology, pharmacokinetics, and toxicology
                      studies.
                    </p>
                  </div>

                  <div className="border rounded p-4">
                    <div className="flex items-center mb-3">
                      <input
                        type="checkbox"
                        id="module5"
                        checked={modules.module5}
                        onChange={() => toggleModule('module5')}
                        className="h-4 w-4 mr-2"
                      />
                      <label htmlFor="module5" className="font-medium">
                        Module 5: Clinical Study Reports
                      </label>
                    </div>
                    <p className="text-sm text-gray-500 ml-6">
                      Clinical study reports for biopharmaceutics, clinical pharmacology, efficacy,
                      and safety studies.
                    </p>
                  </div>

                  <div className="pt-4 flex justify-between items-center">
                    <div className="text-sm text-gray-500">
                      {Object.values(modules).filter(Boolean).length} of 5 modules selected
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        onClick={() => setActiveTab('preview')}
                        variant="outline"
                        className="mr-2"
                      >
                        Preview Structure
                      </Button>
                      <Button onClick={handleGenerateBlueprint} disabled={generating}>
                        {generating ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          'Generate Blueprint'
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Preview Tab */}
        <TabsContent value="preview">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Folder Structure Preview</CardTitle>
                <CardDescription>Preview the generated folder structure</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded p-4 bg-gray-50">
                  <div className="space-y-1 font-mono text-sm">
                    {folderPreview.map((item, index) => (
                      <div
                        key={index}
                        className="flex items-start"
                        style={{ paddingLeft: `${item.level * 1.5}rem` }}
                      >
                        {item.type === 'folder' ? (
                          <FolderTree className="h-4 w-4 mr-1 text-yellow-600 flex-shrink-0" />
                        ) : (
                          <FileText className="h-4 w-4 mr-1 text-blue-600 flex-shrink-0" />
                        )}
                        <span className={item.type === 'file' ? 'text-blue-600' : ''}>
                          {item.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <Button onClick={handleGenerateBlueprint} disabled={generating}>
                    {generating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      'Generate Blueprint'
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>XML Manifest Preview</CardTitle>
                <CardDescription>Preview the index.xml file</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded p-4 bg-gray-50 overflow-auto max-h-96">
                  <pre className="font-mono text-sm text-blue-700 whitespace-pre-wrap">
                    {xmlPreview}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Result Tab */}
        <TabsContent value="result">
          {generatedBlueprint ? (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <CheckCircle2 className="h-5 w-5 mr-2 text-green-600" />
                    Blueprint Generated Successfully
                  </CardTitle>
                  <CardDescription>
                    Your submission package blueprint has been created
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="bg-green-50 border border-green-200 rounded p-4">
                      <div className="flex items-start">
                        <div className="flex-grow">
                          <h3 className="font-medium text-green-800 mb-1">
                            Submission Package Details
                          </h3>
                          <ul className="space-y-1 text-sm text-green-700">
                            <li>
                              <span className="font-medium">Blueprint ID:</span>{' '}
                              {generatedBlueprint.id}
                            </li>
                            <li>
                              <span className="font-medium">Submission Type:</span>{' '}
                              {submissionType.toUpperCase()}
                            </li>
                            <li>
                              <span className="font-medium">Product:</span> {productName}
                            </li>
                            <li>
                              <span className="font-medium">Application Number:</span>{' '}
                              {applicationNumber}
                            </li>
                            <li>
                              <span className="font-medium">Generated On:</span>{' '}
                              {new Date().toLocaleString()}
                            </li>
                            <li>
                              <span className="font-medium">Modules Included:</span>{' '}
                              {Object.entries(modules)
                                .filter(([_, included]) => included)
                                .map(([module]) => module.replace('module', ''))
                                .join(', ')}
                            </li>
                          </ul>
                        </div>
                        <Button onClick={handleDownloadBlueprint} className="flex items-center">
                          <Download className="h-4 w-4 mr-2" />
                          Download ZIP
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h3 className="font-medium">Next Steps</h3>
                      <ul className="space-y-2">
                        <li className="flex items-start">
                          <ArrowRight className="h-4 w-4 mr-2 mt-0.5 text-blue-600" />
                          <span>
                            Extract the ZIP file to your local system to access the complete folder
                            structure.
                          </span>
                        </li>
                        <li className="flex items-start">
                          <ArrowRight className="h-4 w-4 mr-2 mt-0.5 text-blue-600" />
                          <span>
                            Place your submission documents in the appropriate folders according to
                            the eCTD structure.
                          </span>
                        </li>
                        <li className="flex items-start">
                          <ArrowRight className="h-4 w-4 mr-2 mt-0.5 text-blue-600" />
                          <span>
                            Update the index.xml file with specific document references as needed.
                          </span>
                        </li>
                        <li className="flex items-start">
                          <ArrowRight className="h-4 w-4 mr-2 mt-0.5 text-blue-600" />
                          <span>
                            Use an eCTD validator to confirm the package meets regulatory
                            requirements before submission.
                          </span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Validation Results Section */}
              {validationResults && (
                <Card className="mt-6 mb-6">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      {validationResults.success &&
                      validationResults.validation &&
                      validationResults.validation.summary.valid ? (
                        <>
                          <CheckCircle2 className="h-5 w-5 mr-2 text-green-600" />
                          Validation Passed
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-5 w-5 mr-2 text-amber-600" />
                          Validation Results
                        </>
                      )}
                    </CardTitle>
                    <CardDescription>
                      {validationResults.success
                        ? 'eCTD package validation results'
                        : 'There was an error validating your package'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!validationResults.success ? (
                      <div className="bg-red-50 border border-red-200 rounded p-4 text-red-800">
                        {validationResults.error || 'Unknown validation error occurred'}
                      </div>
                    ) : validationResults.validation?.summary ? (
                      <div className="space-y-4">
                        <div
                          className={`border rounded p-4 ${validationResults.validation.summary.valid ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}
                        >
                          <h3 className="font-medium mb-2">Validation Summary</h3>
                          <ul className="space-y-1 text-sm">
                            <li>
                              <span className="font-medium">Status:</span>{' '}
                              {validationResults.validation.summary.valid ? 'Valid' : 'Invalid'}
                            </li>
                            <li>
                              <span className="font-medium">Errors:</span>{' '}
                              {validationResults.validation.summary.errorCount}
                            </li>
                            <li>
                              <span className="font-medium">Warnings:</span>{' '}
                              {validationResults.validation.summary.warningCount}
                            </li>
                            <li>
                              <span className="font-medium">Info:</span>{' '}
                              {validationResults.validation.summary.infoCount}
                            </li>
                            <li>
                              <span className="font-medium">Validated At:</span>{' '}
                              {new Date(
                                validationResults.validation.summary.validatedAt
                              ).toLocaleString()}
                            </li>
                          </ul>
                        </div>

                        {validationResults.validation.issues &&
                          validationResults.validation.issues.length > 0 && (
                            <div className="border rounded p-4 bg-white">
                              <h3 className="font-medium mb-2">Issues Found</h3>
                              <div className="space-y-3 max-h-60 overflow-y-auto">
                                {validationResults.validation.issues.map((issue, index) => (
                                  <div
                                    key={index}
                                    className={`p-3 rounded text-sm ${
                                      issue.level === 'error'
                                        ? 'bg-red-50 border border-red-200 text-red-800'
                                        : issue.level === 'warning'
                                          ? 'bg-amber-50 border border-amber-200 text-amber-800'
                                          : 'bg-blue-50 border border-blue-200 text-blue-800'
                                    }`}
                                  >
                                    <div className="font-medium">
                                      {issue.code}: {issue.message}
                                    </div>
                                    {issue.location && (
                                      <div className="mt-1">Location: {issue.location}</div>
                                    )}
                                    {issue.details && (
                                      <div className="mt-1 text-xs">{issue.details}</div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                        {validationResults.validation.recommendations && (
                          <div className="border rounded p-4 bg-blue-50 border-blue-200">
                            <h3 className="font-medium mb-2 text-blue-800">Recommendations</h3>
                            <ul className="list-disc pl-5 space-y-1 text-sm text-blue-700">
                              {validationResults.validation.recommendations.map((rec, index) => (
                                <li key={index}>{rec}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center p-4 text-gray-500">
                        No validation details available
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Submission Results Section */}
              {submissionResults && (
                <Card className="mt-6 mb-6">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      {submissionResults.success ? (
                        <>
                          <CheckCircle2 className="h-5 w-5 mr-2 text-green-600" />
                          Submission to {submissionGateway} Successful
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-5 w-5 mr-2 text-amber-600" />
                          Submission to {submissionGateway} Failed
                        </>
                      )}
                    </CardTitle>
                    <CardDescription>
                      {submissionResults.success
                        ? `Your submission has been sent to ${submissionGateway}`
                        : 'There was an error with your submission'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!submissionResults.success ? (
                      <div className="bg-red-50 border border-red-200 rounded p-4 text-red-800">
                        {submissionResults.error || 'Unknown submission error occurred'}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="border rounded p-4 bg-green-50 border-green-200">
                          <h3 className="font-medium mb-2">Submission Details</h3>
                          <ul className="space-y-1 text-sm">
                            <li>
                              <span className="font-medium">Submission ID:</span>{' '}
                              {submissionResults.submissionId}
                            </li>
                            <li>
                              <span className="font-medium">Gateway:</span>{' '}
                              {submissionResults.gateway}
                            </li>
                            <li>
                              <span className="font-medium">Status:</span>{' '}
                              {submissionResults.status}
                            </li>
                            <li>
                              <span className="font-medium">Submitted At:</span>{' '}
                              {new Date(submissionResults.metadata?.submittedAt).toLocaleString()}
                            </li>
                            {submissionResults.trackingInfo && (
                              <>
                                <li>
                                  <span className="font-medium">Receipt/Delivery ID:</span>{' '}
                                  {submissionResults.trackingInfo.receiptId ||
                                    submissionResults.trackingInfo.deliveryId}
                                </li>
                                <li>
                                  <span className="font-medium">Estimated Processing Time:</span>{' '}
                                  {submissionResults.trackingInfo.estimatedProcessingTime}
                                </li>
                              </>
                            )}
                          </ul>
                        </div>

                        <div className="border rounded p-4 bg-blue-50 border-blue-200">
                          <h3 className="font-medium mb-2 text-blue-800">Next Steps</h3>
                          <p className="text-sm text-blue-700 mb-2">
                            You can check the status of your submission using the following link:
                          </p>
                          <Button
                            variant="outline"
                            className="text-blue-700 border-blue-300"
                            onClick={() =>
                              window.open(
                                `/api${submissionResults.trackingInfo?.statusCheckUrl}`,
                                '_blank'
                              )
                            }
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Check Submission Status
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <div className="space-y-6">
                {/* Action Buttons Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left column - Download and Validate */}
                  <div className="space-y-4">
                    <Button
                      onClick={handleDownloadBlueprint}
                      className="w-full flex items-center justify-center"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download Blueprint ZIP
                    </Button>

                    <Button
                      onClick={handleValidate}
                      variant="outline"
                      className="w-full flex items-center justify-center"
                      disabled={validating}
                    >
                      {validating ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Validating...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Validate CTD
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Right column - Submit buttons */}
                  <div className="space-y-4">
                    <Button
                      onClick={handleSubmitToFDA}
                      className="w-full flex items-center justify-center"
                      disabled={submitting}
                      variant={region === 'fda' ? 'default' : 'outline'}
                    >
                      {submitting && submissionGateway === 'FDA ESG' ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Submitting to FDA...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Submit to FDA ESG
                        </>
                      )}
                    </Button>

                    <Button
                      onClick={handleSubmitToEMA}
                      className="w-full flex items-center justify-center"
                      disabled={submitting}
                      variant={region === 'ema' ? 'default' : 'outline'}
                    >
                      {submitting && submissionGateway === 'EMA CESP' ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Submitting to EMA...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Submit to EMA CESP
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                <div className="flex justify-start">
                  <Button variant="ghost" onClick={() => setActiveTab('config')}>
                    Configure Another Blueprint
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-center p-4">
              <p className="text-gray-500">
                No blueprint has been generated yet. Configure and generate a blueprint first.
              </p>
              <Button onClick={() => setActiveTab('config')} className="mt-4">
                Go to Configuration
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default BlueprintPage;
