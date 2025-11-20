import React, { useState, useEffect } from 'react';
import ProductSelector from './ProductSelector';
import ProtocolForm from './ProtocolForm';
import SafetyDataPanel from './SafetyDataPanel';
import EfficacyAnalysisWidget from './EfficacyAnalysisWidget';
import RegulatoryChecklist from './RegulatoryChecklist';
import SubmissionPreview from './SubmissionPreview';
import SignoffDrawer from './SignoffDrawer';
import indWizardService from '@/services/indWizardService';

export default function IndWizardModule() {
  const [product, setProduct] = useState(null);
  const [protocol, setProtocol] = useState({});
  const [submissionId, setSubmissionId] = useState(null);

  useEffect(() => {
    if (product) {
      // initialize protocol draft via AI
      indWizardService.createProtocolDraft(product.id).then(res => {
        setProtocol(res.draft);
        setSubmissionId(res.submissionId);
      });
    }
  }, [product]);

  return (
    <div className="p-6 space-y-6">
      <ProductSelector onSelect={setProduct} />
      {product && (
        <>
          <ProtocolForm
            draft={protocol}
            onChange={setProtocol}
            onRegenerate={() => indWizardService.regenerateSection(submissionId, 'protocol')}
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SafetyDataPanel productId={product.id} submissionId={submissionId} />
            <EfficacyAnalysisWidget productId={product.id} submissionId={submissionId} />
          </div>
          <RegulatoryChecklist submissionId={submissionId} />
          <SubmissionPreview submissionId={submissionId} />
          <SignoffDrawer submissionId={submissionId} />
        </>
      )}
    </div>
  );
}
