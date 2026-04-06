import { createContext, useState, useContext, useEffect } from 'react';
import { useLocation } from 'wouter';
import AuroraAssistant from './AuroraAssistant';

// Create context for the assistant
const AuroraAssistantContext = createContext(null);

// Custom hook to use the assistant
export function useAuroraAssistant() {
 const context = useContext(AuroraAssistantContext);
 if (!context) {
 throw new Error('useAuroraAssistant must be used within an AuroraAssistantProvider');
 }
 return context;
}

// Provider component
export function AuroraAssistantProvider({ children }) {
 const [isOpen, setIsOpen] = useState(false);
 const [currentModule, setCurrentModule] = useState('');
 const [location] = useLocation();

 // Update current module based on location
 useEffect(() => {
 // Map URLs to module identifiers
 if (location.startsWith('/document-management')) {
 setCurrentModule('document-management');
 } else if (location.startsWith('/enterprise-document-vault')) {
 setCurrentModule('enterprise-document-vault');
 } else if (location.startsWith('/csr-intelligence')) {
 setCurrentModule('csr-intelligence');
 } else if (location.startsWith('/client-portal')) {
 setCurrentModule('client-portal');
 } else if (location.startsWith('/cer-generator')) {
 setCurrentModule('cer-generator');
 } else {
 setCurrentModule('home');
 }
 }, [location]);

 // Open the assistant
 const openAssistant = () => {
 setIsOpen(true);
 };

 // Close the assistant
 const closeAssistant = () => {
 setIsOpen(false);
 };

 // Toggle the assistant
 const toggleAssistant = () => {
 setIsOpen(prevState => !prevState);
 };

 // Context value
 const value = {
 isOpen,
 openAssistant,
 closeAssistant,
 toggleAssistant,
 currentModule,
 };

 return (
 <AuroraAssistantContext.Provider value={value}>
 {children}
 <AuroraAssistant isOpen={isOpen} onClose={closeAssistant} selectedModule={currentModule} />
 </AuroraAssistantContext.Provider>
 );
}
