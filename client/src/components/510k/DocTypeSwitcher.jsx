import React from 'react';
import { Button } from '@/components/ui/button';
import { SwitchCamera } from 'lucide-react';
import { DocumentContextProvider } from '@/contexts/DocumentContext';
import { useAnAAssistant } from '@/contexts/AnAAssistantContext';

/**
 * DocTypeSwitcher
 *
 * This component provides an interface to switch between CER and 510k document types
 * without modifying the protected CERV2Page.jsx file.
 *
 * It uses the context API to share state with the About510kDialog component.
 */
function DocTypeSwitcher({ documentType, setDocumentType, title, setTitle, className }) {
  const { openAssistant, setModuleContext } = useAnAAssistant();

  // Handle switching to CER mode
  const switchToCER = () => {
    console.log(`Switching to CER mode (current: ${documentType}, new: cer)`);
    // Force an update to make sure state changes properly
    setDocumentType('');
    setTimeout(() => {
      setDocumentType('cer');
      // Update title based on document type
      setTitle('Clinical Evaluation Report');
    }, 50);
  };

  // Handle switching to 510k mode
  const switchTo510k = () => {
    console.log(`Switching to 510k mode (current: ${documentType}, new: 510k)`);
    // Force an update to make sure state changes properly
    setDocumentType('');
    setTimeout(() => {
      setDocumentType('510k');
      // Update title based on document type
      setTitle('FDA 510(k) Submission');
    }, 50);
  };

  return (
    <div className={`flex items-center space-x-2 ${className || ''}`}>
      <DocumentContextProvider
        value={{
          documentType,
          setDocumentType,
          title,
          setTitle,
        }}
      >
        <div className="flex items-center space-x-1">
          <Button
            variant={documentType === 'cer' ? 'default' : 'outline'}
            size="sm"
            onClick={switchToCER}
            className={documentType === 'cer' ? 'bg-blue-600 text-white' : ''}
          >
            CER
          </Button>
          <Button
            variant={documentType === '510k' ? 'default' : 'outline'}
            size="sm"
            onClick={switchTo510k}
            className={documentType === '510k' ? 'bg-blue-600 text-white' : ''}
          >
            510(k)
          </Button>
          <div className="text-xs text-gray-500 ml-2">
            {documentType === 'cer'
              ? 'EU MDR Compliant Clinical Evaluation'
              : 'FDA Premarket Notification'}
          </div>
        </div>
      </DocumentContextProvider>
    </div>
  );
}

export default DocTypeSwitcher;
