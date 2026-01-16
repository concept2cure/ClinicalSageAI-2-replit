import React, { useState } from 'react';
import { ChevronDown, CheckCircle, Building, Shield, Info, ChevronUp } from 'lucide-react'
import { useLocation } from 'wouter';
import { useModuleIntegration } from '../integration/ModuleIntegrationLayer';

const ClientContextBar = () => {
  const [location] = useLocation();
  const { data, blockchainStatus, setClientContext } = useModuleIntegration();
  const [showClientSelector, setShowClientSelector] = useState(false);

  // Don't show on landing page
  if (location === '/') {
    return null;
  }

  // Mock client list data
  const clients = [
    { id: 'client1', name: 'BioPharma Inc.', status: 'active', documents: 345, trials: 8 },
    { id: 'client2', name: 'MediTech Solutions', status: 'active', documents: 203, trials: 4 },
    { id: 'client3', name: 'NovaCure Therapeutics', status: 'active', documents: 521, trials: 12 },
    { id: 'client4', name: 'GenomEx Research', status: 'inactive', documents: 156, trials: 3 },
    { id: 'client5', name: 'PrecisionRx Labs', status: 'active', documents: 289, trials: 6 },
  ];

  // Selected client data (would normally be from the context)
  const selectedClient = clients.find(client => client.id === data.clientId) || clients[0];

  const toggleClientSelector = () => {
    setShowClientSelector(!showClientSelector);
  };

  const handleSelectClient = clientId => {
    setClientContext(clientId);
    setShowClientSelector(false);
  };

  return (
    <div className="bg-gray-50 border-b border-gray-200 relative z-20">
      <div className="max-w-full mx-auto px-4 lg:px-6">
        <div className="flex items-center justify-between h-12">
          {/* Client Selector */}
          <div className="relative">
            <button
              onClick={toggleClientSelector}
              className="flex items-center space-x-2 text-sm font-medium hover:bg-gray-100 px-3 py-1.5 rounded-md"
            >
              <Building size={16} className="text-gray-500" />
              <span>{selectedClient.name}</span>
              {showClientSelector ? (
                <ChevronUp size={16} className="text-gray-500" />
              ) : (
                <ChevronDown size={16} className="text-gray-500" />
              )}
            </button>

            {/* Client Dropdown */}
            {showClientSelector && (
              <div className="absolute left-0 mt-1 w-80 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-10">
                <div className="py-1 max-h-96 overflow-y-auto">
                  <div className="sticky top-0 bg-white px-4 py-2 border-b border-gray-100">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-medium">Select Client</h3>
                      <span className="text-xs text-gray-500">{clients.length} clients</span>
                    </div>
                  </div>

                  {clients.map(client => (
                    <button
                      key={client.id}
                      onClick={() => handleSelectClient(client.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${
                        selectedClient.id === client.id ? 'bg-gray-50' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <div className="flex-shrink-0">
                            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                              {client.name.charAt(0)}
                            </div>
                          </div>
                          <div className="ml-3">
                            <p className="text-sm font-medium text-gray-900">{client.name}</p>
                            <div className="flex items-center mt-1">
                              <span
                                className={`flex-shrink-0 inline-block h-2 w-2 rounded-full ${
                                  client.status === 'active' ? 'bg-green-400' : 'bg-gray-400'
                                }`}
                              ></span>
                              <p className="ml-1.5 text-xs text-gray-500">
                                {client.documents} documents • {client.trials} trials
                              </p>
                            </div>
                          </div>
                        </div>
                        {selectedClient.id === client.id && (
                          <CheckCircle size={16} className="text-green-500" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Blockchain Status */}
          <div className="flex items-center space-x-4">
            <div className="hidden md:flex items-center">
              <Info size={16} className="text-gray-500 mr-1" />
              <span className="text-xs text-gray-600">Multi-tenant Mode: CRO Master Account</span>
            </div>

            <div className="flex items-center">
              <Shield
                size={16}
                className={`${blockchainStatus.verified ? 'text-green-500' : 'text-yellow-500'} mr-1`}
              />
              <span className="text-xs">
                Blockchain:
                <span
                  className={`ml-1 font-medium ${blockchainStatus.verified ? 'text-green-600' : 'text-yellow-600'}`}
                >
                  {blockchainStatus.verified ? 'Verified' : 'Verification Needed'}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClientContextBar;
