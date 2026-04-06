import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, ArrowRight, Home, Database, Users, FileEdit } from 'lucide-react';
import { useLocation } from 'wouter';

const NavigationBanner = ({ currentModule, currentSection }) => {
 const [location, setLocation] = useLocation();

 const moduleMap = {
 coauthor: 'eCTD Co-Author',
 vault: 'Document Vault',
 'client-portal': 'Concept2Cure Workspace',
 'ind-wizard': 'IND Wizard',
 editor: 'Document Editor',
 };

 const currentModuleName = moduleMap[currentModule] || 'Concept2Cure Platform';

 return (
 <Card className="mb-4 p-3 bg-gradient-to-r from-stone-50 to-purple-50 border-l-4 border-stone-500">
 <div className="flex items-center justify-between">
 <div className="flex items-center space-x-2 text-sm">
 <FileText className="h-4 w-4 text-stone-600" />
 <span className="text-gray-600">Concept2Cure</span>
 <ArrowRight className="h-3 w-3 text-gray-400" />
 <Badge variant="outline" className="bg-stone-100 text-stone-700">
 {currentModuleName}
 </Badge>
 {currentSection && (
 <>
 <ArrowRight className="h-3 w-3 text-gray-400" />
 <span className="text-gray-800 font-medium">{currentSection}</span>
 </>
 )}
 </div>

 <div className="flex items-center space-x-2">
 <Button
 variant="ghost"
 size="sm"
 onClick={() => {
 try {
 setLocation('/');
 } catch (error) {
 console.error('Navigation error:', error);
 window.location.href = '/';
 }
 }}
 className="h-8 px-2"
 >
 <Home className="h-3 w-3 mr-1" />
 Home
 </Button>
 <Button
 variant="ghost"
 size="sm"
 onClick={() => {
 try {
 setLocation('/vault');
 } catch (error) {
 console.error('Navigation error:', error);
 window.location.href = '/vault';
 }
 }}
 className="h-8 px-2"
 >
 <Database className="h-3 w-3 mr-1" />
 Vault
 </Button>
 <Button
 variant="ghost"
 size="sm"
 onClick={() => {
 try {
 setLocation('/concept2cure');
 } catch (error) {
 console.error('Navigation error:', error);
 window.location.href = '/concept2cure';
 }
 }}
 className="h-8 px-2"
 >
 <Users className="h-3 w-3 mr-1" />
 Workspace
 </Button>
 <Button
 variant="ghost"
 size="sm"
 onClick={() => {
 try {
 setLocation('/coauthor');
 } catch (error) {
 console.error('Navigation error:', error);
 window.location.href = '/coauthor';
 }
 }}
 className="h-8 px-2"
 >
 <FileText className="h-3 w-3 mr-1" />
 Co-Author
 </Button>
 <Button
 variant="ghost"
 size="sm"
 onClick={() => {
 try {
 setLocation('/editor');
 } catch (error) {
 console.error('Navigation error:', error);
 window.location.href = '/editor';
 }
 }}
 className="h-8 px-2"
 >
 <FileEdit className="h-3 w-3 mr-1" />
 Editor
 </Button>
 </div>
 </div>
 </Card>
 );
};

export default NavigationBanner;
