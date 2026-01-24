import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Save, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { documentApiService } from '@/services/DocumentAPIService';

/**
 * SaveCerToVaultButton Component
 *
 * This component provides a button to save CER data directly to the document vault.
 * It shows different states: idle, loading, and success.
 */
export default function SaveCerToVaultButton({
  cerData,
  metadata = {},
  variant = 'default',
  disabled = false,
  size = 'default',
  onSuccess = () => {},
  className = '',
}) {
  const [status, setStatus] = useState('idle'); // idle, loading, success, error
  const { toast } = useToast();

  // Define save handler
  const handleSave = async () => {
    if (!cerData || !cerData.title || !cerData.sections) {
      toast({
        title: 'Invalid CER Data',
        description:
          'The CER data is not valid or complete. Please ensure the report has a title and content.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setStatus('loading');

      // Prepare metadata for the document
      const documentMetadata = {
        name: metadata.name || cerData.title,
        version: metadata.version || '1.0.0',
        status: metadata.status || 'draft',
        description: metadata.description || `Clinical Evaluation Report for ${cerData.title}`,
        tags: metadata.tags || ['CER', 'Clinical Evaluation', 'AI-Generated'],
        author: metadata.author || 'TrialSage AI',
        ...metadata,
      };

      // Save to document vault
      const savedDocument = await documentApiService.saveCerToVault(cerData, documentMetadata);

      // Update status and notify
      setStatus('success');

      toast({
        title: 'Report Saved',
        description: 'The CER has been saved to your document vault.',
      });

      // Call success callback with saved document
      onSuccess(savedDocument);

      // Reset status after delay
      setTimeout(() => {
        setStatus('idle');
      }, 3000);
    } catch (error) {
      setStatus('error');

      toast({
        title: 'Save Failed',
        description: error.message || 'Failed to save CER to document vault. Please try again.',
        variant: 'destructive',
      });

      // Reset status after delay
      setTimeout(() => {
        setStatus('idle');
      }, 3000);
    }
  };

  // Render button with appropriate state
  return (
    <Button
      variant={variant}
      size={size}
      disabled={disabled || status === 'loading'}
      onClick={handleSave}
      className={className}
    >
      {status === 'loading' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {status === 'success' && <CheckCircle className="mr-2 h-4 w-4 text-green-500" />}
      {status === 'idle' && <Save className="mr-2 h-4 w-4" />}
      Save to Vault
    </Button>
  );
}
