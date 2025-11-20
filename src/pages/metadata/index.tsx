import React, { useState } from 'react';
import { Helmet } from '../lightweight-wrappers.js';
import MetadataList from '../../components/metadata/MetadataList';
import AssetDetail from '../../components/metadata/AssetDetail';

export default function MetadataRepositoryPage() {
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  const handleSelectMetadata = (id: string) => {
    setSelectedAssetId(id);
  };

  const handleBack = () => {
    setSelectedAssetId(null);
  };

  return (
    <div className="container mx-auto py-6 h-screen flex flex-col">
      <Helmet>
        <title>Clinical Metadata Repository | TrialSage</title>
      </Helmet>

      <div className="flex-grow overflow-hidden">
        {selectedAssetId ? (
          <AssetDetail assetId={selectedAssetId} onBack={handleBack} />
        ) : (
          <MetadataList onSelectMetadata={handleSelectMetadata} />
        )}
      </div>
    </div>
  );
}
