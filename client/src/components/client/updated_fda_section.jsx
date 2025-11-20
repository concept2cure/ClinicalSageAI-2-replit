{
  /* FDA Compliance Tab */
}
<TabsContent value="compliance" className="space-y-6">
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div className="border p-4 rounded-lg bg-blue-50">
      <div className="flex items-start">
        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
          <Shield className="h-5 w-5" />
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-blue-800">FDA 21 CFR Part 11 Compliance</h3>
          <p className="text-xs text-blue-700 mt-1">
            Requirements for electronic records and electronic signatures
          </p>
        </div>
      </div>
    </div>

    <div className="border p-4 rounded-lg bg-purple-50">
      <div className="flex items-start">
        <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600">
          <GlobeIcon className="h-5 w-5" />
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-purple-800">EU GMP Annex 11 Compliance</h3>
          <p className="text-xs text-purple-700 mt-1">
            Computerized systems validation requirements for EU markets
          </p>
        </div>
      </div>
    </div>
  </div>

  <div className="grid grid-cols-1 gap-6">
    {/* Electronic Signatures Section */}
    <div className="border rounded-lg p-4 shadow-sm">
      <div className="flex items-center mb-3">
        <FileCheck className="h-5 w-5 text-blue-600 mr-2" />
        <h3 className="text-base font-medium">Electronic Signatures & Records</h3>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="enforceElectronicSignatures" className="flex items-center">
              Enforce Electronic Signatures
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                Required
              </span>
            </Label>
            <p className="text-sm text-muted-foreground">
              Require dual-factor identity verification for all document approvals and critical
              actions
            </p>
          </div>
          <Switch
            id="enforceElectronicSignatures"
            checked={formValues.fdaCompliance.enforceElectronicSignatures}
            onCheckedChange={() =>
              handleToggleChange('fdaCompliance', 'enforceElectronicSignatures')
            }
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="requireReason">Require Reason for Change</Label>
            <p className="text-sm text-muted-foreground">
              Users must provide documented reason for all modifications to controlled documents
            </p>
          </div>
          <Switch
            id="requireReason"
            checked={formValues.fdaCompliance.requireReason}
            onCheckedChange={() => handleToggleChange('fdaCompliance', 'requireReason')}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="enableAuditTrails">Comprehensive Audit Trails</Label>
            <p className="text-sm text-muted-foreground">
              Maintain tamper-evident audit trails for all system activities with cryptographic
              verification
            </p>
          </div>
          <Switch
            id="enableAuditTrails"
            checked={formValues.fdaCompliance.enableAuditTrails}
            onCheckedChange={() => handleToggleChange('fdaCompliance', 'enableAuditTrails')}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="enforceApprovalWorkflows">Multi-Level Approval Workflows</Label>
            <p className="text-sm text-muted-foreground">
              Enforce configurable approval sequences with role-based authorization
            </p>
          </div>
          <Switch
            id="enforceApprovalWorkflows"
            checked={formValues.fdaCompliance.enforceApprovalWorkflows}
            onCheckedChange={() => handleToggleChange('fdaCompliance', 'enforceApprovalWorkflows')}
          />
        </div>
      </div>
    </div>

    {/* System Validation Section */}
    <div className="border rounded-lg p-4 shadow-sm">
      <div className="flex items-center mb-3">
        <ClipboardCheck className="h-5 w-5 text-green-600 mr-2" />
        <h3 className="text-base font-medium">System Validation & Documentation</h3>
      </div>

      <div className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <Label htmlFor="validationApproach">System Validation Approach</Label>
            <EnhancedSelect
              id="validationApproach"
              value={formValues.fdaCompliance.validationApproach}
              onValueChange={value =>
                handleInputChange('fdaCompliance', 'validationApproach', value)
              }
              optionsArray={[
                { value: 'riskBased', label: 'Risk-Based Approach (GAMP 5)' },
                { value: 'traditional', label: 'Traditional IQ/OQ/PQ Approach' },
                { value: 'agile', label: 'Agile CSV Methodology' },
                { value: 'hybrid', label: 'Hybrid Risk/Traditional Approach' },
                { value: 'critical', label: 'Critical Aspects Only' },
              ]}
              placeholder="Select validation approach"
            />
            <p className="text-xs text-muted-foreground">
              Determines validation methodology used for this workspace
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="documentRetentionPeriod">Document Retention Period</Label>
            <EnhancedSelect
              id="documentRetentionPeriod"
              value={formValues.fdaCompliance.documentRetentionPeriod}
              onValueChange={value =>
                handleInputChange('fdaCompliance', 'documentRetentionPeriod', value)
              }
              optionsArray={[
                { value: 'years2', label: '2 Years' },
                { value: 'years5', label: '5 Years' },
                { value: 'years10', label: '10 Years' },
                { value: 'lifeplus3', label: 'Product Life + 3 Years' },
                { value: 'lifeplus10', label: 'Product Life + 10 Years' },
                { value: 'permanent', label: 'Permanent Retention' },
              ]}
              placeholder="Select retention period"
            />
            <p className="text-xs text-muted-foreground">
              Required retention period for system validation documents
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="submissionFormat">Regulatory Submission Format</Label>
            <EnhancedSelect
              id="submissionFormat"
              value={formValues.fdaCompliance.submissionFormat}
              onValueChange={value => handleInputChange('fdaCompliance', 'submissionFormat', value)}
              optionsArray={[
                { value: 'ectd', label: 'eCTD Format' },
                { value: 'nees', label: 'NEES Format' },
                { value: 'cdisc', label: 'CDISC Standards' },
                { value: 'ich', label: 'ICH eCTD' },
                { value: 'custom', label: 'Custom Format' },
              ]}
              placeholder="Select submission format"
            />
            <p className="text-xs text-muted-foreground">
              Standard format for regulatory submissions
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reportGeneration">Compliance Report Generation</Label>
            <EnhancedSelect
              id="reportGeneration"
              value={formValues.fdaCompliance.reportGeneration}
              onValueChange={value => handleInputChange('fdaCompliance', 'reportGeneration', value)}
              optionsArray={[
                { value: 'monthly', label: 'Monthly' },
                { value: 'quarterly', label: 'Quarterly' },
                { value: 'biannual', label: 'Bi-Annual' },
                { value: 'annual', label: 'Annual' },
                { value: 'onDemand', label: 'On-Demand Only' },
              ]}
              placeholder="Select report frequency"
            />
            <p className="text-xs text-muted-foreground">
              Frequency of automated compliance report generation
            </p>
          </div>
        </div>

        <div className="pt-2">
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md border">
            <div className="flex items-center">
              <CheckSquare className="h-4 w-4 text-green-600 mr-2" />
              <div>
                <h4 className="text-sm font-medium">User Acceptance Testing</h4>
                <p className="text-xs text-muted-foreground">
                  Require UAT documentation before system changes
                </p>
              </div>
            </div>
            <Switch
              id="enforceUserTesting"
              checked={formValues.fdaCompliance.enforceUserTesting}
              onCheckedChange={() => handleToggleChange('fdaCompliance', 'enforceUserTesting')}
            />
          </div>
        </div>
      </div>
    </div>

    {/* International Regulatory Compliance Section */}
    <div className="border rounded-lg p-4 shadow-sm">
      <div className="flex items-center mb-3">
        <GlobeIcon className="h-5 w-5 text-indigo-600 mr-2" />
        <h3 className="text-base font-medium">International Regulatory Compliance</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="p-3 border rounded-md bg-sky-50">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center">
                <Badge variant="outline" className="mr-2 bg-sky-100 text-sky-700 border-sky-200">
                  EU
                </Badge>
                <h4 className="text-sm font-medium">EU GMP Annex 11</h4>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Computerized Systems for EU Markets
              </p>
            </div>
            <Switch
              id="inspectionReadiness"
              checked={formValues.fdaCompliance.inspectionReadiness}
              onCheckedChange={() => handleToggleChange('fdaCompliance', 'inspectionReadiness')}
            />
          </div>
        </div>

        <div className="p-3 border rounded-md bg-emerald-50">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center">
                <Badge
                  variant="outline"
                  className="mr-2 bg-emerald-100 text-emerald-700 border-emerald-200"
                >
                  Auto
                </Badge>
                <h4 className="text-sm font-medium">Automated Documentation</h4>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Generate documentation automatically
              </p>
            </div>
            <Switch
              id="autoGenerateDocumentation"
              checked={formValues.fdaCompliance.autoGenerateDocumentation}
              onCheckedChange={() =>
                handleToggleChange('fdaCompliance', 'autoGenerateDocumentation')
              }
            />
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-4">
        <h4 className="text-sm font-medium text-muted-foreground">Industry-Specific Regulations</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Badge
            variant="outline"
            className="justify-center py-1.5 border-indigo-100 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
          >
            Biotech / Pharma
          </Badge>
          <Badge
            variant="outline"
            className="justify-center py-1.5 border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-100"
          >
            Medical Device
          </Badge>
          <Badge
            variant="outline"
            className="justify-center py-1.5 border-green-100 bg-green-50 text-green-700 hover:bg-green-100"
          >
            CRO Services
          </Badge>
        </div>
      </div>
    </div>
  </div>

  <div className="bg-amber-50 border border-amber-200 rounded-md p-4 mt-4">
    <div className="flex items-start space-x-3">
      <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
      <div>
        <h4 className="text-sm font-medium text-amber-800">Regulatory Compliance Notice</h4>
        <p className="text-sm text-amber-700 mt-1">
          These settings configure the system for FDA 21 CFR Part 11 and EU GMP Annex 11 compliance.
          Implementation includes advanced electronic signatures, audit trails, and validation
          documentation with inspection-ready evidence packages suitable for regulatory review.
        </p>
      </div>
    </div>
  </div>
</TabsContent>;
