import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  Save, Download, FileText, CheckCircle2, Circle, Edit3, ChevronRight, Clock, AlertCircle, Sparkles, Copy, FileCheck, Wand2, ArrowRight, ArrowLeft, BarChart3 } from 'lucide-react'

// FDA 510(k) EMR-style template sections
const FDA_510K_SECTIONS = [
  {
    id: 'cover-letter',
    title: '1. Cover Letter',
    required: true,
    fields: [
      { id: 'date', label: 'Submission Date', type: 'date', required: true },
      { id: 'device_name', label: 'Device Name', type: 'text', required: true },
      { id: 'manufacturer', label: 'Manufacturer', type: 'text', required: true },
      { id: 'contact', label: 'Contact Person', type: 'text', required: true },
      { id: 'phone', label: 'Phone', type: 'tel', required: true },
      { id: 'email', label: 'Email', type: 'email', required: true },
      { id: 'letter_body', label: 'Cover Letter Content', type: 'textarea', required: true,
        template: 'We are submitting this 510(k) premarket notification for [DEVICE_NAME]. This device is intended for [INTENDED_USE]. We believe this device is substantially equivalent to the predicate device [PREDICATE].' }
    ]
  },
  {
    id: 'indications',
    title: '2. Indications for Use',
    required: true,
    fields: [
      { id: 'device_name', label: 'Device Name', type: 'text', required: true },
      { id: 'intended_use', label: 'Intended Use Statement', type: 'textarea', required: true },
      { id: 'prescription', label: 'Prescription Use', type: 'checkbox' },
      { id: 'otc', label: 'Over-The-Counter Use', type: 'checkbox' },
      { id: 'indications_detail', label: 'Detailed Indications', type: 'textarea', required: true }
    ]
  },
  {
    id: 'summary',
    title: '3. 510(k) Summary',
    required: true,
    fields: [
      { id: 'company_name', label: 'Company Name', type: 'text', required: true },
      { id: 'address', label: 'Company Address', type: 'textarea', required: true },
      { id: 'trade_name', label: 'Trade/Proprietary Name', type: 'text', required: true },
      { id: 'common_name', label: 'Common Name', type: 'text', required: true },
      { id: 'classification', label: 'Classification (21 CFR)', type: 'text', required: true },
      { id: 'product_code', label: 'Product Code', type: 'text', required: true },
      { id: 'panel', label: 'Review Panel', type: 'text', required: true }
    ]
  },
  {
    id: 'device-description',
    title: '4. Device Description',
    required: true,
    fields: [
      { id: 'physical_desc', label: 'Physical Description', type: 'textarea', required: true,
        template: 'The device consists of [COMPONENTS]. It measures [DIMENSIONS] and weighs [WEIGHT].' },
      { id: 'materials', label: 'Materials', type: 'textarea', required: true },
      { id: 'specifications', label: 'Technical Specifications', type: 'textarea', required: true },
      { id: 'principles', label: 'Principles of Operation', type: 'textarea', required: true },
      { id: 'software_desc', label: 'Software Description (if applicable)', type: 'textarea' }
    ]
  },
  {
    id: 'substantial-equivalence',
    title: '5. Substantial Equivalence',
    required: true,
    fields: [
      { id: 'predicate_k', label: 'Predicate K Number', type: 'text', required: true },
      { id: 'predicate_name', label: 'Predicate Device Name', type: 'text', required: true },
      { id: 'predicate_mfr', label: 'Predicate Manufacturer', type: 'text', required: true },
      { id: 'comparison', label: 'Comparison Table', type: 'textarea', required: true,
        template: 'Subject Device vs Predicate:\n• Intended Use: [SAME/SIMILAR]\n• Technology: [COMPARISON]\n• Materials: [COMPARISON]\n• Performance: [COMPARISON]' },
      { id: 'differences', label: 'Differences Discussion', type: 'textarea', required: true }
    ]
  },
  {
    id: 'performance',
    title: '6. Performance Testing',
    required: true,
    fields: [
      { id: 'bench_testing', label: 'Bench Testing Summary', type: 'textarea', required: true },
      { id: 'test_methods', label: 'Test Methods', type: 'textarea', required: true },
      { id: 'acceptance_criteria', label: 'Acceptance Criteria', type: 'textarea', required: true },
      { id: 'test_results', label: 'Test Results', type: 'textarea', required: true },
      { id: 'electrical_safety', label: 'Electrical Safety (IEC 60601)', type: 'textarea' },
      { id: 'emc_testing', label: 'EMC Testing (IEC 60601-1-2)', type: 'textarea' }
    ]
  },
  {
    id: 'biocompatibility',
    title: '7. Biocompatibility',
    required: false,
    fields: [
      { id: 'patient_contact', label: 'Patient Contact Duration', type: 'text' },
      { id: 'iso_10993', label: 'ISO 10993 Testing', type: 'textarea',
        template: 'Testing performed per ISO 10993:\n• Part 5: Cytotoxicity\n• Part 10: Irritation\n• Part 11: Systemic toxicity' },
      { id: 'test_results', label: 'Biocompatibility Results', type: 'textarea' }
    ]
  },
  {
    id: 'software',
    title: '8. Software Validation',
    required: false,
    fields: [
      { id: 'level_of_concern', label: 'Level of Concern', type: 'select', options: ['Minor', 'Moderate', 'Major'] },
      { id: 'software_description', label: 'Software Description', type: 'textarea' },
      { id: 'hazard_analysis', label: 'Hazard Analysis', type: 'textarea' },
      { id: 'v_and_v', label: 'Verification & Validation', type: 'textarea' },
      { id: 'revision_history', label: 'Revision History', type: 'textarea' }
    ]
  },
  {
    id: 'sterilization',
    title: '9. Sterilization',
    required: false,
    fields: [
      { id: 'method', label: 'Sterilization Method', type: 'text' },
      { id: 'sal', label: 'Sterility Assurance Level', type: 'text' },
      { id: 'validation', label: 'Validation Summary', type: 'textarea' },
      { id: 'packaging', label: 'Packaging Validation', type: 'textarea' }
    ]
  },
  {
    id: 'labeling',
    title: '10. Labeling',
    required: true,
    fields: [
      { id: 'device_label', label: 'Device Label', type: 'textarea', required: true },
      { id: 'ifu', label: 'Instructions for Use', type: 'textarea', required: true },
      { id: 'package_insert', label: 'Package Insert', type: 'textarea' },
      { id: 'promotional', label: 'Promotional Materials', type: 'textarea' }
    ]
  },
  {
    id: 'clinical',
    title: '11. Clinical Data',
    required: false,
    fields: [
      { id: 'study_needed', label: 'Clinical Study Required?', type: 'checkbox' },
      { id: 'study_design', label: 'Study Design', type: 'textarea' },
      { id: 'endpoints', label: 'Primary Endpoints', type: 'textarea' },
      { id: 'results', label: 'Clinical Results Summary', type: 'textarea' },
      { id: 'adverse_events', label: 'Adverse Events', type: 'textarea' }
    ]
  }
];

