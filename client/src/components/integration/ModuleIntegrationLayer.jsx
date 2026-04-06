import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';

// Create a context for module integration
const ModuleIntegrationContext = createContext({
 activeModule: null,
 setActiveModule: () => {},
 modulesData: {},
 registerModule: () => {},
 unregisterModule: () => {},
 getModuleData: () => {},
 updateModuleData: () => {},
 refreshAllModules: () => {},
});

/**
 * ModuleIntegrationProvider Component
 *
 * Provides a context for integrating different modules within the client portal.
 * This allows modules to communicate, share data, and be controlled centrally.
 */
export const ModuleIntegrationProvider = ({ children }) => {
 const [activeModule, setActiveModule] = useState(null);
 const [modulesData, setModulesData] = useState({});
 const [registeredModules, setRegisteredModules] = useState([]);

 // Module settings hook
 const [moduleSettings, setModuleSettings] = useState(() => {
 const saved = localStorage.getItem('moduleSettings');
 if (saved) {
 try {
 return JSON.parse(saved);
 } catch (e) {
 return [];
 }
 }
 return [];
 });

 useEffect(() => {
 const handleSettingsChange = (event) => {
 setModuleSettings(event.detail.modules);
 };

 window.addEventListener('moduleSettingsChanged', handleSettingsChange);

 return () => {
 window.removeEventListener('moduleSettingsChanged', handleSettingsChange);
 };
 }, []);

 const isModuleEnabled = (moduleId) => {
 const module = moduleSettings.find(m => m.id === moduleId);
 return module ? module.enabled : true;
 };

 // Register a module to be managed by the integration layer
 const registerModule = (moduleId, initialData = {}) => {
 if (!registeredModules.includes(moduleId)) {
 setRegisteredModules(prev => [...prev, moduleId]);

 setModulesData(prev => ({
 ...prev,
 [moduleId]: {
 ...initialData,
 registered: true,
 lastUpdated: new Date().toISOString(),
 },
 }));

 console.log(`Module ${moduleId} registered with integration layer`);
 return true;
 }

 return false;
 };

 // Unregister a module
 const unregisterModule = moduleId => {
 if (registeredModules.includes(moduleId)) {
 setRegisteredModules(prev => prev.filter(id => id !== moduleId));

 setModulesData(prev => {
 const newData = { ...prev };
 delete newData[moduleId];
 return newData;
 });

 console.log(`Module ${moduleId} unregistered from integration layer`);
 return true;
 }

 return false;
 };

 // Get data for a specific module
 const getModuleData = moduleId => {
 return modulesData[moduleId] || null;
 };

 // Update data for a specific module
 const updateModuleData = (moduleId, data) => {
 if (registeredModules.includes(moduleId)) {
 setModulesData(prev => ({
 ...prev,
 [moduleId]: {
 ...prev[moduleId],
 ...data,
 lastUpdated: new Date().toISOString(),
 },
 }));

 console.log(`Module ${moduleId} data updated`);
 return true;
 }

 return false;
 };

 // Refresh data for all modules
 const refreshAllModules = () => {
 // In a real application, this would trigger API calls to refresh data
 const timestamp = new Date().toISOString();

 setModulesData(prev => {
 const updated = { ...prev };

 registeredModules.forEach(moduleId => {
 if (updated[moduleId]) {
 updated[moduleId] = {
 ...updated[moduleId],
 lastUpdated: timestamp,
 refreshed: true,
 };
 }
 });

 return updated;
 });

 console.log('All modules refreshed');
 };

 // Clean up any orphaned modules on component updates
 useEffect(() => {
 const moduleIds = Object.keys(modulesData);
 const orphanedModules = moduleIds.filter(id => !registeredModules.includes(id));

 if (orphanedModules.length > 0) {
 setModulesData(prev => {
 const newData = { ...prev };
 orphanedModules.forEach(id => delete newData[id]);
 return newData;
 });

 console.log(`Cleaned up ${orphanedModules.length} orphaned modules`);
 }
 }, [registeredModules, modulesData]);

 // Memoize the context value to prevent unnecessary re-renders
 const contextValue = useMemo(
 () => ({
 activeModule,
 setActiveModule,
 modulesData,
 registerModule,
 unregisterModule,
 getModuleData,
 updateModuleData,
 refreshAllModules,
 isModuleEnabled,
 moduleSettings,
 }),
 [activeModule, modulesData, registeredModules, moduleSettings]
 );

 return (
 <ModuleIntegrationContext.Provider value={contextValue}>
 {children}
 </ModuleIntegrationContext.Provider>
 );
};

// Custom hook to use the module integration context
export const useModuleIntegration = () => {
 const context = useContext(ModuleIntegrationContext);

 if (context === undefined) {
 throw new Error('useModuleIntegration must be used within a ModuleIntegrationProvider');
 }

 return context;
};

// Alias for backward compatibility
export const useIntegration = useModuleIntegration;

export default ModuleIntegrationContext;