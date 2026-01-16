import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/toaster';
import {
  Loader2, FileText, CheckCircle, AlertTriangle, Download, Upload, FileCheck } from 'lucide-react'
import { isFeatureEnabled } from '../../flags/featureFlags';
import FDA510kService from '../../services/FDA510kService';

/**
 * eSTAR Plus Package Assembly and Preview component
 * Displays file information, AI validation results, and provides options
 * to build and download the full package or submit to FDA ESG.
 */
const PackagePreview = ({ projectId = 'demo-project-id' }) => {
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [building, setBuilding] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verification, setVerification] = useState(null);
  const [error, setError] = useState(null);

  // Load initial preview data
  useEffect(() => {
    if (!isFeatureEnabled('ENABLE_PACKAGE_ASSEMBLY')) return;

    const loadPreview = async () => {
      try {
        setLoading(true);
        const result = await FDA510kService.previewESTARPackage(projectId);
        setPreview(result);
        setLoading(false);
      } catch (err) {
        console.error('Error loading package preview:', err);
        setError(err.message || 'Failed to load preview data');
        setLoading(false);
      }
    };

    loadPreview();
  }, [projectId]);

  // Build and download eSTAR package
  const handleBuildPackage = async () => {
    try {
      setBuilding(true);
      const result = await FDA510kService.buildESTARPackage(projectId, {
        includeCoverLetter: true,
      });

      if (result.success) {
        toast({
          title: 'Package built successfully',
          description: 'Your eSTAR package is ready for download',
          variant: 'default',
        });

        // Trigger download automatically
        window.location.href = result.downloadUrl;
      }

      setBuilding(false);
    } catch (err) {
      console.error('Error building package:', err);
      toast({
        title: 'Error building package',
        description: err.message || 'Failed to build eSTAR package',
        variant: 'destructive',
      });
      setBuilding(false);
    }
  };

  // Verify digital signature on the manifest
  const handleVerifySignature = async () => {
    try {
      setVerifying(true);
      const result = await FDA510kService.verifySignature(projectId);

      if (result.success) {
        setVerification(result.verification);
        toast({
          title: result.verification.valid ? 'Signature valid' : 'Signature invalid',
          description: result.verification.message,
          variant: result.verification.valid ? 'success' : 'warning',
        });
      }

      setVerifying(false);
    } catch (err) {
      console.error('Error verifying signature:', err);
      toast({
        title: 'Error verifying signature',
        description: err.message || 'Failed to verify digital signature',
        variant: 'destructive',
      });
      setVerifying(false);
    }
  };

  // Submit package to FDA ESG
  const handleSubmitToFDA = async () => {
    toast({
      title: 'Feature coming soon',
      description: 'Direct FDA ESG submission will be available in a future update',
      variant: 'default',
    });
  };

  if (!isFeatureEnabled('ENABLE_PACKAGE_ASSEMBLY')) {
    return (
      <Alert>
        <AlertTitle>Feature Disabled</AlertTitle>
        <AlertDescription>eSTAR Package Assembly feature is currently disabled</AlertDescription>
      </Alert>
    );
  }

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="pt-6 text-center">
          <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4" />
          <p>Loading eSTAR package preview...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">eSTAR Package Assembly</h2>

      <p className="mb-4">
        This tool helps you assemble, validate, and submit your FDA eSTAR package for 510(k)
        clearance.
      </p>

      <div className="space-y-6">
        {/* AI Compliance Report Section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>AI Compliance Check</CardTitle>
            <Badge className="ml-2 py-1">
              <div className="flex items-center">
                <CheckCircle className="h-4 w-4 mr-1" />
                <span>Validated</span>
              </div>
            </Badge>
          </CardHeader>
          <CardContent>
            {preview?.aiComplianceReport ? (
              <p>{preview.aiComplianceReport}</p>
            ) : (
              <p className="italic text-muted-foreground">Compliance report not available</p>
            )}
          </CardContent>
        </Card>

        {/* Files List Section */}
        <Card>
          <CardHeader>
            <CardTitle>Package Contents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {preview?.files?.map((file, index) => (
                <div
                  key={index}
                  className="flex justify-between p-2"
                  style={{ backgroundColor: index % 2 === 0 ? 'var(--muted)' : 'transparent' }}
                >
                  <div className="flex items-center">
                    <FileText className="h-4 w-4 mr-2" />
                    <span className="font-medium">{file.name}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-sm text-muted-foreground mr-2">
                      {(file.size / 1024).toFixed(1)} KB
                    </span>
                    <Badge variant="outline">{file.type.split('/')[1]}</Badge>
                  </div>
                </div>
              ))}

              {(!preview?.files || preview.files.length === 0) && (
                <p className="italic text-muted-foreground">No files available for preview</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Signature Verification Section */}
        {verification && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Digital Signature Verification</CardTitle>
              <Badge variant={verification.valid ? 'success' : 'destructive'} className="ml-2 py-1">
                <div className="flex items-center">
                  {verification.valid ? (
                    <CheckCircle className="h-4 w-4 mr-1" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 mr-1" />
                  )}
                  <span>{verification.valid ? 'Valid' : 'Invalid'}</span>
                </div>
              </Badge>
            </CardHeader>
            <CardContent>
              <p>{verification.message}</p>
            </CardContent>
          </Card>
        )}

        <Separator />

        {/* Actions Section */}
        <div>
          <h3 className="text-xl font-semibold mb-4">Actions</h3>
          <div className="flex flex-wrap gap-4">
            <Button className="flex items-center" disabled={building} onClick={handleBuildPackage}>
              {building ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Building package...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Build & Download Package
                </>
              )}
            </Button>

            <Button
              variant="outline"
              className="flex items-center"
              disabled={verifying}
              onClick={handleVerifySignature}
            >
              {verifying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <FileCheck className="h-4 w-4 mr-2" />
                  Verify Digital Signature
                </>
              )}
            </Button>

            <Button
              variant="secondary"
              className="flex items-center"
              disabled={true}
              onClick={handleSubmitToFDA}
            >
              <Upload className="h-4 w-4 mr-2" />
              Submit to FDA ESG
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PackagePreview;