export default function FDA510kEMREditor({ 
  deviceProfile = {}, 
  onSave, 
  existingData = {},
  documentId 
}) {
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState('cover-letter');
  const [sectionData, setSectionData] = useState({});
  const [completedSections, setCompletedSections] = useState(new Set());
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const previewRef = useRef(null);

  // Initialize with device profile data
  useEffect(() => {
    const initialData = {
      'cover-letter': {
        device_name: deviceProfile.deviceName || '',
        manufacturer: deviceProfile.manufacturer || ''
      },
      'indications': {
        device_name: deviceProfile.deviceName || '',
        intended_use: deviceProfile.intendedUse || ''
      },
      'device-description': {
        physical_desc: deviceProfile.description || '',
        specifications: deviceProfile.technicalSpecifications || ''
      },
      'substantial-equivalence': {
        predicate_k: deviceProfile.predicateDevice || '',
        predicate_mfr: deviceProfile.predicateManufacturer || ''
      },
      ...existingData
    };
    setSectionData(initialData);
  }, [deviceProfile]);

  // Auto-save functionality
  useEffect(() => {
    if (isDirty) {
      const timer = setTimeout(() => {
        handleAutoSave();
      }, 5000); // Auto-save after 5 seconds of inactivity
      
      return () => clearTimeout(timer);
    }
  }, [sectionData, isDirty]);

  // Handle field changes
  const handleFieldChange = (sectionId, fieldId, value) => {
    setSectionData(prev => ({
      ...prev,
      [sectionId]: {
        ...(prev[sectionId] || {}),
        [fieldId]: value
      }
    }));
    setIsDirty(true);
  };

  // Check if section is complete
  const isSectionComplete = (section) => {
    const data = sectionData[section.id] || {};
    return section.fields
      .filter(f => f.required)
      .every(f => data[f.id] && data[f.id].toString().trim().length > 0);
  };

  // Mark section as complete
  const markSectionComplete = (sectionId) => {
    const section = FDA_510K_SECTIONS.find(s => s.id === sectionId);
    if (isSectionComplete(section)) {
      setCompletedSections(prev => new Set([...prev, sectionId]));
      toast({
        title: "Section Completed",
        description: `${section.title} has been marked as complete`,
        duration: 2000
      });
    }
  };

  // Generate full document HTML
  const generateFullDocument = () => {
    let html = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
        <h1 style="color: #003366; border-bottom: 3px solid #003366; padding-bottom: 10px;">
          FDA 510(k) PREMARKET NOTIFICATION
        </h1>
        <p><strong>K Number:</strong> ${documentId || 'DRAFT'}</p>
        <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
        <p><strong>Status:</strong> ${completedSections.size}/${FDA_510K_SECTIONS.filter(s => s.required).length} Required Sections Complete</p>
        <hr />
    `;

    FDA_510K_SECTIONS.forEach(section => {
      const data = sectionData[section.id] || {};
      const isComplete = completedSections.has(section.id);
      
      html += `
        <div style="margin: 30px 0; padding: 20px; background: ${isComplete ? '#f0fff0' : '#fff'}; border-left: 4px solid ${isComplete ? '#10b981' : '#fbbf24'};">
          <h2 style="color: #003366; margin-top: 0;">
            ${section.title} 
            ${section.required ? '<span style="color: red;">*</span>' : ''}
            ${isComplete ? '<span style="color: #10b981; float: right;">✓ Complete</span>' : ''}
          </h2>
      `;

      section.fields.forEach(field => {
        const value = data[field.id] || '';
        if (value) {
          if (field.type === 'textarea') {
            html += `
              <div style="margin: 15px 0;">
                <strong>${field.label}:</strong><br/>
                <div style="margin-left: 20px; white-space: pre-wrap;">${value}</div>
              </div>
            `;
          } else if (field.type === 'checkbox') {
            if (value === true || value === 'true') {
              html += `<p><strong>${field.label}:</strong> ✓ Yes</p>`;
            }
          } else {
            html += `<p><strong>${field.label}:</strong> ${value}</p>`;
          }
        }
      });

      html += `</div>`;
    });

    html += `
        <div style="margin-top: 50px; padding: 20px; background: #f3f4f6; border: 1px solid #d1d5db;">
          <h2 style="color: #003366;">Document Metadata</h2>
          <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
          <p><strong>Completion:</strong> ${Math.round((completedSections.size / FDA_510K_SECTIONS.filter(s => s.required).length) * 100)}%</p>
          <p><strong>Last Saved:</strong> ${lastSaved ? new Date(lastSaved).toLocaleString() : 'Not saved'}</p>
        </div>
      </div>
    `;

    return html;
  };

  // Save document
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const documentContent = generateFullDocument();
      
      const response = await fetch('/api/medical-device/documents/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': localStorage.getItem('organizationId') || 'default'
        },
        body: JSON.stringify({
          documentId: documentId,
          documentType: 'cerv2_510k',
          content: documentContent,
          sectionData: sectionData,
          completedSections: Array.from(completedSections),
          metadata: {
            deviceProfile: deviceProfile,
            completeness: Math.round((completedSections.size / FDA_510K_SECTIONS.filter(s => s.required).length) * 100)
          }
        })
      });

      if (response.ok) {
        setLastSaved(new Date());
        setIsDirty(false);
        toast({
          title: "Document Saved",
          description: "Your 510(k) submission has been saved",
        });
        
        if (onSave) {
          onSave({ sectionData, completedSections });
        }
      }
    } catch (error) {
      console.error('Save error:', error);
      toast({
        title: "Save Failed",
        description: "Unable to save document",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAutoSave = async () => {
    await handleSave();
  };

  // Export as Word document
  const handleExport = () => {
    const content = generateFullDocument();
    const blob = new Blob([content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FDA_510k_${deviceProfile.deviceName || 'Document'}_${new Date().toISOString().split('T')[0]}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Render field input based on type
  const renderField = (section, field) => {
    const value = sectionData[section.id]?.[field.id] || '';

    switch (field.type) {
      case 'textarea':
        return (
          <div key={field.id} className="space-y-2">
            <Label>{field.label} {field.required && <span className="text-red-500">*</span>}</Label>
            {field.template && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleFieldChange(section.id, field.id, field.template)}
                className="mb-2"
              >
                <Sparkles className="h-3 w-3 mr-1" />
                Use Template
              </Button>
            )}
            <Textarea
              value={value}
              onChange={(e) => handleFieldChange(section.id, field.id, e.target.value)}
              placeholder={field.template || `Enter ${field.label.toLowerCase()}...`}
              className="min-h-[100px]"
              data-testid={`field-${field.id}`}
            />
          </div>
        );
      
      case 'checkbox':
        return (
          <div key={field.id} className="flex items-center space-x-2">
            <input
              type="checkbox"
              id={field.id}
              checked={value === true || value === 'true'}
              onChange={(e) => handleFieldChange(section.id, field.id, e.target.checked)}
              className="h-4 w-4"
              data-testid={`field-${field.id}`}
            />
            <Label htmlFor={field.id}>{field.label}</Label>
          </div>
        );
      
      case 'select':
        return (
          <div key={field.id} className="space-y-2">
            <Label>{field.label} {field.required && <span className="text-red-500">*</span>}</Label>
            <select
              value={value}
              onChange={(e) => handleFieldChange(section.id, field.id, e.target.value)}
              className="w-full border rounded px-3 py-2"
              data-testid={`field-${field.id}`}
            >
              <option value="">Select {field.label}</option>
              {field.options?.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        );
      
      default:
        return (
          <div key={field.id} className="space-y-2">
            <Label>{field.label} {field.required && <span className="text-red-500">*</span>}</Label>
            <Input
              type={field.type}
              value={value}
              onChange={(e) => handleFieldChange(section.id, field.id, e.target.value)}
              placeholder={`Enter ${field.label.toLowerCase()}...`}
              data-testid={`field-${field.id}`}
            />
          </div>
        );
    }
  };

  const currentSection = FDA_510K_SECTIONS.find(s => s.id === activeSection);
  const completionPercentage = Math.round((completedSections.size / FDA_510K_SECTIONS.filter(s => s.required).length) * 100);

  return (
    <div className="flex h-[calc(100vh-8rem)] bg-gray-50">
      {/* Left Sidebar - Section Navigation */}
      <div className="w-80 bg-white border-r flex flex-col">
        <div className="p-4 border-b bg-blue-50">
          <h3 className="font-bold text-lg">FDA 510(k) Sections</h3>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 bg-gray-200 rounded-full h-2">
              <div 
                className="bg-green-500 h-2 rounded-full transition-all"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
            <span className="text-sm font-medium">{completionPercentage}%</span>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2">
            {FDA_510K_SECTIONS.map((section) => {
              const isComplete = completedSections.has(section.id);
              const isActive = activeSection === section.id;
              const isFilled = isSectionComplete(section);

              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full text-left p-3 mb-1 rounded-lg flex items-center gap-3 transition-all ${
                    isActive ? 'bg-blue-100 border-l-4 border-blue-600' : 'hover:bg-gray-50'
                  }`}
                  data-testid={`section-${section.id}`}
                >
                  <div className="flex-shrink-0">
                    {isComplete ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : isFilled ? (
                      <AlertCircle className="h-5 w-5 text-yellow-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">
                      {section.title}
                    </div>
                    {section.required && (
                      <div className="text-xs text-red-500">Required</div>
                    )}
                  </div>
                  {isActive && <ChevronRight className="h-4 w-4" />}
                </button>
              );
            })}
          </div>
        </ScrollArea>

        <div className="p-4 border-t space-y-2">
          <Button 
            onClick={handleSave} 
            className="w-full"
            disabled={isSaving}
            data-testid="save-button"
          >
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save Document'}
          </Button>
          <Button 
            onClick={handleExport} 
            variant="outline" 
            className="w-full"
            data-testid="export-button"
          >
            <Download className="h-4 w-4 mr-2" />
            Export Document
          </Button>
          {lastSaved && (
            <div className="text-xs text-gray-500 text-center">
              Last saved: {new Date(lastSaved).toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      {/* Middle - Section Editor */}
      <div className="flex-1 flex flex-col">
        <div className="bg-white border-b p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">{currentSection?.title}</h2>
            <div className="flex items-center gap-2">
              {isDirty && <Badge variant="outline">Unsaved Changes</Badge>}
              <Button
                size="sm"
                variant={completedSections.has(activeSection) ? "default" : "outline"}
                onClick={() => markSectionComplete(activeSection)}
                disabled={!isSectionComplete(currentSection)}
                data-testid="mark-complete-button"
              >
                <FileCheck className="h-4 w-4 mr-1" />
                Mark Complete
              </Button>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1 p-6">
          <Card>
            <CardContent className="p-6">
              <div className="space-y-6">
                {currentSection?.fields.map(field => renderField(currentSection, field))}
              </div>
            </CardContent>
          </Card>
        </ScrollArea>
      </div>

      {/* Right - Live Document Preview */}
      <div className="w-[600px] border-l bg-white flex flex-col">
        <div className="p-4 border-b bg-gray-50">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg">Live Document Preview</h3>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-gray-600">Real-time</span>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div 
            ref={previewRef}
            className="p-6"
            dangerouslySetInnerHTML={{ __html: generateFullDocument() }}
            data-testid="document-preview"
          />
        </ScrollArea>
      </div>
    </div>
  );
}